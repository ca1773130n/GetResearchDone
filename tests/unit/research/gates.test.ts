'use strict';
const { resolveGates, checkGate } = require('../../../lib/research/gates');

const thread = (over = {}) => ({
  id: 't', question: 'q', status: 'active', iteration: 1, maxIterations: 5,
  gates: { execute: true, kg_write: true }, budgetUsed: 0,
  modelProfile: 'balanced', tokenProfile: 'balanced',
  currentStation: 'run', pendingGate: null, createdAt: 'now', ...over,
});

describe('gates', () => {
  it('resolveGates: on by default, off with noGates', () => {
    expect(resolveGates({}, false)).toEqual({ execute: true, kg_write: true });
    expect(resolveGates({}, true)).toEqual({ execute: false, kg_write: false });
  });
  it('resolveGates honors research_gates config flags', () => {
    const cfg = { research_gates: { experiment_execution: false, kg_write: true } };
    expect(resolveGates(cfg, false)).toEqual({ execute: false, kg_write: true });
  });
  it('checkGate proceeds when gate off', () => {
    const t = thread({ gates: { execute: false, kg_write: true } });
    expect(checkGate(t, 'execute', false).proceed).toBe(true);
  });
  it('checkGate pauses when gate on and not approved', () => {
    const r = checkGate(thread(), 'execute', false);
    expect(r.proceed).toBe(false);
    expect(r.thread.status).toBe('paused');
    expect(r.thread.pendingGate).toBe('execute');
  });
  it('checkGate proceeds when approved', () => {
    expect(checkGate(thread(), 'execute', true).proceed).toBe(true);
  });
});
