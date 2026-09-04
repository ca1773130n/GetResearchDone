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

/**
 * Serialize a KnowhowEntry to a markdown level-3 heading block.
 *
 * `superseded_by` is emitted only when set, so an entry without it formats byte-for-byte
 * as it did before W6 and every existing KNOWHOW.md round-trips unchanged.
 */
function formatKnowhowEntry(entry: KnowhowEntry): string {
  return (
    `### ${entry.pattern_name}\n\n` +
    `- **source:** ${entry.source}\n` +
    `- **applicability:** ${entry.applicability}\n` +
    `- **code_snippet:** ${entry.code_snippet}\n` +
    `- **phase_number:** ${entry.phase_number}\n` +
    `- **created_at:** ${entry.created_at}\n` +
    (entry.superseded_by ? `- **superseded_by:** ${entry.superseded_by}\n` : '')
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
 * an equivalent entry (lossless) — including `superseded_by`, which is optional on
 * both sides: absent in the text means absent on the entry, so a pre-W6 KNOWHOW.md
 * loads exactly as it always did.
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
      const entry: KnowhowEntry = {
        pattern_name,
        source: fields['source'],
        applicability: fields['applicability'],
        code_snippet: fields['code_snippet'],
        phase_number,
        created_at: fields['created_at'],
      };
      // Optional and deliberately not in REQUIRED_FIELDS: an entry written before W6
      // has no such line and must still load. The key is left off entirely when the
      // line is absent or blank, so a live entry deep-equals its pre-W6 self.
      if (fields['superseded_by']) entry.superseded_by = fields['superseded_by'];
      entries.push(entry);
    }
  }

  return entries;
}

/**
 * True when two entries under the same pattern_name carry the same knowledge.
 *
 * `created_at` is excluded on purpose: it is stamped per write (the research loop uses
 * `new Date().toISOString()` at PERSIST), so comparing it would make every re-promotion
 * of an unchanged takeaway look like a correction and grow the file without bound.
 * `superseded_by` is bookkeeping about an entry, not part of it, and is excluded too.
 */
function _sameKnowledge(a: KnowhowEntry, b: KnowhowEntry): boolean {
  return (
    a.source === b.source &&
    a.applicability === b.applicability &&
    a.code_snippet === b.code_snippet &&
    a.phase_number === b.phase_number
  );
}

/**
 * Single-line reference to the entry that supersedes another.
 *
 * Collapsed to one line because a newline here would split the block on the next parse
 * and silently drop both halves; never empty, because an empty value formats to a line
 * that parses back as absent, which would read as "still live" and let the same
 * correction supersede it again on every write.
 */
function _supersedeRef(e: KnowhowEntry): string {
  return e.source.replace(/\s+/g, ' ').trim() || 'unknown';
}

/**
 * Read existing KNOWHOW.md at knowhowPath, merge new entries, and write back.
 *
 * - If the file does not exist, starts with an empty entry list.
 * - Collision on pattern_name (W6a): the incoming entry does NOT overwrite the existing
 *   one. The existing entry is marked `superseded_by` and stays on disk; the new entry
 *   is appended beside it. Both survive; only the newer is injectable. This is
 *   `addDeadEnd`'s upsert-with-reopen shape — find by key, mutate the row in place to
 *   record that it was revisited, keep the history — rather than a second dedup idiom.
 * - Two collisions are NOT corrections and change nothing: an entry arriving from an
 *   earlier phase (stale news, dropped as before W6), and one whose knowledge is
 *   unchanged (`_sameKnowledge`), which keeps re-promotion idempotent.
 * - File always starts with `# KNOWHOW\n\n` header.
 * - Parent directories are created if needed.
 */
function appendKnowhowEntries(knowhowPath: string, entries: KnowhowEntry[]): void {
  if (entries.length === 0) return;

  // An ordered list, not a Map keyed by pattern_name: supersession is a chain, and both
  // links share a key. Copies, because `_cachedParseKnowhow` hands back cached objects
  // and a throw before the write would otherwise leave the cache holding a supersession
  // that never reached disk.
  const merged: KnowhowEntry[] = _cachedParseKnowhow(knowhowPath).map((e) => ({ ...e }));

  const total = entries.length;
  for (let i = 0; i < total; i++) {
    const e = entries[i];
    if (total > 50) {
      process.stderr.write(`[knowledge] merging entry ${i + 1}/${total}: ${e.pattern_name}\n`);
    }
    const current = merged.find((m) => m.pattern_name === e.pattern_name && !m.superseded_by);
    if (!current) {
      merged.push({ ...e });
      continue;
    }
    if (e.phase_number < current.phase_number) continue;
    if (_sameKnowledge(current, e)) continue;
    current.superseded_by = _supersedeRef(e);
    merged.push({ ...e });
  }

  // Stable within a phase_number, so a superseded entry stays directly above the entry
  // that replaced it and the correction reads as a chronology.
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
 * - Superseded entries are dropped first (W6a): they stay in KNOWHOW.md so the
 *   correction is auditable, but injecting one would put both versions of a corrected
 *   belief in front of the planner. This is the single funnel — `buildKnowledgeInjectionBlock`
 *   selects through here, so the filter belongs here and nowhere else.
 * - Primary sort: phase_number descending (most recent first).
 * - If moduleHints provided: entries whose source or applicability mentions any
 *   hint string are sorted first within each phase_number bucket.
 * - Tertiary sort: when currentPhase is provided, entries closer to the current
 *   phase rank higher within the same phase_number bucket (proximity scoring).
 * - Returns at most n entries.
 * - If entries.length <= n, returns all entries sorted.
 */
/**
 * True for an entry promoted by the autoresearch loop.
 *
 * `lib/research/promote.ts` stamps `source` as `research:<threadId>#iter<n>`. That prefix is
 * the discriminator rather than `phase_number === 0`, because a phase-0 entry written by
 * anything else is not research and should not take a reserved slot.
 */
function isResearchEntry(e: KnowhowEntry): boolean {
  return typeof e.source === 'string' && e.source.startsWith('research:');
}

function selectTopEntries(
  entries: KnowhowEntry[],
  n: number,
  moduleHints?: string[],
  currentPhase?: number,
): KnowhowEntry[] {
  const live = entries.filter((e) => !e.superseded_by);
  if (live.length === 0 || n <= 0) {
    return [];
  }

  const lowerHints = moduleHints?.map((h) => h.toLowerCase()) ?? [];
  const hintMatches = new Set<KnowhowEntry>();
  if (lowerHints.length > 0) {
    for (const entry of live) {
      const combined = `${entry.source} ${entry.applicability}`.toLowerCase();
      if (lowerHints.some((hint) => combined.includes(hint))) {
        hintMatches.add(entry);
      }
    }
  }

  const scoreEntry = (e: KnowhowEntry): number =>
    e.phase_number * 1000 +
    (hintMatches.has(e) ? 100 : 0) -
    (currentPhase !== undefined ? Math.abs(currentPhase - e.phase_number) : 0);
  const sorted = [...live].sort((a, b) => scoreEntry(b) - scoreEntry(a));

  // Research-promoted entries carry `phase_number: 0` by convention
  // (lib/research/promote.ts), and the score is dominated by `phase_number * 1000`, so with
  // any phase-numbered entry present a research entry scores 0 and can NEVER place. The
  // autoresearch loop mined takeaways, promoted them, and they were structurally unable to
  // reach the planner — the loop looked closed and was not.
  //
  // Reserve a share of the slots rather than re-weighting the score: re-weighting would
  // silently change ranking for every existing caller, while a reserved slot changes only
  // what was previously guaranteed to be absent. `source` is the discriminator, not
  // `phase_number === 0`, because a phase-0 entry from any other writer is not research.
  const research = sorted.filter(isResearchEntry);
  const phased = sorted.filter((e) => !isResearchEntry(e));
  if (research.length === 0 || phased.length === 0) return sorted.slice(0, n);

  // Within research, phase_number is constant so the score cannot order them: use recency.
  const byRecency = [...research].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const reserved = Math.min(byRecency.length, Math.max(1, Math.floor(n / 3)));
  return [...phased.slice(0, Math.max(0, n - reserved)), ...byRecency.slice(0, reserved)]
    .slice(0, n);
}

// ─── Knowledge Stats Tracking ─────────────────────────────────────────────────

interface KnowhowStat {
  hit_count: number;
  last_used: string;
}

function _loadKnowledgeStats(statsPath: string): Record<string, KnowhowStat> {
  try {
    const raw = fs.readFileSync(statsPath, 'utf8') as string;
    return JSON.parse(raw) as Record<string, KnowhowStat>;
  } catch {
    return {};
  }
}

function _saveKnowledgeStats(statsPath: string, stats: Record<string, KnowhowStat>): void {
  try {
    fs.mkdirSync(path.dirname(statsPath), { recursive: true });
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf8');
  } catch {
    /* stats are best-effort; never crash injection on write failure */
  }
}

/**
 * Build a structured knowledge injection block from KNOWHOW.md for prompt injection.
 *
 * Reads KNOWHOW.md from path.join(cwd, 'KNOWHOW.md'), selects top 5 entries
 * using selectTopEntries, and wraps them in <knowhow_context> XML tags.
 * Increments hit_count and last_used in .planning/knowledge-stats.json after each injection.
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

  // Track which entries were injected
  const statsPath = path.join(cwd, '.planning', 'knowledge-stats.json');
  const stats = _loadKnowledgeStats(statsPath);
  const now = new Date().toISOString();
  for (const entry of top) {
    const existing = stats[entry.pattern_name];
    stats[entry.pattern_name] = {
      hit_count: (existing?.hit_count ?? 0) + 1,
      last_used: now,
    };
  }
  _saveKnowledgeStats(statsPath, stats);

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
      // Codex r25 P2: per-phase KNOWHOW.md files are where the knowledge
      // miner writes new entries; audit/dedup must scan them or they
      // miss the common case entirely.
      const phasesBase = path.join(milestonesBase, ms, 'phases');
      try {
        for (const ph of fs.readdirSync(phasesBase) as string[]) {
          const phKnowhow = path.join(phasesBase, ph, 'KNOWHOW.md');
          if (fs.existsSync(phKnowhow)) knowhowPaths.push(phKnowhow);
        }
      } catch { /* skip */ }
    }
  } catch {
    // milestones dir doesn't exist
  }
  // Also check root planning research dir + project-root KNOWHOW.md
  const rootResearchKnowhow = path.join(cwd, '.planning', 'research', 'KNOWHOW.md');
  if (fs.existsSync(rootResearchKnowhow)) knowhowPaths.push(rootResearchKnowhow);
  const rootKnowhow = path.join(cwd, '.planning', 'KNOWHOW.md');
  if (fs.existsSync(rootKnowhow)) knowhowPaths.push(rootKnowhow);
  const projectRootKnowhow = path.join(cwd, 'KNOWHOW.md');
  if (fs.existsSync(projectRootKnowhow)) knowhowPaths.push(projectRootKnowhow);

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
      // Codex r25 P2: include per-phase KNOWHOW.md — that's where the
      // knowledge miner writes the entries that most often dup.
      const phasesBase = path.join(milestonesBase, ms, 'phases');
      try {
        for (const ph of fs.readdirSync(phasesBase) as string[]) {
          const phKnowhow = path.join(phasesBase, ph, 'KNOWHOW.md');
          if (fs.existsSync(phKnowhow)) knowhowPaths.push(phKnowhow);
        }
      } catch { /* skip */ }
    }
  } catch {
    // milestones dir doesn't exist
  }
  const rootResearchKnowhow = path.join(cwd, '.planning', 'research', 'KNOWHOW.md');
  if (fs.existsSync(rootResearchKnowhow)) knowhowPaths.push(rootResearchKnowhow);
  const rootKnowhow = path.join(cwd, '.planning', 'KNOWHOW.md');
  if (fs.existsSync(rootKnowhow)) knowhowPaths.push(rootKnowhow);
  const projectRootKnowhow = path.join(cwd, 'KNOWHOW.md');
  if (fs.existsSync(projectRootKnowhow)) knowhowPaths.push(projectRootKnowhow);

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
    if (totalEntryCount > 20 && i % Math.max(1, Math.floor(totalEntryCount / 20)) === 0) {
      process.stderr.write(`[knowledge:dedup] scanning entry ${i + 1}/${totalEntryCount}\n`);
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
  // Codex r21 P2: KNOWHOW lives in milestone/research dirs and per-phase
  // dirs, not the project root. Match the multi-location scan from
  // r18 (lib/context/agents.ts knowhow_block + lib/commands/knowledge-search.ts).
  const fs = require('fs') as typeof import('fs');
  const candidates: string[] = [
    path.join(cwd, '.planning', 'KNOWHOW.md'),
    path.join(cwd, 'KNOWHOW.md'),
  ];
  const milestonesBase = path.join(cwd, '.planning', 'milestones');
  try {
    for (const ms of fs.readdirSync(milestonesBase) as string[]) {
      candidates.push(path.join(milestonesBase, ms, 'KNOWHOW.md'));
      candidates.push(path.join(milestonesBase, ms, 'research', 'KNOWHOW.md'));
      const phasesBase = path.join(milestonesBase, ms, 'phases');
      try {
        for (const ph of fs.readdirSync(phasesBase) as string[]) {
          candidates.push(path.join(phasesBase, ph, 'KNOWHOW.md'));
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  const entries: ReturnType<typeof _cachedParseKnowhow> = [];
  for (const p of candidates) entries.push(..._cachedParseKnowhow(p));
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
