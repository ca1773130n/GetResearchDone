# Evaluation Plan: Phase 30 — Parallel Execution & Fallback

**Designed:** 2026-02-19
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Parallel phase independence validation, backend-aware mode selection, sequential fallback
**Requirements:** REQ-44 (Teammate Spawning), REQ-45 (Sequential Fallback)

## Evaluation Overview

Phase 30 is a tooling-layer phase. It introduces `lib/parallel.js` with three exported functions (`validateIndependentPhases`, `buildParallelContext`, `cmdInitExecuteParallel`), wires them into the CLI router (`bin/grd-tools.js`) and MCP server (`lib/mcp-server.js`), and extends the test suite with unit and integration tests. No actual teammate spawning happens in this phase — that is explicitly deferred to Phase 31.

What can be verified in-phase: the new module exists and exports the correct interface, the logic correctly identifies dependency conflicts between phases, the JSON output contains all required fields, the CLI and MCP entry points route correctly, and the full test suite passes with no regressions. These verifications are highly meaningful because the entire value of Phase 30 is the tooling contract that Phase 31 will consume.

What cannot be verified in-phase: that a real Claude Code session actually spawns teammate agents using this output, that worktrees are created and cleaned up correctly during parallel execution, and that per-phase status tracking remains accurate across a real concurrent run. These are deferred to Phase 31 (DEFER-30-01).

The phase has no external research papers — it is an engineering implementation phase. Metrics are derived from plan success criteria and PRODUCT-QUALITY.md targets.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Test count delta (+30-32) | 30-01-PLAN.md, 30-02-PLAN.md success criteria | Plan explicitly states expected new tests; deviation signals missing coverage |
| Zero regressions on 1,520 baseline | STATE.md current test count | Regression is the primary risk of adding a new module with cross-module imports |
| lib/parallel.js min_lines >= 120 | 30-01-PLAN.md must_haves.artifacts | Guards against stub implementations |
| tests/unit/parallel.test.js min_lines >= 350 | 30-02-PLAN.md must_haves.artifacts | Guards against thin test suite |
| validateIndependentPhases conflict detection | REQ-44, 30-01-PLAN.md truths | Core correctness of independence check |
| mode selection (parallel/sequential) | REQ-44, REQ-45 | Backend-aware routing is the primary feature |
| status_tracker per-phase pending state | 30-01-PLAN.md truths | Required for Phase 31 aggregate status reporting |
| CLI routing: init execute-parallel | 30-02-PLAN.md truths | Entry point for the command template |
| MCP descriptor grd_init_execute_parallel | 30-02-PLAN.md truths | MCP interface parity with CLI |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 7 checks | Module existence, exports, no crashes, no regressions |
| Proxy (L2) | 5 metrics | Functional correctness via test assertions on logic paths |
| Deferred (L3) | 2 validations | Real teammate spawning and concurrent status tracking |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module file exists and is syntactically valid

- **What:** `lib/parallel.js` exists and can be required without error
- **Command:** `node -e "require('./lib/parallel'); console.log('ok')"` (run from project root)
- **Expected:** Prints `ok` with exit code 0; no syntax errors, no missing module errors
- **Failure means:** Module was not created or has a syntax error blocking import

### S2: Exports interface is complete

- **What:** All three required exports are present and are functions
- **Command:** `node -e "const m = require('./lib/parallel'); ['validateIndependentPhases','buildParallelContext','cmdInitExecuteParallel'].forEach(fn => { if (typeof m[fn] !== 'function') throw new Error(fn + ' missing'); }); console.log('ok')`
- **Expected:** Prints `ok`
- **Failure means:** One or more required exports are absent or wrong type

### S3: Full test suite passes with no regressions

- **What:** All 1,520 previously passing tests continue to pass after new module is added
- **Command:** `npx jest --no-coverage 2>&1 | tail -5`
- **Expected:** `Tests: 1550+ passed, 0 failed` (baseline 1,520 + new tests); zero failing tests
- **Failure means:** New module broke an existing import chain or shared helper

### S4: New parallel tests exist and pass

- **What:** `tests/unit/parallel.test.js` exists and all tests in it pass
- **Command:** `npx jest tests/unit/parallel.test.js --no-coverage 2>&1 | tail -10`
- **Expected:** All tests pass, no failures
- **Failure means:** Implementation does not satisfy the contract defined in the plan

### S5: CLI routes init execute-parallel without crashing

- **What:** `grd-tools init execute-parallel` is a recognized subcommand (does not print "unknown subcommand")
- **Command:** `node bin/grd-tools.js init execute-parallel 2>&1 | head -3`
- **Expected:** Output is JSON (either a valid context or an error object) — NOT the string "unknown subcommand"
- **Failure means:** CLI router does not include `execute-parallel` in INIT_WORKFLOWS

### S6: MCP descriptor is discoverable

- **What:** `grd_init_execute_parallel` appears in MCP tools/list output
- **Command:** `node -e "const {COMMAND_DESCRIPTORS} = require('./lib/mcp-server'); const d = COMMAND_DESCRIPTORS.find(c => c.name === 'grd_init_execute_parallel'); if (!d) throw new Error('descriptor not found'); console.log('ok')`
- **Expected:** Prints `ok`
- **Failure means:** MCP descriptor was not added to lib/mcp-server.js

### S7: No NaN or undefined in output for basic valid call

- **What:** Output JSON for a minimal valid invocation contains no undefined or NaN values in mode/phases/status_tracker fields
- **Command:** Check via unit test S4 above (tests assert field presence); additionally inspect test output for undefined values
- **Expected:** `mode` is either `'parallel'` or `'sequential'`; `phases` is an array; `status_tracker` is an object
- **Failure means:** Context builder has uninitialized fields that would cause the command template to misfire

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to Phase 31.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of correctness and completeness via automated assertions.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full end-to-end evaluation. They confirm logical correctness of the tooling layer; actual parallel execution is deferred.

### P1: Independence validation correctness

- **What:** `validateIndependentPhases` correctly identifies both valid and conflicting phase sets
- **How:** Unit tests assert that a graph with edge A->B rejects request `['A','B']` with `valid:false`, and accepts `['A','C']` (no edge) with `valid:true`
- **Command:** `npx jest tests/unit/parallel.test.js --no-coverage --verbose 2>&1 | grep -E "validateIndependentPhases|PASS|FAIL"`
- **Target:** All 8 `validateIndependentPhases` test cases pass (per 30-01-PLAN.md)
- **Evidence:** Plan specifies 8 concrete test cases covering valid/invalid/transitive/empty/single-phase/multi-conflict scenarios; these directly exercise the function's decision boundaries
- **Correlation with full metric:** HIGH — unit tests cover all documented logic paths; the function has no I/O side effects
- **Blind spots:** Does not test against a real parsed ROADMAP.md; depends_on parsing errors in lib/deps.js could cause wrong graphs that tests would not catch
- **Validated:** No — awaiting deferred validation at Phase 31

### P2: Backend-aware mode selection

- **What:** `buildParallelContext` returns `mode:'parallel'` on Claude Code (teams:true) and `mode:'sequential'` on other backends
- **How:** Unit tests mock `detectBackend` to return 'claude' vs 'codex' and assert the mode field
- **Command:** `npx jest tests/unit/parallel.test.js --no-coverage --verbose 2>&1 | grep -E "buildParallelContext|PASS|FAIL"`
- **Target:** All 10 `buildParallelContext` test cases pass (per 30-01-PLAN.md)
- **Evidence:** Backend capabilities are defined in `lib/backend.js` as a static map (claude: teams:true, codex/gemini/opencode: teams:false). Mode selection is deterministic given the mock return value.
- **Correlation with full metric:** HIGH — mode selection is a pure conditional on capability flags; mocking the detection function fully covers the logic
- **Blind spots:** Does not validate that `detectBackend` itself returns the correct backend in a real environment; backend detection accuracy is validated in Phase 27/28 tests
- **Validated:** No — awaiting deferred validation at Phase 31

### P3: Sequential fallback_note is present and meaningful

- **What:** When mode is 'sequential', `fallback_note` is a non-empty string mentioning Claude Code (REQ-45)
- **How:** Unit test asserts `fallback_note` is a non-null, non-empty string on sequential backends; also asserts `fallback_note` is null/undefined on parallel backends
- **Command:** `npx jest tests/unit/parallel.test.js --no-coverage --verbose 2>&1 | grep -E "fallback_note|PASS|FAIL"`
- **Target:** Both fallback_note test cases pass (P4 and P5 in 30-01-PLAN.md buildParallelContext tests)
- **Evidence:** REQ-45 explicitly requires "Log a note that parallel execution is available on Claude Code backend." The test directly checks this string.
- **Correlation with full metric:** HIGH — this is a direct string presence check on the output field
- **Blind spots:** Does not validate that the `/grd:execute-phase` command template actually reads and displays this note
- **Validated:** No — awaiting deferred validation at Phase 31

### P4: status_tracker per-phase initial state

- **What:** `cmdInitExecuteParallel` populates `status_tracker.phases` with one entry per requested phase, each with `status:'pending'`
- **How:** Integration tests in the `CLI integration -- init execute-parallel` describe block assert on status_tracker structure
- **Command:** `npx jest tests/unit/parallel.test.js --no-coverage --verbose 2>&1 | grep -E "status_tracker|CLI integration|PASS|FAIL"`
- **Target:** All status_tracker test cases pass (test 7 in cmdInitExecuteParallel block, test 7 in CLI integration block)
- **Evidence:** Plan truths explicitly state "Single-phase failure tracking: status_tracker has per-phase pending/running/complete/failed state." This is the initial state contract that Phase 31 will build on.
- **Correlation with full metric:** MEDIUM — tests verify initial state; the running/complete/failed transitions happen at Phase 31 runtime and are not testable here
- **Blind spots:** Transition logic (pending->running->complete/failed) is entirely deferred; only the initial pending state is verifiable now
- **Validated:** No — awaiting deferred validation at Phase 31

### P5: New test count within expected range

- **What:** Phase 30 adds between 30 and 35 new tests (plan expects ~30-32)
- **How:** Compare total test count before and after phase execution
- **Command:** `npx jest --no-coverage 2>&1 | grep "Tests:" | grep -oE "[0-9]+ passed"`
- **Target:** Total passing tests >= 1,550 (baseline 1,520 + minimum 30 new tests); delta in range [30, 35]
- **Evidence:** 30-01-PLAN.md specifies ~25 unit tests; 30-02-PLAN.md specifies 5-7 integration tests; total 30-32 expected. Count within range confirms no tests were omitted.
- **Correlation with full metric:** MEDIUM — test count is a coverage proxy; high count with bad assertions is misleading. Combined with P1-P4 pass rates, meaningful.
- **Blind spots:** Tests could pass vacuously if assertions are weak (e.g., `expect(true).toBe(true)`); this metric alone is insufficient
- **Validated:** No — full coverage quality deferred to code review

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring real parallel execution infrastructure not available in Phase 30.

### D1: End-to-end parallel execution with real teammate spawning — DEFER-30-01

- **What:** When mode is 'parallel', the `/grd:execute-phase` command template actually spawns teammate agents targeting separate worktrees (one per phase), each agent executing its assigned phase independently
- **How:** Execute `/grd:execute-phase 27 29` (two independent phases from v0.2.0) on a Claude Code backend with `use_teams:true`. Observe that two teammate conversations appear, each working in a separate worktree directory. Both phases complete successfully and their branches are pushed.
- **Why deferred:** Phase 30 produces the JSON context; the command template that reads this context and invokes Claude Code's teammate API does not exist yet. Phase 31 builds the execute-phase command template integration.
- **Validates at:** Phase 31 — integration
- **Depends on:** Phase 31 execute-phase command template update; `use_teams:true` configuration; working Phase 27 worktree infrastructure
- **Target:** Two teammate agents spawn, execute independently, and both complete without the other being aborted on failure
- **Risk if unmet:** Phase 30 tooling is correct but the command template cannot consume it — redesign the context JSON schema or the template integration logic
- **Fallback:** If teammate spawning is not supported in the available environment, validate sequential fallback path (mode:'sequential') with manual two-phase sequential execution

### D2: Concurrent per-phase status tracking remains accurate — DEFER-30-01 (sub-item)

- **What:** The `status_tracker` in the Phase 30 context output is correctly updated by the command template as each phase transitions through pending -> running -> complete/failed states, and a single phase failure does not abort the others
- **How:** During Phase 31 integration, inspect the running status_tracker after Phase A fails and Phase B succeeds. Verify `status_tracker.phases.A.status === 'failed'` and `status_tracker.phases.B.status === 'complete'`.
- **Why deferred:** Status transitions happen inside the Phase 31 command template execution loop, not in the Phase 30 tooling layer. The tooling layer only initializes the tracker.
- **Validates at:** Phase 31 — integration
- **Depends on:** Phase 31 command template with status update logic
- **Target:** All four status values (pending/running/complete/failed) are reachable; failure of one phase does not change other phases' statuses
- **Risk if unmet:** Status tracking is cosmetic only (no update logic added in Phase 31) — execution still works but observability is lost. Low severity; mitigation is adding update calls in Phase 31 template.
- **Fallback:** If complex status tracking proves infeasible, acceptable fallback is terminal state only (pending -> complete/failed, no running state)

## Ablation Plan

**No ablation plan** — Phase 30 implements a single new module with three tightly-coupled functions. There are no sub-components to isolate against each other. The meaningful isolation is already captured in the unit tests: `validateIndependentPhases` is tested in isolation from `buildParallelContext`, and both are tested independently from `cmdInitExecuteParallel`.

The only conceptually meaningful ablation — "what if independence validation is skipped?" — is covered by the error path tests in P1 and the integration test that passes dependent phases and expects rejection.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test suite before Phase 30 | All passing tests before new module | 1,520 tests passing | STATE.md performance metrics |
| Test suite after Phase 30 | Baseline + new parallel tests | >= 1,550 tests passing | Plan success criteria |
| lib/parallel.js line count | Implementation completeness guard | >= 120 lines | 30-01-PLAN.md artifacts |
| tests/unit/parallel.test.js line count | Test completeness guard | >= 350 lines | 30-02-PLAN.md artifacts |
| New tests delta | Tests added by this phase | 30-35 | 30-01 (~25) + 30-02 (5-7) |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/parallel.test.js
```

**How to run unit tests only:**
```bash
npx jest tests/unit/parallel.test.js --no-coverage --verbose
```

**How to run full suite (regression check):**
```bash
npx jest --no-coverage 2>&1 | tail -5
```

**How to check module interface:**
```bash
node -e "
const m = require('./lib/parallel');
const fns = ['validateIndependentPhases','buildParallelContext','cmdInitExecuteParallel'];
fns.forEach(fn => {
  const t = typeof m[fn];
  console.log(fn + ': ' + t + (t === 'function' ? ' OK' : ' MISSING'));
});
"
```

**How to check MCP descriptor:**
```bash
node -e "
const {COMMAND_DESCRIPTORS} = require('./lib/mcp-server');
const d = COMMAND_DESCRIPTORS.find(c => c.name === 'grd_init_execute_parallel');
if (!d) { console.log('NOT FOUND'); process.exit(1); }
console.log('Found. Params:', JSON.stringify(d.params.map(p => p.name)));
"
```

**How to check CLI routing:**
```bash
node bin/grd-tools.js init execute-parallel 2>&1 | head -3
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module loads | - | - | |
| S2: Exports complete | - | - | |
| S3: No regressions | - | - | |
| S4: Parallel tests pass | - | - | |
| S5: CLI routes correctly | - | - | |
| S6: MCP descriptor found | - | - | |
| S7: No undefined in output | - | - | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Independence validation (8 tests) | 8/8 pass | - | - | |
| P2: Mode selection (10 tests) | 10/10 pass | - | - | |
| P3: fallback_note presence | Both cases pass | - | - | |
| P4: status_tracker pending state | All cases pass | - | - | |
| P5: New test delta | 30-35 new tests | - | - | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-30-01 | Real teammate spawning via Phase 30 context | PENDING | Phase 31 — integration |
| DEFER-30-01 (sub) | Per-phase status transitions (pending/running/complete/failed) | PENDING | Phase 31 — integration |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 7 checks cover module existence, interface completeness, regression safety, and routing correctness. All are mechanically verifiable without human judgment.
- Proxy metrics: Well-evidenced — all 5 proxy metrics trace directly to plan truths and requirements. Unit tests cover all documented logic paths for the pure functions. Correlation with actual behavior is HIGH for P1-P3 because the functions have no external I/O in their core logic (backends are mocked). MEDIUM for P4-P5 because they assess initial state and count rather than behavioral outcomes.
- Deferred coverage: Appropriate — exactly one deferred item (DEFER-30-01) covering the one thing that cannot be tested without real teammate spawning. This is already tracked in STATE.md.

**What this evaluation CAN tell us:**
- Whether the three exported functions implement their documented contracts correctly
- Whether the CLI entry point routes `init execute-parallel` without errors
- Whether the MCP descriptor is registered and has the correct parameter schema
- Whether adding this module caused any regressions in the 29 existing test suites
- Whether the sequential fallback produces the required `fallback_note` (REQ-45)

**What this evaluation CANNOT tell us:**
- Whether Claude Code actually spawns teammate agents when given mode:'parallel' output (Phase 31)
- Whether worktrees created by Phase 27 infrastructure are correctly targeted by the parallel context paths (Phase 31)
- Whether status_tracker entries are updated during real concurrent execution (Phase 31)
- Whether the command template can parse and act on the Phase 30 JSON output correctly (Phase 31)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-19*
