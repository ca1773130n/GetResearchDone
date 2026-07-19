---
phase: 103-seed-interview-decide-branch
plan: 03
subsystem: research/orchestrator
tags: [interactive-steering, checkpoint, decide, human-in-the-loop, REQ-204]
requires: [103-02, 102-01]
provides:
  - "resolveDecidePosture (would-continue steering; not iteration-1 gated)"
  - "buildDecideCheckpoint (point='decide', type='branch', single round)"
  - "DECIDE emit in the would-continue else branch"
  - "DECIDE consume at loop-top (short-circuit advance/finalize)"
affects: [lib/research/orchestrator.ts]
tech-stack:
  patterns:
    - "Phase 102 DESIGN emit/consume pattern (resolveXPosture/buildXCheckpoint + consumeAnswered one-shot)"
key-files:
  modified:
    - lib/research/orchestrator.ts
    - tests/unit/research/orchestrator.test.ts
decisions:
  - "DECIDE fires ONLY in the would-continue else branch (!term.done && branch !== 'finalize') — a terminal verdict is never delayed"
  - "DECIDE is NOT gated to iteration 1 (continuation steering); every_iteration does not apply"
  - "Loop-top consume short-circuits: continue/pivot/adjust-budget advance, stop finalizes — never re-runs the completed iteration"
  - "Stop → status 'exhausted' (a would-continue point is never a supported verdict); reads persisted iterDir/result.json (buildFinding accepts null)"
  - "DECIDE_BUDGET_BUMP = 2 (deterministic max-iteration extension for 'Adjust budget')"
  - "verdict math untouched: evaluateVerdict / committed contract pin / shouldTerminate / decideBranch byte-identical"
metrics:
  duration_minutes: 22
  completed: 2026-07-19
  tasks: 3
  files: 2
---

# Phase 103 Plan 03: DECIDE Branch Checkpoint Summary

Human-steered DECIDE checkpoint that fires ONLY on the would-continue path — a pure
continuation override (continue/pivot/stop/adjust-budget) that never delays a terminal verdict
and leaves the deterministic verdict math byte-identical (REQ-204).

## What was built

- **resolveDecidePosture** — mirrors resolveSeedPosture (R1: default-off, no unattended pause) but
  is NOT gated to iteration 1; `every_iteration` does not apply. `active = posture.active && decidePointEnabled`.
- **buildDecideCheckpoint** — `point:'decide'`, `type:'branch'`, single round; context is an evidence
  summary (verdict, `metricKey comparator target` vs measured value, `iteration N of maxIterations`,
  latest takeaway). One question `q1` with options Continue (recommended)/Pivot/Stop/Adjust budget.
- **DECIDE emit** — strictly additive in the would-continue else branch (after the untouched
  `if (term.done || branch === 'finalize')` finalize block). Pauses via emitCheckpoint; interactive-off
  falls straight through to the byte-identical `thread.iteration += 1`.
- **DECIDE consume** — at the TOP of the loop, BEFORE the DESIGN consume. A resumed decide answer
  short-circuits: Stop → finalize (exhausted, persisted result.json, reconstructability only when
  result+plan on disk, kg_write gate, finishKgSync); Continue/Pivot/Adjust-budget → advance and loop
  (Pivot sets pendingPivot; Adjust budget bumps maxIterations by DECIDE_BUDGET_BUMP). Unknown/absent
  label → Continue (never wedge). No-op when no resumed decide answer is present.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test interaction] Two Phase 102 DESIGN tests paused at the new DECIDE checkpoint**
- **Found during:** Task 3
- **Issue:** The Phase 102 DESIGN tests set `interactive: { enabled: true, design: true }` but left
  `decide` at its default (true). Their refuted-then-continue flow now legitimately pauses at the new
  DECIDE checkpoint, so `expect(pendingCheckpoint).toBeUndefined()` failed.
- **Fix:** Added `decide: false` to `writeInteractiveConfig` to isolate those tests to the DESIGN
  station (documented inline). This is a test-isolation fix — the production interaction is correct.
- **Files modified:** tests/unit/research/orchestrator.test.ts
- **Commit:** 7c264bf

## Experiment Results

### Parameters

| Parameter | Value |
|-----------|-------|
| verification_level | proxy (offline deterministic) |
| injected seams | runner, spawn, checkpointHandler (via emitCheckpoint default) |
| DECIDE_BUDGET_BUMP | 2 |

### Results

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| DECIDE tests pass | all new pass | 8/8 pass | PASS |
| orchestrator.ts suite | all green | 77/77 pass | PASS |
| verdict math untouched | diff-provable | evaluateVerdict/shouldTerminate/decideBranch call sites unchanged | PASS |
| default-config byte-identical | no decide emit | byte-identical test green | PASS |
| orchestrator.ts coverage | threshold holds/rises | 93.1% stmts / 79.8% branch (no per-file override; above global) | PASS |
| tsc --noEmit + eslint | clean | clean | PASS |

### Analysis

The eight DECIDE behaviors are proven offline: would-continue-only emission; terminal verdict
(supported and budget-exhausted) never delayed; continue/pivot/adjust-budget/stop routing;
byte-identical default; no double-ask; no re-run on stop. The verdict-math no-touch list is
diff-provable — only additive code was inserted around the existing finalize/increment sites.

## Self-Check: PASSED

- FOUND: lib/research/orchestrator.ts (resolveDecidePosture, buildDecideCheckpoint, DECIDE_BUDGET_BUMP)
- FOUND: tests/unit/research/orchestrator.test.ts (DECIDE branch checkpoint (Phase 103) block, 8 tests)
- FOUND commit ebbe5e2 (feat: emit + consume)
- FOUND commit 7c264bf (test)
