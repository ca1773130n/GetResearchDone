'use strict';
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
import type { Exec, ExecError } from './exec';
import type { Baseline, MeasureResult, SandboxSpec, WorkOrder } from './types';
import type { SandboxCtx } from './sandbox';
import type { Comparator } from '../research/types';
const { defaultExec } = require('./exec') as { defaultExec: Exec };
const { readDraft, writeDraft, markValidated, draftDir } = require('./order') as {
  readDraft: (h: string, id: string) => WorkOrder;
  writeDraft: (h: string, o: WorkOrder) => void;
  markValidated: (h: string, id: string) => void;
  draftDir: (h: string, id: string) => string;
};
const sb = require('./sandbox') as {
  DEFAULT_TIMEOUT_MS: number;
  hostUser: () => string | null;
  dockerReady: (e: Exec) => boolean;
  runSetup: (c: SandboxCtx, s: SandboxSpec, wt: string, label: string) => { ok: boolean; detail: string };
  measure: (c: SandboxCtx, s: SandboxSpec, wt: string, cmd: string, n: number, metric: string, label: string,
    hidden?: { src: string; dst: string }) => MeasureResult;
  spread: (xs: number[]) => number;
  removeRecordedContainers: (e: Exec, dir: string) => void;
};
const { matchesAny } = require('./gates') as { matchesAny: (p: string, g: string[]) => boolean };
const { addWorktree, removeWorktree } = require('./worktrees') as {
  addWorktree: (e: Exec, repo: string, dir: string, base: string) => string;
  removeWorktree: (e: Exec, repo: string, dir: string) => void;
};
const { compare } = require('../research/verdict') as { compare: (v: number, c: Comparator, t: number) => boolean };

export interface ScanReport {
  ecosystem: 'node' | 'python' | 'unknown';
  proposedImage: string | null;
  proposedSetup: string;
  dockerfile: boolean;
  devcontainer: boolean;
  measurements: Array<{ kind: 'npm-script' | 'make-target' | 'directory'; name: string; command: string; files: string[] }>;
  freeMemoryMb: number;
  proposedMemory: string;
}

const MEASURING = /bench|perf|test|eval/i;
const MEASURE_DIRS = new Set(['test', 'tests', 'bench', 'benchmarks', 'perf', 'eval', 'evals']);

function exists(repo: string, rel: string): boolean { return fs.existsSync(path.join(repo, rel)); }

/** Read-only look at a repo: what it can already measure, and how to run it in a container. */
function scanRepo(repo: string, freeMemBytes: number = os.freemem()): ScanReport {
  const measurements: ScanReport['measurements'] = [];
  let ecosystem: ScanReport['ecosystem'] = 'unknown';
  let proposedImage: string | null = null;
  let proposedSetup = '';
  if (exists(repo, 'package.json')) {
    ecosystem = 'node';
    proposedImage = 'node:22-bookworm';
    proposedSetup = exists(repo, 'pnpm-lock.yaml') ? 'npx --yes pnpm install --frozen-lockfile'
      : exists(repo, 'yarn.lock') ? 'npx --yes yarn install --frozen-lockfile'
        : exists(repo, 'package-lock.json') ? 'npm ci' : 'npm install';
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    for (const [name, script] of Object.entries(pkg.scripts || {})) {
      if (!MEASURING.test(name)) continue;
      const refs = script.split(/\s+/).filter((t) => t.includes('/') && exists(repo, t));
      measurements.push({ kind: 'npm-script', name, command: `npm run ${name}`, files: ['package.json', ...refs] });
    }
  } else if (exists(repo, 'pyproject.toml') || exists(repo, 'requirements.txt')) {
    ecosystem = 'python';
    if (exists(repo, 'uv.lock')) {
      proposedImage = 'ghcr.io/astral-sh/uv:python3.12-bookworm-slim';
      proposedSetup = 'uv sync --frozen';
    } else {
      proposedImage = 'python:3.12-slim';
      proposedSetup = exists(repo, 'requirements.txt')
        ? 'python -m venv .venv && .venv/bin/pip install -r requirements.txt'
        : 'python -m venv .venv && .venv/bin/pip install -e .';
    }
  }
  if (exists(repo, 'Makefile')) {
    const text = String(fs.readFileSync(path.join(repo, 'Makefile'), 'utf8'));
    for (const m of text.matchAll(/^([A-Za-z0-9_.-]+):(?!=)/gm)) {
      if (MEASURING.test(m[1])) measurements.push({ kind: 'make-target', name: m[1], command: `make ${m[1]}`, files: ['Makefile'] });
    }
  }
  for (const d of (fs.readdirSync(repo) as string[]).sort()) {
    if (MEASURE_DIRS.has(d) && fs.statSync(path.join(repo, d)).isDirectory()) {
      measurements.push({ kind: 'directory', name: d, command: '', files: [] });
    }
  }
  const freeMemoryMb = Math.floor(freeMemBytes / (1024 * 1024));
  return {
    ecosystem, proposedImage, proposedSetup,
    dockerfile: exists(repo, 'Dockerfile'),
    devcontainer: exists(repo, '.devcontainer'),
    measurements,
    freeMemoryMb,
    // Half of what is free, between 512 MB and 2 GB, so a runaway candidate cannot starve the machine.
    proposedMemory: `${Math.max(512, Math.min(2048, Math.floor(freeMemoryMb / 2)))}m`,
  };
}

export type CheckId = 'repo' | 'docker' | 'editable' | 'setup' | 'dev_eval' | 'hidden_eval' | 'base_fails' | 'tokens';
export interface CheckResult { id: CheckId; ok: boolean; detail: string; }
export interface ValidateReport { ok: boolean; checks: CheckResult[]; noisy: boolean; baseline?: Baseline; }

function failure(e: unknown): string {
  const err = e as ExecError;
  return String(err.stderr || err.message || e).trim().slice(0, 500);
}

/**
 * Every intake check, in order. Containers start only once the cheap checks pass. On success
 * the baseline is written into the draft and the draft is marked validated by content hash.
 * Spawns nothing, so it spends no tokens.
 */
function validateDraft(home: string, id: string, deps: { exec?: Exec; timeoutMs?: number } = {}): ValidateReport {
  const exec = deps.exec || defaultExec;
  const o = readDraft(home, id);
  const rule = `${o.contract.metric} ${o.contract.comparator} ${o.contract.target}`;
  const checks: CheckResult[] = [];
  const add = (c: CheckResult): boolean => { checks.push(c); return c.ok; };
  const done = (noisy = false, baseline?: Baseline): ValidateReport =>
    ({ ok: checks.every((c) => c.ok), checks, noisy, ...(baseline ? { baseline } : {}) });

  const repoIssues: string[] = [];
  const attempt = (bin: string, args: string[], msg: string): void => {
    try { exec(bin, args, { timeout: 30000 }); } catch (e) { repoIssues.push(`${msg} (${failure(e)})`); }
  };
  attempt('git', ['-C', o.repo, 'rev-parse', '--verify', `${o.base}^{commit}`], `base "${o.base}" is not a commit`);
  attempt('git', ['-C', o.repo, 'remote', 'get-url', o.remote], `remote "${o.remote}" is not configured`);
  attempt('gh', ['auth', 'status'], 'gh is not authenticated; run `gh auth login`');
  add({ id: 'repo', ok: repoIssues.length === 0, detail: repoIssues.join('; ') || `base ${o.base} resolves; remote ${o.remote} is set; gh is authenticated` });

  const docker = sb.dockerReady(exec);
  add({ id: 'docker', ok: docker, detail: docker ? 'docker is available' : 'docker is not available; the factory never runs candidate code on the host' });

  const tracked = repoIssues.length === 0
    ? exec('git', ['-C', o.repo, 'ls-tree', '-r', '--name-only', o.base]).split('\n').filter(Boolean) : [];
  const unmatched = o.editable.filter((g) => !tracked.some((f) => matchesAny(f, [g])));
  const overlap = o.dev_eval.files.filter((f) => matchesAny(f, o.editable));
  const missing = o.dev_eval.files.filter((f) => !tracked.includes(f));
  const editIssues = [
    unmatched.length ? `globs matching no file at ${o.base}: ${unmatched.join(', ')}` : '',
    overlap.length ? `evaluation files inside the editable paths: ${overlap.join(', ')}` : '',
    missing.length ? `evaluation files not tracked at ${o.base}: ${missing.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  add({ id: 'editable', ok: editIssues === '', detail: editIssues || `${o.editable.length} editable glob(s) match; no overlap with evaluation files` });

  if (!checks.every((c) => c.ok)) return done();

  const tmp = path.join(home, 'tmp', `validate-${id}-${crypto.randomBytes(3).toString('hex') as string}`);
  const wt = path.join(tmp, 'base');
  const ctx: SandboxCtx = { exec, ledgerDir: tmp, orderId: id, user: sb.hostUser(), timeoutMs: deps.timeoutMs ?? sb.DEFAULT_TIMEOUT_MS };
  try {
    addWorktree(exec, o.repo, wt, o.base);
    const setup = sb.runSetup(ctx, o.sandbox, wt, 'validate-setup');
    if (!add({ id: 'setup', ok: setup.ok, detail: setup.ok ? `setup works in ${o.sandbox.image}` : setup.detail })) return done();

    const dev = sb.measure(ctx, o.sandbox, wt, o.dev_eval.command, o.dev_eval.repeats, o.contract.metric, 'validate-dev');
    const devSpread = sb.spread(dev.values);
    const noisy = dev.ok && dev.median !== null && devSpread > Math.abs(dev.median - o.contract.target);
    add({
      id: 'dev_eval', ok: dev.ok,
      detail: dev.ok
        ? `median ${dev.median} over ${dev.values.length} run(s), spread ${devSpread}`
          + (noisy ? '; the spread exceeds the gap to the target, so the metric is too noisy to decide: raise dev_eval.repeats' : '')
        : `failed: ${dev.stderrExcerpt || `exit ${dev.exitCode}`}`,
    });

    const hiddenFile = path.join(draftDir(home, id), o.hidden_eval.script);
    const dst = `/grader-${crypto.randomBytes(4).toString('hex') as string}`;
    const hidden = fs.existsSync(hiddenFile)
      ? sb.measure(ctx, o.sandbox, wt, `sh ${dst}/${o.hidden_eval.script.slice('hidden/'.length)}`,
        o.hidden_eval.repeats, o.contract.metric, 'validate-hidden', { src: path.join(draftDir(home, id), 'hidden'), dst })
      : null;
    add({
      id: 'hidden_eval', ok: hidden !== null && hidden.ok,
      detail: hidden === null ? `${o.hidden_eval.script} does not exist in the draft`
        : hidden.ok ? `runs and prints ${o.contract.metric}` : `failed: ${hidden.stderrExcerpt || `exit ${hidden.exitCode}`}`,
    });

    const meets = (v: number | null): boolean => v !== null && compare(v, o.contract.comparator, o.contract.target);
    const measured = dev.ok && hidden !== null && hidden.ok;
    const alreadyMet = measured && (meets(dev.median) || meets((hidden as MeasureResult).median));
    add({
      id: 'base_fails', ok: measured && !alreadyMet,
      detail: !measured ? 'not checked: an evaluation failed'
        : alreadyMet ? `the unmodified code already meets ${rule}; pick a tighter target`
          : `the unmodified code misses ${rule} on both evaluations`,
    });
    add({
      id: 'tokens', ok: true,
      detail: 'checked at the first spawn of `gd factory run`, so validate spends no tokens; a backend that reports no token count disables the token cap, loudly',
    });

    if (!checks.every((c) => c.ok)) return done(noisy);
    const baseline: Baseline = { dev: dev.median as number, hidden: (hidden as MeasureResult).median as number, devSpread };
    writeDraft(home, { ...o, baseline });
    markValidated(home, id);
    return done(noisy, baseline);
  } finally {
    removeWorktree(exec, o.repo, wt);
    sb.removeRecordedContainers(exec, tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { scanRepo, validateDraft };
