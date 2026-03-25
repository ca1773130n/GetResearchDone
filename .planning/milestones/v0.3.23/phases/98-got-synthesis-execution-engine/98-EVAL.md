# Evaluation Plan: Phase 98 — GoT Synthesis Execution Engine

**Designed:** 2026-03-25
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Artifact DAG construction (Kahn's algorithm), interface-freeze, GoT execution orchestration, smoke-test/repair loop, wave-builder DAG integration
**Reference:** Phase 98 CONTEXT.md, 98-01/02/03 PLAN.md files — NERFIFY Figure 4 execution engine

## Evaluation Overview

Phase 98 implements the GoT (Graph-of-Thought) synthesis execution engine across three plans: (1) ArtifactDAG types and buildArtifactDAG/validateArtifactDAG in lib/deps.ts, (2) the execution engine itself in lib/got.ts plus autopilot wire-up, and (3) 30 unit tests covering all components.

This is a pure software engineering phase — no ML models, no paper benchmarks, no numeric quality metrics. The "product" is correct TypeScript code with well-defined algorithmic guarantees. Evaluation is therefore dominated by correctness verification (unit tests), type safety (tsc), and code quality (lint/coverage). Full integration with actual subagent spawning is explicitly out of scope for this phase and deferred.

The primary risk is algorithmic correctness: Kahn's topological sort, DFS cycle detection, and the smoke-test retry loop all have edge cases (diamond dependencies, multi-node cycles, retries exhausted) that must be covered by unit tests. Coverage thresholds codified in jest.config.js serve as the proxy metric.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation | tsc --noEmit | Type safety is a hard requirement for project code style |
| ESLint zero warnings | PRODUCT-QUALITY.md P1 metric | ESLint pass rate target = 100% |
| Test count (30 new tests) | 98-03-PLAN.md must_haves | Executable spec for all algorithmic edge cases |
| deps.ts coverage >= 94% lines | jest.config.js existing threshold | Existing contract — new code added to deps.ts must maintain it |
| got.ts coverage (new module) | 98-03-PLAN.md success criteria | "Reasonable coverage for new module" — designed as >= 80% |
| Full test suite green | npm test | No regression on 40+ existing modules |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 5 | Type safety, module loading, export shape, format correctness |
| Proxy (L2) | 4 | Test counts, coverage thresholds, algorithmic edge-case coverage |
| Deferred (L3) | 2 | Real subagent dispatch, end-to-end wave refinement in live autopilot run |

---

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript Compilation
- **What:** All modified and new files compile cleanly with strict TypeScript
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no type errors
- **Failure means:** Type interfaces are malformed, imports are missing, or strict-mode violations were introduced in lib/types.ts, lib/deps.ts, lib/got.ts, or lib/autopilot.ts

### S2: ESLint Clean
- **What:** No lint errors in modified files
- **Command:** `npm run lint`
- **Expected:** Exit code 0, zero errors or warnings
- **Failure means:** Code style violations (unused vars not prefixed with `_`, use of `any`, missing `'use strict'`)

### S3: Module Load Without Error
- **What:** All new modules can be required without runtime error
- **Command:** `node -e "require('./lib/deps'); require('./lib/got'); require('./lib/autopilot'); console.log('OK')"`
- **Expected:** Prints `OK` with exit code 0
- **Failure means:** Module-level code throws on require (syntax error, missing dependency at require-time, circular import)

### S4: Export Shape Correct
- **What:** All expected functions are exported from each module
- **Command:** `node -e "const d=require('./lib/deps'); const g=require('./lib/got'); const a=require('./lib/autopilot'); console.log(typeof d.buildArtifactDAG, typeof d.validateArtifactDAG, typeof g.freezeInterfaces, typeof g.executeArtifactDAG, typeof g.buildNodePrompt, typeof g.runSmokeTest, typeof a.buildWavesFromPlans)"`
- **Expected:** `function function function function function function function`
- **Failure means:** A plan's implementation task did not reach the module.exports step

### S5: Empty-Input Smoke Test
- **What:** buildArtifactDAG([]) returns a valid empty DAG without crashing
- **Command:** `node -e "const {buildArtifactDAG}=require('./lib/deps'); const r=buildArtifactDAG([]); console.log(JSON.stringify(r))"`
- **Expected:** `{"nodes":[],"edges":[],"sorted_plans":[],"providers":{}}`
- **Failure means:** The function crashes on empty input or returns an unexpected shape

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

---

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and quality.
**IMPORTANT:** These proxy metrics are not validated substitutes for full integration testing. Treat results with appropriate skepticism.

### P1: New Unit Test Count — 30 tests
- **What:** Number of passing new tests added by plan 98-03
- **How:** Count passing tests across the two new test files
- **Command:** `npx jest tests/unit/deps.test.ts tests/unit/got.test.ts --no-coverage 2>&1 | grep -E "Tests:|passed"`
- **Target:** 30 new tests passing (15 in deps.test.ts additions, 15 in got.test.ts)
- **Evidence:** 98-03-PLAN.md must_haves enumerate exactly 8 + 7 = 15 buildArtifactDAG/validateArtifactDAG tests and 4 + 3 + 3 + 5 = 15 got.ts tests
- **Correlation with full metric:** HIGH — the tests are the executable specification; passing all 30 means all documented edge cases are handled
- **Blind spots:** Tests written by the same agent that implements the code; adversarial inputs not covered by the spec may still break the implementation
- **Validated:** No — awaiting deferred validation at phase-99-integration

### P2: deps.ts Coverage >= 94% Lines
- **What:** Line coverage on lib/deps.ts stays at or above the existing jest.config.js threshold
- **How:** Jest coverage report for deps.ts only
- **Command:** `npx jest tests/unit/deps.test.ts --coverage --coverageReporters=text 2>&1 | grep "deps.ts"`
- **Target:** lines >= 94%, functions >= 100%, branches >= 87% (matching existing jest.config.js entry)
- **Evidence:** jest.config.js already enforces this threshold for deps.ts; npm test will fail if it drops below. New code added to deps.ts must be tested at the same density as existing code.
- **Correlation with full metric:** HIGH — coverage failure = npm test failure = hard gate
- **Blind spots:** Coverage measures lines executed, not correctness of assertions. A test can execute a line without checking its output.
- **Validated:** No — threshold confirmation deferred until npm test runs with full coverage enabled

### P3: got.ts Coverage >= 80% Lines
- **What:** Line coverage on new lib/got.ts module
- **How:** Jest coverage report for got.ts
- **Command:** `npx jest tests/unit/got.test.ts --coverage --coverageReporters=text 2>&1 | grep "got.ts"`
- **Target:** lines >= 80%, functions >= 85%
- **Evidence:** 98-03-PLAN.md success criteria says "reasonable coverage for new module." The 5 executeArtifactDAG tests + 4 freezeInterfaces + 3 buildNodePrompt + 3 runSmokeTest = 15 tests cover all exported functions. 80% is consistent with the lowest existing threshold in jest.config.js (worktree.ts at 74%).
- **Correlation with full metric:** MEDIUM — new module; uncovered branches may correspond to error paths that matter in production
- **Blind spots:** The agent spawning path in executeArtifactDAG (the actual dispatch) is explicitly not implemented; those code paths may inflate uncovered lines
- **Validated:** No — coverage threshold will be codified in jest.config.js during plan 98-03 execution

### P4: Full Test Suite No Regression
- **What:** All pre-existing unit tests continue to pass after phase 98 changes
- **How:** Run full suite
- **Command:** `npm test`
- **Target:** Same pass count as before phase 98 (zero new failures)
- **Evidence:** Plans 98-01 modifies lib/types.ts and lib/deps.ts (existing module); plan 98-02 modifies lib/autopilot.ts (existing module with its own test file). Regression in autopilot.test.ts or deps.test.ts would indicate the existing interface was broken.
- **Correlation with full metric:** HIGH — regression = hard failure
- **Blind spots:** Tests that mock internal functions may pass even when real behavior changes; integration behavior not captured by unit tests
- **Validated:** No — run after all three plans complete

---

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or live execution not available in this phase.

### D1: Real Subagent Dispatch Integration — DEFER-98-01
- **What:** executeArtifactDAG produces agent prompts that successfully orchestrate real file-level subagents to produce correct artifacts in topological order
- **How:** Run an actual multi-plan phase through the GoT engine with real Claude subagents; verify that output files match frozen interface contracts
- **Why deferred:** executeArtifactDAG deliberately does not spawn actual agents in phase 98 — "The actual agent spawning is NOT implemented here." The caller (autopilot) is responsible for dispatch, which requires the full agent infrastructure not assembled until a future integration phase.
- **Validates at:** phase-99-knowledge-injection-loop or whichever phase wires GoT into the live autopilot dispatch path
- **Depends on:** Autopilot backend integration, live subagent invocation wired into executeArtifactDAG's orchestration loop
- **Target:** Zero smoke-test failures on a linear 3-plan chain in a real dry-run; retry loop resolves at least one simulated failure correctly
- **Risk if unmet:** The orchestration logic (wave grouping, retry loop) may be correct in isolation but misaligned with how real agent results are returned; could require redesign of NodeExecutionResult or the retry interface
- **Fallback:** Introduce an adapter layer between executeArtifactDAG and the backend dispatch; phase 98 logic stays intact

### D2: Wave Refinement Quality in Live Autopilot Run — DEFER-98-02
- **What:** buildWavesFromPlans produces finer-grained wave assignments than depends_on alone, measurably reducing unnecessary serialization in a realistic multi-plan phase
- **How:** Compare wave count and parallelism degree of buildWaves (depends_on only) vs. buildWavesFromPlans (DAG-augmented) on a real milestone with provides/requires declared
- **Why deferred:** No milestone currently uses provides/requires fields in plan YAML. The artifact edge path in buildWaves will only be exercised when upstream phases (99, 100) declare these fields.
- **Validates at:** phase-100-evaluation-benchmark-framework (first phase likely to use structured artifact declarations)
- **Depends on:** At least one phase with provides/requires fields in PlanArtifact frontmatter
- **Target:** buildWavesFromPlans assigns >= 1 additional parallel group vs. depends_on-only waves for the test milestone
- **Risk if unmet:** The DAG-augmented wave builder adds no practical value; feature is correct but premature — low risk, the code path is additive and does not break existing behavior
- **Fallback:** Document as future optimization; no fallback needed since existing wave building is unmodified

---

## Ablation Plan

**No ablation plan** — Phase 98 implements distinct, non-overlapping components (DAG construction, execution engine, test suite). There are no sub-component trade-offs to isolate within a single component. The three plans are themselves an ablation structure: plan 98-01 can be verified independently, 98-02 builds on it, 98-03 validates both.

---

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All modified files are TypeScript library modules (`lib/types.ts`, `lib/deps.ts`, `lib/got.ts`, `lib/autopilot.ts`) and test files.

---

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| deps.ts existing tests | All pre-existing deps.test.ts tests pass before phase 98 starts | 100% pass | Current test suite |
| autopilot.ts existing tests | All autopilot.test.ts tests pass before 98-02 modifies the file | 100% pass | Current test suite |
| deps.ts coverage | Existing threshold in jest.config.js | lines >= 94%, functions >= 100%, branches >= 87% | jest.config.js |
| autopilot.ts coverage | Existing threshold in jest.config.js | lines >= 83%, functions >= 91%, branches >= 75% | jest.config.js |

---

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/deps.test.ts  — artifact DAG tests appended by plan 98-03
tests/unit/got.test.ts   — new file created by plan 98-03
```

**How to run full evaluation:**
```bash
# Sanity checks
npm run build:check
npm run lint
node -e "require('./lib/deps'); require('./lib/got'); require('./lib/autopilot'); console.log('OK')"
node -e "const {buildArtifactDAG}=require('./lib/deps'); console.log(JSON.stringify(buildArtifactDAG([])))"

# Proxy metrics
npx jest tests/unit/deps.test.ts tests/unit/got.test.ts --no-coverage
npx jest tests/unit/deps.test.ts tests/unit/got.test.ts --coverage --coverageReporters=text
npm test
```

---

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compilation | [PASS/FAIL] | | |
| S2: ESLint clean | [PASS/FAIL] | | |
| S3: Module load without error | [PASS/FAIL] | | |
| S4: Export shape correct | [PASS/FAIL] | | |
| S5: Empty-input smoke test | [PASS/FAIL] | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: New test count | 30 | | [MET/MISSED] | |
| P2: deps.ts line coverage | >= 94% | | [MET/MISSED] | |
| P3: got.ts line coverage | >= 80% | | [MET/MISSED] | |
| P4: Full suite no regression | 0 new failures | | [MET/MISSED] | |

### Ablation Results

Not applicable — see Ablation Plan section.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-98-01 | Real subagent dispatch integration | PENDING | phase-99 or later integration phase |
| DEFER-98-02 | Wave refinement quality in live autopilot run | PENDING | phase-100-evaluation-benchmark-framework |

---

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — all five checks are deterministic, fast, and catch the most likely failure modes (type errors, missing exports, empty-input crash)
- Proxy metrics: Well-evidenced — test counts are specified in the plan's must_haves; coverage thresholds are codified in jest.config.js as hard gates that npm test enforces; regression protection is automatic
- Deferred coverage: Partial but honest — the two deferred items concern the unimplemented agent dispatch path, which is explicitly out of scope for this phase by design

**What this evaluation CAN tell us:**
- Whether the DAG construction algorithms (Kahn's sort, DFS cycle detection) produce correct output on all documented edge cases
- Whether the GoT execution engine correctly groups nodes into topological waves and wires the retry loop
- Whether existing autopilot and deps functionality regresses after the changes
- Whether the type interfaces compile and are consistent across the module graph

**What this evaluation CANNOT tell us:**
- Whether executeArtifactDAG's agent prompts actually produce correct code when dispatched to real subagents (DEFER-98-01 — validates at future integration phase)
- Whether buildWavesFromPlans improves parallelism in practice, since no existing phase uses provides/requires fields (DEFER-98-02 — validates at phase-100)
- Whether the interface-freeze concept (frozen contract stubs as plain comments) is sufficient for downstream agents to honor contracts; this is a design limitation noted in the plan itself as a "future enhancement"

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-25*
