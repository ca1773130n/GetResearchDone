'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeKgProvenance, syncFindingToKg } = require('../../../lib/research/kg');
const { createFakeTesseraeClient } = require('../../../lib/research/tesserae');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-kg-'));
  fs.mkdirSync(path.join(d, '.planning/research/threads', 't'), { recursive: true });
  return d;
}

describe('kg', () => {
  it('writeKgProvenance writes kg.json', () => {
    const cwd = tmp();
    writeKgProvenance(cwd, 't', { read: ['n1'], wrote: ['finding:t'] });
    const j = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/research/threads/t/kg.json'), 'utf8'));
    expect(j.wrote).toEqual(['finding:t']);
  });
  it('syncFindingToKg compiles via the injected client when available', async () => {
    const cwd = tmp();
    const r = await syncFindingToKg(cwd, 't', '/tmp/FINDING.md',
      { client: createFakeTesseraeClient({ available: true, compileStatus: 'compiled', smoke: { found: true, nodeIds: ['n'], detail: '' } }) });
    expect(r.synced).toBe(true);
  });

  it('syncFindingToKg degrades when tesserae unavailable', async () => {
    const cwd = tmp();
    const r = await syncFindingToKg(cwd, 't', '/tmp/FINDING.md', { client: createFakeTesseraeClient({}) });
    expect(r.synced).toBe(false);
    expect(r.reason).toMatch(/tesserae/i);
  });
});
