---
phase: 21-mcp-extension-wiring
plan: 2
subsystem: docs
tags: [mcp, documentation, tool-reference]
dependency_graph:
  requires: []
  provides: [mcp-tool-docs-102]
  affects: [docs/mcp-server.md]
tech_stack:
  added: []
  patterns: [markdown-table-tool-reference]
key_files:
  modified:
    - docs/mcp-server.md
decisions:
  - summary: "New tools documented in separate 'Requirement & Search' section, not appended to Utility"
    rationale: "Keeps logical grouping clear; Utility section count unchanged"
metrics:
  duration: 1min
  completed: 2026-02-17
---

# Phase 21 Plan 02: MCP Documentation Update Summary

Updated docs/mcp-server.md to reflect 102 total MCP tools by adding documentation for 5 new requirement and search commands with consistent table format and JSON-RPC examples.

## Task Completion

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Update docs/mcp-server.md with new tool entries and corrected counts | `e0c71bb` | docs/mcp-server.md |

## Changes Made

### Tool Count Update
- Changed "all 97 GRD CLI commands" to "all 102 GRD CLI commands" in intro paragraph (line 3)
- Changed "Returns all 97 tool definitions" to "Returns all 102 tool definitions" in tools/list method table (line 74)

### New Section: Requirement & Search (5 tools)
Added between "Dashboard & Navigation" and "Utility" sections with standard markdown table format:

| Tool | Description |
|------|-------------|
| `grd_requirement_get` | Get a requirement by ID with status and phase from traceability matrix |
| `grd_requirement_list` | List requirements with optional filters (phase, priority, status, category) |
| `grd_requirement_traceability` | Get the traceability matrix with optional phase filter |
| `grd_requirement_update_status` | Update the status of a requirement in the traceability matrix |
| `grd_search` | Search across all .planning/ markdown files for a text query |

### New Examples
Added two JSON-RPC examples at the end of the Examples section:
- `grd_search` with query "MCP" (id: 7)
- `grd_requirement_get` with req_id "REQ-37" (id: 8)

## Verification

- Level 1 (Sanity): All 5 new tool names present in docs/mcp-server.md (7 occurrences total)
- "102" appears 2 times in the document (intro + tools/list row)
- "97" no longer appears as a tool count reference
- Document structure preserved -- only additive changes made

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- [x] docs/mcp-server.md exists and contains all 5 new tool names
- [x] Commit e0c71bb exists in git log
- [x] Tool count updated from 97 to 102
- [x] New section uses consistent markdown table format
- [x] Examples section includes JSON-RPC calls for new tools
