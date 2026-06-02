# Research Loop Spawn-Failure Polish — Design

> Three rough edges a second live 3DGS run exposed (after the spawn-retry slice):
> a thrown spawn failure prints a raw stack trace and leaves the thread `active`;
> the failure message wrongly blames rate-limits for any nonzero exit; and a
> crash mid-iteration orphans a hypothesis in the ledger. Spec date: 2026-06-02.

## Goals

1. **Clean failure (no stack trace / no `active` limbo):** a thrown spawn failure
   in HYPOTHESIZE/DESIGN should `errExit` the thread (`status:'error'` +
   `errorReason`) like a parse failure, not bubble an uncaught stack trace.
2. **Accurate message:** a nonzero scheduler exit is "spawn failed (exit N)" —
   not necessarily rate-limit. Include a stderr excerpt for debuggability.
3. **No orphan hypothesis:** a crash after HYPOTHESIZE but before DESIGN
   completes must reuse the existing iteration hypothesis on recovery, not
   cold-generate a new one (leaving the first orphaned `testing` in the ledger).

## Evidence (the live run)

- Iter-2 `grd-experiment-runner` returned `exit 2` (a transient `claude` crash —
  both accounts were healthy). `decodeSpawnResult` threw (correct: P1 prevents
  retry amplification), but the throw **bubbled uncaught** out of `runLoop` →
  CLI stack trace, thread left `status:'active'` station `design`.
- The message read "accounts may be rate-limited/exhausted" — false; exit 2 was a
  crash.
- Recovery `resume` worked but created `h3` while `h2` (the crashed attempt's
  hypothesis) stayed `testing` in the ledger — because the reuse path
  (`approved.execute && resumable && fs.existsSync(planFile)`) requires a
  completed plan, which the crash never wrote.

## Changes (`lib/research/orchestrator.ts`)

### 1. `spawnAndParse` catches throws → clean errExit (Goal 1)

```ts
async function spawnAndParse<T>(...): Promise<{ value: T | null; lastRaw: string; error?: string }> {
  let lastRaw = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (beforeAttempt) beforeAttempt();
    try {
      lastRaw = await spawn(prompt, agentType);
    } catch (e) {
      // Hard spawn failure (scheduler nonzero exit, no scheduler, …) — do NOT
      // retry (preserves the no-amplification guarantee); surface for errExit.
      return { value: null, lastRaw: '', error: e instanceof Error ? e.message : String(e) };
    }
    const value = parse(lastRaw);
    if (value) return { value, lastRaw };
  }
  return { value: null, lastRaw };
}
```

Call sites distinguish the two failure modes in the `errExit` reason:

```ts
if (!hRes.value) {
  return errExit(cwd, thread, hRes.error
    ? `hypothesizer spawn failed: ${hRes.error}`
    : `hypothesizer output not parseable — expected a __HYPOTHESIS__ block. Got: ${excerpt(hRes.lastRaw)}`);
}
// DESIGN identically with 'experiment-runner'
```

Net: a thrown spawn no longer escapes `runLoop`; the thread becomes cleanly
terminal (`status:'error'`, `errorReason`, rendered in THREAD.md) — no stack
trace, no `active` limbo. (The throw is still not *retried* — caught and returned
on the first occurrence.)

### 2. `decodeSpawnResult` — accurate message + stderr excerpt (Goal 2)

Accept the full result (incl. `stderr`) and stop over-attributing:

```ts
function decodeSpawnResult(r: { exitCode?: number; stdout?: string; stderr?: string }, agentType: string): string {
  if (typeof r.exitCode === 'number' && r.exitCode !== 0) {
    const err = excerpt(r.stderr || '');
    throw new Error(`${agentType} backend spawn failed (exit ${r.exitCode})${err !== '(empty)' ? ` — ${err}` : ''}`);
  }
  return decodeSpawnStdout(r.stdout || '');
}
```

`defaultSpawn` passes the whole `r`. (No claim about rate-limits; the scheduler's
rate-limit rotation/exhaustion still happens internally before this, and a
genuine exhaustion will show its own stderr.)

### 3. Reuse a crashed-iteration hypothesis (Goal 3)

In the selection `else` block, add a `resumable` reuse branch BEFORE cold
HYPOTHESIZE (keep the seeded branch first):

```ts
} else {
  const seededHyp = priorHyps.find(/* …seed… */);
  if (seededHyp && thread.currentStation === 'seed' && thread.pendingGate === null) {
    hyp = seededHyp;
  } else if (resumable && !fs.existsSync(planFile)) {
    // Crash recovery: a hypothesis exists for this iteration but DESIGN never
    // produced a plan. Reuse it and re-run DESIGN — don't orphan it with a new
    // one. The `!planFile` guard (Codex P1) confines this to the
    // HYPOTHESIZE-done / DESIGN-incomplete case, so it can NEVER re-run DESIGN
    // over an already-designed/started experiment (a `testing` hyp whose
    // experiment had begun keeps its plan.json and is left to the normal path).
    hyp = resumable;
  } else {
    // HYPOTHESIZE (cold) …
  }
  // DESIGN runs next (re-generates the plan for the reused hyp); since this is a
  // recovery (not a gate approval), `approved.execute` is false here, so the
  // regenerated plan still pauses at the execute gate for review.
}
```

`resumable = priorHyps.find(h => h.iteration === thread.iteration && h.status === 'testing')`
is only set when an iteration hypothesis is mid-flight. In the normal revise flow
the completed hypothesis is already `refuted`/`supported` (not `testing`) and the
iteration was incremented, so `resumable` is undefined and a fresh hypothesis is
generated as today. **Pre-existing edge (Codex P2, NOT introduced here):** if
`approved.execute` were ever true with `plan.json` missing, control would reach
the execute gate with a stale approval and skip the pause — but on a recovery
`resume` `approved.execute` is false (pendingGate was null), so this branch never
triggers it; left as-is.

## Files

- **Modify** `lib/research/orchestrator.ts` — `spawnAndParse` throw-catch +
  `{error}`; both call-site messages; `decodeSpawnResult` signature/message;
  `else if (resumable)` reuse branch; `defaultSpawn` passes full `r`.
- **Modify** `tests/unit/research/orchestrator.test.ts`.

## Testing strategy

- `spawnAndParse`: a spawn that throws → `{value:null, error:<msg>}` after **1**
  call (the prior `.rejects` expectation is REPLACED — Codex P3 — with
  `expect(r.value).toBeNull(); expect(r.error).toMatch(/…/); expect(n).toBe(1)`);
  existing empty-retry + success tests unchanged.
- `decodeSpawnResult`: `{exitCode:2, stderr:'boom'}` → throws with `exit 2` and
  `boom`, and NOT the word "rate-limited"; `{exitCode:0, stdout:'x'}` → `'x'`.
- Orchestrator: an injected spawn whose `grd-experiment-runner` always **throws**
  → thread `status:'error'` with `errorReason` matching `/experiment-runner spawn
  failed/` (clean errExit, no uncaught throw — the `await runResearch` resolves,
  not rejects). The existing empty-output → "not parseable" errExit test stays.
- Crash-reuse: simulate a thread left `active`/`design` with an existing iter-N
  `testing` hypothesis and **no plan.json**, then drive one loop turn (injected
  spawn) → the ledger gains **no** new hypothesis for that iteration (the existing
  one is reused); and the inverse — a `testing` hyp WITH a plan.json present is
  NOT reused-and-redesigned by this branch (P1 guard); a normal refute→revise
  still adds the next hypothesis.

## Non-Goals

- Retrying hard spawn failures (still caught-once, not retried — amplification
  guard intact). A transient-crash auto-retry is a separate, larger call.
- Changing rate-limit detection/rotation.
