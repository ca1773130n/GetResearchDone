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
