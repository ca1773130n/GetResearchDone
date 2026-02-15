---
phase: 12-hierarchical-roadmap-refinement-promotion
plan: 02
subsystem: roadmap
tags: [milestone-refinement, promotion, cli, now-next-later]

requires:
  - phase: 12-hierarchical-roadmap-refinement-promotion
    provides: refineMilestone, promoteMilestone, getMilestoneTier, updateRefinementHistory
provides:
  - CLI subcommand `tier` for milestone tier detection
  - CLI subcommand `refine` for in-place partial milestone updates
  - CLI subcommand `promote` for Later->Next and Next->Now tier transitions
  - CLI subcommand `history` for appending refinement history entries
  - 24 comprehensive tests covering all 4 new subcommands
affects: [orchestrator-agents, /grd:refine-milestone, /grd:promote-milestone]

tech-stack:
  added: []
  patterns: [CLI flag parsing via local flag() helper for new subcommands]

key-files:
  created: []
  modified:
    - lib/commands.js
    - bin/grd-tools.js
    - tests/unit/commands.test.js

key-decisions:
  - "Structured JSON output includes content field with full updated markdown for downstream write"
  - "Promote subcommand calls getMilestoneTier on result to report new_tier in output"
  - "Refine subcommand reports updated_fields array from Object.keys(updates)"

patterns-established:
  - "CLI subcommand pattern: read file -> call lib function -> check for error object -> output result"
  - "Error object detection via typeof check and .error property presence"

duration: 3min
completed: 2026-02-16
---

# Phase 12 Plan 02: Refinement & Promotion CLI Commands Summary

**Four new CLI subcommands (tier, refine, promote, history) wiring the data-layer functions into the long-term-roadmap CLI router with 24 tests and 796 total passing tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T20:30:15Z
- **Completed:** 2026-02-15T20:33:15Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `tier` subcommand for detecting which tier (now/next/later/null) a milestone belongs to
- Added `refine` subcommand for applying partial in-place updates to milestone fields via JSON input
- Added `promote` subcommand for moving milestones between tiers (Later->Next, Next->Now)
- Added `history` subcommand for appending dated refinement history entries
- All 4 subcommands support both JSON and --raw output modes
- 24 new CLI tests covering happy paths, error cases, raw mode, and file-missing scenarios
- Total test count: 796 (up from 772), zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend cmdLongTermRoadmap with refine/promote/tier/history subcommands** - `ae9dfbc` (feat)
2. **Task 2: Add comprehensive tests for refine/promote/tier/history CLI subcommands** - `483821c` (test)

## Files Created/Modified
- `lib/commands.js` - Extended cmdLongTermRoadmap with 4 new case blocks and updated import to include refineMilestone, promoteMilestone, getMilestoneTier, updateRefinementHistory (98 lines added)
- `bin/grd-tools.js` - Updated usage string to include refine, promote, tier, history subcommands
- `tests/unit/commands.test.js` - Added 24 tests across 4 describe blocks (tier: 6, refine: 7, promote: 6, history: 5) plus updated edge case (348 lines added)

## Decisions Made
- Structured JSON output includes the full updated markdown `content` field so downstream agents can write the file directly
- Promote subcommand calls getMilestoneTier on the updated result to report `new_tier` in output JSON
- Refine subcommand reports `updated_fields` array derived from Object.keys(updates) for audit trail

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Phase 12 is now complete. Both plans (data layer + CLI commands) are done. The refinement and promotion CLI subcommands are ready for integration into `/grd:refine-milestone` and `/grd:promote-milestone` orchestrator agents. End-to-end orchestrator flows are deferred to Phase 15 (integration).

---
*Phase: 12-hierarchical-roadmap-refinement-promotion*
*Completed: 2026-02-16*
