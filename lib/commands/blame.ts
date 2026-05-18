'use strict';

/** GRD Commands/Blame -- Map changed files to the plans/tasks that produced them */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const childProcess = require('child_process') as typeof import('child_process');

const {
  safeReadFile,
  output,
  error,
}: {
  safeReadFile: (p: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');

const {
  phasesDir: getPhasesDirPath,
  currentMilestone,
}: {
  phasesDir: (cwd: string, milestone?: string | null) => string;
  currentMilestone: (cwd: string) => string;
} = require('../paths');

interface BlameRow {
  file: string;
  plan: string;
  task: string;
}

interface BlameResult {
  phase: string;
  rows: BlameRow[];
  unmatched_files: string[];
  total_files: number;
}

function _getPhaseFiles(cwd: string, _phaseDir: string): string[] {
  // Use git log to find files touched in the phase commit range.
  // Strategy: find commits that touch files under .planning/milestones/.../phases/<N>
  const result = childProcess.spawnSync(
    'git',
    ['log', '--name-only', '--pretty=format:', '--diff-filter=ACMR', '--', '.'],
    { cwd, encoding: 'utf-8', stdio: 'pipe' }
  );
  if (result.status !== 0) return [];
  return (result.stdout || '')
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0 && !l.startsWith('.planning/'));
}

function _extractTasksFromPlan(content: string): string[] {
  const tasks: string[] = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^[-*]\s+\[[ x]\]\s+(.+)/) ?? line.match(/^\d+\.\s+(.+)/);
    if (m) tasks.push(m[1].trim());
  }
  return tasks;
}

function _fileMatchesPlan(filePath: string, planContent: string): string | null {
  const basename = path.basename(filePath);
  const noExt = basename.split('.')[0].toLowerCase();
  // Check if plan content references this file or module
  const lowerContent = planContent.toLowerCase();
  if (lowerContent.includes(basename.toLowerCase()) || lowerContent.includes(noExt)) {
    const tasks = _extractTasksFromPlan(planContent);
    // Return first matching task that references the file/module
    for (const task of tasks) {
      if (task.toLowerCase().includes(noExt) || task.toLowerCase().includes(basename.toLowerCase())) {
        return task;
      }
    }
    return tasks[0] ?? '(unknown task)';
  }
  return null;
}

/**
 * CLI command: Map modified files in a completed phase to plan tasks.
 *
 * Runs git log to find files changed since the phase started, then joins
 * against plan task lists to produce a file → plan → task table.
 */
function cmdBlame(cwd: string, phaseArg: string, raw: boolean): void {
  if (!phaseArg) {
    error('phase required. Usage: gd blame <phase>');
  }

  let milestone: string;
  try {
    milestone = currentMilestone(cwd);
  } catch {
    error('No active milestone found. Run gd init first.');
  }

  const phaseDir = path.join(getPhasesDirPath(cwd, milestone!), phaseArg!);
  if (!fs.existsSync(phaseDir)) {
    error(`Phase directory not found: ${path.relative(cwd, phaseDir)}`);
  }

  let planFiles: string[] = [];
  try {
    planFiles = (fs.readdirSync(phaseDir) as string[]).filter(
      (f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md'
    );
  } catch {
    error(`Cannot read phase directory: ${phaseDir}`);
  }

  const changedFiles = _getPhaseFiles(cwd, phaseDir);
  const rows: BlameRow[] = [];
  const unmatched: string[] = [];

  for (const file of changedFiles) {
    let matched = false;
    for (const planFile of planFiles) {
      const content = safeReadFile(path.join(phaseDir, planFile));
      if (!content) continue;
      const task = _fileMatchesPlan(file, content);
      if (task) {
        rows.push({ file, plan: planFile, task });
        matched = true;
        break;
      }
    }
    if (!matched) unmatched.push(file);
  }

  const result: BlameResult = {
    phase: phaseArg!,
    rows,
    unmatched_files: unmatched,
    total_files: changedFiles.length,
  };

  const summary = `Phase ${phaseArg}: ${changedFiles.length} files, ${rows.length} matched, ${unmatched.length} unmatched`;
  output(result, raw, summary);
}

module.exports = { cmdBlame };
