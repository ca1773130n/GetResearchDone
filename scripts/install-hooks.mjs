#!/usr/bin/env node
'use strict';

/**
 * scripts/install-hooks.mjs
 *
 * Installs a vanilla .git/hooks/pre-commit stub that runs `gd scan` on
 * staged markdown files. Opt-in — not installed by postinstall.
 *
 * Usage:
 *   node scripts/install-hooks.mjs          # refuses if hook exists
 *   node scripts/install-hooks.mjs --force  # overwrites existing hook
 */

import { existsSync, writeFileSync, chmodSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

function findGitDir() {
  try {
    // SECURITY: execFileSync with array args, no shell.
    const out = execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    return out.startsWith('/') ? out : join(repoRoot, out);
  } catch {
    console.error('error: not inside a git repository');
    process.exit(1);
  }
}

const gitDir = findGitDir();
const hookPath = join(gitDir, 'hooks', 'pre-commit');
const force = process.argv.includes('--force');

if (existsSync(hookPath) && !force) {
  console.error(`error: ${hookPath} already exists. Use --force to overwrite.`);
  process.exit(1);
}

const stub = `#!/usr/bin/env bash
# Installed by 'npm run hooks:install' — see scripts/install-hooks.mjs
# Runs gd scan on staged markdown files. Remove this file to disable.
exec npx gd scan
`;

mkdirSync(dirname(hookPath), { recursive: true });
writeFileSync(hookPath, stub);
chmodSync(hookPath, 0o755);

console.log(`installed pre-commit hook at ${hookPath}`);
console.log('the hook will run "gd scan" on staged .md files before each commit.');
