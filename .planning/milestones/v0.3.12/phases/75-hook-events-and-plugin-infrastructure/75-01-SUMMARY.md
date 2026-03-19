---
phase: 75-hook-events-and-plugin-infrastructure
plan: 01
subsystem: plugin-hooks
tags: [hooks, plugin, stop-failure, post-compact, worktree]
dependency_graph:
  requires: []
  provides: [StopFailure-hook, PostCompact-hook]
  affects: [.claude-plugin/plugin.json, lib/worktree.ts, bin/grd-tools.ts]
tech_stack:
  added: []
  patterns: [hook-handler-pattern, descriptor-based-dispatch]
key_files:
  created: []
  modified:
    - .claude-plugin/plugin.json
    - lib/worktree.ts
    - bin/grd-tools.ts
decisions:
  - StopFailure handler checks for autopilot.log presence to determine if logging is needed
  - PostCompact handler is intentionally minimal (informational-only) per plan
  - Both hooks use 2>/dev/null || true in plugin.json commands for silent failure
  - appendFileSync used for autopilot.log writes (safe for concurrent log appends)
metrics:
  duration: "~10 minutes"
  completed: "2026-03-19"
  tasks_completed: 2
  files_modified: 3
---

# Phase 75 Plan 01: StopFailure and PostCompact Hook Registration Summary

Plugin manifest now registers StopFailure (v2.1.78) and PostCompact (v2.1.76) hook events with handler functions that log failures to autopilot.log and acknowledge compaction respectively.

## What Was Built

Two new Claude Code hook events registered in `plugin.json` and handled in `lib/worktree.ts`:

1. **StopFailure hook** — fires when a turn ends due to API errors (rate limit, auth failure, api_error). Handler reads `STOP_REASON`, `ERROR_MESSAGE`, and `AGENT_ID` environment variables. When `.planning/autopilot/autopilot.log` exists (indicating an active autopilot/evolve session), appends a timestamped failure entry. This enables retry logic detection.

2. **PostCompact hook** — fires after context compaction completes. Handler acknowledges the event and returns `acknowledged: true`. Intentionally minimal (informational only) — future use could trigger context reload or state refresh.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add handler functions to lib/worktree.ts | da6f8d7 | lib/worktree.ts |
| 2 | Register hooks in plugin.json, route in grd-tools.ts | 353002e | .claude-plugin/plugin.json, bin/grd-tools.ts |

## Verification

All Level 1 (Sanity) checks passed:

- plugin.json is valid JSON with StopFailure and PostCompact entries
- TypeScript compiles without errors (`npx tsc --noEmit`)
- Both handler functions exist in lib/worktree.ts and are exported
- Both CLI subcommands routed in bin/grd-tools.ts (ROUTE_DESCRIPTORS + TOP_LEVEL_COMMANDS)
- `node bin/grd-tools.js stop-failure-hook` produces valid JSON
- `node bin/grd-tools.js post-compact-hook` produces valid JSON
- plugin.json now has 8 registered hook events (up from 6)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- lib/worktree.ts: cmdStopFailureHook and cmdPostCompactHook defined and exported
- .claude-plugin/plugin.json: StopFailure and PostCompact entries present, JSON valid
- bin/grd-tools.ts: both commands in ROUTE_DESCRIPTORS and TOP_LEVEL_COMMANDS
- Commits da6f8d7 and 353002e verified in git log
