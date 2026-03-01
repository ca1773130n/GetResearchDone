/** GRD Commands/Quality -- Quality analysis and plugin setup operations */

'use strict';

export {};

const fs = require('fs');
const path = require('path');
const { output, error } = require('../utils') as {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
};
const { runQualityAnalysis } = require('../cleanup') as {
  runQualityAnalysis: (cwd: string, phaseNum: string) => QualityReport;
};

// ─── Domain Types ────────────────────────────────────────────────────────────

interface ComplexityViolation { file: string; line: number; functionName: string; complexity: number; }
interface DeadExportViolation { file: string; exportName: string; }
interface FileSizeViolation { file: string; lines: number; threshold: number; }
interface QualityReport {
  skipped?: boolean;
  reason?: string;
  phase?: string;
  timestamp?: string;
  summary?: {
    total_issues: number;
    complexity_violations: number;
    dead_exports: number;
    oversized_files: number;
  };
  details?: {
    complexity: ComplexityViolation[];
    dead_exports: DeadExportViolation[];
    file_size: FileSizeViolation[];
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract --flag value from args array. */
function flag(args: string[], name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback;
}

// ─── Quality Analysis ────────────────────────────────────────────────────────

/** Run quality analysis for a phase. */
function cmdQualityAnalysis(cwd: string, args: string[], raw: boolean): void {
  const phaseNum = flag(args, '--phase');
  if (!phaseNum) {
    error('--phase flag required for quality-analysis. Usage: quality-analysis --phase <phase-number>. Add the --phase flag, e.g.: quality-analysis --phase 2');
    return;
  }
  const report = runQualityAnalysis(cwd, phaseNum);
  if (report.skipped) { output(report, raw, report.reason); return; }

  const lines: string[] = [
    `Quality Analysis - Phase ${report.phase}`,
    `Date: ${report.timestamp}`, '',
    `Total issues: ${report.summary?.total_issues}`,
    `  Complexity violations: ${report.summary?.complexity_violations}`,
    `  Dead exports: ${report.summary?.dead_exports}`,
    `  Oversized files: ${report.summary?.oversized_files}`,
  ];
  if (report.details?.complexity && report.details.complexity.length > 0) {
    lines.push('', 'Complexity Violations:');
    for (const v of report.details.complexity)
      lines.push(`  ${v.file}:${v.line} - ${v.functionName} (complexity: ${v.complexity})`);
  }
  if (report.details?.dead_exports && report.details.dead_exports.length > 0) {
    lines.push('', 'Dead Exports:');
    for (const v of report.details.dead_exports)
      lines.push(`  ${v.file} - ${v.exportName}`);
  }
  if (report.details?.file_size && report.details.file_size.length > 0) {
    lines.push('', 'Oversized Files:');
    for (const v of report.details.file_size)
      lines.push(`  ${v.file} - ${v.lines} lines (threshold: ${v.threshold})`);
  }
  output(report, raw, lines.join('\n'));
}

// ─── Setup ──────────────────────────────────────────────────────────────────

/** Output plugin configuration info for registering GRD as a Claude Code plugin. */
function cmdSetup(_cwd: string, raw: boolean): void {
  const packageRoot: string = path.resolve(__dirname, '..', '..');
  const pluginJsonPath: string = path.join(packageRoot, '.claude-plugin', 'plugin.json');

  if (!fs.existsSync(pluginJsonPath)) {
    error('GRD installation not found. Run this command from a valid GRD installation.');
    return;
  }

  const pluginDir: string = path.join(packageRoot, '.claude-plugin');
  const result = {
    package_root: packageRoot,
    plugin_json: pluginJsonPath,
    instructions: `Add to Claude Code settings:\n  "plugin_path": "${pluginDir}"`,
  };
  const rawText = [
    'GRD plugin configured.',
    `Package root: ${packageRoot}`,
    `Plugin config: ${pluginJsonPath}`, '',
    'To use with Claude Code, add this plugin path to your Claude Code configuration:',
    `  ${pluginDir}`,
  ].join('\n');
  output(result, raw, rawText);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { cmdQualityAnalysis, cmdSetup };
