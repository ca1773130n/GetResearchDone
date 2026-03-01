---
phase: 59-foundation-layer-shared-types
plan: 01
subsystem: infra
tags: [typescript, types, paths, migration, strict-mode]

requires:
  - phase: 58-typescript-toolchain-build-pipeline
    provides: "TypeScript 5.9.3, tsconfig.json with strict:true, ts-jest, eslint TypeScript support"
provides:
  - "lib/types.ts -- 18 shared TypeScript interfaces/types for Backend, Config, Phase, State, Utility domains"
  - "lib/paths.ts -- fully typed path resolution module (11 exported functions, strict:true, zero any)"
  - "CommonJS re-export proxy pattern for JS-to-TS migration compatibility"
affects: [60-data-domain-layer, 61-integration-autonomous-layer, 62-oversized-module-decomposition, 65-integration-validation]

tech-stack:
  added: []
  patterns: [import-type-for-node-builtins, commonjs-proxy-reexport, type-only-module-pattern]

key-files:
  created:
    - lib/types.ts
    - lib/paths.ts
  modified:
    - lib/paths.js
    - jest.config.js

key-decisions:
  - "Kept paths.js as thin CommonJS proxy instead of deleting -- Node.js CJS require() needs .js for extensionless resolution"
  - "Used import type { Dirent } from 'fs' for Node built-in type imports in TS files using CommonJS require()"
  - "Pure type-only module pattern: module.exports = {} + export type for dual JS/TS compatibility"

patterns-established:
  - "Type-only module: lib/types.ts exports only types via export type/interface, module.exports = {} for CJS compat"
  - "CommonJS proxy: paths.js re-exports from paths.ts via require('./paths.ts') for runtime resolution"
  - "import type for Node built-in types when using require() for runtime imports"

duration: 22min
completed: 2026-03-02
---

# Phase 59 Plan 01: Core Shared Types & Paths Migration Summary

**Created lib/types.ts with 18 shared TypeScript interfaces and migrated lib/paths.js to lib/paths.ts under strict:true with zero any types, proving the JS-to-TS migration pattern on the first foundation module.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-01T17:25:00Z
- **Completed:** 2026-03-01T17:47:36Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- Created lib/types.ts with 18 exported interfaces/types covering BackendId, ModelTier, ModelProfileName, ModelTierMap, BackendCapabilities, WebMcpResult, GrdTimeouts, CeremonyConfig, GrdConfig, PhaseInfo, MilestoneInfo, StateFields, RoadmapPhase, FrontmatterObject, McpToolDescriptor, ExecGitResult, RunCache, AgentModelProfiles
- Migrated lib/paths.js (306 lines) to lib/paths.ts with full type annotations on all 14 functions (11 exported, 3 internal), strict:true compliance, and zero any types
- Established CommonJS proxy pattern: paths.js re-exports from paths.ts via `require('./paths.ts')`, ensuring all 10+ downstream JS consumers continue to resolve `require('./paths')` correctly
- All 2,674 of 2,676 tests pass (2 npm-pack failures are expected DEFER-59-01 -- Node.js disables TS stripping in node_modules)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create lib/types.ts with core shared type definitions** - `ca4ccf1` (feat)
2. **Task 2: Migrate lib/paths.js to lib/paths.ts with full type annotations** - `dad462a` (feat)

## Files Created/Modified

- `lib/types.ts` - 18 shared TypeScript interfaces/types, pure type-only module (243 lines)
- `lib/paths.ts` - Fully typed path resolution with 11 exported functions (263 lines)
- `lib/paths.js` - Converted from 306-line implementation to thin 17-line CommonJS proxy
- `jest.config.js` - Coverage threshold updated from `./lib/paths.js` to `./lib/paths.ts`

## Decisions Made

1. **Kept paths.js as proxy** - The plan specified deleting paths.js, but Node.js CJS `require('./paths')` resolves `.js` before `.ts`. Without the proxy, all 10+ downstream consumers and integration tests would fail. The proxy pattern (`module.exports = require('./paths.ts')`) works because Node 24 supports TypeScript type stripping for explicit `.ts` requires. This proxy will be removed in Phase 65 when a runtime TS resolution strategy is established.

2. **import type for Node built-ins** - Used `import type { Dirent } from 'fs'` rather than `fs.Dirent` namespace access, since `const fs = require('fs')` doesn't carry TypeScript namespace types. The type-only import is stripped at runtime.

3. **Pure type module pattern** - lib/types.ts uses `module.exports = {}` (empty object) + `export type`/`export interface` so both `require('./types')` (returns `{}`) and `import type { ... } from './types'` work correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kept paths.js as CommonJS re-export proxy instead of deleting**
- **Found during:** Task 2 (paths migration)
- **Issue:** The plan specified "lib/paths.js is deleted after migration" but Node.js CJS `require('./paths')` resolves `.js` files by priority. Without a .js file, all 10+ downstream consumers, integration tests, and CLI invocations fail with `Cannot find module './paths'`.
- **Fix:** Converted paths.js from 306-line implementation to 17-line proxy: `module.exports = require('./paths.ts')`. Works because Node 24 has built-in TypeScript type stripping for explicit .ts requires.
- **Files modified:** lib/paths.js
- **Verification:** All 173 CLI integration tests pass, all 51 paths unit tests pass, 2674/2676 total tests pass
- **Committed in:** dad462a (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking)
**Impact on plan:** Minimal. The canonical implementation is in paths.ts as specified. The proxy is a temporary compatibility shim tracked by DEFER-59-01, to be removed in Phase 65.

## Issues Encountered

- 2 npm-pack integration tests fail because Node.js disables TypeScript type stripping inside `node_modules/` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). This is the exact scenario DEFER-59-01 covers: distributing GRD as an npm package requires a pre-compilation step (Phase 65).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- lib/types.ts provides the type foundation for all subsequent module migrations (Plans 02 and 03)
- The paths.ts migration proves the JS-to-TS conversion pattern: add type annotations, keep module.exports, use CommonJS proxy for runtime resolution
- Plan 02 (backend.js migration) and Plan 03 (utils.js migration) can proceed, importing from types.ts
- DEFER-59-01 remains pending: Phase 65 must establish runtime TS resolution for npm package distribution

---
*Phase: 59-foundation-layer-shared-types*
*Completed: 2026-03-02*
