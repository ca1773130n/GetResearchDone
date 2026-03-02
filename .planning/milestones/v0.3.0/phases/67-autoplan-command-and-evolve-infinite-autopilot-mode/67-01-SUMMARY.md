---
phase: "67"
plan: "01"
subsystem: autoplan
tags: [autoplan, evolve, discovery, milestone-creation, autonomous]
dependency-graph:
  requires: [autopilot, evolve/discovery, evolve/state, evolve/types, types, utils]
  provides: [autoplan-core, autoplan-cli, autoplan-init]
  affects: [grd-tools, mcp-server, commands]
tech-stack:
  added: [lib/autoplan.ts, lib/autoplan.js]
  patterns: [require-as typed cast, CJS proxy, flag/hasFlag CLI parsing, output() never return]
key-files:
  created:
    - lib/autoplan.ts
    - lib/autoplan.js
  modified:
    - lib/types.ts
key-decisions:
  - "AutoplanOptions.groups uses simplified inline type (not WorkGroup directly) to decouple CLI callers from evolve/types"
  - "runAutoplan uses synchronous spawnClaude (not async) because milestone artifacts must exist before returning"
  - "CJS proxy lib/autoplan.js added for extensionless require() resolution (consistent with DEFER-59-01 pattern)"
  - "Milestone name derivation uses highest-priority group theme with 'Improvements' fallback"
metrics:
  duration: "3min"
  completed: "2026-03-02"
---

# Phase 67 Plan 01: Autoplan Core Module Summary

Autoplan module that converts evolve discovery results into structured milestones by spawning a `claude -p` subprocess with the new-milestone skill, with 4 exported functions, strict TypeScript, and zero any types.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Add AutoplanOptions and AutoplanResult types | 7a6a6d7 | lib/types.ts |
| 2 | Create lib/autoplan.ts with core functions | e4905a3 | lib/autoplan.ts, lib/autoplan.js |

## What Was Built

### lib/types.ts additions
- **AutoplanOptions**: groups, pickPct, dryRun, timeout, maxTurns, model, milestoneName fields
- **AutoplanResult**: status (completed/failed/dry-run), groups_count, items_count, prompt, milestone_name, reason fields

### lib/autoplan.ts (264 lines)
- **buildAutoplanPrompt(groups, milestoneName?)**: Constructs a `claude -p` prompt that instructs the subprocess to invoke `grd:new-milestone` with structured work group context
- **runAutoplan(cwd, options?)**: Orchestrates the full autoplan flow -- uses provided groups or runs evolve discovery, builds prompt, spawns subprocess, returns result
- **cmdAutoplan(cwd, args, raw)**: CLI entry point with flag parsing (--dry-run, --timeout, --max-turns, --model, --pick-pct, --name)
- **cmdInitAutoplan(cwd, raw)**: Pre-flight context returning evolve state summary, current milestone info, and config

### lib/autoplan.js (CJS proxy)
- Thin re-export proxy for extensionless `require('./autoplan')` resolution

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS -- zero errors under strict:true |
| `npx eslint lib/autoplan.ts lib/types.ts` | PASS -- zero lint errors |
| `node -e "require('./lib/autoplan')"` | PASS -- loads cleanly |
| buildAutoplanPrompt contains "grd:new-milestone" | PASS |
| 4 functions exported from module.exports | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added CJS proxy lib/autoplan.js**
- **Found during:** Task 2 verification
- **Issue:** `node -e "require('./lib/autoplan')"` failed with MODULE_NOT_FOUND because Node.js CJS resolves `.js` before `.ts`
- **Fix:** Created lib/autoplan.js thin proxy (consistent with all other lib/ modules)
- **Files created:** lib/autoplan.js
- **Commit:** e4905a3

## Decisions Made

1. **AutoplanOptions.groups uses simplified inline type** -- The `groups` field uses an inline array type with title/description/effort strings rather than importing WorkGroup directly. This decouples CLI callers from evolve/types and allows passing groups without constructing full WorkItem objects.

2. **Synchronous spawnClaude for milestone creation** -- Uses `spawnClaude` (sync) rather than `spawnClaudeAsync` because the milestone artifacts must exist on disk before `runAutoplan` returns. The calling code needs to verify the milestone was created.

3. **CJS proxy added** -- Following the established DEFER-59-01 pattern, a thin `.js` proxy was created so `require('./autoplan')` resolves correctly under plain Node.js without `--experimental-strip-types`.

4. **Milestone name derivation** -- When no explicit milestone name is provided, the highest-priority group's theme is used. Falls back to "Improvements" if no groups have themes.

## Self-Check: PASSED
