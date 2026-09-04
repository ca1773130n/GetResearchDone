'use strict';

/**
 * GRD Commands/SelectCandidate — v0.4 Phase 3 deterministic selector.
 *
 * Picks one PLAN-N.md candidate from a phase directory and promotes it
 * to canonical PLAN.md. Extends the v0.3.x lib/plan-tournament.ts
 * scorer with four real-cost / real-signal axes per
 * .planning/milestones/v0.4/phases/03-deterministic-selector/PLAN.md:
 *
 *   1. must_haves coverage — REQUIREMENTS.md artifacts referenced by
 *      the candidate's files_modified + task body
 *   2. DEAD-ENDS hard-fail — slug citation OR forbidden_terms exact
 *      case-insensitive match; Jaccard advisory only
 *   3. verification_commands axis — runs deterministic checks declared
 *      in the candidate's frontmatter (defaults to 0 when absent)
 *   4. cost tiebreaker — fewer estimated tokens wins on score parity
 *
 * Pipeline:
 *   1. Find PLAN-N.md files in phase dir.
 *   2. Score each with the extended axes.
 *   3. Filter out -Infinity (DEAD-ENDS violations).
 *   4. Sort by total score; cost tiebreaker on parity.
 *   5. Rename winner to PLAN.md.
 *   6. Write PLAN-SELECTION.json audit trail (all candidates, all
 *      axis scores, hard-fail reasons, Jaccard advisory warnings).
 *
 * No LLM call anywhere. GENOME heuristic "no LLM-judged scoring on the
 * core execution path" honored.
 *
 * Security: verification_commands run via argv-array spawnSync (no
 * shell). Commands are split on whitespace; pipes / redirects / glob
 * expansion are NOT supported (planner declares one binary + args
 * per command).
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const {
  spawnSync,
}: { spawnSync: typeof import('child_process').spawnSync } = require('child_process');

const {
  findPhaseDir,
  getMilestoneInfo,
  safeReadFile,
  safeReadMarkdown,
  output,
  error,
}: {
  findPhaseDir: (phasesDir: string, phaseArg: string) => string | null;
  getMilestoneInfo: (cwd: string) => { version: string };
  safeReadFile: (p: string) => string | null;
  safeReadMarkdown: (p: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');

const {
  extractFrontmatter,
}: { extractFrontmatter: (content: string) => Record<string, unknown> } = require('../frontmatter');

const {
  scorePlanCandidate,
  DEFAULT_WEIGHTS,
  extractPlanVocabulary,
  clusterByJaccard,
  PROXIMITY_THRESHOLD,
}: {
  scorePlanCandidate: (
    candidatePath: string,
    cwd: string,
    phase: string,
    weights?: import('../plan-tournament').ScoringWeights
  ) => import('../plan-tournament').CandidateResult;
  DEFAULT_WEIGHTS: import('../plan-tournament').ScoringWeights;
  extractPlanVocabulary: (content: string, fm: Record<string, unknown>) => Set<string>;
  clusterByJaccard: (vocabularies: Set<string>[], threshold?: number) => number[][];
  PROXIMITY_THRESHOLD: number;
} = require('../plan-tournament');

const {
  atomicWriteFileSync,
}: { atomicWriteFileSync: (filePath: string, data: string) => void } = require('../autopilot-waves');

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeadEndEntry {
  slug: string;
  hypothesis: string;
  forbidden_terms: string[];
  /**
   * `approach:` — the key lib/dead-ends.ts writes the falsified claim into.
   * Auto-registered entries have no `hypothesis:` (lib/research/promote.ts
   * passes the hypothesis statement as `approach`), so the advisory Jaccard
   * reads whichever of the two the entry carries.
   */
  approach: string;
  /**
   * `status:` lower-cased, or '' when the key is absent (which means active).
   * Only the exact value `retired` exempts an entry from the hard-fail gate.
   */
  status: string;
}

/**
 * The one status value that exempts an entry. Mirrors `RETIRED` in
 * lib/dead-ends.ts; tests/integration/dead-ends-registry.test.ts pins the two
 * modules to the same string by driving the real writer into the real gate.
 */
const RETIRED = 'retired';

/** Everything that is not exactly `retired` is live — including a typo. */
function isRetired(entry: DeadEndEntry): boolean {
  return entry.status === RETIRED;
}

export interface ExtendedAxes {
  must_haves_coverage: number;
  verification_commands: number;
  estimated_tokens: number;
}

export interface AdvisoryWarning {
  dead_end_slug: string;
  jaccard: number;
}

export interface HardFailReason {
  kind: 'slug_citation' | 'forbidden_term';
  dead_end_slug: string;
  matched: string;
}

export interface ClusterInfo {
  /** Cluster index (assigned among DEAD-ENDS survivors only). */
  cluster_id: number;
  /** True if this candidate is its cluster's representative (highest score). */
  is_representative: boolean;
  /**
   * relPath of the representative this candidate was merged into. null when
   * this candidate IS the representative. Hard-failed candidates are not
   * clustered and carry no ClusterInfo.
   */
  merged_into: string | null;
}

export interface ExtendedCandidateResult {
  path: string;
  relPath: string;
  base_score: number;
  total_score: number;
  base_breakdown: import('../plan-tournament').ScoreBreakdown;
  extended: ExtendedAxes;
  hard_fail: HardFailReason | null;
  advisory_warnings: AdvisoryWarning[];
  /** v0.4 Phase 4: set for DEAD-ENDS survivors after proximity clustering. */
  cluster?: ClusterInfo;
}

export interface SelectionResult {
  phase: string;
  phaseDir: string;
  candidates: ExtendedCandidateResult[];
  winner: ExtendedCandidateResult | null;
  promoted_to: string | null;
  audit_trail_path: string;
  /** What the registry contributed: loaded / gating / retired / unknown_status. */
  dead_ends: DeadEndsSummary;
}

export interface SelectCandidateOptions {
  /** Skip the rename PLAN-N.md → PLAN.md and the audit-trail write. */
  dryRun?: boolean;
  /** Override the milestone (default: read from STATE.md). */
  milestone?: string;
  /**
   * Allow the verification_commands axis to execute commands. Default
   * false (codex review P1) — the axis would otherwise run
   * planner-authored commands during selection, before a plan is chosen.
   */
  runVerificationCommands?: boolean;
  /**
   * Overwrite an existing resolved PLAN.md when promoting the winner.
   * Default false (codex review P2) — refuse to clobber a PLAN.md that
   * a human or a prior selection already resolved.
   */
  force?: boolean;
}

// ─── DEAD-ENDS parsing ────────────────────────────────────────────────────

/**
 * Parse DEAD-ENDS.md into structured entries. Format: per-entry
 * `## <slug>` header followed by a fenced YAML block. The selector needs
 * slug, hypothesis/approach, forbidden_terms and status.
 *
 * The heading + fence rules here are the canonical ones: lib/dead-ends.ts's
 * writer locates blocks with the identical regex so the two can never disagree
 * about what an entry is.
 */
export function parseDeadEnds(content: string): DeadEndEntry[] {
  const entries: DeadEndEntry[] = [];
  const sectionRe = /^## ([a-z0-9][a-z0-9-]*)\s*$/gm;
  const matches: Array<{ slug: string; start: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(content)) !== null) {
    matches.push({ slug: m[1], start: m.index });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start : content.length;
    const section = content.slice(start, end);
    const yamlMatch = section.match(/```yaml\s*\n([\s\S]*?)\n```/);
    if (!yamlMatch) continue;
    const yaml = yamlMatch[1];
    const slug = matches[i].slug;
    const hypothesis = extractScalar(yaml, 'hypothesis') ?? '';
    const approach = extractScalar(yaml, 'approach') ?? '';
    const forbidden_terms = extractStringList(yaml, 'forbidden_terms');
    const status = (extractScalar(yaml, 'status') ?? '').toLowerCase();
    entries.push({ slug, hypothesis, forbidden_terms, approach, status });
  }
  return entries;
}

/**
 * Read a top-level scalar out of a YAML block body.
 *
 * Accepts a quoted OR a bare value, because the registry contains both and a
 * quoted-only reader is how a fix ships inert: lib/dead-ends.ts writes
 * `status: retired` with no quotes, so a reader that requires them returns null
 * for every entry the writer produced, defaults it to active, and keeps
 * hard-failing — green tests on both sides. There is deliberately only ONE
 * scalar extractor in this file; a second one with different quoting rules is a
 * coin flip the next contributor loses silently.
 *
 * Anchored to a line start, so `notes: "status: retired"` cannot forge a
 * retirement.
 */
function extractScalar(yaml: string, key: string): string | null {
  const quoted = new RegExp(`^${key}:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"\\s*$`, 'm');
  const q = yaml.match(quoted);
  if (q) return q[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');

  const bare = yaml.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!bare) return null;
  // YAML: a `#` preceded by whitespace (or at the value's start) opens a comment.
  const withoutComment = bare[1].replace(/(^|\s)#.*$/, '$1').trim();
  if (withoutComment.length === 0) return null;
  if (withoutComment.length >= 2 && withoutComment.startsWith("'") && withoutComment.endsWith("'")) {
    return withoutComment.slice(1, -1).replace(/''/g, "'");
  }
  return withoutComment;
}

/**
 * Read a YAML list value in every shape `lib/dead-ends.ts` can WRITE or PARSE.
 *
 * This is a hard-fail input, so a shape this function does not recognise does not
 * error — it returns `[]` and the gate silently stops enforcing those terms. The
 * previous version accepted exactly one shape: a block list, two-space indented,
 * every item double-quoted. `lib/dead-ends.ts` accepts four more (inline arrays,
 * single-quoted items, bare items, other indentation) and its own serializer emits
 * the INLINE form for `tried_in_phases` and `evidence`. So a registry either parser
 * would call well-formed could have its forbidden_terms dropped here, with nothing
 * said. `tests/unit/select-candidate.test.ts` pins the two parsers against one
 * fixture; that test is what keeps this in step, not this comment.
 */
function extractStringList(yaml: string, key: string): string[] {
  // Inline: `key: ["a", 'b', c]` — split on top-level commas only.
  const inline = yaml.match(new RegExp(`^${key}:[ \\t]*\\[(.*)\\][ \\t]*$`, 'm'));
  if (inline) return splitInlineList(inline[1]);

  // Block: `key:` then indented `- item` lines, quoted or bare, any indent.
  const block = yaml.match(new RegExp(`^${key}:[ \\t]*\\n((?:[ \\t]+- .*\\n?)+)`, 'm'));
  if (!block) return [];
  const out: string[] = [];
  for (const line of block[1].split('\n')) {
    const item = line.match(/^[ \t]+- (.*)$/);
    if (item) {
      const v = unquoteScalar(item[1]);
      if (v.length > 0) out.push(v);
    }
  }
  return out;
}

/** Strip one layer of YAML quoting; returns the scalar unchanged when bare. */
function unquoteScalar(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

/** Split an inline-array body on commas that are not inside quotes. */
function splitInlineList(body: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: '"' | "'" | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (q === '"' && ch === '\\' && i + 1 < body.length) { cur += ch + body[i + 1]; i++; continue; }
    if (q && ch === q) { q = null; cur += ch; continue; }
    if (!q && (ch === '"' || ch === "'")) { q = ch as '"' | "'"; cur += ch; continue; }
    if (!q && ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.length > 0) out.push(cur);
  return out.map(unquoteScalar).filter((v) => v.length > 0);
}

// ─── DEAD-ENDS hard-fail check ────────────────────────────────────────────

/**
 * Scan a candidate's text content for DEAD-ENDS violations. Returns the
 * first hard-fail reason found (slug citation OR forbidden_term exact
 * match) and any advisory Jaccard warnings.
 *
 * A `status: retired` entry is skipped entirely — no hard-fail, no advisory.
 * That is the only exemption, and it lives here rather than at the call site so
 * every caller of the gate gets it. Anything else, including `resolved`,
 * `superseded` or a typo, still gates: the cost of wrongly gating is a visible
 * hard-fail naming a slug, the cost of wrongly exempting is a falsified
 * approach silently readmitted.
 */
export function checkDeadEnds(
  candidateText: string,
  deadEnds: DeadEndEntry[]
): { hardFail: HardFailReason | null; advisory: AdvisoryWarning[] } {
  const lower = candidateText.toLowerCase();
  const advisory: AdvisoryWarning[] = [];
  let hardFail: HardFailReason | null = null;

  for (const entry of deadEnds) {
    if (isRetired(entry)) continue;
    if (!hardFail) {
      // Codex review P2: match the slug case-insensitively and on word
      // boundaries so `Elo-Rated-Plan-Tournament` still confesses while an
      // unrelated longer token merely *containing* the slug does not
      // false-positive.
      if (slugCited(lower, entry.slug)) {
        hardFail = { kind: 'slug_citation', dead_end_slug: entry.slug, matched: entry.slug };
      } else {
        for (const term of entry.forbidden_terms) {
          if (lower.includes(term.toLowerCase())) {
            hardFail = { kind: 'forbidden_term', dead_end_slug: entry.slug, matched: term };
            break;
          }
        }
      }
    }
    // Advisory Jaccard always computed for the audit trail (regardless of
    // hard-fail). Threshold 0.6 is a v0.4 guess; Phase 5 may tune from data.
    // `approach` is the fallback because every entry the research loop registers
    // carries the hypothesis statement under that key, so reading `hypothesis`
    // alone scored all of them 0.
    const j = jaccard(tokens(candidateText), tokens(entry.hypothesis || entry.approach));
    if (j >= 0.6) {
      advisory.push({ dead_end_slug: entry.slug, jaccard: j });
    }
  }
  return { hardFail, advisory };
}

/** What the registry contributed to this selection, for the audit trail. */
export interface DeadEndsSummary {
  /** Entries parsed out of DEAD-ENDS.md. */
  loaded: number;
  /** Entries that can actually hard-fail a candidate (loaded minus retired). */
  gating: number;
  /** Slugs exempted because a human retired them. */
  retired: string[];
  /**
   * Entries whose `status:` is neither empty, `active`, `reopened` nor
   * `retired`. They still gate; this is how a typo'd retirement becomes
   * visible instead of silently doing nothing.
   */
  unknown_status: Array<{ slug: string; status: string }>;
}

export function summarizeDeadEnds(deadEnds: DeadEndEntry[]): DeadEndsSummary {
  const known = new Set(['', 'active', 'reopened', RETIRED]);
  return {
    loaded: deadEnds.length,
    gating: deadEnds.filter((e) => !isRetired(e)).length,
    retired: deadEnds.filter(isRetired).map((e) => e.slug),
    unknown_status: deadEnds
      .filter((e) => !known.has(e.status))
      .map((e) => ({ slug: e.slug, status: e.status })),
  };
}

const STOP: Set<string> = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'this', 'that',
  'are', 'was', 'were', 'has', 'have', 'had', 'will', 'would', 'should',
  'phase', 'plan', 'summary', 'roadmap', 'task', 'goal',
]);

/**
 * True when `slug` appears in `lowerText` (already lower-cased) bounded by
 * non-slug-characters on both sides. Slug chars are [a-z0-9-]; a boundary
 * is any character outside that class (or string edge). This avoids the
 * substring false-positive where a slug is a fragment of a longer token.
 */
function slugCited(lowerText: string, slug: string): boolean {
  const slugLower = slug.toLowerCase();
  let from = 0;
  for (;;) {
    const idx = lowerText.indexOf(slugLower, from);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : lowerText[idx - 1];
    const after = idx + slugLower.length >= lowerText.length ? '' : lowerText[idx + slugLower.length];
    const isSlugChar = (c: string): boolean => c !== '' && /[a-z0-9-]/.test(c);
    if (!isSlugChar(before) && !isSlugChar(after)) return true;
    from = idx + 1;
  }
}

function tokens(text: string): Set<string> {
  const set = new Set<string>();
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g);
  if (!matches) return set;
  for (const t of matches) {
    if (STOP.has(t)) continue;
    set.add(t);
  }
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── must_haves coverage axis ─────────────────────────────────────────────

/**
 * Score the candidate's coverage of REQUIREMENTS.md must_haves artifacts.
 * Each found artifact = +1, each missing = -10. Negative scores remain
 * finite — they're NOT a hard-fail (DEAD-ENDS is the only hard-fail path).
 */
export function scoreMustHavesCoverage(
  candidateText: string,
  candidateFm: Record<string, unknown>,
  requirementsText: string | null
): number {
  if (!requirementsText) return 0;
  const required: string[] = extractRequiredArtifacts(requirementsText);
  if (required.length === 0) return 0;

  const filesModified: string[] = Array.isArray(candidateFm['files_modified'])
    ? (candidateFm['files_modified'] as string[]).map(String)
    : [];
  const haystack = candidateText + '\n' + filesModified.join('\n');

  let score = 0;
  for (const art of required) {
    if (haystack.includes(art)) score += 1;
    else score -= 10;
  }
  return score;
}

function extractRequiredArtifacts(requirementsText: string): string[] {
  // Best-effort pull of `must_haves.artifacts:` YAML list.
  const re = /must_haves:\s*\n(?:\s+\w+:\s*\n(?:\s+- .*\n)*)*\s+artifacts:\s*\n((?:\s+- .*\n)+)/;
  const m = requirementsText.match(re);
  const out: string[] = [];
  if (m) {
    for (const line of m[1].split('\n')) {
      const item = line.match(/^\s+- ["']?([^"'\n]+?)["']?\s*$/);
      if (item) out.push(item[1].trim());
    }
  }
  return out;
}

// ─── verification_commands axis ───────────────────────────────────────────

/**
 * Allowlist of permitted verification-command executables. Codex review
 * P1: a blocklist of dangerous binaries is bypassable via absolute paths
 * (`/bin/rm`), relative paths (`./rm`), and unlisted destructive tools.
 * v0.4 uses an ALLOWLIST instead — only these deterministic check tools
 * may run, and only when the bare name matches (no path separators).
 */
const VERIFICATION_ALLOWLIST: Set<string> = new Set([
  'npx', 'npm', 'pnpm', 'yarn', 'node', 'tsx', 'tsc', 'eslint', 'jest', 'prettier',
]);

/**
 * Run each command from the candidate's `verification_commands:` YAML
 * frontmatter and return pass-rate as a score in [0, 10].
 *
 * SECURITY (codex review P1): verification commands are planner-authored
 * input that would otherwise execute during candidate *selection* —
 * before a plan is even chosen, so a candidate that will be REJECTED
 * could still run code. Two guards:
 *   1. The axis is OFF unless `enabled` is true (selectCandidate reads
 *      `plan_selection.run_verification_commands` from config, default
 *      false). When off, returns 0 and runs nothing.
 *   2. When on, only allowlisted executables run, and argv[0] must be a
 *      bare name (no `/` or `\\`) so `/bin/rm` / `./rm` cannot bypass.
 *
 * Each command is split on whitespace; argv[0] is the binary, the rest
 * positional args. No shell — no pipes, redirects, or glob expansion.
 * Per-command 10s timeout with SIGKILL (codex review P2: SIGTERM lets a
 * child ignore the signal and hang selection).
 */
export function scoreVerificationCommands(
  candidateFm: Record<string, unknown>,
  cwd: string,
  enabled: boolean
): number {
  if (!enabled) return 0;
  const cmds = candidateFm['verification_commands'];
  if (!Array.isArray(cmds) || cmds.length === 0) return 0;
  let passed = 0;
  let total = 0;
  for (const raw of cmds) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    total++;
    const argv = raw.trim().split(/\s+/);
    const exe = argv[0];
    if (!exe) continue;
    // Reject path separators: an absolute / relative path bypasses the
    // allowlist (e.g. `/bin/rm`, `./rm`, `..\\rm`).
    if (exe.includes('/') || exe.includes('\\')) continue;
    if (!VERIFICATION_ALLOWLIST.has(exe)) continue;
    try {
      const result = spawnSync(exe, argv.slice(1), {
        cwd,
        timeout: 10000,
        killSignal: 'SIGKILL',
        stdio: 'pipe',
      });
      if (result.status === 0) passed++;
    } catch {
      // Treat exceptions as failure.
    }
  }
  if (total === 0) return 0;
  return Math.round((passed / total) * 10);
}

// ─── Cost tiebreaker ──────────────────────────────────────────────────────

/**
 * Cheap token estimate: whitespace-separated words × 1.3. Used only
 * as a tiebreaker when total scores tie exactly.
 */
export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter((s) => s.length > 0).length;
  return Math.round(words * 1.3);
}

// ─── Per-candidate scoring ─────────────────────────────────────────────────

export function scoreExtendedCandidate(
  candidatePath: string,
  cwd: string,
  phase: string,
  context: {
    deadEnds: DeadEndEntry[];
    requirementsText: string | null;
    /** Whether the verification_commands axis may execute commands. */
    runVerificationCommands: boolean;
  }
): ExtendedCandidateResult {
  const relPath: string = path.relative(cwd, candidatePath);
  const content: string | null = safeReadFile(candidatePath);
  if (!content) {
    return {
      path: candidatePath,
      relPath,
      base_score: 0,
      total_score: -Infinity,
      base_breakdown: {
        completeness: 0,
        goal_alignment: 0,
        hypothesis_quality: 0,
        conciseness: 0,
      },
      extended: { must_haves_coverage: 0, verification_commands: 0, estimated_tokens: 0 },
      hard_fail: { kind: 'slug_citation', dead_end_slug: '(file-unreadable)', matched: '' },
      advisory_warnings: [],
    };
  }

  const base = scorePlanCandidate(candidatePath, cwd, phase, DEFAULT_WEIGHTS);
  const fm = extractFrontmatter(content);

  const { hardFail, advisory } = checkDeadEnds(content, context.deadEnds);

  const mustHavesScore = scoreMustHavesCoverage(content, fm, context.requirementsText);
  const verificationScore = scoreVerificationCommands(fm, cwd, context.runVerificationCommands);
  const tokenEst = estimateTokens(content);

  // Composition: base [0,1] + must_haves (potentially negative) + verification [0,1].
  // Hard-fail short-circuits to -Infinity so the audit trail still records all axes.
  const totalScore = hardFail
    ? -Infinity
    : base.score + mustHavesScore + verificationScore / 10;

  return {
    path: candidatePath,
    relPath,
    base_score: base.score,
    total_score: totalScore,
    base_breakdown: base.breakdown,
    extended: {
      must_haves_coverage: mustHavesScore,
      verification_commands: verificationScore,
      estimated_tokens: tokenEst,
    },
    hard_fail: hardFail,
    advisory_warnings: advisory,
  };
}

// ─── Pipeline orchestrator ─────────────────────────────────────────────────

export function selectCandidate(
  cwd: string,
  phaseNum: string,
  opts: SelectCandidateOptions = {}
): SelectionResult {
  const milestone = opts.milestone ?? getMilestoneInfo(cwd).version;
  const phasesDir: string = path.join(cwd, '.planning', 'milestones', milestone, 'phases');
  const phaseDirName: string | null = findPhaseDir(phasesDir, phaseNum);
  if (!phaseDirName) {
    error(`phase ${phaseNum} not found under ${phasesDir}`);
  }
  const phaseDir: string = path.join(phasesDir, phaseDirName as string);

  const candidates: string[] = listCandidateFiles(phaseDir);
  if (candidates.length === 0) {
    error(`no PLAN-N.md candidates found in ${phaseDir}`);
  }

  const deadEndsText: string | null = safeReadMarkdown(
    path.join(cwd, '.planning', 'DEAD-ENDS.md')
  );
  const deadEnds: DeadEndEntry[] = deadEndsText ? parseDeadEnds(deadEndsText) : [];
  const deadEndsSummary: DeadEndsSummary = summarizeDeadEnds(deadEnds);

  const requirementsText: string | null = safeReadMarkdown(
    path.join(phaseDir, 'REQUIREMENTS.md')
  );

  const runVerificationCommands: boolean = opts.runVerificationCommands ?? false;
  const scored: ExtendedCandidateResult[] = candidates.map((p) =>
    scoreExtendedCandidate(p, cwd, phaseNum, {
      deadEnds,
      requirementsText,
      runVerificationCommands,
    })
  );

  // v0.4 Phase 4 pipeline ordering (codex r1 P1 #4):
  //   1. DEAD-ENDS hard-fail already happened during scoring (-Infinity).
  //   2. Cluster the SURVIVORS by vocabulary Jaccard so near-clones don't
  //      each consume a full scoring slot. Hard-failed candidates are never
  //      clustered — a violator cannot eliminate an innocent clustermate.
  //   3. Each cluster's representative = its highest-scoring member.
  //   4. Winner = highest-scoring representative across clusters.
  const survivorIdx: number[] = scored
    .map((s, i) => (isFinite(s.total_score) ? i : -1))
    .filter((i) => i >= 0);

  // Compare two scored candidates: higher total_score wins; cheaper (fewer
  // estimated tokens) breaks ties. Returns the index (into `scored`) of the
  // better one.
  const better = (a: number, b: number): number => {
    if (scored[a].total_score !== scored[b].total_score) {
      return scored[a].total_score > scored[b].total_score ? a : b;
    }
    return scored[a].extended.estimated_tokens <= scored[b].extended.estimated_tokens ? a : b;
  };

  const representativeIdx: number[] = [];
  if (survivorIdx.length > 0) {
    const survivorVocabs: Set<string>[] = survivorIdx.map((i) => {
      const content = safeReadFile(scored[i].path) ?? '';
      return extractPlanVocabulary(content, extractFrontmatter(content));
    });
    const clusters: number[][] = clusterByJaccard(survivorVocabs, PROXIMITY_THRESHOLD);
    clusters.forEach((memberPositions, clusterId) => {
      // memberPositions index into survivorIdx; map to scored indices.
      const memberScoredIdx = memberPositions.map((p) => survivorIdx[p]);
      let repScored = memberScoredIdx[0];
      for (const m of memberScoredIdx) repScored = better(repScored, m);
      representativeIdx.push(repScored);
      for (const m of memberScoredIdx) {
        scored[m].cluster = {
          cluster_id: clusterId,
          is_representative: m === repScored,
          merged_into: m === repScored ? null : scored[repScored].relPath,
        };
      }
    });
  }

  // Winner = best representative. (Representatives are the only candidates
  // eligible to be promoted — merged-away members and hard-fails are out.)
  let winner: ExtendedCandidateResult | null = null;
  if (representativeIdx.length > 0) {
    let best = representativeIdx[0];
    for (const r of representativeIdx) best = better(best, r);
    winner = scored[best];
  }

  // Present `scored` deterministically for the audit: total_score desc,
  // cheaper first on parity. -Infinity (hard-fails) sink to the bottom.
  scored.sort((a, b) => {
    if (a.total_score !== b.total_score) {
      if (!isFinite(a.total_score) && isFinite(b.total_score)) return 1;
      if (isFinite(a.total_score) && !isFinite(b.total_score)) return -1;
      return b.total_score - a.total_score;
    }
    return a.extended.estimated_tokens - b.extended.estimated_tokens;
  });

  let promotedTo: string | null = null;
  if (winner && !opts.dryRun) {
    const planPath = path.join(phaseDir, 'PLAN.md');
    // Codex review P2: refuse to clobber an already-resolved PLAN.md unless
    // --force. Autopilot never hits this (hasMultipleCandidates requires no
    // resolved PLAN.md), but the public CLI could otherwise destroy a plan.
    if (fs.existsSync(planPath) && !opts.force) {
      error(
        `${path.relative(cwd, planPath)} already exists. Refusing to overwrite a resolved plan. ` +
          `Re-run with --force to replace it, or remove it first.`
      );
    }
    promotedTo = planPath;
    const winnerContent: string = fs.readFileSync(winner.path, 'utf-8');
    atomicWriteFileSync(promotedTo, winnerContent);
  }

  const auditPath = path.join(phaseDir, 'PLAN-SELECTION.json');
  const audit = {
    phase: phaseNum,
    phase_dir: phaseDir,
    milestone,
    timestamp: new Date().toISOString(),
    candidates: scored,
    winner: winner ? winner.relPath : null,
    promoted_to: promotedTo ? path.relative(cwd, promotedTo) : null,
    dead_ends_loaded: deadEnds.length,
    // Paired with `loaded` on purpose: a registry that shrinks, or goes inert
    // because entries were retired, is visible in the artifact a human opens
    // after a surprising hard-fail (or a surprising lack of one).
    dead_ends_gating: deadEndsSummary.gating,
    dead_ends_retired: deadEndsSummary.retired,
    dead_ends_unknown_status: deadEndsSummary.unknown_status,
    requirements_loaded: requirementsText !== null,
    proximity_threshold: PROXIMITY_THRESHOLD,
    hard_failed: scored.filter((s) => s.hard_fail !== null).map((s) => s.relPath),
    clusters_formed: representativeIdx.length,
  };
  if (!opts.dryRun) {
    atomicWriteFileSync(auditPath, JSON.stringify(audit, null, 2));
  }

  return {
    phase: phaseNum,
    phaseDir,
    candidates: scored,
    winner,
    promoted_to: promotedTo,
    audit_trail_path: auditPath,
    dead_ends: deadEndsSummary,
  };
}

function listCandidateFiles(phaseDir: string): string[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(phaseDir);
  } catch {
    return [];
  }
  const candidateRe = /^PLAN-(\d+)\.md$/;
  const matches: Array<{ idx: number; name: string }> = [];
  for (const name of entries) {
    const m = name.match(candidateRe);
    if (m) matches.push({ idx: parseInt(m[1], 10), name });
  }
  matches.sort((a, b) => a.idx - b.idx);
  return matches.map((m) => path.join(phaseDir, m.name));
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

export function cmdSelectCandidate(
  cwd: string,
  phaseNum: string,
  opts: { dryRun?: boolean; force?: boolean; runVerificationCommands?: boolean },
  raw: boolean
): void {
  const result = selectCandidate(cwd, phaseNum, {
    dryRun: opts.dryRun,
    force: opts.force,
    runVerificationCommands: opts.runVerificationCommands,
  });
  // An unrecognised status still gates, which is the safe direction but a silent
  // one — say which entry and which value, so the human who typed `resolved`
  // learns the verb that actually retires it.
  const unknown = result.dead_ends.unknown_status
    .map(
      (u) =>
        `warning: DEAD-ENDS entry "${u.slug}" has status "${u.status}", which is not a ` +
        `recognised value — it still hard-fails. Only \`status: retired\` exempts an entry; ` +
        `run \`gd dead-end retire ${u.slug} --reason "..."\`.`
    )
    .join('\n');
  output(
    result,
    raw,
    (unknown ? `${unknown}\n` : '') +
      (result.winner
        ? `winner: ${result.winner.relPath} (score ${result.winner.total_score.toFixed(3)})` +
            (result.promoted_to
              ? ` → promoted to ${path.relative(cwd, result.promoted_to)}`
              : ' (dry-run, no promotion)')
        : 'no viable winner (all candidates hard-failed)')
  );
}

module.exports = {
  parseDeadEnds,
  checkDeadEnds,
  summarizeDeadEnds,
  scoreMustHavesCoverage,
  scoreVerificationCommands,
  estimateTokens,
  scoreExtendedCandidate,
  selectCandidate,
  cmdSelectCandidate,
};
