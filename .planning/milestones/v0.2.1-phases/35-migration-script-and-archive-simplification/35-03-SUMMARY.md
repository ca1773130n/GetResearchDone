---
phase: 35-migration-script-and-archive-simplification
plan: "03"
subsystem: cli
tags: [migration, cli-routing, integration-test]
dependency_graph:
  requires: [35-01, 35-02]
  provides: [migrate-dirs-cli-command]
  affects: [bin/grd-tools.js, tests/integration/cli.test.js]
tech_stack:
  added: []
  patterns: [cli-routing, integration-testing]
key_files:
  created: []
  modified:
    - bin/grd-tools.js
    - tests/integration/cli.test.js
decisions:
  - "Placed migrate-dirs case between scaffold and init cases in routeCommand switch"
  - "Added 3 integration tests: JSON output validation, --raw flag, idempotency"
metrics:
  duration: 5min
  completed: 2026-02-20
---

# Phase 35 Plan 03: Wire migrate-dirs CLI Command Summary

CLI router wiring for migrate-dirs command with integration tests, enabling `node bin/grd-tools.js migrate-dirs` end-to-end invocation and verifying all Phase 35 requirements.

## What Was Done

### Task 1: Wire migrate-dirs command into CLI router (e8562ae)
- Added `cmdMigrateDirs` to the destructured import from `lib/commands.js` in `bin/grd-tools.js`
- Added `case 'migrate-dirs': cmdMigrateDirs(cwd, raw); break;` in the `routeCommand` switch statement, placed between scaffold and init cases
- Added `migrate-dirs` to the CLI usage/help text string
- Verified the command runs correctly in both JSON and raw modes

### Task 2: Add integration tests and run full verification (0654124)
- Added 3 integration tests in `tests/integration/cli.test.js`:
  - `migrate-dirs command produces valid JSON with moved directories` -- creates old-style .planning/ layout, runs migrate-dirs, validates JSON output and file moves
  - `migrate-dirs --raw produces valid JSON` -- tests raw mode output
  - `migrate-dirs is idempotent on second run` -- runs migrate-dirs twice, verifies second run reports already_migrated
- Full test suite: 1,631 tests pass, zero regressions
- Lint: zero errors
- Format: passes on all modified files (pre-existing format issues in 3 other files from Plans 01/02)
- Phase 35 requirements verified:
  - REQ-61: migrate-dirs CLI command exists and runs
  - REQ-62: Idempotency tested (unit + integration)
  - REQ-63: Milestone detection tested (unit tests)
  - REQ-59: Simplified archive tested (unit tests)
  - REQ-60: Archive marker tested (unit tests)

## Verification Results

- **Level 1 (Sanity):** `node bin/grd-tools.js migrate-dirs` produces valid JSON output -- PASS
- **Level 2 (Proxy):** Full npm test suite (1,631 tests) passes with zero regressions -- PASS
- **Level 3 (Deferred):** Real-world migration on actual project with old-style layout (Phase 36 integration)

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire migrate-dirs command into CLI router | e8562ae | bin/grd-tools.js |
| 2 | Add integration test and run full verification | 0654124 | tests/integration/cli.test.js |

## Self-Check: PASSED
