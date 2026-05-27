'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ingest } = require('../../lib/research/ingest');
const { synthesize } = require('../../lib/research/synthesize');
const { createFakeTesseraeClient, createCliTesseraeClient } = require('../../lib/research/tesserae');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-sp2-e2e-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('SP2 ingest+synthesize (fake Tesserae, e2e)', () => {
  it('ingest then synthesize both report compiled and write artifacts', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, 'rag.md'), '# RAG\nretrieval augmented generation');
    const client = createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['n1'], detail: 'ok' } });

    const ing = await ingest(cwd, path.join(cwd, 'rag.md'), { client });
    expect(ing.status).toBe('compiled');

    const doc = `__SYNTHESIS__\n---\ntype: synthesis\ntopic_id: rag\ninput_query: "RAG"\ngenerated_at: 2026-05-26T00:00:00Z\nsynthesizer_version: 1\nsource_node_ids: [n1]\nsupersedes: none\n---\n## Compendium\nx\n## Open Questions\n- y`;
    const syn = await synthesize(cwd, 'RAG', { spawn: async () => doc, client });
    expect(syn.status).toBe('compiled');
    expect(fs.existsSync(path.join(cwd, '.planning/research/synthesis/rag.md'))).toBe(true);
  });

  it('TESSERAE_INTEGRATION: real compile makes content retrievable', async () => {
    if (process.env.TESSERAE_INTEGRATION !== '1') return; // gated; skipped by default
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, 'rag.md'), '# Retrieval Augmented Generation\nRAG combines retrieval and generation.');
    const ing = await ingest(cwd, path.join(cwd, 'rag.md')); // real CLI client (default)
    expect(['compiled', 'partial']).toContain(ing.status);
    if (ing.status === 'compiled') {
      const smoke = await createCliTesseraeClient().querySmokeCheck(cwd, 'retrieval');
      expect(smoke.found).toBe(true);
    }
  });
});
