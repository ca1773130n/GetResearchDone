'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

/** Semantic cosine ranking using an injectable embedder; node vectors cached by content hash. */
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
