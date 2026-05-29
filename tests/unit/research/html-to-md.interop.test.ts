'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

// Enforces that the declared web-ingestion deps are require()-compatible in the REAL Node
// runtime that `gd ingest` uses (tsx/node), not jest's loader. Jest does not transform
// node_modules, so an ESM file in jsdom's transitive deps trips jest's CJS loader even though
// plain `node` requires them fine — so we run the check in a child `node` process. This still
// FAILS (not skips) if a dep regresses to ESM-only, which is the regression Codex asked us to catch.
describe('web-ingestion deps CJS interop (real node runtime)', () => {
  it('lazy-requires jsdom + @mozilla/readability + turndown and converts trivial HTML', () => {
    const script = `
      const { JSDOM } = require('jsdom');
      const { Readability } = require('@mozilla/readability');
      const TurndownService = require('turndown');
      const dom = new JSDOM('<html><body><article><h1>Hi</h1><p>There</p></article></body></html>', { url: 'https://example.com/' });
      const parsed = new Readability(dom.window.document).parse();
      const md = new TurndownService().turndown((parsed && parsed.content) || '<p>There</p>');
      if (!/There/.test(md)) { console.error('no match'); process.exit(2); }
      console.log('OK');
    `;
    const out = execFileSync('node', ['-e', script], {
      cwd: path.join(__dirname, '..', '..', '..'),
      encoding: 'utf8',
    });
    expect(out).toMatch(/OK/);
  });
});
