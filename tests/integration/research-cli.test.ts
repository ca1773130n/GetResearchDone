'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-research-cli-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
const GD = path.join(__dirname, '../../bin/gd.js');

describe('gd research routing', () => {
  it('gd research status --json returns an empty thread list', () => {
    const cwd = tmp();
    const out = cp.execFileSync('node', [GD, 'research', 'status', '--json'], { cwd, encoding: 'utf8' });
    expect(JSON.parse(out).threads).toEqual([]);
  });
});
