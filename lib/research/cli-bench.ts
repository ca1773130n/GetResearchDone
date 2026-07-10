'use strict';
const fs = require('fs');
const path = require('path');
const { output, error } = require('./../utils') as {
  output: (r: unknown, raw: boolean, rawVal?: unknown) => never;
  error: (m: string) => never;
};
import type { BenchAggregate, BenchTask, BenchTaskReport, RunBenchOpts } from './bench';
const { loadBenchTasks, runBench, defaultBenchTasksDir } = require('./bench') as {
  loadBenchTasks: (benchDir: string) => BenchTask[];
  runBench: (opts: RunBenchOpts) => Promise<BenchAggregate>;
  defaultBenchTasksDir: () => string;
};

export interface BenchListDeps {
  loadBenchTasks?: (benchDir: string) => BenchTask[];
  benchDir?: string;
}

/** `gd bench list` — JSON by default; --raw prints one `id [expectedVerdict] question` line per task. */
function cmdBenchList(_cwd: string, raw: boolean, deps: BenchListDeps = {}): never {
  const load = deps.loadBenchTasks || loadBenchTasks;
  let tasks: BenchTask[];
  try {
    tasks = load(deps.benchDir || defaultBenchTasksDir());
  } catch (e) {
    return error(`bench list: ${(e as Error).message}`);
  }
  const payload = {
    total: tasks.length,
    tasks: tasks.map((t: BenchTask) => ({
      id: t.manifest.id,
      question: t.manifest.question,
      expectedVerdict: t.manifest.expectedVerdict,
    })),
  };
  const text = payload.tasks
    .map((t) => `${t.id}  [${t.expectedVerdict}]  ${t.question}`)
    .join('\n') + '\n';
  return output(payload, raw, text);
}

export interface BenchRunCliOpts {
  tasks?: string[];
  keepWorkdir?: boolean;
  requireDocker?: boolean;
  benchDir?: string;
}

export interface BenchRunDeps {
  runBench?: (opts: RunBenchOpts) => Promise<BenchAggregate>;
}

/**
 * Scheduler/superpowers passthrough from the HOST project config: bench tasks
 * run in throwaway workdirs whose pinned config has no scheduler block, so live
 * agent spawns would otherwise always fail. The bench keys still win (bench.ts
 * pins them last), so this can never loosen the closed-world settings.
 */
function readHostSpawnConfig(cwd: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(cwd, '.planning/config.json'), 'utf8'),
    ) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (raw.scheduler !== undefined) out.scheduler = raw.scheduler;
    if (raw.superpowers !== undefined) out.superpowers = raw.superpowers;
    return out;
  } catch {
    return {};
  }
}

/** `gd bench run [--tasks a,b] [--keep-workdir] [--require-docker]` — JSON by default; --raw human summary. */
async function cmdBenchRun(
  cwd: string, opts: BenchRunCliOpts, raw: boolean, deps: BenchRunDeps = {},
): Promise<never> {
  const run = deps.runBench || runBench;
  let res: BenchAggregate;
  try {
    res = await run({
      benchDir: opts.benchDir,
      taskIds: opts.tasks,
      keepWorkdir: opts.keepWorkdir === true,
      requireDocker: opts.requireDocker === true,
      extraConfig: readHostSpawnConfig(cwd),
    });
  } catch (e) {
    return error(`bench run: ${(e as Error).message}`);
  }
  const lines = res.tasks.map((t: BenchTaskReport) =>
    `${t.pass ? 'PASS' : 'FAIL'}  ${t.id}  expected=${t.expected} actual=${t.actual ?? 'none'}`
    + ` iters=${t.iterations}`
    + (t.metricDistance !== null ? ` dist=${t.metricDistance}` : '')
    + (t.sandboxed ? '' : ' UNSANDBOXED')
    + (t.workdir ? ` workdir=${t.workdir}` : ''));
  const text = [
    ...lines,
    `bench: ${res.passed}/${res.total} passed — verdict accuracy `
    + `${(res.verdictAccuracy * 100).toFixed(1)}%, mean iterations ${res.meanIterations}`,
    '',
  ].join('\n');
  return output(res, raw, text);
}

module.exports = { cmdBenchList, cmdBenchRun, readHostSpawnConfig };
