# Project: GRD

**Created:** 2026-02-12
**Updated:** 2026-03-09

## Current Milestone: v0.3.6 Backend Ecosystem Sync

**Previous:** v0.3.5 Evolve Stabilization & Product Ideation (shipped 2026-03-09)

**Goal:** Update GRD's backend detection, model mappings, and capability flags to reflect the latest versions of Claude Code, Codex CLI, Gemini CLI, and OpenCode. Address deprecated models, new capabilities, and archived backends.

**Target features:**
- Update Gemini model mappings: replace deprecated `gemini-3-pro` with `gemini-3.1-pro`, add `gemini-3.1-flash-lite`
- Update Codex model mappings: add GPT-5.4 as opus tier
- Update Claude model references to Opus 4.6 / Sonnet 4.6 / Haiku 4.5
- Update Gemini capability flags: `subagents` from `'experimental'` to `true` (Generalist agent GA)
- Update Codex capability flags: verify `hooks`, `teams` status with new plugin system
- Address OpenCode backend: archived September 2025, decide on deprecation strategy
- Update backend detection env vars and filesystem clues if changed
- Update CLAUDE.md agent model profiles table with new model names

## Vision

GRD (Get Research Done) is a production-ready R&D workflow automation plugin for Claude Code that transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering.

## What This Is

A Claude Code plugin providing:
- Paper-driven R&D workflow automation (survey, deep-dive, feasibility, plan, execute, evaluate, iterate)
- Tiered verification (sanity/proxy/deferred) for research phases
- Autonomous mode for unattended operation
- Issue tracker integration (GitHub Issues, Jira via MCP Atlassian)
- TUI dashboard for project visibility (progress dashboard, progress health, progress phase N)
- Multi-backend support (Claude Code, Codex CLI, Gemini CLI, OpenCode) with dynamic model detection
- Long-term roadmap planning (flat LT-N milestones) with CRUD operations and protection rules
- Phase-boundary quality analysis (ESLint complexity, dead exports, file size)
- Requirement inspection and traceability (get, list, traceability, update-status)
- Planning artifact search across all .planning/ files
- 123 MCP tools exposing full CLI surface via JSON-RPC 2.0
- Execute-phase branching with configurable base branch and graceful edge-case handling
- Validation gate system with pre-flight checks preventing phase directory collisions across milestones
- Milestone-scoped directory hierarchy: all `.planning/` artifacts under `.planning/milestones/{milestone}/`
- Centralized path resolver (`lib/paths.js`) with backward-compatible fallback
- `migrate-dirs` command for upgrading old-style `.planning/` layouts to new hierarchy
- Simplified milestone archival with `archived.json` marker (no redundant phase directory copy)
- Git worktree isolation for phase execution with project-local `.worktrees/` directory
- Phase dependency analysis with parallel group detection (Kahn's algorithm)
- Parallel phase execution via teammate spawning (Claude Code) with sequential fallback (other backends)
- 4-option worktree completion flow (merge locally, push and create PR, keep branch, discard work) with test gate
- Scale-adaptive ceremony (light/standard/full) controlling which agents run per phase
- Constitution layer (PRINCIPLES.md) for project-level principles shaping agent behavior
- Standards discovery (/grd:discover) for extracting and enforcing codebase patterns
- WebMCP integration: optional Chrome DevTools MCP health checks in execute-phase, tool discovery in verify-phase, tool definition generation in eval-planner
- Native worktree isolation: hybrid strategy using Claude Code's `isolation: worktree` on Claude Code backend, retaining custom worktree lifecycle for other backends
- WorktreeCreate/WorktreeRemove hooks for GRD-specific worktree setup (branch naming, lifecycle tracking)
- Autopilot command (`/grd:autopilot`) for multi-phase autonomous execution with fresh agents per phase and disk-based handoff
- Dogfooding-driven features: `coverage-report` and `health-check` commands
- Self-evolving loop (`/grd:evolve`): autonomous self-improvement — discovers work items across 6 dimensions (productivity, quality, usability, consistency, stability, new features), selects priorities, plans, executes, reviews, and carries remaining items to the next iteration
- Evolve state persistence (`EVOLVE-STATE.json`): cross-milestone iteration tracking with merge-dedup, scored priority selection, and iteration history
- Evolution notes (`EVOLUTION.md`): iteration-over-iteration takeaways, decisions, and patterns discovered
- Sonnet-tier model ceiling: all evolve operations use sonnet/moderate model at most (no opus agents)
- Markdown splitting infrastructure (`lib/markdown-split.js`): auto-split large markdown files (>25K tokens) into indexed partials with transparent reader reassembly
- 40 commands across 25 modular lib/ modules (22 top-level .ts + 3 decomposed sub-module directories)
- Multi-milestone autopilot (`/grd:autopilot`) with autoplan command for autonomous milestone creation
- Infinite evolve mode: discover -> autoplan -> autopilot -> repeat cycle with safety caps
- Product ideation discovery engine: 8-dimension analysis (6 code-quality + product-ideation + improve-features)

## Core Value

Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.

## Previous State (v0.3.5)

**Shipped:** 2026-03-09

v0.3.0 completed the full TypeScript migration (Phases 58-68, 44 plans). v0.3.1-v0.3.5 were incremental bugfix and feature releases:
- v0.3.1: Node v22 compatibility — replaced `require() as {}` with destructuring annotations
- v0.3.2: Node v22 compat, autopilot nested session crash fix, phase sort order fix
- v0.3.3: Evolve outcome matching fix, autopilot env var stripping, dynamic dir scanning, dashboard ROADMAP fallback
- v0.3.4: Evolve auto-commit, PR creation, and iteration feedback
- v0.3.5: Evolve real code enforcement, product-ideation filtering, batch size cap, saturated dimension skipping, history dedup
- 73 evolve iterations, 857+ product ideation todos, all 5 code-quality dimensions saturated

## Previous State (v0.2.8)

**Shipped:** 2026-02-22

v0.2.8 closed the self-evolving loop — GRD can now autonomously discover, plan, execute, and review its own improvements:
- `/grd:evolve` command: full autonomous self-improvement loop (discover -> select -> plan -> execute -> review -> persist state)
- Work item discovery engine: analyzes codebase across 6 dimensions (productivity, quality, usability, consistency, stability, new features) using pure fs analysis (no LLM calls)
- Priority selection with scoring heuristic: quality=10, stability=9, consistency=7, productivity=6, usability=5, new-features=3
- Iteration handoff: EVOLVE-STATE.json persists remaining items, bugfix items, and iteration history across invocations
- Merge deduplication: existing-wins strategy when combining previous state with new discoveries
- Evolution notes: EVOLUTION.md tracks iteration-over-iteration takeaways, decisions, and patterns
- Sonnet-tier model ceiling: all evolve subagent spawns enforced to sonnet/moderate (REQ-59)
- Markdown splitting: `lib/markdown-split.js` with split/reassemble/index operations, MCP tool, CLI command
- New module: `lib/evolve.js` (discovery, state management, orchestration — 99.14% line coverage)
- New module: `lib/markdown-split.js` (split, reassemble, index — 97%+ coverage)
- 6 new evolve MCP tools + markdown-split MCP tool (118 total)
- E2E integration tests: 310 items discovered on GRD codebase across 5 dimensions (dogfooding validation)
- 2,184 tests passing (201 new), 22 lib/ modules

## Previous State (v0.2.7)

**Shipped:** 2026-02-22

v0.2.7 dogfooded GRD on itself — using the full R&D workflow to fix bugs, reduce complexity, and discover new features:
- Dogfooding infrastructure: testbed project as GRD workflow test subject with local CLI testing harness
- 5 bugs fixed via dogfooding: currentMilestone parsing, goal regex, state-snapshot fields, plan-index extraction, underscore mapping
- Complexity reduction: cmdTracker decomposed (634→12 handlers), cmdDashboard decomposed (405→6 helpers), 6 dead exports removed
- Shared utilities: `safeReadJSON()`, `extractMarkdownSection()`, consolidated 10+ safe-read patterns
- Test coverage: all 20 lib/ modules at 85%+ line coverage, per-file thresholds enforced
- 2 new features: `coverage-report` and `health-check` commands (driven by dogfooding friction)
- `/grd:autopilot` command: multi-phase autonomous execution with fresh Task agents, disk-based handoff, graceful failure with resume
- New module: `lib/autopilot.js` with `cmdAutopilot`, `cmdInitAutopilot`, MCP tool registration
- 1,983 tests passing (204 new), 20 lib/ modules

## Previous State (v0.2.6)

**Shipped:** 2026-02-22

v0.2.6 adopted Claude Code's native `isolation: worktree` via hybrid strategy:
- Native worktree isolation capability detection: `native_worktree_isolation` in BACKEND_CAPABILITIES, `native_worktree_available` in init JSON
- WorktreeCreate/WorktreeRemove hook registration with best-effort branch rename and lifecycle tracking
- Agent frontmatter audit: 20 agents with unique names/descriptions for `claude agents` CLI
- Hybrid execute-phase: native `isolation: "worktree"` on Claude Code, manual worktree on other backends
- Executor dual-mode: `isolation_mode` context controls native vs manual; `main_repo_path` for shared STATE.md writes
- Parallel execution: `buildParallelContext` skips worktree pre-computation when native isolation available
- 4-option completion flow adapted for native worktree branches
- Bug fix: `detectBackend(cwd)` missing `cwd` in `cmdInitExecuteParallel`
- All 3 deferred validations (DEFER-46-01/02/03) resolved via live native worktree test
- 1,779 tests passing (85 new), 19 lib/ modules

## Previous State (v0.2.5)

**Shipped:** 2026-02-21

v0.2.5 added graceful WebMCP integration across the execution, verification, and evaluation workflows:
- MCP availability detection: `detectWebMcp()` in lib/backend.js with config/env-var/MCP-server cascade, exposed via `webmcp_available` in all init JSON outputs
- Execute-phase WebMCP sanity checks: steps 4b/6b call `hive_get_health_status`, `hive_check_console_errors`, `hive_get_page_info` after each plan, with retry-once-then-halt logic
- Verifier WebMCP tool discovery: Step 5b uses `hive_list_registered_tools` to discover and invoke tools, results in VERIFICATION.md
- Eval planner WebMCP tool definitions: `design_webmcp_tools` step generates `useWebMcpTool()` definitions for frontend phases
- Code reviewer fix: `artifact_exclusions` step prevents false VERIFICATION.md blockers
- All WebMCP features guarded by `webmcp_available` conditional — graceful skip when MCP unavailable
- 1,694 tests passing (15 new), 19 lib/ modules

## Previous State (v0.2.4)

**Shipped:** 2026-02-21

v0.2.4 borrowed best features from competing frameworks (Spec Kit, Agent OS, BMAD, Claude Flow) and integrated them as independent layers:
- Constitution layer: PRINCIPLES.md for project-level principles that shape all agent behavior
- Standards discovery: `/grd:discover` for extracting codebase patterns, `.planning/standards/` with `index.yml` catalog
- Scale-adaptive ceremony: light/standard/full levels auto-inferred from phase signals, controlling which agents run
- Command consolidation: 45→39 commands (dashboard/health→progress, yolo/set-profile→settings, research-phase/eval-plan→plan-phase, audit→complete-milestone, phase-detail removed)
- `inferCeremonyLevel()` in lib/context.js with user override, per-phase override, and auto-inference
- `standardsDir()` in lib/paths.js for milestone-scoped standards paths
- 1,679 tests passing (48 new), 19 lib/ modules

## Previous State (v0.2.3)

**Shipped:** 2026-02-21

v0.2.3 unified the git workflow model and added a 4-option worktree completion flow:
- Consolidated git config into nested `git` section (`enabled`, `worktree_dir`, `base_branch`, `branch_template`); backward-compatible `loadConfig`
- Project-local `.worktrees/` directory (auto-added to `.gitignore`) replacing `/tmp/grd-worktree-*`
- `lib/worktree.js`: 5 new functions (`runTestGate`, `mergeWorktree`, `discardWorktree`, `keepWorktree`, `cleanupWorktree`) with finally-block cleanup
- `cmdWorktreeComplete` orchestrator: 4 completion paths (merge/PR/keep/discard) with test gate blocking merge/PR on failure
- Settings interview revision: worktree isolation, execution settings, code review, confirmation gates
- `cmdInitNewMilestone` bugfix: scans new-style `milestones/{version}/phases/` directories for `suggested_start_phase`
- `execute-phase.md` updated with `completion_flow` step and `branching_strategy != none` conditions
- CLAUDE.md Git Isolation section documenting the worktree model
- 1,653 tests passing (22 new), 19 lib/ modules

## Previous State (v0.2.1)

**Shipped:** 2026-02-20

v0.2.1 migrated all `.planning/` subdirectory paths to a strict milestone-scoped hierarchy:
- `lib/paths.js`: centralized path resolver with 9 functions (`phasesDir`, `phaseDir`, `researchDir`, `codebaseDir`, `todosDir`, `quickDir`, `milestonesDir`, `currentMilestone`, `archivedPhasesDir`) and filesystem-aware backward-compatible fallback
- All 18 lib/ modules, 44 command files, and 16 agent files migrated to use `paths.js` instead of hardcoded strings
- All `cmdInit*` functions output milestone-scoped paths (`phases_dir`, `research_dir`, `codebase_dir`, `quick_dir`, `todos_dir`) in JSON
- `migrate-dirs` CLI command for upgrading existing old-style `.planning/` layouts (idempotent, merge-without-overwrite)
- Simplified `cmdMilestoneComplete`: phases already in place under `milestones/{version}/phases/`, writes `archived.json` marker, no redundant copy
- Test fixture directory migrated to `milestones/anonymous/` hierarchy, all golden outputs regenerated
- 3 deferred validations resolved (DEFER-34-01, DEFER-35-01, DEFER-35-02)
- 1,631 tests passing (54 new), 19 lib/ modules

## Previous State (v0.2.0)

**Shipped:** 2026-02-19

v0.2.0 added worktree-isolated phase execution with parallel teammate spawning:
- `lib/worktree.js`: git worktree lifecycle management (create, remove, list, stale cleanup) with macOS symlink resolution
- `lib/deps.js`: phase dependency analysis with Kahn's algorithm, parallel group computation, cycle detection
- `lib/parallel.js`: parallel execution engine with teammate spawning, shared task coordination, per-phase status tracking
- PR workflow from worktrees: branch push and PR creation targeting base branch
- Sequential fallback for non-Claude Code backends with identical artifact output
- 7 new MCP tools (112 total), 946 LOC integration test suite
- 1,577 tests passing

## Previous State (v0.1.6)

**Shipped:** 2026-02-19

v0.1.6 added milestone-scoped phase directory archival and a validation gate system:
- New `lib/gates.js` module with 6 gate checks and declarative registry mapping 10 commands
- Phase directory archival in `cmdMilestoneComplete` (copies to `.planning/milestones/{version}-phases/`)
- Gate integration in init functions and phase operations with JSON failure output
- `autonomous_mode` config, `consistency_warning` in `findPhaseInternal`, `suggested_start_phase` in milestone init
- 1,433 tests passing

## Previous State (v0.1.5)

**Shipped:** 2026-02-17

v0.1.5 replaced the rigid Now/Next/Later tier system with flat, ordered LT-N milestones:
- Complete rewrite of lib/long-term-roadmap.js with 18 new functions
- 12 new subcommands replacing 4 old ones (mode, generate, promote, tier)
- 12 new MCP tools (105 total), protection rules for shipped milestones
- LT roadmap integration in agents (roadmapper, product-owner) and commands (new-milestone, complete-milestone, new-project)
- Comprehensive tutorial, updated all docs
- 1,399 tests passing

## Previous State (v0.1.3)

**Shipped:** 2026-02-17

v0.1.3 completed MCP coverage and fixed a branching workflow gap:
- MCP wiring: 5 new tools (requirement get/list/traceability/update-status, search) — 102 total (now 105 after v0.1.5)
- Execute-phase branching fix: `base_branch` config with checkout-and-pull before branch creation
- 1,360 tests passing

## Previous State (v0.1.2)

**Shipped:** 2026-02-16

v0.1.2 added developer experience improvements and requirement traceability:
- Requirement commands: Look up requirements by ID, list/filter by phase/priority/status/category, traceability matrix queries
- Phase-detail enhancement: Show requirement summaries (JSON + TUI) for any phase
- Convenience commands: Planning artifact search, requirement status update
- 1,343 tests passing

## Previous State (v0.1.1)

**Shipped:** 2026-02-16

v0.1.1 completed deferred work, added MCP server mode, and prepared for npm distribution:
- MCP server exposing 97 CLI commands as MCP tools
- Doc drift detection with 4 expanded quality analyzers
- All deferred validations resolved
- npm package configuration with CI pack/install validation
- 1,305 tests passing

## Previous State (v0.1.0)

**Shipped:** 2026-02-16

v0.1.0 adds setup functionality and usability on top of v0.0.5's engineering foundation:
- 13 lib/ modules (~10,050 LOC) with 120+ exports, thin CLI router
- 858 Jest tests, 80%+ line coverage across all modules
- Multi-backend support: Claude Code, Codex CLI, Gemini CLI, OpenCode with dynamic model detection
- Long-term roadmap planning with flat LT-N milestones, CRUD operations, and protection rules
- Phase-boundary quality analysis (ESLint complexity, dead exports, file size)
- ESLint v10 + Prettier, zero errors
- GitHub Actions CI (Node 18/20/22), release workflow
- Security hardened: zero execSync shell interpolation, input validation, git whitelist

<details>
<summary>Validated Goals (v0.2.3)</summary>

- [x] Config `git` section with `enabled`, `worktree_dir`, `base_branch`, `branch_template`; legacy top-level keys read for backward compat
- [x] Worktrees created under `.worktrees/` (project-local); `.worktrees/` auto-added to `.gitignore`
- [x] `cmdInitExecutePhase` outputs `worktree_dir`, `branch_template`, `target_branch` fields
- [x] `runTestGate` runs test suite and blocks merge/PR on failure
- [x] `mergeWorktree` merges branch to base with worktree cleanup
- [x] `discardWorktree` deletes branch and worktree
- [x] `keepWorktree` preserves worktree and branch intact
- [x] `cleanupWorktree` finally-block cleanup (idempotent)
- [x] `cmdWorktreeComplete` orchestrates 4 completion paths with structured JSON output
- [x] Settings interview covers worktree isolation, execution, code review, and confirmation gates
- [x] `cmdInitNewMilestone` scans new-style `milestones/{version}/phases/` directories
- [x] `execute-phase.md` uses `completion_flow` step with `worktree complete --action`
- [x] CLAUDE.md documents Git Isolation model with 4 completion options
- [x] 1,653 tests passing across 32 suites (22 new tests, zero regressions)

</details>

<details>
<summary>Validated Goals (v0.2.1)</summary>


- [x] `lib/paths.js` with 9 path resolver functions, `currentMilestone(cwd)` reading STATE.md, `archivedPhasesDir` for legacy data
- [x] All path functions accept explicit `cwd` and `milestone` params; defaults to `currentMilestone(cwd)`
- [x] `quickDir` always routes to `milestones/anonymous/quick/` regardless of active milestone
- [x] Filesystem-aware fallback: checks `milestoneExistsOnDisk` before returning new-style paths
- [x] Zero hardcoded `.planning/phases/` path constructions in any lib/ module (all use `paths.js`)
- [x] All 14 `cmdInit*` functions output `phases_dir`, `research_dir`, `codebase_dir`, `quick_dir`, `todos_dir` fields
- [x] All 44 command markdown files consume paths from init context (no hardcoded directory strings)
- [x] All 16 agent markdown files consume paths from context-injected variables
- [x] `grd-tools migrate-dirs` moves 5 directory types to milestone-scoped locations with idempotency
- [x] `cmdMilestoneComplete` writes `archived.json` marker; no redundant phase directory copy when phases already in place
- [x] `bin/postinstall.js` creates new hierarchy structure (`milestones/anonymous/quick/`, `milestones/anonymous/research/`, `milestones/anonymous/todos/`)
- [x] Test fixtures migrated to `milestones/anonymous/phases/` hierarchy
- [x] All golden outputs regenerated via capture.sh with milestone-scoped paths
- [x] CLAUDE.md Planning Directory section reflects milestone-scoped hierarchy
- [x] DEFER-34-01 resolved: init commands produce milestone-scoped paths end-to-end
- [x] DEFER-35-01 resolved: migrate-dirs works on real old-style layout with idempotency
- [x] DEFER-35-02 resolved: milestone completion writes archived.json, no redundant copy
- [x] 1,631 tests passing across 32 suites (54 new tests, zero regressions)

</details>

<details>
<summary>Validated Goals (v0.2.0)</summary>

- [x] `lib/worktree.js` with create, remove, list, stale cleanup and `fs.realpathSync(os.tmpdir())` for macOS symlink resolution
- [x] `cmdInitExecutePhase` outputs `worktree_path` and `worktree_branch` fields when branching enabled
- [x] `grd-tools worktree create/remove/list` CLI commands with structured JSON output
- [x] Stale worktree detection and cleanup via `worktree remove --stale`
- [x] `cmdWorktreePushAndPR`: branch push and PR creation with `gh` CLI, executor worktree awareness in command template
- [x] `depends_on` field parsed from ROADMAP.md phase definitions
- [x] `grd-tools phase analyze-deps` returns dependency graph with `parallel_groups` array (Kahn's algorithm)
- [x] Circular dependency detection with cycle path reporting (DFS)
- [x] `lib/parallel.js` with `cmdInitExecuteParallel`, independence validation, shared task coordination
- [x] Sequential fallback for non-Claude Code backends with `fallback_note`
- [x] 7 new MCP tools for worktree and parallel execution (112 total)
- [x] 946-line E2E integration test suite validating full worktree-parallel pipeline
- [x] 144 new tests (1,577 total) across 30 suites
- [x] 4 deferred validations resolved (DEFER-22-01, DEFER-27-01, DEFER-27-02, DEFER-30-01 partially)

</details>

<details>
<summary>Validated Goals (v0.1.6)</summary>

- [x] `lib/gates.js` with 6 gate checks: orphaned-phases, phase-in-roadmap, phase-has-plans, no-stale-artifacts, old-phases-archived, milestone-state-coherence
- [x] `GATE_REGISTRY` maps 10 commands to gate arrays
- [x] `runPreflightGates` with YOLO bypass (`autonomous_mode: true` → `passed: true, bypassed: true`)
- [x] New-project safety: all gates pass when no ROADMAP.md exists
- [x] Phase directory archival in `cmdMilestoneComplete` to `.planning/milestones/{version}-phases/`
- [x] Gate integration in `cmdInitExecutePhase`, `cmdInitPlanPhase`, `cmdInitNewMilestone`, `cmdPhaseAdd`, `cmdPhaseInsert`, `cmdPhaseComplete`, `cmdMilestoneComplete`
- [x] `suggested_start_phase` computed from archived + current phases in `cmdInitNewMilestone`
- [x] `consistency_warning` in `findPhaseInternal` for stale phase detection
- [x] `cmdValidateConsistency` refactored to reuse `checkOrphanedPhases` (promoted from warnings to errors)
- [x] 34 new tests (1,433 total) across 27 suites

</details>

<details>
<summary>Validated Goals (v0.1.5)</summary>

- [x] `lib/long-term-roadmap.js` complete rewrite with 18 functions for flat LT-N format
- [x] 12 subcommands: list, add, remove, update, refine, link, unlink, display, init, history, parse, validate
- [x] Protection rules: can't remove LT milestones with shipped normal milestones; can't unlink shipped versions
- [x] `init` subcommand auto-groups existing ROADMAP.md milestones into LT-1
- [x] 12 MCP tools replacing 9 old tier-based tools (105 total)
- [x] `docs/long-term-roadmap-tutorial.md` comprehensive step-by-step tutorial
- [x] LT roadmap integration in agents (grd-roadmapper, grd-product-owner) and commands (new-milestone, complete-milestone, new-project)
- [x] 1,399 tests passing across 26 suites

</details>

<details>
<summary>Validated Goals (v0.1.3)</summary>

- [x] 5 new MCP tools wired via COMMAND_DESCRIPTORS with correct parameter schemas (102 total tools; now 105 after v0.1.5)
- [x] MCP tools/list includes all new tools; tools/call executes each with structured JSON responses
- [x] MCP server tests cover new tool definitions with 92% line coverage
- [x] docs/mcp-server.md updated with Requirement & Search section
- [x] `cmdInitExecutePhase` includes `base_branch` field (default "main") when branching enabled
- [x] execute-phase template has checkout-and-pull logic with 4 graceful edge case handlers
- [x] 3 new tests verify base_branch behavior; 1,360 total tests passing

</details>

<details>
<summary>Validated Goals (v0.1.2)</summary>

- [x] `grd-tools requirement get REQ-31` returns structured JSON with all fields; falls back to archived milestones
- [x] `grd-tools requirement list` with composable --phase, --priority, --status, --category, --all filters
- [x] `grd-tools requirement traceability` returns full matrix as JSON with --phase filter
- [x] `cmdPhaseDetail` includes requirements summary block for any phase
- [x] `grd-tools search <query>` searches all .planning/ markdown files recursively
- [x] `grd-tools requirement update-status` edits traceability matrix with validation
- [x] 38 new tests across 4 plans, 1,343 total passing

</details>

<details>
<summary>Validated Goals (v0.1.1)</summary>

- [x] Doc drift detection: CHANGELOG staleness, broken README links, JSDoc mismatches
- [x] 4 expanded quality analyzers: test coverage gaps, export consistency, doc staleness, config schema drift
- [x] All 4 deferred validations resolved (DEFER-09/10/11/13)
- [x] MCP server with 97 tools via JSON-RPC 2.0 over stdio
- [x] npm package with postinstall scaffold and setup command
- [x] E2E workflow integration test validating full phase lifecycle

</details>

<details>
<summary>Validated Goals (v0.1.0)</summary>

- [x] `detectBackend()` returns correct backend for all 4 backends via env var detection
- [x] `resolveModelInternal()` maps opus/sonnet/haiku to correct backend-specific model names
- [x] Config override takes precedence over environment detection
- [x] Dynamic model detection via OpenCode CLI probing with 5-min TTL cache
- [x] `detect-backend` CLI command with JSON/raw output and `models_source` field
- [x] All 14 `cmdInit*` functions include backend and model info
- [x] LONG-TERM-ROADMAP.md schema with flat LT-N milestones (redesigned in v0.1.5 from Now/Next/Later tiers)
- [x] `long-term-roadmap` CLI with 12 subcommands (list, add, remove, update, refine, link, unlink, display, init, history, parse, validate) — redesigned in v0.1.5
- [x] LT milestone CRUD with protection rules (can't remove shipped, can't unlink shipped)
- [x] `phase_cleanup` config with quality analysis at phase boundaries
- [x] `quality-analysis` CLI command with structured reports
- [x] 858 tests passing, 80%+ coverage on all new modules

</details>

<details>
<summary>Validated Goals (v0.0.5)</summary>

- [x] Test coverage >= 80% on lib/ modules
- [x] CI checks pass (lint, test, security audit) on every PR
- [x] Zero known command injection vulnerabilities
- [x] Modular architecture (no file > 1,600 lines; router = 188 lines)
- [x] .gitignore in place; no sensitive files in git history
- [x] Consistent code style (ESLint + Prettier)
- [x] Version sync across VERSION, plugin.json, CHANGELOG.md
- [x] Input validation on all CLI arguments
- [x] Developer documentation (CONTRIBUTING.md, JSDoc, SECURITY.md)

</details>

## Validated Goals (v0.2.8)

- [x] `/grd:evolve` registered as GRD slash command orchestrating discover -> select -> plan -> execute -> review -> persist state
- [x] `lib/evolve.js` with discovery engine (`analyzeCodebaseForItems`, `runDiscovery`), state management (`createInitialState`, `writeEvolveState`, `readEvolveState`), and orchestrator (`runEvolve`)
- [x] Work item discovery across 6 dimensions (productivity, quality, usability, consistency, stability, new features) using pure filesystem analysis
- [x] `mergeWorkItems` with existing-wins dedup strategy; `selectPriorityItems` with dimension-weighted scoring
- [x] `advanceIteration` carries remaining pending items and bugfix items to next iteration; records history entry
- [x] `writeEvolutionNotes` appends EVOLUTION.md with iteration number, items attempted, outcomes, decisions, patterns, takeaways
- [x] Sonnet-tier model ceiling: all `spawnClaude` calls use SONNET_MODEL constant — no opus agents in evolve flow (REQ-59)
- [x] `lib/markdown-split.js` with `splitMarkdown`, `reassembleFromIndex`, `isIndexFile` operations and round-trip fidelity
- [x] `safeReadMarkdown` in utils.js transparently handles split-format files via lazy require
- [x] 6 evolve MCP tools (discover, state, advance, reset, init, run) + markdown-split tool registered in mcp-server.js
- [x] `commands/evolve.md` with valid frontmatter and slash command registration
- [x] EVOLVE-STATE.json at project root for cross-milestone persistence
- [x] E2E integration tests: discovery quality, full iteration mechanics, iteration handoff, GRD codebase discovery (310 items, 5 dimensions)
- [x] All per-file coverage thresholds met: evolve.js 99.14% lines, markdown-split.js 97%+ lines
- [x] 2,184 tests passing across 37 suites (201 new, zero regressions)
- [x] DEFER-55-01 resolved: 310 actionable items across 5 dimensions on real GRD codebase
- [x] DEFER-56-01 partially resolved: orchestration mechanics validated via dry-run (live model execution out of automated test scope)

<details>
<summary>Validated Goals (v0.2.7)</summary>

- [x] Testbed project (`testbed/`) initialized as GRD project with full `.planning/` structure
- [x] Local CLI testing harness validates changes against testbed before committing
- [x] 5 bugs fixed with reproduction tests: BUG-48-001 through BUG-48-005
- [x] `currentMilestone(cwd)` correctly parses "v0.2.7 Self-Evolution" format
- [x] Complexity audit report with before/after measurements for top 3 modules
- [x] 6 dead exports removed, cmdTracker decomposed (12 handlers), cmdDashboard decomposed (6 helpers)
- [x] `safeReadJSON()` and `extractMarkdownSection()` shared utilities, 10+ safe-read patterns consolidated
- [x] All 20 lib/ modules at 85%+ line coverage with per-file thresholds in jest.config.js
- [x] 2 new features: `coverage-report` and `health-check` commands (dogfooding-driven)
- [x] `lib/autopilot.js` with `cmdAutopilot` and `cmdInitAutopilot`, MCP tool registration
- [x] `/grd:autopilot [start]-[end]` orchestrates plan+execute agents per phase with disk-based handoff
- [x] Full regression suite: 1,983 tests passing across 34 suites (204 new, zero regressions)
- [x] DEFER-48-01 resolved: full testbed lifecycle validation with 10 CLI commands

</details>

<details>
<summary>Validated Goals (v0.2.6)</summary>

- [x] `native_worktree_isolation` flag in BACKEND_CAPABILITIES for Claude Code backend; `native_worktree_available` in all init JSON outputs
- [x] WorktreeCreate/WorktreeRemove hooks registered in plugin.json with branch rename and lifecycle tracking
- [x] 20 agent definitions audited with unique, descriptive names and descriptions for `claude agents` CLI
- [x] Hybrid execute-phase: native `isolation: "worktree"` on Claude Code, manual worktree on other backends
- [x] Executor dual-mode: `isolation_mode` context variable (native/manual/none), `main_repo_path` for shared STATE.md writes
- [x] `buildParallelContext` skips worktree pre-computation when native isolation available; backward-compatible options pattern
- [x] 4-option completion flow adapted for native worktree branches (merge/PR/keep/discard)
- [x] Bug fix: `detectBackend(cwd)` in cmdInitExecuteParallel (lib/parallel.js)
- [x] All 3 deferred validations (DEFER-46-01/02/03) resolved via live Claude Code native worktree test
- [x] 1,779 tests passing across 33 suites (85 new tests, zero regressions)

</details>

<details>
<summary>Validated Goals (v0.2.5)</summary>

- [x] `detectWebMcp()` in lib/backend.js with config/env-var/MCP-server detection cascade
- [x] `webmcp_available` and `webmcp_skip_reason` in all init JSON outputs (execute-phase, plan-phase, verify-work)
- [x] Execute-phase steps 4b (standard) and 6b (teams) with three health checks and retry-once-then-halt logic
- [x] All WebMCP checks guarded by `webmcp_available` — graceful skip when MCP unavailable
- [x] grd-verifier Step 5b with `hive_list_registered_tools` discovery, generic checks, page-specific tool matching
- [x] VERIFICATION.md output includes WebMCP Verification section with tool discovery and health check result tables
- [x] grd-eval-planner `design_webmcp_tools` step with frontend detection heuristic
- [x] EVAL.md output includes WebMCP Tool Definitions section with `useWebMcpTool()` call syntax
- [x] grd-code-reviewer `artifact_exclusions` step excludes VERIFICATION.md from must_haves checks
- [x] 1,694 tests passing across 32 suites (15 new tests, zero regressions)

</details>

## Open Items

- DEFER-08-01: User acceptance testing of TUI dashboard commands (post-v1.0)
- DEFER-30-01: Full parallel execution with real teammate spawning on Claude Code (partially resolved)
- DEFER-43-01/02: Live MCP detection and code reviewer validation (requires Chrome DevTools MCP)
- DEFER-44-01/02/03: Live WebMCP workflow validation (requires Chrome DevTools MCP + frontend phase)
- DEFER-54-01: Markdown splitting on real-world large files (cannot validate — no GRD files exceed 25K token threshold)
- DEFER-56-01: Full evolve loop with live sonnet-tier models (partially resolved — 73 iterations run successfully)
- DEFER-68-01/02: Real Claude subprocess for product ideation + autoplan end-to-end (pending)
- Async I/O optimization (evaluated and deferred)
- Plugin marketplace publishing

## Constraints

- **Zero external runtime deps:** Only Node.js built-in modules. Dev-dependencies (jest, eslint) acceptable.
- **Backward compatibility:** All existing commands must continue to work. No breaking changes to `.planning/` file formats.
- **Plugin compatibility:** Must remain compatible with Claude Code plugin SDK.
- **Multi-backend:** Must work across Claude Code, Codex, Gemini CLI, OpenCode without requiring backend-specific code in the plugin's core logic.

## Stakeholders

- **Primary users:** Developers using Claude Code for R&D projects
- **Contributors:** Developers extending GRD with new commands/agents
- **Maintainers:** Core team maintaining grd-tools.js and plugin infrastructure

---

*Project definition: 2026-02-12*
*v0.0.5 milestone shipped: 2026-02-15*
*v0.1.0 milestone shipped: 2026-02-16*
*v0.1.1 milestone shipped: 2026-02-16*
*v0.1.2 milestone shipped: 2026-02-16*
*v0.1.3 milestone shipped: 2026-02-17*
*v0.1.4 milestone shipped: 2026-02-17*
*v0.1.5 milestone shipped: 2026-02-17*
*v0.1.6 milestone shipped: 2026-02-19*
*v0.2.0 milestone shipped: 2026-02-19*
*v0.2.1 milestone shipped: 2026-02-20*
*v0.2.2 milestone shipped: 2026-02-20*
*v0.2.3 milestone shipped: 2026-02-21*
*v0.2.4 milestone shipped: 2026-02-21*
*v0.2.5 milestone shipped: 2026-02-21*
*v0.2.6 milestone shipped: 2026-02-22*
*v0.2.7 milestone shipped: 2026-02-22*
*v0.2.8 milestone shipped: 2026-02-22*
*v0.3.0 milestone shipped: 2026-03-02*
*v0.3.1 shipped: 2026-03-03*
*v0.3.2 shipped: 2026-03-03*
*v0.3.3 shipped: 2026-03-03*
*v0.3.4 shipped: 2026-03-03*
*v0.3.5 shipped: 2026-03-09*
