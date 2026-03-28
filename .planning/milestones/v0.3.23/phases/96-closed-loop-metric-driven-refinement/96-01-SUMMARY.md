---
phase: 96-closed-loop-metric-driven-refinement
plan: "01"
subsystem: refinement
tags: [refinement, metrics, convergence, tdd, nerfify]
dependency_graph:
  requires: []
  provides: [lib/refinement.ts, RefinementMetrics, CritiqueBranch, ConvergenceConfig, MetricSnapshot, MinimaRegion]
  affects: [lib/types.ts, jest.config.js]
tech_stack:
  added: [lib/refinement.ts]
  patterns: [NERFIFY PSNR-minima ROI analysis adapted to GRD metric domain, TDD RED-GREEN cycle]
key_files:
  created:
    - lib/refinement.ts
    - tests/unit/refinement.test.ts
  modified:
    - lib/types.ts
    - jest.config.js
decisions:
  - "Coverage regex uses 4-group capture to target Lines column (4th) in Jest table — avoids greedy match stopping at Funcs column"
  - "Lint violation count uses Math.max(individualCount, summaryCount) for robustness against fixture/output format variations"
  - "classifyBranch normalizes coverage gap as (target-current)/target and error/lint gaps as (current-target)/max(current,1) with tie-break macro>geometry>generative"
  - "detectMinima requires min 3 snapshots (strict inequality for both neighbors) matching NERFIFY local-minima ROI detection semantics"
metrics:
  duration: "6m26s"
  completed: "2026-03-25"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
  tests_written: 36
  coverage_lines: 97.5
  coverage_functions: 100
  coverage_branches: 85.24
---

# Phase 96 Plan 01: Refinement Module — Core Metrics, Convergence, Branch Classification

**One-liner:** CommonJS refinement module with NERFIFY-inspired metric-minima detection achieving 97.5% line coverage, full TDD RED-GREEN cycle, and lint/build clean.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Define refinement types + TDD RED tests | ca564a7 | lib/types.ts, lib/refinement.ts (stub), tests/unit/refinement.test.ts |
| 2 | Implement refinement functions (GREEN) | 64ccc5b | lib/refinement.ts (impl), jest.config.js |

## What Was Built

**lib/types.ts** — Added 5 new interfaces to the Refinement Types section:
- `RefinementMetrics` — { test_coverage_pct, type_error_count, lint_violation_count, timestamp }
- `MetricSnapshot` — { metrics, phase, plan }
- `CritiqueBranch` — `'macro' | 'geometry' | 'generative'` string literal union
- `ConvergenceConfig` — { epsilon_coverage, epsilon_type_errors, epsilon_lint, max_iterations }
- `MinimaRegion` — { dimension, index, value, delta }

**lib/refinement.ts** — 5 exported functions implementing closed-loop refinement primitives:

1. **collectMetrics**: Parses Jest "All files" Lines% via 4-column regex capture, counts `error TS\d+` occurrences from tsc output, and takes `Math.max(individual violation lines, summary count)` from ESLint output.

2. **detectMinima**: Adapted from NERFIFY PSNR-minima ROI analysis. Coverage dips = local minima (curr < both neighbors). Error/lint spikes = local maxima (curr > both neighbors). Results sorted by |delta| descending (worst regions first). Requires ≥ 3 snapshots.

3. **checkConvergence**: Computes delta between the last two snapshots. Returns `converged: true` when all three deltas are below their respective epsilons, or when `snapshots.length >= max_iterations`. Returns `converged: false` with a descriptive reason string identifying which dimensions are still changing.

4. **classifyBranch**: Normalized gap per dimension — coverage gap = `(target - current) / target` (higher = worse), error/lint gaps = `(current - target) / max(current, 1)` (higher = worse). Tie-break order: macro > geometry > generative.

5. **buildCritiquePrompt**: Structured markdown prompt with branch type, current/target metrics table, top-3 minima regions, and branch-specific guidance (coverage recovery / type error resolution / lint pattern analysis).

**jest.config.js** — Added coverage threshold: `./lib/refinement.ts: { lines: 85, functions: 85, branches: 75 }`

## Verification Results

```
Tests: 36 passed, 36 total
Coverage: 97.5% lines / 100% functions / 85.24% branches
Thresholds: 85/85/75 — ALL MET
npm run build:check: PASSED
npm run lint: PASSED
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed coverage regex capturing wrong column**
- **Found during:** Task 2 GREEN verification
- **Issue:** Original regex `/All files\s*\|[\s\d.]+\|\s*([\d.]+)\s*\|/` — greedy `[\s\d.]+` consumed columns up to Funcs (90.00) and captured the next separator, returning 76.19 (Branch) instead of 88.10 (Lines)
- **Fix:** Replaced with 4-group explicit capture `/All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/` — group 4 is Lines
- **Files modified:** lib/refinement.ts
- **Commit:** 64ccc5b

**2. [Rule 1 - Bug] Fixed lint count underreporting in test fixture**
- **Found during:** Task 2 GREEN verification
- **Issue:** `ESLINT_OUTPUT_WITH_VIOLATIONS` fixture contained `"3 problems (..."` text which the summary regex matched (3) before counting 4 individual violation lines
- **Fix:** Removed summary text from the fixture; linter also improved the implementation to use `Math.max(individualCount, summaryCount)` for robustness
- **Files modified:** tests/unit/refinement.test.ts, lib/refinement.ts
- **Commit:** 64ccc5b

**3. [Rule 1 - Bug] Fixed `no-useless-assignment` lint error**
- **Found during:** Task 2 lint check
- **Issue:** `let lint_violation_count = 0` was immediately overwritten by `lint_violation_count = Math.max(...)` — ESLint flagged the initial assignment as unused
- **Fix:** Changed to `const lint_violation_count = Math.max(...)` and removed the initial declaration
- **Files modified:** lib/refinement.ts
- **Commit:** 64ccc5b

## Self-Check: PASSED

- lib/refinement.ts: FOUND
- lib/types.ts: FOUND
- tests/unit/refinement.test.ts: FOUND
- jest.config.js: FOUND
- Commit ca564a7 (RED): FOUND
- Commit 64ccc5b (GREEN): FOUND
