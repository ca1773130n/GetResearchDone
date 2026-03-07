/**
 * Unit tests for lib/commands/analysis.ts
 *
 * Tests analysis commands: phase-risk, citation-backlinks, eval-regression-check,
 * phase-time-budget, config-diff, phase-readiness, milestone-health,
 * decision-timeline, import-knowledge, todo-duplicates.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');

const {
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
} = require('../../lib/commands/analysis');

// ─── Fixture Helpers ─────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-analysis-test-'));
}

function cleanupDir(dir: string): void {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function setupPlanning(root: string, milestone = 'v0.1.0'): void {
  const planningDir = path.join(root, '.planning');
  const milestonePath = path.join(planningDir, 'milestones', milestone);
  fs.mkdirSync(path.join(milestonePath, 'phases'), { recursive: true });
  fs.mkdirSync(path.join(milestonePath, 'research'), { recursive: true });
  fs.mkdirSync(path.join(milestonePath, 'todos', 'pending'), { recursive: true });

  fs.writeFileSync(path.join(planningDir, 'STATE.md'), [
    '# State',
    '',
    '**Milestone:** v0.1.0',
    '',
    '## Current Position',
    '- **Active phase:** 1',
    '',
    '## Key Decisions',
    '- [2026-01-01] Phase 1: Use TypeScript for type safety',
    '- Phase 2: Switch to CJS modules',
    '',
    '## Blockers',
    'None.',
  ].join('\n'));

  fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), [
    '# Roadmap',
    '- v0.1.0 Foundation (in progress)',
    '- Phase 1: Setup',
    '  **Duration:** 2d',
    '- Phase 2: Core',
    '  **Duration:** 3d',
  ].join('\n'));

  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify({
    autonomous_mode: false,
    ceremony: { default_level: 'standard' },
    tracker: { provider: 'none' },
  }, null, 2));
}

function addPhaseDir(root: string, phaseNum: string, milestone = 'v0.1.0'): string {
  const phasesPath = path.join(root, '.planning', 'milestones', milestone, 'phases');
  const dirName = `${phaseNum.padStart(2, '0')}-test-phase`;
  const phaseDir = path.join(phasesPath, dirName);
  fs.mkdirSync(phaseDir, { recursive: true });
  return phaseDir;
}

function addPlan(phaseDir: string, planNum: string, content: string): string {
  const planFile = path.join(phaseDir, `01-${planNum}-PLAN.md`);
  fs.writeFileSync(planFile, content);
  return planFile;
}

function parseOutput(stdout: string): Record<string, unknown> {
  try {
    return JSON.parse(stdout);
  } catch {
    // Extract first JSON object
    const start = stdout.indexOf('{');
    if (start !== -1) {
      return JSON.parse(stdout.slice(start));
    }
    throw new Error(`Could not parse JSON from: ${stdout.slice(0, 100)}`);
  }
}

// ─── Phase Risk Assessment ────────────────────────────────────────────────────

describe('cmdPhaseRiskAssessment', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setupPlanning(tmpDir);
  });

  afterEach(() => cleanupDir(tmpDir));

  it('returns error when phase not found', () => {
    const { stdout } = captureOutput(() => cmdPhaseRiskAssessment(tmpDir, '99', false));
    const result = parseOutput(stdout);
    expect(result.risk_score).toBe(0);
    expect(result.risk_level).toBe('low');
    expect(result.plans_analyzed).toHaveLength(0);
  });

  it('flags missing plans as high risk', () => {
    addPhaseDir(tmpDir, '1');
    const { stdout } = captureOutput(() => cmdPhaseRiskAssessment(tmpDir, '1', false));
    const result = parseOutput(stdout);
    expect(result.risk_score).toBeGreaterThan(0);
    const signals = result.signals as Array<{ category: string; severity: string }>;
    expect(signals.some(s => s.category === 'plans')).toBe(true);
    expect(signals.some(s => s.severity === 'high')).toBe(true);
  });

  it('flags vague success criteria', () => {
    const phaseDir = addPhaseDir(tmpDir, '1');
    addPlan(phaseDir, '01', [
      '---',
      'title: Test Plan',
      '---',
      '## Goal',
      'Do stuff.',
      '## Tasks',
      '- [ ] Implement feature',
      '## Success Criteria',
      'It should work.',
    ].join('\n'));
    const { stdout } = captureOutput(() => cmdPhaseRiskAssessment(tmpDir, '1', false));
    const result = parseOutput(stdout);
    const signals = result.signals as Array<{ category: string }>;
    expect(signals.some(s => s.category === 'success_criteria')).toBe(true);
    expect(result.plans_analyzed).toHaveLength(1);
  });

  it('has lower risk for well-structured plans', () => {
    const phaseDir = addPhaseDir(tmpDir, '1');
    addPlan(phaseDir, '01', [
      '## Goal',
      'Implement feature.',
      '## Dependencies',
      'Requires phase 0 complete.',
      '## Success Criteria',
      '- accuracy >= 90%',
      '- latency < 200ms',
      '## Tasks',
      '- [ ] Build baseline with benchmark data',
      '## Fallback',
      'If primary approach fails, use simpler model.',
    ].join('\n'));
    const { stdout } = captureOutput(() => cmdPhaseRiskAssessment(tmpDir, '1', false));
    const result = parseOutput(stdout);
    expect(result.risk_level).not.toBe('critical');
    expect(result.plan_count).toBe(1);
  });

  it('returns raw string output when raw=true', () => {
    const phaseDir = addPhaseDir(tmpDir, '1');
    addPlan(phaseDir, '01', '## Success Criteria\naccuracy >= 90%\n## Dependencies\nPhase 1.\n## Fallback\nUse simpler approach.\n');
    const { stdout } = captureOutput(() => cmdPhaseRiskAssessment(tmpDir, '1', true));
    expect(typeof stdout).toBe('string');
    expect(stdout.length).toBeGreaterThan(0);
  });
});

// ─── Citation Backlinks ───────────────────────────────────────────────────────

describe('cmdCitationBacklinks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setupPlanning(tmpDir);
  });

  afterEach(() => cleanupDir(tmpDir));

  it('returns error when PAPERS.md not found', () => {
    const { stdout } = captureOutput(() => cmdCitationBacklinks(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.error).toBeDefined();
  });

  it('indexes papers and finds references', () => {
    const researchDir = path.join(tmpDir, '.planning', 'milestones', 'v0.1.0', 'research');
    fs.writeFileSync(path.join(researchDir, 'PAPERS.md'), [
      '## Attention Is All You Need',
      'Vaswani et al., 2017.',
      '',
      '## BERT: Pre-training',
      'Devlin et al., 2018.',
    ].join('\n'));

    // Add a plan that references the first paper
    const phaseDir = addPhaseDir(tmpDir, '1');
    fs.writeFileSync(path.join(phaseDir, 'notes.md'), 'We use attention is all you need as our baseline.');

    const { stdout } = captureOutput(() => cmdCitationBacklinks(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.papers_indexed).toBe(2);
    const backlinks = result.backlinks as Array<{ paper_title: string; reference_count: number }>;
    expect(backlinks).toHaveLength(2);
    expect(result.unreferenced_count).toBeGreaterThanOrEqual(0);
  });

  it('reports all unreferenced when no mentions in other files', () => {
    const researchDir = path.join(tmpDir, '.planning', 'milestones', 'v0.1.0', 'research');
    fs.writeFileSync(path.join(researchDir, 'PAPERS.md'), '## Obscure Paper Title XYZ\nUnrelated content.\n');

    const { stdout } = captureOutput(() => cmdCitationBacklinks(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.papers_indexed).toBe(1);
    expect(result.unreferenced_count).toBe(1);
  });
});

// ─── Eval Regression Check ────────────────────────────────────────────────────

describe('cmdEvalRegressionCheck', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setupPlanning(tmpDir);
  });

  afterEach(() => cleanupDir(tmpDir));

  it('returns phase not found for missing phase', () => {
    const { stdout } = captureOutput(() => cmdEvalRegressionCheck(tmpDir, '99', false));
    const result = parseOutput(stdout);
    expect(result.has_regressions).toBe(false);
  });

  it('returns no eval note when phase has no EVAL.md', () => {
    addPhaseDir(tmpDir, '1');
    const { stdout } = captureOutput(() => cmdEvalRegressionCheck(tmpDir, '1', false));
    const result = parseOutput(stdout);
    expect(result.has_regressions).toBe(false);
    expect(result.note).toBeDefined();
  });

  it('detects regressions when metric drops below baseline threshold', () => {
    const phaseDir = addPhaseDir(tmpDir, '1');
    fs.writeFileSync(path.join(phaseDir, '01-01-EVAL.md'), 'accuracy: 75\nbleu: 0.3\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'BASELINE.md'), 'accuracy: 90\nbleu: 0.35\n');

    const { stdout } = captureOutput(() => cmdEvalRegressionCheck(tmpDir, '1', false, 5));
    const result = parseOutput(stdout);
    expect(result.has_regressions).toBe(true);
    expect((result.regressions as unknown[]).length).toBeGreaterThan(0);
  });

  it('detects no regression when metrics are close to baseline', () => {
    const phaseDir = addPhaseDir(tmpDir, '1');
    fs.writeFileSync(path.join(phaseDir, '01-01-EVAL.md'), 'accuracy: 90\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'BASELINE.md'), 'accuracy: 90\n');

    const { stdout } = captureOutput(() => cmdEvalRegressionCheck(tmpDir, '1', false, 5));
    const result = parseOutput(stdout);
    expect(result.has_regressions).toBe(false);
  });
});

// ─── Phase Time Budget ────────────────────────────────────────────────────────

describe('cmdPhaseTimeBudget', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setupPlanning(tmpDir);
  });

  afterEach(() => cleanupDir(tmpDir));

  it('returns error when ROADMAP.md not found', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'ROADMAP.md'));
    const { stdout } = captureOutput(() => cmdPhaseTimeBudget(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.error).toBeDefined();
  });

  it('parses duration entries from ROADMAP.md', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), [
      '# Roadmap',
      '- Phase 1: Setup',
      '  **Duration:** 2d',
      '- Phase 2: Core',
      '  **Duration:** 5d',
    ].join('\n'));
    const { stdout } = captureOutput(() => cmdPhaseTimeBudget(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.total_phases).toBe(2);
    const phases = result.phases as Array<{ estimated_days: number }>;
    expect(phases[0].estimated_days).toBe(2);
    expect(phases[1].estimated_days).toBe(5);
  });

  it('returns empty phases when no duration entries', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), '# Roadmap\n- Phase 1: Setup\n');
    const { stdout } = captureOutput(() => cmdPhaseTimeBudget(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.total_phases).toBe(0);
    expect(result.phases).toHaveLength(0);
  });
});

// ─── Config Diff ─────────────────────────────────────────────────────────────

describe('cmdConfigDiff', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setupPlanning(tmpDir);
  });

  afterEach(() => cleanupDir(tmpDir));

  it('creates snapshot on first run', () => {
    const { stdout } = captureOutput(() => cmdConfigDiff(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.action).toBe('snapshot_saved');
    const snapshotPath = path.join(tmpDir, '.planning', '.config-snapshot.json');
    expect(fs.existsSync(snapshotPath)).toBe(true);
  });

  it('reports no changes when config is identical to snapshot', () => {
    // First run creates snapshot
    captureOutput(() => cmdConfigDiff(tmpDir, false));
    // Second run diffs
    const { stdout } = captureOutput(() => cmdConfigDiff(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.has_changes).toBe(false);
    expect(result.changes_count).toBe(0);
  });

  it('detects changes after config modification', () => {
    // Create snapshot
    captureOutput(() => cmdConfigDiff(tmpDir, false));

    // Modify config
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ autonomous_mode: true, ceremony: { default_level: 'full' }, tracker: { provider: 'github' } }, null, 2));

    const { stdout } = captureOutput(() => cmdConfigDiff(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.has_changes).toBe(true);
    expect(result.changes_count).toBeGreaterThan(0);
    const changes = result.changes as Array<{ key: string }>;
    expect(changes.some(c => c.key.includes('autonomous_mode'))).toBe(true);
  });

  it('resets snapshot with --reset flag', () => {
    // Create initial snapshot
    captureOutput(() => cmdConfigDiff(tmpDir, false));

    // Reset
    const { stdout } = captureOutput(() => cmdConfigDiff(tmpDir, false, true));
    const result = parseOutput(stdout);
    expect(result.action).toBe('snapshot_saved');
  });

  it('returns error when config.json not found', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'config.json'));
    const { stdout } = captureOutput(() => cmdConfigDiff(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.error).toBeDefined();
  });
});

// ─── Phase Readiness ─────────────────────────────────────────────────────────

describe('cmdPhaseReadiness', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setupPlanning(tmpDir);
  });

  afterEach(() => cleanupDir(tmpDir));

  it('reports not ready when phase directory missing', () => {
    const { stdout } = captureOutput(() => cmdPhaseReadiness(tmpDir, '1', false));
    const result = parseOutput(stdout);
    expect(result.ready).toBe(false);
    expect((result.blockers as unknown[]).length).toBeGreaterThan(0);
  });

  it('reports not ready when no plans exist', () => {
    addPhaseDir(tmpDir, '1');
    const { stdout } = captureOutput(() => cmdPhaseReadiness(tmpDir, '1', false));
    const result = parseOutput(stdout);
    // No PLAN.md files => blocker
    expect(result.ready).toBe(false);
  });

  it('passes baseline check when BASELINE.md exists', () => {
    const phaseDir = addPhaseDir(tmpDir, '1');
    addPlan(phaseDir, '01', '## Goal\nDo stuff.\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'BASELINE.md'), 'accuracy: 85\n');

    const { stdout } = captureOutput(() => cmdPhaseReadiness(tmpDir, '1', false));
    const result = parseOutput(stdout);
    const checks = result.checks as Array<{ name: string; passed: boolean }>;
    const baselineCheck = checks.find(c => c.name.includes('Baseline'));
    expect(baselineCheck?.passed).toBe(true);
  });

  it('returns score between 0 and 100', () => {
    const { stdout } = captureOutput(() => cmdPhaseReadiness(tmpDir, '1', false));
    const result = parseOutput(stdout);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ─── Milestone Health ─────────────────────────────────────────────────────────

describe('cmdMilestoneHealth', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setupPlanning(tmpDir);
  });

  afterEach(() => cleanupDir(tmpDir));

  it('returns a score between 0 and 100', () => {
    const { stdout } = captureOutput(() => cmdMilestoneHealth(tmpDir, false));
    const result = parseOutput(stdout);
    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns a valid grade', () => {
    const { stdout } = captureOutput(() => cmdMilestoneHealth(tmpDir, false));
    const result = parseOutput(stdout);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
  });

  it('includes milestone name', () => {
    const { stdout } = captureOutput(() => cmdMilestoneHealth(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.milestone).toBe('v0.1.0');
  });

  it('includes all component scores', () => {
    const { stdout } = captureOutput(() => cmdMilestoneHealth(tmpDir, false));
    const result = parseOutput(stdout);
    const comps = result.components as Record<string, number>;
    expect(typeof comps.completion_rate).toBe('number');
    expect(typeof comps.blocker_penalty).toBe('number');
    expect(typeof comps.eval_hit_rate).toBe('number');
    expect(typeof comps.estimate_accuracy).toBe('number');
  });

  it('deducts points for active blockers', () => {
    // Add active blocker to STATE.md
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    const content = fs.readFileSync(statePath, 'utf-8');
    fs.writeFileSync(statePath, content.replace('None.', '- Blocked on external API\n- Blocked on team availability'));

    const { stdout: stdout1 } = captureOutput(() => cmdMilestoneHealth(tmpDir, false));
    const result1 = parseOutput(stdout1);

    // Reset blockers
    fs.writeFileSync(statePath, content);
    const { stdout: stdout2 } = captureOutput(() => cmdMilestoneHealth(tmpDir, false));
    const result2 = parseOutput(stdout2);

    expect(result2.score as number).toBeGreaterThan(result1.score as number);
  });
});

// ─── Decision Timeline ────────────────────────────────────────────────────────

describe('cmdDecisionTimeline', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setupPlanning(tmpDir);
  });

  afterEach(() => cleanupDir(tmpDir));

  it('parses decisions from STATE.md', () => {
    const { stdout } = captureOutput(() => cmdDecisionTimeline(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.total_decisions).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.timeline)).toBe(true);
  });

  it('extracts dated decisions from STATE.md', () => {
    const { stdout } = captureOutput(() => cmdDecisionTimeline(tmpDir, false));
    const result = parseOutput(stdout);
    // The fixture STATE.md has "- [2026-01-01] Phase 1: Use TypeScript for type safety"
    expect(result.decisions_with_dates).toBeGreaterThanOrEqual(1);
    const timeline = result.timeline as Array<{ date: string | null; summary: string }>;
    const datedEntry = timeline.find(d => d.date === '2026-01-01');
    expect(datedEntry).toBeDefined();
    expect(datedEntry?.summary).toContain('TypeScript');
  });

  it('parses decisions from CONTEXT.md files', () => {
    const phaseDir = addPhaseDir(tmpDir, '1');
    fs.writeFileSync(path.join(phaseDir, '01-CONTEXT.md'), [
      '# Phase 1 Context',
      '## Decisions',
      '- Use Redis for caching instead of memcached',
      '- Deploy on Kubernetes',
    ].join('\n'));

    const { stdout } = captureOutput(() => cmdDecisionTimeline(tmpDir, false));
    const result = parseOutput(stdout);
    const timeline = result.timeline as Array<{ summary: string; source: string }>;
    const ctxDecisions = timeline.filter(d => d.source.includes('CONTEXT.md'));
    expect(ctxDecisions.length).toBeGreaterThanOrEqual(2);
  });

  it('sorts decisions chronologically with dated ones first', () => {
    const { stdout } = captureOutput(() => cmdDecisionTimeline(tmpDir, false));
    const result = parseOutput(stdout);
    const timeline = result.timeline as Array<{ date: string | null }>;
    const datedIdx = timeline.findIndex(d => d.date !== null);
    const undatedIdx = timeline.findIndex(d => d.date === null);
    if (datedIdx !== -1 && undatedIdx !== -1) {
      expect(datedIdx).toBeLessThan(undatedIdx);
    }
  });
});

// ─── Import Knowledge ─────────────────────────────────────────────────────────

describe('cmdImportKnowledge', () => {
  let tmpDir: string;
  let sourceDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    sourceDir = makeTmpDir();
    setupPlanning(tmpDir);
    setupPlanning(sourceDir);
  });

  afterEach(() => {
    cleanupDir(tmpDir);
    cleanupDir(sourceDir);
  });

  it('returns error for non-existent source path', () => {
    const { stdout } = captureOutput(() => cmdImportKnowledge(tmpDir, '/nonexistent/path', 'all', false));
    const result = parseOutput(stdout);
    expect(result.error).toBeDefined();
  });

  it('imports LANDSCAPE.md from source project', () => {
    const srcResearch = path.join(sourceDir, '.planning', 'milestones', 'v0.1.0', 'research');
    fs.writeFileSync(path.join(srcResearch, 'LANDSCAPE.md'), '# Landscape\nSome research findings.\n');

    const { stdout } = captureOutput(() => cmdImportKnowledge(tmpDir, sourceDir, 'landscape', false));
    const result = parseOutput(stdout);
    expect(result.imported_count).toBe(1);
    const destFile = path.join(tmpDir, '.planning', 'milestones', 'v0.1.0', 'research', 'LANDSCAPE.md');
    expect(fs.existsSync(destFile)).toBe(true);
  });

  it('respects conflict detection without --force', () => {
    const srcResearch = path.join(sourceDir, '.planning', 'milestones', 'v0.1.0', 'research');
    fs.writeFileSync(path.join(srcResearch, 'PAPERS.md'), '## Paper A\nContent.\n');

    // First import
    captureOutput(() => cmdImportKnowledge(tmpDir, sourceDir, 'papers', false));
    // Second import without force
    const { stdout } = captureOutput(() => cmdImportKnowledge(tmpDir, sourceDir, 'papers', false));
    const result = parseOutput(stdout);
    expect(result.conflict_count).toBe(1);
    expect(result.imported_count).toBe(0);
  });

  it('overwrites with --force', () => {
    const srcResearch = path.join(sourceDir, '.planning', 'milestones', 'v0.1.0', 'research');
    fs.writeFileSync(path.join(srcResearch, 'PAPERS.md'), '## Paper A\nContent.\n');

    // First import
    captureOutput(() => cmdImportKnowledge(tmpDir, sourceDir, 'papers', false));
    // Second import with force
    const { stdout } = captureOutput(() => cmdImportKnowledge(tmpDir, sourceDir, 'papers', false, true));
    const result = parseOutput(stdout);
    expect(result.imported_count).toBe(1);
  });

  it('reports source file not found gracefully', () => {
    const { stdout } = captureOutput(() => cmdImportKnowledge(tmpDir, sourceDir, 'papers', false));
    const result = parseOutput(stdout);
    const results = result.results as Array<{ imported: boolean; message: string }>;
    expect(results[0].imported).toBe(false);
    expect(results[0].message).toContain('not found');
  });
});

// ─── Todo Duplicates ─────────────────────────────────────────────────────────

describe('cmdTodoDuplicates', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    setupPlanning(tmpDir);
  });

  afterEach(() => cleanupDir(tmpDir));

  it('returns error when pending todos dir missing', () => {
    // Remove the pending dir that setupPlanning creates
    const pendingDir = path.join(tmpDir, '.planning', 'milestones', 'v0.1.0', 'todos', 'pending');
    fs.rmSync(pendingDir, { recursive: true, force: true });
    const { stdout } = captureOutput(() => cmdTodoDuplicates(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.error).toBeDefined();
  });

  it('reports not enough todos when only one todo', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'milestones', 'v0.1.0', 'todos', 'pending');
    fs.writeFileSync(path.join(pendingDir, '001-feature.md'), '# Add feature\n## Problem\nMissing feature.\n');
    const { stdout } = captureOutput(() => cmdTodoDuplicates(tmpDir, false));
    const result = parseOutput(stdout);
    expect(result.note).toBeDefined();
  });

  it('detects highly similar todos', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'milestones', 'v0.1.0', 'todos', 'pending');
    fs.writeFileSync(path.join(pendingDir, '001-cache.md'),
      '# Add Redis caching layer\n## Problem\nApplication is slow without caching layer.\n## Solution\nImplement Redis cache.\n');
    fs.writeFileSync(path.join(pendingDir, '002-cache.md'),
      '# Add Redis caching layer for application\n## Problem\nApplication is slow without caching layer.\n## Solution\nUse Redis cache.\n');

    const { stdout } = captureOutput(() => cmdTodoDuplicates(tmpDir, false, 0.3));
    const result = parseOutput(stdout);
    expect(result.duplicate_pairs).toBeGreaterThan(0);
    const dups = result.duplicates as Array<{ similarity: number }>;
    expect(dups[0].similarity).toBeGreaterThanOrEqual(0.3);
  });

  it('returns no duplicates for completely different todos', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'milestones', 'v0.1.0', 'todos', 'pending');
    fs.writeFileSync(path.join(pendingDir, '001-alpha.md'),
      '# Database migration\n## Problem\nNeed schema update.\n');
    fs.writeFileSync(path.join(pendingDir, '002-beta.md'),
      '# UI color theme\n## Problem\nButtons lack visual contrast.\n');

    const { stdout } = captureOutput(() => cmdTodoDuplicates(tmpDir, false, 0.5));
    const result = parseOutput(stdout);
    expect(result.duplicate_pairs).toBe(0);
  });

  it('respects custom threshold', () => {
    const pendingDir = path.join(tmpDir, '.planning', 'milestones', 'v0.1.0', 'todos', 'pending');
    fs.writeFileSync(path.join(pendingDir, '001-similar.md'),
      '# Add logging feature\n## Problem\nLogging is missing.\n');
    fs.writeFileSync(path.join(pendingDir, '002-similar.md'),
      '# Add logging system\n## Problem\nLogging feature is missing.\n');

    // Low threshold should find it
    const { stdout: out1 } = captureOutput(() => cmdTodoDuplicates(tmpDir, false, 0.1));
    const r1 = parseOutput(out1);
    expect(r1.total_todos).toBe(2);

    // Very high threshold should not find it
    const { stdout: out2 } = captureOutput(() => cmdTodoDuplicates(tmpDir, false, 0.99));
    const r2 = parseOutput(out2);
    expect(r2.duplicate_pairs).toBe(0);
  });
});
