'use strict';

/** GRD Commands/KnowhowAggregator -- Cross-milestone KNOWHOW aggregation and export */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

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
  parseKnowhowEntries,
  formatKnowhowEntry,
}: {
  parseKnowhowEntries: (content: string) => import('../types').KnowhowEntry[];
  formatKnowhowEntry: (entry: import('../types').KnowhowEntry) => string;
} = require('../knowledge');

import type { KnowhowEntry } from '../types';

interface AggregatedEntry extends KnowhowEntry {
  recurrence: number;
  sources: string[];
}

interface KnowhowAggResult {
  total_entries: number;
  unique_patterns: number;
  top_patterns: AggregatedEntry[];
  export_path?: string;
}

function _slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function _scanKnowhowFiles(planningDir: string): { entries: KnowhowEntry[]; sourceFile: string }[] {
  const results: { entries: KnowhowEntry[]; sourceFile: string }[] = [];
  const milestonesBase = path.join(planningDir, 'milestones');

  if (!fs.existsSync(milestonesBase)) return results;

  let msDirs: string[];
  try {
    msDirs = (fs.readdirSync(milestonesBase) as string[]).filter((d: string) => {
      try {
        return fs.statSync(path.join(milestonesBase, d)).isDirectory();
      } catch { return false; }
    });
  } catch { return results; }

  for (const ms of msDirs) {
    const candidates = [
      path.join(milestonesBase, ms, 'KNOWHOW.md'),
      path.join(milestonesBase, ms, 'research', 'KNOWHOW.md'),
    ];

    // Also check per-phase KNOWHOW.md files
    const phasesDir = path.join(milestonesBase, ms, 'phases');
    if (fs.existsSync(phasesDir)) {
      try {
        for (const phaseDir of fs.readdirSync(phasesDir) as string[]) {
          candidates.push(path.join(phasesDir, phaseDir, 'KNOWHOW.md'));
        }
      } catch { /* skip */ }
    }

    for (const kPath of candidates) {
      if (!fs.existsSync(kPath)) continue;
      const content = safeReadFile(kPath);
      if (!content) continue;
      const entries = parseKnowhowEntries(content);
      if (entries.length > 0) results.push({ entries, sourceFile: kPath });
    }
  }

  return results;
}

/**
 * CLI command: Aggregate KNOWHOW.md entries across all milestones and phases.
 *
 * Scans all KNOWHOW.md files, deduplicates by semantic slug (lowercased pattern name),
 * ranks by recurrence count, and prints a unified ranked list.
 * With --export, writes KNOWLEDGE_BASE.md to .planning/.
 */
function cmdKnowhowAggregate(cwd: string, raw: boolean, exportFlag?: boolean, dryRun?: boolean): void {
  const planningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(planningDir)) {
    error('No .planning directory found. Run gd init first.');
  }

  const allFiles = _scanKnowhowFiles(planningDir);
  if (allFiles.length === 0) {
    output({ total_entries: 0, unique_patterns: 0, top_patterns: [], message: 'No KNOWHOW.md files found' }, raw, 'No KNOWHOW entries found');
    return;
  }

  // Deduplicate by slug, track recurrence
  const bySlug = new Map<string, AggregatedEntry>();

  for (const { entries, sourceFile } of allFiles) {
    for (const entry of entries) {
      const slug = _slugify(entry.pattern_name);
      const existing = bySlug.get(slug);
      if (existing) {
        existing.recurrence++;
        existing.sources.push(sourceFile);
        // Keep highest phase_number version
        if (entry.phase_number > existing.phase_number) {
          existing.pattern_name = entry.pattern_name;
          existing.source = entry.source;
          existing.applicability = entry.applicability;
          existing.code_snippet = entry.code_snippet;
          existing.phase_number = entry.phase_number;
          existing.created_at = entry.created_at;
        }
      } else {
        bySlug.set(slug, { ...entry, recurrence: 1, sources: [sourceFile] });
      }
    }
  }

  // Rank by recurrence descending, then phase_number descending
  const ranked = Array.from(bySlug.values()).sort((a, b) => {
    if (b.recurrence !== a.recurrence) return b.recurrence - a.recurrence;
    return b.phase_number - a.phase_number;
  });

  const totalEntries = allFiles.reduce((s, f) => s + f.entries.length, 0);

  if (exportFlag) {
    const exportPath = path.join(planningDir, 'KNOWLEDGE_BASE.md');
    if (dryRun) {
      const result: KnowhowAggResult = {
        total_entries: totalEntries,
        unique_patterns: ranked.length,
        top_patterns: ranked.slice(0, 10),
        export_path: path.relative(cwd, exportPath),
      };
      output({ ...result, dry_run: true, note: 'No files written (--dry-run)' }, raw, `DRY RUN: would export ${ranked.length} patterns to ${result.export_path}`);
      return;
    }
    const header = '# KNOWLEDGE_BASE\n\nAggregated cross-milestone knowhow, ranked by recurrence.\n\n';
    const body = ranked.map(formatKnowhowEntry).join('\n');
    fs.writeFileSync(exportPath, header + body, 'utf-8');

    const result: KnowhowAggResult = {
      total_entries: totalEntries,
      unique_patterns: ranked.length,
      top_patterns: ranked.slice(0, 10),
      export_path: path.relative(cwd, exportPath),
    };
    output(result, raw, `Exported ${ranked.length} patterns to ${result.export_path}`);
    return;
  }

  if (dryRun) {
    const result: KnowhowAggResult = {
      total_entries: totalEntries,
      unique_patterns: ranked.length,
      top_patterns: ranked.slice(0, 20),
    };
    output({ ...result, dry_run: true, note: 'No files written (--dry-run)' }, raw, `DRY RUN: ${ranked.length} unique patterns from ${allFiles.length} KNOWHOW files`);
    return;
  }

  const result: KnowhowAggResult = {
    total_entries: totalEntries,
    unique_patterns: ranked.length,
    top_patterns: ranked.slice(0, 20),
  };
  output(result, raw, `${ranked.length} unique patterns from ${allFiles.length} KNOWHOW files`);
}

interface ImportKnowhowResult {
  source_entries: number;
  scored: number;
  selected: number;
  appended: number;
  target_path: string;
}

/**
 * Score a KNOWHOW entry against the current project's milestone description and phase goals
 * using keyword overlap. Returns a score 0–1.
 */
function _scoreEntryRelevance(entry: KnowhowEntry, contextText: string): number {
  const entryText = `${entry.pattern_name} ${entry.source} ${entry.applicability}`.toLowerCase();
  const contextWords = contextText.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  if (contextWords.length === 0) return 0.5;
  const entryWords = new Set(entryText.split(/\W+/).filter((w) => w.length > 3));
  const matches = contextWords.filter((w) => entryWords.has(w)).length;
  return Math.min(1, matches / Math.max(1, contextWords.length));
}

/**
 * Read context text from the current project's milestone description and roadmap
 * for relevance scoring.
 */
function _readProjectContext(planningDir: string): string {
  const candidates = [
    path.join(planningDir, 'ROADMAP.md'),
    path.join(planningDir, 'milestones'),
  ];
  const parts: string[] = [];
  const roadmap = safeReadFile(candidates[0]);
  if (roadmap) parts.push(roadmap.slice(0, 3000));

  // Include milestone descriptions (first 500 chars each)
  const milestonesBase = candidates[1];
  if (fs.existsSync(milestonesBase)) {
    try {
      for (const ms of (fs.readdirSync(milestonesBase) as string[]).slice(0, 3)) {
        const msDesc = safeReadFile(path.join(milestonesBase, ms, 'MILESTONE.md'));
        if (msDesc) parts.push(msDesc.slice(0, 500));
      }
    } catch { /* skip */ }
  }
  return parts.join(' ');
}

/**
 * CLI command: Import KNOWHOW entries from a source project directory.
 *
 * Reads the source project's KNOWHOW.md files, scores each entry against the
 * current project's context (milestone description + roadmap), presents the top-10
 * scored matches, and appends chosen entries to the local project's KNOWHOW.md.
 *
 * With --all: imports all entries above the default 0.1 relevance threshold.
 * With --top N: override how many entries to select (default 10).
 * With --dry-run: prints what would be imported without writing.
 */
function cmdImportKnowhow(
  cwd: string,
  sourcePath: string,
  raw: boolean,
  topN?: number,
  importAll?: boolean,
  dryRun?: boolean
): void {
  const sourceDir = path.resolve(cwd, sourcePath);
  if (!fs.existsSync(sourceDir)) {
    error(`Source project directory not found: ${sourceDir}`);
  }

  const sourcePlanningDir = path.join(sourceDir, '.planning');
  if (!fs.existsSync(sourcePlanningDir)) {
    error(`No .planning directory in source project: ${sourceDir}`);
  }

  const localPlanningDir = path.join(cwd, '.planning');
  if (!fs.existsSync(localPlanningDir)) {
    error('No .planning directory found. Run gd init first.');
  }

  // Collect entries from source project
  const sourceFiles = _scanKnowhowFiles(sourcePlanningDir);
  if (sourceFiles.length === 0) {
    output({ source_entries: 0, message: 'No KNOWHOW entries found in source project' }, raw, 'No KNOWHOW entries found in source project');
    return;
  }

  const allSourceEntries: KnowhowEntry[] = sourceFiles.flatMap((f) => f.entries);
  const contextText = _readProjectContext(localPlanningDir);

  // Score and rank by relevance
  const scored = allSourceEntries
    .map((entry) => ({ entry, score: _scoreEntryRelevance(entry, contextText) }))
    .sort((a, b) => b.score - a.score);

  const limit = importAll ? scored.length : (topN ?? 10);
  const selected = scored.slice(0, limit).filter((s) => s.score >= 0.05);

  if (selected.length === 0) {
    output({ source_entries: allSourceEntries.length, scored: scored.length, selected: 0, appended: 0, message: 'No relevant entries found (all scored below 0.05)' }, raw, 'No relevant entries found');
    return;
  }

  // Determine target KNOWHOW.md path (current milestone or root planning dir)
  let targetPath = path.join(localPlanningDir, 'KNOWHOW.md');
  const milestonesBase = path.join(localPlanningDir, 'milestones');
  if (fs.existsSync(milestonesBase)) {
    try {
      const msDirs = (fs.readdirSync(milestonesBase) as string[])
        .filter((d: string) => {
          try { return fs.statSync(path.join(milestonesBase, d)).isDirectory(); } catch { return false; }
        })
        .sort()
        .reverse();
      if (msDirs.length > 0) {
        targetPath = path.join(milestonesBase, msDirs[0], 'KNOWHOW.md');
      }
    } catch { /* use default */ }
  }

  const result: ImportKnowhowResult = {
    source_entries: allSourceEntries.length,
    scored: scored.length,
    selected: selected.length,
    appended: 0,
    target_path: path.relative(cwd, targetPath),
  };

  if (dryRun) {
    output({
      ...result,
      dry_run: true,
      top_matches: selected.slice(0, 10).map((s) => ({ pattern_name: s.entry.pattern_name, score: Math.round(s.score * 100) / 100, phase: s.entry.phase_number })),
      note: 'No files written (--dry-run)',
    }, raw, `DRY RUN: would import ${selected.length} entries from ${path.relative(cwd, sourceDir)} → ${result.target_path}`);
    return;
  }

  // Append selected entries to target KNOWHOW.md
  const existing = safeReadFile(targetPath) ?? '# KNOWHOW\n\n';
  const existingEntries = parseKnowhowEntries(existing);
  const existingSlugs = new Set(existingEntries.map((e) => _slugify(e.pattern_name)));

  const toAppend = selected.filter((s) => !existingSlugs.has(_slugify(s.entry.pattern_name)));
  if (toAppend.length === 0) {
    output({ ...result, appended: 0, message: 'All selected entries already exist in target KNOWHOW.md' }, raw, 'All selected entries already present — nothing to append');
    return;
  }

  const appendText = toAppend.map((s) => formatKnowhowEntry(s.entry)).join('\n');
  const newContent = existing.trimEnd() + '\n\n' + appendText + '\n';
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, newContent, 'utf-8');

  result.appended = toAppend.length;
  output(result, raw, `Imported ${toAppend.length} entries from ${path.relative(cwd, sourceDir)} → ${result.target_path}`);
}

module.exports = { cmdKnowhowAggregate, cmdImportKnowhow };
