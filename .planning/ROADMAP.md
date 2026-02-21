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
- v0.2.3 Improve Settings & Git Workflow - Phases 38-41 (shipped 2026-02-21)
- v0.2.4 Layered Integration - Phase 42 (shipped 2026-02-21)
- v0.2.5 WebMCP Support & Bugfixes - Phases 43-44 (shipped 2026-02-21)
- v0.2.6 Native Worktree Isolation - Phases 45-47 (shipped 2026-02-22)
- v0.2.7 Self-Evolution - Phases 48-52 (in progress)

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

<details>
<summary>v0.2.3 Improve Settings & Git Workflow (Phases 38-41) - SHIPPED 2026-02-21</summary>

Phases 38-41 unified the git workflow model with project-local worktrees, 4-option completion flow (merge/PR/keep/discard), revised settings interview covering worktree isolation/execution/code-review/gates, and cmdInitNewMilestone phase scanning bugfix. 1,653 tests passing (22 new). See `.planning/milestones/v0.2.3-ROADMAP.md` for details.

</details>

<details>
<summary>v0.2.4 Layered Integration (Phase 42) - SHIPPED 2026-02-21</summary>

Phase 42 borrowed best features from competing frameworks (Spec Kit, Agent OS, BMAD, Claude Flow) and integrated them as independent layers: Constitution (PRINCIPLES.md for project principles), Standards Discovery (/grd:discover for extracting codebase patterns), Scale-Adaptive Ceremony (light/standard/full levels controlling agent invocations), and Command Consolidation (45->39 commands). 48 new tests, 1,679 total passing. See `.planning/milestones/v0.2.4-ROADMAP.md` for details.

</details>

<details>
<summary>v0.2.5 WebMCP Support & Bugfixes (Phases 43-44) - SHIPPED 2026-02-21</summary>

Phases 43-44 added graceful WebMCP integration across execute-phase, verify-phase, and eval-planner workflows. MCP availability detection with `detectWebMcp()` in lib/backend.js, execute-phase WebMCP sanity checks (steps 4b/6b), verifier WebMCP tool discovery (Step 5b), eval-planner WebMCP tool definitions, and code reviewer false blocker fix. All WebMCP features guarded by `webmcp_available` conditional. 1,694 tests passing (15 new). See `.planning/milestones/v0.2.5/` for details.

</details>

<details>
<summary>v0.2.6 Native Worktree Isolation (Phases 45-47) - SHIPPED 2026-02-22</summary>

Phases 45-47 adopted Claude Code's native `isolation: worktree` via hybrid strategy. Native worktree isolation on Claude Code backend, manual worktree lifecycle preserved for other backends. WorktreeCreate/WorktreeRemove hooks, executor dual-mode (native/manual), parallel execution adaptation, 4-option completion flow for native branches, agent frontmatter audit. Bug fix: detectBackend(cwd) in parallel.js. 47 new tests, 3 deferred validations resolved live. 1,779 tests passing. See `.planning/milestones/v0.2.6/` for details.

</details>

### v0.2.7 Self-Evolution (In Progress)

**Milestone Goal:** GRD uses itself to improve itself -- dogfooding the full R&D workflow to fix bugs, reduce complexity and tech debt, and discover new features.
**Start:** 2026-02-22

- [x] **Phase 48: Dogfooding Infrastructure** - Set up testbed project and local CLI testing harness `implement`
- [x] **Phase 49: Bug Discovery & Fixes** - Fix currentMilestone bug and exercise workflows to find more `evaluate`
- [x] **Phase 50: Complexity & Tech Debt Reduction** - Audit modules, consolidate patterns, eliminate dead code `implement`
- [ ] **Phase 51: Test Coverage & Feature Discovery** - Improve coverage to 85%+ and implement dogfooding-driven features `implement`
- [ ] **Phase 52: Autopilot Command** - Plan and execute multiple phases autonomously with context isolation between each `implement`
- [ ] **Phase 53: Integration & Regression Testing** - Full regression suite, deferred validation resolution `integrate`

## Phase Details

### Phase 48: Dogfooding Infrastructure
**Goal**: Set up testbed as a GRD workflow test subject and establish local CLI testing harness, so subsequent phases can run GRD workflows on testbed to expose bugs in GRD source code
**Type**: implement
**Depends on**: Nothing (first phase of milestone)
**Requirements**: REQ-110, REQ-111
**Verification Level**: sanity
**Success Criteria** (what must be TRUE):
  1. `testbed/` initialized as GRD project (`.planning/` with PROJECT.md, ROADMAP.md, STATE.md, config.json)
  2. Running `node ../../bin/grd-tools.js state load` from testbed returns valid JSON — proves local CLI works against testbed
  3. At least one GRD workflow cycle (init, state, phase ops) completes on testbed without errors
  4. All discovered issues are filed as bugs against GRD source code (bin/, lib/), not testbed
**Plans**: 3 plans
Plans:
- [x] 48-01-PLAN.md -- Initialize testbed as GRD project with .planning/ structure
- [x] 48-02-PLAN.md -- Create local CLI testing harness (test-grd.sh + CLAUDE.md)
- [x] 48-03-PLAN.md -- End-to-end workflow validation on testbed with bug catalog

### Phase 49: Bug Discovery & Fixes
**Goal**: Fix bugs in GRD source code (lib/, bin/) discovered by running workflows on testbed — starting with currentMilestone() parsing bug, then systematic workflow exercise
**Type**: evaluate
**Depends on**: Phase 48
**Requirements**: REQ-112, REQ-113
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `currentMilestone(cwd)` in `lib/paths.js` returns `"v0.2.7"` (not `"v0.0.5"`) — fix in GRD source, test against testbed
  2. All `cmdInit*` functions in GRD source output correct `current_milestone` field
  3. Bug catalog documents each GRD source code issue found via testbed exercise, with reproduction test and fix
  4. All fixes are in GRD's `lib/` and `bin/` — zero changes to testbed to work around GRD bugs
  5. GRD test suite (tests/unit/, tests/integration/) validates every fix
**Plans**: 3 plans
Plans:
- [x] 49-01-PLAN.md -- Fix goal regex (BUG-48-002) and state-snapshot field names (BUG-48-003)
- [x] 49-02-PLAN.md -- Fix plan-index extraction (BUG-48-004) and state patch underscore mapping (BUG-48-005)
- [x] 49-03-PLAN.md -- Investigate BUG-48-001, verify all fixes via testbed, update bug catalog

### Phase 50: Complexity & Tech Debt Reduction
**Goal**: The top 3 most complex lib/ modules have measurably lower cyclomatic complexity, duplicate patterns are consolidated into shared utilities, and dead code is removed -- all without changing external behavior
**Type**: implement
**Depends on**: Phase 49
**Requirements**: REQ-114, REQ-115, REQ-116
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. A complexity audit report identifies the top 3 modules by cyclomatic complexity and function count, with before/after measurements showing reduction
  2. At least 3 duplicate code patterns are identified and consolidated into shared utility functions in `lib/utils.js` or appropriate modules
  3. All unused exports identified by static analysis are removed; `exports` objects contain only actively-consumed symbols
  4. Total lib/ LOC decreases by at least 100 lines (net, after adding any new shared utilities)
  5. Full test suite (1,842+ tests) passes with zero regressions after all changes
**Plans**: 3 plans
Plans:
- [x] 50-01-PLAN.md -- Remove 6 dead exports, decompose cmdTracker (634 lines) into handler-per-subcommand
- [x] 50-02-PLAN.md -- Decompose cmdDashboard (405 lines), add safeReadJSON/extractMarkdownSection utilities, consolidate safe-read patterns
- [x] 50-03-PLAN.md -- Consolidate cmdInit* boilerplate, tighten remaining code, generate complexity audit report, verify 100-line LOC reduction

### Phase 51: Test Coverage & Feature Discovery
**Goal**: All lib/ modules achieve 85%+ line coverage, and at least 2 new features driven by real dogfooding friction are implemented and tested
**Type**: implement
**Depends on**: Phase 50
**Requirements**: REQ-117, REQ-118
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `npm test` coverage report shows all 19 lib/ modules at 85%+ line coverage (currently some modules may be below this threshold)
  2. At least 2 new features are implemented based on friction points discovered during testbed exercise (documented with rationale)
  3. Each new feature has at least 3 unit tests covering normal path, edge case, and error handling
  4. Per-file coverage thresholds in `jest.config.js` are updated to enforce the new 85% floor
**Plans**: TBD

### Phase 52: Autopilot Command
**Goal**: Create `/grd:autopilot` command that plans and executes a range of phases autonomously, spawning separate fresh Task agents for planning and execution of each phase — solving context window bloat since both planning and execution are token-heavy operations that cannot share a single context
**Type**: implement
**Depends on**: Phase 49
**Requirements**: REQ-119
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `/grd:autopilot [start]-[end]` command exists (e.g., `/grd:autopilot 48-52`) that orchestrates planning and execution of multiple phases
  2. Each phase spawns TWO separate fresh agents: one for planning (`/grd:plan-phase N`), one for execution (`/grd:execute-phase N`) — both are token-heavy and must not share a context window
  3. The orchestrator loop per phase: spawn plan agent -> plan agent writes plans to disk and terminates -> spawn execute agent -> execute agent reads plans from disk, executes, writes SUMMARY.md, terminates -> read SUMMARY.md -> next phase
  4. Agents communicate exclusively through files on disk (plans, summaries, STATE.md) — not through conversation context. This is the natural handoff mechanism since GRD already writes structured artifacts.
  5. The orchestrator stays lightweight: it reads phase metadata from ROADMAP.md, spawns agents, checks for success/failure in the written artifacts, logs progress to STATE.md — never accumulating planning or implementation context
  6. `lib/autopilot.js` module with `cmdAutopilot` and `cmdInitAutopilot` functions, corresponding `commands/autopilot.md` skill, MCP tool registration
  7. Tested with at least 3 consecutive phases on the testbed, verifying plan and execute agents each get clean context windows
  8. Graceful handling: agent failure stops the loop and reports which phase and which step (plan or execute) failed, with the option to resume from the failed step
**Architecture Notes**:
  - Planning and execution are SEPARATE agents because both consume substantial context:
    - Plan agent: reads research, ROADMAP.md, requirements, codebase analysis → produces plan files
    - Execute agent: reads plan files, writes code, runs tests → produces SUMMARY.md
  - The orchestrator per phase is: `plan-agent(N)` → [disk: plans] → `execute-agent(N)` → [disk: summary] → next phase
  - Disk artifacts ARE the handoff mechanism — no context carries between agents. GRD already writes structured plans, summaries, and state to `.planning/`, so this is a natural fit.
  - The orchestrator itself never reads plan contents or code — it only checks: did the agent succeed? Are the expected files on disk? Then proceeds.
  - For Claude Code backend: uses Task tool to spawn fresh agents. For other backends: falls back to sequential `--print` mode invocations.
  - Optional ceremony/verification agents (code review, verification) can also be separate spawns if configured.
**Plans**: TBD

### Phase 53: Integration & Regression Testing
**Goal**: All GRD source code changes from phases 48-52 work together without regressions; full GRD workflow runs clean when exercised on testbed
**Type**: integrate
**Depends on**: Phase 52
**Requirements**: -
**Verification Level**: deferred->full
**Success Criteria** (what must be TRUE):
  1. Full test suite passes (target: 1,900+ tests, reflecting new tests from phases 48-52)
  2. `node bin/grd-tools.js validate consistency` reports zero errors on GRD's own `.planning/` directory
  3. End-to-end workflow on testbed completes: `new-project` -> `plan-phase` -> `execute-phase` -> `complete-milestone` without errors
  4. Autopilot command tested end-to-end: `/grd:autopilot` runs 3+ phases on testbed with clean context isolation verified
  5. All bug fixes from Phase 49 verified via regression tests that fail without the fix and pass with it
  6. No lint errors (`npm run lint` exits 0) and no formatting issues (`npm run format:check` exits 0)
**Deferred Validations Collected**:
  - DEFER-48-01: Full testbed lifecycle validation with real agent execution (if deferred from Phase 48)
  - DEFER-49-01: Comprehensive workflow coverage on testbed (if bugs discovered late in Phase 49 are deferred)
  - DEFER-52-01: Autopilot multi-backend fallback validation (if non-Claude-Code backends not tested)
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 48. Dogfooding Infrastructure | v0.2.7 | 3/3 | Complete | 2026-02-22 |
| 49. Bug Discovery & Fixes | v0.2.7 | 3/3 | Complete | 2026-02-22 |
| 50. Complexity & Tech Debt Reduction | v0.2.7 | 3/3 | Complete | 2026-02-22 |
| 51. Test Coverage & Feature Discovery | v0.2.7 | 0/TBD | Not started | - |
| 52. Autopilot Command | v0.2.7 | 0/TBD | Not started | - |
| 53. Integration & Regression Testing | v0.2.7 | 0/TBD | Not started | - |
