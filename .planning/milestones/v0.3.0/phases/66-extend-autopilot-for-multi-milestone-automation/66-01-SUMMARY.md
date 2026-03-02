---
phase: 66-extend-autopilot-for-multi-milestone-automation
plan: 01
subsystem: autopilot
tags: [autopilot, multi-milestone, orchestration, typescript]

requires:
  - phase: 61-integration-autonomous-layer-migration
    provides: "TypeScript autopilot.ts module with typed spawn helpers"
provides:
  - "runMultiMilestoneAutopilot function for cross-milestone automation"
  - "isMilestoneComplete helper for milestone completion detection"
  - "resolveNextMilestone helper for LONG-TERM-ROADMAP.md resolution"
  - "buildNewMilestonePrompt and buildMilestoneCompletePrompt prompt builders"
  - "MultiMilestoneOptions, MilestoneStepResult, MultiMilestoneResult types"
affects: [autopilot-cli, multi-milestone-command]

tech-stack:
  added: []
  patterns:
    - "Multi-milestone loop with maxMilestones safety cap"
    - "Fresh state re-read each iteration (no stale caches)"
    - "Reuse of existing runAutopilot for per-milestone phase processing"

key-files:
  created: []
  modified:
    - lib/autopilot.ts
    - lib/types.ts

key-decisions:
  - "Milestone completion uses deterministic grd-tools command via claude -p (no direct LLM for archiving)"
  - "New milestone creation uses claude -p with /grd:new-milestone skill (LLM needed for research/requirements)"
  - "resolveNextMilestone reads LONG-TERM-ROADMAP.md directly -- returns null if no LT roadmap exists"
  - "maxMilestones defaults to 10 as safety cap against infinite loops"
  - "Multi-milestone loop delegates to existing runAutopilot for per-milestone work (no duplication)"

patterns-established:
  - "Multi-milestone orchestration: complete -> archive -> resolve next -> create -> loop"

duration: 3min
completed: 2026-03-03
---

# Phase 66 Plan 01: Multi-Milestone Autopilot Core Summary

**Added multi-milestone orchestration to autopilot with cross-milestone boundary automation, safety caps, and LT roadmap integration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T15:34:07Z
- **Completed:** 2026-03-02T15:37:30Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- Added 3 new TypeScript interfaces (MultiMilestoneOptions, MilestoneStepResult, MultiMilestoneResult) to lib/types.ts
- Implemented 5 new functions in lib/autopilot.ts: runMultiMilestoneAutopilot orchestration loop plus 4 helper functions
- Zero any types, zero lint errors, zero type-check errors, all 85 existing tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add multi-milestone types and helper functions** - `c0af266` (feat)
2. **Task 2: Implement runMultiMilestoneAutopilot orchestration loop** - `21a900d` (feat)

## Files Created/Modified

- `lib/types.ts` - Added MultiMilestoneOptions, MilestoneStepResult, MultiMilestoneResult interfaces
- `lib/autopilot.ts` - Added 5 new functions: isMilestoneComplete, resolveNextMilestone, buildNewMilestonePrompt, buildMilestoneCompletePrompt, runMultiMilestoneAutopilot; added imports for parseLongTermRoadmap and getMilestoneInfo

## Decisions Made

- **Milestone completion via deterministic command:** The milestone complete step uses grd-tools.js milestone complete (no LLM needed for archiving). The prompt instructs claude -p to run the deterministic command and verify.
- **New milestone via LLM skill:** New milestone creation requires research, requirements, and roadmap setup, so it uses the /grd:new-milestone skill through claude -p.
- **LT roadmap as next-milestone source:** resolveNextMilestone reads LONG-TERM-ROADMAP.md to determine the next milestone. Returns null if no LT roadmap exists, gracefully stopping the loop.
- **Safety cap defaults:** maxMilestones defaults to 10 to prevent runaway loops. Each iteration re-reads roadmap state for fresh data.
- **Delegation pattern:** runMultiMilestoneAutopilot delegates per-milestone phase processing to the existing runAutopilot function, avoiding code duplication.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Core multi-milestone orchestration is ready for CLI integration (Plan 02)
- All 5 new functions exported and type-safe
- Comprehensive test coverage deferred to Plan 03

## Self-Check

- [x] lib/autopilot.ts exists and contains all 5 new functions
- [x] lib/types.ts exports all 3 new interfaces
- [x] Commit c0af266 exists (Task 1)
- [x] Commit 21a900d exists (Task 2)
- [x] tsc --noEmit passes
- [x] 85 existing autopilot tests pass
- [x] eslint passes on both files

## Self-Check: PASSED

---
*Phase: 66-extend-autopilot-for-multi-milestone-automation*
*Completed: 2026-03-03*
