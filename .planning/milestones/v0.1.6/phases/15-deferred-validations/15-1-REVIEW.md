---
phase: 15-deferred-validations
wave: 1
plans_reviewed: [15-01, 15-02, 15-03]
timestamp: 2026-02-16T07:30:00Z
blockers: 0
warnings: 2
info: 5
verdict: warnings_only
---

# Code Review: Phase 15, Wave 1

## Verdict: WARNINGS ONLY

All three plans executed successfully with 137 new tests (40 + 49 + 28 + 20), resolving four deferred validation items (DEFER-09-01, DEFER-10-01, DEFER-11-01, DEFER-13-01). Full suite passes at 1038 tests with zero failures. Two minor warnings identified; neither blocks progress.

## Stage 1: Spec Compliance

### Plan Alignment

**Plan 15-01 (Backend Detection + Context Init)**
- Task 1 (DEFER-09-01): PLAN requires 15+ tests. SUMMARY claims 40. Verified by Jest: 40 tests pass. All plan-specified areas covered: waterfall priority (8 tests), all 4 backend env patterns (10 tests), edge cases (8 tests), filesystem clues (7 tests), capability cross-verification (7 tests, including `test.each` generating 4). Commit `5b201ba` matches.
- Task 2 (DEFER-10-01): PLAN requires 20+ tests. SUMMARY claims 49. Verified by Jest: 49 tests pass. All 14 cmdInit* functions tested under claude baseline (14 tests), claude model regression checks (3 tests), backend-per-function matrix with 3 non-claude backends x 5 representative functions (15 tests), all 14 functions under codex (14 tests via `test.each`), output shape regression (3 tests). Commit `b1489f0` matches.
- 1 documented deviation (OpenCode dynamic model detection): properly documented in SUMMARY with rationale. Fix is sound -- asserting "not a raw tier name" is more correct than asserting exact default model match.

**Plan 15-02 (Roadmap Round-Trip)**
- Task 1 (DEFER-11-01): PLAN requires 15+ tests. SUMMARY claims 22 for Task 1 (groups 1-6). Verified by Jest: 28 total (22 + 6 from Task 2).
- Task 2 (Generation integrity): 6 tests in group 7. Commit `408363b` tagged as `feat` rather than `test` -- minor inconsistency.
- SUMMARY says "No deviations." Plan executed as written. Commits `9027735` and `408363b` verified.

**Plan 15-03 (Cleanup Non-Interference)**
- Task 1 (DEFER-13-01): PLAN requires 15+ tests. SUMMARY claims 20 total. Verified by Jest: 20 tests pass across 8 test groups matching the plan specification.
- Task 2 (Phase execution context integration): 4 tests across groups 7-8. Commits `4b43321` and `d15a587` verified.
- SUMMARY says "No deviations." Plan executed as written.
- Key decision properly documented: `generateCleanupPlan` does not check the `enabled` flag; non-interference relies on the caller pattern where `runQualityAnalysis` returns `{skipped: true}`.

No issues found. All plan tasks have corresponding commits. All deviations are documented.

### Research Methodology

N/A -- no research references in these plans. These are deferred validation tests, not research implementations.

### Known Pitfalls

The backend-real-env.test.js file at line 215 explicitly references "PITFALLS.md P5" regarding the AGENT env var not being used for OpenCode detection. This demonstrates awareness of known pitfalls and tests for them.

No known failure modes from KNOWHOW.md are hit. The env var save/restore pattern in tests follows the established pattern from `tests/unit/backend.test.js` (PITFALLS.md P9 pattern).

### Eval Coverage

15-EVAL.md is comprehensive and well-structured with 18 verification checks (6 sanity, 8 proxy, 4 deferred resolution). All evaluation commands reference correct file paths. The evaluation can be run against the current implementation:
- S1-S6 sanity checks are executable
- P1-P8 proxy metrics target the correct test files
- D1-D4 deferred resolution checks map to the correct test files and counts

No issues found.

## Stage 2: Code Quality

### Architecture

All four test files follow the established project patterns:

1. **Import pattern**: `require('../../lib/...')` matches existing test files (e.g., `backend.test.js`, `cleanup.test.js`).
2. **Helper pattern**: `createFixtureDir`/`cleanupFixtureDir` from `tests/helpers/fixtures.js` and `captureOutput` from `tests/helpers/setup.js` used where appropriate.
3. **env var save/restore**: `backend-real-env.test.js` uses the same `beforeEach`/`afterEach` save/restore pattern as `backend.test.js`.
4. **Section comments**: `// --- Helpers ---` and `// --- Test Suite ---` style matches existing files.
5. **Temp directory pattern**: `os.tmpdir()` based, cleaned up in `afterEach`.

`backend-real-env.test.js` defines its own `createTempDir`/`cleanupTempDir` helpers rather than reusing from `tests/helpers/fixtures.js`. The existing `backend.test.js` also defines local helpers, so this is consistent with the established pattern for backend-specific tests that need different fixture shapes than the standard `createFixtureDir`.

`cleanup-noninterference.test.js` also defines local helpers (`createTempDir`, `removeTempDir`, `writeConfig`, `writeFile`, `collectFileMtimes`, `collectFilePaths`). The `collectFileMtimes` and `collectFilePaths` helpers are specific to this file's non-interference testing methodology and would not make sense as shared helpers.

No duplicate implementations of existing utilities detected. No conflicting architectural patterns.

### Reproducibility

N/A -- these are deterministic unit tests, not experimental code. No random seeds needed. All tests use fixed fixture data and produce deterministic results. The `roadmap-roundtrip.test.js` file uses `makeMilestones()` factory function for independent fixtures per test, avoiding shared mutable state -- good practice.

### Documentation

All four test files have JSDoc-style header comments explaining:
- What the file tests (deferred item ID)
- How it differs from existing test files
- The testing methodology

Inline comments document non-obvious decisions:
- `backend-real-env.test.js` line 229: explains `hasEnvPrefix` behavior with empty strings
- `context-backend-compat.test.js` lines 293-296: explains why model assertion uses "not raw tier" instead of exact match
- `cleanup-noninterference.test.js` lines 243-252: documents the caller-pattern reasoning for generateCleanupPlan non-interference
- `roadmap-roundtrip.test.js` lines 25-26: documents why `makeMilestones()` is a factory function

No complex algorithms without documentation. Test names are descriptive and serve as documentation of expected behavior.

### Deviation Documentation

SUMMARY.md files accurately reflect git history:

| SUMMARY Claim | Git Reality | Match |
|---|---|---|
| 15-01: 2 files created | git diff shows 2 test files | Yes |
| 15-01: commits 5b201ba, b1489f0 | Both exist in git log | Yes |
| 15-02: 1 file created | git diff shows 1 test file | Yes |
| 15-02: commits 9027735, 408363b | Both exist in git log | Yes |
| 15-03: 1 file created | git diff shows 1 test file | Yes |
| 15-03: commits 4b43321, d15a587 | Both exist in git log | Yes |

STATE.md was also updated with deferred validation resolutions and 5 new key decisions. The metrics table shows the correct test count progression.

Files modified but not listed in individual SUMMARY key-files: `.planning/STATE.md` -- this is a shared state file updated during execution and is not expected to be listed per-plan. No concern.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 2 | Architecture | `cleanup-noninterference.test.js` (line 267) tests `generateCleanupPlan` threshold-gating rather than enabled-flag non-interference, because `generateCleanupPlan` does not check `enabled`. The test title says "when disabled" but the mechanism being tested is threshold comparison, not the enabled flag. This is documented but could confuse future readers. |
| 2 | WARNING | 1 | Plan Alignment | Commit `408363b` for 15-02 Task 2 uses `feat` prefix instead of `test` -- the commit adds test code only, so `test` would be the correct conventional commit prefix. |
| 3 | INFO | 2 | Architecture | `backend-real-env.test.js` defines local `createTempDir`/`cleanupTempDir` helpers that partially overlap with `tests/helpers/fixtures.js` exports. This is consistent with `backend.test.js` patterns and is justified by the different fixture shape needed. |
| 4 | INFO | 1 | Plan Alignment | 15-02 SUMMARY says "feat" type for commit 408363b (Test Group 7 addition) but these are test additions. Minor labeling inconsistency. |
| 5 | INFO | 2 | Documentation | `cleanup-noninterference.test.js` lines 243-252 contain a multi-line comment explaining the architectural reasoning for testing threshold-gating vs enabled-flag. Good documentation of a non-obvious design decision. |
| 6 | INFO | 2 | Code Quality | `context-backend-compat.test.js` line 73 captures `claudeCodeVars` at module load time. If env vars change between module load and test execution, this list could be stale. However, since the `beforeEach` also dynamically scans for `CLAUDE_CODE_*` vars (lines 96-101), this is adequately handled. |
| 7 | INFO | 1 | Eval Coverage | All 4 deferred items (DEFER-09-01, DEFER-10-01, DEFER-11-01, DEFER-13-01) have comprehensive test coverage exceeding the plan minimums by significant margins (40/15, 49/20, 28/15, 20/15). |

## Recommendations

**For WARNING #1 (generateCleanupPlan test naming):**
Consider renaming Test Group 3 test descriptions to clarify that what is being tested is the threshold-gating behavior (returns null when `total_issues <= cleanup_threshold`), not the `enabled` flag check. The describe block title "No Filesystem Side Effects for generateCleanupPlan When Disabled" is slightly misleading since the tests set `enabled: true` on lines 272 and 304. A more accurate title would be "generateCleanupPlan returns null and creates no files when below threshold."

**For WARNING #2 (commit prefix):**
No action needed -- this is a cosmetic issue in git history. For future reference, test-only commits should use the `test` conventional commit prefix.
