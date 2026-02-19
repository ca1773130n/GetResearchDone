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
- v0.2.0 Git Worktree Parallel Execution - Phases 27-31 (in progress)

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

### v0.2.0 Git Worktree Parallel Execution (In Progress)

**Milestone Goal:** Enable worktree-isolated phase execution with parallel teammate spawning for independent phases on Claude Code, sequential fallback on other backends.
**Start:** 2026-02-19

- [x] **Phase 27: Worktree Infrastructure** - Worktree creation, lifecycle management, and CLI tooling `implement` ✓ 2026-02-19
- [x] **Phase 28: PR Workflow from Worktree** - Branch push and PR creation from worktree directories `implement` (completed 2026-02-19)
- [ ] **Phase 29: Phase Dependency Analysis** - Dependency graph extraction and parallelizability detection `implement`
- [ ] **Phase 30: Parallel Execution & Fallback** - Teammate spawning for parallel phases with sequential fallback `implement`
- [ ] **Phase 31: Integration & Validation** - Full pipeline validation and deferred validation resolution `integrate`

## Phase Details

### Phase 27: Worktree Infrastructure
**Goal**: Phase execution operates in isolated git worktrees with full lifecycle management
**Type**: implement
**Depends on**: Nothing (first phase of v0.2.0)
**Duration**: 2d
**Requirements**: REQ-40, REQ-42
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `cmdInitExecutePhase` creates a git worktree at `os.tmpdir()/grd-worktree-{milestone}-{phase}` and outputs `worktree_path` and `worktree_branch` fields
  2. `grd-tools worktree create` creates a worktree in the expected temp directory and returns structured JSON with path and branch
  3. `grd-tools worktree remove` cleans up worktree directory and git worktree registration; handles non-existent worktree gracefully
  4. `grd-tools worktree list` returns all active worktrees as JSON array with path, branch, and phase metadata
  5. Stale worktree detection identifies worktrees from crashed sessions (no lock file, process not running) and `worktree remove --stale` cleans them up
**Plans:** 2 plans
Plans:
- [ ] 27-01-PLAN.md — TDD: Core worktree module (lib/worktree.js + tests)
- [ ] 27-02-PLAN.md — CLI routing, execute-phase init fields, MCP descriptors

### Phase 28: PR Workflow from Worktree
**Goal**: Completed phase work in a worktree automatically produces a PR targeting the base branch
**Type**: implement
**Depends on**: Phase 27
**Duration**: 1d
**Requirements**: REQ-41
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. Execute-phase command template includes worktree-aware PR creation step (push branch, create PR via `gh` or git remote)
  2. Executor agents receive `worktree_path` from init and all file operations (read, write, edit, bash cwd) target the worktree directory
  3. PR title and body include phase number, milestone version, and plan summary
  4. Worktree is cleaned up after PR creation (success path) and on failure (error path) via Phase 27 lifecycle management
**Plans:** 2/2 plans complete
Plans:
- [ ] 28-01-PLAN.md — TDD: PR creation library function (cmdWorktreePushAndPR + CLI + MCP)
- [ ] 28-02-PLAN.md — Execute-phase worktree lifecycle and executor worktree awareness

### Phase 29: Phase Dependency Analysis
**Goal**: Roadmap phases have explicit dependency declarations and tooling can identify parallelizable phase sets
**Type**: implement
**Depends on**: Nothing (independent of worktree work)
**Duration**: 1d
**Requirements**: REQ-43
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `depends_on` field is supported in ROADMAP.md phase definitions and parsed by roadmap module
  2. `grd-tools phase analyze-deps` returns a JSON dependency graph with nodes (phases) and edges (dependencies)
  3. `analyze-deps` output includes a `parallel_groups` array identifying sets of phases that can execute concurrently (no shared dependencies)
  4. Circular dependency detection reports an error with the cycle path rather than hanging or crashing
**Plans**: TBD

### Phase 30: Parallel Execution & Fallback
**Goal**: Independent phases execute concurrently via teammate agents on Claude Code, or sequentially on other backends
**Type**: implement
**Depends on**: Phase 27, Phase 29
**Duration**: 2d
**Requirements**: REQ-44, REQ-45
**Verification Level**: deferred
**Success Criteria** (what must be TRUE):
  1. `execute-phase` accepts multiple phase numbers (e.g., `execute-phase 27 28`) and validates they are independent per dependency analysis
  2. On Claude Code backend, independent phases spawn teammate agents each operating in a separate worktree; aggregate results are reported when all complete
  3. On non-Claude Code backends, multi-phase execution falls back to sequential processing with a log note that parallel execution is available on Claude Code
  4. Shared task coordination tracks per-phase status (pending, running, complete, failed) and reports aggregate pass/fail
  5. A single phase failure does not abort other running parallel phases; all results are collected and reported
**Plans**: TBD

### Phase 31: Integration & Validation
**Goal**: Full worktree-parallel pipeline validated end-to-end; all deferred validations resolved
**Type**: integrate
**Depends on**: Phase 27, Phase 28, Phase 29, Phase 30
**Duration**: 1d
**Requirements**: -
**Verification Level**: full
**Success Criteria** (what must be TRUE):
  1. End-to-end single-phase worktree execution: init -> worktree create -> plan execute in worktree -> PR create -> worktree cleanup (resolves DEFER-22-01)
  2. End-to-end parallel execution: two independent phases execute in separate worktrees simultaneously and produce separate PRs
  3. Sequential fallback produces identical artifacts to parallel execution (same PRs, same branch structure) on non-Claude Code backend
  4. All existing 1,433+ tests continue to pass with zero regressions
  5. New features have comprehensive test coverage (target: 40+ new tests across Phases 27-30)
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 27. Worktree Infrastructure | v0.2.0 | 0/2 | Not started | - |
| 28. PR Workflow from Worktree | v0.2.0 | Complete    | 2026-02-19 | - |
| 29. Phase Dependency Analysis | v0.2.0 | 0/TBD | Not started | - |
| 30. Parallel Execution & Fallback | v0.2.0 | 0/TBD | Not started | - |
| 31. Integration & Validation | v0.2.0 | 0/TBD | Not started | - |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 8 (DEFER-08-01) | User acceptance testing of TUI dashboard commands | post-v1.0 | Pending (not in scope) |
| Phase 22 (DEFER-22-01) | End-to-end git branching workflow validation | Phase 31 | Pending |
| Phase 30 (DEFER-30-01) | Full parallel execution with real teammate spawning on Claude Code | Phase 31 | Pending |
