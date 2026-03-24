'use strict';

/**
 * GRD Autopilot -- Deterministic multi-phase orchestration via `claude -p` subprocesses.
 *
 * Each phase gets a fresh Claude process with zero context from previous steps.
 * The loop is entirely deterministic Node.js -- no LLM involvement in orchestration.
 *
 * Created in Phase 52.
 */

import type {
  DependencyGraph,
  GrdConfig,
  MilestoneInfo,
  MultiMilestoneOptions,
  MilestoneStepResult,
  MultiMilestoneResult,
  PhaseInfo,
} from './types';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process') as typeof import('child_process');
const {
  loadConfig,
  findPhaseInternal,
  output,
  getMilestoneInfo,
}: {
  loadConfig: (cwd: string) => GrdConfig;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => void;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
} = require('./utils');
const {
  detectBackend,
  getBackendCapabilities,
}: {
  detectBackend: (cwd: string) => string;
  getBackendCapabilities: (backend: string) => import('./types').BackendCapabilities;
} = require('./backend');
const {
  analyzeRoadmap,
}: {
  analyzeRoadmap: (cwd: string) => {
    error?: string;
    phases?: Array<{
      number: string;
      name: string;
      depends_on?: string | null;
      disk_status?: string;
      roadmap_complete?: boolean;
    }>;
  };
} = require('./roadmap');
const {
  buildDependencyGraph,
  computeParallelGroups,
}: {
  buildDependencyGraph: (
    phases: Array<{ number: string; name: string; depends_on?: string | null }>
  ) => DependencyGraph;
  computeParallelGroups: (graph: DependencyGraph) => string[][];
} = require('./deps');
const {
  parseLongTermRoadmap,
}: {
  parseLongTermRoadmap: (content: unknown) => {
    milestones: Array<{
      id: string;
      name: string;
      status: string;
      normal_milestones: Array<{ version: string; note?: string }>;
    }>;
  } | null;
} = require('./long-term-roadmap');
import type { Scheduler } from './scheduler';
const {
  createScheduler,
  resolveAccount,
}: {
  createScheduler: (
    config: import('./types').SchedulerConfig | undefined,
    superpowersConfig?: import('./types').SuperpowersConfig
  ) => Scheduler | null;
  resolveAccount: (
    superpowersConfig: import('./types').SuperpowersConfig,
    schedulerConfig: import('./types').SchedulerConfig,
    states: Map<string, import('./types').BackendUsageState>,
    safetyMargin: number
  ) => import('./types').AccountResolution;
} = require('./scheduler');
const {
  slingPlanAsync,
  loadOverstoryConfig,
  generateOverlay,
}: {
  slingPlanAsync: (
    cwd: string,
    opts: import('./types').SlingOpts,
    pollIntervalMs: number,
    mergeStrategy: 'auto' | 'manual'
  ) => Promise<{ exitCode: number; duration: number; agentId: string }>;
  loadOverstoryConfig: (cwd: string) => import('./types').OverstoryConfig;
  generateOverlay: (
    planContent: string,
    context: { phase_number: string; plan_id: string; milestone: string; phase_dir: string }
  ) => string;
} = require('./overstory');
const {
  worktreePath: getWorktreePath,
  worktreeBranch: getWorktreeBranch,
  ensureWorktreesDir,
  pushAndCreatePR,
}: {
  worktreePath: (cwd: string, milestone: string, phase: string) => string;
  worktreeBranch: (cwd: string, milestone: string, phase: string, slug: string) => string;
  ensureWorktreesDir: (cwd: string) => boolean;
  pushAndCreatePR: (
    cwd: string,
    wtPath: string,
    options?: { title?: string; body?: string; base?: string }
  ) => { pr_url: string; branch: string; base: string } | { error: string; push_succeeded?: boolean };
} = require('./worktree');
const {
  execGit,
}: {
  execGit: (cwd: string, args: string[], opts?: { allowBlocked?: boolean }) => import('./types').ExecGitResult;
} = require('./utils');

// ─── Default Constants ──────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MINUTES: number = 120;
const HEARTBEAT_INTERVAL_MS: number = 30000;
const AUTOPILOT_DIR: string = 'autopilot';

// ─── Merge Queue ────────────────────────────────────────────────────────────

/**
 * FIFO async serialization primitive for the rebase+merge step.
 * Only one enqueued function executes at a time; others wait in arrival order.
 */
interface MergeQueue {
  enqueue<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Create a merge queue that serializes async functions in FIFO order.
 * Uses a promise-chain tail: each enqueue appends to the tail so functions
 * execute one at a time regardless of when enqueue() is called.
 */
function createMergeQueue(): MergeQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    enqueue<T>(fn: () => Promise<T>): Promise<T> {
      const result = tail.then(() => fn());
      // Suppress errors on the chain tail to avoid unhandled rejection —
      // each caller's returned promise still rejects correctly.
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
}

// ─── Domain Types ───────────────────────────────────────────────────────────

/** Shared options for spawnClaude/spawnClaudeAsync. */
interface SpawnOptions {
  timeout?: number;
  maxTurns?: number;
  model?: string;
  outputFormat?: string;
  captureOutput?: boolean;
  captureStderr?: boolean;
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

/** Options for runAutopilot. */
interface AutopilotOptions {
  phaseFrom?: string | null;
  phaseTo?: string | null;
  milestone?: boolean;
  dryRun?: boolean;
  skipPlan?: boolean;
  skipExecute?: boolean;
  skipPostPipeline?: boolean;
  timeout?: number;
  maxTurns?: number;
  model?: string;
}

/** Per-phase step result. */
interface PhaseStepResult {
  phase: string;
  step: string;
  status: string;
  reason?: string;
  prompt?: string;
}

/** Returned by runAutopilot. */
interface AutopilotResult {
  phases_attempted: number;
  phases_completed: number;
  stopped_at: string | null;
  waves: string[][];
  results: PhaseStepResult[];
}

/** Returned by resolvePhaseRange. */
interface ResolvePhaseRangeResult {
  phases: Array<{
    number: string;
    name: string;
    disk_status: string;
    depends_on?: string | null;
  }>;
  error: string | null;
}

// ─── Scheduler State Helpers ────────────────────────────────────────────────

/**
 * Build a states map from the scheduler for use with resolveAccount().
 * Enumerates all configured account state keys and queries the scheduler
 * for each, collecting only those that exist.
 */
function _getSchedulerStates(
  scheduler: Scheduler,
  schedulerConfig: import('./types').SchedulerConfig,
  superpowersConfig: import('./types').SuperpowersConfig
): Map<string, import('./types').BackendUsageState> {
  const states = new Map<string, import('./types').BackendUsageState>();
  const accounts = superpowersConfig.accounts;
  const allBackends = new Set([
    ...schedulerConfig.backend_priority,
    schedulerConfig.free_fallback.backend,
  ]);

  for (const backend of allBackends) {
    const backendAccounts = accounts[backend as import('./types').AdapterBackendId];
    if (!backendAccounts || backendAccounts.length === 0) continue;

    for (const account of backendAccounts) {
      const stateKey = `${backend}/${account.config_dir}`;
      const state = scheduler.getState(stateKey);
      if (state) {
        states.set(stateKey, state);
      }
    }
  }

  // Also check the fallback backend with no config_dir
  const fallbackState = scheduler.getState(schedulerConfig.free_fallback.backend);
  if (fallbackState) {
    states.set(schedulerConfig.free_fallback.backend, fallbackState);
  }

  // Check default_backend with no config_dir
  const defaultBackend = superpowersConfig.default_backend;
  const defaultState = scheduler.getState(defaultBackend);
  if (defaultState) {
    states.set(defaultBackend, defaultState);
  }

  return states;
}

// ─── Pure Helper Functions ──────────────────────────────────────────────────

/**
 * Resolve the range of phases to process from ROADMAP.md.
 */
function resolvePhaseRange(
  cwd: string,
  from: string | null,
  to: string | null
): ResolvePhaseRangeResult {
  const analysis = analyzeRoadmap(cwd);
  if (analysis.error) {
    return { phases: [], error: analysis.error };
  }

  let phases = analysis.phases;
  if (!phases || phases.length === 0) {
    return { phases: [], error: 'No phases found in ROADMAP.md' };
  }

  // Filter to range
  if (from) {
    const fromNum: number = parseFloat(from);
    phases = phases.filter((p) => parseFloat(p.number) >= fromNum);
  }
  if (to) {
    const toNum: number = parseFloat(to);
    phases = phases.filter((p) => parseFloat(p.number) <= toNum);
  }

  if (phases.length === 0) {
    return { phases: [], error: `No phases found in range ${from || 'start'}..${to || 'end'}` };
  }

  return {
    phases: phases.map((p) => ({
      number: p.number,
      name: p.name,
      disk_status: (p as { disk_status?: string }).disk_status || 'unknown',
      depends_on: (p as { depends_on?: string | null }).depends_on,
    })),
    error: null,
  };
}

/**
 * Check if a phase has been planned (used for auto-resume skip logic).
 */
function isPhasePlanned(cwd: string, phaseNum: string): boolean {
  const info: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
  if (!info) return false;
  return info.plans.length > 0;
}

/**
 * Check if a phase has been fully executed (used for auto-resume skip logic).
 */
function isPhaseExecuted(cwd: string, phaseNum: string): boolean {
  const info: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
  if (!info) return false;
  return info.plans.length > 0 && info.incomplete_plans.length === 0;
}

/**
 * Prepend "ultrathink" keyword when the backend supports the effort capability.
 */
function withUltrathink(prompt: string, backend?: string): string {
  if (backend && getBackendCapabilities(backend).effort) {
    return `ultrathink\n\n${prompt}`;
  }
  return prompt;
}

/**
 * Build the prompt for planning a phase via `claude -p`.
 */
function buildPlanPrompt(phaseNum: string, backend?: string): string {
  return withUltrathink(
    `Use the Skill tool to invoke skill "grd:plan-phase" with args "${phaseNum}" (i.e. plan-phase ${phaseNum}). Autonomous mode — make all decisions yourself, no questions. Complete all planning steps and write the PLAN.md files.`,
    backend
  );
}

/**
 * Build the prompt for executing a phase via `claude -p`.
 */
function buildExecutePrompt(phaseNum: string): string {
  return `Use the Skill tool to invoke skill "grd:execute-phase" with args "${phaseNum}" (i.e. execute-phase ${phaseNum}). Autonomous mode — make all decisions yourself, no questions. After execution, merge locally. Do not push.`;
}

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
      const firstPlan = fs.readFileSync(phaseInfo.plans[0], 'utf-8');
      const objectiveMatch = firstPlan.match(/<objective>([\s\S]*?)<\/objective>/);
      if (objectiveMatch) {
        planSummary = objectiveMatch[1].trim();
      }
    }
  } catch (_err) {
    // fallback already set
  }

  // Gather conflicting file information from the worktree
  let conflictingFiles: string[] = [];
  let conflictDiffs = '';

  try {
    const conflictListResult = execGit(wtPath, ['diff', '--name-only', '--diff-filter=U']);
    if (conflictListResult.exitCode === 0 && conflictListResult.stdout.trim()) {
      conflictingFiles = conflictListResult.stdout.trim().split('\n').filter(Boolean);
      const filesToShow = conflictingFiles.slice(0, 5);
      for (const filePath of filesToShow) {
        try {
          const diffResult = execGit(wtPath, ['diff', '--', filePath]);
          conflictDiffs += `\n### ${filePath}\n\`\`\`\n${diffResult.stdout}\n\`\`\`\n`;
        } catch (_err) {
          conflictDiffs += `\n### ${filePath}\n(diff unavailable)\n`;
        }
      }
    }
  } catch (_err) {
    // no conflict info available
  }

  const fileList = conflictingFiles.length > 0
    ? conflictingFiles.map(f => `- ${f}`).join('\n')
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

/** Wireup discovery after milestone completion. */
function buildWireupPrompt(): string {
  return 'Use the Skill tool to invoke skill "grd:wireup" with no additional args. Autonomous mode — make all decisions yourself, no questions. Run wireup discovery (exported-but-uncalled, config-without-surface, endpoint-without-integration-test) and fix any findings.';
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
      })
    );
  }
  return spawnClaudeAsync(stepCwd, prompt, opts);
}

/** Result from a post-phase pipeline run. */
interface PostPipelineResult {
  status: 'completed' | 'failed';
  failedStep?: string;
  prUrl?: string;
  reason?: string;
}

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
    mergeQueue?: MergeQueue;
  }
): Promise<PostPipelineResult> {
  const { timeout, maxTurns, model, scheduler, log, mergeQueue } = opts;
  const timeoutMs: number | undefined = timeout ? timeout * 60 * 1000 : undefined;
  const spawnOpts: SpawnOptions = { timeout: timeoutMs, maxTurns, model, captureOutput: true };

  // Step 1: Simplify
  log(`Phase ${phaseNum}: post-pipeline — simplify`);
  const simplifyResult = await spawnStep(
    buildSimplifyPrompt(phaseNum), wtPath, `phase-${phaseNum}-simplify`, scheduler ?? null, spawnOpts
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
    buildCodeReviewPrompt(prUrl), wtPath, `phase-${phaseNum}-review`, scheduler ?? null, spawnOpts
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
        buildConflictResolvePrompt(phaseNum, cwd, wtPath), wtPath, `phase-${phaseNum}-conflicts`, scheduler ?? null, spawnOpts
      );

      if (conflictResult.exitCode !== 0) {
        // Abort the failed rebase before returning
        execGit(wtPath, ['rebase', '--abort']);
        // Gather conflicting file list for actionable failure message
        let conflictFileList = 'unknown';
        try {
          const conflictListResult = execGit(wtPath, ['diff', '--name-only', '--diff-filter=U']);
          if (conflictListResult.exitCode === 0 && conflictListResult.stdout.trim()) {
            conflictFileList = conflictListResult.stdout.trim().split('\n').filter(Boolean).join(', ');
          }
        } catch (_err) {
          // keep 'unknown'
        }
        const branch = execGit(wtPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
        const branchName = branch.exitCode === 0 ? branch.stdout.trim() : `phase-${phaseNum}`;
        return {
          status: 'failed',
          failedStep: 'rebase',
          prUrl,
          reason: `conflict resolution failed for phase ${phaseNum} — conflicting files: ${conflictFileList}. Manual steps: git checkout ${branchName}, git rebase main, resolve conflicts manually, git rebase --continue`,
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
    const pushResult = execGit(wtPath, ['push', '--force-with-lease', 'origin', branch.stdout.trim()], {
      allowBlocked: true,
    });
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
 * Group phases into dependency waves using Kahn's algorithm.
 * Phases with no dependencies land in wave 0; phases depending on wave-0
 * phases land in wave 1, etc.
 */
function buildWaves(
  phases: Array<{ number: string; name: string; depends_on?: string | null }>
): string[][] {
  const graph: DependencyGraph = buildDependencyGraph(phases);
  return computeParallelGroups(graph);
}

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
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(marker, null, 2));
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
      const fd: number = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
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
        while (Date.now() - start < 10) { /* spin */ }
        continue;
      }
      throw e;
    }
  }

  if (!lockAcquired) {
    process.stderr.write(`[autopilot] Warning: failed to acquire lock on ${statePath} after ${maxRetries} retries, skipping state update\n`);
    return;
  }

  try {
    let content: string = fs.readFileSync(statePath, 'utf-8');

    // Update Current Phase field
    content = content.replace(
      /(\*\*Current Phase:\*\*)\s*[^\n]*/,
      `$1 Phase ${phaseNum} (autopilot: ${step})`
    );

    fs.writeFileSync(statePath, content);
  } finally {
    try { fs.unlinkSync(lockPath); } catch (unlockErr) {
      // Only ENOENT is expected (lock already removed); other errors indicate
      // a real problem but we cannot throw from finally — log instead.
      if ((unlockErr as NodeJS.ErrnoException).code !== 'ENOENT') {
        process.stderr.write(`[autopilot] Warning: failed to release lock ${lockPath}: ${(unlockErr as Error).message}\n`);
      }
    }
  }
}

// ─── Multi-Milestone Helpers ─────────────────────────────────────────────────

/**
 * Check if all phases in the current milestone are complete.
 * Returns true if every phase has disk_status 'complete' or roadmap_complete is true,
 * AND there is at least one phase.
 */
function isMilestoneComplete(cwd: string): boolean {
  const analysis = analyzeRoadmap(cwd);
  if (analysis.error || !analysis.phases || analysis.phases.length === 0) {
    return false;
  }

  return analysis.phases.every(
    (p) => (p as { disk_status?: string }).disk_status === 'complete' || p.roadmap_complete === true
  );
}

/**
 * Determine the next milestone to work on from LONG-TERM-ROADMAP.md.
 * Strategy:
 * - Parse LT roadmap, find the first "active" or "planned" LT milestone
 *   that has linked normal milestones not yet shipped (note != "shipped"),
 *   or find the next LT milestone that is "planned" with no linked milestones yet.
 * - Returns { version, name } of the next milestone to create, or null if none found.
 *
 * @param cwd - Absolute path to the project root directory
 * @returns The version and name of the next milestone to create, or null if no next milestone is found
 */
function resolveNextMilestone(cwd: string): { version: string; name: string } | null {
  const ltRoadmapPath: string = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
  if (!fs.existsSync(ltRoadmapPath)) {
    return null;
  }

  const content: string = fs.readFileSync(ltRoadmapPath, 'utf-8');
  const parsed = parseLongTermRoadmap(content);
  if (!parsed) {
    return null;
  }

  // Find the first LT milestone that is "active" or "planned"
  for (const ltMs of parsed.milestones) {
    if (ltMs.status === 'completed') continue;

    // Check linked normal milestones -- find first that isn't shipped
    for (const nm of ltMs.normal_milestones) {
      const note: string = (nm.note || '').toLowerCase();
      if (note === 'shipped' || note === 'complete' || note === 'completed') {
        continue;
      }
      // This normal milestone isn't shipped yet -- it's the next one
      return { version: nm.version, name: ltMs.name };
    }

    // If all linked milestones are shipped but LT milestone isn't completed,
    // or if there are no linked milestones, this LT milestone needs a new normal milestone
    if (ltMs.status === 'planned') {
      return { version: `next-${ltMs.id.toLowerCase()}`, name: ltMs.name };
    }
  }

  return null;
}

/**
 * Build the prompt string for spawning `/grd:new-milestone` via `claude -p`.
 * Prepends "ultrathink" when the backend supports the effort capability.
 */
function buildNewMilestonePrompt(backend?: string): string {
  return withUltrathink(
    'Use the Skill tool to invoke skill "grd:new-milestone" with no additional args. Autonomous mode — make all decisions yourself, no questions. Complete all milestone creation steps including research, requirements, and roadmap setup.',
    backend
  );
}

/**
 * Build the prompt string for completing a milestone via `claude -p`.
 * Uses grd-tools.js milestone complete directly since it is a deterministic operation.
 */
function buildMilestoneCompletePrompt(version: string): string {
  return `Run the following command to complete the milestone: node \${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js milestone complete --name "${version}". Then verify the milestone was archived successfully by checking .planning/STATE.md.`;
}

// ─── Main Loop ──────────────────────────────────────────────────────────────

/**
 * Run the autopilot loop over a range of phases, grouped by dependency waves.
 * Independent phases are planned in parallel; execution is always sequential.
 */
async function runAutopilot(cwd: string, options: AutopilotOptions = {}): Promise<AutopilotResult> {
  const {
    phaseFrom = null,
    phaseTo = null,
    dryRun = false,
    skipPlan = false,
    skipExecute = false,
    skipPostPipeline = false,
    timeout,
    maxTurns,
    model,
  } = options;

  const { phases, error: rangeError } = resolvePhaseRange(cwd, phaseFrom, phaseTo);
  if (rangeError) {
    return {
      phases_attempted: 0,
      phases_completed: 0,
      stopped_at: rangeError,
      waves: [],
      results: [],
    };
  }

  const waves: string[][] = buildWaves(phases);

  const timeoutMs: number | undefined = timeout ? timeout * 60 * 1000 : undefined;
  const results: PhaseStepResult[] = [];
  let phasesAttempted: number = 0;
  let phasesCompleted: number = 0;
  let stoppedAt: string | null = null;

  const config: GrdConfig = loadConfig(cwd);
  const backend: string = detectBackend(cwd);
  const scheduler = createScheduler(config.scheduler, config.superpowers);
  if (scheduler) {
    scheduler.loadPersistedState(path.join(cwd, '.planning'));
  }

  // autopilot.log is project-scoped (.planning/autopilot/).
  // Cross-project scheduler state (e.g., global phase timing stats,
  // retry policies) could use CLAUDE_PLUGIN_DATA when available:
  //   const globalSchedulerDir = process.env.CLAUDE_PLUGIN_DATA
  //     ? path.join(process.env.CLAUDE_PLUGIN_DATA, 'grd', 'scheduler')
  //     : null;
  const logFile: string = path.join(cwd, '.planning', 'autopilot', 'autopilot.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log: (msg: string) => void = (msg: string): void => {
    const line: string = `[${new Date().toISOString()}] ${msg}\n`;
    process.stderr.write(`[autopilot] ${msg}\n`);
    fs.appendFileSync(logFile, line);
  };
  log(`Starting autopilot: ${phases.length} phase(s) in ${waves.length} wave(s)`);

  // Single merge queue shared across all waves — only the rebase+merge step
  // is serialized; simplify/PR/review steps run concurrently per phase.
  const mergeQueue: MergeQueue = createMergeQueue();

  for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
    const wave: string[] = waves[waveIdx];
    if (stoppedAt) break;

    log(`Wave ${waveIdx + 1}/${waves.length}: phases [${wave.join(', ')}]`);

    // ── Plan step: all phases in wave in parallel ──
    if (!skipPlan) {
      const planTasks: Array<{
        phaseNum: string;
        skipped: boolean;
        promise?: Promise<SpawnResult>;
      }> = [];

      for (const phaseNum of wave) {
        phasesAttempted++;
        if (isPhasePlanned(cwd, phaseNum)) {
          results.push({
            phase: phaseNum,
            step: 'plan',
            status: 'skipped',
            reason: 'already planned',
          });
          planTasks.push({ phaseNum, skipped: true });
        } else if (dryRun) {
          results.push({
            phase: phaseNum,
            step: 'plan',
            status: 'dry-run',
            prompt: buildPlanPrompt(phaseNum, backend),
          });
          planTasks.push({ phaseNum, skipped: true });
        } else {
          log(`Phase ${phaseNum}: planning...`);
          writeStatusMarker(cwd, phaseNum, 'plan', 'started');
          updateStateProgress(cwd, phaseNum, 'planning');

          // Check for overstory sling path: parallel wave + account rotation + native worktree isolation
          let promise: Promise<SpawnResult>;
          if (config.superpowers?.account_rotation && scheduler && config.scheduler) {
            const resolution = resolveAccount(
              config.superpowers,
              config.scheduler,
              _getSchedulerStates(scheduler, config.scheduler, config.superpowers),
              config.scheduler.prediction.safety_margin_tasks
            );
            const caps = getBackendCapabilities(resolution.backend);
            if (caps.native_worktree_isolation) {
              // Overstory sling path: bypass scheduler.spawn() for parallel wave planning
              const ovConfig = loadOverstoryConfig(cwd);
              const milestoneInfo: MilestoneInfo = getMilestoneInfo(cwd);
              const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
              const phaseDir: string =
                phaseInfo?.directory ||
                path.join(
                  cwd,
                  '.planning',
                  'milestones',
                  milestoneInfo.version,
                  'phases',
                  `phase-${phaseNum}`
                );
              const planId: string = `phase-${phaseNum}-plan`;
              const overlayContent: string = generateOverlay(buildPlanPrompt(phaseNum, backend), {
                phase_number: phaseNum,
                plan_id: planId,
                milestone: milestoneInfo.version,
                phase_dir: phaseDir,
              });
              const overlayDir: string = path.join(cwd, '.planning', 'autopilot', 'overlays');
              fs.mkdirSync(overlayDir, { recursive: true });
              const overlayPath: string = path.join(overlayDir, `overlay-${phaseNum}.md`);
              fs.writeFileSync(overlayPath, overlayContent);

              const slingOpts: import('./types').SlingOpts = {
                plan_path: phaseDir,
                overlay_path: overlayPath,
                runtime: ovConfig.runtime,
                model: model || 'default',
                phase_number: phaseNum,
                plan_id: planId,
                milestone: milestoneInfo.version,
                timeout_minutes: timeout || DEFAULT_TIMEOUT_MINUTES,
              };

              log(`Phase ${phaseNum}: using overstory sling path (backend: ${resolution.backend})`);
              promise = slingPlanAsync(
                cwd,
                slingOpts,
                ovConfig.poll_interval_ms,
                ovConfig.merge_strategy
              ).then((slingResult): SpawnResult => {
                // Record the sample back to the scheduler
                const sample: import('./types').UsageSample = {
                  backend: resolution.backend as import('./types').BackendId,
                  stateKey: resolution.stateKey,
                  timestamp: Date.now(),
                  duration: slingResult.duration,
                  tokenEstimate: Math.round(slingResult.duration * 10), // fallback estimate
                  exitCode: slingResult.exitCode,
                  workItemId: `phase-${phaseNum}-plan`,
                };
                scheduler.recordExternalSample(resolution.stateKey, sample);
                return { exitCode: slingResult.exitCode, timedOut: false };
              });
            } else {
              // Non-overstory backend with account rotation: use scheduler.spawn
              promise = scheduler
                .spawn(buildPlanPrompt(phaseNum, backend), {
                  timeout: timeoutMs,
                  maxTurns,
                  model,
                  cwd,
                  workItemId: `phase-${phaseNum}-plan`,
                })
                .then(toSpawnResult);
            }
          } else {
            promise = scheduler
              ? scheduler
                  .spawn(buildPlanPrompt(phaseNum, backend), {
                    timeout: timeoutMs,
                    maxTurns,
                    model,
                    cwd,
                    workItemId: `phase-${phaseNum}-plan`,
                  })
                  .then(toSpawnResult)
              : spawnClaudeAsync(cwd, buildPlanPrompt(phaseNum, backend), {
                  timeout: timeoutMs,
                  maxTurns,
                  model,
                });
          }
          planTasks.push({ phaseNum, skipped: false, promise });
        }
      }

      // Await all parallel plan spawns
      for (const task of planTasks) {
        if (task.skipped) continue;

        const planResult: SpawnResult = await task.promise!;

        if (planResult.exitCode !== 0) {
          const reason: string = planResult.timedOut
            ? 'timeout'
            : `exit code ${planResult.exitCode}`;
          log(`Phase ${task.phaseNum}: plan FAILED (${reason})`);
          writeStatusMarker(cwd, task.phaseNum, 'plan', 'failed');
          results.push({ phase: task.phaseNum, step: 'plan', status: 'failed', reason });
          stoppedAt = `Phase ${task.phaseNum} plan failed: ${reason}`;
          continue;
        }

        log(`Phase ${task.phaseNum}: plan completed`);
        writeStatusMarker(cwd, task.phaseNum, 'plan', 'completed');
        results.push({ phase: task.phaseNum, step: 'plan', status: 'completed' });
      }

      if (stoppedAt) break;

      // If skipExecute, count only planned phases (not yet counted above for non-skipPlan path)
      if (skipExecute) {
        phasesCompleted += wave.length;
        continue;
      }
    } else {
      // skipPlan: still need to count attempts
      phasesAttempted += wave.length;
      if (skipExecute) {
        phasesCompleted += wave.length;
        continue;
      }
    }

    // ── Execute step: parallel within wave using worktrees ──
    // Track which phases failed planning so we skip them during execution
    const failedPlanPhases: Set<string> = new Set(
      results.filter((r) => r.step === 'plan' && r.status === 'failed').map((r) => r.phase)
    );

    if (!skipExecute) {
      const milestoneInfo: MilestoneInfo = getMilestoneInfo(cwd);
      ensureWorktreesDir(cwd);

      // Build execution tasks for all phases in the wave
      const execTasks: Array<{
        phaseNum: string;
        skipped: boolean;
        promise?: Promise<{ execResult: SpawnResult; wtPath: string }>;
        wtPath?: string;
      }> = [];

      for (const phaseNum of wave) {
        if (failedPlanPhases.has(phaseNum)) {
          log(`Phase ${phaseNum}: skipping execution (planning failed)`);
          results.push({
            phase: phaseNum,
            step: 'execute',
            status: 'skipped',
            reason: 'planning failed',
          });
          execTasks.push({ phaseNum, skipped: true });
          continue;
        }
        if (isPhaseExecuted(cwd, phaseNum)) {
          results.push({
            phase: phaseNum,
            step: 'execute',
            status: 'skipped',
            reason: 'already executed',
          });
          execTasks.push({ phaseNum, skipped: true });
          continue;
        }
        if (dryRun) {
          results.push({
            phase: phaseNum,
            step: 'execute',
            status: 'dry-run',
            prompt: buildExecutePrompt(phaseNum),
          });
          execTasks.push({ phaseNum, skipped: true });
          continue;
        }

        // Create worktree for this phase
        const wtPath: string = getWorktreePath(cwd, milestoneInfo.version, phaseNum);
        const branch: string = getWorktreeBranch(cwd, milestoneInfo.version, phaseNum, phaseNum);

        // Remove stale worktree if it exists
        // Remove stale worktree if present (no existence check — idempotent)
        execGit(cwd, ['worktree', 'remove', wtPath, '--force'], { allowBlocked: true });
        execGit(cwd, ['worktree', 'prune']);

        // Remove stale branch if it exists
        execGit(cwd, ['branch', '-D', branch]);

        const wtResult = execGit(cwd, ['worktree', 'add', '-b', branch, wtPath]);
        if (wtResult.exitCode !== 0) {
          log(`Phase ${phaseNum}: failed to create worktree: ${wtResult.stderr}`);
          results.push({
            phase: phaseNum,
            step: 'execute',
            status: 'failed',
            reason: `worktree creation failed: ${wtResult.stderr}`,
          });
          execTasks.push({ phaseNum, skipped: true });
          continue;
        }

        log(`Phase ${phaseNum}: executing in worktree ${wtPath}...`);
        writeStatusMarker(cwd, phaseNum, 'execute', 'started');
        updateStateProgress(cwd, phaseNum, 'executing');

        const promise = (async (): Promise<{ execResult: SpawnResult; wtPath: string }> => {
          const execResult: SpawnResult = scheduler
            ? toSpawnResult(
                await scheduler.spawn(buildExecutePrompt(phaseNum), {
                  timeout: timeoutMs,
                  maxTurns,
                  model,
                  cwd: wtPath,
                  workItemId: `phase-${phaseNum}-execute`,
                })
              )
            : await spawnClaudeAsync(wtPath, buildExecutePrompt(phaseNum), {
                timeout: timeoutMs,
                maxTurns,
                model,
              });
          return { execResult, wtPath };
        })();

        execTasks.push({ phaseNum, skipped: false, promise, wtPath });
      }

      // Await all parallel execution spawns and collect successful phases for pipelines
      const pipelineTasks: Array<{
        phaseNum: string;
        wtPath: string;
        promise: Promise<{ phaseNum: string; result: PostPipelineResult }>;
      }> = [];

      for (const task of execTasks) {
        if (task.skipped) continue;

        const { execResult, wtPath } = await task.promise!;

        if (execResult.exitCode !== 0) {
          const reason: string = execResult.timedOut
            ? 'timeout'
            : `exit code ${execResult.exitCode}`;
          log(`Phase ${task.phaseNum}: execute FAILED (${reason})`);
          writeStatusMarker(cwd, task.phaseNum, 'execute', 'failed');
          results.push({ phase: task.phaseNum, step: 'execute', status: 'failed', reason });
          stoppedAt = `Phase ${task.phaseNum} execute failed: ${reason}`;
          // Clean up worktree on failure
          execGit(cwd, ['worktree', 'remove', wtPath, '--force'], { allowBlocked: true });
          execGit(cwd, ['worktree', 'prune']);
          continue;
        }

        log(`Phase ${task.phaseNum}: execute completed`);
        writeStatusMarker(cwd, task.phaseNum, 'execute', 'completed');
        results.push({ phase: task.phaseNum, step: 'execute', status: 'completed' });

        // Launch post-phase pipeline concurrently (Steps 1-3 run in parallel across
        // phases; Step 4 rebase+merge is serialized via the shared mergeQueue).
        if (!skipPostPipeline) {
          const phaseNumCapture = task.phaseNum;
          const wtPathCapture = wtPath;
          log(`Phase ${phaseNumCapture}: starting post-phase pipeline`);
          writeStatusMarker(cwd, phaseNumCapture, 'post-pipeline', 'started');

          const pipelinePromise = runPostPhasePipeline(
            cwd,
            phaseNumCapture,
            wtPathCapture,
            { timeout, maxTurns, model, scheduler, log, mergeQueue }
          ).then((result) => ({ phaseNum: phaseNumCapture, result }));

          pipelineTasks.push({ phaseNum: phaseNumCapture, wtPath: wtPathCapture, promise: pipelinePromise });
        } else {
          // No pipeline — clean up worktree immediately
          execGit(cwd, ['worktree', 'remove', wtPath, '--force'], { allowBlocked: true });
          execGit(cwd, ['worktree', 'prune']);
        }
      }

      // Await all concurrent post-phase pipelines
      if (pipelineTasks.length > 0) {
        const pipelineResults = await Promise.all(pipelineTasks.map((t) => t.promise));

        for (const { phaseNum: pNum, result: pipelineResult } of pipelineResults) {
          const taskEntry = pipelineTasks.find((t) => t.phaseNum === pNum)!;

          if (pipelineResult.status === 'failed') {
            log(
              `Phase ${pNum}: post-pipeline FAILED at ${pipelineResult.failedStep}: ${pipelineResult.reason}`
            );
            writeStatusMarker(cwd, pNum, 'post-pipeline', 'failed');
            results.push({
              phase: pNum,
              step: 'post-pipeline',
              status: 'failed',
              reason: `${pipelineResult.failedStep}: ${pipelineResult.reason}`,
            });
            if (!stoppedAt) {
              stoppedAt = `Phase ${pNum} post-pipeline failed at ${pipelineResult.failedStep}`;
            }
          } else {
            log(`Phase ${pNum}: post-pipeline completed`);
            writeStatusMarker(cwd, pNum, 'post-pipeline', 'completed');
            results.push({ phase: pNum, step: 'post-pipeline', status: 'completed' });
          }

          // Clean up worktree after pipeline completes (success or failure)
          execGit(cwd, ['worktree', 'remove', taskEntry.wtPath, '--force'], { allowBlocked: true });
          execGit(cwd, ['worktree', 'prune']);
        }
      }

      if (stoppedAt) break;

      // Count phases where execution didn't fail
      for (const phaseNum of wave) {
        const hasFailed: boolean = results.some(
          (r) => r.phase === phaseNum && r.status === 'failed'
        );
        if (!hasFailed) phasesCompleted++;
      }
    }
  }

  // ── Milestone mode: run wireup after all phases complete ──
  const isMilestoneMode: boolean = options.milestone === true || (!phaseFrom && !phaseTo);
  if (isMilestoneMode && !stoppedAt && !dryRun && phasesCompleted === phasesAttempted && phasesCompleted > 0) {
    log('Milestone mode: all phases complete — running wireup');
    const wireupResult: SpawnResult = scheduler
      ? toSpawnResult(
          await scheduler.spawn(buildWireupPrompt(), {
            timeout: timeoutMs,
            maxTurns,
            model,
            cwd,
            workItemId: 'milestone-wireup',
          })
        )
      : await spawnClaudeAsync(cwd, buildWireupPrompt(), {
          timeout: timeoutMs,
          maxTurns,
          model,
        });

    if (wireupResult.exitCode !== 0) {
      const reason: string = wireupResult.timedOut ? 'timeout' : `exit code ${wireupResult.exitCode}`;
      log(`Wireup FAILED (${reason})`);
      results.push({ phase: 'wireup', step: 'wireup', status: 'failed', reason });
    } else {
      log('Wireup completed');
      results.push({ phase: 'wireup', step: 'wireup', status: 'completed' });
    }
  }

  log(
    `Done: ${phasesCompleted}/${phasesAttempted} phases completed${stoppedAt ? ` (stopped: ${stoppedAt})` : ''}`
  );

  if (scheduler) {
    scheduler.persistState(path.join(cwd, '.planning'));
  }

  return {
    phases_attempted: phasesAttempted,
    phases_completed: phasesCompleted,
    stopped_at: stoppedAt,
    waves,
    results,
  };
}

// ─── Multi-Milestone Orchestration ───────────────────────────────────────────

/**
 * Run the multi-milestone autopilot loop.
 * Orchestrates across milestone boundaries: completes current milestone phases,
 * detects milestone completion, resolves the next milestone, creates it, and continues.
 *
 * Safety: maxMilestones cap (default 10) prevents infinite loops.
 *
 * @param cwd - Absolute path to the project root directory
 * @param options - Configuration options including maxMilestones cap, dryRun flag, resume flag, timeout, maxTurns, model, skipPlan, and skipExecute
 * @returns Aggregate result with milestone and phase counts, per-milestone results, and the stop reason if any
 */
async function runMultiMilestoneAutopilot(
  cwd: string,
  options: MultiMilestoneOptions = {}
): Promise<MultiMilestoneResult> {
  const maxMilestones: number = options.maxMilestones ?? 10;
  const dryRun: boolean = options.dryRun ?? false;
  const timeoutMs: number | undefined = options.timeout ? options.timeout * 60 * 1000 : undefined;

  // Set up logging (reuse existing autopilot log pattern)
  const logFile: string = path.join(cwd, '.planning', 'autopilot', 'autopilot.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log: (msg: string) => void = (msg: string): void => {
    const line: string = `[${new Date().toISOString()}] [multi-milestone] ${msg}\n`;
    process.stderr.write(`[multi-milestone] ${msg}\n`);
    fs.appendFileSync(logFile, line);
  };

  // Initialize result tracking
  const milestoneResults: MilestoneStepResult[] = [];
  let milestonesAttempted: number = 0;
  let milestonesCompleted: number = 0;
  let totalPhasesAttempted: number = 0;
  let totalPhasesCompleted: number = 0;
  let stoppedAt: string | null = null;

  log(`Starting multi-milestone autopilot (max: ${maxMilestones}, dryRun: ${dryRun})`);

  const mmConfig: GrdConfig = loadConfig(cwd);
  const mmBackend: string = detectBackend(cwd);
  const mmScheduler = createScheduler(mmConfig.scheduler, mmConfig.superpowers);
  if (mmScheduler) {
    mmScheduler.loadPersistedState(path.join(cwd, '.planning'));
  }

  for (let i = 0; i < maxMilestones; i++) {
    if (stoppedAt) break;

    // Get current milestone info (re-read each iteration for fresh state)
    const milestoneInfo: MilestoneInfo = getMilestoneInfo(cwd);
    const currentVersion: string = milestoneInfo.version;

    log(`Milestone ${i + 1}/${maxMilestones}: ${currentVersion} (${milestoneInfo.name})`);
    milestonesAttempted++;

    // Check for incomplete phases in current milestone
    const { phases, error: rangeError } = resolvePhaseRange(cwd, null, null);

    if (rangeError) {
      log(`Error resolving phases: ${rangeError}`);
      milestoneResults.push({
        milestone: currentVersion,
        phases_attempted: 0,
        phases_completed: 0,
        status: 'failed',
        reason: rangeError,
      });
      stoppedAt = `Failed to resolve phases for ${currentVersion}: ${rangeError}`;
      break;
    }

    const incompletePhases = phases.filter((p) => p.disk_status !== 'complete');

    if (incompletePhases.length > 0) {
      log(
        `${currentVersion}: ${incompletePhases.length} incomplete phase(s), running autopilot...`
      );

      if (dryRun) {
        milestoneResults.push({
          milestone: currentVersion,
          phases_attempted: incompletePhases.length,
          phases_completed: 0,
          status: 'dry-run',
          reason: `Would process ${incompletePhases.length} incomplete phase(s)`,
        });
        totalPhasesAttempted += incompletePhases.length;
      } else {
        // Run single-milestone autopilot for current milestone's phases
        const autopilotResult: AutopilotResult = await runAutopilot(cwd, {
          skipPlan: options.skipPlan,
          skipExecute: options.skipExecute,
          skipPostPipeline: options.skipPostPipeline,
          timeout: options.timeout,
          maxTurns: options.maxTurns,
          model: options.model,
        });

        totalPhasesAttempted += autopilotResult.phases_attempted;
        totalPhasesCompleted += autopilotResult.phases_completed;

        const autopilotFailed: boolean = autopilotResult.stopped_at !== null;
        milestoneResults.push({
          milestone: currentVersion,
          phases_attempted: autopilotResult.phases_attempted,
          phases_completed: autopilotResult.phases_completed,
          status: autopilotFailed ? 'failed' : 'completed',
          reason: autopilotResult.stopped_at || undefined,
        });

        if (autopilotFailed) {
          log(`${currentVersion}: autopilot stopped: ${autopilotResult.stopped_at}`);
          stoppedAt = `Autopilot failed for ${currentVersion}: ${autopilotResult.stopped_at}`;
          break;
        }
      }
    } else {
      log(`${currentVersion}: all phases already complete`);
      milestoneResults.push({
        milestone: currentVersion,
        phases_attempted: 0,
        phases_completed: 0,
        status: 'skipped',
        reason: 'all phases already complete',
      });
    }

    // Check milestone completion after autopilot run
    if (isMilestoneComplete(cwd)) {
      log(`${currentVersion}: milestone complete`);

      if (!dryRun) {
        // Complete the milestone via deterministic grd-tools command
        const completePrompt: string = buildMilestoneCompletePrompt(currentVersion);
        log(`${currentVersion}: completing milestone...`);

        const completeResult: SpawnResult = mmScheduler
          ? toSpawnResult(
              await mmScheduler.spawn(completePrompt, {
                timeout: timeoutMs,
                maxTurns: options.maxTurns,
                model: options.model,
                cwd,
                workItemId: `milestone-${currentVersion}-complete`,
              })
            )
          : spawnClaude(cwd, completePrompt, {
              timeout: timeoutMs,
              maxTurns: options.maxTurns,
              model: options.model,
            });

        if (completeResult.exitCode !== 0) {
          const reason: string = completeResult.timedOut
            ? 'timeout'
            : `exit code ${completeResult.exitCode}`;
          log(`${currentVersion}: milestone complete FAILED (${reason})`);
          stoppedAt = `Failed to complete milestone ${currentVersion}: ${reason}`;
          break;
        }

        log(`${currentVersion}: milestone completed successfully`);
      } else {
        log(`${currentVersion}: [dry-run] would complete milestone`);
      }

      milestonesCompleted++;
    } else {
      log(`${currentVersion}: milestone not fully complete yet`);
      stoppedAt = `Milestone ${currentVersion} is not fully complete after autopilot run`;
      break;
    }

    // Resolve next milestone
    const nextMs = resolveNextMilestone(cwd);
    if (!nextMs) {
      log('No next milestone found in LONG-TERM-ROADMAP.md — stopping');
      stoppedAt = null; // Graceful completion, not an error
      break;
    }

    log(`Next milestone: ${nextMs.version} (${nextMs.name})`);

    if (dryRun) {
      log(`[dry-run] Would create new milestone: ${nextMs.version}`);
      continue;
    }

    // Spawn new milestone creation via claude -p
    const newMilestonePrompt: string = buildNewMilestonePrompt(mmBackend);
    log('Creating new milestone...');

    const createResult: SpawnResult = mmScheduler
      ? toSpawnResult(
          await mmScheduler.spawn(newMilestonePrompt, {
            timeout: timeoutMs,
            maxTurns: options.maxTurns,
            model: options.model,
            cwd,
            workItemId: 'new-milestone',
          })
        )
      : spawnClaude(cwd, newMilestonePrompt, {
          timeout: timeoutMs,
          maxTurns: options.maxTurns,
          model: options.model,
        });

    if (createResult.exitCode !== 0) {
      const reason: string = createResult.timedOut
        ? 'timeout'
        : `exit code ${createResult.exitCode}`;
      log(`New milestone creation FAILED (${reason})`);
      stoppedAt = `Failed to create new milestone: ${reason}`;
      break;
    }

    log('New milestone created, continuing loop...');
  }

  if (!stoppedAt && milestonesAttempted >= maxMilestones) {
    stoppedAt = `Reached maxMilestones cap (${maxMilestones})`;
    log(stoppedAt);
  }

  log(
    `Multi-milestone autopilot done: ${milestonesCompleted}/${milestonesAttempted} milestones completed` +
      (stoppedAt ? ` (stopped: ${stoppedAt})` : '')
  );

  if (mmScheduler) {
    mmScheduler.persistState(path.join(cwd, '.planning'));
  }

  return {
    milestones_attempted: milestonesAttempted,
    milestones_completed: milestonesCompleted,
    milestone_results: milestoneResults,
    stopped_at: stoppedAt,
    total_phases_attempted: totalPhasesAttempted,
    total_phases_completed: totalPhasesCompleted,
  };
}

// ─── CLI Entry Points ───────────────────────────────────────────────────────

/**
 * Parse CLI flags and run the autopilot loop.
 */
async function cmdAutopilot(cwd: string, args: string[], raw: boolean): Promise<void> {
  const flag = (name: string, fallback: string | null): string | null => {
    const i: number = args.indexOf(name);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const hasFlag = (name: string): boolean => args.indexOf(name) !== -1;

  const options: AutopilotOptions = {
    phaseFrom: flag('--phase-from', null),
    phaseTo: flag('--phase-to', null),
    milestone: hasFlag('--milestone'),
    dryRun: hasFlag('--dry-run'),
    skipPlan: hasFlag('--skip-plan'),
    skipExecute: hasFlag('--skip-execute'),
    skipPostPipeline: hasFlag('--skip-post-pipeline'),
    timeout: hasFlag('--timeout') ? parseInt(flag('--timeout', '0')!, 10) : undefined,
    maxTurns: flag('--max-turns', null) ? parseInt(flag('--max-turns', '0')!, 10) : undefined,
    model: flag('--model', undefined as unknown as null) ?? undefined,
  };

  const result: AutopilotResult = await runAutopilot(cwd, options);
  const rawSummary: string | undefined = raw
    ? `Autopilot: ${result.phases_completed}/${result.phases_attempted} phases completed${result.stopped_at ? ` (stopped: ${result.stopped_at})` : ''}`
    : undefined;
  output(result, raw, rawSummary);
}

/**
 * Pre-flight context for autopilot initialization.
 */
function cmdInitAutopilot(cwd: string, raw: boolean): void {
  const config: GrdConfig = loadConfig(cwd);
  const analysis = analyzeRoadmap(cwd);

  // Check if claude CLI is available
  let claudeAvailable: boolean = false;
  try {
    const check = childProcess.spawnSync('claude', ['--version'], {
      stdio: 'pipe',
      timeout: config.timeouts.autopilot_check_ms,
    });
    claudeAvailable = check.status === 0;
  } catch {
    // claude CLI not found -- claudeAvailable stays false
  }

  const phases = analysis.phases || [];
  const incomplete = phases.filter(
    (p) => (p as { disk_status?: string }).disk_status !== 'complete' && !p.roadmap_complete
  );

  const backend = detectBackend(cwd);
  const caps = getBackendCapabilities(backend);

  const result = {
    claude_available: claudeAvailable,
    cron_available: caps.cron === true,
    total_phases: phases.length,
    incomplete_phases: incomplete.length,
    phase_range: {
      first: phases.length > 0 ? phases[0].number : null,
      last: phases.length > 0 ? phases[phases.length - 1].number : null,
      first_incomplete: incomplete.length > 0 ? incomplete[0].number : null,
    },
    config: {
      model_profile: config.model_profile,
      autonomous_mode: config.autonomous_mode,
    },
    phases: phases.map((p) => ({
      number: p.number,
      name: p.name,
      disk_status: (p as { disk_status?: string }).disk_status || 'unknown',
      roadmap_complete: p.roadmap_complete || false,
    })),
  };

  output(result, raw, raw ? JSON.stringify(result) : undefined);
}

// ─── Heartbeat ──────────────────────────────────────────────────────────────

/**
 * Start a periodic heartbeat that writes a message to stderr at each interval.
 * Useful for keeping long-running autopilot sessions visible in logs.
 */
function startHeartbeat(message: string): ReturnType<typeof setInterval> {
  return setInterval(() => {
    process.stderr.write(`${message}\n`);
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Parse CLI flags and run the multi-milestone autopilot loop.
 */
async function cmdMultiMilestoneAutopilot(
  cwd: string,
  args: string[],
  raw: boolean
): Promise<void> {
  const flag = (name: string, fallback: string | null): string | null => {
    const i: number = args.indexOf(name);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const hasFlag = (name: string): boolean => args.indexOf(name) !== -1;

  const options: MultiMilestoneOptions = {
    maxMilestones: hasFlag('--max-milestones')
      ? parseInt(flag('--max-milestones', '10')!, 10)
      : undefined,
    dryRun: hasFlag('--dry-run'),
    timeout: hasFlag('--timeout') ? parseInt(flag('--timeout', '0')!, 10) : undefined,
    maxTurns: flag('--max-turns', null) ? parseInt(flag('--max-turns', '0')!, 10) : undefined,
    model: flag('--model', undefined as unknown as null) ?? undefined,
    skipPlan: hasFlag('--skip-plan'),
    skipExecute: hasFlag('--skip-execute'),
    skipPostPipeline: hasFlag('--skip-post-pipeline'),
  };

  const result: MultiMilestoneResult = await runMultiMilestoneAutopilot(cwd, options);
  const rawSummary: string | undefined = raw
    ? `Multi-milestone autopilot: ${result.milestones_completed}/${result.milestones_attempted} milestones completed (${result.total_phases_completed}/${result.total_phases_attempted} phases)${result.stopped_at ? ` (stopped: ${result.stopped_at})` : ''}`
    : undefined;
  output(result, raw, rawSummary);
}

/**
 * Pre-flight context for multi-milestone autopilot initialization.
 * Returns LT roadmap state, current milestone info, and next milestone resolution.
 */
function cmdInitMultiMilestoneAutopilot(cwd: string, raw: boolean): void {
  const config: GrdConfig = loadConfig(cwd);
  const analysis = analyzeRoadmap(cwd);

  // Check if claude CLI is available
  let claudeAvailable: boolean = false;
  try {
    const check = childProcess.spawnSync('claude', ['--version'], {
      stdio: 'pipe',
      timeout: config.timeouts.autopilot_check_ms,
    });
    claudeAvailable = check.status === 0;
  } catch {
    // claude CLI not found -- claudeAvailable stays false
  }

  // Current milestone info
  const milestoneInfo: MilestoneInfo = getMilestoneInfo(cwd);

  // Current milestone completion state
  const milestoneComplete: boolean = isMilestoneComplete(cwd);

  // Next milestone from LT roadmap
  const nextMilestone = resolveNextMilestone(cwd);

  // LT roadmap existence and state
  const ltRoadmapPath: string = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
  const ltRoadmapExists: boolean = fs.existsSync(ltRoadmapPath);
  let ltMilestoneCount: number = 0;
  if (ltRoadmapExists) {
    const ltContent: string = fs.readFileSync(ltRoadmapPath, 'utf-8');
    const parsed = parseLongTermRoadmap(ltContent);
    if (parsed) {
      ltMilestoneCount = parsed.milestones.length;
    }
  }

  const phases = analysis.phases || [];
  const incomplete = phases.filter(
    (p) => (p as { disk_status?: string }).disk_status !== 'complete' && !p.roadmap_complete
  );

  const result = {
    claude_available: claudeAvailable,
    current_milestone: {
      version: milestoneInfo.version,
      name: milestoneInfo.name,
      is_complete: milestoneComplete,
      total_phases: phases.length,
      incomplete_phases: incomplete.length,
    },
    lt_roadmap: {
      exists: ltRoadmapExists,
      milestone_count: ltMilestoneCount,
    },
    next_milestone: nextMilestone,
    config: {
      model_profile: config.model_profile,
      autonomous_mode: config.autonomous_mode,
    },
  };

  output(result, raw, raw ? JSON.stringify(result) : undefined);
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  createMergeQueue,
  cmdAutopilot,
  cmdInitAutopilot,
  cmdMultiMilestoneAutopilot,
  cmdInitMultiMilestoneAutopilot,
  runAutopilot,
  runMultiMilestoneAutopilot,
  resolvePhaseRange,
  isPhasePlanned,
  isPhaseExecuted,
  isMilestoneComplete,
  resolveNextMilestone,
  buildNewMilestonePrompt,
  buildMilestoneCompletePrompt,
  spawnClaude,
  spawnClaudeAsync,
  buildPlanPrompt,
  buildExecutePrompt,
  buildSimplifyPrompt,
  buildCodeReviewPrompt,
  buildConflictResolvePrompt,
  buildWireupPrompt,
  runPostPhasePipeline,
  buildWaves,
  writeStatusMarker,
  updateStateProgress,
  DEFAULT_TIMEOUT_MINUTES,
  HEARTBEAT_INTERVAL_MS,
  startHeartbeat,
  _getSchedulerStates,
};
