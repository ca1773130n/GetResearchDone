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

- [ ] **Phase 48: Dogfooding Infrastructure** - Set up testbed project and local CLI testing harness `implement`
- [ ] **Phase 49: Bug Discovery & Fixes** - Fix currentMilestone bug and exercise workflows to find more `evaluate`
- [ ] **Phase 50: Complexity & Tech Debt Reduction** - Audit modules, consolidate patterns, eliminate dead code `implement`
- [ ] **Phase 51: Test Coverage & Feature Discovery** - Improve coverage to 85%+ and implement dogfooding-driven features `implement`
- [ ] **Phase 52: Integration & Regression Testing** - Full regression suite, deferred validation resolution `integrate`

## Phase Details

### Phase 48: Dogfooding Infrastructure
**Goal**: Testbed project exercises the full GRD lifecycle (new-project, milestones, phases, plans) via local CLI, proving the workflow works end-to-end for a real user
**Type**: implement
**Depends on**: Nothing (first phase of milestone)
**Requirements**: REQ-110, REQ-111
**Verification Level**: sanity
**Success Criteria** (what must be TRUE):
  1. `testbed/` directory contains a complete GRD project with `.planning/PROJECT.md`, `ROADMAP.md`, `STATE.md`, and `config.json`
  2. Running `node bin/grd-tools.js state load` from the testbed directory returns valid JSON with correct milestone and phase data
  3. At least one full cycle (new-project -> roadmap -> plan-phase -> execute-phase) completes without errors using local CLI
  4. A test script or documented procedure validates local CLI commands against the testbed (not the cached plugin)
**Plans**: TBD

### Phase 49: Bug Discovery & Fixes
**Goal**: The `currentMilestone()` function returns the correct active milestone version, and all GRD workflows exercised on the testbed produce correct results without crashes or data corruption
**Type**: evaluate
**Depends on**: Phase 48
**Requirements**: REQ-112, REQ-113
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `currentMilestone(cwd)` returns `"v0.2.7"` (not `"v0.0.5"`) when STATE.md contains "v0.2.7 Self-Evolution" as the active milestone
  2. `currentMilestone(cwd)` correctly parses milestone versions from STATE.md lines containing milestone names with spaces (e.g., "v0.2.7 Self-Evolution", "v0.1.0 Setup")
  3. All `cmdInit*` functions output the correct `current_milestone` field matching the active milestone in STATE.md
  4. A bug catalog document lists all issues discovered during testbed exercise, with each bug having a test that reproduces it and a fix that passes
  5. Zero workflow commands (state, phase, roadmap, milestone operations) crash or produce invalid output when run on the testbed
**Plans**: TBD

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
  5. Full test suite (1,779+ tests) passes with zero regressions after all changes
**Plans**: TBD

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

### Phase 52: Integration & Regression Testing
**Goal**: All milestone changes work together without regressions, deferred validations are resolved, and the full GRD workflow runs clean on both the testbed and GRD's own project
**Type**: integrate
**Depends on**: Phase 51
**Requirements**: -
**Verification Level**: deferred->full
**Success Criteria** (what must be TRUE):
  1. Full test suite passes (target: 1,850+ tests, reflecting new tests from phases 48-51)
  2. `node bin/grd-tools.js validate consistency` reports zero errors on GRD's own `.planning/` directory
  3. End-to-end workflow on testbed completes: `new-project` -> `plan-phase` -> `execute-phase` -> `complete-milestone` without errors
  4. All bug fixes from Phase 49 verified via regression tests that fail without the fix and pass with it
  5. No lint errors (`npm run lint` exits 0) and no formatting issues (`npm run format:check` exits 0)
**Deferred Validations Collected**:
  - DEFER-48-01: Full testbed lifecycle validation with real agent execution (if deferred from Phase 48)
  - DEFER-49-01: Comprehensive workflow coverage on testbed (if bugs discovered late in Phase 49 are deferred)
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 48. Dogfooding Infrastructure | v0.2.7 | 0/TBD | Not started | - |
| 49. Bug Discovery & Fixes | v0.2.7 | 0/TBD | Not started | - |
| 50. Complexity & Tech Debt Reduction | v0.2.7 | 0/TBD | Not started | - |
| 51. Test Coverage & Feature Discovery | v0.2.7 | 0/TBD | Not started | - |
| 52. Integration & Regression Testing | v0.2.7 | 0/TBD | Not started | - |
