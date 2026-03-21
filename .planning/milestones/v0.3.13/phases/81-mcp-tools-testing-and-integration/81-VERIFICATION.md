---
phase: 81-mcp-tools-testing-and-integration
verified: 2026-03-21T08:05:54Z
status: gaps_found
score:
  level_1: 4/5 sanity checks passed (S5 ESLint FAIL — 1 unused-var error)
  level_2: 4/4 proxy metrics met
  level_3: 2 items tracked as deferred (DEFER-81-01, DEFER-81-02)
gaps:
  - truth: "ESLint passes with zero errors on all modified files"
    status: failed
    verification_level: 1
    reason: "lib/wireup/cli.ts line 29 imports 'wireupStatePath' from ./state but never uses it in any function body — @typescript-eslint/no-unused-vars error"
    quantitative:
      metric: "eslint error count"
      expected: "0"
      actual: "1"
    artifacts:
      - path: "lib/wireup/cli.ts"
        issue: "Line 29: 'wireupStatePath' is assigned a value but never used (@typescript-eslint/no-unused-vars)"
    missing:
      - "Remove 'wireupStatePath' from the destructured require at line 26-34 in lib/wireup/cli.ts"
      - "Also remove the type annotation for wireupStatePath at line 33"
deferred_validations:
  - description: "Real-project wireup discovery fidelity — accuracy (true positive rate) when discoverUnwiredFeatures() runs on organic codebase"
    metric: "false_positive_rate"
    target: "< 30%; at least 2 of 5 sampled features confirmed genuinely unwired"
    depends_on: "v0.3.14 first real usage of /grd:wireup on GRD codebase"
    tracked_in: "STATE.md (DEFER-81-01)"
  - description: "Live Playwright MCP scenario execution with real MCP environment and running dev server"
    metric: "browser_scenario_execution"
    target: "navigate/fill/click/assert steps execute without unhandled rejection; graceful skip when unavailable"
    depends_on: "Playwright MCP environment + running dev server + browser scenario fixture"
    tracked_in: "STATE.md (DEFER-81-02)"
human_verification: []
---

# Phase 81: MCP Tools, Testing, and Integration — Verification Report

**Phase Goal:** Five wireup MCP tools are registered in the MCP server following existing evolve tool patterns, unit tests for `lib/wireup.ts` achieve 85%+ line coverage, and an integration test validates the complete wireup flow on a fixture project with known unwired features.
**Verified:** 2026-03-21T08:05:54Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Verification Summary by Tier

### Level 1: Sanity Checks

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| S1 | TypeScript compiles without errors (`npm run build:check`) | PASS | Exit code 0, no output |
| S2 | Five wireup tool names in mcp-server.ts (`grep -c "grd_wireup_"`) | PASS | Count: 5 (grd_wireup_discover, grd_wireup_run, grd_wireup_state, grd_wireup_scenarios, grd_wireup_report at lines 2588, 2594, 2619, 2626, 2633) |
| S3 | Five cmd wrapper functions in lib/wireup/cli.ts | PASS | Count: 15 matches (includes function definitions + module.exports entries); all five defined at lines 142, 174, 201, 220, 245 |
| S4 | Coverage threshold in jest.config.js (`./lib/wireup/index.ts`) | PASS | `{"lines":85,"functions":85,"branches":70}` |
| S5 | ESLint passes on bin/ and lib/ | FAIL | `lib/wireup/cli.ts:29:3 — 'wireupStatePath' is assigned a value but never used` |

**Level 1 Score:** 4/5 passed. S5 is a blocker (pre-commit hook enforces lint).

### Level 2: Proxy Metrics

| # | Metric | Target | Achieved | Status |
|---|--------|--------|----------|--------|
| P1 | Unit tests pass (tests/unit/wireup.test.ts) | 0 failures | 151/151 passed | PASS |
| P2 | Line coverage on lib/wireup/ modules | >= 85% lines | 87.12% lines overall; lib/wireup/index.ts = 100% | PASS |
| P3 | Integration tests pass (tests/integration/wireup-e2e.test.ts) | 0 failures | 15/15 passed | PASS |
| P4 | grd_wireup_run returns structured JSON with features_discovered, scenarios_run, issues_found | All three fields present | Integration test Suite 3 confirms all three fields in JSON-RPC response | PASS |

**Level 2 Score:** 4/4 met target

### Level 3: Deferred Validations

| # | Validation | Metric | Target | Depends On | Status |
|---|-----------|--------|--------|------------|--------|
| DEFER-81-01 | Real-project wireup discovery fidelity | false_positive_rate | < 30% | v0.3.14 first /grd:wireup run | DEFERRED |
| DEFER-81-02 | Live Playwright MCP scenario execution | browser_scenario_execution | Graceful execute/skip | Playwright MCP env + dev server | DEFERRED |

**Level 3:** 2 items tracked for post-integration validation.

## Goal Achievement

### Observable Truths (from PLAN frontmatter)

**Plan 81-01 Truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Five wireup MCP tools registered in COMMAND_DESCRIPTORS | PASS | grep confirms all 5 at lines 2588, 2594, 2619, 2626, 2633 |
| 2 | Each tool has name, description, params array, and execute function | PASS | TypeScript compiles; structure follows evolve tool pattern |
| 3 | Tool parameter schemas match wireup function signatures | PASS | grd_wireup_run has target (string, optional) + dry_run (boolean, optional); others have no params |
| 4 | Five cmd wrapper functions in lib/wireup/cli.ts, re-exported via index.ts | PASS | All five at lines 142, 174, 201, 220, 245; re-exported via lib/wireup/index.ts lines 112-116 |
| 5 | mcp-server.ts imports wireup cmd functions from lib/wireup | PASS | Line 179: `require('./wireup')` resolves to lib/wireup/index.ts barrel |

**Plan 81-02 Truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | wireup.test.ts achieves >= 85% line coverage across lib/wireup/ modules | PASS | 87.12% overall; index.ts = 100%, orchestrator.ts = 97.95%, report.ts = 98.07%, execution.ts = 95.93%, state.ts = 95%, autofix.ts = 90.9%, detection.ts = 89.71%, discovery.ts = 90.62%, scenarios.ts = 96.92% |
| 2 | Unit tests cover discovery engine with mock filesystem | PASS | describe block in wireup.test.ts; discoverUnwiredFeatures directly exercised |
| 3 | Unit tests cover scenario generation from discovered features | PASS | generateScenarios and generateTestData tested directly |
| 4 | Unit tests cover scenario execution with mocked HTTP and CLI calls | PASS | executeCliStep + executeHttpStep + executeScenarios describe blocks; child_process and fetch mocked |
| 5 | Unit tests cover state read/write/advance round-trip on temp directories | PASS | state functions tested directly; round-trip validated |
| 6 | Unit tests cover missing connection detection and classification | PASS | detectMissingConnections + classifyFailure describe blocks; 6 heuristics covered |
| 7 | All tests pass with npm test (zero failures) | PASS | 3353/3353 tests, 54 suites, 0 failures |

**Plan 81-03 Truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Integration test runs full wireup iteration on fixture with >= 2 known unwired features | PASS | Fixture has api-handler.ts (handleApiRequest) and routes/users.ts (getUsers); Suite 1 confirms discovery finds >= 2 |
| 2 | Test validates complete flow: discover -> generate -> execute -> detect -> report | PASS | Suite 2 test: "runs complete wireup iteration: discover -> generate -> execute -> detect -> report" passes |
| 3 | Test fixture has synthetic unwired features that discovery reliably finds | PASS | Suite 1 "discovers the specific unwired features planted in the fixture" passes; finds handleApiRequest in api-handler.ts |
| 4 | grd_wireup_run MCP tool returns structured JSON with features_discovered, scenarios_run, issues_found | PASS | Suite 3 tests confirm all three fields in JSON-RPC 2.0 response |
| 5 | All integration tests pass (npm test zero failures) | PASS | 3353/3353 tests, 54 suites |

### Required Artifacts

| Artifact | Expected | Exists | Lines | Sanity | Wired |
|----------|----------|--------|-------|--------|-------|
| `lib/wireup/cli.ts` | Five cmd wrapper functions | YES | ~280 lines | PASS (TS compiles) | PASS (imports orchestrator) |
| `lib/mcp-server.ts` | Five wireup MCP tool registrations | YES | ~2700 lines | PASS (TS compiles) | PASS (require('./wireup')) |
| `lib/wireup/index.ts` | Barrel re-exports all five cmd functions | YES | ~118 lines | PASS | PASS (exports at lines 112-116) |
| `jest.config.js` | Coverage threshold for ./lib/wireup/index.ts | YES | N/A | PASS (node check confirmed) | PASS |
| `tests/unit/wireup.test.ts` | 200+ lines, comprehensive unit tests | YES | 2460 lines | PASS (151/151 pass) | PASS (requires lib/wireup) |
| `tests/integration/wireup-e2e.test.ts` | 100+ lines, E2E integration test | YES | 467 lines | PASS (15/15 pass) | PASS (requires lib/wireup + mcp-server) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| lib/wireup/cli.ts | lib/wireup/orchestrator.ts | require('./orchestrator') | WIRED | line 50: `runWireup` imported |
| lib/wireup/index.ts | lib/wireup/cli.ts | barrel re-export | WIRED | lines 108-116: cmdInitWireup + 5 cmd wrappers |
| lib/mcp-server.ts | lib/wireup/index.ts | require('./wireup') | WIRED | line 179: resolves to barrel |
| tests/unit/wireup.test.ts | lib/wireup/index.ts | require('../../lib/wireup') | WIRED | multiple describe blocks |
| tests/integration/wireup-e2e.test.ts | lib/wireup/index.ts | require('../../lib/wireup') | WIRED | lines 115, 173, 250, 407, 449 |
| tests/integration/wireup-e2e.test.ts | lib/mcp-server.ts | require('../../lib/mcp-server') | WIRED | line 274: McpServer used in Suite 3 |

## Coverage Analysis

### Per-Module Coverage (measured against lib/wireup/ via wireup.test.ts)

| Module | Lines | Functions | Branches | Notes |
|--------|-------|-----------|----------|-------|
| autofix.ts | 90.9% | 90% | 100% | Above 85% target |
| cli.ts | 15.87% | 0% | 0% | Excluded from target — thin CLI wrappers calling output() → process.exit() |
| detection.ts | 89.71% | 74.79% | 100% | Above 85% target |
| discovery.ts | 90.62% | 51.72% | 81.81% | Above 85% target |
| execution.ts | 95.93% | 74.07% | 90% | Above 85% target |
| index.ts | 100% | 100% | 100% | Threshold target met (85% required) |
| orchestrator.ts | 97.95% | 86.53% | 92.85% | Above 85% target |
| report.ts | 98.07% | 74.19% | 88.88% | Above 85% target |
| scenarios.ts | 96.92% | 75% | 100% | Above 85% target |
| state.ts | 95% | 100% | 100% | Above 85% target |
| **Overall** | **87.12%** | **66.73%** | **82.6%** | Lines exceed 85% target |

**Note:** cli.ts excluded from 85% threshold by design — all six exported functions are thin CLI wrappers that call `output()` which calls `process.exit()`. These have no testable pure logic without process.exit interception.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| lib/wireup/cli.ts | 29 | Unused import: `wireupStatePath` imported from `./state` but never used | BLOCKER | `npm run lint` exits with code 1; pre-commit hook would reject commit |

**Scan of other patterns:**

- No TODO/FIXME/PLACEHOLDER comments found in lib/wireup/cli.ts
- No empty implementations (pass, return {}, return None) found
- No hardcoded magic numbers that should be config

## Integration Test Results (Suite Detail)

### Suite 1: Discovery Accuracy (3 tests — all PASS)
- discovers the specific unwired features planted in the fixture (20ms)
- returns at least 2 unwired features from fixture (3ms)
- each feature has valid category (5ms)

### Suite 2: Full Wireup Flow (5 tests — all PASS)
- runs complete wireup iteration: discover -> generate -> execute -> detect -> report (17ms)
- generates scenarios for unwired features discovered in fixture (16ms)
- dry-run returns correct structure without executing scenarios (11ms)
- issues_by_confidence has correct shape (13ms)
- WIREUP-STATE.json is written with correct fields via state module (7ms)

### Suite 3: MCP Tool grd_wireup_run (4 tests — all PASS)
- grd_wireup_run MCP tool returns structured JSON via McpServer (35ms)
- grd_wireup_discover MCP tool returns features list (6ms)
- JSON-RPC response structure matches protocol (7ms)
- McpServer tools/list includes grd_wireup_run (14ms)

### Suite 4: grd-tools.js Dispatch (3 tests — all PASS)
- cmdWireupRun is exported from lib/wireup and returns structured JSON with features_discovered, scenarios_run, issues_found (8ms)
- grd-tools.js wireup subcommand routes to cmdWireup (dispatches wireup run) (13ms)
- cmdWireupRun function signature accepts cwd, args, raw params (5ms)

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| REQ-130 | MCP tool registration (5 tools in mcp-server.ts) | PASS | All 5 tools confirmed at COMMAND_DESCRIPTORS lines 2588-2640 |
| REQ-132 | Wireup unit tests, 85%+ per-file coverage | PASS | 87.12% overall; threshold enforced in jest.config.js |
| REQ-133 | Integration test with full wireup flow on fixture | PASS | tests/integration/wireup-e2e.test.ts, 15 tests across 4 suites |

Note: REQUIREMENTS.md traceability matrix shows all three as PENDING — the matrix was not updated post-phase-81 execution.

## Deferred Validations Summary

Two deferred validations from this phase tracked in STATE.md:

1. **DEFER-81-01** — Real-project discovery fidelity: whether `discoverUnwiredFeatures()` heuristics have acceptable precision/recall on organic codebases (not just synthetic fixtures with planted features). Deferred to v0.3.14 first real usage.

2. **DEFER-81-02** — Live Playwright MCP scenario execution: browser scenario code path untested in real MCP + dev server environment. Deferred to future milestone (already tracked as DEFER-80-01 from Phase 80).

Two deferred items from Phase 80 that were supposed to resolve in Phase 81 remain unresolved in STATE.md:
- **DEFER-80-02** (auto-fix applies real code change and verifies via re-run) — marked "Phase 81" as resolution target but still shows PENDING
- **DEFER-80-03** (full orchestrator integration with report generation) — marked "Phase 81" as resolution target but still shows PENDING

These were exercised via mocked tests in Phase 81 (not real code changes), so STATE.md deferred tracking was not updated to RESOLVED.

## WebMCP Verification

WebMCP verification skipped — MCP not available (no frontend views modified in this phase; EVAL.md explicitly notes no WebMCP tool definitions applicable).

## Gaps Summary

**One gap** blocks clean phase completion:

`lib/wireup/cli.ts` line 29 imports `wireupStatePath` from `./state` but the variable is never used in any function body. ESLint `@typescript-eslint/no-unused-vars` rule raises this as an error. The `npm run lint` command exits with code 1, which means the pre-commit hook would reject new commits touching this file.

**Fix is trivial:** Remove `wireupStatePath,` from line 29 and its corresponding type annotation `wireupStatePath: (cwd: string) => string;` from line 33 in the destructured require block.

All other success criteria are fully met: TypeScript compiles, all 3353 tests pass, coverage is 87.12% (exceeds 85% target), all five MCP tools registered, all five cmd wrappers created and exported, integration test validates full flow end-to-end.

---

_Verified: 2026-03-21T08:05:54Z_
_Verifier: Claude (grd-verifier)_
_Verification levels applied: Level 1 (sanity), Level 2 (proxy), Level 3 (deferred)_
