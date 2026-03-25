'use strict';

import {
  collectMetrics,
  detectMinima,
  checkConvergence,
  classifyBranch,
  buildCritiquePrompt,
} from '../../lib/refinement';
import type {
  MetricSnapshot,
  ConvergenceConfig,
  RefinementMetrics,
} from '../../lib/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const JEST_OUTPUT_WITH_COVERAGE = `
PASS tests/unit/example.test.ts
-----------------------|---------|----------|---------|---------|-------------------
File                   | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------------|---------|----------|---------|---------|-------------------
All files              |   87.34 |    76.19 |   90.00 |   88.10 |
 lib/example.ts        |   87.34 |    76.19 |   90.00 |   88.10 | 45,67,89
-----------------------|---------|----------|---------|---------|-------------------
Tests: 42 passed, 42 total
`;

const JEST_OUTPUT_100_COVERAGE = `
All files              |     100 |      100 |     100 |     100 |
Tests: 10 passed, 10 total
`;

const JEST_OUTPUT_NO_COVERAGE = `
Tests: 5 passed, 5 total
`;

const TSC_OUTPUT_WITH_ERRORS = `
lib/example.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
lib/example.ts(20,3): error TS2339: Property 'foo' does not exist on type 'Bar'.
lib/other.ts(5,1): error TS1005: ';' expected.
`;

const TSC_OUTPUT_CLEAN = ``;

const ESLINT_OUTPUT_WITH_VIOLATIONS = `
/path/to/lib/example.ts
  10:5  error    no-unused-vars  'x' is defined but never used
  20:3  warning  no-console      Unexpected console statement
  30:1  error    semi            Missing semicolon

/path/to/lib/other.ts
  5:10  error    no-undef        'foo' is not defined
`;

const ESLINT_OUTPUT_CLEAN = ``;

const ESLINT_OUTPUT_SUMMARY_ONLY = `
✖ 7 problems (5 errors, 2 warnings)
`;

// ─── Helper: make snapshot ────────────────────────────────────────────────────

function makeSnapshot(
  test_coverage_pct: number,
  type_error_count: number,
  lint_violation_count: number,
  phase = '96',
  plan = '01'
): MetricSnapshot {
  return {
    metrics: {
      test_coverage_pct,
      type_error_count,
      lint_violation_count,
      timestamp: new Date().toISOString(),
    },
    phase,
    plan,
  };
}

const DEFAULT_CONFIG: ConvergenceConfig = {
  epsilon_coverage: 0.5,
  epsilon_type_errors: 1,
  epsilon_lint: 1,
  max_iterations: 10,
};

// ─── collectMetrics ───────────────────────────────────────────────────────────

describe('collectMetrics', () => {
  it('parses test coverage percentage from Jest "All files" coverage table', () => {
    const result = collectMetrics(JEST_OUTPUT_WITH_COVERAGE, TSC_OUTPUT_CLEAN, ESLINT_OUTPUT_CLEAN);
    expect(result.test_coverage_pct).toBeCloseTo(88.10, 1);
  });

  it('returns 100 when all lines are covered', () => {
    const result = collectMetrics(JEST_OUTPUT_100_COVERAGE, TSC_OUTPUT_CLEAN, ESLINT_OUTPUT_CLEAN);
    expect(result.test_coverage_pct).toBe(100);
  });

  it('returns 0 when coverage data is absent', () => {
    const result = collectMetrics(JEST_OUTPUT_NO_COVERAGE, TSC_OUTPUT_CLEAN, ESLINT_OUTPUT_CLEAN);
    expect(result.test_coverage_pct).toBe(0);
  });

  it('counts type errors from tsc output matching /error TS\\d+/', () => {
    const result = collectMetrics(JEST_OUTPUT_WITH_COVERAGE, TSC_OUTPUT_WITH_ERRORS, ESLINT_OUTPUT_CLEAN);
    expect(result.type_error_count).toBe(3);
  });

  it('returns 0 type errors when tsc output is clean', () => {
    const result = collectMetrics(JEST_OUTPUT_WITH_COVERAGE, TSC_OUTPUT_CLEAN, ESLINT_OUTPUT_CLEAN);
    expect(result.type_error_count).toBe(0);
  });

  it('counts lint violations from individual error/warning lines', () => {
    const result = collectMetrics(JEST_OUTPUT_WITH_COVERAGE, TSC_OUTPUT_CLEAN, ESLINT_OUTPUT_WITH_VIOLATIONS);
    expect(result.lint_violation_count).toBeGreaterThanOrEqual(4);
  });

  it('extracts lint violation count from summary line "N problems"', () => {
    const result = collectMetrics(JEST_OUTPUT_WITH_COVERAGE, TSC_OUTPUT_CLEAN, ESLINT_OUTPUT_SUMMARY_ONLY);
    expect(result.lint_violation_count).toBe(7);
  });

  it('returns 0 lint violations when eslint output is clean', () => {
    const result = collectMetrics(JEST_OUTPUT_WITH_COVERAGE, TSC_OUTPUT_CLEAN, ESLINT_OUTPUT_CLEAN);
    expect(result.lint_violation_count).toBe(0);
  });

  it('returns a RefinementMetrics object with valid ISO timestamp', () => {
    const result = collectMetrics(JEST_OUTPUT_WITH_COVERAGE, TSC_OUTPUT_CLEAN, ESLINT_OUTPUT_CLEAN);
    expect(result).toHaveProperty('timestamp');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});

// ─── detectMinima ─────────────────────────────────────────────────────────────

describe('detectMinima', () => {
  it('returns empty array when fewer than 3 snapshots are provided', () => {
    expect(detectMinima([])).toEqual([]);
    expect(detectMinima([makeSnapshot(80, 5, 10)])).toEqual([]);
    expect(detectMinima([makeSnapshot(80, 5, 10), makeSnapshot(75, 6, 12)])).toEqual([]);
  });

  it('detects a coverage dip (local minimum) at index 1', () => {
    const snapshots = [
      makeSnapshot(85, 0, 0),
      makeSnapshot(70, 0, 0), // dip
      makeSnapshot(88, 0, 0),
    ];
    const regions = detectMinima(snapshots);
    const coverageRegion = regions.find(r => r.dimension === 'test_coverage_pct');
    expect(coverageRegion).toBeDefined();
    expect(coverageRegion!.index).toBe(1);
    expect(coverageRegion!.value).toBeCloseTo(70);
  });

  it('does not flag a monotonic trend as a dip', () => {
    const snapshots = [
      makeSnapshot(70, 0, 0),
      makeSnapshot(75, 0, 0),
      makeSnapshot(80, 0, 0),
    ];
    const regions = detectMinima(snapshots);
    const coverageRegions = regions.filter(r => r.dimension === 'test_coverage_pct');
    expect(coverageRegions).toHaveLength(0);
  });

  it('detects a type error spike (local maximum) at index 1', () => {
    const snapshots = [
      makeSnapshot(80, 2, 0),
      makeSnapshot(80, 10, 0), // spike
      makeSnapshot(80, 3, 0),
    ];
    const regions = detectMinima(snapshots);
    const errRegion = regions.find(r => r.dimension === 'type_error_count');
    expect(errRegion).toBeDefined();
    expect(errRegion!.index).toBe(1);
    expect(errRegion!.value).toBe(10);
  });

  it('detects a lint violation spike at index 2 in a longer series', () => {
    const snapshots = [
      makeSnapshot(80, 0, 5),
      makeSnapshot(80, 0, 4),
      makeSnapshot(80, 0, 15), // spike
      makeSnapshot(80, 0, 6),
      makeSnapshot(80, 0, 5),
    ];
    const regions = detectMinima(snapshots);
    const lintRegion = regions.find(r => r.dimension === 'lint_violation_count');
    expect(lintRegion).toBeDefined();
    expect(lintRegion!.index).toBe(2);
  });

  it('sorts results by |delta| descending (worst regions first)', () => {
    // large coverage dip + small error spike; dip should be first
    const snapshots = [
      makeSnapshot(90, 2, 0),
      makeSnapshot(50, 5, 0), // coverage dip delta=40, error spike delta=2.5
      makeSnapshot(88, 2, 0),
    ];
    const regions = detectMinima(snapshots);
    expect(regions.length).toBeGreaterThan(0);
    // First region should have largest |delta|
    for (let i = 1; i < regions.length; i++) {
      expect(Math.abs(regions[0].delta)).toBeGreaterThanOrEqual(Math.abs(regions[i].delta));
    }
  });

  it('delta is the absolute difference from the average of both neighbors', () => {
    const snapshots = [
      makeSnapshot(80, 0, 0),
      makeSnapshot(60, 0, 0), // dip; neighbors avg = 80, delta = |60-80| = 20
      makeSnapshot(80, 0, 0),
    ];
    const regions = detectMinima(snapshots);
    const r = regions.find(r => r.dimension === 'test_coverage_pct');
    expect(r).toBeDefined();
    expect(r!.delta).toBeCloseTo(20);
  });
});

// ─── checkConvergence ─────────────────────────────────────────────────────────

describe('checkConvergence', () => {
  it('returns converged:false with reason "insufficient data" when fewer than 2 snapshots', () => {
    const result = checkConvergence([], DEFAULT_CONFIG);
    expect(result.converged).toBe(false);
    expect(result.reason).toMatch(/insufficient data/i);

    const result2 = checkConvergence([makeSnapshot(80, 5, 10)], DEFAULT_CONFIG);
    expect(result2.converged).toBe(false);
    expect(result2.reason).toMatch(/insufficient data/i);
  });

  it('returns converged:true when all deltas are below epsilon', () => {
    const snapshots = [
      makeSnapshot(85.0, 5, 10),
      makeSnapshot(85.2, 5, 10), // coverage delta=0.2 < 0.5, errors delta=0, lint delta=0
    ];
    const result = checkConvergence(snapshots, DEFAULT_CONFIG);
    expect(result.converged).toBe(true);
  });

  it('returns converged:false when coverage delta exceeds epsilon', () => {
    const snapshots = [
      makeSnapshot(80.0, 5, 10),
      makeSnapshot(85.0, 5, 10), // coverage delta=5 > 0.5
    ];
    const result = checkConvergence(snapshots, DEFAULT_CONFIG);
    expect(result.converged).toBe(false);
    expect(result.reason).toMatch(/coverage/i);
  });

  it('returns converged:false when type error delta exceeds epsilon', () => {
    const snapshots = [
      makeSnapshot(85, 10, 5),
      makeSnapshot(85, 5, 5), // type error delta=5 > 1
    ];
    const result = checkConvergence(snapshots, DEFAULT_CONFIG);
    expect(result.converged).toBe(false);
    expect(result.reason).toMatch(/type.error|error/i);
  });

  it('returns converged:false when lint delta exceeds epsilon', () => {
    const snapshots = [
      makeSnapshot(85, 5, 20),
      makeSnapshot(85, 5, 12), // lint delta=8 > 1
    ];
    const result = checkConvergence(snapshots, DEFAULT_CONFIG);
    expect(result.converged).toBe(false);
    expect(result.reason).toMatch(/lint/i);
  });

  it('returns converged:true with reason "max iterations reached" when snapshots.length >= max_iterations', () => {
    const config: ConvergenceConfig = { ...DEFAULT_CONFIG, max_iterations: 3 };
    const snapshots = [
      makeSnapshot(80, 5, 10),
      makeSnapshot(75, 6, 12),
      makeSnapshot(78, 5, 11),
    ];
    const result = checkConvergence(snapshots, config);
    expect(result.converged).toBe(true);
    expect(result.reason).toMatch(/max iterations/i);
  });

  it('uses the last two snapshots for delta computation, not the entire history', () => {
    const snapshots = [
      makeSnapshot(60, 20, 30), // very different from last two
      makeSnapshot(85.0, 5, 10),
      makeSnapshot(85.2, 5, 10),
    ];
    const result = checkConvergence(snapshots, DEFAULT_CONFIG);
    expect(result.converged).toBe(true);
  });
});

// ─── classifyBranch ───────────────────────────────────────────────────────────

describe('classifyBranch', () => {
  const baseTargets: RefinementMetrics = {
    test_coverage_pct: 90,
    type_error_count: 0,
    lint_violation_count: 0,
    timestamp: new Date().toISOString(),
  };

  it('returns "macro" when coverage gap is the largest normalized gap', () => {
    const current: RefinementMetrics = {
      test_coverage_pct: 60, // gap = (90-60)/90 = 0.333
      type_error_count: 1,   // gap = (1-0)/1 = 1.0 ... wait, need coverage gap to be largest
      lint_violation_count: 0,
      timestamp: new Date().toISOString(),
    };
    // Coverage gap: (90-60)/90 = 0.333
    // Type error gap: (1-0)/max(1,1) = 1.0 — actually larger
    // So we need a scenario where coverage truly wins
    const currentCoverageDominant: RefinementMetrics = {
      test_coverage_pct: 10,  // gap = (90-10)/90 = 0.889
      type_error_count: 1,    // gap = (1-0)/max(1,1) = 1.0
      lint_violation_count: 0,
      timestamp: new Date().toISOString(),
    };
    // Still tie-break: let's use coverage=0, errors=0, lint=1
    const coverageDominant: RefinementMetrics = {
      test_coverage_pct: 0,   // gap = (90-0)/90 = 1.0 exactly
      type_error_count: 0,    // gap = 0
      lint_violation_count: 0, // gap = 0
      timestamp: new Date().toISOString(),
    };
    expect(classifyBranch(coverageDominant, baseTargets)).toBe('macro');
    void current;
    void currentCoverageDominant;
  });

  it('returns "geometry" when type error gap is the largest normalized gap', () => {
    const current: RefinementMetrics = {
      test_coverage_pct: 89,        // coverage gap = (90-89)/90 ≈ 0.011
      type_error_count: 10,         // error gap = (10-0)/max(10,1) = 1.0
      lint_violation_count: 0,
      timestamp: new Date().toISOString(),
    };
    expect(classifyBranch(current, baseTargets)).toBe('geometry');
  });

  it('returns "generative" when lint violation gap is the largest normalized gap', () => {
    const current: RefinementMetrics = {
      test_coverage_pct: 89,        // coverage gap ≈ 0.011
      type_error_count: 0,          // error gap = 0
      lint_violation_count: 20,     // lint gap = (20-0)/max(20,1) = 1.0
      timestamp: new Date().toISOString(),
    };
    expect(classifyBranch(current, baseTargets)).toBe('generative');
  });

  it('tie-breaks macro > geometry > generative (all equal)', () => {
    // All at target: coverage=90, errors=0, lint=0 → all gaps are 0
    const atTarget: RefinementMetrics = {
      test_coverage_pct: 90,
      type_error_count: 0,
      lint_violation_count: 0,
      timestamp: new Date().toISOString(),
    };
    // When all gaps are equal (all zero), tie-break order: macro > geometry > generative
    expect(classifyBranch(atTarget, baseTargets)).toBe('macro');
  });

  it('tie-breaks macro > geometry when coverage and type error gaps are equal and lint is zero', () => {
    const current: RefinementMetrics = {
      test_coverage_pct: 0,   // coverage gap = 1.0
      type_error_count: 1,    // error gap = 1.0 (normalized: (1-0)/max(1,1) = 1.0)
      lint_violation_count: 0,
      timestamp: new Date().toISOString(),
    };
    // macro should win over geometry in tie-break
    expect(classifyBranch(current, baseTargets)).toBe('macro');
  });
});

// ─── buildCritiquePrompt ──────────────────────────────────────────────────────

describe('buildCritiquePrompt', () => {
  const metrics: RefinementMetrics = {
    test_coverage_pct: 72,
    type_error_count: 5,
    lint_violation_count: 8,
    timestamp: '2026-03-25T05:00:00.000Z',
  };

  const targets: RefinementMetrics = {
    test_coverage_pct: 90,
    type_error_count: 0,
    lint_violation_count: 0,
    timestamp: '2026-03-25T05:00:00.000Z',
  };

  const minimaRegions: import('../../lib/types').MinimaRegion[] = [
    { dimension: 'test_coverage_pct', index: 2, value: 70, delta: 18 },
    { dimension: 'type_error_count', index: 4, value: 12, delta: 7 },
  ];

  it('includes the branch name in the prompt string', () => {
    const prompt = buildCritiquePrompt('macro', metrics, targets, minimaRegions);
    expect(prompt).toMatch(/macro/i);
  });

  it('includes current metrics values in the prompt', () => {
    const prompt = buildCritiquePrompt('geometry', metrics, targets, minimaRegions);
    expect(prompt).toMatch(/72/); // coverage
    expect(prompt).toMatch(/5/);  // type errors
  });

  it('includes target metrics values in the prompt', () => {
    const prompt = buildCritiquePrompt('generative', metrics, targets, minimaRegions);
    expect(prompt).toMatch(/90/); // target coverage
  });

  it('includes top 3 minima regions in the prompt', () => {
    const prompt = buildCritiquePrompt('macro', metrics, targets, minimaRegions);
    // Should reference at least one region's dimension
    expect(prompt).toMatch(/coverage|test_coverage_pct|type_error/i);
  });

  it('for "macro" branch: includes coverage recovery emphasis', () => {
    const prompt = buildCritiquePrompt('macro', metrics, targets, minimaRegions);
    expect(prompt).toMatch(/coverage/i);
  });

  it('for "geometry" branch: includes type error resolution emphasis', () => {
    const prompt = buildCritiquePrompt('geometry', metrics, targets, minimaRegions);
    expect(prompt).toMatch(/type.error|typescript|error/i);
  });

  it('for "generative" branch: includes lint pattern analysis emphasis', () => {
    const prompt = buildCritiquePrompt('generative', metrics, targets, minimaRegions);
    expect(prompt).toMatch(/lint/i);
  });

  it('returns a non-empty string', () => {
    const prompt = buildCritiquePrompt('macro', metrics, targets, []);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(50);
  });
});
