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
- v0.2.5 WebMCP Support & Bugfixes - Phases 43-44 (in progress)

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

### v0.2.5 WebMCP Support & Bugfixes (In Progress)

**Milestone Goal:** Add graceful WebMCP integration across execute-phase, verify-phase, and eval-planner workflows, plus fix code reviewer false blocker on VERIFICATION.md.

- [ ] **Phase 43: MCP Detection & Code Reviewer Fix** - Foundation: MCP availability detection exposed in init JSON; code reviewer VERIFICATION.md false blocker fix `implement`
- [ ] **Phase 44: WebMCP Workflow Integration** - Execute-phase sanity checks, verify-phase tool calls, and eval-planner WebMCP definitions `implement`

## Phase Details

### Phase 43: MCP Detection & Code Reviewer Fix
**Goal**: All init workflows expose MCP availability status and the code reviewer no longer falsely blocks on missing VERIFICATION.md
**Type**: implement
**Depends on**: Nothing (first phase of milestone)
**Requirements**: REQ-96, REQ-100
**Verification Level**: sanity
**Success Criteria** (what must be TRUE):
  1. `cmdInitExecutePhase` JSON output includes a `webmcp_available` boolean field reflecting whether Chrome DevTools MCP is configured
  2. When Chrome DevTools MCP is not available, all WebMCP-dependent features in init output indicate "skipped" with a clear reason
  3. The grd-code-reviewer agent prompt explicitly excludes VERIFICATION.md from its must_haves artifact validation
  4. Code review of a phase that has not yet run verify-phase does not produce a blocker for missing VERIFICATION.md
**Plans**: 1 plan

Plans:
- [ ] 43-01-PLAN.md — MCP availability detection in init workflows (REQ-96) + code reviewer VERIFICATION.md exclusion fix (REQ-100)

### Phase 44: WebMCP Workflow Integration
**Goal**: Execute-phase runs WebMCP sanity checks after each plan, verify-phase discovers and calls WebMCP tools, and eval-planner generates `useWebMcpTool()` definitions for frontend phases
**Type**: implement
**Depends on**: Phase 43
**Requirements**: REQ-97, REQ-98, REQ-99
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. After each plan execution in execute-phase, three WebMCP health checks run (`hive_get_health_status`, `hive_check_console_errors`, `hive_get_page_info`) when MCP is available; all three are skipped gracefully when MCP is unavailable
  2. First WebMCP check failure triggers a retry; second consecutive failure halts execution with a clear error message identifying which check failed
  3. The grd-verifier agent calls `hive_list_registered_tools` to discover available WebMCP tools and includes tool call results in VERIFICATION.md
  4. The grd-eval-planner agent outputs `useWebMcpTool()` call definitions in EVAL.md when the phase modifies frontend views
  5. All three agent/command template modifications (execute-phase.md, grd-verifier.md, grd-eval-planner.md) include conditional guards that check `webmcp_available` before attempting any MCP tool calls
**Plans**: TBD

Plans:
- [ ] 44-01: Execute-phase WebMCP sanity checks with retry/halt logic (REQ-97)
- [ ] 44-02: Verify-phase WebMCP tool discovery and invocation (REQ-98) + eval-planner WebMCP definitions (REQ-99)

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 43. MCP Detection & Code Reviewer Fix | 0/1 | Not started | - |
| 44. WebMCP Workflow Integration | 0/2 | Not started | - |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 8 (DEFER-08-01) | User acceptance testing of TUI dashboard commands | post-v1.0 | Pending (not in scope) |
| Phase 30 (DEFER-30-01) | Full parallel execution with real teammate spawning on Claude Code | Future | PARTIALLY RESOLVED (v0.2.0, runtime gap) |
