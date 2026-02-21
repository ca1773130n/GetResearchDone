---
phase: 46
plan: 02
subsystem: worktree
tags: [worktree, branch-handling, hooks, backward-compatible]
dependency_graph:
  requires: [lib/worktree.js, lib/utils.js]
  provides: [flexible-branch-merge, enriched-hook-remove]
  affects: [execute-phase-orchestrator, worktree-hook-handlers]
tech_stack:
  added: []
  patterns: [optional-parameter-override, graceful-metadata-extraction]
key_files:
  created: []
  modified:
    - lib/worktree.js
    - tests/unit/worktree.test.js
decisions:
  - "options.branch overrides computed worktreeBranch in cmdWorktreeMerge — backward compatible"
  - "cmdWorktreePushAndPR already reads branch from worktree HEAD — no change needed"
  - "parseWorktreeName reused for hook remove metadata extraction — no new parser"
metrics:
  duration: 2min
  completed: 2026-02-21
---

# Phase 46 Plan 02: Flexible Branch Handling & Hook Extension Summary

Worktree merge function accepts arbitrary branch names via options.branch override, and hook remove handler extracts phase/milestone metadata from GRD-pattern worktree paths for downstream consumption.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add explicit branch parameter to cmdWorktreeMerge | 0b2ae9a | lib/worktree.js, tests/unit/worktree.test.js |
| 2 | Extend cmdWorktreeHookRemove with state cleanup info | e49701e | lib/worktree.js, tests/unit/worktree.test.js |

## Changes Made

### Task 1: Explicit Branch Parameter

**cmdWorktreeMerge** now accepts `options.branch` to directly specify the phase branch name, bypassing the GRD template computation. This is essential when Claude Code creates worktrees natively with its own branch naming convention.

- Single-line change: `const phaseBranch = options.branch || worktreeBranch(...)` replaces the unconditional computation
- `options.phase` remains required for the merge commit message
- Fully backward compatible: omitting `options.branch` preserves existing behavior

**cmdWorktreePushAndPR** was verified to already handle arbitrary branch names correctly. Lines 408-412 read the branch via `git rev-parse --abbrev-ref HEAD` in the worktree, falling back to the computed branch only if HEAD parse fails. A new test confirms this by renaming the worktree branch to a non-GRD name and verifying the function picks it up.

### Task 2: Enriched Hook Remove

**cmdWorktreeHookRemove** now extracts phase and milestone metadata from the worktree path when it follows the GRD naming pattern (`grd-worktree-{milestone}-{phase}`). The enriched output includes `phase_detected` and `milestone_detected` fields that downstream consumers (orchestrators, monitoring) can use to correlate worktree removal with specific phases.

- Reuses the existing `parseWorktreeName` helper (no new parsing logic)
- Best-effort: wrapped in try/catch, non-GRD paths simply omit metadata fields
- Handles null/undefined worktree paths gracefully

## Test Results

- **Before:** 52 tests passing
- **After:** 58 tests passing (+6 new)
- **Regressions:** 0

### New Tests

| Test | Description |
|------|-------------|
| cmdWorktreeMerge: explicit options.branch | Merges custom-named branch using options.branch override |
| cmdWorktreeMerge: regression without options.branch | Verifies computed branch still works when options.branch omitted |
| cmdWorktreePushAndPR: reads from HEAD | Confirms arbitrary branch name read from worktree HEAD |
| cmdWorktreeHookRemove: GRD-pattern extraction | Verifies phase_detected and milestone_detected from GRD path |
| cmdWorktreeHookRemove: non-GRD path | Confirms metadata omitted for non-GRD worktree paths |
| cmdWorktreeHookRemove: null path | Confirms graceful handling of null worktree path |

## Verification

- Level 1 (Sanity): All files parse, lint passes with zero errors
- Level 2 (Proxy): 58/58 tests pass, covering both explicit and computed branch paths, enriched and plain hook remove output
- Level 3 (Deferred): Full completion flow integration with native worktree branch names (Phase 47)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
