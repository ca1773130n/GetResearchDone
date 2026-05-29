# SP2-C — Insight → First-Class-Hypothesis Pipeline (Design)

- **Date:** 2026-05-27
- **Status:** Codex-reviewed (3×P1 + 4×P2 + 5×P3 all folded in); ready for plan
- **Depends on:** SP1 spine (merged), SP2-B ingest/synthesize (merged, #47), grounding (merged, #48)
- **Slice 1 of 4** remaining SP2 deferred slices (then arXiv/web fetch ingestion → PDF/session import → SP2-D hybrid retrieval).

## Motivation

Today `gd synthesize "<topic>"` produces a synthesis doc over the Tesserae KG, and
`gd research "<q>"` runs a scientific loop whose iteration-1 hypothesis is generated
**cold** by `grd-hypothesizer`. The two are disconnected: synthesis *grounds* the loop
(via the merged grounding change) but does not *feed* it. SP2-C closes that cycle —
a synthesized insight becomes a **first-class, seeded hypothesis** the loop investigates.

## Locked decisions (from brainstorming)

1. **Trigger:** auto-emit during `gd synthesize` — no separate promote command.
2. **Autonomy:** seed *all* candidates (capped); auto-run the **#1 ranked** only; the rest
   are queued as seeded+paused threads.
3. **Candidate source:** extend `grd-synthesizer`'s contract to emit ranked candidates
   (one spawn, no extra agent).
4. **Seeding mechanism:** **direct-seed (approach A)** — the synthesizer emits *loop-ready*
   candidates; we write rank-1..N straight into a thread ledger as the iteration-1
   hypothesis, and the orchestrator skips the cold HYPOTHESIZE spawn. The insight is
   literally the first-class hypothesis (no re-derivation), and a spawn is saved.

## Architecture

All changes live in `lib/research/` and `agents/grd-synthesizer.md`.

| Unit | Change | Purpose |
|---|---|---|
| `agents/grd-synthesizer.md` + `buildSynthesizePrompt` | extend contract | after the `__SYNTHESIS__` doc, emit a `__CANDIDATES__` tagged-JSON array |
| `synthesize.ts` | extend | parse `__CANDIDATES__` via `extractTaggedJson`; add `candidates` to `SynthesizeResult` |
| **`seed.ts`** (new) | new module | `seedThreadsFromCandidates(cwd, topicId, candidates, opts)` — create one seeded thread per candidate (ledger iter-1 + provenance), idempotent; return ranked thread ids |
| `orchestrator.ts` | add branch | HYPOTHESIZE: if iter 1 and a seeded iter-1 hypothesis already exists in the ledger → use it, skip the cold `grd-hypothesizer` spawn → DESIGN |
| `cli-kb.ts` `cmdSynthesize` | wire | after `synthesize()`: seed all → auto-run rank-1 thread → report |
| `types.ts` / `ledger.ts` | extend | `Hypothesis.sourceNodeIds?: string[]`, `Hypothesis.origin?: 'loop' \| 'synthesis'`; `Thread.seededFrom?: { synthesisTopicId: string; sourceNodeIds: string[] }` |
| `utils.ts` config | add | `research_max_candidates` (default 3) bounds how many candidates seed threads |

### `__CANDIDATES__` contract

The synthesizer emits, **after** the `__SYNTHESIS__` markdown doc, a second tagged block — an
**object wrapper** (not a bare array) so the existing `extractTaggedJson` helper, which scans
for the first `{...}` after a tag, can parse it (Codex P1):

```
__CANDIDATES__
{ "candidates": [
  { "rank": 1, "statement": "<testable claim>", "rationale": "<why, grounded in KG>",
    "predicted_outcome": "<what we expect to observe if true>", "source_node_ids": ["<id>", "<id>"] }
] }
```

- `rank` is 1-based (1 = highest priority); ties broken by **original array order**.
- Candidates are **loop-ready**: `statement`, `rationale`, `predicted_outcome` map to the
  fields `parseHypothesisOutput` returns (`statement`, `rationale`, `predictedOutcome`), so a
  seeded hypothesis is complete for DESIGN without re-derivation.
- Snake_case input (`predicted_outcome`, `source_node_ids`) → camelCase ledger fields
  (`predictedOutcome`, `sourceNodeIds`) via an explicit normalize step.
- `source_node_ids` are KG node ids → provenance carried onto the hypothesis.

**Doc-pollution fix (Codex P1):** because `parseSynthesisDoc` slices from `__SYNTHESIS__` to
EOF, `synthesize()` MUST split stdout at `__CANDIDATES__` *before* parsing/writing the doc:
`const ci = out.indexOf('__CANDIDATES__'); const synthPart = ci >= 0 ? out.slice(0, ci) : out;`
The doc is parsed from `synthPart` (clean body, no candidates leak into the written `.md`);
candidates are parsed from `out.slice(ci)`.

### Candidate validation / normalization

`parseCandidates(stdout)` returns `Candidate[]` and is defensive:
- Missing/malformed `__CANDIDATES__` or non-`{candidates:[...]}` shape → `[]` (warn, never throw).
- Per candidate: reject if `statement` or `predicted_outcome` is not a non-empty string (skip + warn).
- `source_node_ids` missing or non-array → normalized to `[]`.
- `rank` non-numeric → fall back to original array index.
- Output sorted by `(rank asc, original-index asc)`.

### Type / ledger extensions

- `Hypothesis` gains optional `sourceNodeIds?: string[]` and `origin?: 'loop' | 'synthesis'`
  (existing loop-generated hypotheses default to `'loop'` / undefined; backward compatible).
- `Thread` gains optional `seededFrom?: { synthesisTopicId: string; sourceNodeIds: string[]; seedKey: string }`.
- **Ledger round-trip MUST be implemented, not just typed (Codex P3).** `updateHypothesisStatus`
  reads → parses → rewrites *all* hypotheses; today `formatHypothesis`/`parseHypotheses` only
  preserve `statement`/`rationale`/`predictedOutcome`/`parentId`/`verdict`. `origin` and
  `sourceNodeIds` will be **erased** on the first status update unless `formatHypothesis` and
  `parseHypotheses` are extended **together** to serialize/parse them. Old entries lacking the
  fields parse to `origin:'loop'` / `sourceNodeIds:[]`.
- `THREAD.md` `renderThreadLog` extended to surface `seededFrom` (operator visibility, Codex P3).

### Seed manifest (separate file — Codex P2)

Seeding state lives in its own **`.planning/research/seed-manifest.json`**, NOT in the synth
manifest. Rationale: synthesize's `upsertManifest` *replaces the whole entry* and runs again on
the idempotent path; if `seededThreads` were stored there, a later synthesize upsert would drop
seed history and allow re-seeding. A dedicated manifest keyed by `seedKey` avoids the clobber
(same lesson as SP2-B's ingest/synthesize KG separation). Entry:
`{ seedKey, topicId, synthKey, rank, threadId, statement, seededAt }`.

## Data flow

1. `gd synthesize "<topic>"` → `synthesize()` compiles the KG, spawns `grd-synthesizer`.
2. Agent emits `__SYNTHESIS__\n<markdown>` then `__CANDIDATES__\n{"candidates":[...]}`.
3. `synthesize()` splits stdout at `__CANDIDATES__`, writes the doc from the clean
   `synthPart` (unchanged behavior), parses candidates from the tail, returns
   `{ status, topicId, docPath, candidates }`. The idempotent-skip paths return
   `candidates: []` (the agent did not run, or its source nodes were unchanged).
4. `cmdSynthesize`: **only if** `candidates.length > 0` (which by construction implies the
   agent actually ran this invocation) → call `seedThreadsFromCandidates()` **before**
   emitting output.
5. `seed.ts`, for each candidate (already sorted by rank, capped at `max_candidates`):
   compute `seedKey = sha256(synthKey | statement)`. **Idempotency (two-layer, Codex P2):**
   (a) fast path — `seedKey` present in `seed-manifest.json` → skip; (b) crash-safe path —
   scan `listThreads()` for an existing thread with `seededFrom.seedKey === seedKey` → skip.
   Otherwise `createThread(question = candidate.statement, { seededFrom: { synthesisTopicId,
   sourceNodeIds, seedKey } })`, `appendHypothesis` iter-1 (`origin:'synthesis'`,
   `parentId:null`, `status:'testing'`, `sourceNodeIds`), leave thread at station `seed`
   / `pendingGate:null`, then write the seed-manifest entry. Returns ranked
   `{rank, threadId, seedKey, newlySeeded}[]`.
6. Auto-run **rank-1 only** — and **only if it was newly seeded this invocation** — via
   `resumeResearch(cwd, rank1ThreadId, { spawn, runner })` (NOT `runResearch`, which would
   `createThread` a fresh cold thread and miss the seeded ledger — Codex P1). The loop runs
   and pauses at the default execute gate. Remaining threads stay seeded, awaiting
   `gd research resume <id>`.
7. Report: doc path, N seeded (+ how many newly), rank-1 thread (running / at-gate), queued
   thread ids.

### Orchestrator seeded branch

At loop start (iteration 1), inside the `else` of the existing execute-gate-resume branch
(which requires `approved.execute && resumable && fs.existsSync(planFile)` and is unchanged),
**before** the cold HYPOTHESIZE spawn, detect a seeded thread:

- Find a ledger hypothesis with `iteration === 1 && origin === 'synthesis' && verdict === null`,
  **and** `thread.pendingGate === null` **and** `thread.currentStation === 'seed'`. The
  `origin === 'synthesis'` / `seededFrom` marker is required — `iteration===1 && verdict===null`
  alone would also match a cold `h1` left behind by a crash between `appendHypothesis` and plan
  write (Codex P2). If found → set `hyp` to it and go **directly to DESIGN**, skipping the
  `grd-hypothesizer` spawn (do NOT call `appendHypothesis` again — it is already in the ledger).
- **Execute-gate guard (Codex P2):** the seeded branch fires only when `pendingGate === null`.
  It must never redesign while `pendingGate === 'execute'` (that would consume a stale approval
  for a freshly designed plan). A fresh seed has `pendingGate:null`, so this holds; the guard
  is explicit defense.
- The existing cold path (no seeded hypothesis) is unchanged; the execute-gate-resume branch
  still takes precedence when a plan file already exists.

## Idempotency

Composes with `synthesize()`'s existing two-level idempotency:

- Both idempotent-skip paths return `candidates: []` → no seeding, no auto-run. Seeding only
  fires when the agent actually produced candidates this invocation.
- Per-candidate `seedKey = sha256(synthKey | statement)`. Seeding is idempotent via **two
  layers** (Codex P2 crash-safety): (1) `seed-manifest.json` lookup (fast path); (2) a scan of
  `listThreads()` for `seededFrom.seedKey === seedKey` (covers the gap where a thread+ledger
  were created but the manifest write was lost to a crash — `createThread` would otherwise
  allocate a `-2` suffix and double-seed). Either hit → skip.
- Auto-run rank-1 fires **only when rank-1 was newly seeded this invocation** — it never
  re-runs an existing thread.
- The seed manifest is written **separately** from the synth manifest, so synthesize's
  whole-entry `upsertManifest` cannot drop seed history (Codex P2).
- KG change → new `synthKey` → new `seedKey`s → new seeded threads. Prior seeded threads
  stand on their own (no auto-deletion); provenance (`synthesisTopicId`, `sourceNodeIds`)
  distinguishes generations.

## Graceful degradation

- No `__CANDIDATES__` block (model variance / older agent) → `candidates = []` → zero
  seeding → `synthesize` behaves exactly as today. Fully backward compatible.
- Malformed `__CANDIDATES__` JSON → parsed as `[]` with a stderr warning; never throws.
- A candidate missing required fields (`statement`/`predictedOutcome`) is skipped (warn),
  not seeded.

## Config

- `research_max_candidates` (default **3**) caps candidates that seed threads — bounds loop
  budget. Top-level `config.json` key (sibling to `research_gates`; NOT nested under the
  boolean `research` workflow flag). Read via `loadConfig(cwd).research_max_candidates ?? 3`;
  `seed.ts` also accepts it as an injectable opt for tests.

## Testing (deterministic; injected `spawn`/`runner`/`client`, per SP2-B)

- **`seed.ts`**: candidates → N seeded threads with correct iter-1 ledger + provenance;
  idempotent re-seed is a no-op; ranked ordering; `max_candidates` cap honored; auto-run
  target = rank-1; malformed/incomplete candidate skipped.
- **`synthesize.ts`**: `__CANDIDATES__` parse (valid / malformed / missing → graceful `[]`);
  `SynthesizeResult.candidates` populated; idempotent-skip path returns no candidates.
- **`orchestrator.ts`**: seeded iter-1 hypothesis → asserts `grd-hypothesizer` **not**
  spawned and `grd-experiment-runner` **is** → DESIGN reached; existing cold path unchanged;
  execute-gate-resume branch still takes precedence with a plan file present.
- **`cli-kb.ts` `cmdSynthesize`**: seeding + auto-run happen **before** `output(...)` (Codex P3);
  its dependency type is extended to inject `synthesize` (returning `candidates`), the seeder,
  and a resume runner so tests need no real agent/tesserae. Cases: idempotent synthesize → no
  seeding; fresh → seeds + auto-runs rank-1; correct status reporting; respects `max_candidates`.
- **`ledger.ts`**: round-trip test — `appendHypothesis` with `origin:'synthesis'` +
  `sourceNodeIds`, then `updateHypothesisStatus`, then `readLedger` → fields preserved (guards
  the P3 erasure bug); old-format entry parses to `origin:'loop'`/`sourceNodeIds:[]`.
- Per-file coverage thresholds for `seed.ts` set to deterministic-test actuals (external
  binary/agent wrappers are not unit-testable).

## Scope / non-goals (YAGNI)

- No cross-topic candidate de-duplication, no thread merging, no new UI surface.
- One `synthesize` → up to `max_candidates` seeded threads; only rank-1 auto-runs.
- No auto-deletion or supersede of prior seeded threads on KG change.

## Open risks

1. The synthesizer producing a high-quality `predictedOutcome` is model-dependent; a weak
   prediction yields a weak DESIGN. Mitigation: prompt explicitly for a measurable
   prediction; degrade gracefully (skip candidates missing it).
2. Auto-running rank-1 spends loop budget up to the first gate. Bounded by the default
   execute gate (human checkpoint) and `max_candidates`.
3. **Rare seed-skip crash window (narrowed; accepted):** the **Level 2 post-spawn** idempotent
   path returns the freshly-parsed `candidates` (the agent ran this invocation), so a re-run with
   a bumped KG marker but unchanged source-node signature *recovers* seeding (seed.ts dedups). The
   only remaining gap is the **Level 1 pre-spawn** path: if the manifest+doc exist and the KG
   marker is unchanged, the agent is not re-run, so no candidates can be produced. Non-corrupting:
   the insight is still in the synthesis doc; the user re-seeds by editing the corpus (bumps the KG
   marker) or via a future `--reseed`. Documented, not fixed in this slice (sidecar-persisting
   candidates would close it but is scope creep). The common crash window (seed started, manifest
   write lost) IS covered by the `listThreads` scan.
