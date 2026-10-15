'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
import type { Exec, ExecError } from './exec';
import type { MeasureResult, SandboxSpec } from './types';
const { hardenedRunFlags, dockerAvailable } = require('../research/docker-runner') as {
  hardenedRunFlags: (p: { network: string; memory: string; cpus: string }) => string[];
  dockerAvailable: (exec: (args: string[], o?: { timeout?: number }) => string, timeoutMs: number) => boolean;
};
const { parseMetricsLine } = require('../research/runner') as {
  parseMetricsLine: (s: string) => Record<string, number>;
};

/** Per-run timeout for one container, the same default the research loop uses. */
const DEFAULT_TIMEOUT_MS = Number(process.env.GRD_EXPERIMENT_TIMEOUT_MS) > 0
  ? Number(process.env.GRD_EXPERIMENT_TIMEOUT_MS) : 600000;

export interface SandboxCtx {
  exec: Exec;
  /** Where containers.jsonl records every container this run starts. */
  ledgerDir: string;
  orderId: string;
  user: string | null;
  timeoutMs: number;
}

export interface ContainerSpec {
  name: string;
  worktree: string;
  sandbox: SandboxSpec;
  network: 'none' | 'bridge';
  command: string;
  user: string | null;
  roMounts?: ReadonlyArray<{ src: string; dst: string }>;
}

function buildContainerArgs(s: ContainerSpec): string[] {
  return [
    'run', '--rm', '--name', s.name,
    ...hardenedRunFlags({ network: s.network, memory: s.sandbox.memory, cpus: String(s.sandbox.cpus) }),
    // The root filesystem is read-only; package managers need a writable home for caches.
    '--env', 'HOME=/tmp',
    '--mount', `type=bind,src=${s.worktree},dst=/work`, '-w', '/work',
    ...(s.roMounts || []).flatMap((m) => ['--mount', `type=bind,src=${m.src},dst=${m.dst},readonly`]),
    ...(s.user ? ['--user', s.user] : []),
    '--entrypoint', 'sh',
    s.sandbox.image,
    '-c', s.command,
  ];
}

/** Run containers as the host user, so files they write into a worktree stay removable. */
function hostUser(): string | null {
  return typeof process.getuid === 'function' && typeof process.getgid === 'function'
    ? `${process.getuid()}:${process.getgid()}` : null;
}

function dockerReady(exec: Exec): boolean {
  return dockerAvailable((args, o) => exec('docker', args, o), 5000);
}

function ledgerFile(dir: string): string { return path.join(dir, 'containers.jsonl'); }

function runContainer(
  ctx: SandboxCtx, spec: Omit<ContainerSpec, 'name' | 'user'>, label: string,
): { exitCode: number; stdout: string; stderr: string } {
  const name = `grd-factory-${ctx.orderId}-${label}-${crypto.randomBytes(3).toString('hex') as string}`;
  fs.mkdirSync(ctx.ledgerDir, { recursive: true });
  fs.appendFileSync(ledgerFile(ctx.ledgerDir), JSON.stringify({ name }) + '\n');
  try {
    const stdout = ctx.exec('docker', buildContainerArgs({ ...spec, name, user: ctx.user }), { timeout: ctx.timeoutMs });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as ExecError;
    if (err.signal === 'SIGTERM') {
      try { ctx.exec('docker', ['rm', '-f', name], { timeout: 15000 }); } catch { /* already gone */ }
    }
    return {
      exitCode: typeof err.status === 'number' ? err.status : 1,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || err.message || ''),
    };
  }
}

/** Removes exactly the containers this ledger recorded — never by pattern — then forgets them. */
function removeRecordedContainers(exec: Exec, dir: string): void {
  const file = ledgerFile(dir);
  if (!fs.existsSync(file)) return;
  for (const line of String(fs.readFileSync(file, 'utf8')).split('\n').filter(Boolean)) {
    let name: string;
    try { name = (JSON.parse(line) as { name: string }).name; } catch { continue; } // truncated by a crash mid-append
    try { exec('docker', ['rm', '-f', name], { timeout: 15000 }); } catch { /* --rm already removed it */ }
  }
  fs.rmSync(file, { force: true });
}

function runSetup(ctx: SandboxCtx, sandbox: SandboxSpec, worktree: string, label: string): { ok: boolean; detail: string } {
  if (sandbox.setup.trim() === '') return { ok: true, detail: 'no setup command' };
  const r = runContainer(ctx, { worktree, sandbox, network: 'bridge', command: sandbox.setup }, label);
  return r.exitCode === 0
    ? { ok: true, detail: '' }
    : { ok: false, detail: `setup exited ${r.exitCode}: ${r.stderr.slice(0, 2000)}` };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function spread(xs: number[]): number {
  return xs.length === 0 ? 0 : Math.max(...xs) - Math.min(...xs);
}

/** Runs `command` `repeats` times with network off and takes the median of `metric`. */
function measure(
  ctx: SandboxCtx, sandbox: SandboxSpec, worktree: string, command: string, repeats: number,
  metric: string, label: string,
): MeasureResult {
  const values: number[] = [];
  let lastStdout = '';
  for (let i = 1; i <= repeats; i++) {
    const r = runContainer(ctx, { worktree, sandbox, network: 'none', command }, `${label}-${i}`);
    lastStdout = r.stdout;
    if (r.exitCode !== 0) {
      return {
        ok: false, values, median: null, exitCode: r.exitCode,
        stdoutExcerpt: r.stdout.slice(0, 2000), stderrExcerpt: r.stderr.slice(0, 2000),
      };
    }
    const v = parseMetricsLine(r.stdout)[metric];
    if (typeof v !== 'number') {
      return {
        ok: false, values, median: null, exitCode: 0,
        stdoutExcerpt: r.stdout.slice(0, 2000), stderrExcerpt: `metric "${metric}" not printed as __RESULT__`,
      };
    }
    values.push(v);
  }
  return { ok: true, values, median: median(values), exitCode: 0, stdoutExcerpt: lastStdout.slice(0, 2000), stderrExcerpt: '' };
}

/** Where the scoring container sees the vault, and where the run container sees the inputs. */
const GRADER_DIR = '/grader';
const INPUTS_DIR = '/inputs';

export interface OracleSpec {
  /** The candidate's tree. The run step gets it read-write at /work; the score step never sees it. */
  worktree: string;
  /** The order's `hidden/` directory. Mounted read-only at /grader for the score step only. */
  vault: string;
  /** Order-private directory the output file is staged in for scoring. */
  stageRoot: string;
  /** Shell command for the run step, executed in the candidate's container. */
  run: string;
  /** Path of the scoring script, relative to `vault`. */
  score: string;
  /** Path the run step must write, relative to `worktree`. */
  output: string;
  /** Optional directory relative to `vault`, mounted read-only at /inputs for the run step. */
  inputs?: string;
}

/** Which half of the split evaluation failed: the candidate's run, or the human's scoring script. */
export interface OracleResult extends MeasureResult { failedPhase: 'run' | 'score' | null; }

/**
 * The real path of the candidate's output file, or why it cannot be read back.
 *
 * The candidate chose what sits at this path, and the copy that follows runs on the host, not
 * in the container — so a symlink here is resolved against the host's filesystem, not the
 * container's. `lstat` refuses a symlinked output outright, and comparing real paths catches
 * the same trick played on a parent directory. Both are needed: `lstat` on
 * `<worktree>/out/result.json` follows a symlinked `out/` before it ever examines
 * `result.json`.
 *
 * There is no check-then-copy race to close here: the run container has already exited, so
 * nothing is left to swap the file afterwards.
 */
function outputToRead(worktree: string, output: string): { path: string } | { why: string } {
  const produced = path.join(worktree, output);
  const notWritten = `the run step exited 0 without writing a regular file at ${output}`;
  let entry: { isFile: () => boolean };
  try {
    entry = fs.lstatSync(produced) as { isFile: () => boolean };
  } catch (e) {
    // Nothing there at all is the ordinary case: the candidate simply did not write it.
    return { why: (e as { code?: string }).code === 'ENOENT' ? notWritten
      : `${output} could not be examined: ${(e as Error).message}` };
  }
  if (!entry.isFile()) return { why: notWritten };
  try {
    const real = fs.realpathSync(produced) as string;
    const root = fs.realpathSync(worktree) as string;
    return real === root || real.startsWith(`${root}${path.sep}`)
      ? { path: real }
      : { why: `${output} resolves outside the worktree, so it was not read back` };
  } catch (e) {
    return { why: `${output} could not be examined: ${(e as Error).message}` };
  }
}

/**
 * One held-out measurement, in two containers, so the candidate's code and the scoring script
 * never share a filesystem.
 *
 * The run step executes the candidate in its own worktree with no part of the vault mounted
 * except `inputs`, and must write `output`. The score step then runs in a container whose /work
 * holds a copy of that one file and nothing else: no candidate code runs there, so reading
 * /grader is not something a candidate can do. Only the metric crosses back.
 *
 * A run step that exits nonzero, or that exits zero without writing its output, is the
 * candidate failing the held-out evaluation — not a broken evaluation — and `failedPhase`
 * says which, so the caller can keep that distinction out of the one bit it reports.
 */
function measureOracle(
  ctx: SandboxCtx, sandbox: SandboxSpec, spec: OracleSpec, repeats: number, metric: string, label: string,
): OracleResult {
  const values: number[] = [];
  let lastStdout = '';
  for (let i = 1; i <= repeats; i++) {
    const run = runContainer(ctx, {
      worktree: spec.worktree, sandbox, network: 'none', command: spec.run,
      roMounts: spec.inputs === undefined ? [] : [{ src: path.join(spec.vault, spec.inputs), dst: INPUTS_DIR }],
    }, `${label}-run-${i}`);
    if (run.exitCode !== 0) {
      return {
        ok: false, values, median: null, exitCode: run.exitCode, failedPhase: 'run',
        stdoutExcerpt: run.stdout.slice(0, 2000), stderrExcerpt: run.stderr.slice(0, 2000),
      };
    }
    const produced = outputToRead(spec.worktree, spec.output);
    if ('why' in produced) {
      return {
        ok: false, values, median: null, exitCode: 0, failedPhase: 'run',
        stdoutExcerpt: run.stdout.slice(0, 2000), stderrExcerpt: produced.why,
      };
    }
    const stage = path.join(spec.stageRoot, `${label}-${i}`);
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });
    try {
      // The output is whatever the candidate chose to write, so a copy that fails is the
      // candidate failing the evaluation — never an exception that takes the order down.
      try {
        fs.copyFileSync(produced.path, path.join(stage, path.basename(spec.output)));
      } catch (e) {
        return {
          ok: false, values, median: null, exitCode: 0, failedPhase: 'run',
          stdoutExcerpt: run.stdout.slice(0, 2000),
          stderrExcerpt: `${spec.output} could not be read back: ${(e as Error).message}`,
        };
      }
      const score = runContainer(ctx, {
        worktree: stage, sandbox, network: 'none', command: `sh ${GRADER_DIR}/${spec.score}`,
        roMounts: [{ src: spec.vault, dst: GRADER_DIR }],
      }, `${label}-score-${i}`);
      lastStdout = score.stdout;
      if (score.exitCode !== 0) {
        return {
          ok: false, values, median: null, exitCode: score.exitCode, failedPhase: 'score',
          stdoutExcerpt: score.stdout.slice(0, 2000), stderrExcerpt: score.stderr.slice(0, 2000),
        };
      }
      const v = parseMetricsLine(score.stdout)[metric];
      if (typeof v !== 'number') {
        return {
          ok: false, values, median: null, exitCode: 0, failedPhase: 'score',
          stdoutExcerpt: score.stdout.slice(0, 2000),
          stderrExcerpt: `metric "${metric}" not printed as __RESULT__`,
        };
      }
      values.push(v);
    } finally {
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  return {
    ok: true, values, median: median(values), exitCode: 0, failedPhase: null,
    stdoutExcerpt: lastStdout.slice(0, 2000), stderrExcerpt: '',
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS, GRADER_DIR, INPUTS_DIR, buildContainerArgs, hostUser, dockerReady, runSetup,
  measure, measureOracle, removeRecordedContainers, median, spread,
};
