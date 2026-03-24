---
phase: 87-post-phase-pipeline-core
plan: 01
subsystem: autopilot
tags: [prompt-builders, subprocess, code-review, simplify]

requires:
  - phase: 86-elicitation-detection-and-resolution-core
    provides: subprocess spawn patterns and env stripping in lib/autopilot.ts
provides:
  - buildSimplifyPrompt() for code quality review subprocess
  - buildCodeReviewPrompt() for PR review subprocess
  - buildConflictResolvePrompt() for rebase conflict resolution subprocess
affects: [phase-88, phase-91]

tech-stack:
  added: []
  patterns: [prompt-builder functions for claude -p subprocesses]

key-files:
  created: []
  modified: [lib/autopilot.ts, tests/unit/autopilot.test.ts]

key-decisions:
  - "Prompt builders are pure functions returning strings — no subprocess spawning logic"
  - "Env stripping handled centrally in _buildSpawnConfig, not per-prompt"
  - "buildConflictResolvePrompt included as a companion to the rebase step"

duration: 0min
completed: 2026-03-24
---

# Phase 87 Plan 01: Prompt Builders Summary

**Three prompt builder functions for post-phase pipeline subprocess steps — simplify, code review, and conflict resolution — all using centralized env stripping via `_buildSpawnConfig()`.**

## Performance

- **Duration:** Pre-implemented (found in existing codebase)
- **Tasks:** 4/4 complete
- **Files modified:** 2

## Accomplishments
- `buildSimplifyPrompt(phaseNum)` targets git diff for code quality review (line 364)
- `buildCodeReviewPrompt(prUrl)` targets PR diff for BLOCKER/WARNING findings (line 369)
- `buildConflictResolvePrompt(phaseNum)` resolves rebase conflicts preserving intent (line 374)
- Unit tests verify each builder includes expected parameters

## Task Commits

Implementation was pre-existing in the codebase:

1. **Task 1-3: Prompt builders** - Already in lib/autopilot.ts (lines 364-376)
2. **Task 4: Unit tests** - Already in tests/unit/autopilot.test.ts (lines 3117-3135)

## Files Created/Modified
- `lib/autopilot.ts` - Three prompt builder functions (lines 364-376)
- `tests/unit/autopilot.test.ts` - Tests for prompt builders (lines 3117-3135)

## Decisions Made
None - functions followed established patterns from buildPlanPrompt/buildExecutePrompt.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Ready for plan 87-02 (runPostPhasePipeline orchestrator).

---
*Phase: 87-post-phase-pipeline-core*
*Completed: 2026-03-24*
