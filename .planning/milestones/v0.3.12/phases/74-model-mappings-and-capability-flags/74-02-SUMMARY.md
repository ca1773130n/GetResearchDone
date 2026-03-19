---
phase: 74-model-mappings-and-capability-flags
plan: 02
subsystem: backend
tags: [capabilities, backend, types, model-overrides, mcp-elicitation]
dependency_graph:
  requires: [74-01]
  provides: [extended-BackendCapabilities, model_overrides_available-init-field, capability-flag-tests]
  affects: [lib/types.ts, lib/backend.ts, lib/context/execute.ts, tests/unit/backend.test.ts]
tech_stack:
  added: []
  patterns: [capability-flags, nullable-typed-fields]
key_files:
  created: []
  modified:
    - lib/types.ts
    - lib/backend.ts
    - lib/context/execute.ts
    - tests/unit/backend.test.ts
decisions:
  - "max_output_tokens typed as nullable object since only claude documents output token limits"
  - "model_overrides_available uses strict === true check to handle future non-boolean values"
  - "Required keys test updated to enumerate all 16 BackendCapabilities fields"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_modified: 4
  completed_date: "2026-03-19"
---

# Phase 74 Plan 02: Capability Flags Extension Summary

**One-liner:** Extended BackendCapabilities with 7 new flags (smart_approvals, plan_mode, sandbox_gvisor, sandbox_lxc, mcp_elicitation, model_overrides, max_output_tokens) for all 7 backends, surfaced model_overrides_available in execute-phase init context.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend BackendCapabilities type and populate flags | a68da32 | lib/types.ts, lib/backend.ts |
| 2 | Add model_overrides_available to init context and write tests | e3511ea | lib/context/execute.ts, tests/unit/backend.test.ts |

## What Was Built

### New BackendCapabilities fields (lib/types.ts)

Seven fields added to the `BackendCapabilities` interface:
- `smart_approvals: boolean` — backend uses guardian subagent review (codex only)
- `plan_mode: boolean` — backend has a plan mode feature (gemini only)
- `sandbox_gvisor: boolean` — native gVisor sandboxing (gemini only)
- `sandbox_lxc: boolean` — LXC container sandboxing (none, set false until GA)
- `mcp_elicitation: boolean` — supports MCP elicitation protocol (claude only, v2.1.73+)
- `model_overrides: boolean` — supports model selection/overrides (all except grd)
- `max_output_tokens: { default: number; upper_bound: number } | null` — documented output token limits

### Capability values per backend (lib/backend.ts)

| Backend | smart_approvals | plan_mode | sandbox_gvisor | mcp_elicitation | model_overrides | max_output_tokens |
|---------|----------------|-----------|---------------|-----------------|-----------------|-------------------|
| claude | false | false | false | **true** | true | {64000, 128000} |
| codex | **true** | false | false | false | true | null |
| gemini | false | **true** | **true** | false | true | null |
| opencode | false | false | false | false | true | null |
| overstory | false | false | false | false | true | null |
| superpowers | false | false | false | false | true | null |
| grd | false | false | false | false | **false** | null |

### model_overrides_available in execute init (lib/context/execute.ts)

Added `model_overrides_available: backendCaps.model_overrides === true` to the `cmdInitExecutePhase` result object, surfacing the flag so executor agents can adapt their workflows.

### Tests (tests/unit/backend.test.ts)

- Updated 9 existing `toEqual` assertions (5 in BACKEND_CAPABILITIES block, 4 in getBackendCapabilities block) to include all 7 new fields
- Updated required keys test to enumerate all 16 BackendCapabilities fields
- Added new `new capability flags` describe block with 8 tests
- All 157 tests pass

## Verification

- `npm run build:check` passes — no type errors
- `npx jest tests/unit/backend.test.ts` — 157 tests pass, 0 failures
- `grep -c 'smart_approvals' lib/backend.ts` → 7 (one per backend)
- `grep -c 'mcp_elicitation' lib/backend.ts` → 7 (one per backend)
- `grep 'model_overrides_available' lib/context/execute.ts` → field present in init context

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- lib/types.ts modified: confirmed (BackendCapabilities has 7 new fields)
- lib/backend.ts modified: confirmed (all 7 backends populated)
- lib/context/execute.ts modified: confirmed (model_overrides_available present)
- tests/unit/backend.test.ts modified: confirmed (157 tests pass)
- Commits a68da32, e3511ea exist in git log
