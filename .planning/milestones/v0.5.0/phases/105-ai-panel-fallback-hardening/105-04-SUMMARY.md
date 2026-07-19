---
phase: 105-ai-panel-fallback-hardening
plan: 04
subsystem: research/validation
tags: [live-validation, checkpoints, ai-panel, integration-phase, deferred-validation, DEFER-104-01, DEFER-104-02, DEFER-102-01, DEFER-101-02, DEFER-101-03]
requires:
  - "lib/research/orchestrator.ts (SEED clarify, HYPOTHESIZE selection, engagedPanel/resolveCheckpointInline)"
  - "lib/research/checkpoints.ts answerViaDiscussion (degrade-safe AI-panel fallback)"
  - "lib/discussion.ts resolveElicitation (panel resolver)"
provides:
  - ".planning/milestones/v0.5.0/phases/105-ai-panel-fallback-hardening/105-04-VALIDATION.md (live validation record + DEFER disposition table)"
affects: []
tech-stack:
  added: []
  patterns:
    - "live gd research exercised ONLY in throwaway mktemp -d sandbox with its own .planning/ — repo never polluted"
    - "direct answerViaDiscussion harness pins panel behavior fast without full-loop cost"
key-files:
  created:
    - .planning/milestones/v0.5.0/phases/105-ai-panel-fallback-hardening/105-04-VALIDATION.md
  modified: []
decisions:
  - "All 5 deferred live validations this Integration Phase owns are RESOLVED; none re-deferred"
  - "DEFER-101-02 FULLY RESOLVED — both branches proven live with real backends: degrade-safe non-pausing defaults (Pass 2/2b) AND literal answeredBy:'panel' (Pass 3, real opencode+codex panel + claude synthesizer via production answerViaDiscussion)"
  - "Root-caused the vanilla-run degrade: lib/discussion.resolveElicitation forwards only ck.context, ignoring the built panel question (options + verbatim-reply instruction) — logged as a non-blocking Phase 105 hardening follow-up, not a deferred validation"
  - "codex/gemini return empty inside runDiscussion despite codex authenticating standalone — second non-blocking lib/discussion.ts hardening follow-up"
metrics:
  duration_min: 42
  completed: 2026-07-19
  tasks: 2
  files: 1
---

# Phase 105 Plan 04: Live Sandbox Validation + Deferred-Validation Collection Summary

Exercised the full v0.5.0 checkpoint machinery against a **real Claude backend** in throwaway
`mktemp -d` sandboxes and dispositioned every deferred live validation the milestone Integration
Phase owns. The GRD repo was never polluted (confirmed clean after every pass; sandboxes removed).

## What was validated (live)

- **SEED clarify (DEFER-102-01):** live run paused at `ck-1-seed-r1` with one sharp,
  decision-relevant clarifying question (3 readable options, recommended marked); answered via
  `--answers <file>` and resumed with no double-ask.
- **HYPOTHESIZE selection (DEFER-104-01/02):** live run generated **3 genuinely distinct,
  falsifiable** candidates (affirmative monotonic reduction / not-monotonic net M−N / completeness
  boundary), each with statement+rationale+predictedOutcome; selection prompt coherent (one
  question, recommended marked, freeform escape hatch).
- **`fallback:'panel'` unattended (DEFER-101-02):** two autonomous runs completed **without
  pausing**, resolving checkpoints inline and degrading cleanly to recommended defaults
  (`answeredBy:'default'`). Then, per the checkpoint decision, a real multi-backend panel
  (opencode+codex participants, claude synthesizer) driven through the production
  `answerViaDiscussion` produced a **literal `answeredBy:'panel'`** record once option labels were
  surfaced through `ck.context`.
- **R1–R5 suite (DEFER-101-03):** already RESOLVED offline by 105-03.

## Deferred-validation disposition

| ID | Disposition |
|----|-------------|
| DEFER-104-01 | RESOLVED — distinct falsifiable candidates |
| DEFER-104-02 | RESOLVED — coherent selection UX |
| DEFER-102-01 | RESOLVED — live SEED clarify, answered + resumed |
| DEFER-101-02 | FULLY RESOLVED — degrade-safe AND literal panel-answer branches proven live |
| DEFER-101-03 | RESOLVED — offline R1/R3/R4/R5 (105-03) |

No new deferred validations carried forward.

## Non-blocking hardening follow-ups (for a future Phase 105 code plan)

1. `lib/discussion.resolveElicitation` ignores its `question` argument — it forwards only
   `ck.context`, so vanilla production checkpoints don't surface option labels/verbatim instruction
   to the panel; wiring the built panel prompt through would make `answeredBy:'panel'` fire
   naturally. Out of scope for this validation plan (which only writes VALIDATION.md).
2. `codex`/`gemini` return empty inside `runDiscussion` despite codex authenticating standalone
   (`codex exec` smoke passed) — worth an adapter check.

Neither blocks the seam: the panel match logic is exhaustively covered offline by the 105-01/105-03
suites, and both the degrade and panel-answer branches are now observed live.

## Deviations from Plan

None — plan executed as written. The Task 2 human-verify checkpoint approved DEFER-104-01/02,
102-01, and 101-03 as presented and directed the additional Pass 3 that elevated DEFER-101-02 from
"RESOLVED (degrade path)" to FULLY RESOLVED and dropped the tentative DEFER-105-01.

## Self-Check: PASSED

- FOUND: `.planning/milestones/v0.5.0/phases/105-ai-panel-fallback-hardening/105-04-VALIDATION.md`
- FOUND commit `aa6d355` (VALIDATION record) and `b90a021` (panel observation)
- GRD repo working tree clean — no `.planning/research/threads/`, no root `KNOWHOW.md`, no
  `DEAD-ENDS.md` mutation leaked from the sandbox runs.
