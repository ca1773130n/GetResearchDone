---
phase: 33-lib-module-migration
plan: 04
subsystem: lib
tags: [migration, paths, context, cleanup, roadmap, tracker, REQ-56]
dependency_graph:
  requires: [33-01]
  provides: [context.js-paths, cleanup.js-paths, roadmap.js-paths, tracker.js-paths, REQ-56-init-json]
  affects: [commands, agents]
tech_stack:
  added: []
  patterns: [paths.js-delegation, milestone-scoped-paths, backward-compatible-fallback]
key_files:
  created: []
  modified:
    - lib/context.js
    - lib/cleanup.js
    - lib/roadmap.js
    - lib/tracker.js
decisions:
  - Used fs.existsSync(getXxxDirPath(cwd)) instead of pathExistsInternal for subdirectory existence checks
  - Used path.relative(cwd, absolutePath) for all milestone-scoped path fields in JSON output
  - Added REQ-56 fields to all 14 cmdInit* functions for comprehensive coverage
  - cmdInitMapCodebase omits codebase_dir from REQ-56 block since it already has it from Part A
metrics:
  duration: 11min
  completed: 2026-02-20
---

# Phase 33 Plan 04: Context/Cleanup/Roadmap/Tracker Module Migration Summary

Migrated 21+ hardcoded `.planning/` subdirectory path constructions across 4 modules (context.js, cleanup.js, roadmap.js, tracker.js) to use centralized paths.js calls, and enriched all 14 cmdInit* JSON outputs with milestone-scoped path fields (REQ-56).

## What Changed

### Task 1: Migrate lib/context.js and enrich init JSON output (REQ-56)

**Commit:** `72f3e35`

- Added `require('./paths')` import with 6 path functions (getPhasesDirPath, getResearchDirPath, getCodebaseDirPath, getTodosDirPath, getQuickDirPath, getMilestonesDirPath)
- Replaced 15+ `path.join(cwd, '.planning', ...)` constructions across cmdInitNewProject, cmdInitNewMilestone, cmdInitQuick, cmdInitTodos, cmdInitMilestoneOp, cmdInitMapCodebase, cmdInitProgress, cmdInitResearchWorkflow, cmdInitPlanMilestoneGaps
- Replaced 6 `pathExistsInternal(cwd, '.planning/...')` calls with `fs.existsSync(getXxxDirPath(cwd))` for subdirectory existence checks (codebase, todos, todos/pending, phases, research/*)
- Added `phases_dir`, `research_dir`, `codebase_dir`, `quick_dir`, `todos_dir` fields to all 14 cmdInit* functions using `path.relative(cwd, ...)` for milestone-scoped paths

**Files modified:** `lib/context.js`

### Task 2: Migrate lib/cleanup.js, lib/roadmap.js, lib/tracker.js

**Commit:** `e1e9b95`

- **cleanup.js:** Replaced 2 `path.join(cwd, '.planning', 'phases')` with `getPhasesDirPath(cwd)` in analyzeChangelogDrift and generateCleanupPlan
- **roadmap.js:** Replaced 2 `path.join(cwd, '.planning', 'phases')` with `getPhasesDirPath(cwd)` in cmdPhaseNextDecimal and analyzeRoadmap
- **tracker.js:** Replaced 2 `path.join(cwd, '.planning', 'phases')` with `getPhasesDirPath(cwd)` in sync-phase and prepare-phase-sync subcommands

**Files modified:** `lib/cleanup.js`, `lib/roadmap.js`, `lib/tracker.js`

## Verification Results

| Check | Result |
|-------|--------|
| Zero `path.join(cwd, '.planning', 'phases/todos/quick/codebase/milestones/research')` in all 4 files | PASS |
| Zero `pathExistsInternal(cwd, '.planning/{phases,todos,codebase,research}')` in context.js | PASS |
| context.test.js (46 tests) | PASS |
| cleanup.test.js (55 tests) | PASS |
| roadmap.test.js (36 tests) | PASS |
| tracker.test.js (58 tests) | PASS |
| Full test suite (1,615 tests) | PASS |
| ESLint | PASS |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- [x] lib/context.js modified and committed (72f3e35)
- [x] lib/cleanup.js modified and committed (e1e9b95)
- [x] lib/roadmap.js modified and committed (e1e9b95)
- [x] lib/tracker.js modified and committed (e1e9b95)
- [x] All 1,615 tests pass
- [x] Zero hardcoded `.planning/` subdirectory path constructions remain
- [x] All 14 cmdInit* functions include REQ-56 milestone-scoped path fields
