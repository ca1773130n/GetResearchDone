'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from './exec';

/** A detached worktree of `repo` at `base`. The user's own working copy is never touched. */
function addWorktree(exec: Exec, repo: string, dir: string, base: string): string {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  exec('git', ['-C', repo, 'worktree', 'add', '--detach', dir, base]);
  return dir;
}

/** Untracked, non-ignored paths; an untracked directory is one entry ending in "/". */
function untrackedPaths(exec: Exec, dir: string): string[] {
  return exec('git', ['-C', dir, 'ls-files', '--others', '--exclude-standard', '--directory'])
    .split('\n').filter(Boolean).sort();
}

/** Back to the state right after setup: tracked files at base, setup output kept. */
function restoreToSetupState(exec: Exec, dir: string, base: string, artifacts: ReadonlySet<string>): void {
  exec('git', ['-C', dir, 'reset', '--hard', base]);
  for (const p of untrackedPaths(exec, dir)) {
    if (!artifacts.has(p)) fs.rmSync(path.join(dir, p), { recursive: true, force: true });
  }
}

function removeWorktree(exec: Exec, repo: string, dir: string): void {
  try {
    exec('git', ['-C', repo, 'worktree', 'remove', '--force', dir]);
  } catch {
    // Not registered, or already half-removed: delete what is left of the directory.
    fs.rmSync(dir, { recursive: true, force: true });
  }
  try { exec('git', ['-C', repo, 'worktree', 'prune']); } catch { /* nothing registered */ }
}

/** Removes every worktree under `root`, the directory only this order creates worktrees in. */
function removeAllOwn(exec: Exec, repo: string, root: string): void {
  if (!fs.existsSync(root)) return;
  for (const name of fs.readdirSync(root) as string[]) removeWorktree(exec, repo, path.join(root, name));
}

/** Commits exactly `paths` on a new branch, so nothing outside the allowlist ever ships. */
function commitCandidate(exec: Exec, dir: string, branch: string, paths: string[], message: string): void {
  exec('git', ['-C', dir, 'checkout', '-q', '-b', branch]);
  exec('git', ['-C', dir, 'add', '--', ...paths]);
  exec('git', ['-C', dir, 'commit', '-q', '-m', message]);
}

module.exports = { addWorktree, untrackedPaths, restoreToSetupState, removeWorktree, removeAllOwn, commitCandidate };
