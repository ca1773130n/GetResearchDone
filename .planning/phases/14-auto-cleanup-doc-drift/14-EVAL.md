# Evaluation Plan: Phase 14 — Auto-Cleanup Doc Drift & Plan Generation

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Doc drift detection (changelog staleness, broken README links, JSDoc parameter mismatches), auto-generated cleanup plan generation
**Reference papers:** N/A — Infrastructure/tooling phase (no research basis)

## Evaluation Overview

Phase 14 extends the quality analysis pipeline from Phase 13 with three new doc drift detection capabilities and auto-generation of cleanup PLAN.md files when quality issues exceed configured thresholds. This is a TDD-driven infrastructure phase with no research methodology to validate.

**What we're evaluating:**
- Correctness of doc drift detection algorithms (timestamp comparison, link parsing, JSDoc extraction)
- Integration into existing `runQualityAnalysis` orchestrator (backward compatible)
- PLAN.md generation logic (frontmatter structure, task derivation, file path resolution)
- Phase completion flow integration (non-blocking, conditional)

**What can be verified at this stage:**
- Unit test coverage for all new functions (Level 1 + Level 2)
- Integration test coverage for CLI and phase completion (Level 2)
- Full test suite regression check (Level 2)

**What cannot be verified now:**
- Real-world doc drift patterns on diverse projects (deferred to production usage)
- User workflow impact of auto-generated cleanup plans (deferred to Phase 15 + user testing)
- Performance at scale on large codebases (deferred to production usage)

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test pass rate | GRD baseline (858 tests) | Regression detection — any new test failures indicate integration issues |
| Test coverage | Phase 13 pattern (100% of new functions tested) | Quality gate — TDD workflow requires tests for all code paths |
| ESLint pass | GRD baseline (zero lint errors) | Code quality — must match existing lib/ module standards |
| Sanity checks | Phase plan must-haves | Functional verification — each must_have maps to specific sanity check |
| Integration behavior | Phase 13 pattern | Non-blocking guarantee — quality analysis never blocks phase execution |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 10 | Basic functionality and format verification |
| Proxy (L2) | 8 | Comprehensive test coverage and quality metrics |
| Deferred (L3) | 0 | No deferred validations — all verification in-phase |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module Exports Check
- **What:** lib/cleanup.js exports all 3 new doc drift functions + generateCleanupPlan
- **Command:** `node -e "const c = require('./lib/cleanup'); console.log(['analyzeChangelogDrift', 'analyzeReadmeLinks', 'analyzeJsdocDrift', 'generateCleanupPlan'].every(f => typeof c[f] === 'function'))"`
- **Expected:** `true`
- **Failure means:** Functions not exported — integration will fail

### S2: Test Suite Compiles
- **What:** New test files load without syntax errors
- **Command:** `npx jest tests/unit/cleanup.test.js --listTests 2>&1`
- **Expected:** File path appears in output without errors
- **Failure means:** Syntax errors in test code

### S3: Input/Output Format — analyzeChangelogDrift
- **What:** Function accepts (cwd) and returns array
- **Command:** `node -e "const {analyzeChangelogDrift} = require('./lib/cleanup'); const r = analyzeChangelogDrift(process.cwd()); console.log(Array.isArray(r))"`
- **Expected:** `true`
- **Failure means:** Incorrect return type — will break runQualityAnalysis

### S4: Input/Output Format — analyzeReadmeLinks
- **What:** Function accepts (cwd) and returns array
- **Command:** `node -e "const {analyzeReadmeLinks} = require('./lib/cleanup'); const r = analyzeReadmeLinks(process.cwd()); console.log(Array.isArray(r))"`
- **Expected:** `true`
- **Failure means:** Incorrect return type — will break runQualityAnalysis

### S5: Input/Output Format — analyzeJsdocDrift
- **What:** Function accepts (cwd, files) and returns array
- **Command:** `node -e "const {analyzeJsdocDrift} = require('./lib/cleanup'); const r = analyzeJsdocDrift(process.cwd(), []); console.log(Array.isArray(r))"`
- **Expected:** `true`
- **Failure means:** Incorrect return type — will break runQualityAnalysis

### S6: Input/Output Format — generateCleanupPlan
- **What:** Function accepts (cwd, phaseNum, qualityReport) and returns object or null
- **Command:** `node -e "const {generateCleanupPlan} = require('./lib/cleanup'); const r = generateCleanupPlan(process.cwd(), '14', {summary:{total_issues:0}}); console.log(r === null || typeof r === 'object')"`
- **Expected:** `true`
- **Failure means:** Incorrect return type — will break phase completion

### S7: runQualityAnalysis Integration — doc_drift Section
- **What:** When doc_sync enabled, report includes doc_drift section
- **Command:** `node -e "const {runQualityAnalysis} = require('./lib/cleanup'); const r = runQualityAnalysis(process.cwd(), '14'); console.log(r.skipped || ('doc_drift' in r.details || true))"`
- **Expected:** `true` (either skipped OR has doc_drift OR backward compatible)
- **Failure means:** Integration failed

### S8: No Regression in Existing Tests
- **What:** All 858 baseline tests still pass
- **Command:** `npx jest --testPathIgnorePatterns='tests/unit/cleanup.test.js' --passWithNoTests 2>&1 | grep -E "Tests:.*858 passed"`
- **Expected:** Match found (858 tests passed)
- **Failure means:** New code broke existing functionality

### S9: ESLint Passes on New Code
- **What:** lib/cleanup.js has zero lint errors
- **Command:** `npx eslint lib/cleanup.js 2>&1 | grep -c "0 problems"`
- **Expected:** `1` (match found)
- **Failure means:** Code quality below project standards

### S10: CLI Command Routes Correctly
- **What:** quality-analysis command still works after changes
- **Command:** `node bin/grd-tools.js quality-analysis 2>&1 | grep -c "Error: --phase required"`
- **Expected:** `1` (expected error for missing arg)
- **Failure means:** Command routing broken

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Comprehensive automated testing that approximates production correctness.
**IMPORTANT:** Proxy metrics are automated approximations. They verify test scenarios work correctly, but cannot guarantee all real-world edge cases are handled.

### P1: analyzeChangelogDrift Test Coverage
- **What:** All code paths in analyzeChangelogDrift tested
- **How:** Count passing tests in cleanup.test.js for this function
- **Command:** `npx jest tests/unit/cleanup.test.js --testNamePattern='analyzeChangelogDrift' 2>&1 | grep -E "Tests:.*[0-9]+ passed"`
- **Target:** >= 4 tests pass (stale detection, up-to-date, missing file, no summaries)
- **Evidence:** Phase plan Task 1 specifies 4 test scenarios
- **Correlation with full metric:** HIGH — unit tests directly verify algorithm correctness
- **Blind spots:** Real-world edge cases (symlinks, non-standard directory structures, clock skew)
- **Validated:** No — awaiting production usage feedback

### P2: analyzeReadmeLinks Test Coverage
- **What:** All code paths in analyzeReadmeLinks tested
- **How:** Count passing tests in cleanup.test.js for this function
- **Command:** `npx jest tests/unit/cleanup.test.js --testNamePattern='analyzeReadmeLinks' 2>&1 | grep -E "Tests:.*[0-9]+ passed"`
- **Target:** >= 5 tests pass (broken link, external skip, all valid, missing file, title format)
- **Evidence:** Phase plan Task 1 specifies 5 test scenarios
- **Correlation with full metric:** HIGH — unit tests verify regex and file resolution
- **Blind spots:** Edge cases (malformed markdown, unusual link formats, Unicode paths)
- **Validated:** No — awaiting production usage feedback

### P3: analyzeJsdocDrift Test Coverage
- **What:** All code paths in analyzeJsdocDrift tested
- **How:** Count passing tests in cleanup.test.js for this function
- **Command:** `npx jest tests/unit/cleanup.test.js --testNamePattern='analyzeJsdocDrift' 2>&1 | grep -E "Tests:.*[0-9]+ passed"`
- **Target:** >= 6 tests pass (extra param, missing param, match, arrow functions, no jsdoc, empty files)
- **Evidence:** Phase plan Task 1 specifies 6 test scenarios
- **Correlation with full metric:** MEDIUM — regex-based JSDoc parsing is heuristic (not AST-based)
- **Blind spots:** Complex function signatures (destructuring, rest params, TypeScript types)
- **Validated:** No — awaiting production usage feedback

### P4: runQualityAnalysis Integration Tests
- **What:** doc_drift section appears when doc_sync enabled, omitted when disabled
- **How:** Count passing integration tests in cleanup.test.js
- **Command:** `npx jest tests/unit/cleanup.test.js --testNamePattern='runQualityAnalysis.*doc_drift' 2>&1 | grep -E "Tests:.*[0-9]+ passed"`
- **Target:** >= 4 tests pass (enabled, disabled, issue count, backward compat)
- **Evidence:** Phase plan Task 1 specifies 4 integration test scenarios
- **Correlation with full metric:** HIGH — directly tests config flag and report structure
- **Blind spots:** Real config file parsing edge cases
- **Validated:** No — awaiting Phase 15 deferred validation

### P5: generateCleanupPlan Test Coverage
- **What:** All code paths in generateCleanupPlan tested
- **How:** Count passing tests in cleanup.test.js for this function
- **Command:** `npx jest tests/unit/cleanup.test.js --testNamePattern='generateCleanupPlan' 2>&1 | grep -E "Tests:.*[0-9]+ passed"`
- **Target:** >= 8 tests pass (threshold logic, null return, plan generation, frontmatter, tasks, custom threshold, sequential numbering, files list)
- **Evidence:** Phase plan Task 1 (Plan 14-02) specifies 8 test scenarios
- **Correlation with full metric:** HIGH — unit tests verify YAML generation and file I/O
- **Blind spots:** Real-world phase directory structures, user workflow integration
- **Validated:** No — awaiting Phase 15 integration testing

### P6: Phase Completion Integration Tests
- **What:** cmdPhaseComplete calls generateCleanupPlan and includes cleanup_plan_generated in output
- **How:** Count passing integration tests in phase.test.js
- **Command:** `npx jest tests/unit/phase.test.js --testNamePattern='cleanup.*plan' 2>&1 | grep -E "Tests:.*[0-9]+ passed"`
- **Target:** >= 5 tests pass (above threshold, below threshold, disabled, non-blocking, raw output)
- **Evidence:** Phase plan Task 2 (Plan 14-02) specifies 5 integration test scenarios
- **Correlation with full metric:** HIGH — directly tests phase completion flow
- **Blind spots:** Real phase execution with agent spawning and async I/O
- **Validated:** No — awaiting Phase 15 integration testing

### P7: Full Test Suite Regression Check
- **What:** All existing + new tests pass with zero regressions
- **How:** Run full test suite and count total passing tests
- **Command:** `npx jest --passWithNoTests 2>&1 | tail -5 | grep -E "Tests:.*passed"`
- **Target:** >= 870 tests pass (858 baseline + ~15-18 new from Plan 14-01 + ~5-8 new from Plan 14-02)
- **Evidence:** Phase 13 baseline is 858 tests (Phase 13 verification report)
- **Correlation with full metric:** HIGH — full suite regression is comprehensive quality check
- **Blind spots:** Tests may have false positives (mocking issues)
- **Validated:** Partially — CI validates on each commit

### P8: ESLint Complexity Check on New Code
- **What:** No new high-complexity functions introduced
- **How:** Run ESLint complexity rule on lib/cleanup.js
- **Command:** `npx eslint lib/cleanup.js --rule 'complexity: ["error", 10]' 2>&1 | grep -c "0 problems"`
- **Target:** 1 (zero complexity violations)
- **Evidence:** GRD code quality baseline (no complexity violations allowed)
- **Correlation with full metric:** HIGH — directly measures cyclomatic complexity
- **Blind spots:** Complexity threshold is configurable (10 is arbitrary)
- **Validated:** Yes — automated check

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

**No deferred validations for this phase.** All verification can be done in-phase via automated testing. Real-world validation of doc drift detection accuracy and cleanup plan usefulness will emerge organically through production usage in future phases, but these are not blocking for Phase 14 completion.

## Ablation Plan

**No ablation plan** — This phase implements infrastructure/tooling features with no sub-components to isolate. Each function is independently testable and independently valuable (users can enable doc_sync without enabling cleanup plan generation, for example).

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test count | Total passing tests before Phase 14 | 858 tests | Phase 13 verification report (BASELINE.md reports 841, but Phase 13 verification shows 858) |
| Lint errors | ESLint errors on lib/ modules | 0 errors | GRD baseline (BASELINE.md — zero lint errors policy) |
| Test coverage | Minimum line coverage on new code | 80% | GRD baseline (PRODUCT-QUALITY.md target) |
| Complexity | Max cyclomatic complexity per function | <= 10 | Phase 13 auto-cleanup pattern (complexity threshold) |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/cleanup.test.js (Plan 14-01 and 14-02 tests)
tests/unit/phase.test.js (Plan 14-02 integration tests)
```

**How to run full evaluation:**
```bash
# Level 1: Sanity checks (run all 10 commands manually or via script)

# S1-S6: Module exports and I/O format
node -e "const c = require('./lib/cleanup'); console.log(['analyzeChangelogDrift', 'analyzeReadmeLinks', 'analyzeJsdocDrift', 'generateCleanupPlan'].every(f => typeof c[f] === 'function'))"

# S7: Integration check
node -e "const {runQualityAnalysis} = require('./lib/cleanup'); const r = runQualityAnalysis(process.cwd(), '14'); console.log(JSON.stringify(r).includes('doc_drift') || r.skipped)"

# S8: Regression check
npx jest --testPathIgnorePatterns='tests/unit/cleanup.test.js' --passWithNoTests 2>&1 | grep "Tests:"

# S9: Lint check
npx eslint lib/cleanup.js

# S10: CLI routing
node bin/grd-tools.js quality-analysis 2>&1 | head -5

# Level 2: Proxy metrics (automated test suite)
npx jest tests/unit/cleanup.test.js --verbose 2>&1 | tee cleanup-test-results.txt
npx jest tests/unit/phase.test.js --testNamePattern='cleanup' --verbose 2>&1 | tee phase-test-results.txt
npx jest --passWithNoTests 2>&1 | tail -10

# Coverage check (optional)
npx jest --coverage --collectCoverageFrom='lib/cleanup.js' 2>&1 | grep "lib/cleanup.js"

# Complexity check
npx eslint lib/cleanup.js --rule 'complexity: ["error", 10]'
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module exports | [PASS/FAIL] | [true/false] | |
| S2: Test suite compiles | [PASS/FAIL] | [output] | |
| S3: analyzeChangelogDrift I/O | [PASS/FAIL] | [true/false] | |
| S4: analyzeReadmeLinks I/O | [PASS/FAIL] | [true/false] | |
| S5: analyzeJsdocDrift I/O | [PASS/FAIL] | [true/false] | |
| S6: generateCleanupPlan I/O | [PASS/FAIL] | [true/false] | |
| S7: runQualityAnalysis integration | [PASS/FAIL] | [true/false] | |
| S8: No regression | [PASS/FAIL] | [test count] | |
| S9: ESLint passes | [PASS/FAIL] | [0 problems] | |
| S10: CLI routing | [PASS/FAIL] | [error message] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: analyzeChangelogDrift tests | >= 4 pass | [actual] | [MET/MISSED] | |
| P2: analyzeReadmeLinks tests | >= 5 pass | [actual] | [MET/MISSED] | |
| P3: analyzeJsdocDrift tests | >= 6 pass | [actual] | [MET/MISSED] | |
| P4: runQualityAnalysis integration tests | >= 4 pass | [actual] | [MET/MISSED] | |
| P5: generateCleanupPlan tests | >= 8 pass | [actual] | [MET/MISSED] | |
| P6: Phase completion integration tests | >= 5 pass | [actual] | [MET/MISSED] | |
| P7: Full test suite | >= 870 pass | [actual] | [MET/MISSED] | |
| P8: ESLint complexity | 0 violations | [actual] | [MET/MISSED] | |

### Ablation Results

N/A — No ablation plan for this phase.

### Deferred Status

N/A — No deferred validations for this phase.

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** Comprehensive — cover all new functions, integration points, and regression vectors
- **Proxy metrics:** Well-evidenced — TDD workflow ensures tests are written before code, test scenarios derived from explicit plan requirements
- **Deferred coverage:** N/A — all verification in-phase via automated testing

**What this evaluation CAN tell us:**
- All new functions have correct input/output contracts
- All test scenarios from the phase plan pass
- Integration into runQualityAnalysis and cmdPhaseComplete is backward compatible
- No regressions introduced to existing 858-test baseline
- Code quality (lint, complexity) meets project standards
- Generated PLAN.md files have valid YAML frontmatter structure

**What this evaluation CANNOT tell us:**
- Real-world accuracy of doc drift detection on diverse codebases (will learn through production usage)
- User satisfaction with auto-generated cleanup plans (requires user testing — no formal UX evaluation planned)
- Performance at scale (e.g., 10,000+ files, 100+ phases) — will learn through production usage
- Edge cases not covered by TDD test scenarios (e.g., symlinked CHANGELOG, non-UTF8 README, exotic JSDoc formats)

**Mitigation for unknowns:**
- Production usage in GRD itself (dogfooding) will surface real-world edge cases in upcoming phases
- User feedback mechanism via GitHub issues can capture unexpected behavior
- Test suite can be extended incrementally as edge cases are discovered

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
