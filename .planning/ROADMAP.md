# Roadmap: GRD

## Milestones

- v0.0.5 Production-Ready R&D Workflow Automation - Phases 1-8 (shipped 2026-02-15)
- v0.1.0 Setup Functionality & Usability - Phases 9-13 (shipped 2026-02-16)
- v0.1.1 Completeness, Interoperability & Distribution - Phases 14-18 (shipped 2026-02-16)
- v0.1.2 Developer Experience & Requirement Traceability - Phases 19-20 (shipped 2026-02-16)
- v0.1.3 MCP Completion & Branching Fix - Phases 21-22 (shipped 2026-02-17)
- v0.1.4 Slash Command Registration & Missing Commands (shipped 2026-02-17)
- v0.1.5 Long-Term Roadmap Redesign - Phases 23-25 (shipped 2026-02-17)
- v0.1.6 Phase Directory Collision Fix - Phase 26 (shipped 2026-02-19)
- v0.2.0 Git Worktree Parallel Execution - Phases 27-31 (shipped 2026-02-19)
- v0.2.1 Hierarchical Planning Directory - Phases 32-36 (shipped 2026-02-20)
- v0.2.2 quickDir Routing Fix & Migration Skill - Phase 37 (shipped 2026-02-20)
- v0.2.3 Improve Settings & Git Workflow - Phases 38-41 (in progress)

## Phases

<details>
<summary>v0.0.5 Production-Ready R&D Workflow Automation (Phases 1-8) - SHIPPED 2026-02-15</summary>

Phases 1-8 delivered security hardening, modularization, test infrastructure, CI/CD, linting, input validation, documentation, and TUI dashboard. See `.planning/milestones/v0.0.5-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.0 Setup Functionality & Usability (Phases 9-13) - SHIPPED 2026-02-16</summary>

Phases 9-13 delivered multi-backend detection, context init enrichment, hierarchical roadmap planning, milestone lifecycle management, and auto-cleanup quality analysis. See `.planning/milestones/v0.1.0-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.1 Completeness, Interoperability & Distribution (Phases 14-18) - SHIPPED 2026-02-16</summary>

Phases 14-18 delivered doc drift detection, deferred validation resolution, MCP server, npm distribution, and end-to-end integration validation. See `.planning/milestones/v0.1.1-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.2 Developer Experience & Requirement Traceability (Phases 19-20) - SHIPPED 2026-02-16</summary>

Phases 19-20 delivered requirement inspection commands, phase-detail requirement summaries, planning artifact search, and requirement status management. See `.planning/milestones/v0.1.2-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.3 MCP Completion & Branching Fix (Phases 21-22) - SHIPPED 2026-02-17</summary>

Phases 21-22 wired v0.1.2 CLI commands as MCP tools (102 total) and fixed execute-phase branching to always fork from latest base branch. See `.planning/milestones/v0.1.3-ROADMAP.md` for details.

</details>

<details>
<summary>v0.1.4 Slash Command Registration & Missing Commands - SHIPPED 2026-02-17</summary>

Added /grd:long-term-roadmap and /grd:requirement slash commands, added YAML frontmatter to 28 command files fixing skill registration (all 45 commands now discoverable), updated README command table from 24 to 45 commands.

</details>

<details>
<summary>v0.1.5 Long-Term Roadmap Redesign (Phases 23-25) - SHIPPED 2026-02-17</summary>

Phases 23-25 replaced the rigid Now/Next/Later tier system with a flat, ordered LT-N milestone model. Complete rewrite of lib/long-term-roadmap.js (18 new functions), 12 new subcommands (list, add, remove, update, refine, link, unlink, display, init, history, parse, validate), 12 new MCP tools (105 total), protection rules for shipped milestones, comprehensive tutorial, and full integration into agents and commands.

</details>

<details>
<summary>v0.1.6 Phase Directory Collision Fix (Phase 26) - SHIPPED 2026-02-19</summary>

Phase 26 added milestone-scoped phase directory archival and a validation gate system to prevent phase collisions across milestones. Phase directories are now archived to `.planning/milestones/{version}-phases/` during milestone completion. Pre-flight gates detect orphaned phases, stale artifacts, and milestone state inconsistencies before commands execute.

</details>

<details>
<summary>v0.2.0 Git Worktree Parallel Execution (Phases 27-31) - SHIPPED 2026-02-19</summary>

Phases 27-31 delivered worktree-isolated phase execution with parallel teammate spawning. New modules: lib/worktree.js (lifecycle management), lib/deps.js (dependency analysis with Kahn's algorithm), lib/parallel.js (parallel execution engine). PR workflow from worktrees, sequential fallback for non-Claude Code backends, 7 new MCP tools (112 total), 946-line E2E integration test suite, 144 new tests (1,577 total). See `.planning/milestones/v0.2.0-ROADMAP.md` for details.

</details>

<details>
<summary>v0.2.1 Hierarchical Planning Directory (Phases 32-36) - SHIPPED 2026-02-20</summary>

Phases 32-36 migrated all `.planning/` subdirectory paths to a strict milestone-scoped hierarchy. New `lib/paths.js` centralized path resolver (9 functions with backward-compatible fallback), all 18 lib/ modules and 60 command/agent markdown files migrated, `migrate-dirs` CLI command for upgrading old-style layouts, simplified milestone archival with `archived.json` marker, test fixtures and golden outputs migrated, 3 deferred validations resolved, 1,631 tests passing (54 new). See `.planning/milestones/v0.2.1-ROADMAP.md` for details.

</details>

<details>
<summary>v0.2.2 quickDir Routing Fix & Migration Skill (Phase 37) - SHIPPED 2026-02-20</summary>

Phase 37 fixed quickDir() routing bug (hardcoded anonymous instead of current milestone), fixed cmdMigrateDirs quick/ target, and added `/grd:migrate` skill with `grd-migrator` agent for user-facing migration of complex .planning/ layouts. 1,634 tests passing (3 new). See `.planning/milestones/v0.2.2-ROADMAP.md` for details.

</details>

### v0.2.3 Improve Settings & Git Workflow (In Progress)

**Milestone Goal:** Revise the git worktree/branching strategy to be clear and consistent (modeled after superpowers plugin), and update the settings interview to reflect all current features.
**Start:** 2026-02-21

- [ ] **Phase 38: Core Git Workflow Revision** - Replace branching_strategy with unified worktree model `implement`
- [ ] **Phase 39: Completion Flow** - Phase execution ends with merge/PR/keep/discard choice `implement`
- [ ] **Phase 40: Settings Interview Revision** - All current features exposed in /grd:settings `implement`
- [ ] **Phase 41: Command & Documentation Updates** - execute-phase command, CLAUDE.md, and bugfix `implement`

## Phase Details

### Phase 38: Core Git Workflow Revision
**Goal**: A single, clear git isolation model replaces the confusing branching_strategy/worktree overlap -- when git isolation is enabled, every phase execution creates a worktree in project-local `.worktrees/`
**Type**: implement
**Depends on**: Nothing (first phase of milestone)
**Requirements**: REQ-70, REQ-71, REQ-75
**Verification Level**: sanity
**Success Criteria** (what must be TRUE):
  1. Config schema has a `git` section with `enabled`, `worktree_dir`, `base_branch`, and `branch_template` fields; old top-level `branching_strategy`/`milestone_branch_template` keys are gone from the schema
  2. `loadConfig` reads both new `git.*` and legacy top-level keys for backward compatibility (existing configs keep working)
  3. Worktrees are created under `.worktrees/` (project-local) instead of `/tmp/grd-worktree-*`; `.worktrees/` is added to `.gitignore` automatically if missing
  4. `cmdInitExecutePhase` outputs the new `git.*` config shape in its JSON when git isolation is enabled
  5. All existing tests pass (zero regressions); new tests cover config migration, `.gitignore` injection, and worktree directory change
**Plans:** 2 plans
Plans:
- [ ] 38-01-PLAN.md — Config schema consolidation, project-local worktree paths, .gitignore injection, milestone branch helpers
- [ ] 38-02-PLAN.md — Context output updates (cmdInitExecutePhase, buildParallelContext) for new git config shape

### Phase 39: Completion Flow
**Goal**: Phase execution with git isolation ends by presenting the user with 4 completion options (merge locally, push and create PR, keep branch, discard work) with a test gate before merge/PR paths
**Type**: implement
**Depends on**: Phase 38
**Requirements**: REQ-72, REQ-73, REQ-74
**Verification Level**: sanity
**Success Criteria** (what must be TRUE):
  1. After phase execution completes in a worktree, the user is presented with exactly 4 options: merge, pr, keep, discard
  2. Selecting "merge" or "pr" first runs the full test suite in the worktree; if tests fail, the action is blocked and failure details are reported
  3. "merge" merges the worktree branch into the base branch locally; "pr" pushes and creates a PR; "keep" leaves the worktree intact; "discard" deletes the branch and worktree
  4. Worktree cleanup (remove + prune) runs on merge, pr, and discard paths -- even when an error occurs (finally-block pattern); "keep" leaves the worktree in place
  5. All existing worktree and parallel execution tests pass; new tests cover each of the 4 completion paths plus test-gate failure blocking
**Plans:** 2 plans
Plans:
- [ ] 39-01-PLAN.md — Core completion helpers (runTestGate, mergeWorktree, discardWorktree, keepWorktree, cleanupWorktree) with TDD tests
- [ ] 39-02-PLAN.md — cmdWorktreeComplete orchestrator with finally-block cleanup, CLI routing, and comprehensive tests for all 4 paths

### Phase 40: Settings Interview Revision
**Goal**: The `/grd:settings` interview exposes all current features with clear, non-overlapping questions -- git isolation, execution teams, code review, and confirmation gates
**Type**: implement
**Depends on**: Phase 38
**Requirements**: REQ-77, REQ-78, REQ-79, REQ-80
**Verification Level**: sanity
**Success Criteria** (what must be TRUE):
  1. The git workflow question asks "Use worktree isolation for phase execution?" (Yes/No) with sub-options for worktree directory and default completion action when Yes; the old 3-way branching_strategy question is removed
  2. Execution settings (`use_teams`, `max_concurrent_teammates`) appear as interview questions and are written to config.json correctly
  3. Code review settings (`timing`, `severity_gate`, `auto_fix_warnings`) appear as interview questions and are written to config.json correctly
  4. Confirmation gate toggles (commit_confirmation, file_deletion, phase_completion, target_adjustment, approach_change) appear as interview questions and are written to config.json correctly
  5. Running the full settings interview produces a valid config.json with all new sections populated
**Plans:** 1 plan
Plans:
- [ ] 40-01-PLAN.md — Rewrite settings interview: replace git branching with worktree isolation, add execution/code-review/confirmation-gate questions, update config write and summary display

### Phase 41: Command & Documentation Updates
**Goal**: The execute-phase command uses the new completion flow, CLAUDE.md reflects the new git model, and the new-milestone phase scanning bug is fixed
**Type**: implement
**Depends on**: Phase 38, Phase 39, Phase 40
**Requirements**: REQ-76, REQ-81, REQ-82
**Verification Level**: sanity
**Success Criteria** (what must be TRUE):
  1. `commands/execute-phase.md` uses the new 4-option completion flow (merge/PR/keep/discard) instead of always creating a PR
  2. CLAUDE.md documents the new `git` config section, worktree-based isolation model, and completion options; no references to the old `branching_strategy` remain
  3. `cmdInitNewMilestone` scans `milestones/{version}/phases/` directories (new-style) in addition to old-style `*-phases/` directories for `suggested_start_phase`
  4. The bugfix correctly computes `suggested_start_phase` when phases exist only in new-style milestone directories (test with fixture having only `milestones/v0.2.1/phases/36-*`)
  5. All tests pass; golden outputs updated if affected by command template changes
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 38. Core Git Workflow Revision | 0/2 | Not started | - |
| 39. Completion Flow | 0/2 | Not started | - |
| 40. Settings Interview Revision | 0/1 | Not started | - |
| 41. Command & Documentation Updates | 0/TBD | Not started | - |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 8 (DEFER-08-01) | User acceptance testing of TUI dashboard commands | post-v1.0 | Pending (not in scope) |
| Phase 30 (DEFER-30-01) | Full parallel execution with real teammate spawning on Claude Code | Future | PARTIALLY RESOLVED (v0.2.0, runtime gap) |
