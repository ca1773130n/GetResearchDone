#!/usr/bin/env node
'use strict';
// prepack hook: strip Python bytecode (__pycache__ dirs + *.pyc/*.pyo) from the
// package tree before `npm pack`/`npm publish` builds the tarball.
//
// .npmignore CANNOT exclude these: they live under the `files`-allowlisted `bin/`
// (including the vendored bin/vendor/autoresearch_core kernel), and npm does not
// apply .npmignore to paths a `files` entry explicitly includes. A pytest or
// harness_driver run regenerates the bytecode at any time, so we strip at pack time.
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const SKIP = new Set(['node_modules', '.git']);
let dirs = 0;
let files = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (name === '__pycache__') { rmSync(p, { recursive: true, force: true }); dirs++; }
      else walk(p);
    } else if (name.endsWith('.pyc') || name.endsWith('.pyo')) {
      rmSync(p, { force: true });
      files++;
    }
  }
}

walk(root);
// stderr, not stdout: prepack must not pollute `npm pack --json` machine output.
console.error(`strip-pycache: removed ${dirs} __pycache__ dir(s), ${files} loose .pyc/.pyo file(s)`);
