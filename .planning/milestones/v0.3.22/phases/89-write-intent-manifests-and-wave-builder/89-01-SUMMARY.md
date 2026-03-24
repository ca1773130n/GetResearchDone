---
phase: 89-write-intent-manifests-and-wave-builder
plan: "01"
subsystem: autopilot
tags: [write-intent, frontmatter, wave-builder, planner-prompt]
requires: []
provides: [parseWriteIntent, files_modified-in-plan-prompt, plan_files_modified-in-execute-context]
affects: [lib/autopilot.ts, lib/context/execute.ts]
tech-stack:
  added: []
  patterns: [pure-function-parser, frontmatter-extraction, result-map-building]
key-files:
  created: []
  modified:
    - lib/autopilot.ts
    - lib/context/execute.ts
    - tests/unit/autopilot.test.ts
decisions:
  - parseWriteIntent is a pure function operating on raw frontmatter content string, not full file content
  - plan_files_modified uses plan filename stem as key (e.g. "89-01" from "89-01-PLAN.md")
  - extractFrontmatter handles both inline-array and dash-list YAML formats natively; parseWriteIntent uses regex for reliability
  - Files are read synchronously inside IIFE in cmdInitExecutePhase result object for consistency with surrounding code style
duration: ~12 minutes
completed: 2026-03-24
---

# Phase 89 Plan 01: Write-Intent Manifests and Wave Builder Summary

Write-intent declaration infrastructure: `parseWriteIntent()` pure function, updated planner prompt instructing `files_modified:` declarations, and `plan_files_modified` map in execution context output.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add parseWriteIntent function | 7665ca8 | lib/autopilot.ts |
| 2 | Update buildPlanPrompt | 168b804 | lib/autopilot.ts |
| 3 | Wire files_modified into cmdInitExecutePhase | 7fdd2ec | lib/context/execute.ts |
| 4 | Add 6 unit tests for parseWriteIntent | a476103 | tests/unit/autopilot.test.ts |

## What Was Built

### parseWriteIntent(frontmatterContent: string): string[]

Pure function in `lib/autopilot.ts` (placed before `buildWaves`). Accepts raw YAML frontmatter string (between `---` markers) and extracts the `files_modified` field. Supports:
- Dash-list format: `files_modified:\n  - lib/foo.ts\n  - lib/bar.ts`
- Inline array format: `files_modified: [lib/foo.ts, lib/bar.ts]`

Returns `[]` for empty input, missing field, or empty array `[]`.

### buildPlanPrompt update

One sentence appended to the existing prompt: instructs the planner to include `files_modified:` in PLAN.md frontmatter listing lib/ modules and other files the plan expects to modify.

### plan_files_modified in cmdInitExecutePhase

New field in the JSON output of `cmdInitExecutePhase`. A map from plan ID (e.g. `"89-01"`) to `string[]` of declared files. Each plan file is read from disk, frontmatter parsed via `extractFrontmatter`, and `files_modified` array extracted. Plans missing the field or that are unreadable produce `[]`.

Example output:
```json
{
  "plan_files_modified": {
    "89-01": ["lib/autopilot.ts", "lib/context/execute.ts", "tests/unit/autopilot.test.ts"],
    "89-02": ["lib/autopilot.ts"]
  }
}
```

## Verification Results

```
npm run build:check  → PASS (zero TypeScript errors)
parseWriteIntent tests → 6/6 PASS
buildPlanPrompt tests  → 5/5 PASS
buildWaves tests       → 5/5 PASS
Total tests passing   → 188 (1 pre-existing failure in buildConflictResolvePrompt, unrelated to this plan)
```

## Deviations from Plan

None — plan executed exactly as written.

Note: One pre-existing test failure (`buildConflictResolvePrompt` - "Build the serial merge queue with FIFO ordering") was present before this plan's execution and is unrelated to any changes made here.

## Self-Check: PASSED

- [x] `lib/autopilot.ts` — parseWriteIntent function exists and is exported
- [x] `lib/autopilot.ts` — buildPlanPrompt includes files_modified instruction
- [x] `lib/context/execute.ts` — plan_files_modified field present in result
- [x] `tests/unit/autopilot.test.ts` — 6 parseWriteIntent tests pass
- [x] All commits: 7665ca8, 168b804, 7fdd2ec, a476103
- [x] TypeScript: zero errors
