---
phase: 89-write-intent-manifests-and-wave-builder
plan: "02"
subsystem: autopilot
tags: [wave-builder, conflict-detection, write-intent, parallel-scheduling]
dependency_graph:
  requires: ["89-01"]
  provides: ["buildWaves-conflict-detection", "BuildWavesOptions"]
  affects: ["lib/autopilot.ts", "tests/unit/autopilot.test.ts"]
tech_stack:
  added: []
  patterns: ["post-processing wave split", "greedy bin-packing for file sets"]
key_files:
  created: []
  modified:
    - lib/autopilot.ts
    - tests/unit/autopilot.test.ts
decisions:
  - "splitWave uses greedy first-fit: phases placed into the first sub-wave with no file conflict; simpler and correct for the stated semantics"
  - "Tasks 1 and 2 implemented atomically — conflict detection is integral to the signature change, not a separate step"
  - "BuildWavesOptions interface defined inline in lib/autopilot.ts, not exported separately; tests construct options inline without importing the type"
metrics:
  duration: 85s
  completed: 2026-03-24
  tasks_completed: 3
  files_modified: 2
---

# Phase 89 Plan 02: Write-Intent Conflict Detection in buildWaves Summary

Enhanced `buildWaves()` in `lib/autopilot.ts` to detect same-file conflicts between parallel phases using their `files_modified` declarations, moving conflicting phases into separate waves, with `forceParallel` override.

## Accomplished

- Added `BuildWavesOptions` interface (`filesModified`, `forceParallel`) to `lib/autopilot.ts`
- Extended `buildWaves()` with optional second parameter — backward compatible with all callers
- Implemented `splitWave()` helper using greedy first-fit: each phase is placed into the first sub-wave where none of its files appear, or opens a new sub-wave
- `forceParallel: true` bypasses all conflict detection and returns the raw dependency-graph result
- Added 6 new unit tests covering: backward compat, conflict split, non-overlapping (no split), force-parallel, cascading (3-way), and mixed depends_on + file overlap
- All 5 existing buildWaves tests continue to pass unchanged (11 total pass)
- TypeScript compiles with zero errors

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1+2 | Extend buildWaves signature + conflict detection | 037d11d | lib/autopilot.ts |
| 3 | Add 6 unit tests for wave conflict detection | 2ba8a64 | tests/unit/autopilot.test.ts |

## Deviations from Plan

### Auto-fixed Issues

None.

### Structural Deviation

Tasks 1 and 2 were implemented in a single commit (037d11d) because the `BuildWavesOptions` interface, the updated function signature, and the `splitWave` conflict-detection logic are all interleaved in the same function body — splitting them would have produced a non-compiling intermediate state. This is a cleaner delivery with no impact on the outcome.

## Self-Check

- [x] `lib/autopilot.ts` modified — `buildWaves` and `BuildWavesOptions` at line ~886
- [x] `tests/unit/autopilot.test.ts` modified — 6 new tests after line 855
- [x] Commits 037d11d and 2ba8a64 exist in git log
- [x] `npm run build:check` passes with zero errors
- [x] `npx jest tests/unit/autopilot.test.ts --no-coverage -t "buildWaves"` — 11 passed, 0 failed

## Self-Check: PASSED
