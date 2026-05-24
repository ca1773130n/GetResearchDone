'use strict';

/**
 * GRD Closed-Loop Metric-Driven Refinement
 *
 * Foundational logic for closed-loop refinement: collecting quantitative
 * metrics from test/lint/build output, detecting when metrics stop improving
 * (convergence), and routing to the correct refinement branch based on which
 * dimension needs the most attention.
 *
 * Adapted from NERFIFY's PSNR-minima ROI analysis to GRD's domain:
 * - test coverage minima (analogous to PSNR dips in low-detail regions)
 * - type error density (analogous to geometry reconstruction errors)
 * - lint violation clustering (analogous to generative artifact noise)
 *
 * @module refinement
 */

import type {
  RefinementMetrics,
  CritiqueBranch,
  ConvergenceConfig,
  MetricSnapshot,
  MinimaRegion,
} from './types';

/**
 * Collect quantitative metrics from npm test, tsc, and eslint output.
 *
 * @param testOutput - Raw stdout from `npm test` (Jest output with coverage table)
 * @param tscOutput - Raw stdout/stderr from `tsc --noEmit`
 * @param lintOutput - Raw stdout from `eslint`
 * @returns RefinementMetrics with current ISO timestamp
 */
export function collectMetrics(
  testOutput: string,
  tscOutput: string,
  lintOutput: string
): RefinementMetrics {
  // Parse test coverage from Jest output: look for "All files" line
  // Jest coverage table format: | All files | XX.XX | XX.XX | XX.XX | ...
  let test_coverage_pct = 0;
  // Jest coverage table "All files" row has 5 columns: File | Stmts | Branch | Funcs | Lines
  // We want the Lines column (4th numeric value after "All files |")
  const coverageLineMatch = testOutput.match(
    /All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/
  );
  if (coverageLineMatch) {
    // Group 4 = Lines coverage
    test_coverage_pct = parseFloat(coverageLineMatch[4]) || 0;
  } else {
    // Fallback: look for "Statements" or "Lines" percentage on a summary line
    const statementsMatch = testOutput.match(/Statements\s*:\s*([\d.]+)%/);
    if (statementsMatch) {
      test_coverage_pct = parseFloat(statementsMatch[1]) || 0;
    } else {
      // Try "Lines" percentage
      const linesMatch = testOutput.match(/Lines\s*:\s*([\d.]+)%/);
      if (linesMatch) {
        test_coverage_pct = parseFloat(linesMatch[1]) || 0;
      }
    }
  }

  // Parse type error count from tsc output: count lines matching /error TS\d+/
  const tscErrorMatches = tscOutput.match(/error TS\d+/g);
  const type_error_count = tscErrorMatches ? tscErrorMatches.length : 0;

  // Parse lint violation count from eslint output.
  // Strategy: count individual violation lines AND check the "N problems" summary.
  // Take max of both to handle cases where the summary underreports or is absent.

  // Count individual error/warning lines (indented lines with rule names)
  const violationLines = lintOutput
    .split('\n')
    .filter((line) => /^\s+\d+:\d+\s+(error|warning)\s+/.test(line));
  const individualCount = violationLines.length;

  // Check for summary line "N problems"
  const problemsMatch = lintOutput.match(/(\d+)\s+problems?/);
  const summaryCount = problemsMatch ? (parseInt(problemsMatch[1], 10) || 0) : 0;

  const lint_violation_count = Math.max(individualCount, summaryCount);

  return {
    test_coverage_pct,
    type_error_count,
    lint_violation_count,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Detect metric-minima regions from a time series of MetricSnapshot objects.
 *
 * For test_coverage_pct: finds local minima (dips where coverage < both neighbors).
 * For type_error_count and lint_violation_count: finds local maxima (spikes where
 * count > both neighbors).
 *
 * Adapted from NERFIFY PSNR-minima ROI analysis.
 *
 * @param snapshots - Ordered array of metric snapshots
 * @returns Array of MinimaRegion objects sorted by |delta| descending
 */
export function detectMinima(snapshots: MetricSnapshot[]): MinimaRegion[] {
  // Need at least 3 snapshots to detect local minima/maxima (requires both neighbors)
  if (snapshots.length < 3) return [];

  const regions: MinimaRegion[] = [];

  for (let i = 1; i < snapshots.length - 1; i++) {
    const prev = snapshots[i - 1].metrics;
    const curr = snapshots[i].metrics;
    const next = snapshots[i + 1].metrics;

    // Coverage: find local minima (dips)
    if (curr.test_coverage_pct < prev.test_coverage_pct && curr.test_coverage_pct < next.test_coverage_pct) {
      const neighborAvg = (prev.test_coverage_pct + next.test_coverage_pct) / 2;
      const delta = Math.abs(neighborAvg - curr.test_coverage_pct);
      regions.push({
        dimension: 'test_coverage_pct',
        index: i,
        value: curr.test_coverage_pct,
        delta,
      });
    }

    // Type errors: find local maxima (spikes)
    if (curr.type_error_count > prev.type_error_count && curr.type_error_count > next.type_error_count) {
      const neighborAvg = (prev.type_error_count + next.type_error_count) / 2;
      const delta = Math.abs(curr.type_error_count - neighborAvg);
      regions.push({
        dimension: 'type_error_count',
        index: i,
        value: curr.type_error_count,
        delta,
      });
    }

    // Lint violations: find local maxima (spikes)
    if (curr.lint_violation_count > prev.lint_violation_count && curr.lint_violation_count > next.lint_violation_count) {
      const neighborAvg = (prev.lint_violation_count + next.lint_violation_count) / 2;
      const delta = Math.abs(curr.lint_violation_count - neighborAvg);
      regions.push({
        dimension: 'lint_violation_count',
        index: i,
        value: curr.lint_violation_count,
        delta,
      });
    }
  }

  // Sort by absolute delta descending (worst regions first)
  return regions.sort((a, b) => b.delta - a.delta);
}

/**
 * Check whether metrics have converged (stopped improving meaningfully).
 *
 * @param snapshots - Ordered array of metric snapshots (newest last)
 * @param config - Convergence thresholds and max iteration cap
 * @returns { converged: boolean, reason: string }
 */
export function checkConvergence(
  snapshots: MetricSnapshot[],
  config: ConvergenceConfig
): { converged: boolean; reason: string } {
  if (snapshots.length < 2) {
    return { converged: false, reason: 'insufficient data' };
  }

  if (snapshots.length >= config.max_iterations) {
    return { converged: true, reason: 'max iterations reached' };
  }

  const last = snapshots[snapshots.length - 1].metrics;
  const prev = snapshots[snapshots.length - 2].metrics;

  // Codex r43 P1 #3: detect the "no real progress" sentinel — when both
  // snapshots report all zeros, the measurement path is almost
  // certainly broken (e.g. jest/tsc/eslint never ran, or stdout was
  // discarded). Don't celebrate this as convergence.
  const lastAllZero =
    last.test_coverage_pct === 0 &&
    last.type_error_count === 0 &&
    last.lint_violation_count === 0;
  const prevAllZero =
    prev.test_coverage_pct === 0 &&
    prev.type_error_count === 0 &&
    prev.lint_violation_count === 0;
  if (lastAllZero && prevAllZero) {
    return {
      converged: false,
      reason: 'no progress (all metrics zero — measurement path likely broken)',
    };
  }

  const deltaCoverage = Math.abs(last.test_coverage_pct - prev.test_coverage_pct);
  const deltaTypeErrors = Math.abs(last.type_error_count - prev.type_error_count);
  const deltaLint = Math.abs(last.lint_violation_count - prev.lint_violation_count);

  const coverageConverged = deltaCoverage < config.epsilon_coverage;
  const typeErrorsConverged = deltaTypeErrors < config.epsilon_type_errors;
  const lintConverged = deltaLint < config.epsilon_lint;

  if (coverageConverged && typeErrorsConverged && lintConverged) {
    return { converged: true, reason: 'all dimensions within epsilon' };
  }

  const stillChanging: string[] = [];
  if (!coverageConverged) {
    stillChanging.push(`coverage (delta=${deltaCoverage.toFixed(2)}, epsilon=${config.epsilon_coverage})`);
  }
  if (!typeErrorsConverged) {
    stillChanging.push(`type_errors (delta=${deltaTypeErrors}, epsilon=${config.epsilon_type_errors})`);
  }
  if (!lintConverged) {
    stillChanging.push(`lint (delta=${deltaLint}, epsilon=${config.epsilon_lint})`);
  }

  return {
    converged: false,
    reason: `still changing: ${stillChanging.join(', ')}`,
  };
}

/**
 * Classify which refinement branch should handle the current metric state.
 *
 * Computes normalized gap for each dimension and routes to the branch
 * with the largest gap to target:
 * - 'macro': coverage gap is largest (metric-minima guided patching)
 * - 'geometry': type error gap is largest (structural validation)
 * - 'generative': lint gap is largest (artifact analysis)
 *
 * @param current - Current metric snapshot
 * @param targets - Target metrics to reach
 * @returns The CritiqueBranch that should handle refinement
 */
export function classifyBranch(
  current: RefinementMetrics,
  targets: RefinementMetrics
): CritiqueBranch {
  // Normalized gap for coverage: (target - current) / target; higher = worse (lower coverage)
  const coverageTarget = targets.test_coverage_pct;
  const coverageGap = coverageTarget > 0
    ? Math.max(0, (coverageTarget - current.test_coverage_pct) / coverageTarget)
    : 0;

  // Normalized gap for type errors: (current - target) / max(current, 1); higher = worse (more errors)
  const typeErrorsGap = current.type_error_count > 0
    ? (current.type_error_count - targets.type_error_count) / Math.max(current.type_error_count, 1)
    : 0;

  // Normalized gap for lint: (current - target) / max(current, 1); higher = worse (more violations)
  const lintGap = current.lint_violation_count > 0
    ? (current.lint_violation_count - targets.lint_violation_count) / Math.max(current.lint_violation_count, 1)
    : 0;

  // Tie-break order: macro > geometry > generative
  if (coverageGap >= typeErrorsGap && coverageGap >= lintGap) {
    return 'macro';
  }
  if (typeErrorsGap >= lintGap) {
    return 'geometry';
  }
  return 'generative';
}

/**
 * Build a structured critique prompt for the refinement agent.
 *
 * @param branch - Which critique branch this prompt is for
 * @param metrics - Current metrics
 * @param targets - Target metrics
 * @param minimaRegions - Top minima regions to surface in the prompt
 * @returns Formatted prompt string for the critique agent
 */
export function buildCritiquePrompt(
  branch: CritiqueBranch,
  metrics: RefinementMetrics,
  targets: RefinementMetrics,
  minimaRegions: MinimaRegion[]
): string {
  const topRegions = minimaRegions.slice(0, 3);
  const regionsText = topRegions.length > 0
    ? topRegions
        .map((r, i) => `  ${i + 1}. ${r.dimension} at index ${r.index}: value=${r.value}, delta=${r.delta.toFixed(2)}`)
        .join('\n')
    : '  (none detected — first iteration or insufficient history)';

  const branchInstructions: Record<CritiqueBranch, string> = {
    macro: `Focus on coverage recovery:
- Identify files with the lowest test coverage
- Add test cases for uncovered branches and lines
- Prioritize files that appear in minima regions (coverage dips)
- High-ROI targets: frequently modified files with low coverage`,

    geometry: `Focus on type error resolution:
- Parse tsc error output and categorize errors by type
- Fix errors starting from leaf modules (no dependents) toward root
- Check export consistency: every module.exports key has a matching function/const
- Verify import chains are correct`,

    generative: `Focus on lint pattern analysis:
- Cluster ESLint violations by rule
- Fix violations by cluster (all no-unused-vars together, all no-explicit-any together)
- Identify code patterns generating violations and refactor the pattern
- Never disable ESLint rules — fix the code`,
  };

  return `CRITIQUE BRANCH: ${branch.toUpperCase()}

## Current Metrics

- test_coverage_pct: ${metrics.test_coverage_pct.toFixed(2)}%
- type_error_count: ${metrics.type_error_count}
- lint_violation_count: ${metrics.lint_violation_count}
- collected_at: ${metrics.timestamp}

## Target Metrics

- test_coverage_pct: ${targets.test_coverage_pct.toFixed(2)}%
- type_error_count: ${targets.type_error_count}
- lint_violation_count: ${targets.lint_violation_count}

## Top Minima Regions

${regionsText}

## Branch Instructions

${branchInstructions[branch]}

## Constraints

- Modify at most 5 files per iteration
- Run npm run build:check after every change to avoid regression
- Never lower coverage thresholds in jest.config.js
- Never disable ESLint rules`;
}

module.exports = {
  collectMetrics,
  detectMinima,
  checkConvergence,
  classifyBranch,
  buildCritiquePrompt,
};
