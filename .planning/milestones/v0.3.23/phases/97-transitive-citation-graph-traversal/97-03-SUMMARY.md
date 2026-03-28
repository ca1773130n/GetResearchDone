---
phase: 97-transitive-citation-graph-traversal
plan: 03
subsystem: research
tags: [citations, citation-graph, traversal, integration-tests, agent-document]

# Dependency graph
requires:
  - phase: 97-01
    provides: traverseCitationGraph and resolveTransitiveDeps implementation in lib/citations.ts
  - phase: 97-02
    provides: fetchExternalPaper implementation and transitive_citation_gate gate in lib/gates.ts
provides:
  - grd-phase-researcher.md Step 8 extended with transitive traversal and auto-retrieval sub-steps
  - transitive_citation_gate_enabled flag exposed in cmdInitPlanPhase result
  - tests/integration/citations-pipeline.test.ts with 4 passing pipeline integration tests
affects: [grd-phase-researcher, grd-planner, plan-phase orchestrator, citation recovery pass]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - agent document wires grd-tools.js calls for traverseCitationGraph and fetchExternalPaper in Step 8
    - config flag propagation pattern: transitive_citation_gate_enabled via loadConfig in cmdInitPlanPhase
    - integration test pattern: temp dir fixtures, beforeEach/afterEach cleanup, typed require

key-files:
  created:
    - tests/integration/citations-pipeline.test.ts
  modified:
    - agents/grd-phase-researcher.md
    - lib/context/execute.ts

key-decisions:
  - "Step 8 sub-steps numbered 3 and 3b inserted between findUnresolved (step 2) and critical-fetch loop (now step 4); old steps 3/4/5 renumbered 4/5/6"
  - "transitive_citation_gate_enabled uses double-bang cast on config as Record<string, unknown> to avoid strict-mode typing complaints while remaining zero-error"
  - "Test 4 uses resolveTransitiveDeps (not fetchExternalPaper directly) to confirm no crash on null fetch; mockFetchFn exercised separately as smoke test"

patterns-established:
  - "Integration test fixtures: writePaperWithDeps() helper generates Missing Components table rows"
  - "Cycle test: mutual references verified by no-duplicate-slugs assertion on visited_nodes"

# Metrics
duration: 3min
completed: 2026-03-25
---

# Phase 97 Plan 03: Wire Transitive Traversal Into Agent and Add Pipeline Integration Tests

**grd-phase-researcher Step 8 now instructs transitive BFS traversal and conditional auto-retrieval for unresolved leaf nodes; cmdInitPlanPhase exposes transitive_citation_gate_enabled; 4 integration tests guard the full buildCitationGraph → traverseCitationGraph → resolveTransitiveDeps pipeline chain against regression.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-25T00:00:00Z
- **Completed:** 2026-03-25
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Extended grd-phase-researcher.md Step 8 with sub-steps 3 and 3b: researcher agent now instructs `traverseCitationGraph` call and conditional `fetchExternalPaper` loop when `transitive_citation_gate` is enabled
- Added `transitive_citation_gate_enabled` field to `cmdInitPlanPhase` result in `lib/context/execute.ts`, surfacing the config flag to plan-phase orchestrator context
- Created `tests/integration/citations-pipeline.test.ts` with 4 tests: full pipeline, cycle handling, depth/node limiting, auto-retrieval failure; all 4 pass with zero regressions across 122 total tests

## Task Commits

1. **Task 1: Extend grd-phase-researcher.md Step 8 and update cmdInitPlanPhase** - `e6c8e48` (feat)
2. **Task 2: Create tests/integration/citations-pipeline.test.ts with 4 integration tests** - `ac48d59` (feat)

**Plan metadata:** see final docs commit below.

## Files Created/Modified

- `agents/grd-phase-researcher.md` — Step 8 extended: steps 3/3b inserted (traverseCitationGraph + fetchExternalPaper), old 3/4/5 renumbered 4/5/6, step 6 extended with transitive_citation_gate violation note
- `lib/context/execute.ts` — `transitive_citation_gate_enabled` field added to cmdInitPlanPhase result block (line 562)
- `tests/integration/citations-pipeline.test.ts` — New file: 4 integration tests for the full citation pipeline chain

## Decisions Made

- Step 8 numbering: inserting 3/3b (traversal) before the existing critical-node fetch loop keeps the logical ordering — discover transitive deps first, then attempt to resolve critical ones
- `transitive_citation_gate_enabled` cast pattern matches existing GrdConfig extension patterns elsewhere (citation_gate, refinement_loop) — consistent approach across all optional config flags
- Test 4 confirms `resolveTransitiveDeps` does not crash when no fetchFn is provided; the mockFetchFn is exercised as a smoke test to validate the injectable interface, not called internally by resolveTransitiveDeps (which delegates to traverseCitationGraph only)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Phase 97 is complete across all 3 plans:
- Plan 01: traverseCitationGraph + resolveTransitiveDeps implementation (Wave 1)
- Plan 02: fetchExternalPaper + transitive_citation_gate gate wiring (Wave 2)
- Plan 03: agent document wiring + cmdInitPlanPhase field + integration tests (Wave 3)

Ready for Phase 98 (GoT Synthesis Execution Engine).

## Self-Check: PASSED

- [x] `agents/grd-phase-researcher.md` contains `traverseCitationGraph` and `fetchExternalPaper` in Step 8
- [x] `lib/context/execute.ts` contains `transitive_citation_gate_enabled` in cmdInitPlanPhase result
- [x] `tests/integration/citations-pipeline.test.ts` exists with 4 passing tests
- [x] Full three-suite regression: `Test Suites: 3 passed`, `Tests: 122 passed`
- [x] `npm run build:check` and `npm run lint` both pass with zero errors

---
*Phase: 97-transitive-citation-graph-traversal*
*Completed: 2026-03-25*
