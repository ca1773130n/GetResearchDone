# Requirements — v0.2.5 WebMCP Support & Bugfixes

**Milestone:** v0.2.5
**Created:** 2026-02-21

## WebMCP Integration

### REQ-96: MCP availability detection
Detect whether Chrome DevTools MCP is configured and available. All WebMCP features gracefully skip when MCP is not available — same feature-detection pattern as other optional integrations. Detection result exposed in init JSON output.
- **Priority:** P0
- **Category:** Core
- **Phase:** TBD

### REQ-97: Per-plan WebMCP sanity checks in execute-phase
After each plan's executor agent completes (in the `execute_waves` step of `execute-phase.md`), call generic WebMCP tools via Chrome DevTools MCP: `hive_get_health_status` (backend responding), `hive_check_console_errors` (no new JS errors), `hive_get_page_info` (app rendering). First failure → retry. Second failure → halt execution with clear error.
- **Priority:** P0
- **Category:** Command
- **Phase:** TBD

### REQ-98: WebMCP tool calls in verify-phase
The grd-verifier agent reads EVAL.md, discovers registered WebMCP tools via `hive_list_registered_tools`, calls both generic and page-specific tools, and includes results in VERIFICATION.md.
- **Priority:** P0
- **Category:** Agent
- **Phase:** TBD

### REQ-99: Eval planner generates WebMCP tool definitions
When planning eval for a phase that modifies frontend views, the grd-eval-planner agent outputs `useWebMcpTool()` call definitions specifying what page-specific tools the verifier should expect to find.
- **Priority:** P1
- **Category:** Agent
- **Phase:** TBD

## Bugfix

### REQ-100: Fix code reviewer VERIFICATION.md false blocker
The code reviewer agent should not flag missing VERIFICATION.md as a blocker during code review. VERIFICATION.md is created by the grd-verifier agent in the subsequent verify-phase step, not during or before code review. The reviewer's must_haves validation should exclude VERIFICATION.md from its checks.
- **Priority:** P0
- **Category:** Agent
- **Phase:** TBD
