# State

**Updated:** 2026-02-20

## Current Position

- **Active phase:** Phase 37 — quickDir Routing & Migration Skill (COMPLETE)
- **Milestone:** v0.2.2 — quickDir Routing Fix & Migration Skill
- **Current Plan:** 37-01 (complete) — 1 of 1 plans
- **Progress:** [==========] 1/1 phases (all complete)
- **Next:** Milestone complete for v0.2.2

## Deferred Validations

| ID | Description | From Phase | Validates At | Status |
|----|-------------|-----------|-------------|--------|
| DEFER-08-01 | User acceptance testing of TUI dashboard commands | Phase 8 | post-v1.0 | PENDING |
| DEFER-30-01 | Full parallel execution with real teammate spawning on Claude Code | Phase 30 | Future | PARTIALLY RESOLVED (v0.2.0, requires Claude Code runtime) |
| DEFER-34-01 | End-to-end command execution with milestone-scoped paths | Phase 34 | Phase 36 | RESOLVED (36-04: init execute-phase, state load, phase-plan-index all produce milestone-scoped paths) |
| DEFER-35-01 | Real-world migration on old-style layout | Phase 35 | Phase 36 | RESOLVED (36-04: migrate-dirs moves 4 directory types, idempotent on re-run) |
| DEFER-35-02 | Milestone completion with new-style layout produces archived.json | Phase 35 | Phase 36 | RESOLVED (36-04: archived.json written, no redundant phase copy) |

## Key Decisions

See `.planning/MILESTONES.md` for historical decisions per milestone.

- **32-01:** No lib/ dependencies in paths.js — reads STATE.md directly to avoid circular imports
- **32-01:** currentMilestone returns 'anonymous' as fallback for all failure cases
- **37-01:** quickDir() now takes optional milestone param, defaulting to currentMilestone(cwd) — consistent with all other dir functions
- **37-01:** cmdMigrateDirs quick/ target changed from hardcoded 'anonymous' to milestone variable
- **33-01:** Filesystem-aware fallback checks milestoneExistsOnDisk before returning new-style paths
- **33-01:** Extracted milestoneExistsOnDisk helper for DRY fallback logic across 6 functions
- **33-01:** Used path.relative(cwd, ...) for findPhaseInternal directory field
- **33-02:** Used getPhaseDirPath(cwd, null, dirName) for cmdPhaseAdd milestone-aware path resolution
- **33-02:** Used path.relative(cwd, dirPath) for JSON directory output fields instead of template literals
- **33-02:** Used getArchivedPhasesDir(cwd, version) for milestone archive path construction
- **33-03:** Used replace_all for 7 identical phasesDir declarations in commands.js
- **33-03:** Used path.relative(cwd, ...) for all output directory fields to derive from resolved paths
- **33-04:** Used fs.existsSync(getXxxDirPath(cwd)) instead of pathExistsInternal for subdirectory existence checks
- **33-04:** Added REQ-56 milestone-scoped path fields to all 14 cmdInit* functions via path.relative
- **33-05:** Added .planning/milestones/anonymous/quick to postinstall DIRECTORIES for quickDir() alignment
- **34-01:** Used init survey for compare-methods since compare-methods is not a standalone init subcommand
- **34-01:** Used init plan-phase for research-phase since it provides phases_dir, phase_dir, and research_dir
- **34-01:** All commands that spawn agents include PATHS blocks in spawn prompts for milestone-scoped path resolution
- **34-02:** Added init calls to pause-work.md and complete-milestone.md for path context
- **34-02:** Added PATHS blocks to spawn prompts in execute-phase and verify-work for subagent path propagation
- **34-02:** Generalized help.md codebase description (no init call, documentation only)
- **34-03:** Used ${research_dir}, ${phases_dir}, ${phase_dir}, ${codebase_dir} variable names consistent with orchestrator PATHS blocks from plan 34-02
- **34-03:** Preserved .planning/ top-level file references (STATE.md, BASELINE.md, etc.) as they are not subdirectory paths targeted by this migration
- **34-04:** No fixups needed — all 9 grep sweeps returned zero results, confirming Plans 01-03 were thorough
- **35-01:** cmdMigrateDirs uses currentMilestone() from paths.js for target milestone detection
- **35-01:** Old directories left empty after migration (not deleted) for backward compat during transition
- **35-01:** Merge strategy: skip entries that already exist at destination rather than overwrite
- **35-01:** quick/ always routes to milestones/anonymous/quick/ regardless of active milestone
- **35-02:** Gather stats from milestonePhaseDir when phasesAlreadyInPlace, avoiding double-read
- **35-02:** Write archived.json inside milestones/{version}/ rather than at milestones/ root for clean scoping
- **35-02:** Include accomplishments array in archived.json for complete milestone record
- **35-03:** Placed migrate-dirs case between scaffold and init cases in routeCommand switch
- **35-03:** Added 3 integration tests: JSON output validation, --raw flag, idempotency
- **36-01:** Resolved STATE.md merge conflicts by preserving Phase 35 COMPLETE status and combined key decisions from both branches
- **36-01:** Resolved ROADMAP.md conflicts by marking both Phase 34 and Phase 35 as Complete
- **36-01:** CHANGELOG.md old-path references confirmed as historical entries — should NOT be modified
- **36-03:** Used milestones/anonymous/ for fixture paths since STATE.md milestone field 'M1: Foundation' has no vX.Y version string
- **36-03:** Regenerated all 74 golden output files (not just 3 targeted) since capture.sh cleans output/ before capture
- **36-03:** Updated todo assertions to milestone-scoped paths to match migrated fixture directory layout
- **36-04:** CHANGELOG.md historical references preserved (lines 10, 200) per REQ-69 exclusion
- **36-04:** lib/ module count updated to 19 (paths.js from Phase 32)
- **36-04:** Fixed 3 worktree-parallel-e2e.test.js failures from Plan 02 fixture migration (Rule 3)
- **36-04:** Ran prettier on 12 test files to resolve formatting drift from Plans 02/03

## Performance Metrics

**Cumulative:**
- Milestones shipped: 11 (v0.0.5 through v0.2.2)
- Total tests: 1,634
- Total lib/ modules: 19

## Quick Tasks Completed

| # | Date | Description | Summary |
|---|------|-------------|---------|
| 1 | 2026-02-20 | Update LT roadmap tutorial with iterative refinement guide | `.planning/quick/1-update-tutorial-of-longterm-roadmap-with/1-SUMMARY.md` |

## Blockers

None.

## Session Continuity

- **Last action:** Executed 37-01-PLAN.md (quickDir routing fix, cmdMigrateDirs fix, migration skill + agent)
- **Stopped at:** Completed 37-01-PLAN.md — Phase 37 complete, 1,634 tests passing
- **Next action:** Milestone complete for v0.2.2
- **Context needed:** Phase 37 complete; quickDir uses currentMilestone; cmdMigrateDirs routes quick/ to milestone; /grd:migrate skill and grd-migrator agent created

---

*State managed by: Claude (grd-executor)*
*Last updated: 2026-02-20T09:38Z*
