---
phase: 82-discussion-infrastructure
plan: "01"
subsystem: types, config, backend
tags: [discussion, types, config, backend-detection]
dependency_graph:
  requires: []
  provides: [DiscussionRole, BackendRolesConfig, DiscussionConfig, BackendAvailability, DispatchOptions, BackendResponse, detectAvailableBackends]
  affects: [lib/types.ts, lib/utils.ts, lib/backend.ts]
tech_stack:
  added: []
  patterns: [TTL-cache, config-validation-with-defaults]
key_files:
  created: []
  modified:
    - lib/types.ts
    - lib/utils.ts
    - lib/backend.ts
decisions:
  - Discussion types placed before GrdConfig in types.ts to satisfy forward reference constraints
  - DiscussionConfig.synthesizer defaults to 'claude'; invalid values warn to stderr and fall back
  - backend_roles entries with invalid BackendId values warn to stderr and are skipped
  - detectAvailableBackends skips overstory/superpowers/grd (meta-backends); always marks them unavailable
  - AVAILABILITY_CACHE_TTL_MS = 5 minutes, same pattern as existing MODEL_CACHE_TTL_MS
metrics:
  duration_seconds: 256
  completed: "2026-03-23"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 82 Plan 01: Discussion Infrastructure Types and Config Summary

Added six discussion-related types to lib/types.ts, extended GrdConfig and loadConfig with validated backend_roles and discussion sections, and implemented detectAvailableBackends() in lib/backend.ts with 5-minute TTL caching.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add discussion types to lib/types.ts | 02ba598 | lib/types.ts |
| 2 | Extend config loading and add backend availability detection | da2cdc7 | lib/utils.ts, lib/backend.ts |

## What Was Built

### lib/types.ts

Six new exported types added before `GrdConfig`:

- `DiscussionRole` — `'reviewer' | 'brainstormer' | 'verifier' | 'executor'`
- `BackendRolesConfig` — `Partial<Record<DiscussionRole, BackendId>>`
- `DiscussionConfig` — enabled, before_planning, before_execution, max_rounds, timeout_per_round_seconds, synthesizer
- `BackendAvailability` — `{ available: boolean; version: string | null }`
- `DispatchOptions` — timeout_ms, cwd, model
- `BackendResponse` — backend, response_text, duration_ms, stderr

`GrdConfig` extended with `backend_roles?: BackendRolesConfig` and `discussion?: DiscussionConfig`.

### lib/utils.ts

- `KNOWN_CONFIG_KEYS` extended with `'backend_roles'` and `'discussion'`
- `loadConfig()` validates `backend_roles`: warns on invalid BackendId values, skips them
- `loadConfig()` validates `discussion`: clamps max_rounds 1-3, defaults timeout to 180s, defaults synthesizer to 'claude', handles disabled state

### lib/backend.ts

- `AvailabilityCacheEntry` interface added
- `_availabilityCache` module-level variable with 5-min TTL
- `detectAvailableBackends(cwd?)`: probes claude/codex/gemini/opencode via `--version`; meta-backends always marked unavailable
- `clearAvailabilityCache()` exported for testing

## Verification

- `npm run build:check` — passes
- `npm run lint` — passes
- `npm test -- tests/unit/backend.test.ts tests/unit/utils.test.ts` — 317 tests pass

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- lib/types.ts — modified with 6 new types and 2 GrdConfig fields
- lib/utils.ts — modified with KNOWN_CONFIG_KEYS additions and loadConfig validation
- lib/backend.ts — modified with detectAvailableBackends and clearAvailabilityCache
- Commits 02ba598 and da2cdc7 exist
