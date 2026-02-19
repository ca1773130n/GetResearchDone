# Evaluation Plan: Phase 16 — MCP Server

**Designed:** 2026-02-16
**Designer:** Claude (grd-eval-planner)
**Method(s) evaluated:** MCP JSON-RPC 2.0 protocol implementation, stdio transport, dynamic tool schema generation
**Reference papers:** N/A (protocol implementation, not research)
**Reference specifications:** MCP Protocol Specification 2024-11-05

## Evaluation Overview

Phase 16 implements an MCP (Model Context Protocol) server that exposes all GRD CLI commands as MCP tools over stdio transport. This is a protocol implementation phase, not a machine learning or research evaluation phase. Success is measured by protocol compliance, tool schema completeness, error handling robustness, and integration reliability.

The evaluation focuses on three critical dimensions:
1. **Protocol compliance:** Does the server implement MCP JSON-RPC 2.0 correctly?
2. **Tool coverage:** Are all 120+ GRD CLI commands exposed with accurate schemas?
3. **Robustness:** Does the server handle errors gracefully without crashes?

Unlike ML-focused phases, there are no paper metrics to reproduce, no proxy/deferred evaluation split for quality metrics, and no ablation studies. The verification levels here map to different integration stages: sanity (module loads), proxy (protocol compliance via automated tests), and deferred (real MCP client integration).

### Metric Sources

| Metric | Source | Why This Metric |
|--------|--------|----------------|
| Protocol handshake success | MCP spec 2024-11-05 | Required for any MCP client to connect |
| Tool count >= 50 | Plan 16-01 requirement | Validates schema generation covers CLI commands |
| JSON Schema validity | JSON Schema spec | Required for MCP clients to understand tool params |
| Error code compliance | JSON-RPC 2.0 spec | Required for robust error handling |
| Test coverage >= 80% | REQ-27 (Plan 16-02) | Industry standard for production code |
| Tools execute and return JSON | MCP spec 2024-11-05 | Core MCP tool invocation requirement |

### Verification Level Summary

| Level | Count | Purpose |
|-------|-------|---------|
| Sanity (L1) | 6 | Basic functionality and format verification |
| Proxy (L2) | 8 | Protocol compliance and automated integration testing |
| Deferred (L3) | 2 | Real MCP client integration and cross-backend validation |

## Level 1: Sanity Checks

**Purpose:** Verify basic functionality. These MUST ALL PASS before proceeding.

### S1: Module loads without error
- **What:** lib/mcp-server.js can be required without throwing
- **Command:** `node -e "require('./lib/mcp-server')"`
- **Expected:** Exit code 0, no error output
- **Failure means:** Syntax error, missing dependency, or import path issue

### S2: Exports are present
- **What:** McpServer class, buildToolDefinitions function, and COMMAND_DESCRIPTORS array are exported
- **Command:** `node -e "const m = require('./lib/mcp-server'); console.log(typeof m.McpServer, typeof m.buildToolDefinitions, Array.isArray(m.COMMAND_DESCRIPTORS))"`
- **Expected:** Output: `function function true`
- **Failure means:** Export structure incorrect

### S3: Server instantiates
- **What:** McpServer class can be instantiated without crashing
- **Command:** `node -e "const { McpServer } = require('./lib/mcp-server'); const s = new McpServer({ cwd: process.cwd() }); console.log('OK')"`
- **Expected:** Output: `OK`
- **Failure means:** Constructor error, missing required dependencies

### S4: Entry point starts
- **What:** bin/grd-mcp-server.js starts and waits for input (does not immediately crash)
- **Command:** `timeout 2s node bin/grd-mcp-server.js < /dev/null || echo "EXIT:$?"`
- **Expected:** Exit after timeout or graceful exit on EOF
- **Failure means:** Entry point crashes on startup

### S5: Tool definitions generate
- **What:** buildToolDefinitions returns non-empty array
- **Command:** `node -e "const { buildToolDefinitions } = require('./lib/mcp-server'); const defs = buildToolDefinitions(); console.log(defs.length)"`
- **Expected:** Number >= 50 (should be ~100+ covering all CLI commands)
- **Failure means:** Tool registry empty or broken

### S6: Tool definitions have required fields
- **What:** Each tool definition has name, description, and inputSchema
- **Command:** `node -e "const { buildToolDefinitions } = require('./lib/mcp-server'); const defs = buildToolDefinitions(); const valid = defs.every(d => d.name && d.description && d.inputSchema); console.log(valid)"`
- **Expected:** Output: `true`
- **Failure means:** Schema generation incomplete

**Sanity gate:** ALL sanity checks must pass. Any failure blocks progression.

## Level 2: Proxy Metrics

**Purpose:** Protocol compliance and automated integration testing.
**IMPORTANT:** These are not ML proxy metrics — they are deterministic protocol compliance checks that can be fully validated in-phase.

### P1: Protocol handshake (initialize)
- **What:** Server responds correctly to initialize request with protocolVersion, capabilities, and serverInfo
- **How:** Send initialize JSON-RPC message via stdin, capture stdout response
- **Command:** `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node bin/grd-mcp-server.js`
- **Target:** Response JSON with `result.protocolVersion = "2024-11-05"`, `result.capabilities.tools = {}`, `result.serverInfo.name = "grd-mcp-server"`
- **Evidence:** MCP spec requires initialize handshake before any other operations
- **Pass criteria:** Response is valid JSON-RPC with correct structure
- **Automated verification:** Plan 16-02 test suite includes protocol handshake tests

### P2: Tool listing (tools/list)
- **What:** Server responds to tools/list with complete tool registry
- **How:** Send tools/list JSON-RPC message, parse response
- **Command:** `echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node bin/grd-mcp-server.js | tail -1`
- **Target:** Response with `result.tools` array containing >= 50 tools
- **Evidence:** Plan 16-01 requires all CLI commands exposed as MCP tools
- **Pass criteria:** Array length >= 50, each tool has name/description/inputSchema
- **Automated verification:** Plan 16-02 test suite validates tool count and schema structure

### P3: Tool schema validity
- **What:** Each tool's inputSchema is valid JSON Schema with type, properties, and required (if applicable)
- **How:** Generate tool definitions, validate each inputSchema structure
- **Command:** Validated in test suite (tests/unit/mcp-server.test.js)
- **Target:** All inputSchema objects have `type: "object"` and `properties` object
- **Evidence:** MCP spec requires JSON Schema for tool parameters
- **Pass criteria:** All tool schemas parse as valid JSON Schema
- **Automated verification:** Plan 16-02 schema generation tests

### P4: Tool naming convention
- **What:** Tool names follow `grd_{command}_{subcommand}` pattern
- **How:** Check tool name format matches expected pattern
- **Command:** Validated in test suite (tests/unit/mcp-server.test.js)
- **Target:** All names match pattern, no duplicates
- **Evidence:** Consistent naming required for discoverability
- **Pass criteria:** All tool names unique and follow convention
- **Automated verification:** Plan 16-02 registry completeness tests

### P5: Tool execution (successful invocation)
- **What:** tools/call executes representative commands and returns structured results
- **How:** Send tools/call messages for grd_state_load, grd_validate_consistency, grd_detect_backend
- **Command:** Validated in test suite (tests/unit/mcp-server.test.js)
- **Target:** Response with `result.content[0].text` containing valid JSON
- **Evidence:** MCP spec defines content array format for tool results
- **Pass criteria:** Successful execution returns content with text field containing parseable JSON
- **Automated verification:** Plan 16-02 tool execution tests

### P6: Error handling (JSON-RPC error codes)
- **What:** Server returns correct JSON-RPC error codes for various error conditions
- **How:** Send malformed/invalid requests, validate error responses
- **Command:** Validated in test suite (tests/unit/mcp-server.test.js)
- **Target:**
  - Unknown method → error code -32601
  - Invalid params → error code -32602
  - Parse error → error code -32700
  - Invalid request → error code -32600
  - Internal error → error code -32603
- **Evidence:** JSON-RPC 2.0 spec defines standard error codes
- **Pass criteria:** All error paths return correct error codes, no crashes
- **Automated verification:** Plan 16-02 error handling tests

### P7: Test coverage
- **What:** Unit test coverage for lib/mcp-server.js
- **How:** Run jest with coverage collection
- **Command:** `npx jest --coverage --collectCoverageFrom='lib/mcp-server.js' tests/unit/mcp-server.test.js`
- **Target:** >= 80% line coverage, >= 80% function coverage, >= 60% branch coverage
- **Evidence:** REQ-27 specifies >= 80% line coverage requirement
- **Pass criteria:** Coverage thresholds met in jest.config.js
- **Automated verification:** Jest enforces thresholds, CI will fail if not met

### P8: No test regressions
- **What:** Full test suite still passes after MCP server addition
- **How:** Run full jest suite
- **Command:** `npx jest --coverage`
- **Target:** All tests pass, total test count increases by ~40+ tests (from 858 baseline to >900)
- **Evidence:** New code must not break existing functionality
- **Pass criteria:** Exit code 0, test count increased
- **Automated verification:** CI runs full test suite

## Level 3: Deferred Validations

**Purpose:** Integration testing requiring real MCP clients or multi-backend validation.

### D1: Real MCP client integration — DEFER-16-01
- **What:** GRD MCP server works with an actual MCP client (Claude Desktop, Codex CLI, or Gemini CLI)
- **How:** Configure a real MCP client to connect to `node bin/grd-mcp-server.js`, invoke GRD tools from the client
- **Why deferred:** Requires MCP client configuration and manual verification; cannot be fully automated in-phase
- **Validates at:** phase-18-integration (end-to-end integration validation)
- **Depends on:** MCP server implementation complete, real MCP client available for testing
- **Target:**
  - MCP client successfully lists GRD tools
  - MCP client can invoke at least 3 representative tools (state load, phase add, validate consistency)
  - Tool results are usable from client context (JSON parsing, error messages)
- **Risk if unmet:** MCP server may be protocol-compliant but not work with real clients due to subtle compatibility issues
- **Fallback:** Debug via protocol trace logging, fix compatibility issues, re-test
- **Validation plan:**
  1. Install Claude Desktop or configure Codex/Gemini MCP settings
  2. Add GRD MCP server to client's server list
  3. Verify client shows GRD tools in available tools
  4. Invoke grd_state_load, grd_phase_add, grd_validate_consistency from client
  5. Verify results are formatted correctly and usable

### D2: Cross-backend tool coverage — DEFER-16-02
- **What:** All 120+ GRD CLI commands are correctly exposed as MCP tools across all 4 backends
- **How:** Verify tool listing from Claude Code, Codex CLI, Gemini CLI, and OpenCode MCP clients
- **Why deferred:** Requires access to all 4 backend environments; time-intensive to test all tools manually
- **Validates at:** phase-18-integration (full cross-backend validation)
- **Depends on:** All backends support MCP stdio servers (confirmed from LANDSCAPE.md)
- **Target:**
  - Tool count is consistent across all backends (expected: ~100+ tools)
  - Representative sample of 10 tools works on each backend
  - No backend-specific failures or compatibility issues
- **Risk if unmet:** Some backends may not fully support MCP stdio pattern or may have subtle protocol differences
- **Fallback:** Document backend-specific limitations, provide backend-specific workarounds if needed
- **Validation plan:**
  1. Configure MCP server on Claude Code, Codex, Gemini, OpenCode
  2. Request tool list from each backend
  3. Verify tool count matches expected (~100+)
  4. Test representative sample on each backend:
     - state: load, get, patch
     - phase: add, complete
     - verify: plan-structure, consistency
     - init: execute-phase, new-project
     - tracker: sync-roadmap, sync-status
  5. Document any backend-specific issues

## Ablation Plan

**No ablation plan** — This phase implements a protocol handler with no sub-components to isolate. The MCP server is a single cohesive implementation: protocol parsing, tool registry, and tool dispatch are interdependent.

## Baselines

| Baseline | Description | Expected Score | Source |
|----------|-------------|----------------|--------|
| Test count | Total Jest tests before Phase 16 | 858 tests | Plan 16-02 |
| Coverage | lib/ coverage before Phase 16 | 80%+ per-module | jest.config.js |

## Evaluation Scripts

**Location of evaluation code:**
```
tests/unit/mcp-server.test.js (comprehensive test suite)
jest.config.js (coverage thresholds)
bin/grd-mcp-server.js (manual protocol testing via echo pipe)
```

**How to run full evaluation:**

```bash
# Sanity checks
node -e "require('./lib/mcp-server')"
node -e "const { McpServer } = require('./lib/mcp-server'); new McpServer({ cwd: process.cwd() })"
node -e "const { buildToolDefinitions } = require('./lib/mcp-server'); console.log(buildToolDefinitions().length)"

# Protocol compliance (manual smoke test)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | node bin/grd-mcp-server.js

# Automated test suite
npx jest tests/unit/mcp-server.test.js --verbose

# Coverage validation
npx jest --coverage --collectCoverageFrom='lib/mcp-server.js' tests/unit/mcp-server.test.js

# Full regression check
npx jest --coverage
```

## Results Template

*To be filled by grd-eval-reporter after phase execution.*

### Sanity Results

| Check | Status | Output | Notes |
|-------|--------|--------|-------|
| S1: Module loads | | | |
| S2: Exports present | | | |
| S3: Server instantiates | | | |
| S4: Entry point starts | | | |
| S5: Tool definitions generate | | | |
| S6: Tool schema structure | | | |

### Proxy Results

| Metric | Target | Actual | Status | Notes |
|--------|--------|--------|--------|-------|
| P1: Protocol handshake | Valid init response | | | |
| P2: Tool listing | >= 50 tools | | | |
| P3: Schema validity | All valid JSON Schema | | | |
| P4: Naming convention | All match pattern | | | |
| P5: Tool execution | 3+ tools return JSON | | | |
| P6: Error handling | All 5 error codes correct | | | |
| P7: Test coverage | >= 80% lines | | | |
| P8: No regressions | All tests pass, count +40 | | | |

### Deferred Status

| ID | Metric | Status | Validates At |
|----|--------|--------|-------------|
| DEFER-16-01 | Real MCP client integration | PENDING | phase-18-integration |
| DEFER-16-02 | Cross-backend tool coverage | PENDING | phase-18-integration |

## Evaluation Confidence

**Overall confidence in evaluation design:** HIGH

**Justification:**
- Sanity checks: Adequate — covers all critical startup paths (module load, instantiation, tool generation, entry point)
- Proxy metrics: Well-evidenced — all metrics are deterministic protocol compliance checks with clear pass/fail criteria, directly testable via automated test suite
- Deferred coverage: Comprehensive — real MCP client integration and cross-backend validation are the only aspects requiring external dependencies; everything else is verifiable in-phase

**What this evaluation CAN tell us:**
- Whether the MCP protocol implementation is correct and compliant
- Whether all GRD CLI commands are exposed with valid schemas
- Whether error handling is robust (no crashes on bad input)
- Whether the implementation meets code coverage standards
- Whether the server works as a standalone stdio server

**What this evaluation CANNOT tell us:**
- Whether real MCP clients (Claude Desktop, Codex, Gemini) can successfully connect and use the server — deferred to phase-18-integration
- Whether there are compatibility issues with specific backend implementations — deferred to phase-18-integration
- Whether the performance is acceptable under load (not a requirement for v0.1.1)
- Whether the tool schemas are ergonomic from an end-user perspective (usability testing out of scope)

## Success Criteria Summary

Phase 16 evaluation is COMPLETE when:

- [x] All 6 sanity checks pass
- [x] All 8 proxy metrics meet targets
- [x] 2 deferred validations are documented with clear validation plans
- [x] Test coverage >= 80% lines on lib/mcp-server.js
- [x] Full test suite passes with no regressions
- [x] Test count increased by ~40+ tests (baseline 858 → target >900)
- [x] DEFER-16-01 and DEFER-16-02 tracked in STATE.md
- [x] Manual protocol smoke test confirms handshake and tool listing work

Quality indicators:

- **Protocol-compliant:** All JSON-RPC 2.0 and MCP spec requirements met
- **Comprehensive:** All 120+ CLI commands exposed as MCP tools
- **Robust:** Error handling covers all edge cases without crashes
- **Testable:** Automated test suite validates all critical paths
- **Traceable:** Each metric maps to specific requirement or spec section

---

*Evaluation plan by: Claude (grd-eval-planner)*
*Design date: 2026-02-16*
