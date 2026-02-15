---
phase: 07-validation-release
plan: 01
subsystem: cli-validation
tags: [validation, input-sanitization, security, testing]
dependency_graph:
  requires: [lib/utils.js, bin/grd-tools.js]
  provides: [validatePhaseArg, validateFileArg, validateSubcommand, validateRequiredArg]
  affects: [all CLI entry points]
tech_stack:
  added: []
  patterns: [try/catch validation at router boundary, shared validation helpers]
key_files:
  created: [tests/unit/validation.test.js]
  modified: [bin/grd-tools.js, lib/utils.js, tests/integration/cli.test.js]
decisions:
  - Extracted routeCommand function with try/catch to convert validation errors to clean stderr+exit(1)
  - Used validateSubcommand for all subcommand dispatchers including init workflows (changing "Unknown init workflow" to "Unknown init subcommand" for consistency)
  - State command without subcommand defaults to load (preserving existing behavior)
  - Phase add argument is a description string, not validated with validatePhaseArg
  - Milestone complete version arg not validated with validatePhaseArg (different format)
metrics:
  duration: 6min
  completed: 2026-02-15
---

# Phase 07 Plan 01: Input Validation Layer Summary

Four CLI argument validation helpers added to lib/utils.js (validatePhaseArg, validateFileArg, validateSubcommand, validateRequiredArg) and wired into all CLI entry points in bin/grd-tools.js, with 51 comprehensive unit and integration tests covering positive and negative cases.

## What Was Done

### Task 1: Add validation helpers and wire into CLI router
- Added 4 new validation functions to `lib/utils.js`:
  - `validatePhaseArg(phase)` -- validates phase number format (digits, optional decimal, optional kebab suffix)
  - `validateFileArg(filePath, cwd)` -- validates file path existence and delegates to validateFilePath for traversal checks
  - `validateSubcommand(sub, validSubs, parentCmd)` -- validates subcommand against known list with clear error messages
  - `validateRequiredArg(value, argName)` -- validates required positional arguments are not null/undefined/empty
- Refactored `bin/grd-tools.js` to extract `routeCommand()` function with try/catch boundary that converts thrown validation errors into clean `stderr + exit(1)` output
- Wired phase number validation into: `roadmap get-phase`, `phase insert/remove/complete/next-decimal`, `init execute-phase/plan-phase/verify-work/phase-op`, `phase-plan-index`, `phase-detail`
- Wired file path validation into: `verify-summary`, `frontmatter` (all subcommands), `verify` (non-commits subcommands), `summary-extract`
- Wired git ref validation into: `verify commits` (validates each ref argument)
- Wired subcommand validation into: `state`, `template`, `frontmatter`, `verify`, `phases`, `roadmap`, `phase`, `milestone`, `validate`, `todo`, `init`, `tracker`
- Updated integration test for consistent "Unknown init subcommand" message format
- Commit: 122ca9b

### Task 2: Add validation unit tests
- Created `tests/unit/validation.test.js` with 51 tests:
  - 20 validatePhaseArg tests (11 valid, 3 missing, 6 invalid)
  - 9 validateFileArg tests (3 valid, 3 missing, 2 traversal, 1 null byte)
  - 10 validateSubcommand tests (3 valid, 2 invalid, 3 missing, 2 different parent)
  - 6 validateRequiredArg tests (3 valid, 3 missing)
  - 6 CLI integration tests via child_process (phase-detail, state, frontmatter, verify commits, init, phase-plan-index)
- All 594 tests pass (543 existing + 51 new)
- utils.js coverage improved: lines 91.56%, functions 97.14%, branches 74.74%
- Commit: b0daae6

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated integration test for consistent error message format**
- **Found during:** Task 1
- **Issue:** Existing integration test expected "Unknown init workflow" but new validateSubcommand produces "Unknown init subcommand" for consistency
- **Fix:** Updated test expectation in tests/integration/cli.test.js
- **Files modified:** tests/integration/cli.test.js
- **Commit:** 122ca9b

## Verification Results

### Level 1 (Sanity)
- bin/grd-tools.js imports validatePhaseArg, validateFileArg, validateSubcommand, validateGitRef from lib/utils.js: PASS
- tests/unit/validation.test.js exists and contains 51 test cases: PASS
- npm run lint exits 0: PASS
- npm run format:check exits 0: PASS

### Level 2 (Proxy)
- CLI rejects invalid phase numbers: `node bin/grd-tools.js phase-detail abc` -> "Invalid phase number": PASS
- CLI rejects path traversal: `node bin/grd-tools.js frontmatter get ../../etc/passwd` -> "escape project": PASS
- CLI rejects unknown subcommands: `node bin/grd-tools.js state invalidcmd` -> "Unknown state subcommand" with list: PASS
- CLI rejects flag injection: `node bin/grd-tools.js verify commits -flag` -> "must not start with a dash": PASS
- All 594 tests pass (543 existing + 51 new, no regressions): PASS
- Coverage thresholds met for all modules: PASS

## Self-Check: PASSED

- [x] bin/grd-tools.js exists and contains validation imports
- [x] lib/utils.js exists and exports 4 new validation functions
- [x] tests/unit/validation.test.js exists with 51 tests
- [x] Commit 122ca9b exists (Task 1)
- [x] Commit b0daae6 exists (Task 2)
- [x] npm test exits 0 with 594 tests passing
- [x] npm run lint exits 0
