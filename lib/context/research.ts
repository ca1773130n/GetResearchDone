/**
 * GRD Context/Research -- Init context builders for R&D research workflows
 *
 * Contains: cmdInitResearchWorkflow, cmdInitAssessBaseline, cmdInitDeepDive,
 *           cmdInitEvalPlan, cmdInitEvalReport, cmdInitFeasibility,
 *           cmdInitProductOwner, cmdInitProjectResearcher,
 *           cmdInitResearchSynthesizer, cmdInitRoadmapper, cmdInitSurveyor,
 *           cmdInitVerifier
 *
 * Dependencies: base.ts, utils.ts, backend.ts, paths.ts
 */

'use strict';

import type {
  GrdConfig,
  PhaseInfo,
  MilestoneInfo,
  BackendCapabilities,
  FrontmatterObject,
} from '../types';

const {
  fs, path, safeReadFile, safeReadMarkdown, loadConfig,
  findPhaseInternal, resolveModelInternal, pathExistsInternal,
  getMilestoneInfo, resolveModelForAgent, output, error,
} = require('../utils') as {
  fs: typeof import('fs');
  path: typeof import('path');
  safeReadFile: (p: string) => string | null;
  safeReadMarkdown: (p: string) => string | null;
  loadConfig: (cwd: string) => GrdConfig;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  resolveModelInternal: (cwd: string, agent: string) => string;
  pathExistsInternal: (cwd: string, target: string) => boolean;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
  resolveModelForAgent: (config: GrdConfig, agent: string, cwd?: string) => string;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (msg: string) => never;
};

const { detectBackend, getBackendCapabilities } = require('../backend') as {
  detectBackend: (cwd: string) => string;
  getBackendCapabilities: (b: string) => BackendCapabilities;
};

const {
  planningDir: getPlanningDir, phasesDir: getPhasesDirPath,
  researchDir: getResearchDirPath, codebaseDir: getCodebaseDirPath,
  todosDir: getTodosDirPath, quickDir: getQuickDirPath,
  milestonesDir: getMilestonesDirPath,
} = require('../paths') as {
  planningDir: (cwd: string) => string;
  phasesDir: (cwd: string) => string;
  researchDir: (cwd: string) => string;
  codebaseDir: (cwd: string) => string;
  todosDir: (cwd: string) => string;
  quickDir: (cwd: string) => string;
  milestonesDir: (cwd: string) => string;
};

const { buildInitContext } = require('./base.ts') as {
  buildInitContext: (cwd: string, overrides: Record<string, unknown>) => Record<string, unknown>;
};

// ─── Research Workflow Init ──────────────────────────────────────────────────

/**
 * CLI command: Initialize research workflow context (survey, deep-dive, feasibility, eval, etc.).
 */
function cmdInitResearchWorkflow(
  cwd: string,
  workflow: string,
  topic: string | null,
  includes: Set<string>,
  raw: boolean
): void {
  const planningDir = path.join(cwd, '.planning');
  const researchDir = getResearchDirPath(cwd);
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);

  const result: Record<string, unknown> = {
    backend,
    backend_capabilities: getBackendCapabilities(backend),
    workflow,
    topic: topic || null,
    autonomous_mode: config.autonomous_mode || false,
    research_gates: (config as unknown as Record<string, unknown>).research_gates || {},
    eval_config: (config as unknown as Record<string, unknown>).eval_config || {},
    github_integration: (config as unknown as Record<string, unknown>).github_integration || {},
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    benchmarks_exists: fs.existsSync(path.join(researchDir, 'BENCHMARKS.md')),
    knowhow_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'KNOWHOW.md')),
    baseline_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'BASELINE.md')),
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),
    researcher_model: resolveModelForAgent(config, 'researcher'),
    planner_model: resolveModelForAgent(config, 'planner'),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, researchDir),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  // Include deep-dive listing for relevant workflows
  if (['deep-dive', 'compare-methods', 'feasibility'].includes(workflow)) {
    const deepDivesDir = path.join(researchDir, 'deep-dives');
    try {
      if (fs.existsSync(deepDivesDir)) {
        result.deep_dives = fs.readdirSync(deepDivesDir).filter((f: string) => f.endsWith('.md'));
      } else {
        result.deep_dives = [];
      }
    } catch (_e) {
      result.deep_dives = [];
    }
  }

  // Include file contents if requested
  if (includes.has('landscape')) {
    result.landscape_content = safeReadMarkdown(path.join(researchDir, 'LANDSCAPE.md'));
  }
  if (includes.has('papers')) {
    result.papers_content = safeReadMarkdown(path.join(researchDir, 'PAPERS.md'));
  }
  if (includes.has('knowhow')) {
    result.knowhow_content = safeReadMarkdown(path.join(planningDir, 'KNOWHOW.md'));
  }
  if (includes.has('baseline')) {
    result.baseline_content = safeReadMarkdown(path.join(planningDir, 'BASELINE.md'));
  }
  if (includes.has('state')) {
    result.state_content = safeReadMarkdown(path.join(planningDir, 'STATE.md'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadMarkdown(path.join(planningDir, 'ROADMAP.md'));
  }
  if (includes.has('config')) {
    result.config_content = safeReadFile(path.join(planningDir, 'config.json'));
  }

  output(result, raw, `Backend: ${result.backend}, workflow: ${result.workflow}${result.topic ? ', topic: ' + result.topic : ''}`);
}

// ─── Plan-Milestone-Gaps Init ────────────────────────────────────────────────

/**
 * CLI command: Initialize plan-milestone-gaps context with audit file info and phase counts.
 */
function cmdInitPlanMilestoneGaps(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);
  const planningDir = path.join(cwd, '.planning');

  // Find the most recent audit file
  let auditFile: string | null = null;
  let auditGaps: unknown = null;
  try {
    const entries = fs.readdirSync(planningDir)
      .filter((f: string) => /^v.*-MILESTONE-AUDIT\.md$/i.test(f))
      .sort()
      .reverse();
    if (entries.length > 0) {
      auditFile = entries[0];
      const content = safeReadFile(path.join(planningDir, auditFile));
      if (content) {
        const { extractFrontmatter } = require('../frontmatter') as {
          extractFrontmatter: (content: string) => FrontmatterObject;
        };
        const fm = extractFrontmatter(content);
        if (fm.gaps) auditGaps = fm.gaps;
      }
    }
  } catch {
    // Planning directory may not exist or audit file may be missing
  }

  // Count phases
  let phaseCount = 0;
  let highestPhase = 0;
  const phasesDir = getPhasesDirPath(cwd);
  try {
    const dirs = fs.readdirSync(phasesDir, { withFileTypes: true })
      .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
      .map((e: { name: string }) => e.name);
    phaseCount = dirs.length;
    for (const dir of dirs) {
      const num = parseInt(dir.split('-')[0], 10);
      if (!isNaN(num) && num > highestPhase) highestPhase = num;
    }
  } catch {
    // Phases directory may not exist yet
  }

  const result: Record<string, unknown> = {
    backend,
    backend_capabilities: getBackendCapabilities(backend),
    commit_docs: config.commit_docs,
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    audit_file: auditFile,
    audit_gaps: auditGaps,
    phase_count: phaseCount,
    highest_phase: highestPhase,
    requirements_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'REQUIREMENTS.md')),
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, milestone: ${result.milestone_version}, ${result.phase_count} phases`);
}

// ─── Assess-Baseline Init ────────────────────────────────────────────────────

function cmdInitAssessBaseline(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);

  const result = buildInitContext(cwd, {
    assessor_model: resolveModelInternal(cwd, 'grd-baseline-assessor'),
    eval_config: (config as unknown as Record<string, unknown>).eval_config || {},
    autonomous_mode: config.autonomous_mode || false,
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),
    benchmarks_exists: pathExistsInternal(cwd, path.join(researchDir, 'BENCHMARKS.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
  });

  output(result, raw, `Backend: ${result.backend}, assessor ready`);
}

// ─── Deep-Dive Init ──────────────────────────────────────────────────────────

function cmdInitDeepDive(cwd: string, topic: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const researchDir = getResearchDirPath(cwd);
  const deepDivesDir = path.join(researchDir, 'deep-dives');
  let deepDives: string[] = [];
  try {
    if (fs.existsSync(deepDivesDir)) {
      deepDives = fs.readdirSync(deepDivesDir).filter((f: string) => f.endsWith('.md'));
    }
  } catch { deepDives = []; }

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    deep_diver_model: resolveModelInternal(cwd, 'grd-deep-diver'),
    topic: topic || null,
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    deep_dives: deepDives, deep_dives_count: deepDives.length,
    autonomous_mode: config.autonomous_mode || false,
    research_gates: (config as unknown as Record<string, unknown>).research_gates || {},
    research_dir: path.relative(cwd, researchDir),
    deep_dives_dir: path.relative(cwd, deepDivesDir),
  };
  output(result, raw, `Backend: ${result.backend}, deep-diver ready${topic ? ', topic: ' + topic : ''}`);
}

// ─── Eval-Plan Init ──────────────────────────────────────────────────────────

function cmdInitEvalPlan(cwd: string, phase: string | null, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    eval_planner_model: resolveModelInternal(cwd, 'grd-eval-planner'),
    phase_found: phaseInfo ? (phaseInfo as unknown as Record<string, unknown>).found : false,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    eval_config: (config as unknown as Record<string, unknown>).eval_config || {},
    autonomous_mode: config.autonomous_mode || false,
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),
    benchmarks_exists: pathExistsInternal(cwd, path.join(researchDir, 'BENCHMARKS.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, researchDir),
  };
  output(result, raw, `Backend: ${result.backend}, eval-planner ready${phase ? ', phase: ' + phase : ''}`);
}

// ─── Eval-Report Init ────────────────────────────────────────────────────────

function cmdInitEvalReport(cwd: string, phase: string | null, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    eval_reporter_model: resolveModelInternal(cwd, 'grd-eval-reporter'),
    phase_found: phaseInfo ? (phaseInfo as unknown as Record<string, unknown>).found : false,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    plans: phaseInfo?.plans || [], summaries: phaseInfo?.summaries || [],
    eval_config: (config as unknown as Record<string, unknown>).eval_config || {},
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),
    benchmarks_exists: pathExistsInternal(cwd, path.join(researchDir, 'BENCHMARKS.md')),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, researchDir),
  };
  output(result, raw, `Backend: ${result.backend}, eval-reporter ready${phase ? ', phase: ' + phase : ''}`);
}

// ─── Feasibility Init ────────────────────────────────────────────────────────

function cmdInitFeasibility(cwd: string, topic: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);
  const deepDivesDir = path.join(researchDir, 'deep-dives');
  let deepDives: string[] = [];
  try { if (fs.existsSync(deepDivesDir)) { deepDives = fs.readdirSync(deepDivesDir).filter((f: string) => f.endsWith('.md')); } } catch { deepDives = []; }

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    feasibility_model: resolveModelInternal(cwd, 'grd-feasibility-analyst'),
    topic: topic || null,
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    knowhow_exists: pathExistsInternal(cwd, path.join(planningDir, 'KNOWHOW.md')),
    deep_dives: deepDives, deep_dives_count: deepDives.length,
    autonomous_mode: config.autonomous_mode || false,
    research_dir: path.relative(cwd, researchDir),
    deep_dives_dir: path.relative(cwd, deepDivesDir),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, feasibility-analyst ready${topic ? ', topic: ' + topic : ''}`);
}

// ─── Product-Owner Init ──────────────────────────────────────────────────────

function cmdInitProductOwner(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const planningDir = getPlanningDir(cwd);
  const milestone = getMilestoneInfo(cwd);

  const result = buildInitContext(cwd, {
    product_owner_model: resolveModelInternal(cwd, 'grd-product-owner'),
    milestone_dir: (milestone as unknown as Record<string, unknown>).dir,
    project_exists: pathExistsInternal(cwd, path.join(planningDir, 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    requirements_exists: pathExistsInternal(cwd, path.join(planningDir, 'REQUIREMENTS.md')),
    product_quality_exists: pathExistsInternal(cwd, path.join(planningDir, 'PRODUCT-QUALITY.md')),
    autonomous_mode: config.autonomous_mode || false,
    eval_config: (config as unknown as Record<string, unknown>).eval_config || {},
    milestones_dir: path.relative(cwd, getMilestonesDirPath(cwd)),
  });
  output(result, raw, `Backend: ${result.backend}, product-owner ready`);
}

// ─── Project-Researcher Init ─────────────────────────────────────────────────

function cmdInitProjectResearcher(cwd: string, topic: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);
  const milestone = getMilestoneInfo(cwd);

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    researcher_model: resolveModelInternal(cwd, 'grd-project-researcher'),
    topic: topic || null,
    milestone_version: milestone.version,
    project_exists: pathExistsInternal(cwd, path.join(planningDir, 'PROJECT.md')),
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    autonomous_mode: config.autonomous_mode || false,
    research_gates: (config as unknown as Record<string, unknown>).research_gates || {},
    research_dir: path.relative(cwd, researchDir),
    milestones_dir: path.relative(cwd, getMilestonesDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, project-researcher ready${topic ? ', topic: ' + topic : ''}`);
}

// ─── Research-Synthesizer Init ───────────────────────────────────────────────

function cmdInitResearchSynthesizer(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const researchDir = getResearchDirPath(cwd);
  let deepDives: string[] = [];
  try {
    const deepDivesDir = path.join(researchDir, 'deep-dives');
    if (fs.existsSync(deepDivesDir)) {
      deepDives = fs.readdirSync(deepDivesDir).filter((f: string) => f.endsWith('.md'));
    }
  } catch { deepDives = []; }

  const result = buildInitContext(cwd, {
    synthesizer_model: resolveModelInternal(cwd, 'grd-research-synthesizer'),
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    benchmarks_exists: fs.existsSync(path.join(researchDir, 'BENCHMARKS.md')),
    deep_dives: deepDives, deep_dives_count: deepDives.length,
    autonomous_mode: config.autonomous_mode || false,
    deep_dives_dir: path.relative(cwd, path.join(researchDir, 'deep-dives')),
  });
  output(result, raw, `Backend: ${result.backend}, research-synthesizer ready`);
}

// ─── Roadmapper Init ─────────────────────────────────────────────────────────

function cmdInitRoadmapper(cwd: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const planningDir = getPlanningDir(cwd);

  const result = buildInitContext(cwd, {
    roadmapper_model: resolveModelInternal(cwd, 'grd-roadmapper'),
    project_exists: pathExistsInternal(cwd, path.join(planningDir, 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    requirements_exists: pathExistsInternal(cwd, path.join(planningDir, 'REQUIREMENTS.md')),
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    ceremony: config.ceremony || {},
    tracker: (config as unknown as Record<string, unknown>).tracker || {},
    milestones_dir: path.relative(cwd, getMilestonesDirPath(cwd)),
  });
  output(result, raw, `Backend: ${result.backend}, roadmapper ready`);
}

// ─── Surveyor Init ───────────────────────────────────────────────────────────

function cmdInitSurveyor(cwd: string, topic: string, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const researchDir = getResearchDirPath(cwd);
  const planningDir = getPlanningDir(cwd);

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    surveyor_model: resolveModelInternal(cwd, 'grd-surveyor'),
    topic: topic || null,
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    benchmarks_exists: fs.existsSync(path.join(researchDir, 'BENCHMARKS.md')),
    autonomous_mode: config.autonomous_mode || false,
    research_gates: (config as unknown as Record<string, unknown>).research_gates || {},
    research_dir: path.relative(cwd, researchDir),
    milestones_dir: path.relative(cwd, getMilestonesDirPath(cwd)),
    project_exists: pathExistsInternal(cwd, path.join(planningDir, 'PROJECT.md')),
  };
  output(result, raw, `Backend: ${result.backend}, surveyor ready${topic ? ', topic: ' + topic : ''}`);
}

// ─── Verifier Init ───────────────────────────────────────────────────────────

function cmdInitVerifier(cwd: string, phase: string | null, raw: boolean): void {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    verifier_model: resolveModelInternal(cwd, 'grd-verifier'),
    phase_found: phaseInfo ? (phaseInfo as unknown as Record<string, unknown>).found : false,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    plans: phaseInfo?.plans || [], summaries: phaseInfo?.summaries || [],
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),
    benchmarks_exists: pathExistsInternal(cwd, path.join(researchDir, 'BENCHMARKS.md')),
    eval_config: (config as unknown as Record<string, unknown>).eval_config || {},
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, researchDir),
  };
  output(result, raw, `Backend: ${result.backend}, verifier ready${phase ? ', phase: ' + phase : ''}`);
}

module.exports = {
  cmdInitResearchWorkflow,
  cmdInitPlanMilestoneGaps,
  cmdInitAssessBaseline,
  cmdInitDeepDive,
  cmdInitEvalPlan,
  cmdInitEvalReport,
  cmdInitFeasibility,
  cmdInitProductOwner,
  cmdInitProjectResearcher,
  cmdInitResearchSynthesizer,
  cmdInitRoadmapper,
  cmdInitSurveyor,
  cmdInitVerifier,
};
