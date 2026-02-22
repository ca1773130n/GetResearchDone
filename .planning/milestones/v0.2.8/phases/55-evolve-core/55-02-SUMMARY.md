---
phase: 55-evolve-core
plan: 02
subsystem: evolve
tags: [discovery, scoring, priority-selection, codebase-analysis]

# Dependency graph
requires:
  - phase: 55-01
    provides: "Evolve state layer (createWorkItem, mergeWorkItems, advanceIteration, state I/O)"
provides:
  - "Discovery engine: analyzeCodebaseForItems() scanning 6 dimensions"
  - "Scoring heuristic: scoreWorkItem() with dimension/effort/source weights"
  - "Priority selection: selectPriorityItems() for top-N ordering"
  - "Discovery orchestrator: runDiscovery() with merge and dedup support"
affects: [55-03-cli-entry, 56-evolve-orchestrator, 57-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dimension-based discovery with independent try/catch per dimension"
    - "Deterministic scoring heuristic: dimension_weight + effort_modifier + source_modifier"
    - "Stable sort selection for consistent priority ordering"

key-files:
  created: []
  modified:
    - "lib/evolve.js"
    - "tests/unit/evolve.test.js"
    - "jest.config.js"

key-decisions:
  - "Discovery uses pure fs analysis (no LLM calls, no subprocesses) for determinism"
  - "Scoring formula: quality=10, stability=9, consistency=7, productivity=6, usability=5, new-features=3; effort small=3/medium=2/large=1; source bugfix=5/discovery=2/carryover=1"
  - "Internal helpers (discoverProductivityItems etc.) are NOT exported -- only 4 public functions"

patterns-established:
  - "Defensive try/catch per discovery dimension: one failing dimension does not block others"
  - "Fixture-based testing: create controlled temp directories with known code patterns for deterministic discovery tests"

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 55 Plan 02: Discovery Engine & Priority Selection Summary

**Deterministic codebase discovery engine scanning 6 dimensions with scoring heuristic and priority selection, finding 298 improvement items on the GRD codebase itself**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-22T10:41:50Z
- **Completed:** 2026-02-22T10:46:48Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Implemented 6-dimension discovery engine (productivity, quality, usability, consistency, stability, new-features) with per-dimension defensive try/catch
- Built deterministic scoring heuristic combining dimension weight, effort modifier, and source modifier into a single priority score
- Implemented selectPriorityItems for top-N selection with stable sort and runDiscovery orchestrator with merge/dedup support
- Added 21 new tests (48 total) with controlled fixture directories, achieving 87.5% line coverage
- Added evolve.js coverage threshold to jest.config.js

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement discovery engine and scoring heuristic** - `aee29ad` (feat)
2. **Task 2: Add discovery and selection tests** - `12cb653` (test)

## Files Created/Modified

- `lib/evolve.js` - Extended with discovery engine (6 internal helpers), scoring heuristic (scoreWorkItem), priority selection (selectPriorityItems), and orchestrator (runDiscovery). Now 834 lines.
- `tests/unit/evolve.test.js` - Extended with 21 new tests across 4 describe blocks (analyzeCodebaseForItems, scoreWorkItem, selectPriorityItems, runDiscovery). Now 679 lines.
- `jest.config.js` - Added evolve.js coverage threshold (85% lines, 94% functions, 65% branches)

## Decisions Made

1. **Pure filesystem analysis for discovery** - No LLM calls, no subprocess spawning. Uses fs.readFileSync and regex matching for deterministic, fast analysis.
2. **Scoring weights chosen for correctness-first priority** - Quality (10) and stability (9) rank highest because they affect correctness. New-features (3) ranks lowest as least urgent.
3. **Internal discovery helpers not exported** - Only 4 public functions (analyzeCodebaseForItems, scoreWorkItem, selectPriorityItems, runDiscovery) to keep the API surface clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable lint error**
- **Found during:** Task 1
- **Issue:** `const lines = content.split('\n')` was assigned but never used in discoverUsabilityItems
- **Fix:** Removed the unused variable declaration
- **Files modified:** lib/evolve.js
- **Verification:** `npx eslint lib/evolve.js` passes cleanly
- **Committed in:** aee29ad (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** None - minor cleanup, plan executed as designed

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 (CLI entry points) can now wire the discovery engine into `/grd:evolve` command
- Phase 56 (Evolve Orchestrator) can call `runDiscovery()` to populate iterations
- All 4 new functions are exported and tested, ready for integration
- DEFER-55-01 (discovery quality on non-trivial codebase) remains tracked for Phase 57

## Self-Check: PASSED

- lib/evolve.js: FOUND (834 lines, min 300)
- tests/unit/evolve.test.js: FOUND (679 lines, min 300)
- jest.config.js: FOUND
- 55-02-SUMMARY.md: FOUND
- Commit aee29ad: FOUND
- Commit 12cb653: FOUND
- lib/evolve.js line coverage: 87.5% (target >85%)
- All 48 tests pass

---
*Phase: 55-evolve-core*
*Completed: 2026-02-22*
