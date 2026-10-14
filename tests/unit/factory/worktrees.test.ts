'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
const w = require('../../../lib/factory/worktrees') as {
  addWorktree: (e: Exec, repo: string, dir: string, base: string) => string;
  untrackedPaths: (e: Exec, dir: string) => string[];
  restoreToSetupState: (e: Exec, dir: string, base: string, a: ReadonlySet<string>) => void;
  removeWorktree: (e: Exec, repo: string, dir: string) => void;
  removeAllOwn: (e: Exec, repo: string, root: string) => void;
  commitCandidate: (e: Exec, dir: string, branch: string, paths: string[], msg: string) => void;
};
const fx = require('./fixtures') as {
  tmpDir: (p: string) => string; git: (cwd: string, ...a: string[]) => string;
  makeRepo: (f: Record<string, string>) => string; realExec: Exec; worktreeCount: (r: string) => number;
};

describe('candidate worktrees', () => {
  it('adds a detached worktree at base and removes every own worktree', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a', 'README.md': 'r' });
    const root = fx.tmpDir('grd-factory-wt-');
    const a = w.addWorktree(fx.realExec, repo, path.join(root, 'c1'), 'main');
    w.addWorktree(fx.realExec, repo, path.join(root, 'c2'), 'main');
    expect(fs.readFileSync(path.join(a, 'src/a.js'), 'utf8')).toBe('a');
    expect(fx.git(a, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('HEAD');
    expect(fx.worktreeCount(repo)).toBe(3);
    w.removeAllOwn(fx.realExec, repo, root);
    expect(fx.worktreeCount(repo)).toBe(1);
  });

  it('removes a half-removed worktree whose git link is gone, then prunes it', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a' });
    const root = fx.tmpDir('grd-factory-wt-');
    const dir = w.addWorktree(fx.realExec, repo, path.join(root, 'c1'), 'main');
    fs.rmSync(path.join(dir, '.git'));
    w.removeAllOwn(fx.realExec, repo, root);
    expect(fs.existsSync(dir)).toBe(false);
    expect(fx.worktreeCount(repo)).toBe(1);
  });

  it('lists untracked directories as single entries', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a' });
    const dir = w.addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.mkdirSync(path.join(dir, '.venv/lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.venv/lib/x.py'), 'x');
    fs.writeFileSync(path.join(dir, 'src/new.js'), 'n');
    expect(w.untrackedPaths(fx.realExec, dir)).toEqual(['.venv/', 'src/new.js']);
  });

  it('restores a redesigned candidate to its setup state, keeping setup artifacts', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a' });
    const dir = w.addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.mkdirSync(path.join(dir, '.venv'));
    fs.writeFileSync(path.join(dir, '.venv/keep'), 'k');
    const artifacts = new Set(w.untrackedPaths(fx.realExec, dir));
    fs.writeFileSync(path.join(dir, 'src/a.js'), 'changed');
    fs.writeFileSync(path.join(dir, 'src/extra.js'), 'e');
    w.restoreToSetupState(fx.realExec, dir, 'main', artifacts);
    expect(fs.readFileSync(path.join(dir, 'src/a.js'), 'utf8')).toBe('a');
    expect(fs.existsSync(path.join(dir, 'src/extra.js'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.venv/keep'))).toBe(true);
  });

  it('commits exactly the given paths on a new branch', () => {
    const repo = fx.makeRepo({ 'src/a.js': 'a', 'README.md': 'r' });
    const dir = w.addWorktree(fx.realExec, repo, path.join(fx.tmpDir('grd-factory-wt-'), 'c1'), 'main');
    fs.writeFileSync(path.join(dir, 'src/a.js'), 'fast');
    fs.writeFileSync(path.join(dir, 'stray.log'), 'noise');
    w.commitCandidate(fx.realExec, dir, 'factory/o/c1', ['src/a.js'], 'factory: speed');
    expect(fx.git(repo, 'diff', '--name-only', 'main', 'factory/o/c1').trim()).toBe('src/a.js');
  });
});
