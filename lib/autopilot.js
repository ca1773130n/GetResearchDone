'use strict';

/**
 * GRD Autopilot — Deterministic multi-phase orchestration via `claude -p` subprocesses.
 *
 * Each phase gets a fresh Claude process with zero context from previous steps.
 * The loop is entirely deterministic Node.js — no LLM involvement in orchestration.
 *
 * Created in Phase 52.
 */

const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const { loadConfig, findPhaseInternal, output } = require('./utils');
const { analyzeRoadmap } = require('./roadmap');
const { buildDependencyGraph, computeParallelGroups } = require('./deps');

// ─── Default Constants ──────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MINUTES = 120;
const HEARTBEAT_INTERVAL_MS = 30000;
const AUTOPILOT_DIR = 'autopilot';

// ─── Pure Helper Functions ──────────────────────────────────────────────────

/**
 * Resolve the range of phases to process from ROADMAP.md.
 * @param {string} cwd - Project working directory
 * @param {string|null} from - Starting phase number (inclusive), or null for first incomplete
 * @param {string|null} to - Ending phase number (inclusive), or null for last
 * @returns {{phases: Array<{number: string, name: string, disk_status: string}>, error: string|null}}
 */
function resolvePhaseRange(cwd, from, to) {
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
    const fromNum = parseFloat(from);
    phases = phases.filter((p) => parseFloat(p.number) >= fromNum);
  }
  if (to) {
    const toNum = parseFloat(to);
    phases = phases.filter((p) => parseFloat(p.number) <= toNum);
  }

  if (phases.length === 0) {
    return { phases: [], error: `No phases found in range ${from || 'start'}..${to || 'end'}` };
  }

  return { phases, error: null };
}

/**
 * Check if a phase has been planned (used only for --resume skip logic).
 */
function isPhasePlanned(cwd, phaseNum) {
  const info = findPhaseInternal(cwd, phaseNum);
  if (!info) return false;
  return info.plans.length > 0;
}

/**
 * Check if a phase has been fully executed (used only for --resume skip logic).
 */
function isPhaseExecuted(cwd, phaseNum) {
  const info = findPhaseInternal(cwd, phaseNum);
  if (!info) return false;
  return info.plans.length > 0 && info.incomplete_plans.length === 0;
}

/**
 * Build the prompt for planning a phase via `claude -p`.
 * @param {string} phaseNum - Phase number to plan
 * @returns {string}
 */
function buildPlanPrompt(phaseNum) {
  return `Use the Skill tool to invoke skill "grd:plan-phase" with args "${phaseNum}" (i.e. plan-phase ${phaseNum}). Autonomous mode — make all decisions yourself, no questions. Complete all planning steps and write the PLAN.md files.`;
}

/**
 * Build the prompt for executing a phase via `claude -p`.
 * @param {string} phaseNum - Phase number to execute
 * @returns {string}
 */
function buildExecutePrompt(phaseNum) {
  return `Use the Skill tool to invoke skill "grd:execute-phase" with args "${phaseNum}" (i.e. execute-phase ${phaseNum}). Autonomous mode — make all decisions yourself, no questions. After execution, merge locally. Do not push.`;
}

/**
 * Spawn a `claude -p` subprocess synchronously.
 * @param {string} cwd - Working directory
 * @param {string} prompt - Prompt text to pass via -p
 * @param {Object} [opts={}] - Options
 * @param {number} [opts.timeout] - Timeout in milliseconds
 * @param {number} [opts.maxTurns] - Max turns for claude -p
 * @param {string} [opts.model] - Model override
 * @returns {{exitCode: number, timedOut: boolean}}
 */
function spawnClaude(cwd, prompt, opts = {}) {
  const args = ['-p', prompt, '--verbose', '--dangerously-skip-permissions'];
  if (opts.maxTurns) {
    args.push('--max-turns', String(opts.maxTurns));
  }
  if (opts.model) {
    args.push('--model', opts.model);
  }

  const timeout = opts.timeout;

  const env = { ...process.env };
  delete env.CLAUDECODE;

  const spawnOpts = {
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
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const timedOut = !!(result.error && result.error.code === 'ETIMEDOUT');
  const exitCode = timedOut ? 124 : (result.status ?? 1);

  return { exitCode, timedOut };
}

/**
 * Spawn a `claude -p` subprocess asynchronously (non-blocking).
 * Used for parallel planning where multiple processes run concurrently.
 * @param {string} cwd - Working directory
 * @param {string} prompt - Prompt text to pass via -p
 * @param {Object} [opts={}] - Options
 * @param {number} [opts.timeout] - Timeout in milliseconds
 * @param {number} [opts.maxTurns] - Max turns for claude -p
 * @param {string} [opts.model] - Model override
 * @returns {Promise<{exitCode: number, timedOut: boolean}>}
 */
function spawnClaudeAsync(cwd, prompt, opts = {}) {
  const args = ['-p', prompt, '--verbose', '--dangerously-skip-permissions'];
  if (opts.maxTurns) {
    args.push('--max-turns', String(opts.maxTurns));
  }
  if (opts.model) {
    args.push('--model', opts.model);
  }
  if (opts.outputFormat) {
    args.push('--output-format', opts.outputFormat);
  }

  const timeout = opts.timeout;
  const captureOutput = opts.captureOutput || false;
  const captureStderr = opts.captureStderr || false;

  const env = { ...process.env };
  delete env.CLAUDECODE;

  return new Promise((resolve) => {
    const child = childProcess.spawn('claude', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    let stdoutBuf = '';
    let stderrBuf = '';

    // Stream subprocess output to parent so it's visible in the terminal/TUI
    if (child.stdout && typeof child.stdout.on === 'function') {
      child.stdout.on('data', (chunk) => {
        if (captureOutput) {
          stdoutBuf += chunk.toString();
        } else {
          process.stdout.write(chunk);
        }
      });
    }
    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', (chunk) => {
        // Always forward to parent stderr for real-time visibility
        process.stderr.write(chunk);
        if (captureStderr) {
          stderrBuf += chunk.toString();
        }
      });
    }

    let timedOut = false;
    let timer;
    if (timeout) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeout);
    }

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const result = {
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
      const result = { exitCode: 1, timedOut: false };
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
 * @param {Array<{number: string, name: string, depends_on: string|null}>} phases - Phase objects
 * @returns {string[][]} Arrays of phase numbers grouped by dependency level
 */
function buildWaves(phases) {
  const graph = buildDependencyGraph(phases);
  return computeParallelGroups(graph);
}

/**
 * Write a status marker JSON file for tracking autopilot progress.
 * @param {string} cwd - Project working directory
 * @param {string} phaseNum - Phase number
 * @param {string} step - Step name (e.g., 'plan', 'execute')
 * @param {string} status - Status (e.g., 'started', 'completed', 'failed')
 */
function writeStatusMarker(cwd, phaseNum, step, status) {
  const dir = path.join(cwd, '.planning', AUTOPILOT_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const marker = {
    phase: phaseNum,
    step,
    status,
    timestamp: new Date().toISOString(),
  };
  const filename = `phase-${phaseNum}-${step}.json`;
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(marker, null, 2));
}

/**
 * Update STATE.md current phase and status fields.
 * @param {string} cwd - Project working directory
 * @param {string} phaseNum - Phase number
 * @param {string} step - Current step description
 */
function updateStateProgress(cwd, phaseNum, step) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) return;

  let content = fs.readFileSync(statePath, 'utf-8');

  // Update Current Phase field
  content = content.replace(
    /(\*\*Current Phase:\*\*)\s*[^\n]*/,
    `$1 Phase ${phaseNum} (autopilot: ${step})`
  );

  fs.writeFileSync(statePath, content);
}

// ─── Main Loop ──────────────────────────────────────────────────────────────

/**
 * Run the autopilot loop over a range of phases, grouped by dependency waves.
 * Independent phases are planned in parallel; execution is always sequential.
 * @param {string} cwd - Project working directory
 * @param {Object} options
 * @param {string|null} options.from - Start phase
 * @param {string|null} options.to - End phase
 * @param {boolean} [options.resume=false] - Skip already-completed steps
 * @param {boolean} [options.dryRun=false] - Show plan without executing
 * @param {boolean} [options.skipPlan=false] - Skip planning step
 * @param {boolean} [options.skipExecute=false] - Skip execution step
 * @param {number} [options.timeout] - Timeout per invocation in minutes
 * @param {number} [options.maxTurns] - Max turns per claude -p invocation
 * @param {string} [options.model] - Model override
 * @returns {Promise<{phases_attempted: number, phases_completed: number, stopped_at: string|null, waves: string[][], results: Array}>}
 */
async function runAutopilot(cwd, options = {}) {
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

  const waves = buildWaves(phases);

  const timeoutMs = timeout ? timeout * 60 * 1000 : undefined;
  const results = [];
  let phasesAttempted = 0;
  let phasesCompleted = 0;
  let stoppedAt = null;

  const logFile = path.join(cwd, '.planning', 'autopilot', 'autopilot.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stderr.write(`[autopilot] ${msg}\n`);
    fs.appendFileSync(logFile, line);
  };
  log(`Starting autopilot: ${phases.length} phase(s) in ${waves.length} wave(s)`);

  for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
    const wave = waves[waveIdx];
    if (stoppedAt) break;

    log(`Wave ${waveIdx + 1}/${waves.length}: phases [${wave.join(', ')}]`);

    // ── Plan step: all phases in wave in parallel ──
    if (!skipPlan) {
      const planTasks = [];

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

          const promise = spawnClaudeAsync(cwd, buildPlanPrompt(phaseNum), {
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

        const planResult = await task.promise;

        if (planResult.exitCode !== 0) {
          const reason = planResult.timedOut ? 'timeout' : `exit code ${planResult.exitCode}`;
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
    const failedPlanPhases = new Set(
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

          const execResult = spawnClaude(cwd, buildExecutePrompt(phaseNum), {
            timeout: timeoutMs,
            maxTurns,
            model,
          });

          if (execResult.exitCode !== 0) {
            const reason = execResult.timedOut ? 'timeout' : `exit code ${execResult.exitCode}`;
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
        const hasFailed = results.some((r) => r.phase === phaseNum && r.status === 'failed');
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
 * @param {string} cwd - Project working directory
 * @param {string[]} args - CLI arguments after 'autopilot'
 * @param {boolean} raw - Raw output mode
 * @returns {Promise<void>}
 */
async function cmdAutopilot(cwd, args, raw) {
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const hasFlag = (name) => args.indexOf(name) !== -1;

  const options = {
    from: flag('--from', null),
    to: flag('--to', null),
    resume: hasFlag('--resume'),
    dryRun: hasFlag('--dry-run'),
    skipPlan: hasFlag('--skip-plan'),
    skipExecute: hasFlag('--skip-execute'),
    timeout: hasFlag('--timeout') ? parseInt(flag('--timeout', '0'), 10) : undefined,
    maxTurns: flag('--max-turns', null) ? parseInt(flag('--max-turns', '0'), 10) : undefined,
    model: flag('--model', undefined),
  };

  const result = await runAutopilot(cwd, options);
  const rawSummary = raw
    ? `Autopilot: ${result.phases_completed}/${result.phases_attempted} phases completed${result.stopped_at ? ` (stopped: ${result.stopped_at})` : ''}`
    : undefined;
  output(result, raw, rawSummary);
}

/**
 * Pre-flight context for autopilot initialization.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Raw output mode
 */
function cmdInitAutopilot(cwd, raw) {
  const config = loadConfig(cwd);
  const analysis = analyzeRoadmap(cwd);

  // Check if claude CLI is available
  let claudeAvailable = false;
  try {
    const check = childProcess.spawnSync('claude', ['--version'], {
      stdio: 'pipe',
      timeout: 5000,
    });
    claudeAvailable = check.status === 0;
  } catch {
    // claude CLI not found — claudeAvailable stays false
  }

  const phases = analysis.phases || [];
  const incomplete = phases.filter((p) => p.disk_status !== 'complete' && !p.roadmap_complete);

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
      disk_status: p.disk_status,
      roadmap_complete: p.roadmap_complete,
    })),
  };

  output(result, raw, raw ? JSON.stringify(result) : undefined);
}

// ─── Heartbeat ──────────────────────────────────────────────────────────────

/**
 * Start a periodic heartbeat that writes a message to stderr at each interval.
 * Useful for keeping long-running autopilot sessions visible in logs.
 * @param {string} message - Message to write at each heartbeat
 * @returns {NodeJS.Timeout} Interval timer (pass to clearInterval to stop)
 */
function startHeartbeat(message) {
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
