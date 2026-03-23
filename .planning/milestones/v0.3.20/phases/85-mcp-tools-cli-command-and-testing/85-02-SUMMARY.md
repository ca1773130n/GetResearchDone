---
phase: 85-mcp-tools-cli-command-and-testing
plan: 02
subsystem: testing
tags: [jest, coverage, discussion, integration-test, mcp]

requires:
  - phase: 85-01
    provides: discussion module (lib/discussion.ts) with all exported functions

provides:
  - tests/unit/discussion.test.ts expanded to 100% line/branch/function coverage
  - tests/integration/discussion-e2e.test.ts validating full discussion pipeline

affects:
  - future phases modifying lib/discussion.ts (coverage thresholds enforced)

tech-stack:
  added: []
  patterns:
    - "Integration testbed pattern: tmp directory with .planning/config.json + STATE.md for real path resolution"
    - "Binary-expr branch coverage: explicit null/undefined + falsy-fallback tests for all ternary chains"

key-files:
  created:
    - tests/integration/discussion-e2e.test.ts
  modified:
    - tests/unit/discussion.test.ts

key-decisions:
  - "Removed unused mockResponse helper from discussion.test.ts (pre-existing lint error, Rule 1 auto-fix)"
  - "Integration test mocks execFileSync + detectAvailableBackends but uses real fs/paths modules for true E2E path resolution"
  - "Unknown dispatch error fallback tested via Object.defineProperty to clear message+stderr without throw-literal lint violation"

duration: 25min
completed: 2026-03-23
---

# Phase 85 Plan 02: Discussion Testing Summary

**Expanded discussion.ts unit tests to 100% coverage across all metrics and created a full pipeline E2E integration test with 3 scenarios using mocked CLIs.**

## Performance

- **Duration:** 25 min
- **Completed:** 2026-03-23
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- Expanded tests/unit/discussion.test.ts from 82.73% branch coverage to 100% lines/branches/functions (added 20 targeted tests covering all uncovered binary-expr and ternary branches)
- Created tests/integration/discussion-e2e.test.ts with 3 E2E test cases: full 2-round pipeline, pipeline with unavailable participant producing skipped entries, and config-driven runPrePlanningDiscussion
- Fixed pre-existing lint error (unused mockResponse helper) as Rule 1 auto-fix
- Total test count: 3,557 passing (up from 3,177 baseline, confirming DEFER-84-03)

## Task Commits

1. **Task 1: Expand unit tests to cover remaining branches and edge cases** - 3804b84 (test)
2. **Task 2: Create integration test for full discussion pipeline** - 12c644a (feat)

## Files Created/Modified

- tests/unit/discussion.test.ts: Added 20 tests covering Unknown dispatch error fallback, parseJSONFromResponse with array/non-object input, reviewPlanViaBackend/reviewCodeViaBackend/reviewPRViaBackend with invalid severity, null/undefined fields, non-array inputs, missing summary; removed unused mockResponse helper
- tests/integration/discussion-e2e.test.ts: New file; 3 test cases using testbed pattern with real tmp directory and mocked CLIs

## Decisions Made

- Used real fs module (not mocked) in integration test to verify actual file writes to disk
- Integration test mocks only execFileSync and lib/backend.detectAvailableBackends, leaving all path resolution (discussionsDir, currentMilestone) real for true integration coverage
- Removed unused mockResponse helper (pre-existing lint error, never called anywhere in the test file)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused mockResponse helper causing lint error**
- **Found during:** Task 1 (expand unit tests)
- **Issue:** function mockResponse() was defined on line 64 of the original test file but never called (pre-existing lint error)
- **Fix:** Removed the 5-line unused function block
- **Files modified:** tests/unit/discussion.test.ts
- **Commit:** 3804b84 (included in task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** None — change reduced lint errors, no behavior change

## Issues Encountered

The @typescript-eslint/no-throw-literal rule prevented throwing a plain object in the Unknown dispatch error test. Resolved by using Object.defineProperty to set empty message and stderr properties on a proper Error instance, achieving the same branch coverage without the lint violation.

## Self-Check

- tests/unit/discussion.test.ts exists and passes: 126 tests
- tests/integration/discussion-e2e.test.ts exists and passes: 3 tests
- Coverage: lines=100%, branches=100%, functions=100%
- npm run lint passes (0 errors in test files)
- npm run build:check passes
- Task commits: 3804b84, 12c644a

## Self-Check: PASSED

## Next Phase Readiness

- Phase 85 plan 02 complete - all discussion tests written and passing
- DEFER-84-03 resolved: integration test confirms full discussion pipeline E2E
- No blockers for shipping v0.3.20

---
Phase: 85-mcp-tools-cli-command-and-testing
Completed: 2026-03-23
