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

const hyp = (over = {}) => ({
  id: 'h1', iteration: 2, statement: 's', rationale: 'r', predictedOutcome: 'p',
  status: 'supported', parentId: null, verdict: 'supported', ...over,
});

/**
 * Write the `experiments/<n>/result.json` the orchestrator writes at MEASURE — the
 * artifact W6b's gate reads. Shape copied from a real loop run.
 */
function recordIteration(
  cwd: string, threadId: string, iteration: number, metrics: Record<string, number> = { accuracy: 0.9 },
) {
  const d = path.join(cwd, '.planning/research/threads', threadId, 'experiments', String(iteration));
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'result.json'), JSON.stringify({
    metrics, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none',
  }));
}

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

// W6b — the gate is a conjunction over artifacts on disk, not the agent's own
// confidence float. Every test here sets up (or deliberately withholds) the artifact.
describe('selectKnowhowTakeaways', () => {
  const kinds = (out: { kind: string }[]) => out.map((t) => t.kind);

  it('keeps positive kinds backed by a settled verdict and a recorded measurement', () => {
    const cwd = tmp();
    recordIteration(cwd, 't1', 2);
    const out = promote.selectKnowhowTakeaways(cwd, 't1', [
      tk({ kind: 'success_pattern' }),
      tk({ kind: 'constraint' }),
      tk({ kind: 'domain_fact' }),
      tk({ kind: 'tool_pattern' }),
    ], [hyp()]);
    expect(kinds(out)).toEqual(['success_pattern', 'constraint', 'domain_fact', 'tool_pattern']);
  });

  it('still routes failure_root_cause away from KNOWHOW (it belongs in DEAD-ENDS)', () => {
    const cwd = tmp();
    recordIteration(cwd, 't1', 2);
    const out = promote.selectKnowhowTakeaways(
      cwd, 't1', [tk({ kind: 'failure_root_cause' })], [hyp({ verdict: 'refuted' })],
    );
    expect(out).toEqual([]);
  });

  it('drops an inconclusive iteration however confident the miner was', () => {
    const cwd = tmp();
    recordIteration(cwd, 't1', 2, { unrelated: 1 });
    const out = promote.selectKnowhowTakeaways(
      cwd, 't1', [tk({ confidence: 1 })], [hyp({ verdict: 'inconclusive', status: 'inconclusive' })],
    );
    expect(out).toEqual([]);
  });

  it('keeps a REFUTED iteration — refuted is settled, and knowing what fails is knowledge', () => {
    const cwd = tmp();
    recordIteration(cwd, 't1', 2);
    const out = promote.selectKnowhowTakeaways(
      cwd, 't1', [tk()], [hyp({ verdict: 'refuted', status: 'refuted' })],
    );
    expect(out).toHaveLength(1);
  });

  it('drops a takeaway whose iteration has no ledger entry at all', () => {
    const cwd = tmp();
    recordIteration(cwd, 't1', 2);
    expect(promote.selectKnowhowTakeaways(cwd, 't1', [tk({ iteration: 9 })], [hyp()])).toEqual([]);
  });

  it('drops a takeaway with no verdict on its hypothesis (still in flight)', () => {
    const cwd = tmp();
    recordIteration(cwd, 't1', 2);
    expect(promote.selectKnowhowTakeaways(
      cwd, 't1', [tk()], [hyp({ verdict: null, status: 'testing' })],
    )).toEqual([]);
  });

  it('drops a takeaway that cites no evidence', () => {
    const cwd = tmp();
    recordIteration(cwd, 't1', 2);
    expect(promote.selectKnowhowTakeaways(cwd, 't1', [tk({ evidence: '' })], [hyp()])).toEqual([]);
    expect(promote.selectKnowhowTakeaways(cwd, 't1', [tk({ evidence: '   ' })], [hyp()])).toEqual([]);
  });

  it('drops a takeaway whose iteration recorded nothing on disk', () => {
    const cwd = tmp(); // no experiments/2/result.json at all
    expect(promote.selectKnowhowTakeaways(cwd, 't1', [tk()], [hyp()])).toEqual([]);
  });

  it('drops a takeaway whose iteration ran but measured no metric', () => {
    const cwd = tmp();
    recordIteration(cwd, 't1', 2, {});
    expect(promote.selectKnowhowTakeaways(cwd, 't1', [tk()], [hyp()])).toEqual([]);
  });

  it('drops a takeaway whose result.json is unreadable', () => {
    const cwd = tmp();
    const d = path.join(cwd, '.planning/research/threads/t1/experiments/2');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'result.json'), 'not json');
    expect(promote.selectKnowhowTakeaways(cwd, 't1', [tk()], [hyp()])).toEqual([]);
  });

  it('IGNORES confidence in both directions — it is metadata now, not the gate', () => {
    const cwd = tmp();
    recordIteration(cwd, 't1', 2);
    // Would have been dropped pre-W6 (0.1 < 0.5); the artifacts say it is real.
    expect(promote.selectKnowhowTakeaways(cwd, 't1', [tk({ confidence: 0.1 })], [hyp()]))
      .toHaveLength(1);
    // Would have been written pre-W6 (0.99 >= 0.5); nothing on disk backs it.
    expect(promote.selectKnowhowTakeaways(tmp(), 't1', [tk({ confidence: 0.99 })], [hyp()]))
      .toEqual([]);
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

  // W2 — the evidence line names the OBSERVATION that refuted the hypothesis, not only the
  // prediction. Both tests above are the pre-0.5.0 shape and stay green unchanged: that IS the
  // back-compat guarantee, since neither fixture carries a refutationCondition.
  it('records the refutation condition between the prediction and the root cause', () => {
    const calls = promote.buildDeadEndCalls(
      { id: 't1' },
      [hyp({ iteration: 1, refutationCondition: 'if GPU batching is the cause, CPU-only restores throughput / batch 1024 halves it' })],
      [{ kind: 'failure_root_cause', content: 'OOM at batch 512', confidence: 0.7, evidence: 'e', failureClass: 'H4', iteration: 1 }],
    );
    expect(calls[0].evidence).toEqual([
      'predicted: throughput up 2x',
      'refuted when: if GPU batching is the cause, CPU-only restores throughput / batch 1024 halves it',
      'OOM at batch 512',
    ]);
  });

  it('a whitespace-only refutationCondition is treated as absent (no empty evidence line)', () => {
    const calls = promote.buildDeadEndCalls({ id: 't1' }, [hyp({ iteration: 3, refutationCondition: '   ' })], []);
    expect(calls[0].evidence).toEqual(['predicted: throughput up 2x', 'verdict: refuted']);
  });

  it('BACK-COMPAT: a pre-0.5.0 ledger loads and yields the original two-element line', () => {
    // Exactly the shape written by v0.4.x — no refutationCondition, no refutationOverlap.
    const preV5 = JSON.parse(JSON.stringify({
      id: 'h1', iteration: 4, statement: 'Old approach', rationale: 'r',
      predictedOutcome: 'p95 down 30%', status: 'refuted', parentId: null, verdict: 'refuted',
    }));
    expect('refutationCondition' in preV5).toBe(false);
    const calls = promote.buildDeadEndCalls({ id: 't1' }, [preV5], []);
    expect(calls.length).toBe(1);
    expect(calls[0].evidence).toEqual(['predicted: p95 down 30%', 'verdict: refuted']);
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
  const ledger = [
    { id: 'h1', iteration: 1, statement: 'Batching is better', rationale: 'r', predictedOutcome: 'up', status: 'supported', parentId: null, verdict: 'supported' },
    { id: 'h2', iteration: 2, statement: 'Bigger batch is better', rationale: 'r', predictedOutcome: 'up', status: 'refuted', parentId: null, verdict: 'refuted' },
  ];
  /** A cwd with both iterations' measurements on disk — the W6b gate reads these. */
  function measuredCwd() {
    const cwd = tmp();
    recordIteration(cwd, 't1', 1);
    recordIteration(cwd, 't1', 2);
    return cwd;
  }

  it('skips when the gate is disabled', () => {
    const cwd = measuredCwd();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_persist_knowledge: false }));
    const res = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso' });
    expect(res.skipped).toBe(true);
    expect(fs.existsSync(path.join(cwd, 'KNOWHOW.md'))).toBe(false);
    expect(fs.existsSync(path.join(cwd, '.planning/DEAD-ENDS.md'))).toBe(false);
  });

  it('writes both files with accurate counts, idempotent on re-run', () => {
    const cwd = measuredCwd();
    const r1 = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso' });
    expect(r1).toEqual({ knowhowAdded: 1, deadEndsAdded: 1, skipped: false });
    expect(parseKnowhowEntries(fs.readFileSync(path.join(cwd, 'KNOWHOW.md'), 'utf8')).length).toBe(1);
    expect(parseDeadEndsFile(fs.readFileSync(path.join(cwd, '.planning/DEAD-ENDS.md'), 'utf8')).length).toBe(1);
    // Re-running is not a correction: same knowledge, later timestamp, nothing appended.
    const r2 = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'LATER' });
    expect(r2.knowhowAdded).toBe(0);
    expect(r2.deadEndsAdded).toBe(0);
    expect(parseKnowhowEntries(fs.readFileSync(path.join(cwd, 'KNOWHOW.md'), 'utf8')).length).toBe(1);
  });

  // W6b's own acceptance test, from the spec: a thread whose only iteration ended
  // inconclusive writes zero KNOWHOW entries and says so in the returned count.
  it('writes ZERO entries for a thread whose only iteration was inconclusive', () => {
    const cwd = tmp();
    recordIteration(cwd, 't1', 1, { unrelated: 1 });
    const res = promote.promoteThreadKnowledge(
      cwd, thread,
      [{ kind: 'success_pattern', content: 'Sharding cuts p50', confidence: 0.95, evidence: 'looked fast', failureClass: 'none', iteration: 1 }],
      [{ id: 'h1', iteration: 1, statement: 's', rationale: 'r', predictedOutcome: 'p', status: 'inconclusive', parentId: null, verdict: 'inconclusive' }],
      { iso: 'iso' },
    );
    expect(res.knowhowAdded).toBe(0);
    expect(fs.existsSync(path.join(cwd, 'KNOWHOW.md'))).toBe(false);
  });

  // W6a through the real write path: the same content mined twice, from a refuted and
  // then a supported iteration. Pre-W6 the refuted one silently destroyed the other.
  it('supersedes instead of overwriting when two iterations mine the same content', () => {
    const cwd = measuredCwd();
    const sameContent = 'Batching helps';
    const res = promote.promoteThreadKnowledge(cwd, thread, [
      { kind: 'success_pattern', content: sameContent, confidence: 0.8, evidence: 'iter1 acc 0.95', failureClass: 'none', iteration: 1 },
      { kind: 'success_pattern', content: sameContent, confidence: 0.8, evidence: 'iter2 acc 0.10', failureClass: 'none', iteration: 2 },
    ], ledger, { iso: 'iso' });

    expect(res.knowhowAdded).toBe(2);
    const entries = parseKnowhowEntries(fs.readFileSync(path.join(cwd, 'KNOWHOW.md'), 'utf8'));
    expect(entries.map((e: { source: string }) => e.source))
      .toEqual(expect.arrayContaining(['research:t1#iter1', 'research:t1#iter2']));
    expect(entries.find((e: { source: string }) => e.source === 'research:t1#iter1').superseded_by)
      .toBe('research:t1#iter2');
    expect(entries.find((e: { source: string }) => e.source === 'research:t1#iter2').superseded_by)
      .toBeUndefined();
  });

  it('swallows a thrown dependency and returns zeros (never breaks the loop)', () => {
    const cwd = tmp();
    const deps = { addDeadEnd: () => { throw new Error('boom'); } };
    const res = promote.promoteThreadKnowledge(cwd, thread, takeaways, ledger, { iso: 'iso', deps });
    expect(res).toEqual({ knowhowAdded: 0, deadEndsAdded: 0, skipped: false });
  });
});
