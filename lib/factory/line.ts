'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from './exec';
import type { Baseline, CandidateEvent, CandidateOutcome, MeasureResult, SandboxSpec, StopReason, WorkOrder } from './types';
import type { SandboxCtx } from './sandbox';
import type { FactorySpawnFn, MeteredSpawn } from './spawn';
import type { Evidence, ReportInput } from './ship';
import type { DesignOverride, ResearchOptions, ResearchResult } from '../research/orchestrator';
import type { Comparator, ExperimentPlan, ExperimentResult, Hypothesis, MetricContract, ResearchThread } from '../research/types';
import type { Runner } from '../research/runner';
import type { TesseraeClient } from '../research/tesserae';
import type { SchedulerSpawnResult, SpawnOpts } from '../types';

const { defaultExec } = require('./exec') as { defaultExec: Exec };
const { loadOrder, orderDir } = require('./order') as {
  loadOrder: (h: string, id: string) => WorkOrder; orderDir: (h: string, id: string) => string;
};
const sb = require('./sandbox') as {
  DEFAULT_TIMEOUT_MS: number;
  hostUser: () => string | null;
  dockerReady: (e: Exec) => boolean;
  runSetup: (c: SandboxCtx, s: SandboxSpec, wt: string, label: string) => { ok: boolean; detail: string };
  measure: (c: SandboxCtx, s: SandboxSpec, wt: string, cmd: string, n: number, metric: string, label: string) => MeasureResult;
  removeRecordedContainers: (e: Exec, dir: string) => void;
};
const gates = require('./gates') as {
  changedPaths: (e: Exec, dir: string, base: string) => string[];
  scopeCheck: (c: string[], ed: string[], prot: string[]) => { ok: boolean; violations: string[] };
  tamperScan: (e: Exec, dir: string, base: string) => string[];
  queriesUsed: (od: string) => number;
  hiddenGate: (c: SandboxCtx, o: WorkOrder, od: string, cand: string, wt: string) =>
    { outcome: 'pass' | 'fail' | 'broken'; median: number | null; detail: string };
};
const wt = require('./worktrees') as {
  addWorktree: (e: Exec, repo: string, dir: string, base: string) => string;
  untrackedPaths: (e: Exec, dir: string) => string[];
  restoreToSetupState: (e: Exec, dir: string, base: string, a: ReadonlySet<string>) => void;
  removeWorktree: (e: Exec, repo: string, dir: string) => void;
  removeAllOwn: (e: Exec, repo: string, root: string) => void;
};
const prompts = require('./prompts') as {
  composeQuestion: (o: WorkOrder, base: string, h: CandidateEvent[]) => string;
  buildPrompt: (o: WorkOrder, hyp: Pick<Hypothesis, 'id' | 'statement'>, wt: string, iterDir: string) => string;
  fixPrompt: (o: WorkOrder, hyp: Pick<Hypothesis, 'id' | 'statement'>, r: Pick<ExperimentResult, 'exitCode' | 'stderrExcerpt'>,
    wt: string, iterDir: string, attempt: number, max: number) => string;
  replicationPrompt: (o: WorkOrder, s: string, wt: string, iterDir: string) => string;
  strategyNote: (p: string) => string;
};
const { BUILDER, BudgetSpentError, createMeteredSpawn } = require('./spawn') as {
  BUILDER: string;
  BudgetSpentError: new (m: string) => Error;
  createMeteredSpawn: (o: { scheduler: { spawn: (p: string, o: SpawnOpts) => Promise<SchedulerSpawnResult> };
    orderDir: string; budgetTokens: number; warn: (m: string) => void }) => MeteredSpawn;
};
const { shipCandidate, writeReport } = require('./ship') as {
  shipCandidate: (e: Exec, ev: Evidence, wt: string, od: string) => { branch: string; prUrl: string | null; error: string | null; manual: string | null };
  writeReport: (od: string, r: ReportInput) => string;
};
const { runResearch, readResurveyConfig } = require('../research/orchestrator') as {
  runResearch: (cwd: string, q: string, o: ResearchOptions) => Promise<ResearchResult>;
  readResurveyConfig: (cwd: string) => { cap: number; window: number; fetch: boolean };
};
const { readLedger } = require('../research/ledger') as { readLedger: (cwd: string, id: string) => Hypothesis[] };
const { threadDir } = require('../research/thread') as { threadDir: (cwd: string, id: string) => string };
const { compare } = require('../research/verdict') as { compare: (v: number, c: Comparator, t: number) => boolean };
const { createScheduler } = require('../scheduler') as {
  createScheduler: (c: unknown, s?: unknown) => { spawn: (p: string, o: SpawnOpts) => Promise<SchedulerSpawnResult> } | null;
};

const MAX_BUILD_FAILURES = 3;

/** The line's research state dir config, following BENCH_WORKDIR_CONFIG: unattended, nothing persisted. */
const LINE_CONFIG: Readonly<Record<string, unknown>> = Object.freeze({
  research_gates: { experiment_execution: false, kg_write: false, interactive: { enabled: false } },
  research_persist_knowledge: false,
  research_eval_report: false,
  research_max_resurveys: 0,
  research_max_debug_depth: 1,
});

/** The factory grounds agents on the reference worktree, not a knowledge graph. */
const NO_KG: TesseraeClient = {
  isAvailable: () => false,
  compile: async () => ({ status: 'skipped_no_tesserae', detail: 'research factory: no knowledge graph', graphPath: null }),
  querySmokeCheck: async () => ({ found: false, nodeIds: [], detail: 'research factory: no knowledge graph' }),
};
const NO_RETRIEVE = async (): Promise<{ results: Array<Record<string, unknown>>; modes: Record<string, boolean>; detail: string }> =>
  ({ results: [], modes: {}, detail: 'research factory: grounding comes from the reference worktree' });

export interface RunOrderDeps {
  exec?: Exec;
  scheduler?: { spawn: (p: string, o: SpawnOpts) => Promise<SchedulerSpawnResult> };
  /** The invoking project's scheduler and superpowers blocks. */
  hostConfig?: Record<string, unknown>;
  runResearch?: (cwd: string, q: string, o: ResearchOptions) => Promise<ResearchResult>;
  now?: () => number;
  warn?: (m: string) => void;
  timeoutMs?: number;
  /** Registers an abort handler; returns its unregister function. Default: SIGINT and SIGTERM. */
  onAbort?: (handler: () => void) => () => void;
}

export interface RunOrderResult {
  stop: StopReason;
  reportPath: string;
  prUrl: string | null;
  candidates: number;
  tokens: number;
  hiddenQueries: number;
}

interface Current {
  id: string;
  key: string;
  worktree: string;
  artifacts: Set<string>;
  lastCheck: 'none' | 'empty' | 'scope' | 'tamper' | 'dev_failed' | 'measured';
  detail: string;
  devMedian: number | null;
}

interface Line {
  order: WorkOrder;
  od: string;
  lineDir: string;
  baseWt: string;
  exec: Exec;
  ctx: SandboxCtx;
  byId: Map<string, CandidateEvent>;
  ids: string[];
  current: Current | null;
  builderCwd: string;
  attempt: number;
  now: () => number;
}

function readEvents(od: string): { byId: Map<string, CandidateEvent>; ids: string[] } {
  const byId = new Map<string, CandidateEvent>();
  const ids: string[] = [];
  const f = path.join(od, 'candidates.jsonl');
  if (!fs.existsSync(f)) return { byId, ids };
  for (const l of String(fs.readFileSync(f, 'utf8')).split('\n').filter(Boolean)) {
    const e = JSON.parse(l) as CandidateEvent;
    if (!byId.has(e.id)) ids.push(e.id);
    byId.set(e.id, { ...byId.get(e.id), ...e });
  }
  return { byId, ids };
}

function record(l: Line, e: Omit<CandidateEvent, 'at'>): void {
  const full: CandidateEvent = { ...e, at: new Date(l.now()).toISOString() };
  fs.appendFileSync(path.join(l.od, 'candidates.jsonl'), JSON.stringify(full) + '\n');
  if (!l.byId.has(e.id)) l.ids.push(e.id);
  l.byId.set(e.id, { ...l.byId.get(e.id), ...full });
}

function history(l: Line): CandidateEvent[] { return l.ids.map((id) => l.byId.get(id) as CandidateEvent); }

function better(a: number, b: number, cmp: Comparator, target: number): boolean {
  if (cmp === '<=' || cmp === '<') return a < b;
  if (cmp === '>=' || cmp === '>') return a > b;
  return Math.abs(a - target) < Math.abs(b - target);
}

const MISSES: ReadonlySet<CandidateOutcome> = new Set(['dev_miss', 'build_failed', 'out_of_scope', 'tampering']);

/** The last `window` finished candidates all missed the rule, and none beat the best before them. */
function isPlateau(done: CandidateEvent[], cmp: Comparator, target: number, window: number, baselineDev: number): boolean {
  if (done.length < window) return false;
  const last = done.slice(-window);
  if (!last.every((e) => e.outcome !== undefined && MISSES.has(e.outcome))) return false;
  let best = baselineDev;
  for (const e of done.slice(0, -window)) {
    if (typeof e.devMedian === 'number' && better(e.devMedian, best, cmp, target)) best = e.devMedian;
  }
  return !last.some((e) => typeof e.devMedian === 'number' && better(e.devMedian, best, cmp, target));
}

function finalize(l: Line, cur: Current, reason?: string): void {
  const outcome: CandidateOutcome = cur.lastCheck === 'measured' ? 'dev_miss'
    : cur.lastCheck === 'scope' ? 'out_of_scope'
      : cur.lastCheck === 'tamper' ? 'tampering' : 'build_failed';
  record(l, { id: cur.id, outcome, devMedian: cur.devMedian, detail: reason ?? cur.detail });
  wt.removeWorktree(l.exec, l.order.repo, cur.worktree);
  if (l.current === cur) l.current = null;
}

/** One worktree per (thread, iteration). A redesign of the same iteration starts over from setup. */
function allocate(l: Line, thread: ResearchThread): Current {
  const key = `${thread.id}#${thread.iteration}`;
  const cur = l.current;
  if (cur && cur.key === key) {
    wt.restoreToSetupState(l.exec, cur.worktree, l.order.base, cur.artifacts);
    cur.lastCheck = 'none'; cur.detail = ''; cur.devMedian = null;
    return cur;
  }
  if (cur) finalize(l, cur);
  const id = `c${l.ids.length + 1}`;
  const dir = path.join(l.od, 'worktrees', id);
  // Recorded before anything can fail, so the candidate counts against the budget either way.
  record(l, { id, attempt: l.attempt, threadId: thread.id, iteration: thread.iteration });
  wt.addWorktree(l.exec, l.order.repo, dir, l.order.base);
  const next: Current = { id, key, worktree: dir, artifacts: new Set(), lastCheck: 'none', detail: '', devMedian: null };
  l.current = next;
  l.builderCwd = dir;
  const setup = sb.runSetup(l.ctx, l.order.sandbox, dir, `${id}-setup`);
  if (!setup.ok) throw new Error(`setup failed for ${id}: ${setup.detail}`);
  next.artifacts = new Set(wt.untrackedPaths(l.exec, dir));
  return next;
}

function makeDesign(l: Line): DesignOverride {
  return {
    agent: BUILDER,
    prompt: (thread, hyp, iterDir) => prompts.buildPrompt(l.order, hyp, allocate(l, thread).worktree, iterDir),
    fixPrompt: (hyp, _plan, result, iterDir, attempt, maxDepth) => {
      const cur = l.current;
      if (!cur) throw new Error('research factory: fix requested with no current candidate');
      return prompts.fixPrompt(l.order, hyp, result, cur.worktree, iterDir, attempt, maxDepth);
    },
  };
}

/** Checks a candidate's change, then measures it on the dev evaluation in the sandbox. */
function makeRunner(l: Line): Runner {
  return {
    run(_plan: ExperimentPlan, _threadDir: string): ExperimentResult {
      const cur = l.current;
      if (!cur) throw new Error('research factory: runner called with no current candidate');
      const start = l.now();
      const fail = (check: Current['lastCheck'], detail: string): ExperimentResult => {
        cur.lastCheck = check; cur.detail = detail;
        return { metrics: {}, exitCode: 3, runner: 'docker', durationMs: l.now() - start, stdoutExcerpt: '', stderrExcerpt: detail, failureClass: 'H4' };
      };
      const o = l.order;
      const changed = gates.changedPaths(l.exec, cur.worktree, o.base).filter((p) => !cur.artifacts.has(p));
      if (changed.length === 0) return fail('empty', 'the change is empty: no file under the allowed paths was modified');
      const scope = gates.scopeCheck(changed, o.editable, o.dev_eval.files);
      if (!scope.ok) return fail('scope', `changes outside the allowlist: ${scope.violations.join(', ')}. Revert them; only ${o.editable.join(', ')} may change.`);
      const tamper = gates.tamperScan(l.exec, cur.worktree, o.base).filter((p) => !cur.artifacts.has(p));
      if (tamper.length > 0) return fail('tamper', `the change adds the text __RESULT__ in: ${tamper.join(', ')}. Remove it.`);
      const m = sb.measure(l.ctx, o.sandbox, cur.worktree, o.dev_eval.command, o.dev_eval.repeats, o.contract.metric, `${cur.id}-dev`);
      if (!m.ok || m.median === null) return fail('dev_failed', `the dev evaluation failed on this change: ${m.stderrExcerpt || `exit ${m.exitCode}`}`);
      cur.lastCheck = 'measured'; cur.devMedian = m.median; cur.detail = '';
      return { metrics: { [o.contract.metric]: m.median }, exitCode: 0, runner: 'docker', durationMs: l.now() - start, stdoutExcerpt: m.stdoutExcerpt, failureClass: 'none' };
    },
  };
}

function fillHypotheses(l: Line, threadId: string): void {
  const ledger = readLedger(l.lineDir, threadId);
  for (const e of history(l)) {
    if (e.threadId !== threadId || e.hypothesis !== undefined || e.iteration === undefined) continue;
    const h = ledger.find((x) => x.iteration === e.iteration);
    if (h) record(l, { id: e.id, hypothesis: h.statement });
  }
}

interface GateResult { stop: StopReason | null; prUrl: string | null; shipError: string | null; manual: string | null; }
const CONTINUE: GateResult = { stop: null, prUrl: null, shipError: null, manual: null };

/** Blind replication, then one hidden query, then the PR. The leaking resource is spent last. */
async function trustGates(l: Line, cur: Current, spawnFn: FactorySpawnFn, metered: MeteredSpawn): Promise<GateResult> {
  const o = l.order;
  const ev = l.byId.get(cur.id) as CandidateEvent;
  const iterDir = path.join(threadDir(l.lineDir, ev.threadId as string), 'experiments', String(ev.iteration));
  const plan = JSON.parse(String(fs.readFileSync(path.join(iterDir, 'plan.json'), 'utf8'))) as ExperimentPlan;
  const strategy = prompts.strategyNote(plan.procedure);
  record(l, { id: cur.id, strategy, devMedian: cur.devMedian });

  const rdir = path.join(l.od, 'worktrees', `${cur.id}r`);
  let replica: number | null = null;
  try {
    wt.addWorktree(l.exec, o.repo, rdir, o.base);
    const setup = sb.runSetup(l.ctx, o.sandbox, rdir, `${cur.id}r-setup`);
    if (setup.ok) {
      const artifacts = new Set(wt.untrackedPaths(l.exec, rdir));
      l.builderCwd = rdir;
      await spawnFn(prompts.replicationPrompt(o, strategy, rdir, iterDir), BUILDER);
      const changed = gates.changedPaths(l.exec, rdir, o.base).filter((p) => !artifacts.has(p));
      const clean = changed.length > 0 && gates.scopeCheck(changed, o.editable, o.dev_eval.files).ok
        && gates.tamperScan(l.exec, rdir, o.base).filter((p) => !artifacts.has(p)).length === 0;
      if (clean) {
        const m = sb.measure(l.ctx, o.sandbox, rdir, o.dev_eval.command, o.dev_eval.repeats, o.contract.metric, `${cur.id}r-dev`);
        replica = m.ok ? m.median : null;
      }
    }
  } catch (e) {
    if (e instanceof BudgetSpentError) {
      finalize(l, cur, 'stopped: the token budget ran out during replication');
      return { ...CONTINUE, stop: 'budget_spent' };
    }
    record(l, { id: cur.id, detail: `replication failed: ${(e as Error).message}` });
  } finally {
    wt.removeWorktree(l.exec, o.repo, rdir);
    l.builderCwd = cur.worktree;
  }
  if (replica === null || !compare(replica, o.contract.comparator, o.contract.target)) {
    record(l, { id: cur.id, outcome: 'did_not_replicate', replicaDevMedian: replica });
    wt.removeWorktree(l.exec, o.repo, cur.worktree); l.current = null;
    return CONTINUE;
  }
  record(l, { id: cur.id, replicaDevMedian: replica });

  if (!sb.dockerReady(l.exec)) return { ...CONTINUE, stop: 'docker_unavailable' };
  const g = gates.hiddenGate(l.ctx, o, l.od, cur.id, cur.worktree);
  if (g.outcome !== 'pass') {
    // One bit for later hypotheses. The value itself lives only in queries.jsonl.
    record(l, { id: cur.id, outcome: 'rejected_at_gate', detail: g.outcome === 'broken' ? 'the hidden evaluation broke on this candidate' : '' });
    wt.removeWorktree(l.exec, o.repo, cur.worktree); l.current = null;
    return g.outcome === 'broken' ? { ...CONTINUE, stop: 'hidden_broken' } : CONTINUE;
  }

  const changed = gates.changedPaths(l.exec, cur.worktree, o.base).filter((p) => !cur.artifacts.has(p));
  const res = shipCandidate(l.exec, {
    order: o, candidate: cur.id, hypothesis: ev.hypothesis ?? '', strategy,
    devMedian: cur.devMedian as number, replicaDevMedian: replica, hiddenMedian: g.median as number,
    changed, tokens: metered.spent(), hiddenQueriesUsed: gates.queriesUsed(l.od),
  }, cur.worktree, l.od);
  record(l, { id: cur.id, outcome: 'shipped', detail: res.prUrl ?? res.error ?? '' });
  wt.removeWorktree(l.exec, o.repo, cur.worktree); l.current = null;
  return { stop: 'shipped', prUrl: res.prUrl, shipError: res.error, manual: res.manual };
}

function defaultOnAbort(handler: () => void): () => void {
  const onSignal = (): void => { try { handler(); } finally { process.exit(130); } };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  return () => { process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal); };
}

function startedAt(od: string, now: () => number): number {
  const f = path.join(od, 'started.json');
  if (fs.existsSync(f)) return (JSON.parse(String(fs.readFileSync(f, 'utf8'))) as { at: number }).at;
  const at = now();
  fs.writeFileSync(f, JSON.stringify({ at }) + '\n');
  return at;
}

async function runOrder(home: string, id: string, deps: RunOrderDeps = {}): Promise<RunOrderResult> {
  const exec = deps.exec || defaultExec;
  const now = deps.now || Date.now;
  const warnings: string[] = [];
  const warn = (m: string): void => { warnings.push(m.trim()); (deps.warn || ((x: string) => { process.stderr.write(x); }))(m); };
  const order = loadOrder(home, id);
  if (!order.baseline) throw new Error(`order "${id}" has no baseline; save it through validate`);
  const baseline: Baseline = order.baseline;
  const od = orderDir(home, id);
  const lineDir = path.join(od, 'line');
  fs.mkdirSync(path.join(lineDir, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(lineDir, '.planning', 'config.json'), JSON.stringify(LINE_CONFIG, null, 2) + '\n');
  const host = deps.hostConfig || {};
  const scheduler = deps.scheduler || createScheduler(host.scheduler, host.superpowers);
  if (!scheduler) throw new Error('no scheduler configured: run `gd factory run` from a GRD project whose .planning/config.json has a scheduler block');

  // Crash recovery touches only what this order recorded: its own worktrees and containers.
  sb.removeRecordedContainers(exec, od);
  wt.removeAllOwn(exec, order.repo, path.join(od, 'worktrees'));
  const { byId, ids } = readEvents(od);
  const l: Line = {
    order, od, lineDir, baseWt: '', exec,
    ctx: { exec, ledgerDir: od, orderId: id, user: sb.hostUser(), timeoutMs: deps.timeoutMs ?? sb.DEFAULT_TIMEOUT_MS },
    byId, ids, current: null, builderCwd: lineDir, attempt: 0, now,
  };
  for (const e of history(l)) {
    if (!e.outcome) record(l, { id: e.id, outcome: 'build_failed', detail: 'interrupted by a crash or abort' });
  }
  const begun = startedAt(od, now);
  const metered = createMeteredSpawn({ scheduler, orderDir: od, budgetTokens: order.budget.tokens, warn });
  const spawnFn = metered.spawnFn((agent) => (agent === BUILDER ? l.builderCwd : lineDir), () => (l.current ? l.current.id : null));
  const window = readResurveyConfig(lineDir).window;
  const rr = deps.runResearch || runResearch;
  const cleanup = (): void => {
    wt.removeAllOwn(exec, order.repo, path.join(od, 'worktrees'));
    sb.removeRecordedContainers(exec, od);
  };
  const unregister = (deps.onAbort || defaultOnAbort)(cleanup);

  // Docker decides up front whether the line runs at all: candidate code never runs on the host,
  // so an unavailable docker stops the order before even the reference worktree is created.
  let stop: StopReason | null = sb.dockerReady(exec) ? null : 'docker_unavailable';
  let gate: GateResult = CONTINUE;
  let buildFailures = 0;
  const stopReason = (): StopReason | null => {
    if (!sb.dockerReady(exec)) return 'docker_unavailable';
    if (l.ids.length >= order.budget.candidates) return 'budget_spent';
    if (metered.tokenCapEnforced() && metered.spent() >= order.budget.tokens) return 'budget_spent';
    if (now() - begun >= order.budget.wall_minutes * 60000) return 'budget_spent';
    if (gates.queriesUsed(od) >= order.budget.hidden_queries) return 'holdout_spent';
    if (buildFailures >= MAX_BUILD_FAILURES) return 'build_failures';
    const done = history(l).filter((e) => e.outcome !== undefined);
    return isPlateau(done, order.contract.comparator, order.contract.target, window, baseline.dev) ? 'plateau' : null;
  };
  try {
    if (!stop) {
      l.baseWt = wt.addWorktree(exec, order.repo, path.join(od, 'worktrees', 'base'), order.base);
      for (;;) {
        stop = stopReason();
        if (stop) break;
        l.attempt += 1;
        let result: ResearchResult | null = null;
        let error: string | null = null;
        const contract: MetricContract = { metricKey: order.contract.metric, comparator: order.contract.comparator, target: order.contract.target };
        try {
          result = await rr(lineDir, prompts.composeQuestion(order, l.baseWt, history(l)), {
            maxIterations: Math.min(order.budget.candidates - l.ids.length, window), noGates: true,
            contract, design: makeDesign(l), runner: makeRunner(l), spawn: spawnFn,
            kgClient: NO_KG, retrieve: NO_RETRIEVE,
          });
        } catch (e) {
          error = (e as Error).message;
        }
        if (result) fillHypotheses(l, result.threadId);
        const cur = l.current;
        if (result && result.status === 'supported' && cur && cur.lastCheck === 'measured') {
          buildFailures = 0;
          gate = await trustGates(l, cur, spawnFn, metered);
          if (gate.stop) { stop = gate.stop; break; }
          continue;
        }
        const reason = error
          ?? (result && result.status !== 'exhausted' ? result.errorReason ?? `the research loop returned status ${result.status}` : undefined);
        if (cur) finalize(l, cur, reason);
        const budgetOut = metered.tokenCapEnforced() && metered.spent() >= order.budget.tokens;
        const failed = cur ? l.byId.get(cur.id)?.outcome === 'build_failed' : reason !== undefined;
        buildFailures = failed && !budgetOut ? buildFailures + 1 : 0;
        if (reason && !budgetOut) warnings.push(`attempt ${l.attempt}: ${reason}`);
      }
    }
  } finally {
    unregister();
    cleanup();
  }
  const final = stop as StopReason;
  const reportPath = writeReport(od, {
    order, stop: final, prUrl: gate.prUrl, shipError: gate.shipError, manual: gate.manual,
    events: history(l), tokens: metered.spent(), tokenCapEnforced: metered.tokenCapEnforced(),
    hiddenQueries: gates.queriesUsed(od), warnings,
  });
  return { stop: final, reportPath, prUrl: gate.prUrl, candidates: l.ids.length, tokens: metered.spent(), hiddenQueries: gates.queriesUsed(od) };
}

module.exports = { runOrder, readEvents, isPlateau, LINE_CONFIG };
