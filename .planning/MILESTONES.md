# Milestones

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

**Phases completed:** 5 phases, 17 plans, 12 tasks

**Key accomplishments:**
- Simplified milestone archive to skip redundant copy when phases already in place, with archived.json marker

---

