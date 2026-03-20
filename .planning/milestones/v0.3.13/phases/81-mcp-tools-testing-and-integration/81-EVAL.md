# Evaluation Plan: Phase 81 — MCP Tools, Testing, and Integration

**Designed:** 2026-03-20
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** MCP tool registration, unit test coverage enforcement, integration test for full wireup E2E flow
**Reference:** ROADMAP.md#phase-81, REQ-130, REQ-132, REQ-133

## Evaluation Overview

Phase 81 is the integration capstone of the v0.3.13 wireup milestone. It has three distinct deliverables: (1) five wireup MCP tools registered in `lib/mcp-server.ts` following the existing evolve tool patterns, (2) a unit test file `tests/unit/wireup.test.ts` achieving >= 85% line coverage across `lib/wireup/` modules, and (3) an integration test in `tests/integration/wireup-e2e.test.ts` that validates the full discover -> generate -> execute -> detect -> report flow on a synthetic fixture project.

All three deliverables are mechanically verifiable via existing tooling. TypeScript compilation (`npm run build:check`) confirms correct MCP registration and types. Jest with per-file coverage thresholds (added in plan 81-01) enforces the 85% line coverage gate. The integration test validates that all four prior phases (78-80) wired together correctly through their shared barrel exports.

The primary deferred risk is real-world wireup fidelity on actual projects outside the fixture. The fixture is synthetic by design — it plants known unwired features so the discovery engine is guaranteed to find them. This does not validate that the discovery heuristics work correctly against organic codebases. That validation is deferred to a production usage milestone.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| TypeScript compilation | `npm run build:check` | Validates MCP tool registration type correctness at structural level |
| Five tool names in COMMAND_DESCRIPTORS | Grep / test assertion | Directly maps to REQ-130 success criterion 1 |
| `npm test` 0 failures | Jest | REQ-132 success criterion 2 |
| >= 85% line coverage on `lib/wireup/index.ts` | jest.config.js threshold | REQ-132 success criterion 2 exact target |
| Full flow test passes on fixture | `tests/integration/wireup-e2e.test.ts` | REQ-133 success criterion 4 |
| `grd_wireup_run` returns structured JSON | Integration test assertion | REQ-130 + REQ-133 success criterion 5 |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 5 | Basic compilation, lint, tool registration, coverage config |
| Proxy (L2) | 4 | Unit test pass/fail, coverage %, MCP tool schema validation, integration test pass |
| Deferred (L3) | 2 | Real-world discovery fidelity, live Playwright MCP execution |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: TypeScript compiles without errors

- **What:** `lib/wireup/cli.ts`, `lib/mcp-server.ts`, and `lib/wireup/index.ts` compile cleanly after plan 81-01 changes
- **Command:** `npm run build:check`
- **Expected:** Exit code 0, no output (tsc --noEmit produces nothing on success)
- **Failure means:** Type error in MCP tool registration, cmd wrapper signature mismatch, or barrel re-export issue

### S2: Five wireup tool names present in mcp-server.ts

- **What:** All five tool names exist in COMMAND_DESCRIPTORS literal block
- **Command:** `grep -c "grd_wireup_" lib/mcp-server.ts`
- **Expected:** Count >= 5 (one line per tool name)
- **Failure means:** Plan 81-01 task 1 did not complete tool registration

### S3: Five cmd wrapper functions present in wireup cli module

- **What:** `lib/wireup/cli.ts` exports all five cmd wrapper functions
- **Command:** `grep -c "cmdWireup" lib/wireup/cli.ts`
- **Expected:** Count >= 5
- **Failure means:** Plan 81-01 task 0 did not create all wrappers

### S4: Coverage threshold entry present in jest.config.js

- **What:** The `./lib/wireup/index.ts` key exists in coverageThreshold with lines: 85
- **Command:** `node -e "const c = require('./jest.config.js'); console.log(JSON.stringify(c.coverageThreshold['./lib/wireup/index.ts']))"`
- **Expected:** `{"lines":85,"functions":85,"branches":70}`
- **Failure means:** Plan 81-01 task 2 did not add the threshold entry

### S5: ESLint passes

- **What:** No lint errors in newly created files
- **Command:** `npm run lint`
- **Expected:** Exit code 0, no lint errors
- **Failure means:** Code style violation in `lib/wireup/cli.ts` or `tests/unit/wireup.test.ts`

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Indirect evaluation of quality/performance.
**IMPORTANT:** Proxy metrics are NOT validated substitutes for full evaluation. Treat results with appropriate skepticism.

### P1: Unit test suite passes with zero failures

- **What:** All tests in `tests/unit/wireup.test.ts` (and rest of test suite) pass
- **How:** Run Jest on the specific file first, then full suite
- **Command:** `npx jest tests/unit/wireup.test.ts --verbose 2>&1 | grep -E "PASS|FAIL|Tests:"`
- **Target:** `PASS tests/unit/wireup.test.ts` with zero failing tests
- **Evidence:** Jest failures surface implementation bugs; a passing test file with correct mocks validates the module contract without spawning real subprocesses
- **Correlation with full metric:** HIGH — zero failures is a necessary (though not sufficient) condition for correctness
- **Blind spots:** Mocked subprocess calls cannot detect logic errors in real execution paths; mock fidelity depends on test author correctly matching real behavior
- **Validated:** No — deferred to DEFER-81-01 for real-project validation

### P2: >= 85% line coverage on lib/wireup/ modules

- **What:** Jest per-file line coverage threshold enforced by jest.config.js
- **How:** Run Jest with coverage; threshold violation causes non-zero exit
- **Command:** `npx jest tests/unit/wireup.test.ts --coverage --coverageReporters=text 2>&1 | grep -E "wireup|All files"`
- **Target:** >= 85% lines; >= 85% functions; >= 70% branches for `lib/wireup/index.ts`
- **Evidence:** REQ-132 sets this target directly; the project's existing pattern (see jest.config.js) uses 85% as the standard minimum for new modules (`lib/evolve/index.ts` is also at 85%)
- **Correlation with full metric:** MEDIUM — line coverage confirms code paths are exercised but does not measure correctness of assertions or edge case handling
- **Blind spots:** Coverage percentage does not distinguish between a test that asserts nothing vs. one with precise assertions; branches in `lib/wireup/discovery.ts` may need separate threshold entry
- **Validated:** No — the threshold enforces quantity; assertion quality is checked only at DEFER-81-01

### P3: Integration test suite passes on fixture project

- **What:** `tests/integration/wireup-e2e.test.ts` runs without failure, including the full flow test, MCP tool test, and grd-tools.js dispatch test
- **How:** Run integration test file directly
- **Command:** `npx jest tests/integration/wireup-e2e.test.ts --verbose 2>&1 | grep -E "PASS|FAIL|Tests:"`
- **Target:** `PASS tests/integration/wireup-e2e.test.ts` with all test cases passing
- **Evidence:** Integration tests exercise module wiring between phases 78-80-81. A passing integration test confirms the barrel exports from `lib/wireup/index.ts` are correctly connected to the orchestrator and that MCP server can invoke the flow
- **Correlation with full metric:** MEDIUM-HIGH — fixture is synthetic; real-project discovery accuracy is not tested here. But MCP protocol correctness (JSON-RPC response structure) is tested directly
- **Blind spots:** The fixture has planted known unwired features — discovery will reliably find them. An organic codebase may produce different false positive/negative rates
- **Validated:** No — awaiting deferred validation at production usage milestone

### P4: grd_wireup_run MCP tool returns correct JSON structure

- **What:** Response from `grd_wireup_run` tool call contains `features_discovered`, `scenarios_run`, `issues_found` fields
- **How:** Asserted in integration test; can also be spot-checked via direct invocation
- **Command:** Part of `npx jest tests/integration/wireup-e2e.test.ts --verbose`; for manual check: `node -e "const { McpServer } = require('./lib/mcp-server'); /* invoke tool and print */"`
- **Target:** JSON object with non-null `features_discovered` (number), `scenarios_run` (number), `issues_found` (array)
- **Evidence:** REQ-130 success criterion 5 and REQ-133 success criterion 5 specify these exact field names; the evolve tool pattern confirms the JSON output shape is produced by cmd wrapper functions
- **Correlation with full metric:** HIGH — this directly tests the integration success criterion
- **Blind spots:** Tests use a synthetic fixture; field values are not validated against expected discovery outcomes in the full project
- **Validated:** No — real output quality deferred to DEFER-81-02

## Level 3: Deferred Validations

**Purpose:** Full evaluation requiring integration or resources not available now.

### D1: Real-project wireup discovery fidelity — DEFER-81-01

- **What:** Discovery accuracy (true positive rate) when `discoverUnwiredFeatures()` runs on a real organic codebase vs. a synthetic fixture
- **How:** Run wireup discovery on the GRD codebase itself (as a self-test) and manually audit a sample of 10+ discovered features to assess false positive rate
- **Why deferred:** The fixture project plants features that the discovery engine is built to find. Fidelity on real projects requires a real project that was not designed around the heuristics
- **Validates at:** v0.3.14 (first real usage of `/grd:wireup` command on GRD)
- **Depends on:** All four phases (78-81) complete and the `/grd:wireup` command accessible via `gd wireup`
- **Target:** False positive rate < 30%; at least 2 out of 5 sampled discovered features confirmed as genuinely unwired by manual review
- **Risk if unmet:** Discovery heuristics may need tuning in a follow-up patch; the wireup command would produce noise that reduces trust in the tool
- **Fallback:** Narrow discovery heuristics to only file-level analysis (exported-but-never-imported); defer deeper analysis to future iterations

### D2: Live Playwright MCP scenario execution — DEFER-81-02

- **What:** Browser scenario execution via Playwright MCP tools when the MCP environment has Playwright available
- **How:** Run wireup with a fixture that includes browser scenarios against a running local dev server; verify navigate/fill/click/assert steps execute and capture console errors
- **Why deferred:** Playwright MCP environment not available in test CI; Phase 80 already deferred this in the milestone roadmap
- **Validates at:** Future milestone (tracked in ROADMAP.md Deferred Validations table)
- **Depends on:** Playwright MCP environment + running dev server + browser scenario fixture
- **Target:** Browser scenarios execute without unhandled rejection; console errors captured in report; graceful skip when Playwright unavailable
- **Risk if unmet:** Browser scenario code path untested in real execution; silent failures possible if Playwright integration has bugs
- **Fallback:** Browser scenarios are guarded by `playwright_available: false` flag; functional regression is minimal until live testing confirms correctness

## Ablation Plan

**No ablation plan** — Phase 81 implements integration wiring and test coverage rather than multiple algorithmic components. There are no sub-components to isolate or compare. The five MCP tools are wrappers over existing orchestrator functions; their individual contributions are not ablatable.

## WebMCP Tool Definitions

WebMCP tool definitions skipped — phase does not modify frontend views. All files modified are `lib/wireup/cli.ts`, `lib/mcp-server.ts`, `jest.config.js`, `tests/unit/wireup.test.ts`, and `tests/integration/wireup-e2e.test.ts`.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| TypeScript build | Current build passes | Exit code 0 | `npm run build:check` (passes as of 2026-03-20) |
| Full test suite | All existing tests pass | 0 failures | Current state: all test suites pass |
| Existing coverage | `lib/evolve/index.ts` threshold | lines: 85, functions: 94, branches: 70 | jest.config.js — used as target for wireup threshold |
| MCP server tool count | Evolve section registers 6 tools | N/A | Precedent for wireup section registering 5 |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/wireup.test.ts         (unit tests — created in plan 81-02)
tests/integration/wireup-e2e.test.ts  (integration test — created in plan 81-03)
```

**How to run full evaluation:**
```bash
# Sanity checks
npm run build:check
npm run lint
grep -c "grd_wireup_" lib/mcp-server.ts
grep -c "cmdWireup" lib/wireup/cli.ts
node -e "const c = require('./jest.config.js'); console.log(JSON.stringify(c.coverageThreshold['./lib/wireup/index.ts']))"

# Proxy metrics — unit tests with coverage
npx jest tests/unit/wireup.test.ts --coverage --coverageReporters=text

# Proxy metrics — integration test
npx jest tests/integration/wireup-e2e.test.ts --verbose

# Full suite gate
npm test
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: TypeScript compiles | [PASS/FAIL] | [output] | |
| S2: Five tool names in mcp-server.ts | [PASS/FAIL] | [count] | |
| S3: Five cmd wrappers in cli.ts | [PASS/FAIL] | [count] | |
| S4: Coverage threshold in jest.config.js | [PASS/FAIL] | [json] | |
| S5: ESLint passes | [PASS/FAIL] | [output] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Unit tests pass | 0 failures | [actual] | [MET/MISSED] | |
| P2: Line coverage >= 85% | 85% lines | [actual %] | [MET/MISSED] | |
| P3: Integration tests pass | 0 failures | [actual] | [MET/MISSED] | |
| P4: grd_wireup_run JSON structure | features_discovered + scenarios_run + issues_found | [actual fields] | [MET/MISSED] | |

### Ablation Results

N/A — no ablation plan for this phase.

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-81-01 | Real-project discovery fidelity | PENDING | v0.3.14 first wireup usage |
| DEFER-81-02 | Live Playwright MCP execution | PENDING | Future milestone |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — five mechanical checks cover compilation, registration, and config correctness; all have exact commands and unambiguous pass/fail outcomes
- Proxy metrics: Well-evidenced — coverage thresholds mirror existing project patterns (`lib/evolve/index.ts` at 85%); test pass/fail is a direct binary; JSON structure check maps 1:1 to the stated success criterion
- Deferred coverage: Comprehensive for in-phase risks — the two deferred items are genuinely external (real codebases, Playwright environment) and are already tracked in the milestone ROADMAP.md deferred table

**What this evaluation CAN tell us:**
- Whether all five MCP tools are registered with TypeScript-correct schemas
- Whether the `lib/wireup/` module surface (via barrel) has sufficient test coverage to catch regressions
- Whether the discover -> generate -> execute -> detect -> report pipeline is correctly wired on a controlled synthetic fixture
- Whether the JSON-RPC response structure from `grd_wireup_run` matches the specified contract

**What this evaluation CANNOT tell us:**
- Whether `discoverUnwiredFeatures()` has acceptable precision/recall on real organic codebases (deferred to DEFER-81-01 at v0.3.14)
- Whether browser scenario execution via Playwright works in a real MCP environment (deferred to DEFER-81-02)
- Whether test assertions are meaningful vs. vacuous (coverage % does not distinguish quality of assertions)
- Whether the wireup flow performs acceptably on large codebases (no performance benchmarking in this phase)

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-03-20*
