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
- v0.3.0 TypeScript Migration & Refactoring - Phases 58-65

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

### v0.3.0 TypeScript Migration & Refactoring (In Progress)

**Milestone Goal:** Migrate entire codebase from CommonJS JavaScript to TypeScript with strict type checking, decompose three oversized modules, and migrate all tests -- while preserving 100% backward compatibility.
**Start:** 2026-03-01

### Phase 58: TypeScript Toolchain & Build Pipeline

**Goal:** TypeScript compiles, lints, and tests run against .ts files with strict mode enabled
**Type:** implement
**Depends on:** Nothing (first phase of v0.3.0)
**Duration:** 2d
**Requirements:** REQ-62, REQ-63
**Verification Level:** sanity
**Success Criteria** (what must be TRUE):
  1. `tsc --noEmit` runs successfully on a sample .ts file in lib/ with `strict: true`
  2. `ts-jest` compiles and runs a sample .ts test file, reporting coverage against the .ts source
  3. ESLint with `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` reports zero errors on the sample .ts file
  4. `tsc` produces CommonJS .js output in `dist/` with source maps
  5. Existing JS tests continue to pass unmodified (zero regressions)
**Plans:** 3 plans (3 complete)
**Status:** Complete (2026-03-02)

Plans:
- [x] 58-01: TypeScript compilation infrastructure (tsconfig, build scripts, sample module)
- [x] 58-02: ESLint TypeScript support (@typescript-eslint parser/plugin)
- [x] 58-03: ts-jest configuration for TypeScript test files

### Phase 59: Foundation Layer & Shared Types

**Goal:** The three zero-dependency foundation modules and core shared types are fully typed and all downstream modules can import from them
**Type:** implement
**Depends on:** Phase 58
**Duration:** 3d
**Requirements:** REQ-65, REQ-79
**Verification Level:** proxy
**Success Criteria** (what must be TRUE):
  1. `lib/paths.ts`, `lib/backend.ts`, `lib/utils.ts` compile under `strict: true` with zero `any` types
  2. Shared type definitions exist for Config, PhaseInfo, MilestoneInfo, BackendCapabilities, ModelProfile, StateFields, RoadmapPhase, FrontmatterObject, and MCP tool descriptors (consolidated in `lib/types.ts` or `types/` directory)
  3. All existing JS modules that import from paths/backend/utils continue to work via the compiled output (CommonJS interop validated)
  4. All exported functions in the three foundation modules have explicit return type annotations
  5. Unit tests for paths, backend, and utils pass with identical coverage thresholds against the .ts sources
**Plans:** 3/3 plans complete

Plans:
- [ ] 59-01-PLAN.md -- Core shared types (lib/types.ts) + paths.ts migration
- [ ] 59-02-PLAN.md -- backend.ts migration with typed constants
- [ ] 59-03-PLAN.md -- utils.ts migration (largest foundation module)

### Phase 60: Data & Domain Layer Migration

**Goal:** All data-parsing and domain-logic modules are migrated to TypeScript with typed interfaces for every command function
**Type:** implement
**Depends on:** Phase 59
**Duration:** 4d
**Requirements:** REQ-66, REQ-67
**Verification Level:** proxy
**Success Criteria** (what must be TRUE):
  1. 11 modules migrated to .ts: state, roadmap, frontmatter, markdown-split, phase, deps, gates, verify, scaffold, cleanup, requirements
  2. All 11 modules compile under `strict: true` with no `any` types in exported functions
  3. All command functions (`cmd*`) have explicit parameter types and return types
  4. STATE.md field types, ROADMAP.md phase structure types, and frontmatter object types are defined and used (not just `string`)
  5. All unit tests for these 11 modules pass with coverage thresholds met or exceeded
**Plans:** 5/5 plans complete

Plans:
- [ ] 60-01-PLAN.md -- Data parsing layer: frontmatter.ts + markdown-split.ts migration
- [ ] 60-02-PLAN.md -- State management layer: state.ts + roadmap.ts migration
- [ ] 60-03-PLAN.md -- Validation & quality layer: cleanup.ts + gates.ts + requirements.ts migration
- [ ] 60-04-PLAN.md -- Domain utilities: deps.ts + verify.ts + scaffold.ts migration
- [x] 60-05-PLAN.md -- Phase lifecycle: phase.ts migration + full Phase 60 validation (completed 2026-03-01)

### Phase 61: Integration & Autonomous Layer Migration

**Goal:** All integration and autonomous execution modules are migrated to TypeScript with typed subprocess and external tool interfaces
**Type:** implement
**Depends on:** Phase 60
**Duration:** 3d
**Requirements:** REQ-68, REQ-69
**Verification Level:** proxy
**Success Criteria** (what must be TRUE):
  1. 6 modules migrated to .ts: tracker, worktree, parallel, long-term-roadmap, autopilot, evolve
  2. All 6 modules compile under `strict: true` with no `any` types in exported functions
  3. External process interactions (git, gh, claude CLI spawning) have typed input/output interfaces
  4. Evolve state schema (EVOLVE-STATE.json), work item structures, and iteration types are defined as TypeScript interfaces
  5. All unit tests for these 6 modules pass with coverage thresholds met or exceeded
**Plans:** 5/5 plans complete

Plans:
- [x] TBD (run /grd:plan-phase 61 to break down) (completed 2026-03-01)

### Phase 62: Oversized Module Decomposition & Migration

**Goal:** The three largest modules are decomposed into focused sub-modules and migrated to TypeScript with barrel re-exports preserving backward compatibility
**Type:** implement
**Depends on:** Phase 61
**Duration:** 5d
**Requirements:** REQ-71, REQ-72, REQ-73, REQ-74
**Verification Level:** proxy
**Success Criteria** (what must be TRUE):
  1. `lib/commands.ts` (~2,848 lines) decomposed into 6+ focused modules under `lib/commands/` with `index.ts` barrel re-export
  2. `lib/context.ts` (~2,546 lines) decomposed into 5+ focused modules under `lib/context/` with `index.ts` barrel re-export
  3. `lib/evolve.ts` (~2,567 lines) decomposed into 4 modules under `lib/evolve/` (discovery, state, scoring, orchestrator) with `index.ts` barrel re-export
  4. All decomposed sub-modules compile under `strict: true` with no `any` types in exported functions
  5. No individual sub-module exceeds 600 lines
  6. All imports from other lib/ modules that reference commands/context/evolve continue to resolve via the barrel exports (zero breakage)
  7. All unit tests for commands, context, and evolve pass with coverage thresholds met or exceeded
**Plans:** 5/5 plans complete

Plans:
- [ ] 62-01-PLAN.md — Decompose evolve.ts into evolve/ sub-modules (types, state, discovery, scoring, orchestrator, cli)
- [ ] 62-02-PLAN.md — Decompose & migrate commands.js Part 1 (slug-timestamp, todo, config, phase-info, progress, LT-roadmap, quality)
- [ ] 62-03-PLAN.md — Decompose & migrate context.js into context/ sub-modules (base, execute, project, research, agents, progress)
- [ ] 62-04-PLAN.md — Decompose & migrate commands.js Part 2 (dashboard, health, search + barrel + CJS proxy)
- [ ] 62-05-PLAN.md — jest.config.js threshold updates + full test suite verification

### Phase 63: Entry Points & MCP Server Migration ✅ (2026-03-02)

**Goal:** All bin/ entry points and the MCP server are migrated to TypeScript with fully typed routing tables and tool descriptors
**Type:** implement
**Depends on:** Phase 62
**Duration:** 2d
**Requirements:** REQ-70
**Verification Level:** proxy
**Success Criteria** (what must be TRUE):
  1. 4 bin/ entry points migrated to .ts: grd-tools, grd-mcp-server, grd-manifest, postinstall ✅
  2. `bin/grd-tools.ts` routing table is fully typed -- every route maps to a typed function reference ✅
  3. `lib/mcp-server.ts` COMMAND_DESCRIPTORS table is fully typed with typed parameter schemas and execute functions ✅
  4. Shebang lines preserved in compiled output; `node dist/bin/grd-tools.js` works identically to `node bin/grd-tools.js` (DEFER-63-01: dist/ runtime deferred to Phase 65)
  5. All 123 MCP tools respond correctly via `tools/list` and `tools/call` ✅
**Plans:** 4 plans

Plans:
- [x] 63-01-PLAN.md — Migrate postinstall.js and grd-manifest.js to TypeScript
- [x] 63-02-PLAN.md — Migrate grd-tools.js to TypeScript with typed routing table
- [x] 63-03-PLAN.md — Migrate mcp-server.js to TypeScript with typed COMMAND_DESCRIPTORS
- [x] 63-04-PLAN.md — Migrate grd-mcp-server.js and full integration verification

### Phase 64: Test Suite Migration

**Goal:** All test files are migrated to TypeScript with typed test helpers, mock factories, and assertions
**Type:** implement
**Depends on:** Phase 63
**Duration:** 3d
**Requirements:** REQ-75, REQ-76, REQ-77
**Verification Level:** proxy
**Success Criteria** (what must be TRUE):
  1. ts-jest configured and running for all test directories (unit, integration, helpers, golden)
  2. All ~31 unit test files migrated from .test.js to .test.ts with type annotations on mocks and helpers
  3. All ~6 integration/E2E test files migrated to .ts with typed subprocess spawn helpers
  4. Test helpers and fixtures have typed exports
  5. Per-file coverage thresholds in jest.config still apply to .ts source files and all thresholds are met
  6. Total test count remains at 2,184+ with zero regressions
**Plans:** 0 plans

Plans:
- [ ] TBD (run /grd:plan-phase 64 to break down)

### Phase 65: Integration Validation & Documentation

**Goal:** The fully migrated TypeScript codebase passes all quality gates, produces a drop-in replacement build, and documentation reflects the new structure
**Type:** integrate
**Depends on:** Phase 64
**Duration:** 2d
**Requirements:** REQ-64, REQ-78, REQ-80, REQ-81
**Verification Level:** full
**Success Criteria** (what must be TRUE):
  1. CI pipeline runs `tsc --noEmit`, ESLint on .ts, and full test suite -- all green on Node 18/20/22
  2. Zero `any` types in core lib/ modules (audit script confirms; exceptions only in test mocks with documented justification)
  3. All 2,184+ tests pass against the compiled TypeScript output (the dist/ build)
  4. `node dist/bin/grd-tools.js state load --raw` produces identical output to the pre-migration JS version
  5. All 123 MCP tools function correctly via the compiled MCP server
  6. CLAUDE.md updated: file extensions (.ts), build commands (`npm run build`), module structure (decomposed commands/context/evolve), code style section for TypeScript conventions
  7. Plugin compatibility verified: Claude Code plugin manifest loads and SessionStart hook fires correctly with dist/ paths
**Plans:** 0 plans

Plans:
- [ ] TBD (run /grd:plan-phase 65 to break down)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 58. TypeScript Toolchain | v0.3.0 | 0/0 | Not started | - |
| 59. Foundation Layer & Shared Types | v0.3.0 | Complete    | 2026-03-01 | - |
| 60. Data & Domain Layer Migration | v0.3.0 | Complete    | 2026-03-01 | - |
| 61. Integration & Autonomous Layer | v0.3.0 | Complete    | 2026-03-01 | - |
| 62. Oversized Module Decomposition | v0.3.0 | Complete    | 2026-03-01 | - |
| 63. Entry Points & MCP Server | v0.3.0 | 0/0 | Not started | - |
| 64. Test Suite Migration | v0.3.0 | 0/0 | Not started | - |
| 65. Integration Validation | v0.3.0 | 0/0 | Not started | - |

## Deferred Validations

| Deferred From | Validation | Must Resolve By | Status |
|---------------|-----------|-----------------|--------|
| Phase 58 | Strict mode compatibility with full codebase (only validated on sample file) | Phase 65 | Pending |
| Phase 59 | CommonJS interop validated with all 20+ downstream consumers (only spot-checked) | Phase 65 | Pending |
| Phase 62 | Barrel re-export backward compatibility under real CLI and MCP invocation | Phase 65 | Pending |
| Phase 63 | Plugin manifest compatibility with dist/ paths under Claude Code runtime | Phase 65 | Pending |
