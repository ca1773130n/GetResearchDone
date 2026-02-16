---
phase: 21-mcp-extension-wiring
plan: 1
subsystem: mcp-server
tags: [mcp, requirements, search, wiring]
dependency_graph:
  requires: [lib/commands.js exports cmdRequirementGet/List/Traceability/UpdateStatus and cmdSearch]
  provides: [5 new MCP tools: grd_requirement_get, grd_requirement_list, grd_requirement_traceability, grd_requirement_update_status, grd_search]
  affects: [MCP tool coverage, test count]
tech_stack:
  added: []
  patterns: [COMMAND_DESCRIPTORS table-driven MCP tool registration]
key_files:
  created: []
  modified:
    - lib/mcp-server.js
    - tests/unit/mcp-server.test.js
decisions:
  - 5 new COMMAND_DESCRIPTORS entries with raw=false (JSON output, not TUI text)
  - Schema spot-checks for requirement and search tool families
metrics:
  duration: 2min
  completed: 2026-02-17
---

# Phase 21 Plan 1: MCP Extension Wiring Summary

Wired all 5 v0.1.2 CLI commands (requirement get/list/traceability/update-status, search) into the MCP server, increasing total tool count from 97 to 102 with 92.44% line coverage.

## Completed Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add COMMAND_DESCRIPTORS entries and imports for 5 new CLI commands | `65202da` | lib/mcp-server.js |
| 2 | Add MCP server tests for new tool definitions and execution | `1a6c6a7` | tests/unit/mcp-server.test.js |

## What Was Done

### Task 1: COMMAND_DESCRIPTORS Wiring

Added 5 new imports to the destructured `require('./commands')` block and 5 corresponding COMMAND_DESCRIPTORS entries:

- **grd_requirement_get** -- required `req_id` param, calls `cmdRequirementGet(cwd, args.req_id, false)`
- **grd_requirement_list** -- 5 optional filter params (phase, priority, status, category, all), calls `cmdRequirementList`
- **grd_requirement_traceability** -- optional `phase` param, calls `cmdRequirementTraceability`
- **grd_requirement_update_status** -- required `req_id` + `status`, calls `cmdRequirementUpdateStatus`
- **grd_search** -- required `query` param, calls `cmdSearch(cwd, args.query, false)`

All execute lambdas pass `raw=false` for JSON output, consistent with existing non-TUI tools.

### Task 2: Test Coverage

Added 14 new tests across 4 sections of the test file:

1. **Schema spot-checks (4 tests):** Verify parameter schemas for grd_requirement_get, grd_requirement_list, grd_requirement_update_status, grd_search
2. **Descriptor registry (2 tests):** Covers requirement family (>= 4 entries) and search command existence; updated count threshold from >= 90 to >= 100
3. **Bulk execute lambdas (7 tests):** Exercise all 5 new tools through tools/call path, including filter variants for list and traceability
4. **Error path (1 test):** Verifies grd_requirement_update_status returns -32602 when req_id is missing

## Verification Results

| Check | Result |
|-------|--------|
| Level 1 Sanity: `require('./lib/mcp-server')` | PASS -- no import errors |
| Level 2 Proxy: COMMAND_DESCRIPTORS.length | 102 (was 97) |
| Level 2 Proxy: All tests pass | 184 MCP tests, 0 failures |
| Level 2 Proxy: Line coverage | 92.44% on mcp-server.js |
| Full suite regression | 1357 tests pass (was 1343, +14) |

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| All 5 new tools use raw=false | Consistent with existing non-TUI tools; returns JSON for structured MCP responses |
| Schema spot-checks for 4 of 5 tools (grd_requirement_traceability has same pattern as others) | Covers distinct schema shapes: required single param, no required params, multiple required params |

## Self-Check: PASSED

- [x] lib/mcp-server.js exists
- [x] tests/unit/mcp-server.test.js exists
- [x] 21-01-SUMMARY.md exists
- [x] Commit 65202da exists
- [x] Commit 1a6c6a7 exists
