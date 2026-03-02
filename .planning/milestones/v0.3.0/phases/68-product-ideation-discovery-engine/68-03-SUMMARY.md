---
phase: 68-product-ideation-discovery-engine
plan: 03
subsystem: evolve
tags: [integration, barrel, mcp, autoplan, product-ideation]
dependency_graph:
  requires: [68-01]
  provides: [product-ideation-barrel-exports, mcp-description-update, autoplan-product-guidance]
  affects: [lib/evolve/index.ts, lib/mcp-server.ts, lib/autoplan.ts]
tech_stack:
  added: []
  patterns: [cjs-proxy, barrel-re-export, conditional-prompt-injection]
key_files:
  created:
    - lib/evolve/_product-ideation.js
  modified:
    - lib/evolve/index.ts
    - lib/mcp-server.ts
    - lib/autoplan.ts
decisions:
  - "Barrel symbol count corrected from 39 to 44 (40 existing + 4 new product ideation)"
  - "Product ideation guidance uses conditional string injection (empty when no product-ideation groups)"
  - "MCP description lists all 8 dimensions in priority order (product-ideation first)"
metrics:
  duration: 3min
  completed: 2026-03-02
---

# Phase 68 Plan 03: System Integration Wiring Summary

CJS proxy, barrel re-exports, MCP tool description update, and autoplan prompt enhancement -- completing the product ideation module's integration into all external-facing surfaces.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create CJS proxy for _product-ideation.ts | 20c9e8d | lib/evolve/_product-ideation.js |
| 2 | Update barrel re-exports in lib/evolve/index.ts | ebb3097 | lib/evolve/index.ts |
| 3 | Update MCP server grd_evolve_discover description | 1f9dc27 | lib/mcp-server.ts |
| 4 | Enhance buildAutoplanPrompt for product-ideation groups | c240fb1 | lib/autoplan.ts |

## What Was Done

### Task 1: CJS Proxy
Created `lib/evolve/_product-ideation.js` as a 2-line CJS proxy following the exact pattern of `_dimensions-features.js`. This enables `require('./lib/evolve/_product-ideation')` without specifying the `.ts` extension.

### Task 2: Barrel Re-exports
Updated `lib/evolve/index.ts` to:
- Import the `_product-ideation` module via `require('./_product-ideation')`
- Re-export all 4 functions: `gatherProductContext`, `buildProductIdeationPrompt`, `parseProductIdeationOutput`, `discoverProductIdeationItems`
- Updated JSDoc comment from 39 to 44 symbols (correcting off-by-one: 40 existing + 4 new)
- Added `@see` entry for `_product-ideation.ts`

All 40 existing exports verified intact (zero breaking changes).

### Task 3: MCP Tool Description
Updated the `grd_evolve_discover` tool description from "6 dimensions" to "8 dimensions", listing all dimensions including `product-ideation` and `improve-features`. Added explanation that product ideation discovers creative feature ideas by analyzing PROJECT.md and the product roadmap.

### Task 4: Autoplan Prompt Enhancement
Added conditional product-ideation guidance to `buildAutoplanPrompt`:
- `hasProductIdeation` check via `groups.some(g => g.dimension === 'product-ideation')`
- When true: injects "Product Feature Guidance" section instructing Claude to create feature-building phases, not code refactors
- When false: empty string (prompt unchanged, zero regression risk)

Verified with test script: guidance appears for product-ideation groups and is absent for pure code-quality groups.

## Verification Results

- `npx tsc --noEmit` passes for all modified files (clean compile)
- `npx eslint lib/evolve/index.ts lib/mcp-server.ts lib/autoplan.ts` reports zero errors
- CJS proxy loads via `require()` without error
- Barrel exports exactly 44 symbols (40 original + 4 new)
- MCP description contains "product-ideation"
- `buildAutoplanPrompt` conditionally includes "Product Feature Guidance" section

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **Barrel symbol count correction:** The JSDoc said 39 but the barrel already had 40 exports (runInfiniteEvolve was added in Phase 67 without updating the count). Corrected to 44 (40 + 4 new).
2. **MCP dimension ordering:** Listed dimensions in priority order with product-ideation first (matching the weight=10 priority from plan 01).
3. **Conditional guidance pattern:** Used simple `.some()` check with ternary string injection -- minimal code, zero overhead when no product-ideation groups present.
