# Sub-project 2-B (first slice) — Ingestion + Layered Synthesis

**Date:** 2026-05-26
**Status:** Design (Codex-reviewed); awaiting user approval → implementation plan
**Depends on:** SP1 (autoresearch loop spine, merged) and the Tesserae-grounding change
(`feat/research-tesserae-grounding`: `grd-hypothesizer` grounds on the Tesserae KG via MCP).

---

## 1. Background & goal

GRD's autoresearch loop (`gd research "<q>"`, SP1) grounds the `grd-hypothesizer` agent on a
**Tesserae** knowledge graph (an external "typed LLM wiki graph" compiler/store) via its MCP
query tools. Tesserae is now the **single knowledge substrate** (the file-based
`.planning/LANDSCAPE.md` / `KNOWHOW.md` were deprecated as grounding sources).

Today the loop does **single-pass** grounding — it can only use whatever already happens to
be in the KG. This sub-project lets a user **feed a background knowledge base and synthesize
domain knowledge over it**, so the loop does genuinely *deep* research.

This document covers the **narrowed first slice** of sub-project 2-B, scoped down per Codex
review (see §12): prove that **write-by-compile actually creates retrievable Tesserae
knowledge**, end-to-end, with the minimum surface — before adding more source adapters.

## 2. Scope

**In scope (first slice):**
- A `TesseraeClient` adapter (the compile/query boundary) with one confirmed CLI backend.
- `gd ingest <local markdown path>` — Layer 1 for **local markdown only**.
- `gd synthesize "<topic>"` — Layer 2 over the **existing KG**.
- A `grd-synthesizer` agent.
- Manifests + content-hash idempotency + explicit statuses + a post-compile smoke check.
- Refactor SP1's broken `lib/research/kg.ts` (`--root` shell-out) to route through
  `TesseraeClient`.

**Deferred to fast-follow slices (NOT in this slice):**
- arXiv/web fetch (code-HTTP based, not agent-driven).
- PDF normalization.
- GRD session-history import.
- The corpus/source-adapter interface is shaped so these slot in later.

## 3. Decisions (from stakeholder Q&A + Codex review)

1. **Tesserae owns extraction/storage/dedup/merge/retrieval.** GRD owns only what Tesserae
   lacks: (eventually) external fetching, and **LLM domain synthesis**.
2. **Write-by-compile.** GRD never upserts KG nodes directly (Tesserae has no node-upsert MCP
   tool). GRD emits source docs and triggers a Tesserae compile.
3. **Standalone commands** (`gd ingest`, `gd synthesize`) build/enrich the KB; `gd research`
   is unchanged and grounds on the enriched KG automatically.
4. **Adapter-first** (Codex P0-1): a `TesseraeClient` interface is the single dependency
   point; nothing shells out to `tesserae` directly except the client's CLI backend.
5. **Schema-heavy synthesis docs** (Codex P0-2): Layer-2 output is a structured source
   document with explicit frontmatter, not prose, to survive re-extraction.
6. **Explicit statuses, no silent success** (Codex P1-4): ingest/synthesize never report
   success when compile failed.

## 4. Components

Each is a focused unit with a single responsibility.

### 4.1 `lib/research/tesserae.ts` — `TesseraeClient`
The boundary around Tesserae. Interface:

```ts
type TesseraeStatus = 'compiled' | 'skipped_no_tesserae' | 'compile_failed' | 'partial';

interface CompileResult { status: TesseraeStatus; detail: string; }
interface SmokeResult { found: boolean; nodeIds: string[]; detail: string; }

interface TesseraeClient {
  isAvailable(): boolean;                          // tesserae CLI present + project registered
  compile(cwd: string, sources?: string[]): CompileResult;   // trigger a (re)compile
  querySmokeCheck(cwd: string, topic: string): SmokeResult;   // confirm content is retrievable
}
```

- **CLI backend** (`createCliTesseraeClient`): wraps the *confirmed* `tesserae` invocation
  (see §6) using `execFileSync` (shell-free, args array). `isAvailable()` checks the binary
  resolves and the project is registered. On any failure: returns a typed status, never
  throws out.
- **Injectable** for tests (a fake client). The orchestrator/ingest/synthesize accept a
  `TesseraeClient` (default: the CLI backend).
- **Replaces** SP1's `lib/research/kg.ts` direct shell-outs: `syncFindingToKg` is refactored
  to call `TesseraeClient.compile` so the loop's PERSIST and the new commands share one
  correct invocation.

### 4.2 `lib/research/ingest.ts` — `gd ingest <local-md path>` (Layer 1)
- Resolve input path (file or dir) → markdown files only.
- For each file: compute a content hash (sha256 of normalized bytes).
- Copy/link into a GRD-managed corpus dir under `.planning/research/corpus/`.
- Write/update an **ingest manifest** `.planning/research/ingest/manifest.json`:
  `[{ path, hash, status, compiledAt, nodeIds }]`.
- **Idempotent:** skip files whose hash is unchanged since last compile.
- Call `TesseraeClient.compile(cwd, [corpusDir])` → record status.
- On `compiled`: `querySmokeCheck` for the ingested filename/title → record observed
  `nodeIds` in the manifest. If the smoke check finds nothing → status `partial` (compiled
  but not retrievable) with a warning.
- Output an explicit status summary; non-zero exit on `compile_failed`.

### 4.3 `lib/research/synthesize.ts` — `gd synthesize "<topic>"` (Layer 2)
- Spawn `grd-synthesizer` (via the scheduler, reusing the loop's `defaultSpawn`/decode) with
  a prompt instructing it to query the KG (MCP) for the topic and emit a synthesis doc per
  the §7 schema.
- Parse the emitted doc; validate required frontmatter fields.
- Compute a synthesis key = `hash(topic + kgQuerySignature + synthesizerVersion)`.
- Write the synthesis doc into the corpus (`.planning/research/synthesis/<topic-slug>.md`)
  with `supersedes:` pointing at the prior synthesis for the same `topic_id` (don't delete).
- Update a **synthesis manifest** `.planning/research/synthesis/manifest.json`.
- `TesseraeClient.compile` → `querySmokeCheck(topic)` → record status + nodeIds.
- **Idempotent:** if the synthesis key is unchanged (same topic, same KG signature, same
  synthesizer version), skip regeneration.

### 4.4 `agents/grd-synthesizer.md`
- Tools: `Read, Write, Grep, Glob, mcp__plugin_tesserae_tesserae__*` (KG query, no execution).
- Queries the KG for the topic (`search_nodes`, `ask`, `node_context`), reads related source
  docs, and emits exactly one schema-conformant synthesis document (§7) — a domain compendium
  + ranked open questions.

### 4.5 CLI wiring
- `lib/cli/index.ts`: add `'ingest'` and `'synthesize'` to `TOOL_COMMANDS`.
- `bin/grd-tools.ts`: `case 'ingest':` and `case 'synthesize':` routing to the lib functions
  (mirroring the `research` case).

## 5. Data flow

```
gd ingest <local-md>
  → hash + manifest → TesseraeClient.compile(corpus) → querySmokeCheck → status

gd synthesize "<topic>"
  → grd-synthesizer (KG query via MCP) → schema-heavy synthesis.md
  → manifest (keyed by topic+signature+version) → TesseraeClient.compile → querySmokeCheck → status

gd research "<question>"   (UNCHANGED)
  → grd-hypothesizer grounds on the now-enriched KG via MCP
```

## 6. Prerequisite — confirm the real Tesserae compile invocation (Codex P0-1)

SP1's `kg.ts` guessed `tesserae register --root <cwd>` / `tesserae refresh --root <cwd>`,
which the installed CLI **rejects** (`unrecognized arguments: --root`). The **first
implementation task** is to determine the correct invocation by inspecting the actual CLI
(`tesserae --help`, subcommand help) and/or the Tesserae MCP `register_project` tool, then
encode it in the CLI backend. Candidate operations to confirm:
- register a project / point Tesserae at a directory,
- compile / refresh that project,
- the query used for the smoke check (may be the MCP `search_nodes`/`ask`, callable by the
  agent — or a CLI query if one exists).

Until the invocation is confirmed, the CLI backend returns `skipped_no_tesserae` /
`compile_failed` rather than guessing — never a false `compiled`.

## 7. Synthesis document schema (Codex P0-2)

Layer-2 output is a **structured source document** (so Tesserae re-extracts it faithfully),
not prose. Required YAML frontmatter:

```yaml
---
type: synthesis
topic_id: <slug>
input_query: "<the topic string>"
generated_at: <iso8601>
synthesizer_version: <int>
source_node_ids: [<kg node ids the synthesis draws on>]
supersedes: <prior synthesis doc id | none>
---
```

Body sections (stable headings): `## Compendium` (the synthesized domain summary),
`## Claims` (bulleted, each with an `evidence_refs:` to source node ids), `## Open Questions`
(ranked, each a candidate research question — the bridge to sub-project C).

A **local manifest** records what GRD *intended* to write (topic, key, doc path, frontmatter)
so GRD's view is authoritative even if Tesserae's extraction differs.

## 8. Manifests & idempotency (Codex P2-7)

- `.planning/research/ingest/manifest.json` — content-hash per source; recompile only
  changed files.
- `.planning/research/synthesis/manifest.json` — synthesis key per topic; regenerate only
  when topic, KG-query signature, or synthesizer version changes; old synthesis marked
  `supersedes` (never blind-overwritten/deleted).

## 9. Error handling & statuses (Codex P1-4, P2-6)

`TesseraeClient` returns one of `compiled` / `skipped_no_tesserae` / `compile_failed` /
`partial`. Command behavior:
- `skipped_no_tesserae` — Tesserae not installed/registered: clear message, exit 0 (the KB
  just isn't updated), NOT a fake success.
- `compile_failed` — surfaced with the CLI error, **non-zero exit**.
- `partial` — compiled but `querySmokeCheck` found nothing for the topic/doc: warn loudly
  ("ingested content is not retrievable — the research loop may ground on nothing").
- `compiled` — smoke check found nodes; record their ids in the manifest.

`gd ingest` / `gd synthesize` NEVER report success on `compile_failed`.

## 10. Testing (Codex P1-4)

- **Unit (fake `TesseraeClient`):** `tests/unit/research/ingest.test.ts` (hashing, manifest
  write/skip-unchanged, status mapping, partial on empty smoke check),
  `tests/unit/research/synthesize.test.ts` (frontmatter validation, synthesis-key idempotency,
  supersede behavior), `tests/unit/research/tesserae.test.ts` (status mapping; CLI backend
  parses recorded stdout/stderr — a **contract test** with injected exec).
- **Integration (gated `TESSERAE_INTEGRATION=1`):** real `tesserae` compile of a tiny corpus
  → `querySmokeCheck` finds the node. Skipped by default so CI/local without Tesserae stays
  green.
- Mirror `lib/` conventions; honor per-file coverage thresholds.

## 11. Success criteria

1. `gd ingest <dir of markdown>` compiles them into Tesserae and a smoke check confirms the
   content is retrievable (status `compiled` with recorded node ids) — or returns an explicit
   `skipped`/`failed`/`partial`, never a false success.
2. `gd synthesize "<topic>"` produces a schema-conformant synthesis doc, compiles it, and the
   smoke check finds the synthesis nodes.
3. Re-running either command with unchanged inputs is a no-op (idempotent via manifest).
4. `gd research "<q>"` then visibly grounds on the ingested/synthesized knowledge (manual
   verification, since grounding is agent-side).
5. SP1's `kg.ts` now routes through `TesseraeClient` (the `--root` bug is gone).
6. Unit + contract tests pass with a fake client; the gated integration test passes against a
   real Tesserae.

## 12. Codex review (folded in)

Codex (independent review of the draft) raised 7 findings; all adopted:
- **P0-1** adapter-first `TesseraeClient` (→ §4.1, §6).
- **P0-2** schema-heavy synthesis docs + local manifest (→ §7).
- **P1-3** narrow the first slice to local-md + synthesize; defer arXiv/web/PDF/sessions
  (→ §2). *(Stakeholder approved the narrowing.)*
- **P1-4** boundary + explicit statuses + fake-client tests, no scattered graceful-degrade
  (→ §4.1, §9, §10).
- **P1-5** code-HTTP fetch (not agents) for arXiv — deferred with the fetch slice (→ §2).
- **P2-6** post-compile smoke check + provenance node ids (→ §4.2, §4.3, §9).
- **P2-7** content-hash + synthesis-key idempotency via manifests (→ §8).

## 13. Out of scope / follow-ups

- arXiv/web fetch (code HTTP), PDF normalization, session import — next slices.
- Sub-project C (insight→hypothesis pipeline) consumes the `## Open Questions` this slice
  produces.
- Deeper hybrid retrieval (sub-project D).
