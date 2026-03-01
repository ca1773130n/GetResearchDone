/** GRD Commands/Search -- Search, migration, and coverage report operations */

'use strict';

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const {
  safeReadFile, loadConfig, output, error,
} = require('../utils') as {
  safeReadFile: (p: string) => string | null;
  loadConfig: (cwd: string) => Record<string, unknown> & { timeouts: Record<string, number> };
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
};
const {
  currentMilestone, planningDir: getPlanningDir,
} = require('../paths') as {
  currentMilestone: (cwd: string) => string;
  planningDir: (cwd: string) => string;
};

// ─── Domain Types ────────────────────────────────────────────────────────────

interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

interface MigrationEntry {
  from: string;
  to: string;
  entries_to_move?: number;
  entries_moved?: number;
}

interface MigrationError {
  entry: string;
  item: string;
  error: string;
}

interface CoverageEntry {
  module: string;
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

/** Recursively collect all .md files under a directory. */
function collectMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries: { isDirectory: () => boolean; isFile: () => boolean; name: string }[] =
      fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...collectMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch { /* Directory doesn't exist or can't be read */ }
  return results;
}

// ─── CLI: Search ─────────────────────────────────────────────────────────────

/**
 * CLI command: Search across all .planning/ markdown files for a text query.
 * Returns file paths, line numbers, and matching lines.
 */
function cmdSearch(cwd: string, query: string, raw: boolean): void {
  if (!query) { error('Search query is required'); return; }

  const planningDir = getPlanningDir(cwd) as string;
  const mdFiles = collectMarkdownFiles(planningDir);
  const matches: SearchMatch[] = [];
  const queryLower = query.toLowerCase();

  for (const filePath of mdFiles) {
    const content = safeReadFile(filePath);
    if (!content) continue;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        matches.push({ file: path.relative(planningDir, filePath), line: i + 1, content: lines[i] });
      }
    }
  }

  output({ matches, count: matches.length, query }, raw);
}

// ─── CLI: Migrate Dirs ──────────────────────────────────────────────────────

/**
 * CLI command: Migrate old-style flat .planning/ subdirectories to the
 * milestone-scoped hierarchy under .planning/milestones/{milestone}/.
 * Idempotent: running twice produces no changes on the second run.
 */
function cmdMigrateDirs(cwd: string, raw: boolean, dryRun?: boolean): void {
  const milestone = currentMilestone(cwd);
  const planningDir = getPlanningDir(cwd) as string;

  const migrationMap = [
    { name: 'phases', target: milestone },
    { name: 'research', target: milestone },
    { name: 'todos', target: milestone },
    { name: 'quick', target: milestone },
  ];

  const movedDirectories: MigrationEntry[] = [];
  const skipped: string[] = [];
  const errors: MigrationError[] = [];

  for (const entry of migrationMap) {
    const oldDir = path.join(planningDir, entry.name);
    if (!fs.existsSync(oldDir)) { skipped.push(entry.name); continue; }

    let contents: string[];
    try { contents = fs.readdirSync(oldDir); } catch { skipped.push(entry.name); continue; }
    if (contents.length === 0) { skipped.push(entry.name); continue; }

    const targetDir = path.join(planningDir, 'milestones', entry.target, entry.name);

    if (dryRun) {
      movedDirectories.push({
        from: entry.name,
        to: path.join('milestones', entry.target, entry.name),
        entries_to_move: contents.filter((item: string) => !fs.existsSync(path.join(targetDir, item))).length,
      });
      continue;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    let entriesMoved = 0;

    for (const item of contents) {
      const srcPath = path.join(oldDir, item);
      const destPath = path.join(targetDir, item);
      if (fs.existsSync(destPath)) continue;
      try {
        const srcStats = fs.statSync(srcPath);
        if (srcStats.isDirectory()) { fs.cpSync(srcPath, destPath, { recursive: true }); }
        else { fs.cpSync(srcPath, destPath); }
        fs.rmSync(srcPath, { recursive: true, force: true });
        entriesMoved++;
      } catch (err: unknown) {
        errors.push({ entry: entry.name, item, error: (err as Error).message });
      }
    }

    if (entriesMoved > 0) {
      movedDirectories.push({
        from: entry.name,
        to: path.join('milestones', entry.target, entry.name),
        entries_moved: entriesMoved,
      });
    }
  }

  const alreadyMigrated = movedDirectories.length === 0;
  const result = {
    milestone, moved_directories: movedDirectories, skipped,
    already_migrated: alreadyMigrated, errors,
    ...(dryRun ? { dry_run: true } : {}),
  };
  output(result, raw, dryRun ? `dry-run: would migrate ${movedDirectories.length} directory(ies)` : JSON.stringify(result));
}

// ─── CLI: Coverage Report ───────────────────────────────────────────────────

/**
 * CLI command: Generate a structured coverage report identifying modules below threshold.
 * Runs jest with json-summary reporter and parses the output.
 */
function cmdCoverageReport(cwd: string, options: { threshold?: number }, raw: boolean): void {
  const threshold = options.threshold || 85;
  const config = loadConfig(cwd);

  const summaryPath = path.join(cwd, 'coverage', 'coverage-summary.json');
  let coverageData: Record<string, { lines: { pct: number }; branches: { pct: number }; functions: { pct: number }; statements: { pct: number } }>;
  let summaryContent: string | undefined;
  try {
    child_process.execFileSync(
      'npx',
      ['jest', '--coverage', '--coverageReporters=json-summary', '--silent', '--forceExit'],
      { cwd, encoding: 'utf-8', timeout: config.timeouts.jest_ms, stdio: 'pipe' }
    );
    summaryContent = fs.readFileSync(summaryPath, 'utf-8') as string;
    coverageData = JSON.parse(summaryContent);
  } catch (_e: unknown) {
    if (fs.existsSync(summaryPath)) {
      summaryContent = summaryContent || (fs.readFileSync(summaryPath, 'utf-8') as string);
      coverageData = JSON.parse(summaryContent);
    } else {
      output({ error: 'Failed to generate coverage report', details: (_e as Error).message }, raw);
      return;
    }
  }

  const modules: CoverageEntry[] = [];
  const belowThreshold: (CoverageEntry & { gap: number })[] = [];

  for (const [filePath, data] of Object.entries(coverageData)) {
    if (filePath === 'total') continue;
    const relativePath = path.relative(cwd, filePath);
    if (!relativePath.startsWith('lib/')) continue;

    const entry: CoverageEntry = {
      module: relativePath, lines: data.lines.pct, branches: data.branches.pct,
      functions: data.functions.pct, statements: data.statements.pct,
    };
    modules.push(entry);

    if (data.lines.pct < threshold) {
      belowThreshold.push({ ...entry, gap: +(threshold - data.lines.pct).toFixed(1) });
    }
  }

  modules.sort((a, b) => a.lines - b.lines);
  belowThreshold.sort((a, b) => a.lines - b.lines);

  output({
    threshold, total_modules: modules.length,
    below_threshold_count: belowThreshold.length,
    all_above: belowThreshold.length === 0,
    below_threshold: belowThreshold, modules,
  }, raw);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  cmdSearch,
  cmdMigrateDirs,
  cmdCoverageReport,
};
