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
const { safeReadFile, output } = require('./utils') as {
  safeReadFile: (p: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
};

const KNOWHOW_HEADER = '# KNOWHOW\n\n';

// Module-level cache: maps knowhowPath → parsed entries, invalidated on write.
const _knowhowCache = new Map<string, { entries: KnowhowEntry[]; mtime: number }>();

function _cachedParseKnowhow(knowhowPath: string): KnowhowEntry[] {
  try {
    const stat = fs.statSync(knowhowPath) as { mtimeMs: number };
    const cached = _knowhowCache.get(knowhowPath);
    if (cached && cached.mtime === stat.mtimeMs) return cached.entries;
    const content = (fs.readFileSync(knowhowPath, 'utf8') as string) ?? '';
    const entries = parseKnowhowEntries(content);
    _knowhowCache.set(knowhowPath, { entries, mtime: stat.mtimeMs });
    return entries;
  } catch {
    return [];
  }
}

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

  const existing = _cachedParseKnowhow(knowhowPath);

  const byName = new Map<string, KnowhowEntry>();

  for (const e of existing) {
    byName.set(e.pattern_name, e);
  }

  const total = entries.length;
  for (let i = 0; i < total; i++) {
    const e = entries[i];
    if (total > 50) {
      process.stderr.write(`[knowledge] merging entry ${i + 1}/${total}: ${e.pattern_name}\n`);
    }
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
  _knowhowCache.delete(knowhowPath);
}

/**
 * Return top-N entries from the input array sorted by recency.
 *
 * - Primary sort: phase_number descending (most recent first).
 * - If moduleHints provided: entries whose source or applicability mentions any
 *   hint string are sorted first within each phase_number bucket.
 * - Tertiary sort: when currentPhase is provided, entries closer to the current
 *   phase rank higher within the same phase_number bucket (proximity scoring).
 * - Returns at most n entries.
 * - If entries.length <= n, returns all entries sorted.
 */
function selectTopEntries(
  entries: KnowhowEntry[],
  n: number,
  moduleHints?: string[],
  currentPhase?: number,
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
    const hintDiff = (hintMatches.has(b) ? 1 : 0) - (hintMatches.has(a) ? 1 : 0);
    if (hintDiff !== 0) return hintDiff;
    if (currentPhase !== undefined) {
      return Math.abs(currentPhase - a.phase_number) - Math.abs(currentPhase - b.phase_number);
    }
    return 0;
  });

  return sorted.slice(0, n);
}

/**
 * Build a structured knowledge injection block from KNOWHOW.md for prompt injection.
 *
 * Reads KNOWHOW.md from path.join(cwd, 'KNOWHOW.md'), selects top 5 entries
 * using selectTopEntries, and wraps them in <knowhow_context> XML tags.
 *
 * @param cwd - Project root directory
 * @param _phaseNum - Current phase number (reserved for future phase-proximity scoring)
 * @param moduleHints - Optional module name hints to boost relevant entries
 * @returns Formatted injection block string, or '' if no entries
 */
function buildKnowledgeInjectionBlock(cwd: string, _phaseNum: string, moduleHints?: string[]): string {
  const knowhowPath = path.join(cwd, 'KNOWHOW.md');
  const entries = _cachedParseKnowhow(knowhowPath);
  if (entries.length === 0) {
    return '';
  }

  const parsedPhase = parseInt(_phaseNum, 10);
  const currentPhase = Number.isNaN(parsedPhase) ? undefined : parsedPhase;
  const top = selectTopEntries(entries, 5, moduleHints, currentPhase);
  if (top.length === 0) {
    return '';
  }

  const formatted = top.map(formatKnowhowEntry).join('\n');
  return `<knowhow_context>\n${formatted}\n</knowhow_context>`;
}

/**
 * Extract module hints from PLAN.md frontmatter files_modified fields.
 *
 * Reads all *-PLAN.md files in phaseDir, extracts files_modified from YAML
 * frontmatter, and returns unique basenames (without extensions).
 *
 * @param phaseDir - Path to phase directory containing PLAN.md files
 * @returns Array of unique module basenames
 */
function extractModuleHints(phaseDir: string): string[] {
  if (!fs.existsSync(phaseDir)) {
    return [];
  }

  let files: string[];
  try {
    files = (fs.readdirSync(phaseDir) as string[]).filter(
      (f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md'
    );
  } catch {
    return [];
  }

  if (files.length === 0) {
    return [];
  }

  const hints = new Set<string>();

  for (const file of files) {
    const filePath = path.join(phaseDir, file);
    const content = safeReadFile(filePath);
    if (!content) continue;

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;

    const fmContent = fmMatch[1];
    const filesMatch = fmContent.match(/files_modified:\s*\[([^\]]*)\]/);
    if (!filesMatch) continue;

    const filesList = filesMatch[1].split(',').map((f: string) => f.trim()).filter(Boolean);
    for (const f of filesList) {
      const basename = path.basename(f).split('.')[0];
      if (basename) {
        hints.add(basename);
      }
    }
  }

  return Array.from(hints);
}

// ─── Knowhow Audit ──────────────────────────────────────────────────────────

/** A stale or conflicting entry flagged by the auditor. */
interface KnowhowAuditFlag {
  pattern_name: string;
  source_file: string;
  issue: 'broken_ref' | 'contradicts';
  detail: string;
}

/** Result of the KNOWHOW.md audit command. */
interface KnowhowAuditResult {
  total_entries: number;
  stale_count: number;
  contradiction_count: number;
  flags: KnowhowAuditFlag[];
  knowhow_files_scanned: number;
}

/**
 * CLI command: Audit all KNOWHOW.md files for stale references and contradictions.
 *
 * Scans all KNOWHOW.md files under .planning/milestones/ and the root research dir.
 * For each entry:
 *   - Extracts file paths referenced in the source field and checks they exist.
 *   - Detects entries with the same pattern_name but different applicability advice.
 *
 * @param cwd - Project working directory
 * @param raw - Output raw text instead of JSON
 */
function cmdKnowhowAudit(cwd: string, raw: boolean): void {
  const milestonesBase = path.join(cwd, '.planning', 'milestones');
  const flags: KnowhowAuditFlag[] = [];

  // Collect all KNOWHOW.md paths
  const knowhowPaths: string[] = [];
  try {
    const msDirs = (fs.readdirSync(milestonesBase) as string[]).filter((d) => {
      try {
        return fs.statSync(path.join(milestonesBase, d)).isDirectory();
      } catch {
        return false;
      }
    });
    for (const ms of msDirs) {
      const msKnowhow = path.join(milestonesBase, ms, 'KNOWHOW.md');
      if (fs.existsSync(msKnowhow)) knowhowPaths.push(msKnowhow);
      const resKnowhow = path.join(milestonesBase, ms, 'research', 'KNOWHOW.md');
      if (fs.existsSync(resKnowhow)) knowhowPaths.push(resKnowhow);
    }
  } catch {
    // milestones dir doesn't exist
  }
  // Also check root planning research dir
  const rootResearchKnowhow = path.join(cwd, '.planning', 'research', 'KNOWHOW.md');
  if (fs.existsSync(rootResearchKnowhow)) knowhowPaths.push(rootResearchKnowhow);

  let totalEntries = 0;
  // Track all entries across files for contradiction detection (by pattern_name)
  const allByName = new Map<string, { entry: KnowhowEntry; file: string }[]>();

  for (const kPath of knowhowPaths) {
    const content = safeReadFile(kPath);
    if (!content) continue;
    const entries = parseKnowhowEntries(content);
    totalEntries += entries.length;

    for (const entry of entries) {
      // Check if source field references a real file path
      const sourceRef = entry.source.split(':')[0].trim(); // strip line numbers
      if (sourceRef && sourceRef.includes('/') && !sourceRef.startsWith('http')) {
        const absRef = path.isAbsolute(sourceRef)
          ? sourceRef
          : path.join(cwd, sourceRef);
        if (!fs.existsSync(absRef)) {
          flags.push({
            pattern_name: entry.pattern_name,
            source_file: path.relative(cwd, kPath),
            issue: 'broken_ref',
            detail: `Referenced source "${sourceRef}" does not exist`,
          });
        }
      }

      // Accumulate for contradiction detection
      const existing = allByName.get(entry.pattern_name) ?? [];
      existing.push({ entry, file: path.relative(cwd, kPath) });
      allByName.set(entry.pattern_name, existing);
    }
  }

  // Detect contradictions: same pattern_name, significantly different applicability
  let contradictionCount = 0;
  for (const [name, items] of allByName) {
    if (items.length < 2) continue;
    const applicabilities = items.map((i) => i.entry.applicability.toLowerCase());
    const first = applicabilities[0];
    // Heuristic: if one says "always/use" and another says "never/avoid", flag it
    const hasPositive = applicabilities.some((a) => /\b(always|use|prefer|do)\b/.test(a));
    const hasNegative = applicabilities.some((a) => /\b(never|avoid|don't|do not)\b/.test(a));
    if (hasPositive && hasNegative) {
      contradictionCount++;
      flags.push({
        pattern_name: name,
        source_file: items.map((i) => i.file).join(', '),
        issue: 'contradicts',
        detail: `"${first.slice(0, 80)}" vs "${applicabilities.slice(1).join(' / ').slice(0, 80)}"`,
      });
    }
  }

  const staleCount = flags.filter((f) => f.issue === 'broken_ref').length;
  const result: KnowhowAuditResult = {
    total_entries: totalEntries,
    stale_count: staleCount,
    contradiction_count: contradictionCount,
    flags,
    knowhow_files_scanned: knowhowPaths.length,
  };

  const summary = `${knowhowPaths.length} files, ${totalEntries} entries: ${staleCount} stale refs, ${contradictionCount} contradictions`;
  output(result, raw, summary);
}

// ─── Knowhow Dedup ──────────────────────────────────────────────────────────

/** A candidate merge pair from the dedup analysis. */
interface KnowhowDedupPair {
  entry_a: string;
  entry_b: string;
  source_a: string;
  source_b: string;
  similarity: number;
  suggested_merge: string;
}

/** Result of the dedup command. */
interface KnowhowDedupResult {
  files_scanned: number;
  entries_total: number;
  pairs_above_threshold: number;
  pairs: KnowhowDedupPair[];
  report_path: string | null;
}

/** Compute trigram set from text for Jaccard similarity. */
function _trigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const set = new Set<string>();
  for (let i = 0; i + 2 < normalized.length; i++) {
    set.add(normalized.slice(i, i + 3));
  }
  return set;
}

/** Compute Jaccard similarity between two trigram sets. */
function _jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * CLI command: Find near-duplicate entries across all KNOWHOW.md files.
 *
 * Scans all KNOWHOW.md files under .planning/milestones/ and the root research dir.
 * Computes pairwise trigram-Jaccard similarity on entry title + first 3 body lines.
 * Writes a report to .planning/KNOWHOW-DEDUP.md listing pairs with similarity > threshold (default 0.75).
 *
 * @param cwd - Project working directory
 * @param raw - Output raw text instead of JSON
 * @param threshold - Similarity threshold (default 0.75)
 */
function cmdKnowhowDedup(cwd: string, raw: boolean, threshold = 0.75): void {
  const milestonesBase = path.join(cwd, '.planning', 'milestones');

  // Collect all KNOWHOW.md paths
  const knowhowPaths: string[] = [];
  try {
    const msDirs = (fs.readdirSync(milestonesBase) as string[]).filter((d) => {
      try { return fs.statSync(path.join(milestonesBase, d)).isDirectory(); } catch { return false; }
    });
    for (const ms of msDirs) {
      const msKnowhow = path.join(milestonesBase, ms, 'KNOWHOW.md');
      if (fs.existsSync(msKnowhow)) knowhowPaths.push(msKnowhow);
      const resKnowhow = path.join(milestonesBase, ms, 'research', 'KNOWHOW.md');
      if (fs.existsSync(resKnowhow)) knowhowPaths.push(resKnowhow);
    }
  } catch {
    // milestones dir doesn't exist
  }
  const rootResearchKnowhow = path.join(cwd, '.planning', 'research', 'KNOWHOW.md');
  if (fs.existsSync(rootResearchKnowhow)) knowhowPaths.push(rootResearchKnowhow);

  // Load all entries with source file info
  const allEntries: { entry: KnowhowEntry; file: string; fingerprint: string; trigrams: Set<string> }[] = [];
  for (const kPath of knowhowPaths) {
    const content = safeReadFile(kPath);
    if (!content) continue;
    const entries = parseKnowhowEntries(content);
    for (const entry of entries) {
      // Fingerprint: title + first 3 lines of applicability
      const bodyLines = entry.applicability.split('\n').slice(0, 3).join(' ');
      const fingerprint = `${entry.pattern_name} ${bodyLines}`;
      allEntries.push({
        entry,
        file: path.relative(cwd, kPath),
        fingerprint,
        trigrams: _trigrams(fingerprint),
      });
    }
  }

  // Pairwise similarity (O(n^2), acceptable for typical KNOWHOW sizes <500 entries)
  const pairs: KnowhowDedupPair[] = [];
  const totalEntryCount = allEntries.length;
  for (let i = 0; i < totalEntryCount; i++) {
    if (totalEntryCount > 20 && i % 10 === 0) {
      process.stderr.write(`[knowledge:dedup] comparing pair ${i + 1}/${totalEntryCount}\n`);
    }
    for (let j = i + 1; j < totalEntryCount; j++) {
      const sim = _jaccard(allEntries[i].trigrams, allEntries[j].trigrams);
      if (sim >= threshold) {
        pairs.push({
          entry_a: allEntries[i].entry.pattern_name,
          entry_b: allEntries[j].entry.pattern_name,
          source_a: allEntries[i].file,
          source_b: allEntries[j].file,
          similarity: Math.round(sim * 100) / 100,
          suggested_merge: `Keep: "${allEntries[i].entry.pattern_name}" (phase ${allEntries[i].entry.phase_number} ≥ ${allEntries[j].entry.phase_number} ? A : B)`,
        });
      }
    }
  }

  // Sort by similarity descending
  pairs.sort((a, b) => b.similarity - a.similarity);

  // Write report
  let reportPath: string | null = null;
  const reportDir = path.join(cwd, '.planning');
  const reportFile = path.join(reportDir, 'KNOWHOW-DEDUP.md');
  try {
    const lines = [
      `# KNOWHOW Deduplication Report`,
      ``,
      `Generated: ${new Date().toISOString().split('T')[0]}`,
      `Files scanned: ${knowhowPaths.length}`,
      `Entries total: ${allEntries.length}`,
      `Threshold: ${threshold}`,
      `Pairs above threshold: ${pairs.length}`,
      ``,
    ];
    if (pairs.length === 0) {
      lines.push('No near-duplicate entries found.');
    } else {
      lines.push('## Merge Candidates\n');
      for (const p of pairs) {
        lines.push(`### Similarity ${p.similarity}`);
        lines.push(`- **A**: \`${p.entry_a}\` (${p.source_a})`);
        lines.push(`- **B**: \`${p.entry_b}\` (${p.source_b})`);
        lines.push(`- **Suggested**: ${p.suggested_merge}`);
        lines.push('');
      }
    }
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(reportFile, lines.join('\n'), 'utf-8');
    reportPath = path.relative(cwd, reportFile);
  } catch {
    // Non-fatal
  }

  const result: KnowhowDedupResult = {
    files_scanned: knowhowPaths.length,
    entries_total: allEntries.length,
    pairs_above_threshold: pairs.length,
    pairs,
    report_path: reportPath,
  };

  output(
    result,
    raw,
    `${allEntries.length} entries, ${pairs.length} duplicate pairs (threshold=${threshold}) → ${reportPath ?? 'report not written'}`
  );
}

// ─── TF-IDF Relevance Ranking ────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','it','its','this',
  'that','these','those','from','by','as','if','when','where','which','who',
]);

/** Tokenize text into lowercase words, removing stopwords and punctuation. */
function _tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Rank knowhow entries by TF-IDF relevance to a phase goal string.
 *
 * Tokenizes the goal and each entry's problem/solution text, computes IDF across
 * all entries, then scores each entry by the sum of TF-IDF for query tokens.
 * Returns at most topN entries sorted by descending relevance score.
 *
 * @param goal - Phase goal string to rank against
 * @param entries - Array of KnowhowEntry to rank
 * @param topN - Number of entries to return (default 5)
 */
function rankKnowhowByPhaseGoal(goal: string, entries: KnowhowEntry[], topN = 5): KnowhowEntry[] {
  if (entries.length === 0 || !goal.trim()) return [];

  const queryTokens = new Set(_tokenize(goal));
  if (queryTokens.size === 0) return entries.slice(0, topN);

  // Build per-entry token lists from pattern_name + applicability (proxy for Problem+Solution)
  const entryTexts = entries.map((e) =>
    _tokenize(`${e.pattern_name} ${e.applicability} ${e.source}`)
  );

  // Compute IDF for each query token
  const idf = new Map<string, number>();
  for (const token of queryTokens) {
    const docsWithToken = entryTexts.filter((tokens) => tokens.includes(token)).length;
    idf.set(token, Math.log((entries.length + 1) / (docsWithToken + 1)) + 1);
  }

  // Score each entry
  const scored = entries.map((entry, i) => {
    const tokens = entryTexts[i];
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    let score = 0;
    for (const token of queryTokens) {
      const termFreq = (tf.get(token) ?? 0) / Math.max(tokens.length, 1);
      score += termFreq * (idf.get(token) ?? 1);
    }
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).map((s) => s.entry);
}

/**
 * CLI command: Rank KNOWHOW entries by relevance to a query string using TF-IDF.
 *
 * @param cwd - Project working directory
 * @param query - Query string to rank against
 * @param topN - Number of top entries to return (default 5)
 * @param raw - Output raw text instead of JSON
 */
function cmdKnowhowRank(cwd: string, query: string, topN: number, raw: boolean): void {
  const knowhowPath = path.join(cwd, 'KNOWHOW.md');
  const entries = _cachedParseKnowhow(knowhowPath);
  if (entries.length === 0) {
    output({ query, top_n: topN, entries: [], message: 'KNOWHOW.md not found or empty' }, raw, 'KNOWHOW.md not found');
    return;
  }
  const ranked = rankKnowhowByPhaseGoal(query, entries, topN);
  const summaries = ranked.map((e) => ({
    pattern_name: e.pattern_name,
    phase_number: e.phase_number,
    applicability: e.applicability.slice(0, 100),
  }));
  output({ query, top_n: topN, total: entries.length, entries: summaries }, raw,
    ranked.map((e, i) => `${i + 1}. ${e.pattern_name} (phase ${e.phase_number})`).join('\n') || 'No entries');
}

module.exports = {
  formatKnowhowEntry,
  parseKnowhowEntries,
  appendKnowhowEntries,
  selectTopEntries,
  buildKnowledgeInjectionBlock,
  extractModuleHints,
  rankKnowhowByPhaseGoal,
  cmdKnowhowAudit,
  cmdKnowhowDedup,
  cmdKnowhowRank,
};
