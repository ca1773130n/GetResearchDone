---
phase: 12-hierarchical-roadmap-refinement-promotion
plan: 01
subsystem: roadmap
tags: [milestone-refinement, promotion, now-next-later, tdd]

requires:
  - phase: 11-hierarchical-roadmap-schema-commands
    provides: parseLongTermRoadmap, validateLongTermRoadmap, getPlanningMode, generateLongTermRoadmap, formatLongTermRoadmap
provides:
  - getMilestoneTier for tier detection (now/next/later/null)
  - refineMilestone for in-place partial updates to milestone fields
  - promoteMilestone for Later->Next and Next->Now tier transitions
  - updateRefinementHistory for appending dated entries to history table
affects: [12-02-plan, lib/commands.js, bin/grd-tools.js]

tech-stack:
  added: []
  patterns: [in-place markdown section replacement via replaceSubsection helper]

key-files:
  created: []
  modified:
    - lib/long-term-roadmap.js
    - tests/unit/long-term-roadmap.test.js

key-decisions:
  - "In-place markdown editing via replaceSubsection helper rather than serialize/deserialize round-trip"
  - "Later->Next promotion adds TBD placeholders for estimated_start, estimated_duration, and rough_phase_sketch"
  - "Next->Now promotion uses estimated_start as Start date if available, otherwise today's date"

patterns-established:
  - "replaceSubsection pattern for surgical markdown content updates"
  - "Tier-aware heading level detection (### for Now subsections, #### for Next/Later subsections)"

duration: 3min
completed: 2026-02-16
---

# Phase 12 Plan 01: Milestone Refinement & Promotion Data Layer Summary

**Four new exported functions (getMilestoneTier, refineMilestone, promoteMilestone, updateRefinementHistory) implementing Now-Next-Later milestone lifecycle operations with 28 TDD tests and zero regressions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T20:24:15Z
- **Completed:** 2026-02-15T20:27:45Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Implemented getMilestoneTier for tier detection across all three tiers with null safety
- Implemented refineMilestone for in-place partial updates to goal, success_criteria, rough_phase_sketch, open_questions, and open_research_questions
- Implemented promoteMilestone for Later->Next (adding required Next-tier fields) and Next->Now (replacing current Now section)
- Implemented updateRefinementHistory for appending dated rows to the Refinement History table
- 28 new TDD tests covering all functions, error cases, and preservation guarantees
- Total test count: 772 (up from 744), zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: RED -- Write failing tests for refinement and promotion functions** - `22ced5e` (test)
2. **Task 2: GREEN -- Implement refinement and promotion functions** - `8c0c0e9` (feat)

_Note: TDD plan -- test commit followed by implementation commit._

## Files Created/Modified
- `lib/long-term-roadmap.js` - Added 4 exported functions (getMilestoneTier, refineMilestone, promoteMilestone, updateRefinementHistory) plus replaceSubsection helper (329 lines added, now 1034 total)
- `tests/unit/long-term-roadmap.test.js` - Added REFINE_FIXTURE constant and 28 tests across 4 describe blocks (374 lines added)

## Decisions Made
- Used in-place markdown editing via replaceSubsection helper rather than full serialize/deserialize round-trip, preserving exact formatting and content the functions do not touch
- Later->Next promotion fills required Next-tier fields (estimated_start, estimated_duration, rough_phase_sketch) with TBD placeholders
- Next->Now promotion uses the milestone's estimated_start as Start date when available, falling back to today's date

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Ready for 12-02-PLAN.md (CLI commands for milestone refinement and promotion). The data-layer functions are fully implemented and tested. Plan 12-02 will wire these into `lib/commands.js` and `bin/grd-tools.js` CLI routes.

---
*Phase: 12-hierarchical-roadmap-refinement-promotion*
*Completed: 2026-02-16*
