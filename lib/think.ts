'use strict';

/**
 * GRD `think` — one-shot project-state aggregator.
 *
 * Tier-3 #11 of the Ouroboros integration. The proposal flagged
 * razzant's "background consciousness daemon" as speculative and
 * called out two specific concerns:
 *
 *   - Background behavior is surprising for a CLI workflow.
 *   - Conflicts with explicit project-state boundaries.
 *
 * This module addresses both by NOT being a daemon and NOT mutating
 * any file outside a dedicated quarantine directory.
 *
 * What it does:
 *   - Reads existing project artifacts (STATE.md, recent SUMMARY.md
 *     files, DEAD-ENDS.md, GENOME.md, PRODUCT-IDEAS.md) and the drift
 *     score from lib/drift.ts.
 *   - Computes heuristic observations in five sections — no LLM, no
 *     network, deterministic given the same files.
 *   - Writes a single timestamped file under
 *     `.planning/thoughts/{ISO}-thinking.md` — the only file mutated.
 *
 * The output is meant as a briefing for the human or for the next
 * planner agent invocation. Nothing in the codebase auto-consumes it.
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

interface PhaseSummary {
  phase: string;
  dir: string;
  accomplishments?: string;
  reflection?: ReflectionLike;
}

interface ReflectionLike {
  hypothesis: string;
  predicted_outcome: string;
  actual_outcome: string;
  verdict: string;
  evidence: string[];
}

export interface ThinkResult {
  generated_at: string;
  output_path: string;
  snapshot: {
    completed_phases: number;
    drift_weighted: number;
    drift_exceeded: boolean;
    blocker_count: number;
  };
  verdict_counts: Record<string, number>;
  recent_dead_ends: string[];
  open_questions: string[];
  product_idea_collisions: Array<{ idea: string; dead_end_slug: string }>;
}

function _listCompletedPhases(cwd: string): PhaseSummary[] {
  const planning = getPlanningDir(cwd);
  const milestones = path.join(planning, 'milestones');
  if (!fs.existsSync(milestones)) return [];
  const found: PhaseSummary[] = [];
  for (const ms of fs.readdirSync(milestones, { withFileTypes: true })) {
    if (!ms.isDirectory()) continue;
    const phasesDir = path.join(milestones, ms.name, 'phases');
    if (!fs.existsSync(phasesDir)) continue;
    for (const ph of fs.readdirSync(phasesDir, { withFileTypes: true })) {
      if (!ph.isDirectory()) continue;
      const m = ph.name.match(/^(\d+(?:\.\d+)?)/);
      if (!m) continue;
      const phaseDir = path.join(phasesDir, ph.name);
      const files = fs.readdirSync(phaseDir);
      const summaryFile = files.find(
        (f) => /-SUMMARY\.md$/i.test(f) || f === 'SUMMARY.md'
      );
      if (!summaryFile) continue;
      const summaryContent = safeReadFile(path.join(phaseDir, summaryFile)) ?? '';
      const accMatch = summaryContent.match(/##\s+Accomplishments\s*\n([\s\S]*?)(?=\n##\s|$)/i);
      const verificationFile = files.find(
        (f) => /-VERIFICATION\.md$/i.test(f) || f === 'VERIFICATION.md'
      );
      let reflection: ReflectionLike | undefined;
      if (verificationFile) {
        const verContent = safeReadFile(path.join(phaseDir, verificationFile)) ?? '';
        const r = parseReflectionSection(verContent);
        if (r) reflection = r;
      }
      found.push({
        phase: m[1],
        dir: phaseDir,
        accomplishments: accMatch ? accMatch[1].trim() : undefined,
        reflection,
      });
    }
  }
  found.sort((a, b) => {
    const pa = a.phase.split('.').map((p) => parseInt(p, 10));
    const pb = b.phase.split('.').map((p) => parseInt(p, 10));
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const ai = pa[i] ?? 0;
      const bi = pb[i] ?? 0;
      if (ai !== bi) return ai - bi;
    }
    return 0;
  });
  return found;
}

function _countBlockers(stateContent: string | null): number {
  if (!stateContent) return 0;
  const section = stateContent.match(/##\s*Blockers\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (!section) return 0;
  const items = section[1].match(/^-\s+(.+)$/gm) ?? [];
  return items
    .map((s) => s.replace(/^-\s+/, '').trim().toLowerCase())
    .filter((s) => s !== 'none' && s !== 'none.').length;
}

function _verdictCounts(recent: PhaseSummary[]): Record<string, number> {
  const counts: Record<string, number> = {
    confirmed: 0,
    partial: 0,
    falsified: 0,
    unknown: 0,
  };
  for (const p of recent) {
    if (!p.reflection) continue;
    const v = p.reflection.verdict.toLowerCase();
    if (counts[v] !== undefined) counts[v]++;
    else counts[v] = 1;
  }
  return counts;
}

function _recentDeadEnds(cwd: string): string[] {
  const deadEnds = safeReadMarkdown(path.join(getPlanningDir(cwd), 'DEAD-ENDS.md'));
  if (!deadEnds) return [];
  const slugs: string[] = [];
  const re = /^## (\S+)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(deadEnds)) !== null) slugs.push(m[1]);
  return slugs;
}

function _openQuestions(recent: PhaseSummary[]): string[] {
  const out: string[] = [];
  for (const p of recent) {
    if (!p.reflection) continue;
    const v = p.reflection.verdict.toLowerCase();
    if (v === 'partial' || v === 'unknown') {
      out.push(
        `Phase ${p.phase}: ${p.reflection.hypothesis} (verdict: ${p.reflection.verdict})`
      );
    }
  }
  return out;
}

function _productIdeaCollisions(
  cwd: string,
  deadEndSlugs: string[]
): Array<{ idea: string; dead_end_slug: string }> {
  if (deadEndSlugs.length === 0) return [];
  const ideasContent = safeReadMarkdown(path.join(getPlanningDir(cwd), 'PRODUCT-IDEAS.md'));
  if (!ideasContent) return [];
  const ideaLines: string[] = [];
  for (const line of ideasContent.split('\n')) {
    const h = line.match(/^##+\s+(.+)$/);
    const b = line.match(/^[-*]\s+(.+)$/);
    if (h) ideaLines.push(h[1].trim());
    else if (b) ideaLines.push(b[1].trim());
  }
  const out: Array<{ idea: string; dead_end_slug: string }> = [];
  for (const idea of ideaLines) {
    const ideaTokens = new Set(
      idea
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3)
    );
    if (ideaTokens.size === 0) continue;
    for (const slug of deadEndSlugs) {
      const slugTokens = new Set(slug.toLowerCase().split('-').filter((t) => t.length >= 3));
      if (slugTokens.size === 0) continue;
      let matched = 0;
      for (const t of slugTokens) if (ideaTokens.has(t)) matched++;
      if (matched / slugTokens.size > 0.5) {
        out.push({ idea, dead_end_slug: slug });
        break;
      }
    }
  }
  return out;
}

function _renderMarkdown(result: ThinkResult): string {
  const lines: string[] = [];
  lines.push('# Thinking briefing');
  lines.push('');
  lines.push(`_Generated_: ${result.generated_at}`);
  lines.push('');
  lines.push('## Snapshot');
  lines.push('');
  lines.push(`- Completed phases: ${result.snapshot.completed_phases}`);
  lines.push(
    `- Drift (weighted): ${result.snapshot.drift_weighted.toFixed(3)}${result.snapshot.drift_exceeded ? ' ⚠ exceeded threshold' : ''}`
  );
  lines.push(`- Active blockers: ${result.snapshot.blocker_count}`);
  lines.push('');

  lines.push('## Verdict mix (recent reflections)');
  lines.push('');
  lines.push('| Verdict | Count |');
  lines.push('|---------|-------|');
  for (const [v, c] of Object.entries(result.verdict_counts)) {
    lines.push(`| ${v} | ${c} |`);
  }
  lines.push('');

  lines.push('## Dead-ends in the registry');
  lines.push('');
  if (result.recent_dead_ends.length === 0) {
    lines.push('_None registered._');
  } else {
    for (const slug of result.recent_dead_ends) lines.push(`- \`${slug}\``);
  }
  lines.push('');

  lines.push('## Open questions');
  lines.push('');
  if (result.open_questions.length === 0) {
    lines.push('_None — no partial or unknown verdicts in recent reflections._');
  } else {
    for (const q of result.open_questions) lines.push(`- ${q}`);
  }
  lines.push('');

  lines.push('## Product-idea ↔ dead-end collisions');
  lines.push('');
  if (result.product_idea_collisions.length === 0) {
    lines.push('_None — no PRODUCT-IDEAS.md entries overlap registered dead-end slugs._');
  } else {
    lines.push('| Idea | Overlapping dead-end |');
    lines.push('|------|----------------------|');
    for (const c of result.product_idea_collisions) {
      lines.push(`| ${c.idea} | \`${c.dead_end_slug}\` |`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push(
    '_This briefing is a deterministic projection of project state. No LLM ran. The next planner / human is expected to read and decide._'
  );
  return lines.join('\n');
}

function runThink(cwd: string, opts: { limit?: number } = {}): ThinkResult {
  const limit = opts.limit ?? 5;
  const planning = getPlanningDir(cwd);
  const completed = _listCompletedPhases(cwd);
  const recent = completed.slice(-limit);

  const stateContent = safeReadFile(path.join(planning, 'STATE.md'));
  const blocker_count = _countBlockers(stateContent);

  const drift = computeDriftScore(cwd, DRIFT_WEIGHTS, 0.3);

  const verdict_counts = _verdictCounts(recent);
  const recent_dead_ends = _recentDeadEnds(cwd);
  const open_questions = _openQuestions(recent);
  const product_idea_collisions = _productIdeaCollisions(cwd, recent_dead_ends);

  const generated_at = new Date().toISOString();
  const isoSafe = generated_at.replace(/[:.]/g, '-');

  const thoughtsDir = path.join(planning, 'thoughts');
  fs.mkdirSync(thoughtsDir, { recursive: true });
  const outPath = path.join(thoughtsDir, `${isoSafe}-thinking.md`);

  const result: ThinkResult = {
    generated_at,
    output_path: outPath,
    snapshot: {
      completed_phases: completed.length,
      drift_weighted: drift.weighted,
      drift_exceeded: drift.exceeded,
      blocker_count,
    },
    verdict_counts,
    recent_dead_ends,
    open_questions,
    product_idea_collisions,
  };
  fs.writeFileSync(outPath, _renderMarkdown(result), 'utf-8');
  return result;
}

function cmdThink(cwd: string, opts: { limit?: number }, raw: boolean): void {
  const limit = opts.limit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    error('--limit must be a positive integer');
  }
  const result = runThink(cwd, opts);
  output(
    result,
    raw,
    `wrote ${path.relative(cwd, result.output_path)} (${result.snapshot.completed_phases} completed phases, ${result.open_questions.length} open questions, ${result.product_idea_collisions.length} collisions)`
  );
}

module.exports = {
  runThink,
  cmdThink,
};
