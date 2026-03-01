/**
 * GRD Context/Agents -- Init context builders for agent aliases and operation workflows
 *
 * Contains: cmdInitDebug, cmdInitIntegrationCheck, cmdInitMigrate, cmdInitPlanCheck,
 *           cmdInitBaselineAssessor, cmdInitCodeReviewer, cmdInitCodebaseMapper,
 *           cmdInitDebugger, cmdInitDeepDiver, cmdInitEvalPlanner, cmdInitEvalReporter,
 *           cmdInitExecutor, cmdInitFeasibilityAnalyst, cmdInitIntegrationChecker,
 *           cmdInitMigrator, cmdInitPhaseResearcher, cmdInitPlanChecker
 *
 * Agent aliases are thin wrappers that delegate to canonical cmdInit* functions
 * in sibling modules (execute, research, project).
 *
 * Dependencies: base.ts, execute.ts, research.ts, project.ts, utils.ts, backend.ts, paths.ts
 */

'use strict';

import type {
  GrdConfig,
  PhaseInfo,
  MilestoneInfo,
  BackendCapabilities,
  ExecGitResult,
} from '../types';

const {
  fs, path, safeReadMarkdown, loadConfig,
  findPhaseInternal, resolveModelInternal, pathExistsInternal,
  getMilestoneInfo, resolveModelForAgent, output, error,
} = require('../utils') as {
  fs: typeof import('fs');
  path: typeof import('path');
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
  milestonesDir: getMilestonesDirPath,
} = require('../paths') as {
  planningDir: (cwd: string) => string;
  phasesDir: (cwd: string) => string;
  researchDir: (cwd: string) => string;
  codebaseDir: (cwd: string) => string;
  milestonesDir: (cwd: string) => string;
};

const { buildInitContext } = require('./base.ts') as {
  buildInitContext: (cwd: string, overrides: Record<string, unknown>) => Record<string, unknown>;
};

// Import sibling module functions for agent aliases
const { cmdInitCodeReview, cmdInitPhaseResearch } = require('./execute.ts') as {
  cmdInitCodeReview: (cwd: string, phase: string, raw: boolean) => void;
  cmdInitPhaseResearch: (cwd: string, phase: string, includes: Set<string>, raw: boolean) => void;
};

const { cmdInitMapCodebase } = require('./project.ts') as {
  cmdInitMapCodebase: (cwd: string, raw: boolean) => void;
};

const {
  cmdInitAssessBaseline, cmdInitDeepDive, cmdInitEvalPlan,
  cmdInitEvalReport, cmdInitFeasibility, cmdInitIntegrationCheck: _unused1,
} = require('./research.ts') as {
  cmdInitAssessBaseline: (cwd: string, raw: boolean) => void;
  cmdInitDeepDive: (cwd: string, topic: string, raw: boolean) => void;
  cmdInitEvalPlan: (cwd: string, phase: string | null, raw: boolean) => void;
  cmdInitEvalReport: (cwd: string, phase: string | null, raw: boolean) => void;
  cmdInitFeasibility: (cwd: string, topic: string, raw: boolean) => void;
  cmdInitIntegrationCheck: (cwd: string, phase: string | null, raw: boolean) => void;
};

// ─── Debug Init ──────────────────────────────────────────────────────────────

/**
 * CLI command: Initialize debug context with phase info, debug files, and project state.
 */
function cmdInitDebug(cwd: string, phase: string | null, raw: boolean): void {
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;
  const planningDir = getPlanningDir(cwd);

  let debugFiles: string[] = [];
  try {
    const entries: string[] = fs.readdirSync(planningDir);
    debugFiles = entries.filter((f: string) => f.startsWith('DEBUG-') && f.endsWith('.md'));
  } catch {
    // .planning/ may not exist
  }

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    phase_found: !!phaseInfo, phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null, phase_name: phaseInfo?.phase_name || null,
    debug_files: debugFiles,
    active_debug_file: debugFiles.length > 0 ? path.join('.planning', debugFiles[debugFiles.length - 1]) : null,
    milestone_version: milestone.version, milestone_name: milestone.name,
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, debug_files: ${debugFiles.length}${phase ? ', phase: ' + phase : ''}`);
}

// ─── Integration-Check Init ──────────────────────────────────────────────────

/**
 * CLI command: Initialize integration-check context with phase inventory and deferred validations.
 */
function cmdInitIntegrationCheck(cwd: string, phase: string | null, raw: boolean): void {
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;
  const planningDir = getPlanningDir(cwd);

  const phasesDir = getPhasesDirPath(cwd);
  let phaseCount = 0;
  let summaryCount = 0;
  try {
    const entries: { name: string; isDirectory: () => boolean }[] = fs.readdirSync(phasesDir, { withFileTypes: true });
    const phaseDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    phaseCount = phaseDirs.length;
    for (const d of phaseDirs) {
      try {
        const files: string[] = fs.readdirSync(path.join(phasesDir, d));
        summaryCount += files.filter((f: string) => f.endsWith('-SUMMARY.md')).length;
      } catch { /* skip unreadable dirs */ }
    }
  } catch { /* phases dir may not exist */ }

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    phase_found: !!phaseInfo, phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null, phase_name: phaseInfo?.phase_name || null,
    phase_count: phaseCount, summary_count: summaryCount,
    milestone_version: milestone.version, milestone_name: milestone.name,
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, milestone: ${result.milestone_version}, ${phaseCount} phases`);
}

// ─── Migrate Init ────────────────────────────────────────────────────────────

/**
 * CLI command: Initialize migrate context with planning directory layout inventory.
 */
function cmdInitMigrate(cwd: string, raw: boolean): void {
  const planningDir = getPlanningDir(cwd);
  const milestonesDir = getMilestonesDirPath(cwd);

  let flatMilestoneFiles: string[] = [];
  try {
    const entries: { name: string; isFile: () => boolean }[] = fs.readdirSync(milestonesDir, { withFileTypes: true });
    flatMilestoneFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => path.join(path.relative(cwd, milestonesDir), e.name));
  } catch { /* milestones dir may not exist */ }

  let legacyPhaseDirs: string[] = [];
  try {
    const entries: { name: string; isDirectory: () => boolean }[] = fs.readdirSync(milestonesDir, { withFileTypes: true });
    legacyPhaseDirs = entries.filter((e) => e.isDirectory() && /^\d{2}-/.test(e.name))
      .map((e) => path.join(path.relative(cwd, milestonesDir), e.name));
  } catch { /* milestones dir may not exist */ }

  const result = buildInitContext(cwd, {
    flat_milestone_files: flatMilestoneFiles,
    legacy_phase_dirs: legacyPhaseDirs,
    complex_items_count: flatMilestoneFiles.length + legacyPhaseDirs.length,
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    planning_dir: path.relative(cwd, planningDir),
    milestones_dir: path.relative(cwd, milestonesDir),
  });
  output(result, raw, `Backend: ${result.backend}, complex_items: ${result.complex_items_count}`);
}

// ─── Plan-Check Init ─────────────────────────────────────────────────────────

/**
 * CLI command: Initialize plan-check context with phase plan files and roadmap goal.
 */
function cmdInitPlanCheck(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('phase required for init plan-check. Usage: init plan-check <phase-number>. Provide a phase number, e.g.: init plan-check 2');
    return;
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const planningDir = getPlanningDir(cwd);

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    checker_model: resolveModelForAgent(config, 'planner'),
    phase_found: !!phaseInfo, phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null, phase_name: phaseInfo?.phase_name || null,
    plans: phaseInfo?.plans || [], plan_count: phaseInfo?.plans?.length || 0,
    has_research: phaseInfo?.has_research || false,
    has_context: phaseInfo?.has_context || false,
    has_eval: (phaseInfo as unknown as Record<string, unknown> | null)?.has_eval || false,
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    requirements_exists: pathExistsInternal(cwd, path.join(planningDir, 'REQUIREMENTS.md')),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
  };
  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}, plans: ${result.plan_count}`);
}

// ─── Executor Init ───────────────────────────────────────────────────────────

/**
 * CLI command: Initialize executor context with phase plans, STATE, and ROADMAP.
 */
function cmdInitExecutor(cwd: string, phase: string, includes: Set<string>, raw: boolean): void {
  if (!phase) {
    error('phase required for init executor. Usage: init executor <phase-number>. Provide a phase number, e.g.: init executor 2');
    return;
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const milestone = getMilestoneInfo(cwd);
  const planningDir = getPlanningDir(cwd);

  const result: Record<string, unknown> = {
    backend, backend_capabilities: getBackendCapabilities(backend),
    executor_model: resolveModelInternal(cwd, 'grd-executor'),
    commit_docs: config.commit_docs, parallelization: config.parallelization,
    use_teams: config.use_teams, team_timeout_minutes: config.team_timeout_minutes,
    phase_found: !!phaseInfo, phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null, phase_name: phaseInfo?.phase_name || null,
    phase_slug: phaseInfo?.phase_slug || null,
    plans: phaseInfo?.plans || [], summaries: phaseInfo?.summaries || [],
    incomplete_plans: phaseInfo?.incomplete_plans || [],
    plan_count: phaseInfo?.plans?.length || 0, incomplete_count: phaseInfo?.incomplete_plans?.length || 0,
    milestone_version: milestone.version, milestone_name: milestone.name,
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    principles_exists: pathExistsInternal(cwd, path.join(planningDir, 'PRINCIPLES.md')),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
  };

  if (includes && includes.has('state')) {
    result.state_content = safeReadMarkdown(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes && includes.has('roadmap')) {
    result.roadmap_content = safeReadMarkdown(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}, plans: ${result.plan_count}`);
}

// ─── Agent Aliases ───────────────────────────────────────────────────────────
// Thin wrappers delegating to canonical cmdInit* functions in sibling modules.

function cmdInitBaselineAssessor(cwd: string, raw: boolean): void { return cmdInitAssessBaseline(cwd, raw); }
function cmdInitCodeReviewer(cwd: string, phase: string, raw: boolean): void { return cmdInitCodeReview(cwd, phase, raw); }
function cmdInitCodebaseMapper(cwd: string, raw: boolean): void { return cmdInitMapCodebase(cwd, raw); }
function cmdInitDebugger(cwd: string, phase: string | null, raw: boolean): void { return cmdInitDebug(cwd, phase, raw); }
function cmdInitDeepDiver(cwd: string, topic: string, raw: boolean): void { return cmdInitDeepDive(cwd, topic, raw); }
function cmdInitEvalPlanner(cwd: string, phase: string | null, raw: boolean): void { return cmdInitEvalPlan(cwd, phase, raw); }
function cmdInitEvalReporter(cwd: string, phase: string | null, raw: boolean): void { return cmdInitEvalReport(cwd, phase, raw); }
function cmdInitFeasibilityAnalyst(cwd: string, topic: string, raw: boolean): void { return cmdInitFeasibility(cwd, topic, raw); }
function cmdInitIntegrationChecker(cwd: string, phase: string | null, raw: boolean): void { return cmdInitIntegrationCheck(cwd, phase, raw); }
function cmdInitMigrator(cwd: string, raw: boolean): void { return cmdInitMigrate(cwd, raw); }
function cmdInitPhaseResearcher(cwd: string, phase: string, includes: Set<string>, raw: boolean): void { return cmdInitPhaseResearch(cwd, phase, includes, raw); }
function cmdInitPlanChecker(cwd: string, phase: string, raw: boolean): void { return cmdInitPlanCheck(cwd, phase, raw); }

module.exports = {
  cmdInitDebug,
  cmdInitIntegrationCheck,
  cmdInitMigrate,
  cmdInitPlanCheck,
  cmdInitExecutor,
  // Agent aliases
  cmdInitBaselineAssessor,
  cmdInitCodeReviewer,
  cmdInitCodebaseMapper,
  cmdInitDebugger,
  cmdInitDeepDiver,
  cmdInitEvalPlanner,
  cmdInitEvalReporter,
  cmdInitFeasibilityAnalyst,
  cmdInitIntegrationChecker,
  cmdInitMigrator,
  cmdInitPhaseResearcher,
  cmdInitPlanChecker,
};
