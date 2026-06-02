# Research Loop Spawn-Retry — Design

> A live run died mid-research because one `grd-experiment-runner` spawn returned
> empty (transient/flake) at DESIGN: `if (!parsedPlan) return errExit(...)`. A
> single transient empty/unparseable agent output should not kill a multi-
> iteration thread. Add bounded retries to the two parse-or-die spawns. Spec
> date: 2026-06-02.

## Goal

The cold HYPOTHESIZE (`grd-hypothesizer`) and DESIGN (`grd-experiment-runner`)
spawns currently `errExit` the whole thread the first time their output doesn't
parse (no `__HYPOTHESIS__` / `__PLAN__` block — including the empty/flaky case).
Retry each spawn up to `research_spawn_retries` times (default 2 → 3 attempts)
before giving up, then `errExit` with the LAST output excerpt. LEARN is
unchanged (it already degrades to defaults, never errExits).

## Background

- `lib/research/orchestrator.ts`:
  - HYPOTHESIZE (line ~257): `const hOut = await spawn(buildHypothesizePrompt(...),
    'grd-hypothesizer'); const parsed = parseHypothesisOutput(hOut); if (!parsed)
    return errExit(cwd, thread, '…__HYPOTHESIS__…Got: ' + excerpt(hOut));`
  - DESIGN (line ~271): `const pOut = await spawn(buildExperimentPrompt(thread,
    hyp, iterDir), 'grd-experiment-runner'); const parsedPlan = parsePlanOutput(
    pOut); if (!parsedPlan) return errExit(cwd, thread, '…__PLAN__…Got: ' +
    excerpt(pOut));`
- The scheduler already retries/rotates on **detected rate-limits**; this is a
  different failure — an exit-0 **empty or non-block** agent response (maxTurns,
  a declined/blank turn, a transient blip) that parses to `null`. Not a
  rate-limit signal, so it isn't rotated — it just kills the thread today.
- `parseHypothesisOutput`/`parsePlanOutput` (agent-io.ts) return `T | null`.
  `spawn: SpawnFn = (prompt, agentType) => Promise<string>`.

## Design

### P1 — don't retry real scheduler failures (`defaultSpawn` throws on nonzero exit)

`defaultSpawn` currently returns `decodeSpawnStdout(r.stdout || '')`, dropping
`r.exitCode`. After the rate-limit slice, the scheduler **coerces a nonzero
exitCode** when it exhausts rotation (all accounts rate-limited). If that comes
back as empty/non-block stdout, `spawnAndParse` would retry it — re-running the
whole rotation/wait up to 3× (amplifying a rate-limit storm). Fix: `defaultSpawn`
throws on a nonzero `r.exitCode` (`scheduler spawn failed (exit <n>) for
<agentType> — accounts may be rate-limited/exhausted`). A throw is NOT caught by
`spawnAndParse` (it only loops on parse-null), so it bubbles out immediately
(same as today's `no scheduler` error) — no retry amplification, clear message.
Retries therefore fire **only** on an exit-0 spawn whose output doesn't parse —
the genuine transient-empty case.

### The retry helper

```ts
async function spawnAndParse<T>(
  spawn: SpawnFn,
  prompt: string,
  agentType: string,
  parse: (stdout: string) => T | null,
  retries: number,
  beforeAttempt?: () => void,
): Promise<{ value: T | null; lastRaw: string }> {
  let lastRaw = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (beforeAttempt) beforeAttempt();
    lastRaw = await spawn(prompt, agentType);  // a hard scheduler failure throws → bubbles, no retry
    const value = parse(lastRaw);
    if (value) return { value, lastRaw };
  }
  return { value: null, lastRaw };
}
```

- Total attempts = `retries + 1`. Re-spawns the **same prompt** (agents are
  stateless per spawn). No artificial delay. Returns `lastRaw` so the eventual
  `errExit` keeps its diagnostic excerpt of the final failure.
- **P2 — DESIGN idempotency:** `buildExperimentPrompt` instructs the agent to
  write `run.sh`/`run.py`/`PLAN.md` into `iterDir` *before* emitting `__PLAN__`,
  and the runner later executes `plan.scriptPath` directly. A failed attempt can
  leave a stale/partial script. So the DESIGN call passes a `beforeAttempt` that
  best-effort removes `iterDir/{run.sh,run.py,PLAN.md}` before each attempt, so a
  later attempt (or the runner) can't pick up a previous attempt's artifacts.
  HYPOTHESIZE writes nothing, so it passes no `beforeAttempt`.
- Call sites:
  ```ts
  const r = await spawnAndParse(spawn, buildHypothesizePrompt(...), 'grd-hypothesizer', parseHypothesisOutput, retries);
  if (!r.value) return errExit(cwd, thread, `hypothesizer output not parseable — expected a __HYPOTHESIS__ block. Got: ${excerpt(r.lastRaw)}`);
  const parsed = r.value;
  // ...DESIGN identically with parsePlanOutput / 'grd-experiment-runner'
  ```
- `retries` is read once per `runLoop` from config: `readSpawnRetries(cwd)` (raw
  read, mirrors `readResurveyConfig`) → `research_spawn_retries`, default **2**,
  clamped to `[0, 5]` (0 = today's behavior; cap avoids runaway). Registered in
  `KNOWN_CONFIG_KEYS`. **P3:** treat the raw value as a number ONLY when
  `typeof === 'number' && Number.isFinite` — `null`/`false`/strings/objects →
  default 2 (NOT `Number()`-coerced to 0, which would silently disable retries).

## Files

- **Modify** `lib/research/orchestrator.ts` — add `spawnAndParse` (with `beforeAttempt`) + `readSpawnRetries`; use at the two sites (DESIGN passes the iterDir-cleanup `beforeAttempt`); thread `retries` from `runLoop`; make `defaultSpawn` throw on nonzero `r.exitCode` (P1).
- **Modify** `lib/utils.ts` — register `research_spawn_retries`.
- **Modify** `tests/unit/research/orchestrator.test.ts`.
- **Modify** `CLAUDE.md` — note the retry in the loop description.

## Testing strategy

- `spawnAndParse` (exported): a spawn returning `''` twice then a valid block,
  with `retries:2` → returns the parsed value and called spawn 3×; always-empty
  with `retries:2` → `{value:null}` after 3 calls; valid on the first call →
  1 call; `retries:0` → 1 call (today's behavior); a spawn that THROWS → the
  throw propagates (not retried, not swallowed); `beforeAttempt` is called once
  per attempt (assert call count matches).
- `readSpawnRetries`: default 2; reads `research_spawn_retries`; clamps `-1→0`,
  `99→5`; `null`/`false`/`"x"` → 2 (NOT 0).
- `defaultSpawn` (or its throw behavior): a scheduler stub whose `spawn` returns
  `{exitCode: 1, stdout: ''}` → the returned spawn fn rejects/throws (so retries
  don't fire on a hard scheduler failure); `{exitCode: 0, stdout: '<text>'}` →
  returns decoded text.
- Orchestrator integration (injected spawn): a spawn whose `grd-hypothesizer`
  branch returns empty on its FIRST call then a valid `__HYPOTHESIS__` → the
  thread proceeds past HYPOTHESIZE (no error); a spawn whose
  `grd-experiment-runner` always returns empty → thread `status:'error'` with the
  existing `experiment-runner output not parseable` errorReason (after the
  retries). Existing orchestrator tests stay green (default retries=2 doesn't
  change behavior when the first spawn already parses).

## Non-Goals

- Retrying LEARN/other spawns (LEARN degrades to defaults already).
- Delays/backoff (scheduler handles rate-limit waits; these are transient-empty
  retries).
- Changing rate-limit detection/rotation (separate, already shipped).
