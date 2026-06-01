# Research Knowledge Promotion — Design (Slice A)

> Deferred LEARN-station item #1: promote a terminal research thread's takeaways
> into the shared project knowledge base (KNOWHOW.md + DEAD-ENDS.md) so research
> learnings compound across threads and feed the hypothesizer's grounding.
> Spec date: 2026-06-01.

## Goal

At FINALIZE/PERSIST, promote a terminal research thread's accumulated takeaways
into the shared project knowledge base:

- positive, reusable takeaways → project-root `KNOWHOW.md` (the same file
  autopilot/evolve/think consume), and
- falsified hypotheses → `.planning/DEAD-ENDS.md` (the same registry the
  `grd-hypothesizer` reads to avoid re-proposing dead approaches).

Default-on, disableable via `research_persist_knowledge: false`, provenance-
tagged (`source: research:<thread-id>#iter<N>`), and idempotent.

## Background (current state)

- LEARN spawns `grd-knowledge-miner` → `parseTakeawayOutput` → `appendTakeaway`
  writes `Takeaway` records ONLY to thread-local
  `.planning/research/threads/<id>/TAKEAWAYS.md`. They never reach the shared KB.
- `lib/knowledge.ts` already exposes `appendKnowhowEntries(knowhowPath,
  entries)` — merge + dedup-by-`pattern_name`, writes the `# KNOWHOW` file at a
  caller-supplied path. `buildKnowledgeInjectionBlock` reads
  `path.join(cwd, 'KNOWHOW.md')`.
- `.planning/DEAD-ENDS.md` already has a canonical writer/parser in
  **`lib/dead-ends.ts`** (do NOT invent a parallel one — Codex P1). Its
  `DeadEndEntry` schema is `{ approach, slug, tried_in_phases: string[], verdict,
  evidence?: string[], status: 'active'|'reopened', notes? }`, serialized as
  `## <slug>` + a fenced ```yaml block. Crucially, `parseDeadEndsFile` **drops**
  any entry lacking `approach` (line ~208), so research entries MUST use this
  schema or they will be silently discarded the next time `gd dead-end add`
  rewrites the file. Slug is auto-derived from `approach` via
  `generateSlugInternal` and is the dedup key: a repeat slug **merges** (appends
  `tried_in_phases`/`evidence`, flips `active`→`reopened`) rather than
  duplicating. YAML escaping is already handled by the module's `_yamlEscape`.
  Readers (`lib/think.ts`, `lib/genome.ts`) enumerate via `/^## (\S+)\s*$/m`.
- `Takeaway { kind: 'success_pattern'|'failure_root_cause'|'constraint'|
  'domain_fact'|'tool_pattern'; content; confidence; evidence; failureClass;
  iteration }`.
- `KnowhowEntry { pattern_name; source; applicability; code_snippet;
  phase_number; created_at }`.

## Non-Goals

- Slice B (grd-eval-reporter in MEASURE) — separate spec.
- Changing the deterministic verdict or any loop-control flow.
- A new dedup/merge engine OR a new DEAD-ENDS writer — reuse
  `appendKnowhowEntries`' name-dedup and `lib/dead-ends.ts`' slug-merge writer.
- Back-filling already-finalized threads.

## Where it runs (data flow)

Promotion is a **shared-KB write**, so it runs in PERSIST, *after* the
`kg_write` gate passes — alongside the Tesserae sync. The single correct
insertion point is **inside `finishKgSync`** (orchestrator.ts), NOT at the
`runLoop` call site: there are TWO callers of `finishKgSync` — the `runLoop`
FINALIZE path (~line 296) AND the `resumeResearch` `pending === 'kg_write'` path
(~line 336, when a thread paused at the gate is later approved). Wiring only
`runLoop` would skip promotion on the gated-then-resumed path (Codex P1a).
Placing it inside the shared chokepoint covers both:

```ts
async function finishKgSync(cwd, thread, verdict, status, kgClient?) {
  const sync = await syncFindingToKg(...);
  writeKgProvenance(...);
  if (sync.synced) incrementCounter('research.kg_writes_total');
  // NEW: promote takeaways → shared KB (gated + degrade-safe, never throws)
  promoteThreadKnowledge(cwd, thread,
    readTakeaways(cwd, thread.id), readLedger(cwd, thread.id),
    { iso: new Date().toISOString() });
  thread.status = status; thread.pendingGate = null; saveThread(...);
  return { ... };
}
```

Consequences:
- If `kg_write` is gated and the user declines, `finishKgSync` is not reached, so
  nothing is promoted (consistent: shared writes are gated). On `resume` after
  approval, the resume path calls `finishKgSync`, so promotion fires then.
- `promoteThreadKnowledge` reads the config gate itself and is fully wrapped in
  try/catch internally so any failure degrades (logs to stderr, never breaks
  finalize) — same discipline as the KG sync / resurvey-fetch. It is synchronous
  (file I/O only) so no `await` is required.

## New module: `lib/research/promote.ts`

All pure/decomposed and unit-testable; file writes via the existing
`appendKnowhowEntries` (KNOWHOW) and the existing `lib/dead-ends.ts`
`addDeadEnd` (DEAD-ENDS). No new file-writing primitives, no slugify, no YAML
serialization in this module — all reused.

### Config gate

```ts
function shouldPersistKnowledge(cwd: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8'))
      as { research_persist_knowledge?: unknown };
    return raw.research_persist_knowledge !== false; // default ON
  } catch { return true; }
}
```

Registered in `KNOWN_CONFIG_KEYS` (`lib/utils.ts`).

### KNOWHOW mapping

Select takeaways with `kind ∈ {success_pattern, constraint, domain_fact,
tool_pattern}` AND `confidence >= 0.5` (the 0.5 floor drops the LEARN fallback
default of `kind:'domain_fact', confidence:0.4` that is emitted when the miner
output fails to parse — i.e. noise). Map each:

```ts
function takeawayToKnowhow(t: Takeaway, threadId: string, iso: string): KnowhowEntry {
  return {
    pattern_name: t.content.trim().replace(/\s+/g, ' ').slice(0, 200),
    source: `research:${threadId}#iter${t.iteration}`,
    applicability: t.evidence ? `${t.kind} — ${t.evidence}` : t.kind,
    code_snippet: '',          // research takeaways carry no code
    phase_number: 0,           // 0 = research-origin sentinel (not a phase)
    created_at: iso,
  };
}
```

Written via `appendKnowhowEntries(path.join(cwd, 'KNOWHOW.md'), entries)` —
dedups by `pattern_name`, so re-finalize is idempotent. Because that function
returns `void`, the accurate added-count is computed by diffing
`parseKnowhowEntries` of the file before vs after the write (Codex P2), not by
assuming `entries.length`.

**Provenance caveat (accepted, Codex P2):** all research entries carry
`phase_number: 0`; `appendKnowhowEntries` overwrites an equal-`phase_number`
same-`pattern_name` entry, so a later thread teaching the *same* pattern replaces
the earlier entry's `source`/`created_at` (last-writer-wins). This matches how
phase-origin entries already behave and is acceptable — the pattern content is
identical; only the provenance pointer changes. We do NOT bloat `pattern_name`
with a thread id (that would defeat cross-thread dedup of genuinely identical
learnings, which is the whole point).

### DEAD-ENDS mapping (reuses `lib/dead-ends.ts` — Codex P1b)

Derived from **refuted hypotheses in the ledger** (`h.verdict === 'refuted'`),
which carry the falsified `approach` (the ledger has `statement` +
`predictedOutcome`; a free-form takeaway does not). We do NOT write the file
directly — we call the existing module's writer so research entries are
schema-compatible with the `gd dead-end` tooling, get the canonical
slug-derivation, merge-on-dup behavior, and `_yamlEscape`.

Small refactor to `lib/dead-ends.ts`: extract a programmatic core
`addDeadEnd(cwd, opts: DeadEndAddOpts): { action: 'created'|'updated'; slug: string }`
from `cmdDeadEndAdd` (the slug-gen + read + `_upsertEntry` + atomic write,
*without* the `error()`/`output()` CLI shell). `cmdDeadEndAdd` is refactored to
call `addDeadEnd` then print; `addDeadEnd` is added to `module.exports`. It
throws (not `error()`/exit) on an empty approach/slug so callers can catch.

For each refuted `Hypothesis h`, `promoteThreadKnowledge` calls:

```ts
addDeadEnd(cwd, {
  approach: h.statement,                                  // the falsified approach
  phase: `research:${thread.id}#iter${h.iteration}`,      // → tried_in_phases
  verdict: 'falsified',
  evidence: [
    `predicted: ${h.predictedOutcome}`,                   // ledger field (Codex P3 — no plan.json read)
    whyFailed,                                            // failure_root_cause takeaway for that iter, else 'verdict: refuted'
  ],
});
```

- `whyFailed` ← the `failure_root_cause` takeaway `content` matching
  `t.iteration === h.iteration` if present, else `'verdict: refuted'`.
- **Slug uniqueness/collision (Codex P2):** handled by the existing module —
  `generateSlugInternal(h.statement)` derives the slug and `_upsertEntry` MERGES
  same-slug entries (appends the new `research:<id>#iter<N>` phase + evidence,
  flips status to `reopened`) instead of silently dropping. Two threads landing
  on the same slug therefore accumulate provenance rather than colliding —
  strictly better than the per-file skip my first draft proposed.
- **YAML safety (Codex P2):** inherited from `lib/dead-ends.ts`'s `_yamlEscape`;
  if that escaping proves too weak for multi-line/backslash content during
  implementation, harden `_yamlEscape` to JSON-style scalar escaping (`\`, `"`,
  `\n`, `\r`, control chars) in that module so ALL callers benefit — do not
  special-case research.

### Orchestrating function

```ts
function promoteThreadKnowledge(
  cwd: string, thread: ResearchThread, takeaways: Takeaway[],
  ledger: Hypothesis[], opts: { iso: string },
): Promise<{ knowhowAdded: number; deadEndsAdded: number; skipped: boolean }>
```

- If `!shouldPersistKnowledge(cwd)` → return `{ knowhowAdded:0, deadEndsAdded:0,
  skipped:true }` (no files touched).
- Else: count KNOWHOW entries before, `appendKnowhowEntries`, count after →
  `knowhowAdded` = delta; for each refuted ledger hypothesis call `addDeadEnd`
  and count `action === 'created'` → `deadEndsAdded`. The whole body is wrapped
  in try/catch → on error, `process.stderr.write` a one-line warning and return
  zeros (never throws into the loop). Returns `{ knowhowAdded, deadEndsAdded,
  skipped:false }`.

## Files

- **Create** `lib/research/promote.ts` — `shouldPersistKnowledge`,
  `takeawayToKnowhow`, `selectKnowhowTakeaways`, `buildDeadEndCalls` (map refuted
  hypotheses + takeaways → `DeadEndAddOpts[]`), `promoteThreadKnowledge`.
- **Create** `tests/unit/research/promote.test.ts`.
- **Modify** `lib/dead-ends.ts` — extract + export programmatic `addDeadEnd(cwd,
  opts)` from `cmdDeadEndAdd` (no behavior change to the CLI path).
- **Modify** `lib/research/orchestrator.ts` — call `promoteThreadKnowledge` inside
  `finishKgSync` (the shared chokepoint); add `require('./promote')`.
- **Modify** `lib/utils.ts` — register `research_persist_knowledge`.
- **Modify** `CLAUDE.md` — Autoresearch section subsection.

## Testing strategy

Fully offline (real tmp dirs, no agents):

- `takeawayToKnowhow`: field mapping, `pattern_name` whitespace-collapse + 200-cap,
  provenance `source`, `phase_number 0`.
- `selectKnowhowTakeaways`: keeps positive kinds ≥0.5; drops `failure_root_cause`;
  drops a 0.4 fallback `domain_fact`.
- `buildDeadEndCalls`: one `DeadEndAddOpts` per refuted ledger hypothesis;
  `approach = h.statement`, `phase = research:<id>#iter<N>`, evidence includes
  `predicted: <h.predictedOutcome>` (from the ledger, no plan.json read) and the
  matching-iteration `failure_root_cause` takeaway content (else `verdict:
  refuted`); non-refuted hypotheses produce no call.
- `addDeadEnd` (in `lib/dead-ends.ts`): creates `.planning/DEAD-ENDS.md` with the
  canonical header when absent; a fresh approach → `action:'created'`; the SAME
  approach again → `action:'updated'` (slug merge: phase/evidence appended, no
  duplicate `## slug`); the written entry round-trips through `parseDeadEndsFile`
  AND is matched by the readers' `/^## (\S+)$/m`. Existing `cmdDeadEndAdd` tests
  stay green (behavior unchanged).
- `promoteThreadKnowledge`: gate off (`research_persist_knowledge:false`) →
  `{skipped:true}`, no files created; gate on → KNOWHOW.md + DEAD-ENDS.md written
  with accurate `knowhowAdded`/`deadEndsAdded` (computed by before/after diff /
  `created` count); second call is idempotent (counts 0, no file growth); an
  injected `appendKnowhowEntries`/`addDeadEnd` throw is swallowed (returns zeros,
  never throws).
- Orchestrator integration: (a) a thread finalized via `runLoop` with takeaways +
  a refuted ledger entry writes both files; (b) **a thread paused at `kg_write`
  then resumed** (the `pending==='kg_write'` path) ALSO writes both files (guards
  the Codex P1a regression); (c) gate off → neither file created; (d) existing
  orchestrator tests (which inject runner/spawn) stay green.

## Known limitations

- KNOWHOW dedup is by `pattern_name` only (existing engine); near-duplicate
  phrasings from different threads can both land, and identical `pattern_name`
  across threads is last-writer-wins on provenance (see KNOWHOW caveat above) —
  acceptable, matches how phase-origin entries already behave.
- DEAD-ENDS dedup/merge is by derived slug (existing `lib/dead-ends.ts`
  contract); two genuinely-distinct approaches that slugify identically would
  merge into one entry. This is the module's pre-existing behavior, not new to
  this slice.
- Promotion is project-global by design; `source: research:<id>` /
  `tried_in_phases: research:<id>#iter<N>` tagging makes research-origin entries
  filterable, but they DO influence autopilot/evolve/think that read
  KNOWHOW.md/DEAD-ENDS.md — this is the intended compounding (disable via
  `research_persist_knowledge: false`).
