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
  CritiqueBranch,
  RefinementMetrics,
  MetricSnapshot,
  MinimaRegion,
  ConvergenceConfig,
  PlanArtifact,
  ArtifactDAG,
  ArtifactDAGValidation,
  PhaseCompleteResult,
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
  buildArtifactDAG,
  validateArtifactDAG,
}: {
  buildDependencyGraph: (
    phases: Array<{ number: string; name: string; depends_on?: string | null }>
  ) => DependencyGraph;
  computeParallelGroups: (graph: DependencyGraph) => string[][];
  buildArtifactDAG: (plans: PlanArtifact[]) => ArtifactDAG;
  validateArtifactDAG: (dag: ArtifactDAG, plans: PlanArtifact[]) => ArtifactDAGValidation;
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
const {
  collectMetrics: _collectMetrics,
  checkConvergence: _checkConvergence,
  classifyBranch: _classifyBranch,
  detectMinima: _detectMinima,
  buildCritiquePrompt: _buildCritiquePromptFn,
}: {
  collectMetrics: (testOutput: string, tscOutput: string, lintOutput: string) => RefinementMetrics;
  checkConvergence: (snapshots: MetricSnapshot[], config: ConvergenceConfig) => { converged: boolean; reason: string };
  classifyBranch: (current: RefinementMetrics, targets: RefinementMetrics) => CritiqueBranch;
  detectMinima: (snapshots: MetricSnapshot[]) => MinimaRegion[];
  buildCritiquePrompt: (branch: CritiqueBranch, metrics: RefinementMetrics, targets: RefinementMetrics, minimaRegions: MinimaRegion[]) => string;
} = require('./refinement');
const {
  buildKnowledgeInjectionBlock,
}: {
  buildKnowledgeInjectionBlock: (cwd: string, phaseNum: string, moduleHints?: string[]) => string;
} = require('./knowledge');
const { completePhaseAfterPostPipeline } = require('./phase-complete') as {
  completePhaseAfterPostPipeline: (
    cwd: string,
    phaseNum: string,
  ) => PhaseCompleteResult | null;
};

// ─── Default Constants ──────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MINUTES: number = 120;
const HEARTBEAT_INTERVAL_MS: number = 30000;
const AUTOPILOT_DIR: string = 'autopilot';

// ─── Atomic File I/O ─────────────────────────────────────────────────────────

/**
 * Write a file atomically using write-to-temp-then-rename.
 * Prevents partial reads under concurrent access (POSIX rename is atomic).
 */
function atomicWriteFileSync(filePath: string, data: string): void {
  const tmpPath: string = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, filePath);
}

// ─── Merge Queue ────────────────────────────────────────────────────────────

interface MergeQueue {
  enqueue<T>(fn: () => Promise<T>): Promise<T>;
}

function createMergeQueue(): MergeQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    enqueue<T>(fn: () => Promise<T>): Promise<T> {
      const result = tail.then(() => fn());
      tail = result.then(
        () => undefined,
        () => undefined
      );
      return result;
    },
  };
}

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
function buildPlanPrompt(phaseNum: string, backend?: string, cwd?: string): string {
  const basePrompt = `Use the Skill tool to invoke skill "grd:plan-phase" with args "${phaseNum}" (i.e. plan-phase ${phaseNum}). Autonomous mode — make all decisions yourself, no questions. Complete all planning steps and write the PLAN.md files. Ensure each PLAN.md includes a \`files_modified:\` field in its YAML frontmatter listing the lib/ modules and other files the plan expects to modify. Each PLAN.md MUST also include \`provides: []\`, \`requires: []\`, and \`integration_points: []\` in YAML frontmatter. \`provides\` lists artifact identifiers this plan creates (format: "module:ExportName", e.g., "lib/deps.ts:buildArtifactDAG"). \`requires\` lists artifacts from other plans that must exist before this plan executes. \`integration_points\` lists artifacts this plan connects to but does not strictly depend on.`;
  const knowhowBlock = cwd ? buildKnowledgeInjectionBlock(cwd, phaseNum) : '';
  return withUltrathink(knowhowBlock ? `${knowhowBlock}\n\n${basePrompt}` : basePrompt, backend);
}

/**
 * Build the prompt for executing a phase via `claude -p`.
 */
function buildExecutePrompt(phaseNum: string, cwd?: string): string {
  const basePrompt = `Use the Skill tool to invoke skill "grd:execute-phase" with args "${phaseNum}" (i.e. execute-phase ${phaseNum}). Autonomous mode — make all decisions yourself, no questions. After execution, merge locally. Do not push.`;
  const knowhowBlock = cwd ? buildKnowledgeInjectionBlock(cwd, phaseNum) : '';
  return knowhowBlock ? `${knowhowBlock}\n\n${basePrompt}` : basePrompt;
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
      { captureOutput: true }
    );
    writeStatusMarker(cwd, phaseNum, 'knowledge-mining', 'completed');
    log(`Phase ${phaseNum}: knowledge mining completed`);
  } catch (_err) {
    log(`Phase ${phaseNum}: knowledge mining failed (non-blocking): ${String(_err)}`);
    writeStatusMarker(cwd, phaseNum, 'knowledge-mining', 'failed');
  }
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
      const critiquePrompt = buildCritiqueAgentPrompt(phaseNum, branch, currentMetrics, targets, minimaRegions);
      await spawnStep(
        critiquePrompt,
        cwd,
        `phase-${phaseNum}-critique-${iteration}`,
        scheduler ?? null,
        { captureOutput: true }
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
 * Parse the `files_modified` field from PLAN.md frontmatter content.
 * Supports two YAML formats:
 *   - Dash-list: `files_modified:\n  - lib/foo.ts\n  - lib/bar.ts`
 *   - Inline array: `files_modified: [lib/foo.ts, lib/bar.ts]`
 *
 * @param frontmatterContent - Raw string between the `---` markers of a PLAN.md
 * @returns Array of file path strings declared as write targets, or [] if not present
 */
function parseWriteIntent(frontmatterContent: string): string[] {
  if (!frontmatterContent || frontmatterContent.trim() === '') return [];

  // Try inline array format: files_modified: [lib/foo.ts, lib/bar.ts]
  const inlineMatch = frontmatterContent.match(/^files_modified:\s*\[([^\]]*)\]\s*$/m);
  if (inlineMatch) {
    const inner = inlineMatch[1].trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  // Try dash-list format: capture indented lines until a non-indented line or end of string
  const fmLines = frontmatterContent.split('\n');
  const startIdx = fmLines.findIndex((l: string) => /^files_modified:\s*$/.test(l));
  if (startIdx >= 0) {
    const items: string[] = [];
    for (let i = startIdx + 1; i < fmLines.length; i++) {
      const line = fmLines[i];
      if (/^\S/.test(line)) break; // next field
      const dashMatch = line.match(/^[ \t]+-[ \t]+(.+)$/);
      if (dashMatch) {
        const val = dashMatch[1].trim();
        if (val) items.push(val);
      }
    }
    return items;
  }

  return [];
}

/**
 * Comparison result from `compareWriteIntent()`.
 */
interface WriteIntentComparison {
  unexpected: string[];  // Files modified but not declared
  untouched: string[];   // Files declared but not modified
  matches: string[];     // Files both declared and modified
}

/**
 * Compare declared write-intent files against actually-modified files.
 * Pure function — no side effects.
 *
 * @param declared - File paths listed in `files_modified` frontmatter
 * @param actual   - File paths from `git diff --name-only`
 * @returns Categorized comparison result
 */
function compareWriteIntent(
  declared: string[],
  actual: string[]
): WriteIntentComparison {
  const declaredSet = new Set(declared);
  const actualSet = new Set(actual);

  const matches = declared.filter(f => actualSet.has(f));
  const untouched = declared.filter(f => !actualSet.has(f));
  const unexpected = actual.filter(f => !declaredSet.has(f));

  return { unexpected, untouched, matches };
}

/**
 * Format write-intent comparison results as log lines with `[WRITE-INTENT-MISMATCH]` prefix.
 * Returns empty array when no mismatches.
 *
 * @param planId     - The plan identifier (e.g. "89-03")
 * @param comparison - Result from `compareWriteIntent()`
 * @returns Array of formatted log lines
 */
function formatWriteIntentMismatch(
  planId: string,
  comparison: WriteIntentComparison
): string[] {
  const lines: string[] = [];
  for (const f of comparison.unexpected) {
    lines.push(`[WRITE-INTENT-MISMATCH] Plan ${planId}: unexpected file modified: ${f}`);
  }
  for (const f of comparison.untouched) {
    lines.push(`[WRITE-INTENT-MISMATCH] Plan ${planId}: declared file not modified: ${f}`);
  }
  return lines;
}

/**
 * Options for buildWaves() — controls write-intent conflict detection.
 */
interface BuildWavesOptions {
  /** Map of phaseNumber -> files_modified list, used for conflict detection. */
  filesModified?: Record<string, string[]>;
  /** When true, skip conflict detection entirely (--force-parallel). */
  forceParallel?: boolean;
}

/**
 * Group phases into dependency waves using Kahn's algorithm.
 * Phases with no dependencies land in wave 0; phases depending on wave-0
 * phases land in wave 1, etc.
 *
 * When `options.filesModified` is provided and `options.forceParallel` is not
 * true, a post-processing step separates phases that share modified files into
 * different waves (write-intent conflict detection).
 */
function buildWaves(
  phases: Array<{ number: string; name: string; depends_on?: string | null }>,
  options?: BuildWavesOptions
): string[][] {
  const graph: DependencyGraph = buildDependencyGraph(phases);
  const initialWaves: string[][] = computeParallelGroups(graph);

  if (!options?.filesModified || options?.forceParallel) {
    return initialWaves;
  }

  // Post-process waves to separate phases with overlapping files_modified.
  // We process the initial waves in order and keep splitting any wave that
  // contains two phases sharing at least one file — producing extra waves as
  // needed. The outer loop repeats until a full pass produces no splits.
  const filesModified = options.filesModified;

  /**
   * Split a single wave into one or more sub-waves such that no two phases in
   * the same sub-wave declare the same modified file.
   */
  function splitWave(wave: string[]): string[][] {
    const subWaves: string[][] = [];
    const subWaveFiles: Set<string>[] = [];

    for (const phaseId of wave) {
      const files = filesModified[phaseId] || [];
      // Find the first existing sub-wave that has no file conflict.
      let placed = false;
      for (let i = 0; i < subWaves.length; i++) {
        const hasConflict = files.some((f: string) => subWaveFiles[i].has(f));
        if (!hasConflict) {
          subWaves[i].push(phaseId);
          files.forEach((f: string) => subWaveFiles[i].add(f));
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Open a new sub-wave for this phase.
        subWaves.push([phaseId]);
        subWaveFiles.push(new Set<string>(files));
      }
    }

    return subWaves;
  }

  // Apply splitWave to every initial wave and flatten the results into the
  // final wave list, preserving the overall wave order.
  const result: string[][] = [];
  for (const wave of initialWaves) {
    const subWaves = splitWave(wave);
    for (const sw of subWaves) {
      result.push(sw);
    }
  }

  return result;
}

// ─── buildWavesFromPlans ──────────────────────────────────────────────────────

/**
 * Group phases into dependency waves, refined by artifact-level dependency information.
 *
 * Extends `buildWaves` with fine-grained artifact DAG constraints:
 * 1. Computes baseline waves using `buildWaves(phases)`.
 * 2. If plans have no provides/requires declarations, returns baseline unchanged.
 * 3. Builds an ArtifactDAG from plans and validates it for cycles.
 * 4. If the DAG is invalid (cycles detected), logs a warning and returns baseline.
 * 5. For each baseline wave, checks if any two plans have artifact-level dependencies
 *    (one requires what the other provides) — if so, splits them into separate sub-waves.
 *
 * @param plans - Array of plan artifacts parsed from PLAN.md frontmatter
 * @param phases - Phase objects from roadmap analysis (for buildWaves baseline)
 * @returns Refined wave grouping respecting both phase-level and artifact-level deps
 */
function buildWavesFromPlans(
  plans: PlanArtifact[],
  phases: Array<{ number: string; name: string; depends_on?: string | null }>
): string[][] {
  // Step 1: baseline from phase-level depends_on
  const baseline = buildWaves(phases);

  // Step 2: no artifact declarations — return baseline unchanged
  const hasArtifacts = plans.some((p) => p.provides.length > 0 || p.requires.length > 0);
  if (plans.length === 0 || !hasArtifacts) {
    return baseline;
  }

  // Step 3: build artifact DAG
  const dag = buildArtifactDAG(plans);

  // Step 4: validate — if cycles present, warn and return baseline
  const validation = validateArtifactDAG(dag, plans);
  if (!validation.valid) {
    process.stderr.write(
      `[buildWavesFromPlans] WARNING: Artifact DAG has cycles — falling back to baseline waves.\n`
    );
    return baseline;
  }

  // Step 5: for each baseline wave, split plans that have artifact-level deps on each other
  // Build a quick lookup: planId → set of artifacts it provides
  const planProvides = new Map<string, Set<string>>();
  for (const plan of plans) {
    const planId = `${plan.phase}-${String(plan.plan).padStart(2, '0')}`;
    planProvides.set(planId, new Set<string>(plan.provides));
  }

  // Build lookup: planId → set of artifacts it requires
  const planRequires = new Map<string, Set<string>>();
  for (const plan of plans) {
    const planId = `${plan.phase}-${String(plan.plan).padStart(2, '0')}`;
    planRequires.set(planId, new Set<string>(plan.requires));
  }

  /**
   * Check whether planA artifact-depends on planB
   * (planA requires something planB provides, or vice versa).
   */
  function hasArtifactDep(planA: string, planB: string): boolean {
    const aRequires = planRequires.get(planA) ?? new Set<string>();
    const bProvides = planProvides.get(planB) ?? new Set<string>();
    const bRequires = planRequires.get(planB) ?? new Set<string>();
    const aProvides = planProvides.get(planA) ?? new Set<string>();

    for (const req of aRequires) {
      if (bProvides.has(req)) return true;
    }
    for (const req of bRequires) {
      if (aProvides.has(req)) return true;
    }
    return false;
  }

  /**
   * Split a single wave into sub-waves so that no two plans in the same sub-wave
   * have artifact-level dependencies on each other.
   */
  function splitWaveByArtifacts(wave: string[]): string[][] {
    const subWaves: string[][] = [];

    for (const planId of wave) {
      let placed = false;
      for (const subWave of subWaves) {
        const conflict = subWave.some((existing) => hasArtifactDep(planId, existing));
        if (!conflict) {
          subWave.push(planId);
          placed = true;
          break;
        }
      }
      if (!placed) {
        subWaves.push([planId]);
      }
    }

    return subWaves;
  }

  const refined: string[][] = [];
  for (const wave of baseline) {
    const subWaves = splitWaveByArtifacts(wave);
    for (const sw of subWaves) {
      refined.push(sw);
    }
  }

  return refined;
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

    atomicWriteFileSync(statePath, content);
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
            prompt: buildPlanPrompt(phaseNum, backend, cwd),
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
              const overlayContent: string = generateOverlay(buildPlanPrompt(phaseNum, backend, cwd), {
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
                .spawn(buildPlanPrompt(phaseNum, backend, cwd), {
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
                  .spawn(buildPlanPrompt(phaseNum, backend, cwd), {
                    timeout: timeoutMs,
                    maxTurns,
                    model,
                    cwd,
                    workItemId: `phase-${phaseNum}-plan`,
                  })
                  .then(toSpawnResult)
              : spawnClaudeAsync(cwd, buildPlanPrompt(phaseNum, backend, cwd), {
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
            prompt: buildExecutePrompt(phaseNum, cwd),
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
                await scheduler.spawn(buildExecutePrompt(phaseNum, wtPath), {
                  timeout: timeoutMs,
                  maxTurns,
                  model,
                  cwd: wtPath,
                  workItemId: `phase-${phaseNum}-execute`,
                })
              )
            : await spawnClaudeAsync(wtPath, buildExecutePrompt(phaseNum, wtPath), {
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

        // Knowledge mining (non-blocking — runKnowledgeMining never rejects)
        await runKnowledgeMining(cwd, task.phaseNum, { scheduler, log });

        // Refinement loop (non-blocking — runRefinementLoop never rejects)
        await runRefinementLoop(cwd, task.phaseNum, { scheduler, log });

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

            // Spec 3: mechanical phase finalization. On a successful post-pipeline,
            // fold in phase complete (ROADMAP + STATE + quality analysis) instead
            // of leaving it for the user to run manually.
            writeStatusMarker(cwd, pNum, 'phase-finalize', 'started');
            const finalizeResult: PhaseCompleteResult | null = completePhaseAfterPostPipeline(
              cwd,
              pNum,
            );
            if (finalizeResult) {
              writeStatusMarker(cwd, pNum, 'phase-finalize', 'completed');
              log(
                `Phase ${pNum}: phase-finalize complete — ${finalizeResult.plans_executed} plans, ${finalizeResult.next_phase ? `next phase ${finalizeResult.next_phase}` : 'milestone complete'}`,
              );
            } else {
              writeStatusMarker(cwd, pNum, 'phase-finalize', 'failed');
              log(
                `Phase ${pNum}: phase-finalize failed — run 'gd phase complete ${pNum}' manually to finalize`,
              );
            }
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
  buildKnowledgeMiningPrompt,
  runKnowledgeMining,
  buildCritiqueAgentPrompt,
  runRefinementLoop,
  runPostPhasePipeline,
  buildWaves,
  buildWavesFromPlans,
  parseWriteIntent,
  compareWriteIntent,
  formatWriteIntentMismatch,
  writeStatusMarker,
  updateStateProgress,
  DEFAULT_TIMEOUT_MINUTES,
  HEARTBEAT_INTERVAL_MS,
  startHeartbeat,
  _getSchedulerStates,
};
