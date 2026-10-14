'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { MeasureResult, SandboxSpec } from '../../../lib/factory/types';
import type { SandboxCtx } from '../../../lib/factory/sandbox';
const sb = require('../../../lib/factory/sandbox') as {
  buildContainerArgs: (s: Record<string, unknown>) => string[];
  runSetup: (c: SandboxCtx, s: SandboxSpec, wt: string, label: string) => { ok: boolean; detail: string };
  measure: (c: SandboxCtx, s: SandboxSpec, wt: string, cmd: string, n: number, metric: string, label: string,
    hidden?: { src: string; dst: string }) => MeasureResult;
  removeRecordedContainers: (exec: Exec, dir: string) => void;
  median: (xs: number[]) => number;
  spread: (xs: number[]) => number;
};
const { tmpDir, execFailure } = require('./fixtures') as {
  tmpDir: (p: string) => string; execFailure: (s: number, e: string, o?: string) => Error;
};

const SANDBOX: SandboxSpec = { image: 'node:22-bookworm', setup: 'npm ci', memory: '1g', cpus: 2 };
function ctxWith(exec: Exec): SandboxCtx {
  return { exec, ledgerDir: tmpDir('grd-factory-ledger-'), orderId: 'o1', user: '501:20', timeoutMs: 1000 };
}

describe('buildContainerArgs', () => {
  it('hardens, mounts the worktree, and never mounts the hidden directory writable', () => {
    const args = sb.buildContainerArgs({
      name: 'n', worktree: '/wt', sandbox: SANDBOX, network: 'none', command: 'npm run bench',
      user: '501:20', hiddenMount: { src: '/vault/hidden', dst: '/grader-ab' },
    });
    expect(args.slice(0, 4)).toEqual(['run', '--rm', '--name', 'n']);
    expect(args).toEqual(expect.arrayContaining(['--network', 'none', '--memory', '1g', '--cpus', '2', '--read-only']));
    expect(args).toContain('type=bind,src=/wt,dst=/work');
    expect(args).toContain('type=bind,src=/vault/hidden,dst=/grader-ab,readonly');
    expect(args.slice(-4)).toEqual(['sh', 'node:22-bookworm', '-c', 'npm run bench']);
    expect(args[args.indexOf('--user') + 1]).toBe('501:20');
    expect(args[args.indexOf('--env') + 1]).toBe('HOME=/tmp');
  });
});

describe('runSetup', () => {
  it('runs nothing when there is no setup command', () => {
    const calls: string[][] = [];
    const r = sb.runSetup(ctxWith((b, a) => { calls.push([b, ...a]); return ''; }), { ...SANDBOX, setup: ' ' }, '/wt', 's');
    expect(r.ok).toBe(true);
    expect(calls).toEqual([]);
  });
  it('runs setup with network on and reports a failure', () => {
    const calls: string[][] = [];
    const r = sb.runSetup(ctxWith((b, a) => { calls.push([b, ...a]); throw execFailure(1, 'npm ERR!'); }), SANDBOX, '/wt', 's');
    expect(calls[0]).toEqual(expect.arrayContaining(['--network', 'bridge']));
    expect(r).toEqual({ ok: false, detail: expect.stringContaining('npm ERR!') });
  });
});

describe('measure', () => {
  it('takes the median over repeats', () => {
    const outs = ['__RESULT__ {"lat": 30}', '__RESULT__ {"lat": 10}', '__RESULT__ {"lat": 20}'];
    let i = 0;
    const m = sb.measure(ctxWith(() => outs[i++]), SANDBOX, '/wt', 'b', 3, 'lat', 'dev');
    expect(m).toEqual(expect.objectContaining({ ok: true, values: [30, 10, 20], median: 20 }));
  });
  it('fails on a nonzero exit without further runs', () => {
    let runs = 0;
    const m = sb.measure(ctxWith(() => { runs++; throw execFailure(2, 'crash'); }), SANDBOX, '/wt', 'b', 3, 'lat', 'dev');
    expect(runs).toBe(1);
    expect(m).toEqual(expect.objectContaining({ ok: false, median: null, exitCode: 2, stderrExcerpt: 'crash' }));
  });
  it('fails when the metric is not printed', () => {
    const m = sb.measure(ctxWith(() => '__RESULT__ {"other": 1}'), SANDBOX, '/wt', 'b', 1, 'lat', 'dev');
    expect(m.ok).toBe(false);
    expect(m.stderrExcerpt).toMatch(/metric "lat" not printed/);
  });
});

describe('container ledger', () => {
  it('removes exactly the recorded containers and forgets them', () => {
    const calls: string[][] = [];
    const exec: Exec = (b, a) => { calls.push([b, ...a]); return '__RESULT__ {"lat": 1}'; };
    const ctx = ctxWith(exec);
    sb.measure(ctx, SANDBOX, '/wt', 'b', 2, 'lat', 'dev');
    const names = calls.filter((c) => c[1] === 'run').map((c) => c[c.indexOf('--name') + 1]);
    calls.length = 0;
    sb.removeRecordedContainers(exec, ctx.ledgerDir);
    expect(calls).toEqual(names.map((n) => ['docker', 'rm', '-f', n]));
    expect(fs.existsSync(path.join(ctx.ledgerDir, 'containers.jsonl'))).toBe(false);
  });
});

describe('median and spread', () => {
  it('handles odd and even lengths', () => {
    expect(sb.median([3, 1, 2])).toBe(2);
    expect(sb.median([4, 1, 3, 2])).toBe(2.5);
    expect(sb.spread([5, 9, 7])).toBe(4);
    expect(sb.spread([])).toBe(0);
  });
});
