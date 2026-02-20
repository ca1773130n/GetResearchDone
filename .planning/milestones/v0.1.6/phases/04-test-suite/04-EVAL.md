# Evaluation Plan: Phase 4 — Test Suite

**Designed:** 2026-02-12
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Jest test suite with unit and integration tests
**Reference papers:** None (engineering infrastructure project)

## Evaluation Overview

Phase 4 establishes the first automated quality assurance infrastructure for GRD by implementing a comprehensive Jest test suite. This phase is critical because it validates the Phase 3 modularization work and resolves four deferred validations from Phases 2 and 3.

This evaluation plan has three distinct purposes:
1. **Verify test infrastructure works** — Jest runs, coverage reports, test helpers function
2. **Verify modularization correctness** — All CLI commands still work after extracting lib/ modules
3. **Verify security hardening correctness** — CLI behavior unchanged after Phase 2 execFileSync migration

The evaluation is largely self-verifying: tests are both the artifact and the verification method. The challenge is ensuring the tests themselves are correct and comprehensive.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test pass rate | Jest exit code | Binary gate: all tests must pass |
| Line coverage | Jest --coverage | Industry standard quality gate (80% threshold from ROADMAP.md) |
| Test execution time | Jest output | Performance constraint from success criteria (< 60s) |
| CLI output identity | Golden snapshot comparison | Regression detection for DEFER-03-02, DEFER-02-02 |
| CLI functional correctness | Integration test assertions | Regression detection for DEFER-03-01, DEFER-02-01 |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 8 checks | Test infrastructure loads and runs |
| Proxy (L2) | 7 metrics | Automated test quality indicators |
| Deferred (L3) | 0 | All validation happens in-phase (this IS the deferred validation phase) |

**Key insight:** Phase 4 is unusual in that it resolves deferred validations from prior phases rather than creating new ones. The evaluation focus is on proving the test suite itself is trustworthy.

## Level 1: Sanity Checks

**Purpose:** Verify basic test infrastructure functionality. These MUST ALL PASS before proceeding.

### S1: Jest Installation
- **What:** Jest installed as devDependency and accessible via npm
- **Command:** `npm list jest`
- **Expected:** Output shows jest version (latest 29.x), exit code 0
- **Failure means:** Package installation incomplete, cannot run tests

### S2: Jest Configuration Loads
- **What:** jest.config.js exists and is valid JavaScript
- **Command:** `node -e "require('./jest.config.js')"`
- **Expected:** No syntax errors, exit code 0
- **Failure means:** Configuration file malformed, Jest will fail to run

### S3: Test Discovery
- **What:** Jest discovers test files in tests/ directory
- **Command:** `npm test -- --listTests`
- **Expected:** Output lists all .test.js files in tests/unit/ and tests/integration/, at least 12 files
- **Failure means:** Test file naming or location incorrect, Jest won't run them

### S4: Test Helpers Load
- **What:** Test helper modules load without errors
- **Command:** `node -e "require('./tests/helpers/setup')"`
- **Expected:** Exit code 0, no errors
- **Failure means:** Helper utilities broken, unit tests will crash

### S5: Fixture Directory Exists
- **What:** Test fixtures present with required structure
- **Command:** `ls tests/fixtures/planning/STATE.md tests/fixtures/planning/ROADMAP.md tests/fixtures/planning/config.json`
- **Expected:** All 3 files exist
- **Failure means:** Fixture directory incomplete, integration tests will fail

### S6: Golden Output Files Present
- **What:** Golden reference files exist for snapshot comparison
- **Command:** `ls tests/golden/output/*.json | wc -l`
- **Expected:** At least 12 files (from surviving golden outputs after git cleanup)
- **Failure means:** Golden snapshot tests cannot run

### S7: CLI Tool Executable
- **What:** grd-tools.js can be invoked via Node
- **Command:** `node bin/grd-tools.js --help 2>&1 | head -1`
- **Expected:** Output contains usage or error message, does not crash
- **Failure means:** CLI tool broken, integration tests will fail

### S8: Coverage Directory Writable
- **What:** Jest can write coverage reports to coverage/
- **Command:** `mkdir -p coverage && touch coverage/test.tmp && rm coverage/test.tmp`
- **Expected:** No errors
- **Failure means:** Filesystem permissions issue, coverage reporting will fail

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated test quality indicators.
**IMPORTANT:** These metrics measure test suite quality, not production code quality. Test suite is the deliverable for this phase.

### P1: Test Pass Rate
- **What:** Percentage of tests that pass (target: 100%)
- **How:** Run full test suite, count passes vs failures
- **Command:** `npm test 2>&1 | grep "Tests:"`
- **Target:** 100% pass rate (0 failures)
- **Evidence:** Test pass rate is a fundamental quality gate for any test suite
- **Correlation with full metric:** HIGH — a failing test suite provides zero value
- **Blind spots:** Passing tests can still have incorrect assertions (false positives)
- **Validated:** No — manual code review of test logic needed to detect false positives

### P2: Line Coverage
- **What:** Percentage of lib/ lines executed by tests
- **How:** Jest --coverage with line coverage metric
- **Command:** `npm test -- --coverage --coverageReporters=text-summary 2>&1 | grep "Lines"`
- **Target:** >= 80% (from ROADMAP.md success criteria)
- **Evidence:** PRODUCT-QUALITY.md P0 metric, industry standard for production code
- **Correlation with full metric:** MEDIUM — high coverage doesn't prove test quality, but low coverage proves gaps
- **Blind spots:** Coverage measures execution, not assertion quality. 100% coverage with zero assertions is worthless.
- **Validated:** No — would require mutation testing to validate assertion effectiveness

### P3: Branch Coverage
- **What:** Percentage of code branches (if/else, switch, ternary) covered
- **How:** Jest --coverage with branch coverage metric
- **Command:** `npm test -- --coverage --coverageReporters=text-summary 2>&1 | grep "Branches"`
- **Target:** >= 70% (from jest.config.js threshold in Plan 04-01)
- **Evidence:** Branch coverage catches edge cases missed by line coverage alone
- **Correlation with full metric:** MEDIUM — complements line coverage
- **Blind spots:** Same as P2 — measures execution, not assertion correctness
- **Validated:** No — would require manual review of branch test logic

### P4: Function Coverage
- **What:** Percentage of functions called by tests
- **How:** Jest --coverage with function coverage metric
- **Command:** `npm test -- --coverage --coverageReporters=text-summary 2>&1 | grep "Functions"`
- **Target:** >= 80% (from jest.config.js threshold in Plan 04-01)
- **Evidence:** Ensures most exported functions are exercised
- **Correlation with full metric:** MEDIUM — uncovered functions are untested risks
- **Blind spots:** A function called once may not be fully tested (branch coverage captures this better)
- **Validated:** No

### P5: Test Execution Time
- **What:** Total time to run full test suite
- **How:** Jest reports total time at end of run
- **Command:** `npm test 2>&1 | grep "Time:"`
- **Target:** < 60 seconds (from ROADMAP.md success criteria)
- **Evidence:** Fast test suites encourage frequent execution (TDD, CI)
- **Correlation with full metric:** HIGH — directly measurable, no ambiguity
- **Blind spots:** Time varies by machine, but 60s threshold has large margin
- **Validated:** Yes — this metric is self-validating (direct measurement)

### P6: Golden Snapshot Match Rate
- **What:** Percentage of golden snapshots that match current CLI output
- **How:** Count passing vs failing golden snapshot tests
- **Command:** `npm test -- tests/integration/golden.test.js 2>&1 | grep "Tests:"`
- **Target:** 100% match (all 12+ snapshots pass)
- **Evidence:** Direct validation of DEFER-03-02 and DEFER-02-02 (CLI output unchanged)
- **Correlation with full metric:** HIGH — exact match proves output identity
- **Blind spots:** Only covers commands that had golden captures; 64 total commands but only ~15 golden files survived cleanup
- **Validated:** No — golden files themselves could be incorrect (no ground truth)

### P7: CLI Integration Test Coverage
- **What:** Number of CLI commands with at least one integration test
- **How:** Count describe blocks or test cases in cli.test.js
- **Command:** `grep -c "describe\\|test\\|it" tests/integration/cli.test.js`
- **Target:** >= 40 commands covered (from Plan 04-04 target)
- **Evidence:** Validates DEFER-03-01 and DEFER-02-01 (all commands functional)
- **Correlation with full metric:** MEDIUM — breadth indicator, not depth indicator
- **Blind spots:** One test per command is minimal coverage; doesn't test edge cases or error paths
- **Validated:** No — integration tests could have weak assertions

## Level 3: Deferred Validations

**Purpose:** This phase resolves deferred validations from prior phases rather than creating new ones.

### Resolution Tracking

| Deferred ID | Description | Resolution Method | Status |
|-------------|-------------|-------------------|--------|
| DEFER-03-01 | All 40 commands work after modularization | cli.test.js integration tests | Resolved in Plan 04-04 |
| DEFER-03-02 | CLI JSON output unchanged after modularization | golden.test.js snapshot tests | Resolved in Plan 04-04 |
| DEFER-02-01 | Full CLI regression after hardening | cli.test.js integration tests | Resolved in Plan 04-04 |
| DEFER-02-02 | CLI output unchanged after hardening | golden.test.js snapshot tests | Resolved in Plan 04-04 |

**No new deferred validations created.** Phase 4 is a validation phase, not an implementation phase. All test suite quality metrics are measurable in-phase.

## Ablation Plan

**No ablation plan** — This phase is testing infrastructure, not an algorithm or method with components to isolate. Ablation doesn't apply.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Pre-modularization baseline | Test coverage before Phase 3 | 0% | BASELINE.md |
| Zero-test baseline | Number of tests before Phase 4 | 0 tests | BASELINE.md |
| CLI functional baseline | Number of working commands pre-Phase 4 | 40/40 commands | BASELINE.md (validated by real-world usage) |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/*.test.js — Unit tests for lib/ modules (9 files)
tests/integration/cli.test.js — CLI integration tests
tests/integration/golden.test.js — Golden snapshot tests
tests/helpers/setup.js — Test utilities (captureOutput, captureError)
tests/helpers/fixtures.js — Fixture directory management
tests/fixtures/planning/ — Static test fixtures
```

**How to run full evaluation:**
```bash
# Run all tests with coverage
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run specific test file
npm test -- tests/unit/utils.test.js

# Generate detailed coverage report
npm test -- --coverage --coverageReporters=html
# Open coverage/index.html in browser

# Check coverage meets threshold
npm test -- --coverage 2>&1 | grep -E "Lines.*Functions.*Branches"
# Expected: Lines >= 80%, Functions >= 80%, Branches >= 70%

# Verify execution time
npm test 2>&1 | grep "Time:"
# Expected: Time < 60s

# Count integration test cases
grep -c "test\\|it" tests/integration/cli.test.js tests/integration/golden.test.js
# Expected: >= 52 combined
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Jest Installation | [PASS/FAIL] | | |
| S2: Jest Config Loads | [PASS/FAIL] | | |
| S3: Test Discovery | [PASS/FAIL] | [N files found] | |
| S4: Test Helpers Load | [PASS/FAIL] | | |
| S5: Fixture Directory | [PASS/FAIL] | | |
| S6: Golden Output Files | [PASS/FAIL] | [N files] | |
| S7: CLI Tool Executable | [PASS/FAIL] | | |
| S8: Coverage Directory | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Test Pass Rate | 100% | [X%] | [MET/MISSED] | |
| P2: Line Coverage | >= 80% | [X%] | [MET/MISSED] | |
| P3: Branch Coverage | >= 70% | [X%] | [MET/MISSED] | |
| P4: Function Coverage | >= 80% | [X%] | [MET/MISSED] | |
| P5: Test Execution Time | < 60s | [Xs] | [MET/MISSED] | |
| P6: Golden Snapshot Match | 100% | [X/N] | [MET/MISSED] | |
| P7: CLI Integration Coverage | >= 40 | [N commands] | [MET/MISSED] | |

### Deferred Resolutions

| ID | Metric | Status | Evidence |
|----|--------|--------|----------|
| DEFER-03-01 | All commands work | [RESOLVED/FAILED] | cli.test.js results |
| DEFER-03-02 | Output unchanged | [RESOLVED/FAILED] | golden.test.js results |
| DEFER-02-01 | CLI regression | [RESOLVED/FAILED] | cli.test.js results |
| DEFER-02-02 | Output unchanged | [RESOLVED/FAILED] | golden.test.js results |

### Coverage Breakdown by Module

*Jest --coverage output by module:*

| Module | Lines | Functions | Branches | Statements |
|--------|-------|-----------|----------|------------|
| lib/utils.js | [X%] | [X%] | [X%] | [X%] |
| lib/frontmatter.js | [X%] | [X%] | [X%] | [X%] |
| lib/roadmap.js | [X%] | [X%] | [X%] | [X%] |
| lib/state.js | [X%] | [X%] | [X%] | [X%] |
| lib/verify.js | [X%] | [X%] | [X%] | [X%] |
| lib/scaffold.js | [X%] | [X%] | [X%] | [X%] |
| lib/phase.js | [X%] | [X%] | [X%] | [X%] |
| lib/tracker.js | [X%] | [X%] | [X%] | [X%] |
| lib/context.js | [X%] | [X%] | [X%] | [X%] |
| lib/commands.js | [X%] | [X%] | [X%] | [X%] |
| **Overall** | [X%] | [X%] | [X%] | [X%] |

### Test Suite Composition

| Test File | Test Cases | Duration | Coverage Target |
|-----------|------------|----------|-----------------|
| utils.test.js | [N] | [Xs] | utils.js |
| frontmatter.test.js | [N] | [Xs] | frontmatter.js |
| roadmap.test.js | [N] | [Xs] | roadmap.js |
| state.test.js | [N] | [Xs] | state.js |
| verify.test.js | [N] | [Xs] | verify.js |
| scaffold.test.js | [N] | [Xs] | scaffold.js |
| phase.test.js | [N] | [Xs] | phase.js |
| tracker.test.js | [N] | [Xs] | tracker.js |
| context.test.js | [N] | [Xs] | context.js |
| commands.test.js | [N] | [Xs] | commands.js |
| cli.test.js | [N] | [Xs] | Full CLI |
| golden.test.js | [N] | [Xs] | Regression |
| **Total** | [N] | [Xs] | All modules |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** Adequate — 8 checks cover all infrastructure prerequisites
- **Proxy metrics:** Well-evidenced — all metrics are standard test quality indicators with clear thresholds from ROADMAP.md and industry best practices
- **Deferred coverage:** Comprehensive — resolves all 4 pending deferred validations from Phases 2 and 3

**What this evaluation CAN tell us:**
- Whether the test infrastructure works (Jest runs, coverage reports)
- Whether all lib/ modules have >= 80% line coverage
- Whether CLI commands produce valid output (integration tests pass)
- Whether CLI output changed after modularization and hardening (golden snapshots)
- Whether test suite runs fast enough for TDD/CI workflows (< 60s)

**What this evaluation CANNOT tell us:**
- Whether tests have correct assertions (could have false positives)
- Whether tests cover meaningful edge cases (coverage measures execution, not quality)
- Whether the code is actually correct (tests can pass on incorrect code if assertions are weak)
- Whether golden snapshots represent correct behavior (they only detect changes, not correctness)

**Confidence calibration:**
This is a **self-validating phase** where the artifact (test suite) is also the validation method. The main risk is that tests could pass while being incorrect (weak assertions, missing edge cases, false positives). This risk is mitigated by:
1. Code review of test logic (planned in subsequent review phase if needed)
2. Real-world usage validation (GRD has been working in production, tests should match reality)
3. Golden snapshot comparison (output hasn't changed, so behavior is preserved)
4. High coverage thresholds force tests to exercise most code paths

**Trust but verify:** Test pass rate and coverage numbers are necessary but not sufficient. Manual review of test logic in critical modules (especially integration tests) is recommended to ensure assertions are meaningful.

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-12*
