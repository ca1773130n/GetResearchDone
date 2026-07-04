/**
 * Guard test for the vendored autoresearch_core kernel.
 *
 * The harness driver (bin/harness_driver.py) imports `autoresearch_core`,
 * which now ships inside the npm package at bin/vendor/autoresearch_core/.
 * These are pure fs reads (no spawning): they fail loudly if the vendored
 * copy goes missing, drifts below the version the driver requires, loses a
 * key module, or if packaging hygiene (.npmignore) regresses and __pycache__
 * bytecode would be published.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const VENDOR_DIR = path.join(REPO_ROOT, 'bin', 'vendor', 'autoresearch_core');
// The minimum version the driver enforces (REQUIRED = (0, 4, 7)).
const REQUIRED: readonly [number, number, number] = [0, 4, 7];

/** Parse `__version__ = "X.Y.Z"` from an __init__.py source string. */
function parseVersion(source: string): [number, number, number] {
  const match = source.match(/__version__\s*=\s*["']([^"']+)["']/);
  if (!match) {
    throw new Error('no __version__ assignment found in __init__.py');
  }
  const parts = match[1].split('.').map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error(`unparseable __version__: ${match[1]}`);
  }
  return [parts[0], parts[1], parts[2]];
}

/** True iff version tuple `a` is >= tuple `b` (lexicographic). */
function gte(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < b.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

describe('vendored autoresearch_core kernel', () => {
  it('ships an __init__.py', () => {
    const initPath = path.join(VENDOR_DIR, '__init__.py');
    expect(fs.existsSync(initPath)).toBe(true);
  });

  it('declares a __version__ >= the version the driver requires', () => {
    const source = fs.readFileSync(path.join(VENDOR_DIR, '__init__.py'), 'utf8');
    const version = parseVersion(source);
    expect(gte(version, REQUIRED)).toBe(true);
  });

  it('includes the key kernel modules', () => {
    for (const mod of ['types.py', 'rounds.py', 'policy.py', 'verdict.py']) {
      expect(fs.existsSync(path.join(VENDOR_DIR, mod))).toBe(true);
    }
  });
});

describe('npm packaging hygiene', () => {
  const { execFileSync } = require('child_process') as typeof import('child_process');

  // The real contract: the PUBLISHED package ships the vendored .py kernel but NO
  // Python bytecode. .npmignore cannot exclude __pycache__/*.pyc under the `files`
  // allowlisted bin/, so the `prepack` hook (scripts/strip-pycache.mjs) does — and
  // `npm pack --dry-run` runs prepack, so this asserts the actual shipped file list.
  it('publishes the vendored .py kernel but no __pycache__/.pyc bytecode', () => {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json'],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000 });
    const entries = JSON.parse(out.slice(out.indexOf('['))) as Array<{ files: Array<{ path: string }> }>;
    const files = entries[0].files.map((f) => f.path);
    expect(files.filter((p) => p.includes('__pycache__') || p.endsWith('.pyc') || p.endsWith('.pyo'))).toEqual([]);
    expect(files.filter((p) => /bin\/vendor\/autoresearch_core\/.*\.py$/.test(p)).length).toBeGreaterThanOrEqual(10);
  });
});
