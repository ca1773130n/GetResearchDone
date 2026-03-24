# Requirements: v0.3.22 Autopilot v2 — Parallel Execution with Serial Integration

**Milestone:** v0.3.22
**Created:** 2026-03-24

## Post-Phase Pipeline

### REQ-160: Simplify Step
**Priority:** P1 — High
**Category:** Core
**Description:** After each phase execution completes, spawn a subprocess to review the phase's changed files for code quality, reuse, and simplification. Operates on the worktree branch. Implementation as `buildSimplifyPrompt(phaseNum)` in `lib/autopilot.ts`. Uses sonnet-tier model. Strips CLAUDE session env vars before spawning (uses `buildBackendEnv`).

### REQ-161: PR Creation Step
**Priority:** P1 — High
**Category:** Core
**Description:** After simplify, push the worktree branch to remote and create a PR targeting main via `gh pr create`. Reuses existing `pushAndCreatePR()` from `lib/worktree.ts`. PR title follows phase naming convention.

### REQ-162: Code Review Step
**Priority:** P1 — High
**Category:** Core
**Description:** After PR creation, spawn a subprocess with grd-code-reviewer-style prompt targeting the PR diff. Fixes BLOCKER/WARNING findings and pushes fixes to the branch. Implementation as `buildCodeReviewPrompt(prUrl)` in `lib/autopilot.ts`.

### REQ-163: Rebase and Merge Step
**Priority:** P1 — High
**Category:** Core
**Description:** After code review, rebase the phase branch onto current main. If conflicts arise, spawn a subprocess with both versions and the phase's intent context to resolve them. If resolution fails (non-zero exit), halt autopilot for human intervention. After successful rebase, merge the PR and clean up the worktree. Implementation in `lib/autopilot.ts`.

### REQ-164: Pipeline Orchestrator
**Priority:** P1 — High
**Category:** Core
**Description:** Orchestrate the 4-step post-phase pipeline (simplify → PR → review → rebase+merge) as a sequential flow per phase. Each step gets its own timeout. On failure at any step, stop autopilot and report which step and phase failed. Add `--skip-post-pipeline` flag for debugging. Implementation as `runPostPhasePipeline(phaseNum, worktreePath, options)` in `lib/autopilot.ts`.

## Serial Integration Gate

### REQ-165: Serial Merge Queue
**Priority:** P1 — High
**Category:** Core
**Description:** When multiple phases execute in parallel, their post-phase pipelines must merge sequentially — only one rebase+merge at a time. Implement a merge queue that processes completed phases in order. The first phase to finish its execution enters the pipeline first. Subsequent phases wait for the previous merge to complete before starting their own rebase. This prevents concurrent rebases from creating race conditions on main.

### REQ-166: Conflict Resolution Subprocess
**Priority:** P1 — High
**Category:** Core
**Description:** When `git rebase main` produces conflicts during the merge gate, spawn `claude -p` with: (a) the conflicting file's both versions, (b) the phase's goal and plan summary, (c) instruction to resolve preserving both changes. If the subprocess exits non-zero, halt autopilot. Strip CLAUDE session env vars before spawning.

## Write-Intent Manifests

### REQ-167: Phase Plan Write-Intent Declaration
**Priority:** P1 — High
**Category:** Planning
**Description:** Extend the phase planning prompt to instruct the planner to declare a `files_modified` list in each PLAN.md — the lib/ modules and other files the plan expects to modify. This is a best-effort declaration, not a contract. Implementation: update `buildPlanPrompt()` to include write-intent instruction, add parsing in `cmdInitExecutePhase` to extract the declared file list.

### REQ-168: Wave Builder Conflict Check
**Priority:** P1 — High
**Category:** Scheduling
**Description:** In `buildWaves()` (`lib/parallel.ts`), cross-reference phase write-intent manifests before building parallel waves. If two phases in the same wave both declare the same `lib/` module in their `files_modified`, move one to a subsequent wave. Preserve existing `depends_on` logic — write-intent is an additional constraint, not a replacement. Add `--force-parallel` flag to override for intentional parallel execution of overlapping phases.

### REQ-169: Declared vs Actual Feedback
**Priority:** P2 — Medium
**Category:** Quality
**Description:** After each phase completes execution, compare the declared `files_modified` from the plan with the actual `git diff --name-only` output. Log discrepancies (unexpected files modified, declared files not touched) to the autopilot log. This feeds back into planner accuracy over time.

## Autopilot Mode Changes

### REQ-170: Always-On Auto-Resume
**Priority:** P1 — High
**Category:** UX
**Description:** Remove `--resume` flag from autopilot. Auto-resume is always on: check each phase's disk state — fully executed → skip, planned but not executed → skip to execute, no plans → start from plan. Applies to both milestone mode and phase-range mode.

### REQ-171: Milestone Mode Default
**Priority:** P1 — High
**Category:** UX
**Description:** Make milestone mode the default when `gd autopilot` is called with no arguments. Resolve all phases in the current milestone from ROADMAP.md, auto-resume, and run the full loop. Rename `--from`/`--to` to `--phase-from`/`--phase-to`. Add `--milestone` flag (now the default).

### REQ-172: Milestone Wireup Step
**Priority:** P2 — Medium
**Category:** Integration
**Description:** In milestone mode only, after all phases complete and merge, run wireup discovery as a final validation step. Spawn subprocess to run wireup and report results. This catches integration gaps across the milestone.

## Parallel Execution

### REQ-173: Worktree-Isolated Phase Execution
**Priority:** P1 — High
**Category:** Core
**Description:** Each phase in a parallel wave gets its own git worktree via existing `lib/worktree.ts` infrastructure. Independent phases (no `depends_on`) execute concurrently in their worktrees. Dependent phases wait for their dependency to fully complete (execute + post-phase pipeline + merge to main). Reuse `worktreePath()`, `pushAndCreatePR()`, and existing create/remove functions — do NOT create parallel worktree management.

### REQ-174: Shared State Synchronization
**Priority:** P1 — High
**Category:** Infrastructure
**Description:** Under parallel execution, `writeStatusMarker()` and `updateStateProgress()` write to `.planning/` in the main repo, not the worktree. Phase status markers are already separate files (safe). `STATE.md` and `autopilot.log` need file-level locking or atomic writes to avoid races. Implementation: write to a temp file then rename (atomic on POSIX).

## Testing

### REQ-175: Post-Phase Pipeline Unit Tests
**Priority:** P1 — High
**Category:** Testing
**Description:** Unit tests for each pipeline step (simplify, PR, review, rebase+merge) and the orchestrator. Mock subprocess spawning, git operations, and gh CLI. Coverage: 85%+ lines on new pipeline code.

### REQ-176: Serial Merge Queue Tests
**Priority:** P1 — High
**Category:** Testing
**Description:** Unit tests validating that parallel phases merge sequentially, conflict resolution subprocess is spawned correctly, and autopilot halts on unresolvable conflicts.

### REQ-177: Write-Intent Wave Builder Tests
**Priority:** P1 — High
**Category:** Testing
**Description:** Unit tests for write-intent manifest parsing, wave builder conflict detection, and `--force-parallel` override. Verify that overlapping phases are serialized within waves.

### REQ-178: Integration Test — Full Pipeline
**Priority:** P2 — Medium
**Category:** Testing
**Description:** E2E integration test running 2 independent phases through the full autopilot v2 pipeline: parallel execute → serial merge. Uses mock git/gh operations. Validates phases merge to main in order with no conflicts.

## Traceability Matrix

| REQ | Phase | Status |
|-----|-------|--------|
| REQ-160 | Phase 87 | PENDING |
| REQ-161 | Phase 87 | PENDING |
| REQ-162 | Phase 87 | PENDING |
| REQ-163 | Phase 87 | PENDING |
| REQ-164 | Phase 87 | PENDING |
| REQ-165 | Phase 88 | PENDING |
| REQ-166 | Phase 88 | PENDING |
| REQ-167 | Phase 89 | PENDING |
| REQ-168 | Phase 89 | PENDING |
| REQ-169 | Phase 89 | PENDING |
| REQ-170 | Phase 90 | PENDING |
| REQ-171 | Phase 90 | PENDING |
| REQ-172 | Phase 90 | PENDING |
| REQ-173 | Phase 90 | PENDING |
| REQ-174 | Phase 90 | PENDING |
| REQ-175 | Phase 91 | PENDING |
| REQ-176 | Phase 91 | PENDING |
| REQ-177 | Phase 91 | PENDING |
| REQ-178 | Phase 91 | PENDING |
