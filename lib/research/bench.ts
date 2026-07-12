'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
import type { Comparator, Verdict, Hypothesis, ExperimentPlan, ExperimentResult } from './types';
import type { Runner } from './runner';
import type { TesseraeClient } from './tesserae';
import type { ResearchOptions, ResearchResult, SpawnFn } from './orchestrator';

const { runResearch } = require('./orchestrator') as {
  runResearch: (cwd: string, question: string, opts?: ResearchOptions) => Promise<ResearchResult>;
};
const { ingest } = require('./ingest') as {
  ingest: (cwd: string, inputPath: string, opts?: { client?: TesseraeClient })
    => Promise<{ status: string; files: number; detail: string }>;
};
const { readLedger } = require('./ledger') as {
  readLedger: (cwd: string, id: string) => Hypothesis[];
};
const { threadDir } = require('./thread') as {
  threadDir: (cwd: string, id: string) => string;
};

// GRD-Bench: closed-world autoresearch benchmark. Each task freezes a tiny
// corpus (evidence + confounder + noise, DR3-Eval style) plus a manifest with a
// deterministic metric contract and an expected verdict. Grading reuses the
// loop's own verdict machinery (via the hypothesis ledger) — zero LLM judging.

const COMPARATORS: ReadonlySet<string> = new Set(['>=', '<=', '>', '<', '==']);
const VERDICTS: ReadonlySet<string> = new Set(['supported', 'refuted', 'inconclusive']);

export interface BenchMetricSpec {
  key: string;
  comparator: Comparator;
  target: number;
  /** Advisory only: flags |observed - target| > tolerance; never changes pass/fail. */
  tolerance?: number;
}

export interface BenchManifest {
  id: string;
  version: number;
  question: string;
  metric: BenchMetricSpec;
  expectedVerdict: Verdict;
  maxIterations?: number;
  timeoutMs?: number;
}

export interface BenchTask {
  manifest: BenchManifest;
  dir: string;
  corpusDir: string;
}

export interface BenchGrade {
  pass: boolean;
  expected: Verdict;
  actual: Verdict | null;
  metricKey: string;
  planMetricKey: string | null;
  planComparator: string | null;
  planTarget: number | null;
  /** plan.{metricKey,comparator,target} ALL equal the manifest's frozen contract. */
  metricContractMatch: boolean;
  /** |observed - target| for the manifest metric; advisory, null when unreported. */
  metricDistance: number | null;
  /** metricDistance <= tolerance; null when no tolerance or no observed metric. */
  withinTolerance: boolean | null;
  sandboxed: boolean;
  iterations: number;
  status: string;
  errorReason?: string;
}

export interface BenchDeps {
  runResearch?: (cwd: string, question: string, opts?: ResearchOptions) => Promise<ResearchResult>;
  ingest?: (cwd: string, inputPath: string, opts?: { client?: TesseraeClient })
    => Promise<{ status: string; files: number; detail: string }>;
  spawn?: SpawnFn;
  runner?: Runner;
  kgClient?: TesseraeClient;
}

export interface BenchTaskOpts extends BenchDeps {
  keepWorkdir?: boolean;
  /** Treat an unsandboxed (non-docker) experiment run as a task failure. */
  requireDocker?: boolean;
  /** Extra workdir config keys (scheduler passthrough for live runs); bench keys always win. */
  extraConfig?: Record<string, unknown>;
}

export interface BenchTaskReport extends BenchGrade {
  id: string;
  ingestStatus: string;
  workdir?: string;
}

export interface RunBenchOpts extends BenchTaskOpts {
  benchDir?: string;
  taskIds?: string[];
}

export interface BenchAggregate {
  total: number;
  passed: number;
  failed: number;
  /** Fraction of tasks whose ledger verdict matched expectedVerdict (independent of the other pass criteria). */
  verdictAccuracy: number;
  meanIterations: number;
  tasks: BenchTaskReport[];
}

// The EXACT research config every bench workdir runs under: docker sandbox with
// network off (closed world), all gates off — experiment_execution/kg_write plus
// the interactive checkpoint gate pinned off (belt-and-braces with the noGates:true
// passed at the run site; R1: a bench run must never pause for a human) — no
// knowledge promotion into the throwaway workdir, no eval report, and no
// plateau re-surveys — resurvey expansion raises thread.maxIterations past the
// manifest's frozen budget, making results non-deterministic vs the manifest.
const BENCH_WORKDIR_CONFIG: Readonly<Record<string, unknown>> = Object.freeze({
  research_sandbox: 'docker',
  research_sandbox_network: 'none',
  research_gates: { experiment_execution: false, kg_write: false, interactive: { enabled: false } },
  research_persist_knowledge: false,
  research_eval_report: false,
  research_max_resurveys: 0,
});

/** Committed task fixtures live at <repo>/bench/tasks (dist build: one level deeper). */
function defaultBenchTasksDir(): string {
  const local = path.join(__dirname, '..', '..', 'bench', 'tasks');
  if (fs.existsSync(local)) return local;
  return path.join(__dirname, '..', '..', '..', 'bench', 'tasks');
}

function invalid(ref: string, msg: string): never {
  throw new Error(`bench: invalid manifest (${ref}): ${msg}`);
}

function validateManifest(raw: unknown, ref: string): BenchManifest {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    invalid(ref, 'manifest must be a JSON object');
  }
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(m.id)) {
    invalid(ref, 'id must be a lowercase slug ([a-z0-9-])');
  }
  if (typeof m.version !== 'number' || !Number.isInteger(m.version) || m.version < 1) {
    invalid(ref, 'version must be a positive integer');
  }
  if (typeof m.question !== 'string' || !m.question.trim()) {
    invalid(ref, 'question must be a non-empty string');
  }
  const met = m.metric as Record<string, unknown> | null | undefined;
  if (typeof met !== 'object' || met === null || Array.isArray(met)) {
    invalid(ref, 'metric must be an object with key/comparator/target');
  }
  if (typeof met.key !== 'string' || !met.key.trim()) invalid(ref, 'metric.key must be a non-empty string');
  if (typeof met.comparator !== 'string' || !COMPARATORS.has(met.comparator)) {
    invalid(ref, `metric.comparator must be one of: ${[...COMPARATORS].join(' ')}`);
  }
  if (typeof met.target !== 'number' || !Number.isFinite(met.target)) {
    invalid(ref, 'metric.target must be a finite number');
  }
  if (met.tolerance !== undefined
    && (typeof met.tolerance !== 'number' || !Number.isFinite(met.tolerance) || met.tolerance < 0)) {
    invalid(ref, 'metric.tolerance must be a non-negative finite number');
  }
  if (typeof m.expectedVerdict !== 'string' || !VERDICTS.has(m.expectedVerdict)) {
    invalid(ref, 'expectedVerdict must be one of: supported refuted inconclusive');
  }
  if (m.maxIterations !== undefined
    && (typeof m.maxIterations !== 'number' || !Number.isInteger(m.maxIterations) || m.maxIterations < 1)) {
    invalid(ref, 'maxIterations must be a positive integer');
  }
  if (m.timeoutMs !== undefined
    && (typeof m.timeoutMs !== 'number' || !Number.isInteger(m.timeoutMs) || m.timeoutMs < 1)) {
    invalid(ref, 'timeoutMs must be a positive integer');
  }
  return {
    id: m.id,
    version: m.version,
    question: m.question,
    metric: {
      key: met.key,
      comparator: met.comparator as Comparator,
      target: met.target,
      ...(met.tolerance !== undefined ? { tolerance: met.tolerance as number } : {}),
    },
    expectedVerdict: m.expectedVerdict as Verdict,
    ...(m.maxIterations !== undefined ? { maxIterations: m.maxIterations as number } : {}),
    ...(m.timeoutMs !== undefined ? { timeoutMs: m.timeoutMs as number } : {}),
  };
}

/**
 * Load and validate all bench tasks under benchDir. A task is a directory with
 * a manifest.json and a sibling corpus/ holding at least one .md file. Throws
 * on any invalid manifest — a benchmark with a broken task is not runnable.
 */
function loadBenchTasks(benchDir: string): BenchTask[] {
  if (!fs.existsSync(benchDir)) throw new Error(`bench: tasks directory not found: ${benchDir}`);
  const tasks: BenchTask[] = [];
  for (const entry of (fs.readdirSync(benchDir) as string[]).sort()) {
    const dir = path.join(benchDir, entry);
    if (!(fs.statSync(dir) as { isDirectory(): boolean }).isDirectory()) continue;
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue; // not a task dir
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      throw new Error(`bench: unparseable manifest ${manifestPath} — ${(e as Error).message}`, { cause: e });
    }
    const manifest = validateManifest(parsed, entry);
    if (manifest.id !== entry) invalid(entry, `id "${manifest.id}" must match its directory name "${entry}"`);
    const corpusDir = path.join(dir, 'corpus');
    const hasCorpus = fs.existsSync(corpusDir)
      && (fs.readdirSync(corpusDir) as string[]).some((f: string) => f.endsWith('.md'));
    if (!hasCorpus) invalid(entry, 'corpus/ must exist and contain at least one .md file');
    tasks.push({ manifest, dir, corpusDir });
  }
  if (tasks.length === 0) throw new Error(`bench: no tasks found under ${benchDir}`);
  return tasks;
}

function readJsonOrNull(p: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Statuses under which the loop ran to completion and its final ledger verdict
// is authoritative. The orchestrator reports mid-loop crashes by RETURNING
// {status:'error'} (not throwing), so a crashed run reaches gradeTask with
// whatever ledger/plan.json/result.json a PREVIOUS iteration left on disk —
// those stale artifacts must never grade the task (vacuously) as a pass, claim
// a docker sandbox, or count toward verdictAccuracy.
const GRADED_STATUSES: ReadonlySet<string> = new Set(['supported', 'exhausted']);

/**
 * Deterministic grade for one finished bench run (zero LLM judging).
 * Pass iff (a) the run reached a graded terminal status ('supported' or
 * 'exhausted' — never 'error'/'paused', whose on-disk artifacts are stale),
 * (b) the final ledger hypothesis verdict equals expectedVerdict — the thread
 * status is 'exhausted', not 'refuted', on non-support, so the ledger is the
 * verdict authority here — and (c) the designed plan's FULL metric contract
 * (metricKey, comparator, target) equals the manifest's frozen contract: a
 * plan that keeps the key but relaxes `recall >= 0.9` to `recall >= 0.1`
 * gets its verdict from the relaxed goalpost and must not grade as a pass.
 * metricDistance/withinTolerance are advisory; sandboxed=false fails the
 * task only under requireDocker.
 */
function gradeTask(
  manifest: BenchManifest, result: ResearchResult, workdir: string,
  opts: { requireDocker?: boolean } = {},
): BenchGrade {
  if (!GRADED_STATUSES.has(result.status)) {
    // Same failed shape as the thrown-error channel in runBenchTask: no
    // artifact reads, so a stale verdict/plan/result can never leak in.
    return {
      pass: false,
      expected: manifest.expectedVerdict,
      actual: null,
      metricKey: manifest.metric.key,
      planMetricKey: null,
      planComparator: null,
      planTarget: null,
      metricContractMatch: false,
      metricDistance: null,
      withinTolerance: null,
      sandboxed: false,
      iterations: result.iterations,
      status: result.status,
      ...(result.errorReason ? { errorReason: result.errorReason } : {}),
    };
  }
  const ledger = readLedger(workdir, result.threadId);
  const last = ledger.length > 0 ? ledger[ledger.length - 1] : null;
  const actual: Verdict | null = last ? last.verdict : null;
  const iterDir = last
    ? path.join(threadDir(workdir, result.threadId), 'experiments', String(last.iteration))
    : null;
  const plan = iterDir ? (readJsonOrNull(path.join(iterDir, 'plan.json')) as ExperimentPlan | null) : null;
  const expResult = iterDir
    ? (readJsonOrNull(path.join(iterDir, 'result.json')) as ExperimentResult | null)
    : null;
  const planMetricKey = plan && typeof plan.metricKey === 'string' ? plan.metricKey : null;
  const planComparator = plan && typeof plan.comparator === 'string' ? plan.comparator : null;
  const planTarget = plan && typeof plan.target === 'number' ? plan.target : null;
  const metricContractMatch =
    planMetricKey === manifest.metric.key &&
    planComparator === manifest.metric.comparator &&
    planTarget === manifest.metric.target;
  const observed = expResult && expResult.metrics
    && Object.prototype.hasOwnProperty.call(expResult.metrics, manifest.metric.key)
    ? expResult.metrics[manifest.metric.key]
    : null;
  const metricDistance = typeof observed === 'number' && Number.isFinite(observed)
    ? Math.abs(observed - manifest.metric.target)
    : null;
  const withinTolerance = metricDistance !== null && manifest.metric.tolerance !== undefined
    ? metricDistance <= manifest.metric.tolerance
    : null;
  const sandboxed = expResult !== null && expResult.runner === 'docker';
  let pass = actual === manifest.expectedVerdict && metricContractMatch;
  if (opts.requireDocker === true && !sandboxed) pass = false;
  return {
    pass,
    expected: manifest.expectedVerdict,
    actual,
    metricKey: manifest.metric.key,
    planMetricKey,
    planComparator,
    planTarget,
    metricContractMatch,
    metricDistance,
    withinTolerance,
    sandboxed,
    iterations: result.iterations,
    status: result.status,
    ...(result.errorReason ? { errorReason: result.errorReason } : {}),
  };
}

/**
 * Run one bench task in a throwaway tmp workdir: write the pinned bench config,
 * ingest the frozen corpus into a task-local KG (degrades to ungrounded when
 * Tesserae is unavailable — never fails the task), run the research loop with
 * gates off, then grade deterministically. The workdir is removed unless
 * keepWorkdir; a thrown loop fails this task only, never the whole bench.
 */
async function runBenchTask(task: BenchTask, opts: BenchTaskOpts = {}): Promise<BenchTaskReport> {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-bench-')) as string;
  try {
    fs.mkdirSync(path.join(workdir, '.planning'), { recursive: true });
    // Spread order pins the bench keys: extraConfig may add scheduler/superpowers
    // for live spawns but can never override the closed-world research settings.
    fs.writeFileSync(
      path.join(workdir, '.planning', 'config.json'),
      JSON.stringify({ ...(opts.extraConfig || {}), ...BENCH_WORKDIR_CONFIG }, null, 2),
    );

    const ingestFn = opts.ingest || ingest;
    let ingestStatus: string;
    try {
      const ing = await ingestFn(workdir, task.corpusDir, opts.kgClient ? { client: opts.kgClient } : {});
      ingestStatus = ing.status;
    } catch (e) {
      ingestStatus = `ingest_failed: ${(e as Error).message}`; // degrade — grounding only
    }

    const rr = opts.runResearch || runResearch;
    let result: ResearchResult;
    try {
      result = await rr(workdir, task.manifest.question, {
        maxIterations: task.manifest.maxIterations ?? 4,
        noGates: true,
        timeout: task.manifest.timeoutMs,
        spawn: opts.spawn,
        runner: opts.runner,
        kgClient: opts.kgClient,
      });
    } catch (e) {
      return {
        id: task.manifest.id,
        ingestStatus,
        pass: false,
        expected: task.manifest.expectedVerdict,
        actual: null,
        metricKey: task.manifest.metric.key,
        planMetricKey: null,
        planComparator: null,
        planTarget: null,
        metricContractMatch: false,
        metricDistance: null,
        withinTolerance: null,
        sandboxed: false,
        iterations: 0,
        status: 'error',
        errorReason: (e as Error).message,
        ...(opts.keepWorkdir ? { workdir } : {}),
      };
    }

    const grade = gradeTask(task.manifest, result, workdir, { requireDocker: opts.requireDocker });
    return {
      id: task.manifest.id,
      ingestStatus,
      ...grade,
      ...(opts.keepWorkdir ? { workdir } : {}),
    };
  } finally {
    if (!opts.keepWorkdir) {
      try { fs.rmSync(workdir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Deterministic aggregate over per-task reports (order-preserving). */
function aggregate(tasks: BenchTaskReport[]): BenchAggregate {
  const total = tasks.length;
  const passed = tasks.filter((t: BenchTaskReport) => t.pass).length;
  const verdictHits = tasks.filter((t: BenchTaskReport) => t.actual === t.expected).length;
  const iterSum = tasks.reduce((s: number, t: BenchTaskReport) => s + t.iterations, 0);
  return {
    total,
    passed,
    failed: total - passed,
    verdictAccuracy: total > 0 ? round4(verdictHits / total) : 0,
    meanIterations: total > 0 ? round4(iterSum / total) : 0,
    tasks,
  };
}

/** Load tasks (optionally filtered by id), run each sequentially, aggregate. */
async function runBench(opts: RunBenchOpts = {}): Promise<BenchAggregate> {
  const benchDir = opts.benchDir || defaultBenchTasksDir();
  let tasks = loadBenchTasks(benchDir);
  if (opts.taskIds && opts.taskIds.length > 0) {
    const known = new Set(tasks.map((t: BenchTask) => t.manifest.id));
    const unknown = opts.taskIds.filter((id: string) => !known.has(id));
    if (unknown.length > 0) {
      throw new Error(`bench: unknown task id(s): ${unknown.join(', ')} (known: ${[...known].join(', ')})`);
    }
    const want = new Set(opts.taskIds);
    tasks = tasks.filter((t: BenchTask) => want.has(t.manifest.id));
  }
  const reports: BenchTaskReport[] = [];
  for (const task of tasks) reports.push(await runBenchTask(task, opts));
  return aggregate(reports);
}

module.exports = {
  loadBenchTasks, runBenchTask, gradeTask, runBench, aggregate,
  defaultBenchTasksDir, BENCH_WORKDIR_CONFIG,
};
