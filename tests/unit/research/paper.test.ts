'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gatherPaperBundle, buildPaperPrompt, generatePaper } = require('../../../lib/research/paper');
const { createThread, saveThread } = require('../../../lib/research/thread');
const { appendHypothesis } = require('../../../lib/research/ledger');
const { appendTakeaway } = require('../../../lib/research/takeaways');

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-paper-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

// Build a terminal thread with 2 iterations of ledger + experiments.
function fixtureThread(cwd: string): string {
  const t = createThread(cwd, 'Does X help?', { maxIterations: 5 });
  t.iteration = 2; t.status = 'supported'; saveThread(cwd, t);
  appendHypothesis(cwd, t.id, { id: 'h1', iteration: 1, statement: 'H one', rationale: 'r', predictedOutcome: 'p', status: 'refuted', parentId: null, verdict: 'refuted' });
  appendHypothesis(cwd, t.id, { id: 'h2', iteration: 2, statement: 'H two', rationale: 'r', predictedOutcome: 'p', status: 'supported', parentId: 'h1', verdict: 'supported' });
  appendTakeaway(cwd, t.id, { kind: 'domain_fact', content: 'learned a thing', confidence: 0.6, evidence: 'e', failureClass: 'none', iteration: 1 });
  for (const [n, acc] of [[1, 0.1], [2, 0.9]] as Array<[number, number]>) {
    const dir = path.join(cwd, '.planning/research/threads', t.id, 'experiments', String(n));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify({ metricKey: 'acc', comparator: '>=', target: 0.8, scriptPath: 'run.sh', language: 'shell' }));
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ metrics: { acc }, exitCode: 0, failureClass: 'none' }));
  }
  return t.id;
}

describe('gatherPaperBundle', () => {
  it('assembles thread, supported hypothesis, ledger, takeaways, per-iteration experiments + verdicts', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    const b = await gatherPaperBundle(cwd, id);
    expect(b.thread.question).toBe('Does X help?');
    expect(b.supported.id).toBe('h2');
    expect(b.ledger.map((h: { id: string }) => h.id)).toEqual(['h1', 'h2']);
    expect(b.takeaways[0].content).toBe('learned a thing');
    expect(b.experiments).toHaveLength(2);
    expect(b.experiments[0]).toMatchObject({ iter: 1, metrics: { acc: 0.1 }, verdict: 'refuted' });
    expect(b.experiments[1].plan.metricKey).toBe('acc');
    expect(b.relatedWork).toEqual([]);
  });

  it('folds injected retrieve results into relatedWork, and degrades to [] when retrieve throws', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    const okRetrieve = async () => ({ results: [{ name: 'RAG', description: 'd', source_path: 'corpus/x.md' }] });
    const b1 = await gatherPaperBundle(cwd, id, { retrieve: okRetrieve });
    expect(b1.relatedWork[0].name).toBe('RAG');
    const b2 = await gatherPaperBundle(cwd, id, { retrieve: async () => { throw new Error('boom'); } });
    expect(b2.relatedWork).toEqual([]);
  });

  it('tolerates a missing result.json (metrics: {})', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    fs.rmSync(path.join(cwd, '.planning/research/threads', id, 'experiments/2/result.json'));
    const b = await gatherPaperBundle(cwd, id);
    expect(b.experiments[1].metrics).toEqual({});
  });
});

describe('buildPaperPrompt', () => {
  const bundle = {
    thread: { id: 't', question: 'Does X help?', status: 'supported', iteration: 2 },
    supported: { id: 'h2', statement: 'H two' },
    ledger: [{ id: 'h1', status: 'refuted', statement: 'H one' }, { id: 'h2', status: 'supported', statement: 'H two' }],
    takeaways: [{ iteration: 1, kind: 'domain_fact', content: 'learned a thing' }],
    experiments: [{ iter: 1, plan: { metricKey: 'acc', comparator: '>=', target: 0.8 }, metrics: { acc: 0.1 }, verdict: 'refuted' }],
    relatedWork: [{ name: 'RAG', description: 'd', source_path: 'corpus/x.md' }],
  };
  it('embeds question, ledger, a results row, related work, and the __PAPER__ contract', () => {
    const p = buildPaperPrompt(bundle);
    expect(p).toContain('Does X help?');
    expect(p).toContain('H two');
    expect(p).toMatch(/\bacc\b/);
    expect(p).toContain('0.1');
    expect(p).toContain('RAG');
    expect(p).toContain('__PAPER__');
  });
  it('renders defensively when a plan field is missing', () => {
    const p = buildPaperPrompt({ ...bundle, experiments: [{ iter: 1, plan: null, metrics: {}, verdict: null }] });
    expect(p).toContain('__PAPER__'); // does not throw
  });
});

describe('generatePaper', () => {
  it('writes PAPER.md from the agent __PAPER__ block', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    const spawn = async () => '__PAPER__\n# Draft\n## Abstract\nbody';
    const res = await generatePaper(cwd, id, { spawn });
    expect(res.paperPath).toBe(path.join(cwd, '.planning/research/threads', id, 'PAPER.md'));
    expect(fs.readFileSync(res.paperPath, 'utf8')).toContain('# Draft');
    expect(res.citations).toEqual({ total: 0, resolved: 0, unresolved: [] });
  });

  it('attaches advisory citation verification without altering the written paper', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    const retrieve = async () => ({ results: [{ name: 'RAG', description: 'd', source_path: 'corpus/x.md' }] });
    const spawn = async () => '__PAPER__\n# Draft\nWe build on [RAG] but not [Imaginary2099].';
    const res = await generatePaper(cwd, id, { spawn, retrieve });
    expect(res.citations).toEqual({ total: 2, resolved: 1, unresolved: ['Imaginary2099'] });
    // the paper markdown itself is unchanged by the (report-only) verification
    expect(fs.readFileSync(res.paperPath, 'utf8')).toContain('[RAG]');
  });
  it('errors on a non-terminal thread (spawn not called)', async () => {
    const cwd = tmp();
    const t = createThread(cwd, 'Q', {}); // status 'active'
    let called = 0;
    await expect(generatePaper(cwd, t.id, { spawn: async () => { called++; return '__PAPER__\nx'; } }))
      .rejects.toThrow(/not finished|active/i);
    expect(called).toBe(0);
  });
  it('errors when the agent emits no __PAPER__ block', async () => {
    const cwd = tmp();
    const id = fixtureThread(cwd);
    await expect(generatePaper(cwd, id, { spawn: async () => 'no tag here' })).rejects.toThrow(/__PAPER__|no .*block/i);
  });
});
