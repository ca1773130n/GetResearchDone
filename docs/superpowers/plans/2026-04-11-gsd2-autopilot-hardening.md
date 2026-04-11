# Autopilot Hardening (Spec 2A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the "stuck at rate limit" symptom in GRD's long-running operations by adding a token-budget-aware wait fallback to `scheduler.spawn`, and wire `lib/autoresearch.ts` (Karpathy autoresearch loop) through the scheduler so its Claude subprocesses participate in per-account rate-limit handling.

**Architecture:** Add a new pure function `computeSoonestRecovery` to `lib/scheduler.ts` that uses existing per-account sample data to compute when the soonest priority account will regain headroom. Add a cancellable `waitUntilOrAbort` primitive in a new `lib/scheduler-wait.ts`. Modify `_spawnWithRetry` to wait (up to a configurable cap) instead of falling through to `free_fallback` when all priority accounts are exhausted. Convert `lib/autoresearch.ts` from synchronous spawn to async, routing through `scheduler.spawn` when a scheduler is available.

**Tech Stack:** TypeScript (strict), CommonJS, tsx at entry points, jest with ts-jest, Node 20. All new code follows GRD conventions: strict mode header, JSDoc blocks, `module.exports` at EOF, underscore-prefix for private helpers, no `any`.

**Spec reference:** `docs/superpowers/specs/2026-04-11-gsd2-autopilot-hardening-design.md` (commit `1cbc3db`)

**Worktree note:** This plan writes and commits code on whatever branch you execute it from. Recommended: create a worktree before starting:

```bash
git worktree add ../grd-gsd2-autopilot -b feat/gsd2-autopilot-hardening
cd ../grd-gsd2-autopilot
```

**Security invariant:** No shell interpolation. All subprocess calls use `execFileSync` or `spawn` with array arguments. Existing synchronous spawn in `lib/autoresearch.ts` uses array args; the async conversion preserves that. New code in `lib/scheduler-wait.ts` does not invoke any subprocess at all.

---

## File Structure

**New files:**

```
lib/scheduler-wait.ts                      # waitUntilOrAbort primitive + lazy SIGINT handler
tests/unit/scheduler-wait.test.ts          # 6 tests for waitUntilOrAbort
tests/unit/scheduler-recovery.test.ts      # 10 tests for computeSoonestRecovery + _anyPriorityHasHeadroom
tests/unit/scheduler-spawn-wait.test.ts    # 2 smoke tests for the wait branch wiring
tests/integration/autoresearch-scheduler.test.ts  # 4 tests for autoresearch to scheduler wiring
```

**Modified files:**

```
lib/scheduler.ts          # +computeSoonestRecovery, +_anyPriorityHasHeadroom, modified _spawnWithRetry
lib/types.ts              # SchedulerConfig.max_wait_minutes field
lib/autoresearch.ts       # sync to async conversion, scheduler routing
bin/grd-tools.ts          # pass scheduler to autoresearch, await the async entry
jest.config.js            # per-file coverage thresholds for new files
CLAUDE.md                 # document max_wait_minutes in scheduler reference (if section exists)
docs/CHANGELOG.md         # Unreleased entry
```

**Module boundaries:**

- `lib/scheduler-wait.ts` is a pure helper with one exported function (`waitUntilOrAbort`). Module-level `Set<AbortController>` tracks active waits. Lazy SIGINT handler registration on first use. Testable in isolation.
- `lib/scheduler.ts` additions are pure functions. `computeSoonestRecovery` is input-in, timestamp-or-null-out. `_anyPriorityHasHeadroom` is a small boolean helper. Both unit-testable without mocking subprocess execution.
- `lib/autoresearch.ts` sync-to-async conversion is local to the module. The exported entry point signature changes from synchronous to `Promise<AutoResearchResult>`; all callers (currently just `bin/grd-tools.ts`) must be updated.

---

## Task 1: scheduler-wait primitive

**Files:**
- Create: `lib/scheduler-wait.ts`
- Create: `tests/unit/scheduler-wait.test.ts`

Pure utility module with a cancellable sleep and lazy SIGINT handler registration. The scheduler's new wait branch calls this.

- [ ] **Step 1.1: Write the failing test**

Create `tests/unit/scheduler-wait.test.ts`:

```typescript
'use strict';

import { waitUntilOrAbort } from '../../lib/scheduler-wait';

describe('waitUntilOrAbort', () => {
  // Use real timers — fake timers interact poorly with AbortController
  // event listeners in older Jest versions.

  it('resolves with "waited" after the delay elapses', async () => {
    const start = Date.now();
    const result = await waitUntilOrAbort(Date.now() + 100);
    expect(result).toBe('waited');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(95);
    expect(elapsed).toBeLessThan(500);
  });

  it('resolves immediately with "waited" when targetMs is in the past', async () => {
    const start = Date.now();
    const result = await waitUntilOrAbort(Date.now() - 1000);
    expect(result).toBe('waited');
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('resolves immediately with "waited" when targetMs is exactly now', async () => {
    const result = await waitUntilOrAbort(Date.now());
    expect(result).toBe('waited');
  });

  it('resolves with "aborted" when SIGINT is emitted mid-wait', async () => {
    const promise = waitUntilOrAbort(Date.now() + 10000);
    setTimeout(() => process.emit('SIGINT', 'SIGINT'), 50);
    const result = await promise;
    expect(result).toBe('aborted');
  });

  it('aborts multiple concurrent waits on a single SIGINT', async () => {
    const p1 = waitUntilOrAbort(Date.now() + 10000);
    const p2 = waitUntilOrAbort(Date.now() + 10000);
    const p3 = waitUntilOrAbort(Date.now() + 10000);
    setTimeout(() => process.emit('SIGINT', 'SIGINT'), 50);
    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['aborted', 'aborted', 'aborted']);
  });

  it('registers the SIGINT handler only once across multiple invocations', async () => {
    const before = process.listenerCount('SIGINT');
    await waitUntilOrAbort(Date.now());
    const afterFirst = process.listenerCount('SIGINT');
    await waitUntilOrAbort(Date.now());
    const afterSecond = process.listenerCount('SIGINT');
    expect(afterFirst - before).toBeLessThanOrEqual(1);
    expect(afterSecond).toBe(afterFirst);
  });
});
```

- [ ] **Step 1.2: Run the failing test**

```bash
npx jest tests/unit/scheduler-wait.test.ts
```

Expected: tests fail with `Cannot find module '../../lib/scheduler-wait'`.

- [ ] **Step 1.3: Create `lib/scheduler-wait.ts`**

```typescript
'use strict';

/**
 * GRD Scheduler/Wait -- Cancellable wait primitive for the scheduler's
 * all-accounts-exhausted fallback.
 *
 * Sleeps until a target timestamp or SIGINT, whichever fires first.
 * Registers a process-level SIGINT handler lazily on first use — GRD has
 * no other SIGINT handlers in lib/, so this is the first. If another
 * module adds one later they should coordinate via a shared registry.
 *
 * Pattern adopted from gsd-2 v2.67 auto-supervisor.ts signal handling.
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

/**
 * Sleep until `targetMs` (ms since epoch) or SIGINT, whichever fires first.
 *
 * @param targetMs - absolute timestamp at which to resume
 * @returns 'waited' if the delay elapsed normally, 'aborted' if SIGINT was received
 */
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

- [ ] **Step 1.4: Run the test to verify it passes**

```bash
npx jest tests/unit/scheduler-wait.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 1.5: Run lint and type check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 1.6: Commit**

```bash
git add lib/scheduler-wait.ts tests/unit/scheduler-wait.test.ts
git commit -m "feat(scheduler): add cancellable waitUntilOrAbort primitive

New lib/scheduler-wait.ts with a cancellable sleep that resolves on
SIGINT. Lazy SIGINT handler registration (first user wins). Used by
_spawnWithRetry's new all-accounts-exhausted wait branch in a
follow-up task.

Part of spec 2A/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 2: computeSoonestRecovery + _anyPriorityHasHeadroom

**Files:**
- Modify: `lib/scheduler.ts` (add two new functions near `pickBackend`)
- Create: `tests/unit/scheduler-recovery.test.ts`

Pure functions over the existing `BackendUsageState` data model. No side effects, no subprocess calls. Testable in complete isolation.

- [ ] **Step 2.1: Write the failing test**

Create `tests/unit/scheduler-recovery.test.ts`:

```typescript
'use strict';

import type {
  BackendUsageState,
  UsageSample,
  SuperpowersConfig,
} from '../../lib/types';

const {
  computeSoonestRecovery,
  _anyPriorityHasHeadroom,
}: {
  computeSoonestRecovery: (
    states: Map<string, BackendUsageState>,
    priority: string[],
    accounts: SuperpowersConfig['accounts'],
    windowMinutes: number,
    maxWaitMs: number,
  ) => number | null;
  _anyPriorityHasHeadroom: (
    priority: string[],
    accounts: SuperpowersConfig['accounts'],
    states: Map<string, BackendUsageState>,
    safetyMargin: number,
  ) => boolean;
} = require('../../lib/scheduler');

function makeState(opts: {
  samples?: UsageSample[];
  ewma?: number;
  budget?: number;
  consumed?: number;
  reserved?: number;
  cooldownUntil?: number;
}): BackendUsageState {
  return {
    samples: opts.samples ?? [],
    ewma_tokens_per_task: opts.ewma ?? 0,
    tokens_consumed_in_window: opts.consumed ?? 0,
    tokens_reserved: opts.reserved ?? 0,
    in_flight_count: 0,
    token_budget: opts.budget ?? 1_000_000,
    budget_learned: false,
    budget_confidence: 0,
    cooldown_until: opts.cooldownUntil,
  };
}

function makeAccounts(
  entries: Array<{ backend: string; configDir: string }>,
): SuperpowersConfig['accounts'] {
  const accounts: Record<string, Array<{ config_dir: string }>> = {};
  for (const e of entries) {
    if (!accounts[e.backend]) accounts[e.backend] = [];
    accounts[e.backend].push({ config_dir: e.configDir });
  }
  return accounts as SuperpowersConfig['accounts'];
}

const WINDOW_MIN = 60;
const MAX_WAIT_MS = 90 * 60 * 1000;

describe('computeSoonestRecovery', () => {
  it('returns null when the states map is empty', () => {
    const states = new Map<string, BackendUsageState>();
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBeNull();
  });

  it('returns null when an account has zero samples', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState({ samples: [], ewma: 5000 }));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBeNull();
  });

  it('returns null when ewma_tokens_per_task is zero (no prediction data)', () => {
    const states = new Map<string, BackendUsageState>();
    const now = Date.now();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [{ timestamp: now - 30 * 60 * 1000, tokenEstimate: 50_000 }],
        ewma: 0,
        budget: 100_000,
        consumed: 50_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBeNull();
  });

  it('returns the correct recovery timestamp for a single exhausted account', () => {
    const now = Date.now();
    const oldSampleTs = now - 30 * 60 * 1000;
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [
          { timestamp: oldSampleTs, tokenEstimate: 90_000 },
          { timestamp: now - 10 * 60 * 1000, tokenEstimate: 10_000 },
        ],
        ewma: 20_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).not.toBeNull();
    expect(result).toBe(oldSampleTs + WINDOW_MIN * 60 * 1000);
  });

  it('returns null when the soonest recovery exceeds maxWaitMs', () => {
    const now = Date.now();
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [{ timestamp: now - 1 * 60 * 1000, tokenEstimate: 100_000 }],
        ewma: 50_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const shortCap = 10 * 60 * 1000;
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, shortCap,
    );
    expect(result).toBeNull();
  });

  it('picks the minimum recovery time across multiple accounts', () => {
    const now = Date.now();
    const oldTs1 = now - 45 * 60 * 1000;
    const oldTs2 = now - 30 * 60 * 1000;
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/account-a',
      makeState({
        samples: [{ timestamp: oldTs1, tokenEstimate: 100_000 }],
        ewma: 50_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    states.set(
      'claude/~/account-b',
      makeState({
        samples: [{ timestamp: oldTs2, tokenEstimate: 100_000 }],
        ewma: 50_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    const accounts = makeAccounts([
      { backend: 'claude', configDir: '~/account-a' },
      { backend: 'claude', configDir: '~/account-b' },
    ]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBe(oldTs1 + WINDOW_MIN * 60 * 1000);
  });

  it('returns null when the priority list is empty', () => {
    const states = new Map<string, BackendUsageState>();
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, [], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBeNull();
  });

  it('participates with budget_learned=false when ewma is nonzero', () => {
    const now = Date.now();
    const oldTs = now - 30 * 60 * 1000;
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [{ timestamp: oldTs, tokenEstimate: 100_000 }],
        ewma: 25_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBe(oldTs + WINDOW_MIN * 60 * 1000);
  });
});

describe('_anyPriorityHasHeadroom', () => {
  it('returns false when no priority accounts have headroom', () => {
    const now = Date.now();
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [{ timestamp: now, tokenEstimate: 100_000 }],
        ewma: 50_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = _anyPriorityHasHeadroom(['claude'], accounts, states, 1);
    expect(result).toBe(false);
  });

  it('returns true when at least one priority account has headroom', () => {
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [],
        ewma: 0,
        budget: 100_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = _anyPriorityHasHeadroom(['claude'], accounts, states, 1);
    expect(result).toBe(true);
  });
});
```

- [ ] **Step 2.2: Run the failing test**

```bash
npx jest tests/unit/scheduler-recovery.test.ts
```

Expected: tests fail with "function not defined" — the new functions don't exist yet.

- [ ] **Step 2.3: Add the two new functions to `lib/scheduler.ts`**

Open `lib/scheduler.ts`. Find the existing `_hasHeadroom` helper (around line 264). Add the two new functions **after** `_hasHeadroom` and **before** the `resolveAccount` export.

Insert:

```typescript
/**
 * Returns true iff at least one account in the priority list has headroom.
 * Small helper used by the _spawnWithRetry wait-branch decision.
 */
export function _anyPriorityHasHeadroom(
  priority: BackendId[],
  accounts: SuperpowersConfig['accounts'],
  states: Map<string, BackendUsageState>,
  safetyMargin: number,
): boolean {
  for (const backend of priority) {
    const backendAccounts = accounts[backend as AdapterBackendId] || [];
    for (const account of backendAccounts) {
      const stateKey = `${backend}/${account.config_dir}`;
      const state = states.get(stateKey);
      if (!state) continue;
      if (_hasHeadroom(state, safetyMargin)) return true;
    }
  }
  return false;
}

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
 *   - No priority account has samples (nothing to wait for)
 *   - Soonest recovery across all accounts is beyond Date.now() + maxWaitMs
 *   - All considered accounts have zero ewma_tokens_per_task (no prediction data)
 *
 * Pattern adopted from gsd-2 v2.67 auto-timeout-recovery.ts — but
 * sample-based rather than attempt-based.
 */
export function computeSoonestRecovery(
  states: Map<string, BackendUsageState>,
  priority: BackendId[],
  accounts: SuperpowersConfig['accounts'],
  windowMinutes: number,
  maxWaitMs: number,
): number | null {
  const now = Date.now();
  let soonest = Infinity;

  for (const backend of priority) {
    const backendAccounts = accounts[backend as AdapterBackendId] || [];
    for (const account of backendAccounts) {
      const stateKey = `${backend}/${account.config_dir}`;
      const state = states.get(stateKey);
      if (!state || state.samples.length === 0) continue;
      if (state.ewma_tokens_per_task === 0) continue;

      const sortedSamples = [...state.samples].sort(
        (a, b) => a.timestamp - b.timestamp,
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

      if (latestDroppedTs === null) continue;
      const recoveryTime = latestDroppedTs + windowMinutes * 60 * 1000;
      if (recoveryTime < soonest) soonest = recoveryTime;
    }
  }

  if (soonest === Infinity) return null;
  if (soonest > now + maxWaitMs) return null;
  return soonest;
}
```

Then at the bottom of `lib/scheduler.ts`, find the existing `module.exports` (around line 731) and add `computeSoonestRecovery` and `_anyPriorityHasHeadroom` to the exports list:

```typescript
module.exports = {
  createBackendState,
  updateEWMA,
  evictExpiredSamples,
  recordSample,
  pickBackend,
  resolveAccount,
  markInFlight,
  markComplete,
  checkBinary,
  createScheduler,
  computeSoonestRecovery,
  _anyPriorityHasHeadroom,
};
```

Keep any other existing entries in place.

- [ ] **Step 2.4: Run the test to verify it passes**

```bash
npx jest tests/unit/scheduler-recovery.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 2.5: Run lint and type check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 2.6: Commit**

```bash
git add lib/scheduler.ts tests/unit/scheduler-recovery.test.ts
git commit -m "feat(scheduler): add computeSoonestRecovery + _anyPriorityHasHeadroom

Two new pure functions in lib/scheduler.ts for the _spawnWithRetry wait
branch (next task):

- computeSoonestRecovery walks each priority account's sample history
  oldest-first, hypothetically dropping samples until projected headroom
  fits one more EWMA-sized task, and returns the timestamp when the
  latest-dropped sample will age out of the rolling window.
- _anyPriorityHasHeadroom is a boolean helper that returns true if any
  priority account currently has headroom.

10 unit tests cover: empty states, zero samples, zero ewma, single
account recovery, beyond-cap returns null, multiple accounts pick
minimum, empty priority, budget_learned=false participation, and
_anyPriorityHasHeadroom positive + negative cases.

Part of spec 2A/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 3: SchedulerConfig.max_wait_minutes field

**Files:**
- Modify: `lib/types.ts`

Small type-only change.

- [ ] **Step 3.1: Add the field**

Open `lib/types.ts`. Find the `SchedulerConfig` interface (around line 405). Add the new `max_wait_minutes` field:

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
   * Maximum wait time (in minutes) for account recovery via sample aging
   * before falling through to free_fallback. Default: 90.
   *
   * When all priority accounts are exhausted, scheduler.spawn computes the
   * soonest time any account will regain headroom (via sample window aging)
   * and sleeps until then — unless that wait would exceed max_wait_minutes,
   * in which case it falls through to today's free_fallback behavior.
   *
   * Set to 0 to disable the wait entirely (preserves pre-Spec 2A behavior).
   * Set arbitrarily high (e.g., 10080 = 1 week) to effectively uncap.
   */
  max_wait_minutes?: number;
}
```

- [ ] **Step 3.2: Verify the type check is clean**

```bash
npm run build:check
```

Expected: zero errors.

- [ ] **Step 3.3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(scheduler): add SchedulerConfig.max_wait_minutes field

New optional field on SchedulerConfig. Default value (90) is applied
in createScheduler in a follow-up task. Docstring explains semantics
and escape hatches (set to 0 to disable).

Part of spec 2A/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 4: Modify _spawnWithRetry wait branch

**Files:**
- Modify: `lib/scheduler.ts` (inject wait-loop branch into `_spawnWithRetry`)
- Create: `tests/unit/scheduler-spawn-wait.test.ts`

This task integrates the wait primitive and recovery calculation into the retry loop.

- [ ] **Step 4.1: Write the failing smoke test**

Create `tests/unit/scheduler-spawn-wait.test.ts`:

```typescript
'use strict';

import type { SchedulerConfig, SuperpowersConfig } from '../../lib/types';

const { createScheduler } = require('../../lib/scheduler') as {
  createScheduler: (
    config: SchedulerConfig | undefined,
    superpowersConfig?: SuperpowersConfig,
  ) => { spawn: Function; getState: Function } | null;
};

describe('createScheduler with max_wait_minutes', () => {
  it('creates a scheduler with an explicit max_wait_minutes value', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude'],
      free_fallback: { backend: 'claude' },
      prediction: {
        window_minutes: 60,
        ewma_alpha: 0.3,
        safety_margin_tasks: 1,
        min_samples: 3,
      },
      max_wait_minutes: 90,
    };
    const scheduler = createScheduler(config);
    expect(scheduler).not.toBeNull();
    expect(typeof scheduler!.spawn).toBe('function');
  });

  it('creates a scheduler with max_wait_minutes omitted (uses default)', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude'],
      free_fallback: { backend: 'claude' },
      prediction: {
        window_minutes: 60,
        ewma_alpha: 0.3,
        safety_margin_tasks: 1,
        min_samples: 3,
      },
    };
    const scheduler = createScheduler(config);
    expect(scheduler).not.toBeNull();
  });
});
```

- [ ] **Step 4.2: Run the test**

```bash
npx jest tests/unit/scheduler-spawn-wait.test.ts
```

Expected: tests pass on existing scheduler surface (no wait-branch code yet, but the scheduler still creates normally with the new type field).

- [ ] **Step 4.3: Modify `_spawnWithRetry` to add the wait branch**

Open `lib/scheduler.ts`. Near the top of the file, alongside the other `require` imports, add:

```typescript
const { waitUntilOrAbort } = require('./scheduler-wait') as {
  waitUntilOrAbort: (targetMs: number) => Promise<'waited' | 'aborted'>;
};
```

Find `_spawnWithRetry` (around line 537 inside `createScheduler`). The structure today is roughly:

```typescript
async function _spawnWithRetry(prompt, opts, retryCount) {
  let backend;
  let stateKey;
  // ... (account resolution via resolveAccount) ...
  // ... (spawn via execFile) ...
  // ... (429 detection and retry) ...
}
```

**Add a wait-branch block AFTER the account resolution and BEFORE the subprocess invocation.** After the lines where `backend` and `stateKey` are assigned from `resolveAccount`, insert:

```typescript
    // Spec 2A: bounded wait for soonest recovery when all priority accounts
    // are exhausted and resolveAccount fell through to free_fallback.
    if (
      accountRotation &&
      superpowersConfig &&
      backend === schedulerConfig.free_fallback.backend &&
      schedulerConfig.backend_priority.length > 0 &&
      !_anyPriorityHasHeadroom(
        schedulerConfig.backend_priority,
        superpowersConfig.accounts,
        states,
        prediction.safety_margin_tasks,
      )
    ) {
      const maxWaitMinutes = schedulerConfig.max_wait_minutes ?? 90;
      if (maxWaitMinutes > 0) {
        const maxWaitMs = maxWaitMinutes * 60 * 1000;
        const recoveryTime = computeSoonestRecovery(
          states,
          schedulerConfig.backend_priority,
          superpowersConfig.accounts,
          prediction.window_minutes,
          maxWaitMs,
        );
        if (recoveryTime !== null) {
          const waitMs = recoveryTime - Date.now();
          console.log(
            `scheduler: all priority accounts exhausted, waiting ${Math.ceil(
              waitMs / 60_000,
            )}m for soonest recovery (target=${new Date(recoveryTime).toISOString()})`,
          );
          const waitResult = await waitUntilOrAbort(recoveryTime);
          if (waitResult === 'aborted') {
            throw new Error(
              'scheduler: wait for account recovery interrupted by SIGINT',
            );
          }
          return _spawnWithRetry(prompt, opts, retryCount);
        }
      }
    }
```

Note: `computeSoonestRecovery` and `_anyPriorityHasHeadroom` are file-level exports added in Task 2. They're in scope automatically — no need for a new `require`.

- [ ] **Step 4.4: Run all scheduler tests**

```bash
npx jest tests/unit/scheduler-wait.test.ts tests/unit/scheduler-recovery.test.ts tests/unit/scheduler-spawn-wait.test.ts
```

Expected: all tests pass.

- [ ] **Step 4.5: Run lint and type check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 4.6: Commit**

```bash
git add lib/scheduler.ts tests/unit/scheduler-spawn-wait.test.ts
git commit -m "feat(scheduler): wait for soonest recovery in _spawnWithRetry

When accountRotation is active and resolveAccount has fallen through to
free_fallback because no priority account has headroom, _spawnWithRetry
now:

1. Computes soonest recovery via sample aging (computeSoonestRecovery)
2. If recovery is within max_wait_minutes (default 90), sleeps until
   then via waitUntilOrAbort (cancellable via SIGINT)
3. Re-enters the retry loop after the wait — headroom should be restored

When max_wait_minutes is 0 or the recovery is beyond the cap, behavior
is identical to pre-Spec 2A.

Part of spec 2A/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 5: Apply max_wait_minutes default in createScheduler

**Files:**
- Modify: `lib/scheduler.ts`

- [ ] **Step 5.1: Add the default**

Open `lib/scheduler.ts`. Find `createScheduler` (around line 465). Near the top where `schedulerConfig` is bound from `config`:

Before:

```typescript
export function createScheduler(
  config: SchedulerConfig | undefined,
  superpowersConfig?: SuperpowersConfig,
): Scheduler | null {
  if (!config) return null;
  const schedulerConfig = config;
```

After:

```typescript
export function createScheduler(
  config: SchedulerConfig | undefined,
  superpowersConfig?: SuperpowersConfig,
): Scheduler | null {
  if (!config) return null;
  // Apply Spec 2A defaults here so the rest of the scheduler can rely on
  // a fully-populated config. Spread-merge avoids mutating caller input.
  const schedulerConfig: SchedulerConfig = {
    ...config,
    max_wait_minutes: config.max_wait_minutes ?? 90,
  };
```

- [ ] **Step 5.2: Verify the build is still clean**

```bash
npm run build:check && npm run lint
```

Expected: zero errors.

- [ ] **Step 5.3: Run the full scheduler test suite**

```bash
npx jest tests/unit/scheduler-recovery.test.ts tests/unit/scheduler-wait.test.ts tests/unit/scheduler-spawn-wait.test.ts
```

Expected: all tests pass.

- [ ] **Step 5.4: Commit**

```bash
git add lib/scheduler.ts
git commit -m "feat(scheduler): default max_wait_minutes to 90 in createScheduler

Apply the Spec 2A default (90 min) via spread-merge at the top of
createScheduler. Avoids mutating the caller's config object.

Part of spec 2A/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 6: Convert autoresearch _spawnClaude to async

**Files:**
- Modify: `lib/autoresearch.ts` (`_spawnClaude` function)

The current `_spawnClaude` is synchronous. This task introduces an async version that routes through `scheduler.spawn` when available.

- [ ] **Step 6.1: Read the current state**

```bash
wc -l lib/autoresearch.ts
sed -n '120,170p' lib/autoresearch.ts
```

Familiarize yourself with the existing function's signature, return type, options, and the 2 call sites at lines ~402 and ~455.

- [ ] **Step 6.2: Rename the existing function and add an async wrapper**

Open `lib/autoresearch.ts`. At line ~126, the existing function is:

```typescript
function _spawnClaude(
  cwd: string,
  prompt: string,
  opts: { timeout?: number; maxTurns?: number; model?: string; captureOutput?: boolean } = {},
): { exitCode: number; stdout: string; timedOut: boolean } {
  // ... existing synchronous body ...
}
```

**Step 1:** Rename the existing function from `_spawnClaude` to `_spawnClaudeSync`. Leave the body unchanged.

**Step 2:** Add a new async `_spawnClaude` above `_spawnClaudeSync`:

```typescript
import type { Scheduler } from './scheduler';

/**
 * Async spawn wrapper. When a scheduler is provided AND the caller does
 * NOT need captured stdout, routes through scheduler.spawn for per-account
 * token tracking and rate-limit handling. Otherwise falls back to the
 * synchronous path (_spawnClaudeSync) wrapped in a resolved promise.
 *
 * Known limitation: SchedulerSpawnResult does not expose stdout, so
 * captureOutput:true always uses _spawnClaudeSync. Extending the scheduler
 * result shape is a follow-up improvement (see CHANGELOG).
 */
async function _spawnClaude(
  cwd: string,
  prompt: string,
  opts: {
    timeout?: number;
    maxTurns?: number;
    model?: string;
    captureOutput?: boolean;
    scheduler?: Scheduler | null;
  } = {},
): Promise<{ exitCode: number; stdout: string; timedOut: boolean }> {
  if (opts.scheduler && !opts.captureOutput) {
    try {
      const result = await opts.scheduler.spawn(prompt, {
        cwd,
        model: opts.model,
        timeout: opts.timeout,
      });
      return {
        exitCode: result.exitCode,
        stdout: '',
        timedOut: result.timedOut,
      };
    } catch {
      return { exitCode: 1, stdout: '', timedOut: false };
    }
  }
  return _spawnClaudeSync(cwd, prompt, opts);
}
```

At the bottom of `lib/autoresearch.ts`, find `module.exports` (around line 663) and add `_spawnClaude` to the exports list so the integration test can import it:

```typescript
module.exports = {
  // ... existing exports ...
  _spawnClaude,
};
```

- [ ] **Step 6.3: Type check (expected to have call-site errors for now)**

```bash
npm run build:check 2>&1 | tail -20
```

Expected: the build will fail at the 2 existing call sites (lines ~402 and ~455) because they call `_spawnClaude` synchronously without `await`. Task 7 fixes those call sites. **Do not commit yet** — proceed directly to Task 7.

---

## Task 7: Convert autoresearch call sites to await _spawnClaude

**Files:**
- Modify: `lib/autoresearch.ts` (call sites and enclosing functions)

- [ ] **Step 7.1: Convert the survey call site at line ~402**

Find the call at line ~402:

```typescript
_spawnClaude(cwd, surveyPrompt, {
  // ... opts ...
});
```

Change to `await _spawnClaude(...)` and pass the scheduler from the enclosing scope:

```typescript
await _spawnClaude(cwd, surveyPrompt, {
  // ... existing opts ...
  scheduler,
});
```

- [ ] **Step 7.2: Convert the experiment iteration call site at line ~455**

Find the call at line ~455:

```typescript
const spawnResult = _spawnClaude(cwd, prompt, {
  // ... opts ...
  captureOutput: true,
});
```

Change to:

```typescript
const spawnResult = await _spawnClaude(cwd, prompt, {
  // ... existing opts ...
  captureOutput: true,
  scheduler,
});
```

Note: `captureOutput: true` means this path still goes through `_spawnClaudeSync` internally. Passing `scheduler` is still valid — the async wrapper just uses the sync path when captureOutput is true.

- [ ] **Step 7.3: Convert enclosing functions to async**

Trace up from line ~455 to the enclosing function (likely `runExperimentIteration` or similar). Mark it `async` and ensure its `return` values are Promise-wrapped (or remove explicit returns).

Find where that function is called from (the main loop). Mark the caller `async` too. Propagate upward.

Do the same for the function containing line ~402 (likely `runSurvey`).

- [ ] **Step 7.4: Convert the main loop (`runAutoResearch` or equivalent) to async**

Find the main exported function near the bottom of `autoresearch.ts`. Convert its signature and body:

Before:

```typescript
function runAutoResearch(opts: RunOpts): AutoResearchResult {
  while (!shouldStop(iter)) {
    runIteration(cwd, iter, ...);
    iter++;
  }
  return { ... };
}
```

After:

```typescript
async function runAutoResearch(
  opts: RunOpts & { scheduler?: Scheduler | null },
): Promise<AutoResearchResult> {
  while (!shouldStop(iter)) {
    await runIteration(cwd, iter, opts.scheduler ?? null, ...);
    iter++;
  }
  return { ... };
}
```

Add `scheduler?: Scheduler | null` to the `RunOpts` interface definition (wherever it lives in `lib/autoresearch.ts`). Pass the `scheduler` variable through the call chain so `runSurvey` and `runExperimentIteration` can use it when calling `_spawnClaude`.

- [ ] **Step 7.5: Type check**

```bash
npm run build:check
```

Expected: zero errors. If there are errors, most likely remaining call-site mismatches where `async` wasn't propagated all the way up. Fix iteratively.

- [ ] **Step 7.6: Commit Tasks 6 + 7 together**

```bash
git add lib/autoresearch.ts
git commit -m "feat(autoresearch): convert to async + route spawn through scheduler

Tasks 6 and 7 combined — the sync-to-async conversion:

- _spawnClaude becomes async. New signature accepts an optional scheduler.
  When scheduler is provided AND the caller does not need captured stdout,
  routes through scheduler.spawn for per-account token tracking and
  rate-limit handling. Otherwise falls back to _spawnClaudeSync (the
  original synchronous body, renamed).
- Call sites at ~line 402 (survey) and ~line 455 (experiment) are
  converted to 'await _spawnClaude(...)' and pass the scheduler from
  the enclosing scope.
- Enclosing functions (runSurvey, runExperimentIteration, runAutoResearch)
  are converted to async. The exported entry point signature becomes
  Promise<AutoResearchResult> with scheduler in its options.
- _spawnClaude is exported via module.exports for the Task 9 integration
  test.

Known limitation: captureOutput=true paths still use _spawnClaudeSync
because SchedulerSpawnResult does not expose stdout. Extending the
scheduler result shape is a follow-up improvement (CHANGELOG note).

Part of spec 2A/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 8: Update bin/grd-tools.ts autoresearch CLI dispatcher

**Files:**
- Modify: `bin/grd-tools.ts` (autoresearch CLI entry point)

- [ ] **Step 8.1: Find the autoresearch dispatch**

```bash
grep -n 'autoresearch\|runAutoResearch' bin/grd-tools.ts
```

Expected: a few lines showing where autoresearch is imported and called.

- [ ] **Step 8.2: Convert the call site to await + pass scheduler**

Open `bin/grd-tools.ts`. Find the autoresearch dispatch section. It currently calls `runAutoResearch` synchronously. Convert it to `await runAutoResearch(...)`.

Verify that `bin/grd-tools.ts`'s CLI handler is already in an async context (wrapped in an `async main()` or similar). Grep for existing `await` usage in the file; if there's no async wrapper, you'll need to add one or use `.then()` chains.

Load the scheduler the same way `runAutopilot` loads it. Look at `lib/autopilot.ts` around line 786 (the `scheduler.spawn` call) for the pattern. The key imports are:

```typescript
const { createScheduler } = require('../lib/scheduler');
// plus loadConfig, loadSuperpowersConfig, or equivalent
```

Pass the created scheduler to `runAutoResearch` via the options object:

```typescript
const result = await runAutoResearch({
  cwd: process.cwd(),
  scheduler,
  // ... other existing opts ...
});
```

- [ ] **Step 8.3: Type check**

```bash
npm run build:check
```

Expected: zero errors.

- [ ] **Step 8.4: Smoke-test autoresearch at the CLI level**

```bash
# Don't actually run autoresearch (long-running). Just verify the
# command still dispatches and prints a usage message on missing args.
node bin/gd.js autoresearch 2>&1 | head -5
```

Expected: a usage error like `Topic required. Usage: gd autoresearch <topic> ...` — not a TypeScript or runtime crash.

- [ ] **Step 8.5: Commit**

```bash
git add bin/grd-tools.ts
git commit -m "feat(autoresearch): wire CLI dispatcher to pass scheduler

Load the scheduler in the autoresearch CLI branch (matching the pattern
used by runAutopilot) and pass it into runAutoResearch. Converts the
dispatcher branch to await the new async entry point.

Part of spec 2A/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 9: Integration test for autoresearch to scheduler wiring

**Files:**
- Create: `tests/integration/autoresearch-scheduler.test.ts`

- [ ] **Step 9.1: Write the integration test**

Create `tests/integration/autoresearch-scheduler.test.ts`:

```typescript
'use strict';

/**
 * Integration test for autoresearch to scheduler routing.
 *
 * Verifies _spawnClaude routes through a provided scheduler.spawn when
 * captureOutput is false, and falls back to the sync path otherwise.
 */

import type { Scheduler } from '../../lib/scheduler';
import type { SchedulerSpawnResult, SpawnOpts } from '../../lib/types';

const autoresearch = require('../../lib/autoresearch') as {
  _spawnClaude?: (
    cwd: string,
    prompt: string,
    opts: {
      timeout?: number;
      maxTurns?: number;
      model?: string;
      captureOutput?: boolean;
      scheduler?: Scheduler | null;
    },
  ) => Promise<{ exitCode: number; stdout: string; timedOut: boolean }>;
};

function makeFakeScheduler(behavior: 'ok' | 'rate-limit' | 'throw'): Scheduler {
  const spawn = jest.fn(
    async (_prompt: string, _opts: SpawnOpts): Promise<SchedulerSpawnResult> => {
      if (behavior === 'throw') throw new Error('fake scheduler exploded');
      if (behavior === 'rate-limit') {
        return {
          exitCode: 1,
          timedOut: false,
          backend: 'claude',
          tokensUsed: 0,
          workItemId: 'fake-rate-limit',
        };
      }
      return {
        exitCode: 0,
        timedOut: false,
        backend: 'claude',
        tokensUsed: 1500,
        workItemId: 'fake-ok',
      };
    },
  );
  return {
    spawn,
    getState: jest.fn(() => undefined),
  } as unknown as Scheduler;
}

describe('autoresearch scheduler routing', () => {
  it('exports _spawnClaude for direct testing', () => {
    expect(autoresearch._spawnClaude).toBeDefined();
    expect(typeof autoresearch._spawnClaude).toBe('function');
  });

  it('routes through scheduler.spawn when scheduler is provided and captureOutput is false', async () => {
    if (!autoresearch._spawnClaude) return;
    const scheduler = makeFakeScheduler('ok');
    const result = await autoresearch._spawnClaude(
      '/tmp',
      'test prompt',
      { scheduler, captureOutput: false },
    );
    expect(result.exitCode).toBe(0);
    expect((scheduler.spawn as jest.Mock)).toHaveBeenCalledTimes(1);
    expect((scheduler.spawn as jest.Mock).mock.calls[0][0]).toBe('test prompt');
  });

  it('does not route through scheduler when captureOutput is true (sync fallback)', async () => {
    if (!autoresearch._spawnClaude) return;
    const scheduler = makeFakeScheduler('ok');
    // With captureOutput: true, the wrapper falls back to _spawnClaudeSync
    // which will try to run the real 'claude' binary. That may fail with
    // a missing binary (exit code != 0), which is fine — we just verify
    // the scheduler mock was NOT called.
    try {
      await autoresearch._spawnClaude(
        '/tmp',
        'test prompt',
        { scheduler, captureOutput: true, timeout: 1000 },
      );
    } catch {
      // Ignore — we only care whether scheduler.spawn was called
    }
    expect((scheduler.spawn as jest.Mock)).not.toHaveBeenCalled();
  });

  it('handles scheduler throwing gracefully', async () => {
    if (!autoresearch._spawnClaude) return;
    const scheduler = makeFakeScheduler('throw');
    const result = await autoresearch._spawnClaude(
      '/tmp',
      'test prompt',
      { scheduler, captureOutput: false },
    );
    expect(result.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 9.2: Run the test**

```bash
npx jest tests/integration/autoresearch-scheduler.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 9.3: Commit**

```bash
git add tests/integration/autoresearch-scheduler.test.ts
git commit -m "test(autoresearch): add integration test for scheduler routing

Verifies:
- _spawnClaude is exported for direct testing
- Routes through scheduler.spawn when scheduler is provided and
  captureOutput is false
- Does NOT route through scheduler when captureOutput is true (the
  sync-fallback path for stdout-consuming callers)
- Handles scheduler exceptions gracefully

Uses a mocked Scheduler with jest.fn() to avoid real subprocess calls.

Part of spec 2A/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 10: Update jest.config.js coverage thresholds

**Files:**
- Modify: `jest.config.js`

- [ ] **Step 10.1: Add the new file threshold**

Open `jest.config.js`. Find the `coverageThreshold` section. Add an entry for `lib/scheduler-wait.ts`:

```javascript
coverageThreshold: {
  // === Existing per-file thresholds (DO NOT MODIFY) ===
  // ... other entries ...

  // === Spec 2A: autopilot hardening ===
  './lib/scheduler-wait.ts': { lines: 100, functions: 100, branches: 90 },

  // Global threshold — unchanged
  // ... global entry if any ...
},
```

Place the new entry alongside other per-file thresholds. Do NOT modify any existing entries.

- [ ] **Step 10.2: Run the full test suite with coverage**

```bash
npm test 2>&1 | tail -30
```

Expected: all tests pass, coverage thresholds met. If `lib/scheduler-wait.ts` fails the threshold, inspect the coverage report and either add a test for the uncovered branch or relax the threshold for that specific branch count.

Common coverage misses in `scheduler-wait.ts`:
- The `throw e` rethrow branch (fires only on non-SIGINT errors — none of the current tests trigger this). Option: lower branches to 80, or add a test that rejects the controller with a non-SIGINT error.

- [ ] **Step 10.3: Commit**

```bash
git add jest.config.js
git commit -m "test(scheduler): add coverage thresholds for lib/scheduler-wait.ts

100% lines/functions, 90% branches. lib/scheduler.ts existing threshold
continues to cover the new computeSoonestRecovery and _anyPriorityHasHeadroom
functions.

Part of spec 2A/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 11: Update CLAUDE.md and docs/CHANGELOG.md

**Files:**
- Modify: `CLAUDE.md` (if it has a scheduler reference section)
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 11.1: Check if CLAUDE.md has a scheduler reference section**

```bash
grep -n -i 'scheduler\|rate.limit' CLAUDE.md | head -10
```

If there's an existing scheduler section, add a note about `max_wait_minutes`. If not, skip to the CHANGELOG update.

- [ ] **Step 11.2: Add the CLAUDE.md note (if applicable)**

If CLAUDE.md has a relevant section, add this paragraph near other scheduler config documentation:

```markdown
### Scheduler rate-limit wait (Spec 2A)

When all priority accounts are exhausted (no headroom via learned token
budget + sample window), `scheduler.spawn` waits for the soonest account
to regain headroom via sample aging, up to `max_wait_minutes` (default 90,
configurable in `.planning/config.json` under `scheduler.max_wait_minutes`).
Set to 0 to disable the wait entirely. Ctrl+C during a wait cleanly aborts
via a lazy SIGINT handler.
```

- [ ] **Step 11.3: Add the CHANGELOG entry**

Open `docs/CHANGELOG.md`. Find or create the `## [Unreleased]` section at the top. Add these entries under `### Added` and `### Fixed`:

```markdown
## [Unreleased]

### Added
- **Scheduler wait-for-recovery fallback** — when `scheduler.spawn` would
  otherwise fall through to `free_fallback` because all priority accounts
  are exhausted, it now computes the soonest time any account will regain
  headroom (via sample aging) and sleeps until then. Wait is capped by
  new `SchedulerConfig.max_wait_minutes` (default 90). Cancellable via
  Ctrl+C. Pattern adopted from [gsd-2](https://github.com/gsd-build/gsd-2)
  v2.67 `auto-timeout-recovery.ts`. First phase of spec 2A/4 of the
  `gsd-2-selective-adoption` milestone.
- **`lib/scheduler-wait.ts`** — new module with `waitUntilOrAbort`
  cancellable sleep primitive and lazy SIGINT handler registration.
- **`computeSoonestRecovery` and `_anyPriorityHasHeadroom`** exported from
  `lib/scheduler.ts` for the wait-branch logic.
- **`SchedulerConfig.max_wait_minutes`** — new optional field, default 90
  minutes. Set to 0 to disable the wait (preserves pre-Spec-2A behavior).
- **Autoresearch scheduler routing** — `lib/autoresearch.ts` (Karpathy
  autonomous experiment loop) is now converted from synchronous spawn to
  async, and routes its Claude subprocess calls through `scheduler.spawn`
  when a scheduler is available. Autoresearch now participates in
  per-account token tracking and rate-limit handling.

### Fixed
- **"Stuck at rate limit" symptom in long-running operations** — the
  actual mechanism was `scheduler.spawn` giving up after cycling through
  exhausted accounts instead of waiting for the soonest sample window
  to age out. The new wait-for-recovery fallback addresses this directly.

### Known limitations
- `SchedulerSpawnResult` does not expose captured stdout, so autoresearch
  paths that need `captureOutput: true` (the experiment iteration
  hypothesis matcher) still use the synchronous fallback. Extending the
  scheduler result shape to include stdout is a follow-up improvement.
```

- [ ] **Step 11.4: Verify docs don't introduce new scan hits**

```bash
node bin/gd.js scan --file CLAUDE.md
node bin/gd.js scan --file docs/CHANGELOG.md
```

Both should exit 0.

- [ ] **Step 11.5: Commit**

```bash
git add CLAUDE.md docs/CHANGELOG.md
git commit -m "docs: add Spec 2A scheduler wait + autoresearch routing

- CLAUDE.md: document max_wait_minutes config (if scheduler section exists)
- docs/CHANGELOG.md: Unreleased entry covering the wait-for-recovery
  fallback, new lib/scheduler-wait.ts, new SchedulerConfig field,
  autoresearch sync-to-async conversion, and the known captureOutput
  limitation.

Part of spec 2A/4 of the gsd-2-selective-adoption milestone."
```

---

## Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 12.1: Run the full test suite**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass. Previous count was 4,100 from Spec 1 merge. New tests added by this plan: 6 (scheduler-wait) + 10 (scheduler-recovery) + 2 (scheduler-spawn-wait) + 4 (autoresearch-scheduler) = 22 new tests. Expected total: around 4,122.

- [ ] **Step 12.2: Run lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 12.3: Run type check**

```bash
npm run build:check
```

Expected: zero errors.

- [ ] **Step 12.4: Run format check**

```bash
npm run format:check
```

If format-check fails on the files this plan modified, run prettier ONLY on those files:

```bash
npm run format -- lib/scheduler.ts lib/scheduler-wait.ts lib/types.ts lib/autoresearch.ts bin/grd-tools.ts tests/unit/scheduler-wait.test.ts tests/unit/scheduler-recovery.test.ts tests/unit/scheduler-spawn-wait.test.ts tests/integration/autoresearch-scheduler.test.ts
git add -u
git commit -m "chore: apply prettier formatting to spec 2A files"
```

**Do NOT run `npm run format` on the entire repo.** That was the mistake in Spec 1's Task 12 which caused a 44k-line drive-by commit. Format ONLY the files you modified in this plan.

- [ ] **Step 12.5: Run scanner sanity check**

```bash
node bin/gd.js scan --all
```

Expected: `scan: clean — <N> file(s) checked (1 ignored hit(s))`.

- [ ] **Step 12.6: Smoke-test computeSoonestRecovery via Node REPL**

```bash
node -e '
const s = require("./lib/scheduler");
const now = Date.now();
const states = new Map();
states.set("claude/~/.claude", {
  samples: [{ timestamp: now - 30*60*1000, tokenEstimate: 90000 }],
  ewma_tokens_per_task: 20000,
  tokens_consumed_in_window: 90000,
  tokens_reserved: 0,
  in_flight_count: 0,
  token_budget: 100000,
  budget_learned: false,
  budget_confidence: 0,
});
const r = s.computeSoonestRecovery(
  states,
  ["claude"],
  { claude: [{ config_dir: "~/.claude" }] },
  60,
  90*60*1000,
);
console.log("result:", r === null ? "null" : new Date(r).toISOString());
'
```

Expected: prints a timestamp approximately 30 minutes in the future from now.

- [ ] **Step 12.7: Verify the commit chain**

```bash
git log --oneline main..HEAD
```

Expected: roughly 10 to 12 commits, one per task plus any format/fix commits.

- [ ] **Step 12.8: Final checklist**

Confirm all of the following:

- [ ] `lib/scheduler-wait.ts` exists with `waitUntilOrAbort` and lazy SIGINT handler
- [ ] `lib/scheduler.ts` exports `computeSoonestRecovery` and `_anyPriorityHasHeadroom`
- [ ] `lib/scheduler.ts` `_spawnWithRetry` has the wait-branch block guarded by `_anyPriorityHasHeadroom`
- [ ] `lib/scheduler.ts` `createScheduler` applies `max_wait_minutes: 90` default via spread-merge
- [ ] `lib/types.ts` `SchedulerConfig.max_wait_minutes` field exists
- [ ] `lib/autoresearch.ts` `_spawnClaude` is async and routes through scheduler when `!captureOutput`
- [ ] `lib/autoresearch.ts` `_spawnClaudeSync` is the renamed synchronous fallback
- [ ] `lib/autoresearch.ts` call sites at ~line 402 and ~line 455 use `await _spawnClaude(...)` with `scheduler` in opts
- [ ] `lib/autoresearch.ts` main loop is async with `scheduler` in its options
- [ ] `lib/autoresearch.ts` `_spawnClaude` is in `module.exports`
- [ ] `bin/grd-tools.ts` autoresearch dispatch creates a scheduler, passes it to `runAutoResearch`, and awaits the result
- [ ] `tests/unit/scheduler-wait.test.ts` — 6 tests passing
- [ ] `tests/unit/scheduler-recovery.test.ts` — 10 tests passing
- [ ] `tests/unit/scheduler-spawn-wait.test.ts` — 2 smoke tests passing
- [ ] `tests/integration/autoresearch-scheduler.test.ts` — 4 tests passing
- [ ] `jest.config.js` per-file threshold for `lib/scheduler-wait.ts`
- [ ] `CLAUDE.md` scheduler reference mentions `max_wait_minutes` (if applicable)
- [ ] `docs/CHANGELOG.md` Unreleased entry added
- [ ] `npm test` passes (no regressions, ~22 new tests)
- [ ] `npm run lint` passes
- [ ] `npm run build:check` passes
- [ ] `npm run format:check` passes (only spec 2A files formatted)
- [ ] `gd scan --all` exits 0

---

## Out of scope (follow-up items)

These were explicitly deferred during brainstorming and must NOT be added to this plan:

- **Retry-after header parsing from 429 error messages.** The sample-based recovery is sufficient; parsing per-backend retry-after formats is a follow-up.
- **Extending `SchedulerSpawnResult` to include `stdout`.** Would let autoresearch's `captureOutput: true` path route through the scheduler too. Tracked in CHANGELOG known limitations.
- **Spec 2B: per-spawn idle timeout watchdog.** Only pursue if Spec 2A does not eliminate the observed "agent hangs" symptom.
- **Wiring `autopilot.ts` `spawnClaudeAsync` ternary fallbacks through the scheduler.** Those are intentional opt-out paths.
- **Wiring the autopilot Overstory sling path** (`autopilot.ts:1667`). Intentional bypass per existing comment.
- **Refactoring `lib/autopilot.ts` (2,534-line monolith).** Architectural project worth its own spec.
- **NERFIFY context/refinement/benchmark wire-up.** Those files do not spawn Claude; NERFIFY labels are methodology references.
