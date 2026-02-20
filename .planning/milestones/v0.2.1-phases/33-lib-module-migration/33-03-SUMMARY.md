---
phase: 33-lib-module-migration
plan: 03
subsystem: lib
tags: [paths, migration, commands, scaffold]
dependency_graph:
  requires: [33-01]
  provides: [commands-migrated, scaffold-migrated]
  affects: [lib/commands.js, lib/scaffold.js]
tech_stack:
  added: []
  patterns: [centralized-path-resolution, path-relative-for-output]
key_files:
  created: []
  modified: [lib/commands.js, lib/scaffold.js]
key_decisions:
  - Used replace_all for 7 identical phasesDir declarations in commands.js
  - Used path.relative(cwd, ...) for all output directory fields to derive from resolved paths
  - Reused pendingDir variable for todo path output derivation
duration: 6min
completed: 2026-02-20
---

# Phase 33 Plan 03: Commands and Scaffold Module Migration Summary

**Migrated 16 hardcoded path constructions in commands.js and 4 in scaffold.js to centralized paths.js calls with zero test regressions across 1,615 tests.**

## Performance

- **Duration:** 6 minutes
- **Tasks:** 2/2 completed
- **Files modified:** 2

## Accomplishments

- Eliminated all 12 `path.join(cwd, '.planning', ...)` path constructions in `lib/commands.js` (7 phasesDir, 2 todosDir, 2 milestonesDir, plus 1 todo pending subdir)
- Migrated 3 hardcoded string literals in output objects (`directory:` and `path:` fields) to `path.relative(cwd, ...)` derivations from resolved paths
- Eliminated all 2 `path.join(cwd, '.planning', ...)` path constructions in `lib/scaffold.js` (1 phasesDir, 1 researchDir)
- Migrated 2 hardcoded string literals in scaffold output objects to `path.relative()` derivations
- Both modules now import from `require('./paths')` establishing the centralized path resolution pattern

## Task Commits

1. **Task 1: Migrate all hardcoded paths in commands.js** - `2395800`
2. **Task 2: Migrate all hardcoded paths in scaffold.js** - `4f0c704`

## Files Created/Modified

- `lib/commands.js` - Added paths.js require; replaced 12 path.join constructions and 3 string literals with paths.js calls
- `lib/scaffold.js` - Added paths.js require; replaced 2 path.join constructions and 2 string literals with paths.js calls

## Verification Results

### Level 1 (Sanity)

- `grep -rn "path.join.*\.planning.*(phases|todos|milestones|research)" lib/commands.js lib/scaffold.js` -- ZERO results
- Both files have `require('./paths')` imports confirmed

### Level 2 (Proxy)

- `npx jest tests/unit/commands.test.js` -- 185 tests pass
- `npx jest tests/unit/scaffold.test.js` -- 14 tests pass
- `npm test` -- 1,615 tests pass, 32 test suites, zero regressions

## Deviations from Plan

None -- plan executed exactly as written.

## Next Phase Readiness

- `lib/commands.js` and `lib/scaffold.js` are fully migrated to paths.js
- Plan 04 (context.js, verify.js, roadmap.js migration) can proceed -- these modules still have hardcoded paths
- Plan 05 (remaining modules) depends on 04

## Self-Check: PASSED
