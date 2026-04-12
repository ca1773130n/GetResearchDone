'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const {
  readRoadmapFile,
  readStateFile,
  clearRoadmapCache,
  clearStateCache,
} = require('../../lib/phase-io') as {
  readRoadmapFile: (p: string) => string;
  readStateFile: (p: string) => string;
  clearRoadmapCache: (filePath?: string) => void;
  clearStateCache: (filePath?: string) => void;
};

describe('phase-io cache invalidation (I4 regression)', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-i4-'));
    // Clear all caches before each test to ensure isolation
    clearRoadmapCache();
    clearStateCache();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readRoadmapFile returns stale content until clearRoadmapCache', () => {
    const p = path.join(tmpDir, 'ROADMAP.md');
    fs.writeFileSync(p, 'original\n');
    expect(readRoadmapFile(p)).toBe('original\n');
    fs.writeFileSync(p, 'updated\n');
    expect(readRoadmapFile(p)).toBe('original\n');
    clearRoadmapCache(p);
    expect(readRoadmapFile(p)).toBe('updated\n');
  });

  it('clearRoadmapCache with no args clears all entries', () => {
    const a = path.join(tmpDir, 'a.md');
    const b = path.join(tmpDir, 'b.md');
    fs.writeFileSync(a, 'a1\n');
    fs.writeFileSync(b, 'b1\n');
    readRoadmapFile(a);
    readRoadmapFile(b);
    fs.writeFileSync(a, 'a2\n');
    fs.writeFileSync(b, 'b2\n');
    clearRoadmapCache();
    expect(readRoadmapFile(a)).toBe('a2\n');
    expect(readRoadmapFile(b)).toBe('b2\n');
  });

  it('clearStateCache same semantics', () => {
    const p = path.join(tmpDir, 'STATE.md');
    fs.writeFileSync(p, 'original\n');
    expect(readStateFile(p)).toBe('original\n');
    fs.writeFileSync(p, 'updated\n');
    expect(readStateFile(p)).toBe('original\n');
    clearStateCache(p);
    expect(readStateFile(p)).toBe('updated\n');
  });
});
