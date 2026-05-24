#!/usr/bin/env node
/**
 * Internal benchmark runner.
 *
 *   # Smoke mode (default): verify fixture soundness — no agent runs.
 *   node scripts/run-internal-bench.mjs
 *   node scripts/run-internal-bench.mjs --task R1
 *   node scripts/run-internal-bench.mjs --json
 *
 *   # Agent mode: copy before/ to a tmp dir, dispatch an agent on
 *   # prompt.md, then run verify.sh on the result.
 *   node scripts/run-internal-bench.mjs --agent claude
 *   node scripts/run-internal-bench.mjs --agent aider --task R1
 *   node scripts/run-internal-bench.mjs --agent-cmd 'codex exec --cd {cwd} {prompt}'
 *
 * Agent backends:
 *   claude   = `claude -p "<prompt>"` (default Claude Code CLI)
 *   aider    = `aider --message "<prompt>" --yes` (Aider in non-interactive mode)
 *   codex    = `codex exec "<prompt>"` (OpenAI codex CLI)
 *   <cmd>    = arbitrary shell command via --agent-cmd, with
 *              {prompt} and {cwd} substitutions
 *
 * Output (JSON):
 *   {
 *     "agent": "claude",
 *     "tasks": [
 *       { "task": "R1-segment-traversal", "verdict": "passed", "duration_ms": 12340 },
 *       ...
 *     ],
 *     "score": 0.75,
 *     "score_by_bucket": { "refactor": 1.0, "bug-fix": 0.5 }
 *   }
 */

import { readdirSync, statSync, existsSync, mkdtempSync, cpSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const TASKS_DIR = join(REPO_ROOT, 'tests', 'benchmark', 'tasks');

const AGENT_TEMPLATES = {
  claude: 'claude -p {promptArg}',
  aider: 'aider --message {promptArg} --yes',
  codex: 'codex exec {promptArg}',
};

function listTasks() {
  return readdirSync(TASKS_DIR)
    .filter((n) => statSync(join(TASKS_DIR, n)).isDirectory())
    .sort();
}

function bucketOf(taskId) {
  const prefix = taskId.slice(0, 1);
  return { R: 'refactor', B: 'bug-fix', F: 'feature-add', H: 'regression-hunt', D: 'design-doc' }[prefix] || 'other';
}

function runVerify(taskDir, side) {
  const cwd = typeof side === 'string' ? join(taskDir, side) : side;
  const verify = join(taskDir, 'verify.sh');
  if (!existsSync(cwd) || !existsSync(verify)) return { ok: false, exitCode: null, stdout: '', stderr: 'fixture missing' };
  const r = spawnSync('bash', [verify], { cwd, encoding: 'utf-8' });
  return { ok: r.status === 0, exitCode: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
}

function smokeTask(taskId) {
  const taskDir = join(TASKS_DIR, taskId);
  const before = runVerify(taskDir, 'before');
  const after = runVerify(taskDir, 'after');
  return {
    task: taskId,
    bucket: bucketOf(taskId),
    fixture_sound: !before.ok && after.ok,
    before_exit: before.exitCode,
    after_exit: after.exitCode,
  };
}

function buildAgentCmd(agent, customCmd, prompt, cwd) {
  const template = customCmd || AGENT_TEMPLATES[agent];
  if (!template) throw new Error(`Unknown agent: ${agent} (known: ${Object.keys(AGENT_TEMPLATES).join(', ')})`);
  // Sub {prompt} with raw text (used inside quoted shell arg), {cwd} with abspath,
  // {promptArg} with a shell-escaped prompt suitable for a one-shot dispatcher.
  const shellEscaped = `'${prompt.replace(/'/g, "'\\''")}'`;
  return template
    .replace(/\{promptArg\}/g, shellEscaped)
    .replace(/\{prompt\}/g, prompt)
    .replace(/\{cwd\}/g, cwd);
}

function agentTask(taskId, agent, customCmd, timeoutMs) {
  const taskDir = join(TASKS_DIR, taskId);
  const beforeDir = join(taskDir, 'before');
  const prompt = readFileSync(join(taskDir, 'prompt.md'), 'utf-8');

  // Copy before/ to a tmp dir + git init so the agent sees a clean repo.
  const tmpDir = mkdtempSync(join(tmpdir(), `grd-bench-${taskId}-`));
  cpSync(beforeDir, tmpDir, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: tmpDir });
  spawnSync('git', ['add', '-A'], { cwd: tmpDir });
  spawnSync('git', ['-c', 'user.email=bench@grd', '-c', 'user.name=bench', 'commit', '-q', '-m', 'initial'], { cwd: tmpDir });

  const cmd = buildAgentCmd(agent, customCmd, prompt, tmpDir);
  const startedAt = Date.now();

  // Spawn via sh -c so the agent template can use shell features (pipes, &&, etc.).
  const r = spawnSync('sh', ['-c', cmd], {
    cwd: tmpDir,
    encoding: 'utf-8',
    timeout: timeoutMs,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const durationMs = Date.now() - startedAt;
  const agentExit = r.status;
  const agentTimedOut = r.signal === 'SIGTERM' || agentExit === null;

  const verify = runVerify(taskDir, tmpDir);

  return {
    task: taskId,
    bucket: bucketOf(taskId),
    agent_exit: agentExit,
    agent_timed_out: agentTimedOut,
    duration_ms: durationMs,
    verify_exit: verify.exitCode,
    verify_stdout: verify.stdout,
    verdict: verify.ok ? 'passed' : 'failed',
    tmp_dir: tmpDir,
  };
}

function aggregateScore(tasks) {
  if (tasks.length === 0) return { score: 0, score_by_bucket: {} };
  const total = tasks.reduce((s, t) => s + (t.verdict === 'passed' ? 1 : t.verdict === 'partial' ? 0.5 : 0), 0);
  const byBucket = {};
  for (const t of tasks) {
    if (!byBucket[t.bucket]) byBucket[t.bucket] = { passed: 0, count: 0 };
    byBucket[t.bucket].count++;
    if (t.verdict === 'passed') byBucket[t.bucket].passed++;
  }
  const scoreByBucket = {};
  for (const b of Object.keys(byBucket)) {
    scoreByBucket[b] = Math.round((byBucket[b].passed / byBucket[b].count) * 1000) / 1000;
  }
  return { score: Math.round((total / tasks.length) * 1000) / 1000, score_by_bucket: scoreByBucket };
}

// ─── CLI ───────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const taskIdx = argv.indexOf('--task');
const agentIdx = argv.indexOf('--agent');
const agentCmdIdx = argv.indexOf('--agent-cmd');
const timeoutIdx = argv.indexOf('--timeout');
const timeoutMs = timeoutIdx !== -1 ? parseInt(argv[timeoutIdx + 1], 10) * 1000 : 5 * 60 * 1000;

const taskFilter = taskIdx !== -1 ? argv[taskIdx + 1] : null;
const tasks = taskFilter ? [taskFilter] : listTasks();

let results;
if (agentIdx !== -1 || agentCmdIdx !== -1) {
  const agent = agentIdx !== -1 ? argv[agentIdx + 1] : 'custom';
  const customCmd = agentCmdIdx !== -1 ? argv[agentCmdIdx + 1] : null;
  results = tasks.map((t) => agentTask(t, agent, customCmd, timeoutMs));
  const agg = aggregateScore(results);
  const payload = { agent: customCmd || agent, tasks: results, ...agg };
  if (json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  } else {
    for (const r of results) {
      const marker = r.verdict === 'passed' ? '✓' : '✗';
      process.stdout.write(`${marker} ${r.task.padEnd(30)} verdict=${r.verdict.padEnd(7)} duration=${r.duration_ms}ms\n`);
    }
    process.stdout.write(`\nAgent: ${customCmd || agent}\n`);
    process.stdout.write(`Score: ${(agg.score * 100).toFixed(1)}% (${results.filter((r) => r.verdict === 'passed').length}/${results.length})\n`);
    for (const b of Object.keys(agg.score_by_bucket)) {
      process.stdout.write(`  ${b}: ${(agg.score_by_bucket[b] * 100).toFixed(1)}%\n`);
    }
  }
} else {
  // Smoke mode.
  results = tasks.map(smokeTask);
  if (json) {
    process.stdout.write(JSON.stringify({ results }, null, 2) + '\n');
  } else {
    let pass = 0;
    for (const r of results) {
      const marker = r.fixture_sound ? '✓' : '✗';
      process.stdout.write(`${marker} ${r.task.padEnd(30)} before=${r.before_exit} after=${r.after_exit}\n`);
      if (r.fixture_sound) pass++;
    }
    process.stdout.write(`\n${pass}/${results.length} fixtures sound\n`);
    if (pass < results.length) process.exit(1);
  }
}
