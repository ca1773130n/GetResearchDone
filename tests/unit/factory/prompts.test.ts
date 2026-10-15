'use strict';
import type { CandidateEvent, WorkOrder } from '../../../lib/factory/types';
const pr = require('../../../lib/factory/prompts') as {
  composeQuestion: (o: WorkOrder, base: string, h: CandidateEvent[]) => string;
  buildPrompt: (o: WorkOrder, hyp: { id: string; statement: string }, wt: string, iterDir: string) => string;
  fixPrompt: (o: WorkOrder, hyp: { id: string; statement: string }, r: { exitCode: number; stderrExcerpt?: string },
    wt: string, iterDir: string, attempt: number, maxDepth: number) => string;
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

  it('describes every finished outcome, and never calls one of them shipped by default', () => {
    const q = pr.composeQuestion(o, '/base', [
      { id: 'c1', at, hypothesis: 'Add a marker.', outcome: 'tampering', detail: 'src/search.js' },
      { id: 'c2', at, hypothesis: 'Touch the readme.', outcome: 'out_of_scope', detail: 'README.md' },
      { id: 'c3', at, hypothesis: 'Nothing usable.', outcome: 'build_failed' },
      { id: 'c4', at, hypothesis: 'Could not be redone.', outcome: 'did_not_replicate', replicaDevMedian: 187 },
      { id: 'c5', at, hypothesis: 'Docker went away.', outcome: 'not_judged' },
      { id: 'c6', at, hypothesis: 'Cache the index.', outcome: 'shipped' },
    ]);
    expect(q).toContain("- c1: Add a marker. Outcome: added the evaluation's result marker (src/search.js).");
    expect(q).toContain('- c2: Touch the readme. Outcome: changed paths outside the allowlist (README.md).');
    expect(q).toContain('- c3: Nothing usable. Outcome: the builder did not produce a usable change.');
    expect(q).toContain('- c4: Could not be redone. Outcome: a fresh builder could not reproduce it from its strategy note (replica dev median 187).');
    expect(q).toContain('- c5: Docker went away. Outcome: never judged: the sandbox went away before the final gate could run.');
    expect(q).toContain('- c6: Cache the index. Outcome: shipped.');
    // Only the one candidate that shipped is described as shipped.
    expect(q.match(/shipped/g)).toHaveLength(1);
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
    // The imperative carries the intent; only the claude backend can actually take the shell
    // away, so the prompt must not promise the builder it has none.
    expect(p).toContain('Do not try to run, build or measure anything.');
    expect(p).not.toMatch(/no shell/);
  });

  it('caps the strategy note at about 128 tokens', () => {
    expect(pr.strategyNote('  a   b  ')).toBe('a b');
    expect(pr.strategyNote('x'.repeat(600))).toHaveLength(512);
  });

  it('fix prompt carries the attempt counter, the rules and a stderr excerpt cut at 2000 characters', () => {
    const p = pr.fixPrompt(o, { id: 'h1', statement: 'Cache.' }, { exitCode: 2, stderrExcerpt: 'e'.repeat(2500) }, '/wt/c1', '/it', 2, 3);
    expect(p).toContain('FIX mode (attempt 2 of 3)');
    expect(p).toContain('- exit code: 2');
    expect(p).toContain(`- detail: ${'e'.repeat(2000)}\n`);
    expect(p).not.toContain('e'.repeat(2001));
    expect(p).toContain('Work only inside the git worktree at /wt/c1.');
    expect(p).toContain('Never write the text __RESULT__');
    expect(p).toContain('Edit files only under these paths: src/**');
    expect(pr.fixPrompt(o, { id: 'h1', statement: 'Cache.' }, { exitCode: 1 }, '/wt', '/it', 1, 3)).toContain('- detail: (none)');
  });

  it('no prompt carries the hidden baseline, script path or grader mount', () => {
    const h = sampleOrder('/abs/repo', {
      baseline: { dev: 187, hidden: 733.4417, devSpread: 0 },
      hidden_eval: { script: 'hidden/zq-secret-eval.sh', repeats: 1 },
    });
    const outs = [
      pr.composeQuestion(h, '/home/f/orders/x/worktrees/base', [
        { id: 'c1', at, hypothesis: 'Cache.', outcome: 'rejected_at_gate' },
        { id: 'c2', at, hypothesis: 'Batch.', outcome: 'dev_miss', devMedian: 150 },
      ]),
      pr.buildPrompt(h, { id: 'h1', statement: 'Cache.' }, '/wt/c1', '/it'),
      pr.fixPrompt(h, { id: 'h1', statement: 'Cache.' }, { exitCode: 1, stderrExcerpt: 'boom' }, '/wt/c1', '/it', 1, 3),
      pr.replicationPrompt(h, 'Cache the index.', '/wt/c1r', '/it'),
    ];
    for (const out of outs) {
      expect(out).not.toContain('733.4417');
      expect(out).not.toContain('733');
      expect(out).not.toContain('zq-secret-eval');
      expect(out).not.toContain('hidden/');
      expect(out).not.toContain('/grader-');
    }
  });
});
