---
phase: 44
plan: 2
subsystem: agents
tags: [webmcp, verifier, eval-planner, tool-discovery, health-checks]
dependency_graph:
  requires: [detectWebMcp, webmcp_available]
  provides: [verifier-webmcp-step, eval-planner-webmcp-tools]
  affects: [grd-verifier, grd-eval-planner, VERIFICATION.md, EVAL.md]
tech_stack:
  added: []
  patterns: [conditional-step-guard, tool-discovery-invoke, frontend-detection-heuristic]
key_files:
  created: []
  modified:
    - agents/grd-verifier.md
    - agents/grd-eval-planner.md
decisions:
  - Step 5b placed between tiered verification (Step 5) and experiment verification (Step 6) to keep WebMCP checks logically grouped with other verification steps
  - WebMCP output section placed between Experiment Verification and Requirements Coverage in VERIFICATION.md template
  - design_webmcp_tools step placed between design_ablation_plan and write_eval_md as the last design step before output
  - WebMCP Tool Definitions section placed between Ablation Plan and Baselines in EVAL.md template
  - Frontend detection uses file extensions, path patterns, and keyword heuristics rather than complex AST analysis
metrics:
  duration: 2min
  completed: 2026-02-21
  tasks: 2
  files_modified: 2
---

# Phase 44 Plan 2: WebMCP Agent Integration Summary

Added WebMCP tool discovery and invocation to grd-verifier, and WebMCP tool definition generation to grd-eval-planner, closing the verifier-eval-planner feedback loop for frontend health validation.

## What Was Done

### Task 1: Add WebMCP verification step to grd-verifier.md (e873825)

**agents/grd-verifier.md:**
- Added `webmcp_available` and `webmcp_skip_reason` context extraction note to Step 1 (Load Context)
- Added Step 5b: WebMCP Verification (if webmcp_available) between Step 5 (Deferred Verification) and Step 6 (Experiment Verification):
  - Skip condition: guarded by `webmcp_available` boolean from init JSON
  - 5b-1: Tool discovery via `hive_list_registered_tools` — identifies generic and page-specific tools
  - 5b-2: Generic health checks — `hive_get_health_status`, `hive_check_console_errors`, `hive_get_page_info`
  - 5b-3: Page-specific tool invocation — matches EVAL.md `useWebMcpTool()` definitions against discovered tools
  - 5b-4: Structured result recording for VERIFICATION.md output
- Added "## WebMCP Verification" section to VERIFICATION.md output template (between Experiment Verification and Requirements Coverage):
  - Tool Discovery table: tool name, type, registered status, pass/fail
  - Health Check Results table: check name, status, details
  - Page-Specific Tool Results table: tool, expected behavior, actual result, notes
  - Fallback text for when WebMCP is not available

### Task 2: Add WebMCP tool definition generation to grd-eval-planner.md (ce09c4b)

**agents/grd-eval-planner.md:**
- Added `design_webmcp_tools` step with condition `webmcp_available=true AND phase modifies frontend views`:
  - Skip condition: guarded by `webmcp_available` boolean AND frontend file detection
  - Frontend detection heuristic using file extensions (`.html`, `.jsx`, `.tsx`, `.vue`, `.svelte`, `.css`, `.scss`), path patterns (`src/pages/`, `src/views/`, etc.), and objective keywords
  - Generic tool definitions: 3 standard health check tools always included
  - Page-specific tool generation: `hive_check_{page_slug}_{aspect}` naming convention
  - `useWebMcpTool()` call syntax for each tool definition
- Added "## WebMCP Tool Definitions" section to EVAL.md output template (between Ablation Plan and Baselines):
  - Generic Checks table: tool, purpose, expected
  - Page-Specific Tools table: tool, page, purpose, expected
  - `useWebMcpTool()` Definitions code block with call syntax
  - Fallback text for when WebMCP is not available or not a frontend phase
- Updated `determine_verification_levels` step with note that WebMCP checks are an additional verification dimension (complement, not replace tiered verification)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

All verification checks passed:
- `agents/grd-verifier.md` contains "Step 5b", "WebMCP Verification", "hive_list_registered_tools", "hive_get_health_status", "useWebMcpTool", "webmcp_available"
- `agents/grd-eval-planner.md` contains "design_webmcp_tools", "WebMCP Tool Definitions", "useWebMcpTool", "hive_get_health_status", "webmcp_available", "Frontend detection"
- All existing steps in grd-verifier.md preserved (Steps 0-11)
- All existing steps in grd-eval-planner.md preserved (load_context through return_summary)
- WebMCP sections correctly positioned in both output templates

## Self-Check: PASSED

- [x] `agents/grd-verifier.md` exists and contains Step 5b WebMCP Verification
- [x] `agents/grd-verifier.md` contains `hive_list_registered_tools` for tool discovery
- [x] `agents/grd-verifier.md` contains WebMCP Verification section in output template
- [x] `agents/grd-eval-planner.md` exists and contains `design_webmcp_tools` step
- [x] `agents/grd-eval-planner.md` contains `useWebMcpTool()` definitions
- [x] `agents/grd-eval-planner.md` contains WebMCP Tool Definitions in output template
- [x] Both files preserve all existing content
- [x] Commit `e873825` exists (Task 1)
- [x] Commit `ce09c4b` exists (Task 2)
