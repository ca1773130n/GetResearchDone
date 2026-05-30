# Auto-Re-survey on Plateau (Design — DRAFT for Codex review)

- **Date:** 2026-05-30
- **Status:** Codex-reviewed (Section 1: 1 P1 + 2 P2 + 1 P3 folded in); ready for plan.
- **Depends on:** SP1 spine + SP2 (all slices, incl. SP2-D hybrid retrieval) — all merged.
- **Sub-project #3 (Loop deepening), slice 1 of 3** (then paper-draft generation → multi-thread research).

## Motivation

The loop currently keeps revising similar hypotheses until `maxIterations`, then exits `exhausted`
— it never notices it is *stuck* and never broadens. `detectPlateau(verdicts, window)` already
exists in `verdict.ts` but is unused. This slice wires plateau detection into the loop: on a
plateau, **re-survey** — broaden retrieval + pivot the next hypothesis (deterministic), and
optionally pull in new external knowledge (config-flagged) — instead of silently exhausting.

## Locked decisions (from brainstorming)

1. **Re-survey action = both, behind a config flag.** Default: broaden + pivot (deterministic,
   reuses SP2-D hybrid retrieval). `research_resurvey_fetch` (default false) additionally spawns
   the surveyor to fetch + ingest new external sources before re-grounding.
2. **All three sub-project-#3 slices will be built** (this is slice 1).

## Architecture (Section 1 — detection & mechanism)

Hook in the orchestrator DECIDE block, after the takeaway is appended and **before**
`shouldTerminate`. Read the verdict history from the ledger; if the last iteration was
non-supported AND `detectPlateau(verdicts, window)` AND the thread is under the re-survey cap →
trigger a RESURVEY rather than drifting to `exhausted`.

Trigger condition (Codex Q4): plateau signal = the completed verdicts in ledger append order,
`hyps.filter(h => h.verdict !== null).map(h => h.verdict)`; fire only when the **last** verdict was
non-supported AND `detectPlateau(verdicts, window)` AND `(resurveyCount ?? 0) < cap`. The count —
not a `maxIterations` comparison — is the authoritative bound.

### RESURVEY action (deterministic core)
1. `thread.resurveyCount = (resurveyCount ?? 0) + 1` (increments once per detected plateau).
2. `thread.pendingPivot = true` — flags the next HYPOTHESIZE to broaden + pivot.
3. **Bounded iteration extension:** `thread.maxIterations += window`. The hard ceiling is
   `baseMaxIterations + cap × window` (Codex P2), computed from a persisted `baseMaxIterations`
   so eligibility is stable even if config changes before a resume. Gating on `resurveyCount < cap`
   guarantees at most `cap` extensions → no unbounded loop.
4. If `research_resurvey_fetch` → run the fetch path (Section 2) **before** the next broadened
   retrieve (Codex Q6: one widened retrieve, not an extra one).
5. `incrementCounter('research.resurveys_total')`, save thread, continue the loop (revise branch).

### Consuming the pivot (Codex P1 — must-fix)
`pendingPivot` is **consumed and cleared inside the cold HYPOTHESIZE branch**, the moment the pivot
hypothesis is appended (before any execute-gate pause). This prevents the execute-gate-resume path
(which reuses an existing hypothesis and skips HYPOTHESIZE) from leaving `pendingPivot` stuck true.
The seeded-synthesis branch only runs at iteration 1 / station `seed`, so a DECIDE-set pivot (after
≥1 completed iteration) always flows through cold HYPOTHESIZE.

### Config + thread fields (new)
- `research_max_resurveys` — top-level `config.json` key, default **2**, read raw like
  `research_max_candidates` (validated `cap >= 0`). **Registered in `KNOWN_CONFIG_KEYS`.**
- `research_resurvey_fetch` — boolean, default **false**. **Registered in `KNOWN_CONFIG_KEYS`.**
- `research_plateau_window` — default **3** (validated `window > 0`). **Registered in `KNOWN_CONFIG_KEYS`.**
- `ResearchThread` gains optional `resurveyCount?: number`, `pendingPivot?: boolean`,
  `baseMaxIterations?: number` (round-trip via `thread.json`; absent on old threads → treated as
  0/false/`maxIterations`). `renderThreadLog` surfaces `resurveyCount` in `THREAD.md` (Codex P3).

## Section 1 — Codex review resolved

DECIDE is the right seam (not inside the pure `shouldTerminate`). Findings folded in above:
P1 (clear `pendingPivot` on consume in cold HYPOTHESIZE), P2 (persist `baseMaxIterations`; ceiling
`base + cap × window`; gate on `resurveyCount < cap`), Q4 (`verdict !== null` filter), Q5 (register
all three keys in `KNOWN_CONFIG_KEYS`, read raw), Q6 (single widened retrieve; fetch before it),
P3 (`THREAD.md` shows `resurveyCount`).

## Architecture (Section 2 — broadened re-ground, fetch path)

### Broadened re-ground (cold HYPOTHESIZE when pivoting)
On entering the cold HYPOTHESIZE branch: `const pivot = thread.pendingPivot === true;` then clear
immediately (`thread.pendingPivot = false; saveThread(cwd, thread)`) so no later branch can leave
it stuck (Codex P1). When `pivot`:
- **Widen the single retrieve:** `retrieveFn(cwd, augmentedQuery, { k: 16 })` (2× the default 8),
  `augmentedQuery = [thread.question, ...recentTakeaways.map(t => t.content)].join(' ')`. The
  injectable `retrieveFn` gains an opts pass-through; the default binds `embedder` and merges opts —
  exactly one retrieve, not two (Codex Q6).
- **Pivot the prompt:** `buildHypothesizePrompt(..., pack, pivot)` — a new `pivot=false` param. When
  true it injects: "PLATEAU — your last N hypotheses all failed to be supported. Pivot hard:
  propose a substantially different approach/angle, not a variation of prior attempts."

### Flagged fetch path (`research_resurvey_fetch`, default off)
In the DECIDE resurvey action, before continuing the loop and before the next broadened retrieve,
call an injectable `resurveyFetch(cwd, thread, { spawn, ingest })`:
1. Spawn `grd-surveyor` with a contract to emit a `__SOURCES__` block (newline-separated arXiv ids
   / `http(s)` URLs).
2. Parse it (tolerant; reuse `extractTaggedJson`-style or a simple line parser), take up to **N=3**.
3. Ingest each via the existing `fetchSource` + `ingest` pipeline (which recompiles the KG), capped,
   tolerant of per-source failures.
**Degrade fully:** any failure (no surveyor, empty/parse miss, ingest error) is swallowed — the
deterministic broaden+pivot still runs. Injectable → tests use fakes; no network/agent.

### Config reader
`readResurveyConfig(cwd) → { cap, window, fetch }` reads the three raw keys from `.planning/config.json`
with defaults+validation (`cap = max(0, n|2)`, `window = max(1, n|3)`, `fetch = !!`), mirroring
`readMaxCandidates`. All three keys registered in `KNOWN_CONFIG_KEYS`.

## Error handling

The resurvey bookkeeping is pure (cannot fail). The extension is bounded by `resurveyCount < cap`
→ no infinite loop (hard ceiling `baseMaxIterations + cap × window`). The fetch path fully degrades;
the broadened retrieve degrades (SP2-D already returns empty on failure). Plateau/re-survey never
breaks or hangs the loop.

## Testing (deterministic; inject `spawn`/`runner`/`retrieve`/`resurveyFetch`)

- **`verdict.ts`**: `detectPlateau` edge cases (fewer than `window` verdicts → false; a `supported`
  in the window → false; `window` non-supported → true).
- **`orchestrator.ts`**: an always-refuting runner → after `window` refutes, `resurveyCount`
  increments, `maxIterations` extends by `window`, `pendingPivot` is set; the next hypothesizer
  prompt contains the **PIVOT** directive; `pendingPivot` is cleared after consume (asserted false
  on the thread); after `cap` re-surveys the thread terminates `exhausted`. A `retrieve` spy → on
  the pivot turn it is called with widened `k` and the augmented query. `research_resurvey_fetch`
  off → `resurveyFetch` not called; on → called once per re-survey (injected fake). `cap = 0` →
  never re-surveys (exhausts at the base `maxIterations`).
- **config reader**: defaults when keys absent; parsed/validated values when present;
  `KNOWN_CONFIG_KEYS` contains all three (assert in the existing utils/config test).
- **`thread.ts`**: round-trips `resurveyCount`/`pendingPivot`/`baseMaxIterations` through
  `saveThread`/`loadThread`; `renderThreadLog` shows `resurveyCount`.
- Per-file coverage thresholds adjusted for touched files (do not lower others).

## Scope / non-goals (YAGNI)

- Plateau = the existing "last `window` non-supported" rule — no metric-slope/trend analysis.
- Fetch path caps at 3 new sources per re-survey; no recursion.
- Pivot = a prompt directive + widened retrieval; no separate "survey agent" beyond the optional
  flagged fetch (which reuses `grd-surveyor` + the SP2 ingest pipeline).
- No cross-thread re-survey (single-thread; multi-thread is sub-project-#3 slice 3).

## Open risks

1. **`grd-surveyor` contract** — it currently writes `LANDSCAPE.md` (deprecated for grounding). The
   fetch path needs it to also emit a `__SOURCES__` block; the agent edit is additive and the parse
   is tolerant (no sources → degrade). Low risk because the path is opt-in (default off).
2. **Mid-run `maxIterations` mutation persists** to `thread.json`; a resumed thread keeps the
   paid-for extension. Intended; the `baseMaxIterations` ceiling keeps it bounded.
3. **Plateau heuristic is blunt** (count-based, not metric-trend). Acceptable: it only *adds* a
   bounded pivot attempt; worst case is `cap` extra iterations before the same `exhausted` outcome.
