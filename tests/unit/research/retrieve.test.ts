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
