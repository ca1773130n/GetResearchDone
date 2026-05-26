'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseSynthesisDoc, synthesize } = require('../../../lib/research/synthesize');
const { createFakeTesseraeClient } = require('../../../lib/research/tesserae');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-syn-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
const DOC = `__SYNTHESIS__
---
type: synthesis
topic_id: rag
input_query: "RAG"
generated_at: 2026-05-26T00:00:00Z
synthesizer_version: 1
source_node_ids: [n2, n1]
supersedes: none
---
## Compendium
RAG combines retrieval with generation.
## Open Questions
- How to evaluate retrieval quality?`;

describe('synthesize', () => {
  it('parseSynthesisDoc extracts frontmatter + requires fields', () => {
    const d = parseSynthesisDoc(DOC);
    expect(d).not.toBeNull();
    expect(d.frontmatter.topic_id).toBe('rag');
    expect(d.frontmatter.source_node_ids).toEqual(['n2', 'n1']);
    expect(parseSynthesisDoc('no tag here')).toBeNull();
    expect(parseSynthesisDoc('__SYNTHESIS__\n---\ntype: synthesis\n---\nno topic_id')).toBeNull();
  });

  it('synthesize writes doc + manifest, compiles, smoke-checks → compiled', async () => {
    const cwd = tmp();
    const spawn = async () => DOC;
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['s1'], detail: 'ok' } });
    const res = await synthesize(cwd, 'RAG', { spawn, client });
    expect(res.status).toBe('compiled');
    expect(fs.existsSync(path.join(cwd, '.planning/research/synthesis/rag.md'))).toBe(true);
  });

  it('returns compile_failed on an invalid synthesis doc', async () => {
    const cwd = tmp();
    const res = await synthesize(cwd, 'RAG', { spawn: async () => 'garbage', client: createFakeTesseraeClient({ available: true }) });
    expect(res.status).toBe('compile_failed');
  });

  it('is idempotent on identical source_node_ids + version', async () => {
    const cwd = tmp();
    let compiles = 0;
    const spawn = async () => DOC;
    const client = { isAvailable: () => true,
      compile: async (cwd: string) => { compiles++; fs.mkdirSync(path.join(cwd, '.tesserae'), { recursive: true }); fs.writeFileSync(path.join(cwd, '.tesserae/graph.json'), '{"nodes":[]}'); return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: true, nodeIds: ['s1'], detail: '' }) };
    await synthesize(cwd, 'RAG', { spawn, client });
    await synthesize(cwd, 'RAG', { spawn, client });
    expect(compiles).toBe(1);
  });

  it('archives the prior synthesis when re-synthesized with a different signature', async () => {
    const cwd = tmp();
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['s1'], detail: 'ok' } });
    const doc1 = DOC; // source_node_ids: [n2, n1]
    await synthesize(cwd, 'RAG', { spawn: async () => doc1, client });
    const doc2 = DOC.replace('source_node_ids: [n2, n1]', 'source_node_ids: [n3]'); // different signature
    await synthesize(cwd, 'RAG', { spawn: async () => doc2, client });
    const dir = path.join(cwd, '.planning/research/synthesis');
    const mds = fs.readdirSync(dir).filter((f: string) => f.endsWith('.md'));
    expect(mds.length).toBe(2); // rag.md (new) + rag.<priorKey8>.md (archived)
    expect(fs.existsSync(path.join(dir, 'rag.md'))).toBe(true);
  });

  it('skips before spawning when tesserae is unavailable', async () => {
    const cwd = tmp();
    let spawned = 0;
    const res = await synthesize(cwd, 'RAG', {
      spawn: async () => { spawned++; return ''; },
      client: createFakeTesseraeClient({}), // unavailable
    });
    expect(res.status).toBe('skipped_no_tesserae');
    expect(spawned).toBe(0); // never spawned the agent
  });

  it('recompiles when graph.json is missing (gitignored artifact gone)', async () => {
    const cwd = tmp();
    let compiles = 0;
    const spawn = async () => DOC;
    const client = { isAvailable: () => true,
      compile: async (c: string) => { compiles++; fs.mkdirSync(path.join(c, '.tesserae'), { recursive: true }); fs.writeFileSync(path.join(c, '.tesserae/graph.json'), '{"nodes":[]}'); return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: true, nodeIds: ['s1'], detail: '' }) };
    await synthesize(cwd, 'RAG', { spawn, client });
    fs.rmSync(path.join(cwd, '.tesserae/graph.json')); // simulate git clean / fresh checkout
    await synthesize(cwd, 'RAG', { spawn, client });
    expect(compiles).toBe(2); // recompiled because the KG artifact was missing
  });
});
