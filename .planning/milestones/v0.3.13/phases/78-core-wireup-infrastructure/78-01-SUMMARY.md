---
phase: 78-core-wireup-infrastructure
plan: 01
subsystem: wireup
tags: [typescript, filesystem-analysis, discovery, integration-gaps]

requires: []
provides:
  - "lib/wireup/types.ts: UnwiredFeature, WireupScenario, WireupState type definitions"
  - "lib/wireup/discovery.ts: discoverUnwiredFeatures() with three filesystem-based scanners"
  - "tests/unit/wireup-discovery.test.ts: 14 unit tests covering all categories and edge cases"
affects: [79-wireup-orchestrator, 80-browser-execution]

tech-stack:
  added: [lib/wireup/ subdirectory]
  patterns:
    - "Typed require pattern for module imports (same as lib/evolve/)"
    - "Pure filesystem analysis: no child process spawn, only fs.readFileSync/readdirSync"
    - "Three private scanners + one public orchestrator pattern"

key-files:
  created:
    - lib/wireup/types.ts
    - lib/wireup/discovery.ts
    - tests/unit/wireup-discovery.test.ts
  modified: []

key-decisions:
  - "Discovery uses pure regex-based export extraction (module.exports = {...} and exports.name = ...) rather than AST parsing to avoid dependencies"
  - "Config keys starting with _ are treated as private and excluded from surface-gap detection"
  - "MCP tools are identified by grd_ prefix to filter non-tool name fields in mcp-server.ts"
  - "Results sorted by category then filePath for deterministic output"

patterns-established:
  - "wireup subsystem lives in lib/wireup/ following lib/evolve/ directory structure"
  - "Pure type files use export type/interface with zero runtime code"

duration: 15min
completed: 2026-03-20
---

# Phase 78 Plan 01: Wireup Type System and Discovery Engine Summary

**Wireup discovery engine scanning exported-but-uncalled functions, config-without-surface keys, and endpoint-without-integration-test gaps via pure filesystem analysis with 14 unit tests passing.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-20T11:35:00Z
- **Completed:** 2026-03-20T11:50:38Z
- **Tasks:** 2/2
- **Files modified:** 3 created

## Accomplishments

- Created `lib/wireup/types.ts` with 7 pure type definitions: UnwiredFeatureCategory, UnwiredFeature, ScenarioStepType, ScenarioStep, WireupScenario, WireupIterationHistory, WireupState
- Implemented `lib/wireup/discovery.ts` with three private scanners and a public `discoverUnwiredFeatures()` orchestrator using only `fs.readFileSync`/`readdirSync` — no child process spawn
- Written 14 unit tests in `tests/unit/wireup-discovery.test.ts` covering happy paths, edge cases (empty/malformed input), sort invariant, and all three detection categories

## Task Commits

Each task was committed atomically:

1. **Task 1: Create wireup type definitions** - `3278421` (feat)
2. **Task 2: Implement discoverUnwiredFeatures() and unit tests** - `7995409` (feat)

## Files Created/Modified

- `lib/wireup/types.ts` — Pure type definitions for the entire wireup subsystem (109 lines)
- `lib/wireup/discovery.ts` — Discovery engine with three scanners and public orchestrator (247 lines)
- `tests/unit/wireup-discovery.test.ts` — Unit tests with jest.mock for fs and utils (291 lines)

## Decisions Made

- Used regex-based export extraction instead of AST parsing to keep zero additional dependencies
- Config keys with `_` prefix are skipped (treated as internal/private by convention)
- MCP tool names identified by `grd_` prefix to disambiguate from other `name:` fields in mcp-server.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript strict mode required explicit `UnwiredFeature` type annotations on lambda parameters in tests (result typed as `any[]` via require). Fixed inline (Rule 1 auto-fix).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/wireup/types.ts` and `lib/wireup/discovery.ts` are ready for Phase 78 Plan 02 (scenario generation) to import
- `discoverUnwiredFeatures(cwd)` returns a stable `UnwiredFeature[]` interface that Phase 79 orchestrator can consume
- No blockers

---
*Phase: 78-core-wireup-infrastructure*
*Completed: 2026-03-20*
