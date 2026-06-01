'use strict';
const fs = require('fs');
const path = require('path');
import type { ExperimentPlan, ExperimentResult, MeasureOutcome, ResearchThread } from './types';
const { atomicWriteFileSync } = require('../autopilot-waves') as {
  atomicWriteFileSync: (filePath: string, data: string) => void;
};

type SpawnFn = (prompt: string, agentType: string) => Promise<string>;

function readEvalReportConfig(cwd: string): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_eval_report?: unknown;
    };
    return raw.research_eval_report === true;
  } catch {
    return false;
  }
}

function parseEvalReport(stdout: string): string | null {
  const start = stdout.indexOf('__EVAL__');
  if (start === -1) return null;
  const end = stdout.indexOf('__END_EVAL__', start + '__EVAL__'.length);
  if (end === -1) return null;
  const body = stdout.slice(start + '__EVAL__'.length, end).trim();
  return body || null;
}

function readPriorMetrics(
  cwd: string, threadId: string, iteration: number,
): { iteration: number; metrics: Record<string, number> } | null {
  if (iteration <= 0) return null;
  const prev = iteration - 1;
  try {
    const p = path.join(cwd, '.planning/research/threads', threadId, 'experiments', String(prev), 'result.json');
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as { metrics?: Record<string, number> };
    if (!parsed.metrics || typeof parsed.metrics !== 'object') return null;
    return { iteration: prev, metrics: parsed.metrics };
  } catch {
    return null;
  }
}

function buildEvalPrompt(
  thread: ResearchThread & { question?: string }, plan: ExperimentPlan, result: ExperimentResult,
  outcome: MeasureOutcome, prior: { iteration: number; metrics: Record<string, number> } | null,
): string {
  const priorLine = prior
    ? `Previous iteration (${prior.iteration}) metrics: ${JSON.stringify(prior.metrics)}`
    : 'No prior comparable metric (this is the first iteration or the prior result is unavailable).';
  return [
    'You are evaluating ONE already-completed experiment from a research loop.',
    'The experiment has ALREADY run; report on the supplied numbers and do NOT re-run or recompute anything.',
    '',
    `Question: ${thread.question || ''}`,
    `Iteration: ${thread.iteration}`,
    `Decision metric: ${plan.metricKey} ${plan.comparator} ${plan.target}`,
    `Deterministic verdict (AUTHORITATIVE — contextualize, never override): ${outcome.verdict} (${outcome.detail})`,
    `All collected metrics: ${JSON.stringify(result.metrics)}`,
    `Run: exitCode=${result.exitCode} failureClass=${result.failureClass} script=${plan.scriptPath}`,
    priorLine,
    '',
    'When target is 0, report the absolute gap (percentage is undefined); respect the comparator direction.',
    'Emit EXACTLY ONE block and nothing after the closing marker:',
    '__EVAL__',
    `iteration=${thread.iteration} metric=${plan.metricKey} verdict=${outcome.verdict}`,
    '## Results',
    '| metric | value | target | gap |',
    '| --- | --- | --- | --- |',
    '... (one row per metric; decision metric first)',
    '## Delta vs previous iteration',
    '... (or "no prior comparable metric")',
    '## Reproducibility',
    '## Recommendation',
    '__END_EVAL__',
  ].join('\n');
}

module.exports = { readEvalReportConfig, parseEvalReport, readPriorMetrics, buildEvalPrompt };
