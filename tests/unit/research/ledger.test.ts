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
  predictedOutcome: 'P', status: 'testing', parentId: null, verdict: null,
  origin: 'loop', sourceNodeIds: [], ...over,
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

  it('ledgerPath returns the expected file path', () => {
    const { ledgerPath } = require('../../../lib/research/ledger');
    const p = ledgerPath('/proj', 'tid');
    expect(p).toContain('.planning/research/threads');
    expect(p).toContain('HYPOTHESES.md');
  });

  it('writeLedger creates file with formatted hypotheses', () => {
    const { writeLedger } = require('../../../lib/research/ledger');
    const cwd = tmp();
    const id = 'wl-test';
    writeLedger(cwd, id, [H({ id: 'h1' }), H({ id: 'h2' })]);
    const p = path.join(cwd, '.planning/research/threads', id, 'HYPOTHESES.md');
    const content = fs.readFileSync(p, 'utf8');
    expect(content).toContain('### h1');
    expect(content).toContain('### h2');
  });

  it('parseHypotheses skips malformed blocks', () => {
    const { parseHypotheses } = require('../../../lib/research/ledger');
    const content = '### h1 BADFORMAT\n- **statement:** X\n';
    expect(parseHypotheses(content)).toEqual([]);
  });

  it('round-trips origin + sourceNodeIds through updateHypothesisStatus (no erasure)', () => {
    const cwd = tmp();
    appendHypothesis(cwd, 't1', H({ origin: 'synthesis', sourceNodeIds: ['n1', 'n2'] }));
    updateHypothesisStatus(cwd, 't1', 'h1', 'supported', 'supported');
    const [h] = readLedger(cwd, 't1');
    expect(h.origin).toBe('synthesis');
    expect(h.sourceNodeIds).toEqual(['n1', 'n2']);
    expect(h.status).toBe('supported');
    expect(h.verdict).toBe('supported');
  });

  it('defaults legacy hypotheses (no origin line) to origin=loop / sourceNodeIds=[]', () => {
    const legacy = '### h1 (iter 1) [testing]\n\n- **statement:** S\n- **rationale:** R\n' +
      '- **predicted_outcome:** P\n- **parent:** none\n- **verdict:** none\n';
    const [h] = parseHypotheses(legacy);
    expect(h.origin).toBe('loop');
    expect(h.sourceNodeIds).toEqual([]);
  });
});
