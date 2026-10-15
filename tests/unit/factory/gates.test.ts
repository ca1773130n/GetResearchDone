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
  HIDDEN_RUN: string; HIDDEN_OUTPUT: string;
  isScoreStep: (a: string[]) => boolean; isHiddenRunStep: (a: string[]) => boolean;
  writeOracleOutput: (a: string[], c?: string) => string;
  mountedWorktree: (a: string[]) => string | null;
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

  it('reports both ends of a rename so a protected file cannot be moved into scope', () => {
    const repo = fx.makeRepo({ 'bench/run.js': 'module.exports = 1;\n'.repeat(20), 'bench/keep.js': 'k' });
    fs.mkdirSync(path.join(repo, 'src/moved'), { recursive: true });
    fx.realExec('git', ['-C', repo, 'mv', 'bench/run.js', 'src/moved/run.js']);
    const changed = g.changedPaths(fx.realExec, repo, 'main');
    expect(changed).toEqual(['bench/run.js', 'src/moved/run.js']);
    expect(g.scopeCheck(changed, ['src/**'], ['bench/run.js']))
      .toEqual({ ok: false, violations: ['bench/run.js'] });
  });

  it('catches the marker on an added line whose text begins with "++ " and keeps attribution', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a\n', 'src/b.js': 'b\n' });
    fs.writeFileSync(path.join(repo, 'src/a.js'), 'a\n++ __RESULT__ {}\n');
    fs.writeFileSync(path.join(repo, 'src/b.js'), 'b\n__RESULT__\n');
    expect(g.tamperScan(fx.realExec, repo, 'main')).toEqual(['src/a.js', 'src/b.js']);
  });

  (process.getuid && process.getuid() === 0 ? it.skip : it)('treats an unreadable untracked file as tampering', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a\n' });
    const f = path.join(repo, 'src/locked.js');
    fs.writeFileSync(f, 'clean\n');
    fs.chmodSync(f, 0o000);
    try {
      expect(g.tamperScan(fx.realExec, repo, 'main')).toEqual(['src/locked.js']);
    } finally {
      fs.chmodSync(f, 0o644);
    }
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
  /**
   * `score` answers the scoring step; `run` answers the candidate's run step and defaults to
   * writing the output file, as a working candidate would.
   */
  function setup(
    score: () => string, over: Partial<WorkOrder> = {}, run?: (args: string[]) => string,
  ) {
    const home = fx.tmpDir('grd-factory-home-');
    const order = fx.sampleOrder('/abs/repo', over);
    const od = fx.installOrder(home, order);
    const wt = fx.tmpDir('grd-factory-wt-');
    const cmds: string[] = [];
    const calls: string[][] = [];
    const seen: string[][] = [];
    const exec: Exec = (_b, a) => {
      // The container is about to run: the write-ahead row must already be on disk.
      seen.push(g.readQueries(od).map((q) => q.status));
      calls.push(a); cmds.push(fx.containerCommand(a));
      return fx.isHiddenRunStep(a) ? (run ? run(a) : fx.writeOracleOutput(a)) : score();
    };
    const ctx: SandboxCtx = { exec, ledgerDir: od, orderId: order.id, user: null, timeoutMs: 1000 };
    return { order, od, ctx, wt, cmds, calls, seen };
  }

  const vaultMount = (calls: string[][], i: number, od: string): string | undefined =>
    calls[i].find((a) => a.includes(`src=${path.join(od, 'vault', 'hidden')}`));

  it('writes the query record before running, then the outcome', () => {
    const s = setup(() => '__RESULT__ {"latency_p95_ms": 100}');
    const r = g.hiddenGate(s.ctx, s.order, s.od, 'c1', s.wt);
    expect(r).toEqual({ outcome: 'pass', median: 100, detail: '' });
    expect(g.readQueries(s.od).map((q) => q.status)).toEqual(['started', 'pass']);
    expect(s.seen).toEqual([['started'], ['started']]);
    expect(s.cmds).toEqual([fx.HIDDEN_RUN, 'sh /grader/score.sh']);
  });

  it('never mounts the vault into the container that runs candidate code', () => {
    const s = setup(() => '__RESULT__ {"latency_p95_ms": 100}');
    g.hiddenGate(s.ctx, s.order, s.od, 'c1', s.wt);
    // The run step: the candidate's own tree at /work, and nothing of the vault anywhere.
    expect(fx.mountedWorktree(s.calls[0])).toBe(s.wt);
    expect(vaultMount(s.calls, 0, s.od)).toBeUndefined();
    expect(s.calls[0].join(' ')).not.toContain('/grader');
    // The scoring step: the vault read-only, and a /work that is NOT the candidate's tree.
    expect(vaultMount(s.calls, 1, s.od))
      .toBe(`type=bind,src=${path.join(s.od, 'vault', 'hidden')},dst=/grader,readonly`);
    expect(fx.mountedWorktree(s.calls[1])).not.toBe(s.wt);
  });

  // The mount layout, the staging copy and its cleanup are measureOracle's own, and are
  // covered in sandbox.test.ts; what matters here is what the gate makes of the result.

  it('counts a query even when the scoring script crashes, and calls that broken', () => {
    const s = setup(() => { throw fx.execFailure(1, 'segfault'); });
    const r = g.hiddenGate(s.ctx, s.order, s.od, 'c1', s.wt);
    expect(r.outcome).toBe('broken');
    expect(r.detail).toContain('segfault');
    expect(g.queriesUsed(s.od)).toBe(1);
  });

  it('calls a candidate that crashes under the evaluation a failure, not a broken evaluation', () => {
    const s = setup(() => '__RESULT__ {"latency_p95_ms": 100}', {},
      () => { throw fx.execFailure(1, 'candidate segfault'); });
    const r = g.hiddenGate(s.ctx, s.order, s.od, 'c1', s.wt);
    expect(r.outcome).toBe('fail');
    // Only the run step ran: a candidate that cannot run is never scored.
    expect(s.cmds).toEqual([fx.HIDDEN_RUN]);
    expect(g.readQueries(s.od).map((q) => q.status)).toEqual(['started', 'fail']);
  });

  it('calls a run step that writes no output a failure', () => {
    const s = setup(() => '__RESULT__ {"latency_p95_ms": 100}', {}, () => '');
    const r = g.hiddenGate(s.ctx, s.order, s.od, 'c1', s.wt);
    expect(r.outcome).toBe('fail');
    expect(r.detail).toContain(fx.HIDDEN_OUTPUT);
    expect(s.cmds).toEqual([fx.HIDDEN_RUN]);
  });

  it('refuses to run once the query budget is spent', () => {
    const s = setup(() => '__RESULT__ {"latency_p95_ms": 150}', { budget: { tokens: 1, candidates: 1, hidden_queries: 1, wall_minutes: 1 } });
    expect(g.hiddenGate(s.ctx, s.order, s.od, 'c1', s.wt).outcome).toBe('fail');
    expect(() => g.hiddenGate(s.ctx, s.order, s.od, 'c2', s.wt)).toThrow(/query budget already spent/);
  });
});
