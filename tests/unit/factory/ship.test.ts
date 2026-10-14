'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { WorkOrder } from '../../../lib/factory/types';
import type { Evidence, ReportInput } from '../../../lib/factory/ship';
const ship = require('../../../lib/factory/ship') as {
  evidenceBody: (e: Evidence) => string;
  shipCandidate: (x: Exec, e: Evidence, wt: string, od: string) => { branch: string; prUrl: string | null; error: string | null; manual: string | null };
  writeReport: (od: string, r: ReportInput) => string;
};
const fx = require('./fixtures') as {
  tmpDir: (p: string) => string; git: (c: string, ...a: string[]) => string;
  makeRepo: (f: Record<string, string>) => string; realExec: Exec;
  fakeExec: (r: (a: string[]) => string, calls?: string[][]) => Exec; execFailure: (s: number, e: string) => Error;
  sampleOrder: (r: string, o?: Partial<WorkOrder>) => WorkOrder;
};
const { addWorktree } = require('../../../lib/factory/worktrees') as {
  addWorktree: (e: Exec, r: string, d: string, b: string) => string;
};

function evidence(repo: string): Evidence {
  return {
    order: fx.sampleOrder(repo), candidate: 'c1', hypothesis: 'Cache the index.', strategy: 'Cache it.',
    devMedian: 100, replicaDevMedian: 102, hiddenMedian: 104.25, changed: ['src/search.js'],
    tokens: 5000, hiddenQueriesUsed: 1,
  };
}

describe('shipCandidate', () => {
  it('commits the change on a factory branch, pushes it and opens a PR with the evidence', () => {
    const repo = fx.makeRepo({ 'src/search.js': 'slow' });
    const wt = addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(wt, 'src/search.js'), 'FAST');
    const calls: string[][] = [];
    const od = fx.tmpDir('grd-factory-od-');
    const r = ship.shipCandidate(fx.fakeExec(() => '', calls), evidence(repo), wt, od);
    expect(r).toEqual({ branch: 'factory/search-p95/c1', prUrl: 'https://github.com/acme/app/pull/7', error: null, manual: null });
    expect(calls).toContainEqual(expect.arrayContaining(['git', 'push', 'origin', 'HEAD:refs/heads/factory/search-p95/c1']));
    expect(calls.find((c) => c[0] === 'gh')).toEqual(expect.arrayContaining(['--head', 'factory/search-p95/c1', '--base', 'main']));
    expect(fx.git(repo, 'diff', '--name-only', 'main', 'factory/search-p95/c1').trim()).toBe('src/search.js');
    const body = String(fs.readFileSync(path.join(od, 'pr-body-c1.md'), 'utf8'));
    expect(body).toContain('`latency_p95_ms <= 120`');
    expect(body).toContain('| Hidden evaluation (median of 1) | 191.37 | 104.25 |');
  });

  it('returns the exact command to finish when PR creation fails', () => {
    const repo = fx.makeRepo({ 'src/search.js': 'slow' });
    const wt = addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(wt, 'src/search.js'), 'FAST');
    const base = fx.fakeExec(() => '');
    const exec: Exec = (b, a, o) => { if (b === 'gh') throw fx.execFailure(1, 'no permission'); return base(b, a, o); };
    const r = ship.shipCandidate(exec, evidence(repo), wt, fx.tmpDir('grd-factory-od-'));
    expect(r.prUrl).toBeNull();
    expect(r.error).toMatch(/PR creation failed: no permission/);
    expect(r.manual).toMatch(/^gh pr create --base main --head factory\/search-p95\/c1 /);
  });

  it('ships only the given paths even when a stray file is staged', () => {
    const repo = fx.makeRepo({ 'src/search.js': 'slow' });
    const wt = addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(wt, 'src/search.js'), 'FAST');
    fs.writeFileSync(path.join(wt, 'stray.txt'), 'oops');
    fx.git(wt, 'add', 'stray.txt');
    ship.shipCandidate(fx.fakeExec(() => ''), evidence(repo), wt, fx.tmpDir('grd-factory-od-'));
    expect(fx.git(repo, 'diff', '--name-only', 'main', 'factory/search-p95/c1').trim()).toBe('src/search.js');
  });

  it('returns a manual push command when the push fails', () => {
    const repo = fx.makeRepo({ 'src/search.js': 'slow' });
    const wt = addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(wt, 'src/search.js'), 'FAST');
    const base = fx.fakeExec(() => '');
    const exec: Exec = (b, a, o) => { if (a.includes('push')) throw fx.execFailure(1, 'rejected'); return base(b, a, o); };
    const r = ship.shipCandidate(exec, evidence(repo), wt, fx.tmpDir('grd-factory-od-'));
    expect(r.error).toMatch(/push failed: rejected/);
    expect(r.manual).toMatch(/^git -C .* push origin factory\/search-p95\/c1 && gh pr create /);
  });
});

describe('writeReport', () => {
  it('writes the stop reason, candidates and spend, and a status file', () => {
    const od = fx.tmpDir('grd-factory-od-');
    const p = ship.writeReport(od, {
      order: fx.sampleOrder('/abs/repo'), stop: 'plateau', prUrl: null, shipError: null, manual: null,
      events: [{ id: 'c1', at: 't', outcome: 'dev_miss', devMedian: 150 }],
      tokens: 1234, tokenCapEnforced: true, hiddenQueries: 0, warnings: ['a warning'],
    });
    const text = String(fs.readFileSync(p, 'utf8'));
    expect(text).toContain('**Stopped: plateau.**');
    expect(text).toContain('| c1 | dev_miss | 150 |');
    expect(text).toContain('a warning');
    expect(JSON.parse(String(fs.readFileSync(path.join(od, 'status.json'), 'utf8'))).stop).toBe('plateau');
  });
});
