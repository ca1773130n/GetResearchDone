---
phase: 81-mcp-tools-testing-and-integration
plan: "01"
subsystem: wireup
tags: [mcp, wireup, cli, tools]
dependency_graph:
  requires: [80-03-SUMMARY.md]
  provides: [lib/wireup/cli.ts (five cmd wrappers), lib/mcp-server.ts (five wireup MCP tools)]
  affects: [lib/wireup/index.ts, jest.config.js]
tech_stack:
  added: []
  patterns: [evolve-tool-registration, cmd-wrapper-pattern]
key_files:
  created: [lib/wireup/cli.ts (updated with five new functions)]
  modified: [lib/wireup/index.ts, lib/mcp-server.ts, jest.config.js]
decisions:
  - Used exact WireupScenario/UnwiredFeature field names from types.ts (feature.functionName, feature.filePath, test_data_fixture) rather than assumed names
  - cmdWireupScenarios re-runs discovery+generation to show current scenario set (stateless read)
  - cmdWireupReport reads WIREUP-REPORT.md directly via fs.readFileSync (no regeneration)
  - wireup coverage threshold placed on lib/wireup/index.ts (barrel) not lib/wireup.ts (doesn't exist)
metrics:
  duration: "173 seconds"
  completed: "2026-03-21"
  tasks_completed: 3
  files_modified: 4
---

# Phase 81 Plan 01: Register Wireup MCP Tools Summary

Five wireup sub-command wrappers created in lib/wireup/cli.ts and registered as MCP tools in COMMAND_DESCRIPTORS, following the evolve tool pattern exactly.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 0 | Create five cmd wrapper functions in lib/wireup/cli.ts | f2f802a | lib/wireup/cli.ts, lib/wireup/index.ts |
| 1 | Add wireup imports and MCP tool registrations to mcp-server.ts | adc570c | lib/mcp-server.ts |
| 2 | Add wireup coverage threshold to jest.config.js | bbcc285 | jest.config.js |

## What Was Built

### lib/wireup/cli.ts — Five cmd wrapper functions added

- `cmdWireupDiscover(cwd, args, raw)` — calls `discoverUnwiredFeatures(cwd)`, outputs features grouped by category with counts
- `cmdWireupRun(cwd, args, raw)` — parses `--target`/`--dry-run`/`--timeout`/`--max-turns` from args, delegates to `runWireup()`
- `cmdWireupState(cwd, args, raw)` — reads and outputs WIREUP-STATE.json (null-safe)
- `cmdWireupScenarios(cwd, args, raw)` — re-runs discovery+scenario generation, outputs scenario list with feature metadata
- `cmdWireupReport(cwd, args, raw)` — reads WIREUP-REPORT.md via fs, outputs content or `{exists: false}`

`cmdInitWireup` kept intact. All six functions exported via `module.exports`.

### lib/wireup/index.ts — Barrel re-exports updated

Five new cmd functions (`cmdWireupDiscover`, `cmdWireupRun`, `cmdWireupState`, `cmdWireupScenarios`, `cmdWireupReport`) added to barrel exports under `// ─── CLI sub-command wrappers (from cli.ts)` section.

### lib/mcp-server.ts — Wireup import block + COMMAND_DESCRIPTORS entries

Import block added after evolve imports:
```typescript
const { cmdWireupDiscover, cmdWireupRun, ... } = require('./wireup');
```

Five entries added in `// -- Wireup Tools --` section after `grd_evolve_init`:
- `grd_wireup_discover` — no params
- `grd_wireup_run` — optional `target` (string) and `dry_run` (boolean)
- `grd_wireup_state` — no params
- `grd_wireup_scenarios` — no params
- `grd_wireup_report` — no params

### jest.config.js — Coverage threshold

```javascript
'./lib/wireup/index.ts': { lines: 85, functions: 85, branches: 70 },
```

Placed alphabetically between `verify.ts` and `overstory.ts`. Enforces REQ-132 coverage requirement.

## Verification

- `npm run build:check` passes — TypeScript compiles cleanly
- All five `grd_wireup_*` tool names confirmed in COMMAND_DESCRIPTORS (grep count: 5)
- All five `cmdWireup*` functions in `lib/wireup/cli.ts`
- All five re-exported from `lib/wireup/index.ts`
- `jest.config.js` threshold confirmed: `{ lines: 85, functions: 85, branches: 70 }`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed wrong field names in cmdWireupDiscover and cmdWireupScenarios**
- **Found during:** Task 0 — TypeScript build check
- **Issue:** Used assumed field names `reason` (UnwiredFeature), `id`/`name`/`featureName`/`category` (WireupScenario) that don't exist in types.ts
- **Fix:** Used actual field names from types.ts: `suggestedAction` for UnwiredFeature, `feature.functionName`/`feature.filePath`/`feature.category`/`test_data_fixture` for WireupScenario
- **Files modified:** lib/wireup/cli.ts
- **Commit:** f2f802a

## Self-Check: PASSED

- [x] lib/wireup/cli.ts — FOUND (five new cmd functions + cmdInitWireup)
- [x] lib/wireup/index.ts — FOUND (five re-exports added)
- [x] lib/mcp-server.ts — FOUND (import block + five COMMAND_DESCRIPTORS entries)
- [x] jest.config.js — FOUND (wireup threshold)
- [x] Commits f2f802a, adc570c, bbcc285 — all exist
