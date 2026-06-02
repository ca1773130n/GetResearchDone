'use strict';
const fs = require('fs');
const path = require('path');
import type {
  ResearchThread, Hypothesis, Verdict, HypothesisStatus, Takeaway, ExperimentPlan, ThreadStatus,
  ExperimentResult, MeasureOutcome,
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
const { evaluateVerdict, decideBranch, shouldTerminate, detectPlateau } = require('./verdict');
const { buildFinding, writeFinding, findingPath } = require('./finding');
const { syncFindingToKg, writeKgProvenance } = require('./kg');
const { buildHypothesizePrompt, buildExperimentPrompt, buildLearnPrompt } = require('./_prompts');
const { parseHypothesisOutput, parsePlanOutput, parseTakeawayOutput } = require('./agent-io') as {
  parseHypothesisOutput: (stdout: string) => { statement: string; rationale: string; predictedOutcome: string } | null;
  parsePlanOutput: (stdout: string) => { procedure: string; metricKey: string; comparator: string; target: number; language: string; scriptPath: string } | null;
  parseTakeawayOutput: (stdout: string) => Record<string, unknown> | null;
};
const { selectRunner } = require('./docker-runner') as {
  selectRunner: (cwd: string, opts?: { timeoutMs?: number }) => Runner;
};
const { promoteThreadKnowledge } = require('./promote') as {
  promoteThreadKnowledge: (
    cwd: string, thread: ResearchThread, takeaways: Takeaway[], ledger: Hypothesis[],
    opts: { iso: string },
  ) => { knowhowAdded: number; deadEndsAdded: number; skipped: boolean };
};
const { readEvalReportConfig, maybeRunEvalReport } = require('./eval') as {
  readEvalReportConfig: (cwd: string) => boolean;
  maybeRunEvalReport: (
    cwd: string, thread: ResearchThread, plan: ExperimentPlan, result: ExperimentResult,
    outcome: MeasureOutcome, deps: { spawn: SpawnFn },
  ) => Promise<{ wrote: boolean }>;
};
const { retrieve, buildGroundingPack } = require('./retrieve') as {
  retrieve: (cwd: string, query: string, opts?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>>; modes: Record<string, boolean>; detail: string }>;
  buildGroundingPack: (results: Array<Record<string, unknown>>, query: string) => string;
};
const { defaultEmbedder } = require('./embedder') as { defaultEmbedder: () => (texts: string[]) => Promise<number[][] | null> };
const { ingest } = require('./ingest') as { ingest: (cwd: string, inputPath: string) => Promise<{ status: string; files: number; detail: string }> };
const { fetchSource } = require('./fetch') as { fetchSource: (cwd: string, input: string, opts?: Record<string, unknown>) => Promise<{ filePath: string }> };

export type SpawnFn = (prompt: string, agentType: string) => Promise<string>;

export interface ResearchOptions {
  maxIterations?: number;
  noGates?: boolean;
  model?: string;
  timeout?: number;
  spawn?: SpawnFn;
  runner?: Runner;
  retrieve?: (cwd: string, query: string, opts?: Record<string, unknown>) => Promise<{ results: Array<Record<string, unknown>>; modes: Record<string, boolean>; detail: string }>;
  resurveyFetch?: (cwd: string, thread: ResearchThread, deps: { spawn: SpawnFn }) => Promise<void>;
  kgClient?: import('./tesserae').TesseraeClient;
}

export interface ResearchResult {
  threadId: string;
  status: ResearchThread['status'];
  iterations: number;
  verdict?: Verdict;
  findingPath?: string;
  paused?: boolean;
  pendingGate?: 'execute' | 'kg_write';
  errorReason?: string;
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
  // Claude Code `--verbose --output-format json` emits a JSON array of events
  // ([system, rate_limit_event?, assistant…, result]). Extract the result text,
  // falling back to concatenated assistant content.
  if (trimmed.startsWith('[')) {
    try {
      const events = JSON.parse(trimmed) as Array<Record<string, unknown>>;
      const resultEv = events.find((e) => e && e.type === 'result');
      if (resultEv && typeof resultEv.result === 'string') return resultEv.result;
      const asst = events
        .filter((e) => e && e.type === 'assistant')
        .map((e) => {
          const m = e.message as { content?: Array<{ text?: string }> } | undefined;
          return (m?.content || []).map((c) => c.text || '').join('');
        })
        .join('');
      if (asst) return asst;
    } catch { /* not a JSON event array — fall through */ }
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

/** Read the raw top-level plateau re-survey config keys (loadConfig drops unknown keys). */
function readResurveyConfig(cwd: string): { cap: number; window: number; fetch: boolean } {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_max_resurveys?: unknown; research_plateau_window?: unknown; research_resurvey_fetch?: unknown;
    };
    const capN = Number(raw.research_max_resurveys);
    const winN = Number(raw.research_plateau_window);
    return {
      // cap: clamp a present value to >= 0 (0 = disabled); absent/non-numeric → default 2.
      cap: raw.research_max_resurveys !== undefined && Number.isFinite(capN) ? Math.max(0, Math.trunc(capN)) : 2,
      // window: must be >= 1; a present-but-invalid value (0/negative) → default 3.
      window: Number.isFinite(winN) && winN > 0 ? Math.trunc(winN) : 3,
      fetch: raw.research_resurvey_fetch === true,
    };
  } catch {
    return { cap: 2, window: 3, fetch: false };
  }
}

/** Plateau fetch path: spawn grd-surveyor for new sources, ingest up to 3. Fully tolerant. */
async function defaultResurveyFetch(cwd: string, thread: ResearchThread, deps: { spawn: SpawnFn }): Promise<void> {
  try {
    const out = await deps.spawn(`You are grd-surveyor. Find up to 3 NEW sources (arXiv ids or http(s) URLs) most relevant to: "${thread.question}". Emit exactly one final block:\n__SOURCES__\n<one arxiv id or url per line>`, 'grd-surveyor');
    const idx = out.indexOf('__SOURCES__');
    if (idx === -1) return;
    const sources = out.slice(idx + '__SOURCES__'.length).split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 3);
    for (const src of sources) {
      try { const f = await fetchSource(cwd, src); await ingest(cwd, f.filePath); } catch { /* skip this source */ }
    }
  } catch { /* surveyor unavailable → degrade */ }
}

function defaultSpawn(cwd: string, config: Record<string, unknown>, model?: string): SpawnFn {
  const scheduler = createScheduler(
    (config as { scheduler?: unknown }).scheduler,
    (config as { superpowers?: unknown }).superpowers,
  );
  return async (prompt: string, agentType: string): Promise<string> => {
    if (!scheduler) {
      throw new Error(
        'no scheduler configured for the research loop — run `/grd:init`, or add a '
        + '`scheduler` block to .planning/config.json '
        + '(see docs/autoresearch-tutorial.md#prerequisites)',
      );
    }
    const r = await scheduler.spawn(prompt, { agentType, model, captureOutput: true, cwd });
    return decodeSpawnResult(r, agentType);
  };
}

/**
 * Turn a scheduler spawn result into agent text — but THROW on a nonzero exit
 * (a backend CLI crash, or the scheduler coercing nonzero after exhausting
 * rate-limit rotation), so the loop's retry helper never re-spawns a hard
 * failure as a "transient empty". The message reports the exit code + a stderr
 * excerpt (no rate-limit over-attribution — a nonzero exit is not necessarily a
 * rate limit).
 */
function decodeSpawnResult(r: { exitCode?: number; stdout?: string; stderr?: string }, agentType: string): string {
  if (typeof r.exitCode === 'number' && r.exitCode !== 0) {
    const err = excerpt(r.stderr || '');
    throw new Error(
      `${agentType} backend spawn failed (exit ${r.exitCode})${err !== '(empty)' ? ` — ${err}` : ''}`,
    );
  }
  return decodeSpawnStdout(r.stdout || '');
}

/**
 * Spawn an agent and parse its output, retrying on a null parse (empty /
 * non-block / transient response) up to `retries` times before giving up. A
 * thrown spawn (hard scheduler failure) propagates immediately — only parse
 * failures are retried. `beforeAttempt` runs before each spawn (DESIGN uses it
 * to clear stale generated artifacts so a failed attempt can't leave a runnable
 * script behind).
 */
async function spawnAndParse<T>(
  spawn: SpawnFn,
  prompt: string,
  agentType: string,
  parse: (stdout: string) => T | null,
  retries: number,
  beforeAttempt?: () => void,
): Promise<{ value: T | null; lastRaw: string; error?: string }> {
  let lastRaw = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (beforeAttempt) beforeAttempt();
    try {
      lastRaw = await spawn(prompt, agentType);
    } catch (e) {
      // Hard spawn failure (backend crash / nonzero exit / no scheduler). Do NOT
      // retry (preserves the no-amplification guarantee); surface for a clean
      // errExit instead of bubbling an uncaught stack trace.
      return { value: null, lastRaw: '', error: e instanceof Error ? e.message : String(e) };
    }
    const value = parse(lastRaw);
    if (value) return { value, lastRaw };
  }
  return { value: null, lastRaw };
}

/** Read research_spawn_retries (default 2, clamp [0,5]); non-number → default. */
function readSpawnRetries(cwd: string): number {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_spawn_retries?: unknown;
    };
    const n = raw.research_spawn_retries;
    if (typeof n !== 'number' || !Number.isFinite(n)) return 2;
    return Math.min(5, Math.max(0, Math.trunc(n)));
  } catch {
    return 2;
  }
}

function verdictToStatus(v: Verdict): HypothesisStatus {
  return v === 'supported' ? 'supported' : v === 'refuted' ? 'refuted' : 'inconclusive';
}

/** Coerce + bound any spawn output to a short, single-line excerpt for diagnostics. */
function excerpt(s: unknown): string {
  return String(s ?? '').slice(0, 2000).replace(/\s+/g, ' ').trim().slice(0, 280) || '(empty)';
}

function errExit(cwd: string, thread: ResearchThread, reason: string): ResearchResult {
  thread.status = 'error'; thread.errorReason = reason; saveThread(cwd, thread);
  return { threadId: thread.id, status: 'error', iterations: thread.iteration, errorReason: reason };
}

// Finding.md is already written before the kg_write gate; this completes the KG sync.
async function finishKgSync(
  cwd: string, thread: ResearchThread, verdict: Verdict | undefined, status: ThreadStatus,
  kgClient?: import('./tesserae').TesseraeClient,
): Promise<ResearchResult> {
  const sync = await syncFindingToKg(cwd, thread.id, findingPath(cwd, thread.id), { client: kgClient });
  writeKgProvenance(cwd, thread.id, { wrote: sync.synced ? [`finding:${thread.id}`] : [] });
  if (sync.synced) incrementCounter('research.kg_writes_total');
  // Promote takeaways → shared KB (KNOWHOW.md + DEAD-ENDS.md). Gated + degrade-safe.
  // Lives here (the single PERSIST chokepoint) so both the runLoop finalize path
  // and the resumeResearch kg_write-resume path promote after the gate.
  promoteThreadKnowledge(cwd, thread,
    readTakeaways(cwd, thread.id), readLedger(cwd, thread.id),
    { iso: new Date().toISOString() });
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
  const runner: Runner = opts.runner || selectRunner(cwd, { timeoutMs: opts.timeout });
  const spawn: SpawnFn = opts.spawn || defaultSpawn(cwd, config, opts.model);
  const retrieveFn = opts.retrieve || ((c: string, q: string, o?: Record<string, unknown>) => retrieve(c, q, { embedder: defaultEmbedder(), ...(o || {}) }));
  const spawnRetries = readSpawnRetries(cwd);

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
      } else if (resumable && !fs.existsSync(planFile)) {
        // CRASH RECOVERY: a hypothesis exists for this iteration but DESIGN never
        // produced a plan (crashed after HYPOTHESIZE). Reuse it and re-run DESIGN
        // instead of orphaning it with a fresh one. The `!planFile` guard confines
        // this to the no-plan case, so it can never re-design a started experiment.
        hyp = resumable;
      } else {
        // HYPOTHESIZE (cold)
        const lastHyp = priorHyps[priorHyps.length - 1] || null;
        const priorVerdict: Verdict | null = lastHyp ? lastHyp.verdict : null;
        thread.currentStation = 'hypothesize'; saveThread(cwd, thread);
        const priorTakeaways = readTakeaways(cwd, thread.id);
        const pivot = thread.pendingPivot === true;
        if (pivot) { thread.pendingPivot = false; saveThread(cwd, thread); }
        const groundQuery = pivot
          ? [thread.question, ...priorTakeaways.map((t: Takeaway) => t.content)].join(' ')
          : thread.question;
        let pack = '';
        try {
          const r = await retrieveFn(cwd, groundQuery, pivot ? { k: 16 } : undefined);
          pack = buildGroundingPack(r.results, thread.question);
        } catch { /* degrade */ }
        const hRes = await spawnAndParse(
          spawn, buildHypothesizePrompt(thread, priorHyps, priorVerdict, priorTakeaways, pack, pivot),
          'grd-hypothesizer', parseHypothesisOutput, spawnRetries,
        );
        const parsed = hRes.value;
        if (!parsed) return errExit(cwd, thread, hRes.error
          ? `hypothesizer spawn failed: ${hRes.error}`
          : `hypothesizer output not parseable — expected a __HYPOTHESIS__ block. Got: ${excerpt(hRes.lastRaw)}`);
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
      const pRes = await spawnAndParse(
        spawn, buildExperimentPrompt(thread, hyp, iterDir), 'grd-experiment-runner',
        parsePlanOutput, spawnRetries,
        // Clear stale generated artifacts before each attempt so a failed attempt
        // can't leave a runnable script behind (the runner executes scriptPath).
        () => { for (const f of ['run.sh', 'run.py', 'PLAN.md']) { try { fs.rmSync(path.join(iterDir, f)); } catch { /* absent */ } } },
      );
      const parsedPlan = pRes.value;
      if (!parsedPlan) return errExit(cwd, thread, pRes.error
        ? `experiment-runner spawn failed: ${pRes.error}`
        : `experiment-runner output not parseable — expected a __PLAN__ block. Got: ${excerpt(pRes.lastRaw)}`);
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
      content: (tk?.content as string) || outcome.detail,
      confidence: (tk?.confidence as number) ?? 0.4,
      evidence: (tk?.evidence as string) || outcome.detail,
      failureClass: (tk?.failureClass as Takeaway['failureClass']) || result.failureClass,
      iteration: thread.iteration,
    };
    appendTakeaway(cwd, thread.id, takeaway);

    // RE-SURVEY on plateau: broaden + pivot the next hypothesis instead of drifting to exhausted.
    const { cap, window, fetch: resurveyFetchOn } = readResurveyConfig(cwd);
    const completed = readLedger(cwd, thread.id).filter((h: Hypothesis) => h.verdict !== null).map((h: Hypothesis) => h.verdict as Verdict);
    if (outcome.verdict !== 'supported' && (thread.resurveyCount ?? 0) < cap && detectPlateau(completed, window)) {
      thread.resurveyCount = (thread.resurveyCount ?? 0) + 1;
      thread.pendingPivot = true;
      thread.maxIterations += window;
      incrementCounter('research.resurveys_total');
      saveThread(cwd, thread);
      if (resurveyFetchOn) {
        const fetchFn = opts.resurveyFetch || defaultResurveyFetch;
        try { await fetchFn(cwd, thread, { spawn }); } catch { /* degrade */ }
      }
    }

    // DECIDE + terminate
    const term = shouldTerminate(thread, outcome.verdict);
    const branch = decideBranch(outcome.verdict);
    incrementCounter('research.iterations_total');

    // OPTIONAL eval-report augmentation (opt-in). term/branch are already computed
    // and are NOT read back; this only writes a human-facing EVAL.md, degrade-safe.
    if (readEvalReportConfig(cwd)) {
      await maybeRunEvalReport(cwd, thread, plan, result, outcome, { spawn });
    }

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
      return await finishKgSync(cwd, thread, outcome.verdict, term.status, opts.kgClient);
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
    return await finishKgSync(cwd, thread, verdict, status, opts.kgClient);
  }
  return runLoop(cwd, thread, opts, config, { execute: pending === 'execute', kg_write: false });
}

module.exports = {
  runResearch, resumeResearch, defaultSpawn, verdictToStatus,
  decodeSpawnStdout, decodeSpawnResult, spawnAndParse, readSpawnRetries,
  readResearchGatesConfig, readResurveyConfig,
};
