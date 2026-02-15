---
phase: 03-modularize-grd-tools
plan: 04
subsystem: modularization
tags: [module-extraction, lib, roadmap, scaffold, template, refactoring]

requires:
  - phase: 03-modularize-grd-tools
    provides: lib/utils.js and lib/frontmatter.js as dependency foundation (Plan 03-02)
provides:
  - lib/roadmap.js with 3 command functions and 5 schedule helpers (8 exports)
  - lib/scaffold.js with 3 command functions (3 exports)
  - Schedule computation available as shared import for tracker code
affects: [03-05, 03-06, 03-07, tracker-integration]

tech-stack:
  added: []
  patterns: [cross-module-dependency, shared-schedule-helpers]

key-files:
  created:
    - lib/roadmap.js
    - lib/scaffold.js
  modified:
    - bin/grd-tools.js

key-decisions:
  - "Move schedule helpers (computeSchedule, getScheduleForPhase, etc.) into lib/roadmap.js rather than a separate schedule module"
  - "Export schedule helpers from lib/roadmap.js so tracker code in bin/grd-tools.js can import them"
  - "Dependency direction: roadmap.js -> utils.js, scaffold.js -> utils.js + frontmatter.js (no cycles)"

patterns-established:
  - "Cross-module shared helpers: schedule functions live in roadmap.js but are consumed by tracker code via require"
  - "Consistent extraction pattern: copy function, add exports, add require in consumer, remove original, verify"

duration: 10min
completed: 2026-02-12
---

# Phase 3 Plan 04: Roadmap and Scaffold Module Extraction Summary

**Extracted lib/roadmap.js (8 exports: 3 roadmap commands + 5 schedule helpers) and lib/scaffold.js (3 exports: template select/fill + scaffold), reducing bin/grd-tools.js by 663 lines with identical CLI output across all commands.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-12T23:41:30Z
- **Completed:** 2026-02-12T23:52:26Z
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Extracted `lib/roadmap.js` (403 lines) with roadmap parsing, phase queries, and schedule computation
- Extracted `lib/scaffold.js` (319 lines) with template selection, template fill, and scaffold operations
- Moved schedule helpers to `lib/roadmap.js` for shared access by both roadmap commands and tracker code
- Reduced `bin/grd-tools.js` from 5118 to 3644 lines (1474 lines total reduction including plan 03-03)
- All 10 tested CLI commands produce identical output to golden references

## Task Commits

1. **Task 1: Extract lib/roadmap.js** - `2705856` (feat)
2. **Task 2: Extract lib/scaffold.js** - `b527a07` (feat)

## Files Created/Modified

- `lib/roadmap.js` - ROADMAP.md parsing, phase next-decimal, roadmap analyze, schedule computation (403 lines, 8 exports)
- `lib/scaffold.js` - Template select/fill, scaffold context/uat/verification/phase-dir/research-dir/eval/baseline (319 lines, 3 exports)
- `bin/grd-tools.js` - Updated imports, removed extracted function definitions (3644 lines remaining)

## Decisions Made

- **Schedule helpers in roadmap.js:** `computeSchedule`, `getScheduleForPhase`, `getScheduleForMilestone`, `formatScheduleDate`, `addDays` are used by both `cmdRoadmapAnalyze` and tracker code. Placed them in `lib/roadmap.js` rather than a separate module for cohesion; both consumers import from there.
- **scaffold.js depends on frontmatter.js:** `cmdTemplateFill` uses `reconstructFrontmatter` for template generation, creating a `scaffold.js -> frontmatter.js -> utils.js` dependency chain.

## Deviations from Plan

None - plan executed exactly as written. The schedule helper functions were an implicit part of the roadmap extraction (they are called by `cmdRoadmapAnalyze`) and naturally belong in the roadmap module.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `lib/roadmap.js` and `lib/scaffold.js` are available as dependencies for subsequent extractions
- Module dependency graph: `bin/grd-tools.js` -> `lib/{roadmap,scaffold,state,verify,frontmatter,utils}.js`
- Plans 03-05 through 03-07 can proceed with phase operations, tracker, and init command extraction
- `bin/grd-tools.js` at 3644 lines with 5 lib/ modules extracted

---
*Phase: 03-modularize-grd-tools*
*Completed: 2026-02-12*
