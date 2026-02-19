---
phase: 15-deferred-validations
plan: 01
subsystem: testing
tags: [backend-detection, context-init, deferred-validation, integration-tests]

requires:
  - phase: 09-multi-backend-detection
    provides: "detectBackend waterfall, getBackendCapabilities, BACKEND_CAPABILITIES constant"
  - phase: 10-context-backend-integration
    provides: "Backend-aware cmdInit* functions with backend/backend_capabilities fields"
provides:
  - "Real-environment backend detection validation covering all 4 backends"
  - "Context init backward compatibility tests across all backends"
  - "Resolution of DEFER-09-01 and DEFER-10-01"
affects: [phase-15-deferred-validations, integration-testing]

tech-stack:
  added: []
  patterns:
    - "Real env var manipulation (save/restore process.env) for detection testing"
    - "Config override for backend switching in context init tests"
    - "Dynamic model cache clearing between tests (clearModelCache)"
    - "test.each matrix for backend x function cross-product"

key-files:
  created:
    - "tests/unit/backend-real-env.test.js"
    - "tests/unit/context-backend-compat.test.js"
  modified: []

key-decisions:
  - "Accepted dynamically detected OpenCode models in assertions instead of requiring exact DEFAULT_BACKEND_MODELS match"
  - "Used config override (not env vars) for backend switching in context tests to test highest-priority detection path"

patterns-established:
  - "clearModelCache() between tests to prevent dynamic detection cache interference"
  - "Output key shape regression testing: verify identical key sets across all backends"

duration: 4min
completed: 2026-02-16
---

# Phase 15 Plan 01: Backend Detection & Context Init Deferred Validation Summary

**89 tests validating backend detection accuracy and context init backward compatibility across all 4 backends, resolving DEFER-09-01 and DEFER-10-01**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T06:10:46Z
- **Completed:** 2026-02-16T06:15:24Z
- **Tasks:** 2 completed
- **Files created:** 2 (761 lines total)

## Accomplishments

- Created `backend-real-env.test.js` with 40 tests covering all 4 backends' real env var patterns, complete waterfall priority verification, filesystem clue isolation, edge cases, and capability cross-verification
- Created `context-backend-compat.test.js` with 49 tests covering all 14 cmdInit* functions under claude baseline, backend-per-function matrix for codex/gemini/opencode, model resolution verification, and output shape regression checks
- Resolved DEFER-09-01 (backend detection accuracy across real environments) and DEFER-10-01 (context init backward compatibility under all 4 backends)
- Full test suite passes: 1038 tests, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Real-environment backend detection validation (DEFER-09-01)** - `5b201ba` (test)
2. **Task 2: Context init backward compatibility under all backends (DEFER-10-01)** - `b1489f0` (test)

## Files Created/Modified

- `tests/unit/backend-real-env.test.js` - 40 tests: waterfall priority, all 4 backend env patterns, filesystem clues, edge cases, capability cross-verification
- `tests/unit/context-backend-compat.test.js` - 49 tests: all 14 cmdInit* under claude, representative sample under 3 other backends, model resolution, output shape regression

## Decisions Made

1. **Accepted dynamically detected OpenCode models** — OpenCode's `resolveModelInternal` calls `getCachedModels` which may return dynamically detected models from `opencode models` CLI. Tests verify model is not a raw Claude tier name rather than requiring exact DEFAULT_BACKEND_MODELS match. This is correct behavior per the dynamic model detection design.
2. **Config override for backend switching** — Used config.json backend field (highest-priority detection path) rather than env vars for context init tests, avoiding env var interference between parallel tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] OpenCode dynamic model detection returns non-default model names**
- **Found during:** Task 2 (context-backend-compat tests)
- **Issue:** Tests initially asserted that OpenCode model names must match DEFAULT_BACKEND_MODELS values, but the dynamic detection layer (`getCachedModels` -> `opencode models` CLI) returns different model names when the CLI is installed
- **Fix:** Changed assertions to verify models are NOT raw Claude tier names (opus/sonnet/haiku) instead of requiring exact default model match. Added `clearModelCache()` in beforeEach to prevent cache interference between tests.
- **Files modified:** tests/unit/context-backend-compat.test.js
- **Verification:** All 49 tests pass
- **Committed in:** b1489f0 (part of task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Minimal; assertion strategy refined to match actual system behavior

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- DEFER-09-01 and DEFER-10-01 resolved; ready for remaining Phase 15 plans
- Test count: 1038 total (89 new from this plan)
- Next plan: 15-02 (roadmap round-trip integrity or auto-cleanup non-interference)

## Self-Check: PASSED

- [x] tests/unit/backend-real-env.test.js exists (361 lines, min 80)
- [x] tests/unit/context-backend-compat.test.js exists (400 lines, min 100)
- [x] 15-01-SUMMARY.md exists
- [x] Commit 5b201ba exists
- [x] Commit b1489f0 exists

---
*Phase: 15-deferred-validations*
*Completed: 2026-02-16*
