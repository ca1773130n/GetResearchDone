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
      compile: async () => { compiles++; return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: true, nodeIds: ['n'], detail: '' }) };
    await ingest(cwd, src, { client });
    await ingest(cwd, src, { client });
    expect(compiles).toBe(1);
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
});
