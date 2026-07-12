---
phase: 101
wave: all
plans_reviewed: [101-01, 101-02, 101-03, 101-04]
timestamp: 2026-07-12T00:00:00Z
blockers: 0
warnings: 1
info: 4
verdict: warnings_only
---

# Code Review: Phase 101 — Checkpoint Core Plumbing + Config (all plans)

## Verdict: WARNINGS ONLY

All four plans executed faithfully against REQ-194..198 and the locked CONTEXT decisions; every locked constraint was verified in code. One warning: the R7 settings round-trip fix (cmdConfigYolo) is not yet wired into the settings.md skill, so the live save/restore path is protected only once the skill adopts it.

## Stage 1: Spec Compliance

### Plan Alignment
All 11 implementation commits present (25cc12c..d2a023c); every plan task maps to a commit; SUMMARY key-files match `git diff --name-only 25cc12c^..d2a023c` exactly (plus expected .planning docs). No issues found.

### Locked Decision Compliance (101-CONTEXT.md)
- **Zero emission call sites in orchestrator.ts** — VERIFIED. Only a type-only `import type { Checkpoint, CheckpointAnswer }`, the resume branch (`require('./checkpoints')` at :681, inside `if (thread.pendingCheckpoint)`), and the dormant `_resumedCheckpoint` runLoop param (:406, commented as Phase 102). No `emitCheckpoint` reference anywhere in orchestrator.ts.
- **Interactive gates default OFF** — VERIFIED. `defaultInteractive()` returns `enabled:false`; absent config key → defaults; `resolveInteractive` disables under all five unattended postures (noGates/autonomousMode/autopilot/GRD_AUTOPILOT/concurrency>1/nonInteractive), test-proven with config forced ON.
- **Optional-only ResearchThread fields; unions NOT widened** — VERIFIED. types.ts:103-105 adds exactly `pendingCheckpoint?`, `refinedQuestion?`, `checkpointRounds?`; `pendingGate: 'execute'|'kg_write'|null` (:95), ThreadStatus (:3-4), and ThreadGates (:16) unchanged.
- **Answers via file/stdin only, never argv** — VERIFIED. grd-tools.ts:2268-2278 reads `--answers <file|->` via `fs.readFileSync(src)` / `fs.readFileSync(0)`; malformed → undefined → recommended defaults. Start-path question filter skips the `--answers` value (:2333).
- **Warn+clamp config validation** — VERIFIED. `readInteractiveConfig` clamps hypothesis_candidates to [1,5], defaults max_rounds/max_questions <1 or non-number, defaults unknown fallback enum, one stderr warning per key naming the key.
- **No wall-clock timers** — VERIFIED. No setTimeout/setInterval in checkpoints.ts; bare resume resolves to recommended defaults (`answeredBy:'default'`) as the deterministic timeout.

### Research Methodology / Known Pitfalls
R1 (single-source all-off gates + bench pin + caller-audit), R3 (frozen fixtures, closed unions, TERMINAL mirrors preserved), R7 (round-trip preservation), R8 (file/stdin only), R9 (all logic in TS, unit-covered) all addressed per PITFALLS references in the plans.

### Eval Coverage
101-EVAL.md commands (S1-S5) all runnable and re-executed during review: `tsc --noEmit` exit 0; eslint clean on all changed lib files; 59 tests green (types/thread/checkpoints/gates/config); 108 tests green (orchestrator/cli/bench); jest per-file threshold `'./lib/research/checkpoints.ts': {lines:90, functions:100, branches:80}` present, no existing threshold lowered.

## Stage 2: Code Quality

### Architecture
Consistent: 'use strict' first line, CommonJS module.exports, typed requires, `import type` only for types, zero `any` (one `as unknown as ThreadGates` cast in gates.ts noGates path — justified, Object.fromEntries loses the key type). DI seams (EmitDeps, injectable env accessor) mirror the spawn/runner convention. checkpoints.js proxy matches lib/got.js shape.

### Reproducibility
N/A — no experimental code. Deterministic-defaults resolution (no timers) is itself the reproducibility property, and it is test-proven.

### Documentation
Good: inline comments cite R1/R3/R8 pitfalls, Phase 102 handoff points, and the locked hybrid-churn rationale at the dormant param.

### Deviation Documentation
All four SUMMARYs match git history. Deviations disclosed: fixture fallback path (101-01), got.js proxy shape (101-02), cmdConfigYolo mechanism (101-03), test-expectation refinements (101-04).

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 1 | R7 round-trip (101-03 T3) | `cmdConfigYolo`/`yoloEnable`/`yoloDisable` exist and are tested, but settings.md skill still drives save/restore via `config-set` and is unchanged — the LIVE YOLO toggle path can still drop `research_gates.interactive` until the skill adopts `cmdConfigYolo`. Mechanism was Claude's Discretion and the gap is disclosed in 101-03-SUMMARY, but the R7 protection is not end-to-end yet. |
| 2 | INFO | 1 | Fixtures (101-01) | 0.4.16 fixtures produced via the plan's sanctioned FALLBACK (hand-authored, cross-checked against `git show 3c179fe:lib/research/thread.ts`), disclosed as required. Byte-identical round-trip test passes; acceptable for the back-compat property. |
| 3 | INFO | 2 | resolveInteractive | `Boolean(env.GRD_AUTOPILOT)` treats `GRD_AUTOPILOT="0"` as set (disables interactive). Fails safe (more disabling, never less); document the "presence = on" semantics when Phase 102 formalizes the env contract. |
| 4 | INFO | 1 | R3 test (101-04) | paused-execute-0416 fixture reaches the kg_write gate under the mock runner, so the assertion was relaxed to "any gate pause + no checkpoints.jsonl". Documented; the back-compat property (never enters the checkpoint branch) still holds. |
| 5 | INFO | 2 | consumeAnswered | WeakSet one-shot is per-object-identity, process-local — correct for the single-process runLoop handoff; note for Phase 102 that a re-loaded thread produces a fresh object (fresh one-shot), which is the intended resume semantics. |

## Recommendations

1. **WARNING #1:** In Phase 102 (or a quick task), wire settings.md's YOLO toggle to `gd config yolo on|off` (cmdConfigYolo) so the tested round-trip is the live path; until then a skill-driven `config-set research_gates {...}` can still lose the nested interactive object.
2. **INFO #3:** When Phase 102 introduces real GRD_AUTOPILOT emitters, document presence-based semantics (or normalize `'0'`/`''` → unset) in one place.
