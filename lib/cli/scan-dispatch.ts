'use strict';

/**
 * GRD CLI/ScanDispatch -- Pure file-resolution helpers for `gd scan`.
 *
 * Given a mode (staged/diff/file/all) and cwd, return the set of markdown
 * files to scan. Kept separate from runScan so it can be unit-tested without
 * filesystem state from the whole repo.
 *
 * SECURITY: all git calls use execFileSync('git', [args]) — never a shell
 * string template. User-controlled values (e.g. --diff <base>) flow through
 * as positional argv, not shell tokens.
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const { execFileSync } = require('child_process') as typeof import('child_process');

import type { ScanMode } from '../commands/scan';

export interface ResolveScanOpts {
  mode: ScanMode;
  cwd: string;
  filePath?: string;
  diffBase?: string;
}

const SCAN_DIRS = ['commands', 'agents', 'templates', 'docs'];

export function resolveScanFiles(opts: ResolveScanOpts): string[] {
  const { mode, cwd } = opts;
  switch (mode) {
    case 'file':
      return _resolveFile(opts);
    case 'all':
      return _resolveAll(cwd);
    case 'staged':
      return _resolveStaged(cwd);
    case 'diff':
      return _resolveDiff(cwd, opts.diffBase || 'origin/main');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _resolveFile(opts: ResolveScanOpts): string[] {
  if (!opts.filePath) {
    throw new Error('--file mode requires a file path');
  }
  if (!fs.existsSync(opts.filePath)) {
    throw new Error(`file not found: ${opts.filePath}`);
  }
  return [opts.filePath];
}

function _resolveAll(cwd: string): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    const full = path.join(cwd, dir);
    if (!fs.existsSync(full)) continue;
    _walkMarkdown(full, files);
  }
  return files;
}

function _resolveStaged(cwd: string): string[] {
  const out = _safeGit(['diff', '--cached', '--name-only', '--', '*.md'], cwd);
  if (out === null) return [];
  return _absolutizeAndFilter(out, cwd);
}

function _resolveDiff(cwd: string, base: string): string[] {
  const out = _safeGit(
    ['diff', '--name-only', `${base}...HEAD`, '--', '*.md'],
    cwd
  );
  if (out === null) {
    throw new Error(`git diff failed against base ${base}`);
  }
  return _absolutizeAndFilter(out, cwd);
}

function _safeGit(args: string[], cwd: string): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function _absolutizeAndFilter(raw: string, cwd: string): string[] {
  return raw
    .split('\n')
    .filter((x) => x.length > 0)
    .map((f) => path.join(cwd, f))
    .filter((f) => fs.existsSync(f));
}

function _walkMarkdown(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'superpowers' && path.basename(dir) === 'docs') continue;
      _walkMarkdown(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
}

module.exports = { resolveScanFiles };
