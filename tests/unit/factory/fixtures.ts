'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
import type { Exec } from '../../../lib/factory/exec';
import type { WorkOrder } from '../../../lib/factory/types';
const { GRADER_DIR } = require('../../../lib/factory/sandbox') as { GRADER_DIR: string };

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix)) as string;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }) as string;
}

/** A committed repo on branch main, with an `origin` remote that is never contacted. */
function makeRepo(files: Record<string, string>): string {
  const repo = tmpDir('grd-factory-repo-');
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'remote', 'add', 'origin', 'https://example.invalid/acme/app.git');
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), content);
  }
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

const realExec: Exec = (bin, args, opts = {}) => execFileSync(bin, args, {
  cwd: opts.cwd, timeout: opts.timeout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}) as string;

/** The host path a factory container mounts at /work. */
function mountedWorktree(args: string[]): string | null {
  for (const a of args) {
    const m = /^type=bind,src=(.+),dst=\/work$/.exec(a);
    if (m) return m[1];
  }
  return null;
}

/** The shell command a factory container runs: the argument after the last `-c`. */
function containerCommand(args: string[]): string {
  const i = args.lastIndexOf('-c');
  return i >= 0 ? args[i + 1] : '';
}

/** The fixture order's held-out run step, and the file it must write, so tests can route both. */
const HIDDEN_RUN = 'node bench/run.js --holdout';
const HIDDEN_OUTPUT = '.holdout-out.json';

/** True when these `docker run` args are the oracle's scoring step: no candidate code runs there. */
function isScoreStep(args: string[]): boolean {
  return containerCommand(args).startsWith(`sh ${GRADER_DIR}/`);
}

/** True when they are its run step: the candidate, executed against the held-out inputs. */
function isHiddenRunStep(args: string[]): boolean {
  return containerCommand(args) === HIDDEN_RUN;
}

/** What a real run step leaves behind — the output file — inside whatever it mounted at /work. */
function writeOracleOutput(args: string[], content = 'candidate output\n'): string {
  const wt = mountedWorktree(args);
  if (wt !== null) fs.writeFileSync(path.join(wt, HIDDEN_OUTPUT), content);
  return '';
}

/** A failing exec error, shaped like execFileSync's. */
function execFailure(status: number, stderr: string, stdout = ''): Error {
  return Object.assign(new Error(stderr), { status, stderr, stdout });
}

/** Real git; fake docker and gh. `onRun` answers each `docker run`. Every call is logged. */
function fakeExec(onRun: (args: string[]) => string, calls: string[][] = []): Exec {
  return (bin, args, opts) => {
    calls.push([bin, ...args]);
    if (bin === 'docker') {
      if (args[0] === 'version') return '27.0.0\n';
      if (args[0] === 'rm') return '';
      if (args[0] === 'run') return onRun(args);
      throw new Error(`unexpected docker ${args[0]}`);
    }
    if (bin === 'gh') {
      if (args[0] === 'auth') return 'Logged in\n';
      if (args[0] === 'pr') return 'https://github.com/acme/app/pull/7\n';
      throw new Error(`unexpected gh ${args[0]}`);
    }
    if (bin === 'git' && args.includes('push')) return '';
    return realExec(bin, args, opts);
  };
}

function sampleOrder(repo: string, over: Partial<WorkOrder> = {}): WorkOrder {
  return {
    version: 1, id: 'search-p95', repo, base: 'main', remote: 'origin',
    objective: 'Cut p95 latency of search.',
    contract: { metric: 'latency_p95_ms', comparator: '<=', target: 120 },
    editable: ['src/**'],
    sandbox: { image: 'node:22-bookworm', setup: '', memory: '1g', cpus: 1 },
    dev_eval: { command: 'node bench/run.js', repeats: 1, files: ['bench/run.js', 'package.json'] },
    hidden_eval: {
      run: HIDDEN_RUN, score: 'hidden/score.sh', output: HIDDEN_OUTPUT, repeats: 1,
    },
    budget: { tokens: 1000000, candidates: 3, hidden_queries: 2, wall_minutes: 60 },
    baseline: { dev: 187, hidden: 191.37, devSpread: 0 },
    ...over,
  };
}

/** Writes a saved order straight into `<home>/orders/<id>/vault`, as `save` would leave it. */
function installOrder(home: string, order: WorkOrder, scoreScript = 'echo HIDDEN_EVAL_MARKER\n'): string {
  const od = path.join(home, 'orders', order.id);
  fs.mkdirSync(path.join(od, 'vault', 'hidden'), { recursive: true });
  fs.writeFileSync(path.join(od, 'vault', 'order.json'), JSON.stringify(order, null, 2));
  fs.writeFileSync(path.join(od, 'vault', order.hidden_eval.score), scoreScript);
  return od;
}

/** Worktrees registered in a repo, including the repo's own. */
function worktreeCount(repo: string): number {
  return git(repo, 'worktree', 'list').split('\n').filter(Boolean).length;
}

module.exports = {
  tmpDir, git, makeRepo, realExec, mountedWorktree, containerCommand, execFailure,
  fakeExec, sampleOrder, installOrder, worktreeCount,
  HIDDEN_RUN, HIDDEN_OUTPUT, isScoreStep, isHiddenRunStep, writeOracleOutput,
};
