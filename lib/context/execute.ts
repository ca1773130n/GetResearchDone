/**
 * GRD Context/Execute -- Init context builders for execution and planning workflows
 *
 * Contains: cmdInitExecutePhase, cmdInitPlanPhase, cmdInitVerifyWork,
 *           cmdInitCodeReview, cmdInitPhaseResearch
 *
 * These are the largest and most complex cmdInit* functions, handling
 * execution models, gate checks, plan inventories, and branch computation.
 *
 * Dependencies: base.ts, utils.ts, backend.ts, paths.ts, worktree.ts, gates.ts
 */

'use strict';

import type {
  GrdConfig,
  PhaseInfo,
  MilestoneInfo,
  BackendCapabilities,
  ExecGitResult,
  PreflightResult,
  WebMcpResult,
} from '../types';

const {
  fs, path, safeReadFile, safeReadMarkdown, loadConfig,
  findPhaseInternal, resolveModelInternal, pathExistsInternal,
  generateSlugInternal, getMilestoneInfo, resolveModelForAgent,
  execGit, output, error,
} = require('../utils') as {
  fs: typeof import('fs');
  path: typeof import('path');
  safeReadFile: (p: string) => string | null;
  safeReadMarkdown: (p: string) => string | null;
  loadConfig: (cwd: string) => GrdConfig;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  resolveModelInternal: (cwd: string, agent: string) => string;
  pathExistsInternal: (cwd: string, target: string) => boolean;
  generateSlugInternal: (text: string) => string | null;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
  resolveModelForAgent: (config: GrdConfig, agent: string, cwd?: string) => string;
  execGit: (cwd: string, args: string[], opts?: { allowBlocked?: boolean }) => ExecGitResult;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (msg: string) => never;
};

const { detectBackend, getBackendCapabilities, detectWebMcp } =
  require('../backend') as {
    detectBackend: (cwd: string) => string;
    getBackendCapabilities: (b: string) => BackendCapabilities;
    detectWebMcp: (cwd: string) => WebMcpResult;
  };

const { worktreePath } = require('../worktree') as {
  worktreePath: (cwd: string, m: string, p: string) => string;
};

const { runPreflightGates } = require('../gates') as {
  runPreflightGates: (cwd: string, cmd: string, opts?: Record<string, unknown>) => PreflightResult;
};

const {
  planningDir: getPlanningDir, phasesDir: getPhasesDirPath,
  researchDir: getResearchDirPath, codebaseDir: getCodebaseDirPath,
  todosDir: getTodosDirPath, quickDir: getQuickDirPath,
  standardsDir: getStandardsDirPath,
} = require('../paths') as {
  planningDir: (cwd: string) => string;
  phasesDir: (cwd: string) => string;
  researchDir: (cwd: string) => string;
  codebaseDir: (cwd: string) => string;
  todosDir: (cwd: string) => string;
  quickDir: (cwd: string) => string;
  standardsDir: (cwd: string) => string;
};

const { inferCeremonyLevel } = require('./base') as {
  inferCeremonyLevel: (config: GrdConfig, phaseInfo: PhaseInfo | null, cwd: string) => string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Try to find and read a file matching a suffix in a phase directory. */
function _readPhaseFile(cwd: string, phaseDir: string, suffix: string): string | null {
  const phaseDirFull = path.join(cwd, phaseDir);
  try {
    const files: string[] = fs.readdirSync(phaseDirFull);
    const match = files.find(
      (f: string) => f.endsWith(suffix) || f === suffix.replace(/^-/, '')
    );
    if (match) return safeReadMarkdown(path.join(phaseDirFull, match));
  } catch {
    // Phase directory may not exist yet
  }
  return null;
}

// ─── Execute-Phase Init ──────────────────────────────────────────────────────

/**
 * CLI command: Initialize execute-phase context with models, config, phase info, and plan inventory.
 */
function cmdInitExecutePhase(
  cwd: string,
  phase: string,
  includes: Set<string>,
  raw: boolean
): void {
  if (!phase) {
    error('phase required for init execute-phase. Usage: init execute-phase <phase-number>. Run `grd-tools roadmap get-phase` to list available phases, then pass the phase number, e.g.: init execute-phase 2');
    return;
  }

  // Pre-flight gate checks
  const gates = runPreflightGates(cwd, 'execute-phase', { phase });
  if (!gates.passed) {
    output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw);
    return;
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const milestone = getMilestoneInfo(cwd);
  const webmcp = detectWebMcp(cwd);

  const result: Record<string, unknown> = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Models
    executor_model: resolveModelInternal(cwd, 'grd-executor'),
    verifier_model: resolveModelInternal(cwd, 'grd-verifier'),
    reviewer_model: resolveModelInternal(cwd, 'grd-code-reviewer'),

    // Config flags
    commit_docs: config.commit_docs,
    parallelization: config.parallelization,
    branching_strategy: config.branching_strategy,
    phase_branch_template: config.phase_branch_template,
    milestone_branch_template: config.milestone_branch_template,
    base_branch: config.branching_strategy !== 'none' ? config.base_branch : null,
    verifier_enabled: config.verifier,

    // Code review config
    code_review_enabled: config.code_review_enabled,
    code_review_timing: config.code_review_timing,
    code_review_severity_gate: config.code_review_severity_gate,
    code_review_auto_fix_warnings: config.code_review_auto_fix_warnings,

    // Execution config
    use_teams: config.use_teams,
    team_timeout_minutes: config.team_timeout_minutes,
    max_concurrent_teammates: config.max_concurrent_teammates,

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    phase_slug: phaseInfo?.phase_slug || null,

    // Plan inventory
    plans: phaseInfo?.plans || [],
    summaries: phaseInfo?.summaries || [],
    incomplete_plans: phaseInfo?.incomplete_plans || [],
    plan_count: phaseInfo?.plans?.length || 0,
    incomplete_count: phaseInfo?.incomplete_plans?.length || 0,

    // Branch name (pre-computed)
    branch_name:
      config.branching_strategy === 'phase' && phaseInfo
        ? config.phase_branch_template
            .replace('{milestone}', milestone.version)
            .replace('{phase}', phaseInfo.phase_number)
            .replace('{slug}', phaseInfo.phase_slug || 'phase')
        : config.branching_strategy === 'milestone'
          ? config.milestone_branch_template
              .replace('{milestone}', milestone.version)
              .replace('{slug}', generateSlugInternal(milestone.name) || 'milestone')
          : null,

    // Worktree fields (computed, not created)
    worktree_path: phaseInfo
      ? worktreePath(cwd, milestone.version, phaseInfo.phase_number)
      : null,
    worktree_branch:
      config.branching_strategy !== 'none' && phaseInfo
        ? (config.phase_branch_template || 'grd/{milestone}/{phase}-{slug}')
            .replace('{milestone}', milestone.version)
            .replace('{phase}', phaseInfo.phase_number)
            .replace('{slug}', phaseInfo.phase_slug || 'phase')
        : null,

    // Milestone branch (phase branches fork from this, merge back into it)
    milestone_branch:
      config.branching_strategy !== 'none'
        ? (config.milestone_branch_template || 'grd/{milestone}-{slug}')
            .replace('{milestone}', milestone.version)
            .replace('{slug}', generateSlugInternal(milestone.name) || 'milestone')
        : null,

    // Predecessor branch for stacked PRs
    predecessor_branch: (() => {
      if (config.branching_strategy !== 'phase' || !phaseInfo) return null;
      const phaseNum = parseInt(phaseInfo.phase_number, 10);
      if (isNaN(phaseNum) || phaseNum <= 1) return null;

      const baseBranch = config.base_branch || 'main';
      const template = config.phase_branch_template || 'grd/{milestone}/{phase}-{slug}';
      const prefix = template
        .replace('{milestone}', milestone.version)
        .replace('{phase}', '')
        .replace('{slug}', '');

      const branchList = execGit(cwd, ['branch', '--list', '--format', '%(refname:short)']);
      if (branchList.exitCode !== 0) return null;

      const localBranches = branchList.stdout.trim().split('\n').filter(Boolean);
      const milestonePrefix = prefix.split('/').slice(0, -1).join('/');

      let bestBranch: string | null = null;
      let bestPhaseNum = 0;
      for (const br of localBranches) {
        if (!br.startsWith(milestonePrefix + '/')) continue;
        const suffix = br.slice(milestonePrefix.length + 1);
        const match = suffix.match(/^(\d+)-/);
        if (!match) continue;
        const brPhaseNum = parseInt(match[1], 10);
        if (brPhaseNum >= phaseNum || brPhaseNum <= bestPhaseNum) continue;
        const merged = execGit(cwd, ['merge-base', '--is-ancestor', br, baseBranch]);
        if (merged.exitCode === 0) continue;
        bestBranch = br;
        bestPhaseNum = brPhaseNum;
      }
      return bestBranch;
    })(),

    // Milestone info
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlugInternal(milestone.name),

    // File existence
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    config_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'config.json')),
    principles_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PRINCIPLES.md')),
    standards_exists: fs.existsSync(path.join(getStandardsDirPath(cwd), 'index.yml')),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
    standards_dir: path.relative(cwd, getStandardsDirPath(cwd)),

    // Ceremony level
    ceremony_level: inferCeremonyLevel(config, phaseInfo, cwd),

    // WebMCP availability (REQ-96)
    webmcp_available: webmcp.available,
    webmcp_skip_reason: webmcp.available ? null : webmcp.reason,

    // Native worktree isolation capability (Phase 45)
    native_worktree_available:
      getBackendCapabilities(backend).native_worktree_isolation === true,

    // Isolation mode and main repo path (Phase 46)
    isolation_mode:
      config.branching_strategy === 'none'
        ? 'none'
        : getBackendCapabilities(backend).native_worktree_isolation === true
          ? 'native'
          : 'manual',
    main_repo_path: config.branching_strategy !== 'none' ? fs.realpathSync(cwd) : null,
  };

  // Include gate warnings if any
  if (gates.warnings.length > 0) {
    result.gate_warnings = gates.warnings;
  }

  // Include file contents if requested via --include
  if (includes.has('state')) {
    result.state_content = safeReadMarkdown(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes.has('config')) {
    result.config_content = safeReadFile(path.join(cwd, '.planning', 'config.json'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadMarkdown(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes.has('principles')) {
    result.principles_content = safeReadMarkdown(path.join(cwd, '.planning', 'PRINCIPLES.md'));
  }
  if (includes.has('context') && phaseInfo?.directory) {
    const ctx = _readPhaseFile(cwd, phaseInfo.directory, '-CONTEXT.md');
    if (ctx) result.context_content = ctx;
  }

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}, milestone: ${result.milestone_version}`);
}

// ─── Plan-Phase Init ─────────────────────────────────────────────────────────

/**
 * CLI command: Initialize plan-phase context with models, workflow flags, and existing artifacts.
 */
function cmdInitPlanPhase(
  cwd: string,
  phase: string,
  includes: Set<string>,
  raw: boolean
): void {
  if (!phase) {
    error('phase required for init plan-phase. Usage: init plan-phase <phase-number>. Pass the phase number as an argument, e.g.: init plan-phase 01');
    return;
  }

  const gates = runPreflightGates(cwd, 'plan-phase', { phase });
  if (!gates.passed) {
    output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw);
    return;
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const webmcp = detectWebMcp(cwd);

  const result: Record<string, unknown> = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Models
    researcher_model: resolveModelInternal(cwd, 'grd-phase-researcher'),
    planner_model: resolveModelInternal(cwd, 'grd-planner'),
    checker_model: resolveModelInternal(cwd, 'grd-plan-checker'),

    // Workflow flags
    research_enabled: config.research,
    plan_checker_enabled: config.plan_checker,
    commit_docs: config.commit_docs,

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    phase_slug: phaseInfo?.phase_slug || null,
    padded_phase: phaseInfo?.phase_number?.padStart(2, '0') || null,

    // Existing artifacts
    has_research: phaseInfo?.has_research || false,
    has_context: phaseInfo?.has_context || false,
    has_plans: (phaseInfo?.plans?.length || 0) > 0,
    plan_count: phaseInfo?.plans?.length || 0,

    // Environment
    planning_exists: pathExistsInternal(cwd, '.planning'),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    principles_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PRINCIPLES.md')),
    standards_exists: fs.existsSync(path.join(getStandardsDirPath(cwd), 'index.yml')),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
    standards_dir: path.relative(cwd, getStandardsDirPath(cwd)),

    // Ceremony level
    ceremony_level: inferCeremonyLevel(config, phaseInfo, cwd),

    // WebMCP availability (REQ-96)
    webmcp_available: webmcp.available,
    webmcp_skip_reason: webmcp.available ? null : webmcp.reason,
  };

  if (gates.warnings.length > 0) { result.gate_warnings = gates.warnings; }

  // Include file contents if requested via --include
  if (includes.has('state')) {
    result.state_content = safeReadMarkdown(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadMarkdown(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes.has('requirements')) {
    result.requirements_content = safeReadMarkdown(path.join(cwd, '.planning', 'REQUIREMENTS.md'));
  }
  if (includes.has('context') && phaseInfo?.directory) {
    const ctx = _readPhaseFile(cwd, phaseInfo.directory, '-CONTEXT.md');
    if (ctx) result.context_content = ctx;
  }
  if (includes.has('research') && phaseInfo?.directory) {
    const res = _readPhaseFile(cwd, phaseInfo.directory, '-RESEARCH.md');
    if (res) result.research_content = res;
  }
  if (includes.has('verification') && phaseInfo?.directory) {
    const ver = _readPhaseFile(cwd, phaseInfo.directory, '-VERIFICATION.md');
    if (ver) result.verification_content = ver;
  }
  if (includes.has('uat') && phaseInfo?.directory) {
    const uat = _readPhaseFile(cwd, phaseInfo.directory, '-UAT.md');
    if (uat) result.uat_content = uat;
  }
  if (includes.has('principles')) {
    result.principles_content = safeReadMarkdown(path.join(cwd, '.planning', 'PRINCIPLES.md'));
  }

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}`);
}

// ─── Verify-Work Init ────────────────────────────────────────────────────────

/**
 * CLI command: Initialize verify-work context with phase info and verification artifact status.
 */
function cmdInitVerifyWork(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('phase required for init verify-work');
    return;
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const webmcp = detectWebMcp(cwd);

  const result: Record<string, unknown> = {
    backend,
    backend_capabilities: getBackendCapabilities(backend),
    planner_model: resolveModelInternal(cwd, 'grd-planner'),
    checker_model: resolveModelInternal(cwd, 'grd-plan-checker'),
    commit_docs: config.commit_docs,
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    has_verification: phaseInfo?.has_verification || false,
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
    webmcp_available: webmcp.available,
    webmcp_skip_reason: webmcp.available ? null : webmcp.reason,
  };

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}`);
}

// ─── Code-Review Init ────────────────────────────────────────────────────────

/**
 * CLI command: Initialize code-review context with phase plans, summaries, and reviewer model.
 */
function cmdInitCodeReview(cwd: string, phase: string, raw: boolean): void {
  if (!phase) {
    error('phase required for init code-review. Usage: init code-review <phase-number>. Provide a phase number, e.g.: init code-review 2');
    return;
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const planningDir = getPlanningDir(cwd);

  const result: Record<string, unknown> = {
    backend,
    backend_capabilities: getBackendCapabilities(backend),
    reviewer_model: resolveModelInternal(cwd, 'grd-code-reviewer'),
    code_review_enabled: config.code_review_enabled,
    code_review_timing: config.code_review_timing,
    code_review_severity_gate: config.code_review_severity_gate,
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    plans: phaseInfo?.plans || [],
    summaries: phaseInfo?.summaries || [],
    plan_count: phaseInfo?.plans?.length || 0,
    summary_count: phaseInfo?.summaries?.length || 0,
    has_research: phaseInfo?.has_research || false,
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    requirements_exists: pathExistsInternal(cwd, path.join(planningDir, 'REQUIREMENTS.md')),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}, plans: ${result.plan_count}`);
}

// ─── Phase-Research Init ─────────────────────────────────────────────────────

/**
 * CLI command: Initialize phase-research context with research files and phase details.
 */
function cmdInitPhaseResearch(
  cwd: string,
  phase: string,
  includes: Set<string>,
  raw: boolean
): void {
  if (!phase) {
    error('phase required for init phase-research. Usage: init phase-research <phase-number>. Provide a phase number, e.g.: init phase-research 2');
    return;
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);

  const result: Record<string, unknown> = {
    backend,
    backend_capabilities: getBackendCapabilities(backend),
    researcher_model: resolveModelForAgent(config, 'researcher'),
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    knowhow_exists: fs.existsSync(path.join(researchDir, 'KNOWHOW.md')),
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    requirements_exists: pathExistsInternal(cwd, path.join(planningDir, 'REQUIREMENTS.md')),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, researchDir),
  };

  // Include file contents if requested
  if (includes.has('landscape')) {
    result.landscape_content = safeReadMarkdown(path.join(researchDir, 'LANDSCAPE.md'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadMarkdown(path.join(planningDir, 'ROADMAP.md'));
  }
  if (includes.has('state')) {
    result.state_content = safeReadMarkdown(path.join(planningDir, 'STATE.md'));
  }

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}`);
}

module.exports = {
  cmdInitExecutePhase,
  cmdInitPlanPhase,
  cmdInitVerifyWork,
  cmdInitCodeReview,
  cmdInitPhaseResearch,
};
