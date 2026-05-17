'use strict';

/**
 * GRD project-drift score.
 *
 * Tier-2 #7 of the Ouroboros integration. The proposal required
 * concrete data sources before shipping a weighted formula; this
 * module supplies them:
 *
 *   goal       — ROADMAP.md phase Title+Description+Scope tokens
 *                vs SUMMARY.md ## Accomplishments tokens.
 *                Jaccard distance, mean over recent phases.
 *
 *   constraint — Count of banned-phrasing occurrences (locked by
 *                tests/integration/verifier-evidence.test.ts) in
 *                recent {phase}-VERIFICATION.md and {phase}-SUMMARY.md
 *                files, normalised and clamped to [0, 1].
 *
 *   ontology   — Vocabulary Jaccard distance between recent phases'
 *                SUMMARY frontmatter (tech-stack.added,
 *                patterns-established) and the baseline first phases'.
 *
 * Weighted aggregate: 0.5·goal + 0.3·constraint + 0.2·ontology
 * (matches Q00 / Ouroboros). Threshold default ≤ 0.3 = healthy.
 *
 * All three components are pure functions of files on disk — no LLM
 * calls, no embeddings, no network. Insufficient data → score 0 with
 * sufficient_data: false so callers can decide what to do.
 */

import * as fs from 'fs';
import * as path from 'path';

const { planningDir: getPlanningDir }: { planningDir: (cwd: string) => string } = require('./paths');
const { safeReadFile }: { safeReadFile: (p: string) => string | null } = require('./utils');
const { extractFrontmatter }: { extractFrontmatter: (content: string) => Record<string, unknown> } =
  require('./frontmatter');

// ─── Domain Types ──────────────────────────────────────────────────────────

export interface ComponentResult {
  /** Drift score for this component, in [0, 1]. 0 = no drift. */
  score: number;
  /** True if there was enough data to compute a meaningful score. */
  sufficient_data: boolean;
  /** Human-readable reason when sufficient_data is false. */
  reason?: string;
  /** Component-specific structured detail for the caller to surface. */
  detail?: Record<string, unknown>;
}

export interface DriftWeights {
  goal: number;
  constraint: number;
  ontology: number;
}

export const DEFAULT_WEIGHTS: DriftWeights = { goal: 0.5, constraint: 0.3, ontology: 0.2 };

export interface DriftScore {
  weighted: number;
  threshold: number;
  exceeded: boolean;
  weights: DriftWeights;
  goal: ComponentResult;
  constraint: ComponentResult;
  ontology: ComponentResult;
}

// ─── Tokenisation helpers ──────────────────────────────────────────────────

/** Tokenise a string into lowercase alphanumeric word tokens of length ≥ 3. */
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

const _STOP_WORDS: Set<string> = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'this', 'that',
  'are', 'was', 'were', 'has', 'have', 'had', 'will', 'would', 'should',
  'phase', 'plan', 'summary', 'roadmap', 'task', 'goal',
]);

/** Jaccard distance between two sets: 1 - |A∩B| / |A∪B|. 0 if both empty. */
function _jaccardDistance(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : 1 - intersection / union;
}

// ─── Phase enumeration ─────────────────────────────────────────────────────

interface PhaseInfo {
  phase_number: string;
  phase_dir: string;
}

/**
 * List completed phase directories across all milestones, sorted by
 * the leading numeric prefix (componentwise — `01.10` > `01.9`). A
 * phase is "completed" when it has at least one *-SUMMARY.md file.
 */
function _listCompletedPhases(cwd: string): PhaseInfo[] {
  const planning = getPlanningDir(cwd);
  const milestones = path.join(planning, 'milestones');
  if (!fs.existsSync(milestones)) return [];

  const found: PhaseInfo[] = [];
  for (const ms of fs.readdirSync(milestones, { withFileTypes: true })) {
    if (!ms.isDirectory()) continue;
    const phasesDir = path.join(milestones, ms.name, 'phases');
    if (!fs.existsSync(phasesDir)) continue;
    for (const ph of fs.readdirSync(phasesDir, { withFileTypes: true })) {
      if (!ph.isDirectory()) continue;
      const m = ph.name.match(/^(\d+(?:\.\d+)?)/);
      if (!m) continue;
      const phaseDir = path.join(phasesDir, ph.name);
      const hasSummary = fs
        .readdirSync(phaseDir)
        .some((f) => /-SUMMARY\.md$/i.test(f) || f === 'SUMMARY.md');
      if (!hasSummary) continue;
      found.push({ phase_number: m[1], phase_dir: phaseDir });
    }
  }
  found.sort((a, b) => _comparePhaseIds(a.phase_number, b.phase_number));
  return found;
}

/** Componentwise phase-id comparison (matches lib/context/execute.ts). */
function _comparePhaseIds(a: string, b: string): number {
  const pa = a.split('.').map((p) => parseInt(p, 10));
  const pb = b.split('.').map((p) => parseInt(p, 10));
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

// ─── Goal drift ────────────────────────────────────────────────────────────

/**
 * Extract the {Title, Scope items, Description} text for a given phase
 * from ROADMAP.md. Returns null if the phase block cannot be found.
 *
 * Heading levels: GRD ROADMAPs use `## Phase` (flat), `### Phase`
 * (milestone-grouped), or `#### Phase` (milestone-grouped under an H3
 * version heading). All three forms are accepted. codex r3 P2: prior
 * regex only matched `### Phase`, missing real ROADMAPs with `#### Phase`.
 */
function _extractRoadmapGoal(roadmap: string, phaseNumber: string): string | null {
  // codex r3 P2 on PR #41 (applied here for consistency): accept padded
  // decimal phase IDs in ROADMAP headings (`Phase 06.1` vs `Phase 6.1`).
  const trim = phaseNumber.replace(/^0+/, '') || '0';
  const numberPattern = trim
    .split('.')
    .map((p) => `0*${p.replace(/^0+/, '') || '0'}`)
    .join('\\.');
  // Note: no `m` flag — `$` must mean end-of-input, not end-of-line, so
  // the body capture extends to the next heading or EOF (not the very
  // first newline). The `\n` literals in the body and the stop lookahead
  // already provide the boundary semantics we need.
  const re = new RegExp(
    `(#{2,4})\\s+Phase ${numberPattern}:[^\\n]*\\n([\\s\\S]*?)(?=\\n#{2,4}\\s+Phase\\s|\\n##[^#]|$)`,
    'i'
  );
  const m = roadmap.match(re);
  if (!m) return null;
  return m[0]; // heading + body together
}

/** Extract the `## Accomplishments` section body from a SUMMARY.md. */
function _extractSummaryAccomplishments(summary: string): string | null {
  const m = summary.match(/##\s+Accomplishments\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  return m ? m[1] : null;
}

function computeGoalDrift(cwd: string, recentK = 3): ComponentResult {
  const planning = getPlanningDir(cwd);
  const roadmap = safeReadFile(path.join(planning, 'ROADMAP.md'));
  if (!roadmap) {
    return { score: 0, sufficient_data: false, reason: 'ROADMAP.md not found' };
  }
  const completed = _listCompletedPhases(cwd);
  const recent = completed.slice(-recentK);
  if (recent.length === 0) {
    return { score: 0, sufficient_data: false, reason: 'No completed phases' };
  }

  const perPhase: Array<{ phase: string; distance: number; comparable: boolean }> = [];
  for (const phase of recent) {
    const goalText = _extractRoadmapGoal(roadmap, phase.phase_number);
    // Aggregate accomplishments from ALL SUMMARY.md files in the phase
    // dir — phases routinely have multiple plans (e.g. 01-01-SUMMARY.md,
    // 01-02-SUMMARY.md). codex r2 P2: prior code used .find() and read
    // only one arbitrary summary.
    const summaryFiles = fs
      .readdirSync(phase.phase_dir)
      .filter((f) => /-SUMMARY\.md$/i.test(f) || f === 'SUMMARY.md');
    const accomplishmentChunks: string[] = [];
    for (const sf of summaryFiles) {
      const c = safeReadFile(path.join(phase.phase_dir, sf));
      if (!c) continue;
      const a = _extractSummaryAccomplishments(c);
      if (a) accomplishmentChunks.push(a);
    }
    if (!goalText || accomplishmentChunks.length === 0) {
      perPhase.push({ phase: phase.phase_number, distance: 0, comparable: false });
      continue;
    }
    const distance = _jaccardDistance(_tokens(goalText), _tokens(accomplishmentChunks.join('\n')));
    perPhase.push({ phase: phase.phase_number, distance, comparable: true });
  }

  const comparable = perPhase.filter((p) => p.comparable);
  if (comparable.length === 0) {
    return {
      score: 0,
      sufficient_data: false,
      reason: 'No phase has both ROADMAP goal block and SUMMARY ## Accomplishments',
      detail: { per_phase: perPhase },
    };
  }
  const score = comparable.reduce((s, p) => s + p.distance, 0) / comparable.length;
  return {
    score,
    sufficient_data: true,
    detail: { per_phase: perPhase, recent_k: recentK },
  };
}

// ─── Constraint drift ──────────────────────────────────────────────────────

/**
 * Banned phrasings from the Evidence Standard (locked by
 * tests/integration/verifier-evidence.test.ts). Each occurrence in a
 * recent VERIFICATION.md or SUMMARY.md counts as one constraint violation.
 */
const _BANNED_PHRASINGS: readonly RegExp[] = [
  /\blooks good\b/i,
  /\bseems fine\b/i,
  /\blooks correct\b/i,
  /\bappears to work\b/i,
  /\bshould work\b/i,
  /\bI verified this\b/i,
];

function computeConstraintDrift(cwd: string, recentK = 3): ComponentResult {
  const completed = _listCompletedPhases(cwd);
  const recent = completed.slice(-recentK);
  if (recent.length === 0) {
    return { score: 0, sufficient_data: false, reason: 'No completed phases' };
  }

  let violations = 0;
  let opportunities = 0;
  const perPhase: Array<{ phase: string; violations: number; files_scanned: number }> = [];
  for (const phase of recent) {
    const files = fs
      .readdirSync(phase.phase_dir)
      .filter(
        (f) =>
          /-VERIFICATION\.md$/i.test(f) ||
          f === 'VERIFICATION.md' ||
          /-SUMMARY\.md$/i.test(f) ||
          f === 'SUMMARY.md'
      );
    let phaseViolations = 0;
    for (const f of files) {
      const content = safeReadFile(path.join(phase.phase_dir, f)) ?? '';
      for (const re of _BANNED_PHRASINGS) {
        const matches = content.match(new RegExp(re.source, re.flags + 'g'));
        if (matches) phaseViolations += matches.length;
      }
    }
    perPhase.push({ phase: phase.phase_number, violations: phaseViolations, files_scanned: files.length });
    violations += phaseViolations;
    // Each phase × each rule is an opportunity to violate.
    opportunities += _BANNED_PHRASINGS.length;
  }

  if (opportunities === 0) {
    return { score: 0, sufficient_data: false, reason: 'No verifiable phase artifacts' };
  }
  // Clamp to [0, 1]. A single phase with N rule-violations contributes
  // N/RULES to its slot, capped so a degenerate file cannot dominate.
  const raw = violations / opportunities;
  const score = Math.min(1, raw);
  return {
    score,
    sufficient_data: true,
    detail: { per_phase: perPhase, violations, opportunities, recent_k: recentK },
  };
}

// ─── Ontology drift ────────────────────────────────────────────────────────

/**
 * Extract the vocabulary set for one phase from its SUMMARY.md
 * frontmatter via the shared extractFrontmatter parser. Supports the
 * three shapes seen in the wild:
 *
 *   tech_stack:   (canonical — used by recent planner output)
 *     added: [...]
 *     patterns: [...]
 *   tech-stack:   (legacy / test fixtures — hyphenated)
 *     added: [...]
 *     patterns: [...]
 *   tech-stack:   (older fixtures — `patterns-established` instead of `patterns`)
 *     added: [...]
 *     patterns-established: [...]
 *
 * Block-list and inline-list forms are both handled by extractFrontmatter.
 * codex r2 P2: prior regex-only extractor missed `tech_stack` and
 * block-list shapes entirely, producing false high drift.
 */
function _extractPhaseVocab(summaryContent: string): Set<string> {
  const vocab = new Set<string>();
  const fm = extractFrontmatter(summaryContent);

  // Source 1: nested tech_stack / tech-stack section
  const sections: unknown[] = [fm['tech_stack'], fm['tech-stack']];
  for (const sec of sections) {
    if (!sec || typeof sec !== 'object') continue;
    const obj = sec as Record<string, unknown>;
    for (const fieldName of ['added', 'patterns', 'patterns-established', 'patterns_established']) {
      const arr = obj[fieldName];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (typeof item !== 'string') continue;
        const v = item.trim();
        if (v) vocab.add(v.toLowerCase());
      }
    }
  }

  // Source 2: top-level patterns-established (real GRD summaries shape).
  // codex r3 P2: previously ignored, which dropped a documented data
  // source. Also accept the underscore variant for symmetry.
  for (const topKey of ['patterns-established', 'patterns_established']) {
    const arr = fm[topKey];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      const v = item.trim();
      if (v) vocab.add(v.toLowerCase());
    }
  }

  return vocab;
}

function computeOntologyDrift(cwd: string, recentK = 3, baselineK = 3): ComponentResult {
  const completed = _listCompletedPhases(cwd);
  if (completed.length < 2) {
    return {
      score: 0,
      sufficient_data: false,
      reason: `Need at least 2 completed phases for ontology drift (have ${completed.length})`,
    };
  }

  // baseline = first baselineK phases; recent = last recentK phases.
  // If the project has only a handful of phases, baseline and recent may
  // overlap — that is acceptable: the score just trends toward 0.
  const baselinePhases = completed.slice(0, baselineK);
  const recentPhases = completed.slice(-recentK);

  // Aggregate vocab across ALL SUMMARY.md files in each phase (a phase
  // can have multiple plans). codex r2 P2: prior code used .find() and
  // sampled only one summary, making the score sensitive to filesystem
  // order rather than the whole phase output.
  const collectVocab = (phases: PhaseInfo[]): Set<string> => {
    const v = new Set<string>();
    for (const p of phases) {
      const summaryFiles = fs
        .readdirSync(p.phase_dir)
        .filter((f) => /-SUMMARY\.md$/i.test(f) || f === 'SUMMARY.md');
      for (const sf of summaryFiles) {
        const content = safeReadFile(path.join(p.phase_dir, sf));
        if (!content) continue;
        for (const term of _extractPhaseVocab(content)) v.add(term);
      }
    }
    return v;
  };

  const baselineVocab = collectVocab(baselinePhases);
  const recentVocab = collectVocab(recentPhases);
  if (baselineVocab.size === 0 || recentVocab.size === 0) {
    return {
      score: 0,
      sufficient_data: false,
      reason: 'No tech-stack/patterns-established vocab extractable from SUMMARYs',
      detail: { baseline_size: baselineVocab.size, recent_size: recentVocab.size },
    };
  }
  let intersection = 0;
  for (const t of recentVocab) if (baselineVocab.has(t)) intersection++;
  const union = baselineVocab.size + recentVocab.size - intersection;
  const score = union === 0 ? 0 : 1 - intersection / union;
  return {
    score,
    sufficient_data: true,
    detail: {
      baseline_size: baselineVocab.size,
      recent_size: recentVocab.size,
      intersection,
      union,
      recent_k: recentK,
      baseline_k: baselineK,
    },
  };
}

// ─── Convergence check ─────────────────────────────────────────────────────

export interface ConvergenceResult {
  /** True if baseline/recent vocab are similar enough to declare convergence. */
  converged: boolean;
  /** Similarity = 1 - ontology_drift. Present when converged === true. */
  similarity?: number;
  /** Threshold used. */
  threshold: number;
  /** Why convergence was not declared, when converged === false. */
  reason?: string;
}

/**
 * Check whether ontology has converged: similarity (1 - drift) >= threshold,
 * AND the baseline/recent windows are NON-OVERLAPPING (so similarity is a
 * real measurement, not the trivial "same set" 1.0). Used by autopilot's
 * opt-in termination criterion (Tier-3 #10 of the Ouroboros integration).
 *
 * codex r1 P2 on PR #40: prior wiring used computeOntologyDrift directly,
 * which reports sufficient_data with only 2 completed phases. With default
 * K=3 baseline + K=3 recent, the windows overlap entirely for any project
 * with <= 3 completed phases, producing similarity 1.0 regardless of actual
 * vocab change. This helper requires `completed_phases >= 2 * recentK`
 * (default 6) before declaring convergence.
 */
function isOntologyConverged(
  cwd: string,
  threshold = 0.95,
  recentK = 3
): ConvergenceResult {
  const completed = _listCompletedPhases(cwd);
  if (completed.length < 2 * recentK) {
    return {
      converged: false,
      threshold,
      reason: `Need >= ${2 * recentK} completed phases for non-overlapping ontology windows (have ${completed.length})`,
    };
  }
  const drift = computeOntologyDrift(cwd, recentK, recentK);
  if (!drift.sufficient_data) {
    return { converged: false, threshold, reason: drift.reason ?? 'insufficient drift data' };
  }
  const similarity = 1 - drift.score;
  if (similarity < threshold) {
    return {
      converged: false,
      threshold,
      reason: `similarity ${similarity.toFixed(3)} < ${threshold}`,
    };
  }
  return { converged: true, similarity, threshold };
}

// ─── Aggregator ────────────────────────────────────────────────────────────

/**
 * Compute the weighted drift score. Each component is computed
 * independently; if a component reports sufficient_data: false, its
 * score contributes 0 to the weighted aggregate (so the absence of
 * data is treated as "no drift", not "max drift").
 */
function computeDriftScore(
  cwd: string,
  weights: DriftWeights = DEFAULT_WEIGHTS,
  threshold = 0.3,
  recentK = 3
): DriftScore {
  const goal = computeGoalDrift(cwd, recentK);
  const constraint = computeConstraintDrift(cwd, recentK);
  const ontology = computeOntologyDrift(cwd, recentK);
  const weighted =
    weights.goal * goal.score +
    weights.constraint * constraint.score +
    weights.ontology * ontology.score;
  return {
    weighted,
    threshold,
    exceeded: weighted > threshold,
    weights,
    goal,
    constraint,
    ontology,
  };
}

module.exports = {
  computeGoalDrift,
  computeConstraintDrift,
  computeOntologyDrift,
  computeDriftScore,
  isOntologyConverged,
  DEFAULT_WEIGHTS,
};
