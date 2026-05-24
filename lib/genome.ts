'use strict';

/**
 * GRD GENOME.md — meta-strategy snapshots.
 *
 * Tier-2 #8 follow-up: write path for the registry that PR #39 shipped
 * the read half of. The proposal's caveat for #8 was "needs rollback
 * policy"; we answer it by:
 *
 *   - NOT mutating existing content. cmdGenomeSnapshot appends a new
 *     dated section; older snapshots stay readable in the same file.
 *   - Each write committed to git via the project's normal flow, so
 *     `git revert <hash>` is the rollback mechanism (same as PR #39).
 *
 * Three operations:
 *
 *   cmdGenomeInit       Writes a starter template if no GENOME.md
 *                       exists. Errors if one already exists (the
 *                       caller should `show` first to inspect).
 *   cmdGenomeShow       Prints the current content (raw or as JSON
 *                       with metadata).
 *   cmdGenomeSnapshot   Appends a new `## Snapshot YYYY-MM-DD` section
 *                       derived from current project state (drift,
 *                       verdict mix, dead-ends count, completed
 *                       phases). Creates GENOME.md if absent.
 *
 * The schema is documented in agents/grd-planner.md <genome>.
 */

import * as fs from 'fs';
import * as path from 'path';

const {
  planningDir: getPlanningDir,
}: { planningDir: (cwd: string) => string } = require('./paths');
const {
  safeReadFile,
  safeReadMarkdown,
  output,
  error,
}: {
  safeReadFile: (p: string) => string | null;
  safeReadMarkdown: (p: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('./utils');
const { atomicWriteFileSync }: { atomicWriteFileSync: (filePath: string, data: string) => void } =
  require('./autopilot-waves');
const { isIndexFile }: { isIndexFile: (content: unknown) => boolean } = require('./markdown-split');
const {
  computeDriftScore,
  DEFAULT_WEIGHTS: DRIFT_WEIGHTS,
}: {
  computeDriftScore: (
    cwd: string,
    weights?: { goal: number; constraint: number; ontology: number },
    threshold?: number
  ) => {
    weighted: number;
    threshold: number;
    exceeded: boolean;
    goal: { score: number; sufficient_data: boolean };
    constraint: { score: number; sufficient_data: boolean };
    ontology: { score: number; sufficient_data: boolean };
  };
  DEFAULT_WEIGHTS: { goal: number; constraint: number; ontology: number };
} = require('./drift');
const {
  parseReflectionSection,
}: {
  parseReflectionSection: (content: string) => {
    hypothesis: string;
    predicted_outcome: string;
    actual_outcome: string;
    verdict: string;
    evidence: string[];
  } | null;
} = require('./dead-ends');

// ─── Starter template ──────────────────────────────────────────────────────

const _STARTER_TEMPLATE = `# Strategy Genome

Project-scoped meta-strategy snapshot. Captures how this project plans
— heuristics in use, agent preferences, verdict-thresholds the team
has settled on. The planner reads this before composing PLAN.md.

See agents/grd-planner.md \`<genome>\` for the consumer contract.

## Heuristics in use

_Add lines like:_
- Use \`verification_level: proxy\` for ML phases.
- Split phases past 50% context degradation.

## Agent preferences

_Add lines like:_
- Run \`grd-deep-diver\` before plan when research_level >= 2.

## Verdict thresholds

_Add lines like:_
- Promote falsified reflections to DEAD-ENDS automatically.
- Stop autopilot on ontology similarity >= 0.95.

## Snapshots

_Each \`gd-tools genome snapshot\` call appends a dated section below._
`;

// ─── Snapshot composition ──────────────────────────────────────────────────

/**
 * Walk completed phase dirs to count verdict kinds across all
 * Reflection sections. Matches the heuristic from lib/think.ts but
 * does not depend on it.
 */
function _verdictCounts(cwd: string): Record<string, number> {
  const counts: Record<string, number> = {
    confirmed: 0,
    partial: 0,
    falsified: 0,
    unknown: 0,
  };
  const milestones = path.join(getPlanningDir(cwd), 'milestones');
  if (!fs.existsSync(milestones)) return counts;
  for (const ms of fs.readdirSync(milestones, { withFileTypes: true })) {
    if (!ms.isDirectory()) continue;
    const phasesDir = path.join(milestones, ms.name, 'phases');
    if (!fs.existsSync(phasesDir)) continue;
    for (const ph of fs.readdirSync(phasesDir, { withFileTypes: true })) {
      if (!ph.isDirectory()) continue;
      const phaseDir = path.join(phasesDir, ph.name);
      const files = fs.readdirSync(phaseDir);
      const verFile = files.find(
        (f) => /-VERIFICATION\.md$/i.test(f) || f === 'VERIFICATION.md'
      );
      if (!verFile) continue;
      // safeReadMarkdown reassembles split-index files so verdicts
      // are counted correctly on projects that have split large
      // VERIFICATION.md files (codex r2 P2 on PR #43).
      const content = safeReadMarkdown(path.join(phaseDir, verFile));
      if (!content) continue;
      const r = parseReflectionSection(content);
      if (!r) continue;
      const v = r.verdict.toLowerCase();
      if (counts[v] !== undefined) counts[v]++;
      else counts[v] = 1;
    }
  }
  return counts;
}

function _countCompletedPhases(cwd: string): number {
  const milestones = path.join(getPlanningDir(cwd), 'milestones');
  if (!fs.existsSync(milestones)) return 0;
  let count = 0;
  for (const ms of fs.readdirSync(milestones, { withFileTypes: true })) {
    if (!ms.isDirectory()) continue;
    const phasesDir = path.join(milestones, ms.name, 'phases');
    if (!fs.existsSync(phasesDir)) continue;
    for (const ph of fs.readdirSync(phasesDir, { withFileTypes: true })) {
      if (!ph.isDirectory()) continue;
      if (!/^\d+(?:\.\d+)?/.test(ph.name)) continue;
      const hasSummary = fs
        .readdirSync(path.join(phasesDir, ph.name))
        .some((f) => /-SUMMARY\.md$/i.test(f) || f === 'SUMMARY.md');
      if (hasSummary) count++;
    }
  }
  return count;
}

function _countDeadEnds(cwd: string): number {
  // safeReadMarkdown reassembles split-index files so DEAD-ENDS count
  // matches what the planner sees (codex r2 P2 on PR #43).
  const deadEnds = safeReadMarkdown(path.join(getPlanningDir(cwd), 'DEAD-ENDS.md'));
  if (!deadEnds) return 0;
  return (deadEnds.match(/^## (\S+)\s*$/gm) ?? []).length;
}

/**
 * Build the markdown body of a fresh snapshot section. Output is
 * deterministic given the same input files.
 */
function _composeSnapshotSection(cwd: string, isoDate: string): string {
  const completed = _countCompletedPhases(cwd);
  const drift = computeDriftScore(cwd, DRIFT_WEIGHTS, 0.3);
  const counts = _verdictCounts(cwd);
  const deadEnds = _countDeadEnds(cwd);

  const lines: string[] = [];
  lines.push(`## Snapshot ${isoDate}`);
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| completed_phases | ${completed} |`);
  lines.push(
    `| drift_weighted | ${drift.weighted.toFixed(3)}${drift.exceeded ? ' (exceeds threshold)' : ''} |`
  );
  lines.push(`| dead_ends_registered | ${deadEnds} |`);
  lines.push(`| verdicts.confirmed | ${counts.confirmed} |`);
  lines.push(`| verdicts.partial | ${counts.partial} |`);
  lines.push(`| verdicts.falsified | ${counts.falsified} |`);
  lines.push(`| verdicts.unknown | ${counts.unknown} |`);
  lines.push('');
  lines.push(
    '_Snapshot derived from project state. No LLM ran. Curate heuristic sections above by hand; this auto-appended block is the deterministic floor._'
  );
  lines.push('');
  return lines.join('\n');
}

// ─── Commands ──────────────────────────────────────────────────────────────

function cmdGenomeInit(cwd: string, raw: boolean): void {
  const filePath = path.join(getPlanningDir(cwd), 'GENOME.md');
  if (fs.existsSync(filePath)) {
    error(`GENOME.md already exists at ${path.relative(cwd, filePath)} — use \`genome show\` to inspect`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteFileSync(filePath, _STARTER_TEMPLATE);
  output(
    { action: 'created', path: path.relative(cwd, filePath) },
    raw,
    `created: ${path.relative(cwd, filePath)}`
  );
}

function cmdGenomeShow(cwd: string, raw: boolean): void {
  const filePath = path.join(getPlanningDir(cwd), 'GENOME.md');
  // safeReadMarkdown reassembles split-index files so `show` returns
  // what the planner actually consumes, not just the index stub
  // (codex r2 P2 on PR #43).
  const content = safeReadMarkdown(filePath);
  if (content === null) {
    output({ exists: false, content: null }, raw, '(none)');
    return;
  }
  output(
    { exists: true, content, path: path.relative(cwd, filePath) },
    raw,
    content
  );
}

export interface SnapshotResult {
  action: 'created' | 'appended';
  snapshot_date: string;
  path: string;
}

/** Sentinel error thrown by runGenomeSnapshot when GENOME.md is split-index. */
export class GenomeSplitIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenomeSplitIndexError';
  }
}

/**
 * Pure-ish helper: same logic as cmdGenomeSnapshot but returns instead
 * of calling `output()` (which exits the process). Lets callers like
 * lib/evolve/orchestrator.ts append a snapshot at the end of a cycle
 * without terminating the parent process. Throws
 * GenomeSplitIndexError if GENOME.md is in split-index format —
 * caller chooses whether to surface or swallow.
 */
function runGenomeSnapshot(cwd: string): SnapshotResult {
  const filePath = path.join(getPlanningDir(cwd), 'GENOME.md');
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);
  const section = _composeSnapshotSection(cwd, isoDate);

  let prior: string;
  let action: 'created' | 'appended';
  if (fs.existsSync(filePath)) {
    prior = safeReadFile(filePath) ?? '';
    if (isIndexFile(prior)) {
      throw new GenomeSplitIndexError(
        `GENOME.md is in split-index format (<!-- GRD-INDEX -->). Snapshots cannot be appended to the stub — they would never reach planner context. Either edit the linked partial directly, or reassemble GENOME.md before snapshotting.`
      );
    }
    if (!prior.endsWith('\n')) prior += '\n';
    action = 'appended';
  } else {
    prior = _STARTER_TEMPLATE;
    action = 'created';
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteFileSync(filePath, prior + '\n' + section);
  return { action, snapshot_date: isoDate, path: path.relative(cwd, filePath) };
}

function cmdGenomeSnapshot(cwd: string, raw: boolean): void {
  let result: SnapshotResult;
  try {
    result = runGenomeSnapshot(cwd);
  } catch (e) {
    if (e instanceof GenomeSplitIndexError) {
      error(e.message);
    }
    throw e;
  }
  output(result, raw, `${result.action} snapshot ${result.snapshot_date}`);
}

// ─── promote-suggestion (v0.4 Phase 5) ──────────────────────────────────────

/**
 * Human-curated promotion of a `gd patterns` suggestion from
 * .planning/GENOME-SUGGESTIONS.md into the prescriptive GENOME.md.
 *
 * Finds the suggestion block whose `Promote with: gd genome
 * promote-suggestion <slug>` line matches `slug`, copies its
 * "Suggested heuristic:" text into GENOME.md under a
 * "## Heuristics in use (promoted)" section as a human-editable draft,
 * and records provenance (date + source slug). This is the ONLY path
 * from advisory suggestion to prescriptive heuristic — keeping the
 * deterministic-or-human-reviewed write contract
 * (DEAD-ENDS: auto-suggestions-in-genome-file). The human is expected to
 * refine the wording afterward; the command just moves the text across
 * the prescriptive boundary deliberately.
 */
function cmdGenomePromoteSuggestion(cwd: string, slug: string, raw: boolean): void {
  if (!slug) error('slug required. Usage: gd genome promote-suggestion <slug>');
  const planning = getPlanningDir(cwd);
  const suggPath = path.join(planning, 'GENOME-SUGGESTIONS.md');
  const suggContent = safeReadMarkdown(suggPath);
  if (!suggContent) {
    error(`no GENOME-SUGGESTIONS.md found at ${path.relative(cwd, suggPath)}. Run \`gd patterns --apply --yes\` first.`);
  }

  // Find the suggested-heuristic line for this slug. Blocks end with
  // `Promote with: ... promote-suggestion <slug>`; the heuristic is the
  // preceding `Suggested heuristic: "..."` line.
  const heuristic = extractSuggestedHeuristic(suggContent as string, slug);
  if (!heuristic) {
    error(`slug "${slug}" not found in GENOME-SUGGESTIONS.md.`);
  }

  const genomePath = path.join(planning, 'GENOME.md');
  const existing = safeReadFile(genomePath);
  if (existing !== null && isIndexFile(existing)) {
    error('GENOME.md is a GRD-INDEX split file; promote into the reassembled source manually.');
  }
  const date = new Date().toISOString().slice(0, 10);
  const entry = `- ${heuristic} _(promoted ${date} from suggestion \`${slug}\`; edit wording as needed)_\n`;
  const header = '## Heuristics in use (promoted)';

  let next: string;
  const base = existing ?? '# GENOME\n\nProject meta-strategy.\n';
  if (base.includes(header)) {
    // Append under the existing section (right after the header line).
    next = base.replace(header, `${header}\n${entry.trimEnd()}`);
  } else {
    next = `${base.trimEnd()}\n\n${header}\n\n${entry}`;
  }
  atomicWriteFileSync(genomePath, next);
  output(
    { promoted: slug, heuristic, genome_path: path.relative(cwd, genomePath) },
    raw,
    `promoted "${slug}" into ${path.relative(cwd, genomePath)} (edit wording as needed)`
  );
}

/**
 * Extract the "Suggested heuristic" text for a given promote slug.
 *
 * Codex review P2: `gd patterns` appends repeatable `${token}-rate` slugs, so
 * the same slug can recur across run blocks with a LATER run reporting the
 * opposite direction. Scan BOTTOM-UP so the most recent run wins, and match
 * the promote command EXACTLY (anchored to end-of-token) so `foo-rate` does
 * not collide with `foo-rate-2` or `xfoo-rate`.
 */
function extractSuggestedHeuristic(suggestions: string, slug: string): string | null {
  const lines = suggestions.split('\n');
  // Exact match: the slug is the final token of the promote command line
  // (allow a trailing backtick from the markdown formatting).
  const promoteRe = new RegExp(
    `promote-suggestion ${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`?\\s*$`
  );
  for (let i = lines.length - 1; i >= 0; i--) {
    if (promoteRe.test(lines[i])) {
      for (let j = i; j >= 0 && j > i - 6; j--) {
        const m = lines[j].match(/Suggested heuristic:\s*"([^"]+)"/);
        if (m) return m[1];
      }
    }
  }
  return null;
}

module.exports = {
  cmdGenomeInit,
  cmdGenomeShow,
  cmdGenomeSnapshot,
  cmdGenomePromoteSuggestion,
  runGenomeSnapshot,
  GenomeSplitIndexError,
};
