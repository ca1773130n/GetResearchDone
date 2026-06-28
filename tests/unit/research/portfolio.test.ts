'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createMutex, mapWithConcurrency, wrapClientWithCompileLock,
  classifyThread, rankEntries, buildPortfolioReport, runPortfolio, readPortfolioConcurrency,
} = require('../../../lib/research/portfolio');
const { createThread, saveThread } = require('../../../lib/research/thread');
const { appendHypothesis } = require('../../../lib/research/ledger');

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-pf-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('createMutex', () => {
  it('serializes critical sections', async () => {
    const lock = createMutex();
    const order: string[] = [];
    const a = lock(async () => { order.push('a-start'); await new Promise((r) => setTimeout(r, 10)); order.push('a-end'); });
    const b = lock(async () => { order.push('b-start'); order.push('b-end'); });
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });
  it('a rejecting section does not poison later sections', async () => {
    const lock = createMutex();
    await expect(lock(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(lock(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('mapWithConcurrency', () => {
  it('never exceeds the concurrency limit and preserves order', async () => {
    let active = 0; let maxActive = 0;
    const items = [1, 2, 3, 4, 5];
    const out = await mapWithConcurrency(items, 2, async (n: number) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--; return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
  it('treats limit < 1 as 1', async () => {
    const out = await mapWithConcurrency([1, 2], 0, async (n: number) => n);
    expect(out).toEqual([1, 2]);
  });
});

describe('wrapClientWithCompileLock', () => {
  it('routes compile through the lock and passes other methods through', async () => {
    const calls: string[] = [];
    const lock = createMutex();
    const base = {
      isAvailable: () => true,
      compile: async () => { calls.push('compile'); return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => { calls.push('smoke'); return { found: true, nodeIds: ['n'], detail: '' }; },
    };
    const wrapped = wrapClientWithCompileLock(base, lock);
    expect(wrapped.isAvailable()).toBe(true);
    expect((await wrapped.compile('/x', ['/s'])).status).toBe('compiled');
    expect((await wrapped.querySmokeCheck('/x', 't')).found).toBe(true);
    expect(calls).toEqual(['compile', 'smoke']);
  });
});

describe('classifyThread', () => {
  it('classifies by status + station + force', () => {
    expect(classifyThread({ status: 'supported' }, false)).toBe('terminal');
    expect(classifyThread({ status: 'exhausted' }, false)).toBe('terminal');
    expect(classifyThread({ status: 'paused' }, false)).toBe('runnable');
    expect(classifyThread({ status: 'active', currentStation: 'seed' }, false)).toBe('runnable');
    expect(classifyThread({ status: 'active', currentStation: 'design' }, false)).toBe('interrupted');
    expect(classifyThread({ status: 'error' }, false)).toBe('interrupted');
    expect(classifyThread({ status: 'active', currentStation: 'design' }, true)).toBe('runnable');
    expect(classifyThread({ status: 'error' }, true)).toBe('runnable');
  });
});

describe('rankEntries + buildPortfolioReport', () => {
  const entries = [
    { id: 'e', question: 'Qe', status: 'exhausted', verdict: 'refuted', iterations: 5, action: 'ran' },
    { id: 's', question: 'Qs', status: 'supported', verdict: 'supported', iterations: 3, action: 'ran' },
    { id: 'p', question: 'Qp', status: 'paused', verdict: null, iterations: 1, action: 'paused' },
  ];
  it('ranks supported > paused > exhausted', () => {
    expect(rankEntries(entries).map((e: { id: string }) => e.id)).toEqual(['s', 'p', 'e']);
  });
  it('builds a markdown report with a winners line', () => {
    const md = buildPortfolioReport(rankEntries(entries));
    expect(md).toMatch(/# Research Portfolio/);
    expect(md).toContain('Qs');
    expect(md).toMatch(/supported:.*\bs\b/);
  });
  it('report is pure and handles an empty set', () => {
    expect(buildPortfolioReport([])).toMatch(/# Research Portfolio/);
  });
});

describe('buildPortfolioReport fdr_flag (Gap 3)', () => {
  it('omits fdr_flag entirely when no supported winner carries a p-value', () => {
    const md = buildPortfolioReport([
      { id: 's', question: 'Q', status: 'supported', verdict: 'supported', iterations: 1, action: 'ran' },
    ]);
    expect(md).not.toMatch(/fdr_flag/);
  });
  it('flags only borderline supported winners via Benjamini-Hochberg when raw_p present', () => {
    // BH over [0.01, 0.06] (m=2) → q=[0.02, 0.06]; threshold 0.05 flags only "b".
    const md = buildPortfolioReport([
      { id: 'a', question: 'Qa', status: 'supported', verdict: 'supported', iterations: 1, action: 'ran', raw_p: 0.01 },
      { id: 'b', question: 'Qb', status: 'supported', verdict: 'supported', iterations: 1, action: 'ran', raw_p: 0.06 },
    ]);
    expect(md).toMatch(/fdr_flag/);
    const fdrLine = md.split('\n').find((l: string) => l.includes('fdr_flag')) as string;
    const flaggedIds = fdrLine.split(':')[1]; // the id list after "fdr_flag (q ≥ 0.05):"
    expect(flaggedIds).toContain('b');
    expect(flaggedIds).not.toContain('a');
  });
  it('renders the fdr_flag line with (none) when winners carry p-values but none are borderline', () => {
    const md = buildPortfolioReport([
      { id: 'a', question: 'Qa', status: 'supported', verdict: 'supported', iterations: 1, action: 'ran', raw_p: 0.0001 },
      { id: 'b', question: 'Qb', status: 'supported', verdict: 'supported', iterations: 1, action: 'ran', raw_p: 0.0002 },
    ]);
    const fdrLine = md.split('\n').find((l: string) => l.includes('fdr_flag')) as string;
    expect(fdrLine).toContain('(none)');
  });
});

describe('runPortfolio', () => {
  function mk(cwd: string, over: Record<string, unknown>): string {
    const t = createThread(cwd, String(over.question || 'Q'), {});
    Object.assign(t, over); saveThread(cwd, t);
    if (over.lastVerdict) appendHypothesis(cwd, t.id, { id: 'h1', iteration: 1, statement: 'h', rationale: 'r', predictedOutcome: 'p', status: String(over.lastVerdict), parentId: null, verdict: over.lastVerdict });
    return t.id;
  }

  it('runs only runnable threads, skips terminal + interrupted, writes a ranked report', async () => {
    const cwd = tmp();
    const pausedId = mk(cwd, { status: 'paused', currentStation: 'run', question: 'Paused' });
    const seedId = mk(cwd, { status: 'active', currentStation: 'seed', question: 'Seeded' });
    const doneId = mk(cwd, { status: 'supported', currentStation: 'finalize', question: 'Done', lastVerdict: 'supported' });
    const crashId = mk(cwd, { status: 'active', currentStation: 'design', question: 'Crashed' });
    const ran: string[] = [];
    const resume = async (_c: string, id: string) => { ran.push(id); return { threadId: id, status: 'supported', iterations: 2 }; };
    const res = await runPortfolio(cwd, { resume, concurrency: 2 });
    expect(ran.sort()).toEqual([pausedId, seedId].sort());
    expect(res.threads.find((e: { id: string }) => e.id === doneId).action).toBe('skipped-terminal');
    expect(res.threads.find((e: { id: string }) => e.id === crashId).action).toBe('skipped-interrupted');
    expect(fs.existsSync(path.join(cwd, '.planning/research/PORTFOLIO.md'))).toBe(true);
    expect(res.reportPath).toMatch(/PORTFOLIO\.md$/);
  });

  it('isolates a failing thread (others still run, report still written, no throw)', async () => {
    const cwd = tmp();
    mk(cwd, { status: 'paused', question: 'A' });
    mk(cwd, { status: 'paused', question: 'B' });
    let n = 0;
    const resume = async (_c: string, id: string) => { n++; if (n === 1) throw new Error('kaboom'); return { threadId: id, status: 'exhausted', iterations: 1 }; };
    const res = await runPortfolio(cwd, { resume, concurrency: 1 });
    expect(res.failed).toBe(1);
    expect(res.threads.some((e: { action: string }) => e.action === 'failed')).toBe(true);
    expect(fs.existsSync(path.join(cwd, '.planning/research/PORTFOLIO.md'))).toBe(true);
  });

  it('--force runs interrupted threads; --topic filters by seededFrom.synthesisTopicId', async () => {
    const cwd = tmp();
    const crash = mk(cwd, { status: 'active', currentStation: 'design', question: 'C' });
    const ran: string[] = [];
    await runPortfolio(cwd, { resume: async (_c: string, id: string) => { ran.push(id); return { threadId: id, status: 'exhausted', iterations: 1 }; }, force: true });
    expect(ran).toContain(crash);

    const cwd2 = tmp();
    const t = createThread(cwd2, 'topical', {}); t.status = 'paused';
    t.seededFrom = { synthesisTopicId: 'topicX', sourceNodeIds: [], seedKey: 'k' }; saveThread(cwd2, t);
    const other = createThread(cwd2, 'other', {}); other.status = 'paused'; saveThread(cwd2, other);
    const ran2: string[] = [];
    await runPortfolio(cwd2, { resume: async (_c: string, id: string) => { ran2.push(id); return { threadId: id, status: 'exhausted', iterations: 1 }; }, topicId: 'topicX' });
    expect(ran2).toEqual([t.id]);
  });

  it('tolerates an unreadable thread.json (becomes a not-found entry, not an abort)', async () => {
    const cwd = tmp();
    mk(cwd, { status: 'paused', question: 'ok' });
    const badDir = path.join(cwd, '.planning/research/threads', 'broken');
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, 'thread.json'), '{not json');
    const res = await runPortfolio(cwd, { resume: async (_c: string, id: string) => ({ threadId: id, status: 'exhausted', iterations: 1 }) });
    expect(res.threads.some((e: { id: string; action: string }) => e.id === 'broken' && e.action === 'not-found')).toBe(true);
  });

  it('injects ONE shared kgClient + spawn/retrieve + noGates into every resume', async () => {
    const cwd = tmp();
    mk(cwd, { status: 'paused', question: 'A' });
    mk(cwd, { status: 'active', currentStation: 'seed', question: 'B' });
    const sentinel = { isAvailable: () => true, compile: async () => ({ status: 'compiled', detail: '', graphPath: null }), querySmokeCheck: async () => ({ found: false, nodeIds: [], detail: '' }) };
    const seenDeps: Array<Record<string, unknown>> = [];
    const resume = async (_c: string, id: string, deps: Record<string, unknown>) => { seenDeps.push(deps); return { threadId: id, status: 'exhausted', iterations: 1 }; };
    await runPortfolio(cwd, { resume, client: sentinel, noGates: true, concurrency: 2 });
    expect(seenDeps).toHaveLength(2);
    for (const d of seenDeps) {
      expect(d.kgClient).toBe(sentinel);     // the SAME injected client object reaches every thread
      expect(d.noGates).toBe(true);
      expect(typeof d.spawn).toBe('function');
      expect(typeof d.retrieve).toBe('function');
    }
    expect(seenDeps[0]).toBe(seenDeps[1]);    // ONE shared deps object, not per-thread
  });

  it('bounds parallelism to the concurrency cap end-to-end through runPortfolio', async () => {
    const cwd = tmp();
    for (let i = 0; i < 5; i++) mk(cwd, { status: 'paused', question: `Q${i}` });
    let active = 0; let maxActive = 0;
    const resume = async (_c: string, id: string) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--; return { threadId: id, status: 'exhausted', iterations: 1 };
    };
    const res = await runPortfolio(cwd, { resume, client: { isAvailable: () => true, compile: async () => ({ status: 'compiled', detail: '', graphPath: null }), querySmokeCheck: async () => ({ found: false, nodeIds: [], detail: '' }) }, concurrency: 2 });
    expect(maxActive).toBeLessThanOrEqual(2);
    expect(res.ran).toBe(5);
  });

  it('captures a paused result as a paused entry/count, and the ledger verdict on a ran entry', async () => {
    const cwd = tmp();
    const pid = mk(cwd, { status: 'paused', question: 'P' });
    const rid = mk(cwd, { status: 'paused', question: 'R', lastVerdict: 'refuted' });
    const resume = async (_c: string, id: string) => id === pid
      ? { threadId: id, status: 'paused', iterations: 1 }
      : { threadId: id, status: 'exhausted', iterations: 2 };
    const res = await runPortfolio(cwd, { resume, client: { isAvailable: () => true, compile: async () => ({ status: 'compiled', detail: '', graphPath: null }), querySmokeCheck: async () => ({ found: false, nodeIds: [], detail: '' }) } });
    expect(res.paused).toBe(1);
    expect(res.threads.find((e: { id: string }) => e.id === pid).action).toBe('paused');
    expect(res.threads.find((e: { id: string }) => e.id === rid).verdict).toBe('refuted'); // recovered from the ledger
  });

  it('writes a report and returns zero counts when nothing is runnable', async () => {
    const cwd = tmp();
    mk(cwd, { status: 'supported', lastVerdict: 'supported', question: 'done' });
    let called = 0;
    const res = await runPortfolio(cwd, { resume: async () => { called++; return { threadId: 'x', status: 'exhausted', iterations: 1 }; } });
    expect(called).toBe(0);
    expect(res.ran).toBe(0);
    expect(fs.existsSync(path.join(cwd, '.planning/research/PORTFOLIO.md'))).toBe(true);
  });

  const stubClient = () => ({ isAvailable: () => true, compile: async () => ({ status: 'compiled', detail: '', graphPath: null }), querySmokeCheck: async () => ({ found: false, nodeIds: [], detail: '' }) });

  it('without stopOnFirstSupported, runs ALL runnable threads even after a supported result (default unchanged)', async () => {
    const cwd = tmp();
    for (let i = 0; i < 4; i++) mk(cwd, { status: 'paused', question: `Q${i}` });
    const ran: string[] = [];
    const resume = async (_c: string, id: string) => { ran.push(id); return { threadId: id, status: 'supported', iterations: 1 }; };
    const res = await runPortfolio(cwd, { resume, concurrency: 1, client: stubClient() });
    expect(ran.length).toBe(4);
    expect(res.ran).toBe(4);
  });

  it('stopOnFirstSupported skips queued-but-unstarted seeds once a thread returns supported', async () => {
    const cwd = tmp();
    for (let i = 0; i < 4; i++) mk(cwd, { status: 'paused', question: `Q${i}` });
    const ran: string[] = [];
    const resume = async (_c: string, id: string) => { ran.push(id); return { threadId: id, status: 'supported', iterations: 1 }; };
    const res = await runPortfolio(cwd, { resume, concurrency: 1, stopOnFirstSupported: true, client: stubClient() });
    expect(ran.length).toBe(1);            // only the first started; the rest were skipped
    expect(res.supported).toBe(1);
    expect(res.ran).toBe(1);
  });

  it('stopOnFirstSupported keeps running while threads come back non-supported', async () => {
    const cwd = tmp();
    for (let i = 0; i < 3; i++) mk(cwd, { status: 'paused', question: `Q${i}` });
    const ran: string[] = [];
    const resume = async (_c: string, id: string) => { ran.push(id); return { threadId: id, status: 'exhausted', iterations: 1 }; };
    const res = await runPortfolio(cwd, { resume, concurrency: 1, stopOnFirstSupported: true, client: stubClient() });
    expect(ran.length).toBe(3);            // none supported → no early stop
    expect(res.ran).toBe(3);
  });

  it('does not abort the whole run when a thread throws a non-Error value', async () => {
    const cwd = tmp();
    mk(cwd, { status: 'paused', question: 'A' });
    mk(cwd, { status: 'paused', question: 'B' });
    let n = 0;
    const resume = async (_c: string, id: string) => { n++; if (n === 1) throw null; return { threadId: id, status: 'exhausted', iterations: 1 }; };
    const res = await runPortfolio(cwd, { resume, concurrency: 1, client: { isAvailable: () => true, compile: async () => ({ status: 'compiled', detail: '', graphPath: null }), querySmokeCheck: async () => ({ found: false, nodeIds: [], detail: '' }) } });
    expect(res.failed).toBe(1);
    expect(fs.existsSync(path.join(cwd, '.planning/research/PORTFOLIO.md'))).toBe(true);
  });
});

describe('readPortfolioConcurrency', () => {
  const fs2 = require('fs'); const os2 = require('os'); const path2 = require('path');
  function cfgTmp(): string { const d = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'grd-pfc-')); fs2.mkdirSync(path2.join(d, '.planning'), { recursive: true }); return d; }
  it('defaults to 2 with no config', () => { expect(readPortfolioConcurrency(cfgTmp())).toBe(2); });
  it('reads a valid configured value', () => {
    const cwd = cfgTmp(); fs2.writeFileSync(path2.join(cwd, '.planning/config.json'), JSON.stringify({ research_portfolio_concurrency: 4 }));
    expect(readPortfolioConcurrency(cwd)).toBe(4);
  });
  it('falls back to 2 on an invalid value (<1 or non-integer)', () => {
    const cwd = cfgTmp(); fs2.writeFileSync(path2.join(cwd, '.planning/config.json'), JSON.stringify({ research_portfolio_concurrency: 0 }));
    expect(readPortfolioConcurrency(cwd)).toBe(2);
  });
});
