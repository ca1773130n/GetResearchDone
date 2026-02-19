---
phase: 17-npm-distribution
plan: 02
subsystem: cli
tags: [setup, plugin, cli, npm]

requires:
  - phase: 16
    provides: MCP server and plugin.json
provides:
  - "grd-tools setup CLI command for plugin registration"
  - "cmdSetup function in lib/commands.js"
  - "14 unit tests for setup command"
affects: [18-integration, npm-distribution]

tech-stack:
  added: []
  patterns:
    - "Package root resolved from __dirname (module-relative, not cwd-relative)"

key-files:
  created:
    - tests/unit/setup.test.js
  modified:
    - lib/commands.js
    - bin/grd-tools.js

key-decisions:
  - "Resolve package root from __dirname (not cwd): ensures correct path regardless of where user runs the command"
  - "Plugin directory path (not plugin.json) in user instructions: matches Claude Code plugin_path convention"

patterns-established:
  - "Setup command pattern: locate package root via module path, verify critical file exists, output configuration"

duration: 3min
completed: 2026-02-16
---

# Phase 17 Plan 2: Setup Command Summary

**`grd-tools setup` CLI command that resolves the installed package root, verifies .claude-plugin/plugin.json, and outputs plugin configuration paths in both JSON and human-readable formats**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T07:44:30Z
- **Completed:** 2026-02-16T07:47:13Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Implemented cmdSetup function with package root resolution via `path.resolve(__dirname, '..')` for reliable path regardless of cwd
- Wired `setup` as top-level CLI command in bin/grd-tools.js router with updated usage string
- Created 14 unit tests covering JSON output, raw output, idempotency, and error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement cmdSetup and wire CLI router** - `04e217d` (feat)
2. **Task 2: Add unit tests for setup command** - `ffd39cd` (test)

## Files Created/Modified
- `lib/commands.js` - Added cmdSetup function and export
- `bin/grd-tools.js` - Added cmdSetup import, switch case, and usage string
- `tests/unit/setup.test.js` - 14 unit tests for setup command

## Decisions Made
- **Resolve package root from __dirname:** The setup command uses `path.resolve(__dirname, '..')` to find the package root from lib/commands.js, not the user's cwd. This ensures correct behavior after `npm install -g`.
- **Plugin directory path in instructions:** User instructions reference the `.claude-plugin` directory path (not the plugin.json file), matching Claude Code's plugin_path configuration convention.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Phase 17 complete (both plans executed). Ready for Phase 18 integration testing.

## Self-Check

Verifying claims:
- `tests/unit/setup.test.js` exists: VERIFIED
- `lib/commands.js` contains cmdSetup: VERIFIED
- `bin/grd-tools.js` routes setup command: VERIFIED
- Commit 04e217d exists: VERIFIED
- Commit ffd39cd exists: VERIFIED
- 14 tests pass: VERIFIED
- 1243 total tests pass (no regressions): VERIFIED

## Self-Check: PASSED

---
*Phase: 17-npm-distribution*
*Completed: 2026-02-16*
