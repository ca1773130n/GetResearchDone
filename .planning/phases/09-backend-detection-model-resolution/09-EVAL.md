# Evaluation Plan: Phase 9 — Backend Detection & Model Resolution

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Backend detection waterfall, model resolution mapping, capabilities registry
**Reference research:** `.planning/research/multi-backend-detection.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`

## Evaluation Overview

Phase 9 implements the foundation for multi-backend support by creating `lib/backend.js` (detection, model resolution, capabilities) and integrating it into `lib/utils.js` (config extension, model resolution pipeline). This is an implementation phase, not R&D, so evaluation focuses on code quality metrics rather than ML/research metrics.

**What we're evaluating:**
- Functional correctness of backend detection waterfall (config > env > filesystem > default)
- Accuracy of model resolution mapping (4 backends x 3 tiers = 12 combinations)
- Completeness of capabilities registry (5 flags x 4 backends = 20 values)
- Backward compatibility (all 594+ existing tests must pass)
- Code quality (unit test coverage >= 80%, no regressions)

**What can be verified now:** Detection logic via mocked environments, model resolution via config mocking, backward compatibility via full test suite execution, code coverage via Jest.

**What must be deferred:** Actual runtime detection accuracy across real CLI environments (Claude Code, Codex CLI, Gemini CLI, OpenCode running). This requires access to each backend's actual runtime environment, which is not available in unit tests.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Unit test pass rate | Jest test suite | Functional correctness of detection and resolution logic |
| Line coverage >= 80% | Jest coverage report | Code quality standard (REQ-07) |
| Integration test pass rate | Jest test suite for utils.js | End-to-end pipeline correctness |
| Regression test pass rate (594+ tests) | Full Jest suite | Backward compatibility guarantee |
| ESLint clean | npm run lint | Code style compliance |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic functionality and format verification |
| Proxy (L2) | 5 | Automated code quality and correctness metrics |
| Deferred (L3) | 1 | Real-environment validation requiring actual backends |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module loads without errors
- **What:** lib/backend.js can be required and exports expected symbols
- **Command:** `node -e "const b = require('./lib/backend'); console.log(Object.keys(b).sort().join(', '))"`
- **Expected:** Output includes: `DEFAULT_BACKEND_MODELS, BACKEND_CAPABILITIES, VALID_BACKENDS, detectBackend, getBackendCapabilities, resolveBackendModel`
- **Failure means:** Module has syntax errors or export structure is incorrect

### S2: Utils.js imports backend.js successfully
- **What:** lib/utils.js imports from lib/backend.js without circular dependency errors
- **Command:** `node -e "const u = require('./lib/utils'); console.log(typeof u.resolveModelInternal)"`
- **Expected:** Output is `function`
- **Failure means:** Circular dependency or import failure

### S3: Constants have correct structure
- **What:** VALID_BACKENDS, DEFAULT_BACKEND_MODELS, BACKEND_CAPABILITIES are well-formed
- **Command:** `node -e "const {VALID_BACKENDS, DEFAULT_BACKEND_MODELS, BACKEND_CAPABILITIES} = require('./lib/backend'); console.log(VALID_BACKENDS.length, Object.keys(DEFAULT_BACKEND_MODELS).length, Object.keys(BACKEND_CAPABILITIES).length)"`
- **Expected:** Output is `4 4 4`
- **Failure means:** Constants are incomplete or malformed

### S4: ESLint passes on modified files
- **What:** No lint errors in lib/backend.js and lib/utils.js
- **Command:** `npx eslint lib/backend.js lib/utils.js`
- **Expected:** Exit code 0, no errors
- **Failure means:** Code style violations or lint errors

### S5: Test files exist and are well-formed
- **What:** Test files load without syntax errors
- **Command:** `node -e "require('./tests/unit/backend.test.js'); console.log('backend.test.js OK')"`
- **Expected:** Output is `backend.test.js OK`
- **Failure means:** Test file has syntax errors

### S6: No crashes on happy path
- **What:** detectBackend and resolveBackendModel can be called without throwing
- **Command:** `node -e "const {detectBackend, resolveBackendModel} = require('./lib/backend'); const b = detectBackend(process.cwd()); const m = resolveBackendModel(b, 'sonnet', {}); console.log(b, m)"`
- **Expected:** Output is `claude sonnet` (or any valid backend and model)
- **Failure means:** Functions throw on normal inputs

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated code quality and functional correctness metrics.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: Unit test pass rate for lib/backend.js
- **What:** Percentage of backend.test.js tests passing
- **How:** Run Jest on backend.test.js, count passing vs total tests
- **Command:** `npx jest tests/unit/backend.test.js --json | jq '.numPassedTests,.numTotalTests'`
- **Target:** 100% (all tests pass)
- **Evidence:** Unit tests cover detection waterfall (config > env > fs > default), model resolution (12 combos), capabilities lookup (4 backends), config override precedence — per Plan 09-01
- **Correlation with full metric:** HIGH — unit tests directly verify functional requirements
- **Blind spots:** Mocked environments may not perfectly match real CLI environments
- **Validated:** No — awaiting deferred validation at Phase 15 (DEFER-09-01)

### P2: Line coverage for lib/backend.js
- **What:** Percentage of lines covered by tests
- **How:** Jest coverage report for lib/backend.js
- **Command:** `npx jest tests/unit/backend.test.js --coverage --collectCoverageFrom='lib/backend.js' | grep -A 1 'lib/backend.js'`
- **Target:** >= 80% line coverage (REQ-07)
- **Evidence:** REQ-07 mandates >= 80% coverage for backend module
- **Correlation with full metric:** HIGH — line coverage is a direct code quality metric
- **Blind spots:** Coverage doesn't guarantee correctness, only that code is exercised
- **Validated:** No — line coverage is a proxy for test quality, not functional correctness

### P3: Integration test pass rate for utils.js backend integration
- **What:** Percentage of new backend-aware tests passing in utils.test.js
- **How:** Run Jest on utils.test.js, filter to "Backend-aware model resolution" describe block
- **Command:** `npx jest tests/unit/utils.test.js --testNamePattern="Backend-aware" --json | jq '.numPassedTests,.numTotalTests'`
- **Target:** 100% (all integration tests pass)
- **Evidence:** Plan 09-02 specifies 15+ integration tests covering end-to-end pipeline (loadConfig -> detectBackend -> resolveBackendModel)
- **Correlation with full metric:** HIGH — integration tests verify the full pipeline
- **Blind spots:** Tests use mocked environments and temp config files, not real production configs
- **Validated:** No — awaiting Phase 15 integration validation

### P4: Regression test pass rate (full suite)
- **What:** Percentage of all 594+ existing tests still passing
- **How:** Run full Jest suite, count passing vs total
- **Command:** `npx jest --json | jq '.numPassedTests,.numTotalTests'`
- **Target:** 100% (zero regressions)
- **Evidence:** Plan 09-02 requires "All 594+ existing tests pass (no regressions)" and "All 594+ existing tests plus new tests pass"
- **Correlation with full metric:** HIGH — directly measures backward compatibility
- **Blind spots:** Tests may not cover all edge cases in production use
- **Validated:** No — full production validation deferred to Phase 15

### P5: Model resolution correctness (spot check)
- **What:** Verify all 12 backend/tier combinations resolve to expected model names
- **How:** Unit test that asserts resolveBackendModel returns correct names for all combos
- **Command:** `npx jest tests/unit/backend.test.js --testNamePattern="resolveBackendModel.*returns correct default model" --verbose`
- **Target:** 12/12 assertions pass
- **Evidence:** Plan 09-01 specifies "returns correct default model for each backend/tier combo (4 backends x 3 tiers = 12 cases)"
- **Correlation with full metric:** HIGH — directly tests model mapping table
- **Blind spots:** Model names may change in future backend releases
- **Validated:** No — model names are configurable and may need updates

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Backend detection accuracy across real environments — DEFER-09-01
- **What:** Verify detectBackend() returns correct backend when running inside each actual CLI
- **How:** Manual testing or automated smoke test: run GRD command inside Claude Code, Codex CLI, Gemini CLI, OpenCode; verify correct backend detected
- **Why deferred:** Unit tests mock environment variables; real CLI environments may have additional variables, shell configurations, or edge cases not covered by mocks
- **Validates at:** Phase 15 (Integration & Validation)
- **Depends on:** Access to all 4 backend CLIs, GRD installed in each environment
- **Target:** 4/4 backends correctly detected in their respective environments
- **Risk if unmet:** GRD may fail to detect backend in production, causing model resolution errors or incorrect agent spawning (high impact)
- **Fallback:** Config override (`backend` field in config.json) provides manual override if detection fails

## Ablation Plan

**No ablation plan** — This phase implements a standalone module with no sub-components to isolate. The detection waterfall has multiple fallback layers (config > env > fs > default), but each layer serves a distinct purpose and cannot be meaningfully removed for ablation analysis.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Existing test suite pass rate | All tests before Phase 9 modifications | 594/594 (100%) | CI/CD baseline |
| Existing utils.test.js pass rate | Utils tests before backend integration | 100% | CI/CD baseline |
| Zero backend-specific tests | No tests for backend detection before this phase | 0 tests | Project history |

## Evaluation Scripts

**Location of evaluation code:**
- Unit tests: `tests/unit/backend.test.js` (40+ tests covering detection, model resolution, capabilities)
- Integration tests: `tests/unit/utils.test.js` (15+ tests in "Backend-aware model resolution" describe block)

**How to run full evaluation:**
```bash
# Sanity checks (manual)
node -e "const b = require('./lib/backend'); console.log(Object.keys(b).sort().join(', '))"
node -e "const u = require('./lib/utils'); console.log(typeof u.resolveModelInternal)"
npx eslint lib/backend.js lib/utils.js

# Proxy metrics (automated)
npx jest tests/unit/backend.test.js --coverage
npx jest tests/unit/utils.test.js --testNamePattern="Backend-aware"
npx jest --coverage

# Coverage summary
npx jest --coverage --collectCoverageFrom='lib/backend.js' --collectCoverageFrom='lib/utils.js'

# Full suite
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module loads | [PASS/FAIL] | [output] | |
| S2: Utils imports backend | [PASS/FAIL] | [output] | |
| S3: Constants well-formed | [PASS/FAIL] | [output] | |
| S4: ESLint passes | [PASS/FAIL] | [output] | |
| S5: Test files load | [PASS/FAIL] | [output] | |
| S6: No crashes on happy path | [PASS/FAIL] | [output] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Unit test pass rate | 100% | [X/Y tests] | [MET/MISSED] | |
| P2: Line coverage (backend.js) | >= 80% | [X%] | [MET/MISSED] | |
| P3: Integration test pass rate | 100% | [X/Y tests] | [MET/MISSED] | |
| P4: Regression test pass rate | 100% | [X/594+ tests] | [MET/MISSED] | |
| P5: Model resolution correctness | 12/12 | [X/12] | [MET/MISSED] | |

### Ablation Results

N/A — No ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-09-01 | Backend detection accuracy in real environments | PENDING | Phase 15 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** Adequate — 6 checks cover module structure, imports, constants, lint, and crash-freedom
- **Proxy metrics:** Well-evidenced — unit tests with mocked envs (HIGH correlation), line coverage (standard metric), integration tests (end-to-end pipeline), regression tests (backward compat), model resolution spot checks (direct verification)
- **Deferred coverage:** Comprehensive — only 1 deferred validation (real-environment detection), with clear mitigation (config override)

**What this evaluation CAN tell us:**
- Whether backend detection logic is correct under mocked environments
- Whether model resolution produces expected names for all 12 backend/tier combinations
- Whether config override precedence works as specified
- Whether backward compatibility is preserved (no regressions in existing tests)
- Whether code meets quality standards (>= 80% coverage, lint-clean)

**What this evaluation CANNOT tell us:**
- Whether backend detection works correctly inside actual Claude Code, Codex CLI, Gemini CLI, OpenCode environments (deferred to Phase 15 — manual testing or smoke tests needed)
- Whether model names remain valid after future backend releases (requires ongoing monitoring)
- Whether the user experience of multi-backend setup is good (requires user acceptance testing)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
