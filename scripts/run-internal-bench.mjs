#!/usr/bin/env node
/**
 * Minimal internal benchmark runner.
 *
 *   node scripts/run-internal-bench.mjs                  # smoke test before/ + after/
 *   node scripts/run-internal-bench.mjs --task R1        # one task
 *   node scripts/run-internal-bench.mjs --json           # machine output
 *
 * Each task ships before/ + after/ + verify.sh. The smoke test runs verify
 * against both — before/ MUST fail, after/ MUST pass. That confirms the
 * fixture itself is sound; it does NOT run an agent.
 *
 * Agent-driven mode (planned for v0.4.x): copy before/ to a temp dir,
 * hand prompt.md to the configured agent, run verify.sh on the result.
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const TASKS_DIR = join(REPO_ROOT, 'tests', 'benchmark', 'tasks');

function listTasks() {
  return readdirSync(TASKS_DIR)
    .filter((n) => statSync(join(TASKS_DIR, n)).isDirectory())
    .sort();
}

function runVerify(taskDir, side) {
  const cwd = join(taskDir, side);
  const verify = join(taskDir, 'verify.sh');
  if (!existsSync(cwd) || !existsSync(verify)) {
    return { ok: false, reason: 'fixture missing' };
  }
  const r = spawnSync('bash', [verify], { cwd, encoding: 'utf-8' });
  return {
    ok: r.status === 0,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
    exitCode: r.status,
  };
}

function smokeTask(taskId) {
  const taskDir = join(TASKS_DIR, taskId);
  const before = runVerify(taskDir, 'before');
  const after = runVerify(taskDir, 'after');
  const fixtureSound = !before.ok && after.ok;
  return {
    task: taskId,
    fixture_sound: fixtureSound,
    before_exit: before.exitCode ?? null,
    before_msg: before.stdout || before.stderr || '',
    after_exit: after.exitCode ?? null,
    after_msg: after.stdout || after.stderr || '',
  };
}

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const taskIdx = argv.indexOf('--task');
const tasks = taskIdx !== -1 ? [argv[taskIdx + 1]] : listTasks();

const results = tasks.map(smokeTask);

if (json) {
  process.stdout.write(JSON.stringify({ results }, null, 2) + '\n');
} else {
  let pass = 0;
  let fail = 0;
  for (const r of results) {
    const marker = r.fixture_sound ? '✓' : '✗';
    process.stdout.write(`${marker} ${r.task.padEnd(30)} before=${r.before_exit} after=${r.after_exit}\n`);
    if (r.fixture_sound) pass++; else fail++;
  }
  process.stdout.write(`\n${pass}/${results.length} fixtures sound\n`);
  if (fail > 0) process.exit(1);
}
