/**
 * Phase Lifecycle Operations -- add, insert, remove, complete, list
 * plus milestone complete and validate consistency.
 *
 * Extracted from bin/grd-tools.js (Phase 03, Plan 05).
 *
 * Dependencies: utils.ts, frontmatter.ts (one-directional, no circular deps)
 */

'use strict';

import type {
  GrdConfig,
  PhaseInfo,
  MilestoneInfo,
  FrontmatterObject,
  GateViolation,
  PreflightResult,
  QualityAnalysisSummary,
} from './types';

const fs = require('fs');
const path = require('path');

const {
  normalizePhaseName,
  findPhaseInternal,
  generateSlugInternal,
  stripShippedSections,
  execGit,
  loadConfig,
  getMilestoneInfo: getMilestoneInfoUtil,
  output,
  error,
}: {
  normalizePhaseName: (phase: string) => string;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  generateSlugInternal: (text: string) => string | null;
  stripShippedSections: (content: string) => string;
  execGit: (
    cwd: string,
    args: string[],
    opts?: { allowBlocked?: boolean }
  ) => { exitCode: number; stdout: string; stderr: string };
  loadConfig: (cwd: string) => GrdConfig;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('./utils');

const { extractFrontmatter }: {
  extractFrontmatter: (content: string) => FrontmatterObject;
} = require('./frontmatter');

const { runQualityAnalysis, generateCleanupPlan }: {
  runQualityAnalysis: (
    cwd: string,
    phaseNum: string
  ) => QualityAnalysisResult;
  generateCleanupPlan: (
    cwd: string,
    phaseNum: string,
    qualityReport: QualityAnalysisResult
  ) => CleanupPlanResult;
} = require('./cleanup');

const { runPreflightGates, checkOrphanedPhases }: {
  runPreflightGates: (
    cwd: string,
    command: string,
    options?: GateOptions
  ) => PreflightResult;
  checkOrphanedPhases: (cwd: string) => GateViolation[];
} = require('./gates');

const {
  phasesDir: getPhasesDirPath,
  phaseDir: getPhaseDirPath,
  milestonesDir: getMilestonesDirPath,
  archivedPhasesDir: getArchivedPhasesDir,
}: {
  phasesDir: (cwd: string, milestone?: string | null) => string;
  phaseDir: (
    cwd: string,
    milestone: string | undefined | null,
    phaseDirName: string
  ) => string;
  milestonesDir: (cwd: string) => string;
  archivedPhasesDir: (cwd: string, version: string) => string;
} = require('./paths');

// ─── Domain Types ─────────────────────────────────────────────────────────────

/** Options for gate checks passed to runPreflightGates. */
interface GateOptions {
  phase?: string;
  skipGates?: boolean;
  [key: string]: unknown;
}

/** Quality analysis result returned from cleanup module. */
interface QualityAnalysisResult {
  skipped?: boolean;
  reason?: string;
  phase?: string;
  timestamp?: string;
  summary?: QualityAnalysisSummary;
  details?: Record<string, unknown>;
  trends?: Record<string, unknown> | null;
}

/** Generated cleanup plan info from cleanup module. */
interface CleanupPlanResult {
  path: string;
  plan_number: string;
  issues_addressed: number;
}

/** Options for cmdPhaseRemove. */
interface PhaseRemoveOptions {
  force?: boolean;
  dryRun?: boolean;
  remove_dir?: boolean;
  raw?: boolean;
}

/** Options for cmdPhaseComplete. */
interface PhaseCompleteOptions {
  dryRun?: boolean;
  force?: boolean;
  skip_cleanup?: boolean;
  raw?: boolean;
}

/** Options for cmdMilestoneComplete. */
interface MilestoneCompleteOptions {
  name?: string;
  dryRun?: boolean;
  raw?: boolean;
}

/** Options for cmdPhaseBatchComplete. */
interface PhaseBatchCompleteOptions {
  dryRun?: boolean;
  force?: boolean;
  raw?: boolean;
}

/** Options for cmdValidateConsistency. */
interface ValidateConsistencyOptions {
  fix?: boolean;
}

/** Result from the phase complete core logic. */
interface PhaseCompleteResult {
  dry_run?: boolean;
  would_complete_phase?: string;
  phase_found?: boolean;
  gate_failed?: boolean;
  gate_errors?: GateViolation[];
  gate_warnings?: GateViolation[];
  completed_phase?: string;
  phase_name?: string | null;
  plans_executed?: string;
  next_phase?: string | null;
  next_phase_name?: string | null;
  is_last_phase?: boolean;
  date?: string;
  roadmap_updated?: boolean;
  state_updated?: boolean;
  quality_report?: QualityAnalysisResult;
  cleanup_plan_generated?: CleanupPlanResult;
}

/** Result from cmdPhaseAdd output. */
interface PhaseAddResult {
  phase_number: number;
  padded: string;
  name: string;
  slug: string | null;
  directory: string;
  schedule_affected: boolean;
  warnings?: string[];
}

/** Result from cmdPhaseInsert output. */
interface PhaseInsertResult {
  phase_number: string;
  after_phase: string;
  name: string;
  slug: string | null;
  directory: string;
  schedule_affected: boolean;
}

/** A renamed directory or file entry. */
interface RenameEntry {
  from: string;
  to: string;
}

/** Result from _reorderDirectories. */
interface ReorderResult {
  renamedDirs: RenameEntry[];
  renamedFiles: RenameEntry[];
}

/** A renumber item for integer phases. */
interface IntegerRenumberItem {
  dir: string;
  oldInt: number;
  decimal: number | null;
  slug: string;
}

/** A renumber item for decimal phases. */
interface DecimalRenumberItem {
  dir: string;
  oldDecimal: number;
  slug: string;
}

/** Archive context passed to _archiveMilestone. */
interface ArchiveContext {
  roadmapPath: string;
  reqPath: string;
  milestoneName: string;
  today: string;
  phasesDir: string;
  phaseCount: number;
  totalPlans: number;
  totalTasks: number;
  accomplishments: string[];
  phasesAlreadyInPlace: boolean;
}

/** Archive result from _archiveMilestone. */
interface ArchiveResult {
  archivedPhaseCount: number;
}

/** Milestone complete result. */
interface MilestoneCompleteResult {
  version: string;
  name: string;
  date: string;
  phases: number;
  plans: number;
  tasks: number;
  accomplishments: string[];
  phases_already_in_place: boolean;
  archived: {
    roadmap: boolean;
    requirements: boolean;
    audit: boolean;
    phases: boolean;
    phase_count: number;
    marker: boolean;
  };
  milestones_updated: boolean;
  state_updated: boolean;
  git_merge?: GitMergeResult;
}

/** Git merge result from milestone complete. */
interface GitMergeResult {
  skipped?: boolean;
  reason?: string;
  error?: string;
  merged?: boolean;
  milestone_branch?: string;
  base_branch?: string;
  branch_deleted?: boolean;
}

/** Phase remove result. */
interface PhaseRemoveResult {
  removed: string;
  directory_deleted: string | null;
  renamed_directories: RenameEntry[];
  renamed_files: RenameEntry[];
  roadmap_updated: boolean;
  state_updated: boolean;
  cleaned_worktrees?: string[];
  dry_run?: boolean;
  would_remove?: string;
  would_renumber?: string[];
}

/** Batch complete result. */
interface BatchCompleteResult {
  results: Array<{ phase: string; result?: PhaseCompleteResult; error?: string }>;
  total_phases: number;
  completed_count: number;
}

/** Phases list file result. */
interface PhasesListFileResult {
  files: string[];
  count: number;
  phase_dir?: string | null;
  error?: string;
}

/** Phases list directory result. */
interface PhasesListDirResult {
  directories: string[];
  count: number;
}

/** Consistency validation result. */
interface ConsistencyResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  warning_count: number;
  fixed?: string[];
}

// ─── File Caches ──────────────────────────────────────────────────────────────

// Module-level cache with write-through for roadmap file reads.
// Prevents redundant disk reads across phase operations; writes update the cache.
const _roadmapFileCache = new Map<string, string>();
function readRoadmapFile(roadmapPath: string): string {
  if (!_roadmapFileCache.has(roadmapPath)) {
    _roadmapFileCache.set(
      roadmapPath,
      fs.readFileSync(roadmapPath, 'utf-8') as string
    );
  }
  return _roadmapFileCache.get(roadmapPath) as string;
}
function writeRoadmapFile(roadmapPath: string, content: string): void {
  fs.writeFileSync(roadmapPath, content, 'utf-8');
  _roadmapFileCache.set(roadmapPath, content);
}

// Module-level cache with write-through for state file reads.
// Prevents redundant disk reads across phase operations; writes update the cache.
const _stateFileCache = new Map<string, string>();
function readStateFile(statePath: string): string {
  if (!_stateFileCache.has(statePath)) {
    _stateFileCache.set(
      statePath,
      fs.readFileSync(statePath, 'utf-8') as string
    );
  }
  return _stateFileCache.get(statePath) as string;
}
function writeStateFile(statePath: string, content: string): void {
  fs.writeFileSync(statePath, content, 'utf-8');
  _stateFileCache.set(statePath, content);
}

// ─── Phases List ──────────────────────────────────────────────────────────────

/**
 * CLI command: List phase directories with optional filtering by type or phase number.
 * @param cwd - Project working directory
 * @param options - List options
 * @param raw - Output raw text (newline-separated) instead of JSON
 * @returns void — writes JSON or raw text to stdout and exits on error
 */
function cmdPhasesList(
  cwd: string,
  options: Record<string, string>,
  raw: boolean
): void {
  const phasesDir: string = getPhasesDirPath(cwd);
  const { type, phase } = options;

  // If no phases directory, return empty
  if (!fs.existsSync(phasesDir)) {
    if (type) {
      output({ files: [], count: 0 }, raw, '');
    } else {
      output({ directories: [], count: 0 }, raw, '');
    }
    return;
  }

  try {
    // Get all phase directories
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    let dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);

    // Sort numerically (handles decimals: 01, 02, 02.1, 02.2, 03)
    dirs.sort((a: string, b: string) => {
      const aNum: number = parseFloat(
        a.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0'
      );
      const bNum: number = parseFloat(
        b.match(/^(\d+(?:\.\d+)?)/)?.[1] || '0'
      );
      return aNum - bNum;
    });

    // If filtering by phase number
    if (phase) {
      const normalized: string = normalizePhaseName(phase);
      const match: string | undefined = dirs.find(
        (d: string) => d.startsWith(normalized + '-') || d === normalized
      );
      if (!match) {
        output(
          { files: [], count: 0, phase_dir: null, error: 'Phase not found' },
          raw,
          ''
        );
        return;
      }
      dirs = [match];
    }

    // If listing files of a specific type
    if (type) {
      const files: string[] = [];
      for (const dir of dirs) {
        const dirPath: string = path.join(phasesDir, dir);
        const dirFiles: string[] = fs.readdirSync(dirPath) as string[];

        let filtered: string[];
        if (type === 'plans') {
          filtered = dirFiles.filter(
            (f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md'
          );
        } else if (type === 'summaries') {
          filtered = dirFiles.filter(
            (f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md'
          );
        } else {
          filtered = dirFiles;
        }

        files.push(...filtered.sort());
      }

      const result: PhasesListFileResult = {
        files,
        count: files.length,
        phase_dir: phase
          ? dirs[0].replace(/^\d+(?:\.\d+)?-?/, '')
          : null,
      };
      output(result, raw, files.join('\n'));
      return;
    }

    // Default: list directories
    output(
      { directories: dirs, count: dirs.length } as PhasesListDirResult,
      raw,
      dirs.join('\n')
    );
  } catch (e) {
    error('Failed to list phases: ' + (e as Error).message);
  }
}

// ─── Phase Add ────────────────────────────────────────────────────────────────

/**
 * CLI command: Add a new phase to the end of the roadmap and create its directory.
 * @param cwd - Project working directory
 * @param description - Human-readable phase description for the roadmap heading
 * @param raw - Output raw padded number instead of JSON
 * @param context - Optional context text for CONTEXT.md
 * @returns void — writes JSON or raw text to stdout and exits on error
 */
function cmdPhaseAdd(
  cwd: string,
  description: string,
  raw: boolean,
  context?: string
): void {
  if (!description) {
    error('description required for phase add');
  }

  if (description.length > 60) {
    error(
      `description too long (${description.length} chars): must not exceed 60 characters. Shorten your description to fewer than the maximum characters, e.g.: phase add 'Short name'`
    );
  }

  // Pre-flight gate checks
  const gates: PreflightResult = runPreflightGates(cwd, 'phase-add');
  if (!gates.passed) {
    output(
      {
        gate_failed: true,
        gate_errors: gates.errors,
        gate_warnings: gates.warnings,
      },
      raw
    );
    return;
  }

  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  let content: string;
  try {
    content = readRoadmapFile(roadmapPath);
  } catch {
    error('ROADMAP.md not found');
    return;
  }
  const slug: string | null = generateSlugInternal(description);

  // Find highest integer phase number across full content (including shipped sections)
  const phasePattern: RegExp = /#{2,3}\s*Phase\s+(\d+)(?:\.\d+)?:/gi;
  let maxPhase = 0;
  const existingPhaseNums: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = phasePattern.exec(content)) !== null) {
    const num: number = parseInt(m[1], 10);
    if (!existingPhaseNums.includes(num)) existingPhaseNums.push(num);
    if (num > maxPhase) maxPhase = num;
  }

  // Detect numbering gaps in existing phases
  const addWarnings: string[] = [];
  existingPhaseNums.sort((a: number, b: number) => a - b);
  for (let i = 1; i < existingPhaseNums.length; i++) {
    if (existingPhaseNums[i] !== existingPhaseNums[i - 1] + 1) {
      addWarnings.push(
        `Gap in phase sequence: ${existingPhaseNums[i - 1]} to ${existingPhaseNums[i]} (missing ${existingPhaseNums[i - 1] + 1})`
      );
    }
  }

  const newPhaseNum: number = maxPhase + 1;
  const paddedNum: string = String(newPhaseNum).padStart(2, '0');
  const dirName: string = `${paddedNum}-${slug}`;
  const dirPath: string = getPhaseDirPath(cwd, null, dirName);

  // Create directory
  fs.mkdirSync(dirPath, { recursive: true });

  // Write CONTEXT.md if context provided
  if (context) {
    const today: string = new Date().toISOString().slice(0, 10);
    const contextContent: string = `---\nphase: "${paddedNum}"\nname: "${description}"\ncreated: ${today}\n---\n\n# Phase ${newPhaseNum}: ${description} -- Context\n\n${context}\n`;
    fs.writeFileSync(
      path.join(dirPath, `${paddedNum}-CONTEXT.md`),
      contextContent,
      'utf-8'
    );
  }

  // Detect heading level used in existing ROADMAP (## or ###)
  const headingLevel: string = /^## Phase \d+:/m.test(content) ? '##' : '###';

  // Build phase entry (includes Duration for schedule computation)
  const phaseEntry: string = `\n${headingLevel} Phase ${newPhaseNum}: ${description}\n\n**Goal:** ${description}\n**Depends on:** Phase ${maxPhase}\n**Duration:** 7d\n**Plans:** 0 plans\n\nPlans:\n- [ ] TBD (run /grd:plan-phase ${newPhaseNum} to break down)\n`;

  // Find insertion point: before last "---" or at end
  let updatedContent: string;
  const lastSeparator: number = content.lastIndexOf('\n---');
  if (lastSeparator > 0) {
    updatedContent =
      content.slice(0, lastSeparator) + phaseEntry + content.slice(lastSeparator);
  } else {
    updatedContent = content + phaseEntry;
  }

  writeRoadmapFile(roadmapPath, updatedContent);

  const result: PhaseAddResult = {
    phase_number: newPhaseNum,
    padded: paddedNum,
    name: description,
    slug,
    directory: path.relative(cwd, dirPath) as string,
    schedule_affected: true,
    ...(addWarnings.length > 0 ? { warnings: addWarnings } : {}),
  };

  output(result, raw, paddedNum);
}

// ─── Phase Insert (Decimal) ──────────────────────────────────────────────────

/**
 * CLI command: Insert a decimal phase after a specified phase in the roadmap.
 * @param cwd - Project working directory
 * @param afterPhase - Phase number to insert after (e.g., '06')
 * @param description - Human-readable phase description
 * @param raw - Output raw decimal phase number instead of JSON
 * @returns void — writes JSON or raw text to stdout and exits on error
 */
function cmdPhaseInsert(
  cwd: string,
  afterPhase: string,
  description: string,
  raw: boolean
): void {
  if (!afterPhase || !description) {
    error(
      'after-phase and description required for phase insert. Usage: phase insert <after-phase-number> <description>. Provide both arguments, e.g.: phase insert 2 "New phase description"'
    );
  }

  // Pre-flight gate checks
  const gates: PreflightResult = runPreflightGates(cwd, 'phase-insert');
  if (!gates.passed) {
    output(
      {
        gate_failed: true,
        gate_errors: gates.errors,
        gate_warnings: gates.warnings,
      },
      raw
    );
    return;
  }

  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  let content: string;
  try {
    content = readRoadmapFile(roadmapPath);
  } catch {
    error('ROADMAP.md not found');
    return;
  }
  const activeContent: string = stripShippedSections(content);
  const slug: string | null = generateSlugInternal(description);

  // Verify target phase exists (in active section only)
  const afterPhaseEscaped: string = afterPhase.replace(/\./g, '\\.');
  const targetPattern: RegExp = new RegExp(
    `#{2,}\\s*Phase\\s+${afterPhaseEscaped}:`,
    'i'
  );
  if (!targetPattern.test(activeContent)) {
    error(
      `Phase ${afterPhase} not found in ROADMAP.md. Run "roadmap get-phase ${afterPhase}" to verify the phase exists, or check .planning/ROADMAP.md`
    );
  }

  // Calculate next decimal using existing logic
  const phasesDir: string = getPhasesDirPath(cwd);
  const normalizedBase: string = normalizePhaseName(afterPhase);
  const existingDecimals: number[] = [];

  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);
    const decimalPattern: RegExp = new RegExp(
      `^${normalizedBase}\\.(\\d+)`
    );
    for (const dir of dirs) {
      const dm: RegExpMatchArray | null = dir.match(decimalPattern);
      if (dm) existingDecimals.push(parseInt(dm[1], 10));
    }
  } catch {
    // Phases directory may not exist yet; start decimal numbering from 1
  }

  const nextDecimal: number =
    existingDecimals.length === 0 ? 1 : Math.max(...existingDecimals) + 1;
  const decimalPhase: string = `${normalizedBase}.${nextDecimal}`;
  const dirName: string = `${decimalPhase}-${slug}`;
  const dirPath: string = path.join(phasesDir, dirName);

  // Create directory
  fs.mkdirSync(dirPath, { recursive: true });

  // Detect heading level used in existing ROADMAP (## or ###)
  const headingLevel: string = /^## Phase \d+:/m.test(content) ? '##' : '###';

  // Build phase entry (includes Duration for schedule computation)
  const phaseEntry: string = `\n${headingLevel} Phase ${decimalPhase}: ${description} (INSERTED)\n\n**Goal:** [Urgent work - to be planned]\n**Depends on:** Phase ${afterPhase}\n**Duration:** 3d\n**Plans:** 0 plans\n\nPlans:\n- [ ] TBD (run /grd:plan-phase ${decimalPhase} to break down)\n`;

  // Insert after the target phase section
  const headerPattern: RegExp = new RegExp(
    `(#{2,}\\s*Phase\\s+${afterPhaseEscaped}:[^\\n]*\\n)`,
    'i'
  );
  const headerMatch: RegExpMatchArray | null = content.match(headerPattern);
  if (!headerMatch) {
    error(
      `Could not find Phase ${afterPhase} header in ROADMAP.md. Ensure the phase heading matches the format "## Phase ${afterPhase}: <description>"`
    );
  }

  const headerIdx: number = content.indexOf(headerMatch![0]);
  const afterHeader: string = content.slice(
    headerIdx + headerMatch![0].length
  );
  const nextPhaseMatch: RegExpMatchArray | null = afterHeader.match(
    /\n#{2,}\s+Phase\s+\d/i
  );

  let insertIdx: number;
  if (nextPhaseMatch && nextPhaseMatch.index !== undefined) {
    insertIdx = headerIdx + headerMatch![0].length + nextPhaseMatch.index;
  } else {
    insertIdx = content.length;
  }

  const updatedContent: string =
    content.slice(0, insertIdx) + phaseEntry + content.slice(insertIdx);
  writeRoadmapFile(roadmapPath, updatedContent);

  const result: PhaseInsertResult = {
    phase_number: decimalPhase,
    after_phase: afterPhase,
    name: description,
    slug,
    directory: path.relative(cwd, dirPath) as string,
    schedule_affected: true,
  };

  output(result, raw, decimalPhase);
}

// ─── Phase Remove ─────────────────────────────────────────────────────────────

/**
 * Validate the targetPhase argument for phase remove.
 * Calls error() and returns false if invalid; returns true if valid.
 * @param targetPhase - Phase number to validate
 */
function _validateRemoveArgs(targetPhase: string): boolean {
  if (!targetPhase) {
    error(
      "phase number required for phase remove. Usage: phase remove <N>. Provide the phase number to remove, e.g.: phase remove 3. Run 'phase list' to see available phases."
    );
    return false;
  }
  return true;
}

/**
 * Renumber integer phase directories after removing an integer phase.
 * All directories with an integer part greater than removedInt are shifted down by 1.
 * Mutates renamedDirs and renamedFiles arrays in place.
 * @param phasesDir - Absolute path to the phases directory
 * @param removedInt - The integer phase number that was removed
 * @param renamedDirs - Accumulator for renamed directories
 * @param renamedFiles - Accumulator for renamed files
 */
function _renumberIntegerPhases(
  phasesDir: string,
  removedInt: number,
  renamedDirs: RenameEntry[],
  renamedFiles: RenameEntry[]
): void {
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name)
      .sort();

    // Collect directories that need renumbering (integer phases > removed, and their decimals)
    const toRename: IntegerRenumberItem[] = [];
    for (const dir of dirs) {
      const dm: RegExpMatchArray | null = dir.match(
        /^(\d+)(?:\.(\d+))?-(.+)$/
      );
      if (!dm) continue;
      const dirInt: number = parseInt(dm[1], 10);
      if (dirInt > removedInt) {
        toRename.push({
          dir,
          oldInt: dirInt,
          decimal: dm[2] ? parseInt(dm[2], 10) : null,
          slug: dm[3],
        });
      }
    }

    // Sort descending to avoid conflicts
    toRename.sort((a: IntegerRenumberItem, b: IntegerRenumberItem) => {
      if (a.oldInt !== b.oldInt) return b.oldInt - a.oldInt;
      return (b.decimal || 0) - (a.decimal || 0);
    });

    for (const item of toRename) {
      const newInt: number = item.oldInt - 1;
      const newPadded: string = String(newInt).padStart(2, '0');
      const oldPadded: string = String(item.oldInt).padStart(2, '0');
      const decimalSuffix: string =
        item.decimal !== null ? `.${item.decimal}` : '';
      const oldPrefix: string = `${oldPadded}${decimalSuffix}`;
      const newPrefix: string = `${newPadded}${decimalSuffix}`;
      const newDirName: string = `${newPrefix}-${item.slug}`;

      // Rename directory
      fs.renameSync(
        path.join(phasesDir, item.dir),
        path.join(phasesDir, newDirName)
      );
      renamedDirs.push({ from: item.dir, to: newDirName });

      // Rename files inside
      let dirFiles: string[];
      try {
        dirFiles = fs.readdirSync(
          path.join(phasesDir, newDirName)
        ) as string[];
      } catch (readDirErr) {
        const typedErr = readDirErr as { code?: string; message: string };
        if (typedErr.code && typedErr.code !== 'ENOENT') {
          process.stderr.write(
            `[phase] renumber read error (${typedErr.code}): ${typedErr.message}\n`
          );
        }
        continue;
      }
      for (const f of dirFiles) {
        if (f.startsWith(oldPrefix)) {
          const newFileName: string = newPrefix + f.slice(oldPrefix.length);
          fs.renameSync(
            path.join(phasesDir, newDirName, f),
            path.join(phasesDir, newDirName, newFileName)
          );
          renamedFiles.push({ from: f, to: newFileName });
        }
      }
    }
  } catch (renumberErr) {
    const typedErr = renumberErr as { code?: string; message: string };
    if (typedErr.code && typedErr.code !== 'ENOENT') {
      process.stderr.write(
        `[phase] renumber error (${typedErr.code}): ${typedErr.message}\n`
      );
    }
  }
}

/**
 * Renumber decimal phase directories after removing a decimal phase.
 * Sibling decimals with a higher decimal part than removedDecimal are shifted down by 1.
 * Mutates renamedDirs and renamedFiles arrays in place.
 * @param phasesDir - Absolute path to the phases directory
 * @param baseInt - The integer part of the removed decimal phase (e.g. "06")
 * @param removedDecimal - The decimal part that was removed (e.g. 2 for "06.2")
 * @param renamedDirs - Accumulator for renamed directories
 * @param renamedFiles - Accumulator for renamed files
 */
function _renumberDecimalPhases(
  phasesDir: string,
  baseInt: string,
  removedDecimal: number,
  renamedDirs: RenameEntry[],
  renamedFiles: RenameEntry[]
): void {
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name)
      .sort();

    // Find sibling decimals with higher numbers
    const decPattern: RegExp = new RegExp(`^${baseInt}\\.(\\d+)-(.+)$`);
    const toRename: DecimalRenumberItem[] = [];
    for (const dir of dirs) {
      const dm: RegExpMatchArray | null = dir.match(decPattern);
      if (dm && parseInt(dm[1], 10) > removedDecimal) {
        toRename.push({
          dir,
          oldDecimal: parseInt(dm[1], 10),
          slug: dm[2],
        });
      }
    }

    // Sort descending to avoid conflicts
    toRename.sort(
      (a: DecimalRenumberItem, b: DecimalRenumberItem) =>
        b.oldDecimal - a.oldDecimal
    );

    for (const item of toRename) {
      const newDecimal: number = item.oldDecimal - 1;
      const oldPhaseId: string = `${baseInt}.${item.oldDecimal}`;
      const newPhaseId: string = `${baseInt}.${newDecimal}`;
      const newDirName: string = `${baseInt}.${newDecimal}-${item.slug}`;

      // Rename directory
      fs.renameSync(
        path.join(phasesDir, item.dir),
        path.join(phasesDir, newDirName)
      );
      renamedDirs.push({ from: item.dir, to: newDirName });

      // Rename files inside
      const dirFiles: string[] = fs.readdirSync(
        path.join(phasesDir, newDirName)
      ) as string[];
      for (const f of dirFiles) {
        // Files may have phase prefix like "06.2-01-PLAN.md"
        if (f.includes(oldPhaseId)) {
          const newFileName: string = f.replace(oldPhaseId, newPhaseId);
          fs.renameSync(
            path.join(phasesDir, newDirName, f),
            path.join(phasesDir, newDirName, newFileName)
          );
          renamedFiles.push({ from: f, to: newFileName });
        }
      }
    }
  } catch {
    // Phases directory may not exist; no decimal phases to rename
  }
}

/**
 * Rename phase directories and files after a phase removal.
 * Dispatches to _renumberIntegerPhases or _renumberDecimalPhases based on isDecimal.
 * @param phasesDir - Absolute path to the phases directory
 * @param normalized - Normalized phase number string (e.g. "06" or "06.2")
 * @param isDecimal - Whether the removed phase was a decimal phase
 */
function _reorderDirectories(
  phasesDir: string,
  normalized: string,
  isDecimal: boolean
): ReorderResult {
  const renamedDirs: RenameEntry[] = [];
  const renamedFiles: RenameEntry[] = [];

  if (isDecimal) {
    const baseParts: string[] = normalized.split('.');
    const baseInt: string = baseParts[0];
    const removedDecimal: number = parseInt(baseParts[1], 10);
    _renumberDecimalPhases(
      phasesDir,
      baseInt,
      removedDecimal,
      renamedDirs,
      renamedFiles
    );
  } else {
    const removedInt: number = parseInt(normalized, 10);
    _renumberIntegerPhases(phasesDir, removedInt, renamedDirs, renamedFiles);
  }

  return { renamedDirs, renamedFiles };
}

/**
 * Update ROADMAP.md text after a phase removal: remove the target section and renumber
 * all subsequent phase references (headings, checkboxes, plan refs, table rows, depends-on).
 * @param roadmapContent - Current ROADMAP.md content
 * @param targetPhase - The phase number that was removed (e.g. "06" or "06.2")
 * @param normalized - Normalized phase number string
 * @param isDecimal - Whether the removed phase was a decimal phase
 */
function _reorderRoadmapEntries(
  roadmapContent: string,
  targetPhase: string,
  normalized: string,
  isDecimal: boolean
): string {
  const targetEscaped: string = targetPhase.replace(/\./g, '\\.');

  // Remove the target phase section
  const sectionPattern: RegExp = new RegExp(
    `\\n?#{2,}\\s*Phase\\s+${targetEscaped}\\s*:[\\s\\S]*?(?=\\n#{2,}\\s+Phase\\s+\\d|$)`,
    'i'
  );
  roadmapContent = roadmapContent.replace(sectionPattern, '');

  // Remove from phase list (checkbox)
  const checkboxPattern: RegExp = new RegExp(
    `\\n?-\\s*\\[[ x]\\]\\s*.*Phase\\s+${targetEscaped}[:\\s][^\\n]*`,
    'gi'
  );
  roadmapContent = roadmapContent.replace(checkboxPattern, '');

  // Remove from progress table
  const tableRowPattern: RegExp = new RegExp(
    `\\n?\\|\\s*${targetEscaped}\\.?\\s[^|]*\\|[^\\n]*`,
    'gi'
  );
  roadmapContent = roadmapContent.replace(tableRowPattern, '');

  // Renumber references in ROADMAP for subsequent integer phases
  if (!isDecimal) {
    const removedInt: number = parseInt(normalized, 10);

    // Collect all integer phases > removedInt
    const maxPhase = 99; // reasonable upper bound
    for (let oldNum: number = maxPhase; oldNum > removedInt; oldNum--) {
      const newNum: number = oldNum - 1;
      const oldStr: string = String(oldNum);
      const newStr: string = String(newNum);
      const oldPad: string = oldStr.padStart(2, '0');
      const newPad: string = newStr.padStart(2, '0');

      // Phase headings: ### Phase 18: -> ### Phase 17: (or ## Phase)
      roadmapContent = roadmapContent.replace(
        new RegExp(`(#{2,}\\s*Phase\\s+)${oldStr}(\\s*:)`, 'gi'),
        `$1${newStr}$2`
      );

      // Checkbox items: - [ ] **Phase 18:** -> - [ ] **Phase 17:**
      roadmapContent = roadmapContent.replace(
        new RegExp(`(Phase\\s+)${oldStr}([:\\s])`, 'g'),
        `$1${newStr}$2`
      );

      // Plan references: 18-01 -> 17-01
      roadmapContent = roadmapContent.replace(
        new RegExp(`${oldPad}-(\\d{2})`, 'g'),
        `${newPad}-$1`
      );

      // Table rows: | 18. -> | 17.
      roadmapContent = roadmapContent.replace(
        new RegExp(`(\\|\\s*)${oldStr}\\.\\s`, 'g'),
        `$1${newStr}. `
      );

      // Depends on references
      roadmapContent = roadmapContent.replace(
        new RegExp(
          `(Depends on:\\*\\*\\s*Phase\\s+)${oldStr}\\b`,
          'gi'
        ),
        `$1${newStr}`
      );
    }
  }

  return roadmapContent;
}

/**
 * Patch frontmatter phase references inside plan/summary files when phases are renumbered.
 * Currently a no-op placeholder -- frontmatter phase refs are not yet tracked in this workflow.
 * @param _phasesDir - Absolute path to the phases directory
 * @param _oldNum - Old phase number string
 * @param _newNum - New phase number string
 */
function _patchFrontmatterRefs(
  _phasesDir: string,
  _oldNum: string,
  _newNum: string
): void {
  // No frontmatter phase references are currently maintained in plan/summary files.
  // This is a reserved hook for future frontmatter ref tracking.
}

/**
 * CLI command: Remove a phase from the roadmap, delete its directory, and renumber subsequent phases.
 * @param cwd - Project working directory
 * @param targetPhase - Phase number to remove (integer or decimal)
 * @param options - Remove options
 * @param raw - Output raw text instead of JSON
 * @returns void — writes JSON or raw text to stdout and exits on error
 */
function cmdPhaseRemove(
  cwd: string,
  targetPhase: string,
  options: PhaseRemoveOptions,
  raw: boolean
): void {
  if (!_validateRemoveArgs(targetPhase)) return;

  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir: string = getPhasesDirPath(cwd);
  const force: boolean = options.force || false;
  const dryRun: boolean = options.dryRun || false;

  // Read ROADMAP.md FIRST (before any mutations) to detect unreadable state early
  let roadmapContent: string;
  try {
    roadmapContent = readRoadmapFile(roadmapPath);
  } catch (readErr) {
    error(
      `Cannot read ROADMAP.md: ${(readErr as Error).message}. Ensure .planning/ROADMAP.md exists and is readable, then retry.`
    );
    return;
  }

  // Normalize the target
  const normalized: string = normalizePhaseName(targetPhase);
  const isDecimal: boolean = targetPhase.includes('.');

  // Find and validate target directory
  let targetDir: string | null = null;
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name)
      .sort();
    targetDir =
      dirs.find(
        (d: string) => d.startsWith(normalized + '-') || d === normalized
      ) || null;
  } catch {
    // Phases directory may not exist; targetDir stays null
  }

  // Check for executed work (SUMMARY.md files) -- skip when dry-run
  if (targetDir && !force && !dryRun) {
    const targetPath: string = path.join(phasesDir, targetDir);
    const files: string[] = fs.readdirSync(targetPath) as string[];
    const summaries: string[] = files.filter(
      (f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md'
    );
    if (summaries.length > 0) {
      error(
        `Phase ${targetPhase} has ${summaries.length} executed plan(s). Use --force to remove anyway.`
      );
    }
  }

  // Dry-run: collect what would happen and return early
  if (dryRun) {
    // Predict which phases would be renumbered
    const wouldRenumber: string[] = [];
    try {
      const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
        withFileTypes: true,
      });
      const dirs: string[] = entries
        .filter((e: import('fs').Dirent) => e.isDirectory())
        .map((e: import('fs').Dirent) => e.name)
        .sort();
      const removedInt: number = parseInt(normalized, 10);
      for (const dir of dirs) {
        const dm: RegExpMatchArray | null = dir.match(
          /^(\d+)(?:\.(\d+))?-(.+)$/
        );
        if (!dm) continue;
        const dirInt: number = parseInt(dm[1], 10);
        if (dirInt > removedInt) {
          wouldRenumber.push(dir);
        }
      }
    } catch {
      // Phases directory may not exist; dry-run preview will show empty renumber list
    }

    const result: PhaseRemoveResult = {
      dry_run: true,
      would_remove: targetDir || normalized,
      would_renumber: wouldRenumber,
      removed: targetPhase,
      directory_deleted: null,
      renamed_directories: [],
      renamed_files: [],
      roadmap_updated: false,
      state_updated: false,
    };
    output(result, raw, `dry-run: would remove phase ${targetPhase}`);
    return;
  }

  // Delete target directory
  if (targetDir) {
    fs.rmSync(path.join(phasesDir, targetDir), {
      recursive: true,
      force: true,
    });
  }

  // Clean up matching .worktrees/ directories
  const cleanedWorktrees: string[] = [];
  const worktreesDir: string = path.join(cwd, '.worktrees');
  if (fs.existsSync(worktreesDir)) {
    try {
      const wtEntries: import('fs').Dirent[] = fs.readdirSync(worktreesDir, {
        withFileTypes: true,
      });
      const wtPattern: RegExp = new RegExp(`-${normalized}(?:-|$)`);
      for (const entry of wtEntries) {
        if (entry.isDirectory() && wtPattern.test(entry.name)) {
          const wtPath: string = path.join(worktreesDir, entry.name);
          fs.rmSync(wtPath, { recursive: true, force: true });
          cleanedWorktrees.push(entry.name);
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Renumber subsequent phases (directories + files)
  const { renamedDirs, renamedFiles }: ReorderResult = _reorderDirectories(
    phasesDir,
    normalized,
    isDecimal
  );

  // Patch frontmatter refs for all renumbered phases
  _patchFrontmatterRefs(
    phasesDir,
    normalized,
    isDecimal ? normalized : normalized
  );

  // Update ROADMAP.md (already read above)
  roadmapContent = _reorderRoadmapEntries(
    roadmapContent,
    targetPhase,
    normalized,
    isDecimal
  );
  writeRoadmapFile(roadmapPath, roadmapContent);

  // Update STATE.md phase count
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  if (fs.existsSync(statePath)) {
    let stateContent: string = readStateFile(statePath);
    // Update "Total Phases" field
    const totalPattern: RegExp = /(\*\*Total Phases:\*\*\s*)(\d+)/;
    const totalMatch: RegExpMatchArray | null =
      stateContent.match(totalPattern);
    if (totalMatch) {
      const oldTotal: number = parseInt(totalMatch[2], 10);
      stateContent = stateContent.replace(
        totalPattern,
        `$1${oldTotal - 1}`
      );
    }
    // Update "Phase: X of Y" pattern
    const ofPattern: RegExp = /(\bof\s+)(\d+)(\s*(?:\(|phases?))/i;
    const ofMatch: RegExpMatchArray | null = stateContent.match(ofPattern);
    if (ofMatch) {
      const oldTotal: number = parseInt(ofMatch[2], 10);
      stateContent = stateContent.replace(ofPattern, `$1${oldTotal - 1}$3`);
    }
    writeStateFile(statePath, stateContent);
  }

  const result: PhaseRemoveResult = {
    removed: targetPhase,
    directory_deleted: targetDir || null,
    renamed_directories: renamedDirs,
    renamed_files: renamedFiles,
    roadmap_updated: true,
    state_updated: fs.existsSync(statePath),
    ...(cleanedWorktrees.length > 0
      ? { cleaned_worktrees: cleanedWorktrees }
      : {}),
  };

  output(result, raw, `Removed phase ${result.removed}`);
}

// ─── Phase Complete (Transition) ──────────────────────────────────────────────

/**
 * Core logic for phase completion -- shared by cmdPhaseComplete and cmdPhaseBatchComplete.
 * @param cwd - Project working directory
 * @param phaseNum - Phase number to mark complete
 * @param options - Completion options
 */
function _phaseCompleteCore(
  cwd: string,
  phaseNum: string,
  options?: PhaseCompleteOptions
): PhaseCompleteResult {
  const dryRun: boolean = (options && options.dryRun) || false;

  // Dry-run: return preview without modifying anything
  if (dryRun) {
    const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
    return {
      dry_run: true,
      would_complete_phase: phaseNum,
      phase_found: !!phaseInfo,
    };
  }

  // Pre-flight gate checks
  const gates: PreflightResult = runPreflightGates(cwd, 'phase-complete', {
    phase: phaseNum,
  });
  if (!gates.passed) {
    return {
      gate_failed: true,
      gate_errors: gates.errors,
      gate_warnings: gates.warnings,
    };
  }

  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  const phasesDir: string = getPhasesDirPath(cwd);
  const today: string = new Date().toISOString().split('T')[0];

  // Verify phase info
  const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
  if (!phaseInfo) {
    throw new Error(`Phase ${phaseNum} not found`);
  }

  const planCount: number = phaseInfo.plans.length;
  const summaryCount: number = phaseInfo.summaries.length;

  // Update ROADMAP.md: mark phase complete
  if (fs.existsSync(roadmapPath)) {
    let roadmapContent: string = readRoadmapFile(roadmapPath);

    // Checkbox: - [ ] Phase N: -> - [x] Phase N: (...completed DATE)
    const checkboxPattern: RegExp = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Phase\\s+${phaseNum.replace('.', '\\.')}[:\\s][^\\n]*)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(
      checkboxPattern,
      `$1x$2 (completed ${today})`
    );

    // Progress table: update Status to Complete, add date
    const phaseEscaped: string = phaseNum.replace('.', '\\.');
    const tablePattern: RegExp = new RegExp(
      `(\\|\\s*${phaseEscaped}\\.?\\s[^|]*\\|[^|]*\\|)\\s*[^|]*(\\|)\\s*[^|]*(\\|)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(
      tablePattern,
      `$1 Complete    $2 ${today} $3`
    );

    // Update plan count in phase section
    const planCountPattern: RegExp = new RegExp(
      `(#{2,}\\s*Phase\\s+${phaseEscaped}[\\s\\S]*?\\*\\*Plans:\\*\\*\\s*)[^\\n]+`,
      'i'
    );
    roadmapContent = roadmapContent.replace(
      planCountPattern,
      `$1${summaryCount}/${planCount} plans complete`
    );

    writeRoadmapFile(roadmapPath, roadmapContent);
  }

  // Find next phase
  let nextPhaseNum: string | null = null;
  let nextPhaseName: string | null = null;
  let isLastPhase = true;

  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name)
      .sort();
    const currentFloat: number = parseFloat(phaseNum);

    // Find the next phase directory after current
    for (const dir of dirs) {
      const dm: RegExpMatchArray | null = dir.match(
        /^(\d+(?:\.\d+)?)-?(.*)/
      );
      if (dm) {
        const dirFloat: number = parseFloat(dm[1]);
        if (dirFloat > currentFloat) {
          nextPhaseNum = dm[1];
          nextPhaseName = dm[2] || null;
          isLastPhase = false;
          break;
        }
      }
    }
  } catch {
    // Phases directory may not exist; isLastPhase stays true
  }

  // Update STATE.md
  if (fs.existsSync(statePath)) {
    let stateContent: string = readStateFile(statePath);

    // Update Current Phase
    stateContent = stateContent.replace(
      /(\*\*Current Phase:\*\*\s*).*/,
      `$1${nextPhaseNum || phaseNum}`
    );

    // Update Current Phase Name
    if (nextPhaseName) {
      stateContent = stateContent.replace(
        /(\*\*Current Phase Name:\*\*\s*).*/,
        `$1${nextPhaseName.replace(/-/g, ' ')}`
      );
    }

    // Update Status
    stateContent = stateContent.replace(
      /(\*\*Status:\*\*\s*).*/,
      `$1${isLastPhase ? 'Milestone complete' : 'Ready to plan'}`
    );

    // Update Current Plan
    stateContent = stateContent.replace(
      /(\*\*Current Plan:\*\*\s*).*/,
      `$1Not started`
    );

    // Update Last Activity
    stateContent = stateContent.replace(
      /(\*\*Last Activity:\*\*\s*).*/,
      `$1${today}`
    );

    // Update Last Activity Description
    stateContent = stateContent.replace(
      /(\*\*Last Activity Description:\*\*\s*).*/,
      `$1Phase ${phaseNum} complete${nextPhaseNum ? `, transitioned to Phase ${nextPhaseNum}` : ''}`
    );

    writeStateFile(statePath, stateContent);
  }

  // Run quality analysis if enabled
  let qualityReport: QualityAnalysisResult | null = null;
  try {
    const qaResult: QualityAnalysisResult = runQualityAnalysis(cwd, phaseNum);
    if (!qaResult.skipped) {
      qualityReport = qaResult;
    }
  } catch {
    // Quality analysis is non-blocking; swallow errors
  }

  // Generate cleanup plan if quality issues exceed threshold
  let cleanupPlanResult: CleanupPlanResult | null = null;
  if (qualityReport && !qualityReport.skipped) {
    try {
      cleanupPlanResult = generateCleanupPlan(cwd, phaseNum, qualityReport);
    } catch {
      // Cleanup plan generation is non-blocking
    }
  }

  return {
    completed_phase: phaseNum,
    phase_name: phaseInfo.phase_name,
    plans_executed: `${summaryCount}/${planCount}`,
    next_phase: nextPhaseNum,
    next_phase_name: nextPhaseName,
    is_last_phase: isLastPhase,
    date: today,
    roadmap_updated: fs.existsSync(roadmapPath),
    state_updated: fs.existsSync(statePath),
    ...(qualityReport ? { quality_report: qualityReport } : {}),
    ...(cleanupPlanResult
      ? { cleanup_plan_generated: cleanupPlanResult }
      : {}),
  };
}

/**
 * CLI command: Mark a phase as complete, update STATE.md, ROADMAP.md, and run quality analysis.
 * @param cwd - Project working directory
 * @param phaseNum - Phase number to complete (e.g., '02' or '2')
 * @param raw - Output raw text instead of JSON
 * @param options - Options (e.g., dryRun, force)
 * @returns void — writes JSON or raw text to stdout and exits on error
 */
function cmdPhaseComplete(
  cwd: string,
  phaseNum: string,
  raw: boolean,
  options?: PhaseCompleteOptions
): void {
  if (!phaseNum) {
    error(
      "phase number required for phase complete. Usage: phase complete <N>. Provide the phase number to mark complete, e.g.: phase complete 3. Run 'phase list' to see available phases."
    );
  }

  let result: PhaseCompleteResult;
  try {
    result = _phaseCompleteCore(cwd, phaseNum, options);
  } catch (e) {
    error((e as Error).message);
    return; // unreachable after error() but helps TS narrowing
  }

  let rawOutput = '';
  if (raw) {
    if (result.dry_run) {
      rawOutput = `dry-run: would complete phase ${phaseNum}`;
    } else if (result.gate_failed) {
      rawOutput = '';
    } else {
      rawOutput = `Phase ${phaseNum} complete. ${result.plans_executed} plans executed.`;
      if (result.next_phase) {
        rawOutput += ` Next: Phase ${result.next_phase}`;
      }
      if (
        result.quality_report &&
        result.quality_report.summary &&
        result.quality_report.summary.total_issues > 0
      ) {
        rawOutput += ` | Quality: ${result.quality_report.summary.total_issues} issue(s) found`;
      }
      if (result.cleanup_plan_generated) {
        rawOutput += ` | Cleanup plan generated: ${result.cleanup_plan_generated.path}`;
      }
    }
  }

  output(result, raw, rawOutput);
}

// ─── Milestone Complete ───────────────────────────────────────────────────────

/**
 * Archive phase directories and supporting files (.planning/ROADMAP.md,
 * REQUIREMENTS.md, audit) for a completed milestone.
 * @param cwd - Project working directory
 * @param _version - Milestone version string (unused but kept for API consistency)
 * @param _sourceDir - Directory containing the phase subdirectories (unused but kept for API consistency)
 * @param archiveDir - Destination directory for archived files
 * @param ctx - Additional context for archival
 */
function _archiveMilestone(
  cwd: string,
  version: string,
  _sourceDir: string,
  archiveDir: string,
  ctx: ArchiveContext
): ArchiveResult {
  const {
    roadmapPath,
    reqPath,
    milestoneName,
    today,
    phasesDir,
    phaseCount,
    totalPlans,
    totalTasks,
    accomplishments,
    phasesAlreadyInPlace,
  } = ctx;

  // Archive phase directories to .planning/milestones/{version}-phases/
  const phasesArchiveDir: string = getArchivedPhasesDir(cwd, version);
  let archivedPhaseCount = 0;

  if (phasesAlreadyInPlace) {
    // Phases already live under milestones/{version}/phases/ -- skip redundant copy
    archivedPhaseCount = phaseCount;
  } else {
    // Old-style layout -- copy phases to archive, then delete originals
    try {
      const phaseEntries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
        withFileTypes: true,
      });
      const phaseDirs: string[] = phaseEntries
        .filter((e: import('fs').Dirent) => e.isDirectory())
        .map((e: import('fs').Dirent) => e.name);
      if (phaseDirs.length > 0) {
        fs.mkdirSync(phasesArchiveDir, { recursive: true });
        for (let _pi = 0; _pi < phaseDirs.length; _pi++) {
          const dir: string = phaseDirs[_pi];
          process.stderr.write(
            `  Archiving phase ${_pi + 1}/${phaseDirs.length}: ${dir}\n`
          );
          fs.cpSync(
            path.join(phasesDir, dir),
            path.join(phasesArchiveDir, dir),
            { recursive: true }
          );
          fs.rmSync(path.join(phasesDir, dir), {
            recursive: true,
            force: true,
          });
          archivedPhaseCount++;
        }
      }
    } catch {
      // Phase archival is non-blocking
    }
  }

  // Archive ROADMAP.md
  if (fs.existsSync(roadmapPath)) {
    const roadmapContent: string = readRoadmapFile(roadmapPath);
    fs.writeFileSync(
      path.join(archiveDir, `${version}-ROADMAP.md`),
      roadmapContent,
      'utf-8'
    );
  }

  // Archive REQUIREMENTS.md
  if (fs.existsSync(reqPath)) {
    const reqContent: string = fs.readFileSync(reqPath, 'utf-8') as string;
    const archiveHeader: string = `# Requirements Archive: ${version} ${milestoneName}\n\n**Archived:** ${today}\n**Status:** SHIPPED\n\nFor current requirements, see \`.planning/REQUIREMENTS.md\`.\n\n---\n\n`;
    fs.writeFileSync(
      path.join(archiveDir, `${version}-REQUIREMENTS.md`),
      archiveHeader + reqContent,
      'utf-8'
    );
  }

  // Archive audit file if exists
  const auditFile: string = path.join(
    cwd,
    '.planning',
    `${version}-MILESTONE-AUDIT.md`
  );
  if (fs.existsSync(auditFile)) {
    fs.renameSync(
      auditFile,
      path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`)
    );
  }

  // Write archived.json metadata marker (REQ-60)
  const milestoneVersionDir: string = path.join(
    cwd,
    '.planning',
    'milestones',
    version
  );
  fs.mkdirSync(milestoneVersionDir, { recursive: true });
  const markerPath: string = path.join(milestoneVersionDir, 'archived.json');
  const marker: {
    version: string;
    name: string;
    archived_date: string;
    phases: number;
    plans: number;
    tasks: number;
    accomplishments: string[];
  } = {
    version,
    name: milestoneName,
    archived_date: today,
    phases: phaseCount,
    plans: totalPlans,
    tasks: totalTasks,
    accomplishments,
  };
  fs.writeFileSync(
    markerPath,
    JSON.stringify(marker, null, 2) + '\n',
    'utf-8'
  );

  return { archivedPhaseCount };
}

/**
 * Patch STATE.md after a milestone is marked complete.
 * Updates Status, Last Activity, and Last Activity Description fields.
 * @param cwd - Project working directory
 * @param version - Milestone version string (e.g. 'v1.0')
 * @param today - ISO date string for today (YYYY-MM-DD)
 */
function _updateStateAfterComplete(
  cwd: string,
  version: string,
  today: string
): boolean {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  if (!fs.existsSync(statePath)) return false;

  let stateContent: string = readStateFile(statePath);
  stateContent = stateContent.replace(
    /(\*\*Status:\*\*\s*).*/,
    `$1${version} milestone complete`
  );
  stateContent = stateContent.replace(
    /(\*\*Last Activity:\*\*\s*).*/,
    `$1${today}`
  );
  stateContent = stateContent.replace(
    /(\*\*Last Activity Description:\*\*\s*).*/,
    `$1${version} milestone completed and archived`
  );
  writeStateFile(statePath, stateContent);
  return true;
}

/**
 * Rewrite MILESTONES.md after a milestone is complete, appending the new entry.
 * @param milestonesPath - Absolute path to MILESTONES.md
 * @param version - Milestone version string (e.g. 'v1.0')
 * @param milestoneName - Display name for the milestone
 * @param today - ISO date string for today (YYYY-MM-DD)
 * @param phaseCount - Number of phases completed
 * @param totalPlans - Total plans executed
 * @param totalTasks - Total tasks executed
 * @param accomplishments - List of one-liner accomplishment strings
 */
function _rewriteRoadmapAfterComplete(
  milestonesPath: string,
  version: string,
  milestoneName: string,
  today: string,
  phaseCount: number,
  totalPlans: number,
  totalTasks: number,
  accomplishments: string[]
): void {
  const accomplishmentsList: string = accomplishments
    .map((a: string) => `- ${a}`)
    .join('\n');
  const milestoneEntry: string = `## ${version} ${milestoneName} (Shipped: ${today})\n\n**Phases completed:** ${phaseCount} phases, ${totalPlans} plans, ${totalTasks} tasks\n\n**Key accomplishments:**\n${accomplishmentsList || '- (none recorded)'}\n\n---\n\n`;

  if (fs.existsSync(milestonesPath)) {
    const existing: string = fs.readFileSync(
      milestonesPath,
      'utf-8'
    ) as string;
    fs.writeFileSync(
      milestonesPath,
      existing + '\n' + milestoneEntry,
      'utf-8'
    );
  } else {
    fs.writeFileSync(
      milestonesPath,
      `# Milestones\n\n${milestoneEntry}`,
      'utf-8'
    );
  }
}

/**
 * CLI command: Archive a completed milestone, gather stats, and update MILESTONES.md and STATE.md.
 * @param cwd - Project working directory
 * @param version - Milestone version to complete (e.g., 'v1.0')
 * @param options - Milestone options
 * @param raw - Output raw text instead of JSON
 * @returns void — writes JSON or raw text to stdout and exits on error
 */
function cmdMilestoneComplete(
  cwd: string,
  version: string,
  options: MilestoneCompleteOptions,
  raw: boolean
): void {
  if (!version) {
    error(
      'version required for milestone complete (e.g., v1.0). Usage: milestone complete <version>. Provide the milestone version, e.g.: milestone complete v1.2.0. Check .planning/ROADMAP.md for the current milestone version.'
    );
  }

  const dryRun: boolean = (options && options.dryRun) || false;

  // Dry-run: return preview without modifying anything
  if (dryRun) {
    const result: { dry_run: boolean; would_archive_version: string } = {
      dry_run: true,
      would_archive_version: version,
    };
    output(result, raw, `dry-run: would archive milestone ${version}`);
    return;
  }

  // Pre-flight gate checks
  const gates: PreflightResult = runPreflightGates(
    cwd,
    'milestone-complete'
  );
  if (!gates.passed) {
    output(
      {
        gate_failed: true,
        gate_errors: gates.errors,
        gate_warnings: gates.warnings,
      },
      raw
    );
    return;
  }

  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  const reqPath: string = path.join(cwd, '.planning', 'REQUIREMENTS.md');
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  const milestonesPath: string = path.join(cwd, '.planning', 'MILESTONES.md');
  const archiveDir: string = getMilestonesDirPath(cwd);
  const phasesDir: string = getPhasesDirPath(cwd);
  const today: string = new Date().toISOString().split('T')[0];
  const milestoneName: string = options.name || version;

  // Ensure archive directory exists
  fs.mkdirSync(archiveDir, { recursive: true });

  // Check if phases are already under the milestone directory (new-style layout)
  const milestonePhaseDir: string = path.join(
    cwd,
    '.planning',
    'milestones',
    version,
    'phases'
  );
  let phasesAlreadyInPlace = false;
  try {
    phasesAlreadyInPlace =
      fs.existsSync(milestonePhaseDir) &&
      (
        fs.readdirSync(milestonePhaseDir, {
          withFileTypes: true,
        }) as import('fs').Dirent[]
      ).some((e: import('fs').Dirent) => e.isDirectory());
  } catch {
    // Milestone phases directory may not exist; assume old-style layout
  }

  // Determine the source directory for stat gathering
  const statsSourceDir: string = phasesAlreadyInPlace
    ? milestonePhaseDir
    : phasesDir;

  // Gather stats from phases
  let phaseCount = 0;
  let totalPlans = 0;
  let totalTasks = 0;
  const accomplishments: string[] = [];

  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(statsSourceDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name)
      .sort();

    for (const dir of dirs) {
      phaseCount++;
      const phaseFiles: string[] = fs.readdirSync(
        path.join(statsSourceDir, dir)
      ) as string[];
      const plans: string[] = phaseFiles.filter(
        (f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md'
      );
      const summaries: string[] = phaseFiles.filter(
        (f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md'
      );
      totalPlans += plans.length;

      // Extract one-liners from summaries
      for (let _si = 0; _si < summaries.length; _si++) {
        const s: string = summaries[_si];
        process.stderr.write(
          `  Reading summary ${_si + 1}/${summaries.length}: ${s}\n`
        );
        try {
          const content: string = fs.readFileSync(
            path.join(statsSourceDir, dir, s),
            'utf-8'
          ) as string;
          const fm: FrontmatterObject = extractFrontmatter(content);
          if (fm['one-liner']) {
            accomplishments.push(fm['one-liner'] as string);
          }
          // Count tasks
          const taskMatches: RegExpMatchArray | null =
            content.match(/##\s*Task\s*\d+/gi);
          totalTasks += taskMatches ? taskMatches.length : 0;
        } catch {
          // Summary file unreadable; skip one-liner and task count for this file
        }
      }
    }
  } catch {
    // Stats source directory may not exist; use zero stats
  }

  // Archive phases, documents, and write metadata marker
  const archiveCtx: ArchiveContext = {
    roadmapPath,
    reqPath,
    milestoneName,
    today,
    phasesDir,
    phaseCount,
    totalPlans,
    totalTasks,
    accomplishments,
    phasesAlreadyInPlace,
  };
  const { archivedPhaseCount }: ArchiveResult = _archiveMilestone(
    cwd,
    version,
    statsSourceDir,
    archiveDir,
    archiveCtx
  );

  // Append entry to MILESTONES.md
  _rewriteRoadmapAfterComplete(
    milestonesPath,
    version,
    milestoneName,
    today,
    phaseCount,
    totalPlans,
    totalTasks,
    accomplishments
  );

  // Update STATE.md
  _updateStateAfterComplete(cwd, version, today);

  // Merge milestone branch into base branch (if branching strategy is active)
  let gitMerge: GitMergeResult | null = null;
  try {
    const config: GrdConfig = loadConfig(cwd);
    if (config.branching_strategy && config.branching_strategy !== 'none') {
      const template: string =
        config.milestone_branch_template || 'grd/{milestone}-{slug}';
      let msName: string = milestoneName;
      try {
        const msInfo: MilestoneInfo = getMilestoneInfoUtil(cwd);
        msName = msInfo.name || milestoneName;
      } catch {
        // Use milestoneName from options
      }
      const msSlug: string = generateSlugInternal(msName) || 'milestone';
      const msBranch: string = template
        .replace('{milestone}', version)
        .replace('{slug}', msSlug);
      const baseBranch: string = config.base_branch || 'main';

      // Check if milestone branch exists
      const msCheck = execGit(cwd, ['rev-parse', '--verify', msBranch]);
      if (msCheck.exitCode !== 0) {
        gitMerge = {
          skipped: true,
          reason: `Milestone branch '${msBranch}' not found`,
        };
      } else {
        // Record current branch
        const headResult = execGit(cwd, [
          'rev-parse',
          '--abbrev-ref',
          'HEAD',
        ]);
        const originalBranch: string =
          headResult.exitCode === 0
            ? headResult.stdout.trim()
            : baseBranch;

        // Checkout base branch
        const coResult = execGit(cwd, ['checkout', baseBranch]);
        if (coResult.exitCode !== 0) {
          gitMerge = {
            skipped: true,
            reason: `Failed to checkout '${baseBranch}'`,
          };
        } else {
          // Merge milestone branch
          const mergeResult = execGit(cwd, [
            'merge',
            '--no-ff',
            msBranch,
            '-m',
            `Merge milestone ${version}: ${milestoneName}`,
          ]);

          if (mergeResult.exitCode !== 0) {
            // Conflict -- abort and restore
            execGit(cwd, ['merge', '--abort']);
            execGit(cwd, ['checkout', originalBranch]);
            gitMerge = {
              error: 'Merge conflict',
              milestone_branch: msBranch,
              base_branch: baseBranch,
            };
          } else {
            // Delete milestone branch after successful merge
            execGit(cwd, ['branch', '-d', msBranch]);
            // Restore original branch (stay on base after milestone merge)
            if (originalBranch !== baseBranch) {
              execGit(cwd, ['checkout', originalBranch]);
            }
            gitMerge = {
              merged: true,
              milestone_branch: msBranch,
              base_branch: baseBranch,
              branch_deleted: true,
            };
          }
        }
      }
    }
  } catch {
    // Git merge is non-blocking
  }

  const result: MilestoneCompleteResult = {
    version,
    name: milestoneName,
    date: today,
    phases: phaseCount,
    plans: totalPlans,
    tasks: totalTasks,
    accomplishments,
    phases_already_in_place: phasesAlreadyInPlace,
    archived: {
      roadmap: fs.existsSync(
        path.join(archiveDir, `${version}-ROADMAP.md`)
      ),
      requirements: fs.existsSync(
        path.join(archiveDir, `${version}-REQUIREMENTS.md`)
      ),
      audit: fs.existsSync(
        path.join(archiveDir, `${version}-MILESTONE-AUDIT.md`)
      ),
      phases: archivedPhaseCount > 0,
      phase_count: archivedPhaseCount,
      marker: true,
    },
    milestones_updated: true,
    state_updated: fs.existsSync(statePath),
    ...(gitMerge ? { git_merge: gitMerge } : {}),
  };

  output(
    result,
    raw,
    `Milestone ${result.version} complete: ${result.phases} phases, ${result.plans} plans`
  );
}

// ─── Validate Consistency ─────────────────────────────────────────────────────

/**
 * CLI command: Validate phase numbering consistency between ROADMAP.md and disk directories.
 * @param cwd - Project working directory
 * @param raw - Output raw 'passed'/'failed' instead of JSON
 * @param options - Validation options (e.g., fix)
 * @returns void — writes JSON or raw text to stdout and exits on error
 */
function cmdValidateConsistency(
  cwd: string,
  raw: boolean,
  options?: ValidateConsistencyOptions
): void {
  const fix: boolean = (options && options.fix) || false;
  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir: string = getPhasesDirPath(cwd);
  const errors_list: string[] = [];
  const warnings: string[] = [];
  const fixed: string[] = [];

  // Check for ROADMAP
  let roadmapContent: string;
  try {
    roadmapContent = readRoadmapFile(roadmapPath);
  } catch {
    errors_list.push('ROADMAP.md not found');
    output(
      { passed: false, errors: errors_list, warnings } as ConsistencyResult,
      raw,
      'failed'
    );
    return;
  }
  const activeContent: string = stripShippedSections(roadmapContent);

  // Extract phases from ROADMAP (active section only)
  const roadmapPhases: Set<string> = new Set();
  const phasePattern: RegExp = /#{2,3}\s*Phase\s+(\d+(?:\.\d+)?)\s*:/gi;
  let m: RegExpExecArray | null;
  while ((m = phasePattern.exec(activeContent)) !== null) {
    roadmapPhases.add(m[1]);
  }

  // Get phases on disk
  const diskPhases: Set<string> = new Set();
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);
    for (const dir of dirs) {
      const dm: RegExpMatchArray | null = dir.match(/^(\d+(?:\.\d+)?)/);
      if (dm) diskPhases.add(dm[1]);
    }
  } catch {
    // Phases directory may not exist; diskPhases stays empty
  }

  // Check: phases in ROADMAP but not on disk
  for (const p of roadmapPhases) {
    if (!diskPhases.has(p) && !diskPhases.has(normalizePhaseName(p))) {
      warnings.push(`Phase ${p} in ROADMAP.md but no directory on disk`);
    }
  }

  // Check: orphaned phases on disk but not in ROADMAP (errors, not warnings)
  const orphanViolations: GateViolation[] = checkOrphanedPhases(cwd);
  for (const v of orphanViolations) {
    errors_list.push(v.message);
  }

  // Check: sequential phase numbers (integers only)
  const integerPhases: number[] = [...diskPhases]
    .filter((p: string) => !p.includes('.'))
    .map((p: string) => parseInt(p, 10))
    .sort((a: number, b: number) => a - b);

  for (let i = 1; i < integerPhases.length; i++) {
    if (integerPhases[i] !== integerPhases[i - 1] + 1) {
      warnings.push(
        `Gap in phase numbering: ${integerPhases[i - 1]} \u2192 ${integerPhases[i]}`
      );
    }
  }

  // Check: plan numbering within phases
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name)
      .sort();

    for (const dir of dirs) {
      const phaseFiles: string[] = fs.readdirSync(
        path.join(phasesDir, dir)
      ) as string[];
      const plans: string[] = phaseFiles
        .filter((f: string) => f.endsWith('-PLAN.md'))
        .sort();

      // Extract plan numbers
      const planNums: number[] = plans
        .map((p: string) => {
          const pm: RegExpMatchArray | null = p.match(/-(\d{2})-PLAN\.md$/);
          return pm ? parseInt(pm[1], 10) : null;
        })
        .filter((n: number | null): n is number => n !== null);

      for (let i = 1; i < planNums.length; i++) {
        if (planNums[i] !== planNums[i - 1] + 1) {
          warnings.push(
            `Gap in plan numbering in ${dir}: plan ${planNums[i - 1]} \u2192 ${planNums[i]}`
          );
        }
      }

      // Check: plans without summaries (completed plans)
      const summaries: string[] = phaseFiles.filter((f: string) =>
        f.endsWith('-SUMMARY.md')
      );
      const planIds: Set<string> = new Set(
        plans.map((p: string) => p.replace('-PLAN.md', ''))
      );
      const summaryIds: Set<string> = new Set(
        summaries.map((s: string) => s.replace('-SUMMARY.md', ''))
      );

      // Summary without matching plan is suspicious (orphaned)
      for (const sid of summaryIds) {
        if (!planIds.has(sid)) {
          const orphanFile: string = `${sid}-SUMMARY.md`;
          const orphanPath: string = path.join(phasesDir, dir, orphanFile);
          if (fix) {
            try {
              fs.unlinkSync(orphanPath);
              fixed.push(orphanPath);
            } catch {
              warnings.push(
                `Failed to remove orphaned summary: ${orphanFile} in ${dir}`
              );
            }
          } else {
            warnings.push(
              `Orphaned summary ${orphanFile} in ${dir} has no matching PLAN.md`
            );
          }
        }
      }
    }
  } catch {
    // Phases directory may not exist; skip plan-numbering and orphan checks
  }

  // Check: frontmatter in plans has required fields
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);

    for (const dir of dirs) {
      const phaseFiles: string[] = fs.readdirSync(
        path.join(phasesDir, dir)
      ) as string[];
      const plans: string[] = phaseFiles.filter((f: string) =>
        f.endsWith('-PLAN.md')
      );

      for (const plan of plans) {
        const content: string = fs.readFileSync(
          path.join(phasesDir, dir, plan),
          'utf-8'
        ) as string;
        const fm: FrontmatterObject = extractFrontmatter(content);

        if (!fm.wave) {
          warnings.push(`${dir}/${plan}: missing 'wave' in frontmatter`);
        }
      }
    }
  } catch {
    // Phases directory may not exist; skip frontmatter validation
  }

  const passed: boolean = errors_list.length === 0;
  output(
    {
      passed,
      errors: errors_list,
      warnings,
      warning_count: warnings.length,
      ...(fix ? { fixed } : {}),
    } as ConsistencyResult,
    raw,
    passed ? 'passed' : 'failed'
  );
}

// ─── Version Bump ─────────────────────────────────────────────────────────────

/**
 * CLI command: Bump version in plugin.json, VERSION, and package.json.
 * @param cwd - Project working directory
 * @param version - Version string (with or without 'v' prefix)
 * @param raw - Output raw text instead of JSON
 * @returns void — writes JSON or raw text to stdout and exits on error
 */
function cmdVersionBump(cwd: string, version: string, raw: boolean): void {
  if (!version) {
    error(
      'version required for version bump (e.g., v1.0.0). Usage: milestone version-bump <version>. Provide the new version, e.g.: milestone version-bump v1.3.0. Current version can be found in .planning/config.json. To check current version: cat .planning/config.json | grep version'
    );
  }

  // Strip leading 'v' prefix
  const semver: string = version.replace(/^v/, '');

  const files: Record<string, string> = {
    VERSION: path.join(cwd, 'VERSION'),
    'package.json': path.join(cwd, 'package.json'),
    '.claude-plugin/plugin.json': path.join(
      cwd,
      '.claude-plugin',
      'plugin.json'
    ),
  };

  const updated: string[] = [];

  // Update VERSION file
  if (fs.existsSync(files.VERSION)) {
    fs.writeFileSync(files.VERSION, semver + '\n', 'utf-8');
    updated.push('VERSION');
  }

  // Update package.json
  if (fs.existsSync(files['package.json'])) {
    const pkg: { version: string } = JSON.parse(
      fs.readFileSync(files['package.json'], 'utf-8') as string
    );
    pkg.version = semver;
    fs.writeFileSync(
      files['package.json'],
      JSON.stringify(pkg, null, 2) + '\n',
      'utf-8'
    );
    updated.push('package.json');
  }

  // Update .claude-plugin/plugin.json
  if (fs.existsSync(files['.claude-plugin/plugin.json'])) {
    const plugin: { version: string } = JSON.parse(
      fs.readFileSync(files['.claude-plugin/plugin.json'], 'utf-8') as string
    );
    plugin.version = semver;
    fs.writeFileSync(
      files['.claude-plugin/plugin.json'],
      JSON.stringify(plugin, null, 2) + '\n',
      'utf-8'
    );
    updated.push('.claude-plugin/plugin.json');
  }

  const result: {
    version: string;
    files_updated: string[];
    count: number;
  } = {
    version: semver,
    files_updated: updated,
    count: updated.length,
  };

  output(
    result,
    raw,
    `Bumped ${updated.length} files to ${semver}`
  );
}

// ─── Batch Phase Complete ─────────────────────────────────────────────────────

/**
 * CLI command: Complete multiple phases in a single call.
 * @param cwd - Project working directory
 * @param phases - Array of phase numbers to complete
 * @param options - Options passed to each cmdPhaseComplete call
 * @param raw - Output raw text instead of JSON
 * @returns void — writes JSON or raw text to stdout and exits on error
 */
function cmdPhaseBatchComplete(
  cwd: string,
  phases: string[],
  options: PhaseBatchCompleteOptions,
  raw: boolean
): void {
  if (!phases || phases.length === 0) {
    output(
      { error: 'phases list is required and must not be empty' },
      raw,
      'error'
    );
    return;
  }

  const results: Array<{
    phase: string;
    result?: PhaseCompleteResult;
    error?: string;
  }> = [];
  let completedCount = 0;

  for (const phase of phases) {
    try {
      const phaseResult: PhaseCompleteResult = _phaseCompleteCore(
        cwd,
        phase,
        options
      );
      completedCount++;
      results.push({ phase, result: phaseResult });
    } catch (e) {
      results.push({ phase, error: (e as Error).message });
    }
  }

  output(
    {
      results,
      total_phases: phases.length,
      completed_count: completedCount,
    } as BatchCompleteResult,
    raw,
    `Completed ${completedCount}/${phases.length} phases`
  );
}

// ─── Atomic Write ─────────────────────────────────────────────────────────────

/**
 * Write content to a file atomically using a .tmp intermediate file.
 * On success, the .tmp file is renamed to the target path.
 * On failure, the original file is left untouched.
 * @param filePath - Absolute path to the target file
 * @param content - Content to write
 * @returns void — throws on write or rename failure
 */
function atomicWriteFile(filePath: string, content: string): void {
  const tmpPath: string = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  cmdPhasesList,
  cmdPhaseAdd,
  cmdPhaseInsert,
  cmdPhaseRemove,
  cmdPhaseComplete,
  cmdMilestoneComplete,
  cmdValidateConsistency,
  cmdVersionBump,
  cmdPhaseBatchComplete,
  atomicWriteFile,
};
