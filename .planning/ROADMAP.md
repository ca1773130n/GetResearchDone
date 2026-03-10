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
- **v0.3.7 Claude Code Feature Sync - Phases 71-73 (active)**

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

### v0.3.7 Claude Code Feature Sync (Active)

Adopt Claude Code features added since v2.1.50: effort levels, new hook events, HTTP hooks, `${CLAUDE_SKILL_DIR}`, `ExitWorktree` tool, cron/loop awareness, and auto-memory documentation.

#### Phase 71: Effort Levels & Capability Flags

**Goal:** GRD's agent spawning system supports effort levels as a second dimension alongside model tier, and all new capability flags (effort, http_hooks, cron) are registered in BACKEND_CAPABILITIES.

**Dependencies:** None

**Requirements:** REQ-91, REQ-92, REQ-95, REQ-98

**Verification Level:** sanity

**Success Criteria:**

1. `BACKEND_CAPABILITIES.claude.effort` is `true`; other backends have `effort: false`
2. `BACKEND_CAPABILITIES.claude.http_hooks` is `true`; other backends have `http_hooks: false`
3. `BACKEND_CAPABILITIES.claude.cron` is `true`; other backends have `cron: false`
4. `resolveEffortLevel(agentRole, profile)` returns correct effort for each agent/profile combination (e.g., planner+quality returns `'high'`, verifier+budget returns `'low'`)
5. All `cmdInit*` functions include `effort_level` field in JSON output when backend supports effort
6. `cmdInitAutopilot` includes `cron_available` field in JSON output

#### Phase 72: Hook Events & Tool Updates

**Goal:** Plugin.json registers new hook events (TeammateIdle, TaskCompleted, InstructionsLoaded), worktree completion uses ExitWorktree when available, and command files use `${CLAUDE_SKILL_DIR}` where appropriate.

**Dependencies:** Phase 71

**Requirements:** REQ-93, REQ-94, REQ-96, REQ-97

**Verification Level:** sanity

**Success Criteria:**

1. `plugin.json` registers `TeammateIdle`, `TaskCompleted`, and `InstructionsLoaded` hook events with correct handler commands
2. Hook handler commands can access `agent_id` and `agent_type` metadata from hook event payloads
3. `execute-phase.md` and `grd-executor.md` include an `ExitWorktree` call before completion flow when `isolation_mode` is `"native"`
4. Command `.md` files that only need self-relative paths use `${CLAUDE_SKILL_DIR}` instead of `${CLAUDE_PLUGIN_ROOT}` (while `grd-tools.js` references retain `${CLAUDE_PLUGIN_ROOT}` since grd-tools lives in `bin/`, not the skill directory)

#### Phase 73: Testing & Documentation

**Goal:** All new capabilities have test coverage, CLAUDE.md reflects the updated feature set, and auto-memory interaction is documented.

**Dependencies:** Phase 72

**Requirements:** REQ-99, REQ-100, REQ-101

**Verification Level:** sanity

**Plans:** 2 plans

Plans:
- [ ] 73-01-PLAN.md — Backend capability flag + effort level resolution tests
- [ ] 73-02-PLAN.md — Init context tests + CLAUDE.md documentation updates

**Success Criteria:**

1. `backend.test.ts` verifies `effort`, `http_hooks`, and `cron` capability flags for all backends
2. Tests verify effort level resolution returns correct values for all 3 profiles (quality/balanced/budget) across key agent roles
3. Init context tests verify `effort_level` and `cron_available` fields in JSON output
4. CLAUDE.md agent model profiles table includes an effort column
5. CLAUDE.md documents new hook events (TeammateIdle, TaskCompleted, InstructionsLoaded)
6. CLAUDE.md includes a memory model section clarifying STATE.md vs auto-memory interaction
7. `npm test` passes with 0 failures across the full test suite

### Progress

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 71 | Effort Levels & Capability Flags | Not started | - |
| 72 | Hook Events & Tool Updates | Not started | - |
| 73 | Testing & Documentation | Not started | - |
