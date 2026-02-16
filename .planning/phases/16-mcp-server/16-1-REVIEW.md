---
phase: 16
wave: 1
plans_reviewed: [16-01]
timestamp: 2026-02-16T07:05:00Z
blockers: 0
warnings: 2
info: 5
verdict: warnings_only
---

# Code Review: Phase 16 Wave 1

## Verdict: WARNINGS ONLY

Wave 1 delivers a well-structured MCP server implementation with 97 auto-generated tool definitions covering all CLI commands. Protocol compliance is verified end-to-end (initialize, tools/list, tools/call, all 5 error codes). Two warnings relate to concurrency safety of the output capture pattern and a minor inconsistency in `raw` parameter handling for TUI commands.

## Stage 1: Spec Compliance

### Plan Alignment

All plan tasks fully executed with matching commits:

| Plan Task | Commit | Status |
|-----------|--------|--------|
| Task 1: MCP server protocol handler with auto-generated tool registry | 485703b | DONE - lib/mcp-server.js (1319 lines, min 150) |
| Task 2: MCP server entry point with stdio transport | 47261fc | DONE - bin/grd-mcp-server.js (81 lines, min 10) |
| SUMMARY doc | 5229fa6 | DONE |

**Artifact verification:**

- `lib/mcp-server.js`: 1319 lines (requirement: min 150) -- PASS
- `bin/grd-mcp-server.js`: 81 lines (requirement: min 10) -- PASS

**Key links verified:**

- `lib/mcp-server.js` -> `lib/commands.js` via `require('./commands')` -- PASS
- `lib/mcp-server.js` -> `lib/state.js` via `require('./state')` -- PASS
- `bin/grd-mcp-server.js` -> `lib/mcp-server.js` via `require('../lib/mcp-server')` -- PASS

**Must-have truths verified:**

1. Initialize/initialized handshake works over stdio -- PASS (tested via echo pipe)
2. tools/list returns auto-generated tool definitions -- PASS (97 tools with name, description, inputSchema)
3. Schemas generated dynamically from COMMAND_DESCRIPTORS, not hardcoded -- PASS
4. tools/call dispatches to real lib/ functions -- PASS (grd_detect_backend, grd_current_timestamp, grd_generate_slug confirmed)
5. Invalid tool name returns -32601 -- PASS
6. Server never crashes on bad input -- PASS (malformed JSON returns -32700, missing params returns -32602)

**INFO-1:** Tool count is 97. The plan mentions "ALL commands from routeCommand" which has ~55 case branches (many with sub-commands expanding to ~97). The count matches the expanded command set accurately.

### Research Methodology

N/A -- This is a protocol implementation phase, not a research phase. The implementation faithfully follows JSON-RPC 2.0 and MCP protocol specification (protocolVersion: 2024-11-05).

### Known Pitfalls

N/A -- No KNOWHOW.md found in the research directory.

### Eval Coverage

**INFO-2:** EVAL.md exists for phase 16 and defines 6 sanity checks (S1-S6), 8 proxy metrics (P1-P8), and 2 deferred validations (D1-D2). Wave 1 covers S1-S6 and P1-P6. P7 (test coverage) and P8 (regression suite) are planned for wave 2 (plan 16-02). Eval criteria are fully computable from the current implementation.

## Stage 2: Code Quality

### Architecture

**INFO-3:** Code follows existing project patterns exactly:
- Import structure mirrors `bin/grd-tools.js` (same destructured imports from same modules)
- JSDoc header with module description, section dividers using `// ──` convention
- `McpServer` class follows clean OOP pattern with private method convention (`_handleInitialize`, `_handleToolsList`, etc.)
- Exports match project convention (`module.exports = { ... }`)
- Zero external dependencies -- consistent with GRD project philosophy

**INFO-4:** The `captureExecution()` function correctly mirrors the pattern from `tests/helpers/setup.js` (captureOutput/captureError) adapted for MCP runtime context. The `finally` block guarantees restoration of process globals even on unexpected errors.

**WARNING-1:** The `captureExecution` pattern replaces `process.stdout.write`, `process.stderr.write`, and `process.exit` globally. If two MCP tool calls were ever processed concurrently (e.g., via a future async transport), the interception would create a race condition where outputs from one call bleed into another. The current stdio transport is inherently sequential (one message at a time), so this is safe today. However, if a WebSocket or HTTP transport is added in the future, this pattern would need to be replaced with a per-call capture mechanism (e.g., AsyncLocalStorage or a queue-based approach).

**WARNING-2:** Dashboard, Health, and Phase Detail commands pass `raw=true` in the MCP server (lines 677, 685, 691) but `raw=false` in `grd-tools.js` CLI (lines 503, 507, 510). The SUMMARY documents this as an intentional decision ("Pass raw=false for JSON tools, raw=true for TUI tools: Dashboard/health/phase-detail pass raw=true to get JSON output instead of TUI text"). This makes sense for MCP since MCP clients need JSON, not ANSI-formatted TUI text. However, this creates a behavioral difference between the CLI and MCP interfaces for these 3 commands. This should be documented in the MCP server module header or in a comment near these descriptors to prevent confusion.

### Reproducibility

N/A -- This is not experimental/research code. Deterministic protocol handler with no randomness.

### Documentation

**INFO-5:** Code is well-documented:
- Module-level JSDoc header explains purpose and context
- `COMMAND_DESCRIPTORS` table is self-documenting with descriptions for every tool and parameter
- `McpServer` class and all methods have JSDoc with `@param` and `@returns` annotations
- `captureExecution` has detailed JSDoc explaining the capture strategy
- Section dividers clearly separate concerns (Imports, Command Descriptors, Tool Builder, Output Capture, Server Class, Exports)

### Deviation Documentation

SUMMARY.md reports "None - plan executed exactly as written" which matches reality:

- Files modified in git: `lib/mcp-server.js`, `bin/grd-mcp-server.js` -- matches SUMMARY key-files
- Commit messages match SUMMARY task descriptions
- No undocumented files were modified

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 2 | Architecture | `captureExecution` global monkey-patching is not safe for concurrent/async transports |
| 2 | WARNING | 2 | Architecture | `raw=true` for dashboard/health/phase-detail differs from CLI `raw=false` without inline documentation |
| 3 | INFO | 1 | Plan Alignment | 97 tools match all expanded routeCommand paths (55 case branches with sub-commands) |
| 4 | INFO | 1 | Eval Coverage | EVAL.md S1-S6 and P1-P6 covered by wave 1; P7-P8 deferred to wave 2 |
| 5 | INFO | 2 | Architecture | Code style and patterns are fully consistent with existing lib/ modules |
| 6 | INFO | 2 | Architecture | `captureExecution` pattern is a correct adaptation of test harness capture helpers |
| 7 | INFO | 2 | Documentation | Comprehensive JSDoc, section dividers, and self-documenting descriptor table |

## Recommendations

**WARNING-1 (captureExecution concurrency):** Add a comment at the top of `captureExecution` noting that the function is NOT safe for concurrent use and relies on the serial nature of the stdio transport. If a concurrent transport is ever added, consider using Node.js `AsyncLocalStorage` for per-request output capture, or refactoring cmd* functions to accept an output stream parameter instead of writing to `process.stdout` directly.

**WARNING-2 (raw parameter inconsistency):** Add a brief comment above the `grd_dashboard`, `grd_health`, and `grd_phase_detail` descriptors explaining why `raw=true` is passed (to get JSON output instead of ANSI TUI text), since this differs from the CLI router's behavior.
