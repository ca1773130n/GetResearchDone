---
phase: 99-knowledge-injection-loop
plan: 02
subsystem: autopilot
tags: [knowledge, autopilot, prompt-engineering, agents]

# Dependency graph
requires:
  - phase: 99-01
    provides: buildKnowledgeInjectionBlock in lib/knowledge.ts
provides:
  - Knowledge-injected buildPlanPrompt (cwd param, prepends knowhow_context block)
  - Knowledge-injected buildExecutePrompt (cwd param, prepends knowhow_context block)
  - <knowhow_injection> block in agents/grd-executor.md
affects: [autopilot, grd-executor, all future phase planning and execution]

# Tech tracking
tech-stack:
  added: []
  patterns: [optional-cwd-parameter-for-backward-compat, graceful-empty-injection]

key-files:
  created: []
  modified:
    - lib/autopilot.ts
    - agents/grd-executor.md

key-decisions:
  - "cwd parameter is optional in buildPlanPrompt/buildExecutePrompt for backward compatibility with external callers and dry-run prompt generation"
  - "Execute worktree call sites pass wtPath (not cwd) to buildExecutePrompt — agents read KNOWHOW.md from their execution context"
  - "Dry-run plan prompt passes cwd so dry-run output reflects what real prompts would include"

patterns-established:
  - "Knowledge injection is a no-op when KNOWHOW.md absent — empty string check gates prepend"

# Metrics
duration: 8min
completed: 2026-03-25
---

# Phase 99 Plan 02: Knowledge Injection Loop Summary

**`buildKnowledgeInjectionBlock` wired into both `buildPlanPrompt` and `buildExecutePrompt`; `grd-executor.md` gains `<knowhow_injection>` block — closing the loop so curated KNOWHOW.md patterns flow into all three agent types automatically.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-25T08:10:13Z
- **Completed:** 2026-03-25T08:18:00Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- Wired `buildKnowledgeInjectionBlock` from `lib/knowledge.ts` into `lib/autopilot.ts` with a typed require block
- Both `buildPlanPrompt` and `buildExecutePrompt` now prepend a `<knowhow_context>` XML block (top-5 KNOWHOW entries) when KNOWHOW.md exists; no-op when absent
- Updated all 8 call sites: 5 `buildPlanPrompt` calls pass `cwd`; 3 `buildExecutePrompt` calls pass `cwd` (dry-run) or `wtPath` (worktree execution)
- Added `<knowhow_injection>` block to `agents/grd-executor.md` — all three key agents (planner, researcher, executor) now have consistent knowledge injection instructions

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire buildKnowledgeInjectionBlock into autopilot prompt builders** - `3ea3af9` (feat)
2. **Task 2: Add knowhow_injection block to grd-executor.md** - `141d097` (feat)

## Files Created/Modified

- `/Users/neo/Developer/Projects/GetResearchDone/.worktrees/grd-worktree-v0.3.22-99/lib/autopilot.ts` - Added require for buildKnowledgeInjectionBlock; updated buildPlanPrompt/buildExecutePrompt signatures and all call sites
- `/Users/neo/Developer/Projects/GetResearchDone/.worktrees/grd-worktree-v0.3.22-99/agents/grd-executor.md` - Added <knowhow_injection> block after </role>

## Decisions Made

- `cwd` parameter is optional in both prompt builder functions to maintain backward compatibility with any external callers and dry-run prompt generation without a project root
- Execute worktree call sites pass `wtPath` (not `cwd`) to `buildExecutePrompt` — the executor agent runs inside the worktree, so it must find KNOWHOW.md relative to its working directory
- Dry-run plan prompt passes `cwd` so preview output reflects what real prompts would include

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Knowledge injection loop is fully closed: miner agent writes KNOWHOW.md, subsequent planning/execution prompts automatically include top-5 curated entries
- Phase 100 (Evaluation Benchmark Framework) can proceed — no blockers

## Self-Check: PASSED

- SUMMARY.md: FOUND
- lib/autopilot.ts: FOUND
- agents/grd-executor.md: FOUND
- Commit 3ea3af9 (Task 1): FOUND
- Commit 141d097 (Task 2): FOUND

---
*Phase: 99-knowledge-injection-loop*
*Completed: 2026-03-25*
