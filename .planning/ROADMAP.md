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
- v0.2.7 Self-Evolution - Phases 48-53 (shipped 2026-02-22)
- v0.2.8 Self-Evolving Loop - Phases 54-57 (shipped 2026-02-22)
- v0.3.0 TypeScript Migration & Refactoring - Phases 58-68 (shipped 2026-03-02)
- v0.3.1 Node v22 Compatibility Fix (shipped 2026-03-03)
- v0.3.2 Autopilot & Evolve Fixes (shipped 2026-03-03)
- v0.3.3 Evolve Dynamic Scanning & Dashboard Fix (shipped 2026-03-03)
- v0.3.4 Evolve Auto-Commit & PR Creation (shipped 2026-03-03)
- v0.3.5 Evolve Stabilization & Product Ideation (shipped 2026-03-09)
- v0.3.6 Backend Ecosystem Sync - Phases 69-70 (shipped 2026-03-11)
- v0.3.7 Claude Code Feature Sync - Phases 71-73 (shipped 2026-03-12)
- **v0.3.12 Multi-Backend Feature Sync - Phases 74-77 (active)**

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

<details>
<summary>v0.2.7 Self-Evolution (Phases 48-53) - SHIPPED 2026-02-22</summary>

Phases 48-53 dogfooded GRD on itself: testbed infrastructure, 5 bug fixes (currentMilestone parsing, goal regex, state-snapshot fields, plan-index extraction, underscore mapping), complexity reduction (cmdTracker/cmdDashboard decomposition, 6 dead exports removed), test coverage to 85%+ across all 20 modules, `/grd:autopilot` command for multi-phase autonomous execution, and full integration testing. New module: lib/autopilot.js. 204 new tests, 1,983 total passing. See `.planning/milestones/v0.2.7-ROADMAP.md` for details.

</details>

<details>
<summary>v0.2.8 Self-Evolving Loop (Phases 54-57) - SHIPPED 2026-02-22</summary>

Phases 54-57 closed the self-evolving loop: markdown splitting infrastructure (lib/markdown-split.js with split/reassemble/index), evolve core engine (lib/evolve.js with discovery across 6 dimensions, state management, merge dedup, priority selection), evolve orchestrator (/grd:evolve command with sonnet-tier model ceiling, evolution notes), and full integration validation (E2E tests, 310 items discovered on GRD codebase, all deferred validations documented). New modules: lib/evolve.js, lib/markdown-split.js. 6 new evolve MCP tools (118 total). 201 new tests, 2,184 total passing. See `.planning/milestones/v0.2.8/` for details.

</details>

<details>
<summary>v0.3.0 TypeScript Migration & Refactoring (Phases 58-68) - SHIPPED 2026-03-02</summary>

Phases 58-68 delivered full TypeScript migration with strict type checking, decomposed three oversized modules (commands/, context/, evolve/), migrated all tests, added multi-milestone autopilot, autoplan command, infinite evolve mode, and product ideation discovery engine. 44 plans across 11 phases. See `.planning/milestones/v0.3.0/` for details.

</details>

<details>
<summary>v0.3.1-v0.3.5 Incremental Releases - SHIPPED 2026-03-03 to 2026-03-09</summary>

- v0.3.1: Node v22 compatibility — replaced `require() as {}` with destructuring annotations
- v0.3.2: Node v22 compat, autopilot nested session crash fix, phase sort order fix
- v0.3.3: Evolve outcome matching fix, autopilot env var stripping, dynamic dir scanning, dashboard ROADMAP fallback
- v0.3.4: Evolve auto-commit, PR creation, and iteration feedback
- v0.3.5: Evolve real code enforcement, product-ideation filtering, batch size cap, saturated dim skipping, history dedup

</details>

<details>
<summary>v0.3.6 Backend Ecosystem Sync (Phases 69-70) - SHIPPED 2026-03-11</summary>

Phases 69-70 updated model mappings, capability flags, and detection logic for all supported backends to reflect the current AI CLI ecosystem as of March 2026. Gemini models updated to 3.1 series, Codex to gpt-5.4, OpenCode to claude-4-6 family. Gemini subagents promoted to GA. All test assertions updated. See `.planning/milestones/v0.3.6/` for details.

</details>

<details>
<summary>v0.3.7 Claude Code Feature Sync (Phases 71-73) - SHIPPED 2026-03-12</summary>

Phases 71-73 adopted Claude Code features added in v2.1.50-v2.1.72: effort levels (low/medium/high) as a second dimension alongside model tier, new capability flags (effort, http_hooks, cron), new hook events (TeammateIdle, TaskCompleted, InstructionsLoaded), ExitWorktree tool integration, CLAUDE_SKILL_DIR variable awareness, and auto-memory documentation. All init functions enriched with effort_level and cron_available fields. See `.planning/milestones/v0.3.7/` for details.

</details>

### v0.3.12 Multi-Backend Feature Sync (Active)

Sync GRD with latest features from Claude Code (2.1.73-2.1.79), Codex CLI (0.115.0+), Gemini CLI (v0.31-v0.34), and OpenCode (v1.2.25-v1.2.27). Update model mappings, capability flags, hook events, agent frontmatter, and backend detection across all four supported backends.

#### Phase 74: Model Mappings and Capability Flags

**Goal:** All four backends have accurate model mappings and capability flags reflecting the latest releases — Opus 4.6 / Sonnet 4.6 output token limits documented, GPT-5.4-mini added for Codex haiku tier, Gemini 3.1 Pro / Flash mappings updated, OpenCode model list updated, and new capability flags registered (smart_approvals, plan_mode, sandbox_gvisor, sandbox_lxc, mcp_elicitation, model_overrides, max_output_tokens).

**Dependencies:** None

**Requirements:** REQ-107, REQ-110, REQ-111, REQ-113, REQ-114, REQ-116

**Verification Level:** sanity

**Success Criteria:**

1. `MODEL_NAMES.codex.haiku` is `"gpt-5.4-mini"`; `DEFAULT_MODEL_NAMES.codex` includes the mini model entry
2. `DEFAULT_MODEL_NAMES.gemini.opus` is `"gemini-3.1-pro"` and `DEFAULT_MODEL_NAMES.gemini.sonnet` is `"gemini-3.1-flash"`
3. `BACKEND_CAPABILITIES.codex.smart_approvals` is `true`; all other backends have `smart_approvals: false`
4. `BACKEND_CAPABILITIES.gemini.plan_mode`, `sandbox_gvisor`, and `sandbox_lxc` flags are present and set correctly
5. `BACKEND_CAPABILITIES.claude.mcp_elicitation` is `true`; `model_overrides_available` field appears in `cmdInit*` JSON output when backend supports it
6. `max_output_tokens` for claude opus/sonnet models is documented in `BACKEND_CAPABILITIES` or model config (64k default, 128k upper bound)
7. `DEFAULT_MODEL_NAMES.opencode` reflects current GPT-5.4 availability; backend detection unaffected

**Plans:** 2 plans

Plans:
- [ ] 74-01-PLAN.md — Update DEFAULT_BACKEND_MODELS: Codex haiku to gpt-5.4-mini, Gemini sonnet to gemini-3.1-flash, verify OpenCode
- [ ] 74-02-PLAN.md — Add capability flags: smart_approvals, plan_mode, sandbox_gvisor, sandbox_lxc, mcp_elicitation, model_overrides, max_output_tokens

#### Phase 75: Hook Events and Plugin Infrastructure

**Goal:** Plugin.json registers StopFailure and PostCompact hook events, and CLAUDE_PLUGIN_DATA usage is documented with a clear boundary between project state (.planning/) and plugin state (CLAUDE_PLUGIN_DATA).

**Dependencies:** Phase 74

**Requirements:** REQ-102, REQ-103, REQ-108

**Verification Level:** sanity

**Success Criteria:**

1. `plugin.json` registers `StopFailure` hook event with a handler that logs failures in evolve/autopilot subprocesses
2. `plugin.json` registers `PostCompact` hook event (informational; handler acknowledges and continues)
3. `allowRead` sandbox setting awareness is noted in plugin.json or relevant handler comments
4. CLAUDE_PLUGIN_DATA integration is documented: `.planning/` = project state, `CLAUDE_PLUGIN_DATA` = cross-project plugin state
5. At least one cross-project config path (e.g., scheduler state, evolve global config) references `CLAUDE_PLUGIN_DATA` in documentation or code comments

**Plans:** 2 plans

Plans:
- [ ] 75-01-PLAN.md — StopFailure and PostCompact hook registration in plugin.json with handler implementations
- [ ] 75-02-PLAN.md — CLAUDE_PLUGIN_DATA documentation and usage boundary in evolve/autopilot modules

#### Phase 76: Agent Frontmatter and MCP Elicitation

**Goal:** All 20 GRD agent definitions have `effort`, `maxTurns`, and `disallowedTools` frontmatter fields set appropriately, and init context includes `mcp_elicitation_available` and `model_overrides_available` fields so agents know their execution environment.

**Dependencies:** Phase 74

**Requirements:** REQ-104, REQ-105, REQ-106

**Verification Level:** sanity

**Success Criteria:**

1. All 20 agent `.md` files have `effort` frontmatter (low/medium/high) matching GRD's model profile system (planner=high, verifier=medium, code-reviewer=medium, etc.)
2. Bounded agents have `maxTurns` set (e.g., code-reviewer: 15, verifier: 10, eval-planner: 20)
3. `disallowedTools` is present on agents that should be restricted (e.g., agents that must not write to disk directly)
4. `cmdInitExecutePhase` JSON output includes `mcp_elicitation_available` field (`true` for Claude backend, `false` otherwise)
5. `cmdInitExecutePhase` JSON output includes `model_overrides_available` field when backend supports model overrides

**Plans:** 2 plans

Plans:
- [ ] 76-01-PLAN.md — Agent frontmatter audit: effort, maxTurns, disallowedTools for all 20 agents
- [ ] 76-02-PLAN.md — MCP elicitation and modelOverrides awareness in init context

#### Phase 77: Testing and Documentation

**Goal:** Unit tests cover all new model mappings, capability flags, and init context fields; CLAUDE.md documents all changes; and backend-specific documentation (Codex realtime/filesystem RPC, Gemini tracker/A2A, OpenCode worktree fix) is recorded.

**Dependencies:** Phase 75, Phase 76

**Requirements:** REQ-109, REQ-112, REQ-115, REQ-117, REQ-118, REQ-119

**Verification Level:** sanity

**Success Criteria:**

1. `backend.test.ts` verifies `smart_approvals`, `plan_mode`, `sandbox_gvisor`, `sandbox_lxc`, `mcp_elicitation`, and `max_output_tokens` flags for all four backends
2. Tests verify new model mappings: `gpt-5.4-mini` for Codex haiku, `gemini-3.1-pro`/`gemini-3.1-flash` for Gemini, GPT-5.4 for OpenCode
3. Init context tests verify `mcp_elicitation_available` and `model_overrides_available` fields in JSON output
4. Tests verify `StopFailure` and `PostCompact` hook registrations in plugin.json
5. CLAUDE.md documents the `/effort` slash command interaction with GRD's effort profile system
6. CLAUDE.md updated with new capability flags table, agent frontmatter fields (effort/maxTurns/disallowedTools), and CLAUDE_PLUGIN_DATA usage
7. CLAUDE.md or inline comments document Codex realtime websocket sessions, Gemini tracker tools and A2A timeout, and OpenCode worktree session fix
8. `npm test` passes with 0 failures across the full test suite

**Plans:** TBD

Plans:
- [ ] 77-01: Unit tests for model mappings, capability flags, and init context fields
- [ ] 77-02: CLAUDE.md documentation updates and backend-specific notes

### Progress

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 71 | Effort Levels & Capability Flags | Complete | 2026-03-11 |
| 72 | Hook Events & Tool Updates | Complete | 2026-03-11 |
| 73 | Testing & Documentation | Complete | 2026-03-11 |
| 74 | Model Mappings and Capability Flags | Not started | - |
| 75 | Hook Events and Plugin Infrastructure | Not started | - |
| 76 | Agent Frontmatter and MCP Elicitation | Not started | - |
| 77 | Testing and Documentation | Not started | - |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 8 | User acceptance testing of TUI dashboard commands | post-v1.0 | Pending |
| Phase 30 | Full parallel execution with real teammate spawning on Claude Code | Future | Partially resolved |
| Phase 43 | Live MCP detection and code reviewer validation | Live run | Pending |
| Phase 44 | Live WebMCP workflow validation (3 items) | Live MCP env | Pending |
| Phase 54 | Markdown splitting on real-world large files | Future | Cannot validate |
| Phase 56 | Full evolve loop with sonnet-tier models | Future | Partially resolved |
| Phase 68 | Real Claude subprocess for product ideation + autoplan end-to-end (2 items) | Next real evolve cycle | Pending |
