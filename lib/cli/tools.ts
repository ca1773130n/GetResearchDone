'use strict';

const { execFileSync } = require('child_process') as typeof import('child_process');
const { join } = require('path') as typeof import('path');

/**
 * Build the argument list for grd-tools.js delegation.
 * Includes passthrough flags (unknown flags forwarded from CLI).
 */
function buildToolArgs(
  command: string,
  subcommand: string | undefined,
  extraArgs: string[],
  jsonFlag: boolean,
  passthrough: string[] = [],
): string[] {
  const args: string[] = [command];
  if (subcommand) args.push(subcommand);
  args.push(...extraArgs);
  args.push(...passthrough);
  if (jsonFlag) args.push('--raw');
  return args;
}

/**
 * Execute a tool command by delegating to grd-tools.js.
 * TODO: Refactor to in-process delegation once output()/error() return values instead of process.exit().
 */
function runToolCommand(
  command: string,
  subcommand: string | undefined,
  extraArgs: string[],
  jsonFlag: boolean,
  cwd: string,
  passthrough: string[] = [],
): { exitCode: number; stdout: string; stderr: string } {
  const args = buildToolArgs(command, subcommand, extraArgs, jsonFlag, passthrough);
  const grdTools = join(__dirname, '..', '..', 'bin', 'grd-tools.js');

  try {
    const stdout = execFileSync('node', [grdTools, ...args], {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env },
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: error.status || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    };
  }
}

module.exports = { buildToolArgs, runToolCommand };
export { buildToolArgs, runToolCommand };
