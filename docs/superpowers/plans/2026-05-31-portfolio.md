# Multi-thread Research / Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `gd research portfolio` advances a set of existing research threads with bounded concurrency (shared scheduler + one mutex-serialized KG compile), isolates per-thread failures, and writes a ranked `PORTFOLIO.md`.

**Architecture:** New `lib/research/portfolio.ts` (concurrency primitives + `runPortfolio` + ranking/report). The orchestrator gains `ResearchOptions.kgClient` threaded to `finishKgSync`→`syncFindingToKg`. A `cmdResearchPortfolio` CLI wired through `bin`/`lib/cli`/`lib/research/index`. The portfolio injects ONE `spawn`/`retrieve`/`kgClient` into every `resumeResearch`; runnable = paused or active-`seed` (interrupted/error skipped unless `--force`); failures are per-thread envelopes; only a report-write failure escapes.

**Tech Stack:** TypeScript (strict, CommonJS, zero `any`), Jest + ts-jest. Deterministic tests inject `resume`/`client`/concurrency.

**Spec:** `docs/superpowers/specs/2026-05-31-portfolio-design.md`

**Conventions:** `'use strict'`; typed requires; tests in `tests/unit/research/<module>.test.ts`. Build: `npm run build:check`. Lint: `npm run lint`.

---

## Task 1: orchestrator `ResearchOptions.kgClient` → `finishKgSync`

**Files:**
- Modify: `lib/research/orchestrator.ts`
- Test: `tests/unit/research/orchestrator.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append inside the orchestrator describe:

```ts
  it('forwards an injected kgClient to the KG sync compile at finalize', async () => {
    const cwd = tmp();
    let compiled = 0;
    const kgClient = {
      isAvailable: () => true,
      compile: async () => { compiled++; return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: false, nodeIds: [], detail: '' }),
    };
    // refuted h1 then supported h2 → finalize → kg_write (gates off)
    await runResearch(cwd, 'Does X help?', { maxIterations: 5, noGates: true, spawn: makeSpawn(), runner: makeRunner(), kgClient });
    expect(compiled).toBeGreaterThanOrEqual(1);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/orchestrator.test.ts -t "forwards an injected kgClient"`
Expected: FAIL — `kgClient` is ignored; the default `createCliTesseraeClient` runs (compiled stays 0 / or real CLI path), assertion fails.

- [ ] **Step 3: Add `kgClient` to `ResearchOptions`** in `lib/research/orchestrator.ts`:
```ts
  resurveyFetch?: (cwd: string, thread: ResearchThread, deps: { spawn: SpawnFn }) => Promise<void>;
  kgClient?: import('./tesserae').TesseraeClient;
}
```

- [ ] **Step 4: Thread it through `finishKgSync`.** Change the signature + the `syncFindingToKg` call:
```ts
async function finishKgSync(
  cwd: string, thread: ResearchThread, verdict: Verdict | undefined, status: ThreadStatus,
  kgClient?: import('./tesserae').TesseraeClient,
): Promise<ResearchResult> {
  const sync = await syncFindingToKg(cwd, thread.id, findingPath(cwd, thread.id), { client: kgClient });
```
And pass `opts.kgClient` at BOTH call sites:
- runLoop finalize: `return await finishKgSync(cwd, thread, outcome.verdict, term.status, opts.kgClient);`
- resumeResearch kg_write: `return await finishKgSync(cwd, thread, verdict, status, opts.kgClient);`

- [ ] **Step 5: Run to verify pass + full orchestrator suite**

Run: `npx jest tests/unit/research/orchestrator.test.ts && npm run build:check`
Expected: all PASS (existing loop tests unaffected — default `kgClient` undefined → `syncFindingToKg` falls back to `createCliTesseraeClient` exactly as before); build OK.

- [ ] **Step 6: Commit**

```bash
git add lib/research/orchestrator.ts tests/unit/research/orchestrator.test.ts
git commit -m "feat(research): ResearchOptions.kgClient threaded to finishKgSync (portfolio task 1)"
```

---

## Task 2: `portfolio.ts` — concurrency primitives (mutex, pool, compile-lock wrapper)

**Files:**
- Create: `lib/research/portfolio.ts`
- Test: `tests/unit/research/portfolio.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/unit/research/portfolio.test.ts`:

```ts
'use strict';
const { createMutex, mapWithConcurrency, wrapClientWithCompileLock } = require('../../../lib/research/portfolio');

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/portfolio.test.ts`
Expected: FAIL — cannot find module `portfolio`.

- [ ] **Step 3: Create `lib/research/portfolio.ts`** with the primitives:

```ts
'use strict';
import type { TesseraeClient } from './tesserae';

type Task<T> = () => Promise<T>;
export type Mutex = <T>(fn: Task<T>) => Promise<T>;

/** Promise-chain async mutex. The tail recovers from rejection so it never poisons later sections. */
function createMutex(): Mutex {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: Task<T>): Promise<T> => {
    const run = tail.then(fn);
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

/** Run `fn` over `items` with at most `limit` (>=1) concurrent; results preserve input order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const n = Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 1));
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, () => worker()));
  return results;
}

/** Wrap a client so its `compile` runs under `lock`; other methods pass through unchanged. */
function wrapClientWithCompileLock(client: TesseraeClient, lock: Mutex): TesseraeClient {
  return {
    isAvailable: () => client.isAvailable(),
    compile: (cwd, sources) => lock(() => client.compile(cwd, sources)),
    querySmokeCheck: (cwd, topic) => client.querySmokeCheck(cwd, topic),
  };
}

module.exports = { createMutex, mapWithConcurrency, wrapClientWithCompileLock };
```

- [ ] **Step 4: Run to verify pass + build**

Run: `npx jest tests/unit/research/portfolio.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 5: Commit**

```bash
git add lib/research/portfolio.ts tests/unit/research/portfolio.test.ts
git commit -m "feat(research): portfolio.ts concurrency primitives — mutex, bounded pool, compile-lock wrapper (portfolio task 2)"
```

---

## Task 3: `portfolio.ts` — classification, ranking, report (pure)

**Files:**
- Modify: `lib/research/portfolio.ts`
- Test: `tests/unit/research/portfolio.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append:

```ts
describe('classifyThread', () => {
  const { classifyThread } = require('../../../lib/research/portfolio');
  it('classifies by status + station + force', () => {
    expect(classifyThread({ status: 'supported' }, false)).toBe('terminal');
    expect(classifyThread({ status: 'exhausted' }, false)).toBe('terminal');
    expect(classifyThread({ status: 'paused' }, false)).toBe('runnable');
    expect(classifyThread({ status: 'active', currentStation: 'seed' }, false)).toBe('runnable');
    expect(classifyThread({ status: 'active', currentStation: 'design' }, false)).toBe('interrupted');
    expect(classifyThread({ status: 'error' }, false)).toBe('interrupted');
    expect(classifyThread({ status: 'active', currentStation: 'design' }, true)).toBe('runnable'); // --force
    expect(classifyThread({ status: 'error' }, true)).toBe('runnable');
  });
});

describe('rankEntries + buildPortfolioReport', () => {
  const { rankEntries, buildPortfolioReport } = require('../../../lib/research/portfolio');
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
  it('report is pure (no file reads) and handles an empty set', () => {
    expect(buildPortfolioReport([])).toMatch(/# Research Portfolio/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/portfolio.test.ts -t "classifyThread|rankEntries"`
Expected: FAIL — functions undefined.

- [ ] **Step 3: Add the types + pure functions** to `lib/research/portfolio.ts` (above `module.exports`):

```ts
import type { ResearchThread, Verdict } from './types';

export type PortfolioAction = 'ran' | 'paused' | 'skipped-terminal' | 'skipped-interrupted' | 'failed' | 'not-found';
export interface PortfolioEntry {
  id: string; question: string; status: string; verdict: Verdict | null; iterations: number;
  action: PortfolioAction; error?: string;
}

const TERMINAL = new Set(['supported', 'exhausted', 'abandoned']); // mirrors resumeResearch
const STATUS_RANK: Record<string, number> = { supported: 0, paused: 1, active: 2, exhausted: 3, error: 4, abandoned: 4 };

/** Pure runnability classification for a loaded thread. */
function classifyThread(thread: Pick<ResearchThread, 'status' | 'currentStation'>, force: boolean): 'terminal' | 'runnable' | 'interrupted' {
  if (TERMINAL.has(thread.status)) return 'terminal';
  if (thread.status === 'paused') return 'runnable';
  if (thread.status === 'active' && thread.currentStation === 'seed') return 'runnable';
  return force ? 'runnable' : 'interrupted'; // active-non-seed or error
}

/** Rank entries: status priority, then iterations asc for supported/paused, else stable by id. */
function rankEntries(entries: PortfolioEntry[]): PortfolioEntry[] {
  return entries.slice().sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 5;
    const rb = STATUS_RANK[b.status] ?? 5;
    if (ra !== rb) return ra - rb;
    if (a.status === 'supported' || a.status === 'paused') return a.iterations - b.iterations;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Build the PORTFOLIO.md markdown from already-captured entries (pure — no file reads). */
function buildPortfolioReport(ranked: PortfolioEntry[]): string {
  const rows = ranked.map((e, i) =>
    `| ${i + 1} | ${e.id} | ${e.status} | ${e.verdict ?? '—'} | ${e.iterations} | ${e.action}${e.error ? ` (${e.error})` : ''} | ${e.question} |`);
  const winners = ranked.filter((e) => e.status === 'supported').map((e) => e.id);
  return [
    '# Research Portfolio',
    '',
    `supported: ${winners.length ? winners.join(', ') : '(none)'}`,
    '',
    '| # | thread | status | verdict | iters | action | question |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}
```
Update `module.exports` to add `classifyThread, rankEntries, buildPortfolioReport`.

- [ ] **Step 4: Run to verify pass + build**

Run: `npx jest tests/unit/research/portfolio.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 5: Commit**

```bash
git add lib/research/portfolio.ts tests/unit/research/portfolio.test.ts
git commit -m "feat(research): portfolio.ts — classification, status-first ranking, pure report (portfolio task 3)"
```

---

## Task 4: `portfolio.ts` — `runPortfolio` (selection, run, envelopes, write) + config

**Files:**
- Modify: `lib/research/portfolio.ts`
- Modify: `lib/utils.ts` (`KNOWN_CONFIG_KEYS`)
- Test: `tests/unit/research/portfolio.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append (fixture threads with varied statuses; injected `resume`):

```ts
describe('runPortfolio', () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { runPortfolio } = require('../../../lib/research/portfolio');
  const { createThread, saveThread } = require('../../../lib/research/thread');
  const { appendHypothesis } = require('../../../lib/research/ledger');

  function tmp(): string { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-pf-')); fs.mkdirSync(path.join(d, '.planning'), { recursive: true }); return d; }
  function mk(cwd: string, over: Record<string, unknown>): string {
    const t = createThread(cwd, String(over.question || 'Q'), {});
    Object.assign(t, over); saveThread(cwd, t);
    if (over.lastVerdict) appendHypothesis(cwd, t.id, { id: 'h1', iteration: 1, statement: 'h', rationale: 'r', predictedOutcome: 'p', status: String(over.lastVerdict), parentId: null, verdict: over.lastVerdict });
    return t.id;
  }

  it('runs only runnable threads (paused / active-seed), skips terminal + interrupted, writes a ranked report', async () => {
    const cwd = tmp();
    const pausedId = mk(cwd, { status: 'paused', currentStation: 'run', question: 'Paused' });
    const seedId = mk(cwd, { status: 'active', currentStation: 'seed', question: 'Seeded' });
    const doneId = mk(cwd, { status: 'supported', currentStation: 'finalize', question: 'Done', lastVerdict: 'supported' });
    const crashId = mk(cwd, { status: 'active', currentStation: 'design', question: 'Crashed' });
    const ran: string[] = [];
    const resume = async (_c: string, id: string) => { ran.push(id); return { threadId: id, status: 'supported', iterations: 2 }; };
    const res = await runPortfolio(cwd, { resume, concurrency: 2 });
    expect(ran.sort()).toEqual([pausedId, seedId].sort()); // only runnable
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
    const resume = async (_c: string, id: string) => { ran.push(id); return { threadId: id, status: 'exhausted', iterations: 1 }; };
    await runPortfolio(cwd, { resume, force: true });
    expect(ran).toContain(crash);

    const cwd2 = tmp();
    const t = createThread(cwd2, 'topical', {}); t.status = 'paused';
    t.seededFrom = { synthesisTopicId: 'topicX', sourceNodeIds: [], seedKey: 'k' }; saveThread(cwd2, t);
    const other = createThread(cwd2, 'other', {}); other.status = 'paused'; saveThread(cwd2, other);
    const ran2: string[] = [];
    await runPortfolio(cwd2, { resume: async (_c: string, id: string) => { ran2.push(id); return { threadId: id, status: 'exhausted', iterations: 1 }; }, topicId: 'topicX' });
    expect(ran2).toEqual([t.id]);
  });

  it('tolerates an unreadable thread.json (becomes a not-found/failed entry, not an abort)', async () => {
    const cwd = tmp();
    mk(cwd, { status: 'paused', question: 'ok' });
    const badDir = path.join(cwd, '.planning/research/threads', 'broken');
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, 'thread.json'), '{not json');
    const res = await runPortfolio(cwd, { resume: async (_c: string, id: string) => ({ threadId: id, status: 'exhausted', iterations: 1 }) });
    expect(res.threads.some((e: { id: string; action: string }) => e.id === 'broken' && e.action === 'not-found')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/portfolio.test.ts -t runPortfolio`
Expected: FAIL — `runPortfolio` undefined.

- [ ] **Step 3: Add the `lib/utils.ts` config key.** In `KNOWN_CONFIG_KEYS`, after `'research_resurvey_fetch',` add:
```ts
  'research_portfolio_concurrency',
```

- [ ] **Step 4: Implement `runPortfolio` + helpers** in `lib/research/portfolio.ts`. Add requires at the top (after the `import type`s):
```ts
const fs = require('fs');
const path = require('path');
const { loadThread } = require('./thread') as { loadThread: (cwd: string, id: string) => ResearchThread };
const { readLedger } = require('./ledger') as { readLedger: (cwd: string, id: string) => Array<{ verdict: Verdict | null }> };
const { resumeResearch, defaultSpawn } = require('./orchestrator') as {
  resumeResearch: (cwd: string, id: string, opts: Record<string, unknown>) => Promise<{ threadId: string; status: string; iterations: number; verdict?: Verdict }>;
  defaultSpawn: (cwd: string, config: Record<string, unknown>, model?: string) => (p: string, a: string) => Promise<string>;
};
const { retrieve } = require('./retrieve') as { retrieve: (cwd: string, q: string, o?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>> }> };
const { defaultEmbedder } = require('./embedder') as { defaultEmbedder: () => (texts: string[]) => Promise<number[][] | null> };
const { createCliTesseraeClient } = require('./tesserae') as { createCliTesseraeClient: () => TesseraeClient };
const { loadConfig } = require('./../utils') as { loadConfig: (cwd: string) => Record<string, unknown> };

type ResumeFn = (cwd: string, id: string, opts: Record<string, unknown>) => Promise<{ threadId: string; status: string; iterations: number; verdict?: Verdict }>;
export interface PortfolioResult {
  ran: number; paused: number; supported: number; skipped: number; failed: number;
  noGates: boolean; concurrency: number; threads: PortfolioEntry[]; reportPath: string;
}
interface PortfolioOpts {
  ids?: string[]; topicId?: string; concurrency?: number; force?: boolean; noGates?: boolean;
  resume?: ResumeFn; client?: TesseraeClient;
}
```

Add the config reader + helpers + `runPortfolio` (above `module.exports`):
```ts
function threadsRoot(cwd: string): string { return path.join(cwd, '.planning/research/threads'); }

/** Enumerate thread ids from disk WITHOUT loading (so one bad thread.json can't abort selection). */
function listThreadIds(cwd: string): string[] {
  const root = threadsRoot(cwd);
  if (!fs.existsSync(root)) return [];
  return (fs.readdirSync(root) as string[]).filter((d) => fs.existsSync(path.join(root, d, 'thread.json')));
}

function readPortfolioConcurrency(cwd: string): number {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as { research_portfolio_concurrency?: unknown };
    const n = Number(raw.research_portfolio_concurrency);
    return Number.isInteger(n) && n >= 1 ? n : 2;
  } catch { return 2; }
}

/** Latest completed verdict from the ledger (works around resumeResearch collapsing verdict). */
function latestVerdict(cwd: string, id: string): Verdict | null {
  try {
    const led = readLedger(cwd, id);
    for (let i = led.length - 1; i >= 0; i--) if (led[i].verdict !== null) return led[i].verdict;
  } catch { /* unreadable → null */ }
  return null;
}

async function runPortfolio(cwd: string, opts: PortfolioOpts = {}): Promise<PortfolioResult> {
  const force = opts.force === true;
  const noGates = opts.noGates === true;
  const concurrency = Math.max(1, opts.concurrency ?? readPortfolioConcurrency(cwd));
  const resume: ResumeFn = opts.resume || resumeResearch;

  // 1. Resolve candidate ids (never throws).
  let ids: string[];
  if (opts.ids && opts.ids.length) ids = opts.ids;
  else ids = listThreadIds(cwd);

  // 2. Classify each (loadThread wrapped per-thread → never aborts).
  const runnable: Array<{ id: string; question: string }> = [];
  const skipped: PortfolioEntry[] = [];
  for (const id of ids) {
    let t: ResearchThread;
    try { t = loadThread(cwd, id); }
    catch { skipped.push({ id, question: '', status: 'unknown', verdict: null, iterations: 0, action: 'not-found' }); continue; }
    if (opts.topicId && (!t.seededFrom || t.seededFrom.synthesisTopicId !== opts.topicId)) continue;
    const cls = classifyThread(t, force);
    if (cls === 'runnable') { runnable.push({ id, question: t.question }); }
    else {
      skipped.push({
        id, question: t.question, status: t.status, verdict: latestVerdict(cwd, id), iterations: t.iteration,
        action: cls === 'terminal' ? 'skipped-terminal' : 'skipped-interrupted',
      });
    }
  }

  // 3. Shared deps (one scheduler, one retriever, one mutex-locked client).
  const lock = createMutex();
  const kgClient = opts.client || wrapClientWithCompileLock(createCliTesseraeClient(), lock);
  const spawn = defaultSpawn(cwd, loadConfig(cwd));
  const retrieveFn = (c: string, q: string, o?: Record<string, unknown>) => retrieve(c, q, { embedder: defaultEmbedder(), ...(o || {}) });
  const deps = { spawn, retrieve: retrieveFn, kgClient, noGates };

  // 4. Run runnables with bounded concurrency; each in a failure-isolating envelope.
  const ranEntries: PortfolioEntry[] = await mapWithConcurrency(runnable, concurrency, async (r) => {
    try {
      const res = await resume(cwd, r.id, deps);
      return {
        id: r.id, question: r.question, status: res.status, verdict: latestVerdict(cwd, r.id),
        iterations: res.iterations, action: res.status === 'paused' ? 'paused' : 'ran',
      } as PortfolioEntry;
    } catch (e) {
      return { id: r.id, question: r.question, status: 'error', verdict: null, iterations: 0, action: 'failed', error: (e as Error).message } as PortfolioEntry;
    }
  });

  // 5. Aggregate + rank + write report (write is the only step allowed to throw → CLI exit 1).
  const all = rankEntries([...ranEntries, ...skipped]);
  const reportPath = path.join(cwd, '.planning/research/PORTFOLIO.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const tmpPath = path.join(cwd, '.planning/research/.PORTFOLIO.md.tmp');
  fs.writeFileSync(tmpPath, buildPortfolioReport(all));
  fs.renameSync(tmpPath, reportPath);

  return {
    ran: ranEntries.filter((e) => e.action === 'ran').length,
    paused: ranEntries.filter((e) => e.action === 'paused').length,
    supported: all.filter((e) => e.status === 'supported').length,
    skipped: skipped.length,
    failed: ranEntries.filter((e) => e.action === 'failed').length,
    noGates, concurrency, threads: all, reportPath,
  };
}
```
Update `module.exports` to add `runPortfolio, readPortfolioConcurrency`.

- [ ] **Step 5: Run to verify pass + build**

Run: `npx jest tests/unit/research/portfolio.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 6: Commit**

```bash
git add lib/research/portfolio.ts lib/utils.ts tests/unit/research/portfolio.test.ts
git commit -m "feat(research): runPortfolio — selection, bounded run, envelopes, ranked PORTFOLIO.md (portfolio task 4)"
```

---

## Task 5: `cmdResearchPortfolio` CLI + bin/index wiring

**Files:**
- Modify: `lib/research/cli.ts`
- Modify: `lib/research/index.ts`
- Modify: `bin/grd-tools.ts`
- Modify: `lib/cli/index.ts`
- Test: `tests/unit/research/cli.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — append inside the `research cli` describe (the file already requires `fs`/`os`/`path`, the async capture helpers, `createThread`, `saveThread`):

```ts
  describe('cmdResearchPortfolio', () => {
    const { cmdResearchPortfolio } = require('../../../lib/research/cli');
    it('calls the injected runPortfolio and prints the summary', async () => {
      const cwd = tmp();
      const deps = { runPortfolio: async () => ({ ran: 1, paused: 0, supported: 1, skipped: 2, failed: 0, noGates: false, concurrency: 2, threads: [], reportPath: '/abs/PORTFOLIO.md' }) };
      const res = await captureOutputAsync(() => cmdResearchPortfolio(cwd, { }, true, deps));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('PORTFOLIO.md');
    });
    it('exits 1 when runPortfolio throws (e.g. report write failure)', async () => {
      const cwd = tmp();
      const deps = { runPortfolio: async () => { throw new Error('cannot write report'); } };
      const res = await captureErrorAsync(() => cmdResearchPortfolio(cwd, {}, true, deps));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/cannot write report/i);
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/unit/research/cli.test.ts -t cmdResearchPortfolio`
Expected: FAIL — `cmdResearchPortfolio` undefined.

- [ ] **Step 3: Implement `cmdResearchPortfolio`** in `lib/research/cli.ts`. Add the require near the others (`generatePaper` etc. are already required from the paper slice):
```ts
const { runPortfolio } = require('./portfolio') as {
  runPortfolio: (cwd: string, opts: Record<string, unknown>) => Promise<{ ran: number; paused: number; supported: number; skipped: number; failed: number; noGates: boolean; concurrency: number; reportPath: string; threads: unknown[] }>;
};
```
Add the function:
```ts
interface PortfolioCliOpts { ids?: string[]; topicId?: string; concurrency?: number; force?: boolean; noGates?: boolean; }
interface PortfolioDeps { runPortfolio?: (cwd: string, opts: Record<string, unknown>) => Promise<{ ran: number; paused: number; supported: number; skipped: number; failed: number; noGates: boolean; concurrency: number; reportPath: string; threads: unknown[] }>; }

async function cmdResearchPortfolio(cwd: string, opts: PortfolioCliOpts, raw: boolean, deps: PortfolioDeps = {}): Promise<never> {
  const run = deps.runPortfolio || runPortfolio;
  try {
    const res = await run(cwd, opts);
    const summary = `portfolio: ran ${res.ran}, paused ${res.paused}, supported ${res.supported}, skipped ${res.skipped}, failed ${res.failed} (concurrency ${res.concurrency}, noGates ${res.noGates}) — ${res.reportPath}\n`;
    return output(res, raw, raw ? JSON.stringify(res) : summary);
  } catch (e) {
    return error(`research portfolio: ${(e as Error).message}`);
  }
}
```
Add `cmdResearchPortfolio` to `module.exports`.

- [ ] **Step 4: Export from `lib/research/index.ts`** — after `cmdResearchReport: cli.cmdResearchReport,` add:
```ts
  cmdResearchPortfolio: cli.cmdResearchPortfolio,
```

- [ ] **Step 5: Wire the bin dispatch.** In `bin/grd-tools.ts` `case 'research'`, add to the destructure + type, and add the branch before the default question path (after the `if (sub === 'report')` block):
```ts
        cmdResearchPortfolio: (cwd: string, o: Record<string, unknown>, raw: boolean) => Promise<never>;
```
and (parse flags from `args` with a clean positional scan over `args.slice(2)`):
```ts
      if (sub === 'portfolio') {
        const rest = args.slice(2);
        const ids: string[] = [];
        let topicId: string | undefined;
        let concurrency: number | undefined;
        for (let i = 0; i < rest.length; i++) {
          const a = rest[i];
          if (a === '--topic') { topicId = rest[++i]; continue; }
          if (a === '--concurrency') { concurrency = Number(rest[++i]); continue; }
          if (a.startsWith('--')) continue; // --force / --no-gates handled below
          ids.push(a);
        }
        await cmdResearchPortfolio(cwd, { ids, topicId, concurrency, force: args.includes('--force'), noGates }, raw);
        return;
      }
```
(add `cmdResearchPortfolio,` to the destructured names.)

- [ ] **Step 6: Register the subcommand** in `lib/cli/index.ts` — change `RESEARCH_TOOL_SUBS`:
```ts
const RESEARCH_TOOL_SUBS = new Set(['resume', 'status', 'report', 'portfolio']);
```

- [ ] **Step 7: Run to verify pass + build**

Run: `npx jest tests/unit/research/cli.test.ts && npm run build:check`
Expected: all PASS; build OK.

- [ ] **Step 8: Commit**

```bash
git add lib/research/cli.ts lib/research/index.ts bin/grd-tools.ts lib/cli/index.ts tests/unit/research/cli.test.ts
git commit -m "feat(research): gd research portfolio — cmdResearchPortfolio + bin/index wiring (portfolio task 5)"
```

---

## Task 6: coverage thresholds, docs, full verification

**Files:**
- Modify: `jest.config.js`, `CLAUDE.md`

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: clean (prefix unused args with `_`; the bin flag-parse is intricate — verify no `no-useless-assignment`/unused-var).

- [ ] **Step 2: Measure coverage for `portfolio.ts`**

Run:
```bash
npx jest tests/unit/research/ --coverage --collectCoverageFrom='lib/research/portfolio.ts' --coverageThreshold='{}' 2>&1 | grep -E "portfolio\.ts|% Stmts"
```
Note actuals.

- [ ] **Step 3: Add a per-file threshold** for `portfolio.ts` in `jest.config.js` (after `./lib/research/paper.ts`), a few points below Step-2 actuals:
```js
    './lib/research/portfolio.ts': { lines: 90, functions: 90, branches: 75 },
```
Adjust literals to sit just under measured if lower.

- [ ] **Step 4: Document the feature** in `CLAUDE.md` — under the autoresearch section, before the FIRST `## Gotchas`, add:
```markdown
### Multi-thread portfolio (loop deepening #3)

`gd research portfolio [ids...] [--topic <id>] [--concurrency N] [--force] [--no-gates]` advances a
set of existing threads with bounded concurrency (default `research_portfolio_concurrency`=2) and
writes a ranked `.planning/research/PORTFOLIO.md`. It runs only **safely-resumable** threads (paused,
or active-at-`seed`); interrupted (`active` mid-station) / `error` threads are skipped+reported unless
`--force`. All threads share ONE scheduler `spawn`, ONE retriever, and ONE mutex-wrapped `kgClient`
(so the `kg_write` compile serializes — `ResearchOptions.kgClient`). Per-thread failures are isolated
(envelopes); only a report-write failure exits non-zero. Default selection = all threads; `--topic`
= the SP2-C synthesis-seeded set. The compile lock is process-local (not a global KG lock).
```

- [ ] **Step 5: Full research suite + build + lint**

Run: `npx jest tests/unit/research/ && npm run build:check && npm run lint`
Expected: all PASS; build OK; lint clean. (`git diff --name-only main` shows only `lib/research/{portfolio,orchestrator,cli,index}.ts`, `lib/utils.ts`, `bin/grd-tools.ts`, `lib/cli/index.ts`, the tests, `jest.config.js`, `CLAUDE.md`, docs.)

- [ ] **Step 6: Commit**

```bash
git add jest.config.js CLAUDE.md
git commit -m "chore(research): coverage threshold + docs for multi-thread portfolio (portfolio task 6)"
```

---

## Self-review notes (author)

- **Spec coverage:** kgClient wiring (T1), concurrency primitives — mutex/pool/compile-lock (T2), classification+ranking+pure-report (T3), runPortfolio selection/run/envelopes/write + config (T4), CLI + 4-point wiring (T5), coverage/docs (T6). Codex P1s: shared `spawn`/`retrieve`/`kgClient` injected (T4 deps), safe-resumability (T3 classifyThread), classification never aborts (T4 per-thread try/catch + `listThreadIds` no-load enumeration), report-only-escape + pure buildReport (T4/T3), ledger-derived verdict (T4 `latestVerdict`). Codex P2s: status-first ranking no `inconclusive` (T3), envelope `{ok}` shape (T4), N≥1 (T2). P3: exit-0 batch semantics + summary surfaces noGates/concurrency/failed (T5).
- **Type consistency:** `PortfolioEntry`/`PortfolioAction`/`PortfolioResult`, `classifyThread(thread,force)→'terminal'|'runnable'|'interrupted'`, `mapWithConcurrency(items,limit,fn)`, `createMutex()→Mutex`, `wrapClientWithCompileLock(client,lock)`, `runPortfolio(cwd,opts)`, `cmdResearchPortfolio(cwd,opts,raw,deps?)` consistent across tasks + injected test fakes.
- **Carried risk:** compile lock process-local (documented); cross-thread sharing opportunistic via KG; `--no-gates` blast radius surfaced in summary.
```
