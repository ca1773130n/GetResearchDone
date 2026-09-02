'use strict';

/**
 * GRD DEAD-ENDS.md registry — write path.
 *
 * Tier-2 #6 (write half). The read path (cmdInitPlanPhase emits
 * dead_ends_md) shipped in PR #35; this module adds the writer so
 * falsified approaches can be recorded canonically. Slug is the dedup
 * key — repeated registrations of the same approach append phase /
 * evidence rather than creating duplicate entries, and flip status from
 * active -> reopened when the phase is one not already recorded.
 *
 * Schema is documented in agents/grd-planner.md <dead_ends>.
 */

import * as fs from 'fs';
import * as path from 'path';

const {
  generateSlugInternal,
  output,
  error,
  findPhaseInternal,
}: {
  generateSlugInternal: (text: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  findPhaseInternal: (
    cwd: string,
    phase: string
  ) => { phase_number: string; directory: string; found: boolean } | null;
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
  /** ISO yyyy-mm-dd the entry was first recorded. Absent on legacy entries. */
  date?: string;
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
        key === 'date' ||
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
        ...(entry.date ? { date: entry.date } : {}),
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
  // Recorded-at date (ISO yyyy-mm-dd). Optional: legacy entries have none,
  // and every reader tolerates its absence (e.g. harness-conversion latency_days).
  if (entry.date) lines.push(`date: ${entry.date}`);
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

// ─── Reflection section parser ──────────────────────────────────────────────

/**
 * Structured form of the `## Reflection` table that the verifier emits
 * in VERIFICATION.md (locked by tests/integration/reflection-loop.test.ts).
 */
export interface ReflectionData {
  hypothesis: string;
  predicted_outcome: string;
  actual_outcome: string;
  verdict: 'confirmed' | 'partial' | 'falsified' | 'unknown' | string;
  evidence: string[];
}

/**
 * Parse the `## Reflection` markdown table inside a VERIFICATION.md
 * body. Returns null if the section is missing or the table cannot be
 * parsed. Robust to extra columns or rows the verifier might add.
 *
 * Evidence cell is split on `;` since multiple evidence refs are
 * conventionally separated by semicolons in a single table cell (the
 * `,` delimiter is too common inside `file:line — description` refs).
 */
function parseReflectionSection(verificationContent: string): ReflectionData | null {
  const headingIdx = verificationContent.indexOf('## Reflection');
  if (headingIdx === -1) return null;
  // Slice from heading to next H2 or end
  const after = verificationContent.slice(headingIdx + '## Reflection'.length);
  const nextH2 = after.search(/\n## /);
  const section = nextH2 === -1 ? after : after.slice(0, nextH2);

  // Find rows like `| key | value |`. Skip header + separator rows.
  const rowRe = /^\|\s*([^|]+?)\s*\|\s*([\s\S]*?)\s*\|\s*$/gm;
  const fields: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(section)) !== null) {
    const key = m[1].trim();
    const value = m[2].trim();
    // Skip header row and the dashed separator row
    if (/^[-:]+$/.test(key) || /^[-:]+$/.test(value)) continue;
    if (key.toLowerCase() === 'field' && value.toLowerCase() === 'value') continue;
    fields[key.toLowerCase()] = value;
  }

  const hypothesis = fields['hypothesis'];
  const predicted_outcome = fields['predicted_outcome'];
  const actual_outcome = fields['actual_outcome'];
  const verdictRaw = fields['verdict'];
  const evidenceRaw = fields['evidence'];

  if (!hypothesis || !verdictRaw) return null;

  const evidence = evidenceRaw
    ? evidenceRaw
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  return {
    hypothesis,
    predicted_outcome: predicted_outcome ?? '',
    actual_outcome: actual_outcome ?? '',
    verdict: verdictRaw,
    evidence,
  };
}

// ─── Internal upsert (pure, no side effects) ────────────────────────────────

interface UpsertResult {
  entries: DeadEndEntry[];
  action: 'created' | 'updated';
  slug: string;
}

export interface PromoteFromPhaseResult {
  /** True when nothing was promotable; `reason` says why. */
  skipped: boolean;
  reason?: string;
  /** Set unless skipped: `created` on a new slug, `updated` on the idempotent re-run. */
  action?: 'created' | 'updated';
  slug?: string;
  /** True when the entry was previewed only — `.planning/DEAD-ENDS.md` is untouched. */
  dry_run?: boolean;
  /** The entry that would be written, serialized. Dry-run only. */
  preview?: string;
  /** Set when config.json existed but could not be read or parsed — the gate is off
   *  for a reason the user did not choose, and the CLI surfaces it. */
  config_error?: string;
  phase?: string;
  total_entries?: number;
  path?: string;
}

/**
 * `.planning/config.json` → `research_gates.auto_promote_falsified`, default false.
 *
 * Read directly rather than through `loadConfig`: `GrdConfig` does not declare
 * `research_gates`, and widening the shared config type for one boolean is a
 * larger blast radius than a local read.
 */
function _autoPromoteEnabled(cwd: string): { enabled: boolean; configError?: string } {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(cwd, '.planning', 'config.json'), 'utf-8');
  } catch (err) {
    // No config at all is a legitimate "gate off". Anything else — unreadable file,
    // bad permissions — must not masquerade as a deliberate `false`.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { enabled: false };
    return { enabled: false, configError: `Cannot read .planning/config.json (${code})` };
  }
  try {
    const parsed = JSON.parse(raw) as { research_gates?: Record<string, unknown> };
    return { enabled: parsed.research_gates?.auto_promote_falsified === true };
  } catch (err) {
    return {
      enabled: false,
      configError: `.planning/config.json is not valid JSON (${(err as Error).message}) — the gate reads as off, which may not be what you set`,
    };
  }
}

/**
 * Pure helper: given an existing entry list and add opts, produce the
 * new list and metadata. Same dedup contract as cmdDeadEndAdd; lifted
 * so both the public CLI handler and the promote-from-phase handler
 * share the same logic without going through the process-exiting
 * `output` helper.
 */
function _upsertEntry(existing: DeadEndEntry[], opts: DeadEndAddOpts, slug: string): UpsertResult {
  const verdict = opts.verdict ?? 'falsified';
  const evidenceList = opts.evidence ?? [];
  const idx = existing.findIndex((e) => e.slug === slug);
  if (idx === -1) {
    existing.push({
      approach: opts.approach,
      slug,
      tried_in_phases: [opts.phase],
      verdict,
      evidence: evidenceList,
      status: 'active',
      // First-recorded date; updates keep it so latency measures from first sighting.
      date: new Date().toISOString().slice(0, 10),
      ...(opts.notes ? { notes: opts.notes } : {}),
    });
    return { entries: existing, action: 'created', slug };
  }
  const e = existing[idx];
  const isNewPhase = !e.tried_in_phases.includes(opts.phase);
  if (isNewPhase) e.tried_in_phases.push(opts.phase);
  for (const ev of evidenceList) if (!e.evidence.includes(ev)) e.evidence.push(ev);
  // `reopened` means the approach was tried AGAIN, in a later phase. Re-recording the
  // same phase is not a re-encounter — and it is now routine, because execute-phase and
  // verify-phase both promote from the same VERIFICATION.md. Flipping on a repeat call
  // would make the entry mutate on every invocation, which is not idempotent.
  if (isNewPhase && e.status === 'active') e.status = 'reopened';
  if (opts.notes) e.notes = opts.notes;
  return { entries: existing, action: 'updated', slug };
}

/**
 * Add (or update) an entry in `.planning/DEAD-ENDS.md`.
 *
 * Dedup: slug is generated from the approach via generateSlugInternal.
 * Same slug as an existing entry means the same dead end — phase is
 * appended to `tried_in_phases` (if not already present), evidence is
 * appended (if not already present), and notes overwrite when provided.
 *
 * Status flips from `active` to `reopened` only when `opts.phase` is one the
 * entry has not recorded before. `reopened` means the approach was tried again
 * in a LATER phase; re-registering the same phase is not a re-encounter, and
 * treating it as one made the entry mutate on every call. That matters because
 * execute-phase and verify-phase both promote from the same VERIFICATION.md,
 * so a same-phase repeat is now the normal case rather than an oddity.
 */
/**
 * Programmatic add/update of a `.planning/DEAD-ENDS.md` entry. Throws on invalid
 * input (CLI callers translate to `error()`); returns the upsert action so
 * non-CLI callers (e.g. the research loop) can count created vs merged entries.
 */
function addDeadEnd(
  cwd: string, opts: DeadEndAddOpts,
): { action: 'created' | 'updated'; slug: string; total: number } {
  if (!opts.approach) throw new Error('--approach required');
  if (!opts.phase) throw new Error('--phase required');
  const slug: string | null = generateSlugInternal(opts.approach);
  if (!slug) throw new Error('Could not generate slug from approach');

  const planningDir = path.join(cwd, '.planning');
  const filePath = path.join(planningDir, 'DEAD-ENDS.md');
  let existing: DeadEndEntry[] = [];
  if (fs.existsSync(filePath)) {
    existing = parseDeadEndsFile(fs.readFileSync(filePath, 'utf-8'));
  }

  const { action } = _upsertEntry(existing, opts, slug);

  fs.mkdirSync(planningDir, { recursive: true });
  atomicWriteFileSync(filePath, serializeDeadEndsFile(existing));

  return { action, slug, total: existing.length };
}

function cmdDeadEndAdd(cwd: string, opts: DeadEndAddOpts, raw: boolean): void {
  let res: { action: 'created' | 'updated'; slug: string; total: number };
  try {
    res = addDeadEnd(cwd, opts);
  } catch (e: unknown) {
    error(e instanceof Error ? e.message : String(e));
    return;
  }
  output(
    {
      action: res.action, slug: res.slug, total_entries: res.total,
      path: path.relative(cwd, path.join(cwd, '.planning', 'DEAD-ENDS.md')),
    },
    raw,
    `${res.action}: ${res.slug}`
  );
}

/**
 * Walk a phase's VERIFICATION.md and, if its `## Reflection` table reports
 * `verdict: falsified`, register the hypothesis as a dead end. Idempotent
 * thanks to the slug dedup contract — calling this repeatedly on the same
 * phase converges to the same registry state.
 *
 * Non-falsified verdicts (confirmed, partial, unknown) return
 * `{ skipped: true, reason }` so the caller can surface why.
 *
 * Writes only when `research_gates.auto_promote_falsified` is true. Unset or
 * false it returns `dry_run: true` with the entry it would have written in
 * `preview`, and leaves `.planning/DEAD-ENDS.md` byte-identical.
 *
 * Pure with respect to process control flow: it never calls `output`/`error`,
 * so the phase-boundary callers can invoke it without exiting the process.
 */
function promoteFalsifiedFromPhase(cwd: string, phase: string): PromoteFromPhaseResult {
  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) return { skipped: true, reason: 'Phase not found', phase };

  // Find {phase}-VERIFICATION.md in the phase directory
  const phaseDir = path.join(cwd, phaseInfo.directory);
  let files: string[];
  try {
    files = fs.readdirSync(phaseDir);
  } catch {
    return { skipped: true, reason: 'Cannot read phase directory', phase };
  }
  const verFile = files.find((f) => /-VERIFICATION\.md$/i.test(f) || f === 'VERIFICATION.md');
  const at = { phase: phaseInfo.phase_number };
  if (!verFile) return { skipped: true, reason: 'No VERIFICATION.md in phase directory', ...at };

  const verContent = fs.readFileSync(path.join(phaseDir, verFile), 'utf-8');
  const reflection = parseReflectionSection(verContent);
  if (!reflection) {
    return { skipped: true, reason: 'No ## Reflection section parseable in VERIFICATION.md', ...at };
  }
  if (reflection.verdict !== 'falsified') {
    return {
      skipped: true,
      reason: `verdict is "${reflection.verdict}" — only falsified is auto-promoted`,
      ...at,
    };
  }

  const slug: string | null = generateSlugInternal(reflection.hypothesis);
  if (!slug) return { skipped: true, reason: 'Could not derive slug from hypothesis', ...at };

  const planningDir = path.join(cwd, '.planning');
  const filePath = path.join(planningDir, 'DEAD-ENDS.md');
  let existing: DeadEndEntry[] = [];
  if (fs.existsSync(filePath)) {
    existing = parseDeadEndsFile(fs.readFileSync(filePath, 'utf-8'));
  }

  const { action } = _upsertEntry(
    existing,
    {
      approach: reflection.hypothesis,
      phase: phaseInfo.phase_number,
      verdict: 'falsified',
      evidence: reflection.evidence,
      notes: reflection.actual_outcome || undefined,
    },
    slug
  );

  // The consequence of a DEAD-ENDS row is `-Infinity` in select-candidate, which is
  // permanent and has no warning tier. Writing without the key set previews instead.
  const gate = _autoPromoteEnabled(cwd);
  const entry = existing.find((e) => e.slug === slug);
  if (!gate.enabled) {
    return {
      skipped: false, dry_run: true, action, slug, ...at,
      total_entries: existing.length,
      path: path.relative(cwd, filePath),
      preview: entry ? _serializeEntry(entry) : undefined,
      ...(gate.configError ? { config_error: gate.configError } : {}),
    };
  }

  fs.mkdirSync(planningDir, { recursive: true });
  atomicWriteFileSync(filePath, serializeDeadEndsFile(existing));

  return {
    skipped: false, dry_run: false, action, slug, ...at,
    total_entries: existing.length,
    path: path.relative(cwd, filePath),
  };
}

/** Thin CLI formatter over `promoteFalsifiedFromPhase`. */
function cmdDeadEndPromoteFromPhase(cwd: string, phase: string, raw: boolean): void {
  if (!phase) error('phase required');
  const r = promoteFalsifiedFromPhase(cwd, phase);
  const rawValue = r.skipped
    ? `skipped: ${r.reason}`
    : `${r.dry_run ? 'would-' : ''}${r.action}: ${r.slug}${r.config_error ? ` (${r.config_error})` : ''}`;
  output(r, raw, rawValue);
}

module.exports = {
  parseDeadEndsFile,
  serializeDeadEndsFile,
  parseReflectionSection,
  addDeadEnd,
  cmdDeadEndAdd,
  promoteFalsifiedFromPhase,
  cmdDeadEndPromoteFromPhase,
};
