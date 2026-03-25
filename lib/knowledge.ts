'use strict';

/**
 * GRD Knowledge Module -- KNOWHOW.md parsing, formatting, selection, and persistence.
 *
 * Provides four functions for managing structured knowledge entries mined from
 * phase execution output. Entries are stored in KNOWHOW.md and injected into
 * planning/execution prompts to compound improvements across phases.
 *
 * REQ-191: KNOWHOW.md Storage
 *
 * @module knowledge
 */

import type { KnowhowEntry } from './types';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const { safeReadFile } = require('./utils') as { safeReadFile: (p: string) => string | null };

const KNOWHOW_HEADER = '# KNOWHOW\n\n';

/** Serialize a KnowhowEntry to a markdown level-3 heading block. */
function formatKnowhowEntry(entry: KnowhowEntry): string {
  return (
    `### ${entry.pattern_name}\n\n` +
    `- **source:** ${entry.source}\n` +
    `- **applicability:** ${entry.applicability}\n` +
    `- **code_snippet:** ${entry.code_snippet}\n` +
    `- **phase_number:** ${entry.phase_number}\n` +
    `- **created_at:** ${entry.created_at}\n`
  );
}

/**
 * Parse KNOWHOW.md content into an array of KnowhowEntry objects.
 *
 * Splits on `### ` level-3 headings. For each block, extracts pattern_name from
 * the heading text and parses structured `- **field:** value` lines.
 * Returns empty array for empty/missing content.
 *
 * Roundtrip guarantee: parseKnowhowEntries(formatKnowhowEntry(entry)) produces
 * an equivalent entry (lossless).
 */
function parseKnowhowEntries(content: string): KnowhowEntry[] {
  if (!content || !content.trim()) {
    return [];
  }

  const entries: KnowhowEntry[] = [];

  // Split on level-3 headings (### prefix). Keep the heading text by using a capture.
  const blocks = content.split(/(?=^### )/m);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed.startsWith('### ')) {
      continue;
    }

    const lines = trimmed.split('\n');
    const headingLine = lines[0];
    const pattern_name = headingLine.replace(/^### /, '').trim();

    if (!pattern_name) {
      continue;
    }

    const fieldPattern = /^- \*\*(\w+):\*\* (.*)$/;
    const fields: Record<string, string> = {};

    for (const line of lines.slice(1)) {
      const match = line.match(fieldPattern);
      if (match) {
        fields[match[1]] = match[2].trim();
      }
    }

    const REQUIRED_FIELDS = ['source', 'applicability', 'code_snippet', 'phase_number', 'created_at'] as const;
    if (REQUIRED_FIELDS.every((k) => k in fields)) {
      const phase_number = parseInt(fields['phase_number'], 10);
      if (Number.isNaN(phase_number)) {
        continue;
      }
      entries.push({
        pattern_name,
        source: fields['source'],
        applicability: fields['applicability'],
        code_snippet: fields['code_snippet'],
        phase_number,
        created_at: fields['created_at'],
      });
    }
  }

  return entries;
}

/**
 * Read existing KNOWHOW.md at knowhowPath, merge new entries (deduplicating by
 * pattern_name, keeping higher phase_number), and write back.
 *
 * - If the file does not exist, starts with an empty entry list.
 * - Deduplication: when a new entry shares a pattern_name with an existing one,
 *   the entry with the higher phase_number is kept.
 * - File always starts with `# KNOWHOW\n\n` header.
 * - Parent directories are created if needed.
 */
function appendKnowhowEntries(knowhowPath: string, entries: KnowhowEntry[]): void {
  const existingContent = safeReadFile(knowhowPath) ?? '';

  const existing = parseKnowhowEntries(existingContent);

  // Build a map from pattern_name to entry for deduplication
  const byName = new Map<string, KnowhowEntry>();

  for (const e of existing) {
    byName.set(e.pattern_name, e);
  }

  for (const e of entries) {
    const current = byName.get(e.pattern_name);
    if (!current || e.phase_number >= current.phase_number) {
      byName.set(e.pattern_name, e);
    }
  }

  const merged = Array.from(byName.values());

  // Sort by phase_number descending (most recent first) for stable output
  merged.sort((a, b) => b.phase_number - a.phase_number);

  const body = merged.map(formatKnowhowEntry).join('\n');
  const fileContent = KNOWHOW_HEADER + body;

  // Ensure parent directory exists
  const dir = path.dirname(knowhowPath);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(knowhowPath, fileContent, 'utf8');
}

/**
 * Return top-N entries from the input array sorted by recency.
 *
 * - Primary sort: phase_number descending (most recent first).
 * - If moduleHints provided: entries whose source or applicability mentions any
 *   hint string are sorted first within each phase_number bucket.
 * - Returns at most n entries.
 * - If entries.length <= n, returns all entries sorted.
 */
function selectTopEntries(
  entries: KnowhowEntry[],
  n: number,
  moduleHints?: string[],
): KnowhowEntry[] {
  if (entries.length === 0 || n <= 0) {
    return [];
  }

  const hasHint = (entry: KnowhowEntry): boolean => {
    if (!moduleHints || moduleHints.length === 0) return false;
    const combined = `${entry.source} ${entry.applicability}`.toLowerCase();
    return moduleHints.some((hint) => combined.includes(hint.toLowerCase()));
  };

  const sorted = [...entries].sort((a, b) => {
    // Primary: phase_number descending
    if (b.phase_number !== a.phase_number) {
      return b.phase_number - a.phase_number;
    }
    // Secondary: module hint boost (entries with hints come first)
    const aHit = hasHint(a) ? 1 : 0;
    const bHit = hasHint(b) ? 1 : 0;
    return bHit - aHit;
  });

  return sorted.slice(0, n);
}

/**
 * Build a formatted prompt block from the top-N KNOWHOW.md entries.
 *
 * Reads KNOWHOW.md from `path.join(cwd, 'KNOWHOW.md')`, selects the top 5
 * most relevant entries via selectTopEntries (with optional moduleHints), and
 * wraps them in a `<knowhow_context>` XML block for prompt injection.
 *
 * Returns empty string when:
 * - KNOWHOW.md does not exist at the given cwd
 * - KNOWHOW.md exists but is empty or contains no valid entries
 *
 * Note: `_phaseNum` is reserved for future phase-proximity scoring.
 */
function buildKnowledgeInjectionBlock(
  cwd: string,
  _phaseNum: string,
  moduleHints?: string[],
): string {
  const knowhowPath = path.join(cwd, 'KNOWHOW.md');
  const content = safeReadFile(knowhowPath);

  if (!content || !content.trim()) {
    return '';
  }

  const entries = parseKnowhowEntries(content);
  if (entries.length === 0) {
    return '';
  }

  const top = selectTopEntries(entries, 5, moduleHints);
  const formatted = top.map(formatKnowhowEntry).join('\n');

  return (
    `<knowhow_context>\n` +
    `The following patterns were mined from prior phase executions. Apply relevant ones:\n\n` +
    formatted +
    `</knowhow_context>\n`
  );
}

module.exports = {
  formatKnowhowEntry,
  parseKnowhowEntries,
  appendKnowhowEntries,
  selectTopEntries,
  buildKnowledgeInjectionBlock,
};
