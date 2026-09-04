'use strict';

/**
 * GRD DEAD-ENDS.md registry — write path.
 *
 * Tier-2 #6 (write half). The read path (cmdInitPlanPhase emits
 * dead_ends_md) shipped in PR #35; this module adds the writer so
 * falsified approaches can be recorded canonically. Slug is the dedup
 * key — repeated registrations of the same approach append phase /
 * evidence and flip status from active -> reopened rather than creating
 * duplicate entries.
 *
 * THE WRITER EDITS BYTES, IT DOES NOT REGENERATE THE FILE (#67). A file has
 * more in it than any model of it: prose sections, keys this module does not
 * name (`hypothesis`, `forbidden_terms` — the two inputs the hard-fail gate in
 * lib/commands/select-candidate.ts actually runs on — `predicted_outcome`,
 * `owner`, ...), the project's own header, `evidence` items written as maps.
 * Regenerating from `DeadEndEntry` erased all of it: one `dead-end add` took
 * this repo's own 7,933-byte registry to 425 bytes and reported success. So the
 * unit of work here is a line edit inside a preserved span:
 * `parseDeadEndsDoc` -> mutate a few lines -> `serializeDeadEndsDoc`, where
 * every byte a write did not touch is literally the same byte.
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

/**
 * The one status value that exempts an entry from the select-candidate
 * hard-fail gate. Anything else — `active`, `reopened`, a typo, an absent
 * `status:` key — gates. "Not exactly `retired` implies live" is one line and a
 * typo cannot invert it; a longer vocabulary is a second way to get the
 * exemption wrong. Written only by `retireDeadEnd` (a human running
 * `gd dead-end retire`), never by any automatic path.
 */
const RETIRED = 'retired';

export interface DeadEndEntry {
  /**
   * The falsified approach. OPTIONAL: hand-authored entries (every entry in
   * this repo's own registry) carry `hypothesis:` and no `approach:` key, and
   * requiring it here is what made `parseDeadEndsFile` return zero entries for
   * the real file. A block's slug is what makes it an entry.
   */
  approach?: string;
  slug: string;
  tried_in_phases: string[];
  verdict: string;
  evidence: string[];
  /**
   * Lifecycle: `active` (the default, and what an absent `status:` key means),
   * `reopened` (re-encountered), `retired` (deliberately un-dead-ended by a
   * human). Any other value found on disk is preserved verbatim and treated as
   * LIVE by every consumer — only the exact string `retired` exempts an entry.
   * Typed as `string` deliberately: the parser no longer coerces, because
   * coercing `resolved` to `active` turned a human's retirement marker into the
   * strongest live marker (#67).
   */
  status: string;
  /** ISO yyyy-mm-dd the entry was first recorded. Absent on legacy entries. */
  date?: string;
  notes?: string;
}

/** Result of a human-driven status change (`retire` / `reopen`). */
export interface DeadEndStatusChange {
  slug: string;
  previous_status: string;
  status: string;
  path: string;
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

// ─── Document model: ordered spans over the raw file ────────────────────────

/**
 * How an entry heading is recognised, as a source string so it can be asserted
 * IDENTICAL to the hard-fail gate's regex in lib/commands/select-candidate.ts
 * (`parseDeadEnds`). The writer and the gate must agree about what an entry is:
 * if the writer sees a block the gate does not, a write edits an entry nobody
 * enforces; if the gate sees one the writer does not, a write appends a second
 * block for a slug that visually already exists. The previous writer regex
 * (`^## (\S+)\s*\n+```yaml\n`) disagreed with the gate on both axes — it
 * admitted non-lowercase headings, and it required the fence to sit immediately
 * under the heading. tests/integration/dead-ends-registry.test.ts pins the
 * agreement over the repo's own registry.
 */
const ENTRY_HEADING_RE_SOURCE = '^## ([a-z0-9][a-z0-9-]*)\\s*$';
/** Same forward-scan-to-the-first-fence rule the gate uses. */
const ENTRY_FENCE_RE = /```yaml\s*\n([\s\S]*?)\n```/;
const CLOSING_FENCE = '\n```';

/** A `## slug` + ```yaml block, with its source text kept verbatim. */
export interface DeadEndEntrySpan {
  kind: 'entry';
  slug: string;
  /** `## slug` heading through the opening ```yaml fence line, verbatim. */
  head: string;
  /** The YAML body, verbatim, one string per line. Writes edit THESE lines. */
  bodyLines: string[];
  /** The closing fence, verbatim. */
  tail: string;
  /**
   * Typed projection of `bodyLines`. Read it to decide what to change; never
   * re-emit a block from it — it does not carry what it does not name.
   */
  entry: DeadEndEntry;
}

/**
 * One region of DEAD-ENDS.md: either an entry, or any other bytes (the header,
 * prose between entries, trailing notes) echoed back untouched.
 */
export type DeadEndSpan = { kind: 'raw'; text: string } | DeadEndEntrySpan;

function _isEntrySpan(span: DeadEndSpan): span is DeadEndEntrySpan {
  return span.kind === 'entry';
}

/** Project a block's verbatim YAML body lines onto the typed model. */
function _projectEntry(slug: string, bodyLines: string[]): DeadEndEntry {
  const entry: Partial<DeadEndEntry> = { slug, tried_in_phases: [], evidence: [] };
  let inArrayKey: 'tried_in_phases' | 'evidence' | null = null;
  for (const rawLine of bodyLines) {
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
  return {
    ...(entry.approach ? { approach: entry.approach } : {}),
    slug,
    tried_in_phases: entry.tried_in_phases ?? [],
    verdict: entry.verdict ?? 'falsified',
    evidence: entry.evidence ?? [],
    // Verbatim, uncoerced: an absent key means active, and every other value
    // (including one this module has never heard of) survives a write.
    status: entry.status ?? 'active',
    ...(entry.date ? { date: entry.date } : {}),
    ...(entry.notes ? { notes: entry.notes } : {}),
  };
}

/**
 * Parse DEAD-ENDS.md into ordered spans. Lossless by construction:
 * `serializeDeadEndsDoc(parseDeadEndsDoc(bytes)) === bytes` for any input.
 * A heading with no terminated ```yaml fence stays a `raw` span, exactly as
 * the gate skips it.
 */
function parseDeadEndsDoc(content: string): DeadEndSpan[] {
  const spans: DeadEndSpan[] = [];
  const pushRaw = (text: string): void => {
    if (text.length > 0) spans.push({ kind: 'raw', text });
  };

  const headingRe = new RegExp(ENTRY_HEADING_RE_SOURCE, 'gm');
  const heads: Array<{ slug: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(content)) !== null) heads.push({ slug: m[1], start: m.index });

  pushRaw(content.slice(0, heads.length > 0 ? heads[0].start : content.length));
  for (let i = 0; i < heads.length; i++) {
    const end = i + 1 < heads.length ? heads[i + 1].start : content.length;
    const section = content.slice(heads[i].start, end);
    const fence = section.match(ENTRY_FENCE_RE);
    if (!fence || fence.index === undefined) {
      pushRaw(section);
      continue;
    }
    const body = fence[1];
    // fence[0] === <opening fence> + body + CLOSING_FENCE, so the opening run
    // (which `\s*\n` may have stretched over blank lines) is what is left.
    const openLen = fence[0].length - body.length - CLOSING_FENCE.length;
    const bodyLines = body.split('\n');
    spans.push({
      kind: 'entry',
      slug: heads[i].slug,
      head: section.slice(0, fence.index + openLen),
      bodyLines,
      tail: CLOSING_FENCE,
      entry: _projectEntry(heads[i].slug, bodyLines),
    });
    pushRaw(section.slice(fence.index + fence[0].length));
  }
  return spans;
}

/** Render spans back to text. Untouched spans are byte-identical. */
function serializeDeadEndsDoc(spans: DeadEndSpan[]): string {
  return spans
    .map((s) => (s.kind === 'raw' ? s.text : s.head + s.bodyLines.join('\n') + s.tail))
    .join('');
}

/**
 * Parse DEAD-ENDS.md body into a list of entries. Tolerant of extra
 * preamble and trailing content; blocks with no terminated fence are skipped.
 *
 * Lossy BY DEFINITION (a `DeadEndEntry` names eight keys and a file holds
 * whatever it holds) — read it to decide, never to rewrite. The write path
 * goes through `parseDeadEndsDoc` / `serializeDeadEndsDoc`.
 */
function parseDeadEndsFile(content: string): DeadEndEntry[] {
  return parseDeadEndsDoc(content)
    .filter(_isEntrySpan)
    .map((s) => s.entry);
}

// ─── Line edits inside a block body ─────────────────────────────────────────

/**
 * Line range of `key` inside a YAML body: the `key:` line, plus its `  - `
 * continuation lines when the key is a block array. null when absent.
 */
function _keyRange(bodyLines: string[], key: string): { start: number; end: number } | null {
  for (let i = 0; i < bodyLines.length; i++) {
    if (!bodyLines[i].startsWith(`${key}:`)) continue;
    let end = i;
    if (bodyLines[i].slice(key.length + 1).trim() === '') {
      while (end + 1 < bodyLines.length && /^\s+-\s/.test(bodyLines[end + 1])) end++;
    }
    return { start: i, end };
  }
  return null;
}

/** Where a new top-level key goes: after the last non-blank line of the body. */
function _appendIndex(bodyLines: string[]): number {
  let i = bodyLines.length;
  while (i > 0 && bodyLines[i - 1].trim() === '') i--;
  return i;
}

/** Replace (or append) a scalar `key: <value>` line. `value` is emitted verbatim. */
function _setScalar(bodyLines: string[], key: string, value: string): void {
  const range = _keyRange(bodyLines, key);
  const line = `${key}: ${value}`;
  if (!range) {
    bodyLines.splice(_appendIndex(bodyLines), 0, line);
    return;
  }
  bodyLines.splice(range.start, range.end - range.start + 1, line);
}

/**
 * Merge items into a list key, keeping whichever form the file already uses: a
 * block list gains `  - "item"` lines and no existing line moves; an inline
 * list is rewritten inline; an absent key is appended inline. Normalising the
 * form would mean rewriting lines the caller did not ask to change.
 */
function _appendToList(bodyLines: string[], key: string, items: string[]): void {
  if (items.length === 0) return;
  const range = _keyRange(bodyLines, key);
  if (!range) {
    bodyLines.splice(
      _appendIndex(bodyLines),
      0,
      `${key}: [${items.map(_yamlEscape).join(', ')}]`
    );
    return;
  }
  const valRaw = bodyLines[range.start].slice(key.length + 1).trim();
  if (valRaw.startsWith('[') && valRaw.endsWith(']')) {
    const merged = _splitInlineArray(valRaw.slice(1, -1)).concat(items);
    bodyLines[range.start] = `${key}: [${merged.map(_yamlEscape).join(', ')}]`;
    return;
  }
  if (valRaw !== '') {
    throw new Error(
      `DEAD-ENDS.md: cannot merge into "${key}" — expected a list, found "${valRaw}"`
    );
  }
  const indent = range.end > range.start ? (bodyLines[range.end].match(/^\s*/)?.[0] ?? '  ') : '  ';
  bodyLines.splice(range.end + 1, 0, ...items.map((it) => `${indent}- ${_yamlEscape(it)}`));
}

/**
 * Find the one block a write may touch. THROWS rather than guessing: appending
 * a second block for a slug a human already recorded, or editing one of two
 * blocks that share a slug, is silent corruption — worse than the erasure this
 * writer exists to stop.
 */
function _locateForWrite(doc: DeadEndSpan[], slug: string): DeadEndEntrySpan | null {
  const hits = doc.filter(_isEntrySpan).filter((s) => s.slug === slug);
  if (hits.length > 1) {
    throw new Error(
      `.planning/DEAD-ENDS.md has ${hits.length} blocks for slug "${slug}" — refusing to ` +
        `write. De-duplicate them by hand.`
    );
  }
  if (hits.length === 1) return hits[0];
  // No canonical block. Before appending one, make sure the slug is not sitting
  // in a block this parser cannot read (a non-lowercase heading, or a fence
  // that is never closed) — the gate cannot read it either, but a human can.
  for (const span of doc) {
    if (span.kind !== 'raw') continue;
    const headingRe = /^## (\S+)[ \t]*$/gm;
    let m: RegExpExecArray | null;
    while ((m = headingRe.exec(span.text)) !== null) {
      if (m[1].toLowerCase() !== slug) continue;
      throw new Error(
        `.planning/DEAD-ENDS.md has a "## ${m[1]}" block for slug "${slug}" that cannot be ` +
          `read (the heading must be lowercase [a-z0-9-] and the block must contain a ` +
          `terminated \`\`\`yaml fence) — refusing to write. Fix that block by hand.`
      );
    }
  }
  return null;
}

function _serializeEntry(entry: DeadEndEntry): string {
  const lines: string[] = [`## ${entry.slug}`, '', '```yaml'];
  if (entry.approach) lines.push(`approach: ${_yamlEscape(entry.approach)}`);
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

/**
 * Render a FRESH registry file from a model.
 *
 * NOT a writer for an existing file. `serializeDeadEndsFile(parseDeadEndsFile(x))`
 * is the composition that caused #67 — it can only emit the eight keys
 * `DeadEndEntry` names, so everything else in `x` disappears. Nothing on the
 * write path calls it any more; the write path splices bytes
 * (`parseDeadEndsDoc` / `serializeDeadEndsDoc`).
 */
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
  action: 'created' | 'updated';
  /** True when the entry a human retired was re-encountered. Status is left alone. */
  retired: boolean;
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
    const v = parsed.research_gates?.auto_promote_falsified;
    // A present-but-not-boolean value is a typo, not a decision. `"true"` reading as
    // off is the silent-misconfiguration case this whole gate exists to avoid.
    if (v !== undefined && typeof v !== 'boolean') {
      return {
        enabled: false,
        configError: `research_gates.auto_promote_falsified is ${JSON.stringify(v)} (${typeof v}), not a boolean — the gate reads as off`,
      };
    }
    return { enabled: v === true };
  } catch (err) {
    return {
      enabled: false,
      configError: `.planning/config.json is not valid JSON (${(err as Error).message}) — the gate reads as off, which may not be what you set`,
    };
  }
}

/**
 * Apply an add/update to a parsed document IN PLACE. Same dedup contract as
 * cmdDeadEndAdd; lifted so both the public CLI handler and the
 * promote-from-phase handler share the same logic without going through the
 * process-exiting `output` helper.
 *
 * A new slug appends one rendered block to the end of the document — every
 * existing byte stays put, so the file before the write is an exact prefix of
 * the file after it. An existing slug is edited line by line: a phase is added
 * to `tried_in_phases`, new evidence items are appended to `evidence` in
 * whatever form that key already uses, and `status` / `notes` are replaced.
 * Nothing else in the block is touched, whether or not this module can model it.
 */
function _upsertIntoDoc(
  doc: DeadEndSpan[],
  opts: DeadEndAddOpts,
  slug: string,
  /**
   * When true, re-recording a phase the entry already lists does not flip
   * `active` -> `reopened`. Other fields still merge as usual, so a
   * VERIFICATION.md regenerated with new evidence does change the file — this
   * suppresses the status churn, not every write. Only `promoteFalsifiedFromPhase`
   * passes it: execute-phase and
   * verify-phase both promote the same VERIFICATION.md, so a same-phase repeat is
   * routine there and must not mutate the row. `addDeadEnd`'s public contract is
   * unchanged — a manual re-add still flips `active` -> `reopened`.
   */
  idempotentSamePhase = false,
): UpsertResult {
  const span = _locateForWrite(doc, slug);
  if (!span) {
    const rendered = _serializeEntry({
      approach: opts.approach,
      slug,
      tried_in_phases: [opts.phase],
      verdict: opts.verdict ?? 'falsified',
      evidence: opts.evidence ?? [],
      status: 'active',
      // First-recorded date; updates keep it so latency measures from first sighting.
      date: new Date().toISOString().slice(0, 10),
      ...(opts.notes ? { notes: opts.notes } : {}),
    });
    const before = serializeDeadEndsDoc(doc);
    const sep = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    doc.push(...parseDeadEndsDoc(sep + rendered));
    return { action: 'created', retired: false };
  }

  const entry = span.entry;
  const retired = entry.status === RETIRED;
  const isNewPhase = !entry.tried_in_phases.includes(opts.phase);
  if (isNewPhase) _appendToList(span.bodyLines, 'tried_in_phases', [opts.phase]);
  _appendToList(
    span.bodyLines,
    'evidence',
    (opts.evidence ?? []).filter((ev) => !entry.evidence.includes(ev))
  );
  // A human's retirement is never undone by an automatic re-record: phase and
  // evidence still merge, the status stays exactly as typed, and the caller is
  // handed `retired` so it can say so. Re-arming is `gd dead-end reopen`.
  if (!retired && entry.status === 'active' && (isNewPhase || !idempotentSamePhase)) {
    _setScalar(span.bodyLines, 'status', 'reopened');
  }
  if (opts.notes) _setScalar(span.bodyLines, 'notes', _yamlEscape(opts.notes));
  // Keep the projection derived from the bytes, never the other way round.
  span.entry = _projectEntry(slug, span.bodyLines);
  return { action: 'updated', retired };
}

/** Text of one entry span, exactly as it sits (or would sit) on disk. */
function _spanText(span: DeadEndEntrySpan): string {
  return span.head + span.bodyLines.join('\n') + span.tail;
}

/**
 * Read the registry as a document. An absent or blank file starts from the
 * canonical header, so bootstrapping is byte-identical to what the old
 * whole-file serializer produced.
 */
function _readDoc(filePath: string): DeadEndSpan[] {
  let content = '';
  if (fs.existsSync(filePath)) content = fs.readFileSync(filePath, 'utf-8');
  if (content.trim() === '') content = _HEADER;
  return parseDeadEndsDoc(content);
}

function _countEntries(doc: DeadEndSpan[]): number {
  return doc.filter(_isEntrySpan).length;
}

/**
 * Add (or update) an entry in `.planning/DEAD-ENDS.md`.
 *
 * Dedup: slug is generated from the approach via generateSlugInternal.
 * Same slug as an existing entry means the same dead end — phase is
 * appended to `tried_in_phases` (if not already present), evidence is
 * appended (if not already present), and notes overwrite when provided.
 *
 * Status flips from `active` to `reopened` on any re-registration, including the
 * same phase — a human re-running `dead-end add` for an approach already recorded
 * is signalling a re-encounter. `promoteFalsifiedFromPhase` opts out of that via
 * `_upsertEntry`'s `idempotentSamePhase`, because its two call sites promote the
 * same VERIFICATION.md by design and must not mutate the row on the second pass.
 */
/**
 * Programmatic add/update of a `.planning/DEAD-ENDS.md` entry. Throws on invalid
 * input (CLI callers translate to `error()`); returns the upsert action so
 * non-CLI callers (e.g. the research loop) can count created vs merged entries.
 */
function addDeadEnd(
  cwd: string, opts: DeadEndAddOpts,
): { action: 'created' | 'updated'; slug: string; total: number; retired: boolean } {
  if (!opts.approach) throw new Error('--approach required');
  if (!opts.phase) throw new Error('--phase required');
  const slug: string | null = generateSlugInternal(opts.approach);
  if (!slug) throw new Error('Could not generate slug from approach');

  const planningDir = path.join(cwd, '.planning');
  const filePath = path.join(planningDir, 'DEAD-ENDS.md');
  const doc = _readDoc(filePath);

  const { action, retired } = _upsertIntoDoc(doc, opts, slug);

  fs.mkdirSync(planningDir, { recursive: true });
  atomicWriteFileSync(filePath, serializeDeadEndsDoc(doc));

  return { action, slug, total: _countEntries(doc), retired };
}

function cmdDeadEndAdd(cwd: string, opts: DeadEndAddOpts, raw: boolean): void {
  let res: { action: 'created' | 'updated'; slug: string; total: number; retired: boolean };
  try {
    res = addDeadEnd(cwd, opts);
  } catch (e: unknown) {
    error(e instanceof Error ? e.message : String(e));
    return;
  }
  output(
    {
      action: res.action, slug: res.slug, total_entries: res.total, retired: res.retired,
      path: path.relative(cwd, path.join(cwd, '.planning', 'DEAD-ENDS.md')),
    },
    raw,
    `${res.action}: ${res.slug}` +
      (res.retired
        ? ` (entry is retired — phase/evidence merged, status left alone; ` +
          `run \`gd dead-end reopen ${res.slug}\` to re-arm the gate)`
        : '')
  );
}

// ─── Human-only lifecycle verbs ─────────────────────────────────────────────

/**
 * Edit one entry's `status:` line (plus any extra scalars) in place. Every byte
 * outside those lines is preserved.
 */
function _setStatusOnDisk(
  cwd: string,
  slug: string,
  status: string,
  extra: Array<[string, string]>
): DeadEndStatusChange {
  if (!slug) throw new Error('slug required');
  const filePath = path.join(cwd, '.planning', 'DEAD-ENDS.md');
  if (!fs.existsSync(filePath)) throw new Error(`${path.relative(cwd, filePath)} does not exist`);
  const doc = parseDeadEndsDoc(fs.readFileSync(filePath, 'utf-8'));
  const span = _locateForWrite(doc, slug);
  if (!span) {
    throw new Error(`No dead-end entry with slug "${slug}" in ${path.relative(cwd, filePath)}`);
  }
  const previous = span.entry.status;
  _setScalar(span.bodyLines, 'status', status);
  for (const [key, value] of extra) _setScalar(span.bodyLines, key, value);
  span.entry = _projectEntry(slug, span.bodyLines);
  atomicWriteFileSync(filePath, serializeDeadEndsDoc(doc));
  return { slug, previous_status: previous, status, path: path.relative(cwd, filePath) };
}

/**
 * Retire an entry: the only supported way to stop a dead end hard-failing a
 * candidate plan, and the only writer of `status: retired` anywhere in GRD.
 *
 * Human-only by design. A DEAD-ENDS row scores a matching plan at -Infinity in
 * select-candidate — permanently, with no warning tier — so automation may arm
 * that gate (addDeadEnd, promote) but may never disarm it. `--reason` is
 * required for the same reason: the row that turns the guard off has to say why.
 */
function retireDeadEnd(cwd: string, slug: string, reason: string): DeadEndStatusChange {
  if (!reason) {
    throw new Error(
      '--reason required: retiring an entry is the only supported way to disarm the ' +
        'DEAD-ENDS hard-fail gate, and the registry must record why'
    );
  }
  return _setStatusOnDisk(cwd, slug, RETIRED, [
    ['retired_reason', _yamlEscape(reason)],
    ['retired_at', new Date().toISOString().slice(0, 10)],
  ]);
}

/** Re-arm a retired entry. The mirror of `retireDeadEnd`; also human-only. */
function reopenDeadEnd(cwd: string, slug: string): DeadEndStatusChange {
  return _setStatusOnDisk(cwd, slug, 'reopened', []);
}

function cmdDeadEndRetire(cwd: string, slug: string, reason: string, raw: boolean): void {
  let res: DeadEndStatusChange;
  try {
    res = retireDeadEnd(cwd, slug, reason);
  } catch (e: unknown) {
    error(e instanceof Error ? e.message : String(e));
    return;
  }
  output(
    res,
    raw,
    `retired: ${res.slug} (was ${res.previous_status}) — candidate plans citing it no longer ` +
      `hard-fail. Re-recording this approach will merge phase/evidence but will NOT re-arm ` +
      `the gate; run \`gd dead-end reopen ${res.slug}\` for that.`
  );
}

function cmdDeadEndReopen(cwd: string, slug: string, raw: boolean): void {
  let res: DeadEndStatusChange;
  try {
    res = reopenDeadEnd(cwd, slug);
  } catch (e: unknown) {
    error(e instanceof Error ? e.message : String(e));
    return;
  }
  output(res, raw, `reopened: ${res.slug} (was ${res.previous_status}) — the gate is armed again`);
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
  const doc = _readDoc(filePath);

  let action: 'created' | 'updated';
  try {
    ({ action } = _upsertIntoDoc(
      doc,
      {
        approach: reflection.hypothesis,
        phase: phaseInfo.phase_number,
        verdict: 'falsified',
        evidence: reflection.evidence,
        notes: reflection.actual_outcome || undefined,
      },
      slug,
      true
    ));
  } catch (e: unknown) {
    // An ambiguous block is a refusal, not a crash: this runs at a phase
    // boundary where the caller must not be exited.
    return { skipped: true, reason: e instanceof Error ? e.message : String(e), ...at };
  }

  // The consequence of a DEAD-ENDS row is `-Infinity` in select-candidate, which is
  // permanent and has no warning tier. Writing without the key set previews instead.
  const gate = _autoPromoteEnabled(cwd);
  const span = doc.filter(_isEntrySpan).find((s) => s.slug === slug);
  if (!gate.enabled) {
    return {
      skipped: false, dry_run: true, action, slug, ...at,
      total_entries: _countEntries(doc),
      path: path.relative(cwd, filePath),
      preview: span ? _spanText(span) : undefined,
      ...(gate.configError ? { config_error: gate.configError } : {}),
    };
  }

  fs.mkdirSync(planningDir, { recursive: true });
  atomicWriteFileSync(filePath, serializeDeadEndsDoc(doc));

  return {
    skipped: false, dry_run: false, action, slug, ...at,
    total_entries: _countEntries(doc),
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
  parseDeadEndsDoc,
  serializeDeadEndsDoc,
  parseDeadEndsFile,
  serializeDeadEndsFile,
  parseReflectionSection,
  addDeadEnd,
  cmdDeadEndAdd,
  retireDeadEnd,
  reopenDeadEnd,
  cmdDeadEndRetire,
  cmdDeadEndReopen,
  promoteFalsifiedFromPhase,
  cmdDeadEndPromoteFromPhase,
  ENTRY_HEADING_RE_SOURCE,
  RETIRED,
};
