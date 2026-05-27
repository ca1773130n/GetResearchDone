'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readManifest, upsertManifest } = require('../../../lib/research/manifest');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-man-')); }

describe('manifest', () => {
  it('readManifest returns [] when absent', () => {
    expect(readManifest(path.join(tmp(), 'm.json'))).toEqual([]);
  });
  it('readManifest returns [] on malformed json', () => {
    const p = path.join(tmp(), 'm.json');
    fs.writeFileSync(p, '{not json');
    expect(readManifest(p)).toEqual([]);
  });
  it('upsert adds then replaces by key', () => {
    const p = path.join(tmp(), 'm.json');
    upsertManifest(p, 'k', { key: 'k', status: 'compiled' });
    upsertManifest(p, 'k', { key: 'k', status: 'partial' });
    upsertManifest(p, 'k2', { key: 'k2', status: 'compiled' });
    const all = readManifest(p);
    expect(all.length).toBe(2);
    expect(all.find((e: any) => e.key === 'k').status).toBe('partial');
  });
});
