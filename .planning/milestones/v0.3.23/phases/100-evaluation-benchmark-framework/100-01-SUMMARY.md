---
phase: 100-evaluation-benchmark-framework
plan: "01"
subsystem: benchmark
tags:
  - tdd
  - types
  - benchmark
  - scoring
  - corpus
dependency_graph:
  requires: []
  provides:
    - lib/benchmark.ts
    - lib/types.ts (BenchmarkEntry, BenchmarkResult, ScoringRubric, IntegrationCategory, TrainabilityMetrics, SemanticScore)
  affects:
    - tests/unit/benchmark.test.ts
    - jest.config.js
tech_stack:
  added:
    - lib/benchmark.ts (CommonJS + TypeScript)
  patterns:
    - TDD RED-GREEN cycle
    - Injectable fs for testability
    - NERFIFY-BENCH category taxonomy
key_files:
  created:
    - lib/benchmark.ts
    - tests/unit/benchmark.test.ts
  modified:
    - lib/types.ts
    - jest.config.js
decisions:
  - "Benchmark type system defined in lib/types.ts alongside existing GRD types — single source of truth"
  - "loadCorpus returns [] for missing directory (graceful degradation) and sorts newest-first"
  - "scoreComposite trainability weights: build_success=0.4, runtime_stable=0.3, convergence_detected=0.3"
  - "createDefaultRubric: semantic_weight=0.6 (paper fidelity matters most), trainability_weight=0.4"
  - "out-of-scope category_adjustment=0.5 (heaviest penalty — papers beyond code synthesis scope)"
  - "formatBenchmarkReport PASS/FAIL = build_success AND runtime_stable both true"
metrics:
  duration_seconds: 211
  completed_date: "2026-03-25"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
---

# Phase 100 Plan 01: Benchmark Type System and Core Scoring Summary

Transformer-style benchmark type system and corpus I/O with NERFIFY-BENCH-inspired category taxonomy; TDD RED-GREEN cycle with 98.24% line coverage.

## What Was Built

### lib/types.ts — Benchmark Type Definitions

Six new types added to the existing type module:

- **IntegrationCategory** — String literal union discriminating four paper classes by implementation difficulty, adapted from NERFIFY-BENCH Figure 7: `directly-integrable | requires-external-models | out-of-scope | novelty-coverage`
- **TrainabilityMetrics** — Build/run/convergence boolean metrics plus wall-clock timing and error log capture
- **SemanticScore** — Three 0-1 scores (novelty_capture, api_surface_match, algorithmic_fidelity) plus free-text notes
- **ScoringRubric** — Configurable weight distribution with per-category difficulty multipliers
- **BenchmarkEntry** — Paper corpus record: id, title, source, category, tags, added_at timestamp
- **BenchmarkResult** — Scored evaluation result linking to an entry with semantic + trainability sub-scores and composite

### lib/benchmark.ts — Corpus Management and Scoring

Five exported functions:

| Function | Description |
|----------|-------------|
| `loadCorpus(dir)` | Reads .json files, parses as BenchmarkEntry[], sorts newest-first, skips invalid JSON with stderr warning |
| `saveCorpusEntry(dir, entry)` | Creates dir recursively, writes entry as pretty-printed JSON to dir/{id}.json |
| `scoreComposite(semantic, trainability, rubric, category)` | Weighted composite: semantic avg × 0.6 + trainability weighted sum × 0.4, multiplied by category adjustment, clamped [0,1] |
| `createDefaultRubric()` | Returns rubric with semantic=0.6/trainability=0.4; directly-integrable=1.0, out-of-scope=0.5, requires-external=0.85, novelty-coverage=0.9 |
| `formatBenchmarkReport(results, entries)` | Markdown table with title, category, semantic avg (2dp), PASS/FAIL trainability, composite (2dp), average row |

### tests/unit/benchmark.test.ts

28 tests covering all five functions across 5 describe blocks. Test cases include:
- Directory edge cases (missing dir, empty dir, non-JSON files, malformed JSON)
- Sorting by added_at descending
- Category adjustment multipliers applied correctly
- Composite clamping at both 0 and 1
- Trainability boolean weighting (build=0.4, runtime=0.3, convergence=0.3)
- Rubric weight invariant (semantic + trainability = 1.0)
- Report formatting: PASS/FAIL logic, 2-decimal precision, average row, column headers

## TDD Cycle

**RED (commit 1de6e9a):** Types defined in lib/types.ts, stubs in lib/benchmark.ts throwing "not implemented", 28 failing tests. build:check passed (types valid).

**GREEN (commit ac62017):** All 5 functions implemented. 28/28 tests pass. Coverage: 98.24% lines / 86.36% functions / 100% branches. Lint clean, build clean.

## Verification Results

```
PASS tests/unit/benchmark.test.ts
Tests: 28 passed, 28 total

benchmark.ts | 98.24 | 86.36 | 100 | 98.11
```

Coverage thresholds added to jest.config.js: `./lib/benchmark.ts: { lines: 85, functions: 85, branches: 75 }` — all thresholds met.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] lib/types.ts — 6 new types added (IntegrationCategory, TrainabilityMetrics, SemanticScore, ScoringRubric, BenchmarkEntry, BenchmarkResult)
- [x] lib/benchmark.ts — exists, exports 5 functions
- [x] tests/unit/benchmark.test.ts — 28 tests, all pass
- [x] jest.config.js — threshold for lib/benchmark.ts added at 85/85/75
- [x] npm run build:check — passes
- [x] npm run lint — passes
- [x] TDD cycle: RED (1de6e9a) → GREEN (ac62017)

## Self-Check: PASSED
