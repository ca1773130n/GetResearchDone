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
- v0.3.12 Multi-Backend Feature Sync - Phases 74-77 (shipped 2026-03-20)
- v0.3.13 Wireup Command - Phases 78-81 (active)

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

<details>
<summary>v0.3.12 Multi-Backend Feature Sync (Phases 74-77) - SHIPPED 2026-03-20</summary>

Phases 74-77 synced GRD with Claude Code 2.1.73-2.1.79, Codex CLI 0.115.0+, Gemini CLI v0.31-v0.34, and OpenCode v1.2.25-v1.2.27. Updated model mappings (gpt-5.4-mini for Codex haiku, gemini-3.1-pro/flash for Gemini), added 7 new capability flags (smart_approvals, plan_mode, sandbox_gvisor, sandbox_lxc, mcp_elicitation, model_overrides, max_output_tokens), registered StopFailure/PostCompact hook events, documented CLAUDE_PLUGIN_DATA boundary, added effort/maxTurns/disallowedTools frontmatter to all 20 agents, and updated CLAUDE.md. See `.planning/milestones/v0.3.12/` for details.

</details>

### v0.3.13 Wireup Command (Active)

Add `/grd:wireup` — a complement to `/grd:evolve` that focuses on wiring up features built by evolve iterations, making them fully functional through real end-to-end usage testing. Discovers unwired features, generates usage scenarios, executes them (HTTP/CLI and browser), detects missing connections, and auto-fixes high-confidence integration issues.

#### Phase 78: Core Wireup Infrastructure

**Goal:** The foundational `lib/wireup.ts` module exists with a working discovery engine that identifies unwired features via pure filesystem analysis, a scenario generator that produces structured JSON scenarios from codebase introspection, test data generation that writes reusable fixtures to the wireup directory, and state management functions that persist progress to `WIREUP-STATE.json`.

**Type:** implement

**Dependencies:** None

**Requirements:** REQ-121, REQ-122, REQ-125, REQ-128

**Verification Level:** proxy

**Success Criteria:**

1. `discoverUnwiredFeatures()` returns a structured list with category, file location, and suggested wiring action for at least the following categories: exported-but-uncalled functions, API endpoints without integration tests, and config options without CLI/UI surface
2. Scenario generation produces valid JSON with `step_type` (http, cli, browser, assert), `parameters`, and `expected_outcome` fields for each unwired feature
3. Test data fixtures are written to `.planning/milestones/{milestone}/wireup/test-data/` as valid JSON files with realistic payloads derived from schema/type analysis
4. `readWireupState()` and `writeWireupState()` round-trip correctly; `WIREUP-STATE.json` contains `features_discovered`, `scenarios_generated`, `scenarios_passed`, `scenarios_failed`, `fixes_applied`, and `iteration_history` fields
5. All functions use pure filesystem analysis (no LLM subprocess calls) — discovery completes without spawning any child processes

**Plans:** TBD

Plans:
- [x] 78-01: Implement `discoverUnwiredFeatures()` with filesystem analysis across unwired-feature categories
- [x] 78-02: Implement scenario generation and test data generation with fixture output
- [x] 78-03: Implement wireup state management (`WIREUP-STATE.json` read/write/advance)

#### Phase 79: Wireup Orchestrator and Execution

**Goal:** The `/grd:wireup` slash command is registered and orchestrates a full iteration (discover -> generate -> execute -> detect -> report). HTTP and CLI scenario execution works end-to-end with pass/fail reporting per step, missing connection classification produces structured reports with issue type and suggested fix, and all subagent spawns use the sonnet-tier model ceiling.

**Type:** implement

**Dependencies:** Phase 78

**Requirements:** REQ-120, REQ-123, REQ-126, REQ-131

**Verification Level:** proxy

**Success Criteria:**

1. `commands/wireup.md` exists with valid YAML frontmatter and `/grd:wireup` registered as a GRD slash command; `--target <feature>` optional argument is documented
2. HTTP scenario execution captures response body, status code, and headers; CLI scenario execution captures stdout, stderr, and exit code; both compare against expected outcomes and report pass/fail per step
3. Missing connection classification produces a structured report for each failure with: `issue_type` (one of: missing-route, unconnected-handler, missing-import, missing-middleware, broken-nav-link, missing-env-var), `source_file`, `target_file`, `suggested_fix`, and `confidence` (high/medium/low)
4. All `spawnClaude` calls in the wireup orchestrator use `SONNET_MODEL` constant — no opus model spawns
5. The orchestrator wires phases 78 and 79 together: a single `gd wireup` invocation calls discover, generates scenarios, executes HTTP/CLI scenarios, and outputs a pass/fail summary

**Plans:** TBD

Plans:
- [ ] 79-01: Register `/grd:wireup` slash command and implement orchestrator flow
- [ ] 79-02: Implement HTTP/CLI scenario execution with pass/fail comparison
- [ ] 79-03: Implement missing connection detection and classification

#### Phase 80: Browser Execution and Auto-Fix

**Goal:** Browser scenarios execute via Playwright MCP tools when available (gracefully skipped with `playwright_available: false` and suggested manual steps otherwise), high-confidence auto-fixes are applied by a sonnet-tier agent and verified by re-running the failed scenario, and each iteration produces a WIREUP-REPORT.md with trend-trackable history.

**Type:** implement

**Dependencies:** Phase 79

**Requirements:** REQ-124, REQ-127, REQ-129

**Verification Level:** proxy

**Success Criteria:**

1. Browser scenario execution is guarded by `playwright_available` detection; when unavailable, browser scenarios are skipped with a structured skip reason and manual testing suggestions in the report
2. When Playwright MCP tools are available, browser scenarios execute navigate, fill, click, and DOM-verification steps with console error capture
3. Auto-fix is attempted only for high-confidence issues; the fix agent uses sonnet-tier model; after fix application the failed scenario is re-run to verify; fix outcome (success/failure) is recorded in state
4. Low-confidence issues are NOT auto-fixed — they appear in the report under "Requires manual review" with suggested fix
5. `WIREUP-REPORT.md` is written to `.planning/milestones/{milestone}/wireup/` with: features tested count, scenarios run/passed/failed, issues found, fixes applied, remaining unwired features, and appended iteration history for trend tracking

**Plans:** 3 plans

Plans:
- [ ] 80-01-PLAN.md — Playwright MCP detection and browser scenario execution with graceful degradation
- [ ] 80-02-PLAN.md — Auto-fix capability with confidence gating and sonnet-tier re-run verification
- [ ] 80-03-PLAN.md — WIREUP-REPORT.md generation with iteration history and trend tracking

#### Phase 81: MCP Tools, Testing, and Integration

**Goal:** Five wireup MCP tools are registered in the MCP server following existing evolve tool patterns, unit tests for `lib/wireup.ts` achieve 85%+ line coverage, and an integration test validates the complete wireup flow on a fixture project with known unwired features.

**Type:** integrate

**Dependencies:** Phase 80

**Requirements:** REQ-130, REQ-132, REQ-133

**Verification Level:** full

**Success Criteria:**

1. Five MCP tools registered in `mcp-server.ts`: `grd_wireup_discover`, `grd_wireup_run`, `grd_wireup_state`, `grd_wireup_scenarios`, `grd_wireup_report` — each with correct parameter schemas and JSON-RPC response structure matching existing evolve tool patterns
2. `npm test` passes with 0 failures; `tests/unit/wireup.test.ts` achieves >= 85% line coverage per jest.config.js per-file thresholds
3. Unit tests cover: discovery engine (mock filesystem), scenario generation, scenario execution (mocked fetch/child_process), state read/write/advance, and missing connection detection
4. Integration test runs a full wireup iteration on a test fixture project with at least 2 known unwired features; validates discover -> generate -> execute -> detect -> report flow end-to-end
5. `grd_wireup_run` MCP tool can be invoked via `grd-tools.js` and returns structured JSON with `features_discovered`, `scenarios_run`, `issues_found` fields

**Plans:** TBD

Plans:
- [ ] 81-01: Register wireup MCP tools in mcp-server.ts
- [ ] 81-02: Write unit tests for lib/wireup.ts (85%+ coverage)
- [ ] 81-03: Write integration test for full wireup flow on fixture project

### Progress

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 74 | Model Mappings and Capability Flags | Complete | 2026-03-19 |
| 75 | Hook Events and Plugin Infrastructure | Complete | 2026-03-19 |
| 76 | Agent Frontmatter and MCP Elicitation | Complete | 2026-03-19 |
| 77 | Testing and Documentation | Complete | 2026-03-20 |
| 78 | Core Wireup Infrastructure | Complete | 2026-03-20 |
| 79 | Wireup Orchestrator and Execution | Not started | - |
| 80 | Browser Execution and Auto-Fix | Not started | - |
| 81 | MCP Tools, Testing, and Integration | Not started | - |

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
| Phase 78 | Live discovery accuracy on real GRD codebase (DEFER-78-01) | Phase 79, plan 79-01 | Pending |
| Phase 78 | Scenario executability by Phase 79 HTTP/CLI engine (DEFER-78-02) | Phase 79, plan 79-02 | Pending |
| Phase 78 | Coverage thresholds in jest.config.js (DEFER-78-03) | Phase 81, plan 81-02 | Pending |
| Phase 80 | Live Playwright MCP scenario execution | Future | Pending |
