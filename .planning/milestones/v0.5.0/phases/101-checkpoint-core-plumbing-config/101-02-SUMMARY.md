---
phase: 101-checkpoint-core-plumbing-config
plan: 02
subsystem: research/checkpoints
tags: [interactive-steering, checkpoints, config-validation, tdd]
requires:
  - "lib/research/types.ts:Checkpoint,InteractiveConfig,ResearchThread (101-01)"
  - "lib/research/thread.ts:threadDir,saveThread"
  - "lib/metrics.ts:incrementCounter"
provides:
  - "lib/research/checkpoints.ts:emitCheckpoint"
  - "lib/research/checkpoints.ts:resolveCheckpoint"
  - "lib/research/checkpoints.ts:consumeAnswered"
  - "lib/research/checkpoints.ts:appendCheckpointRecord"
  - "lib/research/checkpoints.ts:readCheckpointLog"
  - "lib/research/checkpoints.ts:readInteractiveConfig"
  - "lib/research/checkpoints.ts:resolveInteractive"
  - "lib/research/checkpoints.ts:validateCheckpoint"
  - "lib/research/checkpoints.ts:makeCheckpointId"
affects:
  - "Phase 102 (DESIGN approval) will wire emitCheckpoint into runLoop"
tech-stack:
  added: []
  patterns:
    - "DI seam via deps object (checkpointHandler/saveThread/incrementCounter) mirroring spawn/runner injection"
    - "injectable env accessor (opts.env ?? process.env) for the NEW GRD_AUTOPILOT contract"
    - "append-only .jsonl audit IO mirroring ledger"
    - "WeakSet-backed one-shot consumption (approved.execute analog)"
key-files:
  created:
    - "lib/research/checkpoints.ts"
    - "lib/research/checkpoints.js"
    - "tests/unit/research/checkpoints.test.ts"
  modified:
    - "jest.config.js"
decisions:
  - "checkpoints.ts is standalone — ZERO import into orchestrator.ts this phase (locked hybrid-churn / R1)"
  - "consumeAnswered one-shot uses a module-level WeakSet (no _consumed field polluting the Checkpoint type)"
  - "resolveInteractive reads GRD_AUTOPILOT via opts.env ?? process.env; opts.autonomousMode carries config.autonomous_mode (pure fn, no config IO)"
  - "hypothesis_candidates clamps to [1,5]; max_rounds/max_questions <1 or non-number → field default; each coercion emits ONE stderr warning naming the key"
  - "jest per-file threshold 90/100/80 (lines/functions/branches); actual 98.36/100/86.4; no existing threshold lowered"
metrics:
  duration_min: 12
  tasks: 2
  files_changed: 4
  tests_added: 32
  completed: 2026-07-12
---

# Phase 101 Plan 02: Checkpoint Core Plumbing + Config Summary

Standalone `lib/research/checkpoints.ts` — emit/resolve/consumeAnswered, append-only `checkpoints.jsonl` audit IO, `readInteractiveConfig` warn+clamp matrix, and the `resolveInteractive` auto-skip matrix — fully unit-tested (32 tests) via injected deps with zero import into orchestrator.ts.

## What Was Built

- **`emitCheckpoint(cwd, thread, ck, deps?)`** — validates (`validateCheckpoint`: ≤4 questions, exactly one recommended option each). Invalid → ONE `console.warn` + resolve-to-recommended-defaults (never throws, never pauses). Valid → injected `checkpointHandler`, default of which pauses the thread (`pendingCheckpoint=ck`, `status='paused'`, `saveThread`, `incrementCounter('research.checkpoint_pauses_total')`).
- **`resolveCheckpoint(cwd, thread, ck, answers)`** — merges provided answers, fills gaps with each question's recommended option (`answeredBy:'default'` — the timeout path), stamps `resolvedAt`, appends to `checkpoints.jsonl`, clears `pendingCheckpoint`.
- **`consumeAnswered(ck, point, iteration)`** — one-shot (WeakSet); returns stored answers on point+iteration match, `null` on repeat/mismatch/absent.
- **`appendCheckpointRecord` / `readCheckpointLog`** — append-only JSONL IO mirroring ledger; missing log → `[]`.
- **`readInteractiveConfig(cwd)`** — raw JSON read (loadConfig drops unknown keys); absent → full defaults with `enabled:false`; per-field warn+clamp.
- **`resolveInteractive(cfg, opts)`** — pure; `{active:false}` under noGates | autonomousMode | autopilot | GRD_AUTOPILOT env | concurrency>1 | nonInteractive; else `{active: cfg.enabled}`.
- **`lib/research/checkpoints.js`** tsx-loader proxy + jest per-file threshold entry.

## Deviations from Plan

None — plan executed as written. The plan asked to mirror an existing `lib/research/*.js` proxy; none existed, so the top-level `lib/got.js` proxy shape (`require('tsx/cjs'); module.exports = require('./checkpoints.ts')`) was used instead — functionally identical.

## Verification Results

- **Level 1 (Sanity):** `checkpoints.test.ts` 32/32 green under coverage; new threshold 90/100/80 met (actual lines 98.36 / functions 100 / branches 86.4); `tsc --noEmit` clean; eslint clean; no existing threshold lowered.
- **Level 2 (Proxy):** `resolveInteractive` returns `{active:false}` for all five unattended conditions (R1 safety core), with BOTH `opts.autopilot:true` and injected `GRD_AUTOPILOT=1` branches tested explicitly.
- **Level 3 (Deferred):** live emission through runLoop — Phase 102.
- **R1 lock confirmed:** `grep -c checkpoints lib/research/orchestrator.ts` → 0.

## Commits

- `2aeba05` test(101-02): add failing checkpoints spec
- `b51e333` feat(101-02): standalone checkpoints.ts core plumbing + config

## Self-Check: PASSED

- FOUND: lib/research/checkpoints.ts, lib/research/checkpoints.js, tests/unit/research/checkpoints.test.ts
- FOUND commits: 2aeba05, b51e333
- Zero orchestrator.ts import verified (R1)
