'use strict';
const fs = require('fs');
const path = require('path');
import type {
  ResearchThread, Hypothesis, Verdict, HypothesisStatus, Takeaway,
} from './types';
import type { Runner } from './runner';

const { loadConfig } = require('./../utils') as { loadConfig: (cwd: string) => Record<string, unknown> };
const { incrementCounter } = require('./../metrics') as { incrementCounter: (n: string, d?: number) => void };
const { createScheduler } = require('./../scheduler') as {
  createScheduler: (s: unknown, sp?: unknown) => { spawn: (p: string, o: Record<string, unknown>) => Promise<{ stdout?: string }> } | null;
};
const { createThread, loadThread, saveThread, threadDir } = require('./thread');
const { resolveGates, checkGate } = require('./gates');
const { readLedger, appendHypothesis, updateHypothesisStatus, nextHypothesisId } = require('./ledger');
const { appendTakeaway, readTakeaways } = require('./takeaways');
const { evaluateVerdict, decideBranch, shouldTerminate } = require('./verdict');
const { buildFinding, writeFinding, findingPath } = require('./finding');
const { syncFindingToKg, writeKgProvenance } = require('./kg');
const { buildHypothesizePrompt, buildExperimentPrompt, buildLearnPrompt } = require('./_prompts');
const { parseHypothesisOutput, parsePlanOutput, parseTakeawayOutput } = require('./agent-io');
const { createSubprocessRunner } = require('./runner');

export type SpawnFn = (prompt: string, agentType: string) => Promise<string>;

export interface ResearchOptions {
  maxIterations?: number;
  noGates?: boolean;
  model?: string;
  timeout?: number;
  spawn?: SpawnFn;
  runner?: Runner;
}

export interface ResearchResult {
  threadId: string;
  status: ResearchThread['status'];
  iterations: number;
  verdict?: Verdict;
  findingPath?: string;
  paused?: boolean;
  pendingGate?: 'execute' | 'kg_write';
}

function defaultSpawn(cwd: string, config: Record<string, unknown>, model?: string): SpawnFn {
  const scheduler = createScheduler(
    (config as { scheduler?: unknown }).scheduler,
    (config as { superpowers?: unknown }).superpowers,
  );
  return async (prompt: string, agentType: string): Promise<string> => {
    if (!scheduler) throw new Error('no scheduler available for research loop');
    const r = await scheduler.spawn(prompt, { agentType, model, captureOutput: true, cwd });
    return r.stdout || '';
  };
}

function verdictToStatus(v: Verdict): HypothesisStatus {
  return v === 'supported' ? 'supported' : v === 'refuted' ? 'refuted' : 'inconclusive';
}

function errExit(cwd: string, thread: ResearchThread): ResearchResult {
  thread.status = 'error'; saveThread(cwd, thread);
  return { threadId: thread.id, status: 'error', iterations: thread.iteration };
}

async function runLoop(
  cwd: string, thread: ResearchThread, opts: ResearchOptions,
  config: Record<string, unknown>, approved: { execute: boolean; kg_write: boolean },
): Promise<ResearchResult> {
  const runner: Runner = opts.runner || createSubprocessRunner({ timeoutMs: opts.timeout });
  const spawn: SpawnFn = opts.spawn || defaultSpawn(cwd, config, opts.model);

  while (true) {
    const priorHyps: Hypothesis[] = readLedger(cwd, thread.id);
    const lastHyp = priorHyps[priorHyps.length - 1] || null;
    const priorVerdict: Verdict | null = lastHyp ? lastHyp.verdict : null;

    // HYPOTHESIZE
    thread.currentStation = 'hypothesize'; saveThread(cwd, thread);
    const hOut = await spawn(buildHypothesizePrompt(thread, priorHyps, priorVerdict), 'grd-hypothesizer');
    const parsed = parseHypothesisOutput(hOut);
    if (!parsed) return errExit(cwd, thread);
    const hyp: Hypothesis = {
      id: nextHypothesisId(priorHyps), iteration: thread.iteration,
      statement: parsed.statement, rationale: parsed.rationale, predictedOutcome: parsed.predictedOutcome,
      status: 'testing', parentId: lastHyp ? lastHyp.id : null, verdict: null,
    };
    appendHypothesis(cwd, thread.id, hyp);

    // DESIGN
    thread.currentStation = 'design'; saveThread(cwd, thread);
    const iterRel = path.join('experiments', String(thread.iteration));
    fs.mkdirSync(path.join(threadDir(cwd, thread.id), iterRel), { recursive: true });
    const pOut = await spawn(buildExperimentPrompt(thread, hyp, iterRel), 'grd-experiment-runner');
    const plan = parsePlanOutput(pOut);
    if (!plan) return errExit(cwd, thread);

    // GATE 1 — execute
    const g1 = checkGate(thread, 'execute', approved.execute);
    approved.execute = false;
    if (!g1.proceed) {
      Object.assign(thread, g1.thread); thread.currentStation = 'run'; saveThread(cwd, thread);
      incrementCounter('research.gate_pauses_total');
      return { threadId: thread.id, status: 'paused', iterations: thread.iteration, paused: true, pendingGate: 'execute' };
    }

    // RUN
    thread.currentStation = 'run'; thread.budgetUsed += 1; saveThread(cwd, thread);
    const result = runner.run(plan as never, threadDir(cwd, thread.id));
    fs.writeFileSync(path.join(threadDir(cwd, thread.id), iterRel, 'result.json'), JSON.stringify(result, null, 2));

    // MEASURE
    thread.currentStation = 'measure'; saveThread(cwd, thread);
    const outcome = evaluateVerdict(plan as never, result);
    updateHypothesisStatus(cwd, thread.id, hyp.id, verdictToStatus(outcome.verdict), outcome.verdict);
    incrementCounter(outcome.verdict === 'supported' ? 'research.hypotheses_supported' : 'research.hypotheses_refuted');

    // LEARN
    thread.currentStation = 'learn'; saveThread(cwd, thread);
    const tOut = await spawn(buildLearnPrompt(thread, hyp, result, outcome.verdict), 'grd-knowledge-miner');
    const tk = parseTakeawayOutput(tOut);
    const takeaway: Takeaway = {
      kind: (tk?.kind as Takeaway['kind']) || 'domain_fact',
      content: tk?.content || outcome.detail,
      confidence: tk?.confidence ?? 0.4,
      evidence: tk?.evidence || outcome.detail,
      failureClass: (tk?.failureClass as Takeaway['failureClass']) || result.failureClass,
      iteration: thread.iteration,
    };
    appendTakeaway(cwd, thread.id, takeaway);

    // DECIDE + terminate
    const term = shouldTerminate(thread, outcome.verdict);
    const branch = decideBranch(outcome.verdict);
    incrementCounter('research.iterations_total');

    if (term.done || branch === 'finalize') {
      // FINALIZE
      thread.currentStation = 'finalize';
      const finding = buildFinding(thread, readLedger(cwd, thread.id), readTakeaways(cwd, thread.id), result);
      writeFinding(cwd, thread.id, finding);

      // GATE 2 — kg_write
      const g2 = checkGate(thread, 'kg_write', approved.kg_write);
      if (!g2.proceed) {
        Object.assign(thread, g2.thread); thread.currentStation = 'persist'; saveThread(cwd, thread);
        incrementCounter('research.gate_pauses_total');
        return { threadId: thread.id, status: 'paused', iterations: thread.iteration, paused: true, pendingGate: 'kg_write' };
      }
      const sync = syncFindingToKg(cwd, thread.id, findingPath(cwd, thread.id));
      writeKgProvenance(cwd, thread.id, { wrote: sync.synced ? [`finding:${thread.id}`] : [] });
      if (sync.synced) incrementCounter('research.kg_writes_total');

      thread.status = term.status; saveThread(cwd, thread);
      return {
        threadId: thread.id, status: term.status, iterations: thread.iteration,
        verdict: outcome.verdict, findingPath: findingPath(cwd, thread.id),
      };
    }

    thread.iteration += 1; thread.status = 'active'; saveThread(cwd, thread);
  }
}

async function runResearch(cwd: string, question: string, opts: ResearchOptions = {}): Promise<ResearchResult> {
  const config = loadConfig(cwd);
  const gates = resolveGates(config, opts.noGates === true);
  const thread = createThread(cwd, question, {
    maxIterations: opts.maxIterations, gates,
    modelProfile: String((config as { model_profile?: string }).model_profile || 'balanced'),
    tokenProfile: String((config as { token_profile?: string }).token_profile || 'balanced'),
  });
  return runLoop(cwd, thread, opts, config, { execute: false, kg_write: false });
}

async function resumeResearch(cwd: string, id: string, opts: ResearchOptions = {}): Promise<ResearchResult> {
  const config = loadConfig(cwd);
  const thread = loadThread(cwd, id);
  const pending = thread.pendingGate;
  thread.pendingGate = null; thread.status = 'active'; saveThread(cwd, thread);
  return runLoop(cwd, thread, opts, config, {
    execute: pending === 'execute', kg_write: pending === 'kg_write',
  });
}

module.exports = { runResearch, resumeResearch, defaultSpawn, verdictToStatus };
