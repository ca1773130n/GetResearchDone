# Project: GRD

**Created:** 2026-02-12
**Updated:** 2026-02-22

## Current Milestone: v0.2.7 Self-Evolution

**Goal:** GRD uses itself to improve itself — dogfooding the full R&D workflow to fix bugs, reduce complexity and tech debt, and invent new features.

**Approach:**
- Use GRD's own commands (tested via local `bin/grd-tools.js`, not the cached plugin) to drive development
- Testbed project (`testbed/` — copy of multi-bootstrap) exercises GRD workflows as a real user would
- Create long-term milestones, phases, requirements that mimic real agentic dev workflows
- Fix discovered bugs and glitches from dogfooding
- Reduce module complexity and eliminate tech debt
- Invent new features driven by real usage friction

**Target features:**
- Dogfooding infrastructure: testbed project with full GRD lifecycle
- Bug fixes discovered through self-use
- Complexity reduction across lib/ modules
- Tech debt cleanup (dead code, inconsistent patterns, missing edge cases)
- New features driven by dogfooding friction

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
- 112 MCP tools exposing full CLI surface via JSON-RPC 2.0
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
- 39 commands (consolidated from 45) across 19 modular lib/ modules

## Core Value

Transforms ad-hoc AI-assisted development into structured, repeatable, research-driven engineering with paper-backed decisions and quantitative evaluation.

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

## Validated Goals (v0.2.3)

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

## Validated Goals (v0.2.6)

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
- TypeScript migration (evaluated and deferred)
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
