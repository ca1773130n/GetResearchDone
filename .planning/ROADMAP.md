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
- v0.3.21 Elicitation Replacement - Phase 86 (shipped 2026-03-24)
- v0.3.22 Autopilot v2 — Parallel Execution with Serial Integration - Phases 87-91 (in progress)
- v0.3.23 NERFIFY-Inspired Research Phase Enhancements - Phases 92-95 (planned)

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

<details>
<summary>v0.3.20 Multi-Agent Cross-Backend Discussion (Phases 82-85) - SHIPPED 2026-03-23</summary>

Phases 82-85 delivered multi-backend AI discussion orchestration. `dispatchToBackend()` dispatches prompts to Codex, Gemini, and OpenCode; `runDiscussion()` orchestrates parallel rounds and feeds responses to a synthesizer backend. Discussion integrated into plan-phase (brainstormer pre-planning context) and execute-phase (before-execution context), with cross-backend code review dispatching BLOCKER/WARNING findings. Four MCP tools (grd_discussion_run, grd_discussion_config, grd_backends_available, grd_discussion_history), /grd:discuss slash command. 3,557 tests, 27 lib/ modules. See `.planning/milestones/v0.3.20/` for details.

</details>

<details>
<summary>v0.3.21 Elicitation Replacement (Phase 86) - SHIPPED 2026-03-24</summary>

Phase 86 delivered the core elicitation detection and resolution primitives. `detectElicitation()` identifies question patterns in subprocess output using two-pass regex analysis (numbered options pre-scan, then line-by-line for direct questions, clarification phrases, option prompts). `buildElicitationContext()` packages phase goal, plan summary, and recent changes under 8K tokens. `resolveElicitation()` routes questions to multi-backend discussion and returns consensus answer with graceful fallback. 90%+ line coverage on elicitation module. See `.planning/milestones/v0.3.21/` for details.

</details>

### v0.3.22 Autopilot v2 — Parallel Execution with Serial Integration (In Progress)

**Milestone Goal:** Enhance autopilot with worktree-isolated parallel phase execution, a 4-step post-phase pipeline (simplify, PR, code review, rebase+merge), a serial merge queue preventing concurrent rebase races, write-intent manifests driving wave conflict detection, and always-on auto-resume with milestone mode as default.
**Start:** 2026-03-24

- [x] **Phase 87: Post-Phase Pipeline Core** - Simplify, PR creation, code review, and rebase+merge steps plus the pipeline orchestrator `implement` (completed 2026-03-24)
- [ ] **Phase 88: Serial Merge Queue and Conflict Resolution** - Sequential merge gate for parallel phases and conflict resolution subprocess `implement`
- [x] **Phase 89: Write-Intent Manifests and Wave Builder** - Phase plan file list declarations, wave-level conflict detection, and declared-vs-actual feedback `implement` (completed 2026-03-24)
- [ ] **Phase 90: Autopilot Mode Changes and Parallel Execution** - Always-on auto-resume, milestone-mode default, worktree-isolated parallel execution, and shared state locking `implement`
- [ ] **Phase 91: Integration Testing and Validation** - Unit tests for pipeline, merge queue, wave builder, and full E2E integration test `integrate`

#### Phase 87: Post-Phase Pipeline Core

**Goal**: Each autopilot phase completion triggers a 4-step sequential pipeline — simplify runs code quality cleanup, a PR is created from the phase branch, a code review subprocess fixes BLOCKER/WARNING findings, and the branch is rebased onto main and merged — all orchestrated by `runPostPhasePipeline()` with per-step timeouts and a `--skip-post-pipeline` escape hatch.
**Type**: implement
**Depends on**: Phase 86 (lib/autopilot.ts exists with subprocess spawn patterns to extend)
**Requirements**: REQ-160, REQ-161, REQ-162, REQ-163, REQ-164
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `buildSimplifyPrompt(phaseNum)` produces a prompt that, when spawned via `claude -p`, targets the phase's changed files for code quality review; subprocess invocation strips CLAUDE session env vars via `buildBackendEnv()`.
  2. `buildPRPrompt(phaseNum)` produces a PR creation prompt that calls `gh pr create` with a summary generated from the phase SUMMARY.md; result URL is captured and stored in the phase directory.
  3. `buildCodeReviewPrompt(phaseNum, prUrl)` produces a review prompt that reads VERIFICATION.md for BLOCKER/WARNING findings, spawns a fix subprocess, and marks blockers resolved on success.
  4. `buildRebaseMergePrompt(phaseNum)` produces a prompt that rebases the phase branch onto main and merges — using the serial merge queue from Phase 88 to ensure no concurrent rebases.
  5. `runPostPhasePipeline(phaseNum, options)` calls all 4 steps in order, respects `--skip-post-pipeline` flag, returns structured `PostPipelineResult` with per-step status, and writes result to `.planning/milestones/{milestone}/phases/{phase}/POST-PIPELINE.md`.
**Plans**: 2 plans

Plans:
- [x] 87-01: Simplify and PR creation pipeline steps and orchestrator skeleton
- [x] 87-02: Code review and rebase+merge steps with per-step timeout and skip flag

#### Phase 88: Serial Merge Queue and Conflict Resolution

**Goal**: Parallel phases that complete at the same time merge in arrival order via a shared serial merge queue. Conflict resolution spawns a claude -p subprocess to resolve conflicts automatically; non-zero exit halts autopilot with a structured error message identifying the conflicting files and manual resolution steps.
**Type**: implement
**Depends on**: Phase 87
**Requirements**: REQ-165, REQ-166
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `MergeQueue` class exposes a single `enqueue(fn)` method; concurrent enqueue calls execute in FIFO order with each fn completing fully before the next begins; implemented as a promise-chain tail (zero external dependencies).
  2. The autopilot wave loop passes each phase's rebase+merge step through the shared `MergeQueue` instance — parallel phases in the same wave run their execute steps concurrently but their merge steps are serialized.
  3. `buildConflictResolvePrompt(cwd, wtPath, conflictFiles)` produces a prompt instructing `claude -p` to resolve conflicts in the given worktree; on non-zero exit, autopilot halts with a message listing conflicting files and manual steps.
**Plans**: TBD

Plans:
- [ ] 88-01: MergeQueue implementation and autopilot wave loop integration
- [ ] 88-02: Conflict resolution subprocess and halt behavior

#### Phase 89: Write-Intent Manifests and Wave Builder

**Goal**: Each plan file declares `files_modified: string[]` in its YAML frontmatter. The wave builder reads these declarations before scheduling execution and splits conflicting plans into separate waves. After execution, declared files are compared against actual git changes; mismatches are logged as WRITE-INTENT-MISMATCH entries.
**Type**: implement
**Depends on**: Phase 88
**Requirements**: REQ-167, REQ-168, REQ-169
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `parseWriteIntent(planContent)` extracts `files_modified` from YAML frontmatter in a PLAN.md file; returns an empty array if the field is absent; handles both inline YAML list and dash-list formats.
  2. `splitWave(wave, writeIntents)` uses greedy first-fit to partition plans with overlapping `files_modified` into separate sub-waves; plans with no declared files are placed in the first sub-wave; `--force-parallel` returns the original wave unchanged.
  3. `compareWriteIntent(declared, actual)` returns an array of mismatch entries (undeclared writes and declared-but-unmodified files); `formatWriteIntentMismatch` produces `[WRITE-INTENT-MISMATCH]`-prefixed log lines for each entry.
**Plans**: 3 plans

Plans:
- [x] 89-01: Write-intent declaration in planner prompt and parsing in `cmdInitExecutePhase`
- [x] 89-02: Wave builder conflict check and `--force-parallel` flag
- [x] 89-03: Declared-vs-actual feedback logging after execution

#### Phase 90: Autopilot Mode Changes and Parallel Execution

**Goal**: `gd autopilot` defaults to milestone mode (all phases in current milestone), auto-resume is always on with no `--resume` flag, `--from`/`--to` are renamed `--phase-from`/`--phase-to`, independent phases execute concurrently in git worktrees with `STATE.md` and autopilot log writes using atomic rename for race safety, and milestone mode runs wireup discovery after all phases merge.
**Type**: implement
**Depends on**: Phase 89
**Requirements**: REQ-170, REQ-171, REQ-172, REQ-173, REQ-174
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `gd autopilot` called with no arguments enters milestone mode: reads all phases from ROADMAP.md for the current milestone, applies auto-resume logic (fully executed phases skipped, planned-but-not-executed phases skip to execute, no-plans phases start from plan), and runs the full loop.
  2. `--resume` flag is removed from `AutopilotOptions`, `cmdAutopilot`, and `cmdMultiMilestoneAutopilot`; `--from`/`--to` are renamed `--phase-from`/`--phase-to`; `commands/autopilot.md` skill definition is updated to match.
  3. Independent phases (no `depends_on` relationship) execute concurrently, each in its own git worktree created via `worktreePath()` and the existing worktree lifecycle in `lib/worktree.ts`; dependent phases block until their dependency's full post-phase pipeline completes and merges to main.
  4. `writeStatusMarker()` and `updateStateProgress()` write to `.planning/` in the main repo, not the worktree; writes to `STATE.md` and `autopilot.log` use write-to-temp-then-rename for POSIX atomicity, preventing partial writes under concurrent access.
  5. In milestone mode only, after all phases complete and their PRs merge, a wireup subprocess is spawned (`buildWireupPrompt()`) to run discovery for exported-but-uncalled, config-without-surface, and endpoint-without-integration-test issues; results are reported in the autopilot summary.
**Plans**: TBD

Plans:
- [ ] 90-01: Remove `--resume`, rename `--from`/`--to`, implement milestone-mode default and auto-resume
- [ ] 90-02: Worktree-isolated parallel execution with dependency blocking
- [ ] 90-03: Atomic STATE.md/log writes and milestone wireup step

#### Phase 91: Integration Testing and Validation

**Goal**: The full autopilot v2 pipeline is verified by unit tests (85%+ coverage on new pipeline code) and an E2E integration test that runs two independent phases through parallel execute, serial merge queue, and PR merge using mocked git/gh operations.
**Type**: integrate
**Depends on**: Phase 90
**Requirements**: REQ-175, REQ-176, REQ-177, REQ-178
**Verification Level**: full
**Success Criteria** (what must be TRUE):
  1. Unit tests for each post-phase pipeline step (simplify, PR creation, code review, rebase+merge) and `runPostPhasePipeline()` achieve 85%+ line coverage on new pipeline code; subprocess spawning, git operations, and gh CLI are mocked.
  2. Serial merge queue unit tests verify: (a) parallel phases merge in arrival order, (b) conflict-resolve subprocess is spawned with correct arguments when conflicts occur, (c) autopilot halts with structured error message when subprocess exits non-zero.
  3. Write-intent wave builder unit tests verify: (a) `files_modified` parsing from PLAN.md, (b) overlapping phases are moved to separate waves, (c) `--force-parallel` keeps all phases in one wave, (d) declared-vs-actual mismatch logging produces `[WRITE-INTENT-MISMATCH]` log entries.
  4. E2E integration test runs two independent phases through the full autopilot v2 loop — parallel execute in worktrees, serial merge queue, PR merge to main in order — using mock git/gh operations; test asserts phases merge in execution-completion order with no conflicts.
  5. `npm test` passes with all new and updated tests; `npm run lint` and `npm run build:check` pass with zero errors.
**Plans**: 3 plans

Plans:
- [ ] 91-01: Post-phase pipeline deep coverage and merge queue serialization tests
- [ ] 91-02: Write-intent parsing edge cases and buildWaves file-conflict tests
- [ ] 91-03: E2E integration test — two-phase parallel pipeline with serial merge

### v0.3.23 NERFIFY-Inspired Research Phase Enhancements (Planned)

**Milestone Goal:** Adapt 4 key innovations from the NERFIFY paper into GRD's research and execution phases: CFG formalization for typed plan/artifact schema validation, compositional citation recovery for deep research completeness, Graph-of-Thought topological synthesis for dependency-aware planning, and agentic knowledge enhancement for compounding improvements across phases.
**Start:** 2026-03-24

- [x] **Phase 92: CFG Formalization** - `lib/invariants.ts` with typed plan artifact schema, pre-flight validation gate in `grd-plan-checker`, and unit tests `implement` ✓ 2026-03-24
- [ ] **Phase 93: Compositional Citation Recovery** - Structured deep-diver output, citation graph storage in `lib/citations.ts`, citation recovery pass in `grd-phase-researcher`, and unit tests `implement`
- [ ] **Phase 94: Graph-of-Thought Synthesis** - Artifact DAG schema extension, `buildArtifactDAG()` in `lib/deps.ts`, wave builder DAG integration in `lib/parallel.ts`, and unit tests `implement`
- [ ] **Phase 95: Agentic Knowledge Enhancement** - `grd-knowledge-miner` agent, `KNOWHOW.md` storage, autopilot pipeline integration, and unit tests `implement`

#### Phase 92: CFG Formalization

**Goal**: A typed `lib/invariants.ts` module defines interfaces for plan artifacts (`objective`, `files_modified`, `provides`, `requires`, `integration_points`) and exposes three validation classes — structural (fields exist and have correct types), semantic (objectives reference valid modules, file paths plausible), and cross-phase (no duplicate `provides`, all `requires` are satisfied). The `grd-plan-checker` agent hard-rejects plans that fail invariant validation before they reach execution. Research artifacts (LANDSCAPE.md, PAPERS.md, RESEARCH.md) are validated for required sections.
**Type**: implement
**Depends on**: Phase 91 (v0.3.22 integration tests complete; `lib/gates.ts` available as wiring target)
**Requirements**: REQ-179, REQ-180, REQ-181
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `validateStructural(plan)`, `validateSemantic(plan, cwd)`, and `validateCrossPhase(plans)` are exported from `lib/invariants.ts` and return typed `ValidationResult` objects with `valid: boolean`, `errors: string[]`, and `warnings: string[]`.
  2. `grd-plan-checker` agent prompt references the invariant schema and calls the validation gate; a plan missing `objective` or containing a `requires` entry with no matching `provides` in the phase plan set is rejected with a structured error listing failed checks.
  3. Research artifact validation checks that LANDSCAPE.md contains a comparison table (Markdown `|` rows), PAPERS.md has structured entries (headings + field list), and RESEARCH.md has `## Method` and `## Tradeoffs` sections; missing sections produce actionable error messages.
  4. Unit tests achieve 90%+ line coverage on `lib/invariants.ts`; tests cover all three validation classes, valid-plan pass-through, malformed input edge cases (empty fields, missing keys, null values), and cross-phase duplicate-provides detection.
  5. `npm test`, `npm run lint`, and `npm run build:check` pass with zero errors after the new module is added.
**Plans**: 3/3 complete

Plans:
- [x] 92-01: `lib/invariants.ts` — typed interfaces and three validation classes
- [x] 92-02: `grd-plan-checker` gate wiring and research artifact validation
- [x] 92-03: Unit tests for all validation classes (90%+ coverage on `lib/invariants.ts`)

#### Phase 93: Compositional Citation Recovery

**Goal**: The `grd-deep-diver` agent emits structured `missing_components` and `borrowed_components` fields in PAPERS.md output. Citation graphs are stored as `.planning/research/citations/{paper-slug}.json`. `lib/citations.ts` exposes `buildCitationGraph()`, `resolveCitations()`, and `findUnresolved()`. The `grd-phase-researcher` agent runs a citation-recovery pass that fetches referenced papers via arXiv/Semantic Scholar APIs, extracts techniques, and populates the graph. A configurable gate blocks planning if critical unresolved dependencies remain.
**Type**: implement
**Depends on**: Phase 92 (invariant schema defines structured output contracts that citation fields must satisfy)
**Requirements**: REQ-182, REQ-183, REQ-184, REQ-185
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `grd-deep-diver` agent prompt instructs the agent to emit `missing_components: [{name, source_paper, description, code_available}]` and `borrowed_components: [{name, source_paper, description}]` sections in each PAPERS.md paper entry.
  2. `buildCitationGraph(papersDir)` parses all PAPERS.md files in a directory, extracts `missing_components` and `borrowed_components` entries, and returns a `CitationGraph` with `nodes` (paper slugs) and `edges` (dependency relationships); graph is stored as `citations/{paper-slug}.json`.
  3. `resolveCitations(graph, apiConfig)` attempts to fetch each unresolved dependency via arXiv API or Semantic Scholar API (mocked in tests), marks successfully fetched papers as resolved, and appends the extracted technique summary to the citation graph node.
  4. `findUnresolved(graph)` returns all citation graph nodes with `resolved: false`; the `grd-phase-researcher` gate checks this list and blocks the planning phase if any node has `priority: critical` and `resolved: false`.
  5. Unit tests achieve 85%+ line coverage on `lib/citations.ts`; API calls are mocked; tests cover graph construction from PAPERS.md, resolution marking, unresolved detection, and the configurable gate behavior.
**Plans**: TBD

Plans:
- [ ] 93-01: `lib/citations.ts` — citation graph data structures and `buildCitationGraph()`
- [ ] 93-02: `grd-deep-diver` structured output and `grd-phase-researcher` recovery pass
- [ ] 93-03: `resolveCitations()`, `findUnresolved()`, configurable planning gate, and unit tests

#### Phase 94: Graph-of-Thought Synthesis

**Goal**: Plan artifacts declare `provides: string[]`, `requires: string[]`, and `integration_points: string[]` fields (from the Phase 92 schema). `buildArtifactDAG(plans)` in `lib/deps.ts` constructs a directed graph from these declarations, validates for cycles and missing dependencies, and returns a topologically sorted execution order. `buildWaves()` in `lib/parallel.ts` consumes the artifact DAG alongside existing `depends_on` to sequence plans whose `requires` aren't yet provided. Resolved dependency context is injected into executor prompts.
**Type**: implement
**Depends on**: Phase 93 (citation recovery provides resolved component context that feeds into artifact `requires` declarations)
**Requirements**: REQ-186, REQ-187, REQ-188, REQ-189
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `buildPlanPrompt()` instructs the planner to declare `provides`, `requires`, and `integration_points` in each plan's YAML frontmatter; generated plans include these fields with semantically meaningful artifact names (e.g., `provides: ["lib/citations.ts:CitationGraph"]`).
  2. `buildArtifactDAG(plans)` constructs a directed graph where each edge represents a `requires`→`provides` dependency between plans; `validateArtifactDAG(dag)` returns errors for cycles (using DFS) and for `requires` entries with no matching `provides` in the plan set.
  3. `buildWaves(phases, options)` in `lib/parallel.ts` accepts an optional `artifactDAG` parameter; plans whose `requires` are not yet provided by an earlier wave are moved to a later wave, producing a topologically valid execution schedule that respects both `depends_on` and artifact dependencies.
  4. When a plan's `requires` is satisfied by a provider plan that has completed execution, the provider's SUMMARY.md content is injected into the executor's context prompt as a `<dependency_context>` block, making the resolved artifact available to the implementing agent.
  5. Unit tests achieve 85%+ line coverage on new code in `lib/deps.ts` and `lib/parallel.ts`; tests cover DAG construction, cycle detection (including multi-node cycles), topological sort correctness, wave builder integration, and dependency context injection.
**Plans**: TBD

Plans:
- [ ] 94-01: `buildArtifactDAG()` and `validateArtifactDAG()` in `lib/deps.ts`
- [ ] 94-02: `buildWaves()` DAG integration in `lib/parallel.ts` and `buildPlanPrompt()` update
- [ ] 94-03: Dependency context injection into executor prompts and unit tests

#### Phase 95: Agentic Knowledge Enhancement

**Goal**: A `grd-knowledge-miner` agent runs as a post-phase step in the autopilot pipeline (after verify, before post-pipeline). It analyzes phase execution output against recovered citations and the existing codebase, producing structured entries in `.planning/milestones/{milestone}/KNOWHOW.md`. Each entry contains: pattern name, source (paper slug, codebase path, or execution result), applicability conditions, and a code snippet. KNOWHOW.md is fed into `grd-planner` and `grd-phase-researcher` context for subsequent phases, creating compounding improvements.
**Type**: implement
**Depends on**: Phase 94 (artifact DAG and citation recovery both provide structured inputs for knowledge mining)
**Requirements**: REQ-190, REQ-191, REQ-192, REQ-193
**Verification Level**: proxy
**Success Criteria** (what must be TRUE):
  1. `agents/grd-knowledge-miner.md` defines a focused post-phase agent that reads the phase SUMMARY.md, VERIFICATION.md, resolved citation graph, and a sample of existing lib/ files to produce `KNOWHOW.md` entries with the required fields (pattern_name, source, applicability, code_snippet).
  2. `KNOWHOW.md` is stored at `.planning/milestones/{milestone}/KNOWHOW.md`; each entry is a level-3 heading with the pattern name followed by structured YAML fields; the file accumulates entries across phases without overwriting prior entries.
  3. `grd-planner` and `grd-phase-researcher` agent prompts include a conditional `<knowhow>` block that reads KNOWHOW.md if it exists and injects the top-5 most-applicable entries (by recency and module overlap) into the agent's context before plan generation.
  4. The autopilot pipeline in `lib/autopilot.ts` spawns the `grd-knowledge-miner` agent after `runVerification()` and before `runPostPhasePipeline()`; the step is skipped gracefully if the agent definition file does not exist (backward compatible); mining results are included in the phase SUMMARY.md.
  5. Unit tests for knowledge mining output parsing (KNOWHOW.md entry extraction and deduplication) and an integration test asserting the mining step appears in the autopilot pipeline execution sequence; `npm test`, `npm run lint`, and `npm run build:check` pass with zero errors.
**Plans**: TBD

Plans:
- [ ] 95-01: `agents/grd-knowledge-miner.md` and `KNOWHOW.md` storage format
- [ ] 95-02: `grd-planner` and `grd-phase-researcher` KNOWHOW.md context injection
- [ ] 95-03: Autopilot pipeline integration and unit + integration tests

## Progress

**Execution Order:**
Phases execute in numeric order: 87 -> 88 -> 89 -> 90 -> 91 -> 92 -> 93 -> 94 -> 95

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 82. Discussion Infrastructure | v0.3.20 | 3/3 | Complete | 2026-03-23 |
| 83. Discussion Protocol Core | v0.3.20 | 2/2 | Complete | 2026-03-23 |
| 84. Workflow Integration | v0.3.20 | 3/3 | Complete | 2026-03-23 |
| 85. MCP Tools, CLI, and Testing | v0.3.20 | 2/2 | Complete | 2026-03-23 |
| 86. Elicitation Detection and Resolution Core | v0.3.21 | 2/2 | Complete | 2026-03-24 |
| 87. Post-Phase Pipeline Core | v0.3.22 | 2/2 | Complete | 2026-03-24 |
| 88. Serial Merge Queue and Conflict Resolution | v0.3.22 | 0/TBD | Not started | - |
| 89. Write-Intent Manifests and Wave Builder | v0.3.22 | 0/TBD | Not started | - |
| 90. Autopilot Mode Changes and Parallel Execution | v0.3.22 | 0/TBD | Not started | - |
| 91. Integration Testing and Validation | v0.3.22 | 0/TBD | Not started | - |
| 92. CFG Formalization | v0.3.23 | 0/TBD | Not started | - |
| 93. Compositional Citation Recovery | v0.3.23 | 0/TBD | Not started | - |
| 94. Graph-of-Thought Synthesis | v0.3.23 | 0/TBD | Not started | - |
| 95. Agentic Knowledge Enhancement | v0.3.23 | 0/TBD | Not started | - |

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
