---
phase: 86-elicitation-detection-and-resolution-core
wave: all
plans_reviewed: [86-01, 86-02]
timestamp: 2026-03-24T00:00:00Z
blockers: 0
warnings: 2
info: 3
verdict: warnings_only
---

# Code Review: Phase 86 — Elicitation Detection and Resolution Core

## Verdict: WARNINGS ONLY

All plan tasks were executed and committed. Two warnings relate to a documented-but-divergent detection pattern priority order and a subtle argument mismatch in `resolveElicitation`. No blockers found.

## Stage 1: Spec Compliance

### Plan Alignment

**86-01:** Both tasks executed exactly. Commits 17e6a57 (Task 1) and 701904c (Task 2) are present. All three artifacts exist: `ElicitationDetection` in `lib/types.ts`, `detectElicitation` in `lib/discussion.ts`, and the test describe block in `tests/unit/discussion.test.ts`.

**86-02:** Both tasks executed. Commits 8e4b95b (Task 1) and f5d0f50 (Task 2) are present. `buildElicitationContext` and `resolveElicitation` are both exported from `lib/discussion.ts`.

**WARNING — Pattern priority order diverges from plan spec (86-01, Task 1):**
Plan 86-01 specifies detection priority as: `(a) direct_question → (b) numbered_options → (c) clarification_phrase → (d) option_prompt`. The implementation inverts the top two: `numbered_options` is checked in a pre-scan pass 1, then `clarification_phrase`, then `direct_question` in pass 2. The SUMMARY documents this as a deliberate technical decision ("numbered_options checked first requires consecutive line scan"). The rationale is sound — consecutive-line detection requires a full scan pass anyway. However, the plan's must_have truth "detectElicitation() returns non-null ElicitationDetection for lines ending with '?'" is still met. The deviation is properly documented in SUMMARY.md decisions, so this is a WARNING not a BLOCKER.

**WARNING — `resolveElicitation` passes combined context+instructions as the `topic` argument, not the raw question (86-02, Task 1):**
Plan 86-02 states: `topic: the question`. The implementation passes `discussionTopic` (which is `context + "## Instructions" + answer directives`) as the `topic` argument to `runDiscussion()`. The SUMMARY documents this as a decision: "buildElicitationContext passes discussionTopic (context+instructions) as runDiscussion topic — not the raw question — so participants get full context." The functional intent is correct and the behavior is arguably better. Still, it diverges from the literal plan spec. Properly documented in SUMMARY.md decisions.

### Research Methodology

N/A — no research references in plans. This phase implements original regex-based heuristics with no paper references.

### Context Decision Compliance

No CONTEXT.md found for phase 86. No locked decisions to verify against.

### Known Pitfalls

No KNOWHOW.md found for this milestone. Not applicable.

### Eval Coverage

EVAL.md exists and is comprehensive. All eval commands reference correct file paths (`lib/discussion.ts`, `tests/unit/discussion.test.ts`). Interface matches implementation exactly. Deferred validations (DEFER-86-01, DEFER-86-02) are correctly scoped to phase-88-or-integration.

**INFO — EVAL.md S4 crash test uses `node -e` with no guards:** The S4 sanity check `node -e "const {detectElicitation} = require('./lib/discussion'); ..."` may encounter zsh `!` escaping issues per project CLAUDE.md gotchas. Not a blocking issue since eval commands are documentation — no test execution depends on this.

## Stage 2: Code Quality

### Architecture Consistency

Implementation follows all project patterns: `'use strict'` at top, CommonJS `module.exports`, typed `require()` casts, `import type` for types, `_` prefix not needed (no unused args), `fs`/`path`/`execFileSync` typed require pattern matches existing module style. New functions are organized in a clearly labeled section with JSDoc. No duplicate utility implementations.

**INFO — `truncateTo` helper is module-private but could serve other callers:** `truncateTo(s, maxLen)` is a simple, generally useful utility. No issue now, but if other modules need similar truncation it belongs in `lib/utils.ts`. No action required at this stage.

### Reproducibility

N/A — no experimental/ML code. Deterministic regex-based implementation.

### Documentation

All three new functions have JSDoc with `@param` and `@returns`. `detectElicitation` has a comprehensive block comment listing all skip rules and detection patterns. `buildElicitationContext` documents the budget constants and section sources. `resolveElicitation` documents the full fallback chain. Paper references not applicable (heuristic implementation).

**INFO — `isRhetoricalQuestion` guard is under-specified in comments:** The guard catches `^\w+\?` (one word) with `<= 2 word count`. The comment says "sentence connector rather than standalone question" but the heuristic also suppresses "Why?" as a standalone question. Edge case is tested, but a comment noting the known limitation (may false-negative single-word real questions) would aid future maintenance. Low priority.

### Deviation Documentation

SUMMARY.md for both plans accurately reflects what was committed. Git log confirms 4 commits aligned with 2 tasks per plan. The pattern priority inversion and topic-vs-question argument deviation are both captured in decisions sections of their respective SUMMARY files. Files modified match key_files lists exactly.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 1 | Plan Alignment | Detection pattern priority order diverges from plan spec (direct_question is plan's top priority; implementation checks numbered_options first). Documented in SUMMARY decisions. |
| 2 | WARNING | 1 | Plan Alignment | `resolveElicitation` passes full context+instructions as `topic`, not raw question as specified. Documented in SUMMARY decisions. |
| 3 | INFO | 1 | Eval Coverage | EVAL.md S4 node -e command uses inline JS — zsh `!` escaping may cause issues per project CLAUDE.md gotchas. |
| 4 | INFO | 2 | Architecture | `truncateTo` helper is module-private; could belong in `lib/utils.ts` if reuse needed in future. |
| 5 | INFO | 2 | Documentation | `isRhetoricalQuestion` guard comment does not note that single-word standalone questions are suppressed as a side effect. |

## Recommendations

**WARNING 1 — Pattern priority order:** No code change required. The implementation's priority (numbered_options first via two-pass scan) is technically correct and the SUMMARY documents it. Consider updating Plan 86-01's task description in retrospect if this phase template is reused, so the next reader doesn't encounter the discrepancy.

**WARNING 2 — resolveElicitation topic argument:** No code change required. Passing full context as topic gives discussion participants better grounding than passing the raw question alone. The SUMMARY decision entry is clear. If a future caller needs to pass only the question as topic, the function signature supports that pattern via the `question` parameter which is already part of the context string.
