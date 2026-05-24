'use strict';
// Runs candidate-declared verification commands. Allowlist + path-separator
// rejection + SIGKILL timeout so planner-authored input cannot run arbitrary
// or destructive binaries during candidate selection.
import { spawnSync } from 'child_process';

const ALLOWLIST = new Set(['npx', 'npm', 'pnpm', 'yarn', 'node', 'tsx', 'tsc', 'eslint', 'jest', 'prettier']);

export function runVerification(cmds: string[], cwd: string): number {
  let passed = 0;
  let total = 0;
  for (const raw of cmds) {
    if (!raw.trim()) continue;
    total++;
    const argv = raw.trim().split(/\s+/);
    const exe = argv[0];
    if (exe.includes('/') || exe.includes('\\')) continue; // reject /bin/rm, ./rm
    if (!ALLOWLIST.has(exe)) continue;
    const r = spawnSync(exe, argv.slice(1), { cwd, timeout: 10000, killSignal: 'SIGKILL', stdio: 'pipe' });
    if (r.status === 0) passed++;
  }
  return total === 0 ? 0 : Math.round((passed / total) * 10);
}
