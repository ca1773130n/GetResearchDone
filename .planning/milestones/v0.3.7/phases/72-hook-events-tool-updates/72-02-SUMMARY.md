---
phase: 72
plan: 02
subsystem: orchestration
tags: [worktree, isolation, exit-worktree, skill-dir, documentation]
dependency_graph:
  requires: []
  provides:
    - ExitWorktree call in execute-phase.md completion flow
    - ExitWorktree rule in grd-executor.md native isolation
    - CLAUDE_SKILL_DIR documentation in both files
  affects:
    - commands/execute-phase.md
    - agents/grd-executor.md
tech_stack:
  added: []
  patterns:
    - ExitWorktree tool call for native worktree cleanup
    - HTML comment blocks for variable reference documentation
key_files:
  created: []
  modified:
    - commands/execute-phase.md
    - agents/grd-executor.md
decisions:
  - ExitWorktree placed before completion options (not after) to ensure main repo context
  - Documentation uses HTML comments (invisible to agents, visible to maintainers)
  - No CLAUDE_PLUGIN_ROOT references changed to CLAUDE_SKILL_DIR (documentation only)
metrics:
  duration: 1min
  completed: 2026-03-11
---

# Phase 72 Plan 02: ExitWorktree & CLAUDE_SKILL_DIR Documentation Summary

Added ExitWorktree tool calls to the native isolation completion flow in both execute-phase.md (orchestrator) and grd-executor.md (agent), plus CLAUDE_SKILL_DIR vs CLAUDE_PLUGIN_ROOT variable documentation comments in both files.

## What Was Done

### Task 1: ExitWorktree in execute-phase.md completion flow
Added an "ExitWorktree (native isolation only)" block to the `completion_flow` step, positioned before the existing completion options. The block instructs the orchestrator to call the ExitWorktree tool when ISOLATION_MODE=native, ensuring the agent returns to the main repository before presenting merge/PR/keep/discard options. Skipped for manual isolation and no-branching modes.

### Task 2: ExitWorktree in grd-executor.md native isolation
Added rule 7 to Mode A: Native Isolation in the `isolation_handling` section. This rule instructs the executor agent to call ExitWorktree after writing SUMMARY.md and the final commit, but before outputting the completion format. Explicitly scoped to native isolation only -- Mode B (manual) and Mode C (no isolation) are unchanged.

### Task 3: CLAUDE_SKILL_DIR documentation in execute-phase.md
Added an HTML comment block after the frontmatter explaining when to use `${CLAUDE_PLUGIN_ROOT}` vs `${CLAUDE_SKILL_DIR}`. Documents that CLAUDE_SKILL_DIR resolves to the commands/ directory and is currently unused since all GRD references are cross-directory.

### Task 4: CLAUDE_SKILL_DIR documentation in grd-executor.md
Added the same style HTML comment block to grd-executor.md, noting that CLAUDE_SKILL_DIR resolves to the agents/ directory. No functional changes -- documentation only.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 5e5029c | ExitWorktree added to execute-phase.md completion flow |
| 2 | f98d1e8 | ExitWorktree rule 7 added to grd-executor.md native isolation |
| 3 | fb4f1b7 | CLAUDE_SKILL_DIR documentation added to execute-phase.md |
| 4 | dc2c343 | CLAUDE_SKILL_DIR documentation added to grd-executor.md |

## Verification

- [x] execute-phase.md contains ExitWorktree in the completion_flow step
- [x] ExitWorktree in execute-phase.md is guarded by ISOLATION_MODE=native condition
- [x] grd-executor.md contains ExitWorktree in Mode A: Native Isolation rules
- [x] grd-executor.md Mode B and Mode C do NOT mention ExitWorktree
- [x] Existing completion flow logic (4 options) is preserved unchanged
- [x] Existing isolation handling rules 1-6 are preserved unchanged
- [x] No ExitWorktree references appear in manual worktree paths
- [x] CLAUDE_SKILL_DIR documentation comment present in execute-phase.md
- [x] CLAUDE_SKILL_DIR documentation comment present in grd-executor.md
- [x] Zero ${CLAUDE_PLUGIN_ROOT} references changed to ${CLAUDE_SKILL_DIR}

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED
