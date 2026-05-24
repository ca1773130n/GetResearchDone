'use strict';

/**
 * GRD Commands/PlanLint — deterministic linter for milestone PLAN.md
 * specs.
 *
 * Detects four categories of drift that the v0.4 codex adversarial-review
 * cycle (rounds r1-r9, commits aa532ea..e8d5361) caught by hand:
 *
 *   1. Stale-text cross-section — same file claims "phases 2-5" in one
 *      section and "phases 2-4" / "Phase 5 is independent" in another.
 *   2. Over-promise / declaration without consumer — a knob/field table
 *      declares N names; fewer than N have string-literal consumers in
 *      any task block.
 *   3. Summary-vs-detail mismatch — ROADMAP phase bullet uses a technical
 *      noun phrase that doesn't appear in the corresponding PLAN.md.
 *   4. Scope creep / undeclared config keys — a PLAN.md references
 *      `config.foo.bar` that doesn't appear in the ROADMAP scope text.
 *
 * Deterministic. No LLM. Heuristic; aims for <20% false-positive rate on
 * known-clean v0.4 specs and >50% recall on the 25 P1 issues from the
 * adversarial review rounds.
 *
 * Output (default JSON, --raw plain text):
 *   {
 *     "milestone": "v0.4",
 *     "files_scanned": 6,
 *     "issues": [{
 *       "category": "stale_text|over_promise|summary_detail|scope_creep",
 *       "file": "phases/01-effort-axis/PLAN.md",
 *       "phase": "1",
 *       "line": 86,
 *       "message": "..."
 *     }, ...]
 *   }
 *
 * Exit codes:
 *   0 — clean (no P1 issues found)
 *   1 — P1 issues present
 *   2 — invocation error (milestone not found, etc.)
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const {
  safeReadMarkdown,
  output,
  error,
}: {
  safeReadMarkdown: (filePath: string) => string | null;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');

// ─── Types ──────────────────────────────────────────────────────────────────

export type LintCategory =
  | 'stale_text'
  | 'over_promise'
  | 'summary_detail'
  | 'scope_creep';

export interface LintIssue {
  category: LintCategory;
  file: string;
  phase: string | null;
  line: number | null;
  message: string;
}

export interface LintReport {
  milestone: string;
  files_scanned: number;
  issues: LintIssue[];
}

export interface PhaseFile {
  phase: string;
  slug: string;
  planPath: string;
  relPath: string;
  content: string | null;
}

interface RangeRef {
  raw: string;
  start: number;
  end: number;
  line: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function resolveMilestoneDir(cwd: string, milestone: string): string | null {
  const candidate = path.join(cwd, '.planning', 'milestones', milestone);
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return candidate;
  }
  return null;
}

export function discoverPhases(milestoneDir: string): PhaseFile[] {
  const phasesDir = path.join(milestoneDir, 'phases');
  if (!fs.existsSync(phasesDir) || !fs.statSync(phasesDir).isDirectory()) {
    return [];
  }
  const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
  const phases: PhaseFile[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const m = ent.name.match(/^(\d+(?:\.\d+)?)-(.+)$/);
    if (!m) continue;
    const planPath = path.join(phasesDir, ent.name, 'PLAN.md');
    const content = safeReadMarkdown(planPath);
    phases.push({
      phase: m[1].replace(/^0+(?=\d)/, ''),
      slug: ent.name,
      planPath,
      relPath: path.posix.join('phases', ent.name, 'PLAN.md'),
      content,
    });
  }
  phases.sort((a, b) => parseFloat(a.phase) - parseFloat(b.phase));
  return phases;
}

export function extractPhaseRanges(content: string): RangeRef[] {
  const ranges: RangeRef[] = [];
  const lines = content.split('\n');
  const RE = /\bphases?\s+(\d+)\s*(?:-|to|through|–|—)\s*(\d+)\b/gi;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    RE.lastIndex = 0;
    while ((m = RE.exec(line)) !== null) {
      const start = parseInt(m[1], 10);
      const end = parseInt(m[2], 10);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        ranges.push({ raw: m[0], start, end, line: i + 1 });
      }
    }
  }
  return ranges;
}

export function extractExclusionAssertions(
  content: string
): { phase: number; line: number; raw: string }[] {
  const out: { phase: number; line: number; raw: string }[] = [];
  const lines = content.split('\n');
  const RE_SINGLE =
    /\bPhase\s+(\d+(?:\.\d+)?)\b[^.\n]*?\b(?:is\s+independent|does\s+NOT|do\s+NOT|deliberately\s+do\s+NOT)\b/gi;
  const RE_LIST =
    /\b(Phase\s+\d+(?:[\s,]+(?:and\s+)?Phase\s+\d+)+)\b[^.\n]*?\b(?:deliberately\s+do\s+NOT|do\s+NOT)\b/gi;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    RE_SINGLE.lastIndex = 0;
    while ((m = RE_SINGLE.exec(line)) !== null) {
      out.push({ phase: parseInt(m[1], 10), line: i + 1, raw: m[0] });
    }
    RE_LIST.lastIndex = 0;
    while ((m = RE_LIST.exec(line)) !== null) {
      const nums = m[1].match(/\d+/g) ?? [];
      for (const n of nums) {
        out.push({ phase: parseInt(n, 10), line: i + 1, raw: m[0] });
      }
    }
  }
  return out;
}

export function lintStaleText(phase: PhaseFile): LintIssue[] {
  if (!phase.content) return [];
  const ranges = extractPhaseRanges(phase.content);
  const exclusions = extractExclusionAssertions(phase.content);
  const issues: LintIssue[] = [];

  const byStart = new Map<number, RangeRef[]>();
  for (const r of ranges) {
    const list = byStart.get(r.start) ?? [];
    list.push(r);
    byStart.set(r.start, list);
  }
  for (const [start, list] of byStart) {
    if (list.length < 2) continue;
    const ends = new Set(list.map((r) => r.end));
    if (ends.size > 1) {
      const desc = list.map((r) => `"${r.raw}" (line ${r.line})`).join(', ');
      issues.push({
        category: 'stale_text',
        file: phase.relPath,
        phase: phase.phase,
        line: list[0].line,
        message: `Incompatible "phases ${start}-N" ranges in same file: ${desc}`,
      });
    }
  }

  if (exclusions.length > 0 && ranges.length > 0) {
    const excludedPhases = new Set(exclusions.map((e) => e.phase));
    for (const r of ranges) {
      for (let p = r.start; p <= r.end; p++) {
        if (excludedPhases.has(p)) {
          const excl = exclusions.find((e) => e.phase === p);
          issues.push({
            category: 'stale_text',
            file: phase.relPath,
            phase: phase.phase,
            line: r.line,
            message:
              `Range "${r.raw}" (line ${r.line}) includes Phase ${p}, ` +
              `but same file asserts Phase ${p} is excluded ` +
              `(line ${excl ? excl.line : '?'}: "${excl ? excl.raw : ''}")`,
          });
        }
      }
    }
  }

  return issues;
}

export function extractDeclaredKnobs(content: string): { name: string; line: number }[] {
  const lines = content.split('\n');
  const out: { name: string; line: number }[] = [];
  let inTable = false;
  let headerIsKnob = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && !inTable) {
      const header = trimmed.toLowerCase();
      headerIsKnob = /\|\s*knob\s*\|/.test(header) || /\|\s*field\s*\|/.test(header);
      inTable = true;
      continue;
    }
    if (inTable && trimmed.startsWith('|')) {
      if (/^\|[-:\s|]+\|$/.test(trimmed)) continue;
      if (!headerIsKnob) continue;
      const cells = trimmed
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length === 0) continue;
      const raw = cells[0];
      const name = raw.replace(/`/g, '').trim();
      if (name && !/^[-:]+$/.test(name)) {
        out.push({ name, line: i + 1 });
      }
    } else if (inTable) {
      inTable = false;
      headerIsKnob = false;
    }
  }
  return out;
}

export function extractTaskBlocks(content: string): string {
  const out: string[] = [];
  const RE = /<task\b[^>]*>([\s\S]*?)<\/task>/gi;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(content)) !== null) {
    out.push(m[1]);
  }
  return out.join('\n');
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function lintOverPromise(phases: PhaseFile[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const allTasksText = phases
    .map((p) => (p.content ? extractTaskBlocks(p.content) : ''))
    .join('\n');
  for (const phase of phases) {
    if (!phase.content) continue;
    const knobs = extractDeclaredKnobs(phase.content);
    if (knobs.length === 0) continue;
    for (const { name, line } of knobs) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]+$/.test(name)) continue;
      const re = new RegExp(`['"\`]${escapeReg(name)}['"\`]`);
      if (!re.test(allTasksText)) {
        issues.push({
          category: 'over_promise',
          file: phase.relPath,
          phase: phase.phase,
          line,
          message:
            `Knob/field "${name}" declared in table (line ${line}) but no <task> block ` +
            `in any phase contains a string literal '${name}' / "${name}" / \`${name}\` consumer.`,
        });
      }
    }
  }
  return issues;
}

// ─── Category 3: summary-vs-detail mismatch ─────────────────────────────────

export function extractRoadmapPhaseBullet(
  roadmap: string,
  phase: string
): { text: string; line: number } | null {
  const lines = roadmap.split('\n');
  const phaseEsc = escapeReg(phase);
  const RE = new RegExp(`^-\\s*\\[[ x]\\]\\s+\\*\\*Phase\\s+${phaseEsc}\\b[:.]`, 'i');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (RE.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  const body: string[] = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^-\s+\[/.test(l) || /^##\s+/.test(l)) break;
    body.push(l);
  }
  return { text: body.join('\n'), line: start + 1 };
}

export function extractTechnicalTerms(text: string): Set<string> {
  const out = new Set<string>();
  const RE_TICK = /`([^`\n]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = RE_TICK.exec(text)) !== null) {
    const inner = m[1].trim();
    if (/^[a-zA-Z0-9_./:-]+$/.test(inner) && inner.length >= 4) {
      out.add(inner);
    }
  }
  const RE_ID = /\b[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+\b/g;
  while ((m = RE_ID.exec(text)) !== null) {
    if (m[0].length >= 5) out.add(m[0]);
  }
  return out;
}

export function lintSummaryDetail(roadmap: string, phases: PhaseFile[]): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const phase of phases) {
    if (!phase.content) continue;
    const bullet = extractRoadmapPhaseBullet(roadmap, phase.phase);
    if (!bullet) continue;
    const roadmapTerms = extractTechnicalTerms(bullet.text);
    if (roadmapTerms.size === 0) continue;
    const planTextLower = phase.content.toLowerCase();
    for (const term of roadmapTerms) {
      if (!planTextLower.includes(term.toLowerCase())) {
        issues.push({
          category: 'summary_detail',
          file: phase.relPath,
          phase: phase.phase,
          line: null,
          message:
            `ROADMAP phase ${phase.phase} bullet mentions "${term}" ` +
            `(ROADMAP.md line ${bullet.line}) but PLAN.md does not contain that term.`,
        });
      }
    }
  }
  return issues;
}

// ─── Category 4: scope creep / undeclared config keys ───────────────────────

export function extractConfigKeys(text: string): Set<string> {
  const out = new Set<string>();
  const RE = /\bconfig\.([a-zA-Z][a-zA-Z0-9_.]*)/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(text)) !== null) {
    const key = m[1].replace(/[.]+$/, '');
    if (key.length > 0) out.add(key);
  }
  return out;
}

function findConfigKeyLine(text: string, key: string): number | null {
  const lines = text.split('\n');
  const needle = `config.${key}`;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return null;
}

export function lintScopeCreep(
  roadmap: string,
  phases: PhaseFile[],
  allowlist: ReadonlySet<string>
): LintIssue[] {
  const issues: LintIssue[] = [];
  const roadmapKeys = extractConfigKeys(roadmap);
  for (const phase of phases) {
    if (!phase.content) continue;
    const planKeys = extractConfigKeys(phase.content);
    for (const key of planKeys) {
      if (roadmapKeys.has(key)) continue;
      if (allowlist.has(key)) continue;
      const segments = key.split('.');
      let prefixCovered = false;
      for (let i = 1; i < segments.length; i++) {
        const prefix = segments.slice(0, i).join('.');
        if (roadmapKeys.has(prefix) || allowlist.has(prefix)) {
          prefixCovered = true;
          break;
        }
      }
      if (prefixCovered) continue;
      const line = findConfigKeyLine(phase.content, key);
      issues.push({
        category: 'scope_creep',
        file: phase.relPath,
        phase: phase.phase,
        line,
        message:
          `PLAN.md references config.${key} (line ${line !== null ? line : '?'}), ` +
          `but ROADMAP scope does not declare this key. Either expand ROADMAP scope or remove from PLAN.`,
      });
    }
  }
  return issues;
}

const DEFAULT_CONFIG_ALLOWLIST: ReadonlySet<string> = new Set([
  'json',
  'effort',
  'model_profile',
  'token_profile',
  'phase_complete_llm_fallback',
  'scheduler',
  'tracker',
  'autopilot',
  'evolve',
  'superpowers',
  'code_review',
]);

// ─── Public entry: runPlanLint ──────────────────────────────────────────────

export interface RunPlanLintOptions {
  configAllowlist?: ReadonlySet<string>;
}

export function runPlanLint(
  cwd: string,
  milestone: string,
  options: RunPlanLintOptions = {}
): LintReport {
  const dir = resolveMilestoneDir(cwd, milestone);
  if (!dir) {
    throw new Error(
      `Milestone not found: .planning/milestones/${milestone}/ does not exist or is not a directory.`
    );
  }
  const roadmapPath = path.join(dir, 'ROADMAP.md');
  const roadmap = safeReadMarkdown(roadmapPath) ?? '';
  const phases = discoverPhases(dir);
  const allowlist = options.configAllowlist ?? DEFAULT_CONFIG_ALLOWLIST;

  const issues: LintIssue[] = [];
  for (const phase of phases) {
    issues.push(...lintStaleText(phase));
  }
  issues.push(...lintOverPromise(phases));
  if (roadmap) {
    issues.push(...lintSummaryDetail(roadmap, phases));
    issues.push(...lintScopeCreep(roadmap, phases, allowlist));
  }

  return {
    milestone,
    files_scanned: phases.length + (roadmap ? 1 : 0),
    issues,
  };
}

function renderSummary(report: LintReport): string {
  if (report.issues.length === 0) {
    return `plan-lint ${report.milestone}: clean (${report.files_scanned} files scanned, 0 issues).`;
  }
  const lines: string[] = [];
  lines.push(
    `plan-lint ${report.milestone}: ${report.issues.length} issue(s) across ${report.files_scanned} files.`
  );
  for (const issue of report.issues) {
    const where = issue.line ? `${issue.file}:${issue.line}` : issue.file;
    lines.push(`  [${issue.category}] ${where} — ${issue.message}`);
  }
  return lines.join('\n');
}

export function cmdPlanLint(cwd: string, milestone: string, raw: boolean): void {
  if (!milestone) {
    error(
      'milestone name required. Usage: gd plan-lint <milestone>\n' +
        'Example: gd plan-lint v0.4'
    );
  }
  let report: LintReport | null = null;
  try {
    report = runPlanLint(cwd, milestone);
  } catch (e: unknown) {
    error((e as Error).message);
  }
  if (report === null) {
    // Unreachable in practice: error() above throws via process.exit. This
    // satisfies the type narrower without runtime cost.
    error('plan-lint: unexpected null report');
    return;
  }
  const summary = renderSummary(report);
  if (report.issues.length > 0) {
    if (raw) {
      process.stdout.write(summary + '\n');
    } else {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    }
    process.exit(1);
  }
  output(report, raw, summary);
}

module.exports = {
  cmdPlanLint,
  runPlanLint,
  resolveMilestoneDir,
  discoverPhases,
  extractPhaseRanges,
  extractExclusionAssertions,
  extractDeclaredKnobs,
  extractTaskBlocks,
  extractRoadmapPhaseBullet,
  extractTechnicalTerms,
  extractConfigKeys,
  lintStaleText,
  lintOverPromise,
  lintSummaryDetail,
  lintScopeCreep,
};
