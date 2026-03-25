---
phase: 99-knowledge-injection-loop
plan: 01
subsystem: knowledge
tags: [knowledge, knowhow, prompt-injection, tdd]

requires:
  - phase: 95-agentic-knowledge-enhancement
    provides: parseKnowhowEntries, selectTopEntries, formatKnowhowEntry, appendKnowhowEntries in lib/knowledge.ts

provides:
  - buildKnowledgeInjectionBlock function exported from lib/knowledge.ts
  - Reads KNOWHOW.md from cwd, selects top-5 entries, returns <knowhow_context> prompt block

affects: [grd-executor, grd-planner, grd-phase-researcher, any agent that injects knowledge context]

tech-stack:
  added: []
  patterns: [TDD RED/GREEN, XML prompt block wrapping, safeReadFile for graceful missing-file handling]

key-files:
  created: []
  modified:
    - lib/knowledge.ts
    - tests/unit/knowledge.test.ts

key-decisions:
  - "_phaseNum parameter prefixed with underscore — reserved for future phase-proximity scoring, not used in initial implementation; avoids ESLint no-unused-vars error"
  - "moduleHints boost only applies within same phase_number bucket — phase recency always takes precedence over hint matching; fixed test to use same-phase entries to verify hint ordering"

patterns-established:
  - "buildKnowledgeInjectionBlock wraps formatted entries in <knowhow_context> XML tags for structured prompt injection"

duration: 3min
completed: 2026-03-25
---

# Phase 99 Plan 01: Knowledge Injection Loop Summary

**`buildKnowledgeInjectionBlock` implemented in `lib/knowledge.ts` — reads KNOWHOW.md, selects top-5 entries via `selectTopEntries`, and returns a `<knowhow_context>` XML prompt block; the missing link between knowledge mining and agent consumption.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-25T08:05:06Z
- **Completed:** 2026-03-25T08:08:00Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments

- Implemented `buildKnowledgeInjectionBlock(cwd, _phaseNum, moduleHints?)` function in `lib/knowledge.ts` — reads KNOWHOW.md, returns empty string for missing/empty files, selects top 5 via `selectTopEntries`, formats as `<knowhow_context>` XML block
- Added 5 TDD test cases covering: missing file, empty file, top-5 recency selection, moduleHints filtering, and cwd-rooted path lookup
- All 34 knowledge tests pass; TypeScript compiles clean; ESLint passes

## Task Commits

1. **Task 1: Write failing tests for buildKnowledgeInjectionBlock** - `e951833` (test)
2. **Task 2: Implement buildKnowledgeInjectionBlock** - `68eec92` (feat)

## Files Created/Modified

- `lib/knowledge.ts` — Added `buildKnowledgeInjectionBlock` function and exported it from `module.exports`
- `tests/unit/knowledge.test.ts` — Added `buildKnowledgeInjectionBlock` import in typed require block + 5 new test cases in new describe block

## Decisions Made

- `_phaseNum` is underscore-prefixed to signal it is reserved for future phase-proximity scoring while avoiding ESLint `no-unused-vars` error
- Test for `moduleHints` uses entries at the same `phase_number` to correctly exercise the hint-boost secondary sort; mixing different phase_numbers would have the higher-phase generic entries dominate top-5 regardless of hints

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed moduleHints test to use same-phase entries**

- **Found during:** Task 2 (GREEN phase — test run)
- **Issue:** Original test had autopilot entries at phases 91-92 and generic entries at phases 93-96. With `selectTopEntries` sorting by phase_number descending first, the 4 generic entries (higher phases) occupied 4 of the top-5 slots before hints applied; only phase 92 autopilot would be included, not 91. Test expected both 91 and 92.
- **Fix:** Changed all 6 entries to the same `phase_number: 95` so the moduleHints secondary sort correctly determines order. Both autopilot entries now appear in the top-5.
- **Files modified:** `tests/unit/knowledge.test.ts`
- **Verification:** All 5 `buildKnowledgeInjectionBlock` tests pass after fix

---

**Total deviations:** 1 auto-fixed (Rule 1 — test logic bug)
**Impact on plan:** None — same behavioral guarantees, correct test semantics

## Issues Encountered

Test logic mismatch in moduleHints test case: the original test design didn't account for phase_number taking precedence over hint matching in `selectTopEntries`. Fixed inline without plan change.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

`buildKnowledgeInjectionBlock` is now exported and callable from any agent that needs to inject KNOWHOW.md context into prompts. The function is ready to be wired into:
- `grd-executor` prompts
- `grd-planner` prompts (already has stub injection per Phase 95 decisions)
- Any other agent definitions that consume knowledge context

No blockers for subsequent plans.

---
## Self-Check: PASSED

All created/modified files confirmed present. All task commits verified in git history.

*Phase: 99-knowledge-injection-loop*
*Completed: 2026-03-25*
