---
phase: 13-auto-cleanup-config-quality-analysis
plan: 01
subsystem: cleanup
tags: [tdd, quality-analysis, eslint, dead-exports, config]
dependency_graph:
  requires: []
  provides:
    - "lib/cleanup.js — phase_cleanup config reading and quality analysis functions"
  affects:
    - "Plan 13-02 (phase completion wiring)"
tech_stack:
  added:
    - "ESLint Node API (complexity rule via CLI subprocess)"
  patterns:
    - "execFileSync for shell-safe subprocess execution"
    - "Regex-based export/import scanning for dead export detection"
    - "fs.realpathSync for macOS /var -> /private/var symlink resolution"
key_files:
  created:
    - lib/cleanup.js
    - tests/unit/cleanup.test.js
  modified: []
key_decisions:
  - "Used execFileSync instead of execSync to avoid shell quoting issues with ESLint rule JSON"
  - "Used relative file paths with -- separator for ESLint to avoid 'outside base path' errors"
  - "Used fs.realpathSync(cwd) in ESLint result parsing for correct relative paths on macOS"
  - "Regex-based dead export detection (not AST) per v0.1.0 simplicity goal"
duration: 6min
completed: 2026-02-16
---

# Phase 13 Plan 01: Cleanup Config & Quality Analysis Functions Summary

TDD-driven `lib/cleanup.js` module with 5 exported functions for phase_cleanup config reading and code quality analysis (ESLint complexity, dead export detection, file size thresholds), passing 25 new tests with zero regressions.

## Performance Metrics

| Metric | Value |
|--------|-------|
| Tests added | 25 |
| Total tests | 821 (796 + 25) |
| Regressions | 0 |
| Module lines | 407 |
| Functions exported | 5 |
| Duration | 6min |

## Accomplishments

1. **getCleanupConfig** — Reads `phase_cleanup` section from `.planning/config.json` with defaults merge (`{ enabled: false, refactoring: false, doc_sync: false }`). Handles missing file and invalid JSON gracefully.

2. **analyzeComplexity** — Runs ESLint complexity rule via `execFileSync` subprocess, parses JSON output, returns violations with file, line, function name, and complexity score. Supports custom threshold via options.

3. **analyzeDeadExports** — Scans `module.exports = { ... }` and `exports.name = ...` patterns, then searches all JS files for corresponding `require()` consumers. Supports `excludePatterns` to ignore test files. Returns unused export objects.

4. **analyzeFileSize** — Checks files against configurable line-count threshold (default 500). Returns violations with file, line count, and threshold.

5. **runQualityAnalysis** — Orchestrates all three checks, returns structured report with `summary` (total_issues, complexity_violations, dead_exports, oversized_files) and `details` arrays. Returns `{ skipped: true }` when `phase_cleanup.enabled` is false or missing.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED: Failing tests for cleanup functions | `10117a1` | tests/unit/cleanup.test.js |
| 2 | GREEN: Implement lib/cleanup.js | `c179eab` | lib/cleanup.js |

## Files Created

- `lib/cleanup.js` (407 lines) — 5 exported quality analysis functions
- `tests/unit/cleanup.test.js` (348 lines) — 25 test cases across 5 describe blocks

## Decisions Made

1. **execFileSync over execSync** — Shell quoting of ESLint `--rule 'complexity: ["warn", N]'` caused argument splitting with `execSync`. Using `execFileSync` with args array avoids shell interpretation entirely.

2. **Relative paths with -- separator for ESLint** — ESLint v10 rejects absolute paths "outside of base path" when cwd differs from project root. Passing relative paths with `--` separator resolves this.

3. **fs.realpathSync for macOS path resolution** — ESLint reports paths via `/private/var/...` while Node's `os.tmpdir()` returns `/var/...`. Using `realpathSync` on cwd ensures consistent `path.relative` calculation.

4. **Regex-based dead export detection** — Per v0.1.0 scope, uses pattern matching (not AST parsing) for `module.exports` extraction and `require()` consumer search. Catches obvious dead exports; edge cases accepted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ESLint shell quoting caused argument splitting**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** `execSync` with `.join(' ')` command string caused ESLint `--rule` JSON value to split into multiple shell arguments
- **Fix:** Switched from `execSync` to `execFileSync` with args array to bypass shell interpretation
- **Files modified:** lib/cleanup.js

**2. [Rule 1 - Bug] ESLint "File ignored because outside of base path" error**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** ESLint v10 rejects absolute paths in temp directories as outside base path
- **Fix:** Pass relative file paths with `--` separator instead of absolute paths
- **Files modified:** lib/cleanup.js

**3. [Rule 1 - Bug] macOS /var vs /private/var symlink path mismatch**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** ESLint reports file paths through `/private/var/...` while tmpdir uses `/var/...`, making `path.relative` produce incorrect results
- **Fix:** Added `fs.realpathSync(cwd)` in ESLint result parser for consistent path calculation
- **Files modified:** lib/cleanup.js

## Issues Encountered

None beyond the auto-fixed deviations above.

## Next Phase Readiness

Plan 13-02 can now wire these functions into the phase completion flow. The module exports are stable:
- `getCleanupConfig(cwd)` for reading phase_cleanup config
- `analyzeComplexity(cwd, files, options)` for ESLint complexity checks
- `analyzeDeadExports(cwd, files, options)` for unused export detection
- `analyzeFileSize(cwd, files, thresholds)` for file size checks
- `runQualityAnalysis(cwd, phaseNum)` for orchestrated quality reports

## Self-Check: PASSED

- [x] lib/cleanup.js exists (407 lines)
- [x] tests/unit/cleanup.test.js exists (348 lines)
- [x] 13-01-SUMMARY.md exists
- [x] Commit 10117a1 exists (test RED phase)
- [x] Commit c179eab exists (feat GREEN phase)
- [x] 25 new tests pass, 821 total, zero regressions
