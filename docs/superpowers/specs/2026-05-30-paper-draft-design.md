# Paper-Draft Generation (Design)

- **Date:** 2026-05-30
- **Status:** Brainstormed; ready for plan.
- **Depends on:** SP1 + SP2 (all slices) + sub-project-#3 slice 1 (plateau re-survey) — all merged.
- **Sub-project #3 (Loop deepening), slice 2 of 3** (slice 3 = multi-thread research).

## Motivation

A completed research thread already produces a deterministic `FINDING.md`, a hypothesis ledger,
takeaways, and per-iteration experiment artifacts — but nothing turns that into a readable,
publication-style write-up. This slice adds `gd research report <id>`: GRD deterministically
gathers the thread's artifacts into a structured bundle, a new `grd-paper-writer` agent writes the
prose, and the result is written to `PAPER.md`.

## Locked decisions (from brainstorming)

1. **Hybrid generation** (matches `synthesize`): deterministic artifact bundle + agent prose;
   `spawn` and `retrieve` injectable for offline tests.
2. **Trigger:** `gd research report <id>` on a **terminal** thread (`supported`/`exhausted`/
   `abandoned`); active/paused → error.
3. **Related Work** sourced from the SP2-D hybrid retriever (`retrieve(cwd, question)`), folded
   into the bundle; degrades to an empty section on any failure.

## Architecture (all `lib/research/`)

| Unit | Change | Purpose |
|---|---|---|
| **`paper.ts`** (new) | new | `gatherPaperBundle(cwd, id, {retrieve?})` → `PaperBundle`; `buildPaperPrompt(bundle)` → agent prompt with a `__PAPER__` contract; `generatePaper(cwd, id, {spawn, retrieve?})` → gather → spawn → parse → atomic-write `PAPER.md`. |
| **`agents/grd-paper-writer.md`** (new) | new | Reads the bundle embedded in the prompt; emits `__PAPER__\n<markdown>` (Title/Abstract, Introduction, Related Work, Method, Results, Discussion, Limitations, Future Work). `tools: Read, Grep, Glob` (no Write/Bash). |
| `lib/research/cli.ts` | extend | `cmdResearchReport(cwd, id, raw, deps?)` — validate thread exists + terminal, call `generatePaper`, print the `PAPER.md` path. |
| `bin/grd-tools.ts` + `lib/cli/index.ts` | extend | register `gd research report <id>` as a research tool-subcommand (alongside `start`/`resume`/`status`). |

### `PaperBundle` shape
```ts
interface PaperBundle {
  thread: { id: string; question: string; status: string; iteration: number };
  supported: Hypothesis | null;
  ledger: Hypothesis[];
  takeaways: Takeaway[];
  experiments: Array<{ iter: number; plan: ExperimentPlan | null; metrics: Record<string, number> }>;
  relatedWork: Array<{ name: string; description: string; source_path: string }>;
}
```

## Data flow (`generatePaper`)

1. `loadThread(cwd, id)` — not found → error; `status` not terminal → error.
2. `gatherPaperBundle(cwd, id, {retrieve})`: `readLedger`, `readTakeaways`; for `n = 1..iteration`
   read `experiments/<n>/plan.json` + `result.json` (missing/unparseable → `plan: null` /
   `metrics: {}`, tolerant); `supported = ledger.find(h => h.status === 'supported') ?? null`;
   `relatedWork = (await retrieve(cwd, question)).results.slice(0, k)` in a try/catch → `[]` on
   failure / empty graph.
3. `buildPaperPrompt(bundle)`: embed the question, supported hypothesis, the full ledger
   (id/status/statement), a per-iteration results table (`iter | metricKey | value | comparator |
   target | verdict`), takeaways, and the Related Work list; instruct the agent to write each
   section and emit exactly `__PAPER__\n<markdown>`.
4. `spawn(prompt, 'grd-paper-writer')` → slice from `__PAPER__` to EOF, trim. Empty/missing →
   error (`report: paper-writer produced no __PAPER__ block`).
5. Atomic-write `PAPER.md` (temp + rename) → return `{ paperPath, status: 'written' }`.

## Agent contract (`grd-paper-writer.md`)

Frontmatter: `tools: Read, Grep, Glob`, `effort: high`, a bounded `maxTurns`. Role: "turn the
provided autoresearch thread bundle into an honest, publication-style draft — do NOT invent
results beyond the bundle." Output: `__PAPER__` then the markdown. **Honesty rule:** an
`exhausted` thread's paper frames the outcome as negative/inconclusive, not a fabricated success.

## Error handling

Thread missing / not terminal → deterministic `report: <reason>` exit-1. `retrieve` failure →
Related Work omitted (degrade). `spawn` failure or no `__PAPER__` → error. Writes are atomic, so
nothing partial is left; `generatePaper` never writes a half paper.

## Testing (deterministic; inject `spawn` + `retrieve`; fixture thread)

- **`gatherPaperBundle`**: a fixture thread (ledger + takeaways + 2 `experiments/<n>` dirs +
  terminal status) → bundle has the supported hypothesis, full ledger, both experiments' metrics,
  takeaways; injected `retrieve` → `relatedWork` populated; `retrieve` throws → `relatedWork: []`
  (paper still builds); missing `result.json` → that iter's `metrics: {}`.
- **`buildPaperPrompt`**: contains the question, ledger statements, a results row, Related Work
  entries; instructs `__PAPER__`.
- **`generatePaper`**: injected `spawn` returning `__PAPER__\n# Draft...` → `PAPER.md` written with
  that content; `spawn` returning no tag → error; non-terminal thread → error (spawn not called).
- **`cmdResearchReport`**: routes a terminal thread to `generatePaper` and prints the path; unknown
  id / active thread → exit-1 (inject fakes; offline).
- **agent-audit**: agent count bumps to **26**; the new agent has valid frontmatter (update the
  count assertion).
- Per-file coverage threshold for `paper.ts` at measured actuals.

## Scope / non-goals (YAGNI)

- Single completed thread (cross-thread synthesis is slice 3).
- Markdown only — no LaTeX/PDF/BibTeX export.
- No citation graph beyond the Related Work node list (top-K, not a formatted bibliography).
- Regenerate-on-call (overwrite `PAPER.md`); no idempotency manifest.
- No auto-generation at FINALIZE — it is an explicit, deliberate command.

## Open risks

1. **Agent fabrication** — a paper-writer could overstate an exhausted thread. Mitigated by the
   explicit honesty rule + the bundle carrying the real verdict/metrics; the deterministic results
   table is the ground truth.
2. **Sparse threads** — a 1-iteration exhausted thread yields a thin paper; acceptable (the draft
   reflects the actual research depth).
