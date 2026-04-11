'use strict';

const { execFileSync } = require('child_process') as typeof import('child_process');
const { join } = require('path') as typeof import('path');
const path = require('path') as typeof import('path');
const fs = require('fs') as typeof import('fs');

import type { ScanMode, ScanReport, RunScanOpts } from '../commands/scan';
import type { ScanHit } from '../scan/types';
import type { ResolveScanOpts } from './scan-dispatch';

const { runScan } = require('../commands/scan') as {
  runScan: (opts: RunScanOpts) => ScanReport;
};
const { resolveScanFiles } = require('./scan-dispatch') as {
  resolveScanFiles: (opts: ResolveScanOpts) => string[];
};

/**
 * Build the argument list for grd-tools.js delegation.
 * Includes passthrough flags (unknown flags forwarded from CLI).
 */
export function buildToolArgs(
  command: string,
  subcommand: string | undefined,
  extraArgs: string[],
  jsonFlag: boolean,
  passthrough: string[] = []
): string[] {
  const args: string[] = [command];
  if (subcommand) args.push(subcommand);
  args.push(...extraArgs);
  args.push(...passthrough);
  if (jsonFlag) args.push('--raw');
  return args;
}

// ─── Scan command helper ───────────────────────────────────────────────────────

/**
 * In-process handler for `gd scan`. Parses flags, resolves files, runs
 * the scanner, and formats output (JSON or human text).
 */
function _runScanCommand(
  extraArgs: string[],
  jsonFlag: boolean,
  cwd: string
): { exitCode: number; stdout: string; stderr: string } {
  // Parse flags
  let mode: ScanMode = 'staged';
  let filePath: string | undefined;
  let diffBase: string | undefined;
  let injectionOnly = false;
  let base64Only = false;

  let i = 0;
  while (i < extraArgs.length) {
    const arg = extraArgs[i];
    if (arg === '--file') {
      mode = 'file';
      filePath = extraArgs[++i];
    } else if (arg === '--diff') {
      mode = 'diff';
      diffBase = extraArgs[++i];
    } else if (arg === '--all') {
      mode = 'all';
    } else if (arg === '--injection-only') {
      injectionOnly = true;
    } else if (arg === '--base64-only') {
      base64Only = true;
    } else if (arg.startsWith('--')) {
      return { exitCode: 2, stdout: '', stderr: `scan: unknown flag ${arg}\n` };
    }
    i++;
  }

  if (injectionOnly && base64Only) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: 'scan: --injection-only and --base64-only are mutually exclusive\n',
    };
  }

  // Resolve files
  let files: string[];
  try {
    files = resolveScanFiles({ mode, cwd, filePath, diffBase });
  } catch (err: unknown) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: (err as Error).message + '\n',
    };
  }

  // Resolve ignore file
  const ignoreFilePath = (() => {
    const p = path.join(cwd, '.prompt-injection-scanignore');
    return fs.existsSync(p) ? p : null;
  })();

  // Run scan
  const report = runScan({ mode, files, ignoreFilePath, injectionOnly, base64Only });

  if (jsonFlag) {
    return {
      exitCode: report.exitCode,
      stdout: JSON.stringify(report, null, 2) + '\n',
      stderr: '',
    };
  }

  // Human text output
  const unignored = report.hits.filter((h: ScanHit) => !h.ignored);
  const ignored = report.hits.filter((h: ScanHit) => h.ignored);
  const N = report.scanned;

  let stdout: string;
  if (unignored.length === 0 && ignored.length === 0) {
    stdout = `scan: clean — ${N} file(s) checked\n`;
  } else if (unignored.length === 0) {
    stdout = `scan: clean — ${N} file(s) checked (${ignored.length} ignored hit(s))\n`;
  } else {
    const lines: string[] = [`scan: ${unignored.length} hit(s) in ${N} file(s)`];
    for (const h of unignored) {
      lines.push(`  ${h.file}:${h.line}  [${h.source}] ${h.label} → ${h.match}`);
    }
    stdout = lines.join('\n') + '\n';
  }

  return { exitCode: report.exitCode, stdout, stderr: '' };
}

/**
 * Execute a tool command. Scan is handled in-process; all other commands
 * delegate to grd-tools.js.
 * TODO: Refactor to in-process delegation once output()/error() return values instead of process.exit().
 */
export function runToolCommand(
  command: string,
  subcommand: string | undefined,
  extraArgs: string[],
  jsonFlag: boolean,
  cwd: string,
  passthrough: string[] = []
): { exitCode: number; stdout: string; stderr: string } {
  // In-process dispatch for scan
  if (command === 'scan') {
    return _runScanCommand([...extraArgs, ...passthrough], jsonFlag, cwd);
  }

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
