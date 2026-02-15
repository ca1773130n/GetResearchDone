---
phase: 03-modularize-grd-tools
plan: 06
subsystem: cli
tags: [nodejs, modularization, tracker, context, init-workflows]

dependency-graph:
  requires:
    - phase: 03-05
      provides: "lib/phase.js with phase lifecycle operations"
    - phase: 03-03
      provides: "lib/state.js for state operations used by context init"
    - phase: 03-04
      provides: "lib/roadmap.js with schedule helpers used by tracker"
  provides:
    - "lib/tracker.js with all issue tracker integration (GitHub/Jira sync, mapping, schedule)"
    - "lib/context.js with all 13 init workflow context loading functions"
    - "bin/grd-tools.js reduced to 1300 lines (CLI router + misc commands only)"
  affects: [04-test-suite, 06-code-style]

tech-stack:
  added: []
  patterns:
    - "Downstream module extraction: tracker imports from utils, frontmatter, roadmap"
    - "Context module imports from utils only (leaf dependency pattern)"

key-files:
  created:
    - "lib/tracker.js"
    - "lib/context.js"
  modified:
    - "bin/grd-tools.js"

key-decisions:
  - "Keep cmdTracker as single 530-line switch statement: natural unit, splitting would be worse"
  - "Accept tracker.js at 843 lines: exceeds 500-line target but cohesive module"
  - "Accept context.js at 753 lines: 13 independent init functions, splitting would fragment namespace"
  - "Clean up unused imports from bin/grd-tools.js after extraction"
  - "Remove unused execFileSync import from bin/grd-tools.js (now only in lib/tracker.js)"

patterns-established:
  - "Downstream extraction pattern: move functions that depend on multiple lib/ modules last"
  - "Import cleanup: remove unused destructured imports after module extraction"

duration: 11min
completed: 2026-02-12
---

# Phase 3 Plan 6: Extract Tracker and Context Modules Summary

**Extracted lib/tracker.js (843 lines, 6 exports) and lib/context.js (753 lines, 13 exports), reducing bin/grd-tools.js to 1300 lines -- a CLI router with only standalone utility commands remaining.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-12T00:06:37Z
- **Completed:** 2026-02-12T00:17Z
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments

- Extracted all issue tracker integration (GitHub sync, Jira/MCP prepare/record, mapping, schedule) into lib/tracker.js
- Extracted all 13 init workflow context loading functions into lib/context.js
- Reduced bin/grd-tools.js from 2812 to 1300 lines (54% reduction in this plan alone)
- Cleaned up unused imports (execFileSync, findCodeFiles, resolveModelInternal, findPhaseInternal, pathExistsInternal, generateSlugInternal, resolveModelForAgent)
- All commands produce identical JSON output to pre-extraction golden references

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract lib/tracker.js with all tracker operations** - `7c22dbe` (feat)
2. **Task 2: Extract lib/context.js with all init workflow functions** - `8ac8028` (feat)

## Files Created/Modified

- `lib/tracker.js` - Issue tracker integration: config loading, mapping CRUD, GitHub sync, cmdTracker dispatcher (843 lines, 6 exports)
- `lib/context.js` - Init workflow context loading for all 20 CLI workflows (753 lines, 13 exports)
- `bin/grd-tools.js` - CLI router with standalone utility commands only (1300 lines, down from 2812)

## Module Size Summary (Post-Extraction)

| Module | Lines | Exports |
|--------|-------|---------|
| lib/utils.js | 404 | 20 |
| lib/frontmatter.js | 350 | 8 |
| lib/state.js | 579 | 13 |
| lib/roadmap.js | 403 | 8 |
| lib/scaffold.js | 305 | 3 |
| lib/verify.js | 355 | 7 |
| lib/phase.js | 880 | 7 |
| lib/tracker.js | 843 | 6 |
| lib/context.js | 753 | 13 |
| bin/grd-tools.js | 1300 | (CLI router) |

## Decisions Made

1. **Keep cmdTracker as single function** - The 530-line switch statement handling 15 subcommands is a natural dispatch unit. Splitting it across files would make the tracker harder to understand, not easier.
2. **Accept tracker.js at 843 lines** - Exceeds the 500-line soft target but all functions are cohesive (config, mapping, GitHub API, command dispatch). Phase 4 tests can drive internal refactoring if needed.
3. **Accept context.js at 753 lines** - 13 independent init functions with no internal dependencies. Splitting into core/ops would fragment the init namespace without benefit.
4. **Clean up unused imports** - After extraction, 7 destructured imports in bin/grd-tools.js became unused. Removed to keep the import section accurate.
5. **Remove execFileSync import from monolith** - Only needed in lib/tracker.js for gh CLI calls. Removed from bin/grd-tools.js to prevent accidental use.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Cleanup] Removed unused imports from bin/grd-tools.js**
- **Found during:** Task 2 (context extraction)
- **Issue:** After extracting init functions, 7 imports (findCodeFiles, resolveModelInternal, findPhaseInternal, pathExistsInternal, generateSlugInternal, resolveModelForAgent, execFileSync) were no longer used directly
- **Fix:** Removed unused destructured imports from the require('../lib/utils') statement
- **Files modified:** bin/grd-tools.js
- **Verification:** All commands still produce valid JSON; no require errors
- **Committed in:** 8ac8028 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - cleanup)
**Impact on plan:** Positive -- cleaner import surface in the monolith

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- bin/grd-tools.js is now 1300 lines -- a pure CLI router with standalone utility commands
- All business logic lives in 9 lib/ modules (utils, frontmatter, state, roadmap, scaffold, verify, phase, tracker, context)
- Plan 07 (final cleanup) can remove any remaining dead code and verify the module dependency graph
- Phase 4 (test suite) has clean module boundaries to test against

---
*Phase: 03-modularize-grd-tools*
*Completed: 2026-02-12*
