---
phase: 73-testing-documentation
plan: 01
subsystem: testing
tags: [tests, backend, capabilities, effort-levels]
dependency-graph:
  requires: [71-01, 71-02, 71-03]
  provides: [test-coverage-effort-hooks-cron]
  affects: [backend-test-suite]
tech-stack:
  added: []
  patterns: [test.each-matrix, eslint-disable-next-line]
key-files:
  modified:
    - tests/unit/backend.test.ts
decisions:
  - Used test.each matrix pattern (matching existing resolveBackendModel tests) for effort level coverage
  - Added eslint-disable-next-line for intentional null/undefined type coercion in edge case tests
metrics:
  duration: 2min
  completed: 2026-03-11
---

# Phase 73 Plan 01: Backend Capability Flag & Effort Level Test Coverage

Added 20 new tests covering the three Phase 71 capability flags (effort, http_hooks, cron) and comprehensive effort level resolution across 6 agent roles and 3 profiles, bringing backend test count from 121 to 141.

## Task Completion

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Add capability flag tests for effort, http_hooks, cron | a671fb8 | Done |
| 2 | Add effort level resolution tests | c6387d9 | Done |

## What Was Done

### Task 1: Capability Flag Tests
- Updated the `requiredKeys` array in the BACKEND_CAPABILITIES describe block to include `effort`, `http_hooks`, and `cron`
- Added new describe block "BACKEND_CAPABILITIES effort/http_hooks/cron per backend" with 9 individual tests:
  - Claude has effort=true, http_hooks=true, cron=true
  - Codex, Gemini, OpenCode all have effort=false
  - getBackendCapabilities function returns correct values including fallback for unknown backends

### Task 2: Effort Level Resolution Tests
- Replaced basic resolveEffortLevel tests with comprehensive test.each matrix covering 18 cases:
  - 6 agent roles (planner, executor, verifier, deep-diver, product-owner, code-reviewer)
  - 3 profiles each (quality, balanced, budget)
- Added edge cases: unknown agent returns 'medium', null/undefined inputs return 'medium'
- All assertions use exact expected values from EFFORT_PROFILES constant

## Verification

- `npx jest tests/unit/backend.test.ts`: 141 tests pass, 0 failures
- No new lint errors introduced (pre-existing lint warnings unchanged)
- Test count increase: +20 tests (121 -> 141)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lint errors from `as any` casts**
- **Found during:** Task 2
- **Issue:** `undefined as any` and `null as any` triggered `@typescript-eslint/no-explicit-any` lint errors
- **Fix:** Added `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments for intentional type coercion in edge case tests
- **Files modified:** tests/unit/backend.test.ts
- **Commit:** c6387d9

## Self-Check: PASSED
