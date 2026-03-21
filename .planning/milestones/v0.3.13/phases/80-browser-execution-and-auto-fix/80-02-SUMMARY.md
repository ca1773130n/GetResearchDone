---
phase: 80-browser-execution-and-auto-fix
plan: "02"
subsystem: wireup
tags: [auto-fix, confidence-gating, sonnet-model, re-run-verification, missing-connections]
dependency_graph:
  requires: [79-03-PLAN.md]
  provides: [lib/wireup/autofix.ts]
  affects: [lib/wireup/index.ts, lib/wireup/types.ts, lib/wireup/orchestrator.ts]
tech_stack:
  added: []
  patterns: [confidence-gate, rerun-verification, fix-prompt-builder]
key_files:
  created:
    - lib/wireup/autofix.ts
  modified:
    - lib/wireup/types.ts
    - lib/wireup/index.ts
    - lib/wireup/orchestrator.ts
decisions:
  - autoFixIssue delegates fix application to orchestrator via reRunFn callback — does not spawn subprocesses directly
  - WIREUP_FIX_MODEL is an alias for SONNET_MODEL from ./state; not redeclared
  - missing-export added to IssueType union and IssuesByType interface (plan specification)
  - updateFixOutcome increments fixes_applied only for verified fixes (not failed/skipped)
  - partitionByConfidence uses issue.confidence (detection confidence) not classifyFixConfidence() to partition
metrics:
  duration_minutes: 14
  completed: "2026-03-21"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 3
---

# Phase 80 Plan 02: Auto-Fix Infrastructure Summary

Auto-fix capability with confidence gating and re-run verification: high-confidence missing connections are attempted via a sonnet-tier subagent prompt; medium and low confidence issues are routed to a manual review list. Fix outcomes are persisted to WIREUP-STATE.json.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement confidence classification and auto-fix with re-run verification | 04a3b69 | lib/wireup/autofix.ts (created), lib/wireup/types.ts, lib/wireup/index.ts, lib/wireup/orchestrator.ts |

## Implementation Details

### lib/wireup/autofix.ts

Four exported functions:

**`classifyFixConfidence(issue)`** — Classifies the fix confidence for a MissingConnection based on `issue_type`:
- High (safe to auto-fix): `missing-import`, `missing-export`, `missing-route`
- Medium (app structure dependent): `unconnected-handler`, `missing-middleware`
- Low (external config or user input needed): `broken-nav-link`, `missing-env-var`

**`autoFixIssue(cwd, issue, reRunFn)`** — Attempts auto-fix with confidence gate:
- If `issue.confidence !== 'high'`: returns `{ fix_status: 'skipped' }` immediately, never calls `reRunFn`
- For high-confidence issues: builds fix prompt via `buildAutoFixPrompt()`, calls `reRunFn()` to verify, returns `FixAttempt` with `fix_status: 'verified'` or `'failed'`
- Fix application is delegated to the orchestrator (which spawns a sonnet subagent); `autoFixIssue` is pure coordination logic

**`partitionByConfidence(issues)`** — Splits issue list into high-confidence (auto-fix candidates) and medium/low-confidence (manual review). Returns `AutoFixResult` with `fixes_applied: []` (populated by orchestrator after runs), `requires_manual_review`, and `model_used: WIREUP_FIX_MODEL`.

**`updateFixOutcome(cwd, scenarioId, fixAttempt)`** — Reads WIREUP-STATE.json, increments `fixes_applied` counter (only for `verified` fixes), writes back. No-op if state file is missing.

**`buildAutoFixPrompt(issue)`** — Structured prompt generator for sonnet-tier agent. Includes issue type, source/target file paths, suggested fix text, and instruction to commit with `wireup: fix <description>`.

### Type Additions (lib/wireup/types.ts)

- `FixAttempt`: result of a single auto-fix attempt (`fix_status: 'verified' | 'failed' | 'skipped'`, plus fix_description, rerun_passed, error)
- `AutoFixResult`: aggregated result with `fixes_applied: FixAttempt[]`, `requires_manual_review: MissingConnection[]`, `model_used: string`
- `IssueType` union extended with `'missing-export'`
- `IssuesByType` interface extended with `'missing-export': number`

### Model Ceiling

`WIREUP_FIX_MODEL` is an alias of `SONNET_MODEL` imported from `./state`. No opus-class models are referenced anywhere in the auto-fix infrastructure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing-export to IssueType and IssuesByType**
- **Found during:** Task 1 — TypeScript compile
- **Issue:** Plan specification includes `missing-export` in classifyFixConfidence switch; IssueType union and IssuesByType interface did not include it, causing TS2678 and TS2551 errors
- **Fix:** Added `'missing-export'` to IssueType union in types.ts; added `'missing-export': number` to IssuesByType; updated both IssuesByType initializer objects in orchestrator.ts
- **Files modified:** lib/wireup/types.ts, lib/wireup/orchestrator.ts
- **Commit:** 04a3b69

### Note on Pre-staged Work

Phase 80-01 executor pre-added the autofix barrel import and re-exports to `lib/wireup/index.ts` and the `FixAttempt`/`AutoFixResult` type definitions to `lib/wireup/types.ts`. These were already committed in 80-01 (commit bbe28ec). This plan's commit adds autofix.ts, the orchestrator fix, and the missing-export type extension.

## Verification

- TypeScript compiles without errors (`npx tsc --noEmit`)
- All 4 functions defined in lib/wireup/autofix.ts (11 matches)
- All 4 functions re-exported from lib/wireup/index.ts
- SONNET_MODEL imported from ./state (not redeclared)
- `classifyFixConfidence('missing-import')` returns `'high'`
- `classifyFixConfidence('missing-env-var')` returns `'low'`
- `partitionByConfidence()` correctly routes medium/low issues to requires_manual_review
- `autoFixIssue()` returns `fix_status: 'skipped'` for low-confidence without calling reRunFn
- `autoFixIssue()` returns `fix_status: 'verified'` when reRunFn returns true
- All 3177 existing tests pass

## Self-Check: PASSED

- [x] lib/wireup/autofix.ts exists with all 4 exported functions
- [x] lib/wireup/index.ts re-exports autoFixIssue, classifyFixConfidence, updateFixOutcome, partitionByConfidence
- [x] lib/wireup/types.ts has FixAttempt and AutoFixResult interfaces
- [x] Commit 04a3b69 exists in git log
- [x] TypeScript compiles cleanly
- [x] All 3177 tests pass
