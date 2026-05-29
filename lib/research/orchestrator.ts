'use strict';
const fs = require('fs');
const path = require('path');
import type {
  ResearchThread, Hypothesis, Verdict, HypothesisStatus, Takeaway, ExperimentPlan, ThreadStatus,
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

const VERDICT_COUNTER: Record<Verdict, string> = {
  supported: 'research.hypotheses_supported',
  refuted: 'research.hypotheses_refuted',
  inconclusive: 'research.hypotheses_inconclusive',
};

// The Claude scheduler runs with --output-format json, so stdout is an envelope
// like {"result":"<agent text>", ...}. Other backends emit raw text. Decode the
// result field when stdout is such an envelope; otherwise return it unchanged.
function decodeSpawnStdout(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const env = JSON.parse(trimmed) as { result?: unknown };
      if (typeof env.result === 'string') return env.result;
    } catch { /* not a JSON envelope — fall through */ }
  }
  return raw;
}

function readResearchGatesConfig(
  cwd: string,
): { research_gates?: { experiment_execution?: boolean; kg_write?: boolean } } {
  try {
    const raw = fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8');
    const cfg = JSON.parse(raw) as { research_gates?: { experiment_execution?: boolean; kg_write?: boolean } };
    return { research_gates: cfg.research_gates };
  } catch {
    return {};
  }
}

function defaultSpawn(cwd: string, config: Record<string, unknown>, model?: string): SpawnFn {
  const scheduler = createScheduler(
    (config as { scheduler?: unknown }).scheduler,
    (config as { superpowers?: unknown }).superpowers,
  );
  return async (prompt: string, agentType: string): Promise<string> => {
    if (!scheduler) throw new Error('no scheduler available for research loop');
    const r = await scheduler.spawn(prompt, { agentType, model, captureOutput: true, cwd });
    return decodeSpawnStdout(r.stdout || '');
  };
}

function verdictToStatus(v: Verdict): HypothesisStatus {
  return v === 'supported' ? 'supported' : v === 'refuted' ? 'refuted' : 'inconclusive';
}

function errExit(cwd: string, thread: ResearchThread): ResearchResult {
  thread.status = 'error'; saveThread(cwd, thread);
  return { threadId: thread.id, status: 'error', iterations: thread.iteration };
}

// Finding.md is already written before the kg_write gate; this completes the KG sync.
async function finishKgSync(
  cwd: string, thread: ResearchThread, verdict: Verdict | undefined, status: ThreadStatus,
): Promise<ResearchResult> {
  const sync = await syncFindingToKg(cwd, thread.id, findingPath(cwd, thread.id));
  writeKgProvenance(cwd, thread.id, { wrote: sync.synced ? [`finding:${thread.id}`] : [] });
  if (sync.synced) incrementCounter('research.kg_writes_total');
  thread.status = status; thread.pendingGate = null; saveThread(cwd, thread);
  return {
    threadId: thread.id, status, iterations: thread.iteration,
    verdict, findingPath: findingPath(cwd, thread.id),
  };
}

async function runLoop(
  cwd: string, thread: ResearchThread, opts: ResearchOptions,
  config: Record<string, unknown>, approved: { execute: boolean; kg_write: boolean },
): Promise<ResearchResult> {
  const runner: Runner = opts.runner || createSubprocessRunner({ timeoutMs: opts.timeout });
  const spawn: SpawnFn = opts.spawn || defaultSpawn(cwd, config, opts.model);

  for (;;) {
    const priorHyps: Hypothesis[] = readLedger(cwd, thread.id);
    const iterRel = path.join('experiments', String(thread.iteration));
    const iterDir = path.join(threadDir(cwd, thread.id), iterRel);
    const planFile = path.join(iterDir, 'plan.json');
    const resumable = priorHyps.find((h) => h.iteration === thread.iteration && h.status === 'testing');

    let hyp: Hypothesis;
    let plan: ExperimentPlan;

    if (approved.execute && resumable && fs.existsSync(planFile)) {
      // RESUME after execute-gate approval: reuse the reviewed hypothesis + plan.
      hyp = resumable;
      plan = JSON.parse(fs.readFileSync(planFile, 'utf8')) as ExperimentPlan;
      approved.execute = false;
    } else {
      const seededHyp = priorHyps.find(
        (h) => h.iteration === thread.iteration && h.origin === 'synthesis'
          && h.verdict === null && h.status === 'testing',
      );
      if (seededHyp && thread.currentStation === 'seed' && thread.pendingGate === null) {
        // SEEDED: adopt the pre-seeded synthesis hypothesis; skip the cold grd-hypothesizer
        // spawn. It is already in the ledger — do NOT append it again.
        hyp = seededHyp;
      } else {
        // HYPOTHESIZE (cold)
        const lastHyp = priorHyps[priorHyps.length - 1] || null;
        const priorVerdict: Verdict | null = lastHyp ? lastHyp.verdict : null;
        thread.currentStation = 'hypothesize'; saveThread(cwd, thread);
        const priorTakeaways = readTakeaways(cwd, thread.id);
        const hOut = await spawn(buildHypothesizePrompt(thread, priorHyps, priorVerdict, priorTakeaways), 'grd-hypothesizer');
        const parsed = parseHypothesisOutput(hOut);
        if (!parsed) return errExit(cwd, thread);
        hyp = {
          id: nextHypothesisId(priorHyps), iteration: thread.iteration,
          statement: parsed.statement, rationale: parsed.rationale, predictedOutcome: parsed.predictedOutcome,
          status: 'testing', parentId: lastHyp ? lastHyp.id : null, verdict: null,
        };
        appendHypothesis(cwd, thread.id, hyp);
      }

      // DESIGN
      thread.currentStation = 'design'; saveThread(cwd, thread);
      fs.mkdirSync(iterDir, { recursive: true });
      const pOut = await spawn(buildExperimentPrompt(thread, hyp, iterDir), 'grd-experiment-runner');
      const parsedPlan = parsePlanOutput(pOut);
      if (!parsedPlan) return errExit(cwd, thread);
      plan = parsedPlan as ExperimentPlan;
      fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));

      // GATE 1 — execute
      const g1 = checkGate(thread, 'execute', approved.execute);
      approved.execute = false;
      if (!g1.proceed) {
        Object.assign(thread, g1.thread); thread.currentStation = 'run'; saveThread(cwd, thread);
        incrementCounter('research.gate_pauses_total');
        return { threadId: thread.id, status: 'paused', iterations: thread.iteration, paused: true, pendingGate: 'execute' };
      }
    }

    // RUN
    thread.currentStation = 'run'; thread.budgetUsed += 1; saveThread(cwd, thread);
    const result = runner.run(plan, threadDir(cwd, thread.id));
    fs.writeFileSync(path.join(iterDir, 'result.json'), JSON.stringify(result, null, 2));

    // MEASURE
    thread.currentStation = 'measure'; saveThread(cwd, thread);
    const outcome = evaluateVerdict(plan, result);
    updateHypothesisStatus(cwd, thread.id, hyp.id, verdictToStatus(outcome.verdict), outcome.verdict);
    incrementCounter(VERDICT_COUNTER[outcome.verdict as Verdict]);

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
      // FINALIZE — set the terminal verdict, then write the finding before the kg_write gate.
      thread.currentStation = 'finalize';
      thread.status = term.status;
      const finding = buildFinding(thread, readLedger(cwd, thread.id), readTakeaways(cwd, thread.id), result);
      writeFinding(cwd, thread.id, finding);

      // GATE 2 — kg_write
      const g2 = checkGate(thread, 'kg_write', approved.kg_write);
      if (!g2.proceed) {
        Object.assign(thread, g2.thread); thread.currentStation = 'persist'; saveThread(cwd, thread);
        incrementCounter('research.gate_pauses_total');
        return { threadId: thread.id, status: 'paused', iterations: thread.iteration, paused: true, pendingGate: 'kg_write' };
      }
      return await finishKgSync(cwd, thread, outcome.verdict, term.status);
    }

    thread.iteration += 1; thread.status = 'active'; saveThread(cwd, thread);
  }
}

async function runResearch(cwd: string, question: string, opts: ResearchOptions = {}): Promise<ResearchResult> {
  const config = loadConfig(cwd);
  const gates = resolveGates(readResearchGatesConfig(cwd), opts.noGates === true);
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
  const TERMINAL = new Set(['supported', 'exhausted', 'abandoned']);
  if (TERMINAL.has(thread.status)) {
    // Already finished — nothing to resume; return the thread unchanged (no re-run).
    return {
      threadId: thread.id, status: thread.status, iterations: thread.iteration,
      findingPath: findingPath(cwd, thread.id),
    };
  }
  if (opts.noGates) {
    thread.gates = { execute: false, kg_write: false };
  }
  const pending = thread.pendingGate;
  thread.pendingGate = null; thread.status = 'active'; saveThread(cwd, thread);
  if (pending === 'kg_write') {
    // Finding.md already written before the pause; just complete the KG sync.
    const led: Hypothesis[] = readLedger(cwd, thread.id);
    const supported = led.some((h) => h.status === 'supported');
    const status: ThreadStatus = supported ? 'supported' : 'exhausted';
    const verdict: Verdict | undefined = supported ? 'supported' : undefined;
    return await finishKgSync(cwd, thread, verdict, status);
  }
  return runLoop(cwd, thread, opts, config, { execute: pending === 'execute', kg_write: false });
}

module.exports = {
  runResearch, resumeResearch, defaultSpawn, verdictToStatus,
  decodeSpawnStdout, readResearchGatesConfig,
};
