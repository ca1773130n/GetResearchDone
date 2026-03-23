---
phase: 84-workflow-integration
plan: 01
subsystem: discussion
tags: [workflow-integration, discussion, review, types]
dependency_graph:
  requires: [lib/discussion.ts, lib/types.ts, lib/backend.ts]
  provides: [runPrePlanningDiscussion, runPreExecutionDiscussion, reviewPlanViaBackend, reviewCodeViaBackend, reviewPRViaBackend, Concern, PlanReviewResult, ReviewIssue, CodeReviewResult, PRReviewComment, PRReviewResult]
  affects: [plan-phase orchestrator, execute-phase orchestrator, code review pipeline]
tech_stack:
  added: []
  patterns: [config-gated dispatch, JSON fence extraction, graceful fallback]
key_files:
  created: []
  modified:
    - lib/types.ts
    - lib/discussion.ts
decisions:
  - "reviewPlanViaBackend and reviewCodeViaBackend check reviewer != primary backend to prevent self-review"
  - "reviewPRViaBackend gates on code_review_enabled (distinct from reviewer-role check)"
  - "parseJSONFromResponse handles both plain JSON and markdown-fenced JSON responses"
  - "All workflow functions return null (not throw) on unavailable/unconfigured backends"
  - "before_execution gated as === true (explicit opt-in) vs before_planning as !== false (default enabled)"
metrics:
  duration: 114s
  completed: 2026-03-23
  tasks_completed: 2
  files_modified: 2
---

# Phase 84 Plan 01: Workflow Integration Types and Functions Summary

Six review result types added to lib/types.ts and five workflow integration functions implemented in lib/discussion.ts, forming the core config-gated dispatch layer between Phase 83 discussion infrastructure and the plan-phase/execute-phase orchestrators.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add review result types to lib/types.ts | 381e3e5 | lib/types.ts |
| 2 | Implement five workflow integration functions in lib/discussion.ts | 7efc7a8 | lib/discussion.ts |

## What Was Built

### New Types in lib/types.ts

Six interfaces added to the Discussion Types section:

- **`Concern`** — `{ description: string; severity: 'blocker' | 'warning' | 'suggestion' }`
- **`PlanReviewResult`** — plan review outcome with `approved`, `concerns[]`, `suggestions[]`, reviewer metadata
- **`ReviewIssue`** — code diff issue with `severity`, `file`, `line_range`, `description`
- **`CodeReviewResult`** — code review outcome with `approved`, `issues[]`, `summary`, reviewer metadata
- **`PRReviewComment`** — PR-level review comment targeting `file`/`line` with `body` and `severity`
- **`PRReviewResult`** — PR review outcome with `comments[]`, `summary`, reviewer metadata

### New Functions in lib/discussion.ts

**`parseJSONFromResponse(raw)` (internal helper)**
Extracts JSON from raw backend response text, handling markdown code fences (` ```json ... ``` `) and plain JSON. Returns null on parse failure.

**`runPrePlanningDiscussion(options)`** — REQ-138
Config-gated wrapper around `runDiscussion()` for the brainstormer backend. Gates: `discussion.enabled !== false`, `discussion.before_planning !== false`, `backend_roles.brainstormer` set and available. Returns null silently on any gate failure.

**`runPreExecutionDiscussion(options)`** — REQ-139
Same pattern but `before_execution === true` (explicit opt-in, not default). Surfaces implementation concerns for a plan summary.

**`reviewPlanViaBackend(options)`** — REQ-140
Dispatches plan text to the reviewer backend with a structured JSON prompt. Checks reviewer is configured and differs from the primary backend. Parses response into `PlanReviewResult`; handles malformed JSON with a warning-severity fallback result.

**`reviewCodeViaBackend(options)`** — REQ-141
Dispatches a code diff to the reviewer backend. Same reviewer availability checks. Parses response into `CodeReviewResult` with issues array.

**`reviewPRViaBackend(options)`** — REQ-142
PR-level review gated on `config.code_review_enabled` and reviewer role. Returns `PRReviewResult` with structured comments suitable for GitHub PR review posting.

## Verification

- `npm run build:check` — PASSED (tsc --noEmit, zero errors)
- `npm run lint` — PASSED (zero ESLint errors/warnings)
- All six types exported from lib/types.ts (confirmed via grep)
- All five functions exported from lib/discussion.ts module.exports (confirmed via grep)
- Config flag gating logic verified through code inspection

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- lib/types.ts: 6 new interfaces present (Concern, PlanReviewResult, ReviewIssue, CodeReviewResult, PRReviewComment, PRReviewResult)
- lib/discussion.ts: 5 new functions exported (runPrePlanningDiscussion, runPreExecutionDiscussion, reviewPlanViaBackend, reviewCodeViaBackend, reviewPRViaBackend)
- Commits: 381e3e5 (types), 7efc7a8 (functions) — both verified in git log
- Build and lint: clean
