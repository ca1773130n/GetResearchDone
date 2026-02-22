# Milestones

## v0.2.5 WebMCP Support & Bugfixes (Shipped: 2026-02-21)

**Phases completed:** 2 phases (43-44), 3 plans, 4 tasks
**Timeline:** 2026-02-21 (single day)
**Source:** 19 lib/ modules, 1,694 tests

**Key accomplishments:**
- MCP availability detection: `detectWebMcp()` with config/env-var/MCP-server cascade, exposed in all init JSON outputs
- Execute-phase WebMCP sanity checks (steps 4b/6b): three health checks with retry-once-then-halt logic after each plan execution
- Verifier WebMCP tool discovery (Step 5b): `hive_list_registered_tools` discovery, generic + page-specific tool invocation, results in VERIFICATION.md
- Eval planner WebMCP tool definitions: `design_webmcp_tools` step generates `useWebMcpTool()` call definitions for frontend phases
- Code reviewer fix: `artifact_exclusions` step prevents false VERIFICATION.md blocker findings
- All WebMCP features guarded by `webmcp_available` conditional — graceful skip when MCP unavailable

**Key decisions:**
- 44-01: WebMCP sanity checks inserted as sub-steps (4b/6b) to preserve existing step numbering
- 44-01: Teams flow step 6b cross-references standard flow step 4b rather than duplicating full logic
- 44-02: Step 5b placed between tiered verification and experiment verification in grd-verifier

**Deferred:**
- DEFER-43-01/02: Live MCP detection and code reviewer validation (requires Chrome DevTools MCP)
- DEFER-44-01/02/03: Live WebMCP workflow validation (requires Chrome DevTools MCP + frontend phase)

---

## v0.0.5 Production-Ready R&D Workflow Automation (Shipped: 2026-02-15)

**Phases completed:** 8 phases, 23 plans, 57 decisions
**Timeline:** 2026-02-12 to 2026-02-15 (4 days)
**Source:** 10 lib/ modules (8,295 LOC), 14 test files (8,010 LOC), 594 tests

**Key accomplishments:**
- Security hardening: eliminated all execSync shell interpolation, added input validation, git operation whitelist, SECURITY.md
- Modularized 5,632-line monolith into 10 lib/ modules with 108 exports (thin 188-line CLI router)
- Jest test suite with 594 tests, 80%+ line coverage across all modules
- CI/CD pipeline: GitHub Actions with Node 18/20/22 matrix, release workflow
- ESLint v10 flat config + Prettier enforcement (zero errors across 12 source files)
- Input validation layer on all CLI arguments (phase names, file paths, git refs, flags)
- JSDoc on all 105 exported functions (294 @param tags)
- TUI dashboard, phase-detail, and health commands for project visibility
- Version bumped to 0.0.5 with CHANGELOG, CONTRIBUTING.md, and manifest

**Deferred to next milestone:**
- DEFER-08-01: User acceptance testing of TUI dashboard commands

---


## v0.1.0 Setup Functionality & Usability (Shipped: 2026-02-16)

**Phases completed:** 5 phases (9-13), 10 plans, 62 key decisions
**Timeline:** 2026-02-16 (single day)
**Source:** 3 new lib/ modules (+1,755 LOC), 858 tests (+264 from v0.0.5)

**Key accomplishments:**
- Multi-backend detection for Claude Code, Codex CLI, Gemini CLI, and OpenCode with config override waterfall
- Dynamic model detection via OpenCode `opencode models` CLI probing with 5-min TTL cache
- Backend capabilities registry with per-backend feature flags (subagents, parallel, teams, hooks, mcp)
- `detect-backend` CLI command with `models_source` field and all 14 `cmdInit*` enriched with backend info
- Hierarchical roadmap (Now/Next/Later) with LONG-TERM-ROADMAP.md schema, mode auto-detection
- Milestone refinement (in-place markdown editing) and promotion (Later->Next->Now tier movement)
- `long-term-roadmap` CLI with 9 subcommands: parse, validate, display, mode, generate, refine, promote, tier, history
- Auto-cleanup quality analysis: ESLint complexity, dead export detection, file size checks at phase boundaries
- `quality-analysis` CLI command with structured reports; non-blocking integration into phase completion

**Deferred to v0.1.1:**
- Phase 14: Auto-Cleanup Doc Drift & Plan Generation (REQ-10, REQ-11)
- Phase 15: Integration & Validation
- DEFER-09-01: Backend detection accuracy across real environments
- DEFER-10-01: Context init backward compatibility under all 4 backends
- DEFER-11-01: Long-term roadmap round-trip integrity
- DEFER-13-01: Auto-cleanup non-interference when disabled

---


## v0.1.1 Completeness, Interoperability & Distribution (Shipped: 2026-02-16)

**Phases completed:** 5 phases (14-18), 11 plans, 37 key decisions
**Timeline:** 2026-02-16 (single day)
**Source:** 1,305 tests (+447 from v0.1.0), MCP server (1,608 LOC), expanded cleanup (1,393 LOC)

**Key accomplishments:**
- Doc drift detection (CHANGELOG staleness, broken README links, JSDoc mismatches) with auto-generated cleanup plans
- 4 expanded quality analyzers: test coverage gaps, export consistency, doc staleness, config schema drift
- All 4 deferred validations resolved: backend detection, context init, roadmap round-trip, cleanup non-interference
- MCP server exposing 97 GRD CLI commands as MCP tools via JSON-RPC 2.0 over stdio with auto-generated schemas
- npm package configuration: postinstall scaffold, setup command, CI pack/install validation
- E2E workflow integration test validating full phase lifecycle
- MCP server usage guide (docs/mcp-server.md)

**Deferred:**
- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)

---


## v0.1.2 Developer Experience & Requirement Traceability (Shipped: 2026-02-16)

**Delivered:** Requirement inspection CLI commands, phase-detail requirement summaries, planning artifact search, and requirement status management.

**Phases completed:** 2 phases (19-20), 4 plans, 4 key decisions
**Timeline:** 2026-02-16 (single day)
**Source:** 1,343 tests (+38 from v0.1.1), 7 files modified (+1,135 LOC)

**Key accomplishments:**
- Requirement inspection: `get`, `list`, `traceability` commands with archived milestone fallback and composable filters
- Phase-detail enhancement with requirement summaries (JSON + TUI output)
- Planning artifact search command with recursive case-insensitive matching
- Requirement status update command with regex-based traceability matrix editing

**Descoped to next milestone:**
- Phase 21: MCP Extension & Wiring (REQ-37)
- DEFER-08-01: User acceptance testing of TUI dashboard (post-v1.0)

**Git range:** `feat(19-01)` -> `docs(phase-20)`

**What's next:** MCP tool wiring for new CLI commands, then further usability improvements

---


## v0.1.3 MCP Completion & Branching Fix (Shipped: 2026-02-17)

**Delivered:** Wired all v0.1.2 CLI commands as MCP tools and fixed execute-phase branching to always fork from latest base branch.

**Phases completed:** 2 phases (21-22), 3 plans, 5 key decisions
**Timeline:** 2026-02-16 to 2026-02-17 (2 days)
**Source:** 1,360 tests (+17 from v0.1.2), 7 files modified

**Key accomplishments:**
- MCP tool wiring: 5 new tools (requirement get/list/traceability/update-status, search) increasing total from 97 to 102 with 92% line coverage
- MCP documentation: docs/mcp-server.md updated with new Requirement & Search section
- Execute-phase branching fix: `base_branch` config support (default "main") with checkout-and-pull logic before phase branch creation
- 4 graceful edge case handlers: uncommitted changes, already-on-base, checkout failure, pull failure

**Deferred:**
- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)
- DEFER-22-01: End-to-end git branching workflow validation (integration phase)

**Git range:** `feat(21-01)` -> `docs(phase-22)`

**What's next:** v0.1.5 Long-Term Roadmap Redesign

---


## v0.1.4 Slash Command Registration & Missing Commands (Shipped: 2026-02-17)

**Delivered:** Registered all 45 slash commands as skills and added two missing commands.

**Key accomplishments:**
- Added YAML frontmatter (description + argument-hint) to 28 command files that were missing it, fixing skill registration
- Created `/grd:long-term-roadmap` and `/grd:requirement` slash commands
- Expanded README command table from 24 to 45 commands, updated MCP tool count to 102

---


## v0.1.5 Long-Term Roadmap Redesign (Shipped: 2026-02-17)

**Delivered:** Replaced rigid Now/Next/Later tier system with flat, ordered LT-N milestone model supporting full CRUD operations, protection rules, and cross-workflow integration.

**Phases completed:** 3 phases (23-25), 1,399 tests (+39 from v0.1.3)
**Timeline:** 2026-02-17 (single day)

**Key accomplishments:**
- Complete rewrite of `lib/long-term-roadmap.js` with 18 new functions for flat LT-N format
- 12 new subcommands: list, add, remove, update, refine, link, unlink, display, init, history, parse, validate
- Removed 4 old subcommands: mode, generate, promote, tier
- 12 new MCP tools (105 total, replacing 9 old tier-based tools)
- Protection rules: cannot remove LT milestones with shipped normal milestones; cannot unlink shipped versions
- Auto-initialization: `init` subcommand auto-groups existing ROADMAP.md milestones into LT-1
- Normal milestone linking with `(planned)` annotations
- Comprehensive tutorial: `docs/long-term-roadmap-tutorial.md`
- LT roadmap integration added to agents (grd-roadmapper, grd-product-owner) and commands (new-milestone, complete-milestone, new-project)
- Updated all docs: README, CLAUDE.md, mcp-server.md, quickstart, CHANGELOG

**Removed:**
- `mode`, `generate`, `promote`, `tier` subcommands
- Now/Next/Later tier hierarchy
- `roadmap_type` and `planning_horizon` frontmatter fields

**Deferred:**
- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)

---


## v0.1.6 Phase Directory Collision Fix (Shipped: 2026-02-19)

**Delivered:** Milestone-scoped phase directory archival and validation gate system to prevent phase directory collisions across milestones.

**Phases completed:** 1 phase (26), 1 plan, 3 tasks
**Timeline:** 2026-02-19 (single day)
**Source:** 1,433 tests (+34 from v0.1.5), 11 files modified (+1,114 LOC), 1 new module (lib/gates.js)

**Key accomplishments:**
- New `lib/gates.js` module: 6 gate checks (orphaned-phases, phase-in-roadmap, phase-has-plans, stale-artifacts, old-phases-archived, milestone-state-coherence) with declarative registry mapping 10 commands
- Phase directory archival in `cmdMilestoneComplete`: copies to `.planning/milestones/{version}-phases/`, clears `.planning/phases/`
- Gate integration in init functions (`cmdInitExecutePhase`, `cmdInitPlanPhase`, `cmdInitNewMilestone`) and phase operations (`cmdPhaseAdd`, `cmdPhaseInsert`, `cmdPhaseComplete`, `cmdMilestoneComplete`)
- `suggested_start_phase` computed from archived + current phases in `cmdInitNewMilestone`
- `consistency_warning` in `findPhaseInternal` for stale phase detection
- YOLO bypass: `autonomous_mode: true` → gates report but don't block
- `cmdValidateConsistency` refactored to reuse gate checks; orphaned phases promoted to errors

**Deferred:**
- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)
- DEFER-22-01: End-to-end git branching workflow validation (integration phase)

---


## v0.2.0 Git Worktree Parallel Execution (Shipped: 2026-02-19)

**Delivered:** Worktree-isolated phase execution with parallel teammate spawning for independent phases, sequential fallback for non-Claude Code backends.

**Phases completed:** 5 phases (27-31), 10 plans, 52 commits
**Timeline:** 2026-02-19 (single day)
**Source:** 1,577 tests (+144 from v0.1.6), 59 files changed (+10,867 LOC), 3 new modules (lib/worktree.js, lib/deps.js, lib/parallel.js)

**Key accomplishments:**
- Git worktree lifecycle management (`lib/worktree.js`): create, remove, list, stale cleanup with macOS symlink resolution and idempotent operations
- PR workflow from worktrees: branch push and PR creation targeting base branch with executor worktree awareness
- Phase dependency analysis (`lib/deps.js`): Kahn's algorithm for parallel group computation, DFS cycle detection, `depends_on` field in ROADMAP.md
- Parallel execution engine (`lib/parallel.js`): teammate spawning for independent phases, shared task coordination, per-phase status tracking
- Sequential fallback for non-Claude Code backends with identical artifact output
- End-to-end integration test suite (`worktree-parallel-e2e.test.js`, 946 LOC) validating full pipeline
- 4 deferred validations resolved (DEFER-22-01, DEFER-27-01, DEFER-27-02, DEFER-30-01 partially)
- 7 new MCP tools for worktree and parallel execution commands

**Deferred:**
- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)
- DEFER-30-01: Full parallel execution with real teammate spawning (requires Claude Code runtime)

**Git range:** v0.1.6..v0.2.0

---


## v0.2.1 Hierarchical Planning Directory (Shipped: 2026-02-20)

**Phases completed:** 5 phases (32-36), 17 plans
**Timeline:** 2026-02-20 (single day)
**Source:** 1,631 tests (+54 from v0.2.0), 1 new module (lib/paths.js)

**Key accomplishments:**
- Centralized path resolver `lib/paths.js` with 9 functions and backward-compatible fallback
- All 18 lib/ modules migrated to use paths.js instead of hardcoded path constructions
- All 60 command/agent markdown files migrated to init-derived path variables
- `migrate-dirs` CLI command for upgrading old-style .planning/ layouts
- Simplified milestone archival with `archived.json` marker (no redundant phase copy)
- Test fixtures and golden outputs migrated to milestone-scoped hierarchy
- 3 deferred validations resolved (DEFER-34-01, DEFER-35-01, DEFER-35-02)

**Git range:** v0.2.0..v0.2.1

---


## v0.2.2 quickDir Routing Fix & Migration Skill (Shipped: 2026-02-20)

**Phases completed:** 1 phase (37), 1 plan
**Timeline:** 2026-02-20
**Source:** 1,634 tests (+3 from v0.2.1), 2 new files (commands/migrate.md, agents/grd-migrator.md)

**Key accomplishments:**
- Fixed `quickDir()` to accept optional milestone parameter and use `currentMilestone(cwd)` instead of hardcoded 'anonymous'
- Fixed `cmdMigrateDirs` to route `quick/` to current milestone instead of hardcoded anonymous
- Created `/grd:migrate` skill for user-facing migration (trivial via CLI, complex via agent)
- Created `grd-migrator` agent for handling flat milestone files, legacy phase dirs, and orphan docs

**Git range:** v0.2.1..v0.2.2

---


## v0.2.3 Improve Settings & Git Workflow (Shipped: 2026-02-21)

**Delivered:** Unified git workflow model with project-local worktrees, 4-option completion flow, revised settings interview, and milestone phase scanning bugfix.

**Phases completed:** 38-41 (7 plans total)
**Timeline:** 2026-02-20 to 2026-02-21 (2 days)
**Source:** 1,653 tests (+22 from v0.2.2), 39 files changed (+5,814 LOC)

**Key accomplishments:**
- Consolidated git config into nested `git` section with `enabled`, `worktree_dir`, `base_branch`, `branch_template`; backward-compatible loadConfig
- Project-local `.worktrees/` directory replacing `/tmp/grd-worktree-*`; auto-added to `.gitignore`
- 4-option worktree completion flow: merge locally, push and create PR, keep branch, discard work
- Test gate blocking merge/PR on test failure; finally-block cleanup on all paths
- Settings interview revision covering worktree isolation, execution, code review, and confirmation gates
- `cmdInitNewMilestone` bugfix: scans new-style `milestones/{version}/phases/` directories
- CLAUDE.md Git Isolation section documenting the full worktree model

**Git range:** v0.2.2..v0.2.3

**What's next:** v0.2.4 Layered Integration

---


## v0.2.4 Layered Integration (Shipped: 2026-02-21)

**Delivered:** Borrowed best features from competing frameworks (Spec Kit, Agent OS, BMAD, Claude Flow) as independent layers: constitution, standards discovery, scale-adaptive ceremony, and command consolidation.

**Phases completed:** 1 phase (42), 2 plans, 14 implementation tasks
**Timeline:** 2026-02-21 (single day)
**Source:** 1,679 tests (+26 from v0.2.3), 6 files deleted, 2 files created, 10+ files modified

**Key accomplishments:**
- Constitution layer: PRINCIPLES.md support in all init workflows + `/grd:principles` command
- Standards discovery: `standardsDir()` in path resolver, standards detection in init, `/grd:discover` command
- Scale-adaptive ceremony: `inferCeremonyLevel()` auto-inference (light/standard/full), ceremony config defaults, ceremony controls which agents run (not which model)
- Command consolidation: 8 commands merged into parent commands, 2 new commands added (net -6, 45→39)
- CLAUDE.md updated with all new features

**Commands removed (8):**
- dashboard → `progress dashboard`
- health → `progress health`
- phase-detail → `progress phase <N>`
- yolo → `settings yolo`
- set-profile → `settings profile`
- research-phase → `plan-phase --research-only`
- eval-plan → `plan-phase --eval-only`
- audit-milestone → `complete-milestone` (first step)

**Commands added (2):**
- `/grd:principles` — Create/edit project principles
- `/grd:discover [area]` — Discover codebase standards

**Git range:** v0.2.3..v0.2.4

**What's next:** TBD — run `/grd:new-milestone` to start

---


## v0.2.5 WebMCP Support & Bugfixes (Shipped: 2026-02-21)

**Phases completed:** 2 phases, 3 plans, 5 tasks

**Key accomplishments:**
- (none recorded)

---




## v0.2.6 Native Worktree Isolation (Shipped: 2026-02-22)

**Delivered:** Hybrid worktree isolation using Claude Code's native `isolation: worktree` while preserving custom worktree lifecycle for non-Claude-Code backends.

**Phases completed:** 3 phases (45-47), 9 plans, 47 new tests
**Timeline:** 2026-02-21 to 2026-02-22 (2 days)
**Source:** 1,779 tests (+85 from v0.2.5), 19 lib/ modules, 1 bug fix

**Key accomplishments:**
- Native worktree isolation capability detection: `native_worktree_isolation` flag in `BACKEND_CAPABILITIES`, `native_worktree_available` boolean in all init JSON outputs
- WorktreeCreate/WorktreeRemove hook registration with best-effort branch rename to GRD convention and lifecycle tracking
- Agent frontmatter audit: 20 agents with unique, descriptive names and descriptions for `claude agents` CLI display
- Hybrid execute-phase orchestrator: native `isolation: "worktree"` on Claude Code, manual worktree creation on other backends
- Executor dual-mode operation: `isolation_mode` context variable controls native vs manual behavior; `main_repo_path` for shared STATE.md writes
- Parallel execution adaptation: `buildParallelContext` skips worktree pre-computation when native isolation available
- 4-option completion flow adapted for native worktree branches (merge/PR/keep/discard)
- Bug fix: `detectBackend(cwd)` missing `cwd` argument in `cmdInitExecuteParallel` (lib/parallel.js)
- All 3 deferred validations (DEFER-46-01/02/03) resolved via live Claude Code native worktree test

**Key decisions:**
- 45-01: native_worktree_isolation is true only for claude backend; reports capability not policy
- 46-01: isolation_mode derived from branching_strategy + backend capabilities, not a separate config field
- 46-03: Native mode uses `<native_isolation>` block instead of `<worktree>` block in executor prompts
- 46-03: Manual mode preserved verbatim from v0.2.5 in both orchestrator and executor

**Deferred:**
- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)
- DEFER-30-01: Full parallel execution with real teammate spawning (partially resolved)
- DEFER-43/44: Live WebMCP workflow validation (requires Chrome DevTools MCP)

---


## v0.2.7 Self-Evolution (Shipped: 2026-02-22)

**Delivered:** GRD dogfoods itself — testbed infrastructure, bug fixes, complexity reduction, coverage improvements, autopilot command, and full integration testing.

**Phases completed:** 6 phases (48-53), 19 plans
**Timeline:** 2026-02-22 (single day)
**Source:** 1,983 tests (+204 from v0.2.6), 20 lib/ modules (+1 autopilot.js), 90%+ stmt coverage

**Key accomplishments:**
- Dogfooding infrastructure: testbed project (`testbed/`) as GRD workflow test subject with local CLI testing harness
- 5 bugs fixed via dogfooding: currentMilestone parsing, goal regex, state-snapshot field names, plan-index extraction, state patch underscore mapping
- Complexity reduction: decomposed cmdTracker (634 lines → 12 handlers), cmdDashboard (405 lines → 6 helpers), removed 6 dead exports, 2 dead functions
- Shared utilities: `safeReadJSON()`, `extractMarkdownSection()` in lib/utils.js, consolidated 10+ safe-read patterns
- Test coverage: all 20 lib/ modules at 85%+ line coverage, per-file thresholds enforced in jest.config.js
- 2 new features from dogfooding friction: `coverage-report` and `health-check` commands
- `/grd:autopilot` command: multi-phase autonomous execution with fresh Task agents per phase, disk-based handoff, graceful failure handling with resume
- New module: `lib/autopilot.js` with `cmdAutopilot` and `cmdInitAutopilot`, MCP tool registration
- Full integration testing: regression suite, E2E testbed workflow, autopilot E2E, all deferred validations resolved

**Key decisions:**
- 48-03: Testbed acts as test subject only — all fixes target GRD source, never the testbed
- 50-01: Handler-per-subcommand pattern for cmdTracker decomposition
- 52-01: Separate plan and execute agents (both token-heavy, cannot share context window)
- 52-01: Disk artifacts are the handoff mechanism — no context carries between agents

**Deferred:**
- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)
- DEFER-30-01: Full parallel execution with real teammate spawning (partially resolved)
- DEFER-43/44: Live WebMCP workflow validation (requires Chrome DevTools MCP)

---


## v0.2.8 Self-Evolving Loop - Phases 54-57 (Shipped: 2026-02-22)

**Phases completed:** 4 phases (54-57), 10 plans
**Timeline:** 2026-02-22 (single day)
**Source:** 22 lib/ modules, 2,184 tests

**Key accomplishments:**
- `/grd:evolve` autonomous self-improvement loop: discover -> select -> plan -> execute -> review -> persist state, all on sonnet-tier models
- Work item discovery engine analyzing codebase across 6 dimensions (productivity, quality, usability, consistency, stability, new features) using pure fs analysis
- Evolve state management with merge-dedup (existing-wins), scored priority selection, iteration handoff, and EVOLUTION.md notes
- Markdown splitting infrastructure: auto-split large markdown files into indexed partials with transparent reader reassembly
- 6 new evolve MCP tools + markdown-split tool (118 total)
- E2E integration validation: 310 items discovered on GRD codebase across 5 dimensions (dogfooding)

**Key decisions:**
- Phase 54: reassembleFromIndex joins with empty string for exact round-trip fidelity; safeReadMarkdown uses lazy require
- Phase 55: EVOLVE-STATE.json at project root for cross-milestone persistence; merge uses existing-wins strategy; discovery uses pure fs (no LLM)
- Phase 56: Orchestrator functions in lib/evolve.js (not new file); all spawnClaude calls use SONNET_MODEL constant
- Phase 57: 6 unique evolve MCP tools (grd_evolve_init is single enhanced entry, not two); grd_evolve_run validated via descriptor structure

**Deferred:**
- DEFER-54-01: Markdown splitting on real-world large files (no GRD files exceed 25K token threshold)
- DEFER-56-01: Full evolve loop with live sonnet-tier models producing meaningful improvements (partially resolved)

---

