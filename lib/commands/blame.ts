'use strict';

/** GRD Commands/Blame -- Map changed files to the plans/tasks that produced them */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const childProcess = require('child_process') as typeof import('child_process');

const {
  safeReadFile,
  output,
  error,
  findPhaseInternal,
}: {
  safeReadFile: (p: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  findPhaseInternal: (cwd: string, phase: string) => { found: boolean; directory: string } | null;
} = require('../utils');

const {
  currentMilestone,
}: {
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

function _getPhaseFiles(cwd: string, phaseDir: string): string[] {
  // Codex r3 P2: scope file collection to the phase. Find commits that
  // touched .planning/<phase>/ first, derive the phase commit range
  // from those, then ask git for non-.planning files touched in that
  // range. Falls back to empty when the phase has no commits.
  const phaseRel = path.relative(cwd, phaseDir);
  const phaseShas = childProcess.spawnSync(
    'git',
    ['log', '--pretty=format:%H', '--', phaseRel],
    { cwd, encoding: 'utf-8', stdio: 'pipe' }
  );
  if (phaseShas.status !== 0) return [];
  const shas = (phaseShas.stdout || '').split('\n').filter((s: string) => s.length === 40);
  if (shas.length === 0) return [];
  const earliest = shas[shas.length - 1];
  const latest = shas[0];
  const range = earliest === latest ? `${earliest}^!` : `${earliest}^..${latest}`;
  const result = childProcess.spawnSync(
    'git',
    ['log', range, '--name-only', '--pretty=format:', '--diff-filter=ACMR'],
    { cwd, encoding: 'utf-8', stdio: 'pipe' }
  );
  if (result.status !== 0) return [];
  const seen = new Set<string>();
  for (const l of (result.stdout || '').split('\n').map((s: string) => s.trim())) {
    if (l.length > 0 && !l.startsWith('.planning/')) seen.add(l);
  }
  return Array.from(seen);
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

  try {
    currentMilestone(cwd);
  } catch {
    error('No active milestone found. Run gd init first.');
  }

  // Codex r2 P2: resolve numeric phase ids via findPhaseInternal so
  // `gd blame 1` works (was looking for a literal `phases/1/` dir).
  const phaseInfo = findPhaseInternal(cwd, phaseArg!);
  if (!phaseInfo || !phaseInfo.found) {
    error(`Phase not found: ${phaseArg}`);
  }
  // Codex r4 P2: directory is cwd-relative.
  const phaseDir = path.join(cwd, phaseInfo!.directory);

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
