# Evaluation Plan: Phase 15 — Deferred Validations

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Deferred validation resolution (DEFER-09-01, DEFER-10-01, DEFER-11-01, DEFER-13-01)
**Reference:** Phase 9, 10, 11, 13 EVAL.md files for deferred item specifications

## Evaluation Overview

Phase 15 is a **validation collector phase** that resolves 4 deferred items from v0.1.0. Unlike implementation phases, this phase creates comprehensive tests that validate features under real-ish conditions (non-mocked environments, full lifecycle chains, non-interference verification).

**Critical distinction:** This phase IS the deferred validation. There is no "Tier 3 deferred" here — Tier 3 validates that the Tier 3 items from Phases 9, 10, 11, 13 are resolved.

**What we're validating:**
1. **DEFER-09-01** (from Phase 9): Backend detection accuracy with real environment variable patterns
2. **DEFER-10-01** (from Phase 10): Context init backward compatibility across all 4 backends
3. **DEFER-11-01** (from Phase 11): Long-term roadmap round-trip integrity through full lifecycle
4. **DEFER-13-01** (from Phase 13): Auto-cleanup non-interference when disabled

**Evaluation approach:**
- **Tier 1 (Sanity):** Quick checks that all test files parse and run
- **Tier 2 (Proxy):** Automated metrics (test counts, coverage, specific assertions)
- **Tier 3 (Deferred):** Validation that ALL 4 deferred items are resolved with confidence

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test count (per file) | Jest test runner | Each deferred item has minimum test coverage threshold (15+, 20+, 15+, 15+) |
| Test pass rate | Jest exit code | All deferred validation tests must pass |
| Coverage of deferred IDs | Manual verification | Each DEFER-XX-XX explicitly tested |
| Regression test pass rate | Full Jest suite | No breakage of existing 901 tests |
| Backend coverage | Test assertions | All 4 backends exercised in detection and context tests |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Test files parse, run without crashes, no regressions |
| Proxy (L2) | 8 | Test count minimums, backend coverage, specific validations |
| Deferred (L3) | 4 | Resolution of DEFER-09-01, DEFER-10-01, DEFER-11-01, DEFER-13-01 |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: All Test Files Compile
- **What:** New test files load without syntax errors
- **Command:** `npx jest tests/unit/backend-real-env.test.js tests/unit/context-backend-compat.test.js tests/unit/roadmap-roundtrip.test.js tests/unit/cleanup-noninterference.test.js --listTests`
- **Expected:** Lists all 4 test file paths without errors
- **Failure means:** Test files have syntax errors or missing dependencies

### S2: All New Tests Execute
- **What:** All new tests run to completion (may pass or fail)
- **Command:** `npx jest tests/unit/backend-real-env.test.js tests/unit/context-backend-compat.test.js tests/unit/roadmap-roundtrip.test.js tests/unit/cleanup-noninterference.test.js --no-coverage 2>&1 | grep -E "(Tests:|PASS|FAIL)"`
- **Expected:** Test summary appears (not crash)
- **Failure means:** Test infrastructure is broken

### S3: ESLint Passes on New Test Files
- **What:** New test files follow code style
- **Command:** `npx eslint tests/unit/backend-real-env.test.js tests/unit/context-backend-compat.test.js tests/unit/roadmap-roundtrip.test.js tests/unit/cleanup-noninterference.test.js`
- **Expected:** Zero errors (warnings acceptable)
- **Failure means:** Code style violations

### S4: No Regression in Existing Tests (Excluding New)
- **What:** All pre-existing 901 tests still pass
- **Command:** `npx jest --testPathIgnorePatterns="backend-real-env|context-backend-compat|roadmap-roundtrip|cleanup-noninterference" --passWithNoTests`
- **Expected:** 901/901 tests pass
- **Failure means:** New code broke existing functionality

### S5: Test Count Minimums Met
- **What:** Each test file has minimum required test count
- **Command:** `npx jest tests/unit/backend-real-env.test.js --listTests --verbose 2>&1 | grep -c "✓" && npx jest tests/unit/context-backend-compat.test.js --listTests --verbose 2>&1 | grep -c "✓" && npx jest tests/unit/roadmap-roundtrip.test.js --listTests --verbose 2>&1 | grep -c "✓" && npx jest tests/unit/cleanup-noninterference.test.js --listTests --verbose 2>&1 | grep -c "✓"`
- **Expected:** backend-real-env >= 15, context-backend-compat >= 20, roadmap-roundtrip >= 15, cleanup-noninterference >= 15
- **Failure means:** Insufficient test coverage

### S6: Full Suite Passes with New Tests
- **What:** All 901 + new tests pass together
- **Command:** `npx jest --passWithNoTests`
- **Expected:** Exit code 0, total tests >= 965 (901 + 65 new minimum)
- **Failure means:** Integration between new and old tests is broken

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated validation metrics.
**IMPORTANT:** These are NOT proxies for final validation — they ARE the validation. Phase 15 test results directly determine deferred item resolution.

### P1: Backend Detection Real-Environment Coverage (DEFER-09-01 partial)
- **What:** All 4 backends tested with real env var patterns
- **How:** Verify backend-real-env.test.js has tests for each backend's actual env vars
- **Command:** `npx jest tests/unit/backend-real-env.test.js --testNamePattern="CLAUDE_CODE|CODEX_|GEMINI_CLI_HOME|OPENCODE" --verbose 2>&1 | grep "✓" | wc -l`
- **Target:** >= 4 tests (one per backend)
- **Evidence:** Plan 15-01 specifies "4 backends x env detection" with actual env var patterns
- **Correlation with full metric:** HIGH — directly tests detection with real patterns
- **Blind spots:** Cannot test in actual CLI environments (would require 4 separate runtime environments)
- **Validated:** This IS the validation for DEFER-09-01

### P2: Backend Detection Waterfall Priority (DEFER-09-01 partial)
- **What:** Config > env > filesystem > default waterfall order verified
- **How:** Tests with multiple signals present simultaneously
- **Command:** `npx jest tests/unit/backend-real-env.test.js --testNamePattern="waterfall|priority" --verbose`
- **Target:** All waterfall tests pass
- **Evidence:** Plan 15-01 specifies "4+ waterfall priority scenarios"
- **Correlation with full metric:** HIGH — directly tests detection precedence
- **Blind spots:** None significant for waterfall logic
- **Validated:** This IS the validation for DEFER-09-01

### P3: Backend Detection Edge Cases Documented (DEFER-09-01 partial)
- **What:** Known edge cases have explicit tests with descriptive names
- **How:** Verify test names document edge cases
- **Command:** `npx jest tests/unit/backend-real-env.test.js --testNamePattern="edge case|AGENT env var|multiple.*vars|empty string|invalid" --verbose`
- **Target:** >= 3 edge case tests
- **Evidence:** Plan 15-01 specifies 3+ edge cases (AGENT ignored, multiple vars, empty strings, invalid config)
- **Correlation with full metric:** HIGH — edge case documentation prevents future regressions
- **Blind spots:** May not cover all possible edge cases
- **Validated:** This IS the validation for DEFER-09-01

### P4: Context Init All-Backend Coverage (DEFER-10-01 partial)
- **What:** All 14 cmdInit* functions tested under each backend
- **How:** Verify context-backend-compat.test.js covers function x backend matrix
- **Command:** `npx jest tests/unit/context-backend-compat.test.js --verbose 2>&1 | grep -E "cmdInit" | wc -l`
- **Target:** >= 14 cmdInit* function tests (may be across multiple backends)
- **Evidence:** Plan 15-01 specifies "14 functions x claude baseline + representative sample (4+) x 3 non-claude backends"
- **Correlation with full metric:** HIGH — matrix coverage ensures all functions have backend fields
- **Blind spots:** May not test every function with every backend (only representative sample for non-claude)
- **Validated:** This IS the validation for DEFER-10-01

### P5: Context Init Backward Compatibility (DEFER-10-01 partial)
- **What:** Claude backend (default) produces unchanged output
- **How:** Regression tests comparing output to established fixtures
- **Command:** `npx jest tests/unit/context-backend-compat.test.js --testNamePattern="claude|backward|regression" --verbose`
- **Target:** All backward compat tests pass
- **Evidence:** Plan 15-01 specifies "When backend is claude (default), all cmdInit* output matches the established fixture expectations with no regressions"
- **Correlation with full metric:** HIGH — directly tests backward compatibility requirement
- **Blind spots:** Fixtures may not cover all edge cases
- **Validated:** This IS the validation for DEFER-10-01

### P6: Roadmap Round-Trip Data Preservation (DEFER-11-01 partial)
- **What:** Full lifecycle preserves all milestone data
- **How:** Generate -> parse -> refine -> parse -> promote -> parse cycle
- **Command:** `npx jest tests/unit/roadmap-roundtrip.test.js --testNamePattern="round.trip|preserve|data loss" --verbose`
- **Target:** All round-trip tests pass
- **Evidence:** Plan 15-02 specifies "Full lifecycle chain validated: create -> refine -> promote -> refine -> promote -> validate"
- **Correlation with full metric:** HIGH — round-trip is the definitive test for schema integrity
- **Blind spots:** May not test all possible milestone content variations
- **Validated:** This IS the validation for DEFER-11-01

### P7: Roadmap Multi-Step Operations (DEFER-11-01 partial)
- **What:** Multi-step promotion chains and concurrent refinements work
- **How:** Tests that chain operations (Later -> Next -> Now) and refine multiple milestones
- **Command:** `npx jest tests/unit/roadmap-roundtrip.test.js --testNamePattern="promotion|refinement|multi-step" --verbose`
- **Target:** All multi-step tests pass
- **Evidence:** Plan 15-02 specifies "Multi-step lifecycle chains preserve all data, combined operations work correctly"
- **Correlation with full metric:** HIGH — multi-step tests catch state management bugs
- **Blind spots:** Cannot test all possible operation sequences
- **Validated:** This IS the validation for DEFER-11-01

### P8: Cleanup Non-Interference Verification (DEFER-13-01 partial)
- **What:** When disabled, cleanup produces zero output/side effects
- **How:** Filesystem monitoring, output comparison, performance measurement
- **Command:** `npx jest tests/unit/cleanup-noninterference.test.js --testNamePattern="non-interference|disabled|no.*output|no.*side.*effect" --verbose`
- **Target:** All non-interference tests pass
- **Evidence:** Plan 15-03 specifies "When phase_cleanup.enabled is false, cleanup system produces no extra output, no performance impact, and no side effects"
- **Correlation with full metric:** HIGH — non-interference tests directly verify the requirement
- **Blind spots:** Cannot test all possible execution environments
- **Validated:** This IS the validation for DEFER-13-01

## Level 3: Deferred Validations

**Purpose:** Resolution confirmation for all 4 deferred items.

### D1: DEFER-09-01 — Backend Detection Real-Environment Accuracy
- **What:** Backend detection returns correct results with real env var patterns
- **Resolution criteria:**
  1. All 4 backends tested with actual env var patterns (CLAUDE_CODE_*, CODEX_*, GEMINI_CLI_HOME, OPENCODE)
  2. Waterfall priority (config > env > filesystem > default) verified with multi-signal scenarios
  3. Edge cases documented with tests (AGENT ignored, multiple vars, empty strings, invalid config)
  4. All tests in backend-real-env.test.js pass
  5. Minimum 15 tests covering scenarios above
- **Evidence required:**
  - Test file: tests/unit/backend-real-env.test.js
  - Test count: >= 15 (P1 verification)
  - Backend coverage: All 4 backends (P1 verification)
  - Waterfall tests: Pass (P2 verification)
  - Edge case tests: >= 3 (P3 verification)
- **Status determination:** RESOLVED if all evidence present and tests pass
- **Fallback if fails:** Config override (`backend` field in config.json) provides manual override; detection remains best-effort

### D2: DEFER-10-01 — Context Init Backward Compatibility Under All 4 Backends
- **What:** All 14 cmdInit* functions produce correct output under each backend
- **Resolution criteria:**
  1. All 14 cmdInit* functions include `backend` and `backend_capabilities` fields
  2. Representative sample (4+ functions) tested under codex, gemini, opencode backends
  3. All 14 functions tested under claude backend with no regressions vs established fixtures
  4. Model fields are backend-resolved (not tier names) for non-claude backends
  5. All tests in context-backend-compat.test.js pass
  6. Minimum 20 tests covering matrix above
- **Evidence required:**
  - Test file: tests/unit/context-backend-compat.test.js
  - Test count: >= 20 (S5 verification)
  - Function coverage: All 14 cmdInit* (P4 verification)
  - Backward compat tests: Pass (P5 verification)
- **Status determination:** RESOLVED if all evidence present and tests pass
- **Fallback if fails:** Claude backend remains fully supported; other backends may require manual model configuration

### D3: DEFER-11-01 — Long-Term Roadmap Round-Trip Integrity
- **What:** Full roadmap lifecycle preserves all data without corruption
- **Resolution criteria:**
  1. Create -> parse round-trip preserves all milestone fields
  2. Refine -> parse preserves updated fields, leaves others unchanged
  3. Multi-step promotion chain (Later -> Next -> Now) preserves data
  4. Combined refine + promote operations work correctly
  5. Refinement history accumulates correctly across operations
  6. Edge cases (special characters, markdown formatting) survive round-trip
  7. All tests in roadmap-roundtrip.test.js pass
  8. Minimum 15 tests covering scenarios above
- **Evidence required:**
  - Test file: tests/unit/roadmap-roundtrip.test.js
  - Test count: >= 15 (S5 verification)
  - Round-trip tests: Pass (P6 verification)
  - Multi-step tests: Pass (P7 verification)
- **Status determination:** RESOLVED if all evidence present and tests pass
- **Fallback if fails:** Schema adjustments in lib/long-term-roadmap.js; regenerate parser/generator; retest

### D4: DEFER-13-01 — Auto-Cleanup Non-Interference When Disabled
- **What:** Cleanup system has zero impact when phase_cleanup.enabled is false
- **Resolution criteria:**
  1. runQualityAnalysis returns {skipped: true} when disabled, with NO other fields
  2. No filesystem writes occur when disabled (verified via mtime checks)
  3. generateCleanupPlan returns null when disabled, creates no files
  4. Output equivalence: config absent vs config present with enabled=false
  5. Performance: disabled path completes in <10ms (no I/O overhead)
  6. All tests in cleanup-noninterference.test.js pass
  7. Minimum 15 tests covering scenarios above
- **Evidence required:**
  - Test file: tests/unit/cleanup-noninterference.test.js
  - Test count: >= 15 (S5 verification)
  - Non-interference tests: Pass (P8 verification)
- **Status determination:** RESOLVED if all evidence present and tests pass
- **Fallback if fails:** Add explicit opt-out mechanism; document how to permanently disable in config

## Ablation Plan

**No ablation plan** — This phase validates existing features through testing. There are no sub-components to isolate. Each deferred item is independently validated by its test file.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Existing test suite | Total tests before Phase 15 | 901 tests | STATE.md Phase 14 completion |
| Backend detection tests | Existing backend.test.js tests | ~40 tests | Phase 9 completion |
| Context init tests | Existing context.test.js tests | ~30 tests | Phase 10 completion |
| Long-term roadmap tests | Existing long-term-roadmap.test.js tests | ~30 tests | Phase 11 completion |
| Cleanup tests | Existing cleanup.test.js tests | ~25 tests | Phase 13 completion |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/backend-real-env.test.js          (Plan 15-01, 15+ tests)
tests/unit/context-backend-compat.test.js    (Plan 15-01, 20+ tests)
tests/unit/roadmap-roundtrip.test.js         (Plan 15-02, 15+ tests)
tests/unit/cleanup-noninterference.test.js   (Plan 15-03, 15+ tests)
```

**How to run full evaluation:**

```bash
#!/bin/bash
# Phase 15 Full Evaluation

echo "=== Sanity Checks ==="
echo "S1: Test files compile"
npx jest tests/unit/backend-real-env.test.js tests/unit/context-backend-compat.test.js tests/unit/roadmap-roundtrip.test.js tests/unit/cleanup-noninterference.test.js --listTests

echo "S2: Tests execute"
npx jest tests/unit/backend-real-env.test.js tests/unit/context-backend-compat.test.js tests/unit/roadmap-roundtrip.test.js tests/unit/cleanup-noninterference.test.js --no-coverage 2>&1 | grep -E "Tests:"

echo "S3: ESLint passes"
npx eslint tests/unit/backend-real-env.test.js tests/unit/context-backend-compat.test.js tests/unit/roadmap-roundtrip.test.js tests/unit/cleanup-noninterference.test.js

echo "S4: No regressions"
npx jest --testPathIgnorePatterns="backend-real-env|context-backend-compat|roadmap-roundtrip|cleanup-noninterference" --passWithNoTests

echo "S5: Test count minimums"
echo "backend-real-env: $(npx jest tests/unit/backend-real-env.test.js --listTests --verbose 2>&1 | grep -c '✓') (need >= 15)"
echo "context-backend-compat: $(npx jest tests/unit/context-backend-compat.test.js --listTests --verbose 2>&1 | grep -c '✓') (need >= 20)"
echo "roadmap-roundtrip: $(npx jest tests/unit/roadmap-roundtrip.test.js --listTests --verbose 2>&1 | grep -c '✓') (need >= 15)"
echo "cleanup-noninterference: $(npx jest tests/unit/cleanup-noninterference.test.js --listTests --verbose 2>&1 | grep -c '✓') (need >= 15)"

echo "S6: Full suite passes"
npx jest --passWithNoTests

echo ""
echo "=== Proxy Metrics ==="
echo "P1: Backend detection real-env coverage"
npx jest tests/unit/backend-real-env.test.js --testNamePattern="CLAUDE_CODE|CODEX_|GEMINI_CLI_HOME|OPENCODE" --verbose

echo "P2: Waterfall priority tests"
npx jest tests/unit/backend-real-env.test.js --testNamePattern="waterfall|priority" --verbose

echo "P3: Edge cases documented"
npx jest tests/unit/backend-real-env.test.js --testNamePattern="edge case|AGENT env var|multiple.*vars|empty string|invalid" --verbose

echo "P4: Context init all-backend coverage"
npx jest tests/unit/context-backend-compat.test.js --verbose 2>&1 | grep -E "cmdInit"

echo "P5: Backward compatibility (claude)"
npx jest tests/unit/context-backend-compat.test.js --testNamePattern="claude|backward|regression" --verbose

echo "P6: Roadmap round-trip"
npx jest tests/unit/roadmap-roundtrip.test.js --testNamePattern="round.trip|preserve|data loss" --verbose

echo "P7: Multi-step operations"
npx jest tests/unit/roadmap-roundtrip.test.js --testNamePattern="promotion|refinement|multi-step" --verbose

echo "P8: Cleanup non-interference"
npx jest tests/unit/cleanup-noninterference.test.js --testNamePattern="non-interference|disabled|no.*output|no.*side.*effect" --verbose

echo ""
echo "=== Deferred Item Resolution ==="
echo "D1 (DEFER-09-01): Backend detection"
echo "  - Tests pass: [check P1, P2, P3]"
echo "  - Test count >= 15: [check S5]"
echo "  - Status: PENDING"

echo "D2 (DEFER-10-01): Context init compatibility"
echo "  - Tests pass: [check P4, P5]"
echo "  - Test count >= 20: [check S5]"
echo "  - Status: PENDING"

echo "D3 (DEFER-11-01): Roadmap round-trip"
echo "  - Tests pass: [check P6, P7]"
echo "  - Test count >= 15: [check S5]"
echo "  - Status: PENDING"

echo "D4 (DEFER-13-01): Cleanup non-interference"
echo "  - Tests pass: [check P8]"
echo "  - Test count >= 15: [check S5]"
echo "  - Status: PENDING"
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Test files compile | [PASS/FAIL] | [output] | |
| S2: Tests execute | [PASS/FAIL] | [output] | |
| S3: ESLint passes | [PASS/FAIL] | [output] | |
| S4: No regressions | [PASS/FAIL] | [901/901] | |
| S5: Test count minimums | [PASS/FAIL] | [actual counts] | |
| S6: Full suite passes | [PASS/FAIL] | [total count] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Backend detection coverage | All 4 backends | [X/4] | [MET/MISSED] | |
| P2: Waterfall priority tests | All pass | [pass/fail] | [MET/MISSED] | |
| P3: Edge cases documented | >= 3 tests | [X tests] | [MET/MISSED] | |
| P4: Context init coverage | All 14 cmdInit* | [X/14] | [MET/MISSED] | |
| P5: Backward compatibility | All pass | [pass/fail] | [MET/MISSED] | |
| P6: Roadmap round-trip | All pass | [pass/fail] | [MET/MISSED] | |
| P7: Multi-step operations | All pass | [pass/fail] | [MET/MISSED] | |
| P8: Cleanup non-interference | All pass | [pass/fail] | [MET/MISSED] | |

### Deferred Status

| ID | Metric | Status | Evidence | Resolution |
|----|--------|--------|----------|------------|
| DEFER-09-01 | Backend detection real-env accuracy | [RESOLVED/PENDING/BLOCKED] | [test file + count + coverage] | [date if resolved] |
| DEFER-10-01 | Context init backward compatibility | [RESOLVED/PENDING/BLOCKED] | [test file + count + coverage] | [date if resolved] |
| DEFER-11-01 | Roadmap round-trip integrity | [RESOLVED/PENDING/BLOCKED] | [test file + count + coverage] | [date if resolved] |
| DEFER-13-01 | Cleanup non-interference | [RESOLVED/PENDING/BLOCKED] | [test file + count + coverage] | [date if resolved] |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** Comprehensive — 6 checks cover test compilation, execution, style, regressions, test counts, and full suite integration
- **Proxy metrics:** Well-evidenced — 8 metrics directly validate deferred item requirements; these are not proxies, they ARE the validation
- **Deferred coverage:** Complete — This phase IS the deferred validation collector; Tier 3 confirms all 4 items resolved

**What this evaluation CAN tell us:**
- Whether backend detection works correctly with real env var patterns from all 4 backends
- Whether waterfall priority (config > env > filesystem > default) is correct
- Whether all 14 cmdInit* functions include backend fields and work under all 4 backends
- Whether context init maintains backward compatibility (no regressions under claude)
- Whether the long-term roadmap survives full lifecycle chains without data loss
- Whether multi-step operations (refine + promote) preserve all milestone data
- Whether cleanup system has zero impact when disabled (no output, no side effects, no performance cost)
- Whether all 901 existing tests continue to pass (zero regressions)

**What this evaluation CANNOT tell us:**
- Whether backend detection works inside actual CLI runtime environments (Claude Code app, Codex CLI, Gemini CLI, OpenCode) — unit tests manipulate process.env, not real environments
- Whether orchestrator workflows (plan-phase, execute-phase) work end-to-end under all 4 backends — would require integration testing with agent spawning
- Whether the long-term roadmap schema is usable for real-world planning — requires user acceptance testing (post-v1.0)
- Whether cleanup thresholds are tuned correctly for real GRD development — requires production usage data

**Critical success path:**
1. All sanity checks pass (tests compile, no regressions, count minimums met)
2. All proxy metrics pass (backend coverage, function coverage, non-interference)
3. All 4 deferred items marked RESOLVED based on evidence
4. Total test count >= 965 (901 existing + 65+ new)
5. Zero test failures

If any deferred item fails resolution:
- **DEFER-09-01 fails:** Config override provides fallback; detection remains best-effort
- **DEFER-10-01 fails:** Claude backend remains fully supported; others require manual config
- **DEFER-11-01 fails:** Schema adjustment + parser regeneration (1 iteration, 1-2 days)
- **DEFER-13-01 fails:** Add explicit opt-out config; document disable procedure

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
