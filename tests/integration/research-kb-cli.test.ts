'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-kb-cli-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
const GD = path.join(__dirname, '../../bin/gd.js');

describe('gd ingest routing', () => {
  it('gd ingest <md> --json runs and reports a status', () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, 'paper.md'), '# x');
    const out = cp.execFileSync('node', [GD, 'ingest', path.join(cwd, 'paper.md'), '--json'], { cwd, encoding: 'utf8' });
    const parsed = JSON.parse(out);
    expect(['compiled', 'skipped_no_tesserae', 'compile_failed', 'partial']).toContain(parsed.status);
  });
});
