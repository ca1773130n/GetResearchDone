---
phase: "16"
plan: "01"
name: "MCP Server Protocol Handler and Entry Point"
one-liner: "Complete MCP server exposing 97 GRD CLI commands as MCP tools via JSON-RPC 2.0 over stdio"
duration: "5min"

dependency-graph:
  requires:
    - "lib/commands.js"
    - "lib/state.js"
    - "lib/phase.js"
    - "lib/frontmatter.js"
    - "lib/verify.js"
    - "lib/context.js"
    - "lib/tracker.js"
    - "lib/roadmap.js"
    - "lib/scaffold.js"
    - "lib/cleanup.js"
    - "lib/long-term-roadmap.js"
  provides:
    - "MCP server protocol handler (lib/mcp-server.js)"
    - "MCP server entry point (bin/grd-mcp-server.js)"
    - "Auto-generated tool registry from COMMAND_DESCRIPTORS"
  affects:
    - "Any MCP-compatible client integration"

tech-stack:
  added:
    - "MCP protocol (JSON-RPC 2.0)"
    - "stdio transport (newline-delimited JSON)"
  patterns:
    - "Declarative command descriptor table"
    - "Auto-generated JSON Schema from descriptors"
    - "Output capture pattern (intercept process.exit/stdout/stderr)"

key-files:
  created:
    - "lib/mcp-server.js"
    - "bin/grd-mcp-server.js"
  modified: []

key-decisions:
  - "Auto-generate tool definitions from COMMAND_DESCRIPTORS: Ensures all CLI commands are exposed without manual MCP JSON authoring"
  - "Output capture pattern (intercept process.exit): Reuses existing cmd* functions without modification by intercepting their stdout/stderr/exit calls"
  - "Pass raw=false for JSON tools, raw=true for TUI tools: Dashboard/health/phase-detail pass raw=true to get JSON output instead of TUI text"
  - "97 tools covering all routeCommand paths: Every CLI command/subcommand from grd-tools.js has a corresponding MCP tool"
  - "Zero external dependencies: MCP server uses only Node.js built-ins, consistent with GRD project philosophy"
---

# Phase 16 Plan 01: MCP Server Protocol Handler and Entry Point Summary

Complete MCP server exposing 97 GRD CLI commands as MCP tools via JSON-RPC 2.0 over stdio, enabling any MCP-compatible client (Claude Code, Codex CLI, Gemini CLI, OpenCode) to call GRD commands programmatically.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | MCP server protocol handler with auto-generated tool registry | 485703b | lib/mcp-server.js |
| 2 | MCP server entry point with stdio transport | 47261fc | bin/grd-mcp-server.js |

## Implementation Details

### Task 1: MCP Server Protocol Handler

Created `lib/mcp-server.js` (1319 lines) with three main components:

**COMMAND_DESCRIPTORS table:** 97 declarative command descriptors covering all CLI commands from `bin/grd-tools.js routeCommand`:
- State (11 subcommands), Frontmatter (4), Verify (7), Template (2), Scaffold (1)
- Phase operations (5), Roadmap (2), Phases (1), Milestone (1), Validate (1)
- Init workflows (21), Tracker (12), Long-term roadmap (9)
- Dashboard, Health, Phase Detail, Detect Backend, Quality Analysis
- Utility: slug, timestamp, todos, path verification, config, history digest, progress, commit, find-phase, resolve-model, plan-index, summary-extract, state-snapshot

**buildToolDefinitions():** Transforms descriptors into MCP-format tool definitions with proper JSON Schema `inputSchema` objects (type, required, description for each parameter).

**McpServer class:** Handles JSON-RPC 2.0 protocol:
- `initialize` -> server capabilities and info (protocolVersion: 2024-11-05)
- `notifications/initialized` -> acknowledged (no response)
- `tools/list` -> all 97 tool definitions
- `tools/call` -> parameter validation + dispatch to cmd* functions
- Error codes: -32700 (parse), -32600 (invalid request), -32601 (method not found), -32602 (invalid params), -32603 (internal error)

**Output capture pattern:** `captureExecution()` temporarily replaces `process.stdout.write`, `process.stderr.write`, and `process.exit` to intercept cmd* function output without killing the server process.

### Task 2: MCP Server Entry Point

Created `bin/grd-mcp-server.js` (81 lines) as a thin stdio transport:
- Reads newline-delimited JSON from stdin
- Dispatches to McpServer.handleMessage()
- Writes JSON responses to stdout (one per line)
- Handles empty lines, malformed JSON, and graceful EOF

## Verification Results

**Level 1 (Sanity):**
- `require('./lib/mcp-server')` loads without error
- `node bin/grd-mcp-server.js` starts without crash
- COMMAND_DESCRIPTORS has 97 entries

**Level 2 (Proxy):**
- Initialize handshake returns valid serverInfo.name = "grd-mcp-server"
- tools/list returns 97 tool definitions with inputSchema
- tools/call for grd_state_load returns JSON with project state
- Invalid tool name returns error code -32601
- Malformed JSON input returns error code -32700
- Missing required params returns error code -32602

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- lib/mcp-server.js: FOUND (1319 lines, min 150)
- bin/grd-mcp-server.js: FOUND (81 lines, min 10)
- 16-01-SUMMARY.md: FOUND
- Commit 485703b: FOUND
- Commit 47261fc: FOUND
- Key links verified: commands.js, state.js, mcp-server.js
