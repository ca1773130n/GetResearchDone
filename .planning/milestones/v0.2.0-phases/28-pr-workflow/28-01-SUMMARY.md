---
phase: 28-pr-workflow
plan: 01
subsystem: worktree
tags: [worktree, pr-creation, gh-cli, mcp, tdd]
dependency_graph:
  requires: [lib/utils.js, lib/worktree.js (existing)]
  provides: [cmdWorktreePushAndPR, worktree push-pr CLI, grd_worktree_push_pr MCP]
  affects: [bin/grd-tools.js, lib/mcp-server.js]
tech_stack:
  added: [gh CLI integration (execFileSync)]
  patterns: [structured error JSON on failure, push_succeeded flag for partial success]
key_files:
  created: []
  modified:
    - lib/worktree.js
    - bin/grd-tools.js
    - lib/mcp-server.js
    - tests/unit/worktree.test.js
decisions:
  - Read branch from worktree HEAD instead of recomputing from slug to avoid mismatch
  - gh CLI errors return push_succeeded flag so orchestrators know push worked even if PR failed
  - PR title/body included in error response for retry without recomputation
metrics:
  duration: 5min
  completed: 2026-02-19
---

# Phase 28 Plan 01: PR Creation Function Summary

cmdWorktreePushAndPR function with structured error handling, CLI routing, and MCP descriptor — all paths return JSON (no crashes).

## Tasks Completed

| Task | Name | Type | Commit | Files |
|------|------|------|--------|-------|
| 1 | Write failing tests for cmdWorktreePushAndPR (RED) | test | 616ea56 | tests/unit/worktree.test.js |
| 2 | Implement cmdWorktreePushAndPR + CLI + MCP (GREEN) | feat | 9cd4547 | lib/worktree.js, bin/grd-tools.js, lib/mcp-server.js |

## What Was Built

### cmdWorktreePushAndPR (lib/worktree.js)

Pushes the worktree branch to origin and creates a GitHub PR via the gh CLI. Key design:

- Reads the actual branch name from the worktree's HEAD (`git rev-parse --abbrev-ref HEAD`) rather than recomputing from slug, avoiding branch name mismatches
- Uses `execGit` with `allowBlocked: true` for push (respects GRD security policy)
- Uses `execFileSync('gh', ...)` directly for PR creation
- Push failure returns `{ error: "Failed to push branch", details }` (exit 0, JSON)
- gh failure returns `{ error: "Failed to create PR", push_succeeded: true, title, body, ... }` (exit 0, JSON)
- Success returns `{ pr_url, pr_number, branch, base, title, body, phase, milestone }`

### CLI: worktree push-pr (bin/grd-tools.js)

Subcommand `worktree push-pr` with flags:
- `--phase` (required) — Phase number
- `--milestone` — Milestone version (defaults from ROADMAP.md)
- `--title` — Custom PR title
- `--body` — Custom PR body markdown
- `--base` — Base branch for PR target (defaults from config.base_branch)

### MCP: grd_worktree_push_pr (lib/mcp-server.js)

Registered in COMMAND_DESCRIPTORS with 5 parameters (phase required, 4 optional). Dispatches to cmdWorktreePushAndPR via the standard execute function pattern.

## Tests

9 new tests in `cmdWorktreePushAndPR` describe block:

1. Returns error when phase is not provided
2. Returns error when worktree directory does not exist
3. Returns error when git push fails (no remote configured)
4. Successfully pushes branch to remote (with bare remote)
5. Returns error when gh CLI fails (structured error, does not crash)
6. PR title includes phase number and milestone
7. PR body includes plan summary text when provided
8. Returns structured JSON with pr_url, branch, title on success
9. Uses base_branch from config for PR target

Test infrastructure: `createTestGitRepoWithRemote()` helper creates a repo with a bare clone as remote, enabling real `git push` in tests.

**Test counts:** 1,465 total (1,456 existing + 9 new), 0 failures, 0 regressions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Branch name mismatch between create and push-pr**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** cmdWorktreePushAndPR recomputed the branch name using `worktreeBranch(cwd, milestone, phase, slug)` where slug came from `findPhaseInternal`. When the phase directory did not match the slug used at worktree creation time, the computed branch name differed from the actual branch, causing push failures.
- **Fix:** Read the actual branch from the worktree's HEAD via `git rev-parse --abbrev-ref HEAD` instead of recomputing. Falls back to computed branch only if HEAD read fails.
- **Files modified:** lib/worktree.js
- **Commit:** 9cd4547

## Verification

- **Level 1 (Sanity):** cmdWorktreePushAndPR exported. CLI `worktree push-pr --phase 28` returns structured JSON error (not crash). MCP descriptor found with 5 params.
- **Level 2 (Proxy):** 29/29 worktree tests pass. 1,465/1,465 full suite passes. Zero regressions.
- **Level 3 (Deferred):** End-to-end PR creation from real worktree during execute-phase (Phase 31).
