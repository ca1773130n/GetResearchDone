# Evaluation Plan: Phase 97 — Transitive Citation Graph Traversal

**Designed:** 2026-03-25
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** BFS citation graph traversal, external paper auto-retrieval (arXiv/Semantic Scholar), transitive citation gate
**Reference papers:** None — this phase implements original infrastructure (no paper benchmarks applicable)

## Evaluation Overview

Phase 97 is a pure engineering phase: it extends `lib/citations.ts` with BFS-based transitive traversal and external auto-retrieval, adds a transitive citation gate to `lib/gates.ts`, and wires the new capability into `grd-phase-researcher`. There are no published benchmarks or paper results to reproduce — the evaluation is entirely structural: does the code do what the specifications require, does it maintain existing coverage thresholds, and does the integration pipeline behave correctly end-to-end?

The three waves of this phase create a natural evaluation tier structure. Wave 1 (Plan 01) is verifiable entirely by unit tests. Wave 2 (Plan 02) adds external API interaction, which is fully testable via injectable mock fetch functions following the existing `resolveCitations` pattern. Wave 3 (Plan 03) introduces integration-level verification via a pipeline test and agent document inspection.

No proxy metrics are invented. The evaluation relies on: type safety (TypeScript compiler), unit test coverage against established thresholds, behavioral correctness via integration tests, and structural checks against plan artifacts. Deferred validation is limited to real-network behavior of arXiv/Semantic Scholar fetchers and production use of the researcher agent — both are low-risk given the injectable fetch pattern that fully covers the logic paths in tests.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| `lib/citations.ts` line coverage >= 85% | `jest.config.js` existing threshold (Phase 93) | Maintains regression protection as new functions are added |
| `lib/citations.ts` function coverage >= 85% | `jest.config.js` existing threshold | Ensures new exports (traverseCitationGraph, resolveTransitiveDeps, fetchExternalPaper) are tested |
| `lib/citations.ts` branch coverage >= 75% | `jest.config.js` existing threshold | Cycle detection and guard branches must be exercised |
| `lib/gates.ts` line/function/branch coverage = 100/100/81% | `jest.config.js` existing threshold | Gates module is 100% lines/functions — new transitive gate must maintain this |
| TypeScript strict build passes | Project convention (strict: true) | Phase adds new interfaces and typed requires; type errors surface mismatches early |
| ESLint passes | Project convention | Consistent code style, catches unused vars and other structural issues |
| Integration test: full pipeline | Plan 03 success criteria | Validates the three-phase chain (buildCitationGraph -> traverseCitationGraph -> resolveTransitiveDeps) works as a unit |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic functionality: exports exist, types valid, pipeline compiles, no crashes |
| Proxy (L2) | 5 | Test coverage thresholds, behavioral correctness, integration pipeline |
| Deferred (L3) | 2 | Real network calls, production agent behavior |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript type check passes

- **What:** All new interfaces (TraversalOptions, TraversalResult) and function signatures are type-valid under `strict: true`
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check 2>&1 | tail -5`
- **Expected:** No output (zero errors); last line is blank or empty
- **Failure means:** Type mismatch in new interfaces or function signatures — implementation does not match declared types

### S2: ESLint passes on modified files

- **What:** lib/citations.ts, lib/gates.ts, lib/types.ts, lib/context/execute.ts contain no lint errors
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint 2>&1 | tail -5`
- **Expected:** No errors reported; `0 errors` or clean exit
- **Failure means:** Unused variables, incorrect patterns, or style violations in new code

### S3: New exports present in citations.ts

- **What:** lib/citations.ts exports exactly the new functions required by Plans 01 and 02
- **Command:** `node -e "const c = require('./lib/citations'); console.log(Object.keys(c).sort().join(','))" 2>&1`
- **Run from:** `/Users/neo/Developer/Projects/GetResearchDone`
- **Expected:** Output includes `fetchExternalPaper,traverseCitationGraph,resolveTransitiveDeps` alongside the existing 5 exports (parseMissingComponents, parseBorrowedComponents, buildCitationGraph, resolveCitations, findUnresolved)
- **Failure means:** Function not exported — integration consumers and agent instructions will silently skip traversal

### S4: New types present in types.ts

- **What:** TraversalOptions and TraversalResult interfaces are defined and importable
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx tsc --noEmit --strict 2>&1 | grep -c "TraversalOptions\|TraversalResult" || echo "0 type errors for new interfaces"`
- **Expected:** 0 lines of error output mentioning TraversalOptions or TraversalResult
- **Failure means:** Interfaces missing or malformed — downstream typed requires will fail at build time

### S5: Unit test suite runs without crash

- **What:** The citations test suite executes without unhandled errors, timeout, or process crash
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/citations.test.ts --no-coverage --no-color 2>&1 | grep -E "Tests:|Test Suites:"`
- **Expected:** `Test Suites: 1 passed, 1 total` and `Tests: N passed, N total` (N > 50 — more than current 50 tests)
- **Failure means:** Syntax error, missing import, or unhandled promise rejection in new test code

### S6: transitive_citation_gate config key accepted without crash

- **What:** loadConfig does not throw when transitive_citation_gate is present in config
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && node -e "const {loadConfig} = require('./lib/utils'); const cfg = loadConfig('/tmp/grd-eval-97-test.json'); console.log('ok')" 2>&1`
- **Expected:** `ok` (missing file path returns defaults without error)
- **Failure means:** Config key not registered in KNOWN_CONFIG_KEYS or parseBoolean path throws — gate cannot be enabled

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

---

## Level 2: Proxy Metrics

**Purpose:** Automated metrics that approximate correctness and quality of the implementation.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for production use. Coverage numbers indicate test exercise, not semantic correctness.

### P1: lib/citations.ts line coverage >= 85%

- **What:** Percentage of source lines in lib/citations.ts executed by the test suite
- **How:** Jest coverage report for the citations.ts file only
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/citations.test.ts --coverage --no-color 2>&1 | grep "citations.ts"`
- **Target:** Lines >= 85%, Functions >= 85%, Branches >= 75% (matching `jest.config.js` thresholds)
- **Evidence:** These thresholds were established in Phase 93 and are enforced by `jest.config.js`. The new BFS traversal functions have 8+ tests each (RED/GREEN TDD cycle in Plan 01), making 85% achievable. Current baseline (pre-phase 97): Lines 96.79%, Functions 85%, Branches 85.41%.
- **Correlation with full metric:** HIGH — jest coverage directly measures the test exercise threshold enforced by CI
- **Blind spots:** Coverage does not verify semantic correctness of BFS order, cycle detection logic, or edge merging. A function can have 100% line coverage with a wrong algorithm.
- **Validated:** No — coverage thresholds passing is necessary but not sufficient for correctness

### P2: lib/gates.ts coverage thresholds maintained (100/100/81%)

- **What:** gates.ts line, function, and branch coverage after adding transitive citation gate
- **How:** Jest coverage report scoped to gates tests
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/gates.test.ts --coverage --no-color 2>&1 | grep "gates.ts"`
- **Target:** Lines = 100%, Functions = 100%, Branches >= 81% (existing thresholds in jest.config.js)
- **Evidence:** gates.ts currently holds 100% line and function coverage. New transitive gate code must be covered by 3 new tests in Plan 02 Task 2: (a) gate skipped when disabled, (b) gate produces warnings for transitive nodes, (c) gate respects depth/node limits. These 3 tests directly exercise the 3 key branches of the new gate path.
- **Correlation with full metric:** HIGH — 100% line coverage on gates.ts is a hard CI threshold; failure would be caught immediately
- **Blind spots:** Does not verify the severity level (warning vs error) is correct at runtime, only that the code path was reached
- **Validated:** No — deferred to D1 for behavioral gate validation

### P3: Integration test suite passes (4/4 tests)

- **What:** End-to-end pipeline test in tests/integration/citations-pipeline.test.ts
- **How:** Run integration test file directly
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/integration/citations-pipeline.test.ts --no-coverage --no-color 2>&1 | grep -E "Tests:|Test Suites:"`
- **Target:** `Test Suites: 1 passed` and `Tests: 4 passed, 4 total`
- **Evidence:** Plan 03 specifies exactly 4 integration tests: full pipeline, cycle handling, depth/node limiting, and auto-retrieval failure handling. These 4 cases map directly to the 4 behavioral contracts of the implementation.
- **Correlation with full metric:** MEDIUM — integration tests use mock fetch functions, not real network calls. Correct behavior with mocks does not guarantee correct behavior against real arXiv/Semantic Scholar APIs.
- **Blind spots:** Network latency, API rate limits, XML/JSON schema changes in external APIs, real-world citation slug-to-paper-title mapping
- **Validated:** No — real network behavior deferred to D2

### P4: BFS correctness — depth and node count invariants

- **What:** Specific behavioral invariants of the BFS algorithm, verified by unit test assertions
- **How:** Check that test assertions for depth_reached, total_visited, and unresolved_leaves match expected values in the unit tests
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/citations.test.ts --no-coverage --no-color --verbose 2>&1 | grep -E "traverseCitationGraph|resolveTransitiveDeps|PASS|FAIL"`
- **Target:** All test names under `describe('traverseCitationGraph')` and `describe('resolveTransitiveDeps')` show checkmarks (pass)
- **Evidence:** Plan 01 specifies 8 traverseCitationGraph tests and 4 resolveTransitiveDeps tests that directly assert BFS invariants (depth_reached, total_visited, cycle avoidance, max_nodes stopping). These are the exact invariants that matter for correctness.
- **Correlation with full metric:** HIGH for algorithmic correctness with known inputs; MEDIUM for unknown real-world citation chains
- **Blind spots:** Synthetic test graphs may not reflect the structure of real PAPERS.md citation chains. The K-Planes example (7 direct, 12 total) is not used as a test fixture.
- **Validated:** No

### P5: Full test suite passes without regression (npm test)

- **What:** All existing tests continue to pass after phase 97 changes
- **How:** Full test run scoped to directly affected test files
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/citations.test.ts tests/unit/gates.test.ts --no-coverage --no-color 2>&1 | grep -E "Tests:|Test Suites:|FAIL"`
- **Target:** No FAIL lines; both test suites pass; total test count >= existing (50 citations + 49 gates = 99 baseline, should be >= 99 + new tests)
- **Evidence:** Any regression in existing 50 citations tests or 49 gates tests means the new implementation broke prior behavior. This is a zero-tolerance check.
- **Correlation with full metric:** HIGH — regressions in citation parsing or gate checking would break the research pipeline
- **Blind spots:** Does not cover lib/context/execute.ts changes or agents/grd-phase-researcher.md document changes
- **Validated:** No

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or runtime conditions not available during phase execution.

### D1: Transitive gate produces correct severity in live gate run — DEFER-97-01

- **What:** When `transitive_citation_gate: true` is set in a real project config and a phase with transitive unresolved dependencies is planned, the gate produces CITATION_UNRESOLVED_TRANSITIVE violations at `warning` severity (not `error`) and does not block progression
- **How:** Run `gd plan-phase` on a test project with a known transitive dependency gap and `transitive_citation_gate: true`; inspect gate output for violation severity
- **Why deferred:** Requires a live project config and real PAPERS.md files with known transitive gaps; not available as a unit test fixture at phase execution time
- **Validates at:** phase-100-evaluation-benchmark-framework (when a controlled test project is established for benchmark evaluation)
- **Depends on:** Live `gd plan-phase` execution, project config with `transitive_citation_gate: true`, PAPERS.md directory with transitive gaps
- **Target:** Gate outputs `severity: warning` violations (not `error`); plan-phase does not block when only transitive warnings exist
- **Risk if unmet:** If severity is wrong (`error` instead of `warning`), the gate would block legitimate research phases unnecessarily — high disruption to workflow
- **Fallback:** Audit `gates.ts` source for hardcoded severity value; fix in a patch phase before v0.3.23 release

### D2: External auto-retrieval works against live arXiv and Semantic Scholar APIs — DEFER-97-02

- **What:** `fetchExternalPaper` successfully retrieves real paper metadata when given valid slugs from real citation chains (e.g., k-planes, instant-ngp, nerf)
- **How:** Run `traverseCitationGraph` with `fetchFn: undefined` (uses real network) on a real PAPERS.md directory; observe that known transitive dependencies are resolved without mock
- **Why deferred:** Real network calls during CI/phase execution would introduce flakiness, rate limits, and non-determinism; the injectable fetchFn pattern isolates this risk by design
- **Validates at:** Manual validation by operator before v0.3.23 milestone close
- **Depends on:** Network access, arXiv API availability, Semantic Scholar API availability, valid paper slugs in PAPERS.md
- **Target:** >= 80% of known-valid arXiv slugs (from the K-Planes example set: nerf, instant-ngp, k-planes, tensorf, mip-nerf) resolve successfully via fetchExternalPaper
- **Risk if unmet:** Auto-retrieval silently fails and unresolved_leaves grows — degraded research phase quality without visible failure
- **Fallback:** Log warning when both APIs fail (already specified in Plan 02) so failures are visible; operator can manually add PAPERS.md entries

---

## Ablation Plan

Phase 97 implements a single coherent feature (transitive BFS traversal with auto-retrieval) across three dependent waves. Component isolation is covered by the wave structure itself:

- **Wave 1 only (no auto-retrieval):** traverseCitationGraph with `fetchFn` returning null — all unresolved nodes go to unresolved_leaves. This is tested in P3 Test 4.
- **Wave 2 only (no agent wiring):** fetchExternalPaper works standalone without grd-phase-researcher. This is tested in P2 unit tests.
- **Transitive gate disabled (default):** citation_gate=true but transitive_citation_gate=false — existing gate behavior unchanged. This is the explicit test in Plan 02 Task 2.

No additional ablation conditions are required. The wave dependency chain (`97-02` depends on `97-01`, `97-03` depends on `97-02`) enforces incremental validation naturally.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All modified files are TypeScript library modules (`lib/citations.ts`, `lib/gates.ts`, `lib/types.ts`, `lib/context/execute.ts`) and a markdown agent document (`agents/grd-phase-researcher.md`).

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| citations.ts pre-97 coverage | Lines 96.79%, Branches 85.41%, Functions 85% | Must not drop below 85/75/85 | `npx jest tests/unit/citations.test.ts --coverage` |
| gates.ts pre-97 coverage | Lines 100%, Functions 100%, Branches ~81% | Must not drop below 100/100/81 | `npx jest tests/unit/gates.test.ts --coverage` |
| citations test count | 50 passing tests pre-phase-97 | >= 62 after (50 + 8 traversal + 4 resolve) | `npx jest tests/unit/citations.test.ts --verbose` |
| gates test count | 49 passing tests pre-phase-97 | >= 52 after (49 + 3 transitive gate tests) | `npx jest tests/unit/gates.test.ts --verbose` |
| build:check | Zero type errors | Zero type errors after adding TraversalOptions/TraversalResult | `npm run build:check` |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/citations.test.ts        (Wave 1 + Wave 2 unit tests)
tests/unit/gates.test.ts            (Wave 2 transitive gate tests)
tests/integration/citations-pipeline.test.ts  (Wave 3 integration tests — created in Plan 03)
```

**How to run full phase evaluation:**
```bash
cd /Users/neo/Developer/Projects/GetResearchDone

# Sanity checks
npm run build:check
npm run lint
node -e "const c = require('./lib/citations'); console.log(Object.keys(c).sort().join(','))"

# Unit tests with coverage
npx jest tests/unit/citations.test.ts --coverage --no-color
npx jest tests/unit/gates.test.ts --coverage --no-color

# Integration tests (after Plan 03)
npx jest tests/integration/citations-pipeline.test.ts --no-color

# Full regression check
npx jest tests/unit/citations.test.ts tests/unit/gates.test.ts tests/integration/citations-pipeline.test.ts --no-color
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript build | [PASS/FAIL] | | |
| S2: ESLint | [PASS/FAIL] | | |
| S3: New exports present | [PASS/FAIL] | | |
| S4: New types present | [PASS/FAIL] | | |
| S5: Unit test suite runs | [PASS/FAIL] | | |
| S6: Config key accepted | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: citations.ts line coverage | >= 85% | | [MET/MISSED] | |
| P1: citations.ts function coverage | >= 85% | | [MET/MISSED] | |
| P1: citations.ts branch coverage | >= 75% | | [MET/MISSED] | |
| P2: gates.ts line coverage | 100% | | [MET/MISSED] | |
| P2: gates.ts function coverage | 100% | | [MET/MISSED] | |
| P2: gates.ts branch coverage | >= 81% | | [MET/MISSED] | |
| P3: Integration tests pass | 4/4 | | [MET/MISSED] | |
| P4: BFS invariant tests pass | All | | [MET/MISSED] | |
| P5: No regressions | 0 failures | | [MET/MISSED] | |

### Ablation Results

| Condition | Expected | Actual | Conclusion |
|-----------|----------|--------|------------|
| Traversal with null fetchFn | unresolved_leaves populated | | |
| Gate disabled (default) | No transitive violations | | |
| Gate enabled with gap | warning violations, not errors | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-97-01 | Transitive gate severity in live run | PENDING | phase-100-evaluation-benchmark-framework |
| DEFER-97-02 | Real arXiv/Semantic Scholar retrieval | PENDING | Manual validation pre-v0.3.23-close |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 6 checks covering types, exports, lint, and crash-free execution. All are runnable immediately after implementation.
- Proxy metrics: Well-evidenced — coverage thresholds are enforced by CI (not invented), behavioral tests directly exercise the BFS invariants specified in plan success criteria. The mock fetch pattern isolates external API risk completely.
- Deferred coverage: Comprehensive for the risks that matter — live gate severity is a one-time auditable check, and real network behavior is the only genuine unknown.

**What this evaluation CAN tell us:**
- Whether BFS traversal terminates correctly with cycle detection, depth limits, and node limits
- Whether the arXiv/Semantic Scholar fetch logic handles success and failure paths correctly (via mocks)
- Whether the transitive gate integrates without breaking existing gate behavior
- Whether the researcher agent and execution context include the required configuration
- Whether existing citation and gate tests continue to pass (no regression)

**What this evaluation CANNOT tell us:**
- Whether real arXiv and Semantic Scholar APIs return results for the exact slugs used in real research projects (deferred to D2)
- Whether the CITATION_UNRESOLVED_TRANSITIVE warning severity produces the correct downstream behavior in a live `gd plan-phase` run (deferred to D1)
- Whether transitive traversal depth-3, max-50 defaults are appropriate for real NERFIFY-style citation chains — this requires empirical data from actual usage

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-25*
