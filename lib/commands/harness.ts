'use strict';
/**
 * gd harness — life-harness rounds (evidence-driven self-improvement).
 * Thin wrapper: resolves backend/account env and shells to bin/harness_driver.py.
 * Round logic lives in the autoresearch-core Python package (pure) — see
 * docs/superpowers/specs/2026-06-06-life-harness-rounds-grd-host.md.
 */
const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');
const { spawnSync: nodeSpawnSync } = require('child_process') as typeof import('child_process');
const { output, error } = require('../utils') as {
  output: (data: unknown, raw: boolean, rawText?: unknown) => never;
  error: (msg: string) => never;
};

interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: { code?: string };
}
interface HarnessDeps {
  spawnSync?: (cmd: string, args: string[], opts: Record<string, unknown>) => SpawnResult;
}
interface RoundOptions {
  auto: boolean;
  dryRun: boolean;
  fullEval: boolean;
}

/** Compose the proposal-agent argv for the configured backend. Exported for tests. */
function _buildSpawnArgv(backend: string, repoCwd: string): string[] {
  if (backend === 'claude') {
    return ['claude', '-p', '--dangerously-skip-permissions'];
  }
  // default: codex (account env CODEX_HOME is inherited from gd's environment)
  return [
    'codex', 'exec',
    '-c', `projects."${repoCwd}".trust_level="trusted"`,
    '--sandbox', 'workspace-write',
    '--cd', '{workdir}',
  ];
}

function _readConfig(cwd: string): Record<string, unknown> {
  const p = path.join(cwd, '.planning', 'config.json');
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function _driverPath(): string {
  const src = path.join(__dirname, '..', '..', 'bin', 'harness_driver.py');
  if (fs.existsSync(src)) return src;
  return path.join(__dirname, '..', '..', '..', 'bin', 'harness_driver.py');
}

function cmdHarnessRound(
  cwd: string,
  opts: RoundOptions,
  _raw: boolean,
  deps: HarnessDeps = {}
): void {
  const spawn = deps.spawnSync ?? (nodeSpawnSync as unknown as NonNullable<HarnessDeps['spawnSync']>);
  const config = _readConfig(cwd);
  const harness = (config.harness ?? {}) as Record<string, unknown>;
  const backend = typeof harness.backend === 'string' ? harness.backend : 'codex';

  const args = [_driverPath(), 'round', '--cwd', cwd];
  if (opts.auto) args.push('--auto');
  if (opts.dryRun) args.push('--dry-run');
  if (opts.fullEval) args.push('--full-eval');

  const result = spawn('python3', args, {
    encoding: 'utf-8',
    timeout: 3600000,
    env: {
      ...process.env,
      GRD_HARNESS_SPAWN_ARGV: JSON.stringify(_buildSpawnArgv(backend, cwd)),
    },
  });
  if (result.error?.code === 'ENOENT') {
    error('python3 not found — the harness driver requires Python 3.11+ with autoresearch-core>=0.2');
  }
  if (result.status !== 0) {
    error(`harness driver failed (exit ${result.status}): ${result.stderr.slice(-500)}`);
  }
  process.stdout.write(result.stdout);
}

function cmdHarnessStatus(cwd: string, raw: boolean): void {
  const roundsDir = path.join(cwd, '.planning', 'harness', 'rounds');
  const rounds: Array<Record<string, unknown>> = [];
  if (fs.existsSync(roundsDir)) {
    for (const id of fs.readdirSync(roundsDir).sort()) {
      const rec = path.join(roundsDir, id, 'RECORD.json');
      if (!fs.existsSync(rec)) continue;
      try {
        rounds.push(JSON.parse(fs.readFileSync(rec, 'utf-8')) as Record<string, unknown>);
      } catch {
        rounds.push({ round_id: id, status: 'unreadable' });
      }
    }
  }
  output({ rounds }, raw, rounds.map((r) => `${r.round_id}: ${r.status}`).join('\n') || 'no rounds');
}

function cmdHarnessRevert(
  cwd: string,
  roundId: string,
  _raw: boolean,
  deps: HarnessDeps = {}
): void {
  if (!roundId) error('usage: gd harness revert <round-id>');
  const rec = path.join(cwd, '.planning', 'harness', 'rounds', roundId, 'RECORD.json');
  if (!fs.existsSync(rec)) error(`unknown round: ${roundId}`);
  const record = JSON.parse(fs.readFileSync(rec, 'utf-8')) as { applied_sha?: string };
  if (!record.applied_sha) error(`round ${roundId} has no applied commit to revert`);
  const spawn = deps.spawnSync ?? (nodeSpawnSync as unknown as NonNullable<HarnessDeps['spawnSync']>);
  const result = spawn('python3',
    [_driverPath(), 'revert', '--cwd', cwd, '--sha', record.applied_sha!],
    { encoding: 'utf-8', timeout: 120000, env: process.env });
  if (result.status !== 0) error(`revert failed: ${result.stderr.slice(-500)}`);
  process.stdout.write(result.stdout);
}

function cmdHarnessUpstream(
  cwd: string,
  op: string,
  origin: string,
  raw: boolean,
  deps: HarnessDeps = {}
): void {
  if (op !== 'list' && op !== 'clear') error(`usage: gd harness upstream list|clear [--origin <slug>]`);
  const spawn = deps.spawnSync ?? (nodeSpawnSync as unknown as NonNullable<HarnessDeps['spawnSync']>);
  const args = [_driverPath(), 'upstream', '--op', op, '--cwd', cwd];
  if (origin) args.push('--origin', origin);
  const result = spawn('python3', args, { encoding: 'utf-8', timeout: 60000, env: process.env });
  if (result.error?.code === 'ENOENT') {
    error('python3 not found — the harness driver requires Python 3.11+ with autoresearch-core>=0.4.3');
  }
  if (result.status !== 0) error(`harness driver failed (exit ${result.status}): ${result.stderr.slice(-500)}`);
  process.stdout.write(result.stdout);
}

module.exports = { cmdHarnessRound, cmdHarnessStatus, cmdHarnessRevert, cmdHarnessUpstream, _buildSpawnArgv };
