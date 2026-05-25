'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeKgProvenance, syncFindingToKg } = require('../../../lib/research/kg');

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
  it('syncFindingToKg degrades gracefully when the runner throws', () => {
    const cwd = tmp();
    const runFn = () => { throw new Error('tesserae not found'); };
    const r = syncFindingToKg(cwd, 't', '/tmp/FINDING.md', { run: runFn });
    expect(r.synced).toBe(false);
    expect(r.reason).toMatch(/tesserae/i);
  });
  it('syncFindingToKg reports synced when the runner succeeds', () => {
    const cwd = tmp();
    const calls: string[][] = [];
    const runFn = (bin: string, args: string[]) => { calls.push([bin, ...args]); return ''; };
    const r = syncFindingToKg(cwd, 't', '/tmp/FINDING.md', { run: runFn });
    expect(r.synced).toBe(true);
    expect(calls.some((c) => c.includes('refresh'))).toBe(true);
  });
});
