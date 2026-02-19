---
phase: 28-pr-workflow
plan: 02
subsystem: worktree
tags: [worktree, execute-phase, grd-executor, orchestrator, pr-workflow, markdown-template]
dependency_graph:
  requires:
    - phase: 28-01
      provides: cmdWorktreePushAndPR, worktree push-pr CLI, grd_worktree_push_pr MCP
  provides:
    - Worktree-aware execute-phase orchestrator template
    - Worktree-aware executor agent instructions
  affects: [phase-30-parallel-execution, phase-31-integration]
tech_stack:
  added: []
  patterns: [worktree lifecycle in orchestrator (create/use/pr/cleanup), worktree/main-repo split for state vs code]
key_files:
  created: []
  modified:
    - commands/execute-phase.md
    - agents/grd-executor.md
key-decisions:
  - "Worktree steps conditioned on branching_strategy != none for backward compatibility"
  - "PR created by orchestrator after all plans complete, not by individual executors"
  - "STATE.md updates go to main repo, SUMMARY.md and code go to worktree"
  - "Worktree cleanup runs as finally block on all paths (success, failure, resumption)"
  - "Resumption reuses existing worktree if present rather than creating new"
patterns-established:
  - "Orchestrator worktree lifecycle: setup_worktree -> execute -> push_and_create_pr -> cleanup_worktree"
  - "Agent worktree context: <worktree> block in spawn prompt with WORKTREE_PATH"
  - "State/code split: shared state in main repo, feature code in worktree branch"
duration: 3min
completed: 2026-02-19
---

# Phase 28 Plan 02: Orchestrator and Executor Worktree Integration Summary

Worktree lifecycle integrated into execute-phase orchestrator (setup/PR/cleanup) and executor agent (isolation rules) with full backward compatibility for branching_strategy=none.

## Tasks Completed

| Task | Name | Type | Commit | Files |
|------|------|------|--------|-------|
| 1 | Add worktree lifecycle to execute-phase.md template | feat | 11c7062 | commands/execute-phase.md |
| 2 | Make grd-executor.md worktree-aware | feat | 9d53f8e | agents/grd-executor.md |

## What Was Built

### execute-phase.md Changes

**setup_worktree step** (replaces handle_branching):
- Creates isolated worktree via `grd-tools worktree create --phase --slug`
- Checks for uncommitted changes before creation
- Verifies worktree has `.planning/` directory
- Conditioned on `branching_strategy != none`

**Agent spawn prompts** (both execute_waves and execute_waves_teams):
- Added `<worktree>` block with `WORKTREE_PATH` variable
- Instructions for file operations and bash commands within worktree
- Fallback for `branching_strategy=none` (use normal project root)

**push_and_create_pr step** (new, after aggregate_results):
- Collects plan summaries for PR body (phase number, milestone, plan one-liners)
- Calls `grd-tools worktree push-pr` with title, body, and base branch
- Handles push/PR failures with retry options
- Reports PR URL on success

**cleanup_worktree step** (new, after update_roadmap):
- Calls `grd-tools worktree remove --phase` for idempotent cleanup
- Marked as finally block: runs on all paths (success, failure)

**failure_handling update:**
- Added worktree cleanup as mandatory step on any failure path

**resumption update:**
- Added worktree reuse logic: checks for existing worktree before creating new

### grd-executor.md Changes

**worktree_execution section** (new, 6 rules):
1. All file paths relative to worktree root
2. Bash commands prefixed with `cd "${WORKTREE_PATH}"`
3. Read/Write/Edit use absolute worktree paths
4. Git commits go to worktree branch automatically
5. STATE.md updates go to MAIN repo (shared state)
6. SUMMARY.md goes to worktree (on PR branch)

**load_project_state update:** Detect `<worktree>` block and set working directory.

**task_commit_protocol update:** Note about `cd` to worktree for git commands.

**state_updates update:** Explicit note that STATE.md uses main repo root, not worktree.

## Decisions Made

1. **Worktree steps conditioned on branching_strategy != none** -- Ensures backward compatibility; projects without branching configured continue working exactly as before.
2. **PR created by orchestrator, not executors** -- The orchestrator has full context of all plan summaries and verification results to build a meaningful PR body. Individual executors only know their own plan.
3. **STATE.md in main repo, code in worktree** -- STATE.md is coordination state shared across all agents and the user. It must remain on the main branch. Feature code goes to the worktree branch to appear in the PR.
4. **Worktree cleanup as finally block** -- Prevents stale worktrees from accumulating in tmpdir. Idempotent removal means calling cleanup on a non-existent worktree is safe.
5. **Resumption reuses existing worktree** -- If execution is interrupted and resumed, the existing worktree (with its partial commits) is reused rather than recreated, preserving work-in-progress.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- **Level 1 (Sanity):** setup_worktree, push_and_create_pr, cleanup_worktree steps all present in execute-phase.md. worktree_execution section present in grd-executor.md.
- **Level 2 (Proxy):** Zero references to old handle_branching pattern. Zero `git checkout -b` patterns. All worktree CLI commands (`create`, `push-pr`, `remove`) correctly reference lib/worktree.js functions from Plan 01. Both files are valid markdown.
- **Level 3 (Deferred):** End-to-end execution of a phase in a worktree with actual PR creation (Phase 31).

## Issues Encountered

None.

## Next Phase Readiness

Phase 28 (PR Workflow) is now complete with both plans:
- Plan 01: `cmdWorktreePushAndPR` function, CLI, and MCP descriptor
- Plan 02: Orchestrator and executor template integration

The worktree lifecycle is fully specified in the command/agent templates. Phase 29 (Dependency Analysis) can proceed independently. Phase 30 (Parallel Execution) can build on the worktree infrastructure from Phases 27-28.

---
*Phase: 28-pr-workflow*
*Completed: 2026-02-19*
