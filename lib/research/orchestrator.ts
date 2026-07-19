'use strict';
const fs = require('fs');
const path = require('path');
import type {
  ResearchThread, Hypothesis, Verdict, HypothesisStatus, Takeaway, ExperimentPlan, ThreadStatus,
  ExperimentResult, MeasureOutcome, Checkpoint, CheckpointAnswer, CheckpointPoint,
  InteractiveConfig, Comparator,
} from './types';
import type { Runner } from './runner';
import type { CheckpointHandler, ResolveInteractiveOpts } from './checkpoints';

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
const { scoreReconstructability } = require('./reconstructability') as {
  scoreReconstructability: (input: {
    script?: string | null; metricKey?: string | null; comparator?: string | null;
    target?: number | null; language?: string | null; runner?: string | null;
  }) => { score: number; checks: Record<string, boolean> };
};
const { syncFindingToKg, writeKgProvenance } = require('./kg');
const {
  emitCheckpoint, consumeAnswered, makeCheckpointId, resolveInteractive, readInteractiveConfig,
} = require('./checkpoints') as {
  emitCheckpoint: (
    cwd: string, thread: ResearchThread, ck: Checkpoint,
    deps?: { checkpointHandler?: CheckpointHandler; saveThread?: (c: string, t: ResearchThread) => void; incrementCounter?: (n: string, d?: number) => void },
  ) => Checkpoint;
  consumeAnswered: (
    resumedCheckpoint: Checkpoint | null | undefined, point: CheckpointPoint, iteration: number,
  ) => CheckpointAnswer[] | null;
  makeCheckpointId: (iteration: number, point: CheckpointPoint, round: number) => string;
  resolveInteractive: (cfg: InteractiveConfig, opts?: ResolveInteractiveOpts) => { active: boolean };
  readInteractiveConfig: (cwd: string) => InteractiveConfig;
};
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
  // v0.5.0 interactive steering — resume-with-answers plumbing. checkpointAnswers keys are
  // question ids → the chosen option label (+ optional freeform text). Never carries answer
  // text from argv (file/stdin only, R8). DORMANT emission-wise this phase.
  checkpointAnswers?: Record<string, { label: string; text?: string }>;
  // One-shot interactive override (enable/disable + optional per-point list). Consumed by the
  // DESIGN checkpoint site (Phase 102) — a per-point `points` list restricts which stations may
  // pause even when the underlying research_gates.interactive.<point> config flag is true.
  interactive?: { enabled?: boolean; points?: string[] };
  // Injected checkpoint pause/answer handler (mirrors spawn/runner DI) — tests supply a
  // deterministic non-pausing handler; default (undefined) pauses via checkpoints.ts.
  checkpointHandler?: CheckpointHandler;
}

export interface ResearchResult {
  threadId: string;
  status: ResearchThread['status'];
  iterations: number;
  verdict?: Verdict;
  findingPath?: string;
  paused?: boolean;
  pendingGate?: 'execute' | 'kg_write';
  // Set when a run pauses at an interactive checkpoint (Phase 102 emission). Present here so the
  // resume-with-answers plumbing has a stable return shape; unset on the pendingGate paths.
  pendingCheckpoint?: Checkpoint;
  errorReason?: string;
}

const VERDICT_COUNTER: Record<Verdict, string> = {
  supported: 'research.hypotheses_supported',
  refuted: 'research.hypotheses_refuted',
  inconclusive: 'research.hypotheses_inconclusive',
};

// The Claude scheduler runs with --output-format json, so stdout is an envelope
// like {"result":"<agent text>", ...}. Codex `exec --json` emits a JSONL event
// stream (one {"type":...} object per line — agent text lives in
// item.completed/agent_message events). Other backends emit raw text. Decode
// accordingly; otherwise return stdout unchanged.
function decodeSpawnStdout(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const env = JSON.parse(trimmed) as { result?: unknown };
      if (typeof env.result === 'string') return env.result;
    } catch {
      // Not a single JSON envelope — try codex exec JSONL: parse per line,
      // return the LAST agent_message text (the agent's final answer).
      const messages: string[] = [];
      for (const line of trimmed.split('\n')) {
        const l = line.trim();
        if (!l.startsWith('{')) continue;
        try {
          const ev = JSON.parse(l) as {
            type?: string;
            item?: { type?: string; text?: string };
          };
          if (ev.type === 'item.completed' && ev.item?.type === 'agent_message'
            && typeof ev.item.text === 'string') {
            messages.push(ev.item.text);
          }
        } catch { /* mixed non-JSON line — keep scanning */ }
      }
      if (messages.length > 0) return messages[messages.length - 1];
    }
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
    const r = await scheduler.spawn(prompt, { agentType, model, captureOutput: true, cwd, strictMcp: true });
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

/**
 * Read research_max_debug_depth (AI-Scientist-v2's max_debug_depth analog):
 * how many bounded fix-and-retry attempts the RUN stage gets when the experiment
 * script FAILS TO EXECUTE (nonzero exit / thrown runner — never a metric miss).
 * Default 0 = exactly prior behavior (no retries); clamp [0,5]; non-number → 0.
 */
function readDebugDepth(cwd: string): number {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8')) as {
      research_max_debug_depth?: unknown;
    };
    const n = raw.research_max_debug_depth;
    if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
    return Math.min(5, Math.max(0, Math.trunc(n)));
  } catch {
    return 0;
  }
}

function verdictToStatus(v: Verdict): HypothesisStatus {
  return v === 'supported' ? 'supported' : v === 'refuted' ? 'refuted' : 'inconclusive';
}

/** Coerce + bound any spawn output to a short, single-line excerpt for diagnostics. */
function excerpt(s: unknown): string {
  return String(s ?? '').slice(0, 2000).replace(/\s+/g, ' ').trim().slice(0, 280) || '(empty)';
}

/**
 * Invoke the runner, normalizing a THROWN runner (an infra exception — distinct
 * from the nonzero-exit failures runners already RETURN as results) into a
 * failing ExperimentResult so the bounded debug loop can retry it and MEASURE
 * can judge it inconclusive. Only called when research_max_debug_depth > 0 —
 * at depth 0 the runner is invoked directly and a throw propagates as before.
 */
function runCaught(runner: Runner, plan: ExperimentPlan, dir: string): ExperimentResult {
  try {
    return runner.run(plan, dir);
  } catch (e) {
    return {
      metrics: {},
      exitCode: 1,
      // ponytail: the runner kind is unknowable when run() itself throws — reported
      // as 'subprocess' (advisory metadata only); upgrade path: widen the union with
      // 'unknown' if a consumer ever branches on it.
      runner: 'subprocess',
      durationMs: 0,
      stdoutExcerpt: '',
      stderrExcerpt: (e instanceof Error ? e.message : String(e)).slice(0, 2000),
      failureClass: 'H4',
    };
  }
}

/**
 * DEBUG-mode experiment prompt for the bounded fix-and-retry: re-invokes the
 * experiment designer with the script-execution failure context (exit code,
 * failure class, stderr/stdout excerpts) so it can fix the script in place.
 * Same __PLAN__ output contract as buildExperimentPrompt.
 */
function buildDebugFixPrompt(
  hyp: Hypothesis, plan: ExperimentPlan, result: ExperimentResult,
  iterDir: string, attempt: number, maxDepth: number,
): string {
  return [
    'You are grd-experiment-runner in DEBUG mode. The experiment script you designed FAILED TO',
    'EXECUTE (a script/environment error — NOT a hypothesis verdict). Fix it and re-emit the plan.',
    '',
    `Hypothesis (${hyp.id}): ${hyp.statement}`,
    `Failing script: ${plan.scriptPath} (language: ${plan.language})`,
    `Metric contract: ${plan.metricKey} ${plan.comparator} ${plan.target}`,
    '',
    `Execution failure (debug attempt ${attempt} of ${maxDepth}):`,
    `- exit code: ${result.exitCode}`,
    `- failure class: ${result.failureClass}`,
    `- stderr: ${String(result.stderrExcerpt ?? '').slice(0, 2000) || '(empty)'}`,
    `- stdout: ${String(result.stdoutExcerpt ?? '').slice(0, 2000) || '(empty)'}`,
    '',
    `Fix the script under ${iterDir} so it executes cleanly, keeping the experiment minimal and`,
    'reproducible. The script MUST print its result as a final line:',
    '  __RESULT__ {"<metricKey>": <number>}',
    'Do NOT run the script yourself — the orchestrator re-runs it.',
    '',
    'Emit exactly one final block (scriptPath = the absolute path of the fixed script):',
    '__PLAN__',
    `{"procedure":"...","metricKey":"${plan.metricKey}","comparator":"${plan.comparator}","target":${plan.target},"language":"${plan.language}","scriptPath":"${plan.scriptPath}"}`,
  ].join('\n');
}

function errExit(cwd: string, thread: ResearchThread, reason: string): ResearchResult {
  thread.status = 'error'; thread.errorReason = reason; saveThread(cwd, thread);
  return { threadId: thread.id, status: 'error', iterations: thread.iteration, errorReason: reason };
}

// Cheap, deterministic structural reconstructability score appended to FINDING.md
// at FINALIZE. Advisory telemetry — never gates or changes the verdict. Reads the
// recorded script the same way the runner resolves it; degrades to absent on any
// read error so it can never break finalization.
function reconstructabilitySection(
  cwd: string, thread: ResearchThread, plan: ExperimentPlan, result: ExperimentResult,
): string {
  let script: string | null = null;
  try {
    const sp = path.isAbsolute(plan.scriptPath)
      ? plan.scriptPath : path.join(threadDir(cwd, thread.id), plan.scriptPath);
    script = fs.readFileSync(sp, 'utf8');
  } catch { /* artifact absent — script_present will be false */ }
  const recon = scoreReconstructability({
    script, metricKey: plan.metricKey, comparator: plan.comparator,
    target: plan.target, language: plan.language, runner: result.runner,
  });
  return [
    '## Reconstructability (advisory)',
    '',
    `- **score:** ${recon.score.toFixed(2)} _(structural completeness; does not affect the verdict)_`,
    ...Object.entries(recon.checks).map(([k, v]) => `- [${v ? 'x' : ' '}] ${k}`),
    '',
  ].join('\n');
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

/**
 * R4: apply whitelisted metric-contract edits carried in the design-approval checkpoint's
 * freeform Q2 answer text (one `key: value` pair per line; unknown keys ignored). Mutates
 * `plan` in place so the caller can persist it BEFORE the debug-loop `committed` pin is taken.
 */
function applyContractEditsFromFreeform(plan: ExperimentPlan, text: string): void {
  for (const rawLine of text.split('\n')) {
    const m = /^\s*(metricKey|comparator|target|language)\s*:\s*(.+?)\s*$/.exec(rawLine);
    if (!m) continue;
    const key = m[1] as 'metricKey' | 'comparator' | 'target' | 'language';
    const value = m[2];
    if (key === 'target') {
      const n = Number(value);
      if (Number.isFinite(n)) plan.target = n;
    } else if (key === 'comparator') {
      plan.comparator = value as Comparator;
    } else if (key === 'language') {
      plan.language = value as 'shell' | 'python';
    } else {
      plan.metricKey = value;
    }
  }
}

/** Build the Q1(approve/revise/abort)+Q2(freeform contract edit) design-approval checkpoint. */
function buildDesignCheckpoint(
  thread: ResearchThread, hyp: Hypothesis, plan: ExperimentPlan, round: number,
): Checkpoint {
  return {
    checkpoint_version: 1,
    id: makeCheckpointId(thread.iteration, 'design', round),
    point: 'design',
    type: 'approval',
    iteration: thread.iteration,
    round,
    createdAt: new Date().toISOString(),
    context: `${hyp.statement} — metric: ${plan.metricKey} ${plan.comparator} ${plan.target} `
      + `(${plan.language}); script: ${plan.scriptPath}`,
    questions: [
      {
        id: 'q1',
        ask: 'Approve this experiment plan and run it?',
        options: [
          { label: 'Approve & run', description: 'Proceed to RUN with this plan', recommended: true },
          { label: 'Revise the plan', description: 'Re-run DESIGN for a new plan' },
          { label: 'Abort this thread', description: 'Abandon this research thread' },
        ],
      },
      {
        id: 'q2',
        ask: 'Edit the metric contract? (metricKey/comparator/target/language — leave as-is to '
          + 'keep the shown values)',
        freeform: true,
        options: [
          { label: 'Keep as designed', description: 'No contract edits', recommended: true },
        ],
      },
    ],
  };
}

/** Resolve whether the DESIGN checkpoint is active for this iteration (R1: default-off, no unattended pause). */
function resolveDesignPosture(
  cwd: string, opts: ResearchOptions, config: Record<string, unknown>, thread: ResearchThread,
): { active: boolean; cfg: InteractiveConfig } {
  const baseCfg = readInteractiveConfig(cwd);
  const cfg: InteractiveConfig = opts.interactive?.enabled !== undefined
    ? { ...baseCfg, enabled: opts.interactive.enabled }
    : baseCfg;
  const posture = resolveInteractive(cfg, {
    noGates: opts.noGates,
    autonomousMode: Boolean((config as { autonomous_mode?: boolean }).autonomous_mode),
  });
  const designPointEnabled = opts.interactive?.points
    ? opts.interactive.points.includes('design')
    : cfg.design;
  const active = posture.active && designPointEnabled
    && (cfg.every_iteration || thread.iteration === 1);
  return { active, cfg };
}

async function runLoop(
  cwd: string, thread: ResearchThread, opts: ResearchOptions,
  config: Record<string, unknown>, approved: { execute: boolean; kg_write: boolean },
  // A resumed checkpoint's resolved answers, threaded in from resumeResearch's
  // resume-with-answers branch. Consumed one-shot (consumeAnswered) at the DESIGN station
  // (Phase 102) — approve/revise/abort resolution happens at the TOP of the loop body,
  // BEFORE any HYPOTHESIZE/DESIGN spawn (REQ-199: never re-derives on checkpoint resume).
  resumedCheckpoint?: Checkpoint,
): Promise<ResearchResult> {
  const runner: Runner = opts.runner || selectRunner(cwd, { timeoutMs: opts.timeout });
  const spawn: SpawnFn = opts.spawn || defaultSpawn(cwd, config, opts.model);
  const retrieveFn = opts.retrieve || ((c: string, q: string, o?: Record<string, unknown>) => retrieve(c, q, { embedder: defaultEmbedder(), ...(o || {}) }));
  const spawnRetries = readSpawnRetries(cwd);
  const debugDepth = readDebugDepth(cwd);

  for (;;) {
    const priorHyps: Hypothesis[] = readLedger(cwd, thread.id);
    const iterRel = path.join('experiments', String(thread.iteration));
    const iterDir = path.join(threadDir(cwd, thread.id), iterRel);
    const planFile = path.join(iterDir, 'plan.json');
    const resumable = priorHyps.find((h) => h.iteration === thread.iteration && h.status === 'testing');

    // DESIGN checkpoint consume — TOP of the loop, parallel to (and checked BEFORE) the
    // execute reuse fast-path below, and BEFORE any HYPOTHESIZE/DESIGN spawn. This is the
    // fix for the re-derive blocker: on a checkpoint resume `approved.execute` is FALSE, so
    // without this hoist the old GATE-1 placement would re-spawn DESIGN (REQ-199).
    const designPosture = resolveDesignPosture(cwd, opts, config, thread);
    const dAns = consumeAnswered(resumedCheckpoint ?? null, 'design', thread.iteration);
    let designResolution: 'approve' | 'revise' | 'abort' | null = null;
    if (dAns && resumable && fs.existsSync(planFile)) {
      const q1Label = dAns.find((a) => a.questionId === 'q1')?.label;
      if (q1Label === 'Abort this thread') {
        designResolution = 'abort';
      } else if (q1Label === 'Revise the plan') {
        const nextRound = (thread.checkpointRounds?.design ?? 0) + 1;
        if (nextRound > designPosture.cfg.max_rounds) {
          // Revise cap exceeded (R fallback): never loop forever — route to the approve
          // reuse path instead (reuse the persisted plan, proceed to RUN).
          designResolution = 'approve';
        } else {
          thread.checkpointRounds = { ...thread.checkpointRounds, design: nextRound };
          saveThread(cwd, thread);
          designResolution = 'revise';
        }
      } else {
        // Unknown/absent Q1 label (incl. explicit "Approve & run") ⇒ approve default — never wedge.
        designResolution = 'approve';
      }
    }

    if (designResolution === 'abort') {
      thread.status = 'abandoned';
      saveThread(cwd, thread);
      return { threadId: thread.id, status: 'abandoned', iterations: thread.iteration };
    }

    let hyp: Hypothesis;
    let plan: ExperimentPlan;

    if (designResolution === 'approve') {
      // APPROVE reuse fast-path: reuse the persisted plan directly — never re-derives (REQ-199).
      hyp = resumable as Hypothesis;
      plan = JSON.parse(fs.readFileSync(planFile, 'utf8')) as ExperimentPlan;
      // R4: apply whitelisted contract edits from the checkpoint's freeform Q2 answer BEFORE
      // persisting/using `plan` — this runs upstream of the `committed` debug-loop pin
      // (~L542 today), so the debug loop freezes the user-edited contract, not the model's.
      const q2Text = dAns?.find((a) => a.questionId === 'q2')?.text;
      if (q2Text) {
        applyContractEditsFromFreeform(plan, q2Text);
        fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
      }
      approved.execute = false;
    } else if (approved.execute && resumable && fs.existsSync(planFile)) {
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
      } else if (designResolution === 'revise') {
        // REVISE: reuse the same hypothesis (not a fresh HYPOTHESIZE) and re-run DESIGN
        // below; GATE-1 will emit a NEW checkpoint with the incremented round.
        hyp = resumable as Hypothesis;
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

      // GATE 1 — execute / DESIGN-approval checkpoint. When interactive.design is active this
      // site handles ONLY the fresh-emit and revise-re-emit cases — the approve/abort/cap-
      // exceeded consume path is hoisted to the TOP of the loop above (never re-derives).
      if (designPosture.active) {
        const round = (thread.checkpointRounds?.design ?? 0) + 1;
        const ck = buildDesignCheckpoint(thread, hyp, plan, round);
        emitCheckpoint(cwd, thread, ck, { checkpointHandler: opts.checkpointHandler });
        if (thread.status === 'paused') {
          return {
            threadId: thread.id, status: 'paused', iterations: thread.iteration,
            paused: true, pendingCheckpoint: thread.pendingCheckpoint ?? undefined,
          };
        }
      } else {
        const g1 = checkGate(thread, 'execute', approved.execute);
        approved.execute = false;
        if (!g1.proceed) {
          Object.assign(thread, g1.thread); thread.currentStation = 'run'; saveThread(cwd, thread);
          incrementCounter('research.gate_pauses_total');
          return { threadId: thread.id, status: 'paused', iterations: thread.iteration, paused: true, pendingGate: 'execute' };
        }
      }
    }

    // RUN — with debug retries enabled a THROWN runner is normalized to a failing
    // result (so it can be retried); at depth 0 the call is untouched and a throw
    // propagates exactly as before.
    thread.currentStation = 'run'; thread.budgetUsed += 1; saveThread(cwd, thread);
    let result = debugDepth > 0
      ? runCaught(runner, plan, threadDir(cwd, thread.id))
      : runner.run(plan, threadDir(cwd, thread.id));
    fs.writeFileSync(path.join(iterDir, 'result.json'), JSON.stringify(result, null, 2));

    // DEBUG (bounded fix-and-retry; AI-Scientist-v2's max_debug_depth analog).
    // Triggers ONLY on a script-execution failure (nonzero exit / thrown runner) —
    // never on a metric-vs-target miss, which exits 0 and is judged at MEASURE.
    // Each attempt feeds the failure output back to the experiment designer, re-runs
    // the fixed plan, and is recorded as debug-attempt-<n>.json beside result.json;
    // plan.json/result.json always end up holding what MEASURE ultimately consumed.
    // The DESIGN-committed metric contract is pinned across attempts: a debug
    // re-plan may only repair the procedure/script — never move the goalposts
    // MEASURE judges against, nor switch the execution language.
    const committed = {
      metricKey: plan.metricKey, comparator: plan.comparator,
      target: plan.target, language: plan.language,
    };
    for (let attempt = 1; attempt <= debugDepth && result.exitCode !== 0; attempt++) {
      const record: Record<string, unknown> = {
        attempt,
        maxDepth: debugDepth,
        trigger: {
          exitCode: result.exitCode, failureClass: result.failureClass,
          stderrExcerpt: result.stderrExcerpt ?? '', stdoutExcerpt: result.stdoutExcerpt,
        },
      };
      // GATE 1 re-check — the execute approval covered the DESIGN-time script only;
      // a debug attempt would execute an LLM-rewritten one. Same semantics as the
      // original gate call (auto-proceeds when the gate is off — noGates/config);
      // with the gate on there is no fresh approval, so it denies: abort the debug
      // loop and degrade to the depth=0 outcome (MEASURE judges the failing result
      // inconclusive) rather than pausing mid-RUN or executing unapproved code.
      const dGate = checkGate(thread, 'execute', false);
      if (!dGate.proceed) {
        record.fixed = false;
        record.gateDenied = 'execute';
        fs.writeFileSync(path.join(iterDir, `debug-attempt-${attempt}.json`), JSON.stringify(record, null, 2));
        break;
      }
      incrementCounter('research.debug_retries_total');
      const dRes = await spawnAndParse(
        spawn, buildDebugFixPrompt(hyp, plan, result, iterDir, attempt, debugDepth),
        'grd-experiment-runner', parsePlanOutput, spawnRetries,
      );
      if (!dRes.value) {
        // Degrade, never amplify: a hard-failed/unparseable fix spawn stops the debug
        // loop and lets MEASURE mark the failing result inconclusive — the depth=0 outcome.
        record.fixed = false;
        if (dRes.error) record.spawnError = dRes.error;
        else record.spawnOutput = excerpt(dRes.lastRaw);
        fs.writeFileSync(path.join(iterDir, `debug-attempt-${attempt}.json`), JSON.stringify(record, null, 2));
        break;
      }
      // Pin the committed contract: overwrite any drifted metricKey/comparator/
      // target/language back to the DESIGN-committed values (noting the drift in
      // the attempt record) before use and before persisting plan.json.
      const proposed = dRes.value as ExperimentPlan;
      const drift: Record<string, { proposed: unknown; pinned: unknown }> = {};
      for (const key of ['metricKey', 'comparator', 'target', 'language'] as const) {
        if (proposed[key] !== committed[key]) drift[key] = { proposed: proposed[key], pinned: committed[key] };
      }
      if (Object.keys(drift).length > 0) record.contractDrift = drift;
      plan = { ...proposed, ...committed };
      fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));
      thread.budgetUsed += 1; saveThread(cwd, thread);
      result = runCaught(runner, plan, threadDir(cwd, thread.id));
      record.fixed = true;
      record.plan = plan;
      record.result = result;
      fs.writeFileSync(path.join(iterDir, `debug-attempt-${attempt}.json`), JSON.stringify(record, null, 2));
      fs.writeFileSync(path.join(iterDir, 'result.json'), JSON.stringify(result, null, 2));
    }

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
      // Advisory structural reconstructability score — telemetry only; it is
      // computed AFTER term/verdict and never read back, so it can never gate.
      writeFinding(cwd, thread.id, finding + reconstructabilitySection(cwd, thread, plan, result));

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
  // RESUME-WITH-ANSWERS — runs BEFORE the pendingGate handling so a paused interactive
  // checkpoint (Phase 102 emission) resolves independently of the execute/kg_write gates.
  // With opts.checkpointAnswers → record human answers; on a bare resume (no --answers) OR
  // --no-gates → pass no answers so resolveCheckpoint fills each question with its recommended
  // option (answeredBy:'default') — the deterministic timeout behavior (no wall-clock timer).
  if (thread.pendingCheckpoint) {
    const { resolveCheckpoint } = require('./checkpoints') as {
      resolveCheckpoint: (
        c: string, t: ResearchThread, ck: Checkpoint, answers: CheckpointAnswer[],
      ) => Checkpoint;
    };
    const ck = thread.pendingCheckpoint;
    const answers: CheckpointAnswer[] = (!opts.noGates && opts.checkpointAnswers)
      ? Object.entries(opts.checkpointAnswers).map(([questionId, a]) => ({
        questionId, label: a.label, text: a.text, answeredBy: 'human' as const,
      }))
      : [];
    // resolveCheckpoint appends checkpoints.jsonl, clears thread.pendingCheckpoint, and saves.
    const resolved = resolveCheckpoint(cwd, thread, ck, answers);
    thread.status = 'active'; saveThread(cwd, thread);
    return runLoop(cwd, thread, opts, config, { execute: false, kg_write: false }, resolved);
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
  readDebugDepth, readResearchGatesConfig, readResurveyConfig,
};
