'use strict';
const fs = require('fs');
const path = require('path');
import type { ResearchThread, Hypothesis, Takeaway, ExperimentPlan, Verdict } from './types';
const { loadThread } = require('./thread') as { loadThread: (cwd: string, id: string) => ResearchThread };
const { readLedger } = require('./ledger') as { readLedger: (cwd: string, id: string) => Hypothesis[] };
const { readTakeaways } = require('./takeaways') as { readTakeaways: (cwd: string, id: string) => Takeaway[] };

export type RetrieveFn = (cwd: string, query: string, opts?: Record<string, unknown>) =>
  Promise<{ results: Array<{ name?: string; description?: string; source_path?: string }> }>;
type SpawnFn = (prompt: string, agentType: string) => Promise<string>;

// Terminal statuses mirror resumeResearch's set in orchestrator.ts (no shared constant exists).
const TERMINAL_STATUSES = new Set(['supported', 'exhausted', 'abandoned']);

export interface PaperBundle {
  thread: { id: string; question: string; status: string; iteration: number };
  supported: Hypothesis | null;
  ledger: Hypothesis[];
  takeaways: Takeaway[];
  experiments: Array<{ iter: number; plan: Partial<ExperimentPlan> | null; metrics: Record<string, number>; verdict: Verdict | null }>;
  relatedWork: Array<{ name: string; description: string; source_path: string }>;
}

function threadDir(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id);
}

/** Gather a completed thread's artifacts (+ optional Related Work) into a structured bundle. */
async function gatherPaperBundle(cwd: string, id: string, opts: { retrieve?: RetrieveFn } = {}): Promise<PaperBundle> {
  const thread = loadThread(cwd, id);
  const ledger = readLedger(cwd, id);
  const takeaways = readTakeaways(cwd, id);
  const verdictByIter = new Map<number, Verdict | null>(ledger.map((h) => [h.iteration, h.verdict]));

  const experiments: PaperBundle['experiments'] = [];
  for (let n = 1; n <= thread.iteration; n++) {
    const dir = path.join(threadDir(cwd, id), 'experiments', String(n));
    let plan: Partial<ExperimentPlan> | null = null;
    let metrics: Record<string, number> = {};
    try { plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8')); } catch { plan = null; }
    try { metrics = (JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8')).metrics) || {}; } catch { metrics = {}; }
    experiments.push({ iter: n, plan, metrics, verdict: verdictByIter.get(n) ?? null });
  }

  let relatedWork: PaperBundle['relatedWork'] = [];
  if (opts.retrieve) {
    try {
      const r = await opts.retrieve(cwd, thread.question);
      relatedWork = (r.results || []).slice(0, 8).map((x) => ({
        name: x.name || '', description: x.description || '', source_path: x.source_path || '',
      }));
    } catch { relatedWork = []; }
  }

  return {
    thread: { id: thread.id, question: thread.question, status: thread.status, iteration: thread.iteration },
    supported: ledger.find((h) => h.status === 'supported') ?? null,
    ledger, takeaways, experiments, relatedWork,
  };
}

/** Assemble the bundle into the grd-paper-writer prompt (data ground-truth + __PAPER__ contract). */
function buildPaperPrompt(bundle: PaperBundle): string {
  const ledgerLines = bundle.ledger.map((h) => `- **${h.id}** [${h.status}] — ${h.statement}`);
  const resultRows = bundle.experiments.map((e) => {
    const p = e.plan || {};
    const val = p.metricKey && e.metrics[p.metricKey] !== undefined ? e.metrics[p.metricKey] : '—';
    return `| ${e.iter} | ${p.metricKey ?? '—'} | ${val} | ${p.comparator ?? '—'} | ${p.target ?? '—'} | ${e.verdict ?? '—'} |`;
  });
  const takeawayLines = bundle.takeaways.map((t) => `- _(iter ${t.iteration}, ${t.kind})_ ${t.content}`);
  const relatedLines = bundle.relatedWork.length
    ? bundle.relatedWork.map((r) => `- **${r.name}**${r.source_path ? ` (${r.source_path})` : ''}: ${r.description}`)
    : ['_(none retrieved)_'];
  return [
    'You are grd-paper-writer. Turn this autoresearch thread into an HONEST, publication-style',
    'markdown draft. Do NOT invent results beyond the data below. If the verdict is not supported,',
    'frame the paper as a negative or inconclusive result — do not fabricate success.',
    '',
    `Research question: ${bundle.thread.question}`,
    `Overall verdict: ${bundle.thread.status} (after ${bundle.thread.iteration} iteration(s))`,
    bundle.supported ? `Supported hypothesis: ${bundle.supported.id} — ${bundle.supported.statement}` : 'Supported hypothesis: none',
    '',
    'Hypothesis ledger:',
    ...ledgerLines,
    '',
    'Per-iteration results (ground truth — do not contradict):',
    '| iter | metric | value | comparator | target | verdict |',
    '| --- | --- | --- | --- | --- | --- |',
    ...resultRows,
    '',
    'Takeaways:',
    ...takeawayLines,
    '',
    'Related work (retrieved from the knowledge graph; cite where relevant):',
    ...relatedLines,
    '',
    'Write these sections: Title, Abstract, Introduction, Related Work, Method, Results,',
    'Discussion, Limitations, Future Work. Emit exactly one final block (no prose after it):',
    '__PAPER__',
    '# <title>',
    '<the full markdown paper>',
  ].join('\n');
}

/** Generate PAPER.md for a terminal thread. Throws on missing/active thread or empty agent output. */
async function generatePaper(cwd: string, id: string, opts: { spawn: SpawnFn; retrieve?: RetrieveFn }): Promise<{ paperPath: string; status: string }> {
  let thread: ResearchThread;
  try { thread = loadThread(cwd, id); } catch { throw new Error(`thread "${id}" not found`); }
  if (!TERMINAL_STATUSES.has(thread.status)) {
    throw new Error(`thread "${id}" is not finished (status: ${thread.status}) — resume it first`);
  }
  const bundle = await gatherPaperBundle(cwd, id, { retrieve: opts.retrieve });
  const out = await opts.spawn(buildPaperPrompt(bundle), 'grd-paper-writer');
  const idx = out.indexOf('__PAPER__');
  const md = idx >= 0 ? out.slice(idx + '__PAPER__'.length).trim() : '';
  if (!md) throw new Error('paper-writer produced no __PAPER__ block');
  const dir = threadDir(cwd, id);
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, 'PAPER.md');
  const tmpPath = path.join(dir, '.PAPER.md.tmp');
  fs.writeFileSync(tmpPath, md);
  fs.renameSync(tmpPath, finalPath); // atomic
  return { paperPath: finalPath, status: 'written' };
}

module.exports = { gatherPaperBundle, buildPaperPrompt, generatePaper, threadDir };
