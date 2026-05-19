'use strict';

/** GRD Commands/EvalDiff -- Side-by-side EVAL.md metric comparison across phases */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const {
  output,
  error,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (msg: string) => never;
} = require('../utils');

const {
  phasesDir: getPhasesDirPath,
}: {
  phasesDir: (cwd: string, milestone?: string | null) => string;
} = require('../paths');

interface MetricDelta {
  metric: string;
  value_a: number;
  value_b: number;
  delta: number;
  delta_pct: number;
  direction: 'improved' | 'regressed' | 'unchanged';
}

interface EvalDiffResult {
  phase_a: string;
  phase_b: string;
  metrics_in_a: number;
  metrics_in_b: number;
  common_metrics: number;
  deltas: MetricDelta[];
}

function _findPhaseDir(cwd: string, phaseNum: string): string | null {
  const phasesPath = getPhasesDirPath(cwd);
  const normalized = phaseNum.padStart(2, '0');
  try {
    const entries = fs.readdirSync(phasesPath, { withFileTypes: true }) as import('fs').Dirent[];
    const match = entries.find(
      (e) =>
        e.isDirectory() &&
        (e.name.startsWith(normalized + '-') || e.name.startsWith(phaseNum + '-'))
    );
    return match ? path.join(phasesPath, match.name) : null;
  } catch {
    return null;
  }
}

function _findEvalFile(phaseDir: string): string | null {
  try {
    const files = fs.readdirSync(phaseDir) as string[];
    const evalFile = files.find((f: string) => f.endsWith('-EVAL.md') || f === 'EVAL.md');
    return evalFile ? path.join(phaseDir, evalFile) : null;
  } catch {
    return null;
  }
}

function _parseMetrics(content: string): Record<string, number> {
  const metrics: Record<string, number> = {};
  const re = /\b([A-Za-z][A-Za-z0-9_\-/ ]{0,30}):\s*([\d]+(?:\.[\d]+)?)\s*(?:%|dB|ms|s|min)?\b/g;
  for (const m of content.matchAll(re)) {
    const key = m[1].trim().toLowerCase().replace(/\s+/g, '_');
    const val = parseFloat(m[2]);
    if (!isNaN(val) && key.length > 1) {
      metrics[key] = val;
    }
  }
  return metrics;
}

function _resolveLatestTwoPhases(cwd: string): [string, string] | null {
  const phasesPath = getPhasesDirPath(cwd);
  try {
    // Codex r8 P2: only consider phases that actually have EVAL.md.
    // Picking the last two by name fails when the newest phases are
    // still planned/in-progress (no EVAL.md yet).
    const dirs = (fs.readdirSync(phasesPath, { withFileTypes: true }) as import('fs').Dirent[])
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => /^\d{2}/.test(n))
      .filter((n) => {
        // Codex r9 P2: phase dirs commonly use prefixed EVAL names like
        // `100-EVAL.md`. Match both forms (same as _findEvalFile).
        try {
          return (fs.readdirSync(path.join(phasesPath, n)) as string[]).some(
            (f: string) => f === 'EVAL.md' || /-EVAL\.md$/.test(f)
          );
        } catch {
          return false;
        }
      })
      // Codex r13 P2: lexicographic sort puts `100-...` before `99-...`.
      // Sort by numeric prefix; ties broken lexicographically as a
      // safety net.
      .sort((a, b) => {
        const na = parseInt(a.match(/^(\d+)/)?.[1] ?? '0', 10);
        const nb = parseInt(b.match(/^(\d+)/)?.[1] ?? '0', 10);
        if (na !== nb) return na - nb;
        return a.localeCompare(b);
      });
    if (dirs.length < 2) return null;
    const last = dirs[dirs.length - 1].match(/^(\d+)/)?.[1] ?? '';
    const secondLast = dirs[dirs.length - 2].match(/^(\d+)/)?.[1] ?? '';
    return secondLast && last ? [secondLast, last] : null;
  } catch {
    return null;
  }
}

/**
 * CLI command: Compare EVAL.md metrics between two phases side-by-side.
 * Use 'latest' as phaseB to auto-compare the last two completed phases.
 */
function cmdEvalDiff(cwd: string, phaseA: string, phaseB: string, raw: boolean): void {
  if (!phaseA || !phaseB) {
    error('Usage: gd eval diff <phaseA> <phaseB> — or: gd eval diff latest');
  }

  let resolvedA = phaseA;
  let resolvedB = phaseB;

  // Codex r12 P2: only resolve sides that are literally `latest`. The
  // prior branch overwrote both sides whenever either was `latest`,
  // so `gd eval diff 5 latest` discarded the explicit `5`. When both
  // are `latest`, fall back to the previous behaviour (last two with
  // EVAL.md). When only one is `latest`, pick the most recent phase
  // with EVAL.md that differs from the explicit side.
  const aLatest = phaseA === 'latest';
  const bLatest = phaseB === 'latest';
  if (aLatest && bLatest) {
    const pair = _resolveLatestTwoPhases(cwd);
    if (!pair) {
      error('Could not find two completed phases with EVAL.md files');
    }
    [resolvedA, resolvedB] = pair!;
  } else if (aLatest || bLatest) {
    const pair = _resolveLatestTwoPhases(cwd);
    if (!pair) {
      error('Could not find a phase with EVAL.md to resolve `latest`');
    }
    // Codex r22 P2: compare phase ids by their numeric value so zero-
    // padding does not cause `05` vs `5` to be treated as different.
    const explicit = aLatest ? phaseB : phaseA;
    const sameNum = (a: string, b: string): boolean => parseInt(a, 10) === parseInt(b, 10);
    const latestResolved = sameNum(pair![1], explicit) ? pair![0] : pair![1];
    if (aLatest) resolvedA = latestResolved;
    else resolvedB = latestResolved;
  }

  const dirA = _findPhaseDir(cwd, resolvedA);
  const dirB = _findPhaseDir(cwd, resolvedB);

  if (!dirA) error(`Phase ${resolvedA} directory not found`);
  if (!dirB) error(`Phase ${resolvedB} directory not found`);

  const evalPathA = _findEvalFile(dirA!);
  const evalPathB = _findEvalFile(dirB!);

  if (!evalPathA) error(`No EVAL.md found in phase ${resolvedA}`);
  if (!evalPathB) error(`No EVAL.md found in phase ${resolvedB}`);

  let contentA: string;
  let contentB: string;
  try {
    contentA = fs.readFileSync(evalPathA!, 'utf-8');
  } catch {
    error(`Cannot read EVAL.md for phase ${resolvedA}`);
    return;
  }
  try {
    contentB = fs.readFileSync(evalPathB!, 'utf-8');
  } catch {
    error(`Cannot read EVAL.md for phase ${resolvedB}`);
    return;
  }

  const metricsA = _parseMetrics(contentA);
  const metricsB = _parseMetrics(contentB);

  const commonKeys = Object.keys(metricsA).filter((k) => k in metricsB);

  // Codex r11 P2 + r12 P2: lower-is-better metrics need direction flip.
  // `_parseMetrics` normalizes labels to snake_case (`Response time` →
  // `response_time`), so the regex needs to match underscore-separated
  // tokens too. Normalize underscores to spaces before testing.
  const lowerIsBetterRe = /\b(latency|duration|elapsed|time|error|fail|loss|cost|memory|leak|bytes|ms|seconds?|minutes?)\b/i;
  const deltas: MetricDelta[] = commonKeys.map((metric) => {
    const vA = metricsA[metric];
    const vB = metricsB[metric];
    const delta = vB - vA;
    const deltaPct = vA !== 0 ? (delta / Math.abs(vA)) * 100 : 0;
    const lowerBetter = lowerIsBetterRe.test(metric.replace(/_/g, ' '));
    const improvedSign = lowerBetter ? delta < 0 : delta > 0;
    const direction: MetricDelta['direction'] =
      Math.abs(deltaPct) < 0.5 ? 'unchanged' : improvedSign ? 'improved' : 'regressed';
    return { metric, value_a: vA, value_b: vB, delta, delta_pct: Math.round(deltaPct * 100) / 100, direction };
  });

  deltas.sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct));

  const result: EvalDiffResult = {
    phase_a: resolvedA,
    phase_b: resolvedB,
    metrics_in_a: Object.keys(metricsA).length,
    metrics_in_b: Object.keys(metricsB).length,
    common_metrics: commonKeys.length,
    deltas,
  };

  if (raw) {
    const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
    const lines = [
      `Eval diff: Phase ${resolvedA} vs Phase ${resolvedB}`,
      `${'─'.repeat(70)}`,
      `${pad('Metric', 30)} ${pad('Phase ' + resolvedA, 12)} ${pad('Phase ' + resolvedB, 12)} Delta`,
      `${'─'.repeat(70)}`,
    ];
    for (const d of deltas) {
      const arrow = d.direction === 'improved' ? '+' : d.direction === 'regressed' ? '-' : ' ';
      lines.push(
        `${pad(d.metric, 30)} ${pad(String(d.value_a), 12)} ${pad(String(d.value_b), 12)} ${arrow}${Math.abs(d.delta_pct).toFixed(1)}%`
      );
    }
    if (deltas.length === 0) lines.push('  No common metrics found.');
    lines.push(`${'─'.repeat(70)}`);
    output(result, raw, lines.join('\n'));
  } else {
    output(result, raw, `${commonKeys.length} common metrics, ${deltas.filter((d) => d.direction === 'regressed').length} regressions`);
  }
}

module.exports = { cmdEvalDiff };
