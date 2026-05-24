# Task B2: `--time-budget 0` should mean unlimited

## Bucket

Bug-fix.

## Symptom

`lib/scheduler.ts` exposes a `spawnWithTimeout(opts)` helper. The
`opts.timeout` field is documented as "milliseconds; 0 = unlimited".

The current implementation handles `opts.timeout` via
`opts.timeout || DEFAULT_TIMEOUT_MS`. When the caller explicitly
passes `0` (meaning "no timeout"), the falsy-coalesce treats it the
same as `undefined` and applies the 2-hour default.

Result: passing `--time-budget 0` to the CLI silently still applies
a 2-hour timer, contradicting the documented contract.

## Expected fix

Distinguish missing (`undefined`) from explicit `0`. When `0`, set
the total-timeout timer to `null` (no timer) — only the idle
watchdog applies. When `undefined`, use the default.

```ts
const totalTimeoutMs =
  opts.timeout === 0
    ? null
    : (typeof opts.timeout === 'number' ? opts.timeout : DEFAULT_TIMEOUT_MS);
```

Skip the `setTimeout` call entirely when `totalTimeoutMs === null`.

## Files

- `lib/scheduler.ts` — `spawnWithTimeout` function

## Reference

Codex r7 P2 against autoresearch. Identical pattern: r9 caught the
same falsy-coalesce bug at sibling callsites (survey + deep-dive
spawns).
