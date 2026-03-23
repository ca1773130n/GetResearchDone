# Evaluation Plan: Phase 86 — Elicitation Detection and Resolution Core

**Designed:** 2026-03-24
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** detectElicitation(), buildElicitationContext(), resolveElicitation()
**Reference source:** Plans 86-01, 86-02 (REQ-150, REQ-151, REQ-152, REQ-157)

## Evaluation Overview

Phase 86 introduces three core primitives for autonomous elicitation replacement: a detection function that identifies questions in subprocess output, a context builder that packages project state for discussion participants, and a resolver that routes questions through multi-backend discussion. This is a pure TypeScript/Jest phase — no ML models, no external benchmarks. Every metric traces directly to the requirements and the project's established testing conventions.

The evaluation is heavily weighted toward unit tests because this phase is intentionally isolated. There is no meaningful integration to test at this stage — the integration surface (hooking detection into the execution pipeline) is deferred to a later phase. Proxy metrics are well-evidenced: Jest coverage maps directly to the requirement for 90%+ line coverage, and lint/type-check are prerequisites for any production merge. False positive and true positive behavior of `detectElicitation()` is tested exhaustively at the unit level, which is the correct verification level for regex-based pattern matching.

The main deferred risk is whether `resolveElicitation()` produces useful answers in production — the unit tests mock `runDiscussion()`, so real multi-backend routing quality is not evaluated here.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Unit test pass rate | REQ-157, plan conventions | All specified behaviors must have passing tests |
| Line coverage >= 90% (new code) | REQ-157 explicit requirement | Ensures detection patterns and edge cases are exercised |
| Line coverage >= 85% (discussion.ts overall) | jest.config.js per-file threshold | Project-enforced threshold, must not regress |
| Type-check passes | Code style conventions (strict: true) | TypeScript strict mode is non-negotiable in this codebase |
| Lint pass (zero errors) | PRODUCT-QUALITY.md P1 metric | ESLint on bin/ and lib/ is part of every phase gate |
| Context output < 32K chars | REQ-151 (under 8K tokens) | Hard token budget constraint |
| False positive rejection (code comments, strings, headers, code blocks) | Plan 86-01 must_haves | Core correctness requirement for detection reliability |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 4 | Basic functionality: types compile, functions export, no crashes |
| Proxy (L2) | 6 | Test coverage, lint, false positive/positive counts, context budget |
| Deferred (L3) | 2 | Real discussion quality, integration into execution pipeline |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Type-check passes with no errors

- **What:** TypeScript strict-mode compile succeeds after ElicitationDetection type and all new functions are added
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no errors or warnings to stdout
- **Failure means:** Type signature mismatch, missing export, or import cycle — implementation is broken before tests even run

### S2: Functions export correctly

- **What:** All three new exports are resolvable from lib/discussion.ts
- **Command:** `node -e "const d = require('./lib/discussion'); console.log(typeof d.detectElicitation, typeof d.buildElicitationContext, typeof d.resolveElicitation)"`
- **Expected:** `function function function`
- **Failure means:** module.exports was not updated for one or more functions

### S3: ElicitationDetection type is exported from lib/types.ts

- **What:** The interface is importable and has the required fields (question, patterns, confidence)
- **Command:** `npm run build:check` (type-check exercises all import type usages)
- **Expected:** No TS2305/TS2339 errors referencing ElicitationDetection
- **Failure means:** Type definition is missing or field names differ from what tests and callers expect

### S4: Detection function does not crash on edge inputs

- **What:** detectElicitation() handles empty string, null-like input, and very long strings without throwing
- **Command:** `node -e "const {detectElicitation} = require('./lib/discussion'); console.log(detectElicitation(''), detectElicitation('no questions here'), detectElicitation('x'.repeat(10000)))"`
- **Expected:** `null null null` (or a detection for the repeated string — no crash either way)
- **Failure means:** Unguarded input parsing, regex catastrophic backtracking risk

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and quality.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full integration evaluation. Unit test mocks do not exercise real discussion routing.

### P1: Unit tests — all pass

- **What:** Every test in the detectElicitation, buildElicitationContext, and resolveElicitation describe blocks passes
- **How:** Run Jest on the discussion test file
- **Command:** `npx jest tests/unit/discussion.test.ts --no-coverage`
- **Target:** 0 failures, 0 skipped
- **Evidence:** Plan 86-01 and 86-02 enumerate exact test cases required; passing them is a direct proxy for correctness of the regex patterns and edge case handling
- **Correlation with full metric:** HIGH — unit tests directly exercise the specified behaviors
- **Blind spots:** Tests mock runDiscussion() so real multi-backend round-trip quality is not verified
- **Validated:** No — awaiting deferred validation at phase-88-or-integration

### P2: Line coverage >= 90% on new detection code

- **What:** detectElicitation() code paths in lib/discussion.ts are 90%+ covered
- **How:** Jest coverage collected only on lib/discussion.ts
- **Command:** `npx jest tests/unit/discussion.test.ts --coverage --collectCoverageFrom='lib/discussion.ts'`
- **Target:** >= 90% lines for the detectElicitation function specifically; >= 85% overall for lib/discussion.ts
- **Evidence:** REQ-157 explicitly requires 90%+ coverage; plan 86-01 done criteria restate this threshold
- **Correlation with full metric:** HIGH — coverage directly measures whether true/false positive branches are exercised
- **Blind spots:** Coverage does not measure quality of assertions, only that code was reached
- **Validated:** No

### P3: Full test suite passes without regression

- **What:** Adding new code to lib/discussion.ts and tests/unit/discussion.test.ts does not break existing tests
- **How:** Run full Jest suite
- **Command:** `npm test`
- **Target:** All existing tests pass; total test count does not decrease
- **Evidence:** Project convention — every phase must leave the test suite green
- **Correlation with full metric:** HIGH — regression indicates a breakage in an existing contract
- **Blind spots:** Does not cover integration with other modules not in the test suite
- **Validated:** No

### P4: Lint passes with zero errors

- **What:** ESLint finds no errors in bin/ and lib/ after changes
- **How:** Run ESLint
- **Command:** `npm run lint`
- **Target:** 0 errors, 0 warnings (--max-warnings 0 per project style)
- **Evidence:** PRODUCT-QUALITY.md P1 metric; project code style mandates zero lint errors before merge
- **Correlation with full metric:** HIGH — direct code quality gate
- **Blind spots:** Lint does not catch logic errors, only style and simple semantic issues
- **Validated:** No

### P5: False positive rejection rate on specified negative cases

- **What:** detectElicitation() returns null for all 8 false-positive test cases specified in Plan 86-01
- **How:** Covered by unit tests (P1), but broken out explicitly for traceability
- **Command:** `npx jest tests/unit/discussion.test.ts -t "should return null"`
- **Target:** All false-positive tests pass (0 failures in this group)
- **Evidence:** Plan 86-01 false positive list: code comments, markdown headers, string literals, code blocks, error/stack traces, rhetorical questions, empty string, normal output
- **Correlation with full metric:** MEDIUM — unit test inputs are constructed; real subprocess output distributions differ
- **Blind spots:** Real agent output may contain patterns not covered by the 8 specified cases
- **Validated:** No — awaiting real-world execution in later phase

### P6: buildElicitationContext() output stays within 32K char budget

- **What:** Context string length never exceeds ~32,000 characters (~8K tokens)
- **How:** Unit test asserts `output.length < 32000`
- **Command:** `npx jest tests/unit/discussion.test.ts -t "output length"`
- **Target:** output.length < 32000 in all test conditions
- **Evidence:** REQ-151 hard requirement; plan 86-02 test list includes this assertion explicitly
- **Correlation with full metric:** HIGH — length is directly measurable; tokenizer differences are minor at this scale
- **Blind spots:** Token count depends on tokenizer; 32K chars is a safe approximation but not exact
- **Validated:** No

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration not available in this phase.

### D1: Real discussion quality from resolveElicitation() — DEFER-86-01

- **What:** Whether resolveElicitation() produces decision-quality answers on real elicitation questions from actual agent subprocess output
- **How:** Run the full execution pipeline with a real multi-backend discussion and measure whether the returned answer unblocks the agent without human input
- **Why deferred:** resolveElicitation() calls runDiscussion() which requires real backends (claude, codex, etc.) to be available; unit tests mock this layer. Discussion quality is subjective and cannot be measured with unit tests.
- **Validates at:** phase-88-or-integration (first phase that wires detection into the executor)
- **Depends on:** Full execution pipeline with elicitation hook integrated, at least 2 backends available for discussion
- **Target:** Returned answer must be non-empty and actionable (human reviewer confirms); <5% empty-string returns on real elicitations
- **Risk if unmet:** resolveElicitation() may need prompt engineering changes to the discussion context or a different routing strategy; budget 0.5 additional phase for tuning
- **Fallback:** Fall back to user prompt if resolveElicitation() returns empty string — this is already specified in REQ-152 as acceptable

### D2: False positive rate on real agent output — DEFER-86-02

- **What:** Whether detectElicitation() false-positive rate is acceptably low on real subprocess output (not just the 8 constructed test cases)
- **How:** Collect 100+ samples of real agent stdout during a GRD execution run; count false positives manually or with a labeling script
- **Why deferred:** Real agent output distribution is only available when the detection hook is wired into the executor in a later phase
- **Validates at:** phase-88-or-integration
- **Depends on:** Execution pipeline instrumented to log all detectElicitation() inputs and outputs
- **Target:** False positive rate < 2% on real output samples (defined as: detectElicitation() returns non-null for output that did not require user input)
- **Risk if unmet:** Spurious discussion round-trips will slow execution and produce noise; detection patterns may need tuning
- **Fallback:** Add a confidence threshold gate (only route 'high' confidence detections, ignore 'medium')

---

## Ablation Plan

**No ablation plan** — This phase implements three distinct functions with no sub-components to isolate against each other. The detection pattern priority order (direct question > numbered options > clarification phrases > option prompt) is specified in Plan 86-01 and tested directly in unit tests. Ablation is not applicable at the unit test level.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| lib/discussion.ts coverage | Pre-phase line coverage on discussion.ts | >= 85% (project threshold) | jest.config.js per-file thresholds |
| npm test (total tests) | Existing test count before phase | Not to decrease | BASELINE.md / existing test run |
| Lint error count | ESLint errors before phase | 0 (lint was clean before this phase) | PRODUCT-QUALITY.md P1 |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/discussion.test.ts  (new describe blocks for detectElicitation, buildElicitationContext, resolveElicitation)
lib/discussion.ts              (implementation under test)
lib/types.ts                   (ElicitationDetection interface)
```

**How to run full evaluation:**
```bash
# Sanity: type check
npm run build:check

# Sanity: exports
node -e "const d = require('./lib/discussion'); console.log(typeof d.detectElicitation, typeof d.buildElicitationContext, typeof d.resolveElicitation)"

# Proxy: unit tests only
npx jest tests/unit/discussion.test.ts --no-coverage

# Proxy: coverage on discussion.ts
npx jest tests/unit/discussion.test.ts --coverage --collectCoverageFrom='lib/discussion.ts'

# Proxy: full suite (regression check)
npm test

# Proxy: lint
npm run lint
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Type-check | | | |
| S2: Functions export | | | |
| S3: ElicitationDetection type | | | |
| S4: Edge input crash test | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: All unit tests pass | 0 failures | | | |
| P2: Coverage (detectElicitation) | >= 90% lines | | | |
| P2: Coverage (discussion.ts overall) | >= 85% lines | | | |
| P3: Full suite passes | 0 regressions | | | |
| P4: Lint | 0 errors | | | |
| P5: False positive rejection (8 cases) | All pass | | | |
| P6: Context output < 32K chars | < 32000 chars | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-86-01 | resolveElicitation() real discussion quality | PENDING | phase-88-or-integration |
| DEFER-86-02 | detectElicitation() false positive rate on real output | PENDING | phase-88-or-integration |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — type-check and export validation catch the most common implementation mistakes
- Proxy metrics: Well-evidenced — unit test coverage maps directly to the stated requirement (REQ-157 90%+ coverage); all proxy metrics have exact commands and thresholds derived from project conventions or explicit requirements
- Deferred coverage: Partial but honestly scoped — real discussion quality and production false-positive rate cannot be evaluated without the integration wiring that comes in a later phase

**What this evaluation CAN tell us:**
- Whether the detection logic correctly handles all 7 true positive patterns and 8 false positive patterns specified in the plans
- Whether the context builder respects the 8K token budget in all test conditions
- Whether the resolver handles all edge cases (no participants, synthesis failure, runDiscussion throws)
- Whether the implementation is type-safe and lint-clean

**What this evaluation CANNOT tell us:**
- Whether `resolveElicitation()` produces answers that actually unblock a real agent (deferred to DEFER-86-01 at phase-88)
- Whether `detectElicitation()` false-positive rate is acceptable on real subprocess output distributions (deferred to DEFER-86-02 at phase-88)
- Whether the 8K token context budget is sufficient for discussion participants to give useful answers (deferred to DEFER-86-01)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-24*
