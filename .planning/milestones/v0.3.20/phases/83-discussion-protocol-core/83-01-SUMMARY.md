---
phase: 83-discussion-protocol-core
plan: 01
subsystem: types
tags: [typescript, types, paths, discussion]

# Dependency graph
requires:
  - phase: 82-discussion-infrastructure
    provides: BackendResponse, BackendId, DiscussionConfig, BackendAvailability types

provides:
  - DiscussionRoundEntry discriminated union type in lib/types.ts
  - DiscussionResult interface in lib/types.ts
  - RunDiscussionOptions interface in lib/types.ts
  - discussionsDir() path helper in lib/paths.ts

affects:
  - 83-discussion-protocol-core plan 02 (runDiscussion() implementation)
  - 84-workflow-integration (uses DiscussionResult in orchestration)
  - 85-mcp-tools-cli-testing (uses RunDiscussionOptions in MCP tools)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discriminated union for round entries: BackendResponse | { backend, skipped, reason }"
    - "Optional milestone parameter pattern (milestone?: string | null) in path helpers"

key-files:
  created:
    - .planning/milestones/v0.3.20/phases/83-discussion-protocol-core/83-01-SUMMARY.md
  modified:
    - lib/types.ts
    - lib/paths.ts
    - tests/unit/paths.test.ts

key-decisions:
  - "DiscussionRoundEntry is a discriminated union (BackendResponse | skipped entry) — check 'skipped' in entry to distinguish variants"
  - "discussionsDir() follows existing todosDir() pattern with optional milestone? parameter and currentMilestone() fallback"
  - "planningDir() tests added to restore pre-existing functions: 100% threshold (was failing at 93.75% before this plan)"

patterns-established:
  - "Discriminated union pattern for success/skip variants in round entries"

# Metrics
duration: 27min
completed: 2026-03-23
---

# Phase 83 Plan 01: Discussion Types and Path Helper Summary

**Type contracts for runDiscussion() established: DiscussionRoundEntry discriminated union, DiscussionResult and RunDiscussionOptions interfaces in lib/types.ts, plus discussionsDir() path helper in lib/paths.ts with 100% function coverage.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-03-23T09:25:23Z
- **Completed:** 2026-03-23T09:51:43Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Added `DiscussionRoundEntry` discriminated union (`BackendResponse | { backend, skipped, reason }`) to lib/types.ts
- Added `DiscussionResult` interface with `topic`, `participants`, `rounds`, `synthesis`, `duration_ms`, `discussion_file` to lib/types.ts
- Added `RunDiscussionOptions` interface with `rounds`, `synthesizer`, `timeout_per_round_seconds`, `cwd`, `phase`, `type`, `milestone` to lib/types.ts
- Added `discussionsDir(cwd, milestone?)` to lib/paths.ts following the `todosDir()` pattern
- Added 4 tests for `discussionsDir` and 2 tests for pre-existing `planningDir` to achieve functions: 100% coverage
- TypeScript build passes, lint passes, all 57 paths tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add DiscussionResult, DiscussionRoundEntry, RunDiscussionOptions to lib/types.ts** - `bca3c3b` (feat)
2. **Task 2: Add discussionsDir() to lib/paths.ts with test coverage** - `b9983ec` (feat)

## Files Created/Modified

- `lib/types.ts` — Added DiscussionRoundEntry, DiscussionResult, RunDiscussionOptions with JSDoc
- `lib/paths.ts` — Added discussionsDir() function and module.exports entry
- `tests/unit/paths.test.ts` — Added planningDir describe block (2 tests) and discussionsDir describe block (4 tests)

## Decisions Made

- `DiscussionRoundEntry` uses a discriminated union pattern — callers check `'skipped' in entry` to distinguish success from skip variants. This is more idiomatic TypeScript than a `success` boolean field.
- `discussionsDir()` follows the exact `todosDir()` pattern: `milestone == null` check + `currentMilestone(cwd)` fallback + `path.join(milestoneRoot(...), 'discussions')`.
- Added `planningDir` tests to fix a pre-existing coverage gap (93.75% functions → 100%) that would have violated the threshold after adding `discussionsDir`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Tests] Added planningDir() tests to fix pre-existing functions coverage gap**
- **Found during:** Task 2 (add discussionsDir() with test coverage)
- **Issue:** lib/paths.ts functions coverage was already at 93.75% before this plan (planningDir had no tests). Adding discussionsDir without also fixing planningDir would leave coverage at 94.11% — still below the 100% threshold.
- **Fix:** Added `describe('planningDir')` block with 2 tests to cover the function. Both tests follow the milestonesDir pattern.
- **Files modified:** tests/unit/paths.test.ts
- **Verification:** `npx jest tests/unit/paths.test.ts --coverage` shows functions: 100%
- **Committed in:** b9983ec (part of task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical test coverage)
**Impact on plan:** Positive — coverage threshold now fully satisfied.

## Issues Encountered

`git stash` during pre-existing-test investigation caused worktree files to revert. Changes were reapplied from scratch. No data loss.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `DiscussionResult`, `DiscussionRoundEntry`, `RunDiscussionOptions` are ready for import in Plan 02's `runDiscussion()` implementation
- `discussionsDir()` is ready for use as the output directory path in Plan 02
- TypeScript type contracts are stable; Plan 02 can import with full type safety
- No blockers

---
*Phase: 83-discussion-protocol-core*
*Completed: 2026-03-23*
