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
  if (entries.length === 0) return;

  const existingContent = safeReadFile(knowhowPath) ?? '';

  const existing = parseKnowhowEntries(existingContent);

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

  merged.sort((a, b) => b.phase_number - a.phase_number);

  const body = merged.map(formatKnowhowEntry).join('\n');
  const fileContent = KNOWHOW_HEADER + body;

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

  const lowerHints = moduleHints?.map((h) => h.toLowerCase()) ?? [];
  const hintMatches = new Set<KnowhowEntry>();
  if (lowerHints.length > 0) {
    for (const entry of entries) {
      const combined = `${entry.source} ${entry.applicability}`.toLowerCase();
      if (lowerHints.some((hint) => combined.includes(hint))) {
        hintMatches.add(entry);
      }
    }
  }

  const sorted = [...entries].sort((a, b) => {
    if (b.phase_number !== a.phase_number) {
      return b.phase_number - a.phase_number;
    }
    return (hintMatches.has(b) ? 1 : 0) - (hintMatches.has(a) ? 1 : 0);
  });

  return sorted.slice(0, n);
}

module.exports = {
  formatKnowhowEntry,
  parseKnowhowEntries,
  appendKnowhowEntries,
  selectTopEntries,
};
