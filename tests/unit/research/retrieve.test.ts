'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { retrieve, buildGroundingPack, classifyQuery } = require('../../../lib/research/retrieve');

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
    expect(res.detail).toContain('tesserae config status');
  });
});

describe('retrieve — semantic', () => {
  // Fake embedder: vector = [overlap-with("vector"), overlap-with("graph")] so we can steer ranking.
  const fakeEmbedder = async (texts: string[]) =>
    texts.map((t) => [/vector|embedding/i.test(t) ? 1 : 0, /graph/i.test(t) ? 1 : 0]);

  it('uses semantic similarity to rank a non-lexical match and reports semantic mode', async () => {
    const cwd = fixture([
      { id: 'n1', name: 'embeddings', description: 'dense vector representations' }, // lexical miss for "vector"? has "vector" in desc
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

describe('classifyQuery (Gap 10 — query-shape heuristic)', () => {
  it('classifies a camelCase symbol as identifier', () => {
    expect(classifyQuery('getUserName')).toBe('identifier');
  });
  it('classifies a path/dotted token as identifier', () => {
    expect(classifyQuery('lib/research/retrieve.ts')).toBe('identifier');
  });
  it('classifies a snake_case token as identifier', () => {
    expect(classifyQuery('rank_lexical_score')).toBe('identifier');
  });
  it('classifies a natural-language sentence as conceptual', () => {
    expect(classifyQuery('what is retrieval augmented generation')).toBe('conceptual');
  });
  it('classifies prose containing a code symbol as mixed', () => {
    expect(classifyQuery('how does fooBar work here')).toBe('mixed');
  });
  it('treats a blank query as mixed', () => {
    expect(classifyQuery('   ')).toBe('mixed');
  });
});

describe('retrieve — query-type routing (Gap 10)', () => {
  // Only the query and S3 align in embedding space → semantic = [S3] (P/Q/C/D filtered).
  const fakeEmbedder = async (texts: string[]) =>
    texts.map((t) => (t === 'fooBar' || /anchor/i.test(t) ? [1, 0] : [0, 0]));
  // P is lexical-favored (more "foobar" hits); Q is the structure hub (boosted by the S3 seed).
  function routedFixture(): string {
    return fixture(
      [
        { id: 'P', name: 'fooBar fooBar', description: 'foobar foobar widget' },
        { id: 'Q', name: 'fooBar', description: 'foobar core' },
        { id: 'S3', name: 'central', description: 'semantic anchor' },
        { id: 'C', name: 'leafc', description: 'cc' },
        { id: 'D', name: 'leafd', description: 'dd' },
      ],
      [{ source: 'S3', target: 'Q' }, { source: 'Q', target: 'C' }, { source: 'Q', target: 'D' }],
    );
  }

  it('route:false yields byte-for-byte identical ranking to the default blend', async () => {
    const base = await retrieve(routedFixture(), 'fooBar', { embedder: fakeEmbedder });
    const off = await retrieve(routedFixture(), 'fooBar', { embedder: fakeEmbedder, route: false });
    expect(off.results.map((r: { id: string }) => r.id)).toEqual(base.results.map((r: { id: string }) => r.id));
    expect(off.results.map((r: { score: number }) => r.score)).toEqual(base.results.map((r: { score: number }) => r.score));
  });

  it('route:true on an identifier query up-weights structure and reorders', async () => {
    const off = await retrieve(routedFixture(), 'fooBar', { embedder: fakeEmbedder });
    const on = await retrieve(routedFixture(), 'fooBar', { embedder: fakeEmbedder, route: true });
    const offIds = off.results.map((r: { id: string }) => r.id);
    const onIds = on.results.map((r: { id: string }) => r.id);
    // structure-favored Q overtakes lexical-favored P only when routed.
    expect(offIds.indexOf('P')).toBeLessThan(offIds.indexOf('Q'));
    expect(onIds.indexOf('Q')).toBeLessThan(onIds.indexOf('P'));
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
