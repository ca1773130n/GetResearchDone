---
phase: 44
plan: 1
subsystem: commands, orchestrator
tags: [webmcp, health-checks, execute-phase, retry-logic]
dependency_graph:
  requires: [detectWebMcp, webmcp_available]
  provides: [webmcp-sanity-checks-in-execute-phase]
  affects: [execute-phase]
tech_stack:
  added: []
  patterns: [conditional-guard, retry-once-then-halt, cross-reference-step]
key_files:
  created: []
  modified:
    - commands/execute-phase.md
decisions:
  - WebMCP sanity check inserted as sub-steps (4b and 6b) to preserve existing step numbering
  - Teams flow (6b) uses a brief cross-reference to standard flow (4b) rather than duplicating full logic
  - Health checks call MCP tools directly from orchestrator, not via subagent
metrics:
  duration: 2min
  completed: 2026-02-21
  tasks: 1
  files_modified: 1
---

# Phase 44 Plan 1: WebMCP Sanity Checks in Execute-Phase Summary

Added WebMCP health checks after each plan execution in both standard and teams orchestrator flows, with conditional guard, retry logic, and halt-on-failure behavior.

## What Was Done

### Task 1: Add WebMCP sanity check step to both execute_waves flow variants (703b826)

**commands/execute-phase.md — Initialize step (line 27):**
- Added `webmcp_available` and `webmcp_skip_reason` to the "Parse JSON for:" field list in the `<step name="initialize">` section
- These fields were added to init JSON output by Phase 43 (`detectWebMcp` in `lib/backend.js`)

**commands/execute-phase.md — Standard flow step 4b (line 351):**
- Inserted new step 4b between step 4 ("Report completion -- spot-check claims first") and step 5 ("Handle failures")
- **Skip condition:** When `webmcp_available` is false, logs skip reason and continues
- **When enabled:** Runs three Chrome DevTools MCP health checks per completed plan:
  1. `hive_get_health_status` -- verifies backend is responding
  2. `hive_check_console_errors` -- verifies no new JS errors
  3. `hive_get_page_info` -- verifies app is rendering and interactive
- **Retry logic:** First failure retries only the failed check(s); second consecutive failure halts execution with clear error identifying the failed check, error details, and remediation options
- **Halt message** provides two recovery paths: fix and re-run, or disable WebMCP checks via config

**commands/execute-phase.md — Teams flow step 6b (line 202):**
- Inserted new step 6b between step 6 ("Spot-check results") and step 7 ("Code review")
- Uses a brief cross-reference to standard flow step 4b to avoid content duplication
- Same skip/check/retry/halt behavior applies

**Preservation:**
- All existing steps (1-7 in standard flow, 1-8 in teams flow) preserved with original numbering
- No existing content removed or modified -- change is purely additive (46 lines added, 1 line modified for field list)

## Deviations from Plan

None -- plan executed exactly as written.

## Verification Results

- [x] `webmcp_available` present in initialize step parsed fields (line 27)
- [x] `webmcp_skip_reason` present in initialize step parsed fields (line 27)
- [x] `hive_get_health_status` present in file (lines 204, 360)
- [x] `hive_check_console_errors` present in file (lines 204, 363, 378)
- [x] `hive_get_page_info` present in file (lines 204, 366)
- [x] Retry logic documented (lines 370-388)
- [x] Step 4b in standard `execute_waves` flow (line 351)
- [x] Step 6b in `execute_waves_teams` flow (line 202)
- [x] Existing step numbering 1-7 (standard) and 1-8 (teams) preserved
- [x] All existing content preserved verbatim

## Self-Check: PASSED

- [x] `commands/execute-phase.md` exists and contains WebMCP sanity check steps
- [x] Commit `703b826` exists
- [x] Three health check tool names present in both flow variants
- [x] Retry/halt logic present in standard flow step 4b
- [x] Skip condition references `webmcp_available` from init JSON
