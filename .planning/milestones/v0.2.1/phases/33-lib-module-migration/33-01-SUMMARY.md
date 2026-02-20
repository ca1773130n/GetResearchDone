---
phase: 33-lib-module-migration
plan: 01
subsystem: lib
tags: [paths, migration, backward-compat, fallback]
dependency_graph:
  requires: [32-01]
  provides: [backward-compatible-paths, utils-migrated, state-migrated, gates-migrated]
  affects: [lib/paths.js, lib/utils.js, lib/state.js, lib/gates.js, tests/unit/paths.test.js]
tech_stack:
  added: []
  patterns: [filesystem-aware-fallback, renamed-import-alias]
key_files:
  created: []
  modified:
    - lib/paths.js
    - lib/utils.js
    - lib/state.js
    - lib/gates.js
    - tests/unit/paths.test.js
decisions:
  - id: 33-01-D1
    summary: "Filesystem-aware fallback checks milestoneExistsOnDisk before returning new-style paths"
    rationale: "Avoids breaking 1,608+ existing tests that create fixtures at .planning/phases/"
  - id: 33-01-D2
    summary: "Extracted milestoneExistsOnDisk helper for DRY fallback logic across 6 functions"
    rationale: "Consistent fallback behavior and single point of change for Phase 35 migration"
  - id: 33-01-D3
    summary: "Used path.relative(cwd, ...) for findPhaseInternal directory field"
    rationale: "Layout-agnostic relative path computation works regardless of old or new hierarchy"
metrics:
  duration: 12min
  completed: 2026-02-20
---

# Phase 33 Plan 01: Foundational Module Migration to paths.js Summary

Backward-compatible fallback in paths.js with 3 foundational modules (utils, state, gates) migrated from hardcoded path constructions to centralized path resolution.

## What Was Done

### Task 1: Backward-Compatible Fallback in paths.js (cd5cbc9)

Added filesystem-aware fallback logic to `lib/paths.js`. Six functions (`phasesDir`, `phaseDir`, `researchDir`, `codebaseDir`, `todosDir`, `quickDir`) now check whether the milestone directory (`.planning/milestones/{milestone}/`) exists on disk before returning paths:

- **If milestone directory exists:** Returns new-style path (e.g., `.planning/milestones/v0.2.1/phases/`)
- **If milestone directory does not exist:** Falls back to old-style path (e.g., `.planning/phases/`)

Extracted `milestoneExistsOnDisk(cwd, milestone)` helper for DRY fallback logic. Updated 38 paths tests to verify both fallback and new-style behavior.

### Task 2: Migrate utils.js, state.js, gates.js (ee40b2a)

Migrated 3 foundational modules to import from `paths.js` instead of using hardcoded `path.join(cwd, '.planning', 'phases')`:

- **lib/utils.js** (2 changes): `findPhaseInternal` uses `getPhasesDirPath(cwd)` for phase directory resolution, and `directory:` field uses `path.relative(cwd, ...)` for layout-agnostic relative path output.
- **lib/state.js** (1 change): `cmdStateUpdateProgress` uses `getPhasesDirPath(cwd)` for counting summaries across phases.
- **lib/gates.js** (5 changes): All 5 gate functions (`checkOrphanedPhases`, `checkPhaseInRoadmap`, `checkPhaseHasPlans`, `checkNoStaleArtifacts`, `checkOldPhasesArchived`) use `getPhasesDirPath(cwd)`.

All 3 modules use renamed import `const { phasesDir: getPhasesDirPath } = require('./paths')` to avoid collision with local `phasesDir` variable names.

## Verification Results

- **Level 1 (Sanity):** Zero occurrences of `path.join(cwd, '.planning', 'phases')` in utils.js, state.js, gates.js
- **Level 2 (Proxy):** 200 tests pass across paths (38), utils (87), state (38), gates (37) with zero regressions; 475+ tests pass across 8 independent test suites

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase 32 output not available in worktree branch**
- **Found during:** Pre-task setup
- **Issue:** Phase 33 branch was created before Phase 32 execution; `lib/paths.js` did not exist in the worktree
- **Fix:** Merged `grd/v0.2.1/32-centralized-path-resolution-module` branch into `grd/v0.2.1/33-lib-module-migration`
- **Commit:** 98c7f1c (merge commit)

## Self-Check: PASSED

- [x] lib/paths.js exists with fallback logic
- [x] lib/utils.js imports from paths.js
- [x] lib/state.js imports from paths.js
- [x] lib/gates.js imports from paths.js
- [x] tests/unit/paths.test.js updated with fallback tests
- [x] Commit cd5cbc9 exists (Task 1)
- [x] Commit ee40b2a exists (Task 2)
