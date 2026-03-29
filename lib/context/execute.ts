'use strict';

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
  fs,
  path,
  safeReadFile,
  safeReadMarkdown,
  loadConfig,
  findPhaseInternal,
  resolveModelInternal,
  pathExistsInternal,
  generateSlugInternal,
  getMilestoneInfo,
  resolveModelForAgent,
  resolveEffortForAgent,
  execGit,
  output,
  error,
}: {
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
  resolveEffortForAgent: (config: GrdConfig, agentType: string, cwd?: string) => string | null;
  execGit: (cwd: string, args: string[], opts?: { allowBlocked?: boolean }) => ExecGitResult;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (msg: string) => never;
} = require('../utils');

const {
  detectBackend,
  getBackendCapabilities,
  detectWebMcp,
  detectAvailableBackends,
}: {
  detectBackend: (cwd: string) => string;
  getBackendCapabilities: (b: string) => BackendCapabilities;
  detectWebMcp: (cwd: string) => WebMcpResult;
  detectAvailableBackends: (cwd?: string) => Record<string, import('../types').BackendAvailability>;
} = require('../backend');

const {
  detectOverstory,
  loadOverstoryConfig,
}: {
  detectOverstory: (
    cwd: string,
    preloadedConfig?: import('../types').OverstoryConfig
  ) => import('../types').OverstoryInfo | null;
  loadOverstoryConfig: (cwd: string) => import('../types').OverstoryConfig;
} = require('../overstory');

const {
  worktreePath,
}: {
  worktreePath: (cwd: string, m: string, p: string) => string;
} = require('../worktree');

const {
  runPreflightGates,
}: {
  runPreflightGates: (cwd: string, cmd: string, opts?: Record<string, unknown>) => PreflightResult;
} = require('../gates');

const {
  buildKnowledgeInjectionBlock,
  extractModuleHints,
}: {
  buildKnowledgeInjectionBlock: (cwd: string, phaseNum: string, moduleHints?: string[]) => string;
  extractModuleHints: (phaseDir: string) => string[];
} = require('../knowledge');

const {
  freezeInterfaces,
}: {
  freezeInterfaces: (dag: import('../types').ArtifactDAG) => import('../types').FrozenInterface[];
} = require('../got');

const {
  buildArtifactDAG,
}: {
  buildArtifactDAG: (plans: import('../types').PlanArtifact[]) => import('../types').ArtifactDAG;
} = require('../deps');

const {
  planningDir: getPlanningDir,
  phasesDir: getPhasesDirPath,
  researchDir: getResearchDirPath,
  codebaseDir: getCodebaseDirPath,
  todosDir: getTodosDirPath,
  quickDir: getQuickDirPath,
  standardsDir: getStandardsDirPath,
}: {
  planningDir: (cwd: string) => string;
  phasesDir: (cwd: string) => string;
  researchDir: (cwd: string) => string;
  codebaseDir: (cwd: string) => string;
  todosDir: (cwd: string) => string;
  quickDir: (cwd: string) => string;
  standardsDir: (cwd: string) => string;
} = require('../paths');

const {
  inferCeremonyLevel,
}: {
  inferCeremonyLevel: (config: GrdConfig, phaseInfo: PhaseInfo | null, cwd: string) => string;
} = require('./base');

const {
  extractFrontmatter,
}: {
  extractFrontmatter: (content: string) => import('../types').FrontmatterObject;
} = require('../frontmatter');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Detect whether modelOverrides is configured in Claude settings. */
function _detectModelOverridesActive(cwd: string): boolean {
  try {
    const locations = [
      path.join(cwd, '.claude', 'settings.json'),
      path.join(process.env.HOME || '', '.claude', 'settings.json'),
    ];
    for (const loc of locations) {
      if (!fs.existsSync(loc)) continue;
      const data = JSON.parse(fs.readFileSync(loc, 'utf-8'));
      if (
        data &&
        typeof data === 'object' &&
        data.modelOverrides &&
        typeof data.modelOverrides === 'object' &&
        Object.keys(data.modelOverrides).length > 0
      ) {
        return true;
      }
    }
    return false;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR' && !(err instanceof SyntaxError)) {
      process.stderr.write(
        `[grd] WARNING: failed to detect model overrides: ${(err as Error).message}\n`
      );
    }
    return false;
  }
}

/** Try to find and read a file matching a suffix in a phase directory. */
function _readPhaseFile(cwd: string, phaseDir: string, suffix: string): string | null {
  const phaseDirFull = path.join(cwd, phaseDir);
  try {
    const files: string[] = fs.readdirSync(phaseDirFull);
    const match = files.find((f: string) => f.endsWith(suffix) || f === suffix.replace(/^-/, ''));
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
    error(
      'phase required for init execute-phase. Usage: init execute-phase <phase-number>. Run `grd-tools roadmap get-phase` to list available phases, then pass the phase number, e.g.: init execute-phase 2'
    );
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
  const backendCaps = getBackendCapabilities(backend);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const milestone = getMilestoneInfo(cwd);
  const webmcp = detectWebMcp(cwd);
  const overstoryConfig = backend === 'overstory' ? loadOverstoryConfig(cwd) : null;

  // Cache detectAvailableBackends result to avoid multiple calls
  const availableBackends = detectAvailableBackends(cwd);

  const result: Record<string, unknown> = {
    // Backend
    backend,
    backend_capabilities: backendCaps,

    // MCP elicitation and model overrides awareness (REQ-105, REQ-106)
    mcp_elicitation_available: backendCaps.mcp_elicitation === true,
    model_overrides_available: _detectModelOverridesActive(cwd),

    // Models
    executor_model: resolveModelInternal(cwd, 'grd-executor'),
    verifier_model: resolveModelInternal(cwd, 'grd-verifier'),
    reviewer_model: resolveModelInternal(cwd, 'grd-code-reviewer'),

    // Effort levels (null if backend does not support effort)
    executor_effort: resolveEffortForAgent(config, 'grd-executor', cwd),
    verifier_effort: resolveEffortForAgent(config, 'grd-verifier', cwd),
    reviewer_effort: resolveEffortForAgent(config, 'grd-code-reviewer', cwd),

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

    // Discussion & review config
    discussion_before_execution: config.discussion?.before_execution ?? false,
    discussion_enabled: config.discussion?.enabled ?? true,
    brainstormer_backend: config.backend_roles?.brainstormer ?? null,
    brainstormer_available: (() => {
      const brainstormer = config.backend_roles?.brainstormer ?? null;
      if (!brainstormer) return false;
      return availableBackends[brainstormer]?.available === true;
    })(),
    reviewer_backend: config.backend_roles?.reviewer ?? null,
    reviewer_available: (() => {
      const reviewer = config.backend_roles?.reviewer ?? null;
      if (!reviewer) return false;
      return availableBackends[reviewer]?.available === true;
    })(),
    pr_review_enabled: config.code_review_enabled === true && !!(config.backend_roles?.reviewer),

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

    // Write-intent manifests (REQ-167): files each plan declares it will modify
    plan_files_modified: (() => {
      if (!phaseInfo?.plans || !phaseInfo?.directory) return {};
      const phaseDirFull = path.join(cwd, phaseInfo.directory);
      const result: Record<string, string[]> = {};
      for (const planFile of phaseInfo.plans) {
        // Derive plan ID from filename: "89-01-PLAN.md" -> "89-01"
        const planId = planFile.replace(/-PLAN\.md$/i, '');
        const planPath = path.join(phaseDirFull, planFile);
        try {
          const planContent = fs.readFileSync(planPath, 'utf-8') as string;
          const fm = extractFrontmatter(planContent);
          const filesModified = fm.files_modified;
          if (Array.isArray(filesModified)) {
            result[planId] = filesModified as string[];
          } else {
            result[planId] = [];
          }
        } catch {
          result[planId] = [];
        }
      }
      return result;
    })(),

    // Knowledge injection (NERFIFY): inject prior-phase patterns into executor context
    knowhow_block: (() => {
      if (!phaseInfo?.directory || !phaseInfo?.phase_number) return null;
      const hints = extractModuleHints(path.join(cwd, phaseInfo.directory));
      const block = buildKnowledgeInjectionBlock(cwd, phaseInfo.phase_number, hints);
      return block || null;
    })(),

    // GoT frozen interfaces (NERFIFY): artifact contracts from plan DAG
    frozen_interfaces: (() => {
      if (!phaseInfo?.plans || !phaseInfo?.directory || !phaseInfo?.phase_number) return [];
      const phaseDirFull = path.join(cwd, phaseInfo.directory);
      const planArtifacts: import('../types').PlanArtifact[] = [];
      for (let i = 0; i < phaseInfo.plans.length; i++) {
        const planFile = phaseInfo.plans[i];
        const planPath = path.join(phaseDirFull, planFile);
        try {
          const planContent = fs.readFileSync(planPath, 'utf-8') as string;
          const fm = extractFrontmatter(planContent);
          planArtifacts.push({
            objective: (fm.objective as string) || '',
            files_modified: (fm.files_modified as string[]) || [],
            phase: phaseInfo.phase_number,
            plan: i + 1,
            type: (fm.type as string) || 'implementation',
            wave: (fm.wave as number) || 1,
            depends_on: (fm.depends_on as string[]) || [],
            autonomous: (fm.autonomous as boolean) ?? true,
            provides: (fm.provides as string[]) || [],
            requires: (fm.requires as string[]) || [],
            integration_points: (fm.integration_points as string[]) || [],
          });
        } catch {
          // Plan file may not have artifact declarations
        }
      }
      if (planArtifacts.length === 0) return [];
      try {
        const dag = buildArtifactDAG(planArtifacts);
        return freezeInterfaces(dag);
      } catch {
        return [];
      }
    })(),

    // Branch name (pre-computed)
    branch_name:
      config.branching_strategy === 'phase' && phaseInfo
        ? (config.phase_branch_template || 'grd/{milestone}/{phase}-{slug}')
            .replace('{milestone}', milestone.version)
            .replace('{phase}', phaseInfo.phase_number)
            .replace('{slug}', phaseInfo.phase_slug || 'phase')
        : config.branching_strategy === 'milestone'
          ? (config.milestone_branch_template || 'grd/{milestone}-{slug}')
              .replace('{milestone}', milestone.version)
              .replace('{slug}', generateSlugInternal(milestone.name) || 'milestone')
          : null,

    // Worktree fields (computed, not created)
    worktree_path: phaseInfo ? worktreePath(cwd, milestone.version, phaseInfo.phase_number) : null,
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
    // For overstory, this is false — Overstory manages its own worktrees, not Claude Code
    native_worktree_available:
      backend !== 'overstory' && backendCaps.native_worktree_isolation === true,

    // Overstory backend fields (config preloaded, pass to detectOverstory to avoid re-read)
    overstory_available:
      backend === 'overstory' ? detectOverstory(cwd, overstoryConfig ?? undefined) !== null : false,
    overstory_runtime: overstoryConfig ? overstoryConfig.runtime : null,
    overstory_config: overstoryConfig,

    // Isolation mode and main repo path (Phase 46)
    isolation_mode:
      config.branching_strategy === 'none'
        ? 'none'
        : backend === 'overstory'
          ? 'overstory'
          : backendCaps.native_worktree_isolation === true
            ? 'native'
            : 'manual',
    main_repo_path:
      config.branching_strategy !== 'none'
        ? (() => {
            try {
              return fs.realpathSync(cwd);
            } catch (err) {
              process.stderr.write(
                `[grd] WARNING: realpathSync failed: ${(err as Error).message}, using raw cwd\n`
              );
              return cwd;
            }
          })()
        : null,

    // CLAUDE_PLUGIN_DATA (v2.1.78): persistent directory for cross-project plugin state.
    // When available, agents can use this for state that should survive plugin updates
    // and be shared across projects (e.g., global scheduler config, evolve history).
    // .planning/ remains the source of truth for project-scoped state.
    plugin_data_available: !!process.env.CLAUDE_PLUGIN_DATA,
    plugin_data_dir: process.env.CLAUDE_PLUGIN_DATA || null,
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

  output(
    result,
    raw,
    `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}, milestone: ${result.milestone_version}`
  );
}

// ─── Plan-Phase Init ─────────────────────────────────────────────────────────

/**
 * CLI command: Initialize plan-phase context with models, workflow flags, and existing artifacts.
 */
function cmdInitPlanPhase(cwd: string, phase: string, includes: Set<string>, raw: boolean): void {
  if (!phase) {
    error(
      'phase required for init plan-phase. Usage: init plan-phase <phase-number>. Pass the phase number as an argument, e.g.: init plan-phase 01'
    );
    return;
  }

  const gates = runPreflightGates(cwd, 'plan-phase', { phase });
  if (!gates.passed) {
    output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw);
    return;
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const backendCaps = getBackendCapabilities(backend);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const webmcp = detectWebMcp(cwd);
  const availableBackendsPlan = detectAvailableBackends(cwd);

  const result: Record<string, unknown> = {
    // Backend
    backend,
    backend_capabilities: backendCaps,

    // MCP elicitation and model overrides awareness (REQ-105, REQ-106)
    mcp_elicitation_available: backendCaps.mcp_elicitation === true,
    model_overrides_available: _detectModelOverridesActive(cwd),

    // Models
    researcher_model: resolveModelInternal(cwd, 'grd-phase-researcher'),
    planner_model: resolveModelInternal(cwd, 'grd-planner'),
    checker_model: resolveModelInternal(cwd, 'grd-plan-checker'),

    // Effort levels (null if backend does not support effort)
    researcher_effort: resolveEffortForAgent(config, 'grd-phase-researcher', cwd),
    planner_effort: resolveEffortForAgent(config, 'grd-planner', cwd),
    checker_effort: resolveEffortForAgent(config, 'grd-plan-checker', cwd),

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

    // CLAUDE_PLUGIN_DATA (v2.1.78): persistent directory for cross-project plugin state.
    // When available, agents can use this for state that should survive plugin updates
    // and be shared across projects (e.g., global scheduler config, evolve history).
    // .planning/ remains the source of truth for project-scoped state.
    plugin_data_available: !!process.env.CLAUDE_PLUGIN_DATA,
    plugin_data_dir: process.env.CLAUDE_PLUGIN_DATA || null,

    // Knowledge injection (NERFIFY): inject prior-phase patterns into planner/researcher context
    knowhow_block: (() => {
      if (!phaseInfo?.phase_number) return null;
      const phaseDir = phaseInfo.directory ? path.join(cwd, phaseInfo.directory) : null;
      const hints = phaseDir ? extractModuleHints(phaseDir) : [];
      const block = buildKnowledgeInjectionBlock(cwd, phaseInfo.phase_number, hints);
      return block || null;
    })(),

    // Citation traversal config
    transitive_citation_gate_enabled: !!(config as unknown as Record<string, unknown>).transitive_citation_gate,

    // Discussion & review config
    discussion_before_planning: config.discussion?.before_planning ?? true,
    discussion_enabled: config.discussion?.enabled ?? true,
    brainstormer_backend: config.backend_roles?.brainstormer ?? null,
    brainstormer_available: (() => {
      const brainstormer = config.backend_roles?.brainstormer ?? null;
      if (!brainstormer) return false;
      return availableBackendsPlan[brainstormer]?.available === true;
    })(),
    reviewer_backend: config.backend_roles?.reviewer ?? null,
    reviewer_available: (() => {
      const reviewer = config.backend_roles?.reviewer ?? null;
      if (!reviewer) return false;
      return availableBackendsPlan[reviewer]?.available === true;
    })(),
  };

  if (gates.warnings.length > 0) {
    result.gate_warnings = gates.warnings;
  }

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
    planner_effort: resolveEffortForAgent(config, 'grd-planner', cwd),
    checker_model: resolveModelInternal(cwd, 'grd-plan-checker'),
    checker_effort: resolveEffortForAgent(config, 'grd-plan-checker', cwd),
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
    standards_dir: path.relative(cwd, getStandardsDirPath(cwd)),
    standards_exists: fs.existsSync(path.join(getStandardsDirPath(cwd), 'index.yml')),
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
    error(
      'phase required for init code-review. Usage: init code-review <phase-number>. Provide a phase number, e.g.: init code-review 2'
    );
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
    reviewer_effort: resolveEffortForAgent(config, 'grd-code-reviewer', cwd),
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

  output(
    result,
    raw,
    `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}, plans: ${result.plan_count}`
  );
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
    error(
      'phase required for init phase-research. Usage: init phase-research <phase-number>. Provide a phase number, e.g.: init phase-research 2'
    );
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
    researcher_model: resolveModelForAgent(config, 'grd-phase-researcher'),
    researcher_effort: resolveEffortForAgent(config, 'grd-phase-researcher', cwd),
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
