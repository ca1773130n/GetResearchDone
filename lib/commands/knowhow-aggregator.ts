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
function cmdKnowhowAggregate(cwd: string, raw: boolean, exportFlag?: boolean): void {
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

  if (exportFlag) {
    const header = '# KNOWLEDGE_BASE\n\nAggregated cross-milestone knowhow, ranked by recurrence.\n\n';
    const body = ranked.map(formatKnowhowEntry).join('\n');
    const exportPath = path.join(planningDir, 'KNOWLEDGE_BASE.md');
    fs.writeFileSync(exportPath, header + body, 'utf-8');

    const result: KnowhowAggResult = {
      total_entries: allFiles.reduce((s, f) => s + f.entries.length, 0),
      unique_patterns: ranked.length,
      top_patterns: ranked.slice(0, 10),
      export_path: path.relative(cwd, exportPath),
    };
    output(result, raw, `Exported ${ranked.length} patterns to ${result.export_path}`);
    return;
  }

  const result: KnowhowAggResult = {
    total_entries: allFiles.reduce((s, f) => s + f.entries.length, 0),
    unique_patterns: ranked.length,
    top_patterns: ranked.slice(0, 20),
  };
  output(result, raw, `${ranked.length} unique patterns from ${allFiles.length} KNOWHOW files`);
}

module.exports = { cmdKnowhowAggregate };
