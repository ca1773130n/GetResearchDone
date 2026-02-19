---
phase: 17-npm-distribution
plan: 01
subsystem: infra
tags: [npm, cli, postinstall, packaging]

requires:
  - phase: 16-mcp-server
    provides: MCP server entry point (bin/grd-mcp-server.js) referenced in bin entries
provides:
  - npm-publishable package.json with grd-tools name and bin entries
  - postinstall script for .planning/ directory bootstrapping
  - unit tests validating package config and postinstall behavior
affects: [17-02-evaluation, 18-integration]

tech-stack:
  added: []
  patterns:
    - "Idempotent postinstall with existsSync guard and silent exit"
    - "npm files whitelist for selective publishing"

key-files:
  created:
    - bin/postinstall.js
    - tests/unit/postinstall.test.js
  modified:
    - package.json

key-decisions:
  - "Package name 'grd-tools' for npm registry (avoiding reserved 'grd')"
  - "Idempotent postinstall: exit silently if .planning/ exists, never fail"
  - "Zero runtime dependencies maintained — only devDependencies for tooling"

patterns-established:
  - "Postinstall guard pattern: check top-level dir existence, skip entire setup if present"
  - "npm files whitelist: explicit include list over .npmignore for clarity"

duration: 2min
completed: 2026-02-16
---

# Phase 17 Plan 01: Package Configuration Summary

**npm-publishable package.json (grd-tools) with CLI bin entries, files whitelist, and idempotent postinstall bootstrapper creating .planning/ directory structure**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-16T07:44:36Z
- **Completed:** 2026-02-16T07:47:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Configured package.json for npm publishing: name=grd-tools, bin entries for grd-tools and grd-mcp-server, files whitelist, zero runtime dependencies
- Created idempotent postinstall script that bootstraps .planning/ directory structure with default config.json
- Added 21 unit tests covering package.json field validation and postinstall behavior (directory creation, config generation, idempotency, exit codes)

## Task Commits

Each task was committed atomically:

1. **Task 1: Configure package.json for npm publishing and create postinstall script** - `1bf2765` (feat)
2. **Task 2: Add unit tests for postinstall script and package.json validation** - `a652b31` (test)

## Files Created/Modified

- `package.json` - Updated with npm publishing configuration (name, bin, files, keywords, repository, postinstall)
- `bin/postinstall.js` - New idempotent postinstall script creating .planning/ directory structure
- `tests/unit/postinstall.test.js` - 21 unit tests for package.json validation and postinstall behavior

## Decisions Made

1. **Package name 'grd-tools'** - Changed from 'grd' to 'grd-tools' for npm registry publishing as specified in plan
2. **Idempotent postinstall** - Checks if .planning/ exists before doing anything; exits silently if already present; never fails (try/catch with exit 0)
3. **Zero runtime dependencies** - No dependencies field added; only devDependencies for jest/eslint/prettier

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- package.json is ready for npm publishing (after evaluation in 17-02)
- postinstall script verified with 21 tests
- `npm pack --dry-run` shows correct 83-file tarball (bin/, lib/, commands/, agents/, .claude-plugin/plugin.json)
- Ready for 17-02 evaluation plan execution

---
*Phase: 17-npm-distribution*
*Completed: 2026-02-16*
