'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ingest } = require('../../../lib/research/ingest');
const { createFakeTesseraeClient } = require('../../../lib/research/tesserae');
const { readManifest } = require('../../../lib/research/manifest');

function projectWithDoc(name: string, body: string) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ing-'));
  fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
  const src = path.join(cwd, name);
  fs.writeFileSync(src, body);
  return { cwd, src };
}

describe('ingest', () => {
  it('copies md into corpus, writes manifest, compiles, smoke-checks → compiled', async () => {
    const { cwd, src } = projectWithDoc('paper.md', '# RAG\nretrieval augmented generation');
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['n1'], detail: 'ok' } });
    const res = await ingest(cwd, src, { client });
    expect(res.status).toBe('compiled');
    expect(fs.readdirSync(path.join(cwd, '.planning/research/corpus')).length).toBe(1);
    const man = readManifest(path.join(cwd, '.planning/research/ingest/manifest.json'));
    expect(man.length).toBe(1);
    expect(man[0].status).toBe('compiled');
    expect(man[0].nodeIds).toEqual(['n1']);
  });

  it('is idempotent: re-ingesting an unchanged file skips compile', async () => {
    const { cwd, src } = projectWithDoc('p.md', 'same');
    let compiles = 0;
    const client = { isAvailable: () => true,
      compile: async (cwd: string) => { compiles++; fs.mkdirSync(path.join(cwd, '.tesserae'), { recursive: true }); fs.writeFileSync(path.join(cwd, '.tesserae/graph.json'), '{"nodes":[]}'); return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: true, nodeIds: ['n'], detail: '' }) };
    await ingest(cwd, src, { client });
    await ingest(cwd, src, { client });
    expect(compiles).toBe(1);
  });

  it('recompiles when graph.json is missing (gitignored artifact gone)', async () => {
    const { cwd, src } = projectWithDoc('p.md', 'same');
    let compiles = 0;
    const client = { isAvailable: () => true,
      compile: async (c: string) => { compiles++; fs.mkdirSync(path.join(c, '.tesserae'), { recursive: true }); fs.writeFileSync(path.join(c, '.tesserae/graph.json'), '{"nodes":[]}'); return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: true, nodeIds: ['n'], detail: '' }) };
    await ingest(cwd, src, { client });
    fs.rmSync(path.join(cwd, '.tesserae/graph.json')); // simulate git clean / fresh checkout
    await ingest(cwd, src, { client });
    expect(compiles).toBe(2); // recompiled because the KG artifact was missing
  });

  it('reports skipped_no_tesserae without faking success', async () => {
    const { cwd, src } = projectWithDoc('p.md', 'x');
    const res = await ingest(cwd, src, { client: createFakeTesseraeClient({}) });
    expect(res.status).toBe('skipped_no_tesserae');
  });

  it('reports partial when compiled but smoke check finds nothing', async () => {
    const { cwd, src } = projectWithDoc('p.md', 'x');
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: false, nodeIds: [], detail: 'none' } });
    const res = await ingest(cwd, src, { client });
    expect(res.status).toBe('partial');
  });

  it('directory ingest smoke-checks each file (partial if any file is not retrievable)', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ing-'));
    fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const dir = path.join(cwd, 'papers');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'alpha.md'), '# Alpha');
    fs.writeFileSync(path.join(dir, 'beta.md'), '# Beta');
    const client = { isAvailable: () => true,
      compile: async (c: string) => { fs.mkdirSync(path.join(c, '.tesserae'), { recursive: true }); fs.writeFileSync(path.join(c, '.tesserae/graph.json'), '{"nodes":[]}'); return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async (_c: string, topic: string) => topic.includes('alpha') ? { found: true, nodeIds: ['na'], detail: '' } : { found: false, nodeIds: [], detail: '' } };
    const res = await ingest(cwd, dir, { client });
    expect(res.status).toBe('partial'); // beta not retrievable
    const man = readManifest(path.join(cwd, '.planning/research/ingest/manifest.json'));
    expect(man.find((e: any) => String(e.key).endsWith('alpha.md')).status).toBe('compiled');
    expect(man.find((e: any) => String(e.key).endsWith('beta.md')).status).toBe('partial');
  });

  it('ingests a directory of markdown files', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ing-'));
    fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    const dir = path.join(cwd, 'papers');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'a.md'), '# A');
    fs.writeFileSync(path.join(dir, 'b.md'), '# B');
    fs.writeFileSync(path.join(dir, 'ignore.txt'), 'not markdown');
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['n1'], detail: 'ok' } });
    const res = await ingest(cwd, dir, { client });
    expect(res.status).toBe('compiled');
    expect(res.files).toBe(2); // only the two .md files, not the .txt
    expect(fs.readdirSync(path.join(cwd, '.planning/research/corpus')).length).toBe(2);
  });

  it('removes the stale corpus copy when a file is re-ingested after editing', async () => {
    const { cwd, src } = projectWithDoc('p.md', 'v1 content');
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['n'], detail: 'ok' } });
    await ingest(cwd, src, { client });
    expect(fs.readdirSync(path.join(cwd, '.planning/research/corpus')).length).toBe(1);
    fs.writeFileSync(src, 'v2 edited content'); // change content -> new hash
    await ingest(cwd, src, { client });
    const copies = fs.readdirSync(path.join(cwd, '.planning/research/corpus'));
    expect(copies.length).toBe(1); // stale v1 copy removed; only the v2 copy remains
  });

  it('compiles the full research tree (not just the corpus subdir)', async () => {
    const { cwd, src } = projectWithDoc('p.md', 'x');
    let sources: string[] | null = null;
    const client = { isAvailable: () => true,
      compile: async (c: string, srcs: string[]) => { sources = srcs; fs.mkdirSync(path.join(c, '.tesserae'), { recursive: true }); fs.writeFileSync(path.join(c, '.tesserae/graph.json'), '{"nodes":[]}'); return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: true, nodeIds: ['n'], detail: '' }) };
    await ingest(cwd, src, { client });
    expect(sources!.length).toBe(1);
    expect(sources![0].endsWith(path.join('.planning', 'research'))).toBe(true); // full tree, not /corpus
  });
});
