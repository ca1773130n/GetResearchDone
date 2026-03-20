---
phase: 78-core-wireup-infrastructure
plan: 02
subsystem: wireup
tags: [typescript, scenario-generation, test-data, fixtures, unit-tests]

requires:
  - "lib/wireup/types.ts: UnwiredFeature, WireupScenario, ScenarioStep type definitions (78-01)"
  - "lib/wireup/discovery.ts: UnwiredFeature[] consumer input (78-01)"
provides:
  - "lib/wireup/scenarios.ts: generateScenarios() and generateTestData() functions"
  - "tests/unit/wireup-scenarios.test.ts: 15 unit tests covering all generation paths"
affects: [79-wireup-orchestrator, 80-browser-execution]

tech-stack:
  added: []
  patterns:
    - "Category-switch dispatch to private scenario builders (_scenarioFor*)"
    - "Regex-based function parameter extraction from TypeScript source files"
    - "Type-to-default mapping for fixture parameter generation"
    - "milestone-scoped fixture path: .planning/milestones/{milestone}/wireup/test-data/{name}.json"

key-files:
  created:
    - lib/wireup/scenarios.ts
    - tests/unit/wireup-scenarios.test.ts
  modified: []

key-decisions:
  - "Scenario steps are category-specific: exported-but-uncalled uses cli+assert, config-without-surface uses cli(gd settings)+assert, endpoint-without-integration-test uses http+assert"
  - "Parameter extraction uses regex against function signatures (not AST) to avoid additional dependencies"
  - "TYPE_DEFAULTS map covers string/number/boolean/string[]/Record with fallback to null for unknown types"
  - "Fixture files are milestone-scoped using currentMilestone() to support multi-milestone projects"

duration: 10min
completed: 2026-03-20
---

# Phase 78 Plan 02: Scenario Generation and Test Data Fixtures Summary

**Scenario generation engine mapping UnwiredFeature[] to WireupScenario[] with category-specific step types and JSON test data fixture writing with regex-derived parameter defaults, validated by 15 unit tests.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-20T11:53:30Z
- **Completed:** 2026-03-20T12:02:35Z
- **Tasks:** 2/2
- **Files modified:** 2 created

## Accomplishments

- Created `lib/wireup/scenarios.ts` with two public functions:
  - `generateScenarios(features, cwd)`: dispatches to three private builders by category, producing cli+assert, cli(gd settings)+assert, or http+assert step sequences respectively
  - `generateTestData(scenarios, cwd)`: reads source files, extracts typed parameters via regex, maps types to defaults, writes milestone-scoped JSON fixtures
- Written 15 unit tests in `tests/unit/wireup-scenarios.test.ts` covering all three categories, fixture path format, empty-input edge cases, parameter extraction from typed signatures, and writeFileSync/mkdirSync call verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement generateScenarios() and generateTestData()** - `d2b6857` (feat)
2. **Task 2: Unit tests for scenario and test data generation** - `d99cd07` (feat)

## Files Created/Modified

- `lib/wireup/scenarios.ts` — Scenario and fixture generation module (~265 lines)
- `tests/unit/wireup-scenarios.test.ts` — Unit tests with jest.mock for fs, utils, paths (317 lines)

## Decisions Made

- Used three private `_scenarioFor*` functions (one per category) dispatched via a switch statement for clarity and extensibility
- Fixture path resolves through `currentMilestone(cwd)` so scenarios stay aligned with the active milestone even across milestone transitions
- Parameter regex handles both `function name(p: T)` and `const name = (p: T) =>` patterns to cover TypeScript module patterns used in the codebase

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. TypeScript strict mode passed cleanly on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/wireup/scenarios.ts` exports `generateScenarios()` and `generateTestData()` ready for Phase 79 orchestrator to import
- Fixture output path convention (`.planning/milestones/{milestone}/wireup/test-data/{name}.json`) is established for Phase 79/80 consumers
- No blockers

## Self-Check: PASSED

- lib/wireup/scenarios.ts: FOUND
- tests/unit/wireup-scenarios.test.ts: FOUND
- 78-02-SUMMARY.md: FOUND
- commit d2b6857 (feat(78-02) scenarios): FOUND
- commit d99cd07 (feat(78-02) tests): FOUND

---
*Phase: 78-core-wireup-infrastructure*
*Completed: 2026-03-20*
