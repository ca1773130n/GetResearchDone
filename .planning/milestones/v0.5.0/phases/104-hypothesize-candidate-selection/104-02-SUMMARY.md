---
phase: 104-hypothesize-candidate-selection
plan: 02
subsystem: research/orchestrator
tags: [interactive-steering, checkpoints, hypothesize, selection, REQ-206]
requires:
  - "104-01: buildHypothesesPrompt (_prompts.ts) + parseHypothesesOutput (agent-io.ts)"
  - "checkpoints.ts: emitCheckpoint, consumeAnswered, makeCheckpointId, resolveInteractive, readInteractiveConfig"
provides:
  - "orchestrator.ts:resolveSelectPosture"
  - "orchestrator.ts:buildSelectCheckpoint"
  - "HYPOTHESIZE selection emit (pre-appendHypothesis) + consume (append-one) wiring"
affects:
  - "lib/research/orchestrator.ts"
tech-stack:
  added: []
  patterns:
    - "resolve*Posture + build*Checkpoint + emitCheckpoint + consumeAnswered (Phase 102/103 mirror)"
    - "checkpoint context as a lossless JSON store for unchosen candidates (never the ledger)"
key-files:
  created: []
  modified:
    - "lib/research/orchestrator.ts"
    - "tests/unit/research/orchestrator.test.ts"
decisions:
  - "Selection checkpoint persists the full candidate set in the checkpoint `context` (JSON); only the chosen candidate is appended on resume — zero ledger pollution (REQ-206/SC2)."
  - "Emit lives in the cold-HYPOTHESIZE else-branch; consume is scoped to the TOP of that same branch (not loop-top like DECIDE) because a selection resume never appended a hypothesis, so `resumable` is undefined and the if/else naturally lands in the cold else."
  - "0 candidates DEGRADE to the byte-identical single-block path (empty candidates treated as a parse-miss so spawnAndParse retries first); 1 candidate appends directly with no pointless 1-option pause."
  - "resolveSelectPosture honors every_iteration (else iteration-1-only), mirroring DESIGN; gate = cfg.hypothesize with opts.interactive.points override."
  - "Test-isolation fix: the Phase 103 SEED suite config now sets hypothesize:false (selection is default-on when interactive.enabled, matching the existing decide:false isolation pattern)."
metrics:
  duration: "~35m"
  completed: "2026-07-19"
  tasks: 3
  files: 2
  tests_added: 10
  research_suite: "622 passing"
---

# Phase 104 Plan 02: HYPOTHESIZE Candidate Selection Summary

Wired the pre-ledger HYPOTHESIZE selection checkpoint: with `interactive.hypothesize` active and >=2 parsed candidates, the loop emits a `point='hypothesize' type='selection'` checkpoint and pauses STRICTLY BEFORE `appendHypothesis`, then on resume appends ONLY the chosen candidate — a freeform "Other" becomes a user-authored hypothesis. The default (gate-off / N=1 / 0-candidate) and seeded/execute-resume/crash-recovery paths are unchanged.

## What Was Built

- **`resolveSelectPosture(cwd, opts, config, thread)`** — default-off posture mirroring `resolveDesignPosture`; active = interactive posture ∧ `cfg.hypothesize` (or `opts.interactive.points` override) ∧ (`every_iteration` ∨ iteration 1).
- **`buildSelectCheckpoint(thread, candidates, round)`** — `checkpoint_version:1`, id `ck-{iter}-hypothesize-r{round}`, one question, one option per candidate (rank-1 recommended), `freeform:true`; the FULL `{statement,rationale,predictedOutcome}` set is stored in `context` (JSON) as a lossless resume store (`renderCheckpointQuestions` never renders context).
- **Selection emit** in the cold-HYPOTHESIZE else-branch, after grounding `pack`: multi-candidate spawn (`buildHypothesesPrompt` + `parseHypothesesOutput`); >=2 candidates → emit + pause before any ledger write; 1 → direct append; 0 → degrade to the untouched single-block path.
- **Selection consume** at the TOP of the cold else-branch: reconstruct the chosen candidate from the checkpoint `context` (matched label → full fields; freeform text → user-authored statement + `'user-provided at checkpoint'`; label-only fallback), append the ONE hypothesis, fall through to DESIGN.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Test isolation] Phase 103 SEED suite leaked into the new selection station**
- **Found during:** Task 3 (running the full suite)
- **Issue:** `writeSeedConfig` left `hypothesize` defaulted-on, so a SEED resume at iteration 1 now legitimately fires the multi-candidate hypothesizer and inflated the cold-HYPOTHESIZE spawn count (`hypoCalls` 1 → 4).
- **Fix:** Added `hypothesize:false` to the SEED suite config — the same isolation pattern that suite already uses for `design:false`.
- **Files modified:** tests/unit/research/orchestrator.test.ts
- **Commit:** 7231a04

**2. [Rule 1 — Pre-existing ledger quirk, worked around] empty field does not round-trip**
- The freeform path sets `predictedOutcome=''`; `ledger.ts`'s field regex does not round-trip an empty value (an existing serialization limitation, out of scope for this plan). The FREEFORM test asserts `statement` + `rationale` (the load-bearing guarantees) and does not assert the empty `predictedOutcome`.

## Experiment Results

### Parameters

| Parameter | Value |
|-----------|-------|
| hypothesis_candidates | 3 (config-clamped [1,5]) |
| verification_level | proxy |
| spawn_retries | 2 (default) |

### Results

| Metric | Baseline | Target | Achieved | Status |
|--------|----------|--------|----------|--------|
| new selection tests | n/a | all pass | 10/10 | PASS |
| research suite | 612 (pre-104-02) | green | 622 | PASS |
| tsc --noEmit | clean | clean | clean | PASS |
| eslint bin/ lib/ | clean | clean | clean | PASS |

### Analysis

Every must-have proven offline with injected spawn/runner and the default pausing checkpoint handler + `resumeResearch(--answers)` flow (the Phase 102/103 precedent): pre-ledger pause with an empty ledger, matched append-one, freeform user-authored statement, byte-identical default, zero-candidate degrade, single-candidate direct-append, all three SC4 skip paths, and no double-ask. The deterministic verdict path (`evaluateVerdict`, committed-contract pin, `shouldTerminate`, `decideBranch`) is untouched.

### Artifacts

- `lib/research/orchestrator.ts` (resolveSelectPosture, buildSelectCheckpoint, emit + consume)
- `tests/unit/research/orchestrator.test.ts` (`describe('HYPOTHESIZE candidate selection (Phase 104)')`, 10 tests)

## Self-Check: PASSED

- FOUND: lib/research/orchestrator.ts (resolveSelectPosture, buildSelectCheckpoint present)
- FOUND: tests/unit/research/orchestrator.test.ts (Phase 104 describe block)
- FOUND commit 4cf443f (feat), 7231a04 (test)
- research suite 622 passing; tsc + `npm run lint` clean
