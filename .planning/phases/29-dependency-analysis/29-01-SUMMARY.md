---
phase: 29-dependency-analysis
plan: 01
subsystem: dependency-analysis
tags: [tdd, graph-algorithms, topological-sort, cycle-detection]
dependency_graph:
  requires: [lib/roadmap.js, lib/utils.js]
  provides: [lib/deps.js]
  affects: [tests/unit/deps.test.js]
tech_stack:
  added: []
  patterns: [kahn-algorithm, dfs-cycle-detection, pure-function-extraction]
key_files:
  created:
    - lib/deps.js
    - tests/unit/deps.test.js
  modified:
    - lib/roadmap.js
key_decisions:
  - Extracted analyzeRoadmap from cmdRoadmapAnalyze as pure-return function for reuse without process.exit
  - Used Kahn's algorithm for topological sort by levels to compute parallel groups
  - DFS-based cycle detection with path reconstruction for clear error reporting
  - Removed unused error import after confirming cmdPhaseAnalyzeDeps uses output() for all paths
metrics:
  duration: 4min
  completed: 2026-02-19
---

# Phase 29 Plan 01: Dependency Analysis Core Module Summary

TDD implementation of lib/deps.js providing phase dependency graph construction, parallel group computation via Kahn's algorithm, and DFS cycle detection for ROADMAP.md phase dependencies.

## What Was Done

### Task 1: Write failing tests (RED)
- Created `tests/unit/deps.test.js` with 27 test cases across 5 describe blocks
- parseDependsOn (7 tests): single/multiple phase refs, "Nothing", null, empty, non-comma, decimal
- buildDependencyGraph (5 tests): no deps, linear chain, diamond, node fields, edge fields
- computeParallelGroups (6 tests): independent, linear, diamond, v0.2.0 structure, empty, single
- detectCycle (4 tests): acyclic, two-node cycle, three-node cycle, diamond
- cmdPhaseAnalyzeDeps (5 tests): fixture roadmap, acyclic, missing, cyclic, all-phases-present
- All tests failed with "Cannot find module" (RED confirmed)
- Commit: `83536b2`

### Task 2: Implement lib/deps.js (GREEN)
- Extracted `analyzeRoadmap(cwd)` from `cmdRoadmapAnalyze` in `lib/roadmap.js` as a pure-return function
- `cmdRoadmapAnalyze` became a thin wrapper: calls `analyzeRoadmap` then `output()`
- Created `lib/deps.js` with 5 exported functions:
  - `parseDependsOn(str)` — regex extraction of Phase N references
  - `buildDependencyGraph(phases)` — nodes/edges from phase array, filters dangling refs
  - `computeParallelGroups(graph)` — Kahn's algorithm topological sort by levels
  - `detectCycle(graph)` — DFS with state tracking and cycle path reconstruction
  - `cmdPhaseAnalyzeDeps(cwd, raw)` — CLI command calling analyzeRoadmap internally
- Fixed lint: removed unused `error` import
- All 27 new tests pass, full suite 1514 tests, zero regressions
- Commit: `e73f8fd`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused error import**
- **Found during:** Task 2
- **Issue:** ESLint caught `error` imported from utils.js but never used (cmdPhaseAnalyzeDeps uses `output()` for error paths, matching codebase convention)
- **Fix:** Changed `const { output, error } = require('./utils')` to `const { output } = require('./utils')`
- **Files modified:** lib/deps.js
- **Commit:** e73f8fd (included in GREEN commit)

## Key Metrics

| Metric | Value |
|--------|-------|
| New tests | 27 |
| Total tests | 1514 |
| Test delta | +27 |
| lib/deps.js lines | 252 |
| tests/unit/deps.test.js lines | 415 |
| Regressions | 0 |

## Self-Check

```
FOUND: lib/deps.js
FOUND: tests/unit/deps.test.js
FOUND: 83536b2
FOUND: e73f8fd
```

## Self-Check: PASSED
