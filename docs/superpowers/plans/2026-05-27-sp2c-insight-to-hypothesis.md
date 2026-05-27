# SP2-C — Insight → First-Class-Hypothesis Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gd synthesize "<topic>"` auto-emits ranked candidate hypotheses from the Tesserae KG, seeds one research thread per candidate (idempotently), and auto-runs the #1-ranked thread through the existing scientific loop.

**Architecture:** Extend `grd-synthesizer`'s output with a `__CANDIDATES__` object-wrapper block. `synthesize()` splits stdout (no doc pollution), parses candidates, returns them. A new `seed.ts` creates one seeded thread per candidate — writing an iteration-1 hypothesis (`origin:'synthesis'`) straight into the ledger — idempotent via a separate `seed-manifest.json` plus a `listThreads` scan. The orchestrator detects a seeded iter-1 hypothesis and skips the cold `grd-hypothesizer` spawn, going straight to DESIGN. `cmdSynthesize` wires synthesize → seed → auto-run rank-1 via `resumeResearch`.

**Tech Stack:** TypeScript (strict, CommonJS `require`/`module.exports`, zero `any`), Jest + ts-jest, Node `crypto`/`fs`.

**Spec:** `docs/superpowers/specs/2026-05-27-sp2c-insight-to-hypothesis-design.md`

**Conventions (match existing `lib/research/`):** `'use strict'` first line; `const x = require('./m') as { ... }` typed requires; `import type { ... } from './types'` for types only; tests in `tests/unit/research/<module>.test.ts`; deterministic tests inject `spawn`/`runner`/`client`/seeder (no real agents/tesserae). Run a single test file with `npx jest tests/unit/research/<file>.test.ts`.

---

## Task 1: Extend Hypothesis/Thread types + ledger round-trip + thread render

Adds `origin` + `sourceNodeIds` to `Hypothesis`, `seededFrom` to `ResearchThread`, and — critically — makes the ledger **serialize and parse** the new fields so `updateHypothesisStatus`'s read→rewrite cycle does not erase them (Codex P3).

**Files:**
- Modify: `lib/research/types.ts` (Hypothesis + ResearchThread interfaces)
- Modify: `lib/research/ledger.ts` (`formatHypothesis`, `parseHypotheses`)
- Modify: `lib/research/thread.ts` (`CreateOpts`, `createThread`, `renderThreadLog`)
- Test: `tests/unit/research/ledger.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test** — append to `tests/unit/research/ledger.test.ts` inside the top-level `describe`:

```ts
  it('round-trips origin + sourceNodeIds through updateHypothesisStatus (no erasure)', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ledger-'));
    const { appendHypothesis, updateHypothesisStatus, readLedger } =
      require('../../../lib/research/ledger');
    appendHypothesis(cwd, 't1', {
      id: 'h1', iteration: 1, statement: 'S', rationale: 'R', predictedOutcome: 'P',
      status: 'testing', parentId: null, verdict: null,
      origin: 'synthesis', sourceNodeIds: ['n1', 'n2'],
    });
    updateHypothesisStatus(cwd, 't1', 'h1', 'supported', 'supported');
    const [h] = readLedger(cwd, 't1');
    expect(h.origin).toBe('synthesis');
    expect(h.sourceNodeIds).toEqual(['n1', 'n2']);
    expect(h.status).toBe('supported');
    expect(h.verdict).toBe('supported');
  });

  it('defaults legacy hypotheses (no origin line) to origin=loop / sourceNodeIds=[]', () => {
    const { parseHypotheses } = require('../../../lib/research/ledger');
    const legacy = '### h1 (iter 1) [testing]\n\n- **statement:** S\n- **rationale:** R\n' +
      '- **predicted_outcome:** P\n- **parent:** none\n- **verdict:** none\n';
    const [h] = parseHypotheses(legacy);
    expect(h.origin).toBe('loop');
    expect(h.sourceNodeIds).toEqual([]);
  });
```

Ensure the test file's imports include `os` (`const os = require('os');`) — add it near the top if absent.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/ledger.test.ts -t "round-trips origin"`
Expected: FAIL — `h.origin` is `undefined` (not serialized yet).

- [ ] **Step 3: Extend the `Hypothesis` and `ResearchThread` types** in `lib/research/types.ts`:

In `Hypothesis`, after `verdict: Verdict | null;` add:
```ts
  origin?: 'loop' | 'synthesis';
  sourceNodeIds?: string[];
```

In `ResearchThread`, after `createdAt: string;` add:
```ts
  seededFrom?: { synthesisTopicId: string; sourceNodeIds: string[]; seedKey: string };
```

- [ ] **Step 4: Serialize + parse the new ledger fields** in `lib/research/ledger.ts`.

Replace `formatHypothesis` (lines 10-21) with:
```ts
function formatHypothesis(h: Hypothesis): string {
  return [
    `### ${h.id} (iter ${h.iteration}) [${h.status}]`,
    '',
    `- **statement:** ${h.statement}`,
    `- **rationale:** ${h.rationale}`,
    `- **predicted_outcome:** ${h.predictedOutcome}`,
    `- **parent:** ${h.parentId ?? 'none'}`,
    `- **verdict:** ${h.verdict ?? 'none'}`,
    `- **origin:** ${h.origin ?? 'loop'}`,
    `- **source_node_ids:** ${h.sourceNodeIds && h.sourceNodeIds.length ? h.sourceNodeIds.join(', ') : 'none'}`,
    '',
  ].join('\n');
}
```
(Using the literal `none` sentinel for empty `source_node_ids` avoids the greedy-`\s*` capture bug that an empty value would trigger in `field()`.)

In `parseHypotheses`, inside the `out.push({ ... })` object (after the `verdict:` line), add:
```ts
      origin: field(b, 'origin') === 'synthesis' ? 'synthesis' : 'loop',
      sourceNodeIds: (() => {
        const s = field(b, 'source_node_ids');
        return s && s !== 'none' ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
      })(),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/unit/research/ledger.test.ts`
Expected: PASS (all existing ledger tests + the 2 new ones).

- [ ] **Step 6: Surface `seededFrom` on the thread** in `lib/research/thread.ts`.

In `CreateOpts` (after `tokenProfile?: string;`) add:
```ts
  seededFrom?: { synthesisTopicId: string; sourceNodeIds: string[]; seedKey: string };
```
In `createThread`, after the `createdAt: new Date().toISOString(),` line add:
```ts
    seededFrom: opts.seededFrom,
```
In `renderThreadLog`, replace the `pending gate` line + `created` line region with:
```ts
    `- **pending gate:** ${t.pendingGate ?? 'none'}`,
    ...(t.seededFrom
      ? [`- **seeded from:** synthesis "${t.seededFrom.synthesisTopicId}" (${t.seededFrom.sourceNodeIds.length} source nodes)`]
      : []),
    `- **created:** ${t.createdAt}`,
```

- [ ] **Step 7: Run the type-check + full ledger/thread tests**

Run: `npm run build:check && npx jest tests/unit/research/ledger.test.ts tests/unit/research/thread.test.ts`
Expected: build OK; all PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/research/types.ts lib/research/ledger.ts lib/research/thread.ts tests/unit/research/ledger.test.ts
git commit -m "feat(research): ledger round-trips origin+sourceNodeIds; thread.seededFrom (SP2-C task 1)"
```

---

## Task 2: Parse `__CANDIDATES__` in synthesize.ts (with doc-pollution fix)

Adds the `Candidate` type, a defensive `parseCandidates`, and the stdout-split so candidates never leak into the written synthesis doc. Every `synthesize()` return path gains `candidates`.

**Files:**
- Modify: `lib/research/synthesize.ts`
- Test: `tests/unit/research/synthesize.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test** — append inside the top-level `describe` of `tests/unit/research/synthesize.test.ts`:

```ts
  it('parseCandidates: parses object-wrapper, sorts by rank, maps snake_case', () => {
    const { parseCandidates } = require('../../../lib/research/synthesize');
    const out = '__SYNTHESIS__\n...\n__CANDIDATES__\n' + JSON.stringify({ candidates: [
      { rank: 2, statement: 'B', rationale: 'rb', predicted_outcome: 'pb', source_node_ids: ['n2'] },
      { rank: 1, statement: 'A', rationale: 'ra', predicted_outcome: 'pa', source_node_ids: ['n1'] },
    ] });
    const c = parseCandidates(out);
    expect(c.map((x: { statement: string }) => x.statement)).toEqual(['A', 'B']);
    expect(c[0].predictedOutcome).toBe('pa');
    expect(c[0].sourceNodeIds).toEqual(['n1']);
  });

  it('parseCandidates: missing/malformed/incomplete → graceful', () => {
    const { parseCandidates } = require('../../../lib/research/synthesize');
    expect(parseCandidates('no tag here')).toEqual([]);
    expect(parseCandidates('__CANDIDATES__\n{not json')).toEqual([]);
    // candidate missing predicted_outcome is skipped
    const partial = '__CANDIDATES__\n' + JSON.stringify({ candidates: [
      { rank: 1, statement: 'ok', predicted_outcome: 'p' },
      { rank: 2, statement: 'no-prediction' },
    ] });
    expect(parseCandidates(partial).length).toBe(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/synthesize.test.ts -t parseCandidates`
Expected: FAIL — `parseCandidates is not a function`.

- [ ] **Step 3: Add the `Candidate` type + extend `SynthesizeResult`** in `lib/research/synthesize.ts`.

After the `SynthesizeResult` interface (line 13), add the `Candidate` interface and extend the result:
```ts
export interface Candidate {
  rank: number;
  statement: string;
  rationale: string;
  predictedOutcome: string;
  sourceNodeIds: string[];
}
export interface SynthesizeResult {
  status: TesseraeStatus; topicId: string; docPath: string | null; detail: string;
  candidates: Candidate[];
}
```
(Delete the old single-line `SynthesizeResult` interface so it is not declared twice.)

Add the typed require for `extractTaggedJson` near the other requires (after line 7):
```ts
const { extractTaggedJson } = require('./agent-io') as {
  extractTaggedJson: <T>(stdout: string, tag: string) => T | null;
};
```

- [ ] **Step 4: Implement `parseCandidates`** — add this function above `synthesize` (e.g. after `parseSynthesisDoc`):

```ts
function parseCandidates(stdout: string): Candidate[] {
  const wrap = extractTaggedJson<{ candidates?: unknown }>(stdout, 'CANDIDATES');
  if (!wrap || !Array.isArray(wrap.candidates)) return [];
  const parsed: Candidate[] = [];
  wrap.candidates.forEach((raw, i) => {
    const o = (raw || {}) as Record<string, unknown>;
    const statement = typeof o.statement === 'string' ? o.statement.trim() : '';
    const predictedOutcome = typeof o.predicted_outcome === 'string' ? o.predicted_outcome.trim() : '';
    if (!statement || !predictedOutcome) return; // skip incomplete
    parsed.push({
      rank: Number.isFinite(Number(o.rank)) ? Number(o.rank) : i + 1,
      statement,
      rationale: typeof o.rationale === 'string' ? o.rationale : '',
      predictedOutcome,
      sourceNodeIds: Array.isArray(o.source_node_ids) ? o.source_node_ids.map(String) : [],
    });
  });
  return parsed
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.rank - b.c.rank || a.i - b.i)
    .map((x) => x.c);
}
```

- [ ] **Step 5: Run the parse tests**

Run: `npx jest tests/unit/research/synthesize.test.ts -t parseCandidates`
Expected: PASS.

- [ ] **Step 6: Wire the split + thread `candidates` through every return** in `synthesize()`.

Find the spawn line `const out = await opts.spawn(buildSynthesizePrompt(topic), 'grd-synthesizer');` and the `parseSynthesisDoc(out)` that follows. Replace that pair with:
```ts
  const out = await opts.spawn(buildSynthesizePrompt(topic), 'grd-synthesizer');
  const ci = out.indexOf('__CANDIDATES__');
  const synthPart = ci >= 0 ? out.slice(0, ci) : out;
  const candidates = ci >= 0 ? parseCandidates(out.slice(ci)) : [];
  const doc = parseSynthesisDoc(synthPart);
```

Then add `candidates` to **every** `return` object in `synthesize()`:
- the `compile_failed` (invalid doc) return → `candidates: []`
- the post-spawn idempotent return (`unchanged (idempotent)`) → `candidates: []`
- the final success return → `candidates`

And the **pre-spawn** idempotent return (before the spawn) → `candidates: []`.

Update `module.exports` at the bottom to include `parseCandidates`:
```ts
module.exports = { parseSynthesisDoc, parseCandidates, buildSynthesizePrompt, synthesize, SYNTH_VERSION };
```

- [ ] **Step 7: Add a doc-pollution regression test** — append inside the `describe`:

```ts
  it('synthesize does not leak __CANDIDATES__ into the written doc', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-synth-'));
    fs.mkdirSync(path.join(cwd, '.planning/research'), { recursive: true });
    const docOut = '__SYNTHESIS__\n---\ntype: synthesis\ntopic_id: t\ninput_query: "t"\n' +
      'generated_at: x\nsynthesizer_version: 1\nsource_node_ids: [n1]\nsupersedes: none\n---\n' +
      '## Compendium\nbody\n## Open Questions\n- q\n' +
      '__CANDIDATES__\n' + JSON.stringify({ candidates: [
        { rank: 1, statement: 'A', rationale: 'r', predicted_outcome: 'p', source_node_ids: ['n1'] }] });
    const client = require('../../../lib/research/tesserae').createFakeTesseraeClient({ status: 'compiled', nodeIds: ['n1'] });
    const res = await require('../../../lib/research/synthesize').synthesize(cwd, 'topic', {
      spawn: async () => docOut, client,
    });
    expect(res.candidates.length).toBe(1);
    const written = fs.readFileSync(res.docPath, 'utf8');
    expect(written).not.toContain('__CANDIDATES__');
  });
```
(If `createFakeTesseraeClient`'s signature differs, mirror the call used by the existing synthesize tests in this file.)

- [ ] **Step 8: Run the full synthesize suite + build**

Run: `npx jest tests/unit/research/synthesize.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 9: Commit**

```bash
git add lib/research/synthesize.ts tests/unit/research/synthesize.test.ts
git commit -m "feat(research): synthesize parses __CANDIDATES__ object-wrapper; no doc pollution (SP2-C task 2)"
```

---

## Task 3: Extend the `grd-synthesizer` contract + `buildSynthesizePrompt`

The agent must emit the `__CANDIDATES__` block after `__SYNTHESIS__`.

**Files:**
- Modify: `agents/grd-synthesizer.md`
- Modify: `lib/research/synthesize.ts` (`buildSynthesizePrompt`)
- Test: `tests/unit/research/synthesize.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append inside the `describe`:

```ts
  it('buildSynthesizePrompt instructs the __CANDIDATES__ block', () => {
    const p = require('../../../lib/research/synthesize').buildSynthesizePrompt('rag');
    expect(p).toContain('__CANDIDATES__');
    expect(p).toContain('predicted_outcome');
    expect(p).toContain('source_node_ids');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/synthesize.test.ts -t "__CANDIDATES__ block"`
Expected: FAIL — prompt has no `__CANDIDATES__`.

- [ ] **Step 3: Extend `buildSynthesizePrompt`** in `lib/research/synthesize.ts`. Replace the closing array items (the `'## Open Questions'` and `'- <ranked candidate research questions>'` lines) and the `].join('\n')` with:
```ts
    '## Open Questions',
    '- <ranked candidate research questions>',
    '',
    'Then emit a SECOND block — testable, loop-ready hypotheses derived from the synthesis,',
    'ranked best-first. Each MUST include a measurable predicted_outcome:',
    '__CANDIDATES__',
    '{ "candidates": [',
    '  { "rank": 1, "statement": "<testable claim>", "rationale": "<why, grounded in the KG>",',
    '    "predicted_outcome": "<measurable expectation if true>", "source_node_ids": ["<kg id>"] }',
    '] }',
  ].join('\n');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/synthesize.test.ts -t "__CANDIDATES__ block"`
Expected: PASS.

- [ ] **Step 5: Update the agent doc** `agents/grd-synthesizer.md`. After the existing `__SYNTHESIS__` block description (the `## Open Questions` line area), add a second emitted block to the output contract:
```markdown

After the synthesis block, emit a second block of ranked, testable, loop-ready hypotheses
(best first). Each candidate MUST have a measurable `predicted_outcome` and cite the KG
node ids it draws on in `source_node_ids`:

__CANDIDATES__
{ "candidates": [
  { "rank": 1, "statement": "<testable claim>", "rationale": "<why, grounded in the KG>",
    "predicted_outcome": "<measurable expectation if true>", "source_node_ids": ["<kg id>"] }
] }
```
Also change any "Emit exactly one final block" wording to "Emit two final blocks (`__SYNTHESIS__` then `__CANDIDATES__`), in that order, with no prose after them."

- [ ] **Step 6: Verify the agent audit still passes** (count unchanged at 25; only content edited):

Run: `npx jest tests/unit/agent-audit.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add agents/grd-synthesizer.md lib/research/synthesize.ts tests/unit/research/synthesize.test.ts
git commit -m "feat(research): grd-synthesizer emits ranked __CANDIDATES__ block (SP2-C task 3)"
```

---

## Task 4: `seed.ts` — seed threads from candidates (idempotent)

The core new module. Creates one seeded thread per candidate (capped), idempotently.

**Files:**
- Create: `lib/research/seed.ts`
- Test: `tests/unit/research/seed.test.ts` (new)

- [ ] **Step 1: Write the failing test** — create `tests/unit/research/seed.test.ts`:

```ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { seedThreadsFromCandidates } = require('../../../lib/research/seed');
const { readLedger } = require('../../../lib/research/ledger');
const { listThreads } = require('../../../lib/research/thread');

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-seed-'));
  fs.mkdirSync(path.join(d, '.planning/research'), { recursive: true });
  return d;
}
const cands = (n: number) => Array.from({ length: n }, (_, i) => ({
  rank: i + 1, statement: `claim ${i + 1}`, rationale: 'r',
  predictedOutcome: 'p', sourceNodeIds: [`n${i + 1}`],
}));

describe('seedThreadsFromCandidates', () => {
  it('seeds one thread per candidate (capped) with an iter-1 synthesis hypothesis + provenance', () => {
    const cwd = tmp();
    const res = seedThreadsFromCandidates(cwd, 'topic-x', 'synthkey1', cands(5), { maxCandidates: 3 });
    expect(res.length).toBe(3);                       // capped
    expect(res[0].rank).toBe(1);
    const led = readLedger(cwd, res[0].threadId);
    expect(led.length).toBe(1);
    expect(led[0].iteration).toBe(1);
    expect(led[0].origin).toBe('synthesis');
    expect(led[0].status).toBe('testing');
    expect(led[0].parentId).toBeNull();
    expect(led[0].sourceNodeIds).toEqual(['n1']);
    expect(res.every((r: { newlySeeded: boolean }) => r.newlySeeded)).toBe(true);
  });

  it('is idempotent — re-seeding the same synthKey creates no new threads (manifest fast path)', () => {
    const cwd = tmp();
    seedThreadsFromCandidates(cwd, 'topic-x', 'k', cands(2), {});
    const before = listThreads(cwd).length;
    const again = seedThreadsFromCandidates(cwd, 'topic-x', 'k', cands(2), {});
    expect(listThreads(cwd).length).toBe(before);
    expect(again.every((r: { newlySeeded: boolean }) => !r.newlySeeded)).toBe(true);
  });

  it('is idempotent even if the seed manifest was lost (listThreads scan via seededFrom.seedKey)', () => {
    const cwd = tmp();
    const first = seedThreadsFromCandidates(cwd, 'topic-x', 'k', cands(1), {});
    fs.rmSync(path.join(cwd, '.planning/research/seed-manifest.json'), { force: true });
    const again = seedThreadsFromCandidates(cwd, 'topic-x', 'k', cands(1), {});
    expect(again[0].threadId).toBe(first[0].threadId);
    expect(again[0].newlySeeded).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/seed.test.ts`
Expected: FAIL — cannot find module `seed`.

- [ ] **Step 3: Implement `lib/research/seed.ts`:**

```ts
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
import type { Candidate } from './synthesize';
import type { Hypothesis } from './types';
const { createThread, listThreads } = require('./thread') as {
  createThread: (cwd: string, question: string, opts: Record<string, unknown>) => { id: string };
  listThreads: (cwd: string) => Array<{ id: string; seededFrom?: { seedKey?: string } }>;
};
const { appendHypothesis } = require('./ledger') as {
  appendHypothesis: (cwd: string, id: string, h: Hypothesis) => void;
};
const { readManifest, upsertManifest } = require('./manifest') as {
  readManifest: (p: string) => Array<{ key: string; [k: string]: unknown }>;
  upsertManifest: (p: string, key: string, entry: { key: string; [k: string]: unknown }) => void;
};

export interface SeedResult { rank: number; threadId: string; seedKey: string; newlySeeded: boolean; }
interface SeedOpts { maxCandidates?: number; }

function seedManifestPath(cwd: string): string {
  return path.join(cwd, '.planning/research/seed-manifest.json');
}
function seedKeyFor(synthKey: string, statement: string): string {
  return crypto.createHash('sha256').update(`${synthKey}|${statement}`).digest('hex');
}

/**
 * Create one seeded research thread per candidate (capped at maxCandidates, default 3).
 * Idempotent: a candidate already seeded for this synthKey is skipped, detected via the
 * seed manifest (fast path) or a listThreads scan on seededFrom.seedKey (crash-safe path).
 * Returns ranked results; never auto-runs (the caller decides).
 */
function seedThreadsFromCandidates(
  cwd: string, topicId: string, synthKey: string, candidates: Candidate[], opts: SeedOpts = {},
): SeedResult[] {
  const cap = opts.maxCandidates ?? 3;
  const manifestPath = seedManifestPath(cwd);
  const manifest = readManifest(manifestPath);
  const seededKeys = new Set(manifest.map((e) => String(e.key)));
  const threadKeys = new Set(
    listThreads(cwd).map((t) => t.seededFrom && t.seededFrom.seedKey).filter(Boolean) as string[],
  );
  const results: SeedResult[] = [];

  for (const c of candidates.slice(0, cap)) {
    const seedKey = seedKeyFor(synthKey, c.statement);
    const existing = manifest.find((e) => String(e.key) === seedKey);
    if (seededKeys.has(seedKey) && existing) {
      results.push({ rank: c.rank, threadId: String(existing.threadId), seedKey, newlySeeded: false });
      continue;
    }
    if (threadKeys.has(seedKey)) {
      const t = listThreads(cwd).find((x) => x.seededFrom && x.seededFrom.seedKey === seedKey);
      results.push({ rank: c.rank, threadId: t ? t.id : '', seedKey, newlySeeded: false });
      continue;
    }
    const thread = createThread(cwd, c.statement, {
      seededFrom: { synthesisTopicId: topicId, sourceNodeIds: c.sourceNodeIds, seedKey },
    });
    const hyp: Hypothesis = {
      id: 'h1', iteration: 1, statement: c.statement, rationale: c.rationale,
      predictedOutcome: c.predictedOutcome, status: 'testing', parentId: null, verdict: null,
      origin: 'synthesis', sourceNodeIds: c.sourceNodeIds,
    };
    appendHypothesis(cwd, thread.id, hyp);
    upsertManifest(manifestPath, seedKey, {
      key: seedKey, topicId, synthKey, rank: c.rank, threadId: thread.id,
      statement: c.statement, seededAt: new Date().toISOString(),
    });
    results.push({ rank: c.rank, threadId: thread.id, seedKey, newlySeeded: true });
  }
  return results.sort((a, b) => a.rank - b.rank);
}

module.exports = { seedThreadsFromCandidates, seedKeyFor, seedManifestPath };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/seed.test.ts`
Expected: PASS (all 3).

- [ ] **Step 5: Type-check**

Run: `npm run build:check`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add lib/research/seed.ts tests/unit/research/seed.test.ts
git commit -m "feat(research): seed.ts — idempotent thread seeding from synthesis candidates (SP2-C task 4)"
```

---

## Task 5: Orchestrator — adopt a seeded iter-1 hypothesis (skip cold HYPOTHESIZE)

**Files:**
- Modify: `lib/research/orchestrator.ts` (the `else` branch of the resume/cold fork in `runLoop`)
- Test: `tests/unit/research/orchestrator.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test** — append inside the orchestrator describe (reuse the file's existing `tmp`, `makeRunner`, and a spawn factory; the snippet below defines a spy spawn inline):

```ts
  it('a seeded synthesis thread skips grd-hypothesizer and goes straight to DESIGN', async () => {
    const cwd = tmp();
    const { seedThreadsFromCandidates } = require('../../../lib/research/seed');
    const { resumeResearch } = require('../../../lib/research/orchestrator');
    const [seed] = seedThreadsFromCandidates(cwd, 'topic', 'k', [{
      rank: 1, statement: 'Seeded claim', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n1'],
    }], {});
    const calls: string[] = [];
    const spawn = async (_p: string, agentType: string) => {
      calls.push(agentType);
      if (agentType === 'grd-experiment-runner') {
        return '__PLAN__ {"procedure":"x","metricKey":"acc","comparator":">=","target":0.5,"language":"shell","scriptPath":"run.sh"}';
      }
      return '__TAKEAWAY__ {"content":"t"}';
    };
    // Runner returns acc=0.9 >= target 0.5 → SUPPORTED in iteration 1, so the loop terminates
    // before any iteration-2 cold revision (which WOULD spawn grd-hypothesizer).
    const runner = { run: () => ({
      metrics: { acc: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1,
      stdoutExcerpt: '', failureClass: 'none',
    }) };
    const res = await resumeResearch(cwd, seed.threadId, { spawn, runner, noGates: true });
    expect(calls).toContain('grd-experiment-runner');     // DESIGN reached
    expect(calls).not.toContain('grd-hypothesizer');      // cold HYPOTHESIZE skipped
    expect(res.status).toBe('supported');
  });
```
(If the `tmp` helper is named differently in this file, use the existing one. The PLAN/TAKEAWAY tagged-JSON shapes must match what `parsePlanOutput` / `parseTakeawayOutput` expect — see `lib/research/agent-io.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t "seeded synthesis thread"`
Expected: FAIL — `grd-hypothesizer` IS spawned (a second hypothesis h2 is generated), so `calls` contains it.

- [ ] **Step 3: Add the seeded sub-branch** in `lib/research/orchestrator.ts`. Inside `runLoop`, locate the `} else {` that begins the cold HYPOTHESIZE block (the one starting with `// HYPOTHESIZE`). Replace the start of that `else` block — from `} else {` through the `appendHypothesis(cwd, thread.id, hyp);` line — with:

```ts
    } else {
      const seededHyp = priorHyps.find(
        (h) => h.iteration === thread.iteration && h.origin === 'synthesis'
          && h.verdict === null && h.status === 'testing',
      );
      if (seededHyp && thread.currentStation === 'seed' && thread.pendingGate === null) {
        // SEEDED: adopt the pre-seeded synthesis hypothesis; skip the cold grd-hypothesizer
        // spawn. It is already in the ledger — do NOT append it again.
        hyp = seededHyp;
      } else {
        // HYPOTHESIZE (cold)
        const lastHyp = priorHyps[priorHyps.length - 1] || null;
        const priorVerdict: Verdict | null = lastHyp ? lastHyp.verdict : null;
        thread.currentStation = 'hypothesize'; saveThread(cwd, thread);
        const priorTakeaways = readTakeaways(cwd, thread.id);
        const hOut = await spawn(buildHypothesizePrompt(thread, priorHyps, priorVerdict, priorTakeaways), 'grd-hypothesizer');
        const parsed = parseHypothesisOutput(hOut);
        if (!parsed) return errExit(cwd, thread);
        hyp = {
          id: nextHypothesisId(priorHyps), iteration: thread.iteration,
          statement: parsed.statement, rationale: parsed.rationale, predictedOutcome: parsed.predictedOutcome,
          status: 'testing', parentId: lastHyp ? lastHyp.id : null, verdict: null,
        };
        appendHypothesis(cwd, thread.id, hyp);
      }

      // DESIGN
```
Leave the rest of the block (from `// DESIGN` onward — the `grd-experiment-runner` spawn, plan write, GATE 1) exactly as-is. The DESIGN code is now shared by both inner branches.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t "seeded synthesis thread"`
Expected: PASS.

- [ ] **Step 5: Run the FULL orchestrator suite (guard the cold path + resume path)**

Run: `npx jest tests/unit/research/orchestrator.test.ts`
Expected: all PASS (the existing cold-start, resume-after-gate, and no-op-on-completed tests are unaffected).

- [ ] **Step 6: Commit**

```bash
git add lib/research/orchestrator.ts tests/unit/research/orchestrator.test.ts
git commit -m "feat(research): orchestrator adopts seeded iter-1 synthesis hypothesis, skips cold HYPOTHESIZE (SP2-C task 5)"
```

---

## Task 6: Wire `cmdSynthesize` — seed + auto-run rank-1

**Files:**
- Modify: `lib/research/cli-kb.ts`
- Test: `tests/unit/research/cli-kb.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test** — append inside the cli-kb describe. `output`/`error` throw in tests (process.exit abstraction); capture via try/catch on the thrown sentinel exactly as the existing cli-kb tests do. Pattern:

```ts
  it('cmdSynthesize seeds candidates and auto-runs only rank-1', async () => {
    const cwd = tmp();
    fs.mkdirSync(path.join(cwd, '.planning/research'), { recursive: true });
    const resumed: string[] = [];
    const deps = {
      synthesize: async () => ({
        status: 'compiled', topicId: 'topic', docPath: path.join(cwd, 'd.md'), detail: 'ok',
        candidates: [
          { rank: 1, statement: 'A', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n1'] },
          { rank: 2, statement: 'B', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n2'] },
        ],
      }),
      resumeRunner: async (_cwd: string, id: string) => { resumed.push(id); return { threadId: id, status: 'paused' }; },
    };
    await expectExit(() => cmdSynthesize(cwd, 'topic', true, deps));
    const { listThreads } = require('../../../lib/research/thread');
    expect(listThreads(cwd).length).toBe(2);   // both seeded
    expect(resumed.length).toBe(1);            // only rank-1 auto-run
  });

  it('cmdSynthesize does not seed when synthesize returns no candidates (idempotent)', async () => {
    const cwd = tmp();
    fs.mkdirSync(path.join(cwd, '.planning/research'), { recursive: true });
    const resumed: string[] = [];
    const deps = {
      synthesize: async () => ({ status: 'compiled', topicId: 'topic', docPath: null, detail: 'unchanged (idempotent)', candidates: [] }),
      resumeRunner: async (_cwd: string, id: string) => { resumed.push(id); return { threadId: id, status: 'paused' }; },
    };
    await expectExit(() => cmdSynthesize(cwd, 'topic', true, deps));
    expect(require('../../../lib/research/thread').listThreads(cwd).length).toBe(0);
    expect(resumed.length).toBe(0);
  });
```
Add an `expectExit` helper if the file lacks one (mirror existing cli-kb tests):
```ts
async function expectExit(fn: () => Promise<unknown>): Promise<void> {
  try { await fn(); } catch (e) { /* output()/error() throw the exit sentinel */ }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/cli-kb.test.ts -t cmdSynthesize`
Expected: FAIL — current `cmdSynthesize` neither seeds nor auto-runs.

- [ ] **Step 3: Update the typed requires + `SynthDeps`** in `lib/research/cli-kb.ts`.

Extend the `synthesize` typed require's return type to include `candidates` and add the seed + resume requires (after the `defaultSpawn` require, ~line 23):
```ts
const { seedThreadsFromCandidates } = require('./seed') as {
  seedThreadsFromCandidates: (
    cwd: string, topicId: string, synthKey: string,
    candidates: Array<{ rank: number; statement: string; rationale: string; predictedOutcome: string; sourceNodeIds: string[] }>,
    opts: { maxCandidates?: number },
  ) => Array<{ rank: number; threadId: string; seedKey: string; newlySeeded: boolean }>;
};
const { resumeResearch } = require('./orchestrator') as {
  resumeResearch: (cwd: string, id: string, opts: Record<string, unknown>) => Promise<{ threadId: string; status: string }>;
};
```
Update the `synthesize` typed require (lines 10-16) and `SynthDeps` (lines 50-56) so the synthesize return type includes `candidates: Array<{ rank: number; statement: string; rationale: string; predictedOutcome: string; sourceNodeIds: string[] }>`. Add to `SynthDeps`:
```ts
  resumeRunner?: (cwd: string, id: string, opts: Record<string, unknown>) => Promise<{ threadId: string; status: string }>;
```

Note: `synthKey` is not returned by `synthesize`; derive a stable per-topic key for `seedKey` from `res.topicId` + `res.detail` is NOT stable. Use `res.topicId` is stable but not source-aware. **Use the topicId as the synthKey argument here** — re-running unchanged returns `candidates: []` so seeding won't fire anyway, and `seedKey = sha256(topicId | statement)` is stable across re-emissions of the same insight. Pass `res.topicId` as the `synthKey` argument.

- [ ] **Step 4: Rewrite `cmdSynthesize`** so seeding + auto-run happen **before** `output(...)`:

```ts
async function cmdSynthesize(cwd: string, topic: string, raw: boolean, deps: SynthDeps = {}): Promise<never> {
  if (!topic || !topic.trim())
    error('synthesize: a topic is required, e.g. gd synthesize "retrieval augmented generation"');
  const run = deps.synthesize || synthesize;
  const spawn = defaultSpawn(cwd, loadConfig(cwd));
  const res = await run(cwd, topic, { spawn });
  const warn = statusWarning(res.status, res.detail);
  if (warn) process.stderr.write(warn + '\n');
  if (res.status === 'compile_failed') error(`synthesize: failed — ${res.detail}`);

  let seeded: Array<{ rank: number; threadId: string; newlySeeded: boolean }> = [];
  if (res.candidates && res.candidates.length > 0) {
    const cfg = loadConfig(cwd) as { research_max_candidates?: number };
    const maxCandidates = Number(cfg.research_max_candidates ?? 3);
    seeded = seedThreadsFromCandidates(cwd, res.topicId, res.topicId, res.candidates, { maxCandidates });
    const rank1 = seeded.find((s) => s.rank === Math.min(...seeded.map((x) => x.rank)));
    if (rank1 && rank1.newlySeeded) {
      const resume = deps.resumeRunner || resumeResearch;
      await resume(cwd, rank1.threadId, { spawn });
    }
  }
  const summary = `synthesize: ${res.status} (${res.topicId}) — seeded ${seeded.length}, auto-ran ${seeded.filter((s) => s.newlySeeded).length ? 1 : 0}\n`;
  return output({ ...res, seeded }, raw, raw ? JSON.stringify({ ...res, seeded }) : summary);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/unit/research/cli-kb.test.ts -t cmdSynthesize`
Expected: PASS (both cases).

- [ ] **Step 6: Type-check + full cli-kb suite**

Run: `npm run build:check && npx jest tests/unit/research/cli-kb.test.ts`
Expected: build OK; all PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/research/cli-kb.ts tests/unit/research/cli-kb.test.ts
git commit -m "feat(research): cmdSynthesize seeds candidates + auto-runs rank-1 (SP2-C task 6)"
```

---

## Task 7: Full-suite verification + lint + docs

**Files:**
- Modify (if coverage thresholds require): `jest.config.js` (per-file thresholds for `lib/research/seed.ts` only — set to actuals, do NOT lower others)
- Modify: `CLAUDE.md` (document `research_max_candidates`, the SP2-C flow)

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: clean (fix any `no-unused-vars` — prefix unused args with `_`; zero `any`).

- [ ] **Step 2: Run the full research test suite**

Run: `npx jest tests/unit/research/`
Expected: all PASS.

- [ ] **Step 3: Run the whole suite to catch regressions**

Run: `npm test 2>&1 | tail -30`
Expected: all SP2-C and pre-existing research tests pass. (Known pre-existing coverage-threshold failures on `autopilot`/`autopilot-pipeline`/`knowledge`/`verify` predate this branch and touch none of these files — confirm via `git diff --name-only main` that only `lib/research/*` + `agents/grd-synthesizer.md` + docs changed.)

- [ ] **Step 4: Set `seed.ts` coverage threshold if needed.** If `npm test` fails ONLY because `lib/research/seed.ts` lacks a per-file threshold entry, add one to `jest.config.js` `coverageThreshold` set to the actual measured numbers (read them from the coverage output). Do not touch other files' thresholds.

- [ ] **Step 5: Document the feature** in `CLAUDE.md`. Under the research section, add a short subsection:
```markdown
### Insight → hypothesis seeding (SP2-C)

`gd synthesize "<topic>"` auto-emits ranked candidate hypotheses (`__CANDIDATES__`), seeds
one research thread per candidate (capped by `research_max_candidates`, default 3), and
auto-runs only the #1-ranked thread (which pauses at the default execute gate). Seeded
hypotheses carry `origin: 'synthesis'` + `sourceNodeIds` (KG provenance); the orchestrator
adopts them directly, skipping the cold HYPOTHESIZE spawn. Idempotent via
`.planning/research/seed-manifest.json` + a thread scan. Remaining candidates wait for
`gd research resume <id>`.
```

- [ ] **Step 6: Commit**

```bash
git add jest.config.js CLAUDE.md
git commit -m "test(research): SP2-C full-suite verification + docs (task 7)"
```

---

## Self-review notes (author)

- **Spec coverage:** contract+parse (T2/T3), seed module+idempotency (T4), orchestrator skip (T5), auto-run rank-1 via `resumeResearch` (T6), ledger round-trip (T1), config cap (T6), provenance (T1/T4), graceful degradation (T2 parse tests). All spec sections map to a task.
- **Type consistency:** `Candidate` (synthesize.ts) used by seed.ts + cli-kb.ts with identical field names (`predictedOutcome`, `sourceNodeIds`); `SeedResult.newlySeeded` consumed identically in cli-kb; `seededFrom.seedKey` written in seed.ts and read in both seed.ts (scan) and the orchestrator guard checks `origin`/`station`/`pendingGate`.
- **Open risk carried from spec:** the rare pre-spawn seed-skip crash window (documented, not fixed this slice).
