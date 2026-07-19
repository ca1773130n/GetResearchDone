---
phase: 105-ai-panel-fallback-hardening
plan: 03
subsystem: research/verification
tags: [milestone-verification, checkpoints, back-compat, offline-test, REQ-209]
requires:
  - "lib/research/checkpoints.ts resolveInteractive/consumeAnswered/answerViaDiscussion"
  - "lib/research/orchestrator.ts runLoop (design checkpoint emit/consume, debug-loop pin)"
  - "tests/fixtures/research-threads/*-0416 (Phase 101 frozen back-compat fixtures)"
provides:
  - "tests/unit/research/milestone-verification.test.ts (offline R1/R3/R4/R5 proof suite)"
affects: []
tech-stack:
  added: []
  patterns:
    - "injected checkpointHandler/spawn/runner drive runLoop offline (no live backend)"
    - "coverage-guard test reads jest.config.js thresholds against an in-suite baseline snapshot"
key-files:
  created:
    - tests/unit/research/milestone-verification.test.ts
    - .planning/experiments/105-03-experiment.yaml
  modified: []
decisions:
  - "R1 proven via resolveInteractive posture map (5 unattended sites → active:false) rather than spawning each caller — the caller-audit (Phase 101) already froze the 5-site set; this suite proves the posture lock, incl. the fallback:'panel' inline-resolve variant"
  - "R3 proven two ways: loadThread round-trip JSON.stringify equality (no checkpoint field pollution) + terminal resume byte-identical thread.json on disk with no checkpoints.jsonl"
  - "R4/R5 reuse the Phase 102 end-to-end DESIGN-checkpoint drive (runResearch pause → resumeResearch with checkpointAnswers incl. Q2 freeform edit) — proving the seam, not re-testing internals"
  - "Coverage guard is an in-suite BASELINE snapshot of checkpoints/portfolio/discussion thresholds asserted >= (fails on any lowering); git diff --stat jest.config.js is the supporting evidence"
metrics:
  duration_min: 12
  completed: 2026-07-19
  tasks: 2
  files: 2
---

# Phase 105 Plan 03: v0.5.0 Milestone Verification Suite Summary

Authored `tests/unit/research/milestone-verification.test.ts` — one offline,
deterministic suite (8 tests) proving the four cross-phase proof obligations
(R1/R3/R4/R5, REQ-209) hold now that all checkpoint machinery (Phases 101–104)
plus the panel fallback (105-01/02) are in place, without lowering any per-file
jest coverage threshold.

## What was built

- **R1 (no unattended pause):** enumerates the 5 unattended entry points
  (bench `--no-gates`, portfolio `concurrency>1`, harness `autonomousMode`,
  autopilot `GRD_AUTOPILOT` env, cli-kb `nonInteractive`) and asserts each
  resolves `resolveInteractive(cfg, opts).active === false` even with the
  interactive gate config explicitly ON; only the attended single-thread path
  stays active. A `fallback:'panel'` variant confirms the panel route is also
  non-pausing — `answerViaDiscussion` with an empty synthesis degrades inline to
  recommended defaults (never pauses/throws).
- **R3 (pre-0.5.0 back-compat):** a frozen 0.4.16 thread carries no
  `pendingCheckpoint`/`checkpointRounds` fields, `loadThread` round-trips it
  bit-identically (`JSON.stringify` equality), and resuming a terminal 0.4.16
  thread leaves `thread.json` byte-identical on disk with no `checkpoints.jsonl`.
- **R4 (contract edit survives debug pin):** end-to-end DESIGN checkpoint — a
  freeform Q2 edit (`target: 0.9`) applied on resume becomes the committed
  `plan.json` pin; a debug re-plan proposing the model's original `0.8` is
  overwritten back to `0.9` and the drift recorded (`contractDrift.target =
  {proposed:0.8, pinned:0.9}`).
- **R5 (no double-ask):** `consumeAnswered` returns the answers exactly once then
  `null` (WeakSet one-shot, point+iteration matched); end-to-end an approve resume
  RUNs to a verdict with `checkpoints.jsonl` length 1 — no second design
  checkpoint emitted.
- **Coverage guard:** in-suite baseline snapshot of `checkpoints.ts`,
  `portfolio.ts`, `discussion.ts` thresholds asserted `>=` pre-milestone values;
  fails on any lowering.

## Deviations from Plan

None — plan executed as written. The whole suite is a single artifact
(`milestone-verification.test.ts`), so Task 1 (R1/R3) and Task 2 (R4/R5 +
coverage guard) landed in one atomic `test(105-03)` commit.

## Experiment Results

### Parameters

| Parameter | Value |
|-----------|-------|
| obligations | R1, R3, R4, R5 |
| interactive_config | design=true, decide=false, max_rounds=2 |
| debug_depth (R4) | 1 |
| contract_edit (R4) | target 0.8 → 0.9 |

### Results

| Metric | Baseline | Target | Achieved | Status |
|--------|----------|--------|----------|--------|
| milestone-verification suite pass | — | R1/R3/R4/R5 green | 8/8 | PASS |
| full research suite | 644 | green | 652/652 | PASS |
| jest threshold reductions | 0 | 0 | 0 | PASS |

### Analysis

All four obligations pass in a single offline suite driven by injected
`checkpointHandler`/`spawn`/`runner` — no live backend, deterministic. The +8
tests raise the research suite from 644 → 652 with zero regressions. `git diff
--stat jest.config.js` is empty (no threshold touched anywhere in this milestone).

### Artifacts

- Suite: `tests/unit/research/milestone-verification.test.ts`
- Experiment log: `.planning/experiments/105-03-experiment.yaml`

## Verification

- Level 1 (Sanity): `tsc --noEmit` clean, lint clean, `git diff --stat
  jest.config.js` empty (thresholds unchanged).
- Level 2 (Proxy): milestone suite R1/R3/R4/R5 all green; full research suite
  652/652 green.
- Level 3 (Deferred): live end-to-end steered run → 105-04 sandbox (qualitative).

## Self-Check: PASSED

- FOUND: tests/unit/research/milestone-verification.test.ts
- FOUND: .planning/experiments/105-03-experiment.yaml
- FOUND: commit 68b4aa9
- FOUND: jest.config.js unchanged
