---
phase: 96-closed-loop-metric-driven-refinement
plan: 03
subsystem: autopilot
tags: [refinement, closed-loop, metrics, autopilot, nerfify, config, tests]

# Dependency graph
requires:
  - phase: 96-01
    provides: "lib/refinement.ts — collectMetrics, detectMinima, checkConvergence, classifyBranch, buildCritiquePrompt"
  - phase: 96-02
    provides: "agents/grd-critique-agent.md, runRefinementLoop, buildCritiqueAgentPrompt in lib/autopilot.ts"
provides:
  - "runRefinementLoop wired into autopilot execute-wave after knowledge mining, before post-phase pipeline"
  - "refinement_loop config flag in GrdConfig (lib/types.ts) and KNOWN_CONFIG_KEYS (lib/utils.ts)"
  - "11 new tests: 5 buildCritiquePrompt branch variants + 6 runRefinementLoop integration tests"
affects:
  - autopilot execute-wave pipeline
  - lib/types.ts GrdConfig
  - lib/utils.ts KNOWN_CONFIG_KEYS

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Config opt-in gate: refinement_loop !== true early-exit, same pattern as citation_gate"
    - "Non-blocking refinement after knowledge mining: await runRefinementLoop (never rejects)"
    - "Integration test pattern: real fs fixture + childProcess.spawn spy + EventEmitter mock children"

key-files:
  created: []
  modified:
    - lib/autopilot.ts
    - lib/types.ts
    - lib/utils.ts
    - tests/unit/autopilot.test.ts
    - tests/unit/refinement.test.ts

key-decisions:
  - "refinement_loop config flag is opt-in (default: false) — same pattern as citation_gate"
  - "Config check placed before agent existence check in runRefinementLoop — avoids fs.existsSync when not enabled"
  - "Integration tests use createMockChildWithCoverage helper that emits Jest-style coverage table line on stdout"

# Metrics
duration: 12min
completed: 2026-03-25
---

# Phase 96 Plan 03: Autopilot Wiring and Test Coverage Summary

**runRefinementLoop wired into autopilot execute-wave (after knowledge mining, before post-phase pipeline) with refinement_loop config opt-in and 11 new tests covering all specified paths.**

## Performance

- **Duration:** 12 min
- **Completed:** 2026-03-25
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Wired `runRefinementLoop` into `lib/autopilot.ts` execute-wave sequence — placed after `runKnowledgeMining`, before post-phase pipeline launch
- Added `refinement_loop?: boolean` to `GrdConfig` in `lib/types.ts` with doc comment
- Added `'refinement_loop'` to `KNOWN_CONFIG_KEYS` in `lib/utils.ts` and parse rule in `loadConfig` (default: false)
- Added config opt-in early-exit in `runRefinementLoop`: skips when `loadConfig(cwd).refinement_loop !== true`
- Added 5 new `buildCritiquePrompt branch variants` tests in `tests/unit/refinement.test.ts` (41 total)
- Added 6 new `runRefinementLoop` integration tests in `tests/unit/autopilot.test.ts` (231 total)

## Task Commits

1. **Task 1: Wire runRefinementLoop and add config flag** — `cfe304d` (feat)
2. **Task 2: Add integration tests** — `ed58dba` (test)

## Files Modified

- `lib/autopilot.ts` — Added config opt-in early-exit in runRefinementLoop; wired call after knowledge mining
- `lib/types.ts` — Added `refinement_loop?: boolean` to GrdConfig
- `lib/utils.ts` — Added 'refinement_loop' to KNOWN_CONFIG_KEYS; added parse rule in loadConfig
- `tests/unit/refinement.test.ts` — 5 new branch variant tests (macro/geometry/generative/empty/multi-regions)
- `tests/unit/autopilot.test.ts` — 6 new runRefinementLoop integration tests

## Decisions Made

- `refinement_loop` config flag is opt-in (default: false) — same pattern as `citation_gate`; users must explicitly enable
- Config check placed before agent existence check in `runRefinementLoop` — cleaner early-exit order (avoid fs.existsSync when disabled)
- Integration tests use real filesystem fixture + `childProcess.spawn` spy with `createMockChildWithCoverage` EventEmitter helper

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run build:check` — passes (no type errors)
- `npm run lint` — passes (no lint violations)
- `grep -n "runRefinementLoop" lib/autopilot.ts` — shows definition (line 620), wiring (line 1797-1798), export (line 2388)
- `npx jest tests/unit/refinement.test.ts tests/unit/autopilot.test.ts` — 272 tests, all passing
- Pre-existing failures in `agent-audit.test.ts` (count=21 not 20) and `worktree-parallel-e2e.test.ts` confirmed pre-existing (present before this plan's changes)

## Self-Check: PASSED

- lib/autopilot.ts: FOUND — runRefinementLoop wired at line 1797
- lib/types.ts: FOUND — refinement_loop added
- lib/utils.ts: FOUND — KNOWN_CONFIG_KEYS + loadConfig updated
- tests/unit/refinement.test.ts: FOUND — 41 tests passing
- tests/unit/autopilot.test.ts: FOUND — 231 tests passing
- commit cfe304d (wiring + config): FOUND
- commit ed58dba (tests): FOUND

---
*Phase: 96-closed-loop-metric-driven-refinement*
*Completed: 2026-03-25*
