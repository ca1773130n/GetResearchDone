---
milestone: gsd-2-selective-adoption
spec: 2A of 4
status: approved
date: 2026-04-11
owner: cameleon-x
---

# Autopilot hardening — rate-limit hang fix

## Milestone context

Second spec in the `gsd-2-selective-adoption` milestone. Phase 1 (prompt injection scanner, commit `0ced37d`) is complete and merged to `main`.

This spec was originally framed as "port gsd-2 v2.67's `auto-stuck-detection.ts`, `auto-idempotency.ts`, `auto-start.ts`" — but investigation showed that framing was wrong:

- **Those exact files do not exist in gsd-2.** gsd-2's hardening subsystem is actually ~7 interconnected files (`auto-recovery.ts`, `auto-timeout-recovery.ts`, `auto-supervisor.ts`, `crash-recovery.ts`, `session-lock.ts`, `lock-utils.ts`, `auto-start.ts`) tied to the Pi SDK extension model.
- **A direct port is architecturally impossible.** gsd-2 uses `ctx.newSession()` in-process inside an extension; GRD uses `childProcess.spawn('claude', ...)` as subprocesses. gsd-2 uses SQLite + event log idempotency; GRD uses filesystem status markers.
- **The real opportunity is to adopt patterns, not code.** This spec picks the narrowest valuable slice of hardening for GRD's subprocess-spawn execution model.

During clarifying questions it further narrowed: the user's *primary* pain is rate-limit-related hangs during long-running operations (`gd autopilot`, `gd evolve`, Karpathy autoresearch loop, NERFIFY contexts). The original "agent hangs" framing turned out to be a surface symptom of rate-limit exhaustion, not a distinct failure mode.

**This spec is therefore Spec 2A: rate-limit hang fix.** The original idle-watchdog scope has been split off as a separate follow-up spec:

- **Spec 2A (this spec):** rate-limit hang fix via token-budget-aware wait + wire-up of bypass paths
- **Spec 2B (future):** per-spawn idle timeout watchdog — only if Spec 2A does not eliminate the "agent hangs" symptom

Other specs in the milestone:
- Spec 1 (complete, on main): Prompt injection scanner
- Spec 2B (future): Idle timeout watchdog (conditional on 2A outcome)
- Spec 3 (future): Mechanical phase completion (gsd-2 ADR-003 pattern)
- Spec 4 (future): Token optimization system (complexity-based routing, budget pressure)

## Problem

### Observed symptom

During long-running operations (`gd autopilot`, `gd evolve`, Karpathy autoresearch loop), the user regularly experiences "stuck at rate limit" — autopilot silently stalls for extended periods, eventually giving up or producing unclear errors. Recent commits (`c342cc1` — Karpathy autoresearch + NERFIFY CLI commands) have exacerbated this because those newer code paths do not use GRD's scheduler at all.

### What GRD already has

GRD has a sophisticated rate-limit handling system in `lib/scheduler.ts` (745 lines). It is NOT missing rate-limit logic:

- **Per-backend rate-limit detection patterns** on stderr (lines 51, 72, 90, 108, 126 — Claude, Codex, Gemini, OpenCode, etc.)
- **Per-account learned token budgeting** with rolling sample window:
  - `token_budget`: learned maximum tokens per account, persisted across sessions
  - `samples: UsageSample[]`: per-task `{timestamp, tokenEstimate}` records
  - `tokens_consumed_in_window`: sum of samples within `window_minutes`
  - `evictExpiredSamples`: drops samples older than window
  - `ewma_tokens_per_task`: EWMA of per-task cost for headroom prediction
  - `budget_learned`, `budget_confidence`: calibration state
- **Account rotation on 429** via `_computeMaxRetries` and `_spawnWithRetry` loop
- **`_hasHeadroom` check**: account has headroom iff NOT in cooldown AND `(budget − consumed − reserved) / ewma_tokens_per_task ≥ safety_margin_tasks`
- **`cooldown_until` secondary signal**: populated on 429 with `Date.now() + window_minutes * 60 * 1000`

### The actual stuck mechanism

When `resolveAccount` finds no headroom in ANY priority account (all exhausted), it **falls back to `free_fallback.backend` without checking its headroom**. The fallback is then attempted; if it also fails, `_spawnWithRetry` increments the retry counter. After `_computeMaxRetries` iterations (capped at `backend_priority.length`), `scheduler.spawn` gives up and returns an error.

The caller (autopilot, evolve, etc.) sees the error, logs it, and moves on. The *work* is abandoned. The user perceives this as "stuck" because the long-running operation has silently lost progress.

**Crucially**, the scheduler has *all the data needed* to compute when an account would have headroom again — via sample aging — but it does not use that data as a wait signal. Samples age out of the rolling window deterministically, so `oldest_sample.timestamp + window_minutes` is a precise "soonest recovery time" that today's code simply doesn't compute.

### The bypass paths

Two newer code areas bypass the scheduler entirely:

1. **`lib/autoresearch.ts`** (666 lines, Karpathy-style autonomous experiment loop, added in commit `c342cc1`). Uses `childProcess.spawnSync('claude', args, ...)` directly at `_spawnClaude` line 142. Called from line 402 (survey phase) and line 455 (experiment iteration). The module is **synchronous throughout** — both the helper and the main loop use `spawnSync`.

2. **NERFIFY label in context modules.** Investigation showed NERFIFY references in `lib/context/execute.ts`, `lib/context/research.ts`, `lib/refinement.ts`, `lib/benchmark.ts` are methodology labels (knowledge injection, PSNR-minima scoring, taxonomy classification) — **not spawn sites**. Only `autoresearch.ts` actually spawns Claude on the NERFIFY-related paths.

## Goals

1. **Replace the "give up when all accounts exhausted" behavior with a bounded wait.** When `resolveAccount` would fall through to `free_fallback` because no priority account has headroom, compute the soonest time any account will regain headroom (via sample aging) and sleep until then. If the wait exceeds a configurable cap, fall through to today's behavior.
2. **Wire `lib/autoresearch.ts` through `scheduler.spawn`** so that its Claude subprocess calls participate in per-account token tracking and rate-limit handling. Requires converting autoresearch from sync to async.
3. **Add a cancellable wait primitive** (`waitUntilOrAbort`) that sleeps until a target timestamp or SIGINT, whichever fires first. Registers a SIGINT handler lazily on first use — GRD currently has no SIGINT handlers in `lib/`.
4. **Add new config field `SchedulerConfig.max_wait_minutes`** with default 90 minutes. Users who want unlimited wait can set it to a week; the field cannot be set to `Infinity` but can be set arbitrarily high.
5. **Ship with tests:** unit coverage for `computeSoonestRecovery` (the new calculation), unit coverage for `waitUntilOrAbort`, integration test that autoresearch now routes through `scheduler.spawn`.

## Non-goals

- **Retry-after header parsing** from 429 errors. The sample-based recovery calculation is already based on real data. Parsing Anthropic's `anthropic-ratelimit-*-reset` and equivalents for other backends would supplement the sample-based estimate but is not load-bearing. Deferred to a follow-up spec if the sample-based approach proves insufficient.
- **Per-spawn idle timeout watchdog.** Spec 2B. The original "agent hangs" framing may turn out to be entirely a rate-limit surface symptom — shipping 2A first lets us measure whether 2B is still needed.
- **Wire-up of `autopilot.ts` `spawnClaudeAsync` ternary fallbacks** (lines 1747, 1886, 2015). These are intentional opt-out paths: `scheduler ? scheduler.spawn(...) : spawnClaudeAsync(...)`. When a scheduler is configured, the scheduler path fires. When it isn't, the user has explicitly opted out of account rotation.
- **`autopilot.ts` Overstory sling path** (line 1667). The existing comment documents the intentional bypass: Overstory has its own orchestration. Out of scope.
- **NERFIFY context/refinement/benchmark wire-up.** Investigation confirmed these files do not spawn Claude — NERFIFY is a methodology label, not a module.
- **Refactoring `lib/autoresearch.ts` beyond the sync→async spawn plumbing.** The iteration state machine, hypothesis logic, and scoring stay as-is.
- **Refactoring `lib/autopilot.ts` (2,534-line monolith).** Out of scope for Spec 2A. A split of `lib/autopilot.ts` is an architectural project worth its own spec.
- **Additional account rotation policies** (backend switching on repeated 429, failover priority changes, etc.). The existing waterfall in `resolveAccount` is not changed.
- **Idempotency keys / completed-key checks** as standalone primitives. GRD's status markers (`writeStatusMarker`) already provide this function.

## Architecture

### Overview

The scheduler's existing `_spawnWithRetry` loop has three phases: resolve account → spawn → record sample or error. This spec adds **one new behavior** inside that loop: when the resolved account has no headroom AND falls through to `free_fallback`, the scheduler instead computes a soonest-recovery time and waits for it, up to a configured cap.

No changes to:
- Headroom calculation (`_hasHeadroom`)
- Account rotation on 429 (`resolveAccount` waterfall, `_computeMaxRetries`)
- `cooldown_until` semantics (still used as a secondary signal from 429 events)
- Sample recording, EWMA update, budget learning
- Existing rate-limit detection regex patterns per backend
- The ternary pattern in `lib/autopilot.ts` that uses scheduler when available

Changes:
- New pure function `computeSoonestRecovery` in `lib/scheduler.ts`
- Modified `_spawnWithRetry` wait branch
- New file `lib/scheduler-wait.ts` for the cancellable wait primitive
- New `SchedulerConfig.max_wait_minutes` field with default 90
- `lib/autoresearch.ts` converted to async, routing through scheduler when available
- Callers of `autoresearch`'s entry point updated to `await`

### File structure

**New files:**

```
lib/scheduler-wait.ts            # waitUntilOrAbort primitive + lazy SIGINT handler

tests/unit/scheduler-wait.test.ts
tests/unit/scheduler-recovery.test.ts  # computeSoonestRecovery tests
tests/integration/autoresearch-scheduler.test.ts
```

**Modified files:**

```
lib/scheduler.ts       # +computeSoonestRecovery, modified _spawnWithRetry wait branch
lib/types.ts           # SchedulerConfig.max_wait_minutes field
lib/autoresearch.ts    # sync → async conversion, route _spawnClaude through scheduler
bin/gd.ts              # (or wherever autoresearch CLI entry lives) — await the new async entry
jest.config.js         # per-file coverage thresholds for new files
CLAUDE.md              # document max_wait_minutes in scheduler reference
docs/CHANGELOG.md      # Unreleased entry
```

### Module boundaries

- **`lib/scheduler-wait.ts`** — pure helper with one exported function (`waitUntilOrAbort`). Has a module-level `Set<AbortController>` for tracking active waits and a boolean for one-time SIGINT registration. Can be tested in isolation with mocked timers.
- **`lib/scheduler.ts`** — the `computeSoonestRecovery` addition is a pure function (inputs: states map + config; output: timestamp or null). Testable in isolation. The `_spawnWithRetry` modification is minimal — one new branch in the retry loop that calls `waitUntilOrAbort`.
- **`lib/autoresearch.ts`** — the sync→async conversion is local to the module. The exported entry point's signature changes; all callers must be updated. No new cross-module dependencies except `require('./scheduler')` which it did not have before.

## New function: `computeSoonestRecovery`

Added near `pickBackend` in `lib/scheduler.ts`. Pure function, no side effects.

```typescript
/**
 * Computes the earliest timestamp (ms since epoch) at which ANY priority
 * account will regain headroom based on sample aging out of the rolling
 * window. Used by the wait-loop in _spawnWithRetry when all priority
 * accounts are currently exhausted.
 *
 * For each priority account, walks its samples oldest-first, hypothetically
 * dropping each one and recomputing projected headroom. The latest-dropped
 * sample's timestamp + windowMinutes is the moment that account will have
 * enough headroom for one more EWMA-sized task.
 *
 * Returns null if:
 *   - No account has samples (nothing to wait for; caller should fall through)
 *   - Soonest recovery across all accounts is beyond Date.now() + maxWaitMs
 *
 * @param states - account usage states map
 * @param priority - ordered list of backend IDs
 * @param accounts - superpowers accounts config
 * @param windowMinutes - rolling window duration
 * @param maxWaitMs - cap: returns null if soonest recovery is farther than this
 * @returns timestamp (ms) when soonest account recovers, or null
 */
function computeSoonestRecovery(
  states: Map<string, BackendUsageState>,
  priority: BackendId[],
  accounts: SuperpowersConfig['accounts'],
  windowMinutes: number,
  maxWaitMs: number,
): number | null {
  const now = Date.now();
  let soonest = Infinity;

  for (const backend of priority) {
    const backendAccounts = accounts[backend] || [];
    for (const account of backendAccounts) {
      const stateKey = `${backend}/${account.config_dir}`;
      const state = states.get(stateKey);
      if (!state || state.samples.length === 0) continue;
      if (state.ewma_tokens_per_task === 0) continue; // no prediction data

      const sortedSamples = [...state.samples].sort(
        (a, b) => a.timestamp - b.timestamp
      );

      const ewmaCost = state.ewma_tokens_per_task;
      let consumed = state.tokens_consumed_in_window;
      const reserved = state.tokens_reserved;
      let latestDroppedTs: number | null = null;

      for (const sample of sortedSamples) {
        const projectedRemaining = state.token_budget - consumed - reserved;
        if (projectedRemaining >= ewmaCost) break;
        consumed -= sample.tokenEstimate;
        latestDroppedTs = sample.timestamp;
      }

      if (latestDroppedTs === null) continue; // already has headroom
      const recoveryTime = latestDroppedTs + windowMinutes * 60 * 1000;
      if (recoveryTime < soonest) soonest = recoveryTime;
    }
  }

  if (soonest === Infinity) return null;
  if (soonest > now + maxWaitMs) return null;
  return soonest;
}
```

**Correctness notes:**

- The function is deliberately strict: it only returns a non-null result if the wait fits within `maxWaitMs` AND the recovery calculation is possible. Otherwise the caller falls through to the existing free_fallback path.
- Walks samples oldest-first, accumulating the "had to drop this to get headroom" frontier. The frontier's last dropped sample is the constraint.
- Skips accounts with `ewma_tokens_per_task === 0` because the headroom calculation would divide by zero. Such accounts are considered "too new to predict."
- Uses `tokens_reserved` in the projected-remaining calculation to respect in-flight reservations.

## New function: `waitUntilOrAbort`

New file `lib/scheduler-wait.ts`. Cancellable sleep with SIGINT handling.

```typescript
'use strict';

/**
 * GRD Scheduler/Wait -- Cancellable wait primitive for the scheduler's
 * all-accounts-exhausted fallback.
 *
 * Sleeps until `targetMs` or SIGINT, whichever fires first. Registers a
 * process-level SIGINT handler on first use (GRD has no other SIGINT
 * handlers in lib/, so this is the first — if another module adds one
 * later, they should coordinate via a shared registry).
 */

let _sigintRegistered = false;
const _activeControllers: Set<AbortController> = new Set();

function _ensureSigintHandler(): void {
  if (_sigintRegistered) return;
  _sigintRegistered = true;
  process.on('SIGINT', () => {
    for (const ctl of _activeControllers) ctl.abort();
    _activeControllers.clear();
  });
}

export async function waitUntilOrAbort(
  targetMs: number,
): Promise<'waited' | 'aborted'> {
  _ensureSigintHandler();
  const delay = Math.max(0, targetMs - Date.now());
  if (delay === 0) return 'waited';

  const controller = new AbortController();
  _activeControllers.add(controller);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      controller.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('SIGINT'));
      });
    });
    return 'waited';
  } catch (e) {
    if ((e as Error).message === 'SIGINT') return 'aborted';
    throw e;
  } finally {
    _activeControllers.delete(controller);
  }
}

module.exports = { waitUntilOrAbort };
```

## Modified `_spawnWithRetry` wait branch

Current behavior (simplified):

```typescript
async function _spawnWithRetry(prompt, opts, retryCount): Promise<SchedulerSpawnResult> {
  const resolution = resolveAccount(superpowersConfig, schedulerConfig, states, safetyMargin);
  // spawn with resolution, handle 429, recurse on rotation...
}
```

New behavior adds a branch before the spawn: if the resolved account is the free_fallback and NO priority account has headroom, attempt a wait.

```typescript
async function _spawnWithRetry(prompt, opts, retryCount): Promise<SchedulerSpawnResult> {
  // Pre-spawn check: did we fall through to free_fallback because no priority
  // account has headroom? If so, try to wait for the soonest recovery.
  const resolution = resolveAccount(superpowersConfig, schedulerConfig, states, safetyMargin);

  const fellThroughToFallback =
    resolution.backend === schedulerConfig.free_fallback.backend &&
    schedulerConfig.backend_priority.length > 0 &&
    !_anyPriorityHasHeadroom(schedulerConfig.backend_priority, superpowersConfig.accounts, states, safetyMargin);

  if (fellThroughToFallback) {
    const maxWaitMs = (schedulerConfig.max_wait_minutes ?? 90) * 60 * 1000;
    const recoveryTime = computeSoonestRecovery(
      states,
      schedulerConfig.backend_priority,
      superpowersConfig.accounts,
      schedulerConfig.prediction.window_minutes,
      maxWaitMs,
    );
    if (recoveryTime !== null) {
      const waitMs = recoveryTime - Date.now();
      opts.log?.(`scheduler: all priority accounts exhausted, waiting ${Math.ceil(waitMs / 60000)}m for soonest recovery`);
      const result = await waitUntilOrAbort(recoveryTime);
      if (result === 'aborted') {
        throw new Error('scheduler: wait for account recovery interrupted by SIGINT');
      }
      // Retry from the top of the loop — headroom should be restored
      return _spawnWithRetry(prompt, opts, retryCount);
    }
    // Recovery not computable or beyond cap — fall through to existing behavior
  }

  // ... existing spawn logic ...
}
```

Where `_anyPriorityHasHeadroom` is a new helper that walks the priority list and returns true if any account's state passes `_hasHeadroom`. Small, testable.

**Infinite-loop safety:** if the wait completes but the next `resolveAccount` still falls through to free_fallback AND `computeSoonestRecovery` returns the same timestamp (no samples changed state), we'd wait again on the same timestamp → already-past → immediate return → re-enter → loop. Mitigation: track `lastRecoveryTime` in the recursion's closure; if it matches the new one, fall through to free_fallback instead of waiting again. This is an edge case (sample eviction should change state) but defends against subtle bugs.

## New `SchedulerConfig.max_wait_minutes` field

`lib/types.ts`:

```typescript
export interface SchedulerConfig {
  backend_priority: AdapterBackendId[];
  free_fallback: { backend: AdapterBackendId; model?: string };
  backend_limits?: Record<string, { tpm: number; rpm?: number }>;
  prediction: {
    window_minutes: number;
    ewma_alpha: number;
    safety_margin_tasks: number;
    min_samples: number;
  };
  /**
   * Maximum wait time for account recovery via sample aging before falling
   * through to free_fallback. Default: 90 minutes.
   *
   * Set higher (e.g., 10080 = 1 week) to effectively disable the cap.
   * Set to 0 to disable the wait entirely (preserves today's behavior).
   */
  max_wait_minutes?: number;
}
```

Default (90 minutes) is applied in `createScheduler` where `SchedulerConfig` is materialized, or wherever existing defaults are merged.

## `lib/autoresearch.ts` sync → async conversion

Current state:
- 666 lines, synchronous throughout
- `_spawnClaude(cwd, prompt, opts): SpawnResult` at line 126 uses `childProcess.spawnSync('claude', args, ...)` at line 142
- Called from `runSurvey` (line ~402) and `runExperimentIteration` (line ~455)
- Main loop `runAutoResearch` is synchronous
- Entry point exported from `module.exports` is synchronous

Target state:

1. **Change `_spawnClaude` signature** from sync to async:
   ```typescript
   async function _spawnClaude(
     cwd: string,
     prompt: string,
     opts: SpawnOpts & { scheduler?: Scheduler | null }
   ): Promise<SpawnResult> {
     if (opts.scheduler) {
       // Route through scheduler for token tracking and rate-limit handling
       const result = await opts.scheduler.spawn(prompt, {
         cwd,
         model: opts.model,
         timeout: opts.timeout,
         // ...other opts as needed
       });
       return _adaptSchedulerResult(result);
     }
     // Fallback: existing synchronous path wrapped in a resolved promise
     return _spawnClaudeSync(cwd, prompt, opts);
   }
   ```
   The existing `spawnSync`-based body is renamed to `_spawnClaudeSync` and kept for the no-scheduler case. `_adaptSchedulerResult` maps `SchedulerSpawnResult` to `SpawnResult` (the autoresearch-local type).

2. **Convert call sites at lines ~402 and ~455** to `await _spawnClaude(...)`.

3. **Convert `runAutoResearch` main loop to async**:
   ```typescript
   async function runAutoResearch(opts: {...}): Promise<AutoResearchResult> {
     // ... existing sync iteration state ...
     while (!shouldStop()) {
       await runIteration(cwd, scheduler, iterationNumber, ...);
       iterationNumber++;
     }
     return { ... };
   }
   ```

4. **Update `bin/gd.ts`** (or wherever `autoresearch` CLI entry is dispatched) to `await runAutoResearch(...)` and ensure the top-level CLI wrapper handles the promise (likely already does for other async commands).

5. **Pass scheduler into autoresearch from the CLI dispatcher.** If autoresearch currently runs without a scheduler, add the standard scheduler construction — same pattern used by `runAutopilot`.

**Risk mitigation:** the iteration state machine has sync file reads/writes interleaved with the spawn. Converting only the spawn to async (leaving fs calls sync) is safe — we only add `await` at spawn points. Integration test confirms the iteration still functions end-to-end with a mocked scheduler.

## Testing strategy

### Unit tests

**`tests/unit/scheduler-wait.test.ts`** (new file, ~6 tests):

1. `waitUntilOrAbort(Date.now() + 100)` → resolves `'waited'` after ~100ms
2. `waitUntilOrAbort(Date.now() - 1000)` (past timestamp) → resolves immediately with `'waited'`
3. `waitUntilOrAbort(Date.now() + 10000)` + `process.emit('SIGINT', 'SIGINT')` mid-wait → resolves `'aborted'`
4. Multiple concurrent waits → single SIGINT aborts all
5. SIGINT handler registered only once across multiple `waitUntilOrAbort` invocations (inspect `process.listenerCount('SIGINT')`)
6. Controllers are removed from the set after each wait completes (inspect via module re-import or exposed test-only accessor)

**`tests/unit/scheduler-recovery.test.ts`** (new file, ~8 tests for `computeSoonestRecovery`):

1. Empty states map → `null`
2. State with zero samples → `null`
3. State with `ewma_tokens_per_task === 0` → `null`
4. Single account, soonest recovery within `maxWaitMs` → returns correct timestamp
5. Single account, soonest recovery beyond `maxWaitMs` → `null`
6. Multiple accounts → picks the minimum recovery time
7. Account with `budget_learned: false` and nonzero EWMA → participates normally
8. Edge case: sample timestamp exactly at the eviction boundary (the timer must expire, not just equal)

**Coverage:** 100% lines/branches for `computeSoonestRecovery`; per-file threshold in `jest.config.js`.

### Integration tests

**`tests/integration/autoresearch-scheduler.test.ts`** (new file, ~4 tests):

1. Mock `scheduler.spawn` to return a fake success result. Invoke one autoresearch iteration. Assert `scheduler.spawn` was called with the expected prompt and cwd. Assert `childProcess.spawnSync` was NOT called for the Claude subprocess (it may still be called for git/jest/eslint).
2. Mock `scheduler.spawn` to return a 429 error result. Assert the iteration handles it (logs, reverts, continues to the next iteration or halts based on policy).
3. Run autoresearch with `scheduler: null`. Assert the legacy `_spawnClaudeSync` fallback path still works — backward compatibility.
4. Inject a fake `computeSoonestRecovery` that triggers a wait, verify autoresearch's iteration waits and retries rather than failing.

### Test coverage gaps to explicitly accept

- End-to-end integration with a real `claude -p` subprocess. Too slow and non-deterministic for CI. Unit + mocked-integration is enough.
- Signal handling across multiple SIGINT events. The module-level registration only fires once; once the handler has aborted all controllers, a second SIGINT would hit the default handler. This is intentional — second Ctrl+C means "really stop" and should terminate the process hard.

## Error handling

- **Wait interrupted by SIGINT** → `waitUntilOrAbort` returns `'aborted'` → `_spawnWithRetry` throws `new Error('scheduler: wait for account recovery interrupted by SIGINT')` → propagates up through the caller chain (autopilot, autoresearch, evolve, etc.).
- **`computeSoonestRecovery` returns null** (can't compute or beyond cap) → fall through to existing `resolveAccount` free_fallback behavior (today's behavior, no regression).
- **Wait elapses successfully but re-entering the retry loop still finds no headroom** → recompute. If the recovery timestamp is the same as the previous one (nothing changed), fall through to free_fallback instead of waiting again. Prevents infinite loops from a subtle bug.
- **`SchedulerConfig.max_wait_minutes` set to 0 or negative** → treated as 0, no wait, preserves today's behavior exactly.
- **`SchedulerConfig.max_wait_minutes` unset (undefined)** → default to 90.
- **Caller passes a scheduler to autoresearch that throws on `spawn()`** → propagates normally. Autoresearch's existing error-handling for spawn failures (revert, log, continue) still applies.

No silent fallbacks. No `catch { return undefined }` patterns. Errors always propagate or are explicitly handled at a boundary.

## Rollout checklist

1. **`lib/scheduler-wait.ts`** — new file with `waitUntilOrAbort` and lazy SIGINT registration
2. **`tests/unit/scheduler-wait.test.ts`** — new file, 6 tests
3. **`lib/scheduler.ts`** — add `computeSoonestRecovery`, add `_anyPriorityHasHeadroom` helper, modify `_spawnWithRetry` wait branch, import `waitUntilOrAbort` from `./scheduler-wait`
4. **`tests/unit/scheduler-recovery.test.ts`** — new file, 8 tests for `computeSoonestRecovery`
5. **`lib/types.ts`** — add `max_wait_minutes?: number` to `SchedulerConfig`
6. **`lib/scheduler.ts`** — apply default `90` where `SchedulerConfig` is materialized
7. **`lib/autoresearch.ts`** — convert `_spawnClaude` to async, add `_spawnClaudeSync` fallback, route through scheduler when available, convert main loop to async, update exported entry point signature
8. **`bin/gd.ts` (or autoresearch CLI dispatcher)** — await the new async entry point
9. **`tests/integration/autoresearch-scheduler.test.ts`** — new file, 4 tests
10. **`jest.config.js`** — per-file coverage thresholds for `lib/scheduler-wait.ts` and the new scheduler functions
11. **`CLAUDE.md`** — document `max_wait_minutes` in the scheduler reference section
12. **`docs/CHANGELOG.md`** — Unreleased entry
13. Run `npm test` — confirm no regressions in the 4,101 existing tests and the ~18 new ones pass
14. Run `npm run lint` — zero errors
15. Run `npm run build:check` — zero errors

## Out of scope (follow-up items)

- **Retry-after header parsing from 429 error messages.** Each backend emits 429 in a different format. A parser per backend would supplement the sample-based estimate but is not load-bearing. Revisit if the sample-based approach proves insufficient in practice.
- **Spec 2B: per-spawn idle timeout watchdog.** Only pursue if Spec 2A does not eliminate the observed "agent hangs" symptom.
- **Autopilot.ts `spawnClaudeAsync` ternary fallbacks.** Intentional opt-out paths when scheduler is not configured. Do not touch.
- **Autopilot Overstory sling path** (line 1667). Intentionally bypasses scheduler per existing comment — Overstory has its own orchestration.
- **`lib/autopilot.ts` 2,534-line monolith split.** Architectural refactor worth its own spec, out of scope for Spec 2A.
- **Additional account rotation policies** (backend switching on repeated 429, failover priority changes). Existing waterfall unchanged.
- **Scheduler instrumentation** (wait events, metrics, logging format). Existing log output is kept; new `opts.log?.()` calls for wait events match the existing pattern.

## Attribution

Pattern adopted from [gsd-build/gsd-2](https://github.com/gsd-build/gsd-2) v2.67+, specifically the design of:

- `src/resources/extensions/gsd/auto-timeout-recovery.ts` — recovery attempt tracking per unit, exponential backoff, escalation pattern
- `src/resources/extensions/gsd/auto-recovery.ts` — blocker placeholder concept, self-heal runtime records
- `src/resources/extensions/gsd/auto-supervisor.ts` — signal handling with lock cleanup
- `packages/pi-coding-agent/src/core/lock-utils.ts` — lock retry patterns

**This spec does not port gsd-2's code.** gsd-2's hardening is built on the Pi SDK extension model (`ExtensionContext.newSession()`, in-process orchestration, SQLite-backed state, event log idempotency) which is architecturally incompatible with GRD's subprocess-spawn model. The *patterns* — bounded retry with backoff, cancellable wait, signal handlers — are portable. The code is not.

GRD's existing scheduler already provides per-account token budgeting, rolling sample windows, EWMA prediction, and account rotation — more than gsd-2 has, in some ways. This spec complements that infrastructure with one missing primitive: the wait-for-soonest-recovery fallback.

CHANGELOG entry credits gsd-2 v2.67+ as the pattern source.

## Related specs

- Spec 1 (complete, commit `0ced37d` on main): `2026-04-11-gsd2-prompt-injection-scan-design.md`
- Spec 2B (future, conditional): `2026-MM-DD-gsd2-idle-watchdog-design.md` — per-spawn idle timeout watchdog
- Spec 3 (future): `2026-MM-DD-gsd2-mechanical-completion-design.md` — fold phase completion into post-gate aggregation (gsd-2 ADR-003)
- Spec 4 (future): `2026-MM-DD-gsd2-token-optimization-design.md` — `token_profile` preference, complexity-based routing, budget pressure thresholds
