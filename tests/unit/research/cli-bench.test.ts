'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureError, captureOutput, captureErrorAsync, captureOutputAsync } = require('../../helpers/setup') as {
  captureError: (fn: () => void) => { stderr: string; exitCode: number };
  captureOutput: (fn: () => void) => { stdout: string; exitCode: number };
  captureErrorAsync: (fn: () => Promise<void>) => Promise<{ stderr: string; exitCode: number }>;
  captureOutputAsync: (fn: () => Promise<void>) => Promise<{ stdout: string; exitCode: number }>;
};
import type {
  BenchAggregate, BenchTask, BenchTaskReport, RunBenchOpts,
} from '../../../lib/research/bench';
import type { BenchListDeps, BenchRunCliOpts, BenchRunDeps } from '../../../lib/research/cli-bench';

const { cmdBenchList, cmdBenchRun, readHostSpawnConfig } = require('../../../lib/research/cli-bench') as {
  cmdBenchList: (cwd: string, raw: boolean, deps?: BenchListDeps) => never;
  cmdBenchRun: (cwd: string, opts: BenchRunCliOpts, raw: boolean, deps?: BenchRunDeps) => Promise<never>;
  readHostSpawnConfig: (cwd: string) => Record<string, unknown>;
};

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-clibench-')) as string;
}

function fakeTask(id: string, expectedVerdict: 'supported' | 'refuted' | 'inconclusive'): BenchTask {
  return {
    manifest: {
      id, version: 1, question: `Q for ${id}? Decision metric: score >= 0.8`,
      metric: { key: 'score', comparator: '>=', target: 0.8 },
      expectedVerdict,
    },
    dir: `/bench/tasks/${id}`,
    corpusDir: `/bench/tasks/${id}/corpus`,
  };
}

function fakeReport(over: Partial<BenchTaskReport> = {}): BenchTaskReport {
  return {
    id: 'task-a', ingestStatus: 'skipped_no_tesserae', pass: true,
    expected: 'supported', actual: 'supported', metricKey: 'score', planMetricKey: 'score',
    planComparator: '>=', planTarget: 0.8, metricContractMatch: true,
    metricDistance: 0.04, withinTolerance: true, sandboxed: true,
    iterations: 1, status: 'supported', ...over,
  };
}

function fakeAggregate(tasks: BenchTaskReport[]): BenchAggregate {
  const passed = tasks.filter((t) => t.pass).length;
  return {
    total: tasks.length, passed, failed: tasks.length - passed,
    verdictAccuracy: 1, meanIterations: 1, tasks,
  };
}

describe('cli-bench', () => {
  describe('cmdBenchList', () => {
    const deps: BenchListDeps = {
      loadBenchTasks: () => [fakeTask('task-a', 'supported'), fakeTask('task-b', 'refuted')],
    };

    it('emits JSON by default', () => {
      const res = captureOutput(() => cmdBenchList(tmp(), false, deps));
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(res.stdout) as { total: number; tasks: Array<{ id: string; expectedVerdict: string }> };
      expect(parsed.total).toBe(2);
      expect(parsed.tasks.map((t) => t.id)).toEqual(['task-a', 'task-b']);
      expect(parsed.tasks[1].expectedVerdict).toBe('refuted');
    });

    it('emits one human line per task with --raw', () => {
      const res = captureOutput(() => cmdBenchList(tmp(), true, deps));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('task-a  [supported]  Q for task-a?');
      expect(res.stdout).toContain('task-b  [refuted]');
    });

    it('lists the committed starter tasks via the default loader', () => {
      const res = captureOutput(() => cmdBenchList(tmp(), true));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('noise-filter-recall');
      expect(res.stdout).toContain('cache-latency-slo');
      expect(res.stdout).toContain('dedup-precision-gap');
    });

    it('exits 1 when loading fails', () => {
      const res = captureError(() => cmdBenchList(tmp(), false, {
        loadBenchTasks: () => { throw new Error('no tasks found under /x'); },
      }));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/bench list: .*no tasks found/);
    });
  });

  describe('cmdBenchRun', () => {
    it('forwards parsed flags to runBench and emits JSON by default', async () => {
      const cwd = tmp();
      let seen: RunBenchOpts | null = null;
      const deps: BenchRunDeps = {
        runBench: async (opts: RunBenchOpts) => { seen = opts; return fakeAggregate([fakeReport()]); },
      };
      const res = await captureOutputAsync(() => cmdBenchRun(
        cwd, { tasks: ['task-a', 'task-b'], keepWorkdir: true, requireDocker: true }, false, deps,
      ));
      expect(res.exitCode).toBe(0);
      const parsed = JSON.parse(res.stdout) as BenchAggregate;
      expect(parsed.total).toBe(1);
      expect(parsed.passed).toBe(1);
      const captured = seen as unknown as RunBenchOpts;
      expect(captured.taskIds).toEqual(['task-a', 'task-b']);
      expect(captured.keepWorkdir).toBe(true);
      expect(captured.requireDocker).toBe(true);
      expect(captured.extraConfig).toEqual({}); // no host config in the tmp cwd
    });

    it('prints a human summary with --raw (PASS/FAIL lines + totals)', async () => {
      const cwd = tmp();
      const deps: BenchRunDeps = {
        runBench: async () => fakeAggregate([
          fakeReport(),
          fakeReport({
            id: 'task-b', pass: false, actual: 'refuted', sandboxed: false,
            metricDistance: null, workdir: '/tmp/grd-bench-xyz', iterations: 2, status: 'exhausted',
          }),
        ]),
      };
      const res = await captureOutputAsync(() => cmdBenchRun(cwd, {}, true, deps));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('PASS  task-a  expected=supported actual=supported iters=1 dist=0.04');
      expect(res.stdout).toContain('FAIL  task-b  expected=supported actual=refuted iters=2 UNSANDBOXED workdir=/tmp/grd-bench-xyz');
      expect(res.stdout).toContain('bench: 1/2 passed — verdict accuracy 100.0%, mean iterations 1');
    });

    it('passes the host scheduler/superpowers config through to runBench', async () => {
      const cwd = tmp();
      fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(cwd, '.planning', 'config.json'), JSON.stringify({
        scheduler: { backends: ['claude'] }, superpowers: { accounts: [] }, research_eval_report: true,
      }));
      let seen: RunBenchOpts | null = null;
      const deps: BenchRunDeps = {
        runBench: async (opts: RunBenchOpts) => { seen = opts; return fakeAggregate([]); },
      };
      await captureOutputAsync(() => cmdBenchRun(cwd, {}, false, deps));
      const captured = seen as unknown as RunBenchOpts;
      expect(captured.extraConfig).toEqual({
        scheduler: { backends: ['claude'] }, superpowers: { accounts: [] },
      }); // only spawn config passes through — research keys never do
    });

    it('exits 1 when runBench throws', async () => {
      const cwd = tmp();
      const deps: BenchRunDeps = {
        runBench: async () => { throw new Error('unknown task id(s): nope'); },
      };
      const res = await captureErrorAsync(() => cmdBenchRun(cwd, { tasks: ['nope'] }, false, deps));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/bench run: .*unknown task id/);
    });
  });

  describe('readHostSpawnConfig', () => {
    it('returns {} when the host has no config', () => {
      expect(readHostSpawnConfig(tmp())).toEqual({});
    });

    it('extracts only scheduler and superpowers', () => {
      const cwd = tmp();
      fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(cwd, '.planning', 'config.json'), JSON.stringify({
        scheduler: { s: 1 }, research_sandbox: 'subprocess', model_profile: 'balanced',
      }));
      expect(readHostSpawnConfig(cwd)).toEqual({ scheduler: { s: 1 } });
    });
  });
});
