'use strict';
const fs = require('fs');
const path = require('path');
// execFileSync only (NOT exec): no shell, args passed as an array (injection-safe).
// Tests inject a stub `run` so no real process is spawned.
const { execFileSync } = require('child_process');

type RunFn = (bin: string, args: string[], cwd: string) => string;

const defaultRun: RunFn = (bin, args, cwd) =>
  execFileSync(bin, args, { cwd, encoding: 'utf8', timeout: 120000 });

function kgPath(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id, 'kg.json');
}

function writeKgProvenance(
  cwd: string, id: string, data: { read?: string[]; wrote?: string[] },
): void {
  const p = kgPath(cwd, id);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(
    { read: data.read || [], wrote: data.wrote || [], at: new Date().toISOString() }, null, 2));
}

function syncFindingToKg(
  cwd: string, id: string, _findingPath: string, opts: { run?: RunFn } = {},
): { synced: boolean; reason?: string } {
  const run = opts.run || defaultRun;
  try {
    // Register the project (idempotent) then refresh so the new FINDING.md is compiled in.
    try { run('tesserae', ['register', '--root', cwd], cwd); } catch { /* already registered */ }
    run('tesserae', ['refresh', '--root', cwd], cwd);
    return { synced: true };
  } catch (e: unknown) {
    return { synced: false, reason: `tesserae sync skipped: ${String((e as Error).message || e)}` };
  }
}

module.exports = { kgPath, writeKgProvenance, syncFindingToKg };
