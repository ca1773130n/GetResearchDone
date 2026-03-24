# Autopilot v2 Design

## Summary

Enhance the `/grd:autopilot` command with milestone-mode autopilot, parallel worktree-based execution, a post-phase pipeline (simplify, PR, code review, merge), and always-on auto-resume.

## Argument Changes

### Removed
- `--resume` — auto-resume is now always on (no flag needed)

### Renamed
- `--from` -> `--phase-from`
- `--to` -> `--phase-to`

### Added
- `--milestone` — enters milestone autopilot mode

### Behavior
- `grd:autopilot --phase-from 3 --phase-to 7` — phase-range mode
- `grd:autopilot --milestone` — milestone mode
- `grd:autopilot` (no args) — defaults to milestone mode
- Auto-resume is always on: completed phases are skipped, partially-done phases resume from the correct step (e.g., planned but not executed -> start executing)

## Auto-Resume Logic

No `--resume` flag. The autopilot always:
1. Checks each phase's disk state before acting
2. If phase is fully executed (all plans have summaries) -> skip entirely
3. If phase is planned but not executed (has PLAN.md but incomplete/no SUMMARY.md) -> skip to execute step
4. If phase has no plans -> start from plan step

This applies to both milestone mode and phase-range mode.

## Parallel Execution with Worktrees

### Current behavior
- Plan in parallel, execute sequentially on the main branch.

### New behavior
- Both plan AND execute in parallel for independent phases (no `depends_on` relationship).
- Each phase gets its own git worktree via `git worktree add`.
- Independent phases execute concurrently in their worktrees.
- Dependent phases wait for their dependency to fully complete (execute + post-phase pipeline + merge back to main).
- Post-phase pipeline runs per-phase as each finishes.
- Before merging each PR: always rebase on main first, auto-resolve conflicts.

### Worktree management
- Reuse existing `lib/worktree.ts` infrastructure: `worktreePath()`, `pushAndCreatePR()`, and worktree create/remove functions.
- Branch naming follows existing convention from `worktreePath(cwd, milestone, phase)`.
- Do NOT create a parallel worktree management system.

### Shared state under parallel execution
- `writeStatusMarker()` and `updateStateProgress()` write to `.planning/` in the main repo, not the worktree.
- Under parallel execution, these functions must use file-level locking or atomic writes to avoid races on `STATE.md` and `autopilot.log`.
- Each phase's status marker is already a separate file (`phase-{N}-{step}.json`), so markers are safe. Only `STATE.md` and the log file need synchronization.

## Post-Phase Pipeline

After each phase execution completes (both modes), the following steps run sequentially on the phase's worktree branch:

### 1. Simplify
- Spawn `claude -p` with a prompt to review the phase's changed files for code quality, reuse, and simplification.
- Operates on the worktree branch.

### 2. Create PR
- `git push` the worktree branch to remote.
- `gh pr create` from the branch targeting main.

### 3. Code Review
- Spawn `claude -p` with grd-code-reviewer-style prompt targeting the PR diff.
- Fixes any BLOCKER/WARNING findings and pushes fixes.

### 4. Rebase & Merge
- `git rebase main` — always rebase before merging.
- Conflict resolution strategy: spawn `claude -p` in the worktree with both versions of conflicting files and a prompt to resolve them. The subprocess has full context of the phase's intent and can make informed merge decisions.
- If the subprocess fails to resolve conflicts (non-zero exit), halt the autopilot for human intervention.
- After successful rebase, merge the PR and clean up the worktree.

### On Failure
If any post-phase step fails (simplify crashes, PR creation fails, conflict resolution subprocess fails), stop the autopilot and report which step and phase failed for human intervention.

### Pipeline Timeout
Each post-phase pipeline step gets its own timeout (inherits the phase `--timeout` value). Pipeline steps route through the scheduler when available, respecting rate limiting and account rotation.

### Skip Flag
`--skip-post-pipeline` flag allows skipping the post-phase pipeline for debugging or when running in contexts where PR workflow is not needed.

## Milestone Mode

When `--milestone` is passed (or no args given):
1. Resolve all phases in the current milestone from ROADMAP.md.
2. Auto-resume: skip completed phases, resume partially-done ones.
3. Run the autopilot loop (plan + execute + post-phase pipeline for each phase).
4. After ALL phases complete and merge:
   - **Wireup step**: spawn `claude -p` to run wireup discovery (exported-but-uncalled, config-without-surface, endpoint-without-integration-test).

The wireup step only fires in milestone mode, not in phase-range mode.

## Ultrathink for Planning

All planning prompts use the "ultrathink" keyword for extended thinking:
- `buildPlanPrompt()` — prepends "ultrathink" when planning a phase
- `buildNewMilestonePrompt()` — prepends "ultrathink" when creating a new milestone

**Backend guard:** Only prepend "ultrathink" when the backend supports the `effort` capability (currently Claude only). On other backends, omit it to avoid unexpected behavior. Check via `getBackendCapabilities(backend).effort`.

## Files to Modify

### `lib/autopilot.ts` — Core changes
- Remove `resume` from `AutopilotOptions`; auto-resume is always on
- Rename `from`/`to` -> `phaseFrom`/`phaseTo` in `AutopilotOptions`
- Add `milestone` boolean to `AutopilotOptions`
- Add `skipPostPipeline` boolean to `AutopilotOptions`
- Reuse `lib/worktree.ts` functions (`worktreePath`, `pushAndCreatePR`, create/remove worktree) for worktree management
- Implement parallel execution using worktrees for independent phases
- Add post-phase pipeline functions:
  - `buildSimplifyPrompt(phaseNum)` — prompt for code simplification
  - `buildCodeReviewPrompt(prUrl)` — prompt for PR review + fix
  - `buildConflictResolvePrompt(phaseNum)` — prompt for merge conflict resolution
  - `runPostPhasePipeline(cwd, phaseNum, worktreePath, opts)` — orchestrates simplify, PR, review, rebase+merge
- Add `buildWireupPrompt()` for milestone completion wireup
- Update `buildPlanPrompt()` and `buildNewMilestonePrompt()` to prepend "ultrathink" (guarded by backend `effort` capability)
- Add file-level locking for `STATE.md` writes under parallel execution
- Route post-phase pipeline spawns through the scheduler when available
- Update `runAutopilot()`:
  - Default to milestone mode when no phaseFrom/phaseTo
  - Always auto-resume (no resume flag)
  - Execute in parallel worktrees for independent phases
  - Run post-phase pipeline after each phase (unless `--skip-post-pipeline`)
  - Run wireup after all phases in milestone mode
- Dependent phases wait for full pipeline completion (execute + post-phase + merge)

### `commands/autopilot.md` — Skill definition
- Update flag names and descriptions
- Document post-phase pipeline
- Document milestone mode as default
- Document auto-resume behavior
- Remove `--resume` from docs

### `bin/grd-tools.ts` — CLI entry point
- Note: actual flag parsing is in `cmdAutopilot` / `cmdMultiMilestoneAutopilot` in `lib/autopilot.ts`, not in grd-tools.ts. No changes needed here beyond ensuring the routing still works.

### `tests/unit/autopilot.test.ts` — Tests
- Update all existing tests using `--from`/`--to`/`--resume` for new names
- Add tests for auto-resume behavior (always on)
- Add tests for post-phase pipeline functions
- Add tests for worktree creation/cleanup
- Add tests for milestone mode with wireup
- Add tests for rebase and merge flow
- Add tests for parallel execution in worktrees

### `lib/types.ts` — Type changes
- Remove `resume` from `MultiMilestoneOptions` interface
- Update any other type references to `from`/`to` if present

### `runMultiMilestoneAutopilot` in `lib/autopilot.ts`
- Remove `resume: options.resume` from the `runAutopilot()` call (auto-resume is always on)
- `cmdMultiMilestoneAutopilot` CLI parser: remove `--resume` flag parsing
- The function otherwise inherits parallel execution and post-phase pipeline from `runAutopilot()`

## Design Decisions

1. **No external plugin dependencies** — Post-phase review uses built-in grd-code-reviewer logic, not the 3rd-party pr-review-toolkit. Simplify uses a built-in prompt, not the external /simplify skill. This keeps GRD self-contained and cross-backend compatible.
2. **Worktrees over branches** — Git worktrees provide true filesystem isolation for parallel execution. Simple branching would cause conflicts with concurrent file writes.
3. **Sequential merge with rebase** — PRs merge one at a time, always rebasing first. Conflicts are auto-resolved. This avoids race conditions while maintaining parallel execution benefits.
4. **Auto-resume always on** — Removes cognitive load of remembering to pass `--resume`. The autopilot is smart enough to detect state and pick up where it left off.
5. **Milestone mode as default** — Most common use case. Phase-range mode is the opt-in alternative. This is a breaking change from the previous default behavior.
6. **Reuse existing worktree infrastructure** — `lib/worktree.ts` already has `worktreePath()`, `pushAndCreatePR()`, and worktree lifecycle management. No parallel system.
7. **LLM-based conflict resolution** — Merge conflicts are resolved by spawning `claude -p` with context about the phase's changes. Falls back to halting for human intervention if the subprocess fails.
8. **Scheduler-aware pipeline** — Post-phase pipeline spawns route through the scheduler when available, respecting rate limiting and account rotation.
