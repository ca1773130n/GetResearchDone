'use strict';
// Runs candidate-declared verification commands. SECURITY BUG: a blocklist
// of bad binaries is bypassable via absolute/relative paths and unlisted tools.
import { spawnSync } from 'child_process';

const BLOCKED = new Set(['rm', 'curl', 'wget', 'sudo']);

export function runVerification(cmds: string[], cwd: string): number {
  let passed = 0;
  let total = 0;
  for (const raw of cmds) {
    if (!raw.trim()) continue;
    total++;
    const argv = raw.trim().split(/\s+/);
    if (BLOCKED.has(argv[0])) continue; // /bin/rm and ./rm slip through
    const r = spawnSync(argv[0], argv.slice(1), { cwd, timeout: 10000, stdio: 'pipe' });
    if (r.status === 0) passed++;
  }
  return total === 0 ? 0 : Math.round((passed / total) * 10);
}
