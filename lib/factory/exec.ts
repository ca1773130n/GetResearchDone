'use strict';
const { execFileSync } = require('child_process');

/**
 * Runs a binary with an argument array — never a shell — and returns stdout. Throws on a
 * nonzero exit or a timeout, with `status`, `stdout`, `stderr` and `signal` on the error,
 * exactly like execFileSync. Injected everywhere, so tests can fake docker and gh.
 */
export type Exec = (bin: string, args: string[], opts?: { cwd?: string; timeout?: number }) => string;

export interface ExecError extends Error { status?: number; stdout?: string; stderr?: string; signal?: string; }

const defaultExec: Exec = (bin, args, opts = {}) => execFileSync(bin, args, {
  cwd: opts.cwd,
  timeout: opts.timeout,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
}) as string;

module.exports = { defaultExec };
