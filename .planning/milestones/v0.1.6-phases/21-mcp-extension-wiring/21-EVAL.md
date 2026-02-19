# Evaluation Plan: Phase 21 — MCP Extension & Wiring

**Designed:** 2026-02-17
**Designer:** Claude (grd-eval-planner)
**Methods evaluated:** MCP tool registration and wiring for CLI commands
**Reference papers:** N/A (integration work, not research)

## Evaluation Overview

Phase 21 wires 5 new CLI commands from v0.1.2 (requirement get, requirement list, requirement traceability, requirement update-status, search) into the MCP server as tools, bringing total tool count from 97 to 102. This is pure integration work — no research methods or paper implementations involved.

The evaluation focuses on verifying correct tool registration, schema definition, execution paths, test coverage, and documentation completeness. Since this is infrastructure work with deterministic outputs, we can verify everything through automated checks (sanity and proxy tiers). No deferred validation is needed — all verification happens in-phase.

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Tool count | lib/mcp-server.js COMMAND_DESCRIPTORS array | Confirms all 5 tools registered |
| Schema correctness | MCP JSON Schema spec + test assertions | Ensures tools are callable with correct parameters |
| Test coverage | Jest coverage report | Validates all code paths exercised |
| Documentation completeness | docs/mcp-server.md content inspection | User-facing documentation reflects implementation |
| Error handling | MCP error code -32602 on invalid input | MCP protocol compliance |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic functionality and format verification |
| Proxy (L2) | 5 | Automated quality metrics that confirm correctness |
| Deferred (L3) | 0 | No deferred validation — all verifiable in-phase |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module Import Check
- **What:** Verify lib/mcp-server.js loads without errors
- **Command:** `node -e "require('./lib/mcp-server')"`
- **Expected:** Exit code 0, no import errors in stderr
- **Failure means:** Syntax error or missing dependency in mcp-server.js

### S2: Tool Count Check
- **What:** Verify COMMAND_DESCRIPTORS has exactly 102 entries
- **Command:** `node -e "const {COMMAND_DESCRIPTORS} = require('./lib/mcp-server'); console.log(COMMAND_DESCRIPTORS.length)"`
- **Expected:** Output: `102`
- **Failure means:** Tools not registered or incorrect count

### S3: New Tool Registration Check
- **What:** Verify all 5 new tool names present in COMMAND_DESCRIPTORS
- **Command:** `node -e "const {COMMAND_DESCRIPTORS} = require('./lib/mcp-server'); const names = ['grd_requirement_get','grd_requirement_list','grd_requirement_traceability','grd_requirement_update_status','grd_search']; for (const n of names) { const d = COMMAND_DESCRIPTORS.find(x=>x.name===n); console.log(n, d ? 'OK' : 'MISSING'); }"`
- **Expected:** Output shows `OK` for all 5 tool names
- **Failure means:** Tool descriptor missing or incorrectly named

### S4: Test Suite Passes
- **What:** All existing and new tests pass
- **Command:** `npx jest tests/unit/mcp-server.test.js --no-coverage`
- **Expected:** Exit code 0, all tests pass, 0 failures
- **Failure means:** Test failure or implementation bug

### S5: Documentation Presence Check
- **What:** Verify all 5 new tools documented in docs/mcp-server.md
- **Command:** `grep -c "grd_requirement_get\|grd_requirement_list\|grd_requirement_traceability\|grd_requirement_update_status\|grd_search" docs/mcp-server.md`
- **Expected:** Output: at least 5 (each tool name appears at least once)
- **Failure means:** Documentation missing or incomplete

### S6: Tool Count Documentation Check
- **What:** Verify docs/mcp-server.md reflects 102 tools (not 97)
- **Command:** `grep -c "102" docs/mcp-server.md`
- **Expected:** Output: at least 2 (appears in multiple locations)
- **Failure means:** Documentation not updated with new count

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Automated quality metrics that approximate production readiness.
**IMPORTANT:** These are deterministic checks for integration work — not statistical proxies. All results are directly verifiable.

### P1: Schema Correctness
- **What:** All 5 new tools have correct JSON Schema parameter definitions
- **How:** Test assertions verify required/optional param flags, types, and descriptions
- **Command:** `npx jest tests/unit/mcp-server.test.js -t "grd_requirement.*has.*param" --no-coverage`
- **Target:** All schema spot-check tests pass (tests verify param schemas match CLI signatures)
- **Evidence:** Plan 21-01 Task 2 specifies schema spot-check tests for each new tool
- **Correlation with quality:** HIGH — schema errors would cause MCP tool calls to fail or behave incorrectly
- **Blind spots:** Doesn't verify execute lambdas are correct (covered by P2)
- **Validated:** Yes — deterministic check, not a proxy

### P2: Tool Execution Paths
- **What:** All 5 new tools callable via execute lambdas
- **How:** Bulk execution tests exercise each tool's lambda with valid/invalid input
- **Command:** `npx jest tests/unit/mcp-server.test.js -t "execute lambda" --no-coverage`
- **Target:** All execution lambda tests pass (7 tests covering all 5 tools with various inputs)
- **Evidence:** Plan 21-01 Task 2 specifies execution tests for each tool with different argument patterns
- **Correlation with quality:** HIGH — execution tests verify tools are callable end-to-end
- **Blind spots:** Tests run against fixture data, not production .planning/ structure (but fixtures are realistic)
- **Validated:** Yes — deterministic check, not a proxy

### P3: Test Coverage
- **What:** Line coverage on lib/mcp-server.js >= 80% for new code
- **How:** Jest coverage report filtered to new COMMAND_DESCRIPTORS entries
- **Command:** `npx jest tests/unit/mcp-server.test.js --coverage --collectCoverageFrom="lib/mcp-server.js"`
- **Target:** >= 80% line coverage overall (plan specifies this threshold)
- **Evidence:** Plan 21-01 Task 2 verification step requires >= 80% coverage
- **Correlation with quality:** MEDIUM — coverage doesn't guarantee correctness, but low coverage means untested paths
- **Blind spots:** Coverage doesn't measure test quality, only execution
- **Validated:** Yes — deterministic metric

### P4: Error Handling
- **What:** Invalid input to new tools returns proper MCP error responses
- **How:** Test calls tools with missing required params and checks for -32602 error code
- **Command:** `npx jest tests/unit/mcp-server.test.js -t "error paths" --no-coverage`
- **Target:** MCP error code -32602 (Invalid params) returned for missing required params
- **Evidence:** Plan 21-01 success criteria specify proper MCP error responses; existing tests verify error codes
- **Correlation with quality:** HIGH — error handling is critical for MCP protocol compliance
- **Blind spots:** Only tests missing params, not all invalid input patterns
- **Validated:** Yes — deterministic check

### P5: Documentation Completeness
- **What:** All 5 tools documented with descriptions and example JSON-RPC calls
- **How:** Manual inspection of docs/mcp-server.md sections
- **Command:** `grep -A 1 "grd_requirement_get\|grd_requirement_list\|grd_requirement_traceability\|grd_requirement_update_status\|grd_search" docs/mcp-server.md | head -20`
- **Target:** Each tool has table entry with description; at least one example JSON-RPC call shown
- **Evidence:** Plan 21-02 Task 1 specifies documentation structure and example calls
- **Correlation with quality:** MEDIUM — documentation quality is subjective, but presence is measurable
- **Blind spots:** Can't measure clarity or usefulness, only presence of content
- **Validated:** Yes — content presence is deterministic

## Level 3: Deferred Validations

**No deferred validations for this phase.**

**Rationale:** Phase 21 is pure integration work with no external dependencies or production data requirements. All verification is achievable through automated checks in-phase:
- Tool registration is verifiable via module inspection
- Schema correctness is verifiable via test assertions
- Execution paths are verifiable via test execution
- Documentation completeness is verifiable via content inspection

**Integration verification:** The MCP server itself was validated in Phase 16. Phase 21 only adds 5 new tool descriptors following the exact same pattern as 97 existing tools. No new integration points or runtime behaviors introduced.

**Production validation:** MCP tools are consumed by MCP clients (Claude Code, Claude Desktop, etc.). Real-world usage will naturally validate these tools, but no formal validation phase is needed — any issues will surface during normal usage and can be fixed incrementally.

## Ablation Plan

**No ablation plan** — Phase 21 adds functionality (new MCP tools) with no sub-components to isolate. The 5 tools are independent of each other; success of one doesn't depend on others.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Pre-Phase Tool Count | Number of MCP tools before Phase 21 | 97 | lib/mcp-server.js COMMAND_DESCRIPTORS count |
| Test Count | Existing mcp-server tests | ~100+ tests | tests/unit/mcp-server.test.js |
| Coverage | lib/mcp-server.js line coverage | ~85% | Phase 16 test suite baseline |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/mcp-server.test.js (existing test suite with new tests added)
```

**How to run full evaluation:**

```bash
# Sanity checks (run from repo root)
cd /Users/edward.seo/dev/private/project/harness/GetResearchDone

# S1: Module import
node -e "require('./lib/mcp-server')"

# S2: Tool count
node -e "const {COMMAND_DESCRIPTORS} = require('./lib/mcp-server'); console.log(COMMAND_DESCRIPTORS.length)"

# S3: New tool registration
node -e "const {COMMAND_DESCRIPTORS} = require('./lib/mcp-server'); const names = ['grd_requirement_get','grd_requirement_list','grd_requirement_traceability','grd_requirement_update_status','grd_search']; for (const n of names) { const d = COMMAND_DESCRIPTORS.find(x=>x.name===n); console.log(n, d ? 'OK' : 'MISSING'); }"

# S4: Test suite
npx jest tests/unit/mcp-server.test.js --no-coverage

# S5: Documentation presence
grep -c "grd_requirement_get\|grd_requirement_list\|grd_requirement_traceability\|grd_requirement_update_status\|grd_search" docs/mcp-server.md

# S6: Tool count documentation
grep -c "102" docs/mcp-server.md

# Proxy metrics
# P1: Schema correctness
npx jest tests/unit/mcp-server.test.js -t "grd_requirement.*has.*param" --no-coverage

# P2: Tool execution
npx jest tests/unit/mcp-server.test.js -t "execute lambda" --no-coverage

# P3: Test coverage
npx jest tests/unit/mcp-server.test.js --coverage --collectCoverageFrom="lib/mcp-server.js"

# P4: Error handling
npx jest tests/unit/mcp-server.test.js -t "error paths" --no-coverage

# P5: Documentation completeness (manual inspection)
grep -A 1 "grd_requirement_get\|grd_requirement_list\|grd_requirement_traceability\|grd_requirement_update_status\|grd_search" docs/mcp-server.md
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module import | [PASS/FAIL] | [output] | |
| S2: Tool count | [PASS/FAIL] | [output] | |
| S3: New tool registration | [PASS/FAIL] | [output] | |
| S4: Test suite passes | [PASS/FAIL] | [output] | |
| S5: Documentation presence | [PASS/FAIL] | [output] | |
| S6: Tool count documentation | [PASS/FAIL] | [output] | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Schema correctness | All tests pass | [result] | [MET/MISSED] | |
| P2: Tool execution paths | All tests pass | [result] | [MET/MISSED] | |
| P3: Test coverage | >= 80% | [result] | [MET/MISSED] | |
| P4: Error handling | MCP -32602 error | [result] | [MET/MISSED] | |
| P5: Documentation completeness | All 5 tools documented | [result] | [MET/MISSED] | |

### Ablation Results

N/A — No ablation study for integration work.

### Deferred Status

N/A — No deferred validations for this phase.

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — 6 checks cover all critical integration points (imports, registration, tests, docs)
- Proxy metrics: Well-evidenced — All metrics are deterministic checks (not statistical proxies). Each metric directly measures a success criterion.
- Deferred coverage: N/A — No deferred validations needed. All verification achievable in-phase.

**What this evaluation CAN tell us:**
- Whether all 5 tools are correctly registered in COMMAND_DESCRIPTORS
- Whether tool schemas match CLI command signatures
- Whether tools are callable via MCP protocol
- Whether error handling follows MCP spec
- Whether documentation reflects the implementation
- Whether test coverage meets quality bar

**What this evaluation CANNOT tell us:**
- Whether tools are useful to end users (requires user feedback)
- Whether performance is acceptable in production (requires load testing — not in scope)
- Whether tools integrate well with all MCP clients (requires multi-client testing — not in scope)

**Limitations are acceptable because:**
- Phase 21 is infrastructure work with narrow scope (tool registration only)
- Real-world validation will happen naturally during usage
- Any issues are fixable incrementally without blocking milestone

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-17*
