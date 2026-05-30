'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

describe('pdfjs-dist CJS/ESM interop (real node runtime)', () => {
  it('dynamically imports pdfjs legacy ESM build and exposes getDocument', () => {
    const script = `
      (async () => {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        if (typeof pdfjs.getDocument !== 'function') { console.error('no getDocument'); process.exit(2); }
        console.log('OK');
      })().catch((e) => { console.error(e.message); process.exit(3); });
    `;
    const out = execFileSync('node', ['--input-type=module', '-e', script], {
      cwd: path.join(__dirname, '..', '..', '..'),
      encoding: 'utf8',
    });
    expect(out).toMatch(/OK/);
  });
});
