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
const { loadConfig, findPhaseInternal, output, getMilestoneInfo } = require('./utils') as {
  loadConfig: (cwd: string) => GrdConfig;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => void;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
};
const { analyzeRoadmap } = require('./roadmap') as {
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
};
const { buildDependencyGraph, computeParallelGroups } = require('./deps') as {
  buildDependencyGraph: (
    phases: Array<{ number: string; name: string; depends_on?: string | null }>
  ) => DependencyGraph;
  computeParallelGroups: (graph: DependencyGraph) => string[][];
};
const { parseLongTermRoadmap } = require('./long-term-roadmap') as {
  parseLongTermRoadmap: (
    content: unknown
  ) => {
    milestones: Array<{
      id: string;
      name: string;
      status: string;
      normal_milestones: Array<{ version: string; note?: string }>;
    }>;
  } | null;
};

// ─── Default Constants ──────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MINUTES: number = 120;
const HEARTBEAT_INTERVAL_MS: number = 30000;
const AUTOPILOT_DIR: string = 'autopilot';

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
  from?: string | null;
  to?: string | null;
  resume?: boolean;
  dryRun?: boolean;
  skipPlan?: boolean;
  skipExecute?: boolean;
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
 * Check if a phase has been planned (used only for --resume skip logic).
 */
function isPhasePlanned(cwd: string, phaseNum: string): boolean {
  const info: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
  if (!info) return false;
  return info.plans.length > 0;
}

/**
 * Check if a phase has been fully executed (used only for --resume skip logic).
 */
function isPhaseExecuted(cwd: string, phaseNum: string): boolean {
  const info: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
  if (!info) return false;
  return info.plans.length > 0 && info.incomplete_plans.length === 0;
}

/**
 * Build the prompt for planning a phase via `claude -p`.
 */
function buildPlanPrompt(phaseNum: string): string {
  return `Use the Skill tool to invoke skill "grd:plan-phase" with args "${phaseNum}" (i.e. plan-phase ${phaseNum}). Autonomous mode — make all decisions yourself, no questions. Complete all planning steps and write the PLAN.md files.`;
}

/**
 * Build the prompt for executing a phase via `claude -p`.
 */
function buildExecutePrompt(phaseNum: string): string {
  return `Use the Skill tool to invoke skill "grd:execute-phase" with args "${phaseNum}" (i.e. execute-phase ${phaseNum}). Autonomous mode — make all decisions yourself, no questions. After execution, merge locally. Do not push.`;
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
  delete env.CLAUDECODE;

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
    if (timeout) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeout);
    }

    child.on('close', (code: number | null) => {
      if (timer) clearTimeout(timer);
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
function writeStatusMarker(
  cwd: string,
  phaseNum: string,
  step: string,
  status: string
): void {
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

  let content: string = fs.readFileSync(statePath, 'utf-8');

  // Update Current Phase field
  content = content.replace(
    /(\*\*Current Phase:\*\*)\s*[^\n]*/,
    `$1 Phase ${phaseNum} (autopilot: ${step})`
  );

  fs.writeFileSync(statePath, content);
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
    (p) =>
      (p as { disk_status?: string }).disk_status === 'complete' ||
      p.roadmap_complete === true
  );
}

/**
 * Determine the next milestone to work on from LONG-TERM-ROADMAP.md.
 * Strategy:
 * - Parse LT roadmap, find the first "active" or "planned" LT milestone
 *   that has linked normal milestones not yet shipped (note != "shipped"),
 *   or find the next LT milestone that is "planned" with no linked milestones yet.
 * - Returns { version, name } of the next milestone to create, or null if none found.
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
 */
function buildNewMilestonePrompt(): string {
  return 'Use the Skill tool to invoke skill "grd:new-milestone" with no additional args. Autonomous mode — make all decisions yourself, no questions. Complete all milestone creation steps including research, requirements, and roadmap setup.';
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
async function runAutopilot(
  cwd: string,
  options: AutopilotOptions = {}
): Promise<AutopilotResult> {
  const {
    from = null,
    to = null,
    resume = false,
    dryRun = false,
    skipPlan = false,
    skipExecute = false,
    timeout,
    maxTurns,
    model,
  } = options;

  const { phases, error: rangeError } = resolvePhaseRange(cwd, from, to);
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
  const stoppedAt: string | null = null;

  const logFile: string = path.join(cwd, '.planning', 'autopilot', 'autopilot.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log: (msg: string) => void = (msg: string): void => {
    const line: string = `[${new Date().toISOString()}] ${msg}\n`;
    process.stderr.write(`[autopilot] ${msg}\n`);
    fs.appendFileSync(logFile, line);
  };
  log(`Starting autopilot: ${phases.length} phase(s) in ${waves.length} wave(s)`);

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
        if (resume && isPhasePlanned(cwd, phaseNum)) {
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
            prompt: buildPlanPrompt(phaseNum),
          });
          planTasks.push({ phaseNum, skipped: true });
        } else {
          log(`Phase ${phaseNum}: planning...`);
          writeStatusMarker(cwd, phaseNum, 'plan', 'started');
          updateStateProgress(cwd, phaseNum, 'planning');

          const promise: Promise<SpawnResult> = spawnClaudeAsync(cwd, buildPlanPrompt(phaseNum), {
            timeout: timeoutMs,
            maxTurns,
            model,
          });
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

    // ── Execute step: sequential within wave ──
    // Track which phases failed planning so we skip them during execution
    const failedPlanPhases: Set<string> = new Set(
      results.filter((r) => r.step === 'plan' && r.status === 'failed').map((r) => r.phase)
    );

    if (!skipExecute) {
      for (const phaseNum of wave) {
        if (failedPlanPhases.has(phaseNum)) {
          log(`Phase ${phaseNum}: skipping execution (planning failed)`);
          results.push({
            phase: phaseNum,
            step: 'execute',
            status: 'skipped',
            reason: 'planning failed',
          });
          continue;
        }
        if (resume && isPhaseExecuted(cwd, phaseNum)) {
          results.push({
            phase: phaseNum,
            step: 'execute',
            status: 'skipped',
            reason: 'already executed',
          });
        } else if (dryRun) {
          results.push({
            phase: phaseNum,
            step: 'execute',
            status: 'dry-run',
            prompt: buildExecutePrompt(phaseNum),
          });
        } else {
          log(`Phase ${phaseNum}: executing...`);
          writeStatusMarker(cwd, phaseNum, 'execute', 'started');
          updateStateProgress(cwd, phaseNum, 'executing');

          const execResult: SpawnResult = spawnClaude(cwd, buildExecutePrompt(phaseNum), {
            timeout: timeoutMs,
            maxTurns,
            model,
          });

          if (execResult.exitCode !== 0) {
            const reason: string = execResult.timedOut
              ? 'timeout'
              : `exit code ${execResult.exitCode}`;
            log(`Phase ${phaseNum}: execute FAILED (${reason})`);
            writeStatusMarker(cwd, phaseNum, 'execute', 'failed');
            results.push({ phase: phaseNum, step: 'execute', status: 'failed', reason });
            continue;
          }

          log(`Phase ${phaseNum}: execute completed`);
          writeStatusMarker(cwd, phaseNum, 'execute', 'completed');
          results.push({ phase: phaseNum, step: 'execute', status: 'completed' });
        }

        if (stoppedAt) break;
      }

      // Count phases where execution didn't fail
      for (const phaseNum of wave) {
        const hasFailed: boolean = results.some(
          (r) => r.phase === phaseNum && r.status === 'failed'
        );
        if (!hasFailed) phasesCompleted++;
      }
    }
  }

  log(
    `Done: ${phasesCompleted}/${phasesAttempted} phases completed${stoppedAt ? ` (stopped: ${stoppedAt})` : ''}`
  );

  return {
    phases_attempted: phasesAttempted,
    phases_completed: phasesCompleted,
    stopped_at: stoppedAt,
    waves,
    results,
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
    from: flag('--from', null),
    to: flag('--to', null),
    resume: hasFlag('--resume'),
    dryRun: hasFlag('--dry-run'),
    skipPlan: hasFlag('--skip-plan'),
    skipExecute: hasFlag('--skip-execute'),
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

  const result = {
    claude_available: claudeAvailable,
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

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  cmdAutopilot,
  cmdInitAutopilot,
  runAutopilot,
  resolvePhaseRange,
  isPhasePlanned,
  isPhaseExecuted,
  spawnClaude,
  spawnClaudeAsync,
  buildPlanPrompt,
  buildExecutePrompt,
  buildWaves,
  writeStatusMarker,
  updateStateProgress,
  DEFAULT_TIMEOUT_MINUTES,
  HEARTBEAT_INTERVAL_MS,
  startHeartbeat,
};
