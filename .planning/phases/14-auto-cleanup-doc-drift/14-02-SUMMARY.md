---
phase: 14-auto-cleanup-doc-drift
plan: 02
subsystem: quality-analysis
tags: [cleanup-plan, auto-generation, phase-completion, threshold]

# Dependency graph
requires:
  - phase: 14-auto-cleanup-doc-drift
    plan: 01
    provides: "lib/cleanup.js with doc drift detection functions and quality analysis orchestrator"
provides:
  - "generateCleanupPlan — auto-generates cleanup PLAN.md when quality issues exceed configurable threshold"
  - "cmdPhaseComplete cleanup plan integration — non-blocking plan generation after quality analysis"
  - "cleanup_plan_generated field in phase completion JSON output with path and issue count"
affects: [phase-completion, cleanup-workflow, plan-generation]

# Tech tracking
tech-stack:
  added: []
  patterns: ["threshold-gated auto-generation", "non-blocking secondary operations in phase completion", "sequential plan numbering by directory scan"]

key-files:
  created: []
  modified:
    - lib/cleanup.js
    - lib/phase.js
    - tests/unit/cleanup.test.js
    - tests/unit/phase.test.js

key-decisions:
  - "cleanup_threshold defaults to 5 when not specified in config"
  - "generateCleanupPlan is non-blocking in phase completion (try/catch swallows errors)"
  - "cleanup_plan_generated field conditionally spread (absent when no plan generated)"
  - "Tasks grouped into code quality (complexity/dead exports/file size) and doc drift categories"

patterns-established:
  - "Threshold-gated generation: check issue count vs configurable threshold before generating artifacts"
  - "Non-blocking secondary operations: cleanup plan generation follows same pattern as quality analysis"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 14 Plan 02: Auto-Generated Cleanup Plans Summary

**Implemented generateCleanupPlan function that auto-generates standard-format cleanup PLAN.md files when quality issues exceed a configurable threshold (default 5), wired non-blockingly into phase completion with 22 new tests across 901 total passing tests.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T04:01:24Z
- **Completed:** 2026-02-16T04:06:13Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments
- Implemented `generateCleanupPlan(cwd, phaseNum, qualityReport)` in lib/cleanup.js that generates valid PLAN.md with YAML frontmatter
- Added configurable `cleanup_threshold` (default 5) to CLEANUP_DEFAULTS and config schema
- Tasks in generated plans grouped into code quality issues and doc drift categories
- Plan numbering is sequential based on existing plans in the phase directory
- Wired into `cmdPhaseComplete` with non-blocking try/catch after quality analysis
- Phase completion JSON output includes `cleanup_plan_generated` field with path, plan_number, and issues_addressed
- Raw output appends cleanup plan path when generated

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement generateCleanupPlan and add config threshold support** - `8f46cfe` (feat)
2. **Task 2: Wire generateCleanupPlan into cmdPhaseComplete and add integration tests** - `4a76d89` (feat)

## Files Created/Modified
- `lib/cleanup.js` - Added generateCleanupPlan function (~130 lines), updated CLEANUP_DEFAULTS with cleanup_threshold, updated JSDoc, added to exports (now 9 exported functions)
- `lib/phase.js` - Updated import to include generateCleanupPlan, added non-blocking plan generation after quality analysis, added cleanup_plan_generated to result object and raw output
- `tests/unit/cleanup.test.js` - Added 14 new tests for generateCleanupPlan, updated 3 getCleanupConfig assertions for new default field (60 total tests)
- `tests/unit/phase.test.js` - Added 8 new integration tests for cleanup plan generation in phase completion (54 total tests)

## Decisions Made
- **cleanup_threshold defaults to 5:** Reasonable default that avoids generating cleanup plans for minor issues while catching significant quality degradation
- **Non-blocking generation:** Consistent with Phase 13 pattern where quality analysis errors do not block phase completion
- **Conditional spread for cleanup_plan_generated:** Clean JSON output; field absent (not null) when no plan generated, matching quality_report pattern
- **Task grouping:** Code quality issues (complexity, dead exports, file size) combined into one task, doc drift into another, keeping generated plans concise

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated getCleanupConfig test assertions for new cleanup_threshold default**
- **Found during:** Task 1
- **Issue:** Adding cleanup_threshold to CLEANUP_DEFAULTS broke 3 existing getCleanupConfig tests that used exact object equality
- **Fix:** Updated expected objects in 3 tests to include `cleanup_threshold: 5`
- **Files modified:** tests/unit/cleanup.test.js
- **Committed in:** 8f46cfe (part of task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug fix)
**Impact on plan:** Minimal - straightforward test assertion update

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- lib/cleanup.js exports 9 functions (8 from Plan 01 + generateCleanupPlan)
- `cmdPhaseComplete` now: runs quality analysis -> generates cleanup plan if threshold exceeded -> includes both in output
- Phase 14 is fully complete: doc drift detection (Plan 01) and auto-generated cleanup plans (Plan 02)
- Test count: 901 total (879 baseline + 14 generateCleanupPlan + 8 phase integration), zero regressions
- Ready for Phase 15 (deferred validations) which can validate cleanup workflow end-to-end

---
*Phase: 14-auto-cleanup-doc-drift*
*Completed: 2026-02-16*
