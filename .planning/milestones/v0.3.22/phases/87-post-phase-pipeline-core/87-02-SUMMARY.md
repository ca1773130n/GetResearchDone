---
phase: 87-post-phase-pipeline-core
plan: 02
subsystem: autopilot
tags: [pipeline, orchestrator, rebase, merge, PR, worktree]

requires:
  - phase: 87-post-phase-pipeline-core
    provides: prompt builders (buildSimplifyPrompt, buildCodeReviewPrompt, buildConflictResolvePrompt)
provides:
  - runPostPhasePipeline() 4-step sequential pipeline orchestrator
  - spawnStep() unified scheduler/direct subprocess helper
  - PostPipelineResult interface
  - --skip-post-pipeline flag
  - Integration into runAutopilot loop
affects: [phase-88, phase-90, phase-91]

tech-stack:
  added: []
  patterns: [sequential pipeline with per-step failure reporting, rebase-then-force-push-then-merge]

key-files:
  created: []
  modified: [lib/autopilot.ts, tests/unit/autopilot.test.ts]

key-decisions:
  - "Pipeline steps are serialized — no parallelism within a single phase pipeline"
  - "Rebase uses --force-with-lease for safety on push after rebase"
  - "PR merge via gh pr merge --merge --delete-branch cleans up remote branch"
  - "spawnStep helper unifies scheduler vs direct spawn to reduce branching"

duration: 0min
completed: 2026-03-24
---

# Phase 87 Plan 02: Pipeline Orchestrator Summary

**`runPostPhasePipeline()` orchestrates simplify → PR creation → code review → rebase+merge with per-step failure reporting, conflict resolution subprocess, and `--skip-post-pipeline` escape hatch.**

## Performance

- **Duration:** Pre-implemented (found in existing codebase)
- **Tasks:** 5/5 complete
- **Files modified:** 2

## Accomplishments
- `spawnStep()` unifies scheduler/direct subprocess spawning (line 387)
- `PostPipelineResult` interface with status, failedStep, prUrl, reason (line 408)
- `runPostPhasePipeline()` full 4-step pipeline (lines 421-542)
- Pipeline integrated into runAutopilot loop (lines 1243-1275)
- `--skip-post-pipeline` flag parsed in cmdAutopilot and cmdMultiMilestoneAutopilot
- 3 unit tests for pipeline failure scenarios (lines 3525-3590)

## Task Commits

Implementation was pre-existing in the codebase:

1. **Task 1: spawnStep helper** - lib/autopilot.ts lines 387-406
2. **Task 2: PostPipelineResult** - lib/autopilot.ts lines 408-414
3. **Task 3: runPostPhasePipeline** - lib/autopilot.ts lines 421-542
4. **Task 4: Autopilot integration** - lib/autopilot.ts lines 1243-1275
5. **Task 5: Unit tests** - tests/unit/autopilot.test.ts lines 3525-3590

## Files Created/Modified
- `lib/autopilot.ts` - Pipeline orchestrator, spawnStep, PostPipelineResult (lines 387-542, 1243-1275)
- `tests/unit/autopilot.test.ts` - Pipeline failure tests (lines 3525-3590)

## Decisions Made
- `--force-with-lease` used for rebased branch push (safer than --force)
- `gh pr merge --merge --delete-branch` for cleanup after merge
- Pipeline serialized in autopilot loop (comment at line 1244 explains why)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Phase 87 complete. Ready for Phase 88 (Serial Merge Queue and Conflict Resolution).

---
*Phase: 87-post-phase-pipeline-core*
*Completed: 2026-03-24*
