'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { WorkOrder } from '../../../lib/factory/types';
import type { Evidence, ReportInput } from '../../../lib/factory/ship';
const ship = require('../../../lib/factory/ship') as {
  evidenceBody: (e: Evidence) => string;
  commitForShipping: (x: Exec, o: WorkOrder, cand: string, strategy: string, changed: string[], wt: string) => string;
  discardBranch: (x: Exec, o: WorkOrder, cand: string) => void;
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

describe('commitForShipping', () => {
  it('commits exactly the given paths on the candidate branch, and discardBranch removes it', () => {
    const repo = fx.makeRepo({ 'src/search.js': 'slow' });
    const wtRoot = fx.tmpDir('grd-factory-wt-');
    const wt = addWorktree(fx.realExec, repo, path.join(wtRoot, 'c1'), 'main');
    fs.writeFileSync(path.join(wt, 'src/search.js'), 'FAST');
    fs.writeFileSync(path.join(wt, 'stray.txt'), 'oops');
    fx.git(wt, 'add', 'stray.txt');
    const order = fx.sampleOrder(repo);
    const branch = ship.commitForShipping(fx.realExec, order, 'c1', 'Cache it.', ['src/search.js'], wt);
    expect(branch).toBe('factory/search-p95/c1');
    expect(fx.git(repo, 'diff', '--name-only', 'main', branch).trim()).toBe('src/search.js');
    // A candidate the hidden gate rejects leaves no branch behind in the user's repo.
    fx.realExec('git', ['-C', repo, 'worktree', 'remove', '--force', wt]);
    ship.discardBranch(fx.realExec, order, 'c1');
    expect(fx.git(repo, 'branch', '--list', branch).trim()).toBe('');
    // Asking twice is not an error: the branch may never have been created.
    expect(() => ship.discardBranch(fx.realExec, order, 'c1')).not.toThrow();
  });
});

describe('shipCandidate', () => {
  it('pushes the candidate commit and opens a PR with the evidence', () => {
    const repo = fx.makeRepo({ 'src/search.js': 'slow' });
    const wt = addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(wt, 'src/search.js'), 'FAST');
    const calls: string[][] = [];
    const od = fx.tmpDir('grd-factory-od-');
    ship.commitForShipping(fx.realExec, fx.sampleOrder(repo), 'c1', 'Cache it.', ['src/search.js'], wt);
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
    expect(r.manual).toMatch(new RegExp(`^cd '${repo}' && gh pr create --base 'main' --head 'factory/search-p95/c1' `));
  });

  it('returns a manual push command when the push fails', () => {
    const repo = fx.makeRepo({ 'src/search.js': 'slow' });
    const wt = addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(wt, 'src/search.js'), 'FAST');
    const base = fx.fakeExec(() => '');
    const exec: Exec = (b, a, o) => { if (a.includes('push')) throw fx.execFailure(1, 'rejected'); return base(b, a, o); };
    const r = ship.shipCandidate(exec, evidence(repo), wt, fx.tmpDir('grd-factory-od-'));
    expect(r.error).toMatch(/push failed: rejected/);
    expect(r.manual).toMatch(new RegExp(`^cd '${repo}' && git push 'origin' 'factory/search-p95/c1' && cd '${repo}' && gh pr create `));
  });

  function failingPr(objective: string, ghOut?: string): { r: ReturnType<typeof ship.shipCandidate>; repo: string } {
    const repo = fx.makeRepo({ 'src/search.js': 'slow' });
    const wt = addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(wt, 'src/search.js'), 'FAST');
    const base = fx.fakeExec(() => '');
    const exec: Exec = (b, a, o) => {
      if (b === 'gh' && ghOut !== undefined) return ghOut;
      if (b === 'gh') throw fx.execFailure(1, 'no permission');
      return base(b, a, o);
    };
    const ev = evidence(repo);
    ev.order = fx.sampleOrder(repo, { objective });
    return { r: ship.shipCandidate(exec, ev, wt, fx.tmpDir('grd-factory-od-')), repo };
  }

  it('quotes the objective so the shell cannot expand it', () => {
    const { r, repo } = failingPr("x $(whoami) it's `id`");
    expect(r.manual).toContain(`cd '${repo}' && gh pr create`);
    expect(r.manual).toContain("--title 'factory: x $(whoami) it'\\''s `id`'");
  });

  it('treats a gh stdout whose last line is not a URL as a failed PR', () => {
    const { r } = failingPr('Cut p95.', 'https://github.com/acme/app/pull/7\nA new release of gh is available\n');
    expect(r.prUrl).toBeNull();
    expect(r.error).toMatch(/PR creation failed: gh printed no pull request URL/);
    expect(r.manual).toMatch(/^cd '.*' && gh pr create /);
  });

  it('treats empty gh stdout as a failed PR with a way to recover', () => {
    const { r } = failingPr('Cut p95.', '');
    expect(r.prUrl).toBeNull();
    expect(r.error).toMatch(/PR creation failed: gh printed no pull request URL: \(empty\)/);
    expect(r.manual).not.toBeNull();
  });
});

describe('writeReport', () => {
  it('writes the stop reason, candidates and spend, and a status file', () => {
    const od = fx.tmpDir('grd-factory-od-');
    const p = ship.writeReport(od, {
      order: fx.sampleOrder('/abs/repo'), stop: 'plateau', prUrl: null, shipError: null, manual: null,
      events: [{ id: 'c1', at: 't', outcome: 'dev_miss', devMedian: 150 }],
      tokens: 1234, unmeteredSpawns: 0, hiddenQueries: 0, warnings: ['a warning'],
    });
    const text = String(fs.readFileSync(p, 'utf8'));
    expect(text).toContain('**Stopped: plateau.**');
    expect(text).toContain('| c1 | dev_miss | 150 |');
    expect(text).toContain('a warning');
    expect(text).toContain('Tokens: 1234 of 1000000.');
    expect(JSON.parse(String(fs.readFileSync(path.join(od, 'status.json'), 'utf8'))).stop).toBe('plateau');
  });

  it('discloses that the counted spend is a floor when a backend reported nothing', () => {
    const od = fx.tmpDir('grd-factory-od-');
    const p = ship.writeReport(od, {
      order: fx.sampleOrder('/abs/repo'), stop: 'budget_spent', prUrl: null, shipError: null, manual: null,
      events: [], tokens: 50, unmeteredSpawns: 2, hiddenQueries: 0, warnings: [],
    });
    expect(String(fs.readFileSync(p, 'utf8'))).toContain('2 spawn(s) reported no token count, so the real spend is higher');
  });
});
