'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
import type { ExperimentPlan, ExperimentResult, Verdict } from '../../../lib/research/types';
import type { Runner } from '../../../lib/research/runner';
import type { TesseraeClient } from '../../../lib/research/tesserae';
import type { ResearchOptions, ResearchResult, SpawnFn } from '../../../lib/research/orchestrator';
import type {
  BenchAggregate, BenchGrade, BenchManifest, BenchTask, BenchTaskOpts, BenchTaskReport, RunBenchOpts,
} from '../../../lib/research/bench';

const {
  loadBenchTasks, runBenchTask, gradeTask, runBench, aggregate,
  defaultBenchTasksDir, BENCH_WORKDIR_CONFIG,
} = require('../../../lib/research/bench') as {
  loadBenchTasks: (benchDir: string) => BenchTask[];
  runBenchTask: (task: BenchTask, opts?: BenchTaskOpts) => Promise<BenchTaskReport>;
  gradeTask: (
    manifest: BenchManifest, result: ResearchResult, workdir: string,
    opts?: { requireDocker?: boolean },
  ) => BenchGrade;
  runBench: (opts?: RunBenchOpts) => Promise<BenchAggregate>;
  aggregate: (tasks: BenchTaskReport[]) => BenchAggregate;
  defaultBenchTasksDir: () => string;
  BENCH_WORKDIR_CONFIG: Record<string, unknown>;
};
const { appendHypothesis } = require('../../../lib/research/ledger') as {
  appendHypothesis: (cwd: string, id: string, h: Record<string, unknown>) => void;
};
const { threadDir } = require('../../../lib/research/thread') as {
  threadDir: (cwd: string, id: string) => string;
};

/** Stale artifacts a completed iteration 1 leaves behind: a verdict-matching
 * ledger entry plus plan.json/result.json claiming the right metric and a
 * docker run. A later crash must not let these grade the task. */
function writeStaleIteration1(cwd: string, id: string): void {
  appendHypothesis(cwd, id, {
    id: 'h1', iteration: 1, statement: 's', rationale: 'r', predictedOutcome: 'p',
    status: 'supported', parentId: null, verdict: 'supported',
  });
  const iterDir = path.join(threadDir(cwd, id), 'experiments', '1');
  fs.mkdirSync(iterDir, { recursive: true });
  fs.writeFileSync(path.join(iterDir, 'plan.json'), JSON.stringify({
    procedure: 'p', metricKey: 'score', comparator: '>=', target: 0.8,
    language: 'shell', scriptPath: 'experiments/1/run.sh',
  }));
  fs.writeFileSync(path.join(iterDir, 'result.json'), JSON.stringify({
    metrics: { score: 0.84 }, exitCode: 0, runner: 'docker', durationMs: 1,
    stdoutExcerpt: '', failureClass: 'none',
  }));
}

const REPO_BENCH_DIR = path.join(__dirname, '..', '..', '..', 'bench', 'tasks');

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-benchtest-')) as string;
}

function baseManifest(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    version: 1,
    question: 'Does it clear the bar? Decision metric: score >= 0.8',
    metric: { key: 'score', comparator: '>=', target: 0.8, tolerance: 0.05 },
    expectedVerdict: 'supported',
    maxIterations: 2,
    timeoutMs: 60000,
    ...over,
  };
}

function writeTask(
  benchRoot: string, dirName: string, manifest: Record<string, unknown> | string,
  corpus: Record<string, string> | null = { 'evidence.md': '# evidence' },
): void {
  const dir = path.join(benchRoot, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    typeof manifest === 'string' ? manifest : JSON.stringify(manifest),
  );
  if (corpus) {
    fs.mkdirSync(path.join(dir, 'corpus'), { recursive: true });
    for (const [name, content] of Object.entries(corpus)) {
      fs.writeFileSync(path.join(dir, 'corpus', name), content);
    }
  }
}

function makeSpawn(metric: { key: string; comparator: string; target: number }): SpawnFn {
  let n = 0;
  return async (_prompt: string, agentType: string): Promise<string> => {
    if (agentType === 'grd-hypothesizer') {
      n++;
      return `__HYPOTHESIS__ {"statement":"hypothesis ${n}","rationale":"r","predictedOutcome":"p"}`;
    }
    if (agentType === 'grd-experiment-runner') {
      return `__PLAN__ {"procedure":"p","metricKey":"${metric.key}","comparator":"${metric.comparator}",`
        + `"target":${metric.target},"language":"shell","scriptPath":"experiments/x/run.sh"}`;
    }
    if (agentType === 'grd-knowledge-miner') {
      return '__TAKEAWAY__ {"kind":"domain_fact","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';
    }
    return '';
  };
}

function makeRunner(metrics: Record<string, number>, kind: 'subprocess' | 'docker' = 'subprocess'): Runner {
  return {
    run(_plan: ExperimentPlan, _threadDir: string): ExperimentResult {
      return {
        metrics, exitCode: 0, runner: kind, durationMs: 1, stdoutExcerpt: '', failureClass: 'none',
      };
    },
  };
}

function fakeKg(): TesseraeClient {
  return {
    isAvailable: () => false,
    compile: async () => ({ status: 'skipped_no_tesserae', detail: 'fake', graphPath: null }),
    querySmokeCheck: async () => ({ found: false, nodeIds: [], detail: 'fake' }),
  };
}

/** Standard offline fakes for a manifest: plan emits the manifest metric contract. */
function fakesFor(
  manifest: { metric: { key: string; comparator: string; target: number } },
  metrics: Record<string, number>, kind: 'subprocess' | 'docker' = 'subprocess',
): BenchTaskOpts {
  return { spawn: makeSpawn(manifest.metric), runner: makeRunner(metrics, kind), kgClient: fakeKg() };
}

describe('bench', () => {
  describe('loadBenchTasks', () => {
    it('loads the three committed starter tasks (sorted, corpus present)', () => {
      const tasks = loadBenchTasks(REPO_BENCH_DIR);
      expect(tasks.map((t) => t.manifest.id)).toEqual([
        'cache-latency-slo', 'dedup-precision-gap', 'noise-filter-recall',
      ]);
      expect(tasks.map((t) => t.manifest.expectedVerdict).sort()).toEqual([
        'inconclusive', 'refuted', 'supported',
      ]);
      for (const t of tasks) {
        expect(fs.existsSync(t.corpusDir)).toBe(true);
        expect(t.manifest.question).toMatch(/Decision metric/);
        expect(t.manifest.metric.key.length).toBeGreaterThan(0);
      }
    });

    it('throws when the tasks directory is missing', () => {
      expect(() => loadBenchTasks(path.join(tmp(), 'nope'))).toThrow(/not found/);
    });

    it('throws when the directory has no tasks', () => {
      expect(() => loadBenchTasks(tmp())).toThrow(/no tasks found/);
    });

    it('skips stray files and directories without a manifest', () => {
      const root = tmp();
      writeTask(root, 'task-a', baseManifest('task-a'));
      fs.mkdirSync(path.join(root, 'not-a-task'));
      fs.writeFileSync(path.join(root, 'README.md'), '# stray file');
      const tasks = loadBenchTasks(root);
      expect(tasks.map((t) => t.manifest.id)).toEqual(['task-a']);
    });

    it('throws on unparseable manifest JSON', () => {
      const root = tmp();
      writeTask(root, 'task-a', '{ not json');
      expect(() => loadBenchTasks(root)).toThrow(/unparseable manifest/);
    });

    it('accepts a minimal manifest without optional fields', () => {
      const root = tmp();
      const minimal = baseManifest('task-a');
      delete minimal.maxIterations;
      delete minimal.timeoutMs;
      delete (minimal.metric as Record<string, unknown>).tolerance;
      writeTask(root, 'task-a', minimal);
      const tasks = loadBenchTasks(root);
      expect(tasks[0].manifest.maxIterations).toBeUndefined();
      expect(tasks[0].manifest.timeoutMs).toBeUndefined();
      expect(tasks[0].manifest.metric.tolerance).toBeUndefined();
    });

    it('runs a minimal manifest with the default iteration budget', async () => {
      const root = tmp();
      const minimal = baseManifest('task-a');
      delete minimal.maxIterations;
      delete minimal.timeoutMs;
      writeTask(root, 'task-a', minimal);
      const task = loadBenchTasks(root)[0];
      const report = await runBenchTask(task, fakesFor(task.manifest, { score: 0.84 }));
      expect(report.pass).toBe(true); // supported on iteration 1 under the default budget of 4
      expect(report.iterations).toBe(1);
    });

    const invalidCases: Array<[string, Record<string, unknown> | string, RegExp]> = [
      ['non-object manifest', '[1,2]', /must be a JSON object/],
      ['bad id slug', baseManifest('Bad_ID', { id: 'Bad_ID' }), /lowercase slug/],
      ['bad version', baseManifest('task-a', { version: 0 }), /version/],
      ['empty question', baseManifest('task-a', { question: '  ' }), /question/],
      ['missing metric', baseManifest('task-a', { metric: undefined }), /metric must be an object/],
      ['empty metric key', baseManifest('task-a', { metric: { key: '', comparator: '>=', target: 1 } }), /metric\.key/],
      ['bad comparator', baseManifest('task-a', { metric: { key: 'score', comparator: '~=', target: 1 } }), /comparator/],
      ['non-numeric target', baseManifest('task-a', { metric: { key: 'score', comparator: '>=', target: 'high' } }), /target/],
      ['negative tolerance', baseManifest('task-a', { metric: { key: 'score', comparator: '>=', target: 1, tolerance: -1 } }), /tolerance/],
      ['bad expectedVerdict', baseManifest('task-a', { expectedVerdict: 'maybe' }), /expectedVerdict/],
      ['bad maxIterations', baseManifest('task-a', { maxIterations: 0 }), /maxIterations/],
      ['bad timeoutMs', baseManifest('task-a', { timeoutMs: 0 }), /timeoutMs/],
    ];
    for (const [name, manifest, re] of invalidCases) {
      it(`rejects a manifest with ${name}`, () => {
        const root = tmp();
        writeTask(root, 'task-a', manifest);
        expect(() => loadBenchTasks(root)).toThrow(re);
      });
    }

    it('rejects an id that does not match its directory name', () => {
      const root = tmp();
      writeTask(root, 'task-a', baseManifest('other-id', { id: 'other-id' }));
      expect(() => loadBenchTasks(root)).toThrow(/match its directory name/);
    });

    it('rejects a task without a corpus of .md files', () => {
      const root = tmp();
      writeTask(root, 'task-a', baseManifest('task-a'), null);
      expect(() => loadBenchTasks(root)).toThrow(/corpus/);
      const root2 = tmp();
      writeTask(root2, 'task-a', baseManifest('task-a'), { 'evidence.txt': 'not markdown' });
      expect(() => loadBenchTasks(root2)).toThrow(/corpus/);
    });
  });

  describe('runBenchTask grading', () => {
    function loadSingle(manifest: Record<string, unknown>): BenchTask {
      const root = tmp();
      writeTask(root, String(manifest.id), manifest);
      return loadBenchTasks(root)[0];
    }

    it('passes a supported task when the metric clears the target', async () => {
      const task = loadSingle(baseManifest('task-a'));
      const report = await runBenchTask(task, fakesFor(task.manifest, { score: 0.84 }));
      expect(report.pass).toBe(true);
      expect(report.id).toBe('task-a');
      expect(report.expected).toBe('supported');
      expect(report.actual).toBe('supported');
      expect(report.status).toBe('supported');
      expect(report.iterations).toBe(1);
      expect(report.metricKeyMatch).toBe(true);
      expect(report.planMetricKey).toBe('score');
      expect(report.metricDistance).toBeCloseTo(0.04, 8);
      expect(report.withinTolerance).toBe(true);   // 0.04 <= tolerance 0.05
      expect(report.sandboxed).toBe(false);        // advisory only without --require-docker
      expect(report.ingestStatus).toBe('skipped_no_tesserae');
      expect(report.workdir).toBeUndefined();
    });

    it('flags a large metric distance as outside tolerance (advisory — still passes)', async () => {
      const task = loadSingle(baseManifest('task-a'));
      const report = await runBenchTask(task, fakesFor(task.manifest, { score: 0.99 }));
      expect(report.pass).toBe(true);
      expect(report.withinTolerance).toBe(false);  // |0.99-0.8| > 0.05
    });

    it('passes a refuted task at exhausted status (ledger verdict, not thread status)', async () => {
      const task = loadSingle(baseManifest('task-a', { expectedVerdict: 'refuted' }));
      const report = await runBenchTask(task, fakesFor(task.manifest, { score: 0.5 }));
      expect(report.status).toBe('exhausted');     // thread status is NOT 'refuted'
      expect(report.actual).toBe('refuted');
      expect(report.pass).toBe(true);
      expect(report.iterations).toBe(2);
    });

    it('passes an inconclusive task when the decision metric is never reported', async () => {
      const task = loadSingle(baseManifest('task-a', { expectedVerdict: 'inconclusive' }));
      const report = await runBenchTask(task, fakesFor(task.manifest, {}));
      expect(report.actual).toBe('inconclusive');
      expect(report.pass).toBe(true);
      expect(report.metricDistance).toBeNull();
      expect(report.withinTolerance).toBeNull();
    });

    it('fails on an expectedVerdict mismatch', async () => {
      const task = loadSingle(baseManifest('task-a')); // expects supported
      const report = await runBenchTask(task, fakesFor(task.manifest, { score: 0.5 }));
      expect(report.actual).toBe('refuted');
      expect(report.pass).toBe(false);
    });

    it('fails on a metricKey mismatch even when the verdict matches', async () => {
      const task = loadSingle(baseManifest('task-a')); // decision metric: score
      const report = await runBenchTask(task, {
        spawn: makeSpawn({ key: 'other', comparator: '>=', target: 0.8 }),
        runner: makeRunner({ other: 0.9 }),
        kgClient: fakeKg(),
      });
      expect(report.actual).toBe('supported');     // verdict matches...
      expect(report.planMetricKey).toBe('other');
      expect(report.metricKeyMatch).toBe(false);   // ...but on the wrong metric
      expect(report.pass).toBe(false);
    });

    it('honors requireDocker: unsandboxed run fails, docker run passes', async () => {
      const task = loadSingle(baseManifest('task-a'));
      const unsandboxed = await runBenchTask(task, {
        ...fakesFor(task.manifest, { score: 0.84 }, 'subprocess'), requireDocker: true,
      });
      expect(unsandboxed.sandboxed).toBe(false);
      expect(unsandboxed.pass).toBe(false);
      const sandboxed = await runBenchTask(task, {
        ...fakesFor(task.manifest, { score: 0.84 }, 'docker'), requireDocker: true,
      });
      expect(sandboxed.sandboxed).toBe(true);
      expect(sandboxed.pass).toBe(true);
    });

    it('keeps the workdir with keepWorkdir and writes the exact pinned config', async () => {
      const task = loadSingle(baseManifest('task-a'));
      const report = await runBenchTask(task, {
        ...fakesFor(task.manifest, { score: 0.84 }), keepWorkdir: true,
      });
      expect(report.workdir).toBeDefined();
      const workdir = report.workdir as string;
      try {
        expect(fs.existsSync(workdir)).toBe(true);
        const cfg = JSON.parse(fs.readFileSync(path.join(workdir, '.planning', 'config.json'), 'utf8'));
        expect(cfg).toEqual(BENCH_WORKDIR_CONFIG);
        expect(cfg.research_sandbox).toBe('docker');
        expect(cfg.research_sandbox_network).toBe('none');
        expect(cfg.research_gates).toEqual({ experiment_execution: false, kg_write: false });
        expect(cfg.research_persist_knowledge).toBe(false);
        expect(cfg.research_eval_report).toBe(false);
        // Contained artifacts: the thread lives inside the workdir, and knowledge
        // promotion into the throwaway workdir is off.
        expect(fs.existsSync(path.join(workdir, '.planning', 'research', 'threads'))).toBe(true);
        expect(fs.existsSync(path.join(workdir, 'KNOWHOW.md'))).toBe(false);
      } finally {
        fs.rmSync(workdir, { recursive: true, force: true });
      }
    });

    it('merges extraConfig but pins the bench keys over it', async () => {
      const task = loadSingle(baseManifest('task-a'));
      const report = await runBenchTask(task, {
        ...fakesFor(task.manifest, { score: 0.84 }),
        keepWorkdir: true,
        extraConfig: { scheduler: { backends: ['claude'] }, research_persist_knowledge: true },
      });
      const workdir = report.workdir as string;
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(workdir, '.planning', 'config.json'), 'utf8'));
        expect(cfg.scheduler).toEqual({ backends: ['claude'] });
        expect(cfg.research_persist_knowledge).toBe(false); // pinned
      } finally {
        fs.rmSync(workdir, { recursive: true, force: true });
      }
    });

    it('removes the workdir when keepWorkdir is off (and reports canned error results)', async () => {
      const task = loadSingle(baseManifest('task-a'));
      let seenWorkdir = '';
      const report = await runBenchTask(task, {
        ingest: async () => ({ status: 'compiled', files: 1, detail: 'ok' }),
        runResearch: async (cwd: string) => {
          seenWorkdir = cwd;
          return { threadId: 'missing-thread', status: 'error', iterations: 0, errorReason: 'boom' };
        },
      });
      expect(seenWorkdir).toContain('grd-bench-');
      expect(fs.existsSync(seenWorkdir)).toBe(false); // cleaned up
      expect(report.workdir).toBeUndefined();
      expect(report.pass).toBe(false);
      expect(report.actual).toBeNull();
      expect(report.status).toBe('error');
      expect(report.errorReason).toBe('boom');
      expect(report.ingestStatus).toBe('compiled');
    });

    it('degrades (never fails the task) when ingest throws', async () => {
      const task = loadSingle(baseManifest('task-a'));
      const report = await runBenchTask(task, {
        ...fakesFor(task.manifest, { score: 0.84 }),
        ingest: async () => { throw new Error('kg exploded'); },
      });
      expect(report.ingestStatus).toMatch(/^ingest_failed: kg exploded/);
      expect(report.pass).toBe(true);
    });

    it('fails only the task (with errorReason) when the research loop throws', async () => {
      const task = loadSingle(baseManifest('task-a'));
      const report = await runBenchTask(task, {
        ingest: async () => ({ status: 'compiled', files: 1, detail: 'ok' }),
        runResearch: async () => { throw new Error('loop crashed'); },
      });
      expect(report.pass).toBe(false);
      expect(report.status).toBe('error');
      expect(report.errorReason).toBe('loop crashed');
      expect(report.iterations).toBe(0);
      expect(report.actual).toBeNull();
    });

    it('fails the returned-error channel even when a prior iteration left passing artifacts', async () => {
      // The orchestrator reports mid-loop crashes by RETURNING {status:'error'}
      // (errExit), not throwing — so runBenchTask's catch never fires and the
      // grade sees whatever iteration 1 left on disk. That stale supported
      // verdict + docker result.json must not pass (or satisfy requireDocker).
      const task = loadSingle(baseManifest('task-a'));
      const report = await runBenchTask(task, {
        ingest: async () => ({ status: 'compiled', files: 1, detail: 'ok' }),
        runResearch: async (cwd: string) => {
          writeStaleIteration1(cwd, 't1');
          return {
            threadId: 't1', status: 'error', iterations: 2,
            errorReason: 'hypothesizer spawn died',
          };
        },
        requireDocker: true,
      });
      expect(report.pass).toBe(false);
      expect(report.status).toBe('error');
      expect(report.errorReason).toBe('hypothesizer spawn died');
      expect(report.actual).toBeNull();       // stale verdict must not inflate verdictAccuracy
      expect(report.sandboxed).toBe(false);   // stale runner:'docker' must not claim a sandbox
      expect(report.planMetricKey).toBeNull();
      expect(report.iterations).toBe(2);
    });
  });

  describe('gradeTask (direct)', () => {
    const manifest: BenchManifest = {
      id: 'task-a', version: 1, question: 'q',
      metric: { key: 'score', comparator: '>=', target: 0.8, tolerance: 0.05 },
      expectedVerdict: 'supported',
    };

    it('returns actual=null and fails when the workdir has no ledger', () => {
      const workdir = tmp();
      const grade = gradeTask(manifest, { threadId: 'none', status: 'error', iterations: 0 }, workdir);
      expect(grade.actual).toBeNull();
      expect(grade.pass).toBe(false);
      expect(grade.planMetricKey).toBeNull();
      expect(grade.sandboxed).toBe(false);
    });

    it('reads the LAST ledger hypothesis and tolerates missing experiment artifacts', () => {
      const workdir = tmp();
      const mkHyp = (id: string, iteration: number, verdict: Verdict) => ({
        id, iteration, statement: 's', rationale: 'r', predictedOutcome: 'p',
        status: verdict, parentId: null, verdict,
      });
      appendHypothesis(workdir, 't1', mkHyp('h1', 1, 'refuted'));
      appendHypothesis(workdir, 't1', mkHyp('h2', 2, 'supported'));
      const grade = gradeTask(manifest, { threadId: 't1', status: 'supported', iterations: 2 }, workdir);
      expect(grade.actual).toBe('supported');      // last hypothesis, not h1
      expect(grade.planMetricKey).toBeNull();      // no plan.json on disk
      expect(grade.metricKeyMatch).toBe(false);
      expect(grade.pass).toBe(false);              // verdict alone is not enough
      expect(grade.metricDistance).toBeNull();
    });

    it('never reads stale artifacts for a non-graded status (error/paused)', () => {
      const workdir = tmp();
      writeStaleIteration1(workdir, 't1');         // would grade as a docker-sandboxed pass
      const errored = gradeTask(
        manifest, { threadId: 't1', status: 'error', iterations: 2, errorReason: 'spawn died' }, workdir,
      );
      expect(errored.pass).toBe(false);
      expect(errored.actual).toBeNull();
      expect(errored.metricKeyMatch).toBe(false);
      expect(errored.metricDistance).toBeNull();
      expect(errored.withinTolerance).toBeNull();
      expect(errored.sandboxed).toBe(false);
      expect(errored.status).toBe('error');
      expect(errored.errorReason).toBe('spawn died');
      expect(errored.iterations).toBe(2);
      // requireDocker cannot be satisfied by the stale result.json either
      expect(gradeTask(
        manifest, { threadId: 't1', status: 'error', iterations: 2 }, workdir, { requireDocker: true },
      ).pass).toBe(false);
      const paused = gradeTask(manifest, { threadId: 't1', status: 'paused', iterations: 1 }, workdir);
      expect(paused.pass).toBe(false);
      expect(paused.actual).toBeNull();
      expect(paused.status).toBe('paused');
    });
  });

  describe('runBench + aggregate', () => {
    function twoTaskRoot(): string {
      const root = tmp();
      writeTask(root, 'task-a', baseManifest('task-a'));                                     // expects supported
      writeTask(root, 'task-b', baseManifest('task-b', { expectedVerdict: 'refuted' }));     // expects refuted
      return root;
    }

    it('runs every task and aggregates deterministically', async () => {
      const root = twoTaskRoot();
      const res = await runBench({
        benchDir: root,
        spawn: makeSpawn({ key: 'score', comparator: '>=', target: 0.8 }),
        runner: makeRunner({ score: 0.9 }),        // supported everywhere
        kgClient: fakeKg(),
      });
      expect(res.total).toBe(2);
      expect(res.passed).toBe(1);                  // task-a passes, task-b wanted refuted
      expect(res.failed).toBe(1);
      expect(res.verdictAccuracy).toBe(0.5);
      expect(res.meanIterations).toBe(1);
      expect(res.tasks.map((t) => `${t.id}:${t.pass}`)).toEqual(['task-a:true', 'task-b:false']);
    });

    it('filters to --tasks ids', async () => {
      const root = twoTaskRoot();
      const res = await runBench({
        benchDir: root,
        taskIds: ['task-b'],
        spawn: makeSpawn({ key: 'score', comparator: '>=', target: 0.8 }),
        runner: makeRunner({ score: 0.5 }),        // refuted → task-b passes
        kgClient: fakeKg(),
      });
      expect(res.total).toBe(1);
      expect(res.tasks[0].id).toBe('task-b');
      expect(res.passed).toBe(1);
    });

    it('throws on an unknown task id', async () => {
      const root = twoTaskRoot();
      await expect(runBench({ benchDir: root, taskIds: ['nope'] })).rejects.toThrow(/unknown task id/);
    });

    it('aggregate separates full pass from verdict accuracy', () => {
      const t = (over: Partial<BenchTaskReport>): BenchTaskReport => ({
        id: 'x', ingestStatus: 'compiled', pass: false, expected: 'supported', actual: null,
        metricKey: 'score', planMetricKey: null, metricKeyMatch: false, metricDistance: null,
        withinTolerance: null, sandboxed: false, iterations: 0, status: 'exhausted', ...over,
      });
      const res = aggregate([
        t({ pass: true, actual: 'supported', iterations: 1 }),
        t({ actual: 'supported', iterations: 3 }),           // verdict hit, pass=false (key mismatch)
        t({ actual: 'refuted', iterations: 2 }),             // verdict miss
      ]);
      expect(res.total).toBe(3);
      expect(res.passed).toBe(1);
      expect(res.failed).toBe(2);
      expect(res.verdictAccuracy).toBe(0.6667);
      expect(res.meanIterations).toBe(2);
    });

    it('aggregates an empty run to zeros', () => {
      expect(aggregate([])).toEqual({
        total: 0, passed: 0, failed: 0, verdictAccuracy: 0, meanIterations: 0, tasks: [],
      });
    });

    it('defaultBenchTasksDir points at the committed task set', () => {
      const dir = defaultBenchTasksDir();
      expect(fs.existsSync(path.join(dir, 'noise-filter-recall', 'manifest.json'))).toBe(true);
    });
  });

  describe('committed starter tasks (offline end-to-end)', () => {
    // Canned experiment outcomes that mirror each task's frozen corpus.
    const CANNED: Record<string, Record<string, number>> = {
      'noise-filter-recall': { recall: 0.94 },       // evidence: meets target → supported
      'cache-latency-slo': { latency_p95_ms: 187 },  // evidence: misses SLO → refuted
      'dedup-precision-gap': {},                     // metric absent from corpus → inconclusive
    };

    it('all three fixtures grade to a pass with faithful fakes', async () => {
      const tasks = loadBenchTasks(REPO_BENCH_DIR);
      const reports: BenchTaskReport[] = [];
      for (const task of tasks) {
        reports.push(await runBenchTask(task, fakesFor(task.manifest, CANNED[task.manifest.id], 'docker')));
      }
      const res = aggregate(reports);
      expect(res.tasks.map((t) => `${t.id}:${t.actual}`)).toEqual([
        'cache-latency-slo:refuted',
        'dedup-precision-gap:inconclusive',
        'noise-filter-recall:supported',
      ]);
      expect(res.passed).toBe(3);
      expect(res.verdictAccuracy).toBe(1);
      expect(res.tasks.every((t) => t.sandboxed)).toBe(true);
      expect(res.meanIterations).toBeCloseTo(1.6667, 3);
    });
  });
});
