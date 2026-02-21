---
phase: 47-integration-regression-testing
plan: 03
subsystem: testing
tags: [integration-tests, worktree-isolation, native-mode, manual-mode, cross-module]
dependency_graph:
  requires: [context.js, parallel.js, backend.js, worktree.js]
  provides: [cross-module-isolation-integration-tests]
  affects: [worktree-parallel-e2e.test.js]
tech_stack:
  added: []
  patterns: [cross-module-integration-testing, fixture-git-repo-pattern]
key_files:
  created: []
  modified:
    - tests/integration/worktree-parallel-e2e.test.js
    - lib/parallel.js
decisions:
  - "Fixed detectBackend() missing cwd parameter in cmdInitExecuteParallel (Rule 1 bug fix)"
  - "Used createTestGitRepo pattern for Phase 47 fixtures instead of createFixtureDir since cmdInitExecutePhase requires git repos"
metrics:
  duration: 3min
  completed: 2026-02-22
---

# Phase 47 Plan 03: Cross-Module Native/Manual Isolation Integration Tests Summary

9 new cross-module integration tests validating native (claude) and manual (codex) worktree isolation pipelines end-to-end with zero regressions on all 25 existing integration tests.

## Completed Tasks

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Run existing integration tests and verify zero regressions | (verification only, no file changes) | DONE |
| 2 | Add cross-module native/manual isolation integration tests | 19c9e7d | DONE |

## Key Changes

### New Integration Tests (9 tests in 3 groups)

**Group 1: Native isolation end-to-end (claude backend)**
- `cmdInitExecutePhase reports native isolation for claude backend` -- verifies backend=claude, native_worktree_available=true, isolation_mode=native, main_repo_path set
- `buildParallelContext with nativeWorktreeAvailable=true produces null worktree_path` -- verifies worktree_path=null, native_isolation=true, worktree_branch still computed
- `cmdInitExecuteParallel wires native isolation from capabilities into parallel context` -- verifies full pipeline: init -> capabilities -> parallel context

**Group 2: Manual isolation end-to-end (codex backend)**
- `cmdInitExecutePhase reports manual isolation for codex backend` -- verifies backend=codex, native_worktree_available=false, isolation_mode=manual, main_repo_path set
- `buildParallelContext with nativeWorktreeAvailable=false pre-computes worktree_path` -- verifies worktree_path contains `.worktrees/grd-worktree-`, native_isolation=false
- `cmdInitExecuteParallel wires manual isolation from capabilities into parallel context` -- verifies full pipeline with codex config

**Group 3: Isolation mode consistency across modules**
- `branching_strategy=none produces isolation_mode=none regardless of backend` -- verifies isolation_mode=none and main_repo_path=null when branching disabled
- `all four backends have correct native_worktree_isolation capability` -- loops over claude/codex/gemini/opencode, verifies only claude is true
- `native and manual paths agree between cmdInitExecutePhase and buildParallelContext` -- verifies the two modules are wired together correctly for both backends

### Bug Fix (Rule 1)

**cmdInitExecuteParallel missing cwd in detectBackend() call**
- `lib/parallel.js` line 204: `detectBackend()` was called without `cwd`, causing it to ignore the project's config.json `backend` override
- Fixed to `detectBackend(cwd)` so the backend detection uses the correct project configuration
- This ensures cmdInitExecuteParallel correctly passes nativeWorktreeAvailable to buildParallelContext based on the project's configured backend

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing cwd parameter in cmdInitExecuteParallel**
- **Found during:** Task 2
- **Issue:** `detectBackend()` on line 204 of parallel.js was called without `cwd`, ignoring the project's config.json backend override
- **Fix:** Changed to `detectBackend(cwd)` to correctly read the backend from the project's configuration
- **Files modified:** lib/parallel.js
- **Commit:** 19c9e7d

## Test Results

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total integration tests | 25 | 34 | +9 |
| Passing tests | 25 | 34 | +9 |
| Failing tests | 0 | 0 | 0 |
| Test suites | 1 | 1 | 0 |

## Verification

- Level 1 (Sanity): All 34 tests pass (`npx jest tests/integration/worktree-parallel-e2e.test.js --verbose`)
- Existing test count preserved: 25 original tests untouched
- Native path tested: claude -> native_worktree_available=true -> isolation_mode=native -> worktree_path=null
- Manual path tested: codex -> native_worktree_available=false -> isolation_mode=manual -> worktree_path set
- Cross-module consistency validated between context.js and parallel.js
- parallel.js unit tests (39) all pass after bug fix

## Self-Check: PASSED

- [x] tests/integration/worktree-parallel-e2e.test.js exists and contains 9 new tests
- [x] lib/parallel.js has the detectBackend(cwd) fix
- [x] Commit 19c9e7d exists in git log
- [x] All 34 integration tests pass
- [x] All 39 parallel.js unit tests pass
