'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { QueryRecord, WorkOrder } from '../../../lib/factory/types';
import type { SandboxCtx } from '../../../lib/factory/sandbox';
const g = require('../../../lib/factory/gates') as {
  matchesAny: (p: string, globs: string[]) => boolean;
  changedPaths: (e: Exec, dir: string, base: string) => string[];
  scopeCheck: (c: string[], ed: string[], prot: string[]) => { ok: boolean; violations: string[] };
  tamperScan: (e: Exec, dir: string, base: string) => string[];
  readQueries: (od: string) => QueryRecord[];
  queriesUsed: (od: string) => number;
  hiddenGate: (c: SandboxCtx, o: WorkOrder, od: string, cand: string, wt: string) =>
    { outcome: 'pass' | 'fail' | 'broken'; median: number | null; detail: string };
};
const fx = require('./fixtures') as {
  tmpDir: (p: string) => string; makeRepo: (f: Record<string, string>) => string; realExec: Exec;
  sampleOrder: (repo: string, over?: Partial<WorkOrder>) => WorkOrder;
  installOrder: (home: string, o: WorkOrder, script?: string) => string;
  containerCommand: (a: string[]) => string; execFailure: (s: number, e: string) => Error;
};

describe('globs', () => {
  it.each([
    ['src/a.js', ['src/**'], true],
    ['src/deep/b.ts', ['src/**'], true],
    ['src/new/', ['src/**'], true],
    ['srcx/a.js', ['src/**'], false],
    ['lib/a.js', ['src/*.js'], false],
    ['src/a.js', ['src/*.js'], true],
    ['src/d/a.js', ['src/*.js'], false],
    ['a.test.js', ['**/*.test.js'], true],
    ['x/a.test.js', ['**/*.test.js'], true],
    ['src/a.js', ['src/?.js'], true],
    ['src/ab.js', ['src/?.js'], false],
    ['src//a.js', ['src/?/a.js'], false],
  ])('%s against %j is %s', (p, globs, expected) => {
    expect(g.matchesAny(p, globs)).toBe(expected);
  });
});

describe('scope and tamper', () => {
  it('lists tracked changes and untracked paths against base', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a', 'README.md': 'r' });
    fs.writeFileSync(path.join(repo, 'src/a.js'), 'b');
    fs.writeFileSync(path.join(repo, 'notes.txt'), 'n');
    expect(g.changedPaths(fx.realExec, repo, 'main')).toEqual(['notes.txt', 'src/a.js']);
  });

  it('rejects paths outside the allowlist and protected evaluation files', () => {
    expect(g.scopeCheck(['src/a.js', 'README.md', 'bench/run.js'], ['src/**', 'bench/**'], ['bench/run.js']))
      .toEqual({ ok: false, violations: ['README.md', 'bench/run.js'] });
    expect(g.scopeCheck(['src/a.js'], ['src/**'], [])).toEqual({ ok: true, violations: [] });
  });

  it('finds the result marker in added lines and in untracked files, not in removed lines', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'console.log("__RESULT__ old")\n', 'src/b.js': 'b\n' });
    fs.writeFileSync(path.join(repo, 'src/a.js'), 'clean\n');
    fs.writeFileSync(path.join(repo, 'src/b.js'), 'b\nprint("__RESULT__ {}")\n');
    fs.mkdirSync(path.join(repo, 'src/new'));
    fs.writeFileSync(path.join(repo, 'src/new/c.js'), '__RESULT__');
    expect(g.tamperScan(fx.realExec, repo, 'main')).toEqual(['src/b.js', 'src/new/c.js']);
  });
});

describe('hiddenGate', () => {
  function setup(stdout: () => string, over: Partial<WorkOrder> = {}) {
    const home = fx.tmpDir('grd-factory-home-');
    const order = fx.sampleOrder('/abs/repo', over);
    const od = fx.installOrder(home, order);
    const cmds: string[] = [];
    const calls: string[][] = [];
    const exec: Exec = (_b, a) => { calls.push(a); cmds.push(fx.containerCommand(a)); return stdout(); };
    const ctx: SandboxCtx = { exec, ledgerDir: od, orderId: order.id, user: null, timeoutMs: 1000 };
    return { order, od, ctx, cmds, calls };
  }

  it('writes the query record before running, then the outcome', () => {
    const s = setup(() => '__RESULT__ {"latency_p95_ms": 100}');
    const r = g.hiddenGate(s.ctx, s.order, s.od, 'c1', '/wt');
    expect(r).toEqual({ outcome: 'pass', median: 100, detail: '' });
    expect(g.readQueries(s.od).map((q) => q.status)).toEqual(['started', 'pass']);
    expect(s.cmds[0]).toMatch(/^sh \/grader-[0-9a-f]{8}\/eval\.sh$/);
    const dst = /^sh (\/grader-[0-9a-f]{8})\//.exec(s.cmds[0])![1];
    expect(s.calls[0]).toContain(`type=bind,src=${path.join(s.od, 'vault', 'hidden')},dst=${dst},readonly`);
  });

  it('counts a query even when the evaluation crashes', () => {
    const s = setup(() => { throw fx.execFailure(1, 'segfault'); });
    const r = g.hiddenGate(s.ctx, s.order, s.od, 'c1', '/wt');
    expect(r.outcome).toBe('broken');
    expect(g.queriesUsed(s.od)).toBe(1);
  });

  it('refuses to run once the query budget is spent', () => {
    const s = setup(() => '__RESULT__ {"latency_p95_ms": 150}', { budget: { tokens: 1, candidates: 1, hidden_queries: 1, wall_minutes: 1 } });
    expect(g.hiddenGate(s.ctx, s.order, s.od, 'c1', '/wt').outcome).toBe('fail');
    expect(() => g.hiddenGate(s.ctx, s.order, s.od, 'c2', '/wt')).toThrow(/query budget already spent/);
  });
});
