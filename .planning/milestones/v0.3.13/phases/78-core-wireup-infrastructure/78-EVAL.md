# Evaluation Plan: Phase 78 — Core Wireup Infrastructure

**Designed:** 2026-03-20
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** Discovery engine (filesystem analysis), scenario generation, test data fixture generation, state management (WIREUP-STATE.json)
**Reference:** Phase plans 78-01, 78-02, 78-03; ROADMAP.md requirements REQ-121, REQ-122, REQ-125, REQ-128

## Evaluation Overview

Phase 78 delivers four foundational modules for the wireup subsystem: `lib/wireup/types.ts` (type definitions), `lib/wireup/discovery.ts` (discovery engine), `lib/wireup/scenarios.ts` (scenario + fixture generation), and `lib/wireup/state.ts` (state persistence). These modules are pure infrastructure — they have no external dependencies beyond the filesystem and are fully testable in isolation using mocked `fs` and path utilities.

Because all three plans specify mocked unit tests as the primary verification method, meaningful proxy metrics are achievable at this phase. There are no paper metrics to reproduce — this is application code, not a research method. Metrics derive from the project's existing test quality conventions (85%+ line coverage floor, TypeScript strict mode, lint clean).

The key evaluation risk for this phase is correctness of the discovery heuristics: the regex-based export scanning and config-key reference detection in `discovery.ts` could produce false positives or miss valid targets. This cannot be fully assessed without running against the real codebase, so a deferred "live discovery accuracy" check is included for Phase 79 integration.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript strict compile | Project convention (`npm run build:check`) | Zero `any` policy enforced; new modules must not break compilation |
| ESLint clean | Project convention (`npm run lint`) | Pre-commit hook enforces lint; required for commit |
| Unit test pass rate | Plans 78-01, 78-02, 78-03 verification sections | Each plan specifies jest as the proxy verification method |
| Test case count | Plan specs (8 tests for discovery, 10 for scenarios, 12 for state) | Plans set explicit minimums; fewer tests indicate incomplete coverage |
| Line coverage >= 85% | `jest.config.js` per-file threshold floor for all covered lib/ modules | Project-wide standard; new wireup modules must meet this floor |
| Round-trip state fidelity | REQ-128 success criterion | write-then-read must return identical WireupState |
| No subprocess spawns | REQ-121 success criterion and plan 78-01 explicit must-have | Discovery must be pure filesystem; subprocess spawns are a correctness bug |
| WireupScenario step_type enum coverage | REQ-122 | Scenarios must cover http, cli, browser, assert across feature categories |
| Fixture JSON validity | REQ-125 | Written fixtures must be parseable JSON with required fields |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic functionality: compilation, lint, format, crash-free execution |
| Proxy (L2) | 6 | Test pass/fail, coverage, structural correctness of output data |
| Deferred (L3) | 3 | Live accuracy on real codebase, integration with Phase 79 orchestrator, coverage thresholds in jest.config.js |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript strict compile
- **What:** All new wireup TypeScript files compile under `tsc --noEmit` with `strict: true`
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run build:check`
- **Expected:** Exit code 0; no TypeScript errors reported
- **Failure means:** Type errors in the new modules, incorrect imports, or use of `any` — must be fixed before proceeding

### S2: ESLint clean
- **What:** `bin/` and `lib/` directories pass ESLint with zero errors
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm run lint`
- **Expected:** Exit code 0; no lint errors
- **Failure means:** Code style violations (unused vars, missing `'use strict'`, etc.) — blocks commit via pre-commit hook

### S3: Module files exist and are non-empty
- **What:** All four artifact files created by the three plans are present on disk
- **Command:** `ls -la /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/types.ts /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/discovery.ts /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/scenarios.ts /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/state.ts`
- **Expected:** All four files present, each > 0 bytes
- **Failure means:** A plan was not executed or wrote to the wrong path

### S4: Test files exist and are non-empty
- **What:** All three unit test files created by the plans are present on disk
- **Command:** `ls -la /Users/neo/Developer/Projects/GetResearchDone/tests/unit/wireup-discovery.test.ts /Users/neo/Developer/Projects/GetResearchDone/tests/unit/wireup-scenarios.test.ts /Users/neo/Developer/Projects/GetResearchDone/tests/unit/wireup-state.test.ts`
- **Expected:** All three files present, each > 0 bytes
- **Failure means:** Test files were not created; proxy metrics cannot be measured

### S5: Full test suite still passes (no regressions)
- **What:** Existing tests continue to pass after new modules are added
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npm test 2>&1 | tail -20`
- **Expected:** All pre-existing test suites pass; new wireup test files also pass; exit code 0
- **Failure means:** New code broke an existing module, or a new test file has a syntax error that crashes the jest runner

### S6: No subprocess imports in discovery module
- **What:** `lib/wireup/discovery.ts` must not import `child_process` or use `spawn`/`spawnSync` calls, ensuring pure filesystem analysis per REQ-121
- **Command:** `grep -n "child_process\|spawnSync\|spawnAsync" /Users/neo/Developer/Projects/GetResearchDone/lib/wireup/discovery.ts || echo "CLEAN"`
- **Expected:** Output is `CLEAN` — zero matches
- **Failure means:** Discovery engine uses subprocess calls, violating REQ-121 pure-filesystem requirement

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression to proxy metric collection.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality and correctness using unit tests against mocked filesystem.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation on real data. Test results reflect mocked filesystem behavior; live accuracy on the actual GRD codebase is deferred.

### P1: Discovery unit tests — all pass with minimum 8 test cases
- **What:** `tests/unit/wireup-discovery.test.ts` passes fully, covering all three feature categories and edge cases
- **How:** Run jest on the specific test file and count passing tests
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/wireup-discovery.test.ts --no-coverage --verbose 2>&1 | grep -E "PASS|FAIL|Tests:"`
- **Target:** All tests pass; at minimum 8 test cases (per plan 78-01 specification); 0 failures
- **Evidence:** Plan 78-01 explicitly specifies "at least 8 test cases" covering all three categories, edge case of empty codebase, and malformed file graceful skip
- **Correlation with full metric:** MEDIUM — mocked fs tests validate logic paths but cannot confirm the regex patterns produce correct results on real GRD source files
- **Blind spots:** Mocked tests do not reveal whether export-scanning regex correctly identifies all real exported function names or whether config-key search has false negatives on real `commands/*.md` files
- **Validated:** No — awaiting deferred validation DEFER-78-01 at phase 79 integration

### P2: Scenario unit tests — all pass with minimum 10 test cases
- **What:** `tests/unit/wireup-scenarios.test.ts` passes fully, covering all three feature categories and both `generateScenarios` and `generateTestData`
- **How:** Run jest on the specific test file
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/wireup-scenarios.test.ts --no-coverage --verbose 2>&1 | grep -E "PASS|FAIL|Tests:"`
- **Target:** All tests pass; at minimum 10 test cases; 0 failures
- **Evidence:** Plan 78-02 explicitly specifies at least 10 test cases covering generateScenarios (6) and generateTestData (4)
- **Correlation with full metric:** MEDIUM — validates JSON structure correctness of generated scenarios; does not validate that generated scenarios are executable or produce meaningful wiring coverage
- **Blind spots:** Step parameter content is mocked; test does not verify that parameters contain values executable by Phase 79's HTTP/CLI runner; fixture JSON path construction uses a mocked `currentMilestone` return value
- **Validated:** No — awaiting deferred validation DEFER-78-02 at phase 79 integration

### P3: State unit tests — all pass with minimum 12 test cases
- **What:** `tests/unit/wireup-state.test.ts` passes fully, covering create, read, write, round-trip, advance, and immutability
- **How:** Run jest on the specific test file
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/wireup-state.test.ts --no-coverage --verbose 2>&1 | grep -E "PASS|FAIL|Tests:"`
- **Target:** All tests pass; at minimum 12 test cases; 0 failures
- **Evidence:** Plan 78-03 explicitly specifies at least 12 test cases, including immutability verification and sequential iteration numbering
- **Correlation with full metric:** HIGH — state round-trip is a pure data serialization concern; mocked test is equivalent to real test for this function class
- **Blind spots:** Does not test behavior when `.planning/` directory is non-writable, or when WIREUP-STATE.json exists from a prior milestone with a different schema
- **Validated:** No — though immutability and serialization are fully verifiable with mocks

### P4: WireupScenario step_type enum coverage across categories
- **What:** Inspect scenario test file to confirm each applicable step_type value from {http, cli, assert} appears in assertions for the correct feature category
- **How:** Review test assertions in wireup-scenarios.test.ts for step_type checks
- **Command:** `grep -n "step_type" /Users/neo/Developer/Projects/GetResearchDone/tests/unit/wireup-scenarios.test.ts`
- **Target:** Assertions exist for `http` (endpoint-without-integration-test), `cli` (exported-but-uncalled and config-without-surface), and `assert` (non-http categories); at least 3 distinct step_type values are asserted
- **Evidence:** REQ-122 requires step_type from set {http, cli, browser, assert}; Plan 78-02 scenario templates map each category to specific step_types
- **Correlation with full metric:** HIGH — this is a direct structural check on the output; the mapping is deterministic given the category input
- **Blind spots:** `browser` step_type is not generated in plan 78-02's category mappings (browser execution deferred to Phase 80); 3 of 4 step_types are validated at this phase
- **Validated:** No

### P5: WireupState schema completeness — all 6 required fields present in initial state
- **What:** `createInitialWireupState()` output contains all 6 fields specified by REQ-128 plus the 2 additional required fields (timestamp, milestone)
- **How:** Unit test case "creates state with all required fields" in wireup-state tests verifies this
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/wireup-state.test.ts --no-coverage -t "required fields" --verbose 2>&1`
- **Target:** Test passes; all 8 fields verified: `features_discovered`, `scenarios_generated`, `scenarios_passed`, `scenarios_failed`, `fixes_applied`, `iteration_history`, `timestamp`, `milestone`
- **Evidence:** REQ-128 lists 6 required fields for WIREUP-STATE.json; WireupState type in plan 78-01 defines 8 fields total
- **Correlation with full metric:** HIGH — type-level enforcement plus unit test is sufficient to confirm schema
- **Blind spots:** Does not confirm that Phase 79's orchestrator populates `features_discovered` and `scenarios_generated` after running discovery — those fields stay at 0 until the orchestrator calls `writeWireupState` with updated values
- **Validated:** No — field population from orchestrator deferred to DEFER-78-03

### P6: Fixture JSON written to correct path with required fields
- **What:** `generateTestData()` writes valid JSON to the `.planning/milestones/{milestone}/wireup/test-data/` path with `feature`, `parameters`, and `generated_at` fields
- **How:** Unit test case "fixture contains feature name and generated_at timestamp" captures the `writeFileSync` argument and parses it
- **Command:** `cd /Users/neo/Developer/Projects/GetResearchDone && npx jest tests/unit/wireup-scenarios.test.ts --no-coverage -t "generated_at" --verbose 2>&1`
- **Target:** Test passes; written JSON is parseable; contains `feature` (string), `parameters` (object), `generated_at` (ISO timestamp string)
- **Evidence:** REQ-125 requires valid JSON fixtures with realistic payloads; Plan 78-02 specifies the exact fixture schema
- **Correlation with full metric:** MEDIUM — test validates structure but uses mocked `fs.writeFileSync`; actual disk writes are not exercised in unit tests
- **Blind spots:** Does not verify the fixture payload is "realistic" (a subjective judgment); does not confirm the file is readable by Phase 79's execution engine
- **Validated:** No — actual fixture disk I/O deferred to DEFER-78-02

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring live codebase access or Phase 79 integration.

### D1: Live discovery accuracy on real GRD codebase — DEFER-78-01
- **What:** `discoverUnwiredFeatures()` called with the real GRD project root returns a non-empty, plausible list with correct category assignments and no false positives on obviously-called exports
- **How:** Run `discoverUnwiredFeatures(process.cwd())` from a Node REPL or a small integration script; manually inspect a sample of 10 results across all three categories; verify at least one known-uncalled export is correctly identified
- **Why deferred:** Mocked unit tests cannot validate the regex patterns against real TypeScript source files; real `lib/` modules use various export patterns (module.exports, named exports, typed requires) that must all be handled correctly
- **Validates at:** Phase 79 integration, plan 79-01 (orchestrator wires discovery; natural integration point for live accuracy check)
- **Depends on:** `lib/wireup/discovery.ts` executing successfully against `lib/` source files in the actual project; no special setup beyond Phase 78 completion
- **Target:** Returns >= 1 result per category; no results where the `functionName` is actually called throughout the codebase; results are sorted by category then filePath as specified
- **Risk if unmet:** Discovery engine produces incorrect results — orchestrator in Phase 79 would generate nonsensical scenarios; recovery requires regex fixes to discovery.ts and re-running Phase 78 tests
- **Fallback:** If accuracy is poor, add a manual-inspect-and-filter step in Phase 79 before scenario generation; document known false-positive patterns for future regex refinement

### D2: Scenario executability validation — DEFER-78-02
- **What:** At least one generated scenario per category has `step_type` and `parameters` values that Phase 79's HTTP/CLI execution engine can parse and attempt to run (format must be valid, even if the run fails)
- **How:** After Phase 79 executor is implemented, pass a Phase 78-generated `WireupScenario[]` directly to the executor; verify it accepts the input without type errors or format rejection
- **Why deferred:** Phase 79's executor (plan 79-02) does not exist yet; the executability contract between scenario format and executor format can only be validated with both components present
- **Validates at:** Phase 79, plan 79-02 (HTTP/CLI execution engine)
- **Depends on:** Phase 79 plan 79-02 complete; at least one scenario generated by `generateScenarios()` against a discovered feature
- **Target:** Executor accepts generated scenarios without throwing format validation errors; step parameters are populated with non-null values appropriate to the step_type
- **Risk if unmet:** Phase 78 scenario format is incompatible with Phase 79 executor — requires coordinated schema change across both modules; estimated cost 1-2 days to align types and regenerate test data
- **Fallback:** Type-level contract enforcement via shared `ScenarioStep` type from `lib/wireup/types.ts` catches gross mismatches at compile time; runtime format errors are the residual risk

### D3: Coverage thresholds enforced in jest.config.js — DEFER-78-03
- **What:** Per-file coverage thresholds for `lib/wireup/discovery.ts`, `lib/wireup/scenarios.ts`, and `lib/wireup/state.ts` are added to `jest.config.js` at >= 85% lines floor, and `npm test` passes with these thresholds enforced
- **How:** After phase execution, check whether `jest.config.js` was updated with wireup coverage thresholds; if not, add them and re-run `npm test` to confirm coverage meets the floor
- **Why deferred:** Adding coverage thresholds is a step that may or may not be included in plan execution; it depends on actual coverage achieved — which cannot be known until the tests are written and run
- **Validates at:** Phase 81, plan 81-02 (which explicitly targets 85%+ line coverage for wireup modules)
- **Depends on:** All three wireup unit test files complete; `npm test` runs with coverage collection enabled
- **Target:** Lines >= 85%, Functions >= 85%, Branches >= 70% for each of the three new modules (matching the project floor from `lib/evolve/index.ts` and `lib/state.ts`)
- **Risk if unmet:** Coverage falls below threshold; CI fails; requires adding tests to `tests/unit/coverage-gaps.test.ts` or expanding existing wireup test files
- **Fallback:** Use `tests/unit/coverage-gaps.test.ts` pattern (project-established mechanism for targeting uncovered branches without duplicating primary test files)

## Ablation Plan

**No ablation plan** — This phase implements four distinct infrastructure modules with clear module boundaries. There are no sub-components within a single module to isolate. Each plan (78-01, 78-02, 78-03) is effectively its own ablation condition: the phase can be evaluated with any subset of plans complete, and the impact of each plan's absence is self-evident (e.g., without 78-01, no types exist; without 78-03, no state management).

The closest equivalent to ablation analysis occurs in Phase 79, where the orchestrator will exercise each module individually before combining them.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Existing test suite | All 31+ existing unit test files pass before phase starts | 0 failures | `npm test` pre-phase |
| TypeScript compilation | All existing lib/ modules compile cleanly | Exit code 0 | `npm run build:check` pre-phase |
| Evolve state module | `lib/evolve/state.ts` — reference implementation for wireup/state.ts pattern | Round-trip, immutable advance, 2-space JSON indent | Code review baseline |
| Evolve discovery module | `lib/evolve/discovery.ts` — reference implementation for wireup/discovery.ts pattern | Pure filesystem analysis, typed require pattern | Code review baseline |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/wireup-discovery.test.ts   (created by plan 78-01)
tests/unit/wireup-scenarios.test.ts   (created by plan 78-02)
tests/unit/wireup-state.test.ts       (created by plan 78-03)
```

**How to run full evaluation:**
```bash
cd /Users/neo/Developer/Projects/GetResearchDone

# Sanity: compile and lint
npm run build:check
npm run lint

# Proxy: targeted unit tests
npx jest tests/unit/wireup-discovery.test.ts tests/unit/wireup-scenarios.test.ts tests/unit/wireup-state.test.ts --no-coverage --verbose

# Regression check: full suite
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compile | | | |
| S2: ESLint clean | | | |
| S3: Module files exist | | | |
| S4: Test files exist | | | |
| S5: Full test suite (no regression) | | | |
| S6: No subprocess imports in discovery | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Discovery tests pass | >= 8 tests, 0 fail | | | |
| P2: Scenario tests pass | >= 10 tests, 0 fail | | | |
| P3: State tests pass | >= 12 tests, 0 fail | | | |
| P4: step_type enum coverage | >= 3 distinct step_types asserted | | | |
| P5: WireupState schema completeness | All 8 fields in initial state | | | |
| P6: Fixture JSON correct path and fields | feature + parameters + generated_at | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-78-01 | Live discovery accuracy on real GRD codebase | PENDING | Phase 79, plan 79-01 |
| DEFER-78-02 | Scenario executability by Phase 79 HTTP/CLI engine | PENDING | Phase 79, plan 79-02 |
| DEFER-78-03 | Coverage thresholds in jest.config.js | PENDING | Phase 81, plan 81-02 |

## Evaluation Confidence

**Overall confidence in evaluation design:** MEDIUM-HIGH

**Justification:**
- Sanity checks: Adequate — TypeScript compilation and lint are mandatory and machine-enforceable; the subprocess grep check directly verifies REQ-121's pure-filesystem constraint
- Proxy metrics: Well-evidenced — test-based proxies are the project standard for all new lib/ modules; plan specifications define exact minimum test counts, reducing ambiguity; correlation is MEDIUM for discovery/scenarios (mock-only coverage) and HIGH for state (serialization is fully testable with mocks)
- Deferred coverage: Comprehensive — all three deferred items are precisely scoped with specific validates_at references, and the most critical risk (discovery accuracy on real source files) is caught early at Phase 79 integration rather than waiting for Phase 81

**What this evaluation CAN tell us:**
- Whether the four new modules compile and lint-pass as valid TypeScript
- Whether state management logic (create, read, write, advance, immutability) is correct
- Whether scenario generation produces the correct structural format for all three feature categories
- Whether discovery module is free of subprocess calls
- Whether minimum test case counts specified in plans were met

**What this evaluation CANNOT tell us:**
- Whether discovery heuristics correctly identify real unwired features in the GRD codebase (deferred to DEFER-78-01)
- Whether generated scenario parameters are valid inputs to Phase 79's execution engine (deferred to DEFER-78-02)
- Whether coverage meets the project's per-file threshold floor (deferred to DEFER-78-03)
- Whether the `browser` step_type will be generated in Phase 80 scenarios and integrates with the existing ScenarioStep type without modification

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-20*
