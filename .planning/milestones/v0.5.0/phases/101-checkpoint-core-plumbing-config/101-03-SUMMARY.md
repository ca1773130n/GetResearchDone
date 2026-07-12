---
phase: 101-checkpoint-core-plumbing-config
plan: 03
subsystem: research-gates-safety
tags: [gates, bench, config, r1, r7, default-off]
requires: [defaultGates from lib/research/types.ts]
provides:
  - "resolveGates single-source all-off (lib/research/gates.ts)"
  - "BENCH_WORKDIR_CONFIG.research_gates.interactive pin (lib/research/bench.ts)"
  - "yoloEnable/yoloDisable/cmdConfigYolo unknown-key-preserving round-trip (lib/commands/config.ts)"
affects: [bench, portfolio, harness, autopilot, settings yolo toggle]
tech_stack:
  patterns: [single-source-of-truth gate defaults, recursive boolean-flag disable, verbatim snapshot/restore]
key_files:
  created:
    - tests/unit/commands/config.test.ts
  modified:
    - lib/research/gates.ts
    - lib/research/bench.ts
    - lib/commands/config.ts
    - tests/unit/research/gates.test.ts
    - tests/unit/research/bench.test.ts
decisions:
  - "resolveGates(noGates) derives all-false from Object.keys(defaultGates()) — no hardcoded literal, so a future gate cannot be forgotten (R1)"
  - "disableBooleanFlags recurses into nested gate objects (forces interactive.enabled off in live YOLO state) while _saved_* holds the original verbatim for restore"
  - "cmdConfigYolo added as the real persisting round-trip path; unknown research_gates keys preserved via spread of the raw parsed object (R7)"
metrics:
  tasks: 3
  duration: ~20m
  completed: 2026-07-12
---

# Phase 101 Plan 03: Default-OFF Gate Safety (R1 + R7) Summary

resolveGates' no-gates path now zeroes every gate from the single `defaultGates()` source, `BENCH_WORKDIR_CONFIG` pins `research_gates.interactive` off belt-and-braces, and the YOLO settings save/restore path preserves unknown nested `research_gates` keys — closing R1 (no future gate can silently default-on for an unattended caller) and R7 (settings round-trips unknown gate keys). Zero behavior change under default config.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | resolveGates single-source all-off refactor | d155baa | lib/research/gates.ts, tests/unit/research/gates.test.ts |
| 2 | Pin research_gates.interactive off in BENCH_WORKDIR_CONFIG | a27e351 | lib/research/bench.ts, tests/unit/research/bench.test.ts |
| 3 | Preserve unknown research_gates keys through settings round-trip | 42b218f | lib/commands/config.ts, tests/unit/commands/config.test.ts |

## Key Changes

- **gates.ts:** `resolveGates(_, true)` now returns `Object.fromEntries(Object.keys(defaultGates()).map(k => [k, false]))` instead of the hardcoded `{execute:false,kg_write:false}` literal. Default-config path unchanged (`experiment_execution!==false`, `kg_write!==false`). Exported `resolveGates`/`checkGate` signatures untouched (back-compatible).
- **bench.ts:** `BENCH_WORKDIR_CONFIG.research_gates` extended to `{ experiment_execution:false, kg_write:false, interactive:{enabled:false} }`; comment updated to note the interactive pin.
- **config.ts:** Added pure helpers `yoloEnable`/`yoloDisable`/`disableBooleanFlags` and the persisting `cmdConfigYolo(cwd, mode)` command. Snapshot spreads the raw parsed `research_gates` into `_saved_research_gates` verbatim; restore reads it back verbatim, so a nested `interactive` object survives an on→off round-trip. `disableBooleanFlags` recurses so live YOLO state forces all gate booleans off while preserving structure/unknown keys.

## Deviations from Plan

None for Tasks 1–2. Task 3: the plan noted the `_saved_research_gates` mechanism lives in the settings.md skill (which drives it via `config-set`). Rather than only widening a typed narrow, I added a dedicated `cmdConfigYolo` TS command plus pure helpers to config.ts — a real, tested persisting round-trip path the skill can adopt — since no single TS save/restore function existed to widen. Mechanism was Claude's Discretion per the plan. Skill wireup to `cmdConfigYolo` is out of this plan's `files_modified` scope (settings.md unchanged).

## Verification

- `npx jest tests/unit/research/gates.test.ts` — 7 passed (single-source all-off proof + unchanged-default assertions).
- `npx jest tests/unit/research/bench.test.ts` — 46 passed (interactive pin + frozen config).
- `npx jest tests/unit/commands/config.test.ts` — 6 passed (nested interactive preserved across on→off through config.json).
- `npm run build:check` clean; `npm run lint` clean.
- No existing per-file threshold lowered.

## Self-Check: PASSED

- Files: all 6 present (5 modified + 1 created).
- Commits: d155baa, a27e351, 42b218f all in `git log`.
