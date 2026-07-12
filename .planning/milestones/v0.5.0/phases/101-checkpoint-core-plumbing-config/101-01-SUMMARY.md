---
phase: 101-checkpoint-core-plumbing-config
plan: 01
subsystem: research/checkpoints
tags: [types, checkpoint, back-compat, fixtures]
requires: []
provides:
  - "lib/research/types.ts:Checkpoint"
  - "lib/research/types.ts:CheckpointPoint"
  - "lib/research/types.ts:InteractiveConfig"
  - "lib/research/types.ts:ResearchThread.pendingCheckpoint"
affects:
  - lib/research/thread.ts
tech-stack:
  added: []
  patterns:
    - "Additive OPTIONAL fields for schema back-compat (no union widening)"
    - "Conditional-spread guarded render line in renderThreadLog"
key-files:
  created:
    - tests/fixtures/research-threads/paused-execute-0416/thread.json
    - tests/fixtures/research-threads/terminal-supported-0416/thread.json
  modified:
    - lib/research/types.ts
    - lib/research/thread.ts
    - tests/unit/research/types.test.ts
    - tests/unit/research/thread.test.ts
decisions:
  - "Checkpoint co-located in lib/research/types.ts (overrides REQ-194 loose lib/types.ts) because ResearchThread.pendingCheckpoint references it"
  - "Fixtures hand-authored (FALLBACK path) — cross-checked field-for-field vs git 3c179fe createThread; 0.4.16 ResearchThread shape is byte-identical to current"
  - "pendingGate union + ThreadStatus + ThreadGates left untouched to preserve TERMINAL mirrors in portfolio.ts:74 / paper.ts:15 (PITFALLS R3.2/R3.3)"
metrics:
  duration_min: 3
  tasks: 3
  files: 6
  completed: 2026-07-12
---

# Phase 101 Plan 01: Checkpoint Core Types + Back-Compat Foundation Summary

Added the typed Checkpoint schema family and three additive OPTIONAL ResearchThread fields to `lib/research/types.ts`, a guarded checkpoint line in `renderThreadLog`, and two frozen 0.4.16 thread fixtures that prove pre-0.5.0 threads load and re-serialize byte-identically — ships STANDALONE with ZERO emission call sites and zero behavior change under default config.

## What Was Built

- **Checkpoint type family** (`lib/research/types.ts`): `CheckpointPoint`, `CheckpointType`, `CheckpointAnsweredBy`, `CheckpointOption`, `CheckpointQuestion`, `CheckpointAnswer`, `Checkpoint` (`checkpoint_version:1`, id format `ck-<iteration>-<point>-r<round>`), and `InteractiveConfig` (resolved `research_gates.interactive` shape).
- **ResearchThread** gained exactly three OPTIONAL fields: `pendingCheckpoint?: Checkpoint | null`, `refinedQuestion?: string`, `checkpointRounds?: Partial<Record<CheckpointPoint, number>>`. `pendingGate` union, `ThreadStatus`, `ThreadGates`, and `defaultGates()` are UNCHANGED.
- **renderThreadLog** (`lib/research/thread.ts`): guarded `- **pending checkpoint:** <point> (<n> questions)` line, conditional-spread style, placed after the pending-gate line. Byte-identical output when absent.
- **Two frozen 0.4.16 fixtures** + back-compat round-trip test (`JSON.stringify(thread, null, 2)` equals raw fixture bytes).

## Deviations from Plan

None — plan executed exactly as written.

## Fixture Provenance (CONTEXT-required disclosure)

Fixtures were produced via the **FALLBACK hand-authoring path**, not a live 0.4.16 `gd research` run (real backends / an isolated 0.4.16 checkout were not exercised for deterministic type-plumbing). Per CONTEXT and the plan's fallback clause, the field list was cross-checked field-for-field against the ACTUAL source at tag `3c179fe` via `git show 3c179fe:lib/research/thread.ts` (createThread) and `git show 3c179fe:lib/research/types.ts` (ResearchThread) — the 0.4.16 shape is byte-identical to the current shape (createThread insertion order: id, question, status, iteration, maxIterations, baseMaxIterations, gates{execute,kg_write}, budgetUsed, modelProfile, tokenProfile, currentStation, pendingGate, createdAt; `seededFrom` omitted when undefined). Each fixture was serialized with the exact `saveThread` call `JSON.stringify(thread, null, 2)` (no trailing newline) to guarantee the byte-identical round-trip. Checker note acknowledged: a hand-authored fixture is not a real generated thread, but for the back-compat property (proving NO new REQUIRED field exists) it is equivalent — the round-trip assertion is the proof.

## Verification

- Level 1 (Sanity): `npx tsc --noEmit` → exit 0. `npx jest tests/unit/research/types.test.ts tests/unit/research/thread.test.ts` → 14 passed. Byte-identical fixture round-trip assertion passes for both fixtures.
- Level 2/3: n/a this plan (deferred to 101-04 full-loop resume).

## Commits

- `25cc12c` feat(101-01): add Checkpoint type family + optional ResearchThread fields
- `b715676` feat(101-01): guarded pending-checkpoint line in renderThreadLog
- `a4ea084` test(101-01): freeze 0.4.16 thread fixtures + back-compat round-trip

## Self-Check: PASSED

All 5 claimed files exist; all 3 commits present in history.
