# Evaluation Plan: Phase 10 — Backend Capabilities & Context Integration

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** CLI command exposure (detect-backend), context initialization backend awareness (14 cmdInit* functions)
**Reference research:** Phase 9 backend detection foundation, `.planning/REQUIREMENTS.md` (REQ-04, REQ-05, REQ-06)

## Evaluation Overview

Phase 10 builds on the Phase 9 foundation by exposing backend detection through a CLI command and integrating backend awareness into all workflow initialization functions. This enables orchestrator agents to adapt their behavior based on backend capabilities.

**What we're evaluating:**
- CLI command correctness (detect-backend JSON/raw output, all fields present and valid)
- Context initialization completeness (all 14 cmdInit* functions include backend and capabilities)
- Backend-resolved model names in context output (codex/gemini/opencode get backend-specific models, not tier names)
- Backward compatibility (existing orchestrator workflows continue to work, 674+ tests pass)
- Code quality (test coverage, lint compliance)

**What can be verified now:** CLI command output structure via unit tests, context init field presence via integration tests, model resolution correctness via config mocking, backward compatibility via full test suite, code coverage via Jest.

**What must be deferred:** Real-world orchestrator behavior under all 4 backends in production workflows. Context init is tested in isolation, but the full orchestrator workflow (spawn agents, execute tasks, etc.) requires end-to-end integration testing across backends.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| CLI command structure validation | Unit tests for cmdDetectBackend | Functional correctness of JSON/raw output format |
| Context init field presence | Integration tests for cmdInit* | All 14 functions include backend and capabilities |
| Model resolution in context | Integration tests with backend override | Backend-specific model names appear in cmdInit* output |
| Regression test pass rate (674+ tests) | Full Jest suite | Backward compatibility guarantee |
| ESLint clean | npm run lint | Code style compliance |
| New test coverage | Jest coverage for commands.js and context.js | Code quality for modified modules |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic functionality and format verification |
| Proxy (L2) | 6 | Automated code quality and correctness metrics |
| Deferred (L3) | 1 | Real orchestrator workflow validation under all backends |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: detect-backend command exists and runs
- **What:** CLI command is wired and executes without errors
- **Command:** `node bin/grd-tools.js detect-backend --raw 2>&1`
- **Expected:** Output is a single line with a backend name (e.g., `claude`)
- **Failure means:** Command is not wired or crashes on execution

### S2: detect-backend JSON output has required fields
- **What:** JSON mode returns an object with backend, models, capabilities
- **Command:** `node bin/grd-tools.js detect-backend 2>&1 | jq 'has("backend") and has("models") and has("capabilities")'`
- **Expected:** Output is `true`
- **Failure means:** Output structure is incorrect

### S3: detect-backend models field has 3 tiers
- **What:** models object contains opus, sonnet, haiku keys
- **Command:** `node bin/grd-tools.js detect-backend 2>&1 | jq '.models | keys | sort'`
- **Expected:** Output is `["haiku","opus","sonnet"]`
- **Failure means:** Model tier mapping is incomplete

### S4: detect-backend capabilities field has 5 flags
- **What:** capabilities object contains subagents, parallel, teams, hooks, mcp keys
- **Command:** `node bin/grd-tools.js detect-backend 2>&1 | jq '.capabilities | keys | length'`
- **Expected:** Output is `5`
- **Failure means:** Capabilities registry is incomplete

### S5: cmdInit functions include backend field (spot check)
- **What:** At least one cmdInit* function includes backend in output
- **Command:** `node bin/grd-tools.js init execute-phase 2>&1 | jq 'has("backend")'`
- **Expected:** Output is `true`
- **Failure means:** Context init backend integration is missing or broken

### S6: ESLint passes on modified files
- **What:** No lint errors in commands.js and context.js
- **Command:** `npx eslint lib/commands.js lib/context.js bin/grd-tools.js`
- **Expected:** Exit code 0, no errors
- **Failure means:** Code style violations or lint errors

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated code quality and functional correctness metrics.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: Unit test pass rate for cmdDetectBackend
- **What:** Percentage of detect-backend tests passing
- **How:** Run Jest on commands.test.js, filter to cmdDetectBackend tests
- **Command:** `npx jest tests/unit/commands.test.js --testNamePattern="cmdDetectBackend" --json | jq '.numPassedTests,.numTotalTests'`
- **Target:** 100% (all tests pass, minimum 8 tests per Plan 10-01)
- **Evidence:** Plan 10-01 specifies 8 test cases covering JSON output, raw output, all 4 backends, config overrides, edge cases
- **Correlation with full metric:** HIGH — unit tests directly verify CLI command contract
- **Blind spots:** Tests mock backend detection; real CLI behavior may differ
- **Validated:** No — awaiting deferred validation at Phase 15 (DEFER-10-01)

### P2: Integration test pass rate for backend-aware context init
- **What:** Percentage of context.test.js backend-aware tests passing
- **How:** Run Jest on context.test.js, filter to backend tests
- **Command:** `npx jest tests/unit/context.test.js --testNamePattern="backend" --json | jq '.numPassedTests,.numTotalTests'`
- **Target:** 100% (all tests pass, minimum 8 tests per Plan 10-02)
- **Evidence:** Plan 10-02 specifies 8 test cases covering backend field presence, capabilities, config override, model resolution across multiple cmdInit* functions
- **Correlation with full metric:** HIGH — integration tests verify end-to-end context init pipeline
- **Blind spots:** Tests use mocked configs and environments, not real orchestrator workflows
- **Validated:** No — awaiting Phase 15 integration validation

### P3: All 14 cmdInit* functions include backend field
- **What:** Verify all 14 functions output backend and backend_capabilities
- **How:** Spot check multiple cmdInit* functions via CLI or unit test assertions
- **Command:** `npx jest tests/unit/context.test.js --testNamePattern="All 14 cmdInit.*functions include backend" --verbose`
- **Target:** 14/14 functions have both fields
- **Evidence:** Plan 10-02 Task 2 requires "All 14 cmdInit* functions include backend (spot check via function list)" covering 6+ representative functions
- **Correlation with full metric:** HIGH — directly tests requirement REQ-06
- **Blind spots:** Spot check may miss edge cases in rarely-used cmdInit* functions
- **Validated:** No — full orchestrator integration test deferred to Phase 15

### P4: Backend-resolved model names in context (non-claude backends)
- **What:** When backend is codex/gemini/opencode, model fields contain backend-specific names (not tier names)
- **How:** Integration test with config override to non-claude backend
- **Command:** `npx jest tests/unit/context.test.js --testNamePattern="Model fields are backend-resolved" --verbose`
- **Target:** Model names match backend-specific format (e.g., gpt-5.3-codex-spark for codex)
- **Evidence:** Plan 10-02 Task 2 test case 7: "Model fields are backend-resolved (codex backend) — executor_model contains 'gpt-5.3-codex' (not 'sonnet')"
- **Correlation with full metric:** HIGH — verifies Phase 9 integration into context init
- **Blind spots:** Tests use static config overrides, not dynamic detection
- **Validated:** No — real backend model resolution deferred to Phase 15

### P5: Regression test pass rate (full suite)
- **What:** Percentage of all 674+ existing tests still passing
- **How:** Run full Jest suite, count passing vs total
- **Command:** `npx jest --json | jq '.numPassedTests,.numTotalTests'`
- **Target:** 100% (zero regressions, 680+ total after adding ~8-16 new tests)
- **Evidence:** Plan 10-01 requires "All 4 backends produce correct model and capability mappings in tests; 674+ total tests pass with zero regressions". Plan 10-02 requires "680+ total tests pass with zero regressions"
- **Correlation with full metric:** HIGH — directly measures backward compatibility
- **Blind spots:** Tests may not cover all edge cases in production orchestrator workflows
- **Validated:** No — full production validation deferred to Phase 15

### P6: Line coverage for modified modules
- **What:** Test coverage percentage for commands.js and context.js (modified sections)
- **How:** Jest coverage report for lib/commands.js and lib/context.js
- **Command:** `npx jest --coverage --collectCoverageFrom='lib/commands.js' --collectCoverageFrom='lib/context.js' | grep -E 'lib/(commands|context).js'`
- **Target:** >= 80% line coverage (project standard from Phase 9)
- **Evidence:** Project standard from REQ-07 (80%+ coverage), applied to all lib/ modules
- **Correlation with full metric:** MEDIUM — coverage doesn't guarantee correctness, but ensures code is exercised
- **Blind spots:** High coverage doesn't guarantee all edge cases are tested
- **Validated:** No — coverage is a proxy for test quality, not functional correctness

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Context init backward compatibility under all 4 backends in real workflows — DEFER-10-01
- **What:** Verify orchestrator commands (plan-phase, execute-phase, etc.) work correctly under all 4 backends (Claude, Codex, Gemini, OpenCode) in real environments
- **How:** Integration testing: set up each backend environment, run orchestrator workflow (e.g., /grd:plan-phase -> /grd:execute-phase), verify agents spawn correctly with backend-specific models, verify no regressions in orchestrator behavior
- **Why deferred:** Requires access to all 4 backend CLIs in working environments with agent spawning enabled. Phase 10 tests context init in isolation; full orchestrator workflow (config -> context init -> agent spawn -> task execution) is end-to-end integration
- **Validates at:** Phase 15 (Integration & Validation)
- **Depends on:** Access to all 4 backend CLIs, orchestrator workflows fully operational, agent spawning enabled
- **Target:** 4/4 backends support orchestrator workflows without regressions; backward compatibility preserved for Claude backend (existing workflows continue to work)
- **Risk if unmet:** Orchestrator may fail under non-Claude backends, breaking multi-backend support (high impact for REQ-06)
- **Fallback:** Config override (`backend` field) allows manual backend specification; orchestrator can degrade to Claude-only mode if detection/integration fails

## Ablation Plan

**No ablation plan** — This phase implements additive features (new CLI command, new fields in context init). There are no sub-components to isolate for performance analysis. The CLI command and context init integration are independent features that cannot be meaningfully ablated.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Existing test suite pass rate | All tests before Phase 10 modifications | 674/674 (100%) | Phase 9 completion, STATE.md |
| Existing commands.test.js pass rate | Commands tests before detect-backend | 100% | CI/CD baseline |
| Existing context.test.js pass rate | Context tests before backend integration | 100% | CI/CD baseline |
| Zero detect-backend tests | No tests for detect-backend CLI before this phase | 0 tests | Project history |
| Zero backend field in context init | cmdInit* functions have no backend field before this phase | 0/14 functions | Project history |

## Evaluation Scripts

**Location of evaluation code:**
- Unit tests for detect-backend: `tests/unit/commands.test.js` (8+ tests in `describe('cmdDetectBackend')` block)
- Integration tests for context init: `tests/unit/context.test.js` (8+ tests in `describe('backend-aware context init')` block)

**How to run full evaluation:**
```bash
# Sanity checks (manual)
node bin/grd-tools.js detect-backend --raw
node bin/grd-tools.js detect-backend | jq 'has("backend") and has("models") and has("capabilities")'
node bin/grd-tools.js detect-backend | jq '.models | keys | sort'
node bin/grd-tools.js detect-backend | jq '.capabilities | keys | length'
node bin/grd-tools.js init execute-phase | jq 'has("backend")'
npx eslint lib/commands.js lib/context.js bin/grd-tools.js

# Proxy metrics (automated)
npx jest tests/unit/commands.test.js --testNamePattern="cmdDetectBackend"
npx jest tests/unit/context.test.js --testNamePattern="backend"
npx jest --coverage

# Coverage for modified modules
npx jest --coverage --collectCoverageFrom='lib/commands.js' --collectCoverageFrom='lib/context.js'

# Full suite
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: detect-backend runs | [PASS/FAIL] | [output] | |
| S2: JSON has required fields | [PASS/FAIL] | [output] | |
| S3: models has 3 tiers | [PASS/FAIL] | [output] | |
| S4: capabilities has 5 flags | [PASS/FAIL] | [output] | |
| S5: cmdInit includes backend | [PASS/FAIL] | [output] | |
| S6: ESLint passes | [PASS/FAIL] | [output] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: cmdDetectBackend test pass rate | 100% (8+ tests) | [X/Y tests] | [MET/MISSED] | |
| P2: Context init test pass rate | 100% (8+ tests) | [X/Y tests] | [MET/MISSED] | |
| P3: All 14 cmdInit* have backend | 14/14 | [X/14] | [MET/MISSED] | |
| P4: Backend-resolved model names | codex/gemini/opencode | [backend-specific or tier] | [MET/MISSED] | |
| P5: Regression test pass rate | 100% (680+ tests) | [X/680+ tests] | [MET/MISSED] | |
| P6: Line coverage (commands.js, context.js) | >= 80% | [X%] | [MET/MISSED] | |

### Ablation Results

N/A — No ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-10-01 | Context init backward compatibility under all 4 backends | PENDING | Phase 15 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- **Sanity checks:** Adequate — 6 checks cover CLI command execution, output structure (JSON/raw), field presence, lint compliance
- **Proxy metrics:** Well-evidenced — unit tests for CLI command (HIGH correlation), integration tests for context init (HIGH correlation), model resolution verification (HIGH correlation), regression tests (HIGH correlation), coverage metric (MEDIUM correlation)
- **Deferred coverage:** Comprehensive — only 1 deferred validation (real orchestrator workflows under all backends), with clear mitigation (config override, backward-compatible design)

**What this evaluation CAN tell us:**
- Whether detect-backend CLI command produces correct output structure (JSON with backend/models/capabilities, raw with backend name)
- Whether all 14 cmdInit* functions include backend and backend_capabilities fields
- Whether model resolution in context init uses backend-specific names (not tier names) for non-Claude backends
- Whether backward compatibility is preserved (674+ existing tests pass)
- Whether code meets quality standards (>= 80% coverage, lint-clean)

**What this evaluation CANNOT tell us:**
- Whether orchestrator workflows (plan-phase, execute-phase, etc.) work correctly under all 4 backends in real environments (deferred to Phase 15 — requires end-to-end integration testing with agent spawning)
- Whether agent spawning uses correct backend-specific model names in production (deferred to Phase 15)
- Whether the user experience of multi-backend orchestrator workflows is seamless (requires user acceptance testing)
- Whether backend detection edge cases (nested shells, unusual environments) are handled correctly (deferred to Phase 15)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
