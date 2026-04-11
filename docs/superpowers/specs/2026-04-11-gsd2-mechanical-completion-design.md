---
milestone: gsd-2-selective-adoption
spec: 3 of 4
status: approved
date: 2026-04-11
owner: cameleon-x
---

# Mechanical phase completion — autopilot finalizes phases automatically

## Milestone context

Third spec in the `gsd-2-selective-adoption` milestone. Spec 1 (prompt injection scanner, commit `0ced37d`) and Spec 2A (autopilot rate-limit hang fix, commit `9153052`) are complete and merged to `main`.

This spec was originally framed as "port gsd-2 ADR-003's mechanical phase completion with LLM fallback." The user dialogue during brainstorming narrowed the scope: the core user value is that autopilot should finalize a phase automatically after its pipeline completes, rather than stopping at a status marker and requiring the user to run `gd phase complete N` manually. The LLM-fallback half of ADR-003 is speculative scope — it addresses a problem (mechanical aggregation producing low-quality output) that does not yet exist in GRD and will not exist until the mechanical path has been running for a while. Both pieces are deferred:

- **Spec 3 (this spec):** Extract `_phaseCompleteCore` into its own module and wire autopilot's post-pipeline step to call it automatically. No LLM fallback. No new "aggregation" layer beyond the existing gate-check pass-through.
- **Spec 3B (future, conditional):** LLM fallback for mechanical completion — only pursue if Spec 3 ships and we actually observe mechanical completion failing in practice.

Other specs in the milestone:
- Spec 1 (complete, on main): Prompt injection scanner
- Spec 2A (complete, on main): Autopilot rate-limit hang fix
- Spec 2B (future, conditional): Per-spawn idle timeout watchdog
- Spec 3B (future, conditional): LLM fallback for mechanical completion
- Spec 4 (future): Token optimization system

## Problem

### Observed symptom

`gd autopilot` claims to run a project autonomously, but every phase pipeline stops one step short of being done: the post-pipeline step writes a `post-pipeline: completed` status marker and hands control back to the autopilot loop, which moves on to the next phase. The ROADMAP.md checkbox for that phase is never ticked. STATE.md's `Current Phase` never advances. Quality analysis is never run. Cleanup plans are never generated. The user has to return from a week-long evolve or autopilot session and run `gd phase complete N` for every phase that ran successfully.

This is a direct regression of the autonomy value proposition. It is also the mechanism that causes autopilot's next-milestone transition to fail silently: `_isAllPhasesComplete` checks `disk_status === 'complete'`, but because the phases were never formally completed, their `disk_status` never changes, so autopilot reports "phases still pending" even though the pipelines all ran successfully.

### What GRD already has

- `_phaseCompleteCore` in `lib/phase.ts` (lines 1170–1350, 181 lines) does all the mechanical work: preflight gate check, ROADMAP.md checkbox + progress-table rewrite, STATE.md field rewrite, quality analysis via `runQualityAnalysis`, cleanup plan generation via `generateCleanupPlan`, next-phase discovery.
- `cmdPhaseComplete` (`lib/phase.ts:1360`) is the CLI wrapper.
- `cmdPhaseBatchComplete` (`lib/phase.ts:2107`) is the batch wrapper.
- `runPreflightGates(cwd, 'phase-complete', ...)` in `lib/gates.ts` runs the `phase-in-roadmap` gate and returns a pass/fail result.
- Autopilot's post-pipeline success path (`lib/autopilot.ts` line ~1979) runs after plan + execute + gate + verify have all succeeded. This is where the wire-up belongs.

### What GRD does NOT have

- Any call site that invokes `_phaseCompleteCore` from autopilot. The post-pipeline step ends with `writeStatusMarker(cwd, pNum, 'post-pipeline', 'completed')` and nothing else.
- A "post-gate aggregation" layer — the phrase from the original spec reference ("fold complete-phase into post-gate aggregation") does not map to any existing code. After reviewing the codebase, the phrase is best interpreted as "run gates + run completion in a single mechanical step" rather than as a new synthesis layer.
- LLM fallback — no infrastructure for "ask Claude to complete the phase if mechanical aggregation fails." This is deferred to Spec 3B.

## Goals

1. **Extract `_phaseCompleteCore` and its direct helpers into a new `lib/phase-complete.ts` module.** `cmdPhaseComplete` and `cmdPhaseBatchComplete` stay in `phase.ts` and import from the new module. No behavior change from the CLI.
2. **Add a new exported function `completePhaseAfterPostPipeline(cwd, phaseNum): PhaseCompleteResult | null`** in `lib/phase-complete.ts`. Thin wrapper that runs the existing gates + core and returns the result. Errors are caught and logged, NOT thrown — autopilot must not crash on a completion failure.
3. **Wire autopilot's post-pipeline success path** (`lib/autopilot.ts` line ~1979, after the existing `writeStatusMarker(..., 'post-pipeline', 'completed')` call) to invoke `completePhaseAfterPostPipeline`. On failure, log the error and continue.
4. **Add a new status marker step** `phase-finalize` with values `started`/`completed`/`failed` so the autopilot dashboard surfaces the outcome of the new step and so Spec 3B can key off it.
5. **Ship with tests:** unit tests for the extracted module (smoke tests for the extracted functions working identically to the pre-extract versions), one integration test for autopilot → completePhaseAfterPostPipeline happy path and one for the failure-recovery path (completion error does not crash autopilot).

## Non-goals

- **LLM fallback.** Deferred to Spec 3B. The original spec reference mentioned "with LLM fallback for low-quality output" but that was hedged language; the brainstorming narrowed it out of scope.
- **Restructuring `lib/phase.ts` beyond the extraction of `_phaseCompleteCore`.** Other functions (`cmdPhasesList`, `cmdPhaseAdd`, `cmdPhaseInsert`, `cmdPhaseRemove`, `cmdMilestoneComplete`, `cmdValidateConsistency`, `cmdVersionBump`) stay where they are.
- **New "aggregation" abstraction layer.** The original spec reference's "post-gate aggregation" phrase does not map to any concrete need in the current codebase. Adding an abstraction layer for speculative value is YAGNI. A future spec can introduce one if needed.
- **Changing the `phase-complete` gate registry.** The existing `['phase-in-roadmap']` list is unchanged.
- **Changing `_phaseCompleteCore`'s behavior.** The extracted function behaves identically to the pre-extract version. Only its location and callers change.
- **Touching the error path of `cmdPhaseComplete`.** The CLI wrapper still calls `error(...)` on failure and exits. Only the new `completePhaseAfterPostPipeline` wrapper catches and logs.
- **Retries.** If completion fails once, autopilot logs and moves on. No retry logic. The user can still invoke `gd phase complete N` manually as a recovery path.
- **Status marker schema changes beyond adding `phase-finalize`.** No renaming of existing steps.

## Architecture

### Overview

The change adds one new file (`lib/phase-complete.ts`), modifies two existing files (`lib/phase.ts` to delegate and `lib/autopilot.ts` to call the new wrapper), and adds one new test file. The extracted module contains the same logic as before — only its location changes. The new `completePhaseAfterPostPipeline` wrapper is the only genuinely new logic, and it is a small try/catch shim.

No changes to:
- Gate registry (`_GATE_REGISTRY` in `lib/gates.ts`)
- `runPreflightGates` signature or behavior
- `runQualityAnalysis` or `generateCleanupPlan`
- CLI behavior of `gd phase complete N`
- Autopilot's pipeline steps (plan, execute, verify, post-pipeline) except for the one new call site

Changes:
- New file `lib/phase-complete.ts` containing the extracted core
- `lib/phase.ts` imports `_phaseCompleteCore` from `./phase-complete` instead of defining it inline; `cmdPhaseComplete` and `cmdPhaseBatchComplete` continue to work unchanged
- `lib/autopilot.ts` calls `completePhaseAfterPostPipeline` after the post-pipeline status marker
- New test file `tests/unit/phase-complete.test.ts`
- Integration test coverage added to `tests/integration/autopilot.test.ts` (or a new file if that one is too tangled)

### File structure

**New files:**

```
lib/phase-complete.ts            # Extracted _phaseCompleteCore + helpers + new wrapper
tests/unit/phase-complete.test.ts
```

**Modified files:**

```
lib/phase.ts                     # -_phaseCompleteCore, -helpers; +imports
lib/autopilot.ts                 # +call to completePhaseAfterPostPipeline
tests/integration/autopilot.test.ts  # +2 tests (happy path, failure recovery)
docs/CHANGELOG.md                # Unreleased entry
```

### Module boundaries

- **`lib/phase-complete.ts`** — owns the "what it takes to finalize a phase" logic: gate check → ROADMAP rewrite → STATE rewrite → quality analysis → cleanup plan → next-phase discovery. Has exactly three exports: the existing `_phaseCompleteCore` (for `phase.ts`), `completePhaseAfterPostPipeline` (for `autopilot.ts`), and the `PhaseCompleteResult` type (already defined elsewhere and re-exported for clarity). Private helpers stay private.
- **`lib/phase.ts`** — continues to own the CLI wrappers (`cmdPhaseComplete`, `cmdPhaseBatchComplete`) and all other phase-lifecycle commands (add, insert, remove, list, milestone complete, validate, version bump). After extraction it is ~1,995 lines instead of ~2,175.
- **`lib/autopilot.ts`** — gains a single new call site. The logic is `const result = completePhaseAfterPostPipeline(cwd, pNum); if (result) { writeStatusMarker(cwd, pNum, 'phase-finalize', 'completed'); } else { writeStatusMarker(cwd, pNum, 'phase-finalize', 'failed'); }`. No new helper functions inside autopilot.ts.

## New function: `completePhaseAfterPostPipeline`

Added to `lib/phase-complete.ts`. Its signature and semantics:

```typescript
/**
 * Autopilot-safe wrapper around _phaseCompleteCore. Runs the existing
 * phase-complete gates and core logic, catches any error, logs it, and
 * returns null on failure instead of throwing. Autopilot calls this after
 * a successful post-pipeline step; a completion failure is logged as a
 * status marker but does not crash the autopilot run.
 *
 * @param cwd - project root
 * @param phaseNum - phase number string (e.g., '03' or '3')
 * @returns PhaseCompleteResult on success, null on any failure
 */
export function completePhaseAfterPostPipeline(
  cwd: string,
  phaseNum: string,
): PhaseCompleteResult | null {
  try {
    const result = _phaseCompleteCore(cwd, phaseNum);
    if (result.gate_failed) {
      process.stderr.write(
        `[autopilot] phase-finalize: gates failed for phase ${phaseNum}: ${(result.gate_errors || []).map((g) => g.message).join('; ')}\n`,
      );
      return null;
    }
    if (result.dry_run) {
      // Defensive: dry-run should never be set when options is undefined.
      return null;
    }
    return result;
  } catch (e) {
    process.stderr.write(
      `[autopilot] phase-finalize: error completing phase ${phaseNum}: ${(e as Error).message}\n`,
    );
    return null;
  }
}
```

**Correctness notes:**

- The function never throws. Any error is logged via `process.stderr.write` (matching Spec 2A's logging convention adopted in `scheduler.ts`) and returned as `null`.
- Gate failures are also treated as null return. Autopilot's caller interprets null as "phase-finalize step failed, continue to next phase."
- The `dry_run` guard is defensive — `_phaseCompleteCore` returns `dry_run: true` only when `options.dryRun` is true, which we never pass. The guard handles a hypothetical future regression.
- Errors from `runQualityAnalysis` or `generateCleanupPlan` are already swallowed inside `_phaseCompleteCore`. This wrapper's catch handles errors from the ROADMAP/STATE mutations (regex mismatch, file I/O) or from `findPhaseInternal`.

## Autopilot wire-up

In `lib/autopilot.ts`, find the post-pipeline success path (around line 1979, where `writeStatusMarker(cwd, pNum, 'post-pipeline', 'completed')` is called). Immediately after that line, add:

```typescript
    // Spec 3: mechanical phase finalization. On a successful post-pipeline,
    // fold in phase complete (ROADMAP + STATE + quality analysis) instead of
    // leaving it for the user to run manually.
    writeStatusMarker(cwd, pNum, 'phase-finalize', 'started');
    const finalizeResult = completePhaseAfterPostPipeline(cwd, pNum);
    if (finalizeResult) {
      writeStatusMarker(cwd, pNum, 'phase-finalize', 'completed');
      log(
        `Phase ${pNum}: phase-finalize complete — ${finalizeResult.plans_executed} plans, ${finalizeResult.next_phase ? `next phase ${finalizeResult.next_phase}` : 'milestone complete'}`,
      );
    } else {
      writeStatusMarker(cwd, pNum, 'phase-finalize', 'failed');
      log(
        `Phase ${pNum}: phase-finalize failed — run 'gd phase complete ${pNum}' manually to finalize`,
      );
    }
```

`completePhaseAfterPostPipeline` must be imported from `../lib/phase-complete` at the top of the file.

`log` is the existing autopilot logging helper.

## Extraction plan

The following symbols move from `lib/phase.ts` to `lib/phase-complete.ts`:

- `_phaseCompleteCore` (lines 1170–1350)
- Any private helpers called by `_phaseCompleteCore` that are NOT called from elsewhere in `phase.ts`. Likely candidates: none (the helpers `readRoadmapFile`, `writeRoadmapFile`, `readStateFile`, `writeStateFile`, `findPhaseInternal`, `getPhasesDirPath`, `runQualityAnalysis`, `generateCleanupPlan` are all imported from elsewhere or shared with other commands — they STAY in their original locations).

So the actual extraction is minimal: one function (~180 lines) and its associated type import.

`phase.ts` adds this import at the top:

```typescript
const { _phaseCompleteCore } = require('./phase-complete') as {
  _phaseCompleteCore: (
    cwd: string,
    phaseNum: string,
    options?: PhaseCompleteOptions,
  ) => PhaseCompleteResult;
};
```

And removes the inline definition of `_phaseCompleteCore`. `cmdPhaseComplete` and `cmdPhaseBatchComplete` continue to call `_phaseCompleteCore(...)` — only the source of the binding changes.

## Testing strategy

### Unit tests

**`tests/unit/phase-complete.test.ts`** (new file, ~6 tests):

1. `_phaseCompleteCore returns gate_failed when preflight gates fail` — mock `runPreflightGates` to return an error
2. `_phaseCompleteCore returns dry_run result when options.dryRun is true` — no file mutations
3. `completePhaseAfterPostPipeline returns the result on success` — mock the core, verify it returns the result
4. `completePhaseAfterPostPipeline returns null on gate failure` — mock the core to return gate_failed, verify null
5. `completePhaseAfterPostPipeline returns null when the core throws` — mock the core to throw, verify null and a stderr log
6. `completePhaseAfterPostPipeline returns null on dry_run` — defensive case

Mocks rely on `jest.mock('./phase-complete')` or using a factory pattern. If mocking gets too elaborate, the tests can instead run against a real temporary project directory set up via the existing test fixtures (see `tests/unit/phase.test.ts` for the pattern).

### Integration tests

**Add 2 tests to `tests/integration/autopilot.test.ts`** (or a new file if that one's too tangled):

1. `autopilot post-pipeline success triggers phase-finalize with phase-finalize: completed marker` — set up a fake project, run one autopilot iteration, assert the marker was written and the ROADMAP checkbox was ticked
2. `autopilot phase-finalize failure does not crash the run` — set up a project where `_phaseCompleteCore` will throw (e.g., missing ROADMAP.md) and assert the autopilot run continues + logs the failure marker

If the existing `tests/integration/autopilot.test.ts` is dense and adding tests would bloat it, create `tests/integration/phase-finalize.test.ts`.

### Test coverage gaps to explicitly accept

- End-to-end integration with a real `claude -p` subprocess. Out of scope — we're not testing the CLI subprocess, only the phase-finalize logic.
- Partial-completion recovery (ROADMAP.md updated but STATE.md failed). Not worth the complexity. Current behavior: if `_phaseCompleteCore` throws partway through, the ROADMAP/STATE are in an inconsistent state. This is identical to pre-Spec-3 behavior and not made worse.

## Error handling

- **Gate failure in mechanical path:** `completePhaseAfterPostPipeline` returns `null`, autopilot writes `phase-finalize: failed` status marker and logs "run `gd phase complete N` manually." User recovery is explicit.
- **`_phaseCompleteCore` throws:** same as gate failure — null, log, marker, continue.
- **Partial mutation:** not handled. The ROADMAP/STATE may be left inconsistent. This is a pre-existing behavior of `_phaseCompleteCore` and is not in scope for this spec.
- **Quality analysis errors:** already swallowed inside `_phaseCompleteCore`.
- **Cleanup plan errors:** already swallowed inside `_phaseCompleteCore`.
- **Status marker write errors:** `writeStatusMarker` is best-effort in autopilot and already handles its own errors. No change.

No silent fallbacks, no swallowed return values. The `null` return from `completePhaseAfterPostPipeline` is an explicit signal that autopilot acts on (writing a `failed` marker and logging).

## Rollout checklist

1. Create `lib/phase-complete.ts` with `_phaseCompleteCore` (moved from `phase.ts`) + `completePhaseAfterPostPipeline` + necessary type re-exports.
2. Update `lib/phase.ts` to import `_phaseCompleteCore` instead of defining it.
3. Run `npx jest tests/unit/phase.test.ts` to verify the existing phase tests still pass after the extraction.
4. Create `tests/unit/phase-complete.test.ts` with 6 unit tests.
5. Update `lib/autopilot.ts` to import `completePhaseAfterPostPipeline` and call it after the post-pipeline status marker.
6. Add 2 integration tests to `tests/integration/autopilot.test.ts` (or `tests/integration/phase-finalize.test.ts`).
7. Run `npm test` — confirm no regressions.
8. Run `npm run lint` — zero errors.
9. Run `npm run build:check` — zero errors.
10. Update `docs/CHANGELOG.md` with an Unreleased entry.

## Out of scope (follow-up items)

- **Spec 3B: LLM fallback for mechanical completion.** Only pursue if users report the mechanical path producing unsatisfactory completions in practice.
- **`lib/phase.ts` further decomposition.** Splitting phase lifecycle commands (add/insert/remove) into separate modules is a larger refactor worth its own spec.
- **`lib/autopilot.ts` 2,534-line monolith split.** Out of scope, same reasoning as Spec 2A.
- **Gate registry extensions for `phase-complete`.** No new gates added.
- **Quality analysis policy changes** (stricter thresholds, new rule categories). Separate concern.
- **Retry logic for failed completions.** If the mechanical path is flaky in practice, that's Spec 3B's problem.

## Attribution

Pattern loosely inspired by [gsd-build/gsd-2](https://github.com/gsd-build/gsd-2) ADR-003 on mechanical phase completion. gsd-2's implementation is tied to the Pi SDK extension model (in-process orchestration, SQLite-backed state) and is architecturally different from GRD's filesystem-based status markers. This spec adopts only the design principle: "autopilot should finalize phases automatically without user intervention." The code is new and tailored to GRD's subprocess-spawn + filesystem-marker model.

CHANGELOG entry credits gsd-2 as the pattern source.

## Related specs

- Spec 1 (complete, commit `0ced37d` on main): `2026-04-11-gsd2-prompt-injection-scan-design.md`
- Spec 2A (complete, commit `9153052` on main): `2026-04-11-gsd2-autopilot-hardening-design.md`
- Spec 2B (future, conditional): `2026-MM-DD-gsd2-idle-watchdog-design.md`
- Spec 3B (future, conditional): `2026-MM-DD-gsd2-mechanical-completion-llm-fallback-design.md`
- Spec 4 (future): `2026-MM-DD-gsd2-token-optimization-design.md`
