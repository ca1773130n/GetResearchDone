'use strict';

/** GRD Commands/Analysis -- Project analysis: risk assessment, citation tracking,
 *  eval regression, time budget, config diff, readiness, health score,
 *  decision timeline, knowledge import, todo duplicates */


const fs = require('fs');
const path = require('path');
const {
  safeReadFile,
  safeReadJSON,
  output,
  error,
}: {
  safeReadFile: (p: string) => string | null;
  safeReadJSON: (p: string, def: unknown) => unknown;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');
const {
  planningDir: getPlanningDir,
  phasesDir: getPhasesDirPath,
  researchDir: getResearchDir,
  todosDir: getTodosDir,
  currentMilestone,
}: {
  planningDir: (cwd: string) => string;
  phasesDir: (cwd: string, milestone?: string | null) => string;
  researchDir: (cwd: string, milestone?: string | null) => string;
  todosDir: (cwd: string, milestone?: string | null) => string;
  currentMilestone: (cwd: string) => string;
} = require('../paths');

// ─── Domain Types ─────────────────────────────────────────────────────────────

interface RiskSignal {
  category: string;
  signal: string;
  severity: 'low' | 'medium' | 'high';
  remediation: string;
}

interface RiskAssessmentResult {
  phase: string;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  signals: RiskSignal[];
  plan_count: number;
  plans_analyzed: string[];
}

interface CitationBacklink {
  paper_id: string;
  paper_title: string;
  references: Array<{ file: string; line: number; context: string }>;
  reference_count: number;
}

interface EvalMetric {
  name: string;
  value: number;
  baseline: number | null;
  regression: boolean;
  delta: number | null;
}

interface EvalRegressionResult {
  phase: string;
  threshold_pct: number;
  regressions: EvalMetric[];
  improvements: EvalMetric[];
  stable: EvalMetric[];
  has_regressions: boolean;
}

interface PhaseTimeBudgetEntry {
  phase: string;
  name: string;
  estimated_days: number;
  actual_min: number | null;
  estimated_min: number;
  variance_pct: number | null;
  over_budget: boolean;
}

interface ConfigChangeEntry {
  key: string;
  old_value: unknown;
  new_value: unknown;
  explanation: string;
}

interface ReadinessCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface PhaseReadinessResult {
  phase: string;
  ready: boolean;
  score: number;
  checks: ReadinessCheck[];
  blockers: string[];
}

interface MilestoneHealthResult {
  milestone: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  components: {
    completion_rate: number;
    blocker_penalty: number;
    eval_hit_rate: number;
    estimate_accuracy: number;
  };
  summary: string;
}

interface DecisionEntry {
  phase: string | null;
  date: string | null;
  summary: string;
  rationale: string;
  source: string;
}

interface ImportResult {
  source: string;
  type: string;
  destination: string;
  imported: boolean;
  conflict: boolean;
  message: string;
}

interface TodoDuplicatePair {
  a: string;
  b: string;
  similarity: number;
  a_title: string;
  b_title: string;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/** Recursively collect all .md files under a directory. */
function _collectMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries: { isDirectory: () => boolean; isFile: () => boolean; name: string }[] =
      fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(..._collectMarkdownFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  } catch {
    /* Directory doesn't exist */
  }
  return results;
}

/** Find all phase directories for the current milestone. */
function _listPhaseDirs(cwd: string): string[] {
  const phasesPath = getPhasesDirPath(cwd);
  try {
    return fs
      .readdirSync(phasesPath, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => path.join(phasesPath, e.name));
  } catch {
    return [];
  }
}

/**
 * Collect all PLAN.md files in a specific phase directory. Codex r7 P2:
 * include bare `PLAN.md` alongside the prefixed `*-PLAN.md` form so
 * single-plan phases are not silently skipped by callers like
 * `gd estimate-phase`.
 */
function _collectPlanFiles(phasePath: string): string[] {
  try {
    return fs
      .readdirSync(phasePath)
      .filter((f: string) => f === 'PLAN.md' || f.endsWith('-PLAN.md'))
      .map((f: string) => path.join(phasePath, f));
  } catch {
    return [];
  }
}

/** Find a phase directory by phase number prefix (e.g., "01" or "1"). */
function _findPhaseDirByNumber(cwd: string, phaseNum: string): string | null {
  const phasesPath = getPhasesDirPath(cwd);
  const normalized = phaseNum.padStart(2, '0');
  try {
    const entries: { isDirectory: () => boolean; name: string }[] = fs.readdirSync(phasesPath, {
      withFileTypes: true,
    });
    const match = entries.find(
      (e) =>
        e.isDirectory() &&
        (e.name.startsWith(normalized + '-') || e.name.startsWith(phaseNum + '-'))
    );
    return match ? path.join(phasesPath, match.name) : null;
  } catch {
    return null;
  }
}

/** Compute Jaccard similarity between two sets of words. */
function _jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
  );
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2)
  );
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Extract the first non-blank line as a title from file content. */
function _extractTodoTitle(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.replace(/^#+\s*/, '').trim();
    if (trimmed && !trimmed.startsWith('---')) return trimmed.slice(0, 80);
  }
  return '(untitled)';
}

/** Parse numeric metrics from EVAL.md or SUMMARY.md content using matchAll. */
function _parseMetricsFromContent(content: string): Record<string, number> {
  const metrics: Record<string, number> = {};
  const metricPattern =
    /\b([A-Za-z][A-Za-z0-9_\-/ ]{0,30}):\s*([\d]+(?:\.[\d]+)?)\s*(?:%|dB|ms|s|min)?\b/g;
  for (const m of content.matchAll(metricPattern)) {
    const key = m[1].trim().toLowerCase().replace(/\s+/g, '_');
    const val = parseFloat(m[2]);
    if (!isNaN(val) && key.length > 1) {
      metrics[key] = val;
    }
  }
  return metrics;
}

/** Explain what a config key change means for agent behavior. */
function _explainConfigChange(key: string, oldVal: unknown, newVal: unknown): string {
  const explanations: Record<string, string> = {
    autonomous_mode: 'Controls YOLO mode — disables all gates when enabled',
    'ceremony.default_level': 'Controls which agents run (light/standard/full)',
    research_gates: 'Human review points for research decisions',
    'code_review.enabled': 'Toggles automatic code review after execution',
    'execution.agent_teams': 'Enables parallel agent team execution',
    'git.enabled': 'Enables isolated git worktree per phase',
    'tracker.provider': 'Sets issue tracker integration (github/mcp-atlassian/none)',
  };
  const keyLower = key.toLowerCase();
  for (const [pattern, explanation] of Object.entries(explanations)) {
    if (keyLower.includes(pattern.toLowerCase())) {
      return `${explanation} (changed from ${JSON.stringify(oldVal)} to ${JSON.stringify(newVal)})`;
    }
  }
  return `Changed from ${JSON.stringify(oldVal)} to ${JSON.stringify(newVal)}`;
}

/** Flatten a nested object into dot-separated keys. */
function _flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, _flattenObject(v as Record<string, unknown>, key));
    } else {
      result[key] = v;
    }
  }
  return result;
}

// ─── CLI: Phase Risk Assessment ───────────────────────────────────────────────

/**
 * CLI command: Analyze PLAN.md files in a phase for risk signals.
 * Assigns a risk score (0-10) and returns actionable remediation suggestions.
 * @param cwd - Project root
 * @param phase - Phase number string (e.g. "1" or "01")
 * @param raw - Raw output flag
 */
function cmdPhaseRiskAssessment(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('Phase number required');
    return;
  }

  const phaseDir = _findPhaseDirByNumber(cwd, phase);
  if (!phaseDir) {
    output(
      {
        error: `Phase ${phase} directory not found`,
        phase,
        signals: [],
        risk_score: 0,
        risk_level: 'low',
        plan_count: 0,
        plans_analyzed: [],
      },
      raw
    );
    return;
  }

  const planFiles = _collectPlanFiles(phaseDir);
  const signals: RiskSignal[] = [];
  const plansAnalyzed: string[] = [];

  for (const planFile of planFiles) {
    const content = safeReadFile(planFile);
    if (!content) continue;
    const filename = path.basename(planFile);
    plansAnalyzed.push(filename);
    const lower = content.toLowerCase();

    // Risk: vague success criteria (no numbers in success section)
    const successSection = content.match(
      /##\s+(?:success|acceptance|criteria|must[_\s]haves?)[^\n]*\n([\s\S]*?)(?=\n##|$)/i
    );
    if (successSection) {
      const hasNumbers = /\d+(?:\.\d+)?/.test(successSection[1]);
      const hasSpecificTerms = /must|shall|exactly|at least|no more than|< |> |>=|<=/i.test(
        successSection[1]
      );
      if (!hasNumbers && !hasSpecificTerms) {
        signals.push({
          category: 'success_criteria',
          signal: `${filename}: Success criteria lack quantitative targets`,
          severity: 'high',
          remediation:
            'Add specific numeric thresholds (e.g., "accuracy >= 85%", "latency < 200ms")',
        });
      }
    } else {
      signals.push({
        category: 'success_criteria',
        signal: `${filename}: No success criteria section found`,
        severity: 'high',
        remediation: 'Add a ## Success Criteria or ## Must Haves section with measurable outcomes',
      });
    }

    // Risk: missing baseline reference
    if (
      !lower.includes('baseline') &&
      !lower.includes('comparison') &&
      !lower.includes('benchmark')
    ) {
      signals.push({
        category: 'baseline',
        signal: `${filename}: No baseline or comparison reference`,
        severity: 'medium',
        remediation:
          'Reference a baseline metric so evaluation can measure improvement (see BASELINE.md)',
      });
    }

    // Risk: overly large scope
    const taskCount = (content.match(/^[-*]\s+\[/gm) || []).length;
    if (taskCount > 20) {
      signals.push({
        category: 'scope',
        signal: `${filename}: ${taskCount} checklist items — may be too large for one plan`,
        severity: 'medium',
        remediation: 'Consider splitting into multiple plans or waves; aim for <15 tasks per plan',
      });
    }

    // Risk: no fallback strategy
    if (
      !lower.includes('fallback') &&
      !lower.includes('alternative') &&
      !lower.includes('if this fails') &&
      !lower.includes('rollback')
    ) {
      signals.push({
        category: 'fallback',
        signal: `${filename}: No fallback or rollback strategy mentioned`,
        severity: 'low',
        remediation:
          'Add a fallback plan for if the primary approach fails (e.g., simpler model, cached results)',
      });
    }

    // Risk: unclear dependencies
    if (
      !lower.includes('depend') &&
      !lower.includes('requires') &&
      !lower.includes('prerequisite') &&
      !lower.includes('phase')
    ) {
      signals.push({
        category: 'dependencies',
        signal: `${filename}: No explicit dependencies stated`,
        severity: 'low',
        remediation:
          'List phase/plan prerequisites explicitly so blockers are visible before execution starts',
      });
    }
  }

  if (planFiles.length === 0) {
    signals.push({
      category: 'plans',
      signal: 'No PLAN.md files found in phase directory',
      severity: 'high',
      remediation: 'Run /grd:plan-phase to generate execution plans before risk assessment',
    });
  }

  // Score: 0=none, 10=critical. High=3pts, medium=2pts, low=1pt
  let rawScore = 0;
  for (const s of signals) {
    if (s.severity === 'high') rawScore += 3;
    else if (s.severity === 'medium') rawScore += 2;
    else rawScore += 1;
  }
  const risk_score = Math.min(10, rawScore);
  const risk_level: RiskAssessmentResult['risk_level'] =
    risk_score >= 8 ? 'critical' : risk_score >= 5 ? 'high' : risk_score >= 3 ? 'medium' : 'low';

  const result: RiskAssessmentResult = {
    phase,
    risk_score,
    risk_level,
    signals,
    plan_count: planFiles.length,
    plans_analyzed: plansAnalyzed,
  };

  output(
    result,
    raw,
    `Phase ${phase} risk: ${risk_level} (score=${risk_score}, signals=${signals.length})`
  );
}

// ─── CLI: Citation Backlink Tracker ──────────────────────────────────────────

/**
 * CLI command: Build a reverse index of which planning files reference each paper
 * from PAPERS.md. Shows which papers drove real implementation decisions.
 * @param cwd - Project root
 * @param raw - Raw output flag
 */
function cmdCitationBacklinks(cwd: string, raw: boolean): void {
  const researchPath = getResearchDir(cwd);
  const papersPath = path.join(researchPath, 'PAPERS.md');
  const papersContent = safeReadFile(papersPath);
  const milestone = currentMilestone(cwd);

  if (!papersContent) {
    output({ error: 'PAPERS.md not found', path: papersPath, backlinks: [] }, raw);
    return;
  }

  // Extract paper headings from PAPERS.md
  const papers: Array<{ id: string; title: string }> = [];
  for (const m of papersContent.matchAll(/^##\s+(.+)$/gm)) {
    const title = m[1].trim();
    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    if (id) papers.push({ id, title });
  }
  // Also match slug-style entries: **[slug]**
  for (const m of papersContent.matchAll(/\*\*\[([a-z0-9-]+)\]\*\*/g)) {
    const id = m[1].trim();
    if (!papers.find((p) => p.id === id)) papers.push({ id, title: id });
  }

  if (papers.length === 0) {
    output(
      { milestone, papers_found: 0, backlinks: [], note: 'No paper headings found in PAPERS.md' },
      raw
    );
    return;
  }

  // Scan all .planning/ markdown files for references
  const planningPath = getPlanningDir(cwd);
  const allMdFiles = _collectMarkdownFiles(planningPath);
  const backlinks: CitationBacklink[] = [];

  for (const paper of papers) {
    const refs: CitationBacklink['references'] = [];
    const searchTerms = [paper.id, ...paper.title.split(/\s+/).filter((w) => w.length > 4)];

    for (const mdFile of allMdFiles) {
      if (mdFile === papersPath) continue;
      const content = safeReadFile(mdFile);
      if (!content) continue;
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const lineLower = lines[i].toLowerCase();
        const matched = searchTerms.some((term) => lineLower.includes(term.toLowerCase()));
        if (matched) {
          refs.push({
            file: path.relative(planningPath, mdFile),
            line: i + 1,
            context: lines[i].trim().slice(0, 120),
          });
          break; // one reference per file
        }
      }
    }

    backlinks.push({
      paper_id: paper.id,
      paper_title: paper.title,
      references: refs,
      reference_count: refs.length,
    });
  }

  backlinks.sort((a, b) => b.reference_count - a.reference_count);
  const unreferenced = backlinks.filter((b) => b.reference_count === 0);

  output(
    {
      milestone,
      papers_indexed: papers.length,
      total_references: backlinks.reduce((s, b) => s + b.reference_count, 0),
      unreferenced_count: unreferenced.length,
      backlinks,
    },
    raw
  );
}

// ─── CLI: Eval Regression Check ───────────────────────────────────────────────

/**
 * CLI command: Compare eval metrics from a phase's EVAL.md against BASELINE.md,
 * emitting warnings if metrics regressed beyond the threshold.
 * @param cwd - Project root
 * @param phase - Phase number string
 * @param raw - Raw output flag
 * @param thresholdPct - Regression threshold percentage (default 5%)
 */
function cmdEvalRegressionCheck(cwd: string, phase: string, raw: boolean, thresholdPct = 5): void {
  if (!phase) {
    error('Phase number required');
    return;
  }

  const phaseDir = _findPhaseDirByNumber(cwd, phase);
  if (!phaseDir) {
    output(
      { error: `Phase ${phase} not found`, phase, has_regressions: false, regressions: [] },
      raw
    );
    return;
  }

  let evalFiles: string[] = [];
  try {
    evalFiles = fs.readdirSync(phaseDir).filter((f: string) => f.endsWith('-EVAL.md'));
  } catch {
    /* ignore */
  }

  if (evalFiles.length === 0) {
    output(
      {
        phase,
        note: 'No EVAL.md found in phase directory',
        has_regressions: false,
        regressions: [],
      },
      raw
    );
    return;
  }

  const evalContent = safeReadFile(path.join(phaseDir, evalFiles[0]));
  if (!evalContent) {
    output({ phase, note: 'Could not read EVAL.md', has_regressions: false, regressions: [] }, raw);
    return;
  }

  const baselinePath = path.join(getPlanningDir(cwd), 'BASELINE.md');
  const baselineContent = safeReadFile(baselinePath);

  const evalMetrics = _parseMetricsFromContent(evalContent);
  const baselineMetrics = baselineContent ? _parseMetricsFromContent(baselineContent) : {};

  const regressions: EvalMetric[] = [];
  const improvements: EvalMetric[] = [];
  const stable: EvalMetric[] = [];

  for (const [name, value] of Object.entries(evalMetrics)) {
    const baseline = baselineMetrics[name] ?? null;
    if (baseline === null) {
      stable.push({ name, value, baseline: null, regression: false, delta: null });
      continue;
    }
    const delta = value - baseline;
    const deltaPct = baseline !== 0 ? Math.abs(delta / baseline) * 100 : 0;
    const regressed = delta < 0 && deltaPct > thresholdPct;
    const improved = delta > 0 && deltaPct > thresholdPct;

    const entry: EvalMetric = {
      name,
      value,
      baseline,
      regression: regressed,
      delta: parseFloat(delta.toFixed(4)),
    };
    if (regressed) regressions.push(entry);
    else if (improved) improvements.push(entry);
    else stable.push(entry);
  }

  const result: EvalRegressionResult = {
    phase,
    threshold_pct: thresholdPct,
    regressions,
    improvements,
    stable,
    has_regressions: regressions.length > 0,
  };

  output(
    result,
    raw,
    regressions.length > 0
      ? `WARNING: ${regressions.length} metric(s) regressed in phase ${phase}`
      : `Phase ${phase}: No eval regressions detected`
  );
}

// ─── CLI: Phase Time Budget Tracking ─────────────────────────────────────────

/**
 * CLI command: Compare estimated durations (from ROADMAP.md Duration fields)
 * against actual execution time (from STATE.md metric records) for all phases.
 * @param cwd - Project root
 * @param raw - Raw output flag
 */
function cmdPhaseTimeBudget(cwd: string, raw: boolean): void {
  const roadmapPath = path.join(getPlanningDir(cwd), 'ROADMAP.md');
  const statePath = path.join(getPlanningDir(cwd), 'STATE.md');
  const roadmapContent = safeReadFile(roadmapPath);
  const stateContent = safeReadFile(statePath);

  if (!roadmapContent) {
    output({ error: 'ROADMAP.md not found', phases: [] }, raw);
    return;
  }

  // Scan roadmap lines for phase + duration pairs
  const phases: PhaseTimeBudgetEntry[] = [];
  const roadmapLines = roadmapContent.split('\n');
  let currentPhase: string | null = null;
  let currentName: string | null = null;

  for (const line of roadmapLines) {
    const phaseMatch = line.match(/^[-*]\s+(?:Phase\s+)?(\d+(?:\.\d+)?)[:\s]+(.+)/i);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
      currentName = phaseMatch[2].replace(/\s*\(.*\)$/, '').trim();
    }

    const durMatch = line.match(/\*\*Duration:\*\*\s*(\d+(?:\.\d+)?)\s*d(?:ay)?s?\b/i);
    if (durMatch && currentPhase) {
      const estimatedDays = parseFloat(durMatch[1]);
      const estimatedMin = estimatedDays * 8 * 60; // 8h/day

      phases.push({
        phase: currentPhase,
        name: currentName || currentPhase,
        estimated_days: estimatedDays,
        actual_min: null,
        estimated_min: estimatedMin,
        variance_pct: null,
        over_budget: false,
      });
      currentPhase = null;
      currentName = null;
    }
  }

  // Parse actual durations from STATE.md
  if (stateContent) {
    const actualByPhase: Record<string, number> = {};
    for (const m of stateContent.matchAll(/Phase\s+(\d+(?:\.\d+)?)[^:]*:\s*.*?(\d+)\s*min/gi)) {
      const phaseNum = m[1];
      const mins = parseInt(m[2], 10);
      if (!isNaN(mins)) {
        actualByPhase[phaseNum] = (actualByPhase[phaseNum] || 0) + mins;
      }
    }

    for (const entry of phases) {
      const actual = actualByPhase[entry.phase] ?? null;
      if (actual !== null) {
        entry.actual_min = actual;
        entry.variance_pct =
          entry.estimated_min > 0
            ? parseFloat((((actual - entry.estimated_min) / entry.estimated_min) * 100).toFixed(1))
            : null;
        entry.over_budget = entry.variance_pct !== null && entry.variance_pct > 20;
      }
    }
  }

  const over = phases.filter((p) => p.over_budget);
  const tracked = phases.filter((p) => p.actual_min !== null);

  output(
    {
      total_phases: phases.length,
      tracked_phases: tracked.length,
      over_budget_count: over.length,
      avg_variance_pct:
        tracked.length > 0
          ? parseFloat(
              (tracked.reduce((s, p) => s + (p.variance_pct ?? 0), 0) / tracked.length).toFixed(1)
            )
          : null,
      phases,
    },
    raw
  );
}

// ─── CLI: Config Change Diff Viewer ──────────────────────────────────────────

/**
 * CLI command: Diff current config.json against a stored snapshot.
 * On first run (or with --reset), saves a snapshot. Subsequent runs show
 * what changed and explain the impact on agent behavior.
 * @param cwd - Project root
 * @param raw - Raw output flag
 * @param reset - If true, overwrite snapshot with current config
 */
function cmdConfigDiff(cwd: string, raw: boolean, reset = false, dryRun = false): void {
  const configPath = path.join(getPlanningDir(cwd), 'config.json');
  const snapshotPath = path.join(getPlanningDir(cwd), '.config-snapshot.json');

  const currentConfig = safeReadJSON(configPath, null) as Record<string, unknown> | null;
  if (!currentConfig) {
    output({ error: 'config.json not found', path: configPath }, raw);
    return;
  }

  if (dryRun) {
    const snapshot = fs.existsSync(snapshotPath)
      ? (safeReadJSON(snapshotPath, null) as Record<string, unknown> | null)
      : null;
    if (!snapshot) {
      output({ dry_run: true, action: 'would_create_snapshot', path: snapshotPath, note: 'No snapshot exists yet; --dry-run shows current config only' }, raw, 'DRY RUN: would save config snapshot');
      return;
    }
    const flatCurrent = _flattenObject(currentConfig);
    const flatSnapshot = _flattenObject(snapshot);
    const changes: ConfigChangeEntry[] = [];
    const allKeys = new Set([...Object.keys(flatCurrent), ...Object.keys(flatSnapshot)]);
    for (const key of allKeys) {
      const cur = flatCurrent[key];
      const snap = flatSnapshot[key];
      if (JSON.stringify(cur) !== JSON.stringify(snap)) {
        changes.push({ key, old_value: snap ?? undefined, new_value: cur ?? undefined, explanation: _explainConfigChange(key, snap, cur) });
      }
    }
    output({ dry_run: true, changes_count: changes.length, has_changes: changes.length > 0, changes, note: 'No files written (--dry-run)' }, raw, `DRY RUN: ${changes.length} change(s) detected — no snapshot updated`);
    return;
  }

  if (reset || !fs.existsSync(snapshotPath)) {
    fs.writeFileSync(snapshotPath, JSON.stringify(currentConfig, null, 2));
    output(
      {
        action: 'snapshot_saved',
        message: 'Config snapshot saved. Run again to see diffs.',
        path: snapshotPath,
      },
      raw
    );
    return;
  }

  const snapshot = safeReadJSON(snapshotPath, null) as Record<string, unknown> | null;
  if (!snapshot) {
    fs.writeFileSync(snapshotPath, JSON.stringify(currentConfig, null, 2));
    output(
      {
        action: 'snapshot_saved',
        message: 'Config snapshot saved (previous was unreadable).',
        path: snapshotPath,
      },
      raw
    );
    return;
  }

  const flatCurrent = _flattenObject(currentConfig);
  const flatSnapshot = _flattenObject(snapshot);

  const changes: ConfigChangeEntry[] = [];
  const allKeys = new Set([...Object.keys(flatCurrent), ...Object.keys(flatSnapshot)]);

  for (const key of allKeys) {
    const cur = flatCurrent[key];
    const snap = flatSnapshot[key];
    if (JSON.stringify(cur) !== JSON.stringify(snap)) {
      changes.push({
        key,
        old_value: snap ?? undefined,
        new_value: cur ?? undefined,
        explanation: _explainConfigChange(key, snap, cur),
      });
    }
  }

  output(
    {
      changes_count: changes.length,
      has_changes: changes.length > 0,
      changes,
      snapshot_path: snapshotPath,
    },
    raw,
    changes.length > 0
      ? `${changes.length} config change(s) detected since last snapshot`
      : 'No config changes since last snapshot'
  );
}

// ─── CLI: Phase Kickoff Readiness Checklist ───────────────────────────────────

/**
 * CLI command: Run a pre-flight readiness checklist before executing a phase.
 * Verifies baseline, dependencies, eval plan, and research questions are addressed.
 * @param cwd - Project root
 * @param phase - Phase number string
 * @param raw - Raw output flag
 */
function cmdPhaseReadiness(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('Phase number required');
    return;
  }

  const phaseDir = _findPhaseDirByNumber(cwd, phase);
  const checks: ReadinessCheck[] = [];
  const blockers: string[] = [];

  // Check 1: Phase directory exists
  checks.push({
    name: 'Phase directory exists',
    passed: phaseDir !== null,
    detail: phaseDir ?? `No directory found for phase ${phase} in ${getPhasesDirPath(cwd)}`,
  });
  if (!phaseDir) blockers.push('Phase directory not found — run /grd:plan-phase first');

  // Check 2: PLAN.md files exist
  const planFiles = phaseDir ? _collectPlanFiles(phaseDir) : [];
  checks.push({
    name: 'Execution plans exist',
    passed: planFiles.length > 0,
    detail: planFiles.length > 0 ? `${planFiles.length} plan file(s) found` : 'No PLAN.md files',
  });
  if (planFiles.length === 0) blockers.push('No PLAN.md files — run /grd:plan-phase');

  // Check 3: BASELINE.md exists
  const baselinePath = path.join(getPlanningDir(cwd), 'BASELINE.md');
  const baselineExists = fs.existsSync(baselinePath);
  checks.push({
    name: 'Baseline metrics captured',
    passed: baselineExists,
    detail: baselineExists
      ? 'BASELINE.md exists'
      : 'BASELINE.md missing — run /grd:assess-baseline',
  });
  if (!baselineExists)
    blockers.push('No baseline metrics — run /grd:assess-baseline before executing');

  // Check 4: EVAL plan exists for this phase
  let evalFile: string | undefined;
  if (phaseDir) {
    try {
      evalFile = fs.readdirSync(phaseDir).find((f: string) => f.endsWith('-EVAL.md'));
    } catch {
      /* ignore */
    }
  }
  checks.push({
    name: 'Eval plan written',
    passed: !!evalFile,
    detail: evalFile ? `${evalFile} found` : 'No EVAL.md in phase directory',
  });

  // Check 5: No active blockers in STATE.md
  const statePath = path.join(getPlanningDir(cwd), 'STATE.md');
  const stateContent = safeReadFile(statePath) || '';
  const blockerSection = stateContent.match(/##\s+Blockers?\s*\n([\s\S]*?)(?=\n##|$)/i);
  const activeBlockers = blockerSection
    ? blockerSection[1]
        .split('\n')
        .filter(
          (l: string) => l.trim().startsWith('-') && !l.includes('[x]') && l.trim().length > 2
        )
    : [];
  checks.push({
    name: 'No active blockers in STATE.md',
    passed: activeBlockers.length === 0,
    detail:
      activeBlockers.length > 0
        ? `${activeBlockers.length} blocker(s): ${activeBlockers[0]?.trim().slice(0, 60)}`
        : 'No active blockers',
  });
  if (activeBlockers.length > 0)
    blockers.push(`${activeBlockers.length} active blocker(s) in STATE.md`);

  // Check 6: Prior phase is complete (if phase > 1)
  const phaseNum = parseFloat(phase);
  if (phaseNum > 1) {
    const priorPhaseNum = Math.floor(phaseNum - 1);
    const priorDir = _findPhaseDirByNumber(cwd, String(priorPhaseNum));
    if (priorDir) {
      const priorPlans = _collectPlanFiles(priorDir);
      const priorSummaries = priorPlans.filter((p) =>
        fs.existsSync(p.replace('-PLAN.md', '-SUMMARY.md'))
      );
      const priorComplete = priorPlans.length === 0 || priorSummaries.length >= priorPlans.length;
      checks.push({
        name: `Prior phase (${priorPhaseNum}) complete`,
        passed: priorComplete,
        detail: priorComplete
          ? `Phase ${priorPhaseNum} has ${priorSummaries.length}/${priorPlans.length} summaries`
          : `Phase ${priorPhaseNum} missing ${priorPlans.length - priorSummaries.length} summary file(s)`,
      });
      if (!priorComplete) blockers.push(`Phase ${priorPhaseNum} not fully complete`);
    }
  }

  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const score = Math.round((passed / total) * 100);
  const ready = blockers.length === 0;

  const result: PhaseReadinessResult = { phase, ready, score, checks, blockers };
  output(
    result,
    raw,
    ready
      ? `Phase ${phase} is READY to execute (${score}% checks passed)`
      : `Phase ${phase} NOT ready: ${blockers.length} blocker(s) (${score}% passed)`
  );
}

// ─── CLI: Milestone Health Score ─────────────────────────────────────────────

/**
 * CLI command: Compute a composite health score (0-100) for the current milestone
 * from phase completion rate, blockers, eval hit rate, and estimate accuracy.
 * @param cwd - Project root
 * @param raw - Raw output flag
 */
function cmdMilestoneHealth(cwd: string, raw: boolean): void {
  const milestone = currentMilestone(cwd);
  const phasesPath = getPhasesDirPath(cwd);
  const statePath = path.join(getPlanningDir(cwd), 'STATE.md');
  const stateContent = safeReadFile(statePath) || '';

  // Component 1: Phase completion rate (40 pts)
  let totalPhases = 0;
  let completedPhases = 0;
  try {
    const phaseDirs: string[] = fs
      .readdirSync(phasesPath, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name);
    totalPhases = phaseDirs.length;
    for (const dir of phaseDirs) {
      const plans = _collectPlanFiles(path.join(phasesPath, dir));
      if (plans.length === 0) continue;
      const summaries = plans.filter((p) => fs.existsSync(p.replace('-PLAN.md', '-SUMMARY.md')));
      if (summaries.length === plans.length) completedPhases++;
    }
  } catch {
    /* no phases dir */
  }

  const completionRate = totalPhases > 0 ? completedPhases / totalPhases : 0;
  const completionScore = Math.round(completionRate * 40);

  // Component 2: Blocker penalty (20 pts max, deduct per blocker)
  const blockerMatch = stateContent.match(/##\s+Blockers?\s*\n([\s\S]*?)(?=\n##|$)/i);
  const activeBlockerCount = blockerMatch
    ? blockerMatch[1]
        .split('\n')
        .filter(
          (l: string) => l.trim().startsWith('-') && !l.includes('[x]') && l.trim().length > 2
        ).length
    : 0;
  const blockerPenalty = Math.min(20, activeBlockerCount * 5);
  const blockerScore = 20 - blockerPenalty;

  // Component 3: Eval hit rate (30 pts)
  let evalTargetsTotal = 0;
  let evalTargetsMet = 0;
  const evalFiles = _collectMarkdownFiles(phasesPath).filter((f) => f.endsWith('-EVAL.md'));
  for (const ef of evalFiles) {
    const content = safeReadFile(ef);
    if (!content) continue;
    const passes = (content.match(/\bPASS\b/gi) || []).length;
    const fails = (content.match(/\bFAIL\b/gi) || []).length;
    evalTargetsTotal += passes + fails;
    evalTargetsMet += passes;
  }
  const evalHitRate = evalTargetsTotal > 0 ? evalTargetsMet / evalTargetsTotal : 0.5;
  const evalScore = Math.round(evalHitRate * 30);

  // Component 4: Estimate accuracy (10 pts)
  const velocityMatch = stateContent.match(/avg[_\s]duration[_\s]min[:\s]+(\d+)/i);
  const estimateScore = velocityMatch ? 8 : 5;

  const totalScore = completionScore + blockerScore + evalScore + estimateScore;
  const grade: MilestoneHealthResult['grade'] =
    totalScore >= 90
      ? 'A'
      : totalScore >= 75
        ? 'B'
        : totalScore >= 60
          ? 'C'
          : totalScore >= 45
            ? 'D'
            : 'F';

  const result: MilestoneHealthResult = {
    milestone,
    score: totalScore,
    grade,
    components: {
      completion_rate: completionScore,
      blocker_penalty: blockerPenalty,
      eval_hit_rate: evalScore,
      estimate_accuracy: estimateScore,
    },
    summary: `${completedPhases}/${totalPhases} phases complete, ${activeBlockerCount} blocker(s), ${evalTargetsMet}/${evalTargetsTotal} eval targets met`,
  };

  output(result, raw, `Milestone ${milestone} health: ${grade} (${totalScore}/100)`);
}

// ─── CLI: Decision Log Timeline ───────────────────────────────────────────────

/**
 * CLI command: Build a chronological timeline of all decisions recorded in
 * STATE.md and CONTEXT.md files across phases.
 * @param cwd - Project root
 * @param raw - Raw output flag
 */
function cmdDecisionTimeline(cwd: string, raw: boolean): void {
  const decisions: DecisionEntry[] = [];

  // Parse decisions from STATE.md
  const statePath = path.join(getPlanningDir(cwd), 'STATE.md');
  const stateContent = safeReadFile(statePath) || '';
  const decisionSection = stateContent.match(
    /##\s+(?:Key\s+)?Decisions?\s*\n([\s\S]*?)(?=\n##|$)/i
  );
  if (decisionSection) {
    const lines = decisionSection[1].split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const datePhaseMatch = trimmed.match(
        /^[-*]\s+\[?(\d{4}-\d{2}-\d{2})\]?\s+(?:Phase\s+(\d+(?:\.\d+)?)[:\s]+)?(.+)/
      );
      const phaseMatch = trimmed.match(/^[-*]\s+(?:Phase\s+(\d+(?:\.\d+)?)[:\s]+)?(.+)/);
      if (datePhaseMatch) {
        decisions.push({
          phase: datePhaseMatch[2] || null,
          date: datePhaseMatch[1],
          summary: datePhaseMatch[3].trim(),
          rationale: '',
          source: 'STATE.md',
        });
      } else if (phaseMatch && trimmed.startsWith('-')) {
        decisions.push({
          phase: phaseMatch[1] || null,
          date: null,
          summary: phaseMatch[2].trim(),
          rationale: '',
          source: 'STATE.md',
        });
      }
    }
  }

  // Parse decisions from CONTEXT.md files
  const phaseDirs = _listPhaseDirs(cwd);
  for (const phaseDir of phaseDirs) {
    const phaseName = path.basename(phaseDir);
    const phaseNumMatch = phaseName.match(/^(\d+(?:\.\d+)?)/);
    const phaseNum = phaseNumMatch ? phaseNumMatch[1] : phaseName;

    let ctxFiles: string[] = [];
    try {
      ctxFiles = fs.readdirSync(phaseDir).filter((f: string) => f.endsWith('-CONTEXT.md'));
    } catch {
      /* ignore */
    }

    for (const ctxFile of ctxFiles) {
      const content = safeReadFile(path.join(phaseDir, ctxFile));
      if (!content) continue;
      const section = content.match(
        /##\s+(?:Decisions?|Choices?|Resolution)\s*\n([\s\S]*?)(?=\n##|$)/i
      );
      if (section) {
        for (const line of section[1].split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('-')) continue;
          decisions.push({
            phase: phaseNum,
            date: null,
            summary: trimmed.replace(/^[-*]\s+/, '').slice(0, 120),
            rationale: '',
            source: `${phaseName}/${ctxFile}`,
          });
        }
      }
    }
  }

  decisions.sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return parseFloat(a.phase || '999') - parseFloat(b.phase || '999');
  });

  output(
    {
      total_decisions: decisions.length,
      decisions_with_dates: decisions.filter((d) => d.date !== null).length,
      timeline: decisions,
    },
    raw
  );
}

// ─── CLI: Cross-Project Knowledge Import ─────────────────────────────────────

/**
 * CLI command: Import research artifacts (LANDSCAPE.md, PAPERS.md, KNOWHOW.md)
 * from another GRD project into the current project's research directory.
 * @param cwd - Project root
 * @param sourcePath - Path to the source project root
 * @param types - Comma-separated types to import (landscape,papers,knowhow,all)
 * @param raw - Raw output flag
 * @param force - If true, overwrite existing files
 */
function cmdImportKnowledge(
  cwd: string,
  sourcePath: string,
  types: string,
  raw: boolean,
  force = false,
  dryRun = false
): void {
  if (!sourcePath) {
    error('Source project path required');
    return;
  }

  const absoluteSource = path.resolve(cwd, sourcePath);
  if (!fs.existsSync(absoluteSource)) {
    output({ error: `Source path does not exist: ${absoluteSource}` }, raw);
    return;
  }

  const requestedTypes =
    !types || types === 'all'
      ? ['landscape', 'papers', 'knowhow']
      : types.split(',').map((t: string) => t.trim().toLowerCase());

  const fileMap: Record<string, string> = {
    landscape: 'LANDSCAPE.md',
    papers: 'PAPERS.md',
    knowhow: 'KNOWHOW.md',
  };

  // Locate source research directory
  const sourceMilestone = currentMilestone(absoluteSource);
  const candidateDirs = [
    path.join(absoluteSource, '.planning', 'milestones', sourceMilestone, 'research'),
    path.join(absoluteSource, '.planning', 'research'),
  ];
  let sourceResearchDir: string | null = null;
  for (const dir of candidateDirs) {
    if (fs.existsSync(dir)) {
      sourceResearchDir = dir;
      break;
    }
  }

  if (!sourceResearchDir) {
    output({ error: `No research directory found in source project`, tried: candidateDirs }, raw);
    return;
  }

  const destResearchDir = getResearchDir(cwd);
  fs.mkdirSync(destResearchDir, { recursive: true });

  const results: ImportResult[] = [];

  for (const type of requestedTypes) {
    const filename = fileMap[type];
    if (!filename) {
      results.push({
        source: sourcePath,
        type,
        destination: '',
        imported: false,
        conflict: false,
        message: `Unknown type: ${type}`,
      });
      continue;
    }

    const srcFile = path.join(sourceResearchDir, filename);
    const destFile = path.join(destResearchDir, filename);

    if (!fs.existsSync(srcFile)) {
      results.push({
        source: srcFile,
        type,
        destination: destFile,
        imported: false,
        conflict: false,
        message: `Source file not found: ${filename}`,
      });
      continue;
    }

    const destExists = fs.existsSync(destFile);
    if (destExists && !force) {
      results.push({
        source: srcFile,
        type,
        destination: destFile,
        imported: false,
        conflict: true,
        message: `${filename} already exists — use --force to overwrite`,
      });
      continue;
    }

    if (dryRun) {
      results.push({
        source: srcFile,
        type,
        destination: destFile,
        imported: false,
        conflict: destExists,
        message: destExists ? `DRY RUN: would overwrite ${filename}` : `DRY RUN: would import ${filename}`,
      });
      continue;
    }

    try {
      fs.cpSync(srcFile, destFile);
      results.push({
        source: srcFile,
        type,
        destination: destFile,
        imported: true,
        conflict: destExists,
        message: destExists ? `Overwrote existing ${filename}` : `Imported ${filename}`,
      });
    } catch (err: unknown) {
      results.push({
        source: srcFile,
        type,
        destination: destFile,
        imported: false,
        conflict: false,
        message: `Copy failed: ${(err as Error).message}`,
      });
    }
  }

  const importedCount = results.filter((r) => r.imported).length;
  output(
    {
      source_project: absoluteSource,
      destination_project: cwd,
      imported_count: importedCount,
      conflict_count: results.filter((r) => r.conflict && !r.imported).length,
      results,
    },
    raw,
    `${importedCount}/${requestedTypes.length} file(s) imported from ${sourcePath}`
  );
}

// ─── CLI: Semantic Todo Duplicate Detector ────────────────────────────────────

/**
 * CLI command: Find semantically similar todo items using Jaccard word-overlap.
 * Surfaces near-duplicate pairs above a configurable similarity threshold.
 * @param cwd - Project root
 * @param raw - Raw output flag
 * @param threshold - Similarity threshold 0-1 (default 0.4)
 */
function cmdTodoDuplicates(cwd: string, raw: boolean, threshold = 0.4): void {
  const todosPath = getTodosDir(cwd);
  const pendingDir = path.join(todosPath, 'pending');

  let todoFiles: string[];
  try {
    todoFiles = fs
      .readdirSync(pendingDir)
      .filter((f: string) => f.endsWith('.md') || f.endsWith('.txt'))
      .map((f: string) => path.join(pendingDir, f));
  } catch {
    output({ error: `No pending todos directory found at ${pendingDir}`, duplicates: [] }, raw);
    return;
  }

  if (todoFiles.length < 2) {
    output(
      { total_todos: todoFiles.length, duplicates: [], note: 'Not enough todos to compare' },
      raw
    );
    return;
  }

  const todos: Array<{ file: string; title: string; content: string }> = [];
  for (const f of todoFiles) {
    const content = safeReadFile(f);
    if (!content) continue;
    todos.push({ file: path.basename(f), title: _extractTodoTitle(content), content });
  }

  const pairs: TodoDuplicatePair[] = [];
  for (let i = 0; i < todos.length; i++) {
    for (let j = i + 1; j < todos.length; j++) {
      const sim = _jaccardSimilarity(
        todos[i].title + ' ' + todos[i].content.slice(0, 300),
        todos[j].title + ' ' + todos[j].content.slice(0, 300)
      );
      if (sim >= threshold) {
        pairs.push({
          a: todos[i].file,
          b: todos[j].file,
          similarity: parseFloat(sim.toFixed(3)),
          a_title: todos[i].title,
          b_title: todos[j].title,
        });
      }
    }
  }

  pairs.sort((a, b) => b.similarity - a.similarity);

  output(
    {
      total_todos: todos.length,
      threshold,
      duplicate_pairs: pairs.length,
      duplicates: pairs,
      unique_todos_at_risk: new Set(pairs.flatMap((p) => [p.a, p.b])).size,
    },
    raw,
    `Found ${pairs.length} potential duplicate pair(s) among ${todos.length} todos (threshold=${threshold})`
  );
}

// ─── Knowhow List ───────────────────────────────────────────────────────────

function cmdKnowhowList(cwd: string, raw: boolean, moduleHint?: string, limit?: number): void {
  const {
    parseKnowhowEntries,
    selectTopEntries,
  }: {
    parseKnowhowEntries: (content: string) => { pattern_name: string; source: string; applicability: string; code_snippet: string; phase_number: number; created_at: string }[];
    selectTopEntries: (entries: { pattern_name: string; source: string; applicability: string; code_snippet: string; phase_number: number; created_at: string }[], limit: number, moduleHints?: string[]) => { pattern_name: string; source: string; applicability: string; code_snippet: string; phase_number: number; created_at: string }[];
  } = require('../knowledge');

  const researchDir = getResearchDir(cwd);
  const knowhowPath = path.join(researchDir, 'KNOWHOW.md');
  const content = safeReadFile(knowhowPath);
  if (!content) {
    output({ entries: [], total: 0, message: 'No KNOWHOW.md found' }, raw, 'No KNOWHOW.md found');
    return;
  }

  const allEntries = parseKnowhowEntries(content);
  const hints = moduleHint ? moduleHint.split(',').map((h: string) => h.trim()) : undefined;
  const maxEntries = limit || 20;
  const selected = hints ? selectTopEntries(allEntries, maxEntries, hints) : allEntries.slice(0, maxEntries);

  output(
    { total: allEntries.length, showing: selected.length, module_filter: hints || null, entries: selected.map((e) => ({ pattern: e.pattern_name, source: e.source, phase: e.phase_number, created: e.created_at })) },
    raw,
    `${selected.length}/${allEntries.length} knowhow entries${hints ? ` (filtered: ${hints.join(', ')})` : ''}`
  );
}

// ─── Citation Graph ─────────────────────────────────────────────────────────

function cmdCitationGraph(cwd: string, raw: boolean, unresolvedOnly = false): void {
  const {
    buildCitationGraph,
    findUnresolved,
  }: {
    buildCitationGraph: (content: string) => { nodes: { slug: string; title: string; resolved: boolean; priority: string }[]; edges: { from: string; to: string; type: string }[] };
    findUnresolved: (graph: { nodes: { slug: string; title: string; resolved: boolean; priority: string }[]; edges: { from: string; to: string; type: string }[] }) => { slug: string; title: string; priority: string }[];
  } = require('../citations');

  const researchDir = getResearchDir(cwd);
  const papersPath = path.join(researchDir, 'PAPERS.md');
  const content = safeReadFile(papersPath);
  if (!content) {
    output({ nodes: 0, edges: 0, message: 'No PAPERS.md found' }, raw, 'No PAPERS.md found');
    return;
  }

  const graph = buildCitationGraph(content);
  const unresolved = findUnresolved(graph);

  if (unresolvedOnly) {
    output({ unresolved_count: unresolved.length, unresolved }, raw, `${unresolved.length} unresolved citation(s)`);
    return;
  }

  output(
    { nodes: graph.nodes.length, edges: graph.edges.length, unresolved_count: unresolved.length, papers: graph.nodes.map((n) => ({ slug: n.slug, title: n.title, resolved: n.resolved, priority: n.priority })), unresolved },
    raw,
    `Citation graph: ${graph.nodes.length} papers, ${graph.edges.length} edges, ${unresolved.length} unresolved`
  );
}

// ─── Artifact DAG ───────────────────────────────────────────────────────────

function cmdArtifactDAG(cwd: string, phase: string, raw: boolean): void {
  const { buildArtifactDAG, validateArtifactDAG }: { buildArtifactDAG: (plans: import('../types').PlanArtifact[]) => import('../types').ArtifactDAG; validateArtifactDAG: (dag: import('../types').ArtifactDAG, plans: import('../types').PlanArtifact[]) => import('../types').ArtifactDAGValidation } = require('../deps');
  const { extractFrontmatter }: { extractFrontmatter: (content: string) => Record<string, unknown> } = require('../frontmatter');

  const phasesDir = getPhasesDirPath(cwd);
  let phaseDir: string | null = null;
  try {
    const dirs: string[] = fs.readdirSync(phasesDir);
    const match = dirs.find((d: string) => d.startsWith(phase + '-') || d === phase);
    if (match) phaseDir = path.join(phasesDir, match);
  } catch { /* phases dir may not exist */ }

  if (!phaseDir) { output({ error: `Phase ${phase} not found` }, raw, `Phase ${phase} not found`); return; }

  const files: string[] = fs.readdirSync(phaseDir).filter((f: string) => f.endsWith('-PLAN.md'));
  const plans: import('../types').PlanArtifact[] = [];
  for (let i = 0; i < files.length; i++) {
    const planPath = path.join(phaseDir, files[i]);
    try {
      const content = fs.readFileSync(planPath, 'utf-8') as string;
      const fm = extractFrontmatter(content);
      plans.push({ objective: (fm.objective as string) || '', files_modified: (fm.files_modified as string[]) || [], phase, plan: i + 1, type: (fm.type as string) || 'implementation', wave: (fm.wave as number) || 1, depends_on: (fm.depends_on as string[]) || [], autonomous: (fm.autonomous as boolean) ?? true, provides: (fm.provides as string[]) || [], requires: (fm.requires as string[]) || [], integration_points: (fm.integration_points as string[]) || [] });
    } catch { /* skip malformed plans */ }
  }

  if (plans.length === 0) { output({ error: 'No plans with artifact declarations found' }, raw, 'No plans found'); return; }

  const dag = buildArtifactDAG(plans);
  const validation = validateArtifactDAG(dag, plans);
  if (dag.missing_requires.length > 0) {
    process.stderr.write(`Warning: ${dag.missing_requires.length} unresolvable requires: ${dag.missing_requires.join(', ')}\n`);
  }
  output({ phase, plans: plans.length, nodes: dag.nodes.length, edges: dag.edges.length, sorted_plans: dag.sorted_plans, missing_requires: dag.missing_requires, valid: validation.valid, cycles: validation.cycles, missing_deps: validation.missing_deps, warnings: validation.warnings }, raw, `Phase ${phase} DAG: ${dag.nodes.length} nodes, ${dag.edges.length} edges, valid=${validation.valid}${dag.missing_requires.length > 0 ? ` (${dag.missing_requires.length} unresolvable requires)` : ''}`);
}

// ─── Benchmark Report ───────────────────────────────────────────────────────

function cmdBenchmarkReport(cwd: string, raw: boolean): void {
  const { loadCorpus, formatBenchmarkReport }: { loadCorpus: (dir: string) => import('../types').BenchmarkEntry[]; formatBenchmarkReport: (entries: import('../types').BenchmarkEntry[]) => string } = require('../benchmark');

  const researchDir = getResearchDir(cwd);
  const corpusDir = path.join(researchDir, 'benchmarks');

  if (!fs.existsSync(corpusDir)) { output({ entries: 0, message: 'No benchmark corpus found', corpus_dir: corpusDir }, raw, 'No benchmark corpus found'); return; }

  const entries = loadCorpus(corpusDir);
  if (entries.length === 0) { output({ entries: 0, message: 'Benchmark corpus is empty' }, raw, 'Benchmark corpus is empty'); return; }

  const report = formatBenchmarkReport(entries);
  output({ entries: entries.length, report }, raw, report);
}

// ─── Phase Cost Estimator ─────────────────────────────────────────────────────

interface PhaseAgentEstimate {
  agent: string;
  tasks: number;
  est_tokens: number;
  est_cost_usd: number;
}

interface PhaseTokenEstimate {
  phase: string;
  agents: PhaseAgentEstimate[];
  total_tokens: number;
  total_cost_usd: number;
  model_tier: string;
  cheaper_alternative?: string;
}

/** Average tokens per agent task, seeded from empirical observations. */
const TOKEN_AVERAGES_BY_TIER: Record<string, number> = {
  high: 45000,
  medium: 22000,
  low: 8000,
};
const COST_PER_MILLION_BY_TIER: Record<string, number> = {
  high: 15.0, // e.g. Opus
  medium: 3.0, // e.g. Sonnet
  low: 0.25,  // e.g. Haiku
};

/**
 * Estimate token and dollar cost for a phase by counting tasks across plan files,
 * looking up model tier from config, and applying historical per-agent averages.
 */
function estimatePhaseTokens(cwd: string, phaseNum: string, config: Record<string, unknown>): PhaseTokenEstimate {
  const phaseDir = _findPhaseDirByNumber(cwd, phaseNum);
  const modelProfile = (config.model_profile as string) || 'balanced';
  // Codex r5 P2: model_profile values are quality/balanced/budget;
  // 'frugal' is a token_profile value and never appears here, so the
  // prior mapping silently routed `budget` projects to medium-tier
  // estimates. Map model_profile correctly.
  const tier =
    modelProfile === 'quality' ? 'high' : modelProfile === 'budget' ? 'low' : 'medium';
  const tokensPerTask = TOKEN_AVERAGES_BY_TIER[tier] ?? TOKEN_AVERAGES_BY_TIER.medium;
  const costPerMillion = COST_PER_MILLION_BY_TIER[tier] ?? COST_PER_MILLION_BY_TIER.medium;

  const agents: PhaseAgentEstimate[] = [];

  if (phaseDir) {
    const planFiles = _collectPlanFiles(phaseDir);
    for (const planFile of planFiles) {
      const content = safeReadFile(planFile);
      if (!content) continue;
      // Codex r5 P2: count XML <task> blocks alongside markdown
      // checkboxes. GRD plans use the XML form; counting only checkboxes
      // collapsed every multi-task XML plan to the fallback `1`.
      const taskCount =
        (content.match(/^[-*]\s+\[/gm) || []).length +
        (content.match(/<task\b[^>]*>/gi) || []).length || 1;
      const agentName = path.basename(planFile, '-PLAN.md');
      const estTokens = taskCount * tokensPerTask;
      agents.push({
        agent: agentName,
        tasks: taskCount,
        est_tokens: estTokens,
        est_cost_usd: parseFloat(((estTokens / 1_000_000) * costPerMillion).toFixed(4)),
      });
    }
  }

  const totalTokens = agents.reduce((s, a) => s + a.est_tokens, 0);
  const totalCost = parseFloat(agents.reduce((s, a) => s + a.est_cost_usd, 0).toFixed(4));

  // Codex r7 P3: model_profile values are quality/balanced/budget;
  // `frugal` is a token_profile value. Recommend the correct flag
  // (model_profile=budget) so users don't introduce config drift.
  const cheaperAlternative =
    totalCost > 0.5 && tier !== 'low'
      ? `Use model_profile=budget to reduce cost by ~${Math.round((1 - COST_PER_MILLION_BY_TIER.low / costPerMillion) * 100)}%`
      : undefined;

  return { phase: phaseNum, agents, total_tokens: totalTokens, total_cost_usd: totalCost, model_tier: tier, cheaper_alternative: cheaperAlternative };
}

/**
 * CLI command: Estimate token and dollar cost for a phase before execution.
 * @param cwd - Project root
 * @param phase - Phase number string
 * @param raw - Raw output flag
 */
function cmdEstimatePhase(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('Phase number required');
    return;
  }
  const config = require('../utils').loadConfig(cwd) as Record<string, unknown>;
  const estimate = estimatePhaseTokens(cwd, phase, config);
  const rawMsg = estimate.agents.length === 0
    ? `Phase ${phase}: no plan files found`
    : `Phase ${phase}: ~${estimate.total_tokens.toLocaleString()} tokens / $${estimate.total_cost_usd} (${estimate.model_tier} tier)${estimate.cheaper_alternative ? ' — ' + estimate.cheaper_alternative : ''}`;
  output(estimate, raw, rawMsg);
}

// ─── Downstream Phase Impact Analyzer ────────────────────────────────────────

interface ImpactPhaseEntry {
  phase: string;
  name: string;
  status: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  depth: number;
}

interface DownstreamImpactResult {
  source_phase: string;
  affected_count: number;
  high_risk_count: number;
  affected_phases: ImpactPhaseEntry[];
}

/**
 * Compute downstream phases that depend (directly or transitively) on the given phase.
 * Parses phase dependency blocks from ROADMAP.md using a BFS traversal.
 */
function computeDownstreamImpact(cwd: string, phaseNum: string): DownstreamImpactResult {
  const roadmapPath = path.join(getPlanningDir(cwd), 'ROADMAP.md');
  const roadmapContent = safeReadFile(roadmapPath) || '';
  const phasesPath = getPhasesDirPath(cwd);

  // Build dependency graph: phaseN depends on phaseM means M → N edge
  const deps = new Map<string, string[]>(); // parent → children
  const phaseNames = new Map<string, string>();

  // Codex r1 P2: roadmap uses `- [x] **Phase 87: name**` form (bold,
  // checklist marker, comma-separated description); the prior regex
  // expected a bare `Phase N: name` and matched nothing on real
  // roadmaps. Accept both the canonical form and the lighter form.
  for (const m of roadmapContent.matchAll(
    /^[-*]\s+(?:\[[ x]\]\s+)?(?:\*\*)?(?:Phase\s+)?(\d+(?:\.\d+)?)[:\s]+([^\n*]+)/gim
  )) {
    const num = m[1].trim();
    const name = m[2].replace(/\s*\(.*\)$/, '').trim();
    phaseNames.set(num, name);
    if (!deps.has(num)) deps.set(num, []);
  }

  // Codex r5 P2: most roadmap blocks have `Depends on: Phase N` inside
  // the *child* phase's section (i.e. the current phase being defined),
  // so the regex captures only the parent and leaves child undefined.
  // Walk the roadmap line-by-line tracking the enclosing phase context:
  // a `#### Phase N: ...` (or comparable heading) sets the current
  // phase; subsequent `Depends on: Phase M` lines add M → N edges.
  let currentPhase: string | null = null;
  const phaseHeadingRe = /^#{2,}\s*Phase\s+(\d+(?:\.\d+)?)\s*:/i;
  const dependsOnRe =
    /[Dd]epends?\s+on(?:\*\*)?[:\s]+[Pp]hase\s+(\d+(?:\.\d+)?)(?:[^\n]*?[Pp]hase\s+(\d+(?:\.\d+)?))?/;
  for (const line of roadmapContent.split('\n')) {
    const heading = line.match(phaseHeadingRe);
    if (heading) {
      currentPhase = heading[1].trim();
      continue;
    }
    const m = line.match(dependsOnRe);
    if (!m) continue;
    const parent = m[1].trim();
    const explicitChild = m[2]?.trim();
    if (!deps.has(parent)) deps.set(parent, []);
    // Two-phase pattern wins; single-parent falls back to enclosing
    // phase context.
    const child = explicitChild ?? currentPhase;
    if (child && child !== parent) deps.get(parent)!.push(child);
  }

  // Also infer sequential deps: phase N+1 depends on phase N if no explicit deps declared
  const allPhaseNums = Array.from(phaseNames.keys()).sort(
    (a, b) => parseFloat(a) - parseFloat(b)
  );
  for (let i = 0; i < allPhaseNums.length - 1; i++) {
    const parent = allPhaseNums[i];
    const child = allPhaseNums[i + 1];
    const parentChildren = deps.get(parent) || [];
    if (!parentChildren.includes(child)) parentChildren.push(child);
    deps.set(parent, parentChildren);
  }

  // Determine status of each phase
  function _phaseStatus(num: string): string {
    const normalized = num.padStart(2, '0');
    try {
      const entries: { isDirectory: () => boolean; name: string }[] = require('fs').readdirSync(
        phasesPath,
        { withFileTypes: true }
      );
      const dir = entries.find(
        (e) => e.isDirectory() && (e.name.startsWith(normalized + '-') || e.name.startsWith(num + '-'))
      );
      if (!dir) return 'not_found';
      const phaseDir = path.join(phasesPath, dir.name);
      const files: string[] = require('fs').readdirSync(phaseDir);
      const plans = files.filter((f: string) => f.endsWith('-PLAN.md')).length;
      const summaries = files.filter((f: string) => f.endsWith('-SUMMARY.md')).length;
      if (plans === 0) return 'planned';
      if (summaries >= plans) return 'done';
      if (summaries > 0) return 'executing';
      return 'planned';
    } catch {
      return 'unknown';
    }
  }

  // BFS from phaseNum to find all downstream
  const visited = new Set<string>();
  const queue: Array<{ phase: string; depth: number }> = [{ phase: phaseNum, depth: 0 }];
  const affected: ImpactPhaseEntry[] = [];

  while (queue.length > 0) {
    const { phase, depth } = queue.shift()!;
    if (visited.has(phase)) continue;
    visited.add(phase);

    if (phase !== phaseNum) {
      const status = _phaseStatus(phase);
      const risk: 'LOW' | 'MEDIUM' | 'HIGH' =
        status === 'executing' ? 'HIGH' : status === 'planned' ? 'MEDIUM' : 'LOW';
      affected.push({ phase, name: phaseNames.get(phase) || phase, status, risk, depth });
    }

    for (const child of deps.get(phase) || []) {
      if (!visited.has(child)) queue.push({ phase: child, depth: depth + 1 });
    }
  }

  affected.sort((a, b) => a.depth - b.depth || parseFloat(a.phase) - parseFloat(b.phase));
  const highRisk = affected.filter((p) => p.risk === 'HIGH').length;

  return { source_phase: phaseNum, affected_count: affected.length, high_risk_count: highRisk, affected_phases: affected };
}

/**
 * CLI command: Show which downstream phases are affected if the given phase changes.
 * @param cwd - Project root
 * @param phase - Phase number string
 * @param raw - Raw output flag
 */
function cmdImpact(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('Phase number required');
    return;
  }
  const result = computeDownstreamImpact(cwd, phase);
  const rawMsg = result.affected_count === 0
    ? `Phase ${phase} has no downstream dependencies`
    : `Phase ${phase} impacts ${result.affected_count} phase(s) (${result.high_risk_count} HIGH risk)`;
  output(result, raw, rawMsg);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  cmdPhaseRiskAssessment,
  cmdCitationBacklinks,
  cmdEvalRegressionCheck,
  cmdPhaseTimeBudget,
  cmdConfigDiff,
  cmdPhaseReadiness,
  cmdMilestoneHealth,
  cmdDecisionTimeline,
  cmdImportKnowledge,
  cmdTodoDuplicates,
  cmdKnowhowList,
  cmdCitationGraph,
  cmdArtifactDAG,
  cmdBenchmarkReport,
  estimatePhaseTokens,
  cmdEstimatePhase,
  computeDownstreamImpact,
  cmdImpact,
};
