---
phase: 27-worktree-infrastructure
plan: 02
one-liner: "Worktree CLI routing, execute-phase context fields, and MCP tool descriptors — all 1,456 tests passing"
subsystem: worktree
tags: [cli-integration, mcp, context-init, worktree]
dependency-graph:
  requires: [lib/worktree.js, lib/utils.js]
  provides: [worktree CLI commands, worktree MCP tools, execute-phase worktree context]
  affects: [bin/grd-tools.js, lib/context.js, lib/mcp-server.js]
tech-stack:
  added: []
  patterns: [cli-routing-switch-case, mcp-command-descriptors, computed-context-fields]
key-files:
  created: []
  modified:
    - bin/grd-tools.js
    - lib/context.js
    - lib/mcp-server.js
    - tests/unit/context.test.js
key-decisions:
  - "worktree_path uses fs.realpathSync(os.tmpdir()) consistent with lib/worktree.js for macOS symlink resolution"
  - "worktree_branch reuses phase_branch_template config, matching branch_name computation for consistency"
  - "MCP descriptors use execute: function pattern (not cli:) matching all 60+ existing descriptors"
metrics:
  duration: 2min
  completed: 2026-02-19
---

# Phase 27 Plan 02: CLI Integration and MCP Descriptors Summary

Worktree CLI routing, execute-phase context fields, and MCP tool descriptors — all 1,456 tests passing with zero regressions.

## Tasks

### Task 1: Wire worktree commands into grd-tools.js CLI router

**Commit:** `4bae8d5`

Added worktree command routing to `bin/grd-tools.js` following the established pattern:

- **Import:** Added `cmdWorktreeCreate`, `cmdWorktreeRemove`, `cmdWorktreeList`, `cmdWorktreeRemoveStale` from `lib/worktree.js`
- **WORKTREE_SUBS constant:** `['create', 'remove', 'list']` for subcommand validation
- **Switch case:** Routes `worktree create` (with `--phase`, `--milestone`, `--slug` flags), `worktree remove` (with `--phase`, `--path`, or `--stale` flags), and `worktree list`
- **Usage string:** Updated to include `worktree` in the command list

Verification: All three subcommands respond correctly — `list` returns JSON, `create` errors about missing `--phase`, `remove` errors about missing `--phase` or `--path`.

### Task 2: Add worktree fields to cmdInitExecutePhase and MCP descriptors

**Commit:** `5c22585`

**Part A: cmdInitExecutePhase updates (lib/context.js)**

Added two computed fields to the execute-phase init context result object:

- **worktree_path:** `fs.realpathSync(os.tmpdir())/grd-worktree-{milestone}-{phase}` — uses realpathSync for macOS symlink resolution consistency with lib/worktree.js. Returns null when phaseInfo is null.
- **worktree_branch:** Computed from `phase_branch_template` config (same as `branch_name`). Returns null when branching_strategy is `'none'` or phaseInfo is null.

Added `os` to the destructured import from `./utils` (already re-exported by utils.js).

**Part B: MCP descriptors (lib/mcp-server.js)**

Added three new entries to COMMAND_DESCRIPTORS array:

- **grd_worktree_create:** Required `phase` param, optional `milestone` and `slug`. Dispatches to `cmdWorktreeCreate`.
- **grd_worktree_remove:** Optional `phase`, `path`, and `stale` (boolean) params. Routes to `cmdWorktreeRemoveStale` when stale is true, otherwise `cmdWorktreeRemove`.
- **grd_worktree_list:** No params. Dispatches to `cmdWorktreeList`.

All use the `execute:` function pattern matching existing descriptors.

**Part C: Tests (tests/unit/context.test.js)**

Added 3 new test cases:
- `worktree_path` contains correct tmpdir pattern (grd-worktree-, milestone, phase number)
- `worktree_branch` matches the `branch_name` field and contains milestone/phase/slug
- Both worktree fields are null when phase is not found (phase 99)

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- **Level 1 (Sanity):** `grd-tools worktree list` returns JSON. `grd-tools worktree create` rejects missing `--phase`. `init execute-phase 27` output contains `worktree_path` and `worktree_branch` fields.
- **Level 2 (Proxy):** All 46 context tests pass (43 existing + 3 new). Full suite: 1,456 tests passing with zero regressions.
- **Level 3 (Deferred):** End-to-end worktree creation during actual execute-phase run (Phase 31).

## Self-Check: PASSED

- FOUND: bin/grd-tools.js (worktree case in switch)
- FOUND: lib/context.js (worktree_path and worktree_branch fields)
- FOUND: lib/mcp-server.js (grd_worktree_create/remove/list descriptors)
- FOUND: tests/unit/context.test.js (3 new worktree test cases)
- FOUND: 4bae8d5 (Task 1 commit)
- FOUND: 5c22585 (Task 2 commit)
- PASS: 1,456 tests passing, zero regressions
