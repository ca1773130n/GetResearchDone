# Requirements: v0.3.0 TypeScript Migration & Refactoring

**Milestone:** v0.3.0
**Created:** 2026-03-01

## TypeScript Toolchain

### REQ-62: TypeScript Build Pipeline
**Priority:** P0 — Critical
**Category:** Infrastructure
**Description:** Set up TypeScript compilation toolchain: tsconfig.json with strict mode, ts-jest for test compilation, build scripts in package.json, source maps for debugging. Output to dist/ directory. Preserve CommonJS output format for backward compatibility with existing plugin consumers.

### REQ-63: ESLint TypeScript Integration
**Priority:** P0 — Critical
**Category:** Infrastructure
**Description:** Migrate ESLint configuration from JavaScript to TypeScript rules. Replace @eslint/js with @typescript-eslint/eslint-plugin and @typescript-eslint/parser. Maintain existing rule severity (no-unused-vars with underscore prefix convention). Add type-aware linting rules.

### REQ-64: CI Pipeline Adaptation
**Priority:** P1 — High
**Category:** Infrastructure
**Description:** Update GitHub Actions CI to build TypeScript before running tests and lint. Add type-check step (`tsc --noEmit`). Ensure CI catches type errors, lint errors, and test failures. Update Node version matrix if needed.

## Core Module Migration

### REQ-65: Foundation Layer Migration (paths, backend, utils)
**Priority:** P0 — Critical
**Category:** Migration
**Description:** Migrate the three foundation modules to TypeScript: `lib/paths.ts`, `lib/backend.ts`, `lib/utils.ts`. Define core shared types and interfaces (Config, PhaseInfo, MilestoneInfo, BackendCapabilities, ModelProfile). These types will be imported by all higher-level modules.

### REQ-66: Data Layer Migration (state, roadmap, frontmatter, markdown-split)
**Priority:** P0 — Critical
**Category:** Migration
**Description:** Migrate data parsing modules to TypeScript: `lib/state.ts`, `lib/roadmap.ts`, `lib/frontmatter.ts`, `lib/markdown-split.ts`. Define types for STATE.md fields, roadmap phase structures, frontmatter objects, and split/reassemble operations.

### REQ-67: Domain Logic Migration (phase, deps, gates, verify, scaffold, cleanup, requirements)
**Priority:** P1 — High
**Category:** Migration
**Description:** Migrate domain logic modules to TypeScript: `lib/phase.ts`, `lib/deps.ts`, `lib/gates.ts`, `lib/verify.ts`, `lib/scaffold.ts`, `lib/cleanup.ts`, `lib/requirements.ts`. Type all command functions with explicit parameter and return types.

### REQ-68: Integration Layer Migration (tracker, worktree, parallel, long-term-roadmap)
**Priority:** P1 — High
**Category:** Migration
**Description:** Migrate integration modules to TypeScript: `lib/tracker.ts`, `lib/worktree.ts`, `lib/parallel.ts`, `lib/long-term-roadmap.ts`. Type external process interactions (git, gh CLI) and tracker sync operations.

### REQ-69: Autonomous Layer Migration (autopilot, evolve)
**Priority:** P1 — High
**Category:** Migration
**Description:** Migrate autonomous execution modules to TypeScript: `lib/autopilot.ts`, `lib/evolve.ts`. Type subprocess spawning interfaces, work item structures, evolve state schema, and iteration management.

### REQ-70: Entry Points Migration (bin/grd-tools, bin/grd-mcp-server, bin/grd-manifest, bin/postinstall)
**Priority:** P1 — High
**Category:** Migration
**Description:** Migrate all bin/ entry points to TypeScript. Maintain shebang lines and CLI argument parsing. Ensure `grd-tools.ts` routing table is fully typed.

### REQ-71: Context and Commands Migration (context, commands, mcp-server)
**Priority:** P1 — High
**Category:** Migration
**Description:** Migrate the three largest modules to TypeScript: `lib/context.ts`, `lib/commands.ts`, `lib/mcp-server.ts`. These are the heaviest integration points — type all init context bundles and MCP tool descriptors.

## Module Restructuring

### REQ-72: Decompose commands.js (~2,848 lines)
**Priority:** P1 — High
**Category:** Refactoring
**Description:** Split `lib/commands.ts` into focused command modules during migration. Group by domain: `commands/slug.ts`, `commands/todo.ts`, `commands/config.ts`, `commands/dashboard.ts`, `commands/health.ts`, `commands/search.ts`, `commands/coverage.ts`, etc. Re-export from a `commands/index.ts` barrel for backward compatibility.

### REQ-73: Decompose context.js (~2,546 lines)
**Priority:** P1 — High
**Category:** Refactoring
**Description:** Split `lib/context.ts` into domain-grouped init modules during migration. Group by workflow family: `context/execute.ts`, `context/plan.ts`, `context/research.ts`, `context/project.ts`, `context/agents.ts`, etc. Re-export from `context/index.ts` barrel.

### REQ-74: Decompose evolve.js (~2,567 lines)
**Priority:** P1 — High
**Category:** Refactoring
**Description:** Split `lib/evolve.ts` into focused modules during migration: `evolve/discovery.ts` (work item analysis), `evolve/state.ts` (EVOLVE-STATE.json management), `evolve/scoring.ts` (priority selection), `evolve/orchestrator.ts` (run loop). Re-export from `evolve/index.ts` barrel.

## Test Migration

### REQ-75: Test Infrastructure Migration
**Priority:** P1 — High
**Category:** Testing
**Description:** Migrate test infrastructure to TypeScript: configure ts-jest, migrate test helpers and fixtures, update jest.config to handle .ts files. Ensure per-file coverage thresholds still apply to the new .ts source files.

### REQ-76: Unit Test Migration
**Priority:** P1 — High
**Category:** Testing
**Description:** Migrate all unit test files from .js to .ts. Add type annotations to test helpers, mock factories, and assertions. Maintain or exceed existing per-file coverage thresholds.

### REQ-77: Integration and E2E Test Migration
**Priority:** P2 — Medium
**Category:** Testing
**Description:** Migrate integration and E2E test files to TypeScript. Type subprocess spawn helpers and output parsing. Update golden test infrastructure if needed.

## Type Safety

### REQ-78: Strict Type Checking
**Priority:** P0 — Critical
**Category:** Quality
**Description:** Enable `strict: true` in tsconfig.json. No `any` types in core lib/ modules (exceptions allowed only in test mocks and external API boundaries with documented justification). All exported functions must have explicit return types.

### REQ-79: Type Definitions for Planning Artifacts
**Priority:** P2 — Medium
**Category:** Quality
**Description:** Define TypeScript interfaces for all .planning/ file formats: STATE.md fields, ROADMAP.md phase structure, config.json schema, EVOLVE-STATE.json, frontmatter objects, MCP tool descriptors. Consolidate in a `types/` directory or `lib/types.ts`.

## Integration & Validation

### REQ-80: Zero Breaking Changes
**Priority:** P0 — Critical
**Category:** Validation
**Description:** All existing CLI commands, MCP tools, and plugin interfaces must continue to work identically after migration. The compiled output must be a drop-in replacement. All 2,184+ existing tests must pass against the TypeScript build.

### REQ-81: CLAUDE.md and Documentation Update
**Priority:** P2 — Medium
**Category:** Documentation
**Description:** Update CLAUDE.md to reflect TypeScript codebase: file extensions, build commands, new module structure (decomposed commands/context/evolve). Update code style section for TypeScript conventions.

## Traceability Matrix

| REQ | Phase | Status |
|-----|-------|--------|
| REQ-62 | TBD | PENDING |
| REQ-63 | TBD | PENDING |
| REQ-64 | TBD | PENDING |
| REQ-65 | TBD | PENDING |
| REQ-66 | TBD | PENDING |
| REQ-67 | TBD | PENDING |
| REQ-68 | TBD | PENDING |
| REQ-69 | TBD | PENDING |
| REQ-70 | TBD | PENDING |
| REQ-71 | TBD | PENDING |
| REQ-72 | TBD | PENDING |
| REQ-73 | TBD | PENDING |
| REQ-74 | TBD | PENDING |
| REQ-75 | TBD | PENDING |
| REQ-76 | TBD | PENDING |
| REQ-77 | TBD | PENDING |
| REQ-78 | TBD | PENDING |
| REQ-79 | TBD | PENDING |
| REQ-80 | TBD | PENDING |
| REQ-81 | TBD | PENDING |
