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
  hiddenMount?: { src: string; dst: string };
}

function buildContainerArgs(s: ContainerSpec): string[] {
  return [
    'run', '--rm', '--name', s.name,
    ...hardenedRunFlags({ network: s.network, memory: s.sandbox.memory, cpus: String(s.sandbox.cpus) }),
    // The root filesystem is read-only; package managers need a writable home for caches.
    '--env', 'HOME=/tmp',
    '--mount', `type=bind,src=${s.worktree},dst=/work`, '-w', '/work',
    ...(s.hiddenMount ? ['--mount', `type=bind,src=${s.hiddenMount.src},dst=${s.hiddenMount.dst},readonly`] : []),
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
    const { name } = JSON.parse(line) as { name: string };
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
  metric: string, label: string, hiddenMount?: { src: string; dst: string },
): MeasureResult {
  const values: number[] = [];
  let lastStdout = '';
  for (let i = 1; i <= repeats; i++) {
    const r = runContainer(ctx, { worktree, sandbox, network: 'none', command, hiddenMount }, `${label}-${i}`);
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

module.exports = {
  DEFAULT_TIMEOUT_MS, buildContainerArgs, hostUser, dockerReady, runSetup, measure,
  removeRecordedContainers, median, spread,
};
