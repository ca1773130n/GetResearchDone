# Requirements — v0.2.3 Improve Settings & Git Workflow

**Milestone:** v0.2.3
**Created:** 2026-02-21

## Git Workflow Revision

### REQ-70: Unified worktree-based git workflow
Replace the confusing `branching_strategy` (none/phase/milestone) with a single clear model: when git isolation is enabled, every phase execution creates a worktree. Remove the "per-milestone" branching concept — it has no worktree support and muddies the model.
- **Priority:** P0
- **Category:** Core

### REQ-71: Project-local worktree directory
Change worktree location from `/tmp/grd-worktree-*` to a project-local `.worktrees/` directory (gitignored). Add to `.gitignore` automatically if not present. This matches the superpowers plugin convention and keeps worktrees discoverable.
- **Priority:** P0
- **Category:** Core

### REQ-72: Phase completion options (merge/PR/keep/discard)
At the end of phase execution (when worktree is enabled), present the user with 4 options: (1) merge locally to base branch, (2) push and create a PR, (3) keep the branch as-is, (4) discard the work. Currently only PR creation is supported.
- **Priority:** P0
- **Category:** Core

### REQ-73: Test gate before merge/PR
Run the full test suite in the worktree before allowing merge or PR creation. If tests fail, block the merge/PR and report the failure. This ensures only verified code reaches the base branch.
- **Priority:** P1
- **Category:** Quality

### REQ-74: Worktree cleanup on all completion paths
After merge, PR creation, or discard: remove the worktree and prune. After "keep": leave the worktree intact. Ensure cleanup runs even on failure paths (finally-block pattern).
- **Priority:** P1
- **Category:** Core

### REQ-75: Config schema consolidation — git section
Move `branching_strategy`, `phase_branch_template`, `base_branch` into a nested `git` section in config.json. Remove `milestone_branch_template` (no longer needed). Maintain backward compatibility in `loadConfig` (already reads both top-level and nested).
- **Priority:** P1
- **Category:** Config

### REQ-76: Fix `cmdInitNewMilestone` phase scanning
The `suggested_start_phase` computation only scans old-style `*-phases` directories. It must also scan new milestone-scoped `milestones/{version}/phases/` directories to find the true highest phase number.
- **Priority:** P1
- **Category:** Bugfix

## Settings Interview Revision

### REQ-77: Revise git workflow question in settings
Replace the current 3-option "Git branching strategy?" question with a clearer "Use worktree isolation for phase execution?" (Yes/No) followed by sub-options when Yes (worktree location, default completion action).
- **Priority:** P0
- **Category:** UX

### REQ-78: Add execution settings to interview
Add `use_teams` and `max_concurrent_teammates` to the settings interview. These exist in config but are not exposed in `/grd:settings`.
- **Priority:** P2
- **Category:** UX

### REQ-79: Add code review settings to interview
Add code review configuration (`timing`, `severity_gate`, `auto_fix_warnings`) to the settings interview. Currently in config.json but not in the settings command.
- **Priority:** P2
- **Category:** UX

### REQ-80: Add confirmation gates to settings interview
Add confirmation gate toggles (commit_confirmation, file_deletion, phase_completion, target_adjustment, approach_change) to the settings interview.
- **Priority:** P2
- **Category:** UX

## Documentation

### REQ-81: Update CLAUDE.md git workflow section
Update the CLAUDE.md documentation to reflect the new worktree-based workflow, completion options, and config schema changes.
- **Priority:** P1
- **Category:** Docs

### REQ-82: Update execute-phase command for new workflow
Update `commands/execute-phase.md` to use the new completion flow (merge/PR/keep/discard) instead of always creating a PR.
- **Priority:** P0
- **Category:** Core

## Traceability Matrix

| REQ | Phase | Status |
|-----|-------|--------|
| REQ-70 | Phase 38 | Planned |
| REQ-71 | Phase 38 | Planned |
| REQ-72 | Phase 39 | Planned |
| REQ-73 | Phase 39 | Planned |
| REQ-74 | Phase 39 | Planned |
| REQ-75 | Phase 38 | Planned |
| REQ-76 | Phase 41 | Planned |
| REQ-77 | Phase 40 | Planned |
| REQ-78 | Phase 40 | Planned |
| REQ-79 | Phase 40 | Planned |
| REQ-80 | Phase 40 | Planned |
| REQ-81 | Phase 41 | Planned |
| REQ-82 | Phase 41 | Planned |
