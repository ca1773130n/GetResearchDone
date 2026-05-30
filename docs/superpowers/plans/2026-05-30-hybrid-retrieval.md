# SP2-D Hybrid Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deterministic hybrid retriever over the compiled `graph.json` (lexical + graph-structure + optional semantic, fused via RRF) whose grounding pack is injected into the hypothesizer and synthesizer prompts, plus a `gd retrieve` command.

**Architecture:** `lib/research/embedder.ts` (pluggable `Embedder`, API default, degrades to `null`) and `lib/research/retrieve.ts` (reads `graph.json`, ranks nodes three ways, RRF-fuses, caches node vectors by content hash, formats a grounding pack). The orchestrator and `synthesize` call `retrieve` before their spawns and inject the pack. Zero new deps (`graph.json` + global `fetch` + `crypto`).

**Tech Stack:** TypeScript (strict, CommonJS, zero `any`; `import type` allowed), Node 18+ `fetch`, Jest + ts-jest. Deterministic tests inject `embedder`/`fetch`/`retrieve` and use fixture `graph.json`; no network.

**Spec:** `docs/superpowers/specs/2026-05-30-hybrid-retrieval-design.md`

**Conventions:** `'use strict'` first line; typed requires; tests in `tests/unit/research/<module>.test.ts`. Single test: `npx jest tests/unit/research/<file>.test.ts`. Build: `npm run build:check`. Lint: `npm run lint`.

---

## Task 1: `embedder.ts` — pluggable embedder (API default, graceful degrade)

**Files:**
- Create: `lib/research/embedder.ts`
- Test: `tests/unit/research/embedder.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/unit/research/embedder.test.ts`:

```ts
'use strict';
const { defaultEmbedder } = require('../../../lib/research/embedder');

describe('defaultEmbedder', () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; });

  it('resolves null when no API key env is set (degrade)', async () => {
    delete process.env.GRD_EMBED_API_KEY; delete process.env.OPENAI_API_KEY;
    const embed = defaultEmbedder();
    expect(await embed(['hello'])).toBeNull();
  });

  it('POSTs to the endpoint and parses embeddings when a key is set', async () => {
    process.env.GRD_EMBED_API_KEY = 'k';
    let sentAuth = ''; let sentBody: { input?: string[]; model?: string } = {};
    const fetchImpl = async (_url: string, init: { headers: Record<string, string>; body: string }) => {
      sentAuth = init.headers.Authorization; sentBody = JSON.parse(init.body);
      return { status: 200, json: async () => ({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }) };
    };
    const embed = defaultEmbedder({ fetchImpl });
    const vecs = await embed(['a', 'b']);
    expect(vecs).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(sentAuth).toBe('Bearer k');
    expect(sentBody.input).toEqual(['a', 'b']);
  });

  it('resolves null on a non-2xx response (degrade, no throw)', async () => {
    process.env.GRD_EMBED_API_KEY = 'k';
    const fetchImpl = async () => ({ status: 500, json: async () => ({}) });
    expect(await defaultEmbedder({ fetchImpl })(['a'])).toBeNull();
  });

  it('resolves null when the request throws', async () => {
    process.env.GRD_EMBED_API_KEY = 'k';
    const fetchImpl = async () => { throw new Error('network down'); };
    expect(await defaultEmbedder({ fetchImpl })(['a'])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/embedder.test.ts`
Expected: FAIL — cannot find module `embedder`.

- [ ] **Step 3: Implement `lib/research/embedder.ts`:**

```ts
'use strict';

export type Embedder = (texts: string[]) => Promise<number[][] | null>;

type FetchImpl = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

/**
 * Returns an Embedder that calls an OpenAI-compatible embeddings endpoint when an API key env is
 * present, else resolves null (retrieval degrades to lexical+structure — no network egress).
 * Any non-2xx / thrown / malformed response also resolves null (never throws into retrieval).
 */
function defaultEmbedder(opts: { fetchImpl?: FetchImpl } = {}): Embedder {
  return async (texts: string[]): Promise<number[][] | null> => {
    const key = process.env.GRD_EMBED_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) return null;
    const model = process.env.GRD_EMBED_MODEL || 'text-embedding-3-small';
    const url = process.env.GRD_EMBED_URL || 'https://api.openai.com/v1/embeddings';
    const doFetch: FetchImpl = opts.fetchImpl || ((globalThis as { fetch?: FetchImpl }).fetch as FetchImpl);
    try {
      const resp = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ input: texts, model }),
      });
      if (resp.status < 200 || resp.status >= 300) {
        process.stderr.write(`Warning: embedder HTTP ${resp.status} — semantic retrieval disabled\n`);
        return null;
      }
      const data = (await resp.json()) as { data?: Array<{ embedding?: number[] }> };
      if (!data || !Array.isArray(data.data)) return null;
      const vecs = data.data.map((d) => d.embedding || []);
      return vecs.length === texts.length && vecs.every((v) => v.length > 0) ? vecs : null;
    } catch (e) {
      process.stderr.write(`Warning: embedder failed (${(e as Error).message}) — semantic retrieval disabled\n`);
      return null;
    }
  };
}

module.exports = { defaultEmbedder };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/embedder.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Build + commit**

```bash
npm run build:check
git add lib/research/embedder.ts tests/unit/research/embedder.test.ts
git commit -m "feat(research): embedder.ts — pluggable embedder, API default, graceful degrade (hybrid-retrieval task 1)"
```

---

## Task 2: `retrieve.ts` — lexical + structure + RRF + grounding pack (no semantic yet)

**Files:**
- Create: `lib/research/retrieve.ts`
- Test: `tests/unit/research/retrieve.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/unit/research/retrieve.test.ts`:

```ts
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { retrieve, buildGroundingPack } = require('../../../lib/research/retrieve');

function fixture(nodes: unknown[], edges: unknown[] = []): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-retr-'));
  fs.mkdirSync(path.join(cwd, '.tesserae'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.tesserae/graph.json'), JSON.stringify({ nodes, edges }));
  fs.mkdirSync(path.join(cwd, '.planning/research'), { recursive: true });
  return cwd;
}

describe('retrieve — lexical + structure', () => {
  it('ranks a lexically matching node first', async () => {
    const cwd = fixture([
      { id: 'n1', name: 'Retrieval augmented generation', description: 'RAG combines retrieval and generation' },
      { id: 'n2', name: 'Unrelated topic', description: 'about cats' },
    ]);
    const res = await retrieve(cwd, 'retrieval generation');
    expect(res.modes.lexical).toBe(true);
    expect(res.modes.semantic).toBe(false);
    expect(res.results[0].id).toBe('n1');
  });

  it('structure pulls in a graph-neighbor with no lexical match', async () => {
    const cwd = fixture(
      [
        { id: 'n1', name: 'retrieval', description: 'retrieval methods' },
        { id: 'n2', name: 'BM25', description: 'a ranking function' }, // no query-term overlap
      ],
      [{ source: 'n1', target: 'n2' }],
    );
    const res = await retrieve(cwd, 'retrieval');
    expect(res.modes.structure).toBe(true);
    expect(res.results.map((r: { id: string }) => r.id)).toContain('n2');
  });

  it('returns empty (non-fatal) when there is no graph.json', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-retr-'));
    const res = await retrieve(cwd, 'anything');
    expect(res.results).toEqual([]);
    expect(res.modes).toEqual({ lexical: false, semantic: false, structure: false });
  });
});

describe('buildGroundingPack', () => {
  it('formats a markdown block from ranked nodes', () => {
    const md = buildGroundingPack([
      { id: 'n1', name: 'RAG', description: 'retrieval augmented generation', source_path: 'corpus/rag.md', score: 0.5, modes: ['lexical'] },
    ], 'rag');
    expect(md).toMatch(/## Retrieved grounding/);
    expect(md).toContain('RAG');
    expect(md).toContain('corpus/rag.md');
  });
  it('returns empty string for no results', () => {
    expect(buildGroundingPack([], 'x')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/retrieve.test.ts`
Expected: FAIL — cannot find module `retrieve`.

- [ ] **Step 3: Implement `lib/research/retrieve.ts`** (semantic is a typed seam filled in Task 3):

```ts
'use strict';
const fs = require('fs');
const path = require('path');
import type { Embedder } from './embedder';

interface GraphNode { id: string; name?: string; type?: string; description?: string; source_path?: string; aliases?: string[]; }
interface GraphEdge { source?: string; target?: string; from?: string; to?: string; }
export interface RankedNode { id: string; name: string; description: string; source_path: string; score: number; modes: string[]; }
export interface RetrieveResult { results: RankedNode[]; modes: { lexical: boolean; semantic: boolean; structure: boolean }; detail: string; }
export interface RetrieveOpts { embedder?: Embedder; k?: number; seedCount?: number; hops?: number; }

const RRF_K = 60;

function readGraph(cwd: string): { nodes: GraphNode[]; edges: GraphEdge[] } | null {
  const p = path.join(cwd, '.tesserae', 'graph.json');
  if (!fs.existsSync(p)) return null;
  try {
    const g = JSON.parse(fs.readFileSync(p, 'utf8')) as { nodes?: GraphNode[]; edges?: GraphEdge[] };
    return { nodes: Array.isArray(g.nodes) ? g.nodes : [], edges: Array.isArray(g.edges) ? g.edges : [] };
  } catch { return null; }
}

function nodeText(n: GraphNode): string {
  return `${n.name || ''} ${(n.aliases || []).join(' ')} ${n.description || ''}`.trim();
}
function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

/** BM25-lite lexical ranking → node ids best-first (only nodes with score > 0). */
function rankLexical(nodes: GraphNode[], query: string): string[] {
  const qTokens = Array.from(new Set(tokenize(query)));
  const docs = nodes.map((n) => tokenize(nodeText(n)));
  const N = docs.length || 1;
  const df = new Map<string, number>();
  for (const t of qTokens) df.set(t, docs.filter((d) => d.includes(t)).length);
  const scored = nodes.map((n, i) => {
    const doc = docs[i];
    let s = 0;
    for (const t of qTokens) {
      const tf = doc.filter((x) => x === t).length;
      if (!tf) continue;
      const idf = Math.log(1 + N / (1 + (df.get(t) || 0)));
      s += (tf / (tf + 1)) * idf;
    }
    return { id: n.id, s };
  }).filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s);
  return scored.map((x) => x.id);
}

function buildAdjacency(edges: GraphEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => { if (!adj.has(a)) adj.set(a, []); adj.get(a)!.push(b); };
  for (const e of edges) {
    const a = e.source ?? e.from; const b = e.target ?? e.to;
    if (typeof a === 'string' && typeof b === 'string') { add(a, b); add(b, a); }
  }
  return adj;
}

/** Personalized-PageRank-lite: BFS ≤hops from seeds, score += 1/(1+dist). → node ids best-first. */
function rankStructure(seeds: string[], adj: Map<string, string[]>, hops: number): string[] {
  const score = new Map<string, number>();
  for (const seed of seeds) {
    const seen = new Map<string, number>([[seed, 0]]);
    const queue: string[] = [seed];
    while (queue.length) {
      const cur = queue.shift() as string;
      const dist = seen.get(cur) as number;
      score.set(cur, (score.get(cur) || 0) + 1 / (1 + dist));
      if (dist >= hops) continue;
      for (const nb of adj.get(cur) || []) {
        if (!seen.has(nb)) { seen.set(nb, dist + 1); queue.push(nb); }
      }
    }
  }
  return Array.from(score.entries()).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}

/** Reciprocal Rank Fusion over several best-first id rankings. */
function rrf(rankings: string[][]): Array<{ id: string; score: number; modes: number[] }> {
  const fused = new Map<string, { score: number; modes: number[] }>();
  rankings.forEach((rk, mi) => {
    rk.forEach((id, rank) => {
      const cur = fused.get(id) || { score: 0, modes: [] };
      cur.score += 1 / (RRF_K + rank + 1); // 1-based rank (standard RRF)
      cur.modes.push(mi);
      fused.set(id, cur);
    });
  });
  return Array.from(fused.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.score - a.score);
}

// Semantic ranking is added in Task 3; this seam keeps it off until then.
async function rankSemantic(_nodes: GraphNode[], _query: string, _cwd: string, _embedder?: Embedder): Promise<string[] | null> {
  return null;
}

async function retrieve(cwd: string, query: string, opts: RetrieveOpts = {}): Promise<RetrieveResult> {
  const k = opts.k ?? 8;
  const seedCount = opts.seedCount ?? 10;
  const hops = opts.hops ?? 2;
  const graph = readGraph(cwd);
  if (!graph || graph.nodes.length === 0) {
    return { results: [], modes: { lexical: false, semantic: false, structure: false }, detail: 'no graph' };
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const lexical = rankLexical(graph.nodes, query);
  const semantic = await rankSemantic(graph.nodes, query, cwd, opts.embedder);

  const prelimRankings = [lexical, semantic].filter((r) => r && r.length) as string[][];
  const seeds = rrf(prelimRankings).slice(0, seedCount).map((x) => x.id);
  const adj = buildAdjacency(graph.edges);
  const structure = rankStructure(seeds, adj, hops);

  // Only non-empty rankings participate in fusion AND in the mode names (so detail/modes agree).
  const present: Array<{ name: string; ranking: string[] }> = [];
  if (lexical.length) present.push({ name: 'lexical', ranking: lexical });
  if (semantic && semantic.length) present.push({ name: 'semantic', ranking: semantic });
  if (structure.length) present.push({ name: 'structure', ranking: structure });
  const presentModeNames = present.map((p) => p.name);
  const fused = rrf(present.map((p) => p.ranking));

  const results: RankedNode[] = fused
    .filter((f) => byId.has(f.id)) // a structure id may reference a node missing from `nodes`
    .slice(0, k)
    .map((f) => {
      const n = byId.get(f.id) as GraphNode;
      return {
        id: f.id, name: n.name || f.id, description: n.description || '',
        source_path: n.source_path || '', score: Number(f.score.toFixed(6)),
        modes: f.modes.map((mi) => presentModeNames[mi]).filter(Boolean),
      };
    });

  return {
    results,
    modes: { lexical: lexical.length > 0, semantic: !!(semantic && semantic.length), structure: structure.length > 0 },
    detail: `${results.length} result(s) [${presentModeNames.join('+') || 'none'}]`,
  };
}

/** Format the top ranked nodes into a markdown grounding block (empty string if none). */
function buildGroundingPack(results: RankedNode[], query: string): string {
  if (!results.length) return '';
  const lines = results.map((r) => {
    const desc = r.description.length > 200 ? r.description.slice(0, 200) + '…' : r.description;
    const src = r.source_path ? ` (${r.source_path})` : '';
    return `- **${r.name}**${src}: ${desc}`;
  });
  return [`## Retrieved grounding (hybrid) for "${query}"`, '', ...lines, ''].join('\n');
}

module.exports = { retrieve, buildGroundingPack };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/retrieve.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 5: Commit**

```bash
git add lib/research/retrieve.ts tests/unit/research/retrieve.test.ts
git commit -m "feat(research): retrieve.ts — lexical+structure+RRF hybrid retrieval + grounding pack (hybrid-retrieval task 2)"
```

---

## Task 3: `retrieve.ts` — semantic ranking + content-hash embedding cache

**Files:**
- Modify: `lib/research/retrieve.ts`
- Test: `tests/unit/research/retrieve.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append to `tests/unit/research/retrieve.test.ts`:

```ts
describe('retrieve — semantic', () => {
  // Fake embedder: vector = [overlap-with("vector"), overlap-with("graph")] so we can steer ranking.
  const fakeEmbedder = async (texts: string[]) =>
    texts.map((t) => [/vector|embedding/i.test(t) ? 1 : 0, /graph/i.test(t) ? 1 : 0]);

  it('uses semantic similarity to rank a non-lexical match and reports semantic mode', async () => {
    const cwd = fixture([
      { id: 'n1', name: 'embeddings', description: 'dense vector representations' }, // lexical miss for "graph database"
      { id: 'n2', name: 'cats', description: 'felines' },
    ]);
    // query embeds to [1,0]; n1 → [1,0] (cos 1), n2 → [0,0]; semantic surfaces n1.
    const res = await retrieve(cwd, 'vector', { embedder: fakeEmbedder });
    expect(res.modes.semantic).toBe(true);
    expect(res.results[0].id).toBe('n1');
  });

  it('caches node vectors by content hash — second retrieve does not re-embed', async () => {
    const cwd = fixture([{ id: 'n1', name: 'vector', description: 'x' }]);
    let calls = 0;
    const counting = async (texts: string[]) => { calls++; return texts.map(() => [1, 0]); };
    await retrieve(cwd, 'vector', { embedder: counting });
    const afterFirst = calls;
    await retrieve(cwd, 'vector', { embedder: counting });
    // The query is embedded each call (+1), but node vectors are served from cache.
    expect(calls).toBeLessThan(afterFirst * 2);
    expect(fs.existsSync(path.join(cwd, '.planning/research/.embeddings.json'))).toBe(true);
  });

  it('still returns results (semantic off) when the embedder yields null', async () => {
    const cwd = fixture([{ id: 'n1', name: 'vector', description: 'x' }]);
    const res = await retrieve(cwd, 'vector', { embedder: async () => null });
    expect(res.modes.semantic).toBe(false);
    expect(res.results[0].id).toBe('n1');
  });

  it('degrades (does not reject) when the embedder throws', async () => {
    const cwd = fixture([{ id: 'n1', name: 'vector', description: 'x' }]);
    const res = await retrieve(cwd, 'vector', { embedder: async () => { throw new Error('boom'); } });
    expect(res.modes.semantic).toBe(false);
    expect(res.results[0].id).toBe('n1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/retrieve.test.ts -t semantic`
Expected: FAIL — `rankSemantic` always returns null, so `modes.semantic` is false and the first test's expectation fails.

- [ ] **Step 3: Add cache helpers + cosine, and replace the `rankSemantic` seam** in `lib/research/retrieve.ts`.

Add `const crypto = require('crypto');` to the requires at the top. Add these helpers above `rankSemantic`:

```ts
function cachePath(cwd: string): string { return path.join(cwd, '.planning/research/.embeddings.json'); }

function loadCache(cwd: string, model: string): Map<string, number[]> {
  try {
    const c = JSON.parse(fs.readFileSync(cachePath(cwd), 'utf8')) as { model?: string; vectors?: Record<string, number[]> };
    if (c.model !== model || !c.vectors) return new Map();
    return new Map(Object.entries(c.vectors));
  } catch { return new Map(); }
}
function saveCache(cwd: string, model: string, vectors: Map<string, number[]>): void {
  try {
    fs.mkdirSync(path.dirname(cachePath(cwd)), { recursive: true });
    fs.writeFileSync(cachePath(cwd), JSON.stringify({ model, vectors: Object.fromEntries(vectors) }));
  } catch { /* cache is best-effort */ }
}
function sha1(s: string): string { return crypto.createHash('sha1').update(s).digest('hex'); }
function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
```

Replace the placeholder `rankSemantic` with the real implementation:
```ts
async function rankSemantic(nodes: GraphNode[], query: string, cwd: string, embedder?: Embedder): Promise<string[] | null> {
  if (!embedder) return null;
  try {
    const model = process.env.GRD_EMBED_MODEL || 'text-embedding-3-small';
    const cache = loadCache(cwd, model);
    const texts = nodes.map((n) => nodeText(n));
    const missingIdx = texts.map((t, i) => ({ t, i })).filter(({ t }) => !cache.has(sha1(t)));
    if (missingIdx.length) {
      const fresh = await embedder(missingIdx.map((m) => m.t));
      if (!fresh) return null; // degrade
      missingIdx.forEach((m, j) => cache.set(sha1(m.t), fresh[j]));
      saveCache(cwd, model, cache);
    }
    const qVecArr = await embedder([query]);
    if (!qVecArr) return null;
    const qVec = qVecArr[0];
    const scored = nodes.map((n, i) => ({ id: n.id, s: cosine(qVec, cache.get(sha1(texts[i])) || []) }))
      .filter((x) => x.s > 0);
    scored.sort((a, b) => b.s - a.s);
    return scored.map((x) => x.id);
  } catch {
    return null; // any embedder/cache failure degrades to lexical+structure
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/retrieve.test.ts && npm run build:check`
Expected: all PASS (lexical/structure + semantic); build OK.

- [ ] **Step 5: Commit**

```bash
git add lib/research/retrieve.ts tests/unit/research/retrieve.test.ts
git commit -m "feat(research): retrieve.ts — semantic ranking + content-hash embedding cache (hybrid-retrieval task 3)"
```

---

## Task 4: prompt builders accept an optional grounding pack

**Files:**
- Modify: `lib/research/_prompts.ts` (`buildHypothesizePrompt`)
- Modify: `lib/research/synthesize.ts` (`buildSynthesizePrompt`)
- Test: `tests/unit/research/_prompts.test.ts` (extend or create), `tests/unit/research/synthesize.test.ts` (extend)

- [ ] **Step 1: Write the failing tests.**

Append to `tests/unit/research/synthesize.test.ts` (inside the top-level describe):
```ts
  it('buildSynthesizePrompt injects a grounding pack when provided', () => {
    const { buildSynthesizePrompt } = require('../../../lib/research/synthesize');
    const p = buildSynthesizePrompt('rag', '## Retrieved grounding (hybrid) for "rag"\n\n- **RAG**: x');
    expect(p).toContain('## Retrieved grounding');
    expect(p).toContain('- **RAG**');
    // unchanged when no pack
    expect(buildSynthesizePrompt('rag')).not.toContain('Retrieved grounding');
  });
```

Create `tests/unit/research/_prompts.test.ts`:
```ts
'use strict';
const { buildHypothesizePrompt } = require('../../../lib/research/_prompts');

describe('buildHypothesizePrompt grounding pack', () => {
  const thread = { id: 't', question: 'Does X help?' };
  it('injects the pack when provided', () => {
    const p = buildHypothesizePrompt(thread, [], null, [], '## Retrieved grounding (hybrid) for "Does X help?"\n\n- **Xnode**: y');
    expect(p).toContain('## Retrieved grounding');
    expect(p).toContain('- **Xnode**');
  });
  it('is unchanged when no pack is given', () => {
    expect(buildHypothesizePrompt(thread, [], null, [])).not.toContain('Retrieved grounding');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/research/_prompts.test.ts tests/unit/research/synthesize.test.ts -t grounding`
Expected: FAIL — builders take no pack param.

- [ ] **Step 3: Add the `pack` param to `buildHypothesizePrompt`** in `lib/research/_prompts.ts`. Change the signature and inject the pack after the GROUND instruction lines:
```ts
function buildHypothesizePrompt(
  thread: { id: string; question: string },
  priorHyps: Pick<Hypothesis, 'id' | 'statement' | 'verdict'>[],
  priorVerdict: Verdict | null,
  priorTakeaways: Pick<Takeaway, 'iteration' | 'kind' | 'content' | 'failureClass'>[] = [],
  pack = '',
): string {
```
In the returned array, replace the line
```ts
    'ask, node_context). Read .planning/DEAD-ENDS.md to avoid re-proposing falsified approaches.',
```
with
```ts
    'ask, node_context). Read .planning/DEAD-ENDS.md to avoid re-proposing falsified approaches.',
    ...(pack ? ['', 'A hybrid retriever pre-fetched this grounding from the KG — use it as a starting point:', pack] : []),
```

- [ ] **Step 4: Add the `pack` param to `buildSynthesizePrompt`** in `lib/research/synthesize.ts`. Change `function buildSynthesizePrompt(topic: string): string {` to `function buildSynthesizePrompt(topic: string, pack = ''): string {`. In the returned array, after the line
```ts
    `for the topic: "${topic}". Produce a domain compendium + ranked open questions.`,
```
insert:
```ts
    ...(pack ? ['', 'A hybrid retriever pre-fetched this grounding from the KG — use it:', pack] : []),
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx jest tests/unit/research/_prompts.test.ts tests/unit/research/synthesize.test.ts && npm run build:check`
Expected: all PASS (existing synthesize tests unaffected — empty pack changes nothing); build OK.

- [ ] **Step 6: Commit**

```bash
git add lib/research/_prompts.ts lib/research/synthesize.ts tests/unit/research/_prompts.test.ts tests/unit/research/synthesize.test.ts
git commit -m "feat(research): prompt builders accept an optional hybrid grounding pack (hybrid-retrieval task 4)"
```

---

## Task 5: orchestrator wiring — retrieve before cold HYPOTHESIZE

**Files:**
- Modify: `lib/research/orchestrator.ts`
- Test: `tests/unit/research/orchestrator.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append inside the orchestrator describe:

```ts
  it('injects a hybrid grounding pack into the hypothesizer prompt', async () => {
    const cwd = tmp();
    let hypoPrompt = '';
    const spawn = async (prompt: string, agentType: string) => {
      if (agentType === 'grd-hypothesizer') { hypoPrompt = prompt; return '__HYPOTHESIS__ {"statement":"S","rationale":"r","predictedOutcome":"p"}'; }
      if (agentType === 'grd-experiment-runner') return '__PLAN__ {"procedure":"x","metricKey":"acc","comparator":">=","target":0.5,"language":"shell","scriptPath":"run.sh"}';
      return '__TAKEAWAY__ {"content":"t"}';
    };
    const runner = { run: () => ({ metrics: { acc: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
    const retrieveFn = async () => ({ results: [{ id: 'n1', name: 'GroundNode', description: 'd', source_path: 'corpus/x.md', score: 0.9, modes: ['lexical'] }], modes: { lexical: true, semantic: false, structure: true }, detail: '1' });
    await runResearch(cwd, 'Does X help?', { maxIterations: 1, noGates: true, spawn, runner, retrieve: retrieveFn });
    expect(hypoPrompt).toContain('Retrieved grounding');
    expect(hypoPrompt).toContain('GroundNode');
  });

  it('still completes if retrieve throws (degrade)', async () => {
    const cwd = tmp();
    const retrieveFn = async () => { throw new Error('boom'); };
    const res = await runResearch(cwd, 'Q', { maxIterations: 1, noGates: true, spawn: makeSpawn(), runner: makeRunner(), retrieve: retrieveFn });
    expect(['supported', 'exhausted']).toContain(res.status);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t "grounding pack"`
Expected: FAIL — `ResearchOptions` has no `retrieve`; prompt lacks the pack.

- [ ] **Step 3: Add the requires + `ResearchOptions.retrieve`** in `lib/research/orchestrator.ts`.

Add near the other `./` requires:
```ts
const { retrieve, buildGroundingPack } = require('./retrieve') as {
  retrieve: (cwd: string, query: string, opts?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>>; modes: Record<string, boolean>; detail: string }>;
  buildGroundingPack: (results: Array<Record<string, unknown>>, query: string) => string;
};
const { defaultEmbedder } = require('./embedder') as { defaultEmbedder: () => (texts: string[]) => Promise<number[][] | null> };
```

Extend `ResearchOptions`:
```ts
export interface ResearchOptions {
  maxIterations?: number;
  noGates?: boolean;
  model?: string;
  timeout?: number;
  spawn?: SpawnFn;
  runner?: Runner;
  retrieve?: (cwd: string, query: string, opts?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>>; modes: Record<string, boolean>; detail: string }>;
}
```

- [ ] **Step 4: Build the pack before the cold hypothesizer spawn.** In `runLoop`, resolve the retriever near where `spawn`/`runner` are resolved (top of the function):
```ts
  const retrieveFn = opts.retrieve || ((c: string, q: string) => retrieve(c, q, { embedder: defaultEmbedder() }));
```
In the cold HYPOTHESIZE branch, immediately before
`const hOut = await spawn(buildHypothesizePrompt(thread, priorHyps, priorVerdict, priorTakeaways), 'grd-hypothesizer');`
insert:
```ts
        let pack = '';
        try { const r = await retrieveFn(cwd, thread.question); pack = buildGroundingPack(r.results, thread.question); } catch { /* degrade */ }
```
and change that spawn line to pass `pack`:
```ts
        const hOut = await spawn(buildHypothesizePrompt(thread, priorHyps, priorVerdict, priorTakeaways, pack), 'grd-hypothesizer');
```

- [ ] **Step 5: Run tests to verify pass + full orchestrator suite**

Run: `npx jest tests/unit/research/orchestrator.test.ts && npm run build:check`
Expected: all PASS (the new pack tests + every existing loop test — existing tests pass no `retrieve`, so the default runs `retrieve` against a cwd with no graph.json → empty pack → prompt unchanged); build OK.

- [ ] **Step 6: Commit**

```bash
git add lib/research/orchestrator.ts tests/unit/research/orchestrator.test.ts
git commit -m "feat(research): orchestrator injects hybrid grounding pack into cold HYPOTHESIZE (hybrid-retrieval task 5)"
```

---

## Task 6: synthesize wiring — retrieve before the synthesizer spawn

**Files:**
- Modify: `lib/research/synthesize.ts`
- Test: `tests/unit/research/synthesize.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append inside the synthesize describe:

```ts
  it('injects a hybrid grounding pack into the synthesizer prompt', async () => {
    const cwd = tmp();
    let synthPrompt = '';
    const spawn = async (prompt: string) => { synthPrompt = prompt; return DOC; };
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['s1'], detail: 'ok' } });
    const retrieveFn = async () => ({ results: [{ id: 'n1', name: 'GroundNode', description: 'd', source_path: 'corpus/x.md', score: 0.9, modes: ['lexical'] }], modes: { lexical: true, semantic: false, structure: true }, detail: '1' });
    await synthesize(cwd, 'RAG', { spawn, client, retrieve: retrieveFn });
    expect(synthPrompt).toContain('Retrieved grounding');
    expect(synthPrompt).toContain('GroundNode');
  });
```
(`tmp`, `DOC`, `createFakeTesseraeClient`, `synthesize` are already imported in this file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/synthesize.test.ts -t "grounding pack"`
Expected: FAIL — `SynthesizeOpts` has no `retrieve`; prompt lacks the pack.

- [ ] **Step 3: Add the requires + `SynthesizeOpts.retrieve` + wire the pack** in `lib/research/synthesize.ts`.

Add requires near the top (after the existing `./` requires):
```ts
const { retrieve, buildGroundingPack } = require('./retrieve') as {
  retrieve: (cwd: string, query: string, opts?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>>; modes: Record<string, boolean>; detail: string }>;
  buildGroundingPack: (results: Array<Record<string, unknown>>, query: string) => string;
};
const { defaultEmbedder } = require('./embedder') as { defaultEmbedder: () => (texts: string[]) => Promise<number[][] | null> };
```

Extend `SynthesizeOpts`:
```ts
interface SynthesizeOpts {
  spawn: SynthSpawnFn;
  client?: TesseraeClient;
  retrieve?: (cwd: string, query: string, opts?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>>; modes: Record<string, boolean>; detail: string }>;
}
```

In `synthesize`, replace the spawn line
`const out = await opts.spawn(buildSynthesizePrompt(topic), 'grd-synthesizer');`
with:
```ts
  const retrieveFn = opts.retrieve || ((c: string, q: string) => retrieve(c, q, { embedder: defaultEmbedder() }));
  let pack = '';
  try { const r = await retrieveFn(cwd, topic); pack = buildGroundingPack(r.results, topic); } catch { /* degrade */ }
  const out = await opts.spawn(buildSynthesizePrompt(topic, pack), 'grd-synthesizer');
```

- [ ] **Step 4: Run tests to verify pass + full synthesize suite**

Run: `npx jest tests/unit/research/synthesize.test.ts && npm run build:check`
Expected: all PASS (existing synthesize tests pass no `retrieve` → default retrieve against the fixture cwd → empty pack unless a graph.json exists; the fake client writes a graph.json with one node, so the pack may be non-empty but the existing assertions don't inspect the prompt); build OK. If an existing test breaks because the prompt changed, it is only the prompt-content tests — none assert prompt text except the new one.

- [ ] **Step 5: Commit**

```bash
git add lib/research/synthesize.ts tests/unit/research/synthesize.test.ts
git commit -m "feat(research): synthesize injects hybrid grounding pack into the synthesizer prompt (hybrid-retrieval task 6)"
```

---

## Task 7: `gd retrieve` CLI command

**Files:**
- Modify: `lib/research/cli-kb.ts` (`cmdRetrieve`)
- Modify: `bin/grd-tools.ts` (dispatch)
- Modify: `lib/cli/index.ts` (register command name + tool routing)
- Test: `tests/unit/research/cli-kb.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append a new describe in `tests/unit/research/cli-kb.test.ts`:

```ts
  describe('cmdRetrieve', () => {
    it('prints ranked results from an injected retrieve', async () => {
      const cwd = tmp();
      const deps = { retrieve: async () => ({ results: [{ id: 'n1', name: 'RAG', description: 'd', source_path: 'corpus/x.md', score: 0.5, modes: ['lexical'] }], modes: { lexical: true, semantic: false, structure: true }, detail: '1 result(s)' }) };
      const res = await captureOutputAsync(() => cmdRetrieve(cwd, 'rag', true, deps));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('RAG');
    });
    it('errors on an empty query', async () => {
      const cwd = tmp();
      const res = await captureErrorAsync(() => cmdRetrieve(cwd, '', true, {}));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/query|required/i);
    });
  });
```

Add `cmdRetrieve` to the destructured `require` at the top of the test file and to its type block:
```ts
  cmdRetrieve: (cwd: string, query: string, raw: boolean, deps?: Record<string, unknown>) => Promise<never>;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/unit/research/cli-kb.test.ts -t cmdRetrieve`
Expected: FAIL — `cmdRetrieve` is undefined.

- [ ] **Step 3: Implement `cmdRetrieve`** in `lib/research/cli-kb.ts`. Add the require near the others:
```ts
const { retrieve } = require('./retrieve') as {
  retrieve: (cwd: string, query: string, opts?: Record<string, unknown>) => Promise<{ results: Array<{ name: string; source_path: string; score: number }>; modes: Record<string, boolean>; detail: string }>;
};
const { defaultEmbedder } = require('./embedder') as { defaultEmbedder: () => (texts: string[]) => Promise<number[][] | null> };
```
Add the command function (before `module.exports`):
```ts
interface RetrieveDeps {
  retrieve?: (cwd: string, query: string, opts?: Record<string, unknown>) => Promise<{ results: Array<{ name: string; source_path: string; score: number }>; modes: Record<string, boolean>; detail: string }>;
}

async function cmdRetrieve(cwd: string, query: string, raw: boolean, deps: RetrieveDeps = {}): Promise<never> {
  if (!query || !query.trim()) error('retrieve: a query is required, e.g. gd retrieve "retrieval augmented generation"');
  const run = deps.retrieve || ((c: string, q: string) => retrieve(c, q, { embedder: defaultEmbedder() }));
  const res = await run(cwd, query);
  const lines = res.results.map((r, i) => `#${i + 1} ${r.name} (${r.score})${r.source_path ? ` — ${r.source_path}` : ''}`).join('\n');
  const text = `${res.detail}\n${lines}\n`;
  return output(res, raw, raw ? JSON.stringify(res) : text);
}
```
Add `cmdRetrieve` to the `module.exports` list.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/unit/research/cli-kb.test.ts -t cmdRetrieve && npm run build:check`
Expected: PASS; build OK.

- [ ] **Step 5: Register the command in the CLI.** In `lib/cli/index.ts`, add `'retrieve'` to the command list (near `'ingest'`) and to the tool-command predicate (the line `if (command === 'ingest' || command === 'synthesize') return 'tool';` → add `|| command === 'retrieve'`).

In `bin/grd-tools.ts`, add a dispatch case next to `ingest`/`synthesize`:
```ts
    case 'retrieve': {
      const { cmdRetrieve } = require('../lib/research/cli-kb') as {
        cmdRetrieve: (cwd: string, q: string, raw: boolean) => Promise<never>;
      };
      await cmdRetrieve(cwd, args.slice(1).filter((a) => !a.startsWith('--')).join(' '), raw);
      break;
    }
```

- [ ] **Step 6: Build + commit**

```bash
npm run build:check
git add lib/research/cli-kb.ts bin/grd-tools.ts lib/cli/index.ts tests/unit/research/cli-kb.test.ts
git commit -m "feat(research): gd retrieve — hybrid retrieval inspection command (hybrid-retrieval task 7)"
```

---

## Task 8: gitignore, coverage thresholds, docs, full verification

**Files:**
- Modify: `.gitignore`, `jest.config.js`, `CLAUDE.md`

- [ ] **Step 1: Ignore the embedding cache** — add to `.gitignore` under the Tesserae section:
```
# Hybrid-retrieval embedding cache (build artifact; can grow large)
.planning/research/.embeddings.json
```

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: clean (prefix unused args with `_`; thrown errors in `catch` use `{ cause: e }` if any are added — the degrade `catch` blocks here are empty, which is intentional and allowed).

- [ ] **Step 3: Measure coverage for the new files**

Run:
```bash
npx jest tests/unit/research/ --coverage --collectCoverageFrom='lib/research/retrieve.ts' --collectCoverageFrom='lib/research/embedder.ts' --coverageThreshold='{}' 2>&1 | grep -E "retrieve\.ts|embedder\.ts|% Stmts"
```
Note the measured `% Lines / % Funcs / % Branch`.

- [ ] **Step 4: Add per-file coverage thresholds** to `jest.config.js` (after the `./lib/research/pdf.ts` line), set a few points BELOW the Step-3 actuals:
```js
    './lib/research/retrieve.ts': { lines: 85, functions: 90, branches: 70 },
    './lib/research/embedder.ts': { lines: 85, functions: 90, branches: 70 },
```
Adjust the literals to sit just under the Step-3 actuals if those are lower; never above measured.

- [ ] **Step 5: Document the feature** in `CLAUDE.md` — under the autoresearch section, add a subsection before `## Gotchas`:
```markdown
### Hybrid retrieval (SP2-D)

`gd retrieve "<query>"` runs a deterministic hybrid retriever over the compiled `graph.json`:
lexical (BM25-lite) + graph-structure (PPR-lite over edges) + optional semantic (cosine over
embeddings), fused via Reciprocal Rank Fusion. The orchestrator (cold HYPOTHESIZE) and
`gd synthesize` inject the top-K as a grounding pack into the agent prompt — augmenting, not
replacing, the agent's Tesserae MCP grounding. Retrieval degrades gracefully (missing graph,
no embedder → it never blocks the loop). Semantic mode is **opt-in**: it embeds via an
OpenAI-compatible endpoint only when `GRD_EMBED_API_KEY` (or `OPENAI_API_KEY`) is set
(`GRD_EMBED_MODEL`/`GRD_EMBED_URL` optional) — otherwise zero network egress. Node vectors are
cached in `.planning/research/.embeddings.json` (gitignored) by content hash.
```

- [ ] **Step 6: Full research suite + build + lint**

Run: `npx jest tests/unit/research/ && npm run build:check && npm run lint`
Expected: all PASS; build OK; lint clean. (`git diff --name-only main` should show only `lib/research/{retrieve,embedder,_prompts,synthesize,orchestrator,cli-kb}.ts`, `bin/grd-tools.ts`, `lib/cli/index.ts`, the new/changed tests, `jest.config.js`, `.gitignore`, `CLAUDE.md`, docs.)

- [ ] **Step 7: Commit**

```bash
git add .gitignore jest.config.js CLAUDE.md
git commit -m "chore(research): gitignore embedding cache, coverage thresholds, docs for hybrid retrieval (hybrid-retrieval task 8)"
```

---

## Self-review notes (author)

- **Spec coverage:** embedder (T1), lexical+structure+RRF+pack (T2), semantic+cache (T3), prompt-pack params (T4), orchestrator wiring (T5), synthesize wiring (T6), `gd retrieve` CLI (T7), gitignore/coverage/docs (T8). RRF fusion, graceful degrade, content-hash cache, opt-in egress, augment-not-replace — all covered.
- **Type consistency:** `RetrieveResult{results,modes,detail}`, `RankedNode{id,name,description,source_path,score,modes}`, `Embedder=(texts)=>Promise<number[][]|null>`, `retrieve(cwd,query,opts)`, `buildGroundingPack(results,query)`, `buildHypothesizePrompt(...,pack='')`, `buildSynthesizePrompt(topic,pack='')` used identically across tasks and the injected test fakes.
- **Carried risk:** graph.json edge schema (parser tolerates `{source,target}`/`{from,to}`); embedding egress (opt-in + documented); retrieval is heuristic and only augments agent grounding.
```
