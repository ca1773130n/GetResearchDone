'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const promote = require('../../../lib/research/promote');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-promote-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
const tk = (over = {}) => ({
  kind: 'success_pattern', content: 'Batching cuts latency 3x', confidence: 0.8,
  evidence: 'iter 2 metric', failureClass: 'none', iteration: 2, ...over,
});

describe('shouldPersistKnowledge', () => {
  it('defaults true with no config', () => {
    expect(promote.shouldPersistKnowledge(tmp())).toBe(true);
  });
  it('is false only when explicitly disabled', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, '.planning/config.json'), JSON.stringify({ research_persist_knowledge: false }));
    expect(promote.shouldPersistKnowledge(d)).toBe(false);
    const e = tmp();
    fs.writeFileSync(path.join(e, '.planning/config.json'), JSON.stringify({ research_persist_knowledge: true }));
    expect(promote.shouldPersistKnowledge(e)).toBe(true);
  });
});

describe('takeawayToKnowhow', () => {
  it('maps fields with provenance and research sentinel', () => {
    const k = promote.takeawayToKnowhow(tk(), 't1', '2026-06-01T00:00:00.000Z');
    expect(k.pattern_name).toBe('Batching cuts latency 3x');
    expect(k.source).toBe('research:t1#iter2');
    expect(k.applicability).toContain('success_pattern');
    expect(k.code_snippet).toBe('');
    expect(k.phase_number).toBe(0);
    expect(k.created_at).toBe('2026-06-01T00:00:00.000Z');
  });
  it('collapses whitespace and caps pattern_name at 200 chars', () => {
    const k = promote.takeawayToKnowhow(tk({ content: 'a\n  b   c' + ' x'.repeat(200) }), 't1', 'iso');
    expect(k.pattern_name.length).toBeLessThanOrEqual(200);
    expect(k.pattern_name).not.toMatch(/\s\s|\n/);
  });
});

describe('selectKnowhowTakeaways', () => {
  it('keeps positive kinds >= 0.5, drops failures and low-confidence fallback', () => {
    const out = promote.selectKnowhowTakeaways([
      tk({ kind: 'success_pattern', confidence: 0.8 }),
      tk({ kind: 'constraint', confidence: 0.5 }),
      tk({ kind: 'failure_root_cause', confidence: 0.9 }),
      tk({ kind: 'domain_fact', confidence: 0.4 }),
    ]);
    expect(out.map((t: { kind: string }) => t.kind)).toEqual(['success_pattern', 'constraint']);
  });
});

describe('buildDeadEndCalls', () => {
  const hyp = (over = {}) => ({
    id: 'h1', iteration: 1, statement: 'GPU batching beats CPU', rationale: 'r',
    predictedOutcome: 'throughput up 2x', status: 'refuted', parentId: null, verdict: 'refuted', ...over,
  });
  it('emits one DeadEndAddOpts per refuted hypothesis with ledger predictedOutcome', () => {
    const calls = promote.buildDeadEndCalls(
      { id: 't1' },
      [hyp({ iteration: 1 }), hyp({ iteration: 2, verdict: 'supported', status: 'supported' })],
      [{ kind: 'failure_root_cause', content: 'OOM at batch 512', confidence: 0.7, evidence: 'e', failureClass: 'H4', iteration: 1 }],
    );
    expect(calls.length).toBe(1);
    expect(calls[0].approach).toBe('GPU batching beats CPU');
    expect(calls[0].phase).toBe('research:t1#iter1');
    expect(calls[0].verdict).toBe('falsified');
    expect(calls[0].evidence).toEqual(['predicted: throughput up 2x', 'OOM at batch 512']);
  });
  it('falls back to verdict: refuted when no matching failure takeaway', () => {
    const calls = promote.buildDeadEndCalls({ id: 't1' }, [hyp({ iteration: 3 })], []);
    expect(calls[0].evidence).toEqual(['predicted: throughput up 2x', 'verdict: refuted']);
  });
});

describe('promoteThreadKnowledge', () => {
  const { parseKnowhowEntries } = require('../../../lib/knowledge');
  const { parseDeadEndsFile } = require('../../../lib/dead-ends');
  const thread = { id: 't1' };
  const takeaways = [
    { kind: 'success_pattern', content: 'Batching helps', confidence: 0.8, evidence: 'e', failureClass: 'none', iteration: 1 },
    { kind: 'failure_root_cause', content: 'OOM at 512', confidence: 0.7, evidence: 'e', failureClass: 'H4', iteration: 2 },
  ];
  const ledger = [{ id: 'h2', iteration: 2, statement: 'Bigger batch is better', rationale: 'r', predictedOutcome: 'up', status: 'refuted', parentId: null, verdict: 'refuted' }];

  it('skips when the gate is disabled', () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_persist_knowledge: false }));
    const res = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso' });
    expect(res.skipped).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'KNOWHOW.md'))).toBe(false);
    expect(fs.existsSync(path.join(cwd, '.planning/DEAD-ENDS.md'))).toBe(false);
  });

  it('writes both files with accurate counts, idempotent on re-run', () => {
    const cwd = tmp();
    const r1 = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso' });
    expect(r1).toEqual({ knowhowAdded: 1, deadEndsAdded: 1, skipped: false });
    expect(parseKnowhowEntries(fs.readFileSync(path.join(cwd, 'KNOWHOW.md'), 'utf8')).length).toBe(1);
    expect(parseDeadEndsFile(fs.readFileSync(path.join(cwd, '.planning/DEAD-ENDS.md'), 'utf8')).length).toBe(1);
    const r2 = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso' });
    expect(r2.knowhowAdded).toBe(0);
    expect(r2.deadEndsAdded).toBe(0);
    expect(parseKnowhowEntries(fs.readFileSync(path.join(cwd, 'KNOWHOW.md'), 'utf8')).length).toBe(1);
  });

  it('swallows a thrown dependency and returns zeros (never breaks the loop)', () => {
    const cwd = tmp();
    const deps = { addDeadEnd: () => { throw new Error('boom'); } };
    const res = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso', deps });
    expect(res).toEqual({ knowhowAdded: 0, deadEndsAdded: 0, skipped: false });
  });
});
