# Evaluation Plan: Phase 13 — Auto-Cleanup Config & Quality Analysis

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Quality analysis framework (ESLint complexity, dead export detection, file size checks)
**Reference papers:** N/A (internal tooling development)

## Evaluation Overview

Phase 13 introduces optional quality analysis at phase boundaries to detect code quality issues. This is a **pure infrastructure feature** with no research basis — we're building development tooling, not implementing algorithms from papers.

The evaluation focuses on:
1. **Functional correctness** — Do the quality checks detect the right issues?
2. **Config schema compliance** — Does the phase_cleanup config section work correctly?
3. **Integration safety** — Does the feature remain invisible when disabled?
4. **Test coverage** — Do we maintain 80%+ coverage on the new module?

Unlike R&D phases that implement papers, this phase has **no proxy metrics that approximate real quality** — the metrics ARE the quality. We test the tests, verify the verifiers, and ensure quality analysis doesn't interfere with normal workflows.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Unit test pass rate | Jest test suite | Verifies individual functions work correctly |
| Integration test pass rate | Jest integration tests | Verifies CLI and phase completion integration |
| Config schema validation | Manual + automated tests | Ensures config.json schema is backward compatible |
| Non-interference validation | Integration test with disabled config | Critical: feature must not affect users who don't enable it |
| Test coverage | Jest coverage report | Maintains 80%+ coverage target from PRODUCT-QUALITY.md |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 8 | Basic functionality, import/export, no crashes |
| Proxy (L2) | 7 | Test coverage, config behavior, detection accuracy |
| Deferred (L3) | 1 | Non-interference in real workflows |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module Exists and Exports Functions
- **What:** lib/cleanup.js exists and exports all 5 required functions
- **Command:** `node -e "const c = require('./lib/cleanup'); console.log(Object.keys(c))"`
- **Expected:** Output includes getCleanupConfig, analyzeComplexity, analyzeDeadExports, analyzeFileSize, runQualityAnalysis
- **Failure means:** Module structure is broken

### S2: Test Suite Compiles
- **What:** Test files load without syntax errors
- **Command:** `npx jest tests/unit/cleanup.test.js --listTests`
- **Expected:** Lists test file path without errors
- **Failure means:** Test file has syntax errors

### S3: New Tests Run (May Fail)
- **What:** New test suite executes without crashing
- **Command:** `npx jest tests/unit/cleanup.test.js --no-coverage 2>&1 | grep -E "(PASS|FAIL)"`
- **Expected:** Test results displayed (PASS or FAIL, not crash)
- **Failure means:** Test infrastructure is broken

### S4: CLI Command Routes
- **What:** quality-analysis command is recognized by grd-tools.js
- **Command:** `node bin/grd-tools.js quality-analysis 2>&1 | grep -v "phase flag required" || echo "ROUTES"`
- **Expected:** Error message about missing --phase flag (means command routes correctly)
- **Failure means:** Command routing is broken

### S5: Config Schema Loads
- **What:** loadConfig accepts phase_cleanup section without errors
- **Command:** `node -e "const fs = require('fs'); const cfg = JSON.parse(fs.readFileSync('.planning/config.json')); console.log(cfg.phase_cleanup || 'MISSING')"`
- **Expected:** Either valid object or 'MISSING' (both acceptable — defaults handle missing)
- **Failure means:** Config structure is broken

### S6: No Regression in Existing Tests
- **What:** All pre-existing tests still pass
- **Command:** `npx jest --testPathIgnorePatterns=cleanup --coverage=false --passWithNoTests`
- **Expected:** All tests pass (zero failures)
- **Failure means:** New code broke existing functionality

### S7: ESLint Passes on New Code
- **What:** New lib/cleanup.js follows code style
- **Command:** `npx eslint lib/cleanup.js`
- **Expected:** Zero errors (warnings acceptable)
- **Failure means:** Code style violations

### S8: Phase Completion Doesn't Crash
- **What:** cmdPhaseComplete still works with quality analysis integration
- **Command:** `node bin/grd-tools.js phase complete --phase 13 2>&1 | grep -E "(error|Error)" && echo "CRASH" || echo "OK"`
- **Expected:** "OK" (no error messages)
- **Failure means:** Integration broke phase completion

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.
**IMPORTANT:** For infrastructure code, "proxy metrics" are still direct tests, but they approximate real-world usage patterns.

### P1: getCleanupConfig Returns Correct Defaults
- **What:** Config function handles missing/invalid config.json correctly
- **How:** Run tests that create fixtures with various config scenarios
- **Command:** `npx jest tests/unit/cleanup.test.js --testNamePattern="getCleanupConfig"`
- **Target:** 5/5 tests pass (all config scenarios work)
- **Evidence:** Plan 13-01-PLAN.md specifies 5 config tests (defaults, user values, merge, missing file, invalid JSON)
- **Correlation with full metric:** HIGH — these tests directly verify the function spec
- **Blind spots:** Doesn't test concurrency or file-locking edge cases
- **Validated:** false — awaiting deferred validation at Phase 15

### P2: analyzeComplexity Detects High-Complexity Functions
- **What:** ESLint complexity analysis correctly identifies complex code
- **How:** Create fixture files with known complexity and verify detection
- **Command:** `npx jest tests/unit/cleanup.test.js --testNamePattern="analyzeComplexity"`
- **Target:** 5/5 tests pass (simple functions pass, complex detected, custom thresholds work)
- **Evidence:** Plan 13-01-PLAN.md specifies complexity detection with configurable threshold
- **Correlation with full metric:** MEDIUM — depends on ESLint's complexity calculation accuracy
- **Blind spots:** Edge cases in ESLint parsing, async/await complexity edge cases
- **Validated:** false — awaiting deferred validation at Phase 15

### P3: analyzeDeadExports Finds Unused Exports
- **What:** Dead export detection identifies exports with no consumers
- **How:** Create fixtures with exported functions and controlled import patterns
- **Command:** `npx jest tests/unit/cleanup.test.js --testNamePattern="analyzeDeadExports"`
- **Target:** 5/5 tests pass (all exports used = clean, some unused detected, various export patterns)
- **Evidence:** Plan 13-01-PLAN.md specifies pattern-based export/import scanning
- **Correlation with full metric:** MEDIUM — regex-based detection has known edge cases
- **Blind spots:** Dynamic requires, destructured re-exports, barrel file patterns
- **Validated:** false — awaiting deferred validation at Phase 15

### P4: analyzeFileSize Flags Oversized Files
- **What:** Line count threshold check works correctly
- **How:** Create fixtures with known line counts and verify threshold detection
- **Command:** `npx jest tests/unit/cleanup.test.js --testNamePattern="analyzeFileSize"`
- **Target:** 4/4 tests pass (under threshold pass, over threshold detected, custom thresholds, missing files)
- **Evidence:** Plan 13-01-PLAN.md specifies configurable line-count thresholds
- **Correlation with full metric:** HIGH — line counting is deterministic
- **Blind spots:** None significant (simple line counting)
- **Validated:** false — awaiting deferred validation at Phase 15

### P5: runQualityAnalysis Orchestrates All Checks
- **What:** Main orchestrator function integrates all checks and returns structured report
- **How:** Test with enabled/disabled config, clean/problematic code
- **Command:** `npx jest tests/unit/cleanup.test.js --testNamePattern="runQualityAnalysis"`
- **Target:** 6/6 tests pass (skipped when disabled, report structure, issue aggregation)
- **Evidence:** Plan 13-01-PLAN.md specifies summary structure and details arrays
- **Correlation with full metric:** HIGH — directly tests the integration function
- **Blind spots:** Performance on large codebases (>1000 files)
- **Validated:** false — awaiting deferred validation at Phase 15

### P6: CLI Command Integration
- **What:** quality-analysis CLI command works end-to-end
- **How:** Integration tests with fixture directories and config scenarios
- **Command:** `npx jest tests/unit/commands.test.js --testNamePattern="cmdQualityAnalysis"`
- **Target:** 12/12 tests pass (JSON/raw output, config handling, error cases)
- **Evidence:** Plan 13-02-PLAN.md specifies 12 CLI integration tests
- **Correlation with full metric:** HIGH — tests full user-facing interface
- **Blind spots:** Real-world CLI environment variations (shell escaping, path resolution)
- **Validated:** false — awaiting deferred validation at Phase 15

### P7: Phase Completion Integration
- **What:** cmdPhaseComplete correctly includes/excludes quality_report based on config
- **How:** Integration tests with enabled/disabled phase_cleanup config
- **Command:** `npx jest tests/unit/phase.test.js --testNamePattern="quality"`
- **Target:** 8/8 tests pass (quality_report inclusion logic, non-blocking errors)
- **Evidence:** Plan 13-02-PLAN.md specifies 8 phase completion integration tests
- **Correlation with full metric:** HIGH — tests the critical integration point
- **Blind spots:** Timing edge cases (quality analysis timeout during phase completion)
- **Validated:** false — awaiting deferred validation at Phase 15

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Auto-Cleanup Non-Interference When Disabled — DEFER-13-01
- **What:** Quality analysis feature does not affect users who have phase_cleanup.enabled: false (or missing)
- **How:** Run full end-to-end GRD workflow (plan phase -> execute phase -> complete phase) with phase_cleanup disabled. Verify no quality-analysis-related output, no performance degradation, no config warnings
- **Why deferred:** Requires full integration testing in Phase 15 with real project execution
- **Validates at:** phase-15-integration
- **Depends on:** Full v0.1.0 feature set integrated, all phases 9-14 complete
- **Target:**
  - Phase completion time with disabled config matches baseline (+/- 5%)
  - No "quality" or "cleanup" strings in output when disabled
  - Config.json without phase_cleanup section works identically to v0.0.5 behavior
- **Risk if unmet:** Users who don't want auto-cleanup are forced to deal with warnings or config changes — adoption blocker
- **Fallback:** Add explicit config migration guide, document how to disable permanently

## Ablation Plan

**No ablation plan** — This phase implements a single integrated feature (quality analysis framework) with interdependent components. The sub-components (complexity, dead exports, file size) cannot be meaningfully evaluated in isolation since they're all aggregated by runQualityAnalysis.

**Alternative verification approach:** Instead of ablation, we use **presence/absence testing**:
- Config disabled -> no quality analysis
- Config enabled, no issues -> zero-issue report
- Config enabled, specific issue present -> that issue detected in report

This gives us fine-grained control over what we're testing without requiring component isolation.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Pre-Phase-13 test count | Total passing tests before Phase 13 work | 796 tests | BASELINE.md (from v0.0.5 completion) |
| Test coverage target | Minimum line coverage for new lib/ modules | 80% | PRODUCT-QUALITY.md |
| Max file size baseline | Current largest source file | 5,632 lines (grd-tools.js) | BASELINE.md |
| Existing lint pass rate | ESLint status before Phase 13 | 100% (all files pass) | Assumed from Phase 6 code-style work |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/cleanup.test.js       (25+ tests for lib/cleanup.js)
tests/unit/commands.test.js      (12+ tests for quality-analysis CLI)
tests/unit/phase.test.js         (8+ tests for phase completion integration)
```

**How to run full evaluation:**

```bash
# Sanity checks (must all pass)
node -e "const c = require('./lib/cleanup'); console.log(Object.keys(c))"
npx jest tests/unit/cleanup.test.js --listTests
npx eslint lib/cleanup.js
node bin/grd-tools.js quality-analysis 2>&1 | grep -E "(required|error)"

# Proxy metrics (unit tests)
npx jest tests/unit/cleanup.test.js --coverage
npx jest tests/unit/commands.test.js --testNamePattern="cmdQualityAnalysis" --coverage
npx jest tests/unit/phase.test.js --testNamePattern="quality" --coverage

# Full test suite (no regressions)
npx jest --coverage

# Coverage report
npx jest --coverage --coverageReporters=text-summary | grep "lib/cleanup.js"
```

**Success thresholds:**
- All sanity checks: PASS
- All proxy metric tests: PASS (840+ total tests)
- Coverage on lib/cleanup.js: >= 80%
- Zero regression failures

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module exports | [ ] | | |
| S2: Test suite compiles | [ ] | | |
| S3: New tests run | [ ] | | |
| S4: CLI routes | [ ] | | |
| S5: Config loads | [ ] | | |
| S6: No regressions | [ ] | | |
| S7: ESLint passes | [ ] | | |
| S8: Phase completion works | [ ] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: getCleanupConfig | 5/5 tests | | [ ] MET / [ ] MISSED | |
| P2: analyzeComplexity | 5/5 tests | | [ ] MET / [ ] MISSED | |
| P3: analyzeDeadExports | 5/5 tests | | [ ] MET / [ ] MISSED | |
| P4: analyzeFileSize | 4/4 tests | | [ ] MET / [ ] MISSED | |
| P5: runQualityAnalysis | 6/6 tests | | [ ] MET / [ ] MISSED | |
| P6: CLI integration | 12/12 tests | | [ ] MET / [ ] MISSED | |
| P7: Phase completion | 8/8 tests | | [ ] MET / [ ] MISSED | |
| **Total test count** | **840+** | | [ ] MET / [ ] MISSED | |
| **Coverage lib/cleanup.js** | **>= 80%** | | [ ] MET / [ ] MISSED | |

### Ablation Results

N/A — No ablation plan for this phase (see Ablation Plan section above)

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-13-01 | Auto-cleanup non-interference when disabled | PENDING | Phase 15 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: **Comprehensive** — 8 checks cover module structure, imports, CLI routing, config schema, regressions, linting, and integration
- Proxy metrics: **Well-evidenced** — All metrics trace directly to plan specifications with concrete test counts
- Deferred coverage: **Focused** — Single deferred validation (non-interference) correctly targets the highest-risk scenario

**What this evaluation CAN tell us:**
- Whether the quality analysis functions detect the issues they're designed to detect (complexity, dead exports, file size)
- Whether the config schema correctly handles enabled/disabled states and defaults
- Whether the CLI integration and phase completion integration work without breaking existing functionality
- Whether we maintain 80%+ test coverage on the new module
- Whether all 840+ tests pass (no regressions)

**What this evaluation CANNOT tell us:**
- Whether the quality analysis is useful in real-world GRD development workflows — **deferred to Phase 15**
- Whether the regex-based dead export detection handles all edge cases (dynamic requires, complex re-export patterns) — **accepted limitation for v0.1.0**
- Whether quality analysis performance is acceptable on large codebases (1000+ files) — **out of scope for v0.1.0, GRD itself has ~100 files**
- Whether users find the quality thresholds (complexity, file size) useful vs. noisy — **deferred to post-v1.0 user feedback**

## Special Notes for Phase 13

This phase differs from typical R&D phases in the GRD workflow:

1. **No research basis** — We're not implementing a paper, we're building dev tooling
2. **Tests test tests** — Quality analysis verifies code quality, so we test the quality analyzer
3. **Non-interference is critical** — The deferred validation (DEFER-13-01) is arguably more important than the proxy metrics, because breaking users who don't opt-in would be catastrophic
4. **Acceptance of limitations** — The regex-based dead export detection is knowingly imperfect. We document the blind spots rather than trying to achieve 100% accuracy.

**Success definition:** Phase 13 succeeds if quality analysis works for the happy path (correctly configured, straightforward code patterns) and gracefully degrades for edge cases without breaking anything.

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
