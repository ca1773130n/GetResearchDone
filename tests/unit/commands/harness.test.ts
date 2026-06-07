'use strict';
const path = require('path');
const { cmdHarnessRound, cmdHarnessStatus, cmdHarnessRevert, cmdHarnessUpstream, _buildSpawnArgv } =
  require('../../../lib/commands/harness');
const { captureOutput, captureError } = require('../../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../../helpers/fixtures');
const fs = require('fs');

describe('harness command', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('_buildSpawnArgv composes codex argv with trust + cd', () => {
    const argv = _buildSpawnArgv('codex', '/repo');
    expect(argv[0]).toBe('codex');
    expect(argv).toContain('exec');
    expect(argv.join(' ')).toContain('/repo');
  });

  test('_buildSpawnArgv composes claude argv', () => {
    const argv = _buildSpawnArgv('claude', '/repo');
    expect(argv[0]).toBe('claude');
    expect(argv).toContain('-p');
  });

  test('round invokes the driver with env and prints its JSON', () => {
    const calls: Array<{ argv: string[]; env: Record<string, string | undefined> }> = [];
    const fakeSpawn = (cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      calls.push({ argv: [cmd, ...args], env: opts.env as Record<string, string | undefined> });
      return { status: 0, stdout: '{"round_id":"x","status":"skipped"}', stderr: '' };
    };
    const { stdout, exitCode } = captureOutput(() => {
      cmdHarnessRound(fixtureDir, { auto: false, dryRun: true, fullEval: false }, false,
        { spawnSync: fakeSpawn });
    });
    expect(exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].argv.join(' ')).toContain('harness_driver.py');
    expect(calls[0].argv).toContain('--dry-run');
    expect(calls[0].env.GRD_HARNESS_SPAWN_ARGV).toBeDefined();
    expect(JSON.parse(stdout).status).toBe('skipped');
  });

  test('round errors helpfully when python is missing', () => {
    const fakeSpawn = () => ({ status: null, stdout: '', stderr: '', error: { code: 'ENOENT' } });
    const { exitCode, stderr } = captureError(() => {
      cmdHarnessRound(fixtureDir, { auto: false, dryRun: false, fullEval: false }, false,
        { spawnSync: fakeSpawn });
    });
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/python3/i);
  });

  test('status renders saved rounds', () => {
    const d = path.join(fixtureDir, '.planning', 'harness', 'rounds', '20260606-010101');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'RECORD.json'),
      JSON.stringify({ round_id: '20260606-010101', status: 'evaluated', detail: 'awaiting review' }));
    const { stdout, exitCode } = captureOutput(() => {
      cmdHarnessStatus(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.rounds).toHaveLength(1);
    expect(parsed.rounds[0].status).toBe('evaluated');
  });

  test('status with no rounds reports empty', () => {
    const { stdout } = captureOutput(() => {
      cmdHarnessStatus(fixtureDir, false);
    });
    expect(JSON.parse(stdout).rounds).toEqual([]);
  });

  test('round honours harness.backend from config and errors on driver failure', () => {
    const cfgDir = path.join(fixtureDir, '.planning');
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(path.join(cfgDir, 'config.json'),
      JSON.stringify({ harness: { backend: 'claude' } }));
    let seenArgv: string[] = [];
    const fakeSpawn = (_cmd: string, _args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      seenArgv = JSON.parse(String(opts.env.GRD_HARNESS_SPAWN_ARGV));
      return { status: 2, stdout: '', stderr: 'boom' };
    };
    const { exitCode, stderr } = captureError(() => {
      cmdHarnessRound(fixtureDir, { auto: true, dryRun: false, fullEval: true }, false,
        { spawnSync: fakeSpawn });
    });
    expect(seenArgv[0]).toBe('claude');
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/exit 2/);
  });

  test('revert runs the driver for an applied round and prints its JSON', () => {
    const d = path.join(fixtureDir, '.planning', 'harness', 'rounds', 'r1');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'RECORD.json'),
      JSON.stringify({ round_id: 'r1', status: 'applied', applied_sha: 'abc123' }));
    const calls: string[][] = [];
    const fakeSpawn = (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      return { status: 0, stdout: '{"reverted_to":"def456"}', stderr: '' };
    };
    const { stdout, exitCode } = captureOutput(() => {
      cmdHarnessRevert(fixtureDir, 'r1', false, { spawnSync: fakeSpawn });
    });
    expect(exitCode).toBe(0);
    expect(calls[0].join(' ')).toContain('--sha');
    expect(calls[0]).toContain('abc123');
    expect(JSON.parse(stdout).reverted_to).toBe('def456');
  });

  test('revert errors when round has no applied commit', () => {
    const d = path.join(fixtureDir, '.planning', 'harness', 'rounds', 'r2');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'RECORD.json'),
      JSON.stringify({ round_id: 'r2', status: 'skipped' }));
    const { exitCode, stderr } = captureError(() => {
      cmdHarnessRevert(fixtureDir, 'r2', false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/no applied commit/);
  });

  test('revert errors on unknown round id', () => {
    const { exitCode, stderr } = captureError(() => {
      cmdHarnessRevert(fixtureDir, 'nope', false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/unknown round/);
  });

  test('upstream list shells to the driver and prints its JSON', () => {
    const calls: Array<{ argv: string[] }> = [];
    const fakeSpawn = (cmd: string, args: string[], _opts: Record<string, unknown>) => {
      calls.push({ argv: [cmd, ...args] });
      return { status: 0, stdout: '{"pending":[]}', stderr: '' };
    };
    const { stdout, exitCode } = captureOutput(() => {
      cmdHarnessUpstream(fixtureDir, 'list', '', false, { spawnSync: fakeSpawn });
    });
    expect(exitCode).toBe(0);
    expect(calls[0].argv.join(' ')).toContain('harness_driver.py');
    expect(calls[0].argv).toContain('upstream');
    expect(calls[0].argv).toContain('list');
    expect(JSON.parse(stdout).pending).toEqual([]);
  });

  test('upstream clear passes --origin through', () => {
    const calls: Array<{ argv: string[] }> = [];
    const fakeSpawn = (cmd: string, args: string[], _opts: Record<string, unknown>) => {
      calls.push({ argv: [cmd, ...args] });
      return { status: 0, stdout: '{"cleared":1}', stderr: '' };
    };
    captureOutput(() => {
      cmdHarnessUpstream(fixtureDir, 'clear', 'ProjA', false, { spawnSync: fakeSpawn });
    });
    expect(calls[0].argv).toContain('--origin');
    expect(calls[0].argv).toContain('ProjA');
  });
});
