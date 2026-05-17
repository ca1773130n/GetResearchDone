'use strict';

/**
 * GRD DEAD-ENDS.md registry — write path.
 *
 * Tier-2 #6 (write half). The read path (cmdInitPlanPhase emits
 * dead_ends_md) shipped in PR #35; this module adds the writer so
 * falsified approaches can be recorded canonically. Slug is the dedup
 * key — repeated registrations of the same approach append phase /
 * evidence and flip status from active -> reopened rather than
 * creating duplicate entries.
 *
 * Schema is documented in agents/grd-planner.md <dead_ends>.
 */

import * as fs from 'fs';
import * as path from 'path';

const {
  generateSlugInternal,
  output,
  error,
}: {
  generateSlugInternal: (text: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('./utils');
const { atomicWriteFileSync }: { atomicWriteFileSync: (filePath: string, data: string) => void } =
  require('./autopilot-waves');

export interface DeadEndEntry {
  approach: string;
  slug: string;
  tried_in_phases: string[];
  verdict: string;
  evidence: string[];
  status: 'active' | 'reopened';
  notes?: string;
}

export interface DeadEndAddOpts {
  approach: string;
  phase: string;
  verdict?: string;
  evidence?: string[];
  notes?: string;
}

// ─── YAML quote / unquote helpers ───────────────────────────────────────────

/**
 * Escape a string for emission as a YAML double-quoted scalar.
 * Handles backslash and double-quote. Newlines are not expected in
 * dead-end fields (CLI flags pass single-line values); preserved
 * literally if present, which is valid in double-quoted YAML.
 */
function _yamlEscape(s: string): string {
  const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Inverse of _yamlEscape. Expects the string with surrounding `"..."` or
 * `'...'` quotes (or no quotes); returns the unescaped scalar value.
 * Single-quoted YAML uses `''` to escape an embedded single quote.
 */
function _yamlUnquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

/**
 * Split an inline YAML array body (`"a", "b", c`) on top-level commas
 * while respecting quoted strings (so commas inside quotes do not split).
 */
function _splitInlineArray(body: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes: '"' | "'" | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes === '"' && ch === '\\' && i + 1 < body.length) {
      current += ch + body[i + 1];
      i++;
      continue;
    }
    if (inQuotes && ch === inQuotes) {
      inQuotes = null;
      current += ch;
      continue;
    }
    if (!inQuotes && (ch === '"' || ch === "'")) {
      inQuotes = ch as '"' | "'";
      current += ch;
      continue;
    }
    if (!inQuotes && ch === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.length > 0) parts.push(current);
  return parts.map(_yamlUnquote).filter((s) => s.length > 0);
}

/**
 * Parse a block-array item line (e.g. `  - "value"` or `  - value`) into
 * the unquoted/unescaped value. Walks the string respecting backslash
 * escapes so embedded `\"` is preserved as `"` in the result.
 */
function _parseBlockArrayItem(line: string): string | null {
  const trimmed = line.replace(/^\s+-\s+/, '');
  if (trimmed.length === 0) return null;
  if (trimmed.startsWith('"')) {
    let end = 1;
    while (end < trimmed.length) {
      if (trimmed[end] === '\\' && end + 1 < trimmed.length) {
        end += 2;
        continue;
      }
      if (trimmed[end] === '"') break;
      end++;
    }
    return _yamlUnquote(trimmed.slice(0, end + 1));
  }
  if (trimmed.startsWith("'")) {
    // Single-quoted: closing quote is a non-doubled `'`
    let end = 1;
    while (end < trimmed.length) {
      if (trimmed[end] === "'" && trimmed[end + 1] !== "'") break;
      if (trimmed[end] === "'" && trimmed[end + 1] === "'") {
        end += 2;
        continue;
      }
      end++;
    }
    return _yamlUnquote(trimmed.slice(0, end + 1));
  }
  return trimmed.trim();
}

/**
 * Parse DEAD-ENDS.md body into a list of entries. Tolerant of extra
 * preamble and trailing content; unparseable blocks are skipped.
 */
function parseDeadEndsFile(content: string): DeadEndEntry[] {
  const entries: DeadEndEntry[] = [];
  const blockRe = /^## (\S+)\s*\n+```yaml\n([\s\S]+?)\n```/gm;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(content)) !== null) {
    const slug = m[1].trim();
    const yamlBody = m[2];
    const entry: Partial<DeadEndEntry> = {
      slug,
      tried_in_phases: [],
      evidence: [],
    };

    const lines = yamlBody.split('\n');
    let inArrayKey: 'tried_in_phases' | 'evidence' | null = null;
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (inArrayKey && /^\s+-\s+/.test(line)) {
        const item = _parseBlockArrayItem(line);
        if (item !== null) entry[inArrayKey]!.push(item);
        continue;
      }
      inArrayKey = null;

      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (!kv) continue;
      const key = kv[1];
      const valRaw = kv[2].trim();

      if (key === 'tried_in_phases' || key === 'evidence') {
        if (valRaw.startsWith('[') && valRaw.endsWith(']')) {
          const inner = valRaw.slice(1, -1);
          (entry as Record<string, unknown>)[key] = _splitInlineArray(inner);
        } else if (valRaw === '[]') {
          (entry as Record<string, unknown>)[key] = [];
        } else if (valRaw === '') {
          (entry as Record<string, unknown>)[key] = [];
          inArrayKey = key;
        }
      } else if (
        key === 'approach' ||
        key === 'verdict' ||
        key === 'status' ||
        key === 'notes'
      ) {
        (entry as Record<string, unknown>)[key] = _yamlUnquote(valRaw);
      }
    }

    if (entry.approach && entry.slug) {
      entries.push({
        approach: entry.approach,
        slug: entry.slug,
        tried_in_phases: entry.tried_in_phases ?? [],
        verdict: entry.verdict ?? 'falsified',
        evidence: entry.evidence ?? [],
        status: entry.status === 'reopened' ? 'reopened' : 'active',
        ...(entry.notes ? { notes: entry.notes } : {}),
      });
    }
  }
  return entries;
}

function _serializeEntry(entry: DeadEndEntry): string {
  const lines: string[] = [`## ${entry.slug}`, '', '```yaml'];
  lines.push(`approach: ${_yamlEscape(entry.approach)}`);
  lines.push(`slug: ${entry.slug}`);
  const phasesInline = entry.tried_in_phases.length
    ? `[${entry.tried_in_phases.map(_yamlEscape).join(', ')}]`
    : '[]';
  lines.push(`tried_in_phases: ${phasesInline}`);
  lines.push(`verdict: ${entry.verdict}`);
  if (entry.evidence.length > 0) {
    lines.push('evidence:');
    for (const e of entry.evidence) lines.push(`  - ${_yamlEscape(e)}`);
  } else {
    lines.push('evidence: []');
  }
  lines.push(`status: ${entry.status}`);
  if (entry.notes) lines.push(`notes: ${_yamlEscape(entry.notes)}`);
  lines.push('```', '');
  return lines.join('\n');
}

const _HEADER = [
  '# Dead Ends Registry',
  '',
  'Project-scoped registry of approaches that were tried and falsified.',
  'Planner consults this before proposing a new hypothesis.',
  'See agents/grd-planner.md `<dead_ends>` for the consumer contract.',
  '',
  '',
].join('\n');

function serializeDeadEndsFile(entries: DeadEndEntry[]): string {
  if (entries.length === 0) return _HEADER;
  return _HEADER + entries.map(_serializeEntry).join('\n');
}

/**
 * Add (or update) an entry in `.planning/DEAD-ENDS.md`.
 *
 * Dedup: slug is generated from the approach via generateSlugInternal.
 * Same slug as an existing entry means the same dead end — phase is
 * appended to `tried_in_phases` (if not already present), evidence is
 * appended (if not already present), status flips from `active` to
 * `reopened`, and notes overwrite when provided.
 */
function cmdDeadEndAdd(cwd: string, opts: DeadEndAddOpts, raw: boolean): void {
  if (!opts.approach) error('--approach required');
  if (!opts.phase) error('--phase required');
  const slug: string | null = generateSlugInternal(opts.approach);
  if (!slug) error('Could not generate slug from approach');

  const planningDir = path.join(cwd, '.planning');
  const filePath = path.join(planningDir, 'DEAD-ENDS.md');
  let existing: DeadEndEntry[] = [];
  if (fs.existsSync(filePath)) {
    existing = parseDeadEndsFile(fs.readFileSync(filePath, 'utf-8'));
  }

  const verdict = opts.verdict ?? 'falsified';
  const evidenceList = opts.evidence ?? [];
  let action: 'created' | 'updated';

  const idx = existing.findIndex((e) => e.slug === slug);
  if (idx === -1) {
    existing.push({
      approach: opts.approach,
      slug: slug as string,
      tried_in_phases: [opts.phase],
      verdict,
      evidence: evidenceList,
      status: 'active',
      ...(opts.notes ? { notes: opts.notes } : {}),
    });
    action = 'created';
  } else {
    const e = existing[idx];
    if (!e.tried_in_phases.includes(opts.phase)) e.tried_in_phases.push(opts.phase);
    for (const ev of evidenceList) if (!e.evidence.includes(ev)) e.evidence.push(ev);
    if (e.status === 'active') e.status = 'reopened';
    if (opts.notes) e.notes = opts.notes;
    action = 'updated';
  }

  fs.mkdirSync(planningDir, { recursive: true });
  atomicWriteFileSync(filePath, serializeDeadEndsFile(existing));

  output(
    { action, slug, total_entries: existing.length, path: path.relative(cwd, filePath) },
    raw,
    `${action}: ${slug}`
  );
}

module.exports = {
  parseDeadEndsFile,
  serializeDeadEndsFile,
  cmdDeadEndAdd,
};
