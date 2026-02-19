---
phase: 27-worktree-infrastructure
plan: 01
one-liner: "Git worktree lifecycle module with create, remove, list, and stale cleanup — all 20 tests passing"
subsystem: worktree
tags: [tdd, git-worktree, phase-isolation, infrastructure]
dependency-graph:
  requires: [lib/utils.js]
  provides: [lib/worktree.js, tests/unit/worktree.test.js]
  affects: [bin/grd-tools.js]
tech-stack:
  added: []
  patterns: [porcelain-parsing, tmpdir-symlink-resolution, graceful-idempotent-removal]
key-files:
  created:
    - lib/worktree.js
    - tests/unit/worktree.test.js
  modified: []
key-decisions:
  - "Used fs.realpathSync(os.tmpdir()) to resolve macOS /tmp -> /private/tmp symlink for reliable worktree path matching"
  - "Worktree removal is idempotent: removing non-existent worktree returns success with already_gone flag instead of error"
  - "Locked worktrees are never removed by cmdWorktreeRemoveStale regardless of disk state"
metrics:
  duration: 5min
  completed: 2026-02-19
---

# Phase 27 Plan 01: Worktree Lifecycle Module Summary

Git worktree lifecycle module with create, remove, list, and stale cleanup — all 20 tests passing with zero regressions on 1,453 total tests.

## Tasks

### Task 1: Write failing tests (RED)

**Commit:** `f2acf48`

Created `tests/unit/worktree.test.js` with 20 test cases covering all four exported functions:

- **cmdWorktreeCreate** (7 tests): Creates worktree, validates path/branch/fields, handles duplicate and non-git-repo errors, defaults milestone from ROADMAP.md, validates ISO timestamp
- **cmdWorktreeRemove** (5 tests): Removes by phase identifier or direct path, graceful handling of non-existent worktrees, verifies disk cleanup and git prune
- **cmdWorktreeList** (4 tests): Empty array for no worktrees, lists active GRD worktrees with required fields, filters out main worktree, extracts phase/milestone metadata
- **cmdWorktreeRemoveStale** (4 tests): Empty removal for no stale, removes stale worktrees, respects locked worktrees, batch removal of multiple stale

Test infrastructure: Each test creates an isolated git repo via `createTestGitRepo()` helper, which initializes a real git repo with .planning structure and an initial commit.

### Task 2: Implement lib/worktree.js (GREEN)

**Commit:** `8ddc6dd`

Implemented `lib/worktree.js` (318 lines) with four exported functions:

- **cmdWorktreeCreate(cwd, options, raw)**: Creates git worktree at `os.tmpdir()/grd-worktree-{milestone}-{phase}` with branch from `phase_branch_template` config. Returns JSON with path, branch, phase, milestone, created fields.
- **cmdWorktreeRemove(cwd, options, raw)**: Removes worktree by phase identifier or direct path. Calls `git worktree remove --force` (with `allowBlocked: true` for GRD security policy) followed by `git worktree prune`. Gracefully handles non-existent worktrees.
- **cmdWorktreeList(cwd, raw)**: Parses `git worktree list --porcelain` output, filters to GRD-managed worktrees (tmpdir + grd-worktree- prefix), extracts phase/milestone metadata from directory names.
- **cmdWorktreeRemoveStale(cwd, raw)**: Identifies stale worktrees (disk path missing or empty), removes them while respecting locked worktrees. Returns list of removed paths.

Internal helpers: `realTmpDir()` (cached macOS symlink resolution), `worktreePath()`, `worktreeBranch()`, `parsePorcelainWorktrees()`, `parseWorktreeName()`, `getGrdWorktrees()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] macOS tmpdir symlink resolution**
- **Found during:** Task 2 (GREEN phase, initial test run)
- **Issue:** On macOS, `os.tmpdir()` returns `/var/folders/...` but git resolves worktree paths to `/private/var/folders/...`, causing the `getGrdWorktrees` filter to miss all GRD worktrees
- **Fix:** Added `realTmpDir()` helper that uses `fs.realpathSync(os.tmpdir())` with memoization; updated all path comparisons to use resolved path
- **Files modified:** `lib/worktree.js`, `tests/unit/worktree.test.js`
- **Commit:** `8ddc6dd`

## Verification

- **Level 1 (Sanity):** `lib/worktree.js` exports all four functions (cmdWorktreeCreate, cmdWorktreeRemove, cmdWorktreeList, cmdWorktreeRemoveStale). Tests file has 20 test cases.
- **Level 2 (Proxy):** All 20 worktree tests pass. Full suite: 1,453 tests passing with zero regressions.
- **Level 3 (Deferred):** End-to-end worktree creation during actual execute-phase (Phase 31).

## Self-Check: PASSED

- FOUND: lib/worktree.js (318 lines, min 100)
- FOUND: tests/unit/worktree.test.js (475 lines, min 150)
- FOUND: 27-01-SUMMARY.md
- FOUND: f2acf48 (RED commit)
- FOUND: 8ddc6dd (GREEN commit)
- PASS: All 4 exports verified (cmdWorktreeCreate, cmdWorktreeRemove, cmdWorktreeList, cmdWorktreeRemoveStale)
- PASS: 20 worktree tests passing, 1453 total tests, zero regressions
