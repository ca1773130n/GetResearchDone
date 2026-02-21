---
phase: 39-completion-flow
plan: 02
subsystem: worktree
tags: [worktree, completion-flow, orchestrator, cli, test-gate]
dependency_graph:
  requires: [runTestGate, cleanupWorktree, mergeWorktree, discardWorktree, keepWorktree]
  provides: [cmdWorktreeComplete]
  affects: [lib/worktree.js, bin/grd-tools.js, tests/unit/worktree.test.js]
tech_stack:
  added: []
  patterns: [orchestrator-pattern, finally-block-cleanup, test-gate-before-action]
key_files:
  created: []
  modified:
    - lib/worktree.js
    - bin/grd-tools.js
    - tests/unit/worktree.test.js
decisions:
  - Used worktreePath() helper for path resolution instead of config.worktree_dir to match cmdWorktreeCreate behavior
  - PR creation logic duplicated from cmdWorktreePushAndPR to avoid nested output()/process.exit calls
  - Cleanup runs in finally block for PR path; merge path cleans up before merging (git requires branch not checked out in a worktree)
  - branch -d (lowercase) used after merge since branch IS merged; discardWorktree uses -D (uppercase) since it may not be
metrics:
  duration: 4min
  completed: 2026-02-21
---

# Phase 39 Plan 02: Worktree Complete Orchestrator Summary

Top-level cmdWorktreeComplete function implementing all 4 completion paths (merge/pr/keep/discard) with test gate enforcement before merge/PR, finally-block cleanup, and CLI routing via `worktree complete` subcommand.

## Task Completion

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Implement cmdWorktreeComplete orchestrator with finally-block cleanup | ed969cb | DONE |
| 2 | Wire CLI routing and add comprehensive tests for all 4 completion paths | 73e444a | DONE |

## What Was Built

### cmdWorktreeComplete(cwd, options, raw)

The top-level orchestrator function that ties together the 5 helper functions from Plan 01:

**Validation:** Requires `action` (merge/pr/keep/discard) and `phase`. Returns structured error JSON for invalid input.

**Keep path:** Calls `keepWorktree()` -- no test gate, no cleanup. Returns `{ action: 'keep', kept: true }`.

**Discard path:** Calls `discardWorktree()` -- no test gate, removes worktree + deletes branch. Returns `{ action: 'discard', discarded: true }`.

**Merge path:**
1. Runs `runTestGate()` -- blocks with `{ blocked: true, reason: 'Test gate failed' }` if tests fail
2. Calls `cleanupWorktree()` BEFORE merge (git refuses to merge while worktree holds branch)
3. Calls `mergeWorktree()` to merge branch into base
4. Deletes branch with `git branch -d` after successful merge
5. Returns `{ action: 'merge', merged: true, test_passed: true }`

**PR path:**
1. Runs `runTestGate()` -- blocks if tests fail
2. Pushes branch from worktree via `execGit`
3. Creates PR via `gh pr create` with title/body/base/head
4. Cleanup runs in `finally` block (even if gh fails)
5. Returns `{ action: 'pr', pr_url, pr_number, test_passed: true }`

### CLI Routing

`worktree complete` subcommand added to `bin/grd-tools.js` with flags:
- `--action` (required): merge, pr, keep, discard
- `--phase` (required): phase number
- `--milestone`: milestone version (optional, defaults from ROADMAP.md)
- `--test-cmd`: custom test command (optional, defaults to `npm test`)
- `--base`: base branch override (optional, defaults from config)
- `--title`: PR title (optional, for pr action)
- `--body`: PR body (optional, for pr action)

## Test Coverage

| Suite | Tests | Status |
|-------|-------|--------|
| cmdWorktreeCreate | 10 | PASS (existing) |
| cmdWorktreeRemove | 5 | PASS (existing) |
| cmdWorktreeList | 4 | PASS (existing) |
| cmdWorktreeRemoveStale | 4 | PASS (existing) |
| cmdWorktreePushAndPR | 9 | PASS (existing) |
| runTestGate | 5 | PASS (existing) |
| cleanupWorktree | 3 | PASS (existing) |
| mergeWorktree | 4 | PASS (existing) |
| discardWorktree | 3 | PASS (existing) |
| keepWorktree | 2 | PASS (existing) |
| cmdWorktreeComplete | 10 | PASS (new) |
| cmdWorktreeComplete with remote | 1 | PASS (new) |
| **Total** | **60** | **ALL PASS** |

**New tests cover:**
- Validation: missing action, invalid action, missing phase, worktree not found (4)
- Keep: worktree left intact (1)
- Discard: worktree removed + branch deleted (1)
- Merge: test gate passes -> merge succeeds -> worktree cleaned (1)
- Merge: test gate fails -> blocked, worktree preserved (1)
- PR: test gate fails -> blocked, worktree preserved (1)
- PR: push fails (no remote) -> error returned with test_passed flag (1)
- PR with remote: push succeeds, gh fails in test env, worktree cleaned up in finally block (1)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used worktreePath() instead of config.worktree_dir for path resolution**
- **Found during:** Task 1 (implementation)
- **Issue:** The plan used `config.worktree_dir || '.worktrees/'` to resolve worktree paths, but `cmdWorktreeCreate` uses the `worktreePath()` helper which resolves to `os.tmpdir()/grd-worktree-{milestone}-{phase}`. Using a different path resolution would cause `cmdWorktreeComplete` to look in the wrong directory for worktrees created by `cmdWorktreeCreate`.
- **Fix:** Used the existing `worktreePath(milestone, phase)` helper for consistent path resolution across all worktree commands.
- **Files modified:** lib/worktree.js
- **Commit:** ed969cb

## Verification

- All 60 worktree tests pass (49 existing + 11 new)
- Full test suite: 1,661 tests, zero regressions
- ESLint passes with no errors
- CLI routing verified: `node bin/grd-tools.js worktree complete --action keep --phase 99 --milestone v0.2.0` returns valid JSON

## Self-Check: PASSED

- lib/worktree.js: EXISTS
- bin/grd-tools.js: EXISTS
- tests/unit/worktree.test.js: EXISTS
- 39-02-SUMMARY.md: EXISTS
- Commit ed969cb: EXISTS (Task 1)
- Commit 73e444a: EXISTS (Task 2)
- cmdWorktreeComplete exported: VERIFIED
- CLI routing wired: VERIFIED
- 60/60 tests pass: VERIFIED
- 1661/1661 full suite pass: VERIFIED
