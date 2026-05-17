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
  GrdConfig,
  MilestoneInfo,
  MultiMilestoneOptions,
  MilestoneStepResult,
  MultiMilestoneResult,
  PhaseInfo,
  PlanArtifact,
} from './types';

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process') as typeof import('child_process');
const {
  loadConfig,
  findPhaseInternal,
  output,
  getMilestoneInfo,
  MODEL_PROFILES,
  resolveModelForAgent,
}: {
  loadConfig: (cwd: string) => GrdConfig;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => void;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
  MODEL_PROFILES: Record<string, Record<string, string>>;
  resolveModelForAgent: (
    config: GrdConfig,
    agentType: string,
    cwd?: string,
    options?: { effectiveTierOverride?: import('./types').ModelTier }
  ) => string;
} = require('./utils');
const {
  detectBackend,
  getBackendCapabilities,
  getEffectiveTierForDispatch,
}: {
  detectBackend: (cwd: string) => string;
  getBackendCapabilities: (backend: string) => import('./types').BackendCapabilities;
  getEffectiveTierForDispatch: (opts: {
    agentType: string;
    prompt: string;
    config: GrdConfig;
    scheduler: { getStates(): Map<string, import('./types').BackendUsageState> } | null;
    schedulerConfig?: import('./types').SchedulerConfig;
    superpowersConfig?: import('./types').SuperpowersConfig;
    modelProfiles: Record<string, Record<string, string>>;
  }) => import('./types').ModelTier;
} = require('./backend');
const {
  isOntologyConverged,
}: {
  isOntologyConverged: (
    cwd: string,
    threshold?: number,
    recentK?: number
  ) => { converged: boolean; similarity?: number; threshold: number; reason?: string };
} = require('./drift');
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
}: {
  worktreePath: (cwd: string, milestone: string, phase: string) => string;
  worktreeBranch: (cwd: string, milestone: string, phase: string, slug: string) => string;
  ensureWorktreesDir: (cwd: string) => boolean;
} = require('./worktree');
const {
  execGit,
}: {
  execGit: (
    cwd: string,
    args: string[],
    opts?: { allowBlocked?: boolean }
  ) => import('./types').ExecGitResult;
} = require('./utils');
const {
  buildKnowledgeInjectionBlock,
}: {
  buildKnowledgeInjectionBlock: (cwd: string, phaseNum: string, moduleHints?: string[]) => string;
} = require('./knowledge');
const {
  createMergeQueue,
  parseWriteIntent,
  compareWriteIntent,
  formatWriteIntentMismatch,
  buildWaves,
  buildWavesFromPlans,
} = require('./autopilot-waves') as {
  createMergeQueue: () => { enqueue<T>(fn: () => Promise<T>): Promise<T> };
  parseWriteIntent: (frontmatterContent: string) => string[];
  compareWriteIntent: (
    declared: string[],
    actual: string[]
  ) => { unexpected: string[]; untouched: string[]; matches: string[] };
  formatWriteIntentMismatch: (
    planId: string,
    comparison: { unexpected: string[]; untouched: string[]; matches: string[] }
  ) => string[];
  buildWaves: (
    phases: Array<{ number: string; name: string; depends_on?: string | null }>,
    options?: {
      filesModified?: Record<string, string[]>;
      forceParallel?: boolean;
    }
  ) => string[][];
  buildWavesFromPlans: (
    plans: import('./types').PlanArtifact[],
    phases: Array<{ number: string; name: string; depends_on?: string | null }>
  ) => string[][];
};
const {
  isMilestoneComplete,
  resolveNextMilestone,
  buildNewMilestonePrompt,
  buildMilestoneCompletePrompt,
} = require('./autopilot-milestone') as {
  isMilestoneComplete: (cwd: string) => boolean;
  resolveNextMilestone: (cwd: string) => { version: string; name: string } | null;
  buildNewMilestonePrompt: (backend?: string) => string;
  buildMilestoneCompletePrompt: (version: string) => string;
};
const {
  toSpawnResult,
  spawnClaude,
  spawnClaudeAsync,
  writeStatusMarker,
  updateStateProgress,
  buildSimplifyPrompt,
  buildCodeReviewPrompt,
  buildConflictResolvePrompt,
  buildKnowledgeMiningPrompt,
  buildCritiqueAgentPrompt,
  runKnowledgeMining,
  runRefinementLoop,
  runPostPhasePipeline,
  finalizePhaseAfterPipeline,
} = require('./autopilot-pipeline') as {
  toSpawnResult: (sr: {
    exitCode: number;
    timedOut: boolean;
    stdout?: string;
    stderr?: string;
  }) => { exitCode: number; timedOut: boolean; stdout?: string; stderr?: string };
  spawnClaude: (
    cwd: string,
    prompt: string,
    opts?: {
      timeout?: number;
      maxTurns?: number;
      model?: string;
      outputFormat?: string;
      captureOutput?: boolean;
      captureStderr?: boolean;
      agentType?: string;
    }
  ) => { exitCode: number; timedOut: boolean; stdout?: string; stderr?: string };
  spawnClaudeAsync: (
    cwd: string,
    prompt: string,
    opts?: {
      timeout?: number;
      maxTurns?: number;
      model?: string;
      outputFormat?: string;
      captureOutput?: boolean;
      captureStderr?: boolean;
      agentType?: string;
    }
  ) => Promise<{ exitCode: number; timedOut: boolean; stdout?: string; stderr?: string }>;
  writeStatusMarker: (cwd: string, phaseNum: string, step: string, status: string) => void;
  updateStateProgress: (cwd: string, phaseNum: string, step: string) => void;
  buildSimplifyPrompt: (phaseNum: string) => string;
  buildCodeReviewPrompt: (prUrl: string) => string;
  buildConflictResolvePrompt: (
    phaseNum: string,
    cwd: string,
    wtPath: string
  ) => string;
  buildKnowledgeMiningPrompt: (phaseNum: string) => string;
  buildCritiqueAgentPrompt: (
    phaseNum: string,
    branch: import('./types').CritiqueBranch,
    metrics: import('./types').RefinementMetrics,
    targets: import('./types').RefinementMetrics,
    minimaRegions: import('./types').MinimaRegion[]
  ) => string;
  runKnowledgeMining: (
    cwd: string,
    phaseNum: string,
    options: { scheduler?: import('./scheduler').Scheduler | null; log: (msg: string) => void }
  ) => Promise<void>;
  runRefinementLoop: (
    cwd: string,
    phaseNum: string,
    options: {
      scheduler?: import('./scheduler').Scheduler | null;
      log: (msg: string) => void;
      maxIterations?: number;
      targets?: import('./types').RefinementMetrics;
    }
  ) => Promise<void>;
  runPostPhasePipeline: (
    cwd: string,
    phaseNum: string,
    wtPath: string,
    opts: {
      timeout?: number;
      maxTurns?: number;
      model?: string;
      scheduler?: import('./scheduler').Scheduler | null;
      log: (msg: string) => void;
      mergeQueue?: { enqueue<T>(fn: () => Promise<T>): Promise<T> };
    }
  ) => Promise<{
    status: 'completed' | 'failed';
    failedStep?: string;
    prUrl?: string;
    reason?: string;
  }>;
  finalizePhaseAfterPipeline: (
    cwd: string,
    phaseNum: string,
    scheduler: import('./scheduler').Scheduler | null,
    log: (msg: string) => void
  ) => Promise<import('./types').PhaseCompleteResult | null>;
};

// ─── Default Constants ──────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MINUTES: number = 120;
const HEARTBEAT_INTERVAL_MS: number = 30000;

// ─── Domain Types ───────────────────────────────────────────────────────────

/** Serialized task queue used to enforce sequential merge ordering. */
interface MergeQueue {
  enqueue<T>(fn: () => Promise<T>): Promise<T>;
}

/** Result from subprocess execution (re-exported from autopilot-pipeline). */
type SpawnResult = { exitCode: number; timedOut: boolean; stdout?: string; stderr?: string };

/** Result from a post-phase pipeline run (re-exported from autopilot-pipeline). */
type PostPipelineResult = {
  status: 'completed' | 'failed';
  failedStep?: string;
  prUrl?: string;
  reason?: string;
};

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
  /**
   * Failure reason when autopilot halted before processing all phases.
   * Callers (runMultiMilestoneAutopilot, evolve) treat non-null as failure.
   * Graceful early-stops (e.g. ontology convergence) use `converged_at`
   * instead so they are not misclassified as failures.
   */
  stopped_at: string | null;
  /**
   * Graceful early-termination reason. Null unless an opt-in convergence
   * condition fired (Tier-3 #10). Distinct from `stopped_at` so callers
   * can treat convergence as success.
   */
  converged_at: string | null;
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

/** Wireup discovery after milestone completion. */
function buildWireupPrompt(): string {
  return 'Use the Skill tool to invoke skill "grd:wireup" with no additional args. Autonomous mode — make all decisions yourself, no questions. Run wireup discovery (exported-but-uncalled, config-without-surface, endpoint-without-integration-test) and fix any findings.';
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
      converged_at: null,
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
  // Graceful early termination (Tier-3 #10). Separate from stoppedAt so
  // existing callers (multi-milestone autopilot, evolve) do not classify
  // convergence as a failure. codex r2 P2 on PR #40.
  let convergedAt: string | null = null;

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
    if (stoppedAt || convergedAt) break;

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

          // Compute the plan prompt once so we can pass it to both the adaptive
          // tier helper (for promptLength) and the actual dispatch.
          const planPrompt: string = buildPlanPrompt(phaseNum, backend, cwd);

          // Resolve the effective model for this dispatch. When the caller
          // passed an explicit --model flag we honour it; otherwise the Spec 4
          // chain (complexity → pressure → tier) picks the right model.
          const planTier = getEffectiveTierForDispatch({
            agentType: 'grd-planner',
            prompt: planPrompt,
            config,
            scheduler,
            schedulerConfig: config.scheduler,
            superpowersConfig: config.superpowers,
            modelProfiles: MODEL_PROFILES,
          });
          const planModel: string | undefined = model
            ? model
            : resolveModelForAgent(config, 'grd-planner', cwd, {
                effectiveTierOverride: planTier,
              });

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
              const overlayContent: string = generateOverlay(planPrompt, {
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
                model: planModel || 'default',
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
                .spawn(planPrompt, {
                  timeout: timeoutMs,
                  maxTurns,
                  model: planModel,
                  cwd,
                  workItemId: `phase-${phaseNum}-plan`,
                  agentType: 'grd-planner',
                })
                .then(toSpawnResult);
            }
          } else {
            promise = scheduler
              ? scheduler
                  .spawn(planPrompt, {
                    timeout: timeoutMs,
                    maxTurns,
                    model: planModel,
                    cwd,
                    workItemId: `phase-${phaseNum}-plan`,
                    agentType: 'grd-planner',
                  })
                  .then(toSpawnResult)
              : spawnClaudeAsync(cwd, planPrompt, {
                  timeout: timeoutMs,
                  maxTurns,
                  model: planModel,
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

        // Compute execute prompt once to share between tier computation and dispatch.
        const executePrompt: string = buildExecutePrompt(phaseNum, wtPath);

        // Resolve effective model for execution dispatch via the Spec 4 chain.
        const executeTier = getEffectiveTierForDispatch({
          agentType: 'grd-executor',
          prompt: executePrompt,
          config,
          scheduler,
          schedulerConfig: config.scheduler,
          superpowersConfig: config.superpowers,
          modelProfiles: MODEL_PROFILES,
        });
        const executeModel: string | undefined = model
          ? model
          : resolveModelForAgent(config, 'grd-executor', cwd, {
              effectiveTierOverride: executeTier,
            });

        const promise = (async (): Promise<{ execResult: SpawnResult; wtPath: string }> => {
          const execResult: SpawnResult = scheduler
            ? toSpawnResult(
                await scheduler.spawn(executePrompt, {
                  timeout: timeoutMs,
                  maxTurns,
                  model: executeModel,
                  cwd: wtPath,
                  workItemId: `phase-${phaseNum}-execute`,
                  agentType: 'grd-executor',
                })
              )
            : await spawnClaudeAsync(wtPath, executePrompt, {
                timeout: timeoutMs,
                maxTurns,
                model: executeModel,
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

          const pipelinePromise = runPostPhasePipeline(cwd, phaseNumCapture, wtPathCapture, {
            timeout,
            maxTurns,
            model,
            scheduler,
            log,
            mergeQueue,
          }).then((result) => ({ phaseNum: phaseNumCapture, result }));

          pipelineTasks.push({
            phaseNum: phaseNumCapture,
            wtPath: wtPathCapture,
            promise: pipelinePromise,
          });
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
            const finalizeResult: import('./types').PhaseCompleteResult | null =
              await finalizePhaseAfterPipeline(cwd, pNum, scheduler, log);
            if (finalizeResult) {
              results.push({ phase: pNum, step: 'phase-finalize', status: 'completed' });
            } else {
              results.push({
                phase: pNum,
                step: 'phase-finalize',
                status: 'failed',
                reason: 'phase complete failed — see logs for details',
              });
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

      // Tier-3 #10: ontology-convergence termination. Opt-in via
      // config.autopilot.stop_on_ontology_convergence. Recorded on the
      // separate `convergedAt` channel (codex r2 P2 on PR #40) so callers
      // like runMultiMilestoneAutopilot / evolve do not classify graceful
      // termination as a failure. Guards from codex r1: only fire when
      // there's a NEXT wave to skip, and require non-overlapping windows
      // (handled by isOntologyConverged).
      if (
        config.autopilot?.stop_on_ontology_convergence === true &&
        waveIdx < waves.length - 1
      ) {
        const threshold = config.autopilot.ontology_convergence_threshold ?? 0.95;
        const result = isOntologyConverged(cwd, threshold);
        if (result.converged && result.similarity !== undefined) {
          convergedAt = `ontology-convergence (similarity ${result.similarity.toFixed(3)} >= ${threshold})`;
          log(`Autopilot: converged early — ${convergedAt}`);
        }
      }
    }
  }

  // ── Milestone mode: run wireup after all phases complete ──
  // codex r3 P2: convergence skips later waves intentionally, so the
  // milestone is NOT complete in the user's sense. Gate wireup on
  // !convergedAt so wireup does not run as though everything finished.
  const isMilestoneMode: boolean = options.milestone === true || (!phaseFrom && !phaseTo);
  if (
    isMilestoneMode &&
    !stoppedAt &&
    !convergedAt &&
    !dryRun &&
    phasesCompleted === phasesAttempted &&
    phasesCompleted > 0
  ) {
    log('Milestone mode: all phases complete — running wireup');

    // Compute wireup prompt once for tier routing and dispatch.
    const wireupPrompt: string = buildWireupPrompt();

    // Resolve effective model for wireup via the Spec 4 chain.
    const wireupTier = getEffectiveTierForDispatch({
      agentType: 'grd-executor',
      prompt: wireupPrompt,
      config,
      scheduler,
      schedulerConfig: config.scheduler,
      superpowersConfig: config.superpowers,
      modelProfiles: MODEL_PROFILES,
    });
    const wireupModel: string | undefined = model
      ? model
      : resolveModelForAgent(config, 'grd-executor', cwd, {
          effectiveTierOverride: wireupTier,
        });

    const wireupResult: SpawnResult = scheduler
      ? toSpawnResult(
          await scheduler.spawn(wireupPrompt, {
            timeout: timeoutMs,
            maxTurns,
            model: wireupModel,
            cwd,
            workItemId: 'milestone-wireup',
            agentType: 'grd-integration-checker',
          })
        )
      : await spawnClaudeAsync(cwd, wireupPrompt, {
          timeout: timeoutMs,
          maxTurns,
          model: wireupModel,
        });

    if (wireupResult.exitCode !== 0) {
      const reason: string = wireupResult.timedOut
        ? 'timeout'
        : `exit code ${wireupResult.exitCode}`;
      log(`Wireup FAILED (${reason})`);
      results.push({ phase: 'wireup', step: 'wireup', status: 'failed', reason });
    } else {
      log('Wireup completed');
      results.push({ phase: 'wireup', step: 'wireup', status: 'completed' });
    }
  }

  log(
    `Done: ${phasesCompleted}/${phasesAttempted} phases completed${
      stoppedAt
        ? ` (stopped: ${stoppedAt})`
        : convergedAt
          ? ` (converged: ${convergedAt})`
          : ''
    }`
  );

  if (scheduler) {
    scheduler.persistState(path.join(cwd, '.planning'));
  }

  return {
    phases_attempted: phasesAttempted,
    phases_completed: phasesCompleted,
    stopped_at: stoppedAt,
    converged_at: convergedAt,
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
  // Graceful early termination at the milestone-chain level (Tier-3 #10).
  // codex r4 P2 on PR #40: the maxMilestones cap check at the bottom of
  // this function overwrites stoppedAt to "Reached maxMilestones cap"
  // when convergence fires on the last permitted iteration — turning a
  // graceful stop into a reported failure. Tracking convergence on a
  // dedicated channel lets us bypass that overwrite cleanly.
  let convergedAt: string | null = null;

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
        const autopilotConverged: boolean = autopilotResult.converged_at !== null;
        milestoneResults.push({
          milestone: currentVersion,
          phases_attempted: autopilotResult.phases_attempted,
          phases_completed: autopilotResult.phases_completed,
          status: autopilotFailed
            ? 'failed'
            : autopilotConverged
              ? 'converged'
              : 'completed',
          reason: autopilotResult.stopped_at || autopilotResult.converged_at || undefined,
        });

        if (autopilotFailed) {
          log(`${currentVersion}: autopilot stopped: ${autopilotResult.stopped_at}`);
          stoppedAt = `Autopilot failed for ${currentVersion}: ${autopilotResult.stopped_at}`;
          break;
        }
        // codex r3 P2: convergence is a graceful TERMINAL state for this
        // milestone chain — do not advance to the next milestone. Track
        // on the dedicated `convergedAt` channel so the post-loop
        // maxMilestones cap check (codex r4 P2) does not overwrite it.
        if (autopilotConverged) {
          convergedAt = autopilotResult.converged_at;
          log(`${currentVersion}: autopilot converged early — ${convergedAt}`);
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
                agentType: 'grd-integration-checker',
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
            agentType: 'grd-planner',
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

  // codex r4 P2: do not overwrite a graceful convergence with the
  // "Reached maxMilestones cap" failure signal. Convergence is the
  // terminal reason; the cap only matters when the loop exhausted
  // milestones without converging.
  if (!stoppedAt && !convergedAt && milestonesAttempted >= maxMilestones) {
    stoppedAt = `Reached maxMilestones cap (${maxMilestones})`;
    log(stoppedAt);
  }

  log(
    `Multi-milestone autopilot done: ${milestonesCompleted}/${milestonesAttempted} milestones completed` +
      (stoppedAt
        ? ` (stopped: ${stoppedAt})`
        : convergedAt
          ? ` (converged: ${convergedAt})`
          : '')
  );

  if (mmScheduler) {
    mmScheduler.persistState(path.join(cwd, '.planning'));
  }

  return {
    milestones_attempted: milestonesAttempted,
    milestones_completed: milestonesCompleted,
    milestone_results: milestoneResults,
    stopped_at: stoppedAt,
    converged_at: convergedAt,
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
  _getSchedulerStates,
};
