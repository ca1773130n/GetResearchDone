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
        const item = line.replace(/^\s+-\s+"?(.+?)"?\s*$/, '$1');
        entry[inArrayKey]!.push(item);
        continue;
      }
      inArrayKey = null;

      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (!kv) continue;
      const key = kv[1];
      const valRaw = kv[2].trim();
      const unquote = (s: string): string => s.replace(/^["']|["']$/g, '');

      if (key === 'tried_in_phases' || key === 'evidence') {
        if (valRaw.startsWith('[') && valRaw.endsWith(']')) {
          const inner = valRaw.slice(1, -1).trim();
          (entry as Record<string, unknown>)[key] = inner
            ? inner.split(',').map((s) => unquote(s.trim())).filter((s) => s.length > 0)
            : [];
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
        (entry as Record<string, unknown>)[key] = unquote(valRaw);
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
  const approachQuoted = entry.approach.includes('"')
    ? `'${entry.approach.replace(/'/g, "''")}'`
    : `"${entry.approach}"`;
  lines.push(`approach: ${approachQuoted}`);
  lines.push(`slug: ${entry.slug}`);
  const phasesInline = entry.tried_in_phases.length
    ? `[${entry.tried_in_phases.map((p) => `"${p}"`).join(', ')}]`
    : '[]';
  lines.push(`tried_in_phases: ${phasesInline}`);
  lines.push(`verdict: ${entry.verdict}`);
  if (entry.evidence.length > 0) {
    lines.push('evidence:');
    for (const e of entry.evidence) lines.push(`  - "${e}"`);
  } else {
    lines.push('evidence: []');
  }
  lines.push(`status: ${entry.status}`);
  if (entry.notes) lines.push(`notes: "${entry.notes}"`);
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
