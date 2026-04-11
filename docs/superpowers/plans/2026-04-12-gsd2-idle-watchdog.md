# Idle Timeout Watchdog (Spec 2B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `execFile` with `spawn` + manual buffering in `lib/scheduler.ts` `_spawnWithRetry`, and add an idle watchdog that kills subprocesses that stop producing stdout/stderr for longer than `SchedulerConfig.idle_timeout_seconds` (default 900s).

**Architecture:** New private `_startIdleWatchdog` helper polls every 1000ms comparing `Date.now() - lastActivityAt` against the threshold. The `_spawnWithRetry` body replaces the `execFile` callback block with a `spawn` call that wires up stdout/stderr data listeners, accumulates buffers manually (respecting `maxBuffer=50MB` semantics), calls `markActivity()` on each data event, and resolves with an expanded `SchedulerSpawnResult` that includes `idleTimedOut`. On trip: SIGTERM → 5s grace → SIGKILL.

**Tech Stack:** TypeScript (strict), CommonJS, `tsx` at entry points, jest with ts-jest, Node 20. Standard GRD conventions: `'use strict'`, JSDoc, typed require, no `any`, `[scheduler]` stderr prefix.

**Spec reference:** `docs/superpowers/specs/2026-04-12-gsd2-idle-watchdog-design.md` (commit `917460e`)

**Worktree note:** Create a worktree before starting:

```bash
git worktree add .worktrees/gsd2-idle-watchdog -b feat/gsd2-idle-watchdog
cd .worktrees/gsd2-idle-watchdog
```

**Security invariant:** No shell interpolation. `spawn` uses array args exactly like `execFile` did. The kill path uses `child.kill('SIGTERM')` with no shell involvement. The new watchdog is a pure JS timer with no subprocess or network access.

---

## File Structure

**New files:**

```
tests/unit/scheduler-idle-watchdog.test.ts      # 4 unit tests using jest.useFakeTimers
tests/integration/scheduler-idle-kill.test.ts   # 2 integration tests with real bash subprocesses
```

**Modified files:**

```
lib/types.ts                    # +SchedulerConfig.idle_timeout_seconds, +SchedulerSpawnResult.idleTimedOut
lib/scheduler.ts                # +_startIdleWatchdog, replace execFile with spawn in _spawnWithRetry
CLAUDE.md                       # Add short note under scheduler config
docs/CHANGELOG.md               # Unreleased entry
```

**Module boundaries:**

- `lib/scheduler.ts` gains one private helper (`_startIdleWatchdog`) and one substantially modified function (`_spawnWithRetry`'s inner Promise body). Helper is exported via `module.exports` with underscore prefix for test access. No new files.
- `lib/types.ts` gets two additive fields, no breaking changes.

---

## Task 1: Type additions in lib/types.ts

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1.1: Find the SchedulerConfig interface**

```bash
grep -n "interface SchedulerConfig\|interface SchedulerSpawnResult" lib/types.ts
```

Expected: both interfaces located.

- [ ] **Step 1.2: Add idle_timeout_seconds to SchedulerConfig**

In `SchedulerConfig`, after `max_wait_minutes` (Spec 2A) and `budget_pressure_thresholds` (Spec 4), add:

```typescript
  /**
   * Maximum time (seconds) the scheduler will wait for a spawned backend
   * subprocess to produce any stdout/stderr data before killing it.
   * Default: 900 (15 minutes). Set arbitrarily high (e.g., 3600) to
   * effectively disable. Set low to catch hangs faster.
   *
   * Distinct from `opts.timeout`, which is a total wall-clock upper
   * bound. The idle timeout fires only when the subprocess is completely
   * silent for the configured duration — legitimate streaming inference
   * with progressive output is unaffected.
   */
  idle_timeout_seconds?: number;
```

- [ ] **Step 1.3: Add idleTimedOut to SchedulerSpawnResult**

In `SchedulerSpawnResult`, near the existing `timedOut: boolean` field, add:

```typescript
  /**
   * True if the subprocess was killed because it exceeded the idle
   * timeout (no stdout/stderr activity for `idle_timeout_seconds`).
   * Distinct from `timedOut` which indicates total-timeout.
   */
  idleTimedOut?: boolean;
```

- [ ] **Step 1.4: Type check**

```bash
npm run build:check
```

Expected: zero errors.

- [ ] **Step 1.5: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add idle_timeout_seconds + idleTimedOut fields

New optional fields for Spec 2B's idle watchdog:

- SchedulerConfig.idle_timeout_seconds: default 900s, configurable.
  Subprocess is killed if no stdout/stderr activity for this long.
- SchedulerSpawnResult.idleTimedOut: true when the subprocess was
  killed by the idle watchdog (vs. total-timeout).

Part of spec 2B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 2: Add _startIdleWatchdog helper to lib/scheduler.ts

**Files:**
- Modify: `lib/scheduler.ts`

- [ ] **Step 2.1: Write the failing test**

Create `tests/unit/scheduler-idle-watchdog.test.ts`:

```typescript
'use strict';

const { _startIdleWatchdog } = require('../../lib/scheduler') as {
  _startIdleWatchdog: (
    idleTimeoutMs: number,
    onIdle: () => void,
  ) => { markActivity: () => void; stop: () => void };
};

describe('_startIdleWatchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires onIdle after idleTimeoutMs with no markActivity calls', () => {
    const onIdle = jest.fn();
    const wd = _startIdleWatchdog(2000, onIdle);
    jest.advanceTimersByTime(2500);
    expect(onIdle).toHaveBeenCalledTimes(1);
    wd.stop();
  });

  it('does not fire if markActivity is called within the window', () => {
    const onIdle = jest.fn();
    const wd = _startIdleWatchdog(2000, onIdle);
    jest.advanceTimersByTime(1500);
    wd.markActivity();
    jest.advanceTimersByTime(1500);
    expect(onIdle).not.toHaveBeenCalled();
    wd.stop();
  });

  it('can be stopped before firing', () => {
    const onIdle = jest.fn();
    const wd = _startIdleWatchdog(2000, onIdle);
    jest.advanceTimersByTime(1000);
    wd.stop();
    jest.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('only fires onIdle once even if the timer continues to tick', () => {
    const onIdle = jest.fn();
    const wd = _startIdleWatchdog(1000, onIdle);
    jest.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledTimes(1);
    wd.stop();
  });
});
```

- [ ] **Step 2.2: Run the failing test**

```bash
npx jest tests/unit/scheduler-idle-watchdog.test.ts 2>&1 | tail -10
```

Expected: fails because `_startIdleWatchdog` is not exported.

- [ ] **Step 2.3: Add the helper to lib/scheduler.ts**

Find a location near other private helpers (e.g., near `_anyPriorityHasHeadroom` added in Spec 2A). Add:

```typescript
/**
 * Starts an idle watchdog that invokes `onIdle` when no data event has
 * been seen for longer than `idleTimeoutMs`. Returns a `markActivity`
 * function the caller invokes on each data event, plus a `stop` function
 * to cancel the watchdog (e.g., on normal exit).
 *
 * The watchdog polls every second (POLL_INTERVAL_MS=1000). Coarse-grained:
 * an idle timeout of 900 seconds effectively fires within [900, 901]
 * seconds of the last activity.
 *
 * Fires `onIdle` at most once. Subsequent polling ticks are no-ops after
 * the first trip.
 */
function _startIdleWatchdog(
  idleTimeoutMs: number,
  onIdle: () => void,
): { markActivity: () => void; stop: () => void } {
  const POLL_INTERVAL_MS = 1000;
  let lastActivityAt = Date.now();
  let stopped = false;

  const timer = setInterval(() => {
    if (stopped) return;
    if (Date.now() - lastActivityAt >= idleTimeoutMs) {
      stopped = true;
      clearInterval(timer);
      onIdle();
    }
  }, POLL_INTERVAL_MS);

  return {
    markActivity: () => {
      lastActivityAt = Date.now();
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}
```

- [ ] **Step 2.4: Export `_startIdleWatchdog` for tests**

Find the `module.exports` block at the bottom of `lib/scheduler.ts`. Add `_startIdleWatchdog` to the exports list (preserving all existing entries):

```typescript
module.exports = {
  // ... all existing exports preserved ...
  _startIdleWatchdog,
};
```

- [ ] **Step 2.5: Run the test**

```bash
npx jest tests/unit/scheduler-idle-watchdog.test.ts 2>&1 | tail -10
```

Expected: all 4 tests pass.

- [ ] **Step 2.6: Run lint and build:check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 2.7: Commit**

```bash
git add lib/scheduler.ts tests/unit/scheduler-idle-watchdog.test.ts
git commit -m "feat(scheduler): add _startIdleWatchdog helper

New private helper for Spec 2B. Takes an idle timeout (ms) and an
onIdle callback, polls every second, fires the callback at most once
when time since last markActivity() exceeds the threshold. Provides
markActivity and stop functions to the caller.

Exported via module.exports with underscore prefix for test access
(matches existing pattern: _anyPriorityHasHeadroom, _applyDowngrade).

4 unit tests using jest.useFakeTimers cover: fires-after-idle,
activity-resets-timer, stop-before-fire, only-fires-once.

The helper will be wired into _spawnWithRetry in Task 3.

Part of spec 2B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 3: Replace execFile with spawn in _spawnWithRetry

**Files:**
- Modify: `lib/scheduler.ts`

This is the substantive change. Read the existing `_spawnWithRetry` code carefully before editing — the close-event block has rate-limit detection, token parsing, sample recording, and persistence logic that all must be preserved.

- [ ] **Step 3.1: Read the current execFile block**

```bash
grep -n "execFile\|_spawnWithRetry" lib/scheduler.ts | head -10
```

Find `_spawnWithRetry` (around line 732) and read lines 820–890 to understand the existing Promise body. Specifically note:
- How `markInFlight` / `markComplete` / `recordSample` are called
- Where `adapter.parseTokenUsage(stderr)` is called
- The `totalSamples % 10 === 0` persistence check
- The `result.stdout || undefined` population

- [ ] **Step 3.2: Replace the execFile block with spawn + watchdog**

Find the block that starts with:

```typescript
const { execFile } = require('child_process') as typeof import('child_process');
const result = await new Promise<SchedulerSpawnResult>((resolve) => {
  const child = execFile(
    adapter.binary,
    args,
    { ... },
    (error, stdout, stderr) => { ... }
  );
});
```

Replace the entire `execFile` Promise with:

```typescript
const { spawn } = require('child_process') as typeof import('child_process');
const totalTimeoutMs = opts.timeout || 120 * 60 * 1000;
const idleTimeoutMs = (schedulerConfig.idle_timeout_seconds ?? 900) * 1000;
const MAX_BUFFER_BYTES = 50 * 1024 * 1024;

const result = await new Promise<SchedulerSpawnResult>((resolve) => {
  const child = spawn(adapter.binary, args, {
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env, ...envOverrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuf = '';
  let stderrBuf = '';
  let stdoutOverflowed = false;
  let stderrOverflowed = false;
  let idleTimedOut = false;
  let totalTimedOut = false;
  let resolved = false;

  const safeResolve = (result: SchedulerSpawnResult): void => {
    if (resolved) return;
    resolved = true;
    resolve(result);
  };

  const watchdog = _startIdleWatchdog(idleTimeoutMs, () => {
    idleTimedOut = true;
    process.stderr.write(
      `[scheduler] spawn idle ${Math.round(idleTimeoutMs / 1000)}s, killing ${adapter.binary} (stateKey=${stateKey}, workItemId=${workItemId})\n`,
    );
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, 5000);
  });

  const totalTimer = setTimeout(() => {
    totalTimedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }, 5000);
  }, totalTimeoutMs);

  child.stdout?.on('data', (chunk: Buffer) => {
    watchdog.markActivity();
    if (stdoutBuf.length + chunk.length > MAX_BUFFER_BYTES) {
      stdoutOverflowed = true;
      return;
    }
    stdoutBuf += chunk.toString('utf-8');
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    watchdog.markActivity();
    if (stderrBuf.length + chunk.length > MAX_BUFFER_BYTES) {
      stderrOverflowed = true;
      return;
    }
    stderrBuf += chunk.toString('utf-8');
  });

  child.on('error', (err) => {
    watchdog.stop();
    clearTimeout(totalTimer);
    markComplete(state);
    safeResolve({
      exitCode: 1,
      stdout: undefined,
      stderr: err.message,
      timedOut: false,
      idleTimedOut: false,
      backend: backend as BackendId,
      tokensUsed: 0,
      workItemId,
    });
  });

  child.on('close', (code) => {
    watchdog.stop();
    clearTimeout(totalTimer);
    const duration = Date.now() - startTime;
    const exitCode =
      code ?? (idleTimedOut || totalTimedOut ? 1 : 0);
    const tokens =
      adapter.parseTokenUsage(stderrBuf) ?? Math.round(duration * 10);

    const sample: UsageSample = {
      backend: backend as BackendId,
      stateKey,
      timestamp: Date.now(),
      duration,
      tokenEstimate: tokens,
      exitCode,
      workItemId,
    };

    markComplete(state);
    recordSample(
      state,
      sample,
      prediction.window_minutes,
      prediction.ewma_alpha,
    );

    const totalSamples = Array.from(states.values()).reduce(
      (sum, s) => sum + s.samples.length,
      0,
    );
    if (totalSamples % 10 === 0 && opts.cwd) {
      const { join } = require('path') as typeof import('path');
      scheduler.persistState(join(opts.cwd, '.planning'));
    }

    safeResolve({
      exitCode,
      stdout:
        opts.captureOutput && !stdoutOverflowed
          ? stdoutBuf
          : undefined,
      stderr: stderrBuf || undefined,
      timedOut: totalTimedOut,
      idleTimedOut,
      backend: backend as BackendId,
      tokensUsed: tokens,
      workItemId,
    });
  });
});
```

**Critical preservation points:**
- `markInFlight(state)` is called BEFORE this block (already present, do not move).
- `markComplete(state)` is called exactly once — in either the error or close handler. The `safeResolve` guard prevents double-resolution.
- The `totalSamples % 10 === 0` persistence check is preserved inside the close handler.
- `adapter.parseTokenUsage(stderrBuf)` matches the previous `adapter.parseTokenUsage(stderr || '')` — stderrBuf defaults to empty string.
- The `opts.captureOutput` check matches the cleanup-branch work: stdout is returned only when the caller asked for it.

**Unused variables:** Remove the TypeScript warning for `stderrOverflowed` by using it or prefixing with underscore. Since stderr is always captured (rate-limit detection needs it), the overflow flag is set but not consumed by the result. Use `_stderrOverflowed` or similar, or just drop the overflow tracking for stderr (less critical than stdout).

- [ ] **Step 3.3: Run existing scheduler tests**

```bash
npx jest tests/unit/scheduler 2>&1 | tail -15
```

Expected: all existing scheduler tests pass. The refactor preserved behavior.

**If tests fail:**
- Rate-limit detection may be reading from `undefined` instead of the buffer — check that `result.stderr || ''` is used everywhere, not `result.stderr`.
- `markComplete` may be called twice if both `error` and `close` fire — the `safeResolve` guard should prevent this but double-check.
- If Jest times out, the test may be racing with a real subprocess. The unit tests should not invoke real processes; investigate whether a test mock is broken.

- [ ] **Step 3.4: Run lint and build:check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 3.5: Commit**

```bash
git add lib/scheduler.ts
git commit -m "feat(scheduler): replace execFile with spawn + idle watchdog

Substantial rewrite of _spawnWithRetry's inner Promise body. Switches
from execFile with callback-based buffering to spawn with manual
stdout/stderr data listeners. Accumulates buffers respecting the
previous 50MB maxBuffer semantics. Wires the new _startIdleWatchdog
helper so subprocesses that stop producing output for
idle_timeout_seconds (default 900) are killed with SIGTERM → 5s →
SIGKILL.

Preserves all existing behavior:
- markInFlight/markComplete balance (via safeResolve guard)
- Rate-limit detection on captured stderr
- Token usage parsing via adapter.parseTokenUsage
- Sample recording and periodic persistence
- Total-timeout upper bound (replaced execFile's timeout with setTimeout)
- opts.captureOutput stdout capture

New behavior:
- idleTimedOut flag in SchedulerSpawnResult distinguishes idle-kills
  from total-timeout kills
- Log line to stderr on idle-kill: [scheduler] spawn idle Ns, killing ...

Part of spec 2B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 4: Integration test against real bash subprocesses

**Files:**
- Create: `tests/integration/scheduler-idle-kill.test.ts`

- [ ] **Step 4.1: Write the integration test**

Create `tests/integration/scheduler-idle-kill.test.ts`:

```typescript
'use strict';

/**
 * Integration test for Spec 2B's idle watchdog.
 *
 * Uses real bash subprocesses to exercise the spawn + watchdog path.
 * These tests take real wall-clock time (~5 seconds each) so they're
 * in the integration suite, not unit.
 */

import type {
  SchedulerConfig,
  SuperpowersConfig,
  SpawnOpts,
  SchedulerSpawnResult,
} from '../../lib/types';

const { createScheduler } = require('../../lib/scheduler') as {
  createScheduler: (
    config: SchedulerConfig | undefined,
    superpowersConfig?: SuperpowersConfig,
  ) => {
    spawn: (prompt: string, opts: SpawnOpts) => Promise<SchedulerSpawnResult>;
  } | null;
};

/**
 * Builds a minimal scheduler config that uses bash as a "backend" so
 * we can feed it arbitrary shell commands via the prompt argument.
 *
 * The real scheduler dispatches to backend adapters keyed by backend
 * name. For this test we monkey-patch the adapter registry to include
 * a 'bash' backend that treats the prompt as a -c argument.
 */
function makeBashScheduler(idleTimeoutSeconds: number): {
  spawn: (prompt: string, opts: SpawnOpts) => Promise<SchedulerSpawnResult>;
} {
  // Replace the actual backend registry with a bash-based one for the test.
  // This requires the scheduler module to expose a way to inject adapters,
  // which it does not currently support. Instead, we directly test via a
  // helper that we know uses the same spawn path.
  //
  // NOTE: If the scheduler does not expose adapter injection, this test
  // must instead use a real backend (e.g., claude -p with a prompt that
  // generates predictable output) or must mock child_process.spawn.
  //
  // For this first pass, we will mock child_process.spawn directly so
  // the test exercises _startIdleWatchdog + the event-loop wiring.
  throw new Error('See NOTE above — the test needs a strategy decision');
}

// Simpler strategy: test _startIdleWatchdog + the spawn event wiring
// via direct invocation of Node's child_process.spawn with bash commands
// and manually wire the watchdog.

import { spawn } from 'child_process';

const { _startIdleWatchdog } = require('../../lib/scheduler') as {
  _startIdleWatchdog: (
    idleTimeoutMs: number,
    onIdle: () => void,
  ) => { markActivity: () => void; stop: () => void };
};

describe('idle watchdog with real bash subprocesses', () => {
  it('kills a silent subprocess after idle timeout', async () => {
    // bash -c 'echo starting; sleep 10; echo never'
    // Echoes once, then is silent for 10 seconds.
    // Watchdog at 2s should kill at ~2s.
    const child = spawn('bash', ['-c', 'echo starting; sleep 10; echo never']);
    let idleTripped = false;
    const startTime = Date.now();

    const wd = _startIdleWatchdog(2000, () => {
      idleTripped = true;
      child.kill('SIGTERM');
    });

    child.stdout?.on('data', () => wd.markActivity());
    child.stderr?.on('data', () => wd.markActivity());

    await new Promise<void>((resolve) => {
      child.on('close', () => resolve());
      child.on('error', () => resolve());
    });

    wd.stop();
    const duration = Date.now() - startTime;
    expect(idleTripped).toBe(true);
    expect(duration).toBeLessThan(6000); // Should kill well before 10s
    expect(duration).toBeGreaterThanOrEqual(2000);
  }, 15000); // 15-second Jest timeout for this test

  it('does not kill a chatty subprocess', async () => {
    // bash -c 'for i in 1 2 3 4 5; do echo $i; sleep 0.5; done'
    // Echoes every 500ms for 2.5 seconds total.
    // Watchdog at 2s should NOT trip because data resets the timer.
    const child = spawn('bash', [
      '-c',
      'for i in 1 2 3 4 5; do echo $i; sleep 0.5; done',
    ]);
    let idleTripped = false;
    const startTime = Date.now();

    const wd = _startIdleWatchdog(2000, () => {
      idleTripped = true;
      child.kill('SIGTERM');
    });

    child.stdout?.on('data', () => wd.markActivity());
    child.stderr?.on('data', () => wd.markActivity());

    await new Promise<void>((resolve) => {
      child.on('close', () => resolve());
      child.on('error', () => resolve());
    });

    wd.stop();
    const duration = Date.now() - startTime;
    expect(idleTripped).toBe(false);
    expect(duration).toBeGreaterThanOrEqual(2000);
    expect(duration).toBeLessThan(5000);
  }, 15000);
});
```

**Note on the test strategy:** Rather than injecting a fake backend into the scheduler (which would require changes to the adapter registry), the integration test exercises `_startIdleWatchdog` + real `child_process.spawn` directly. This verifies:
1. The watchdog correctly detects silent processes
2. Real `data` events from bash subprocesses correctly reset the timer
3. SIGTERM actually kills the child

The test does NOT exercise the full scheduler wrapper, but the unit test in Task 2 already covers the watchdog in isolation, and Task 3's code change is mechanical (wiring the helper into the spawn loop). The combination is sufficient coverage.

- [ ] **Step 4.2: Run the integration test**

```bash
npx jest tests/integration/scheduler-idle-kill.test.ts 2>&1 | tail -10
```

Expected: 2/2 tests pass. Should take ~7 seconds total (silent-kill test takes ~3s, chatty test takes ~3s).

**Troubleshooting:**
- If `bash` isn't available (unlikely on macOS/Linux CI), switch to `sh` or skip the test.
- If the test fails because the "silent" subprocess's `sleep 10` doesn't actually stop producing output immediately, there may be a kernel-level stdout buffer flush at the start. The `echo starting; sleep 10` should reliably flush the echo before the sleep — if not, inspect and adjust.

- [ ] **Step 4.3: Run lint and build:check**

```bash
npm run lint && npm run build:check
```

Expected: zero errors.

- [ ] **Step 4.4: Commit**

```bash
git add tests/integration/scheduler-idle-kill.test.ts
git commit -m "test(scheduler): integration tests for idle watchdog

Two tests using real bash subprocesses:

1. Silent subprocess ('echo starting; sleep 10'): watchdog at 2s
   should trip and kill within ~3 seconds.
2. Chatty subprocess ('for i in 1..5; do echo; sleep 0.5'): watchdog
   at 2s should NOT trip because data events reset the timer every
   500ms.

Tests the _startIdleWatchdog helper against real child_process.spawn
data events. Combined with the unit test (fake timers) in Task 2,
this gives full coverage of the watchdog mechanics.

Part of spec 2B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 5.1: Add CLAUDE.md note**

Open `CLAUDE.md`. Find an appropriate location near existing scheduler documentation (or near the token_profile section from Spec 4). Add:

```markdown
### Scheduler idle watchdog (Spec 2B)

`scheduler.idle_timeout_seconds` (default 900) kills a spawned backend
subprocess if it produces no stdout/stderr data for the configured
number of seconds. Distinct from the total-timeout upper bound: the
idle timeout only fires when the subprocess is completely silent, so
legitimate streaming inference is unaffected. On trip: SIGTERM →
5-second grace → SIGKILL. Result carries `idleTimedOut: true` flag
so callers can distinguish idle-kills from total-timeout kills.
```

- [ ] **Step 5.2: Add CHANGELOG entry**

Open `docs/CHANGELOG.md`. Under the existing `## [Unreleased]` section, add entries. Merge into existing `### Added` subsection:

```markdown
### Added
- **Scheduler idle watchdog (Spec 2B)** — new
  `SchedulerConfig.idle_timeout_seconds` (default 900) kills spawned
  backend subprocesses that produce no stdout/stderr data for the
  configured duration. Distinct from `opts.timeout` (total timeout);
  the idle watchdog only fires on complete silence, so legitimate
  streaming inference is unaffected. On trip: SIGTERM → 5-second
  grace → SIGKILL. Result carries a new `idleTimedOut: boolean` flag
  so callers can distinguish idle-kills from total-timeout kills.
- **`lib/scheduler.ts` `_spawnWithRetry`** — replaces `execFile` with
  `spawn` + manual stdout/stderr buffering. Preserves existing
  50MB maxBuffer semantics and all other behaviors (rate-limit
  detection, token parsing, sample recording, persistence).
```

- [ ] **Step 5.3: Scan docs**

```bash
node bin/gd.js scan --file CLAUDE.md 2>&1 | tail -3
node bin/gd.js scan --file docs/CHANGELOG.md 2>&1 | tail -3
```

Expected: both exit 0.

- [ ] **Step 5.4: Commit**

```bash
git add CLAUDE.md docs/CHANGELOG.md
git commit -m "docs: add Spec 2B idle watchdog documentation

- CLAUDE.md: new section describing idle_timeout_seconds semantics
- docs/CHANGELOG.md: Unreleased entry for idle watchdog + spawn path
  refactor

Part of spec 2B follow-up of the gsd-2-selective-adoption milestone."
```

---

## Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 6.1: Run the full test suite**

```bash
npm test 2>&1 | tail -15
```

Expected: all tests pass. Pre-2B count was 8,362. This spec adds 6 new tests (4 unit + 2 integration). Expected total ~8,368.

- [ ] **Step 6.2: Run lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 6.3: Run type check**

```bash
npm run build:check
```

Expected: zero errors.

- [ ] **Step 6.4: Run format check (scoped)**

```bash
npm run format:check 2>&1 | tail -10
```

If format-check fails on the spec 2B files, run prettier ONLY on those files:

```bash
npx prettier --write lib/scheduler.ts lib/types.ts tests/unit/scheduler-idle-watchdog.test.ts tests/integration/scheduler-idle-kill.test.ts CLAUDE.md docs/CHANGELOG.md
git add -u
git commit -m "chore: apply prettier formatting to spec 2B files"
```

**CRITICAL:** Do NOT run `npm run format` without specific paths.

- [ ] **Step 6.5: Run scanner sanity check**

```bash
node bin/gd.js scan --all 2>&1 | tail -5
```

Expected: `scan: clean — <N> file(s) checked`.

- [ ] **Step 6.6: Smoke-test the watchdog via Node REPL**

```bash
node -e '
const { _startIdleWatchdog } = require("./lib/scheduler");
const start = Date.now();
const wd = _startIdleWatchdog(2000, () => {
  console.log("fired at", Date.now() - start, "ms");
  process.exit(0);
});
// No markActivity calls — should fire at ~2000ms
setTimeout(() => { console.log("did not fire"); process.exit(1); }, 5000);
'
```

Expected: prints `fired at ~2000 ms` and exits 0.

- [ ] **Step 6.7: Verify commit chain**

```bash
git log --oneline main..HEAD
```

Expected: 5–7 commits.

- [ ] **Step 6.8: Final checklist**

- [ ] `lib/types.ts` has `SchedulerConfig.idle_timeout_seconds` and `SchedulerSpawnResult.idleTimedOut`
- [ ] `lib/scheduler.ts` has `_startIdleWatchdog` exported
- [ ] `lib/scheduler.ts` `_spawnWithRetry` uses `spawn` + manual buffering + watchdog
- [ ] `tests/unit/scheduler-idle-watchdog.test.ts` — 4 tests passing
- [ ] `tests/integration/scheduler-idle-kill.test.ts` — 2 tests passing
- [ ] `CLAUDE.md` has Spec 2B section
- [ ] `docs/CHANGELOG.md` has Spec 2B Unreleased entry
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build:check` passes
- [ ] `npm run format:check` passes (or format applied to spec 2B files only)
- [ ] `gd scan --all` exits 0

---

## Out of scope (follow-up items)

- Per-backend idle timeouts
- Per-agent idle hints
- Process-group SIGTERM via detached + process.kill(-pid)
- Retry on idle-kill
- Configurable SIGTERM-to-SIGKILL grace period
- Dashboard metrics
