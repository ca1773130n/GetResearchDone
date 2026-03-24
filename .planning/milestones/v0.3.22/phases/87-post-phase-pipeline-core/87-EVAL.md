# Evaluation Plan: Phase 87 — Post-Phase Pipeline Core

**Designed:** 2026-03-24
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Post-phase pipeline orchestrator (`runPostPhasePipeline`), prompt builders, env sanitization, `spawnStep` routing, `skipPostPipeline` flag
**Reference papers:** N/A — internal software implementation against REQ-160 through REQ-164

## Evaluation Overview

Phase 87 adds no new implementation code. `lib/autopilot.ts` already contains the full post-phase pipeline: `buildSimplifyPrompt`, `buildCodeReviewPrompt`, `buildConflictResolvePrompt`, `_buildSpawnConfig`, `spawnStep`, `runPostPhasePipeline`, and `AutopilotOptions.skipPostPipeline`. The phase delivers tests only, split across two plans (87-01 and 87-02) in a single Wave 1.

The evaluation objective is therefore: do the new tests correctly cover the requirements, do all tests pass, and do coverage thresholds remain met? There is no performance benchmarking or external metric to reach. Full fidelity of the implementation itself is verified by exercising it through the test suite.

Because the code is already written and the deliverable is tests, proxy metrics are well-defined and directly meaningful. There is no gap between "proxy" and "actual" quality here — a passing test suite with coverage above threshold IS the product quality signal. No deferred validation is expected beyond confirming the tests run cleanly in CI on the main branch.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation | `tsconfig.json` + `tsc --noEmit` | Tests are TypeScript — compile errors mean tests cannot run |
| ESLint clean | `.eslintrc` + `npm run lint` | Pre-commit hook enforces this; failures block commits |
| Test pass rate (autopilot suite) | `jest.config.js` thresholds | Direct verification that tests exercise the code correctly |
| Line coverage >= 83% | `jest.config.js` `autopilot.ts` threshold | Established project standard, do not lower |
| Function coverage >= 93% | `jest.config.js` `autopilot.ts` threshold | Established project standard |
| Branch coverage >= 76% | `jest.config.js` `autopilot.ts` threshold | Established project standard |
| No regressions in full suite | `npm test` | New tests must not break existing tests |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 4 | Compilation, lint, basic format, crash-free run |
| Proxy (L2) | 4 | Coverage thresholds, targeted describe-block pass rates, regression check, must-have truth assertions |
| Deferred (L3) | 1 | CI green on main after merge |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Compilation

- **What:** All TypeScript files compile without errors, including the updated test file
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check`
- **Expected:** Exit code 0, no errors printed
- **Failure means:** Test file has a type error — executor introduced a bad import, wrong argument type, or missing export. Fix before proceeding.

### S2: ESLint Clean

- **What:** No lint errors in `lib/` and `bin/` (test files are not linted by default rule, but `lib/autopilot.ts` must remain clean)
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint`
- **Expected:** Exit code 0, no warnings or errors
- **Failure means:** Code style violation introduced during test writing. Common causes: unused import in the implementation file touched indirectly, or a `any` type slipping in.

### S3: Single-File Test Run (No Crash)

- **What:** The autopilot test file loads, all describes parse, and Jest exits cleanly
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --no-coverage 2>&1 | tail -5`
- **Expected:** Output contains `Tests:` summary line with zero failures, exit code 0
- **Failure means:** Test setup error, bad mock, or import resolution failure. Diagnose with `--verbose`.

### S4: No NaN / Undefined in Result Shapes

- **What:** `PostPipelineResult` fields (`status`, `failedStep`, `prUrl`, `reason`) are always defined/typed correctly in test assertions
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "runPostPhasePipeline" --no-coverage --verbose 2>&1 | grep -E "PASS|FAIL|✓|✗|×"`
- **Expected:** All `runPostPhasePipeline` tests show as passing
- **Failure means:** Result shape mismatch — the implementation may return a field as `undefined` where the test expects a value, or vice versa.

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

---

## Level 2: Proxy Metrics

**Purpose:** Automated measurements that directly approximate correctness for a test-only deliverable.

**Context:** Because this phase delivers only tests (no new implementation), passing proxy metrics are equivalent to correctness. The proxy/full-metric distinction is minimal here. Each metric below maps directly to a requirement.

### P1: Prompt Builder Tests — Content Correctness (REQ-160, REQ-162, REQ-163)

- **What:** The `post-phase pipeline prompt builders` describe block verifies that each prompt builder includes the required content (phase number, PR URL, BLOCKER/WARNING keywords, rebase instruction, git diff reference)
- **How:** Run Jest filtered to that describe block
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "prompt builders" --no-coverage --verbose`
- **Target:** All tests in the describe block pass; no skipped tests; each builder has at minimum 2 assertions per test
- **Evidence:** Plan 87-01 Task 1 specifies exact assertions; builders are exported in `lib/autopilot.ts` at line 1806-1808
- **Correlation with full metric:** HIGH — the tests directly assert the string content that the pipeline passes to subprocesses
- **Blind spots:** Does not verify that subprocesses receiving these prompts behave correctly; does not test prompts at runtime with a real Claude session
- **Validated:** No — runtime subprocess behavior is deferred to D1

### P2: Coverage Thresholds Met for `lib/autopilot.ts`

- **What:** Line, function, and branch coverage for `lib/autopilot.ts` remain at or above the thresholds locked in `jest.config.js`
- **How:** Run Jest with `--coverage` on the autopilot test file
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --coverage --coverageReporters=text 2>&1 | grep "autopilot.ts"`
- **Target:** lines >= 83%, functions >= 93%, branches >= 76% (from `jest.config.js`)
- **Evidence:** `jest.config.js` line `'./lib/autopilot.ts': { lines: 83, functions: 93, branches: 76 }` — these are the project's standing quality gates
- **Correlation with full metric:** HIGH — coverage thresholds are the project's primary correctness proxy for this deliverable type
- **Blind spots:** Coverage does not guarantee assertion quality; a test that calls a function without asserting its output adds coverage without adding confidence
- **Validated:** No — awaiting deferred CI confirmation at D1

### P3: Orchestrator Tests — All Failure Paths + Happy Path (REQ-164)

- **What:** The `runPostPhasePipeline` describe block covers all four pipeline steps' failure paths and the complete success path
- **How:** Run Jest filtered to that describe block and count passing tests
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "runPostPhasePipeline" --no-coverage --verbose`
- **Target:** At minimum 7 passing tests: 3 existing + 4 new (happy path, code-review failure, rebase conflict + resolution failure, conflict-resolve spawn verification)
- **Evidence:** Plan 87-02 Task 1 specifies exactly these 4 new scenarios; existing 3 tests are in `tests/unit/autopilot.test.ts` at line 3525
- **Correlation with full metric:** HIGH — each test maps 1:1 to a `must_haves.truths` entry in 87-02-PLAN.md
- **Blind spots:** Tests use mocked `spawn` and `execFileSync`; real subprocess interaction and real git repo behavior are not exercised
- **Validated:** No — real subprocess behavior deferred to D1

### P4: No Regressions in Full Autopilot Test Suite

- **What:** All existing tests in `tests/unit/autopilot.test.ts` continue to pass after new tests are added
- **How:** Run the full file without filters
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --no-coverage`
- **Target:** Zero failures, same number of passing tests as before phase execution plus the new tests added
- **Evidence:** Standard non-regression requirement; the plan explicitly states "All existing tests continue to pass (no regressions)"
- **Correlation with full metric:** HIGH — direct measurement
- **Blind spots:** Does not test cross-file interactions or the full `npm test` suite
- **Validated:** No — full suite check is P4b below

**P4b (supplementary):** Full test suite

- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test 2>&1 | tail -20`
- **Target:** All suites pass, no threshold failures
- **Evidence:** Ensures new tests do not introduce cross-file mock leakage

---

## Level 3: Deferred Validations

**Purpose:** Validations requiring CI environment or runtime subprocess execution.

### D1: CI Green on Main After Merge — DEFER-87-01

- **What:** The full test suite passes in the CI environment (GitHub Actions or equivalent) after the phase branch is merged to main
- **How:** Observe CI run triggered by merge commit; check all status checks green
- **Why deferred:** CI environment differs from local (different Node version, no local filesystem state, clean env vars). Some mock-dependent tests can pass locally but fail in CI due to timing or env differences.
- **Validates at:** Post-merge CI run on main
- **Depends on:** Phase branch merged via `runPostPhasePipeline` rebase+merge step (REQ-163)
- **Target:** All CI checks green; no threshold failures for `lib/autopilot.ts`
- **Risk if unmet:** Test isolation issue (mock leak between tests, env var cleanup failure). Budget: 1 debugging iteration to fix test teardown.
- **Fallback:** Identify leaking test via `--runInBand` and fix `afterEach` cleanup

---

## Ablation Plan

**No ablation plan** — This phase adds tests for an already-implemented feature. There are no sub-components to ablate. The only meaningful variation would be removing test subsets to measure coverage impact, which is not useful here since the goal is to meet, not study, the coverage thresholds.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All modified files are in `tests/unit/` (TypeScript test files only).

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Line coverage before phase | Existing autopilot.ts line coverage | >= 83% | `jest.config.js` threshold |
| Function coverage before phase | Existing function coverage | >= 93% | `jest.config.js` threshold |
| Branch coverage before phase | Existing branch coverage | >= 76% | `jest.config.js` threshold |
| Existing test count | Tests in `runPostPhasePipeline` describe block | 3 tests | `tests/unit/autopilot.test.ts` line 3525 |
| Existing prompt builder tests | Tests in `post-phase pipeline prompt builders` | 4 tests (minimal assertions) | `tests/unit/autopilot.test.ts` line 3117 |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/autopilot.test.ts  (modified by phase execution)
jest.config.js                (thresholds — read-only)
```

**How to run full evaluation:**
```bash
# S1: Type check
cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check

# S2: Lint
cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint

# S3 + S4 + P3: runPostPhasePipeline tests
cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "runPostPhasePipeline" --no-coverage --verbose

# P1: Prompt builder tests
cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts -t "prompt builders" --no-coverage --verbose

# P2: Coverage check
cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --coverage --coverageReporters=text 2>&1 | grep "autopilot.ts"

# P4: No regressions (full file, no coverage)
cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/autopilot.test.ts --no-coverage

# P4b: Full suite
cd /Users/neo/Developer/Projects/GetResearchDone && npm test
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compilation | | | |
| S2: ESLint clean | | | |
| S3: Single-file test run | | | |
| S4: Result shape correctness | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Prompt builder tests | All pass, >= 2 assertions each | | | |
| P2: Line coverage | >= 83% | | | |
| P2: Function coverage | >= 93% | | | |
| P2: Branch coverage | >= 76% | | | |
| P3: Orchestrator tests | >= 7 passing (3 existing + 4 new) | | | |
| P4: No regressions (full file) | 0 failures | | | |
| P4b: Full suite | All suites pass | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-87-01 | CI green on main after merge | PENDING | Post-merge CI run |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — TypeScript and lint are deterministic; crash-free run is a binary signal
- Proxy metrics: Well-evidenced — coverage thresholds are the project's own quality gates; test pass rates map 1:1 to requirements since this is a test-only deliverable
- Deferred coverage: Partial but low-risk — CI confirmation is the only remaining gap, and the risk of failure there is low given good local test isolation patterns already in the codebase

**What this evaluation CAN tell us:**
- Whether all required test scenarios are present and passing
- Whether coverage thresholds are maintained (no regression in code coverage)
- Whether new tests introduce regressions in existing test behavior
- Whether all `must_haves.truths` from both plans are exercised

**What this evaluation CANNOT tell us:**
- Whether the actual pipeline works correctly at runtime with real Claude subprocesses and a real git repository (deferred to D1 / operational use)
- Whether mock-based tests accurately reflect real subprocess behavior (mock fidelity is assumed but not verified)
- Whether `_buildSpawnConfig` env stripping is sufficient for all possible CLAUDE-prefixed env vars that may be added in future (tests cover the three specified prefixes only)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-24*
