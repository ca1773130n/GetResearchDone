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

  it('pre-spawn idempotency: unchanged KG skips the second spawn and compile', async () => {
    const cwd = tmp();
    let compiles = 0;
    let spawns = 0;
    const spawn = async () => { spawns++; return DOC; };
    const client = { isAvailable: () => true,
      compile: async (c: string) => { compiles++; fs.mkdirSync(path.join(c, '.tesserae'), { recursive: true }); fs.writeFileSync(path.join(c, '.tesserae/graph.json'), '{"nodes":[]}'); return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: true, nodeIds: ['s1'], detail: '' }) };
    await synthesize(cwd, 'RAG', { spawn, client });
    await synthesize(cwd, 'RAG', { spawn, client });
    expect(compiles).toBe(1);
    expect(spawns).toBe(1); // 2nd run short-circuited BEFORE spawning the agent
  });

  it('archives the prior synthesis (and sets supersedes) when the KG changes and the signature differs', async () => {
    const cwd = tmp();
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['s1'], detail: 'ok' } });
    const doc1 = DOC; // source_node_ids: [n2, n1]
    await synthesize(cwd, 'RAG', { spawn: async () => doc1, client });
    // Simulate the KG being recompiled (newer marker) so the next synthesize re-runs.
    const gp = path.join(cwd, '.tesserae/graph.json');
    const future = new Date(Date.now() + 60000);
    fs.utimesSync(gp, future, future);
    const doc2 = DOC.replace('source_node_ids: [n2, n1]', 'source_node_ids: [n3]'); // different signature
    await synthesize(cwd, 'RAG', { spawn: async () => doc2, client });
    const dir = path.join(cwd, '.planning/research/synthesis');
    const mds = fs.readdirSync(dir).filter((f: string) => f.endsWith('.md'));
    expect(mds.length).toBe(2); // rag.md (new) + rag.<priorKey8>.md (archived)
    expect(fs.existsSync(path.join(dir, 'rag.md'))).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'rag.md'), 'utf8')).toMatch(/supersedes: rag\.[0-9a-f]{8}\.md/); // lineage set
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

  it('compiles the full research tree (not just the synthesis subdir)', async () => {
    const cwd = tmp();
    let sources: string[] | null = null;
    const client = { isAvailable: () => true,
      compile: async (c: string, srcs: string[]) => { sources = srcs; fs.mkdirSync(path.join(c, '.tesserae'), { recursive: true }); fs.writeFileSync(path.join(c, '.tesserae/graph.json'), '{"nodes":[]}'); return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: true, nodeIds: ['s1'], detail: '' }) };
    await synthesize(cwd, 'RAG', { spawn: async () => DOC, client });
    expect(sources!.length).toBe(1);
    expect(sources![0].endsWith(path.join('.planning', 'research'))).toBe(true); // full tree, not /synthesis
  });

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
    const partial = '__CANDIDATES__\n' + JSON.stringify({ candidates: [
      { rank: 1, statement: 'ok', predicted_outcome: 'p' },
      { rank: 2, statement: 'no-prediction' },
    ] });
    expect(parseCandidates(partial).length).toBe(1);
  });

  it('buildSynthesizePrompt instructs the __CANDIDATES__ block', () => {
    const p = require('../../../lib/research/synthesize').buildSynthesizePrompt('rag');
    expect(p).toContain('__CANDIDATES__');
    expect(p).toContain('predicted_outcome');
    expect(p).toContain('source_node_ids');
  });

  it('Level-2 idempotent path still returns freshly-parsed candidates (recoverable re-seed)', async () => {
    const cwd = tmp();
    const docOut = DOC + '\n__CANDIDATES__\n' + JSON.stringify({ candidates: [
      { rank: 1, statement: 'A', rationale: 'r', predicted_outcome: 'p', source_node_ids: ['n1'] }] });
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['s1'], detail: 'ok' } });
    // First run writes doc + manifest (synthKey from source_node_ids [n2,n1]).
    await synthesize(cwd, 'RAG', { spawn: async () => docOut, client });
    // Bump the graph marker so Level-1 (pre-spawn) does NOT short-circuit → agent re-runs.
    const gp = path.join(cwd, '.tesserae/graph.json');
    const future = new Date(Date.now() + 60000);
    fs.utimesSync(gp, future, future);
    // Same source_node_ids → same synthKey → Level-2 path; candidates must still come back.
    const res = await synthesize(cwd, 'RAG', { spawn: async () => docOut, client });
    expect(res.detail).toMatch(/idempotent/);
    expect(res.candidates.length).toBe(1);
    expect(res.candidates[0].statement).toBe('A');
  });

  it('synthesize does not leak __CANDIDATES__ into the written doc + returns candidates', async () => {
    const cwd = tmp();
    const docOut = DOC + '\n__CANDIDATES__\n' + JSON.stringify({ candidates: [
      { rank: 1, statement: 'A', rationale: 'r', predicted_outcome: 'p', source_node_ids: ['n1'] }] });
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['s1'], detail: 'ok' } });
    const res = await synthesize(cwd, 'RAG', { spawn: async () => docOut, client });
    expect(res.candidates.length).toBe(1);
    const written = fs.readFileSync(res.docPath, 'utf8');
    expect(written).not.toContain('__CANDIDATES__');
  });
});
