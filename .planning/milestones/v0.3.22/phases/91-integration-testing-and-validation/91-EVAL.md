# Evaluation Plan: Phase 91 — Integration Testing and Validation

**Designed:** 2026-03-24
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Unit testing (post-phase pipeline, merge queue, write-intent, wave builder) + E2E integration test
**Reference context:** 91-01-PLAN.md, 91-02-PLAN.md, 91-03-PLAN.md; lib/autopilot.ts (2135 lines)

## Evaluation Overview

Phase 91 is a testing phase, not a feature phase. The "product" being delivered is a test suite that verifies the autopilot v2 pipeline introduced in phases 87-90. Success is therefore measured directly by the tests themselves — coverage numbers, pass rates, and the structural completeness of the E2E scenario.

The primary evaluation question is: does the test suite genuinely exercise the code paths that matter? A test suite that passes but has low coverage on the critical pipeline code (lines covering `createMergeQueue`, `runPostPhasePipeline`, `spawnStep`, conflict resolution) would be a false pass. The 85% line coverage target on new pipeline code is the core quality gate.

This phase has no external paper benchmarks. All targets derive from REQ-175 through REQ-178 in REQUIREMENTS.md and the existing jest.config.js thresholds. There are no deferred validations requiring integration with other systems — the test suite is self-contained.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| lib/autopilot.ts lines >= 83% | jest.config.js (current threshold) | Existing gate must not regress |
| lib/autopilot.ts functions >= 93% | jest.config.js (current threshold) | Existing gate must not regress |
| lib/autopilot.ts branches >= 76% | jest.config.js (current threshold) | Existing gate must not regress |
| New pipeline code lines >= 85% | REQ-175 | Phase goal for new code specifically |
| New test case count >= 23 | REQ-175/176/177/178 combined (~11 + ~12 + E2E) | Structural completeness check |
| npm run lint: 0 errors | CLAUDE.md pre-commit hook | Code style gate |
| npm run build:check: 0 errors | CLAUDE.md dev commands | TypeScript strict mode gate |
| E2E: both pipelines complete with status 'completed' | REQ-178 | Proves end-to-end pipeline coherence |
| E2E: merge order matches completion order | REQ-178 | Proves serial merge queue ordering |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 5 | Confirm tests run, pass, and produce no type/lint errors |
| Proxy (L2) | 6 | Coverage numbers and structural test completeness |
| Deferred (L3) | 1 | Manual coverage spot-check on specific line ranges |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Autopilot test file runs without crash
- **What:** The test file loads and executes without import errors, mock setup failures, or timeouts
- **Command:** `npx jest tests/unit/autopilot.test.ts --no-coverage --testTimeout=15000 2>&1 | tail -5`
- **Expected:** "Test Suites: 1 passed" — no "Cannot find module", no "SyntaxError", no timeout kills
- **Failure means:** A broken import, bad mock setup, or syntax error in newly added tests

### S2: No NaN/undefined in pipeline result objects
- **What:** runPostPhasePipeline result objects have defined `status` and `failedStep` fields
- **Command:** `npx jest tests/unit/autopilot.test.ts -t "runPostPhasePipeline" --no-coverage --verbose 2>&1 | grep -E "PASS|FAIL|✓|✗|×"`
- **Expected:** All runPostPhasePipeline tests show PASS / checkmark — no test returns undefined status
- **Failure means:** Mock wiring is broken; result shape not matching expected interface

### S3: Existing tests do not regress
- **What:** The 219 pre-existing it() blocks still pass after new tests are added
- **Command:** `npx jest tests/unit/autopilot.test.ts --no-coverage 2>&1 | grep -E "Tests:.*passed"`
- **Expected:** "Tests: 23X passed" where X > 219 (new tests added, none removed or broken)
- **Failure means:** A new mock setup or describe block is interfering with existing test state

### S4: TypeScript compilation clean
- **What:** No new type errors introduced in tests/unit/autopilot.test.ts or jest.config.js
- **Command:** `npm run build:check 2>&1 | tail -10`
- **Expected:** Exit 0, no output lines containing "error TS"
- **Failure means:** Type mismatch in mock signatures or test assertions — fix before merge

### S5: Lint clean
- **What:** No ESLint errors in bin/ and lib/ (test files are not linted per CLAUDE.md scope)
- **Command:** `npm run lint 2>&1 | tail -10`
- **Expected:** Exit 0, zero errors, zero warnings treated as errors
- **Failure means:** A pre-commit hook will block the commit; fix immediately

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: Overall lib/autopilot.ts coverage does not regress
- **What:** Lines, functions, and branches coverage on lib/autopilot.ts meets or exceeds current jest.config.js thresholds
- **How:** Run full jest with coverage; read the per-file summary for lib/autopilot.ts
- **Command:** `npx jest tests/unit/autopilot.test.ts --coverage --coverageReporters=text 2>&1 | grep "autopilot.ts"`
- **Target:** lines >= 83%, functions >= 93%, branches >= 76%
- **Evidence:** These are the thresholds already enforced by jest.config.js; they will cause npm test to fail if unmet
- **Correlation with full metric:** HIGH — jest enforces this directly; failure is not ambiguous
- **Blind spots:** Does not distinguish old code coverage from new pipeline code coverage
- **Validated:** No — awaiting full npm test pass at D1

### P2: New pipeline code achieves 85%+ line coverage
- **What:** Lines 130-700 of lib/autopilot.ts (createMergeQueue, spawnStep, runPostPhasePipeline, getConflictingFiles) have at least 85% coverage
- **How:** Inspect lcov or text coverage report for the specific line range; or infer from total coverage + known pre-existing coverage
- **Command:** `npx jest tests/unit/autopilot.test.ts --coverage --coverageReporters=lcov 2>&1 && node -e "const fs=require('fs'); const lcov=fs.readFileSync('coverage/lcov.info','utf8'); const lines=lcov.split('\n').filter(l=>l.startsWith('DA:')); const [hit,total]=lines.reduce(([h,t],l)=>{const parts=l.split(','); const c=Number(parts[1]); return[h+(c>0?1:0),t+1]},[0,0]); console.log('lines hit/total:', hit, '/', total, '=', (hit/total*100).toFixed(1)+'%')"`
- **Target:** >= 85% on new pipeline code sections
- **Evidence:** REQ-175 directly specifies this target; 91-03-PLAN.md Task 2 confirms it
- **Correlation with full metric:** HIGH — coverage on the specific functions is direct evidence
- **Blind spots:** Line coverage does not verify semantic correctness of assertions; a test can hit a line without meaningfully testing it
- **Validated:** No — awaiting D1 (manual spot-check)

### P3: New test case count meets structural completeness targets
- **What:** At least 23 new it() cases added across all three plans (11 from 91-01 + 12 from 91-02 + E2E block from 91-03)
- **How:** Count it() calls in the test file before and after phase execution
- **Command:** `grep -c "  it(" tests/unit/autopilot.test.ts`
- **Target:** >= 242 total (219 baseline + 23 new minimum)
- **Evidence:** 91-01-PLAN.md specifies 12-15 new cases; 91-02-PLAN.md specifies 10-12; 91-03-PLAN.md adds E2E block (~3-5 cases). 23 is the conservative floor.
- **Correlation with full metric:** MEDIUM — count does not verify test quality; a trivial it() with no assertions would pass the count gate
- **Blind spots:** Does not catch shallow tests with no meaningful assertions
- **Validated:** No — count alone is insufficient; read alongside P1/P2

### P4: E2E test asserts merge order
- **What:** The E2E integration test includes an assertion that merge order array equals ['48', '49']
- **How:** Run E2E test in isolation and verify it passes including the ordering assertion
- **Command:** `npx jest tests/unit/autopilot.test.ts -t "E2E" --no-coverage --verbose 2>&1`
- **Target:** "PASS" with at least one test asserting merge order; no skipped assertions (no expect.assertions(0))
- **Evidence:** REQ-178 requires proving merge-in-completion-order; this is the direct test for it
- **Correlation with full metric:** HIGH — the assertion directly validates the merge queue ordering guarantee
- **Blind spots:** Mocked git/gh operations mean this does not test real network or git behavior
- **Validated:** No — real git ordering validated at D1 (manual review)

### P5: Full npm test suite passes
- **What:** All test files across the project continue to pass with no regressions
- **How:** Run the full test suite with coverage
- **Command:** `npm test 2>&1 | tail -20`
- **Expected:** "Test Suites: N passed", exit 0, no coverage threshold failures
- **Evidence:** CLAUDE.md specifies npm test as the primary CI gate; any threshold failure surfaces here
- **Correlation with full metric:** HIGH — this is the actual CI gate
- **Blind spots:** Does not distinguish phase 91 contributions from pre-existing tests
- **Validated:** No — this is the definitive pass/fail gate

### P6: mergeQueue serialization test demonstrates non-interleaved merge calls
- **What:** The two-pipeline serialization test (91-01 Task 2, test 2) verifies gh pr merge calls are never interleaved between phases
- **How:** Run the mergeQueue group test and verify the call-order array assertion
- **Command:** `npx jest tests/unit/autopilot.test.ts -t "mergeQueue" --no-coverage --verbose 2>&1`
- **Target:** All mergeQueue tests pass; the two-pipeline test shows ordered non-interleaved completion
- **Evidence:** 91-01-PLAN.md specifies: "Assert: gh pr merge calls happen sequentially (never interleaved)" — the test directly encodes this
- **Correlation with full metric:** HIGH for the serialization property specifically; MEDIUM for real-world concurrent safety
- **Blind spots:** In-process Promise scheduling is deterministic in Jest; real OS scheduling may produce different interleavings
- **Validated:** No — awaiting D1

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring resources or context not available during automated test execution.

### D1: Manual coverage spot-check on new pipeline code lines — DEFER-91-01
- **What:** Human review of the lcov coverage report confirming lines 130-700 of lib/autopilot.ts are covered at 85%+ individually, not just in aggregate
- **How:** Open coverage/lcov-report/lib/autopilot.ts.html; scan for uncovered red lines in the createMergeQueue, spawnStep, runPostPhasePipeline, and getConflictingFiles functions
- **Why deferred:** The automated P2 proxy infers coverage but does not isolate a precise line range; visual inspection is needed to confirm no critical branch (e.g., scheduler path, getConflictingFiles error catch) is missed
- **Validates at:** Manual review after 91-03 execution completes
- **Depends on:** npm test passing with lcov reporter output present in coverage/
- **Target:** No red (uncovered) lines in the four named functions that represent intentional behavior (vs defensive fallbacks)
- **Risk if unmet:** A critical pipeline path (e.g., scheduler-aware spawnStep) could fail in production autopilot runs with no test signal. Mitigation: add targeted tests for uncovered branches before closing phase 91.
- **Fallback:** If coverage is below 85%, 91-03-PLAN.md Task 2 prescribes adding targeted tests for the scheduler path, timeout conversion, and error catch branches.

## Ablation Plan

**No ablation plan** — This phase adds tests to an existing implementation; it does not introduce sub-components with isolatable contributions. The analog of ablation here is the per-describe test group (runPostPhasePipeline / createMergeQueue / parseWriteIntent / buildWaves / E2E), each of which can be run in isolation via jest -t to identify which component's tests are failing.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| lib/autopilot.ts lines | Pre-phase line coverage threshold | >= 83% | jest.config.js |
| lib/autopilot.ts functions | Pre-phase function coverage threshold | >= 93% | jest.config.js |
| lib/autopilot.ts branches | Pre-phase branch coverage threshold | >= 76% | jest.config.js |
| autopilot.test.ts it() count | Pre-phase test case count | 219 | grep -c "  it(" (eval_context) |
| Total test suite | Pre-phase passing state | All green | fb829c8 commit (208 tests passing) |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/autopilot.test.ts  (extended by this phase)
jest.config.js                (thresholds ratcheted in 91-03)
```

**How to run full evaluation:**
```bash
# Sanity gates
npx jest tests/unit/autopilot.test.ts --no-coverage
npm run build:check
npm run lint

# Proxy metrics — coverage
npx jest tests/unit/autopilot.test.ts --coverage --coverageReporters=text 2>&1 | grep "autopilot.ts"

# Proxy metrics — E2E isolation
npx jest tests/unit/autopilot.test.ts -t "E2E" --no-coverage --verbose

# Full suite (definitive gate)
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Test file runs without crash | [PASS/FAIL] | | |
| S2: Pipeline result shapes defined | [PASS/FAIL] | | |
| S3: Existing tests do not regress | [PASS/FAIL] | | |
| S4: TypeScript compilation clean | [PASS/FAIL] | | |
| S5: Lint clean | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: autopilot.ts lines | >= 83% | | [MET/MISSED] | |
| P1: autopilot.ts functions | >= 93% | | [MET/MISSED] | |
| P1: autopilot.ts branches | >= 76% | | [MET/MISSED] | |
| P2: New pipeline code lines | >= 85% | | [MET/MISSED] | |
| P3: New it() count | >= 242 total | | [MET/MISSED] | |
| P4: E2E merge order assertion | passes | | [MET/MISSED] | |
| P5: Full npm test | passes | | [MET/MISSED] | |
| P6: mergeQueue serialization | passes | | [MET/MISSED] | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-91-01 | Manual coverage spot-check (lines 130-700) | PENDING | Manual review post 91-03 |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: adequate — five independent fast checks covering execution, shape, regression, types, and lint
- Proxy metrics: well-evidenced — P1/P5 are directly enforced by jest.config.js (not inferred); P4/P6 directly encode the REQ-178 ordering guarantee; P2 is the only metric requiring inference about a line range
- Deferred coverage: minimal but honest — only one deferred item, and it has a clear fallback path

**What this evaluation CAN tell us:**
- Whether the new tests execute and pass without breaking existing tests
- Whether overall coverage thresholds on lib/autopilot.ts are met or exceeded
- Whether the merge queue ordering guarantee is encoded and verified in the E2E test
- Whether TypeScript strict mode and ESLint are satisfied

**What this evaluation CANNOT tell us:**
- Whether the tests are semantically meaningful (a test can hit a line without an assertion) — addressed partially by D1 spot-check
- Whether the mocked git/gh behavior accurately represents real git behavior — by design, this phase uses mocks; real behavior was established in phases 87-90
- Whether coverage on the specific new pipeline code lines (130-700) meets 85% — inferred by P2 but confirmed only by D1

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-24*
