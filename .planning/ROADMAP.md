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
- v0.3.13 Wireup Command - Phases 78-81 (shipped 2026-03-21)
- v0.3.20 Multi-Agent Cross-Backend Discussion - Phases 82-85 (shipped 2026-03-23)
- v0.3.21 Elicitation Replacement - Phases 86-88 (in progress)

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

<details>
<summary>v0.3.13 Wireup Command (Phases 78-81) - SHIPPED 2026-03-21</summary>

Phases 78-81 added `/grd:wireup` command — end-to-end integration wiring complement to `/grd:evolve`. New `lib/wireup/` sub-module directory (8 modules: types, state, discovery, scenarios, execution, detection, autofix, orchestrator, report, cli). Discovery engine finds unwired features via pure filesystem analysis across 3 categories (exported-but-uncalled, config-without-surface, endpoint-without-integration-test). Scenario generator produces structured HTTP/CLI/browser test sequences. Execution engine runs scenarios against localhost with pass/fail per step. Missing connection detector classifies failures into 7 issue types with suggested fixes. Auto-fix with confidence gating (high=auto, medium/low=manual review). Browser scenarios via Playwright MCP with graceful skip when unavailable. WIREUP-REPORT.md generation with iteration history. 5 new MCP tools (128 total). 151 unit tests (87.1% coverage), 15 E2E integration tests. See `.planning/milestones/v0.3.13/` for details.

</details>

### v0.3.20 Multi-Agent Cross-Backend Discussion (In Progress)

**Milestone Goal:** Enable GRD to orchestrate multi-backend AI discussions — dispatching prompts to Codex, Gemini, and OpenCode, synthesizing their responses, and integrating the output into plan-phase, execute-phase, and code review workflows.
**Start:** 2026-03-23

- [x] **Phase 82: Discussion Infrastructure** - Backend role config, availability detection, dispatch primitives, and model ceiling `implement` *(completed 2026-03-23)*
- [x] **Phase 83: Discussion Protocol Core** - Round orchestration, synthesis, and discussion state/history `implement` *(completed 2026-03-23)*
- [x] **Phase 84: Workflow Integration** - Auto-discussion before planning/execution and cross-backend plan/code/PR review `implement` *(completed 2026-03-23)*
- [x] **Phase 85: MCP Tools, CLI Command, and Testing** - grd_discussion_* MCP tools, /grd:discuss command, unit/integration tests `integrate` *(completed 2026-03-23)*

#### Phase 82: Discussion Infrastructure
**Goal**: The foundational layer for cross-backend dispatch is in place — config schema accepts `backend_roles`, `detectAvailableBackends()` probes PATH for all four AI CLIs, `dispatchToBackend()` in `lib/discussion.ts` spawns any configured backend with a structured prompt and returns a typed result, and all discussion subagent spawns on the primary backend are capped at sonnet-tier models.
**Type**: implement
**Depends on**: Phase 81 (lib/backend.ts exists with detection patterns to extend)
**Requirements**: REQ-134, REQ-135, REQ-136, REQ-143, REQ-149
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `config.json` accepts and validates `backend_roles` with four roles (`reviewer`, `brainstormer`, `verifier`, `executor`) mapping to valid backend IDs; invalid IDs rejected at load time.
  2. `detectAvailableBackends()` returns a `Record<BackendId, { available: boolean, version: string | null }>` that correctly reflects which CLIs are on PATH; result is cached with 5-minute TTL.
  3. `dispatchToBackend(backendId, prompt, options)` executes the target CLI with correct flags (`--print` for claude, `-q` for codex, default for gemini/opencode), captures stdout/stderr, and returns a typed `BackendResponse` with `backend`, `response_text`, `duration_ms`; times out after configurable duration (default 5 min) with a structured error.
  4. `discussion` config section (`enabled`, `before_planning`, `before_execution`, `max_rounds`, `timeout_per_round_seconds`, `synthesizer`) is validated on load; when `enabled: false` all discussion paths short-circuit silently.
  5. Discussion subagent spawns on the primary backend reference `SONNET_MODEL` constant, matching the ceiling established in `lib/wireup/state.ts` and `lib/evolve/`.
**Plans**: 3 plans

Plans:
- [ ] 82-01-PLAN.md — Types, config validation, and backend availability detection
- [ ] 82-02-PLAN.md — Cross-backend dispatch primitive (lib/discussion.ts)
- [ ] 82-03-PLAN.md — Unit tests for dispatch, availability, and config validation

#### Phase 83: Discussion Protocol Core
**Goal**: A complete discussion round can be run end-to-end — `runDiscussion(topic, participants, options)` orchestrates parallel dispatch, collects per-round responses, feeds them to a synthesizer backend, and writes a structured markdown history file to the milestone discussions directory.
**Type**: implement
**Depends on**: Phase 82
**Requirements**: REQ-137, REQ-144
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `runDiscussion()` dispatches to all `participants` in parallel for round 1, collects responses, passes the full set to the `synthesizer` backend, and (when `rounds >= 2`) runs a second round sharing the synthesis with each participant.
  2. `runDiscussion()` returns a typed `DiscussionResult` containing `rounds` (array of per-backend responses), `synthesis` (synthesizer output), `participants`, `topic`, and `duration_ms`.
  3. Each discussion produces a markdown file at `.planning/milestones/{milestone}/discussions/discussion-{phase}-{type}-{timestamp}.md` containing topic, participants, all round responses, synthesis, and outcome; file is written before the function returns.
  4. When a participant backend is unavailable, that participant is skipped with a structured `{ skipped: true, reason: string }` entry in the result — the discussion continues with remaining participants.
  5. `rounds` option is clamped to 1-3; `timeout_per_round_seconds` is respected per dispatch call.
**Plans**: 2 plans

Plans:
- [ ] 83-01-PLAN.md — Types (DiscussionResult, DiscussionRoundEntry, RunDiscussionOptions) and discussionsDir() path helper
- [ ] 83-02-PLAN.md — runDiscussion() orchestration, history I/O helpers, and comprehensive unit tests

#### Phase 84: Workflow Integration
**Goal**: Discussion output flows automatically into plan-phase and execute-phase workflows — the planner receives brainstormer discussion output as research context, and generated plans and code diffs are dispatched to the configured reviewer backend before the user is asked to proceed.
**Type**: implement
**Depends on**: Phase 83
**Requirements**: REQ-138, REQ-139, REQ-140, REQ-141, REQ-142
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. When `backend_roles.brainstormer` is configured, available, and `discussion.before_planning` is true, `plan-phase` automatically runs a pre-planning discussion round; the discussion markdown is included in the planner's context under a clearly labeled section.
  2. When `discussion.before_execution` is true, `execute-phase` runs a single-round discussion before dispatch; executor receives discussion output as additional context; feature is skipped silently when `before_execution: false`.
  3. When `backend_roles.reviewer` is configured, generated plans are dispatched to the reviewer before execution; reviewer returns `{ approved: boolean, concerns: Concern[], suggestions: string[] }`; unapproved plans present concerns to the user.
  4. After phase execution, the code diff is dispatched to the configured reviewer; the review returns `{ approved: boolean, issues: ReviewIssue[] }` where each issue has `severity` (`blocker`/`warning`/`suggestion`), `file`, `line_range`, `description`; blockers halt the completion flow.
  5. PR review (when `code_review.pr_review` is true and reviewer is configured) dispatches the PR diff via `gh` CLI output to the reviewer; returned comments are posted as PR review comments via `gh` CLI.
**Plans**: TBD

#### Phase 85: MCP Tools, CLI Command, and Testing
**Goal**: The full discussion surface is exposed — four MCP tools (`grd_discussion_run`, `grd_discussion_config`, `grd_backends_available`, `grd_discussion_history`) are registered and functional, `/grd:discuss` slash command runs ad-hoc discussions inline, and `lib/discussion.ts` has 85%+ unit test coverage with an integration test validating the complete discussion pipeline against mocked CLIs.
**Type**: integrate
**Depends on**: Phase 84
**Requirements**: REQ-145, REQ-146, REQ-147, REQ-148
**Verification Level**: full
**Success Criteria** (what must be TRUE):
  1. All four MCP tools are registered in the MCP server and return valid JSON responses: `grd_discussion_run` triggers a full discussion, `grd_discussion_config` reads/writes discussion config, `grd_backends_available` lists backends with their availability and assigned roles, `grd_discussion_history` lists and reads past discussion files.
  2. `/grd:discuss <topic>` command file exists with correct YAML frontmatter (`description`, `argument-hint`), invokes `runDiscussion()` on the given topic using configured participants, and renders each round's responses and the final synthesis in the terminal.
  3. `tests/unit/discussion.test.ts` covers `detectAvailableBackends()`, `dispatchToBackend()`, `runDiscussion()`, config validation, and history file I/O at 85%+ line coverage; per-file threshold is added to `jest.config.js`.
  4. Integration test validates the full pipeline: detect backends (mocked PATH) -> configure roles -> run 2-round discussion -> synthesize -> write history file -> read back via `grd_discussion_history` MCP tool; test uses the testbed pattern from v0.2.7.
  5. `npm test` passes with all new tests included; lint and type-check (`npm run build:check`) pass with zero errors.
**Plans**: 2 plans
Plans:
- [ ] 85-01-PLAN.md — Register 4 discussion MCP tools + /grd:discuss slash command
- [ ] 85-02-PLAN.md — Expand unit tests to 85%+ coverage + integration test for full pipeline

## Progress

**Execution Order:**
Phases execute in numeric order: 82 -> 83 -> 84 -> 85

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 82. Discussion Infrastructure | v0.3.20 | 3/3 | Complete | 2026-03-23 |
| 83. Discussion Protocol Core | v0.3.20 | 2/2 | Complete | 2026-03-23 |
| 84. Workflow Integration | v0.3.20 | 3/3 | Complete | 2026-03-23 |
| 85. MCP Tools, CLI, and Testing | v0.3.20 | 2/2 | Complete | 2026-03-23 |

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

### v0.3.21 Elicitation Replacement (In Progress)

**Milestone Goal:** Transform multi-backend discussion from a standalone tool into an autonomous decision layer — when the primary backend asks clarifying questions, route them to other AI backends for deliberation and feed the consensus back, enabling truly unattended autopilot and evolve.
**Start:** 2026-03-23

- [x] **Phase 86: Elicitation Detection and Resolution Core** - Pattern-based question detection, context builder, discussion routing `implement` *(completed 2026-03-24)*
- [ ] **Phase 87: Autopilot and Plan-Phase Integration** - Async subprocess spawning with stdin/stdout streaming, elicitation interception in autopilot and plan-phase `implement`
- [ ] **Phase 88: Execute-Phase, Evolve Integration, and E2E Testing** - Execute-phase and evolve loop integration, full pipeline integration test `integrate`

#### Phase 86: Elicitation Detection and Resolution Core
**Goal**: The core elicitation primitives are in place — `detectElicitation()` reliably identifies questions in subprocess output, `buildElicitationContext()` packages relevant project context, and `resolveElicitation()` routes questions through multi-backend discussion and returns a consensus answer.
**Type**: implement
**Requirements**: REQ-150, REQ-151, REQ-152, REQ-157
**Verification Level**: proxy
**Success Criteria**:
  1. `detectElicitation(output)` correctly identifies question patterns (lines ending with `?`, numbered options, "Please clarify") while avoiding false positives (questions in code comments, string literals, markdown headers).
  2. `buildElicitationContext()` produces a concise context string (under 8K tokens) containing the question, phase goal, plan summary, and recent changes.
  3. `resolveElicitation()` dispatches to configured participants, synthesizes a single-round discussion, and returns the consensus answer string. Handles all-unavailable gracefully (returns empty string).
  4. Unit tests cover detection patterns, false positive rejection, context building, and routing with 90%+ line coverage.
**Plans**: 2 plans
Plans:
- [ ] 86-01-PLAN.md — ElicitationDetection type + detectElicitation() with TDD tests
- [ ] 86-02-PLAN.md — buildElicitationContext() + resolveElicitation() with unit tests

#### Phase 87: Autopilot and Plan-Phase Integration
**Goal**: Autopilot subprocess spawning supports elicitation interception — detected questions are resolved via multi-backend discussion and the answer is fed back to the subprocess stdin, enabling uninterrupted autonomous planning.
**Type**: implement
**Depends on**: Phase 86
**Requirements**: REQ-153, REQ-154, REQ-159
**Verification Level**: proxy
**Success Criteria**:
  1. Autopilot subprocess spawning uses async `execFile` with stdin/stdout streaming when `elicitation_replacement` is enabled.
  2. Detected questions in planner subprocess output are intercepted, resolved via `resolveElicitation()`, and the answer is written to subprocess stdin.
  3. `elicitation_replacement` config flag controls the feature (default: true when discussion enabled and participants available).
  4. Elicitation settings exposed in `/grd:settings` interview.

#### Phase 88: Execute-Phase, Evolve Integration, and E2E Testing
**Goal**: Elicitation replacement is wired into all autonomous workflows (execute-phase, evolve) and validated end-to-end.
**Type**: integrate
**Depends on**: Phase 87
**Requirements**: REQ-155, REQ-156, REQ-158
**Verification Level**: full
**Success Criteria**:
  1. Execute-phase subprocess spawning supports elicitation interception (same mechanism as plan-phase).
  2. Evolve loop sub-agents support elicitation interception for discovery, selection, and execution decisions.
  3. E2E integration test validates: mock primary backend emits question → detection fires → discussion dispatched → consensus synthesized → answer fed back → subprocess continues.
  4. `npm test` passes with all new tests; lint and type-check pass.
