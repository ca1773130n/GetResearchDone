---
milestone: gsd-2-selective-adoption
spec: 2B (follow-up)
status: approved
date: 2026-04-12
owner: cameleon-x
---

# Per-spawn idle timeout watchdog

## Milestone context

Follow-up to Spec 2A (autopilot rate-limit hang fix, commit `9153052`). The original milestone plan deferred 2B pending observation of whether 2A's rate-limit recovery also eliminated the broader "agent hangs" symptom. The user directed completion of all deferred specs after the main four shipped, so this spec proceeds without the empirical trigger.

Other specs in the milestone:
- Spec 1 (complete): Prompt injection scanner
- Spec 2A (complete): Autopilot rate-limit hang fix + autoresearch scheduler routing
- Spec 3 (complete): Mechanical phase completion
- Spec 4 (complete): Token optimization system
- Spec 3B (pending): LLM fallback for mechanical completion

## Problem

Spec 2A handles hangs caused by rate-limit exhaustion: the scheduler detects saturation and waits for sample aging to restore headroom. But a different class of hang exists — one where a spawned backend subprocess (`claude -p`, `codex`, `gemini`, etc.) becomes genuinely unresponsive for reasons unrelated to rate limits:

- Infinite loops inside the model's reasoning or tool-use iteration
- Waiting on an interactive prompt that never comes (rare for `-p` flags but possible with misconfigured tools)
- Deadlocks in concurrent tool calls
- Backend bugs that silently stop streaming

The scheduler's current safeguard is `execFile`'s built-in `timeout` option set to 120 minutes (7,200 seconds). For a process that's genuinely stuck, 120 minutes of wasted wall-clock time before a kill is unacceptable — especially in long autopilot runs where a single stuck phase can waste hours.

### What the current code does

`lib/scheduler.ts` `_spawnWithRetry` (lines 826–877) invokes the backend via `execFile` with a callback. `execFile` buffers stdout/stderr internally up to `maxBuffer` (50 MB) and resolves its callback when either the process exits OR the total `timeout` fires. There is no notion of "the process hasn't produced output for N seconds":

```typescript
const child = execFile(
  adapter.binary,
  args,
  {
    cwd: opts.cwd || process.cwd(),
    maxBuffer: 50 * 1024 * 1024,
    timeout: opts.timeout || 120 * 60 * 1000,  // ← total timeout, not idle
    env: { ...process.env, ...envOverrides },
  },
  (error, stdout, stderr) => { /* ... */ },
);
```

### What's needed

A mechanism that:
1. Watches the subprocess's stdout and stderr for `data` events
2. Tracks the timestamp of the most recent data event
3. Fires a kill if the gap between "now" and "last data" exceeds a configurable idle threshold
4. Preserves the existing total-timeout upper bound
5. Distinguishes idle-timeout kills from total-timeout kills so callers can react differently

## Goals

1. **Replace `execFile` callback with `spawn` + manual stdout/stderr accumulation** in `_spawnWithRetry`. The new code path collects stdout/stderr into local buffers (replicating the previous maxBuffer semantics), and attaches activity-reset hooks to both streams' data events.

2. **Add an idle watchdog timer** that starts when the child is spawned and resets on every data event from either stream. If the gap between `Date.now()` and `lastActivityAt` ever exceeds `idleTimeoutMs`, the watchdog kills the subprocess.

3. **Add `SchedulerConfig.idle_timeout_seconds?: number`** with a default of 900 (15 minutes). The default is chosen to be long enough that legitimate streaming inference does not trip it even for large prompts, but short enough to catch real hangs in under 15 minutes.

4. **Add `SchedulerSpawnResult.idleTimedOut?: boolean`** so callers can distinguish an idle-kill from a total-timeout kill or a normal exit.

5. **Graceful kill sequence:** when the watchdog trips, send `SIGTERM` first, wait 5 seconds for the subprocess to clean up, then `SIGKILL` if it is still alive.

6. **Log idle-trips to stderr** with the `[scheduler]` prefix, per GRD convention:
   `[scheduler] spawn idle 900s, killing claude (stateKey=claude/~/.claude, workItemId=task-12345)`

7. **Preserve all existing spawn-path behavior:**
   - Rate-limit detection on captured stderr
   - Token usage parsing via `adapter.parseTokenUsage(stderr)`
   - Sample recording via `recordSample` after the subprocess exits
   - `markInFlight`/`markComplete` balance
   - The retry loop for 429 detection
   - `SchedulerSpawnResult.stdout` population when `opts.captureOutput` is true (added in cleanup work)

8. **Ship with tests:**
   - Unit test for the idle-detection logic using a fake child with synthetic timing
   - Integration test against a real shell subprocess that stalls mid-execution (`bash -c 'echo hi; sleep 30'` with a 2-second idle timeout)

## Non-goals

- **Per-agent idle timeouts.** The scheduler has a single default. A future spec can expose per-backend or per-agent overrides if needed.
- **Configurable SIGTERM-to-SIGKILL grace period.** Hardcoded at 5 seconds. A longer grace risks orphaned processes under load.
- **Heartbeat-based detection** (e.g., polling `/proc/<pid>/stat`). Data events on the streams are the correct signal for CLI subprocesses that stream output to stdout.
- **Process tree cleanup.** Node's `child.kill()` only signals the direct child. Subprocesses spawned by the child are not killed. This matches the current `execFile` behavior and is not a regression. A future spec could add process-group signaling via `detached: true` + `process.kill(-pid)`, but that interacts with stdin/stdout handling and is out of scope.
- **Retries on idle-kill.** When the watchdog trips, the spawn returns a result with `idleTimedOut: true` and `exitCode: 1`. The retry loop in `_spawnWithRetry` does not automatically retry an idle-killed spawn — an idle hang is unlikely to resolve on retry.
- **`execFileSync` path in other code.** GRD has multiple places that use `execFileSync` for trusted short-lived commands (`git`, `which`, etc.). Those are not backend spawns and are out of scope.
- **Replacing `execFile` in tests, evolve, or autoresearch.** Only `_spawnWithRetry`'s inner spawn is affected. Autoresearch's `_spawnClaudeSync` fallback path uses a separate synchronous spawn that is not subject to this watchdog — acceptable because the sync path is only used when no scheduler is provided.
- **Changing the default total timeout from 120 minutes.** The existing `opts.timeout` stays as an upper bound.

## Architecture

### Overview

Inside `_spawnWithRetry`, replace the `execFile` invocation with a `spawn` call that wires up manual stream buffering and an idle watchdog. The Promise that wraps the child's exit event resolves with the same `SchedulerSpawnResult` shape as before, plus the new `idleTimedOut` flag.

The watchdog is a self-contained `setInterval` helper. It takes the child process, the idle timeout, and a kill callback. It polls every second (1000ms) to check if the gap between now and the last activity exceeds the threshold. On trip, it invokes the kill callback and clears itself.

All changes are localized to `_spawnWithRetry` in `lib/scheduler.ts`. No new files. No changes to the exported Scheduler API shape (the new `idleTimedOut` field is additive on an existing optional result field).

### File structure

**Modified files:**

```
lib/scheduler.ts       # +_startIdleWatchdog helper, replace execFile with spawn
lib/types.ts           # +SchedulerConfig.idle_timeout_seconds, +SchedulerSpawnResult.idleTimedOut
tests/unit/scheduler-idle-watchdog.test.ts   # new, ~4 tests
tests/integration/scheduler-idle-kill.test.ts  # new, ~2 tests
CLAUDE.md              # add idle_timeout_seconds note
docs/CHANGELOG.md      # Unreleased entry
```

**Module boundaries:**

- `lib/scheduler.ts` — the watchdog logic is a private helper (`_startIdleWatchdog`) inside the file. It takes the spawned child, the idle threshold, and a callback, and returns a cleanup function. The helper has one clear responsibility: watch for stream inactivity and trigger the callback when exceeded. It does NOT know about retries, samples, or rate limits — those concerns stay in `_spawnWithRetry`.
- `lib/types.ts` — two additive type changes, no breaking changes.
- New test files — isolated to the new behavior, do not touch existing test suites.

### The watchdog helper

```typescript
/**
 * Starts an idle watchdog that invokes `onIdle` when no data event has
 * been seen on stdout/stderr for longer than `idleTimeoutMs`. Returns a
 * `markActivity` function the caller invokes on each data event, plus
 * a `stop` function to cancel the watchdog (e.g., on normal exit).
 *
 * The watchdog polls every second (POLL_INTERVAL_MS=1000). This is a
 * coarse-grained check — an idle timeout of 900 seconds effectively
 * fires within [900, 901] seconds of the last activity.
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
      stopped = true;
      clearInterval(timer);
    },
  };
}
```

### The new spawn path in `_spawnWithRetry`

Replace the `execFile` callback block with:

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

  const watchdog = _startIdleWatchdog(idleTimeoutMs, () => {
    idleTimedOut = true;
    process.stderr.write(
      `[scheduler] spawn idle ${Math.round(idleTimeoutMs / 1000)}s, killing ${adapter.binary} (stateKey=${stateKey}, workItemId=${workItemId})\n`,
    );
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, 5000);
  });

  const totalTimer = setTimeout(() => {
    totalTimedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
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
    const duration = Date.now() - startTime;
    markComplete(state);
    resolve({
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
    const exitCode = code ?? (idleTimedOut || totalTimedOut ? 1 : 0);
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

    resolve({
      exitCode,
      stdout:
        opts.captureOutput && !stdoutOverflowed ? stdoutBuf : undefined,
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

**Key preservation points:**
- The existing `markInFlight`/`markComplete` balance is preserved (incremented before spawn, decremented exactly once in the close/error path).
- `recordSample` still runs with the same arguments.
- Rate-limit detection continues to work against `result.stderr` (the captured buffer now replaces `execFile`'s second callback argument).
- Total-timeout via `totalTimer` replaces `execFile`'s `timeout` option.
- Overflow handling (`MAX_BUFFER_BYTES`) matches `execFile`'s `maxBuffer` semantics: exceeding the buffer sets an overflow flag and discards subsequent data, rather than crashing.
- `opts.captureOutput` is honored: stdout is returned only when the caller asked for it, matching the cleanup work.

### New type fields

`lib/types.ts`:

```typescript
export interface SchedulerConfig {
  // ... existing fields ...
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
}

export interface SchedulerSpawnResult {
  // ... existing fields ...
  /**
   * True if the subprocess was killed because it exceeded the idle
   * timeout (no stdout/stderr activity for `idle_timeout_seconds`).
   * Distinct from `timedOut` which indicates total-timeout.
   */
  idleTimedOut?: boolean;
}
```

## Testing strategy

### Unit tests

`tests/unit/scheduler-idle-watchdog.test.ts` (new file, ~4 tests):

1. `_startIdleWatchdog fires onIdle after idleTimeoutMs with no markActivity calls`
2. `_startIdleWatchdog does not fire if markActivity is called within the window`
3. `_startIdleWatchdog can be stopped before firing`
4. `_startIdleWatchdog only fires once even if the timer continues to tick`

These test the pure watchdog helper in isolation — no child process involved. Use Jest's fake timers (`jest.useFakeTimers()`) to advance time synthetically.

**Important:** The watchdog must be exported (or accessed via `require('../../lib/scheduler')` with a test-only path). Since it's a private helper, one of these approaches:
- Export it from `module.exports` with an underscore prefix: `_startIdleWatchdog`
- Test it indirectly via the integration test (lower confidence, slower)

Prefer exporting with the underscore prefix. GRD convention already uses `_anyPriorityHasHeadroom`, `_applyDowngrade`, etc. for test-accessible helpers.

### Integration tests

`tests/integration/scheduler-idle-kill.test.ts` (new file, ~2 tests):

1. **Idle kill fires against a silent subprocess.** Configure an idle timeout of 2 seconds, spawn `bash -c 'echo starting; sleep 10; echo never'` (echoes once, then sleeps with no output for 10 seconds). The watchdog should trip at ~2 seconds and kill it. Assert `result.idleTimedOut === true`, `result.exitCode !== 0`, and total wall-clock is under 5 seconds.

2. **Idle kill does NOT fire against a chatty subprocess.** Spawn `bash -c 'for i in 1 2 3 4 5; do echo $i; sleep 0.5; done'` (echoes every 500ms for 2.5 seconds). With an idle timeout of 2 seconds, the watchdog should NOT trip because data events reset the timer every 500ms. Assert `result.idleTimedOut === undefined || false`, `result.exitCode === 0`.

These tests require a real subprocess and real wall-clock time. They're slower than unit tests but exercise the real integration. Use `bash` as the shell since it's available on macOS and Linux CI.

**Coverage gaps explicitly accepted:**
- We do NOT test the SIGTERM → SIGKILL escalation (the 5-second grace + hard kill). In practice SIGTERM works for well-behaved subprocesses, and testing the 5-second escalation would make the integration test slow.
- We do NOT test the interaction with the scheduler's retry loop (idle-killed spawns should NOT retry per spec). The non-retry behavior is implicit — `_spawnWithRetry` only retries on `adapter.isRateLimited`, not on `idleTimedOut`.
- We do NOT test behavior when `idle_timeout_seconds` is set to 0 or negative. Defensive coding: if the caller passes 0, the watchdog fires immediately on first poll. This is the caller's mistake, not a scheduler bug.

## Error handling

- **Child spawn fails (binary not found):** `child.on('error', ...)` fires, watchdog is stopped, `markComplete` is called, result returned with `exitCode: 1` and the error message in `stderr`. Matches existing behavior.
- **Subprocess exits normally before idle timeout:** `child.on('close', ...)` fires, watchdog is stopped, result returned with captured buffers. Matches existing behavior.
- **Stdout/stderr exceeds `MAX_BUFFER_BYTES`:** subsequent data is dropped; an overflow flag is set. The result is returned with the truncated buffer. No error thrown. Matches `execFile`'s `maxBuffer` semantics.
- **Idle watchdog fires:** SIGTERM is sent, 5-second grace period, then SIGKILL if still alive. The `close` event eventually fires, the result is returned with `idleTimedOut: true`.
- **Total timeout fires:** Same mechanism as idle kill but sets `totalTimedOut`/`timedOut` instead. The subprocess is killed, the close event fires, result returned.
- **Both timeouts fire simultaneously:** whichever fires first sets its flag; the second is effectively a no-op because the child is already dead. The `close` event handler still fires once.
- **Pre-existing SIGINT handling (from Spec 2A's scheduler-wait):** the `waitUntilOrAbort` primitive handles SIGINT for the wait-branch only. Spawned subprocesses don't inherit SIGINT handling via this spec — that would be a separate feature (process-group signals).

No silent fallbacks. Errors are captured in the result's `stderr` field and propagate to the caller via `SchedulerSpawnResult`.

## Rollout checklist

1. Add `SchedulerConfig.idle_timeout_seconds` and `SchedulerSpawnResult.idleTimedOut` to `lib/types.ts`.
2. Add `_startIdleWatchdog` helper to `lib/scheduler.ts` (export via `module.exports` with underscore prefix for tests).
3. Replace the `execFile` callback block in `_spawnWithRetry` with the new `spawn`-based block.
4. Create `tests/unit/scheduler-idle-watchdog.test.ts` with 4 tests using fake timers.
5. Create `tests/integration/scheduler-idle-kill.test.ts` with 2 tests using real bash subprocesses.
6. Run `npm test` — confirm no regressions.
7. Run `npm run lint` — zero errors.
8. Run `npm run build:check` — zero errors.
9. Update `CLAUDE.md` to document `idle_timeout_seconds`.
10. Add a `docs/CHANGELOG.md` Unreleased entry.

## Out of scope (follow-up items)

- **Per-backend idle timeouts** (different defaults for claude vs codex vs gemini).
- **Per-agent idle hints** (e.g., `grd-planner` might deserve a longer idle timeout than `grd-verifier`).
- **Process-group SIGTERM** via `detached: true` and `process.kill(-pid)`.
- **Retry on idle-kill** with exponential backoff.
- **Dashboard metrics** showing how often idle-kills fire in practice.
- **Configurable SIGTERM-to-SIGKILL grace period.**

## Attribution

Pattern inspired by Unix-style idle-timeout watchdogs in container orchestrators (Kubernetes `livenessProbe`, systemd `WatchdogSec`). Unlike those systems, this spec's watchdog uses stream data events as the heartbeat signal rather than explicit HTTP/command probes — appropriate for CLI subprocesses that stream output.

No code is ported. The pattern is the contribution.

## Related specs

- Spec 2A (complete): `2026-04-11-gsd2-autopilot-hardening-design.md` — scheduler wait-for-recovery
- Spec 4 (complete): `2026-04-11-gsd2-token-optimization-design.md` — model-tier routing
- Cleanup (complete, post-merge): extended `SchedulerSpawnResult.stdout` to carry captured output when `captureOutput: true`
