'use strict';
import type { TesseraeClient } from './tesserae';
import type { ResearchThread, Verdict } from './types';
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
const { benjaminiHochberg } = require('../commands/patterns') as { benjaminiHochberg: (pvalues: number[]) => number[] };

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

/**
 * Run `fn` over `items` with at most `limit` (>=1) concurrent; results preserve input order.
 * Optional `shouldStop` is checked before each worker claims its next item: once it returns true,
 * queued-but-unstarted items are skipped (their result slots stay empty) — in-flight items finish.
 */
async function mapWithConcurrency<T, R>(
  items: T[], limit: number, fn: (item: T, index: number) => Promise<R>, shouldStop?: () => boolean,
): Promise<R[]> {
  const n = Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 1));
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      if (shouldStop && shouldStop()) return;
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

export type PortfolioAction = 'ran' | 'paused' | 'skipped-terminal' | 'skipped-interrupted' | 'failed' | 'not-found';
export interface PortfolioEntry {
  id: string; question: string; status: string; verdict: Verdict | null; iterations: number;
  action: PortfolioAction; error?: string;
  /** Optional raw p-value carrier (Gap 3). Deterministic verdicts have none; present only if an
   *  upstream supplies one. When set on a 'supported' winner it feeds the presentational FDR flag. */
  raw_p?: number;
}

/** q-value at/above which a 'supported' winner is treated as FDR-borderline (Gap 3, presentational). */
const FDR_Q = 0.05;

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
  const winnerEntries = ranked.filter((e) => e.status === 'supported');
  const winners = winnerEntries.map((e) => e.id);
  const lines = [
    '# Research Portfolio',
    '',
    `supported: ${winners.length ? winners.join(', ') : '(none)'}`,
  ];
  // Gap 3 (presentational FDR flag): GRD's verdicts are deterministic single-shot, so they carry
  // NO p-value — we never invent one. Only when a supported winner actually carries a `raw_p` do we
  // run the existing Benjamini-Hochberg primitive over those winners and flag the borderline ones
  // (FDR-corrected q at/above FDR_Q). This is telemetry beside the verdict, never authoritative.
  const withP = winnerEntries.filter((e) => typeof e.raw_p === 'number');
  if (withP.length) {
    const q = benjaminiHochberg(withP.map((e) => e.raw_p as number));
    const flagged = withP.filter((_e, i) => q[i] >= FDR_Q).map((e) => e.id);
    lines.push(`fdr_flag (q ≥ ${FDR_Q}): ${flagged.length ? flagged.join(', ') : '(none)'}`);
  }
  // ponytail: no `withP` → no fdr_flag line at all (ceiling: deterministic verdicts have no
  // p-value to correct, so the honest move is to omit the marker rather than fabricate one).
  lines.push(
    '',
    '| # | thread | status | verdict | iters | action | question |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  );
  return lines.join('\n');
}

type ResumeFn = (cwd: string, id: string, opts: Record<string, unknown>) => Promise<{ threadId: string; status: string; iterations: number; verdict?: Verdict }>;
export interface PortfolioResult {
  ran: number; paused: number; supported: number; skipped: number; failed: number;
  noGates: boolean; concurrency: number; threads: PortfolioEntry[]; reportPath: string;
}
interface PortfolioOpts {
  ids?: string[]; topicId?: string; concurrency?: number; force?: boolean; noGates?: boolean;
  resume?: ResumeFn; client?: TesseraeClient;
  /** Gap 5: when true, once a thread returns 'supported', skip queued-but-unstarted seeds. */
  stopOnFirstSupported?: boolean;
}

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
  // A finite integer override wins; anything else (undefined, NaN from a bad --concurrency) → config.
  const concurrency = Number.isInteger(opts.concurrency) ? Math.max(1, opts.concurrency as number) : readPortfolioConcurrency(cwd);
  const resume: ResumeFn = opts.resume || resumeResearch;

  // 1. Resolve candidate ids (never throws).
  const ids: string[] = opts.ids && opts.ids.length ? opts.ids : listThreadIds(cwd);

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
  // `concurrency` is threaded into each thread's ResearchOptions so a concurrent portfolio run (>1)
  // forces resolveInteractive INACTIVE — a concurrent thread NEVER pauses for a human (R1) — while
  // still routing checkpoints through the AI-panel fallback inline when research_gates.interactive
  // .fallback is 'panel'. With the default 'recommended' fallback, concurrent threads resolve to
  // recommended defaults exactly as before.
  const deps = { spawn, retrieve: retrieveFn, kgClient, noGates, concurrency };

  // 4. Run runnables with bounded concurrency; each in a failure-isolating envelope.
  //    Gap 5: early-stop — once any thread returns 'supported', skip queued-but-unstarted seeds.
  const stopOnFirstSupported = opts.stopOnFirstSupported === true;
  let stop = false;
  const ranResults = await mapWithConcurrency(runnable, concurrency, async (r) => {
    try {
      const res = await resume(cwd, r.id, deps);
      if (stopOnFirstSupported && res.status === 'supported') stop = true;
      return {
        id: r.id, question: r.question, status: res.status, verdict: latestVerdict(cwd, r.id),
        iterations: res.iterations, action: res.status === 'paused' ? 'paused' : 'ran',
      } as PortfolioEntry;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e); // a non-Error throw must not escape the envelope
      return { id: r.id, question: r.question, status: 'error', verdict: null, iterations: 0, action: 'failed', error: msg } as PortfolioEntry;
    }
  }, stopOnFirstSupported ? () => stop : undefined);
  // Sparse slots for early-skipped seeds are dropped here (filter skips array holes).
  const ranEntries: PortfolioEntry[] = ranResults.filter((e) => e !== undefined);

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

module.exports = {
  createMutex, mapWithConcurrency, wrapClientWithCompileLock,
  classifyThread, rankEntries, buildPortfolioReport, runPortfolio, readPortfolioConcurrency,
};
