---
phase: 68
plan: 01
subsystem: evolve/product-ideation
tags: [product-ideation, discovery, claude-powered, feature-generation]
dependency_graph:
  requires: []
  provides: [discoverProductIdeationItems, ProductIdeationContext, product-ideation-dimension]
  affects: [lib/evolve/discovery.ts, lib/evolve/state.ts]
tech_stack:
  added: []
  patterns: [product-manager-prompt, graceful-fallback-discovery]
key_files:
  created:
    - lib/evolve/_product-ideation.ts
  modified:
    - lib/evolve/types.ts
    - lib/evolve/state.ts
decisions:
  - "Product-ideation dimension added to WORK_ITEM_DIMENSIONS at weight 10 (same as improve-features) to ensure product ideas get high priority in scoring"
  - "Theme pattern 'product-' added for product-ideation grouping in evolve scoring"
  - "gatherProductContext reads first N chars of planning files (3000/2000/1500) to keep prompt within reasonable token limits"
  - "Product ideation prompt explicitly instructs Claude to think as product manager, not linter"
metrics:
  duration: 3min
  completed: 2026-03-02
---

# Phase 68 Plan 01: Product Ideation Discovery Module Summary

New Claude-powered product ideation discoverer that generates creative feature ideas by analyzing PROJECT.md, LONG-TERM-ROADMAP.md, existing commands/agents, and product quality gaps -- thinking like a product manager, not a code linter.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add ProductIdeationContext interface | 87a25a1 | lib/evolve/types.ts |
| 2 | Create product ideation discovery module | 5f82505 | lib/evolve/_product-ideation.ts, lib/evolve/state.ts |

## What Was Built

### Task 1: ProductIdeationContext Interface (lib/evolve/types.ts)

Added a new `ProductIdeationContext` interface with 6 fields:
- `projectVision` -- from PROJECT.md (first 3000 chars)
- `longTermGoals` -- from LONG-TERM-ROADMAP.md (first 2000 chars)
- `existingCommands` -- command names from commands/ directory
- `existingAgents` -- agent names from agents/ directory
- `recentPhases` -- from ROADMAP.md (last 2000 chars)
- `productQuality` -- from PRODUCT-QUALITY.md (first 1500 chars)

### Task 2: Product Ideation Discovery Module (lib/evolve/_product-ideation.ts)

Created 405-line module with 4 exported functions:

1. **gatherProductContext(cwd)** -- Reads planning files and directory listings to build structured product context. Each file read is wrapped in try/catch with null/empty fallbacks.

2. **buildProductIdeationPrompt(context)** -- Constructs a fundamentally different prompt from the code-quality discovery in discovery.ts. Sets the role as "product manager for a developer tools company" and asks for creative feature ideas across 6 categories (new commands, integrations, UX improvements, DX enhancements, analysis capabilities, automation features).

3. **parseProductIdeationOutput(raw)** -- Parses Claude's JSON output, strips markdown fences, validates fields, and filters to only accept items with `dimension === 'product-ideation'`. Returns empty array on parse failure.

4. **discoverProductIdeationItems(cwd)** -- Main entry point. Gathers context, skips if no PROJECT.md, spawns Claude with product-manager prompt, parses output. Returns empty array on any failure (timeout, bad exit code, parse error).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added 'product-ideation' dimension to state.ts constants**
- **Found during:** Task 2
- **Issue:** `createWorkItem` in state.ts validates dimension against `WORK_ITEM_DIMENSIONS`. The plan says "state.ts will be updated in plan 03" but without the dimension, `createWorkItem` would throw for every product-ideation item, making the module non-functional.
- **Fix:** Added 'product-ideation' to `WORK_ITEM_DIMENSIONS`, `DIMENSION_WEIGHTS` (weight: 10), and `THEME_PATTERNS` (pattern: /^product-/) in state.ts.
- **Files modified:** lib/evolve/state.ts
- **Commit:** 5f82505

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS -- zero errors |
| `npx eslint lib/evolve/_product-ideation.ts` | PASS -- zero errors |
| Module loads via `require()` | PASS -- all 4 functions exported |
| ProductIdeationContext in types.ts | PASS -- interface with 6 fields |
| buildProductIdeationPrompt contains "product manager" | PASS |
| buildProductIdeationPrompt contains "product-ideation" | PASS |
| gatherProductContext returns correct shape | PASS -- 6 keys, 42 commands, 20 agents |
| parseProductIdeationOutput filters non-product-ideation | PASS -- rejects wrong dimensions |
| parseProductIdeationOutput handles markdown fences | PASS |
| parseProductIdeationOutput handles bad JSON | PASS -- returns empty array |
| Module line count >= 120 | PASS -- 405 lines |

## Decisions Made

1. **Product ideation dimension weight = 10** -- Same as improve-features, ensuring product ideas compete equally with top-priority items in scoring.
2. **Theme pattern /^product-/** -- Groups product ideation items together for coherent work groups in evolve iterations.
3. **Context truncation limits** -- PROJECT.md at 3000 chars, LONG-TERM-ROADMAP.md at 2000, PRODUCT-QUALITY.md at 1500, ROADMAP.md at last 2000 chars. Balances context richness with prompt token limits.
4. **Graceful fallback everywhere** -- Every failure path returns empty array and logs to stderr, matching the pattern in discovery.ts.

## Self-Check: PASSED
