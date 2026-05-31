# Multi-thread Research / Portfolio (Design — DRAFT for Codex review)

- **Date:** 2026-05-31
- **Status:** Codex-reviewed (Section 1: 2 P1 + …; Section 2: 3 P1 + P2/P3 — all folded in); ready for plan.
- **Depends on:** SP1 + SP2 (all) + sub-project #3 slices 1–2 (plateau re-survey, paper-draft) — all merged.
- **Sub-project #3 (Loop deepening), slice 3 of 3** (final).

## Motivation

SP2-C seeds multiple research threads from synthesis candidates but auto-runs only rank-1; the rest
sit paused, advanced one-by-one via `gd research resume`. This slice adds `gd research portfolio`:
a coordinator that advances a *set* of existing threads with bounded concurrency, serializes the
shared-KG compile so concurrent finalizes don't corrupt `graph.json`, and emits a ranked report.

## Locked decisions (from brainstorming)

1. **Bounded parallel + compile lock.** Run up to C threads concurrently; serialize the `kg_write`
   compile behind one async mutex.
2. **Selection:** default = all non-terminal threads; explicit ids; `--topic <id>` = the SP2-C
   synthesis-seeded set (`seededFrom.synthesisTopicId`). Terminal threads skipped-but-reported.
3. The portfolio **coordinates existing threads** (via `resumeResearch`) — it creates none.

## Architecture (Section 1)

Stateless coordinator: derives all behavior from per-thread status each run (skip terminal, run
active/paused via `resumeResearch`) → naturally idempotent/resumable. No portfolio state file.

| Unit | Change | Purpose |
|---|---|---|
| **`lib/research/portfolio.ts`** (new) | new | `runPortfolio(cwd, opts)` → select → bounded-concurrency run (mutex-guarded compile) → rank → write `PORTFOLIO.md` → ranked result. Plus `mapWithConcurrency` pool, `createMutex`, `wrapClientWithCompileLock`. Injectable `resume`/`client`. |
| `lib/research/orchestrator.ts` | extend | `ResearchOptions.kgClient?: TesseraeClient`; `finishKgSync` forwards it to `syncFindingToKg(..., {client})` (default unchanged → `createCliTesseraeClient`). |
| `lib/research/cli.ts` + `bin/grd-tools.ts` + `lib/cli/index.ts` + `lib/research/index.ts` | extend | `gd research portfolio [ids...] [--topic <id>] [--concurrency N]` → `cmdResearchPortfolio` (4-point wiring: `RESEARCH_TOOL_SUBS`+`'portfolio'`, bin branch, index export). |
| `lib/utils.ts` | extend | register `research_portfolio_concurrency` in `KNOWN_CONFIG_KEYS` (read raw; default 2). |

### Shared scheduler + injected deps (Codex P1)
The portfolio builds, **once**, the dependencies every thread shares, and injects them into each
`resumeResearch(cwd, id, opts)` call so accounting is portfolio-wide, not per-thread:
- `spawn = defaultSpawn(cwd, config)` — **one** scheduler instance, so concurrent spawns share the
  scheduler's in-flight reservation + account-rotation accounting (without this each thread's
  `runLoop` would build its own scheduler and the cap couldn't coordinate budget).
- `retrieve` — one embedder-bound retriever (SP2-D), shared.
- `kgClient` — one mutex-wrapped client (below).
- `noGates` — the passthrough flag.

### Concurrency + compile lock
A bounded pool runs ≤C thread loops concurrently (overlapping the agent-spawn latency that dominates
wall-clock). The one shared-mutable chokepoint inside the loop is `kg_write → syncFindingToKg →
compile(cwd, ['.planning/research'])`, which rewrites the global `graph.json`/`sqlite.db`. The
portfolio wraps the shared client's `compile` in **one** async mutex and injects it via
`ResearchOptions.kgClient` → all threads' compiles serialize through the single lock.
**Scope (Codex P3):** the mutex is (a) *future-proof* — the real `compile` is synchronous
`execFileSync`, so it already can't overlap on Node's single-threaded loop today; the lock makes
serialization explicit/correct for async clients and avoids redundant back-to-back compiles; and
(b) *process-local* — it does not guard against a separate `gd synthesize`/`ingest`/portfolio
process compiling the same `.tesserae`. It is NOT a global KG lock. Hybrid-retrieve **reads** of
`graph.json` are NOT locked (SP2-D `try/catch`-degrades a torn read; locking reads would erase the
parallelism benefit and only protects same-process readers anyway).

### Selection + safe-resumability (Codex P1)
`resumeResearch` only resets `pendingGate`; it does not recover station-specific artifacts. A crash
can leave a thread `status: active` mid-station (design/run/measure), where re-entry could duplicate
a hypothesis or rerun an experiment. So the portfolio runs only **safely-resumable** threads and is
conservative otherwise:
- **runnable:** `status === 'paused'` (gate pause — `resumeResearch`'s designed entry) OR
  `status === 'active' && currentStation === 'seed'` (never-advanced seeded thread — the SP2-C path).
- **terminal** (`supported`/`exhausted`/`abandoned`): skipped from execution, listed in the report.
- **interrupted** (`status === 'active'` at a non-`seed` station, or `status === 'error'`): skipped +
  reported as "interrupted — pass --force to resume". With `--force`, treated as runnable.
  (In normal operation a thread is paused, terminal, or seed-active; a persisted non-seed `active`
  means the process was interrupted — so this rule never blocks normal flow.)

Selection modes (then filtered by the runnability rule above):
- default → all threads from `listThreads`.
- explicit ids → exactly those.
- `--topic <id>` → threads with `seededFrom.synthesisTopicId === <id>`.
- `--no-gates` passes through to each `resumeResearch` (autonomous); else each thread honors its own
  gate config and may pause — re-running the portfolio advances it.

### Cap
`research_portfolio_concurrency` (top-level config, default 2; `--concurrency N` overrides) bounds
concurrent threads so the shared token budget / rate-limits aren't blown.

## Section 1 — Codex review resolved

P1 shared-scheduler (inject one `spawn`/`retrieve`/`kgClient` into every `resumeResearch`), P1 safe-
resumability (run only paused or active-seed threads; interrupted/error skipped unless `--force`),
P2 failure isolation (per-thread envelopes — Section 2), P2 `error`-status handling (skip+report),
P3 mutex future-proof + process-local + reads unlocked — all folded into Section 1 above.

## Architecture (Section 2 — data flow, ranking, errors, testing)

### `runPortfolio(cwd, opts)` flow
1. **Resolve selection:** explicit ids | `--topic` (`seededFrom.synthesisTopicId === id`) | default
   (`listThreads`). Load each thread **inside a per-thread try/catch** (Codex P1): a `loadThread`
   that throws (missing file / bad JSON / cross-process race) becomes a `not-found`/`failed` entry,
   never aborting the batch.
2. **Classify** (per Section 1 runnability): `terminal` (skip+report) / `runnable` (paused, or
   active-`seed`) / `interrupted` (active-non-`seed` or `error` → skip+report unless `--force`
   promotes to runnable) / `not-found` (explicit id missing or unreadable → report entry).
3. **Build shared deps once:** `spawn = defaultSpawn(cwd, loadConfig(cwd))`, `retrieve`
   (embedder-bound), `kgClient = wrapClientWithCompileLock(createCliTesseraeClient(), mutex)`,
   `noGates`.
4. **Run** runnables via `mapWithConcurrency(runnable, C, …)`, each in a **try/catch envelope** that
   also captures the final verdict from the ledger (Codex P2 — `resumeResearch`'s kg_write path
   collapses verdict to supported/undefined, so the envelope reads the latest completed ledger
   hypothesis's verdict for accurate reporting): `{id, ok:true, result, verdict}` | `{id, ok:false,
   error}` — one failure never aborts the pool or the report. Each calls
   `resume(cwd, id, {spawn, retrieve, kgClient, noGates})` (default `resumeResearch`, injectable).
5. **Aggregate** envelopes + skipped + not-found → entries
   `{id, question, status, verdict?, iterations, action, error?}` where action ∈
   `ran|paused|skipped-terminal|skipped-interrupted|failed|not-found`. **`buildReport` is pure over
   these captured entries — it does NOT reload thread files** (Codex P1/P2), so it cannot throw on a
   bad/raced thread.
6. **Rank** by status priority `supported(0) > paused(1) > active(2) > exhausted(3) >
   error/interrupted(4) > not-found(5)` (`inconclusive`/`refuted` are *verdicts*, shown separately,
   not ranks); tiebreak iterations-asc for `supported`/`paused`, stable-by-id otherwise. **No
   cross-thread metric comparison** (different metricKeys).
7. **Write `PORTFOLIO.md`** at `.planning/research/PORTFOLIO.md` (atomic temp+rename) as the **last**
   step: ranked table + a "supported:" winners line. Everything before this is non-throwing (errors
   became entries); **only a report-write failure escapes** → CLI exit 1. Return
   `{ran, paused, supported, skipped, failed, threads, reportPath}`.

### CLI
`gd research portfolio [ids...] [--topic <id>] [--concurrency N] [--force] [--no-gates]` →
`cmdResearchPortfolio` (injectable `runPortfolio` for tests). No runnable threads → exit 0,
"nothing to run". Per-thread failures are report data, NOT a CLI error (exit 0 even if all failed,
as long as the report was written). **Exit 1 only** for usage/invalid-`--concurrency`/config errors
or an inability to write `PORTFOLIO.md` (Codex P3). The summary **loudly surfaces** `noGates`,
`concurrency`, `runnable`, and `failed` (Codex P3 — `--no-gates` under concurrency multiplies blast
radius; no interactive confirm, so automation/tests stay deterministic).
`research_portfolio_concurrency` read raw (default 2, validated ≥1); `--concurrency` overrides.

### Error handling
Selection/classification never throws. A thread that throws → failed envelope. The report is always
written (successes + pauses + skips + failures). The mutex tail `.catch`-recovers so a rejected
compile can't poison later compiles.

### Testing (deterministic; inject `resume`/`client`/listing; fixture threads)
- `runPortfolio`: fixtures across terminal / paused / active-seed / active-mid-run / error → only
  paused+active-seed run; terminal+interrupted skipped+reported; `--force` runs interrupted; an
  instrumented fake `resume` asserts **concurrency ≤ C**; one `resume` throwing → others still run,
  report written, exit 0; ranking (supported first); `PORTFOLIO.md` written; `--topic`/explicit-ids
  selection; injected `spawn`/`kgClient` reach `resume`.
- `mapWithConcurrency` (≤N concurrent, order preserved); `createMutex` (serializes; rejecting task
  doesn't poison the chain); `wrapClientWithCompileLock` (compile via mutex; other methods passthrough).
- `orchestrator`: `finishKgSync` forwards `opts.kgClient` to `syncFindingToKg` at **both** call sites
  (runLoop finalize + resume kg_write) — injected client records the compile.
- `cmdResearchPortfolio` flag parsing + summary; config reader + `KNOWN_CONFIG_KEYS`.
- Per-file coverage thresholds for `portfolio.ts`.

### Scope / non-goals (YAGNI)
Advances existing threads only (no creation); status-first ranking (no cross-thread metric
normalization); cross-thread sharing is opportunistic via the KG as threads finalize (no takeaways
digest — timing-racy under concurrency); process-local compile lock (documented).

## Section 2 — Codex review resolved

P1 (classification wraps `loadThread` → entries, never aborts), P1 (only report-write escapes → exit
1; `buildReport` pure over captured entries), P2 (verdict captured from the ledger in the run
envelope), P2 (ranking: status-first, `inconclusive`/`refuted` are verdicts not ranks), P2
(`mapWithConcurrency`: validate N≥1, preallocate, sync index claim, per-item try/catch), P3 (exit-0
batch semantics; summary surfaces noGates/concurrency/runnable/failed). Confirmed: shared
`defaultSpawn` across concurrent threads is safe (one scheduler, shared reservation state).

## (resolved) Open questions for Codex (Section 1)
1. **kgClient injection:** is threading `ResearchOptions.kgClient` → `finishKgSync` →
   `syncFindingToKg({client})` the right minimal seam? `finishKgSync(cwd, thread, verdict, status)`
   is called from `runLoop` and `resumeResearch` (both have `opts`). Any call site I'd miss, and does
   adding a param break either caller?
2. **Is the mutex even load-bearing** given `compile` is synchronous `execFileSync` (event-loop
   blocking)? Is there any real interleaving hazard it prevents in production, or is it purely
   defensive? Should reads of `graph.json` (retrieve) also be guarded, or is degrade-on-torn-read
   sufficient?
3. **resumeResearch on a never-run seeded thread** (status active, station seed): does it correctly
   run such a thread (SP2-C relies on this for rank-1 auto-run), so the portfolio can use
   `resumeResearch` uniformly for all non-terminal threads?
4. **Stateless resumability:** any hazard in deriving the run-set purely from per-thread status each
   invocation (e.g., a thread left 'active' mid-run by a crash — would the portfolio re-enter it
   wrongly)?
5. **Bounded pool correctness:** a hand-rolled `mapWithConcurrency` (N workers draining an index) +
   an async `createMutex` (promise-chain) — known footguns (unhandled rejection poisoning the chain,
   error in one thread aborting `Promise.all` and dropping others)? How should one thread's failure
   be isolated so the rest of the portfolio still completes?
6. **Budget/rate-limit:** does running C threads concurrently interact badly with the scheduler's
   per-account budget/rotation, or is concurrent spawn already supported (CLAUDE.md: parallel=true)?
