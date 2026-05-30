# SP2-D — Deep Hybrid Retrieval over the KG (Design)

- **Date:** 2026-05-30
- **Status:** Brainstormed; ready for plan + Codex review (review after planning, per user)
- **Depends on:** SP2-B/C (merged), arXiv/web ingestion (merged), PDF/session import (merged).
- **Slice 4 of 4** (final) remaining SP2 deferred slices.

## Motivation

Today the loop's grounding is **agent-driven**: the hypothesizer/synthesizer freely call Tesserae
MCP tools (`search_nodes`, `ask`, `node_context`). GRD's own `TesseraeClient` only does a crude
**lexical substring** `querySmokeCheck` over `graph.json`. SP2-D adds a **deterministic, reproducible
hybrid retriever** in GRD code that fuses lexical + graph-structure + (optional) semantic signals,
and injects a grounding pack into the hypothesizer **and** synthesizer prompts — so grounding no
longer depends on the agent remembering to query well. GRD code cannot call MCP (only agents can),
so the retriever reads the compiled `graph.json` directly. **Zero new dependencies** (`graph.json`
parsing + global `fetch`).

## Locked decisions (from brainstorming)

1. **Hybrid = lexical + graph-structure + semantic.**
2. **Embeddings: pluggable embedder, API default, graceful degrade.** GRD computes its own vectors
   (both node text and query) in one space; an injectable `Embedder` interface; the default hits an
   OpenAI-compatible embeddings endpoint only when an API key env is set, else returns `null` and
   retrieval degrades to lexical + structure. No forced dependency or key.
3. **Wire into both** the hypothesizer (via the orchestrator) and the synthesizer prompts. Agent MCP
   grounding stays as augmentation (not replaced).
4. **Fusion: Reciprocal Rank Fusion (RRF)** — scale-free across the three signals.
5. **Read `graph.json`** (nodes + edges), not sqlite. Node-level retrieval.

## Architecture (all `lib/research/`, zero new deps)

| Unit | Change | Purpose |
|---|---|---|
| **`retrieve.ts`** (new) | new | `retrieve(cwd, query, opts) → RetrieveResult` — read `graph.json`, score nodes by lexical + structure + optional semantic, fuse via RRF, return ranked nodes + which modes ran. |
| **`embedder.ts`** (new) | new | `Embedder = (texts: string[]) => Promise<number[][] \| null>`; `defaultEmbedder()` returns an `Embedder` that POSTs to an OpenAI-compatible endpoint when an API key env is set, else resolves `null`. Injectable. |
| `_prompts.ts` | extend | `buildGroundingPack(results, query) → markdown`; `buildHypothesizePrompt` / `buildSynthesizePrompt` accept an optional `pack` string injected into their GROUND section. |
| `orchestrator.ts` | wire | injectable `retrieve?` in `ResearchOptions`; cold HYPOTHESIZE does `await retrieve(...)` (try/catch) and passes the pack into `buildHypothesizePrompt`. |
| `synthesize.ts` | wire | injectable `retrieve?` in `SynthesizeOpts`; before the spawn, `await retrieve(...)` and pass the pack into `buildSynthesizePrompt`. |
| `cli-kb.ts` + `bin/grd-tools.ts` + `lib/cli/index.ts` | add | `gd retrieve "<query>"` — run retrieval, print ranked results (`--json`/raw). |
| `.gitignore` | add | the embedding cache `.planning/research/.embeddings.json`. |

### Types

```ts
interface GraphNode { id: string; name?: string; type?: string; description?: string; source_path?: string; aliases?: string[]; }
interface GraphEdge { source?: string; target?: string; from?: string; to?: string; } // tolerate both shapes
interface RankedNode { id: string; name: string; description: string; source_path: string; score: number; modes: string[]; }
interface RetrieveResult { results: RankedNode[]; modes: { lexical: boolean; semantic: boolean; structure: boolean }; detail: string; }
type Embedder = (texts: string[]) => Promise<number[][] | null>;
interface RetrieveOpts { embedder?: Embedder; k?: number; seedCount?: number; hops?: number; }
```

### Three signals over `graph.json`

Node text = `name + ' ' + aliases.join(' ') + ' ' + description`.
- **Lexical (always):** BM25-lite over the node corpus vs query tokens (lowercase, split on
  non-alphanumeric, drop length-1 tokens). Rank desc.
- **Semantic (optional):** if `embedder` yields vectors — cosine(query-vec, node-vec). Node vectors
  are **cached** by `sha1(node text)`; the query vector is embedded per call. Skipped (no error) when
  the embedder returns `null` or throws.
- **Structure (always):** seeds = top `seedCount` (default 10) nodes by the lexical∪semantic prelim
  ranking; BFS over `edges` up to `hops` (default 2); `structureScore[node] += seedWeight / (1 + dist)`.
  Surfaces graph-connected nodes a keyword/vector match alone misses.

### Fusion (RRF)

For each mode that ran, produce a ranking; fused score = Σ_modes `1 / (RRF_K + rank)` with
`RRF_K = 60` (standard). Sort desc → top-`k` (default 8). RRF avoids fragile cross-signal score
normalization (lexical magnitudes vs cosine vs structure are incomparable).

## Data flow — `retrieve(cwd, query, opts)`

1. Read `.tesserae/graph.json`. Missing/malformed → `{ results: [], modes: {all false}, detail }`
   (non-fatal).
2. Build node corpus texts.
3. Lexical rank.
4. Semantic: `vecs = opts.embedder ? await opts.embedder([...]) : null` (guarded). Load cache; embed
   only uncached node texts; persist cache; embed the query; cosine rank. Any failure → skip semantic.
5. Structure: seeds from lexical∪semantic; BFS over edges; rank.
6. RRF over the modes that ran → top-`k`.
7. Return results + `modes` + `detail`.

## Embedder + cache (`embedder.ts`)

`defaultEmbedder(): Embedder` reads env at call time: `GRD_EMBED_API_KEY` (fallback `OPENAI_API_KEY`),
`GRD_EMBED_MODEL` (default `text-embedding-3-small`), `GRD_EMBED_URL` (default
`https://api.openai.com/v1/embeddings`). No key → resolves `null` (degrade — **no network egress unless
configured**). Else POST `{ input: texts, model }` with `Authorization: Bearer <key>`, parse
`data[].embedding`; any non-2xx / thrown / shape error → `null` (warn once to stderr). Injectable
`fetch` for tests.

Cache `.planning/research/.embeddings.json` = `{ model, vectors: { <sha1(text)>: number[] } }`. If the
stored `model` differs from the current model → reset `vectors`. Persisted after embedding new nodes.
Gitignored (can grow large). The query vector is never cached.

## Privacy / security

Semantic mode sends node text to an external embeddings API. It is **strictly opt-in** — it requires
the API-key env var; the default-degrade path means **zero egress** otherwise. The endpoint is
env-configurable (supports self-hosted OpenAI-compatible servers). The key is read from env, never
logged or persisted. Documented in `CLAUDE.md`.

## Wiring

- `buildGroundingPack(results, query)` → `''` for empty results (prompt unchanged); else a
  `## Retrieved grounding (hybrid) for "<query>"` block listing top-K as
  `- **<name>** (<source_path>): <description, truncated>`.
- `buildHypothesizePrompt(thread, priorHyps, priorVerdict, priorTakeaways, pack='')` and
  `buildSynthesizePrompt(topic, pack='')` inject the pack into their GROUND area (empty pack = no change,
  so existing tests pass).
- Orchestrator cold HYPOTHESIZE: `let pack = ''; try { const r = await retrieveFn(cwd, thread.question); pack = buildGroundingPack(r.results, thread.question); } catch { /* degrade */ }`. The seeded-synthesis branch (skips cold hypothesize) needs no pack.
- `synthesize`: same pattern before the spawn, using `topic`.
- `retrieveFn` is injectable (`ResearchOptions.retrieve` / `SynthesizeOpts.retrieve`), defaulting to the
  real `retrieve` bound with `defaultEmbedder()`, so loop/synth tests stay offline and deterministic.

## Error handling

Retrieval **never breaks the loop**: missing/bad graph, null/failed embedder, or any `retrieve` throw
all degrade — the pack is omitted and the agent still grounds via MCP. The embedder failure warns once.

## `gd retrieve "<query>"`

`cmdRetrieve(cwd, query, raw)` runs `retrieve` and prints ranked results: raw =
`#<n> <name> (<score>) — <source_path>` lines plus a `modes:` summary; `--json` = the full
`RetrieveResult`. Errors on an empty query. Registered in `bin/grd-tools.ts` and `lib/cli/index.ts`
(tool command, like `ingest`/`synthesize`).

## Testing (deterministic; inject `embedder`/`retrieve`; fixture `graph.json`)

- **`retrieve.ts`**: lexical ranking on a fixture graph; structure expansion pulls a graph-neighbor
  with no lexical match; a fake embedder reorders results (semantic on); RRF fuses the rankings;
  embedder `null` → `modes.semantic === false` but results still returned (lexical+structure); cache
  reuse (two retrieves → embedder called once); model-change invalidation; missing graph → empty.
- **`embedder.ts`**: no key env → resolves `null`; injected fake `fetch` + key → parsed vectors;
  non-2xx / throw → `null`.
- **`_prompts.ts`**: `buildGroundingPack` top-K formatting; empty results → `''`; both prompt builders
  include the pack text when provided and are unchanged when `pack=''`.
- **`orchestrator.ts` / `synthesize.ts`**: inject a fake `retrieve` returning a pack → the spawned
  prompt contains the pack; inject a throwing `retrieve` → the loop/synth still completes.
- **`cli-kb.ts`**: `cmdRetrieve` ranked output; empty-query error.
- Per-file coverage thresholds for `retrieve.ts` + `embedder.ts` set just below measured actuals (the
  default embedder's real network path is not unit-tested).

## Scope / non-goals (YAGNI)

- Read `graph.json` only (no sqlite/embedding-store reverse-engineering).
- Node-level retrieval (no chunk/passage splitting).
- Content-hash embedding cache (no re-embed every run); no background/precompute step.
- RRF top-K only (no MMR diversity, no cross-encoder reranking).
- One env-configured embeddings endpoint (no multi-provider routing).
- No replacement of the agent's MCP grounding — the pack augments it.

## Open risks

1. **Embedding egress/cost** — mitigated by opt-in + default-degrade; documented.
2. **graph.json edge schema** may use `{source,target}` or `{from,to}` (or ids vs indices); the parser
   tolerates both and falls back to lexical+semantic-only if edges are unusable.
3. **Retrieval quality** is heuristic (BM25-lite + PPR-lite); it augments rather than replaces agent
   grounding, so a weak pack never blocks the loop. Tunable weights/K are constants, easily adjusted.
