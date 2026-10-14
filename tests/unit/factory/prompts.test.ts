'use strict';
import type { CandidateEvent, WorkOrder } from '../../../lib/factory/types';
const pr = require('../../../lib/factory/prompts') as {
  composeQuestion: (o: WorkOrder, base: string, h: CandidateEvent[]) => string;
  buildPrompt: (o: WorkOrder, hyp: { id: string; statement: string }, wt: string, iterDir: string) => string;
  replicationPrompt: (o: WorkOrder, strategy: string, wt: string, iterDir: string) => string;
  strategyNote: (p: string) => string;
};
const { sampleOrder } = require('./fixtures') as { sampleOrder: (r: string, o?: Partial<WorkOrder>) => WorkOrder };

describe('factory prompts', () => {
  const o = sampleOrder('/abs/repo');
  const at = '2026-09-18T00:00:00.000Z';

  it('puts the rule, the reference copy, the allowlist and the rejection history in the question', () => {
    const q = pr.composeQuestion(o, '/home/f/orders/search-p95/worktrees/base', [
      { id: 'c1', at, hypothesis: 'Cache the index.', outcome: 'dev_miss', devMedian: 150 },
      { id: 'c2', at, hypothesis: 'Batch lookups.', outcome: 'rejected_at_gate' },
      { id: 'c3', at, hypothesis: 'Pending.' },
    ]);
    expect(q.startsWith('Cut p95 latency of search.')).toBe(true);
    expect(q).toContain('latency_p95_ms <= 120');
    expect(q).toContain('the dev evaluation measures 187');
    expect(q).toContain('/home/f/orders/search-p95/worktrees/base');
    expect(q).toContain('only these paths: src/**');
    expect(q).toContain('- c1: Cache the index. Outcome: missed the rule on the dev evaluation (dev median 150).');
    expect(q).toContain('- c2: Batch lookups. Outcome: rejected at the final gate.');
    expect(q).not.toContain('c3');
    expect(q).not.toContain('191.37');
  });

  it('gives the replicator the strategy but never the hypothesis', () => {
    const p = pr.replicationPrompt(o, 'Cache the search index in memory.', '/wt/c1r', '/it');
    expect(p).toContain('Strategy: Cache the search index in memory.');
    expect(p).not.toMatch(/Hypothesis/);
    expect(p).toContain('"metricKey":"latency_p95_ms"');
  });

  it('tells the builder the allowlist and the tamper rule', () => {
    const p = pr.buildPrompt(o, { id: 'h1', statement: 'Cache.' }, '/wt/c1', '/it');
    expect(p).toContain('Work only inside the git worktree at /wt/c1.');
    expect(p).toContain('Never write the text __RESULT__');
    expect(p).toContain('"scriptPath":"/it/run.sh"');
  });

  it('caps the strategy note at about 128 tokens', () => {
    expect(pr.strategyNote('  a   b  ')).toBe('a b');
    expect(pr.strategyNote('x'.repeat(600))).toHaveLength(512);
  });
});
