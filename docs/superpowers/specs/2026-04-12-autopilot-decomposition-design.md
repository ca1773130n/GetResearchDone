---
spec: autopilot decomposition (post-gsd-2 milestone follow-up)
status: approved
date: 2026-04-12
owner: cameleon-x
related: docs/architecture/RISKS.md O1
---

# Autopilot decomposition

## Context

`lib/autopilot.ts` is 2,702 lines with 34 top-level exports. Every spec in the gsd-2-selective-adoption milestone added code here (Spec 2A wait branch, Spec 2B idle watchdog, Spec 3 mechanical completion, Spec 3B LLM fallback, Spec 4 adaptive routing). The architecture audit (`docs/architecture/RISKS.md` finding O1) flagged it as the top extraction candidate but deferred it as too structural for a maintenance pass.

## Problem

A single 2,700-line module houses orchestration, pipeline execution, wave scheduling, file locking, merge queue management, multi-milestone iteration, and prompt construction. Effects:

- New features land here by default → growth accelerates
- Reading any one feature requires holding the whole file in mental working memory
- Test file mirrors the source: `tests/unit/autopilot.test.ts` is 4,000+ lines with 248 tests
- Refactor risk grows quadratically — touching one section risks accidentally breaking unrelated logic

## Goals

1. Split `lib/autopilot.ts` into 4 focused modules along the natural seams identified during the audit:
   - `lib/autopilot.ts` (orchestrator) — `runAutopilot`, `runMultiMilestoneAutopilot`, top-level CLI entry, scheduler creation, prompt builders shared across pipeline steps
   - `lib/autopilot-pipeline.ts` — `runPostPhasePipeline` + plan/execute/verify/post-pipeline step helpers + `phase-finalize` wire-up
   - `lib/autopilot-waves.ts` — wave-splitting algorithm + write-intent file lock + merge queue
   - `lib/autopilot-milestone.ts` — `_isAllPhasesComplete`, `resolveNextMilestone`, milestone-finalize logic, multi-milestone loop helpers
2. Preserve all existing behavior. Zero functional changes — pure restructure.
3. Preserve all existing tests. They should pass without modification (or only with import path updates).
4. Each new module is testable independently with its own per-file coverage threshold in `jest.config.js`.

## Non-goals

- Behavior changes of any kind. Pure restructure.
- Renaming exported symbols. Imports may move; names stay.
- Splitting the test file. `tests/unit/autopilot.test.ts` stays as the integration-style test surface (it tests the orchestrator, which now coordinates the 4 modules).
- Adding new tests for the new modules beyond what's needed to satisfy per-file coverage thresholds.
- Re-litigating any design decision from Spec 2A/2B/3/3B/4.
- Decomposing other large modules (`mcp-server.ts` at 3,292 lines is a separate spec).

## Architecture

### Module boundaries

Each module owns its function set and depends on the others through narrow, typed `require` interfaces — same pattern used elsewhere in the codebase.

**`lib/autopilot.ts` (orchestrator, ~600 lines after decomposition):**
- Public CLI entry: `cmdAutopilot(cwd, args, raw, scheduler?)`
- Top-level loops: `runAutopilot`, `runMultiMilestoneAutopilot`
- Scheduler + superpowers config loading
- Top-level result aggregation, status reporting, final logging
- Imports from the 3 helper modules

**`lib/autopilot-pipeline.ts` (~900 lines):**
- `runPostPhasePipeline(cwd, phaseNum, scheduler, ...)` — the per-phase plan → execute → verify → post-pipeline → phase-finalize sequence
- `_runPlanStep`, `_runExecuteStep`, `_runVerifyStep`, `_runPostPipelineStep` — the individual step helpers
- Status marker writes
- The Spec 3 phase-finalize call site (calling `completePhaseAfterPostPipeline`)
- Internal utilities for status capture and logging

**`lib/autopilot-waves.ts` (~600 lines):**
- `_splitIntoWaves(plans, maxConcurrent)` — wave-splitting algorithm
- `_acquireWriteIntent(planId, writeIntents, locks)` — file lock logic
- `_mergeQueue` — FIFO merge queue helpers
- Plan-level dependency analysis

**`lib/autopilot-milestone.ts` (~400 lines):**
- `_isAllPhasesComplete(cwd)` — milestone completion check
- `resolveNextMilestone(cwd)` — next milestone detection
- `_finalizeMilestone(cwd, ...)` — milestone-finalize side effects (archive, ROADMAP update)
- Helpers used by the multi-milestone loop

### Inter-module imports

```
autopilot.ts  ──→  autopilot-pipeline.ts
              ──→  autopilot-waves.ts (only via pipeline, not direct)
              ──→  autopilot-milestone.ts

autopilot-pipeline.ts  ──→  autopilot-waves.ts
                       ──→  phase-complete (existing)
                       ──→  scheduler (existing)
                       ──→  backend (existing)

autopilot-waves.ts     ──→  (no internal deps; pure-ish helpers)

autopilot-milestone.ts ──→  roadmap (existing)
                       ──→  state (existing)
```

No circular dependencies. The orchestrator depends on its helpers; helpers depend on each other only as documented.

### Test boundaries

- `tests/unit/autopilot.test.ts` continues to test the orchestrator and end-to-end pipeline behavior. It exercises functions from the new modules transitively.
- Per-file coverage thresholds added for each new module in `jest.config.js`.
- If a function moves to a new module and its tests break only because of the import path, update the test imports accordingly.
- If a function moves to a new module and its tests still pass without ANY change (because they test the public surface that remains in autopilot.ts), no test changes needed.

## Acceptance criteria

1. `lib/autopilot.ts` shrinks from 2,702 lines to under 800 lines.
2. Three new files exist: `lib/autopilot-pipeline.ts`, `lib/autopilot-waves.ts`, `lib/autopilot-milestone.ts`.
3. `npm test` passes with no test failures (4,239 tests baseline + 1 known pre-existing — same as pre-decomposition).
4. `npm run lint` clean.
5. `npm run build:check` clean.
6. `gd scan --all` clean.
7. Per-file coverage thresholds added for the 3 new modules in `jest.config.js`.
8. No behavior changes detectable in `tests/integration/` (autopilot integration tests pass unchanged).

## Out of scope

- `lib/mcp-server.ts` (3,292 lines) decomposition — own spec.
- New autopilot features.
- Changing `runAutopilot`'s public signature.
- Reorganizing `tests/unit/autopilot.test.ts`.
