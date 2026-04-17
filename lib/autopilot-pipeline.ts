'use strict';

/**
 * GRD Autopilot/Pipeline -- Per-phase pipeline: spawn infrastructure,
 * status markers, post-phase pipeline (simplify → PR → review → rebase/merge),
 * knowledge mining, and refinement loop.
 *
 * Extracted from lib/autopilot.ts as part of the post-gsd-2 decomposition.
 *
 * Depends on: autopilot-waves (for atomicWriteFileSync), phase-complete,
 * refinement, knowledge, worktree, and utils.
 */

import type {
  GrdConfig,
  CritiqueBranch,
  RefinementMetrics,
  MetricSnapshot,
  MinimaRegion,
  ConvergenceConfig,
  PhaseInfo,
  MilestoneInfo,
  PhaseCompleteResult,
} from './types';
import type { Scheduler } from './scheduler';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process') as typeof import('child_process');
const {
  execGit,
  getMilestoneInfo,
  findPhaseInternal,
  loadConfig,
}: {
  execGit: (
    cwd: string,
    args: string[],
    opts?: { allowBlocked?: boolean }
  ) => import('./types').ExecGitResult;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  loadConfig: (cwd: string) => GrdConfig;
} = require('./utils');
const {
  pushAndCreatePR,
}: {
  pushAndCreatePR: (
    cwd: string,
    wtPath: string,
    options?: { title?: string; body?: string; base?: string }
  ) =>
    | { pr_url: string; branch: string; base: string }
    | { error: string; push_succeeded?: boolean };
} = require('./worktree');
const { completePhaseAfterPostPipeline } = require('./phase-complete') as {
  completePhaseAfterPostPipeline: (
    cwd: string,
    phaseNum: string,
    scheduler?: Scheduler | null
  ) => Promise<PhaseCompleteResult | null>;
};
const {
  collectMetrics: _collectMetrics,
  checkConvergence: _checkConvergence,
  classifyBranch: _classifyBranch,
  detectMinima: _detectMinima,
  buildCritiquePrompt: _buildCritiquePromptFn,
}: {
  collectMetrics: (testOutput: string, tscOutput: string, lintOutput: string) => RefinementMetrics;
  checkConvergence: (
    snapshots: MetricSnapshot[],
    config: ConvergenceConfig
  ) => { converged: boolean; reason: string };
  classifyBranch: (current: RefinementMetrics, targets: RefinementMetrics) => CritiqueBranch;
  detectMinima: (snapshots: MetricSnapshot[]) => MinimaRegion[];
  buildCritiquePrompt: (
    branch: CritiqueBranch,
    metrics: RefinementMetrics,
    targets: RefinementMetrics,
    minimaRegions: MinimaRegion[]
  ) => string;
} = require('./refinement');
const {
  atomicWriteFileSync,
}: {
  atomicWriteFileSync: (filePath: string, data: string) => void;
} = require('./autopilot-waves');

// ─── Domain Types ───────────────────────────────────────────────────────────

/** Shared options for spawnClaude/spawnClaudeAsync. */
interface SpawnOptions {
  timeout?: number;
  maxTurns?: number;
  model?: string;
  outputFormat?: string;
  captureOutput?: boolean;
  captureStderr?: boolean;
  /** Agent type hint for complexity-based tier routing (M2). */
  agentType?: string;
}

/** Result from subprocess execution. */
interface SpawnResult {
  exitCode: number;
  timedOut: boolean;
  stdout?: string;
  stderr?: string;
}

/** Normalize SchedulerSpawnResult to SpawnResult for drop-in compatibility. */
function toSpawnResult(sr: {
  exitCode: number;
  timedOut: boolean;
  stdout?: string;
  stderr?: string;
}): SpawnResult {
  return { exitCode: sr.exitCode, timedOut: sr.timedOut, stdout: sr.stdout, stderr: sr.stderr };
}

/** Internal config from _buildSpawnConfig. */
interface SpawnConfig {
  args: string[];
  env: Record<string, string | undefined>;
}

/** Written to autopilot directory for tracking progress. */
interface StatusMarker {
  phase: string;
  step: string;
  status: string;
  timestamp: string;
}

/** Result from a post-phase pipeline run. */
interface PostPipelineResult {
  status: 'completed' | 'failed';
  failedStep?: string;
  prUrl?: string;
  reason?: string;
}

// ─── Status Markers ───────────────────────────────────────────────────────────

const AUTOPILOT_DIR = 'autopilot';

/**
 * Write a status marker JSON file for tracking autopilot progress.
 */
function writeStatusMarker(cwd: string, phaseNum: string, step: string, status: string): void {
  const dir: string = path.join(cwd, '.planning', AUTOPILOT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const marker: StatusMarker = {
    phase: phaseNum,
    step,
    status,
    timestamp: new Date().toISOString(),
  };
  const filename: string = `phase-${phaseNum}-${step}.json`;
  atomicWriteFileSync(path.join(dir, filename), JSON.stringify(marker, null, 2));
}

/**
 * Update STATE.md current phase and status fields.
 */
function updateStateProgress(cwd: string, phaseNum: string, step: string): void {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) return;

  // Use synchronous file locking for safe concurrent access under parallel execution.
  // Lock file prevents races when multiple phases update STATE.md concurrently.
  const lockPath: string = `${statePath}.lock`;
  const maxRetries = 50;
  let lockAcquired = false;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const fd: number = fs.openSync(
        lockPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY
      );
      fs.closeSync(fd);
      lockAcquired = true;
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
        // Check for stale lock (older than 30 seconds)
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 30000) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch (statErr) {
          if ((statErr as NodeJS.ErrnoException).code !== 'ENOENT') throw statErr;
          // Lock file gone between check — retry
        }
        // Brief synchronous wait
        const start = Date.now();
        while (Date.now() - start < 10) {
          /* spin */
        }
        continue;
      }
      throw e;
    }
  }

  if (!lockAcquired) {
    process.stderr.write(
      `[autopilot] Warning: failed to acquire lock on ${statePath} after ${maxRetries} retries, skipping state update\n`
    );
    return;
  }

  try {
    let content: string = fs.readFileSync(statePath, 'utf-8');

    // Update Current Phase field
    content = content.replace(
      /(\*\*Current Phase:\*\*)\s*[^\n]*/,
      `$1 Phase ${phaseNum} (autopilot: ${step})`
    );

    atomicWriteFileSync(statePath, content);
  } finally {
    try {
      fs.unlinkSync(lockPath);
    } catch (unlockErr) {
      // Only ENOENT is expected (lock already removed); other errors indicate
      // a real problem but we cannot throw from finally — log instead.
      if ((unlockErr as NodeJS.ErrnoException).code !== 'ENOENT') {
        process.stderr.write(
          `[autopilot] Warning: failed to release lock ${lockPath}: ${(unlockErr as Error).message}\n`
        );
      }
    }
  }
}

// ─── Spawn Infrastructure ─────────────────────────────────────────────────────

/**
 * Build the shared spawn configuration for `claude -p` invocations.
 * Returns the args array and sanitized env object used by both the sync
 * and async spawn helpers.
 */
function _buildSpawnConfig(prompt: string, opts: SpawnOptions = {}): SpawnConfig {
  const args: string[] = ['-p', prompt, '--verbose', '--dangerously-skip-permissions'];
  if (opts.maxTurns) {
    args.push('--max-turns', String(opts.maxTurns));
  }
  if (opts.model) {
    args.push('--model', opts.model);
  }
  if (opts.outputFormat) {
    args.push('--output-format', opts.outputFormat);
  }

  const env: Record<string, string | undefined> = { ...process.env };
  // Strip ALL Claude Code env vars to prevent nested-session detection.
  // Uses prefix match so future env vars are automatically handled.
  for (const key of Object.keys(env)) {
    if (key === 'CLAUDECODE' || key.startsWith('CLAUDE_CODE_') || key.startsWith('CLAUDECODE_')) {
      delete env[key];
    }
  }

  return { args, env };
}

/**
 * Spawn a `claude -p` subprocess synchronously.
 */
function spawnClaude(cwd: string, prompt: string, opts: SpawnOptions = {}): SpawnResult {
  const { args, env } = _buildSpawnConfig(prompt, opts);
  const timeout: number | undefined = opts.timeout;

  const spawnOpts: {
    cwd: string;
    stdio: 'pipe';
    env: Record<string, string | undefined>;
    encoding: 'utf-8';
    timeout?: number;
  } = {
    cwd,
    stdio: 'pipe',
    env,
    encoding: 'utf-8',
  };
  if (timeout) {
    spawnOpts.timeout = timeout;
  }

  const result = childProcess.spawnSync('claude', args, spawnOpts);

  // Print subprocess output so callers (Claude Code TUI, terminal) can see it
  if (result.stdout) process.stdout.write(result.stdout as string);
  if (result.stderr) process.stderr.write(result.stderr as string);

  const timedOut: boolean = !!(
    result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
  );
  const exitCode: number = timedOut ? 124 : (result.status ?? 1);

  return { exitCode, timedOut };
}

/**
 * Spawn a `claude -p` subprocess asynchronously (non-blocking).
 * Used for parallel planning where multiple processes run concurrently.
 */
function spawnClaudeAsync(
  cwd: string,
  prompt: string,
  opts: SpawnOptions = {}
): Promise<SpawnResult> {
  const { args, env } = _buildSpawnConfig(prompt, opts);
  const timeout: number | undefined = opts.timeout;
  const captureOutput: boolean = opts.captureOutput || false;
  const captureStderr: boolean = opts.captureStderr || false;

  return new Promise<SpawnResult>((resolve) => {
    const child = childProcess.spawn('claude', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    let stdoutBuf: string = '';
    let stderrBuf: string = '';

    // Stream subprocess output to parent so it's visible in the terminal/TUI
    if (child.stdout && typeof child.stdout.on === 'function') {
      child.stdout.on('data', (chunk: Buffer) => {
        if (captureOutput) {
          stdoutBuf += chunk.toString();
        } else {
          process.stdout.write(chunk);
        }
      });
    }
    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', (chunk: Buffer) => {
        // Always forward to parent stderr for real-time visibility
        process.stderr.write(chunk);
        if (captureStderr) {
          stderrBuf += chunk.toString();
        }
      });
    }

    let timedOut: boolean = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    if (timeout) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        // Escalate to SIGKILL if process doesn't exit within 5 seconds
        killTimer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch (_e) {
            /* already dead */
          }
        }, 5000);
      }, timeout);
    }

    child.on('close', (code: number | null) => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      const result: SpawnResult = {
        exitCode: timedOut ? 124 : (code ?? 1),
        timedOut,
      };
      if (captureOutput) {
        result.stdout = stdoutBuf;
      }
      if (captureStderr) {
        result.stderr = stderrBuf;
      }
      resolve(result);
    });

    child.on('error', () => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      const result: SpawnResult = { exitCode: 1, timedOut: false };
      if (captureOutput) {
        result.stdout = stdoutBuf;
      }
      if (captureStderr) {
        result.stderr = stderrBuf;
      }
      resolve(result);
    });
  });
}

/**
 * Spawn a claude -p subprocess, routing through the scheduler when available.
 * Unifies the scheduler vs. direct spawn branching used across pipeline steps.
 */
async function spawnStep(
  prompt: string,
  stepCwd: string,
  workItemId: string,
  scheduler: Scheduler | null,
  opts: SpawnOptions
): Promise<SpawnResult> {
  if (scheduler) {
    return toSpawnResult(
      await scheduler.spawn(prompt, {
        timeout: opts.timeout,
        maxTurns: opts.maxTurns,
        model: opts.model,
        cwd: stepCwd,
        workItemId,
        agentType: opts.agentType,
      })
    );
  }
  return spawnClaudeAsync(stepCwd, prompt, opts);
}

// ─── Conflict Resolution ───────────────────────────────────────────────────────

/** Get list of conflicting files from a worktree mid-rebase. */
function getConflictingFiles(wtPath: string): string[] {
  try {
    const result = execGit(wtPath, ['diff', '--name-only', '--diff-filter=U']);
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.trim().split('\n').filter(Boolean);
    }
  } catch (_err) {
    // no conflict info available
  }
  return [];
}

// ─── Prompt Builders ──────────────────────────────────────────────────────────

/** Simplify step: code quality review before PR creation. */
function buildSimplifyPrompt(phaseNum: string): string {
  return `You are reviewing code changes from phase ${phaseNum}. Examine all changed files (use git diff main...HEAD). For each file, check for: duplicated logic that can be extracted, overly complex code that can be simplified, unused imports or dead code, inconsistent naming or style. Make targeted improvements while preserving all functionality. Do not add comments or documentation unless the logic is truly non-obvious.`;
}

/** Code review step: review PR diff and fix findings. */
function buildCodeReviewPrompt(prUrl: string): string {
  return `You are a code reviewer. Review the PR at ${prUrl}. Use gh pr diff to see the changes. Focus on: correctness bugs, security vulnerabilities, performance issues, and style violations. For each issue found, classify as BLOCKER (must fix) or WARNING (should fix). After the review, fix all BLOCKER and WARNING issues directly in the code, then commit and push the fixes.`;
}

/** Rebase conflict resolution via LLM subprocess. */
function buildConflictResolvePrompt(phaseNum: string, cwd: string, wtPath: string): string {
  // Gather phase context — all reads wrapped in try/catch for graceful fallback
  let phaseGoal = `Phase ${phaseNum} implementation`;
  let planSummary = `See phase plans for details`;

  try {
    const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
    const phaseSection = roadmapContent.split('\n');
    let inPhaseSection = false;
    for (const line of phaseSection) {
      if (line.includes(`#### Phase ${phaseNum}:`) || line.includes(`| ${phaseNum} `)) {
        inPhaseSection = true;
      }
      if (inPhaseSection && line.includes('**Goal**:')) {
        const goalMatch = line.match(/\*\*Goal\*\*:\s*(.+)/);
        if (goalMatch) {
          phaseGoal = goalMatch[1].trim();
          break;
        }
      }
      if (inPhaseSection && line.startsWith('####') && !line.includes(`Phase ${phaseNum}:`)) {
        break;
      }
    }
  } catch (_err) {
    // fallback already set
  }

  try {
    const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
    if (phaseInfo && phaseInfo.plans.length > 0) {
      const planPath = path.join(cwd, phaseInfo.directory, phaseInfo.plans[0]);
      const firstPlan = fs.readFileSync(planPath, 'utf-8');
      const objectiveMatch = firstPlan.match(/<objective>([\s\S]*?)<\/objective>/);
      if (objectiveMatch) {
        planSummary = objectiveMatch[1].trim();
      }
    }
  } catch (_err) {
    // fallback already set
  }

  const conflictingFiles = getConflictingFiles(wtPath);
  let conflictDiffs = '';

  for (const filePath of conflictingFiles.slice(0, 5)) {
    try {
      const diffResult = execGit(wtPath, ['diff', '--', filePath]);
      conflictDiffs += `\n### ${filePath}\n\`\`\`\n${diffResult.stdout}\n\`\`\`\n`;
    } catch (_err) {
      conflictDiffs += `\n### ${filePath}\n(diff unavailable)\n`;
    }
  }

  const fileList =
    conflictingFiles.length > 0
      ? conflictingFiles.map((f) => `- ${f}`).join('\n')
      : '(unable to determine — check git status)';

  return `You are resolving merge conflicts from rebasing phase ${phaseNum}'s branch onto main.

## Phase Context

**Phase Goal:** ${phaseGoal}
**Plan Summary:** ${planSummary}

## Conflicting Files

The following files have conflicts:
${fileList}

## Conflict Diffs
${conflictDiffs || '\n(run `git diff` to see conflict details)\n'}
## Instructions

For each conflicting file:
1. Examine both the incoming changes (from phase ${phaseNum}'s branch) and the changes from main
2. Resolve by PRESERVING CHANGES FROM BOTH VERSIONS — do not discard either side unless they are truly redundant
3. The phase's intent was: ${phaseGoal} — ensure the resolution maintains this intent
4. After resolving all conflicts, run \`git add\` on each resolved file
5. Complete the rebase with \`git rebase --continue\`

If a conflict cannot be automatically resolved (e.g., fundamentally incompatible changes), exit with a non-zero status code.`;
}

/** Build the prompt string for the knowledge miner agent. */
function buildKnowledgeMiningPrompt(phaseNum: string): string {
  return `You are the GRD knowledge miner agent for phase ${phaseNum}.

Your task:
1. Read the SUMMARY.md file for phase ${phaseNum} (look in .planning/milestones/*/phases/*${phaseNum}*/).
2. Analyze the code changes, decisions, and techniques described in the summary.
3. Identify 2-5 reusable patterns or techniques that future phases could benefit from.
4. For each pattern, produce a ---KNOWHOW-ENTRY--- block in this format:

---KNOWHOW-ENTRY---
pattern_name: <descriptive name>
source: <file path or paper slug where pattern was used>
applicability: <when this pattern is useful>
code_snippet: <short representative code example>
phase_number: ${phaseNum}
created_at: <ISO timestamp>
---END-KNOWHOW-ENTRY---

5. Call appendKnowhowEntries (from lib/knowledge.ts) to write the entries to KNOWHOW.md at the project root.

Focus on patterns that are specific, reusable, and non-obvious — not general best practices.`;
}

/**
 * Build the prompt string for the critique agent invocation.
 *
 * Wraps the refinement critique prompt (from lib/refinement.ts) in the standard
 * agent invocation format, prepending agent role context and phase information.
 *
 * @param phaseNum - Phase number for file path context
 * @param branch - The classified refinement branch to execute
 * @param metrics - Current metric measurements
 * @param targets - Target metric thresholds
 * @param minimaRegions - Detected minima/maxima regions from metric history
 * @returns Formatted prompt string for the grd-critique-agent
 */
function buildCritiqueAgentPrompt(
  phaseNum: string,
  branch: CritiqueBranch,
  metrics: RefinementMetrics,
  targets: RefinementMetrics,
  minimaRegions: MinimaRegion[]
): string {
  const critiquePrompt = _buildCritiquePromptFn(branch, metrics, targets, minimaRegions);
  return `You are the grd-critique-agent. Your branch is ${branch}.

Phase: ${phaseNum}
Working directory: project root (all paths are relative to it)

${critiquePrompt}

Apply the targeted fixes described above. Focus on the ${branch} branch instructions. Emit the CRITIQUE-RESULT block at the end of your response.`;
}

// ─── Knowledge Mining ─────────────────────────────────────────────────────────

/**
 * Run the knowledge mining step for a phase.
 * Checks for agent definition existence, spawns the miner, and marks status.
 * Non-blocking — errors are caught and logged; pipeline always continues.
 */
async function runKnowledgeMining(
  cwd: string,
  phaseNum: string,
  options: { scheduler?: Scheduler | null; log: (msg: string) => void }
): Promise<void> {
  const { scheduler, log } = options;
  const agentDefPath = path.resolve(cwd, 'agents', 'grd-knowledge-miner.md');

  if (!fs.existsSync(agentDefPath)) {
    log(`Phase ${phaseNum}: knowledge mining skipped — agent definition not found`);
    writeStatusMarker(cwd, phaseNum, 'knowledge-mining', 'skipped');
    return;
  }

  writeStatusMarker(cwd, phaseNum, 'knowledge-mining', 'started');
  try {
    await spawnStep(
      buildKnowledgeMiningPrompt(phaseNum),
      cwd,
      `phase-${phaseNum}-knowledge-mining`,
      scheduler ?? null,
      { captureOutput: true, agentType: 'grd-knowledge-miner' }
    );
    writeStatusMarker(cwd, phaseNum, 'knowledge-mining', 'completed');
    log(`Phase ${phaseNum}: knowledge mining completed`);
  } catch (_err) {
    log(`Phase ${phaseNum}: knowledge mining failed (non-blocking): ${String(_err)}`);
    writeStatusMarker(cwd, phaseNum, 'knowledge-mining', 'failed');
  }
}

// ─── Refinement Loop ──────────────────────────────────────────────────────────

/**
 * Run the iterative metric-driven refinement loop for a phase.
 *
 * Implements the closed-loop: collect metrics -> classify branch -> spawn critique
 * agent -> re-measure -> check convergence. Adapts NERFIFY's 3-branch refinement
 * (Macro/Geometry/Generative) to GRD's domain.
 *
 * Non-blocking — the entire loop is wrapped in try/catch; failures are logged and
 * the pipeline always continues.
 *
 * @param cwd - Absolute path to the project root directory
 * @param phaseNum - Phase number (used in status markers and prompts)
 * @param options - Configuration including scheduler, log function, and targets
 */
async function runRefinementLoop(
  cwd: string,
  phaseNum: string,
  options: {
    scheduler?: Scheduler | null;
    log: (msg: string) => void;
    maxIterations?: number;
    targets?: RefinementMetrics;
  }
): Promise<void> {
  const { scheduler, log } = options;

  // Skip when not explicitly enabled via config (opt-in, same as citation_gate pattern)
  if (loadConfig(cwd).refinement_loop !== true) {
    log(`Phase ${phaseNum}: refinement loop skipped — refinement_loop config not enabled`);
    return;
  }

  const agentDefPath = path.resolve(cwd, 'agents', 'grd-critique-agent.md');

  if (!fs.existsSync(agentDefPath)) {
    log(`Phase ${phaseNum}: refinement loop skipped — grd-critique-agent.md not found`);
    writeStatusMarker(cwd, phaseNum, 'refinement-loop', 'skipped');
    return;
  }

  const maxIterations = options.maxIterations ?? 3;
  const convergenceConfig: ConvergenceConfig = {
    epsilon_coverage: 0.5,
    epsilon_type_errors: 0,
    epsilon_lint: 1,
    max_iterations: maxIterations,
  };
  const targets: RefinementMetrics = options.targets ?? {
    test_coverage_pct: 80,
    type_error_count: 0,
    lint_violation_count: 0,
    timestamp: new Date().toISOString(),
  };

  writeStatusMarker(cwd, phaseNum, 'refinement-loop', 'started');
  log(`Phase ${phaseNum}: refinement loop started (maxIterations=${maxIterations})`);

  try {
    const history: MetricSnapshot[] = [];

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      log(`Phase ${phaseNum}: refinement loop iteration ${iteration}/${maxIterations}`);
      writeStatusMarker(cwd, phaseNum, 'refinement-loop', `iteration-${iteration}`);

      // Step 1: Collect metrics from npm test, build:check, and lint
      const testResult = await spawnStep(
        'npm test -- --coverage --silent 2>&1',
        cwd,
        `phase-${phaseNum}-refinement-test-${iteration}`,
        null,
        { captureOutput: true }
      );
      const tscResult = await spawnStep(
        'npm run build:check 2>&1',
        cwd,
        `phase-${phaseNum}-refinement-tsc-${iteration}`,
        null,
        { captureOutput: true }
      );
      const lintResult = await spawnStep(
        'npm run lint 2>&1',
        cwd,
        `phase-${phaseNum}-refinement-lint-${iteration}`,
        null,
        { captureOutput: true }
      );

      // Step 2: Parse metrics from captured outputs
      const currentMetrics = _collectMetrics(
        testResult.stdout ?? '',
        tscResult.stdout ?? '',
        lintResult.stdout ?? ''
      );

      // Step 3: Push snapshot to history
      const snapshot: MetricSnapshot = {
        metrics: currentMetrics,
        phase: phaseNum,
        plan: String(iteration),
      };
      history.push(snapshot);

      log(
        `Phase ${phaseNum}: metrics collected — coverage=${currentMetrics.test_coverage_pct.toFixed(1)}%, ` +
          `type_errors=${currentMetrics.type_error_count}, lint=${currentMetrics.lint_violation_count}`
      );

      // Step 4: Check convergence
      const convergenceResult = _checkConvergence(history, convergenceConfig);
      if (convergenceResult.converged) {
        log(`Phase ${phaseNum}: refinement loop converged — ${convergenceResult.reason}`);
        writeStatusMarker(cwd, phaseNum, 'refinement-loop', 'converged');
        return;
      }

      // Step 5: Classify branch and detect minima
      const branch = _classifyBranch(currentMetrics, targets);
      const minimaRegions = _detectMinima(history);
      log(`Phase ${phaseNum}: refinement loop classifying branch as '${branch}'`);

      // Step 6: Build critique prompt and spawn critique agent
      const critiquePrompt = buildCritiqueAgentPrompt(
        phaseNum,
        branch,
        currentMetrics,
        targets,
        minimaRegions
      );
      await spawnStep(
        critiquePrompt,
        cwd,
        `phase-${phaseNum}-critique-${iteration}`,
        scheduler ?? null,
        { captureOutput: true, agentType: 'grd-verifier' }
      );

      writeStatusMarker(cwd, phaseNum, 'refinement-loop', `iteration-${iteration}-complete`);
    }

    // Reached max iterations without convergence
    log(`Phase ${phaseNum}: refinement loop reached max iterations (${maxIterations})`);
    writeStatusMarker(cwd, phaseNum, 'refinement-loop', 'max-iterations');
  } catch (_err) {
    log(`Phase ${phaseNum}: refinement loop failed (non-blocking): ${String(_err)}`);
    writeStatusMarker(cwd, phaseNum, 'refinement-loop', 'failed');
  }
}

// ─── Post-Phase Pipeline ──────────────────────────────────────────────────────

/**
 * Run the post-phase pipeline: simplify -> create PR -> code review -> rebase & merge.
 * Each step runs sequentially on the phase's worktree branch.
 * Halts on any failure and returns the failed step.
 */
async function runPostPhasePipeline(
  cwd: string,
  phaseNum: string,
  wtPath: string,
  opts: {
    timeout?: number;
    maxTurns?: number;
    model?: string;
    scheduler?: Scheduler | null;
    log: (msg: string) => void;
    mergeQueue?: { enqueue<T>(fn: () => Promise<T>): Promise<T> };
  }
): Promise<PostPipelineResult> {
  const { timeout, maxTurns, model, scheduler, log, mergeQueue } = opts;
  const timeoutMs: number | undefined = timeout ? timeout * 60 * 1000 : undefined;
  const spawnOpts: SpawnOptions = { timeout: timeoutMs, maxTurns, model, captureOutput: true };

  // Step 1: Simplify
  log(`Phase ${phaseNum}: post-pipeline — simplify`);
  const simplifyResult = await spawnStep(
    buildSimplifyPrompt(phaseNum),
    wtPath,
    `phase-${phaseNum}-simplify`,
    scheduler ?? null,
    { ...spawnOpts, agentType: 'grd-integration-checker' }
  );

  if (simplifyResult.exitCode !== 0) {
    return {
      status: 'failed',
      failedStep: 'simplify',
      reason: simplifyResult.timedOut ? 'timeout' : `exit code ${simplifyResult.exitCode}`,
    };
  }

  // Step 2: Create PR
  log(`Phase ${phaseNum}: post-pipeline — create PR`);
  const milestoneInfo: MilestoneInfo = getMilestoneInfo(cwd);
  const prResult = pushAndCreatePR(cwd, wtPath, {
    title: `Phase ${phaseNum}: ${milestoneInfo.version}`,
    body: `Automated PR from autopilot phase ${phaseNum} execution.\n\nMilestone: ${milestoneInfo.version} (${milestoneInfo.name})`,
  });

  if ('error' in prResult) {
    return { status: 'failed', failedStep: 'create-pr', reason: prResult.error };
  }
  const prUrl: string = prResult.pr_url;
  log(`Phase ${phaseNum}: PR created — ${prUrl}`);

  // Step 3: Code review + fix
  log(`Phase ${phaseNum}: post-pipeline — code review`);
  const reviewResult = await spawnStep(
    buildCodeReviewPrompt(prUrl),
    wtPath,
    `phase-${phaseNum}-review`,
    scheduler ?? null,
    { ...spawnOpts, agentType: 'grd-code-reviewer' }
  );

  if (reviewResult.exitCode !== 0) {
    return {
      status: 'failed',
      failedStep: 'code-review',
      prUrl,
      reason: reviewResult.timedOut ? 'timeout' : `exit code ${reviewResult.exitCode}`,
    };
  }

  // Step 4: Rebase & merge (serialized through mergeQueue when provided)
  const runStep4 = async (): Promise<PostPipelineResult> => {
    log(`Phase ${phaseNum}: post-pipeline — rebase & merge`);
    const rebaseResult = execGit(wtPath, ['rebase', 'main']);
    if (rebaseResult.exitCode !== 0) {
      // Merge conflicts — spawn claude -p to resolve
      log(`Phase ${phaseNum}: rebase conflicts detected, attempting auto-resolution`);
      const conflictResult = await spawnStep(
        buildConflictResolvePrompt(phaseNum, cwd, wtPath),
        wtPath,
        `phase-${phaseNum}-conflicts`,
        scheduler ?? null,
        { ...spawnOpts, agentType: 'grd-integration-checker' }
      );

      if (conflictResult.exitCode !== 0) {
        // Gather conflict info BEFORE aborting (abort clears conflict state)
        const conflictFiles = getConflictingFiles(wtPath);
        const branch = execGit(wtPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
        const branchName = branch.exitCode === 0 ? branch.stdout.trim() : `phase-${phaseNum}`;
        execGit(wtPath, ['rebase', '--abort']);
        return {
          status: 'failed',
          failedStep: 'rebase',
          prUrl,
          reason: `conflict resolution failed for phase ${phaseNum} — conflicting files: ${conflictFiles.join(', ') || 'unknown'}. Manual steps: git checkout ${branchName}, git rebase main, resolve conflicts manually, git rebase --continue`,
        };
      }
    }

    // Force-push the rebased branch and merge the PR
    const branch = execGit(wtPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch.exitCode !== 0) {
      return {
        status: 'failed',
        failedStep: 'push-rebased',
        prUrl,
        reason: 'failed to determine branch name',
      };
    }
    const pushResult = execGit(
      wtPath,
      ['push', '--force-with-lease', 'origin', branch.stdout.trim()],
      {
        allowBlocked: true,
      }
    );
    if (pushResult.exitCode !== 0) {
      return {
        status: 'failed',
        failedStep: 'push-rebased',
        prUrl,
        reason: `push failed: ${pushResult.stderr}`,
      };
    }

    // Merge the PR via gh CLI
    try {
      childProcess.execFileSync('gh', ['pr', 'merge', prUrl, '--merge', '--delete-branch'], {
        cwd: wtPath,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    } catch (mergeErr) {
      return {
        status: 'failed',
        failedStep: 'merge',
        prUrl,
        reason: String((mergeErr as { stderr?: string }).stderr || mergeErr),
      };
    }

    log(`Phase ${phaseNum}: post-pipeline complete — merged ${prUrl}`);
    return { status: 'completed', prUrl };
  };

  return mergeQueue ? mergeQueue.enqueue(runStep4) : runStep4();
}

// ─── Phase Finalize ───────────────────────────────────────────────────────────

/**
 * Finalize a phase after a successful post-pipeline run.
 * Calls completePhaseAfterPostPipeline and writes status markers.
 * Returns the PhaseCompleteResult or null on failure.
 */
async function finalizePhaseAfterPipeline(
  cwd: string,
  phaseNum: string,
  scheduler: Scheduler | null,
  log: (msg: string) => void
): Promise<PhaseCompleteResult | null> {
  writeStatusMarker(cwd, phaseNum, 'phase-finalize', 'started');
  const finalizeResult: PhaseCompleteResult | null = await completePhaseAfterPostPipeline(
    cwd,
    phaseNum,
    scheduler
  );
  if (finalizeResult) {
    writeStatusMarker(cwd, phaseNum, 'phase-finalize', 'completed');
    log(
      `Phase ${phaseNum}: phase-finalize complete — ${finalizeResult.plans_executed} plans, ${finalizeResult.next_phase ? `next phase ${finalizeResult.next_phase}` : 'milestone complete'}`
    );
  } else {
    writeStatusMarker(cwd, phaseNum, 'phase-finalize', 'failed');
    log(
      `Phase ${phaseNum}: phase-finalize failed — run 'gd phase complete ${phaseNum}' manually to finalize`
    );
  }
  return finalizeResult;
}

module.exports = {
  toSpawnResult,
  spawnClaude,
  spawnClaudeAsync,
  spawnStep,
  _buildSpawnConfig,
  writeStatusMarker,
  updateStateProgress,
  getConflictingFiles,
  buildSimplifyPrompt,
  buildCodeReviewPrompt,
  buildConflictResolvePrompt,
  buildKnowledgeMiningPrompt,
  buildCritiqueAgentPrompt,
  runKnowledgeMining,
  runRefinementLoop,
  runPostPhasePipeline,
  finalizePhaseAfterPipeline,
};
