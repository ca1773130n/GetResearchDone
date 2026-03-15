'use strict';

import { execFileSync } from 'child_process';
import { join } from 'path';

const GD_PATH = join(__dirname, '..', '..', '..', 'bin', 'gd.js');
const CWD = join(__dirname, '..', '..', '..');

function runGd(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync('node', [GD_PATH, ...args], {
      cwd: CWD,
      encoding: 'utf-8',
      timeout: 15000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: error.status || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    };
  }
}

describe('gd CLI integration', () => {
  it('prints version with --version', () => {
    const { stdout, exitCode } = runGd(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^gd v\d+\.\d+\.\d+/);
  });

  it('prints help with --help', () => {
    const { stdout, exitCode } = runGd(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('gd — Get Research Done CLI');
    expect(stdout).toContain('init');
    expect(stdout).toContain('autopilot');
  });

  it('prints help when no command given', () => {
    const { stdout, exitCode } = runGd([]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('gd — Get Research Done CLI');
  });

  it('exits 1 for unknown command', () => {
    const { exitCode, stderr } = runGd(['nonexistent-command']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown command');
  });

  it('delegates tool commands to grd-tools.js', () => {
    // 'dashboard' is a known tool command that exits cleanly
    const { exitCode } = runGd(['dashboard']);
    expect(exitCode).toBe(0);
  });

  it('prints command help with <command> --help', () => {
    const { stdout, exitCode } = runGd(['plan-phase', '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('gd plan-phase');
  });
});
