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
- v0.2.8 Self-Evolving Loop - Phases 54-57

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

### Phase 54: Markdown Splitting Infrastructure

**Goal:** Large markdown files are automatically split into indexed partials and all GRD readers transparently handle both single-file and split formats.

**Dependencies:** None (foundation for evolve workflow)

**Requirements:** REQ-60, REQ-61

**Verification Level:** proxy

**Plans:** 2 plans

Plans:
- [ ] 54-01-PLAN.md -- TDD: Core markdown splitting module (lib/markdown-split.js)
- [ ] 54-02-PLAN.md -- Reader integration, CLI command, MCP tool

**Success Criteria:**
1. Markdown files exceeding the token threshold (~25,000 tokens) are detected and split into numbered partials (e.g., `STATE-part1.md`, `STATE-part2.md`) with deterministic boundary selection at heading breaks
2. The original file is rewritten as an index containing links to each partial, preserving the original filename as the entry point
3. `state.js`, `roadmap.js`, and `utils.js` reader functions transparently reassemble content from partials when an index file is encountered -- callers see no difference from a single-file read
4. Round-trip integrity: splitting a file and then reading it back produces identical logical content to the original unsplit file
5. Files below the threshold are left untouched; the split operation is idempotent (re-running on already-split files produces no changes)

---

### Phase 55: Evolve Core Engine

**Goal:** Work item discovery, priority selection, and iteration state management form a reliable engine that can identify improvements and carry state across iterations.

**Dependencies:** Phase 54 (evolution docs may grow large)

**Requirements:** REQ-55, REQ-56, REQ-57

**Verification Level:** proxy

**Success Criteria:**
1. Work item discovery analyzes the codebase and produces a categorized list of improvement items across six dimensions: productivity, quality, usability, consistency, stability, and new features
2. Discovery loads work items from a previous evolve iteration's state file (if present) and merges them with freshly discovered items, deduplicating by identity
3. Priority selection picks N items (configurable, default 5) from the merged list using a scoring heuristic, and generates sequential phase plans for each selected item
4. Iteration state is persisted to a structured JSON/markdown file on disk containing: selected items, remaining items, newly-discovered bugfix items, and iteration metadata (timestamp, iteration number, items completed/remaining)
5. The state file format supports handoff -- the next evolve iteration reads the previous state, inherits remaining items, and increments the iteration counter

**Plans:** 3 plans

Plans:
- [ ] 55-01-PLAN.md -- Evolve state layer TDD (state format, I/O, merge, iteration tracking)
- [ ] 55-02-PLAN.md -- Discovery engine + priority selection (codebase analysis, scoring, selection)
- [ ] 55-03-PLAN.md -- CLI wiring + MCP registration + init context (bin/grd-tools.js, mcp-server.js, context.js)

---

### Phase 56: Evolve Orchestrator

**Goal:** The `/grd:evolve` command ties together discovery, planning, execution, review, and evolution notes into a single autonomous self-improvement loop that runs entirely on sonnet-tier models.

**Dependencies:** Phase 55

**Requirements:** REQ-54, REQ-58, REQ-59

**Verification Level:** proxy

**Plans:** 2 plans

Plans:
- [ ] 56-01-PLAN.md -- Orchestrator engine + skill definition (lib/evolve.js orchestrator functions + commands/evolve.md)
- [ ] 56-02-PLAN.md -- CLI wiring + MCP registration + TDD tests (bin/grd-tools.js + lib/mcp-server.js + tests + coverage)

**Success Criteria:**
1. `/grd:evolve` is a registered GRD slash command (skill) that orchestrates: discover -> select -> plan -> execute -> review -> persist state, in a single invocation
2. All subagent spawns within the evolve flow enforce sonnet-tier model ceiling -- no opus-class models are used for any step (discovery, planning, execution, review)
3. Evolution notes (EVOLUTION.md or equivalent) are written/appended after each iteration with: iteration number, items attempted, outcomes (pass/fail per item), decisions made, patterns discovered, and takeaways
4. The command accepts parameters for iteration count and items-per-iteration, with sensible defaults (1 iteration, 5 items)
5. After execution completes, remaining and newly-discovered bugfix items are written to the iteration state file for the next invocation

---

### Phase 57: Integration & Validation

**Goal:** End-to-end evolve loop runs successfully on a real codebase, all components work together, and the test suite covers the new modules without regressions.

**Dependencies:** Phase 54, Phase 55, Phase 56

**Requirements:** (integration -- validates all prior phases)

**Verification Level:** deferred

**Success Criteria:**
1. A full evolve iteration (discover -> select -> plan -> execute -> review -> persist) completes without errors on the GRD codebase itself (dogfooding)
2. Markdown splitting correctly handles files generated or grown during evolve iterations
3. Iteration handoff works: running `/grd:evolve` twice produces a second iteration that inherits remaining items from the first
4. All new lib/ modules maintain 85%+ line coverage with per-file thresholds enforced in jest.config.js
5. Full regression suite passes: all existing tests (1,983+) continue to pass with zero regressions
6. MCP tool registration for new commands (evolve, markdown-split) is functional and returns structured JSON

**Deferred Validations Collected:**
- DEFER-54-01: Markdown splitting produces correct partials for real-world large files (STATE.md, ROADMAP.md at scale)
- DEFER-55-01: Work item discovery quality assessment on a non-trivial codebase (are discovered items actionable?)
- DEFER-56-01: Full evolve loop with sonnet-tier models produces meaningful improvements (not just cosmetic changes)

**Plans:** 3 plans

Plans:
- [ ] 57-01-PLAN.md -- Coverage threshold enforcement and regression validation for evolve.js after Phase 56 expansion
- [ ] 57-02-PLAN.md -- MCP tool registration validation for all evolve commands (Phases 55-56)
- [ ] 57-03-PLAN.md -- End-to-end integration tests for evolve loop, iteration handoff, and deferred validation collection

---

## Progress

| Phase | Status | Plans |
|-------|--------|-------|
| 54 - Markdown Splitting Infrastructure | PENDING | 0 |
| 55 - Evolve Core Engine | PENDING | 0 |
| 56 - Evolve Orchestrator | PLANNED | 2 |
| 57 - Integration & Validation | PENDING | 0 |
