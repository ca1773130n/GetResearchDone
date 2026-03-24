# Evaluation Plan: Phase 92 — CFG Formalization

**Designed:** 2026-03-24
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Plan Artifact Schema (REQ-179), Pre-Flight Validation Gate (REQ-180), CFG Validation Tests (REQ-181)
**Reference papers:** None — this phase implements internal validation infrastructure from first principles

## Evaluation Overview

Phase 92 delivers three interlocking pieces: a typed `lib/invariants.ts` module with structural, semantic, and cross-phase validators; a wired-in gate in `lib/gates.ts` and `agents/grd-plan-checker.md` that hard-rejects invalid plans before execution; and a unit test suite achieving 90%+ coverage of the new module. The evaluation design matches this tripartite structure — each plan is evaluated independently at sanity and proxy levels, with cross-plan integration tested via the full test suite.

The critical "does it actually work" question for this phase is answered fully at Level 2: the unit tests in Plan 92-03 ARE the deferred validation for Plans 92-01 and 92-02. Since all three plans land in the same phase, there is no need to defer coverage to a later milestone. The deferred tier is used only for real-world behavioral validation — confirming that the gate actually blocks a malformed plan during a live `gd plan-phase` or `gd execute-phase` invocation.

No external benchmarks apply. The quality bar is set by the project's own established thresholds from `jest.config.js` (90% lines for new modules, consistent with `lib/gates.ts` at 98% and `lib/autoplan.ts` at 90%) and from `PRODUCT-QUALITY.md` (>= 80% overall coverage target, ESLint zero-errors, TypeScript strict-mode).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| `npm run build:check` passes | PRODUCT-QUALITY.md P0 — TypeScript strict | Every lib/ module must type-check cleanly |
| `npm run lint` passes | PRODUCT-QUALITY.md P1 — ESLint zero-errors | Enforced as pre-commit hook; no exceptions |
| `npm test` passes | PRODUCT-QUALITY.md P0 — >= 80% coverage | Tests are the primary quality gate |
| `lib/invariants.ts` line coverage >= 90% | Plan 92-03 must_haves + jest.config.js peer thresholds | Matches threshold tier for comparable modules (gates.ts: 98%, autoplan.ts: 90%) |
| validateStructural/validateSemantic/validateCrossPhase exported with typed ValidationResult | Plan 92-01 must_haves.truths | Directly observable — grep + build:check |
| `grd-plan-checker` hard-rejects missing objective | Plan 92-02 must_haves.truths | Behavioral correctness — core purpose of REQ-180 |
| `invariant-validation` gate in GATE_REGISTRY | Plan 92-02 must_haves.truths | Structural wiring — observable by grep |
| validateResearchArtifacts checks LANDSCAPE/PAPERS/RESEARCH | Plans 92-01 and 92-02 must_haves | Research artifact quality gate for future phases |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic functionality, format, and lint |
| Proxy (L2) | 5 | Test coverage, export presence, gate wiring |
| Deferred (L3) | 2 | Live behavioral validation requiring runtime execution |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript compilation
- **What:** `lib/invariants.ts` and `lib/types.ts` additions compile under strict TypeScript
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check`
- **Expected:** Exit code 0, zero type errors
- **Failure means:** Type errors in the new module or types.ts — cannot proceed; implementation has a type defect

### S2: Lint passes on new and modified files
- **What:** `lib/invariants.ts`, `lib/types.ts`, `lib/gates.ts`, `agents/grd-plan-checker.md` pass ESLint
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint`
- **Expected:** Exit code 0, zero errors, zero warnings
- **Failure means:** Code style violation or rule breach in new code — must fix before commit (pre-commit hook enforces this)

### S3: Test file exists and is importable
- **What:** `tests/unit/invariants.test.ts` can be loaded by Jest without syntax errors
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/invariants.test.ts --no-coverage --listTests`
- **Expected:** Path printed, exit code 0
- **Failure means:** File missing or has parse-level error — Plan 92-03 not yet executed or has a syntax defect

### S4: Unit tests pass without coverage enforcement
- **What:** All test cases in `tests/unit/invariants.test.ts` pass
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/invariants.test.ts --no-coverage`
- **Expected:** All tests green, zero failures, zero timeouts (15s per test limit)
- **Failure means:** A validation function has a behavioral defect — diagnose which describe block fails and trace to lib/invariants.ts

### S5: Invariants module exports all five functions
- **What:** All exports declared in Plan 92-01 are present in the compiled module
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const m = require('./lib/invariants'); console.log(Object.keys(m).sort().join(','))"`
- **Expected:** Output contains `extractPlanArtifact,validateCrossPhase,validateResearchArtifacts,validateSemantic,validateStructural` (all five, sorted)
- **Failure means:** One or more exports missing — either not implemented or not included in module.exports

### S6: ValidationResult shape is correct
- **What:** validateStructural returns an object with `valid`, `errors`, `warnings` fields of correct types
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const { validateStructural } = require('./lib/invariants'); const r = validateStructural({ objective:'', files_modified:[], phase:'', plan:1, type:'execute', wave:1, depends_on:[], autonomous:true, provides:[], requires:[], integration_points:[] }); console.log(typeof r.valid, Array.isArray(r.errors), Array.isArray(r.warnings))"`
- **Expected:** `boolean true true`
- **Failure means:** Return shape does not match ValidationResult interface — downstream consumers will fail

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality and integration completeness.
**IMPORTANT:** Proxy metrics approximate but do not replace full end-to-end behavioral testing. Treat results with appropriate skepticism until deferred validations are cleared.

### P1: Full test suite passes with coverage thresholds
- **What:** `npm test` passes all 25+ invariants test cases AND the existing test suite, with `lib/invariants.ts` at 90%+ line coverage
- **How:** Run full Jest suite with coverage collection
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test`
- **Target:** Exit code 0; coverage report shows `lib/invariants.ts` >= 90% lines, >= 90% functions, >= 90% statements, >= 85% branches
- **Evidence:** Plan 92-03 must_haves require this threshold; `jest.config.js` peer modules (autoplan.ts, scaffold.ts, overstory.ts) all use 90% line thresholds for similar-complexity modules
- **Correlation with full metric:** HIGH — test coverage directly measures which code paths are exercised by the test suite
- **Blind spots:** Coverage does not verify that tests are semantically correct, only that lines are reached. A test that calls `validateStructural` and ignores the result counts as covered.
- **Validated:** No — pending deferred behavioral validation

### P2: Gate wiring confirmed in lib/gates.ts
- **What:** `invariant-validation` gate name is present in GATE_REGISTRY for both `plan-phase` and `execute-phase` commands
- **How:** Grep source file
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && grep -n "invariant-validation" lib/gates.ts`
- **Target:** At least 2 matches — one in the plan-phase array, one in the execute-phase array
- **Evidence:** Plan 92-02 must_haves.truths explicitly requires this wiring; the gate system pattern is established in the existing `GATE_REGISTRY` constant
- **Correlation with full metric:** HIGH — gate name presence in the registry is a direct structural requirement, not a proxy
- **Blind spots:** Presence in the array does not guarantee the gate function is correctly implemented — covered by P1 (unit tests)
- **Validated:** No — behavioral test via live invocation is deferred

### P3: grd-plan-checker has Dimension 9
- **What:** `agents/grd-plan-checker.md` references all three validator function names in the new dimension
- **How:** Grep agent file for function names
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && grep -c "validateStructural\|validateSemantic\|validateCrossPhase" agents/grd-plan-checker.md`
- **Target:** Count >= 3 (each function name appears at least once)
- **Evidence:** Plan 92-02 must_haves.truths requires all three validators to be referenced; Plan 92-02 key_links specifies the pattern `validateStructural|validateSemantic|validateCrossPhase`
- **Correlation with full metric:** MEDIUM — presence in agent prompt is necessary but not sufficient; the agent must also correctly invoke them at runtime
- **Blind spots:** Markdown text referencing function names does not guarantee the agent will correctly interpret and apply the validation logic. Agent prompts are evaluated at runtime, not statically.
- **Validated:** No — agent behavior deferred to D2

### P4: lib/invariants.ts meets minimum size requirement
- **What:** `lib/invariants.ts` has at least 120 lines of implementation (not just comments)
- **How:** Count lines
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && wc -l lib/invariants.ts`
- **Target:** >= 120 lines total (Plan 92-01 must_haves.artifacts specifies `min_lines: 120`)
- **Evidence:** Plan 92-01 artifacts specify minimum line count as a proxy for implementation completeness; a 120-line module is the minimum to implement five functions with error/warning handling
- **Correlation with full metric:** LOW — line count correlates with implementation completeness but is not a direct quality measure; a padded file with empty stubs would pass
- **Blind spots:** Does not measure logic correctness, only presence of code. P1 (test coverage) is the real measure.
- **Validated:** No

### P5: tests/unit/invariants.test.ts has 25+ test cases
- **What:** Test count meets Plan 92-03's specification of 25+ test cases
- **How:** Count test cases by grepping for `it(` and `test(` patterns
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && grep -c "^\s*\(it\|test\)(" tests/unit/invariants.test.ts 2>/dev/null || echo 0`
- **Target:** >= 25
- **Evidence:** Plan 92-03 must_haves specify test case count requirement; test count correlates with edge case coverage
- **Correlation with full metric:** MEDIUM — count alone does not measure quality, but fewer than 25 tests would leave known edge cases uncovered per the task specifications
- **Blind spots:** Does not measure test quality or whether edge cases are correctly asserted
- **Validated:** No

## Level 3: Deferred Validations

**Purpose:** Full behavioral validation requiring live execution that cannot be fully automated via unit tests.

### D1: Gate blocks a malformed plan during live `gd plan-phase` invocation — DEFER-92-01
- **What:** Running `gd plan-phase <phase>` where phase plans have missing objectives or unsatisfied requires actually produces a hard rejection with structured error output
- **How:** Create a temporary phase directory with a deliberately malformed PLAN.md (no `<objective>` tag, or a `requires` entry with no matching `provides` in any sibling plan). Run `gd plan-phase <test-phase>` and verify it exits non-zero with a descriptive error.
- **Why deferred:** Requires a live CLI invocation and a test phase directory with known-bad plans. This is an integration test not covered by unit tests, which mock file I/O.
- **Validates at:** milestone-v0.3.23-integration or next available integration test run
- **Depends on:** `lib/invariants.ts` complete (Plan 92-01), `lib/gates.ts` wired (Plan 92-02), `gd` CLI functional
- **Target:** Non-zero exit code; stderr or stdout contains error message identifying the specific invariant failure (e.g., "INVARIANT_STRUCTURAL: objective is missing")
- **Risk if unmet:** The gate is wired but silently passes all plans — REQ-180 is superficially satisfied but provides no actual protection. Impact: medium-high (users gain false confidence in plan validity).
- **Fallback:** If gate function returns violations but they are not surfaced to the user, add error-reporting integration in `runPreflightGates`

### D2: grd-plan-checker agent correctly applies Dimension 9 during a real plan check invocation — DEFER-92-02
- **What:** When `grd-plan-checker` agent is invoked on a phase with research artifacts, it correctly identifies and reports missing RESEARCH.md sections, LANDSCAPE.md table rows, and plan structural errors
- **How:** Spawn `grd-plan-checker` on a known phase with intentional violations (missing `## Method` section in RESEARCH.md, or a plan with `requires` not satisfied). Confirm the output lists the specific violations under "Dimension 9: Invariant Validation".
- **Why deferred:** Agent behavior depends on LLM interpretation of prompt instructions at runtime. Static content analysis (P3) confirms the instructions are present but cannot verify they are correctly followed.
- **Validates at:** Next full planning run on any real milestone phase (milestone v0.3.23 or v0.3.24)
- **Depends on:** `grd-plan-checker.md` updated (Plan 92-02), `lib/invariants.ts` built (Plan 92-01)
- **Target:** Dimension 9 section present in checker output; violations from intentionally-malformed test fixtures are reported; well-formed plans produce no Dimension 9 errors
- **Risk if unmet:** Research artifact validation silently passes without checking — REQ-180's research compliance sub-requirement is unsatisfied. Impact: medium (research quality gate does not catch structural defects in LANDSCAPE/PAPERS/RESEARCH files).
- **Fallback:** Add explicit validation step in grd-executor agent as a fallback call to validateResearchArtifacts before executing phases

## Ablation Plan

**No ablation plan** — Phase 92 implements three coordinated components (types, validation functions, gate wiring) with no sub-components to isolate independently. The cross-plan dependency structure (92-01 -> 92-02, 92-01 -> 92-03) means each plan's contribution is measured by whether its downstream plans pass, which is covered by the unit test suite (P1).

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| npm run build:check (pre-phase) | TypeScript compiles cleanly before any changes | 0 errors | Established — project is in clean state per git status |
| npm run lint (pre-phase) | ESLint zero errors before any changes | 0 errors | Established — pre-commit hook enforces this on existing code |
| npm test (pre-phase) | All existing tests pass before phase 92 begins | All green | Established — existing per-file thresholds in jest.config.js |
| lib/invariants.ts (pre-phase) | File does not exist | N/A (new file) | git status confirms no lib/invariants.ts yet |
| Coverage threshold pattern | Comparable modules in jest.config.js use 90% lines for medium-complexity modules | autoplan.ts: 90%, scaffold.ts: 90%, gates.ts: 98% | jest.config.js existing thresholds |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/invariants.test.ts  (created by Plan 92-03)
lib/invariants.ts              (created by Plan 92-01)
```

**How to run full evaluation:**
```bash
# All checks in sequence
cd /Users/neo/Developer/Projects/GetResearchDone

# L1: Sanity
npm run build:check
npm run lint
node -e "const m = require('./lib/invariants'); console.log(Object.keys(m).sort().join(','))"

# L2: Proxy
npm test
grep -n "invariant-validation" lib/gates.ts
grep -c "validateStructural\|validateSemantic\|validateCrossPhase" agents/grd-plan-checker.md
wc -l lib/invariants.ts

# Full suite with coverage (confirms P1)
npx jest tests/unit/invariants.test.ts --coverage
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compilation | [PASS/FAIL] | | |
| S2: Lint passes | [PASS/FAIL] | | |
| S3: Test file importable | [PASS/FAIL] | | |
| S4: Unit tests pass | [PASS/FAIL] | | |
| S5: Five exports present | [PASS/FAIL] | | |
| S6: ValidationResult shape | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: npm test + coverage | 90% lines, all green | | [MET/MISSED] | |
| P2: Gate wiring in gates.ts | >= 2 matches | | [MET/MISSED] | |
| P3: Dimension 9 in plan-checker | >= 3 function refs | | [MET/MISSED] | |
| P4: lib/invariants.ts min lines | >= 120 | | [MET/MISSED] | |
| P5: Test case count | >= 25 | | [MET/MISSED] | |

### Ablation Results

No ablation conditions defined.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-92-01 | Gate blocks malformed plan in live CLI | PENDING | milestone-v0.3.23-integration |
| DEFER-92-02 | grd-plan-checker Dimension 9 fires on violations | PENDING | next full planning run (v0.3.23 or v0.3.24) |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: adequate — six checks cover the full surface area of new code (type safety, lint, exports, runtime shape). All are runnable in seconds with exact commands.
- Proxy metrics: well-evidenced — P1 (unit tests with coverage) directly measures implementation completeness. The 90% threshold is calibrated against existing comparable modules in jest.config.js. P2 and P3 are structural checks that are necessary conditions for the gate to function. P4 and P5 are lightweight confirmations of specification adherence.
- Deferred coverage: partial but acceptable — D1 (live gate blocking) is the most important behavioral validation and is clearly bounded: it validates as soon as any integration test invokes the CLI on a phase. D2 (agent behavior) is inherently difficult to automate and is correctly deferred to runtime observation.

**What this evaluation CAN tell us:**
- Whether `lib/invariants.ts` is correctly typed and compiles cleanly (S1, P1)
- Whether all five validation functions have the correct export contract and return shape (S5, S6)
- Whether the test suite covers the full specification including all edge cases (P1, P5)
- Whether the gate is structurally wired in the right places (P2)
- Whether the agent prompt contains the required invariant validation instructions (P3)

**What this evaluation CANNOT tell us:**
- Whether the gate produces user-visible error messages in the right format during live CLI invocations (deferred to D1, validates at integration)
- Whether the LLM agent correctly interprets and applies Dimension 9 instructions when reasoning about a real phase (deferred to D2, validates at next planning run)
- Whether validateSemantic's file path heuristics produce acceptable false-positive rates on real project structures (no proxy available — would require corpus of real phase directories)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-24*
