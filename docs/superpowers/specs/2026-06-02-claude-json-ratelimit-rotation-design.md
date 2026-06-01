# Claude JSON Decoding + Rate-Limit/Health Detection for Rotation — Design

> A live `gd research` run proved the account-rotation machinery is wired
> correctly but **blind**: the claude adapter detects rate limits from
> `exitCode` + `stderr`, while Claude Code reports limits, login failures, and
> success **all as exit-0 JSON**. So GRD never rotates off an exhausted or
> logged-out account, and never extracts the agent's text from the JSON event
> array. Spec date: 2026-06-02.

## Evidence (probes of the three real accounts)

`claude -p <prompt> --verbose --dangerously-skip-permissions --output-format json`
returns a **JSON array of events** (not a single object), e.g.
`[{type:"system"...}, {type:"rate_limit_event"...}, {type:"assistant"...}, {type:"result"...}]`.
Exit code is `0` in every case. The decisive fields on the `result` event and the
`rate_limit_event`:

| Account state | `result.is_error` | `rate_limit_info.status` | `result.result` |
|---|---|---|---|
| healthy (`~/.claude-personal2`) | `false` | `allowed` | the real answer |
| rate-limited (`~/.claude-personal1`) | `true` | `rejected` (+ `resetsAt`, `rateLimitType:"seven_day"`) | "You've hit your weekly limit · resets …" |
| logged-out (`~/.claude`) | `true` | (no event) | "Not logged in · Please run /login" |

`rate_limit_info.resetsAt` is **epoch seconds**. `rateLimitType` ∈ `five_hour` /
`seven_day`. A healthy account can still carry a `rate_limit_event` with
`status:"allowed"` — so presence of the event means nothing; **`status` is the
signal.**

## The two bugs

1. **Decode (Bug A):** `decodeSpawnStdout` (orchestrator.ts) only unwraps a single
   `{result}` object. The real output starts with `[` → it returns the raw array
   → `parseHypothesisOutput` finds no `__HYPOTHESIS__` → the loop errExits. Even a
   healthy account's output is unusable.
2. **Detect (Bug B):** `_claudeAdapter.isRateLimited(exitCode, stderr)` returns
   `false` whenever `exitCode === 0` — i.e. always, for these JSON limits. So the
   scheduler's retry/rotation/cooldown path (which already exists) never triggers.

## Design — parse once, in the adapter, where the backend is known

Add a claude-result parser and route both detection and text-extraction through
it. The scheduler already knows the backend, so it returns **clean text** to the
research loop and handles rotation internally.

### 1. `parseClaudeResult` (new, exported from `lib/scheduler.ts`)

```ts
interface ClaudeResult {
  text: string | null;       // result.result when not an error, else null
  isError: boolean;          // result.is_error === true
  rateLimited: boolean;      // any rate_limit_event with status === 'rejected'
  loggedOut: boolean;        // is_error && /not logged in|\/login/i.test(result)
  resetsAtMs: number | null; // rejected event's resetsAt * 1000
}
function parseClaudeResult(stdout: string): ClaudeResult;
```

- Accepts the `[...]` array **or** a single `{...}` object (back-compat) **or**
  plain text (returns `{text: raw, isError:false, rateLimited:false, …}` so
  non-JSON/other backends are unaffected).
- `rateLimited` = some event `type==='rate_limit_event'` with
  `rate_limit_info.status === 'rejected'`. `resetsAtMs` = `resetsAt × 1000` **only
  when `Number(resetsAt)` is finite and > 0** (accept numeric strings); otherwise
  `null` (Codex P2b). Past/invalid values → `null` (caller falls back to
  `now + window`).
- `text` = `result.result` when it's a string and `!isError`; if the array has no
  string `result.result`, fall back to concatenated `type:"assistant"` text
  content; final fallback = the raw input string (never silently `null` a healthy
  run — Codex P3a).
- Pure, total, never throws (wrap JSON.parse; non-JSON/plain input →
  `{text: raw, isError:false, rateLimited:false, loggedOut:false, resetsAtMs:null}`).

### 2. Scheduler spawn flow uses it (Bug B + cooldown)

In the claude spawn path (`_spawnWithRetry`, ~scheduler.ts:896-1180), after the
child exits, parse stdout once:

- If `rateLimited` (status rejected) **or** `isError && loggedOut`: treat the
  account as unavailable — set `state.cooldown_until` to `resetsAtMs` **only when
  it is a sane future timestamp** (`resetsAtMs > Date.now()`), else
  `now + max(window_minutes,5)*60_000` (the same floor the existing path uses);
  then **continue the existing retry/rotation loop** (recurse
  `_spawnWithRetry(retryCount+1)`, which re-resolves to a non-cooled account).
  Logged-out has no reset → `now + window`. The existing
  `retryCount >= maxRetries` guard (maxRetries = priority×maxAccounts) bounds the
  recursion, so a permanently-logged-out fleet terminates at the exhaustion path
  rather than looping forever.
- The existing `isRateLimited(exitCode, stderr)` stays as a fallback for non-zero
  exits / stderr-reported limits (other backends, crashes).
- If all priority accounts are exhausted, the existing exhaustion path returns as
  it does today (the loop surfaces an error).

The adapter gains a structured detector so the scheduler stays backend-agnostic:

```ts
// _claudeAdapter
detectFromStdout(stdout: string): { rateLimited: boolean; resetsAtMs: number | null; unhealthy: boolean } | null
```

Returns `null` for non-claude/plain output. `unhealthy` = `rateLimited ||
loggedOut`. Other adapters return `null` (no behavior change).

### 3. Clean exhaustion signal (Codex P1)

The scheduler does **NOT** mutate the returned `stdout` (other consumers —
autopilot, phase-complete-llm, autopilot-pipeline, autoresearch — all read it; a
global change risks them). Decoding stays in `decodeSpawnStdout` (§4). BUT the
exhaustion path is a problem: today `retryCount >= maxRetries` returns the last
subprocess result, which for claude is `exitCode: 0` + a rate-limit/login JSON —
a **false success**. When the last result was detected `unhealthy`, the scheduler
must return a **non-zero `exitCode`** (e.g. `1`) so callers see a failure rather
than parsing the limit message as agent output. (The research loop's
`defaultSpawn` ignores exitCode and parses stdout, so it would otherwise errExit
with the limit text as the reason — informative but mislabeled; a non-zero exit
lets callers distinguish "all accounts exhausted" from a content parse failure.)

### 4. `decodeSpawnStdout` handles the event array (Bug A)

Extend it to handle the `[...]` array (find `type:"result"` → string `.result`),
keeping the `{result}` and plain-text paths. This is where claude's text is
extracted for the research loop. If the array has no string `result.result`, fall
back to concatenated `type:"assistant"` text content, else return the raw string
(so a schema variation never nulls a healthy run — Codex P3a).

### 5. Wait/fallback respect `cooldown_until` (Codex P2a)

Two existing helpers ignore `cooldown_until`, so a long (`seven_day`) reset can
cause a wasted short wait or an early retry of a cooled account:
- `computeSoonestRecovery` (scheduler.ts:~436) considers only rolling token
  samples — extend it to also consider each account's `cooldown_until` (the
  soonest recovery is the min over sample-recovery **and** future cooldowns).
- the `free_fallback` selection in `resolveAccount` (scheduler.ts:~629) picks the
  first fallback account without a cooldown check — skip accounts whose
  `cooldown_until > now`, falling through to the empty-config_dir default if all
  are cooled.

## Files

- **Modify** `lib/scheduler.ts` — `parseClaudeResult` (exported) + `_claudeAdapter.detectFromStdout`; in the post-spawn path (1193), on claude `unhealthy` set `cooldown_until` (from clamped `resetsAtMs`, else `now+window`) and rotate via the existing recurse; coerce a non-zero `exitCode` when returning an unhealthy result at exhaustion (P1); make `computeSoonestRecovery` + `free_fallback` selection respect `cooldown_until` (P2a). Does NOT mutate returned stdout.
- **Modify** `lib/research/orchestrator.ts` — `decodeSpawnStdout` unwraps the event array → result text (Bug A).
- **Modify** `tests/unit/scheduler.test.ts`, `tests/unit/research/orchestrator.test.ts`.

## Testing strategy

Fixtures = the three real probe shapes (healthy / rate-limited / logged-out),
captured as small JSON arrays in the test.

- `parseClaudeResult`: healthy → `{text:'PROBE_OK', isError:false, rateLimited:false}`; rate-limited → `{isError:true, rateLimited:true, resetsAtMs: <secs*1000>, text:null}`; logged-out → `{isError:true, loggedOut:true, rateLimited:false}`; a `status:"allowed"` event → `rateLimited:false`; single `{result}` object → text; plain text → passthrough; garbage → `{text:<raw>, isError:false}` (no throw).
- `detectFromStdout`: rejected event → `{rateLimited:true, resetsAtMs:set, unhealthy:true}`; logged-out → `{unhealthy:true, rateLimited:false}`; healthy → `{unhealthy:false}`; non-claude → `null`.
- **scheduler rotation** (injected fake adapter/spawn): two accounts, first returns a rate-limited array, second returns healthy → `spawn` resolves with the healthy account's decoded text and the first account's `cooldown_until` ≈ `resetsAtMs`; all-rejected → exhaustion error as today.
- **scheduler exhaustion (P1):** two accounts both returning rate-limited arrays → after retries the resolved `SchedulerSpawnResult.exitCode` is non-zero (not a false `0`).
- **computeSoonestRecovery (P2a):** an account with a far-future `cooldown_until` and no samples → recovery reflects the cooldown; `resolveAccount` fallback skips a cooled fallback account.
- `decodeSpawnStdout`: array with a string `result` event → returns the result text; array with only assistant content → returns that; `{result}` and plain text unchanged.
- Existing scheduler + orchestrator suites stay green.

## Non-Goals

- Auto-`/login` or credential management (the logged-out `~/.claude` is the user's
  to fix; we just rotate past it).
- Changing other backends' detection (codex/gemini/opencode keep stderr-based
  detection; `detectFromStdout` returns `null` for them).
- Streaming/`stream-json` incremental parsing — we parse the completed stdout.

## Operational note (not code)

Right now only `~/.claude-personal2` is healthy; `~/.claude` is logged out and
`~/.claude-personal1` is weekly-limited (resets Jun 5). After this fix, rotation
will skip the first two and land on personal2. The `.planning/config.json`
`superpowers`/`scheduler` block used to validate this is machine-specific and is
**not committed**.
