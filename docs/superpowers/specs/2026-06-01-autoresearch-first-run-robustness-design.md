# Autoresearch First-Run Robustness — Design

> Fixes for two code defects a live smoke test of `gd research` surfaced (the
> unit suite never hit them because it always injects `spawn`). Spec date:
> 2026-06-01.

## Goal

Make a first-time `gd research` run fail *informatively* instead of with a stack
trace or a silent `status: error`:

1. **Scheduler robustness (Finding 2):** a partial `scheduler` config (missing the
   `prediction` block) must not crash with `TypeError: Cannot read properties of
   undefined (reading 'safety_margin_tasks')`. `createScheduler` should default
   `prediction` the same way it already defaults `max_wait_minutes`.
2. **Diagnostic failure (Finding 3):** when the loop dies because an agent's
   output couldn't be parsed (HYPOTHESIZE / DESIGN), it must record *why* — not
   just set `status: error` with no breadcrumb. Persist an `errorReason` (with a
   short stdout excerpt) to the thread and return it.
3. **Actionable missing-scheduler error (Finding 1):** `no scheduler available
   for research loop` should name the fix.

## Background (what the smoke test found)

- `createScheduler` (lib/scheduler.ts) spreads `config` and defaults only
  `max_wait_minutes`; it then reads `schedulerConfig.prediction.safety_margin_tasks`
  (lines ~802, 879, 896, 913, 926, 1133, 1176) **unguarded**. A config with
  `backend_priority` + `free_fallback` but no `prediction` crashes.
- `defaultSpawn` (orchestrator.ts) throws `no scheduler available for research
  loop` when `createScheduler` returns `null` (no `scheduler` key at all). This is
  consistent with autopilot, which also needs a configured scheduler — so the fix
  is a *better message*, not a behavior change (see Decision below).
- `runLoop` HYPOTHESIZE/DESIGN: `const parsed = parseHypothesisOutput(hOut); if
  (!parsed) return errExit(cwd, thread);` (lines 228-229, 242-243). `errExit` sets
  `status:'error'` and returns `{threadId, status, iterations}` — **no reason, no
  raw output**. A flaky/empty agent spawn becomes an undebuggable dead thread.
- `saveThread` writes `thread.json` (`JSON.stringify(thread)`) and `THREAD.md`
  (`renderThreadLog(thread)`), so a new optional thread field persists to
  `thread.json` automatically and needs one render line in `THREAD.md`.

## Decision: Finding 1 is an error-message fix, not auto-defaulting

We do **not** synthesize a `config.scheduler` when the key is absent.
`createScheduler(undefined) → null` is an established "scheduler disabled"
contract; inventing scheduler config only for autoresearch would be a hidden
behavior change. So the error simply names the fix. (Codex reviewed and agreed.)
Note the precise rationale: it is "don't synthesize hidden scheduler config,"
not "every subsystem hard-requires a scheduler" — autopilot/evolve tolerate a
`null` scheduler via direct-spawn paths. If zero-config `gd research` is ever
wanted, the consistent design would be an **unscheduled direct-spawn fallback**
(like autopilot/evolve), not auto-defaulting `config.scheduler` — that's a
separate, larger change, explicitly out of scope here.

## Changes

### 1. `lib/scheduler.ts` — default + normalize the `prediction` block

`SchedulerConfig.prediction` has **four** required fields
(`window_minutes`, `ewma_alpha`, `safety_margin_tasks`, `min_samples` —
lib/types.ts:560-565), so the default must cover all four (Codex P2). Export a
shared normalizer so every raw consumer routes through one place:

```ts
export const DEFAULT_PREDICTION = {
  window_minutes: 60, ewma_alpha: 0.3, safety_margin_tasks: 2, min_samples: 3,
};
export function normalizePrediction(raw?: Partial<typeof DEFAULT_PREDICTION>) {
  return { ...DEFAULT_PREDICTION, ...(raw || {}) };
}
```

In `createScheduler`, use it in the defaults spread:

```ts
const schedulerConfig: SchedulerConfig = {
  ...config,
  max_wait_minutes: config.max_wait_minutes ?? 90,
  prediction: normalizePrediction(config.prediction),
};
```

Field-level merge: a config that sets *some* prediction fields keeps them and
gets defaults for the rest. Defaults match what `/grd:init` writes.

**Also fix the one raw consumer (Codex P2):** `lib/autopilot.ts:714` reads
`config.scheduler.prediction.safety_margin_tasks` directly (account-rotation
shortcut), bypassing `createScheduler`'s defaulting — so a partial config still
crashes autopilot with rotation on. Route it through the normalizer:
`normalizePrediction(config.scheduler.prediction).safety_margin_tasks`.

### 2. Carry the reason on the result + thread types (Codex P1)

`ResearchThread` lives in `lib/research/types.ts`; `ResearchResult` is **local to
`lib/research/orchestrator.ts`** (not types.ts). Add the optional field in each
correct place:

```ts
// lib/research/types.ts
export interface ResearchThread { /* ...existing... */ errorReason?: string; }

// lib/research/orchestrator.ts (the local ResearchResult interface)
export interface ResearchResult { /* ...existing... */ errorReason?: string; }
```

Optional, so no existing construction site breaks.

### 3. `lib/research/orchestrator.ts` — diagnostic `errExit`

```ts
function errExit(cwd: string, thread: ResearchThread, reason: string): ResearchResult {
  thread.status = 'error';
  thread.errorReason = reason;
  saveThread(cwd, thread);
  return { threadId: thread.id, status: 'error', iterations: thread.iteration, errorReason: reason };
}
```

Call sites pass a reason + a short stdout excerpt (first 280 chars, whitespace-
collapsed) so the raw agent output is visible:

```ts
if (!parsed) return errExit(cwd, thread, `hypothesizer output not parseable — expected a __HYPOTHESIS__ block. Got: ${excerpt(hOut)}`);
// ...
if (!parsedPlan) return errExit(cwd, thread, `experiment-runner output not parseable — expected a __PLAN__ block. Got: ${excerpt(pOut)}`);
```

`excerpt(s)` coerces and bounds *before* scanning, so a non-string or huge output
can't throw or do unbounded work (Codex P3):

```ts
function excerpt(s: unknown): string {
  return String(s ?? '').slice(0, 2000).replace(/\s+/g, ' ').trim().slice(0, 280) || '(empty)';
}
```

(Both call sites already have `hOut`/`pOut` in scope.)

### 4. `defaultSpawn` — actionable missing-scheduler error

```ts
if (!scheduler) {
  throw new Error(
    'no scheduler configured for the research loop — run `/grd:init`, or add a '
    + '`scheduler` block to .planning/config.json (see '
    + 'docs/autoresearch-tutorial.md#prerequisites)',
  );
}
```

### 5. `lib/research/thread.ts` — render the reason

In `renderThreadLog`, when `t.errorReason` is set, append a line:
`- **error reason:** ${t.errorReason}`. (Only when present, so finished/active
threads are unchanged.)

## Files

- **Modify** `lib/scheduler.ts` — `DEFAULT_PREDICTION` + exported `normalizePrediction` + use in `createScheduler`.
- **Modify** `lib/autopilot.ts` — route the raw `prediction.safety_margin_tasks` read (~line 714) through `normalizePrediction`.
- **Modify** `lib/research/types.ts` — `errorReason?` on `ResearchThread`.
- **Modify** `lib/research/orchestrator.ts` — `errorReason?` on the local `ResearchResult`; `errExit(reason)` + `excerpt` + 2 call sites + `defaultSpawn` message.
- **Modify** `lib/research/thread.ts` — render `error reason` line in `renderThreadLog`.
- **Modify** `tests/unit/scheduler.test.ts`, `tests/unit/research/orchestrator.test.ts`, `tests/unit/research/thread.test.ts`.

## Testing strategy

- **scheduler:** `createScheduler` with a config that has `backend_priority` +
  `free_fallback` but **no `prediction`** returns a usable scheduler (not a
  throw); `normalizePrediction(undefined)` returns all four defaults;
  `normalizePrediction({ ewma_alpha: 0.9 })` keeps `ewma_alpha` and defaults
  `window_minutes` / `safety_margin_tasks` / `min_samples`.
- **orchestrator errExit:** inject a `spawn` that returns junk (no `__HYPOTHESIS__`)
  → `runResearch` resolves to `{status:'error', errorReason: /hypothesizer output
  not parseable/}`, and the persisted `thread.json` has the same `errorReason`;
  same for a spawn that returns a valid hypothesis but junk for the plan
  (`/experiment-runner output not parseable/`). An empty spawn yields `(empty)` in
  the excerpt.
- **defaultSpawn message:** with no `scheduler` config, `runResearch` rejects/exits
  with a message matching `/run .*grd:init|scheduler` block/` (actionable).
- **thread render:** `renderThreadLog` includes an `error reason` line iff
  `errorReason` is set.
- Existing scheduler + orchestrator suites stay green (the `errExit` signature
  change is internal; all call sites updated in this change).

## Non-Goals

- Auto-synthesizing a scheduler from nothing (see Decision).
- Catching/!reclassifying spawn *throws* mid-loop (a spawn that throws still
  propagates to the CLI, which prints it — only the *unparseable-output* path is
  made diagnostic here).
- Any change to the deterministic verdict, gates, or loop control.
