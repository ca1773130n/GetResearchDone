'use strict';

/**
 * GRD plan-tournament — scoring + selection for candidate PLAN.md files.
 *
 * Tier-3 #9 of the Ouroboros integration. The proposal flagged the full
 * Kargatharaakash-style "generate N plans in parallel, keep best" as
 * expensive + backend-variance-risky. This module ships the scoring +
 * selection half: caller supplies candidate paths, tournament reads them,
 * ranks them, returns the winner. Auto-generation of candidates is a
 * deliberate follow-up so this PR does not block on worktree orchestration.
 *
 * Scoring axes (each in [0, 1], higher is better):
 *
 *   completeness     — fraction of required PLAN.md frontmatter fields
 *                      present (phase, plan, type, wave, depends_on,
 *                      files_modified, autonomous, must_haves)
 *   goal_alignment   — token Jaccard overlap between PLAN's hypothesis +
 *                      predicted_outcome and the ROADMAP.md phase goal.
 *                      Reuses the same vocab approach as lib/drift.ts.
 *   hypothesis_quality — 1 if both top-level `hypothesis:` and
 *                      `predicted_outcome:` scalars are present and
 *                      non-empty (Tier-1 #1); 0 otherwise.
 *   conciseness      — sigmoid penalty for token count over a budget,
 *                      so a clear short plan ranks above a wordy long one
 *                      with the same content.
 *
 * Default weights: completeness 0.35, goal_alignment 0.30,
 * hypothesis_quality 0.20, conciseness 0.15. Configurable.
 */

import * as path from 'path';

const {
  planningDir: getPlanningDir,
}: { planningDir: (cwd: string) => string } = require('./paths');
const {
  safeReadFile,
  safeReadMarkdown,
}: {
  safeReadFile: (p: string) => string | null;
  safeReadMarkdown: (p: string) => string | null;
} = require('./utils');
const {
  extractFrontmatter,
}: { extractFrontmatter: (content: string) => Record<string, unknown> } = require('./frontmatter');

// ─── Domain Types ──────────────────────────────────────────────────────────

export interface ScoringWeights {
  completeness: number;
  goal_alignment: number;
  hypothesis_quality: number;
  conciseness: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  completeness: 0.35,
  goal_alignment: 0.3,
  hypothesis_quality: 0.2,
  conciseness: 0.15,
};

export interface ScoreBreakdown {
  completeness: number;
  goal_alignment: number;
  hypothesis_quality: number;
  conciseness: number;
}

export interface CandidateResult {
  path: string;
  score: number;
  breakdown: ScoreBreakdown;
  /** Set when the candidate could not be parsed at all. */
  error?: string;
  /**
   * Warning surfaced when the candidate's declared phase does not match
   * the tournament's --phase argument. The candidate is still scored, but
   * goal_alignment is computed against the tournament phase (not the
   * candidate's stale phase), and this flag lets reviewers notice the
   * mismatch in the JSON output.
   */
  phase_mismatch?: string;
}

export interface TournamentResult {
  winner: CandidateResult | null;
  ranked: CandidateResult[];
  phase: string;
  weights: ScoringWeights;
}

// ─── Required frontmatter fields ───────────────────────────────────────────

const REQUIRED_FIELDS: readonly string[] = [
  'phase',
  'plan',
  'type',
  'wave',
  'depends_on',
  'files_modified',
  'autonomous',
  'must_haves',
];

const CONCISENESS_TARGET_TOKENS = 2000;
const CONCISENESS_HARD_CAP_TOKENS = 8000;

// ─── Tokenisation (shared with drift) ──────────────────────────────────────

const _STOP_WORDS: Set<string> = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'this', 'that',
  'are', 'was', 'were', 'has', 'have', 'had', 'will', 'would', 'should',
  'phase', 'plan', 'summary', 'roadmap', 'task', 'goal',
]);

function _tokens(text: string): Set<string> {
  const set = new Set<string>();
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g);
  if (!matches) return set;
  for (const t of matches) {
    if (_STOP_WORDS.has(t)) continue;
    set.add(t);
  }
  return set;
}

function _jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── ROADMAP goal extraction (relaxed heading levels, matches drift) ──────

function _extractRoadmapGoal(roadmap: string, phaseNumber: string): string | null {
  const trim = phaseNumber.replace(/^0+/, '') || '0';
  const re = new RegExp(
    `(#{2,4})\\s+Phase ${trim}:[^\\n]*\\n([\\s\\S]*?)(?=\\n#{2,4}\\s+Phase\\s|\\n##[^#]|$)`,
    'i'
  );
  const m = roadmap.match(re);
  return m ? m[0] : null;
}

// ─── Per-axis scorers ──────────────────────────────────────────────────────

function _scoreCompleteness(fm: Record<string, unknown>): number {
  const present = REQUIRED_FIELDS.filter((f) => fm[f] !== undefined && fm[f] !== null);
  return present.length / REQUIRED_FIELDS.length;
}

function _scoreHypothesisQuality(fm: Record<string, unknown>): number {
  const hyp = fm['hypothesis'];
  const pred = fm['predicted_outcome'];
  const ok = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;
  return ok(hyp) && ok(pred) ? 1 : 0;
}

function _scoreGoalAlignment(
  fm: Record<string, unknown>,
  goalText: string | null
): number {
  if (!goalText) return 0;
  const hyp = typeof fm['hypothesis'] === 'string' ? (fm['hypothesis'] as string) : '';
  const pred = typeof fm['predicted_outcome'] === 'string' ? (fm['predicted_outcome'] as string) : '';
  const claim = `${hyp}\n${pred}`.trim();
  if (claim.length === 0) return 0;
  return _jaccard(_tokens(claim), _tokens(goalText));
}

function _scoreConciseness(content: string): number {
  // Approximate token count as whitespace-separated words. Sigmoid-ish:
  // 1.0 at target or below, decaying smoothly toward 0 by the hard cap.
  const tokens = content.split(/\s+/).filter((s) => s.length > 0).length;
  if (tokens <= CONCISENESS_TARGET_TOKENS) return 1;
  if (tokens >= CONCISENESS_HARD_CAP_TOKENS) return 0;
  // Linear decay between target and hard cap.
  return (
    1 - (tokens - CONCISENESS_TARGET_TOKENS) / (CONCISENESS_HARD_CAP_TOKENS - CONCISENESS_TARGET_TOKENS)
  );
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Score a single candidate PLAN.md file against the tournament's
 * `tournamentPhase` (NOT the candidate's claimed phase — codex r1 P2
 * caught the case where a stale wrong-phase PLAN.md scored against its
 * own ROADMAP section and still won the tournament).
 *
 * If the candidate's declared `phase` does not match `tournamentPhase`,
 * the result carries a `phase_mismatch` warning but is still scored so
 * the caller can see *why* it ranked low instead of being silently
 * filtered out.
 *
 * Returns score 0 with `error` set when the file is unreadable.
 */
function scorePlanCandidate(
  candidatePath: string,
  cwd: string,
  tournamentPhase: string,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): CandidateResult {
  const content = safeReadFile(candidatePath);
  if (!content) {
    return {
      path: candidatePath,
      score: 0,
      breakdown: { completeness: 0, goal_alignment: 0, hypothesis_quality: 0, conciseness: 0 },
      error: 'File not found or unreadable',
    };
  }
  const fm = extractFrontmatter(content);
  const completeness = _scoreCompleteness(fm);
  const hypothesis_quality = _scoreHypothesisQuality(fm);
  const conciseness = _scoreConciseness(content);

  // codex r1 P2: goal alignment uses the TOURNAMENT phase, not whatever
  // the candidate file declares — otherwise the tournament's --phase
  // flag is ignored and a stale candidate can win against its own goal.
  const normalizedTournamentPhase = tournamentPhase.match(/^(\d+(?:\.\d+)?)/)?.[1] ?? tournamentPhase;
  const claimedPhase =
    typeof fm['phase'] === 'string'
      ? (fm['phase'] as string).match(/^(\d+(?:\.\d+)?)/)?.[1] ?? ''
      : '';
  // codex r1 P2: use safeReadMarkdown so projects with split-format
  // ROADMAP.md (GRD-INDEX partials) reassemble correctly. Pre-fix,
  // safeReadFile only saw the index stub and goal_alignment was always 0.
  const roadmap = safeReadMarkdown(path.join(getPlanningDir(cwd), 'ROADMAP.md'));
  const goalText =
    roadmap && normalizedTournamentPhase
      ? _extractRoadmapGoal(roadmap, normalizedTournamentPhase)
      : null;
  const goal_alignment = _scoreGoalAlignment(fm, goalText);

  const score =
    weights.completeness * completeness +
    weights.goal_alignment * goal_alignment +
    weights.hypothesis_quality * hypothesis_quality +
    weights.conciseness * conciseness;

  const result: CandidateResult = {
    path: candidatePath,
    score,
    breakdown: { completeness, goal_alignment, hypothesis_quality, conciseness },
  };
  if (claimedPhase && claimedPhase !== normalizedTournamentPhase) {
    result.phase_mismatch = `candidate declares phase "${claimedPhase}" but tournament is for phase "${normalizedTournamentPhase}"`;
  }
  return result;
}

/**
 * Run a tournament over candidate PLAN.md paths. Returns ranked results
 * (highest score first) plus the winner. Ties are broken deterministically
 * by the input order (stable sort).
 */
function runTournament(
  candidatePaths: string[],
  cwd: string,
  phase: string,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): TournamentResult {
  const results: CandidateResult[] = candidatePaths.map((p) =>
    scorePlanCandidate(p, cwd, phase, weights)
  );
  // Stable sort: assign indices, sort by (score desc, index asc).
  const indexed = results.map((r, i) => ({ r, i }));
  indexed.sort((a, b) => {
    if (b.r.score !== a.r.score) return b.r.score - a.r.score;
    return a.i - b.i;
  });
  const ranked = indexed.map((x) => x.r);
  const winner = ranked.length > 0 && ranked[0].score > 0 ? ranked[0] : null;
  return { winner, ranked, phase, weights };
}

// ─── CLI ───────────────────────────────────────────────────────────────────

const {
  output,
  error,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('./utils');

function cmdPlanTournament(
  cwd: string,
  opts: { phase: string; candidates: string[]; weights?: ScoringWeights },
  raw: boolean
): void {
  if (!opts.phase) error('--phase required');
  if (!opts.candidates || opts.candidates.length === 0) {
    error('--candidates required (one or more PLAN.md paths)');
  }
  // Resolve relative paths against cwd
  const resolved = opts.candidates.map((p) =>
    path.isAbsolute(p) ? p : path.join(cwd, p)
  );
  const result = runTournament(resolved, cwd, opts.phase, opts.weights);
  output(
    result,
    raw,
    result.winner
      ? `winner: ${path.relative(cwd, result.winner.path)} (score ${result.winner.score.toFixed(3)})`
      : 'no viable winner'
  );
}

module.exports = {
  scorePlanCandidate,
  runTournament,
  cmdPlanTournament,
  DEFAULT_WEIGHTS,
};
