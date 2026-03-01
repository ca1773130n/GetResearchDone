---
phase: 59-foundation-layer-shared-types
plan: 03
subsystem: infra
tags: [typescript, migration, utils, type-safety, strict-mode, foundation-layer]

requires:
  - phase: 59-01
    provides: "lib/types.ts shared interfaces (GrdConfig, ExecGitResult, PhaseInfo, MilestoneInfo, RunCache, AgentModelProfiles), lib/paths.ts migration pattern, CommonJS proxy pattern"
  - phase: 59-02
    provides: "lib/backend.ts fully typed (detectBackend, resolveBackendModel), proxy pattern validation"
provides:
  - "lib/utils.ts fully typed under strict:true with 40+ exported functions and 7 typed constants"
  - "Foundation layer migration complete: types.ts + paths.ts + backend.ts + utils.ts all typed and tested"
  - "CommonJS proxy pattern for utils (utils.js re-exports utils.ts)"
affects: [60-data-domain-layer, 61-integration-autonomous-layer, 62-oversized-module-decomposition, 65-integration-validation]

tech-stack:
  added: []
  patterns: ["large-module-migration (1263-line utils.js -> typed utils.ts)", "Record<string, unknown> for JSON config parsing", "typed-error-handling (err as { status?: number; stdout?: Buffer | string })", "never-return-type for process.exit functions"]

key-files:
  created: [lib/utils.ts]
  modified: [lib/utils.js, jest.config.js]

key-decisions:
  - "Kept utils.js as thin CommonJS proxy instead of deleting -- consistent with paths.js and backend.js pattern, required for runtime CJS resolution (DEFER-59-01)"
  - "Used Record<string, unknown> with explicit type casts for parsed config JSON -- avoids any while maintaining type safety"
  - "Used typed error destructuring (err as { status?: number; stdout?: Buffer | string }) in execGit catch block instead of any"
  - "Used never return type for output() and error() functions that call process.exit()"
  - "Used Map<string, unknown> for RunCache internal storage -- matches RunCache interface from types.ts"

patterns-established:
  - "Large module migration: 1,263-line utils.js migrated 1:1 with zero logic changes and full type coverage"
  - "Foundation layer completion: all 4 foundation modules (types, paths, backend, utils) now fully typed"

duration: 20min
completed: 2026-03-02
---

# Phase 59 Plan 03: Utils Types Migration Summary

**lib/utils.ts fully typed under strict:true with zero any types -- 40+ exported functions, 7 typed constants (GIT_ALLOWED_COMMANDS, GIT_BLOCKED_COMMANDS, GIT_BLOCKED_FLAGS, MODEL_PROFILES, CODE_EXTENSIONS, KNOWN_CONFIG_KEYS, _phaseCache) using shared interfaces from lib/types.ts, completing the Phase 59 foundation layer migration with all 2,674 non-pre-existing tests passing**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-01T18:05:45Z
- **Completed:** 2026-03-01T18:25:45Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Migrated lib/utils.js (1,263 lines, 50+ exports) to TypeScript with full type annotations under strict:true
- All constants typed: Sets, Maps, AgentModelProfiles record, GrdConfig defaults
- All function signatures explicitly typed: input parameters, return types, error handling
- Zero any types across entire foundation layer (types.ts, paths.ts, backend.ts, utils.ts)
- jest.config.js coverage threshold updated from utils.js to utils.ts with identical thresholds (lines:92, functions:95, branches:85)
- Full test suite (2,676 tests) passes with 2,674 passing (2 pre-existing npm-pack failures from DEFER-59-01)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate lib/utils.js to lib/utils.ts** - `1f97471` (feat)
2. **Task 2: Update jest.config.js and run full validation** - `3b38e21` (chore)

## Files Created/Modified

- `lib/utils.ts` - Full TypeScript migration of shared utilities (40+ typed functions, 7 typed constants)
- `lib/utils.js` - Converted to thin CommonJS re-export proxy (same pattern as paths.js, backend.js)
- `jest.config.js` - Coverage threshold entry updated from `./lib/utils.js` to `./lib/utils.ts`

## Decisions Made

1. **Kept utils.js as CommonJS proxy** -- Integration tests that spawn `node bin/grd-tools.js` require runtime CJS resolution. Deleting utils.js breaks 190 integration tests. Consistent with paths.js and backend.js proxy pattern. Runtime TS resolution deferred to Phase 65 (DEFER-59-01).

2. **Record<string, unknown> for parsed config JSON** -- loadConfig() parses JSON and accesses nested fields. Using `Record<string, unknown>` with explicit type casts (e.g., `as ModelProfileName`, `as boolean`) provides type safety without any. Each field access includes proper null/undefined checks.

3. **Typed error destructuring in execGit** -- Git command errors do not follow the standard Error interface. Used `err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string }` to safely access non-standard properties from child_process errors.

4. **never return type for output/error** -- Both functions call process.exit() and never return. The `never` type communicates this to downstream callers and TypeScript's control flow analysis.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kept utils.js as proxy instead of deleting**
- **Found during:** Task 1
- **Issue:** Plan specified deleting lib/utils.js, but integration tests (190 tests across 6 suites) spawn `node bin/grd-tools.js` which uses Node's native require('./utils'). Without utils.js, Node resolves nothing and all integration tests fail.
- **Fix:** Converted utils.js to thin CommonJS proxy (module.exports = require('./utils.ts')) matching the established pattern from paths.js and backend.js
- **Files modified:** lib/utils.js
- **Verification:** Integration tests pass (84/84 non-npm-pack tests), unit tests pass (139/139)
- **Committed in:** 1f97471 (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking issue)
**Impact on plan:** Minimal -- same proxy pattern already used by paths.js and backend.js from Plans 01 and 02. Runtime TS resolution tracked as DEFER-59-01 for Phase 65.

## Issues Encountered

- **Pre-existing npm-pack test failures (2 tests):** The npm-pack integration tests fail because Node.js v24 does not support TypeScript type stripping for files inside `node_modules`. This is a pre-existing issue from Plan 02 (backend.ts migration) and not a regression. Confirmed by running the same tests before applying any changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Foundation layer complete:** All four foundation modules (types.ts, paths.ts, backend.ts, utils.ts) are fully typed under strict:true with zero any types
- **Ready for Phase 60:** Data & Domain Layer Migration can proceed -- all foundation imports are typed
- **DEFER-59-01:** CommonJS interop validation deferred to Phase 65 (runtime TS resolution strategy)
- **Pre-existing issue:** npm-pack integration tests need fix in Phase 65 when runtime strategy is established

---
*Phase: 59-foundation-layer-shared-types*
*Completed: 2026-03-02*
