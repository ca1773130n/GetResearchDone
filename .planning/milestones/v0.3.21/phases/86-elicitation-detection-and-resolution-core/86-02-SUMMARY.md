---
phase: 86-elicitation-detection-and-resolution-core
plan: "02"
subsystem: discussion
tags: [elicitation, context-builder, resolution, discussion-routing]
dependency_graph:
  requires: [86-01]
  provides: [buildElicitationContext function, resolveElicitation function]
  affects: [lib/discussion.ts, tests/unit/discussion.test.ts]
tech_stack:
  added: []
  patterns: [section-budgeted context packaging, single-round discussion routing, graceful file-read fallback]
key_files:
  created: []
  modified:
    - lib/discussion.ts
    - tests/unit/discussion.test.ts
decisions:
  - "buildElicitationContext passes discussionTopic (context+instructions) as runDiscussion topic — not the raw question — so participants get full context"
  - "Per-section char budgets: question 1K, phaseGoal 1K, planSummary 2K, recentChanges 2K, projectState 1K (total <32K chars / ~8K tokens)"
  - "resolveElicitation uses try/catch around entire runDiscussion call — any throw returns empty string"
  - "Fallback chain: synthesis.response_text → first non-skipped round-1 entry → empty string"
  - "PLAN.md objective extracted via <objective>...</objective> regex from any phase PLAN file found via milestones directory scan"
metrics:
  duration: "~8m"
  completed: "2026-03-23"
  tasks_completed: 2
  files_modified: 2
---

# Phase 86 Plan 02: Context Builder and Discussion Routing Summary

Elicitation context builder packaging question + phase goal + plan summary + recent git diff + project state into a budgeted string, with single-round discussion routing returning consensus answers or graceful fallbacks.

## What Was Built

### buildElicitationContext() (lib/discussion.ts)

Function signature: `buildElicitationContext(question: string, options: { cwd: string; phase?: string; milestone?: string }): string`

Builds a five-section context string with per-section character budgets:

| Section | Budget | Source |
|---------|--------|--------|
| `## Question` | 1K chars | function argument |
| `## Phase Goal` | 1K chars | ROADMAP.md (phase search) |
| `## Plan Summary` | 2K chars | active PLAN.md `<objective>` content |
| `## Recent Changes` | 2K chars | `git diff --stat HEAD~3..HEAD` |
| `## Project State` | 1K chars | STATE.md `## Current Position` section |

Total output stays under 32K chars (~8K tokens). All file reads wrapped in try/catch — missing files silently omit that section. Git diff via `execFileSync('git', ['diff', '--stat', 'HEAD~3..HEAD'], ...)` with 10s timeout.

### resolveElicitation() (lib/discussion.ts)

Function signature: `resolveElicitation(question: string, context: string, options: { participants: BackendId[]; synthesizer: BackendId; cwd: string }): string`

Calls `runDiscussion()` with:
- `topic`: combined context + instructions (answer concisely, make a decision, don't ask more questions)
- `rounds`: 1 (speed over depth for elicitation resolution)
- `synthesizer`, `participants`, `cwd`: from options
- `type`: `'elicitation'`

Return path: `result.synthesis.response_text` (trimmed). Fallbacks:
1. If synthesis empty → iterate round-1 entries, return first non-skipped `response_text`
2. If all skipped → return `''`
3. If `runDiscussion` throws → catch, return `''`

Both functions added to `module.exports`.

### Unit tests (tests/unit/discussion.test.ts)

**buildElicitationContext (7 tests):**
- Returns string containing the question text
- Output length under 32K chars even with long input
- Includes `## Question` section header
- Handles missing ROADMAP.md without throwing
- Handles missing STATE.md without throwing
- Truncates long git diff output within 2K budget
- Works with minimal options (cwd only)

**resolveElicitation (6 tests):**
- Calls runDiscussion via execFileSync (verified by mock call count)
- Returns synthesis response_text when discussion succeeds
- Returns empty string when all participants unavailable
- Returns empty string when runDiscussion throws
- Passes participants and synthesizer correctly
- Returns string in all cases

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run build:check` | PASS |
| `npx jest tests/unit/discussion.test.ts` (177 tests) | PASS |
| `npm run lint` | PASS |
| Line coverage on discussion.ts | 90.65% (target: 90%) |
| Branch coverage on discussion.ts | 86.87% (target: 85%) |
| Function coverage on discussion.ts | 100% |

## Self-Check

- [x] `lib/discussion.ts` exports `buildElicitationContext` — FOUND in module.exports
- [x] `lib/discussion.ts` exports `resolveElicitation` — FOUND in module.exports
- [x] `tests/unit/discussion.test.ts` contains `buildElicitationContext` describe block — FOUND
- [x] `tests/unit/discussion.test.ts` contains `resolveElicitation` describe block — FOUND
- [x] Commit 8e4b95b (Task 1) — FOUND
- [x] Commit f5d0f50 (Task 2) — FOUND

## Self-Check: PASSED
