#!/usr/bin/env node
'use strict';

/**
 * scripts/sync-vendor.mjs
 *
 * Re-vendors the autoresearch_core kernel into bin/vendor/autoresearch_core,
 * replacing whatever is there. Run at GRD release time so the shipped copy
 * (used by bin/harness_driver.py when no compatible install is present) stays
 * in lockstep with the source package.
 *
 * Usage:
 *   node scripts/sync-vendor.mjs [<autoresearch-core-path>]
 *
 * The <autoresearch-core-path> is the autoresearch-core *repo root* (it must
 * contain an `autoresearch_core/` package dir). Resolution order:
 *   1. process.argv[2]
 *   2. env AUTORESEARCH_CORE_PATH
 *   3. default: /Users/neo/Developer/Projects/autoresearch-core
 *
 * After copying it strips __pycache__/*.pyc, reads the copied __init__.py
 * __version__, and asserts it is >= REQUIRED — exiting non-zero otherwise so a
 * stale or downgraded source can never be released.
 *
 * Node builtins only (fs, path, url).
 */

import {
  existsSync,
  rmSync,
  cpSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/** The minimum version the driver enforces (REQUIRED = (0, 4, 7)). */
const REQUIRED = [0, 4, 7];
const DEFAULT_SOURCE = '/Users/neo/Developer/Projects/autoresearch-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const destPkg = join(repoRoot, 'bin', 'vendor', 'autoresearch_core');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

/** Parse `__version__ = "X.Y.Z"` into a 3-int tuple. */
function parseVersion(source) {
  const match = source.match(/__version__\s*=\s*["']([^"']+)["']/);
  if (!match) {
    fail('no __version__ assignment found in copied __init__.py');
  }
  const parts = match[1].split('.').map((p) => parseInt(p, 10));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) {
    fail(`unparseable __version__: ${match[1]}`);
  }
  return { raw: match[1], tuple: [parts[0], parts[1], parts[2]] };
}

/** True iff version tuple `a` is >= tuple `b` (lexicographic). */
function gte(a, b) {
  for (let i = 0; i < b.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

/** Recursively delete __pycache__ dirs and *.pyc/*.pyo files; count survivors. */
function stripAndCount(dir) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__') {
        rmSync(full, { recursive: true, force: true });
        continue;
      }
      count += stripAndCount(full);
    } else if (entry.name.endsWith('.pyc') || entry.name.endsWith('.pyo')) {
      rmSync(full, { force: true });
    } else {
      count += 1;
    }
  }
  return count;
}

const sourceRoot = process.argv[2] || process.env.AUTORESEARCH_CORE_PATH || DEFAULT_SOURCE;
const sourcePkg = join(sourceRoot, 'autoresearch_core');

if (!existsSync(sourcePkg) || !statSync(sourcePkg).isDirectory()) {
  fail(
    `source package not found: ${sourcePkg}\n` +
      'pass the autoresearch-core repo root as argv[2] or set AUTORESEARCH_CORE_PATH.',
  );
}

// Replace the vendored copy wholesale (idempotent).
rmSync(destPkg, { recursive: true, force: true });
cpSync(sourcePkg, destPkg, { recursive: true });

const fileCount = stripAndCount(destPkg);

const initPath = join(destPkg, '__init__.py');
if (!existsSync(initPath)) {
  fail(`copied package is missing __init__.py at ${initPath}`);
}
const { raw, tuple } = parseVersion(readFileSync(initPath, 'utf8'));

if (!gte(tuple, REQUIRED)) {
  fail(
    `vendored __version__ ${raw} is below the required ${REQUIRED.join('.')}; ` +
      `refusing to ship a stale kernel from ${sourcePkg}`,
  );
}

console.log(`synced autoresearch_core ${raw} (>= ${REQUIRED.join('.')}) from ${sourcePkg}`);
console.log(`vendored ${fileCount} file(s) into ${destPkg}`);
