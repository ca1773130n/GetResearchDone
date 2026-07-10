'use strict';
const path = require('path');
// execFileSync only (NOT exec): no shell is spawned and args are passed as an array,
// so the generated script path cannot inject shell commands.
const { execFileSync } = require('child_process');
import type { ExperimentPlan, ExperimentResult, FailureClass } from './types';

export interface Runner {
  run(plan: ExperimentPlan, threadDir: string): ExperimentResult;
}

function parseMetricsLine(stdout: string): Record<string, number> {
  const m = stdout.match(/__RESULT__\s*(\{.*\})/);
  if (!m) return {};
  try {
    const obj = JSON.parse(m[1]) as Record<string, unknown>;
    const out: Record<string, number> = {};
    // Finite numbers only: `1e400` parses to Infinity in JS (valid JSON syntax) and
    // `typeof Infinity === 'number'`, so guard with Number.isFinite — parity with the
    // kernel's `math.isfinite` drop. See docs/kernel-contract.md.
    for (const [k, v] of Object.entries(obj)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    return out;
  } catch { return {}; }
}

function classifyRunFailure(stderr: string, timedOut: boolean): FailureClass {
  if (timedOut) return 'H4';
  if (/command not found|not found:|ModuleNotFoundError|ImportError/i.test(stderr)) return 'H2';
  if (/No such file or directory|ENOENT|permission denied/i.test(stderr)) return 'H3';
  if (!stderr) return 'none';
  return 'H4';
}

function createSubprocessRunner(opts: { timeoutMs?: number } = {}): Runner {
  // Default bumped 120s -> 600s and made env-overridable. A correct but
  // compute-heavy experiment (numpy/scipy over a real graph) can exceed 120s,
  // especially under machine load; hitting the cap yields SIGTERM -> empty
  // metrics -> a spurious H4 "trajectory failure" / inconclusive verdict on a
  // sound script. GRD_EXPERIMENT_TIMEOUT_MS lets callers tune it further.
  const envTimeout = Number(process.env.GRD_EXPERIMENT_TIMEOUT_MS);
  const timeoutMs =
    opts.timeoutMs
    ?? (Number.isFinite(envTimeout) && envTimeout > 0 ? envTimeout : 600000);
  return {
    run(plan: ExperimentPlan, threadDir: string): ExperimentResult {
      const scriptFile = path.isAbsolute(plan.scriptPath)
        ? plan.scriptPath : path.join(threadDir, plan.scriptPath);
      const bin = plan.language === 'python' ? 'python3' : 'bash';
      const start = Date.now();
      try {
        const stdout: string = execFileSync(bin, [scriptFile], {
          cwd: threadDir, timeout: timeoutMs, encoding: 'utf8',
        });
        return {
          metrics: parseMetricsLine(stdout),
          exitCode: 0,
          runner: 'subprocess',
          durationMs: Date.now() - start,
          stdoutExcerpt: stdout.slice(0, 2000),
          failureClass: 'none',
        };
      } catch (e: unknown) {
        const err = e as { status?: number; stdout?: string; stderr?: string; signal?: string };
        const stdout = err.stdout || '';
        const exitCode = typeof err.status === 'number' ? err.status : 1;
        const timedOut = err.signal === 'SIGTERM';
        return {
          metrics: parseMetricsLine(stdout),
          exitCode,
          runner: 'subprocess',
          durationMs: Date.now() - start,
          stdoutExcerpt: stdout.slice(0, 2000),
          stderrExcerpt: String(err.stderr || '').slice(0, 2000),
          failureClass: classifyRunFailure(err.stderr || String(e), timedOut),
        };
      }
    },
  };
}

module.exports = { parseMetricsLine, classifyRunFailure, createSubprocessRunner };
