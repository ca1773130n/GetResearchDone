---
phase: 105-ai-panel-fallback-hardening
wave: all
plans_reviewed: [105-01, 105-02, 105-03, 105-04]
timestamp: 2026-07-19T14:46:49Z
blockers: 0
warnings: 1
info: 4
verdict: warnings_only
---

# Code Review: Phase 105 (AI-Panel Fallback Hardening) — all waves

## Verdict: WARNINGS ONLY

All four plans were executed as written with no undocumented deviations. Code cross-checks
(grep for `answerViaDiscussion`, `resolveCheckpointInline`, `engagedPanel`, panel counters)
confirm every claim in the SUMMARY files against the actual source. `tsc --noEmit`, eslint,
and the full `checkpoints.test.ts` / `orchestrator.test.ts` / `milestone-verification.test.ts`
suites (149 tests) all pass locally. One WARNING: a non-blocking hardening gap was
discovered live in 105-04 (`resolveElicitation` ignores the built panel question) and
explicitly deferred to "a future Phase 105 code plan" — but no such follow-up plan exists in
this phase, so it risks being lost.

## Stage 1: Spec Compliance

### Plan Alignment
No issues found. All plan tasks map to commits:
- 105-01: `93ac74b` (answerViaDiscussion core + matching/rate-limit guard), `91877d8` (SUMMARY).
- 105-02: `0304ab6` (4 emit sites + resolveCheckpointInline), `bb976ce` (portfolio concurrency),
  `8634199` (docs), `6053d9a` (SUMMARY).
- 105-03: `68b4aa9` (milestone-verification.test.ts, R1/R3/R4/R5), `c7b484d` (SUMMARY).
- 105-04: `b90a021` (live panel observation), `aa6d355` (VALIDATION record), `de7034c` (SUMMARY).

105-04's Task 2 is a `checkpoint:human-verify` gate; 105-04-VALIDATION.md and the SUMMARY
both record it as approved with an added Pass 3, consistent with the plan's resume-signal
contract.

### Research Methodology
FEATURES.md §F6 describes the panel-fallback design (reuse `resolveElicitation`, degrade to
recommended defaults, audit trail identical across human/panel/default). The implementation
in `lib/research/checkpoints.ts:answerViaDiscussion` and `lib/research/orchestrator.ts`
matches this faithfully: same resolver reused unchanged, same degrade-safe guarantee, same
audit-trail identity claim (verified structurally — panel resolution re-enters the loop via
`continue` through the same `consumeAnswered`/apply path a human resume uses, per the 105-02
SUMMARY's "re-entrant continue" decision).

### Context Decision Compliance
N/A — no CONTEXT.md exists for this phase.

### Known Pitfalls
No KNOWHOW.md pitfalls specific to this phase's domain were found in the research directory
(only ARCHITECTURE.md/ECOSYSTEM.md/FEATURES.md/PITFALLS.md/SUMMARY.md exist under
`research/`; PITFALLS.md was not grepped for panel-specific content but no BLOCKER-level
pitfall was hit — all 105-01..105-04 SUMMARYs report PASS on every listed truth).

### Eval Coverage
105-EVAL.md's Level 1/2 proxy metrics (P1-P8) and Level 3 deferred items (D1-D3) map cleanly
onto what 105-01/02/03 built and what 105-04 validated. All P1-P8 proxy suites re-run green
locally (149/149 across the three touched test files). D1 (live panel-backend answer
quality, DEFER-105-01) is resolved in 105-04-VALIDATION.md via the Pass 3 observation of a
literal `answeredBy:'panel'` record from a real multi-backend panel — consistent with EVAL's
deferred-item disposition expectations.

## Stage 2: Code Quality

### Architecture
Consistent with existing patterns: DI seams (`deps.resolveElicitation`, `deps.detectFromStdout`,
`opts.answerViaDiscussion`, `opts.panelDeps`) mirror the project's established
spawn/runner-injection convention (`const { fn } = require(...)` defaults, test-injected
stubs, never spawn in tests). No duplicate implementations — 105-02 explicitly chose to
reuse the existing top-of-loop consume machinery via re-entrant `continue` rather than adding
parallel answer-application logic, which is a net reduction in duplication (documented as a
deviation in the 105-02 SUMMARY, correctly framed as a scope-reducing simplification, not
scope creep).

### Reproducibility
N/A in the traditional ML sense — this is deterministic control-flow code. Offline test
determinism is preserved throughout: all new tests inject stubs (`resolveElicitation`,
`detectFromStdout`, `answerViaDiscussion`, `incrementCounter`) and never spawn a real
subprocess, consistent with the project's "Inject dependencies... for offline, deterministic
tests" testing convention (CLAUDE.md). 105-04's live sandbox exercise correctly happens only
in a throwaway `mktemp -d`, confirmed clean via `git status --porcelain` in this review (no
stray research/threads or KNOWHOW.md artifacts from any of these plans).

### Documentation
Adequate. 105-02 documents `research_gates.interactive.fallback` across CLAUDE.md,
`commands/settings.md`, and `docs/autoresearch-tutorial.md` §3.6 as planned; FEATURES.md §F6
cross-references the implementation. Inline code comments in `checkpoints.ts` and
`orchestrator.ts` reference the REQ-207/REQ-208 IDs and rationale (e.g., the `engagedPanel`
predicate and `resolveCheckpointInline` docstring), giving good traceability back to plan
intent.

**WARNING (Stage 2, Documentation/follow-through):** 105-04-VALIDATION.md and
105-04-SUMMARY.md both flag two "non-blocking hardening follow-ups" discovered live:
(1) `lib/discussion.resolveElicitation` ignores its `question` argument in production,
forwarding only `ck.context` — meaning vanilla production checkpoints don't naturally surface
option labels to the panel (this is why 105-04 needed a workaround, "surfaced through
`ck.context`," to get a literal `answeredBy:'panel'` at all); and (2) `codex`/`gemini` return
empty inside `runDiscussion` despite `codex exec` authenticating standalone. Both are
explicitly deferred to "a future Phase 105 code plan," but no such plan exists within this
phase's scope (105-01 through 105-04 are the entire phase) and no ROADMAP/STATE entry was
found tracking these as follow-up work items. Recommend either opening a tracked
follow-up item (new phase/plan or a DEAD-ENDS/backlog entry) or confirming it is
intentionally out of v0.5.0 scope, so the finding is not silently lost.

### Deviation Documentation
SUMMARY.md files match git history for all four plans — no undocumented file was found
modified outside each plan's declared `files_modified` set (spot-checked via targeted greps
against `orchestrator.ts`, `checkpoints.ts`, `portfolio.ts`). 105-02's one deviation
(re-entrant `continue` instead of per-site inline application) is properly documented with
rationale and file/commit references. 105-04's Pass 3 addition (elevating DEFER-101-02 from
partially to fully resolved) is documented as arising from the human-verify checkpoint
resume-signal, consistent with the plan's checkpoint contract.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|--------------|
| 1 | WARNING | 2 | Documentation/follow-through | Two non-blocking hardening follow-ups (`resolveElicitation` ignoring `question`; codex/gemini empty in `runDiscussion`) surfaced in 105-04 are deferred to "a future Phase 105 code plan" that does not exist in tracked scope — risk of being lost. |
| 2 | INFO | 1 | Research Methodology | Panel-fallback design faithfully matches FEATURES.md §F6 including the audit-trail-identity guarantee. |
| 3 | INFO | 2 | Architecture | 105-02's re-entrant `continue` design reduces duplication vs. the original plan's per-site application approach — good simplification. |
| 4 | INFO | 2 | Reproducibility | All new tests are fully offline/injected; live-only validation correctly isolated to a throwaway sandbox in 105-04. |
| 5 | INFO | 1 | Eval Coverage | 105-EVAL.md P1-P8 proxy metrics all reproduce green (149/149) on local re-run. |

## Recommendations

- **Finding 1 (WARNING):** Open an explicit backlog/ROADMAP item (or a DEAD-ENDS.md /
  KNOWHOW.md entry) for the two `lib/discussion.ts` hardening follow-ups identified in
  105-04-VALIDATION.md, so they are not lost between milestones. This does not block
  phase completion — the offline suites already exhaustively cover the panel matching logic,
  and 105-04 proved both the degrade-safe and literal-panel-answer branches live — but the
  production gap (checkpoints not naturally surfacing option labels to the panel without the
  `ck.context` workaround) should be tracked rather than left only in a SUMMARY.md.
