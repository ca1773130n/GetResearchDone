---
phase: 68-product-ideation-discovery-engine
plan: 04
subsystem: tests
tags: [testing, product-ideation, coverage, tdd]
dependency_graph:
  requires: [68-01, 68-02, 68-03]
  provides: [comprehensive-test-coverage-product-ideation]
  affects: [tests/unit/evolve.test.ts, tests/unit/autoplan.test.ts, jest.config.js]
tech_stack:
  added: []
  patterns: [product-ideation-mocking, barrel-import-testing]
key_files:
  created: []
  modified:
    - tests/unit/evolve.test.ts
    - tests/unit/autoplan.test.ts
    - jest.config.js
decisions:
  - "Product ideation tests use barrel imports (via lib/evolve) not direct module imports"
  - "Mock product-ideation item added to MOCK_DISCOVERY_ITEMS for integration-style test coverage"
  - "Coverage threshold for _product-ideation.ts: lines 80%, functions 100%, branches 60%"
  - "Pre-existing npm-pack dist/ failures documented but not fixed (require .ts extension in compiled JS)"
metrics:
  duration: 12min
  completed: 2026-03-03
---

# Phase 68 Plan 04: Comprehensive Test Coverage for Product Ideation Summary

Added 22 new tests covering all 4 product ideation functions (gatherProductContext, buildProductIdeationPrompt, parseProductIdeationOutput, discoverProductIdeationItems) plus autoplan prompt enhancement, achieving zero regressions across the full 2800-test suite.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Update evolve.test.ts with product ideation test suite | 022be73 | Done |
| 2 | Add autoplan product-ideation prompt tests | c7253d8 | Done |
| 3 | Update jest.config.js and verify full suite | 2361c26 | Done |

## Changes Made

### Task 1: Product Ideation Tests in evolve.test.ts (19 new tests)

**MOCK_DISCOVERY_ITEMS updated:** Added product-ideation dimension item to the shared mock data array (now 8 items covering all dimensions).

**Barrel imports extended:** Added 4 new function imports via `require('../../lib/evolve')`:
- `gatherProductContext`
- `buildProductIdeationPrompt`
- `parseProductIdeationOutput`
- `discoverProductIdeationItems`

**New `describe('product ideation discovery')` block with 4 sub-describes:**

1. **gatherProductContext (4 tests):**
   - Returns complete ProductIdeationContext with all fields from planning files
   - Returns null fields when planning files do not exist
   - Returns null productQuality when PRODUCT-QUALITY.md missing
   - Includes productQuality when PRODUCT-QUALITY.md exists

2. **buildProductIdeationPrompt (5 tests):**
   - Returns non-empty string (>100 chars)
   - Contains product manager role instruction
   - Includes project vision in prompt
   - Includes existing commands list
   - Specifies product-ideation dimension

3. **parseProductIdeationOutput (6 tests):**
   - Parses valid JSON array with product-ideation items
   - Rejects items with wrong dimension
   - Returns empty array for invalid JSON
   - Strips markdown fences before parsing
   - Defaults effort to medium for invalid values
   - Returns empty array for non-array JSON

4. **discoverProductIdeationItems (4 tests):**
   - Returns empty array when no PROJECT.md exists
   - Returns parsed items when Claude succeeds
   - Returns empty array when Claude subprocess fails
   - Returns empty array when Claude times out

### Task 2: Autoplan Prompt Tests in autoplan.test.ts (3 new tests)

Added 3 tests to `describe('buildAutoplanPrompt')`:
- Includes Product Feature Guidance for product-ideation groups
- Does NOT include guidance for pure code-quality groups
- Includes guidance in mixed groups (product-ideation + code-quality)

### Task 3: Coverage Threshold and Full Suite Verification

- Added `_product-ideation.ts` coverage threshold: lines 80%, functions 100%, branches 60%
- Full suite: 2800 tests total, 2797 passing, 3 pre-existing failures
- Pre-existing failures: npm-pack/deferred-validation dist/ build (require `.ts` extension in compiled JS)
- Zero lint errors (`npm run lint` clean)
- Zero type errors (`npx tsc --noEmit` clean)
- All coverage thresholds met

## Deviations from Plan

None - plan executed exactly as written. The WORK_ITEM_DIMENSIONS test was already updated to `toHaveLength(8)` in Plan 02 as noted in the phase context.

## Verification Results

| Check | Result |
|-------|--------|
| evolve.test.ts: 19 new product ideation tests | PASS (203 total) |
| autoplan.test.ts: 3 new product-ideation tests | PASS (40 total) |
| WORK_ITEM_DIMENSIONS: toHaveLength(8) | PASS (already done in 68-02) |
| Full test suite passes | PASS (2797/2800, 3 pre-existing) |
| Coverage thresholds met | PASS |
| Lint clean | PASS |
| Type check clean | PASS |

## Self-Check

- [x] tests/unit/evolve.test.ts exists and has product ideation describe block
- [x] tests/unit/autoplan.test.ts exists and has 3 product-ideation tests
- [x] jest.config.js has _product-ideation.ts threshold
- [x] All 3 task commits exist
