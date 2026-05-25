'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  formatHypothesis, parseHypotheses, nextHypothesisId,
  appendHypothesis, readLedger, updateHypothesisStatus,
} = require('../../../lib/research/ledger');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ledger-')); }
const H = (over = {}) => ({
  id: 'h1', iteration: 1, statement: 'S', rationale: 'R',
  predictedOutcome: 'P', status: 'testing', parentId: null, verdict: null, ...over,
});

describe('hypothesis ledger', () => {
  it('format then parse round-trips a hypothesis', () => {
    const h = H();
    const parsed = parseHypotheses(formatHypothesis(h));
    expect(parsed[0]).toEqual(h);
  });

  it('nextHypothesisId increments the max', () => {
    expect(nextHypothesisId([])).toBe('h1');
    expect(nextHypothesisId([H({ id: 'h1' }), H({ id: 'h2' })])).toBe('h3');
  });

  it('append + read + update status with lineage', () => {
    const cwd = tmp();
    const id = 'thread-x';
    fs.mkdirSync(path.join(cwd, '.planning/research/threads', id), { recursive: true });
    appendHypothesis(cwd, id, H({ id: 'h1' }));
    appendHypothesis(cwd, id, H({ id: 'h2', parentId: 'h1' }));
    updateHypothesisStatus(cwd, id, 'h1', 'refuted', 'refuted');
    const led = readLedger(cwd, id);
    expect(led.map((h: any) => h.id)).toEqual(['h1', 'h2']);
    expect(led[0].status).toBe('refuted');
    expect(led[0].verdict).toBe('refuted');
    expect(led[1].parentId).toBe('h1');
  });
});
