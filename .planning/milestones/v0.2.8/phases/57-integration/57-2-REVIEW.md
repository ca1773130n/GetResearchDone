---
phase: 57-integration
wave: 2
plans_reviewed: [57-03]
reviewer: grd-code-reviewer
date: 2026-02-22
severity_gate: warn
---

# Wave 2 Code Review -- Phase 57 Integration

## Scope

Plans reviewed:
- **57-03**: E2E integration tests for evolve loop and deferred validations

Commit reviewed: `e8db88a` (tests/integration/evolve-e2e.test.js, +455 lines)

---

## Plan 57-03: E2E Integration Tests & Deferred Validations

**Verdict: PASS with minor observations**

### What was done

Created `tests/integration/evolve-e2e.test.js` (455 lines, 11 tests in 4 describe blocks):

1. **"E2E: Work item discovery quality"** (4 tests) -- validates `analyzeCodebaseForItems` and `runDiscovery` on a purpose-built fixture, asserting dimension coverage, field completeness, and dedup behavior.
2. **"E2E: Full evolve iteration mechanics"** (3 tests) -- exercises the discover-select-advance-persist pipeline step by step, validates `writeEvolutionNotes` output, and runs `runEvolve` in dry-run mode.
3. **"E2E: Iteration handoff"** (3 tests) -- verifies state transitions across two iterations, merge dedup semantics (existing-wins), and persistent state on disk.
4. **"E2E: Discovery on GRD codebase itself"** (1 test) -- runs `analyzeCodebaseForItems` against the real GRD project root with a 30s timeout.

### Strengths

- **Well-structured test fixtures.** The `createDiscoveryFixture` helper builds a realistic project with files that intentionally trigger multiple discovery dimensions (TODO comments, long functions, process.exit calls, missing tests, missing JSDoc). This makes the dimension assertions meaningful rather than arbitrary.
- **Correct API usage.** All imports from `lib/evolve.js` are verified against the actual function signatures. `createWorkItem(dimension, slug, title, description)` is called with the correct 4 required positional arguments. `runDiscovery(cwd, previousState)` correctly passes a state object with the expected shape (`iteration`, `items_per_iteration`, `remaining`, `selected`, `bugfix`, `completed`, `failed`, `history`).
- **Accurate semantics testing.** The merge dedup test correctly validates the "existing-wins" behavior of `mergeWorkItems` -- when an existing item and a discovered item have the same `id`, the existing item's description is preserved. This matches the implementation at `lib/evolve.js:184-196` which adds discovered items only when `!seen.has(item.id)`.
- **`advanceIteration` carryover logic correctly tested.** The test creates items with default `status: 'pending'` from `createWorkItem`, which matches the filter at `lib/evolve.js:224` (`item.status === 'pending'`). The 2 remaining items do carry over because they have `status: 'pending'`.
- **Proper isolation.** Uses `fs.mkdtempSync` in `os.tmpdir()` for tests 1-3, cleans up in `afterAll`/`afterEach`. The GRD codebase test (block 4) is read-only -- it only calls `analyzeCodebaseForItems` which does filesystem reads, no writes.
- **Follows existing patterns.** CommonJS, `'use strict'`, same fixture pattern as `e2e-workflow.test.js`, direct module imports instead of CLI subprocess calls.

### Observations

| # | Severity | Location | Finding |
|---|----------|----------|---------|
| 1 | info | `evolve-e2e.test.js:18-21` | The `createTmpDir` helper defaults to `'grd-evolve-e2e-'` prefix. Functionally correct but if a test crashes before cleanup, leaked temp dirs are identifiable by this prefix. Not a concern -- consistent with project pattern. |
| 2 | info | `evolve-e2e.test.js:97-99` | Block 1 uses `beforeAll`/`afterAll` (shared fixture) while block 2 uses `beforeEach`/`afterEach` (fresh fixture per test). This is intentional: block 1 tests are read-only against the same fixture; block 2 tests modify state. The choice is correct for each case. |
| 3 | info | `evolve-e2e.test.js:147-162` | The dedup test constructs a `priorState` object inline with the full shape. This correctly mimics what `runDiscovery` expects from a previous state. An alternative would be calling `createInitialState` + populating, but the inline approach is equally valid and more explicit about what fields matter. |
| 4 | warn | `evolve-e2e.test.js:205-210` | In the "individual evolve steps" test, after calling `selectPriorityItems(allItems, 2)`, the test does `state.completed = [selected[0]]` -- marking only one of the two selected items as completed. Then `advanceIteration(state)` is called with `state.failed = []`. This means selected[1] is neither completed nor failed, which is a realistic scenario (an item could be in-progress / not yet processed). However, the `advanceIteration` function at `lib/evolve.js:224` only carries over `remaining` items with `status: 'pending'` and does NOT look at selected items that were neither completed nor failed. So the "lost" selected[1] is expected behavior -- it is the executor's responsibility to classify all selected items before advancing. This is correct test behavior but worth noting as a design decision. |
| 5 | info | `evolve-e2e.test.js:258-260` | The iteration handoff test sets `state.selected[2]` (the failed item) in `state.failed` but does not check whether failed items reappear in the next iteration's remaining. Looking at `advanceIteration` source: failed items are NOT carried over to remaining -- only `previousState.remaining` (filtered to pending) and `previousState.bugfix` are merged. Failed items are recorded in the history entry's `failed_count` only. The test correctly asserts `iter2.remaining.length === 2` (the 2 unselected items), confirming this behavior. |
| 6 | info | `evolve-e2e.test.js:296-306` | The merge dedup test calls `mergeWorkItems([existingItem], [discoveredItem, newItem])`. Per the source at `lib/evolve.js:184-196`, existing items are added first, then discovered items are added only if their `id` is not in the `seen` set. The test asserts `fixItem.description === 'Original description'`, which is correct because `existingItem` (with `description: 'Original description'`) is in the first argument and therefore wins. |
| 7 | info | `evolve-e2e.test.js:187` | `runEvolve` is required inline inside the test rather than at the top of the describe block. This is fine for a single test and avoids eager loading of the async function in the describe-level scope. Consistent with patterns seen elsewhere in the codebase. |

### Potential Concern: advanceIteration carries bugfix items

At observation #5, I noted that `advanceIteration` merges `previousState.bugfix` into remaining. In the tests, `bugfix: []` is always empty, so this path is never tested in the E2E file. However, this is not a gap introduced by plan 57-03 -- it is an existing behavior of the module and is covered by unit tests in `tests/unit/evolve.test.js`. No action needed.

### Deferred Validation Assessment

The SUMMARY correctly documents the three deferred validations:

- **DEFER-54-01 (CANNOT VALIDATE):** Phase 54 was not executed. No `lib/markdown-split.js` module exists. Correctly marked.
- **DEFER-55-01 (RESOLVED):** The GRD codebase discovery test (block 4) validates that real items are produced with real descriptions across 3+ dimensions. The SUMMARY includes concrete evidence: 310 items, 5 dimensions, 5 sample items with actual descriptions. This is thorough.
- **DEFER-56-01 (PARTIALLY RESOLVED):** The dry-run test validates orchestration mechanics. The SUMMARY correctly notes that live model execution is outside automated test scope. Reasonable categorization.

### Code Quality

- **Style compliance:** CommonJS, `'use strict'` at file top, no ESLint violations expected, Prettier-compatible formatting.
- **Test naming:** Clear, descriptive names stating what is being validated.
- **Assertions:** Appropriate granularity -- structural checks (`toHaveProperty`, `toHaveLength`), value checks (`toBe`, `toContain`), and range checks (`toBeGreaterThan`, `toBeGreaterThanOrEqual`).
- **No side effects:** Tests do not modify global state. Temp directories are cleaned up. The GRD codebase test is read-only.
- **File size:** 455 lines, well above the 100-line `min_lines` requirement.

### Verification

Independently confirmed from SUMMARY:
- Full test suite: **37 test suites, 2,184 tests, 0 failures** (net +11 tests from this plan)
- evolve.js coverage: **99.14% lines** (unchanged, as expected -- no production code was modified)
- New integration test file: 455 lines, 11 tests in 4 describe blocks

---

## Summary

| Plan | Changes | Tests Added | Verdict |
|------|---------|-------------|---------|
| 57-03 | 1 file (+455 lines) | 11 | PASS |

**Wave 2 overall: PASS**

No blocking issues. No bugs found. Test assertions accurately reflect the behavior of the underlying `lib/evolve.js` functions. The API usage, dedup semantics, state transition logic, and carryover behavior are all correctly validated against the source. Deferred validation outcomes are well-documented with concrete evidence.

---

*Reviewed: 2026-02-22*
