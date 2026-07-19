---
phase: 102-design-approval-skill-checkpoint-loop
plan: 01
subsystem: research
tags: [orchestrator, checkpoints, human-in-the-loop, interactive-steering]

# Dependency graph
requires:
  - phase: 101-checkpoint-core-plumbing-config
    provides: "checkpoints.ts standalone module (emitCheckpoint/resolveCheckpoint/consumeAnswered/readInteractiveConfig/resolveInteractive/makeCheckpointId/validateCheckpoint), Checkpoint schema, resumeResearch resume-with-answers branch, dormant runLoop param"
provides:
  - "First live checkpoint emission call site: the DESIGN/GATE-1 station in runLoop"
  - "Approve/revise/abort consume wiring hoisted to the TOP of runLoop (before HYPOTHESIZE/DESIGN), fixing the re-derive blocker on checkpoint resume"
  - "Whitelisted metric-contract edit (metricKey/comparator/target/language) applied before the debug-loop committed pin (R4)"
  - "Revise-round cap (interactive.max_rounds, default 2) with fallback to approve"
affects: [103-seed-interview-decide-branch, 104-hypothesize-candidate-selection, 105-ai-panel-fallback-hardening]

tech-stack:
  added: []
  patterns:
    - "Checkpoint emit/consume pattern established at DESIGN — Phases 103/104 copy this for SEED/HYPOTHESIZE/DECIDE stations"
    - "Consume-at-loop-top-before-spawn pattern for checkpoint resume (never re-derives, REQ-199)"

key-files:
  created: []
  modified:
    - lib/research/orchestrator.ts
    - tests/unit/research/orchestrator.test.ts

key-decisions:
  - "Consume design-answer resolution (approve/revise/abort) sits at the TOP of runLoop, parallel to the execute reuse fast-path — NOT at the GATE-1 site — because approved.execute is false on a checkpoint resume; the old GATE-1 placement would re-spawn DESIGN"
  - "GATE-1 site (buildDesignCheckpoint + emitCheckpoint) handles ONLY fresh-emit and revise-re-emit; it never consumes an approve/abort answer"
  - "Contract edits from the checkpoint's freeform Q2 answer are applied to `plan` and persisted to plan.json BEFORE the `committed` debug-loop snapshot, so the debug loop pins the user-edited contract, not the model's original"
  - "Revise reuses the SAME hypothesis (not a fresh HYPOTHESIZE spawn) and only re-runs DESIGN, mirroring the existing crash-recovery reuse path"
  - "Revise-cap-exceeded routes to the APPROVE reuse path (never loops forever, never wedges)"

patterns-established:
  - "Design-approval checkpoint carries exactly 2 questions: Q1 (approve/revise/abort, one recommended) and Q2 (freeform contract edit, one recommended 'keep as-is')"

duration: ~35min
completed: 2026-07-19
---

# Phase 102 Plan 01: DESIGN Approval Checkpoint Summary

**Wired the first live checkpoint emission site into the research orchestrator: a combined DESIGN-approval pause at GATE-1 that lets a human approve/revise/abort the experiment plan and edit its metric contract, with the contract edit surviving the bounded debug-loop pin and zero behavior change when interactive steering is off.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 completed
- **Files modified:** 2 (lib/research/orchestrator.ts, tests/unit/research/orchestrator.test.ts)

## Accomplishments
- Emitted a design-approval `Checkpoint` (type `approval`, ≤2 questions, exactly one recommended option each) at the GATE-1 site when `interactive.design` is active, returning `{status:'paused', pendingCheckpoint}` — the classic `checkGate('execute')` pause path is left byte-identical when interactive is off.
- Hoisted the approve/revise/abort consume logic to the TOP of `runLoop`, fixing the re-derive blocker: on a checkpoint resume `approved.execute` is false, so consuming at the old GATE-1 site would have re-spawned DESIGN and violated REQ-199 ("never re-derives"). Approve now takes the persisted-plan reuse fast-path directly.
- Applied whitelisted contract edits (`metricKey|comparator|target|language`, parsed from the checkpoint's freeform Q2 `key: value` lines) to `plan` and persisted them to `plan.json` before the debug-loop `committed` snapshot is taken (R4) — proven with a forced debug retry where the model's re-proposed plan drifts back toward the original value and the pin re-applies the user's edit, not the model's.
- Capped revise at `interactive.max_rounds` (default 2); the `(max_rounds+1)`th revise resolution falls back to approve instead of pausing again.
- Abort sets `thread.status='abandoned'` and returns a terminal result with no RUN.

## Task Commits

1. **Task 1+2: Emit checkpoint at GATE-1 + consume approve/revise/abort at loop top** - `4acd842` (feat)
2. **Task 3: Deterministic offline proofs (R4/R5/revise-cap/abort/byte-identical default)** - `dc68ff2` (test)

_Note: Tasks 1 and 2 modify the same tightly-coupled region of `orchestrator.ts` (the consume logic at the loop top and the emission logic at GATE-1 only make sense together, since the consume path is what routes control away from ever reaching a fresh GATE-1 emission on approve) and were committed together as a single coherent diff._

## Files Created/Modified
- `lib/research/orchestrator.ts` — `resolveDesignPosture` (interactive.design activation gate honoring `opts.interactive` one-shot override), `buildDesignCheckpoint` (Q1 approve/revise/abort + Q2 freeform contract edit), `applyContractEditsFromFreeform` (whitelisted key:value parser), consume-at-loop-top wiring (`designResolution` approve/revise/abort), GATE-1 branch (emit vs classic checkGate), `runLoop`'s `_resumedCheckpoint` param made live (renamed `resumedCheckpoint`), `ResearchOptions.checkpointHandler` DI seam added.
- `tests/unit/research/orchestrator.test.ts` — new `describe('DESIGN approval checkpoint (Phase 102)')` block: 6 tests (one-pause emit, R4 contract-edit-survives-pin, R5 no-double-ask, revise-cap, abort, byte-identical default).

## Decisions Made
See `key-decisions` in frontmatter. All follow the locked design from the phase context and research SUMMARY §4/REQ-199 exactly — no deviation from the plan's specified placement.

## Deviations from Plan

None — plan executed exactly as written. The only adaptation was combining Task 1 and Task 2 into a single commit (see Task Commits note above) since they modify the same interdependent code region; both tasks' `<done>` criteria were independently verified.

## Issues Encountered

One test-authoring issue, self-corrected before commit: the R4 test initially asserted `res.status === 'supported'` immediately after an approve-resume, but the test config had left `research_gates.kg_write` at its default (`true`), so the run legitimately paused at the `kg_write` gate instead of finalizing. Fixed by setting `kg_write: false` in the test's interactive config helper (Rule 3 — blocking issue in test setup, not production code).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

The emit→pause→resume→consume pattern is now established at a real call site (DESIGN/GATE-1) and can be copied verbatim for the SEED (Phase 103), HYPOTHESIZE (Phase 104), and DECIDE (Phase 103) stations. `resumeResearch`'s resume-with-answers branch required zero changes — it already threaded the resolved checkpoint into `runLoop`. Plan 102-02 (skill-layer AskUserQuestion loop + CLI/status rendering) runs in parallel against `commands/research.md`/`lib/research/cli.ts`/`lib/research/thread.ts` and was not touched by this plan.

---
*Phase: 102-design-approval-skill-checkpoint-loop*
*Completed: 2026-07-19*
