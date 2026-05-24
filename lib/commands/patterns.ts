'use strict';

/**
 * GRD Commands/Patterns — v0.4 Phase 5 deterministic pattern extractor.
 *
 * Scans VERIFICATION.md `<reflection>` blocks, computes per-token verdict
 * statistics over each plan's PLAN.md vocabulary, and *suggests*
 * statistically significant heuristics for human review. The defensible
 * fraction of the meta-review-agent idea that DEAD-ENDS rules out
 * (`meta-review-agent-with-write-access`): same data source (reflections),
 * same goal (compound learnings into GENOME), but the write path is
 * deterministic statistics + human review, NOT LLM judgment.
 *
 * Statistical floor — a token is "significant" only if ALL hold:
 *   (a) appears in >= min_occurrences plans (default 10)
 *   (b) |confirmed_rate - baseline| >= effect_size (default 0.20)
 *   (c) raw two-sided binomial p < 0.05 against the baseline rate
 *   (d) Benjamini-Hochberg FDR-corrected q < fdr_q (default 0.10)
 *
 * (b)+(d) are the codex r-bkknb6i9g P2 #7 additions: a bare per-token
 * p<0.05 across many tokens invites multiple-comparison noise.
 *
 * Output: suggestions go to .planning/GENOME-SUGGESTIONS.md (a SEPARATE
 * file — codex P1 #5 + DEAD-ENDS slug `auto-suggestions-in-genome-file`).
 * GENOME.md is NEVER written here; promotion is the human-curated
 * `gd genome promote-suggestion <slug>`. --dry-run is the default;
 * --apply requires --yes. No autopilot integration, no LLM round-trip.
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const {
  safeReadMarkdown,
  output,
  error,
}: {
  safeReadMarkdown: (p: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');

const {
  atomicWriteFileSync,
}: { atomicWriteFileSync: (filePath: string, data: string) => void } = require('../autopilot-waves');

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Reflection {
  /** Phase directory the reflection came from (for diagnostics). */
  source: string;
  /** Raw verdict string as found in the reflection YAML. */
  verdict: string;
  /** Binary outcome: true when the verdict confirms the hypothesis. */
  confirmed: boolean;
  /** Token vocabulary of the parent PLAN.md. */
  vocabulary: Set<string>;
}

export interface TokenStat {
  token: string;
  n: number;
  confirmed: number;
  confirmed_rate: number;
  baseline: number;
  effect_size: number;
  raw_p: number;
  fdr_q: number;
  significant: boolean;
}

export interface PatternsOptions {
  minOccurrences?: number;
  effectSize?: number;
  fdrQ?: number;
  apply?: boolean;
  yes?: boolean;
}

export interface PatternsResult {
  reflections_scanned: number;
  baseline_confirmed_rate: number;
  tokens_tested: number;
  suggestions: TokenStat[];
  applied: boolean;
  suggestions_path: string | null;
}

// ─── Tokenisation ───────────────────────────────────────────────────────────

/**
 * Low-information implementation tokens suppressed from pattern mining —
 * they appear in nearly every plan and carry no strategy signal. Combines
 * generic English stopwords with TypeScript/JS implementation keywords.
 */
const STOPWORDS: Set<string> = new Set([
  // generic (mirrors lib/drift.ts + plan-tournament.ts)
  'the', 'and', 'for', 'with', 'from', 'into', 'over', 'this', 'that',
  'are', 'was', 'were', 'has', 'have', 'had', 'will', 'would', 'should',
  'phase', 'plan', 'summary', 'roadmap', 'task', 'goal',
  // implementation keywords (codex P2 #7: suppress low-information tokens)
  'function', 'const', 'let', 'var', 'import', 'export', 'return', 'async',
  'await', 'type', 'interface', 'class', 'module', 'require', 'test', 'tests',
  'unit', 'integration', 'file', 'files', 'code', 'add', 'added', 'update',
  'implement', 'use', 'using', 'new',
]);

function tokenize(text: string): Set<string> {
  const set = new Set<string>();
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g);
  if (!matches) return set;
  for (const t of matches) {
    if (STOPWORDS.has(t)) continue;
    set.add(t);
  }
  return set;
}

// ─── Reflection scanning ──────────────────────────────────────────────────

/**
 * True when a verdict string asserts the hypothesis held. Reflection
 * verdicts are `confirmed | falsified | partial` (and variants). Anything
 * that isn't an affirmative confirmation counts as not-confirmed.
 */
export function isConfirmed(verdict: string): boolean {
  const v = verdict.trim().toLowerCase();
  if (/\b(not|un)[\s-]?confirmed\b/.test(v)) return false;
  return /\b(confirmed|validated|pass(ed)?|holds?|supported|true)\b/.test(v);
}

function extractVerdict(reflectionYaml: string): string | null {
  const m = reflectionYaml.match(/^\s*verdict:\s*["']?([^"'\n]+?)["']?\s*$/m);
  return m ? m[1].trim() : null;
}

/**
 * Scan all VERIFICATION.md files under .planning/milestones (and a bare
 * top-level VERIFICATION.md) for `<reflection>` blocks carrying a verdict.
 * Each reflection's plan vocabulary comes from the sibling PLAN.md.
 *
 * Uses safeReadMarkdown so GRD-INDEX split-format files reassemble (GENOME
 * heuristic). Returns one Reflection per verdict-bearing block found.
 */
export function scanReflections(cwd: string): Reflection[] {
  const reflections: Reflection[] = [];
  const planningDir = path.join(cwd, '.planning');
  const verificationFiles = findVerificationFiles(planningDir);

  for (const vf of verificationFiles) {
    const content = safeReadMarkdown(vf);
    if (!content) continue;
    // Parent-dir PLAN.md vocabulary (prefer resolved PLAN.md, else PLAN-1.md).
    const dir = path.dirname(vf);
    const planContent = readSiblingPlan(dir);
    const vocabulary = planContent ? tokenize(planContent) : new Set<string>();

    for (const block of extractReflectionBlocks(content)) {
      const verdict = extractVerdict(block);
      if (!verdict) continue;
      reflections.push({
        source: path.relative(cwd, vf),
        verdict,
        confirmed: isConfirmed(verdict),
        vocabulary,
      });
    }
  }
  return reflections;
}

function findVerificationFiles(planningDir: string): string[] {
  const out: string[] = [];
  const bare = path.join(planningDir, 'VERIFICATION.md');
  if (fileExists(bare)) out.push(bare);
  const milestonesDir = path.join(planningDir, 'milestones');
  // .planning/milestones/<m>/phases/<p>/VERIFICATION.md (and bare/prefixed forms).
  for (const milestone of listDirs(milestonesDir)) {
    const phasesDir = path.join(milestonesDir, milestone, 'phases');
    for (const phase of listDirs(phasesDir)) {
      const phaseDir = path.join(phasesDir, phase);
      for (const name of listFiles(phaseDir)) {
        if (name === 'VERIFICATION.md' || /-VERIFICATION\.md$/.test(name)) {
          out.push(path.join(phaseDir, name));
        }
      }
    }
  }
  return out;
}

function readSiblingPlan(dir: string): string | null {
  // Prefer the resolved PLAN.md; fall back to the first candidate.
  const direct = path.join(dir, 'PLAN.md');
  if (fileExists(direct)) return safeReadMarkdown(direct);
  for (const name of listFiles(dir)) {
    if (/^PLAN-\d+\.md$/.test(name) || /-PLAN\.md$/.test(name)) {
      return safeReadMarkdown(path.join(dir, name));
    }
  }
  return null;
}

function extractReflectionBlocks(content: string): string[] {
  // <reflection> ... </reflection> blocks; the YAML inside may be fenced.
  const blocks: string[] = [];
  const re = /<reflection>([\s\S]*?)<\/reflection>/g;
  for (const m of content.matchAll(re)) blocks.push(m[1]);
  return blocks;
}

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function listDirs(p: string): string[] {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function listFiles(p: string): string[] {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

// ─── Binomial test + Benjamini-Hochberg FDR ─────────────────────────────────

const _logFactCache: number[] = [0, 0];
function logFactorial(n: number): number {
  for (let i = _logFactCache.length; i <= n; i++) {
    _logFactCache[i] = _logFactCache[i - 1] + Math.log(i);
  }
  return _logFactCache[n];
}

function logChoose(n: number, k: number): number {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function binomPmf(k: number, n: number, p: number): number {
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}

/**
 * Two-sided exact binomial test p-value: the total probability of all
 * outcomes no more likely than the observed count under the null rate p0
 * (method of small p-values). Returns 1 when p0 is degenerate (0 or 1).
 */
export function binomTwoSidedP(k: number, n: number, p0: number): number {
  if (n === 0) return 1;
  if (p0 <= 0 || p0 >= 1) return 1;
  const pObs = binomPmf(k, n, p0);
  let total = 0;
  const tol = pObs * (1 + 1e-7);
  for (let j = 0; j <= n; j++) {
    const pj = binomPmf(j, n, p0);
    if (pj <= tol) total += pj;
  }
  return Math.min(1, total);
}

/**
 * Benjamini-Hochberg FDR adjustment. Given raw p-values, returns the
 * adjusted q-values in the SAME order as the input. Standard step-up:
 * sort ascending, q_i = p_i * m / rank, then enforce monotonicity from
 * the largest rank downward, clamp to [0, 1].
 */
export function benjaminiHochberg(pvalues: number[]): number[] {
  const m = pvalues.length;
  if (m === 0) return [];
  const indexed = pvalues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const q = new Array<number>(m);
  let prev = 1;
  for (let rank = m; rank >= 1; rank--) {
    const { p, i } = indexed[rank - 1];
    const raw = (p * m) / rank;
    prev = Math.min(prev, raw);
    q[i] = Math.min(1, prev);
  }
  return q;
}

// ─── Per-token statistics ─────────────────────────────────────────────────

/**
 * Compute per-token verdict statistics with the full significance floor.
 * Only tokens appearing in >= minOccurrences plans are TESTED (and thus
 * counted in the multiple-comparison correction). A tested token is
 * `significant` iff effect_size >= effectSize AND raw_p < 0.05 AND
 * fdr_q < fdrQ.
 *
 * STATISTICAL CAVEAT (codex review P2): the null rate is the observed global
 * baseline, which INCLUDES the token's own rows. The token and the baseline
 * are therefore not independent, so `raw_p` / `fdr_q` are an *approximate
 * association signal*, NOT exactly calibrated p-values. This is deliberate
 * and acceptable for a suggest-to-a-human heuristic miner — the floor exists
 * to rank and gate noise, not to publish inference. A properly independent
 * test (two-sample / Fisher exact: token-rows vs non-token-rows) is a v0.5
 * follow-up if these suggestions ever feed an automated decision. They do
 * not: every suggestion is human-reviewed before promotion.
 */
export function computeTokenStats(
  reflections: Reflection[],
  opts: { minOccurrences: number; effectSize: number; fdrQ: number }
): { baseline: number; stats: TokenStat[] } {
  const total = reflections.length;
  if (total === 0) return { baseline: 0, stats: [] };

  const confirmedTotal = reflections.filter((r) => r.confirmed).length;
  const baseline = confirmedTotal / total;

  // Tally per token.
  const counts = new Map<string, { n: number; confirmed: number }>();
  for (const r of reflections) {
    for (const tok of r.vocabulary) {
      const c = counts.get(tok) ?? { n: 0, confirmed: 0 };
      c.n += 1;
      if (r.confirmed) c.confirmed += 1;
      counts.set(tok, c);
    }
  }

  // Only tokens meeting the occurrence floor are tested (drives FDR m).
  const tested: Array<{ token: string; n: number; confirmed: number; raw_p: number }> = [];
  for (const [token, c] of counts) {
    if (c.n < opts.minOccurrences) continue;
    const raw_p = binomTwoSidedP(c.confirmed, c.n, baseline);
    tested.push({ token, n: c.n, confirmed: c.confirmed, raw_p });
  }

  const qvals = benjaminiHochberg(tested.map((t) => t.raw_p));

  const stats: TokenStat[] = tested.map((t, idx) => {
    const confirmed_rate = t.confirmed / t.n;
    const effect_size = Math.abs(confirmed_rate - baseline);
    const fdr_q = qvals[idx];
    const significant =
      effect_size >= opts.effectSize && t.raw_p < 0.05 && fdr_q < opts.fdrQ;
    return {
      token: t.token,
      n: t.n,
      confirmed: t.confirmed,
      confirmed_rate,
      baseline,
      effect_size,
      raw_p: t.raw_p,
      fdr_q,
      significant,
    };
  });

  // Deterministic ordering: significant first, then by effect size desc,
  // then token asc for stable output.
  stats.sort((a, b) => {
    if (a.significant !== b.significant) return a.significant ? -1 : 1;
    if (b.effect_size !== a.effect_size) return b.effect_size - a.effect_size;
    return a.token < b.token ? -1 : a.token > b.token ? 1 : 0;
  });
  return { baseline, stats };
}

// ─── Suggestion formatting ──────────────────────────────────────────────────

function formatSuggestionsBlock(suggestions: TokenStat[], baseline: number): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines: string[] = [`## Run ${date}`, ''];
  for (const s of suggestions) {
    const dir = s.confirmed_rate >= baseline ? 'more' : 'less';
    const sign = s.confirmed_rate >= baseline ? '+' : '-';
    lines.push(
      `- Plans containing "${s.token}" have ${(s.confirmed_rate * 100).toFixed(0)}% confirmed ` +
        `(baseline ${(baseline * 100).toFixed(0)}%, n=${s.n}, raw_p=${s.raw_p.toFixed(4)}, ` +
        `fdr_q=${s.fdr_q.toFixed(4)}, effect_size=${sign}${s.effect_size.toFixed(2)}).`
    );
    lines.push(
      `  Suggested heuristic: "Plans involving \`${s.token}\` succeed ${dir} often than baseline."`
    );
    lines.push(`  Promote with: \`gd genome promote-suggestion ${s.token}-rate\``);
    lines.push('');
  }
  return lines.join('\n');
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

export function cmdPatterns(cwd: string, opts: PatternsOptions, raw: boolean): void {
  const minOccurrences = opts.minOccurrences ?? 10;
  const effectSize = opts.effectSize ?? 0.2;
  const fdrQ = opts.fdrQ ?? 0.1;

  const reflections = scanReflections(cwd);
  const { baseline, stats } = computeTokenStats(reflections, {
    minOccurrences,
    effectSize,
    fdrQ,
  });
  const suggestions = stats.filter((s) => s.significant);

  let applied = false;
  let suggestionsPath: string | null = null;

  if (opts.apply) {
    // never-auto-write: --apply requires explicit --yes confirmation.
    if (!opts.yes) {
      error('--apply requires --yes (writes to .planning/GENOME-SUGGESTIONS.md). Refusing.');
    }
    suggestionsPath = path.join(cwd, '.planning', 'GENOME-SUGGESTIONS.md');
    if (suggestions.length > 0) {
      const header = fileExists(suggestionsPath)
        ? safeReadMarkdown(suggestionsPath) ?? ''
        : '# GENOME suggestions (auto-generated — NOT read by the planner)\n\n' +
          'Deterministic pattern-extractor output. Promote an entry into the\n' +
          'prescriptive GENOME.md only via `gd genome promote-suggestion <slug>`\n' +
          '(human-curated). The planner reads GENOME.md ONLY.\n\n';
      const block = formatSuggestionsBlock(suggestions, baseline);
      atomicWriteFileSync(suggestionsPath, `${header}${block}\n`);
      applied = true;
    }
  }

  const result: PatternsResult = {
    reflections_scanned: reflections.length,
    baseline_confirmed_rate: baseline,
    tokens_tested: stats.length,
    suggestions,
    applied,
    suggestions_path: applied ? path.relative(cwd, suggestionsPath as string) : null,
  };

  const rawSummary =
    suggestions.length === 0
      ? `no significant patterns (${reflections.length} reflections, ${stats.length} tokens tested)`
      : `${suggestions.length} suggestion(s) from ${reflections.length} reflections` +
        (applied ? ` → written to ${result.suggestions_path}` : ' (dry-run; --apply --yes to write)') +
        '\n' +
        formatSuggestionsBlock(suggestions, baseline);
  output(result, raw, rawSummary);
}

module.exports = {
  isConfirmed,
  scanReflections,
  binomTwoSidedP,
  benjaminiHochberg,
  computeTokenStats,
  cmdPatterns,
};
