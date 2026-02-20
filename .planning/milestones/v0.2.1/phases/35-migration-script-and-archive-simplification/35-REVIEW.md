---
phase: 35-migration-script-and-archive-simplification
wave: "all"
plans_reviewed: [35-01, 35-02, 35-03]
timestamp: 2026-02-20T08:30:00Z
blockers: 0
warnings: 2
info: 4
verdict: warnings_only
---

# Code Review: Phase 35 (All Plans)

## Verdict: WARNINGS ONLY

Phase 35 delivers all planned functionality with no blockers. The `cmdMigrateDirs` function, simplified `cmdMilestoneComplete` archive logic, and CLI wiring are implemented correctly, with comprehensive TDD test coverage and zero regressions. Two warnings noted for cross-plan commit attribution and minor raw output semantics.

## Stage 1: Spec Compliance

### Plan Alignment

**Plan 35-01 (cmdMigrateDirs implementation):**
All tasks executed as specified. Commit `bf517ee` contains 10 TDD tests (RED phase), and commit `9264842` contains the `cmdMigrateDirs` implementation (GREEN phase). The SUMMARY reports "plan executed exactly as written" with no deviations. Verified: `cmdMigrateDirs` is exported from `lib/commands.js` (line 2810), uses `currentMilestone(cwd)` from `lib/paths.js` (line 2675), routes `quick/` to `anonymous` (line 2685), and implements merge-without-overwrite logic (line 2734). All 10 test cases match the plan's specification exactly.

**Plan 35-02 (cmdMilestoneComplete simplification):**
Both tasks executed. However, the 35-02 SUMMARY documents a deviation: Task 1's test cases were committed in `bf517ee` (a 35-01 commit) rather than in a separate 35-02 commit. This occurred because both plans were executed in parallel worktrees and the 35-01 executor included `tests/unit/phase.test.js` changes meant for 35-02. The implementation commit `efb3fdd` correctly adds the conditional archive logic (line 783-856 of `lib/phase.js`) and `archived.json` marker (lines 881-894). The `phases_already_in_place` field is present in the result (line 930).

**Plan 35-03 (CLI wiring):**
Both tasks executed as specified. Commit `e8562ae` adds the CLI routing (line 454-456 of `bin/grd-tools.js`), the import (line 108), and the help text (line 127). Commit `0654124` adds 3 integration tests. The SUMMARY reports no deviations.

### Research Methodology

N/A -- no research references in plans. This is a pure infrastructure phase.

### Known Pitfalls

N/A -- KNOWHOW.md does not exist in this project.

### Eval Coverage

The EVAL plan (35-EVAL.md) defines 6 sanity checks, 5 proxy metrics, and 2 deferred validations. All sanity and proxy checks are exercisable against the current implementation:

- S1 (cmdMigrateDirs export): Verified at `lib/commands.js` line 2810.
- S2 (migrate-dirs in help): Verified at `bin/grd-tools.js` line 127.
- S3 (JSON output): cmdMigrateDirs calls `output()` with valid JSON (line 2778).
- S4 (archived.json): Written at `lib/phase.js` line 884-894.
- S5/S6 (lint/format): Reported passing in 35-03-SUMMARY.
- P1-P5: All proxy test suites exist in the expected locations.

Deferred validations (DEFER-35-01, DEFER-35-02) are properly documented as Phase 36 targets. No issues found.

## Stage 2: Code Quality

### Architecture

The implementation follows existing project patterns consistently:

- `cmdMigrateDirs` follows the standard `cmd*(cwd, raw)` function signature used by all other command functions in `lib/commands.js`.
- Uses the shared `output(result, raw, rawValue)` utility from `lib/utils.js` (line 2778).
- Imports from `lib/paths.js` use the aliased destructuring pattern already established in the file (lines 47-51).
- The switch case in `bin/grd-tools.js` follows the existing pattern exactly (line 454-456).
- Test files use `captureOutput`, `parseFirstJson`, and temp directory patterns consistent with other test blocks in the same files.
- The `phasesAlreadyInPlace` check in `lib/phase.js` uses `fs.existsSync` + `fs.readdirSync` with `withFileTypes`, consistent with similar checks elsewhere in the function.

No duplicate implementations or conflicting patterns introduced.

### Reproducibility

N/A -- no experimental code. This is deterministic infrastructure (filesystem operations).

### Documentation

Implementation code includes inline comments explaining key decisions:
- Migration map routing logic (line 2678-2686).
- Merge-without-overwrite intent (line 2733).
- Idempotency check (line 2767-2768).
- REQ-59 and REQ-60 references in `lib/phase.js` (lines 835-836, 881).
- JSDoc on `cmdMigrateDirs` (lines 2667-2673).

Adequate for an infrastructure module.

### Deviation Documentation

**35-01-SUMMARY.md:** Claims no deviations, confirmed accurate. Commits `bf517ee` and `9264842` match the claimed file modifications (`tests/unit/commands.test.js` and `lib/commands.js`). However, `bf517ee` also includes `tests/unit/phase.test.js` which is not listed in 35-01 PLAN's `files_modified` or 35-01 SUMMARY's `key-files.modified`.

**35-02-SUMMARY.md:** Properly documents the cross-plan commit attribution issue under "Auto-fixed Issues." Lists `lib/phase.js` and `tests/unit/phase.test.js` as modified files, which matches `efb3fdd` (phase.js) and `bf517ee` (phase.test.js).

**35-03-SUMMARY.md:** Claims no deviations, confirmed accurate. Files modified match exactly: `bin/grd-tools.js` (e8562ae) and `tests/integration/cli.test.js` (0654124).

**Full file comparison:**
- Git diff (`bf517ee^..fc82d67`): `lib/commands.js`, `lib/phase.js`, `bin/grd-tools.js`, `tests/unit/commands.test.js`, `tests/unit/phase.test.js`, `tests/integration/cli.test.js`, plus 3 SUMMARY.md files and STATE.md.
- Combined PLAN `files_modified`: `lib/commands.js`, `lib/phase.js`, `bin/grd-tools.js`, `tests/unit/commands.test.js`, `tests/unit/phase.test.js`, `tests/integration/cli.test.js`.
- All source files accounted for. SUMMARY and STATE updates are expected phase artifacts.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 1 | Plan Alignment | Plan 35-01 commit bf517ee includes tests/unit/phase.test.js (3 tests for Plan 02) that are not in Plan 01's files_modified list. Cross-plan test leakage due to parallel worktree execution. |
| 2 | WARNING | 2 | Deviation Documentation | 35-01-SUMMARY.md key-files.modified lists only lib/commands.js and tests/unit/commands.test.js, but commit bf517ee also modified tests/unit/phase.test.js. The deviation is documented in 35-02-SUMMARY but not in 35-01-SUMMARY. |
| 3 | INFO | 1 | Plan Alignment | The --raw mode for cmdMigrateDirs outputs compact JSON (JSON.stringify without indentation) rather than a human-readable text format. This is functionally correct and consistent with other commands in the codebase, but the Plan 35-03 success criteria describes it as "raw text output" which could be interpreted differently. |
| 4 | INFO | 2 | Architecture | The `output(result, raw, JSON.stringify(result))` call at lib/commands.js line 2778 passes the same data in both modes (pretty vs compact JSON). Some other commands provide distinct raw output (e.g., a plain string). For a migration command, JSON in both modes is reasonable since the output is structured. |
| 5 | INFO | 2 | Code Quality | Empty catch blocks at lib/phase.js lines 788 and 829 silently swallow errors during phasesAlreadyInPlace detection and stat gathering. These follow the existing pattern in the function (pre-existing empty catch at line 853) and are documented as "non-blocking," but could mask filesystem permission errors in production. |
| 6 | INFO | 1 | Eval Coverage | Integration test coverage for --raw mode (test at cli.test.js line 1354) verifies JSON output is valid but does not compare output format difference between --raw and non-raw modes. The EVAL plan notes this as a blind spot. |

## Recommendations

**For WARNING #1 and #2 (Cross-plan test leakage):**
When executing plans in parallel worktrees that modify overlapping test files, either (a) scope each plan's commit strictly to its own files_modified, committing shared test files in a separate coordination commit, or (b) update both SUMMARY files to acknowledge the shared commit. In this case, 35-02-SUMMARY correctly documents it; 35-01-SUMMARY should add a note that bf517ee also includes phase.test.js changes for Plan 02. This is a process improvement for future parallel executions, not a code fix.

