'use strict';
const { output, error } = require('./../utils') as {
  output: (r: unknown, raw: boolean, rawVal?: unknown) => never;
  error: (m: string) => never;
};
const { listThreads, loadThread } = require('./thread');
const { runResearch, resumeResearch } = require('./orchestrator');
import type { ResearchOptions } from './orchestrator';
const { loadConfig } = require('./../utils') as { loadConfig: (cwd: string) => Record<string, unknown> };
const { defaultSpawn } = require('./orchestrator') as { defaultSpawn: (cwd: string, config: Record<string, unknown>, model?: string) => (p: string, a: string) => Promise<string> };
const { retrieve } = require('./retrieve') as { retrieve: (cwd: string, q: string, o?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>> }> };
const { defaultEmbedder } = require('./embedder') as { defaultEmbedder: () => (texts: string[]) => Promise<number[][] | null> };
const { generatePaper } = require('./paper') as {
  generatePaper: (cwd: string, id: string, opts: { spawn: (p: string, a: string) => Promise<string>; retrieve?: (c: string, q: string, o?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>> }> }) => Promise<{ paperPath: string; status: string }>;
};
import type { PortfolioResult } from './portfolio';
const { runPortfolio } = require('./portfolio') as {
  runPortfolio: (cwd: string, opts: Record<string, unknown>) => Promise<PortfolioResult>;
};

async function cmdResearchStart(cwd: string, question: string, opts: ResearchOptions, raw: boolean): Promise<never> {
  if (!question || !question.trim()) error('research: a question is required, e.g. gd research "Does X improve Y?"');
  const res = await runResearch(cwd, question, opts);
  // GRD convention: the gd CLI maps user `--json` to grd-tools `--raw`, so the
  // raw path must still emit machine-parseable JSON (mirrors evolve cli).
  return output(res, raw, raw ? JSON.stringify(res) : undefined);
}

async function cmdResearchResume(cwd: string, id: string, opts: ResearchOptions, raw: boolean): Promise<never> {
  if (!id) error('research resume: a thread id is required');
  try { loadThread(cwd, id); } catch { error(`research resume: thread "${id}" not found`); }
  const res = await resumeResearch(cwd, id, opts);
  return output(res, raw, raw ? JSON.stringify(res) : undefined);
}

function cmdResearchStatus(cwd: string, id: string | undefined, raw: boolean): never {
  if (id) {
    let t;
    try { t = loadThread(cwd, id); } catch { return error(`research status: thread "${id}" not found`); }
    return output(t, raw, raw ? JSON.stringify(t) : undefined);
  }
  const threads = listThreads(cwd).map((t: { id: string; question: string; status: string; iteration: number }) =>
    ({ id: t.id, question: t.question, status: t.status, iteration: t.iteration }));
  return output({ threads }, raw, raw ? JSON.stringify({ threads }) : undefined);
}

interface ReportDeps {
  generatePaper?: (cwd: string, id: string, opts: Record<string, unknown>) => Promise<{ paperPath: string; status: string }>;
}

async function cmdResearchReport(cwd: string, id: string, raw: boolean, deps: ReportDeps = {}): Promise<never> {
  if (!id) error('research report: a thread id is required');
  const gen = deps.generatePaper || ((c: string, tid: string) => generatePaper(c, tid, {
    spawn: defaultSpawn(c, loadConfig(c)),
    retrieve: (cc: string, q: string, o?: Record<string, unknown>) => retrieve(cc, q, { embedder: defaultEmbedder(), ...(o || {}) }),
  }));
  try {
    const res = await gen(cwd, id, {});
    return output(res, raw, raw ? JSON.stringify(res) : `report: ${res.paperPath}\n`);
  } catch (e) {
    return error(`research report: ${(e as Error).message}`);
  }
}

interface PortfolioCliOpts { ids?: string[]; topicId?: string; concurrency?: number; force?: boolean; noGates?: boolean; }
interface PortfolioDeps { runPortfolio?: (cwd: string, opts: Record<string, unknown>) => Promise<PortfolioResult>; }

async function cmdResearchPortfolio(cwd: string, opts: PortfolioCliOpts, raw: boolean, deps: PortfolioDeps = {}): Promise<never> {
  const run = deps.runPortfolio || runPortfolio;
  try {
    const res = await run(cwd, opts as Record<string, unknown>);
    const summary = `portfolio: ran ${res.ran}, paused ${res.paused}, supported ${res.supported}, skipped ${res.skipped}, failed ${res.failed} (concurrency ${res.concurrency}, noGates ${res.noGates}) — ${res.reportPath}\n`;
    return output(res, raw, raw ? JSON.stringify(res) : summary);
  } catch (e) {
    return error(`research portfolio: ${(e as Error).message}`);
  }
}

module.exports = { cmdResearchStart, cmdResearchResume, cmdResearchStatus, cmdResearchReport, cmdResearchPortfolio };
