'use strict';
const { output, error } = require('./../utils') as {
  output: (r: unknown, raw: boolean, rawVal?: unknown) => never;
  error: (m: string) => never;
};
const { listThreads, loadThread } = require('./thread');
const { runResearch, resumeResearch } = require('./orchestrator');
import type { ResearchOptions } from './orchestrator';

async function cmdResearchStart(cwd: string, question: string, opts: ResearchOptions, raw: boolean): Promise<never> {
  if (!question || !question.trim()) error('research: a question is required, e.g. gd research "Does X improve Y?"');
  const res = await runResearch(cwd, question, opts);
  return output(res, raw, `thread ${res.threadId}: ${res.status} (${res.iterations} iters)\n`);
}

async function cmdResearchResume(cwd: string, id: string, opts: ResearchOptions, raw: boolean): Promise<never> {
  if (!id) error('research resume: a thread id is required');
  try { loadThread(cwd, id); } catch { error(`research resume: thread "${id}" not found`); }
  const res = await resumeResearch(cwd, id, opts);
  return output(res, raw, `thread ${res.threadId}: ${res.status} (${res.iterations} iters)\n`);
}

function cmdResearchStatus(cwd: string, id: string | undefined, raw: boolean): never {
  if (id) {
    let t;
    try { t = loadThread(cwd, id); } catch { return error(`research status: thread "${id}" not found`); }
    return output(t, raw, `${t.id}: ${t.status} iter ${t.iteration}/${t.maxIterations}\n`);
  }
  const threads = listThreads(cwd).map((t: { id: string; question: string; status: string; iteration: number }) =>
    ({ id: t.id, question: t.question, status: t.status, iteration: t.iteration }));
  return output({ threads }, raw, threads.map((t: { id: string; status: string; question: string }) => `${t.id}\t${t.status}\t${t.question}`).join('\n') + '\n');
}

module.exports = { cmdResearchStart, cmdResearchResume, cmdResearchStatus };
