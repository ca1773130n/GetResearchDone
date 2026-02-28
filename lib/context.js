/**
 * GRD Context / Init Workflows — Context loading for all 20 workflow initializers
 *
 * Extracted from bin/grd-tools.js during Phase 3 modularization.
 * Each cmdInit* function loads config, phase info, model resolution, and file existence
 * to provide a comprehensive context JSON for Claude Code workflow agents.
 */

'use strict';

const {
  fs,
  path,
  safeReadFile,
  safeReadMarkdown,
  loadConfig,
  findCodeFiles,
  resolveModelInternal,
  findPhaseInternal,
  pathExistsInternal,
  generateSlugInternal,
  getMilestoneInfo,
  resolveModelForAgent,
  execGit,
  output,
  error,
} = require('./utils');
const { detectBackend, getBackendCapabilities, detectWebMcp } = require('./backend');
const { worktreePath } = require('./worktree');
const { runPreflightGates } = require('./gates');
const {
  planningDir: getPlanningDir,
  phasesDir: getPhasesDirPath,
  researchDir: getResearchDirPath,
  codebaseDir: getCodebaseDirPath,
  todosDir: getTodosDirPath,
  quickDir: getQuickDirPath,
  milestonesDir: getMilestonesDirPath,
  standardsDir: getStandardsDirPath,
} = require('./paths');

/**
 * Infer ceremony level from phase context signals.
 * @param {Object} config - Project config
 * @param {Object|null} phaseInfo - Phase info from findPhaseInternal
 * @param {string} cwd - Project working directory
 * @returns {string} 'light' | 'standard' | 'full'
 */
function inferCeremonyLevel(config, phaseInfo, cwd) {
  // User override: config.ceremony.default_level
  const ceremony = config.ceremony || {};
  if (ceremony.default_level && ceremony.default_level !== 'auto') {
    return ceremony.default_level;
  }

  // Per-phase override
  if (phaseInfo && phaseInfo.phase_number && ceremony.phase_overrides) {
    const override =
      ceremony.phase_overrides[phaseInfo.phase_number] ||
      ceremony.phase_overrides[String(parseInt(phaseInfo.phase_number, 10))];
    if (override) return override;
  }

  // Auto-inference from signals
  if (!phaseInfo) return 'standard';

  const planCount = (phaseInfo.plans && phaseInfo.plans.length) || 0;
  const hasResearch = phaseInfo.has_research || false;

  // Check for eval targets in roadmap description
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  let hasEvalTargets = false;
  try {
    const roadmap = safeReadFile(roadmapPath) || '';
    const phaseNum = parseInt(phaseInfo.phase_number, 10);
    const phasePattern = new RegExp('## Phase ' + phaseNum + '[^#]*', 's');
    const phaseSection = (roadmap.match(phasePattern) || [])[0] || '';
    hasEvalTargets = /eval|experiment|metric|target|baseline/i.test(phaseSection);
  } catch (_e) {
    /* ignore */
  }

  if (planCount >= 5 || hasEvalTargets) return 'full';
  if (planCount >= 2 || hasResearch) return 'standard';
  return 'light';
}

/**
 * Build a base init context object with common fields shared across all cmdInit* functions.
 * Loads backend, milestone, and path info; merges in caller-supplied overrides.
 * Does NOT call output() — that responsibility stays in each cmdInit* function.
 * @param {string} cwd - Project working directory
 * @param {Object} overrides - Additional fields to merge into the base context
 * @returns {Object} Merged context object
 */
function buildInitContext(cwd, overrides) {
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);
  const phases_dir = path.relative(cwd, getPhasesDirPath(cwd));
  const research_dir = path.relative(cwd, getResearchDirPath(cwd));
  return {
    backend,
    backend_capabilities: getBackendCapabilities(backend),
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    phases_dir,
    research_dir,
    ...overrides,
  };
}

// ─── Core Workflow Init Functions ─────────────────────────────────────────────

/**
 * CLI command: Initialize execute-phase context with models, config, phase info, and plan inventory.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to initialize context for
 * @param {Set<string>} includes - Set of content sections to include (e.g., 'state', 'config', 'roadmap')
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs execute-phase context to stdout and exits
 */
function cmdInitExecutePhase(cwd, phase, includes, raw) {
  if (!phase) {
    error('phase required for init execute-phase. Usage: init execute-phase <phase-number>. Run `grd-tools roadmap get-phase` to list available phases, then pass the phase number, e.g.: init execute-phase 2');
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

  const result = {
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

    // Worktree fields (computed, not created — execute-phase command creates the worktree)
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

    // Predecessor branch for stacked PRs (find previous phase's unmerged branch)
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

      // Scan local branches for predecessor phases (N-1, N-2, ...) in this milestone
      const branchList = execGit(cwd, ['branch', '--list', '--format', '%(refname:short)']);
      if (branchList.exitCode !== 0) return null;

      const localBranches = branchList.stdout.trim().split('\n').filter(Boolean);
      const milestonePrefix = prefix.split('/').slice(0, -1).join('/'); // e.g., 'grd/v0.2.1'

      // Find the highest-numbered predecessor phase branch
      let bestBranch = null;
      let bestPhaseNum = 0;
      for (const br of localBranches) {
        if (!br.startsWith(milestonePrefix + '/')) continue;
        const suffix = br.slice(milestonePrefix.length + 1); // e.g., '35-migration-script'
        const match = suffix.match(/^(\d+)-/);
        if (!match) continue;
        const brPhaseNum = parseInt(match[1], 10);
        if (brPhaseNum >= phaseNum) continue; // only predecessors
        if (brPhaseNum <= bestPhaseNum) continue;

        // Check branch is not already merged into base
        const merged = execGit(cwd, ['merge-base', '--is-ancestor', br, baseBranch]);
        if (merged.exitCode === 0) continue; // already merged, skip

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
    native_worktree_available: getBackendCapabilities(backend).native_worktree_isolation === true,

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
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const contextFile = files.find((f) => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
      if (contextFile) {
        result.context_content = safeReadMarkdown(path.join(phaseDirFull, contextFile));
      }
    } catch {
      // Phase directory may not exist yet; skip optional context file
    }
  }

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}, milestone: ${result.milestone_version}`);
}

/**
 * CLI command: Initialize plan-phase context with models, workflow flags, and existing artifacts.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to initialize context for
 * @param {Set<string>} includes - Set of content sections to include (e.g., 'state', 'roadmap', 'context', 'research')
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs plan-phase context to stdout and exits
 */
function cmdInitPlanPhase(cwd, phase, includes, raw) {
  if (!phase) {
    error('phase required for init plan-phase. Usage: init plan-phase <phase-number>. Pass the phase number as an argument, e.g.: init plan-phase 01');
  }

  // Pre-flight gate checks
  const gates = runPreflightGates(cwd, 'plan-phase', { phase });
  if (!gates.passed) {
    output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw);
    return;
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const webmcp = detectWebMcp(cwd);

  const result = {
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

  // Include gate warnings if any
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
    // Find *-CONTEXT.md in phase directory
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const contextFile = files.find((f) => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
      if (contextFile) {
        result.context_content = safeReadMarkdown(path.join(phaseDirFull, contextFile));
      }
    } catch {
      // Phase directory may not exist yet; skip optional context file
    }
  }
  if (includes.has('research') && phaseInfo?.directory) {
    // Find *-RESEARCH.md in phase directory
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const researchFile = files.find((f) => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');
      if (researchFile) {
        result.research_content = safeReadMarkdown(path.join(phaseDirFull, researchFile));
      }
    } catch {
      // Phase directory may not exist yet; skip optional research file
    }
  }
  if (includes.has('verification') && phaseInfo?.directory) {
    // Find *-VERIFICATION.md in phase directory
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const verificationFile = files.find(
        (f) => f.endsWith('-VERIFICATION.md') || f === 'VERIFICATION.md'
      );
      if (verificationFile) {
        result.verification_content = safeReadMarkdown(path.join(phaseDirFull, verificationFile));
      }
    } catch {
      // Phase directory may not exist yet; skip optional verification file
    }
  }
  if (includes.has('uat') && phaseInfo?.directory) {
    // Find *-UAT.md in phase directory
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const uatFile = files.find((f) => f.endsWith('-UAT.md') || f === 'UAT.md');
      if (uatFile) {
        result.uat_content = safeReadMarkdown(path.join(phaseDirFull, uatFile));
      }
    } catch {
      // Phase directory may not exist yet; skip optional UAT file
    }
  }
  if (includes.has('principles')) {
    result.principles_content = safeReadMarkdown(path.join(cwd, '.planning', 'PRINCIPLES.md'));
  }

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}`);
}

/**
 * CLI command: Initialize new-project context with brownfield detection and existing state checks.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs new-project context to stdout and exits
 */
function cmdInitNewProject(cwd, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);

  // Detect existing code
  let hasCode = false;
  try {
    const codeFiles = findCodeFiles(cwd, 3, [], 0);
    hasCode = codeFiles.length > 0;
  } catch {
    // Code files scan failed (e.g., permission error); assume no code files
  }

  const hasPackageFile =
    pathExistsInternal(cwd, 'package.json') ||
    pathExistsInternal(cwd, 'requirements.txt') ||
    pathExistsInternal(cwd, 'Cargo.toml') ||
    pathExistsInternal(cwd, 'go.mod') ||
    pathExistsInternal(cwd, 'Package.swift');

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Models
    researcher_model: resolveModelInternal(cwd, 'grd-project-researcher'),
    synthesizer_model: resolveModelInternal(cwd, 'grd-research-synthesizer'),
    roadmapper_model: resolveModelInternal(cwd, 'grd-roadmapper'),

    // Config
    commit_docs: config.commit_docs,

    // Existing state
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    has_codebase_map: fs.existsSync(getCodebaseDirPath(cwd)),
    planning_exists: pathExistsInternal(cwd, '.planning'),
    principles_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PRINCIPLES.md')),
    standards_exists: fs.existsSync(path.join(getStandardsDirPath(cwd), 'index.yml')),

    // Brownfield detection
    has_existing_code: hasCode,
    has_package_file: hasPackageFile,
    is_brownfield: hasCode || hasPackageFile,
    needs_codebase_map: (hasCode || hasPackageFile) && !fs.existsSync(getCodebaseDirPath(cwd)),

    // Git state
    has_git: pathExistsInternal(cwd, '.git'),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
    standards_dir: path.relative(cwd, getStandardsDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, brownfield: ${result.is_brownfield}`);
}

/**
 * CLI command: Initialize new-milestone context with current milestone info and file existence checks.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs new-milestone context to stdout and exits
 */
function cmdInitNewMilestone(cwd, raw) {
  // Pre-flight gate checks
  const gates = runPreflightGates(cwd, 'new-milestone');
  if (!gates.passed) {
    output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw);
    return;
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);

  // Scan archived milestones and current phases to suggest start phase
  let highestArchivedPhase = 0;
  let highestCurrentPhase = 0;
  const milestonesDir = getMilestonesDirPath(cwd);
  const phasesDir = getPhasesDirPath(cwd);

  try {
    const milestoneEntries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    for (const entry of milestoneEntries) {
      if (entry.isDirectory() && entry.name.endsWith('-phases')) {
        const archivedPhases = fs.readdirSync(path.join(milestonesDir, entry.name));
        for (const dir of archivedPhases) {
          const dm = dir.match(/^(\d+)/);
          if (dm) {
            const num = parseInt(dm[1], 10);
            if (num > highestArchivedPhase) highestArchivedPhase = num;
          }
        }
      }
      // Also scan new-style milestone directories: milestones/{version}/phases/
      const newStylePhasesDir = path.join(milestonesDir, entry.name, 'phases');
      if (
        entry.isDirectory() &&
        entry.name.startsWith('v') &&
        !entry.name.endsWith('-phases') &&
        fs.existsSync(newStylePhasesDir)
      ) {
        const newStylePhases = fs.readdirSync(newStylePhasesDir);
        for (const dir of newStylePhases) {
          const dm2 = dir.match(/^(\d+)/);
          if (dm2) {
            const num = parseInt(dm2[1], 10);
            if (num > highestArchivedPhase) highestArchivedPhase = num;
          }
        }
      }
    }
  } catch {
    // milestones dir may not exist
  }

  try {
    const phaseEntries = fs.readdirSync(phasesDir, { withFileTypes: true });
    for (const entry of phaseEntries) {
      if (entry.isDirectory()) {
        const dm = entry.name.match(/^(\d+)/);
        if (dm) {
          const num = parseInt(dm[1], 10);
          if (num > highestCurrentPhase) highestCurrentPhase = num;
        }
      }
    }
  } catch {
    // phases dir may not exist
  }

  const suggestedStartPhase = Math.max(highestArchivedPhase, highestCurrentPhase) + 1;

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Models
    researcher_model: resolveModelInternal(cwd, 'grd-project-researcher'),
    synthesizer_model: resolveModelInternal(cwd, 'grd-research-synthesizer'),
    roadmapper_model: resolveModelInternal(cwd, 'grd-roadmapper'),

    // Config
    commit_docs: config.commit_docs,
    research_enabled: config.research,

    // Current milestone
    current_milestone: milestone.version,
    current_milestone_name: milestone.name,

    // Phase numbering
    highest_archived_phase: highestArchivedPhase,
    highest_current_phase: highestCurrentPhase,
    suggested_start_phase: suggestedStartPhase,

    // Gate warnings
    ...(gates.warnings.length > 0 ? { gate_warnings: gates.warnings } : {}),

    // File existence
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, current milestone: ${result.current_milestone}`);
}

/**
 * CLI command: Initialize quick-task context with auto-numbered task directory and slug.
 * @param {string} cwd - Project working directory
 * @param {string|null} description - Task description for slug generation, or null
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs quick-task context to stdout and exits
 */
function cmdInitQuick(cwd, description, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const now = new Date();
  const slug = description ? generateSlugInternal(description)?.substring(0, 40) : null;

  // Find next quick task number
  const quickDir = getQuickDirPath(cwd);
  let nextNum = 1;
  try {
    const existing = fs
      .readdirSync(quickDir)
      .filter((f) => /^\d+-/.test(f))
      .map((f) => parseInt(f.split('-')[0], 10))
      .filter((n) => !isNaN(n));
    if (existing.length > 0) {
      nextNum = Math.max(...existing) + 1;
    }
  } catch {
    // Quick directory may not exist yet; start numbering from 1
  }

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Models
    planner_model: resolveModelInternal(cwd, 'grd-planner'),
    executor_model: resolveModelInternal(cwd, 'grd-executor'),

    // Config
    commit_docs: config.commit_docs,

    // Quick task info
    next_num: nextNum,
    slug: slug,
    description: description || null,

    // Timestamps
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),

    // Paths
    quick_dir: path.relative(cwd, quickDir),
    task_dir: slug ? path.relative(cwd, path.join(quickDir, `${nextNum}-${slug}`)) : null,

    // File existence
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    planning_exists: pathExistsInternal(cwd, '.planning'),
    principles_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PRINCIPLES.md')),
    standards_exists: fs.existsSync(path.join(getStandardsDirPath(cwd), 'index.yml')),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
    standards_dir: path.relative(cwd, getStandardsDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, task #${result.next_num}${result.slug ? ': ' + result.slug : ''}`);
}

/**
 * CLI command: Initialize resume context from session continuity state and interrupted agent check.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs resume context to stdout and exits
 */
function cmdInitResume(cwd, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);

  // Check for interrupted agent
  const interruptedAgentId =
    (safeReadFile(path.join(cwd, '.planning', 'current-agent-id.txt')) || '').trim() || null;

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // File existence
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // Agent state
    has_interrupted_agent: !!interruptedAgentId,
    interrupted_agent_id: interruptedAgentId,

    // Config
    commit_docs: config.commit_docs,

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}${result.has_interrupted_agent ? ', interrupted agent detected' : ''}`);
}

// ─── Operation Workflow Init Functions ────────────────────────────────────────

/**
 * CLI command: Initialize verify-work context with phase info and verification artifact status.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to verify
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs verify-work context to stdout and exits
 */
function cmdInitVerifyWork(cwd, phase, raw) {
  if (!phase) {
    error('phase required for init verify-work');
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const webmcp = detectWebMcp(cwd);

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Models
    planner_model: resolveModelInternal(cwd, 'grd-planner'),
    checker_model: resolveModelInternal(cwd, 'grd-plan-checker'),

    // Config
    commit_docs: config.commit_docs,

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,

    // Existing artifacts
    has_verification: phaseInfo?.has_verification || false,

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),

    // WebMCP availability (REQ-96)
    webmcp_available: webmcp.available,
    webmcp_skip_reason: webmcp.available ? null : webmcp.reason,
  };

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}`);
}

/**
 * CLI command: Initialize phase-operation context with phase directory info and existing artifacts.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number for the operation
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs phase-op context to stdout and exits
 */
function cmdInitPhaseOp(cwd, phase, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Config
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
    has_verification: phaseInfo?.has_verification || false,
    plan_count: phaseInfo?.plans?.length || 0,

    // File existence
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}`);
}

/**
 * CLI command: Initialize todos context with pending todo inventory and optional area filter.
 * @param {string} cwd - Project working directory
 * @param {string|null} area - Area filter for todos (e.g., 'general'), or null for all
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs todos context to stdout and exits
 */
function cmdInitTodos(cwd, area, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const now = new Date();

  // List todos (reuse existing logic)
  const todosBase = getTodosDirPath(cwd);
  const pendingDir = path.join(todosBase, 'pending');
  let count = 0;
  const todos = [];

  try {
    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
        const createdMatch = content.match(/^created:\s*(.+)$/m);
        const titleMatch = content.match(/^title:\s*(.+)$/m);
        const areaMatch = content.match(/^area:\s*(.+)$/m);
        const todoArea = areaMatch ? areaMatch[1].trim() : 'general';

        if (area && todoArea !== area) continue;

        count++;
        todos.push({
          file,
          created: createdMatch ? createdMatch[1].trim() : 'unknown',
          title: titleMatch ? titleMatch[1].trim() : 'Untitled',
          area: todoArea,
          path: path.relative(cwd, path.join(pendingDir, file)),
        });
      } catch {
        // Todo file is unreadable; skip it
      }
    }
  } catch {
    // Todos directory may not exist yet; proceed with empty list
  }

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Config
    commit_docs: config.commit_docs,

    // Timestamps
    date: now.toISOString().split('T')[0],
    timestamp: now.toISOString(),

    // Todo inventory
    todo_count: count,
    todos,
    area_filter: area || null,

    // Paths
    pending_dir: path.relative(cwd, pendingDir),
    completed_dir: path.relative(cwd, path.join(todosBase, 'completed')),

    // File existence
    planning_exists: pathExistsInternal(cwd, '.planning'),
    todos_dir_exists: fs.existsSync(todosBase),
    pending_dir_exists: fs.existsSync(pendingDir),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, todosBase),
  };

  output(result, raw, `Backend: ${result.backend}, ${result.todo_count} pending todo(s)`);
}

/**
 * CLI command: Initialize milestone-operation context with phase counts and archive status.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs milestone-op context to stdout and exits
 */
function cmdInitMilestoneOp(cwd, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);

  // Count phases
  let phaseCount = 0;
  let completedPhases = 0;
  const phasesDir = getPhasesDirPath(cwd);
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    phaseCount = dirs.length;

    // Count phases with summaries (completed)
    for (const dir of dirs) {
      try {
        const phaseFiles = fs.readdirSync(path.join(phasesDir, dir));
        const hasSummary = phaseFiles.some((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
        if (hasSummary) completedPhases++;
      } catch {
        // Phase directory may not be readable; skip it
      }
    }
  } catch {
    // Phases directory may not exist yet; use zero counts
  }

  // Check archive
  const archiveDir = path.join(cwd, '.planning', 'archive');
  let archivedMilestones = [];
  try {
    archivedMilestones = fs
      .readdirSync(archiveDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    // Archive directory may not exist yet; use empty list
  }

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Config
    commit_docs: config.commit_docs,

    // Current milestone
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlugInternal(milestone.name),

    // Phase counts
    phase_count: phaseCount,
    completed_phases: completedPhases,
    all_phases_complete: phaseCount > 0 && phaseCount === completedPhases,

    // Archive
    archived_milestones: archivedMilestones,
    archive_count: archivedMilestones.length,

    // File existence
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),
    archive_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'archive')),
    phases_dir_exists: fs.existsSync(phasesDir),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, milestone: ${result.milestone_version}, ${result.phase_count} phases`);
}

/**
 * CLI command: Initialize map-codebase context with existing maps and mapper model resolution.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs map-codebase context to stdout and exits
 */
function cmdInitMapCodebase(cwd, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);

  // Check for existing codebase maps
  const codebaseDir = getCodebaseDirPath(cwd);
  let existingMaps = [];
  try {
    existingMaps = fs.readdirSync(codebaseDir).filter((f) => f.endsWith('.md'));
  } catch {
    // Codebase maps directory may not exist yet; proceed with empty list
  }

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Models
    mapper_model: resolveModelInternal(cwd, 'grd-codebase-mapper'),

    // Config
    commit_docs: config.commit_docs,
    search_gitignored: config.search_gitignored,
    parallelization: config.parallelization,

    // Paths
    codebase_dir: path.relative(cwd, codebaseDir),

    // Existing maps
    existing_maps: existingMaps,
    has_maps: existingMaps.length > 0,

    // File existence
    planning_exists: pathExistsInternal(cwd, '.planning'),
    codebase_dir_exists: fs.existsSync(codebaseDir),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, ${result.existing_maps.length} existing map(s)`);
}

// ─── Progress Cache Helpers ──────────────────────────────────────────────────

/**
 * Return the path to the progress cache file.
 * @param {string} cwd - Project working directory
 * @returns {string} Absolute path to .planning/.cache/progress.json
 */
function _progressCachePath(cwd) {
  return path.join(cwd, '.planning', '.cache', 'progress.json');
}

/**
 * Compute an mtime-based cache key from key planning files.
 * Returns 0 if none of the files exist.
 * @param {string} cwd - Project working directory
 * @returns {number} Sum of mtimes in milliseconds, or 0
 */
function _computeProgressMtimeKey(cwd) {
  const keyFiles = [
    path.join(cwd, '.planning', 'STATE.md'),
    path.join(cwd, '.planning', 'ROADMAP.md'),
    path.join(cwd, '.planning', 'config.json'),
  ];
  let key = 0;
  for (const f of keyFiles) {
    try {
      key += fs.statSync(f).mtimeMs;
    } catch {
      // File doesn't exist — skip
    }
  }
  return key;
}

/**
 * CLI command: Initialize progress context with phase overview, current/next phase, and milestone info.
 * @param {string} cwd - Project working directory
 * @param {Set<string>} includes - Set of content sections to include (e.g., 'state', 'roadmap', 'project', 'config')
 * @param {boolean} raw - Output raw text instead of JSON
 * @param {boolean} [refresh=false] - If true, bypass cache and recompute
 * @returns {void} Outputs progress context to stdout and exits
 */
function cmdInitProgress(cwd, includes, raw, refresh) {
  // Cache: only when no includes are requested (and not bypassed by refresh)
  const noIncludes = !includes || includes.size === 0;
  if (noIncludes && !refresh) {
    const cachePath = _progressCachePath(cwd);
    let cachedHit = null;
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      const currentKey = _computeProgressMtimeKey(cwd);
      if (cached.mtime_key === currentKey && cached.data) {
        cachedHit = cached;
      }
    } catch {
      // Cache miss or invalid — recompute
    }
    if (cachedHit) {
      output(cachedHit.data, raw, `Backend: ${cachedHit.data.backend}, milestone: ${cachedHit.data.milestone_version}, ${cachedHit.data.completed_count}/${cachedHit.data.phase_count} phases complete`);
      return;
    }
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);

  // Analyze phases
  const phasesDir = getPhasesDirPath(cwd);
  const phases = [];
  let currentPhase = null;
  let nextPhase = null;

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

    for (const dir of dirs) {
      const match = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      const phaseNumber = match ? match[1] : dir;
      const phaseName = match && match[2] ? match[2] : null;

      const phasePath = path.join(phasesDir, dir);
      const phaseFiles = fs.readdirSync(phasePath);

      const plans = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md');
      const summaries = phaseFiles.filter((f) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      const hasResearch = phaseFiles.some((f) => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

      const status =
        summaries.length >= plans.length && plans.length > 0
          ? 'complete'
          : plans.length > 0
            ? 'in_progress'
            : hasResearch
              ? 'researched'
              : 'pending';

      const phaseInfo = {
        number: phaseNumber,
        name: phaseName,
        directory: path.relative(cwd, path.join(phasesDir, dir)),
        status,
        plan_count: plans.length,
        summary_count: summaries.length,
        has_research: hasResearch,
      };

      phases.push(phaseInfo);

      // Find current (first incomplete with plans) and next (first pending)
      if (!currentPhase && (status === 'in_progress' || status === 'researched')) {
        currentPhase = phaseInfo;
      }
      if (!nextPhase && status === 'pending') {
        nextPhase = phaseInfo;
      }
    }
  } catch {
    // Phases directory may not exist yet; proceed with empty phase list
  }

  // Check for paused work
  let pausedAt = null;
  const resumeState = safeReadMarkdown(path.join(cwd, '.planning', 'STATE.md'));
  if (resumeState) {
    const pauseMatch = resumeState.match(/\*\*Paused At:\*\*\s*(.+)/);
    if (pauseMatch) pausedAt = pauseMatch[1].trim();
  }

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Models
    executor_model: resolveModelInternal(cwd, 'grd-executor'),
    planner_model: resolveModelInternal(cwd, 'grd-planner'),

    // Config
    commit_docs: config.commit_docs,

    // Milestone
    milestone_version: milestone.version,
    milestone_name: milestone.name,

    // Phase overview
    phases,
    phase_count: phases.length,
    completed_count: phases.filter((p) => p.status === 'complete').length,
    in_progress_count: phases.filter((p) => p.status === 'in_progress').length,

    // Current state
    current_phase: currentPhase,
    next_phase: nextPhase,
    paused_at: pausedAt,
    has_work_in_progress: !!currentPhase,

    // File existence
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  // Include file contents if requested via --include
  if (includes && includes.has('state')) {
    result.state_content = safeReadMarkdown(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes && includes.has('roadmap')) {
    result.roadmap_content = safeReadMarkdown(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes && includes.has('project')) {
    result.project_content = safeReadMarkdown(path.join(cwd, '.planning', 'PROJECT.md'));
  }
  if (includes && includes.has('config')) {
    result.config_content = safeReadFile(path.join(cwd, '.planning', 'config.json'));
  }

  // Write cache when no includes requested
  if (noIncludes) {
    try {
      const cachePath = _progressCachePath(cwd);
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      const mtimeKey = _computeProgressMtimeKey(cwd);
      fs.writeFileSync(cachePath, JSON.stringify({ mtime_key: mtimeKey, data: result }));
    } catch {
      // Cache write failure is non-fatal
    }
  }

  output(result, raw, `Backend: ${result.backend}, milestone: ${result.milestone_version}, ${result.completed_count}/${result.phase_count} phases complete`);
}

// ─── R&D Workflow Init ────────────────────────────────────────────────────────

/**
 * CLI command: Initialize research workflow context (survey, deep-dive, feasibility, eval, etc.).
 * @param {string} cwd - Project working directory
 * @param {string} workflow - Workflow type (e.g., 'survey', 'deep-dive', 'feasibility', 'eval-plan')
 * @param {string|null} topic - Research topic or paper reference
 * @param {Set<string>} includes - Set of content sections to include (e.g., 'landscape', 'papers', 'baseline')
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs research workflow context to stdout and exits
 */
function cmdInitResearchWorkflow(cwd, workflow, topic, includes, raw) {
  const planningDir = path.join(cwd, '.planning');
  const researchDir = getResearchDirPath(cwd);
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    workflow,
    topic: topic || null,
    autonomous_mode: config.autonomous_mode || false,
    research_gates: config.research_gates || {},
    eval_config: config.eval_config || {},
    github_integration: config.github_integration || {},

    // Research files
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    benchmarks_exists: fs.existsSync(path.join(researchDir, 'BENCHMARKS.md')),
    knowhow_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'KNOWHOW.md')),
    baseline_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'BASELINE.md')),

    // Standard files
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),

    // Model resolution
    researcher_model: resolveModelForAgent(config, 'researcher'),
    planner_model: resolveModelForAgent(config, 'planner'),

    // Milestone-scoped paths (REQ-56)
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
        result.deep_dives = fs.readdirSync(deepDivesDir).filter((f) => f.endsWith('.md'));
      } else {
        result.deep_dives = [];
      }
    } catch (e) {
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

/**
 * CLI command: Initialize plan-milestone-gaps context with audit file info and phase counts.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs milestone-gaps context to stdout and exits
 */
function cmdInitPlanMilestoneGaps(cwd, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);
  const planningDir = path.join(cwd, '.planning');

  // Find the most recent audit file
  let auditFile = null;
  let auditGaps = null;
  try {
    const entries = fs
      .readdirSync(planningDir)
      .filter((f) => /^v.*-MILESTONE-AUDIT\.md$/i.test(f))
      .sort()
      .reverse();
    if (entries.length > 0) {
      auditFile = entries[0];
      const content = safeReadFile(path.join(planningDir, auditFile));
      if (content) {
        const { extractFrontmatter } = require('./frontmatter');
        const fm = extractFrontmatter(content);
        if (fm.gaps) auditGaps = fm.gaps;
      }
    }
  } catch {
    // Planning directory may not exist or audit file may be missing; proceed without gaps
  }

  // Count phases
  let phaseCount = 0;
  let highestPhase = 0;
  const phasesDir = getPhasesDirPath(cwd);
  try {
    const dirs = fs
      .readdirSync(phasesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    phaseCount = dirs.length;
    for (const dir of dirs) {
      const num = parseInt(dir.split('-')[0], 10);
      if (!isNaN(num) && num > highestPhase) highestPhase = num;
    }
  } catch {
    // Phases directory may not exist yet; use zero counts
  }

  const result = {
    // Backend
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

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, milestone: ${result.milestone_version}, ${result.phase_count} phases`);
}

/**
 * CLI command: Initialize debug context with phase info, debug files, and project state.
 * @param {string} cwd - Project working directory
 * @param {string|null} phase - Optional phase number to scope debugging
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs debug context to stdout and exits
 */
function cmdInitDebug(cwd, phase, raw) {
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;
  const planningDir = getPlanningDir(cwd);

  // Find existing debug files in .planning/
  let debugFiles = [];
  try {
    const entries = fs.readdirSync(planningDir);
    debugFiles = entries.filter((f) => f.startsWith('DEBUG-') && f.endsWith('.md'));
  } catch {
    // .planning/ may not exist
  }

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Phase scope (optional)
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,

    // Debug state
    debug_files: debugFiles,
    active_debug_file: debugFiles.length > 0 ? path.join('.planning', debugFiles[debugFiles.length - 1]) : null,

    // Project state
    milestone_version: milestone.version,
    milestone_name: milestone.name,

    // File existence
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),

    // Milestone-scoped paths
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, debug_files: ${debugFiles.length}${phase ? ', phase: ' + phase : ''}`);
}

/**
 * CLI command: Initialize integration-check context with phase inventory and deferred validations.
 * @param {string} cwd - Project working directory
 * @param {string|null} phase - Optional phase number to scope integration check
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs integration-check context to stdout and exits
 */
function cmdInitIntegrationCheck(cwd, phase, raw) {
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;
  const planningDir = getPlanningDir(cwd);

  // Count phases and summaries for scope
  const phasesDir = getPhasesDirPath(cwd);
  let phaseCount = 0;
  let summaryCount = 0;
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const phaseDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    phaseCount = phaseDirs.length;
    for (const d of phaseDirs) {
      try {
        const files = fs.readdirSync(path.join(phasesDir, d));
        summaryCount += files.filter((f) => f.endsWith('-SUMMARY.md')).length;
      } catch {
        // skip unreadable dirs
      }
    }
  } catch {
    // phases dir may not exist
  }

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Phase scope (optional)
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,

    // Scope metrics
    phase_count: phaseCount,
    summary_count: summaryCount,

    // Milestone info
    milestone_version: milestone.version,
    milestone_name: milestone.name,

    // File existence
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),

    // Milestone-scoped paths
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, milestone: ${result.milestone_version}, ${phaseCount} phases`);
}

/**
 * CLI command: Initialize migrate context with planning directory layout inventory.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs migrate context to stdout and exits
 */
function cmdInitMigrate(cwd, raw) {
  const planningDir = getPlanningDir(cwd);
  const milestonesDir = getMilestonesDirPath(cwd);

  // Inventory flat milestone files (legacy layout)
  let flatMilestoneFiles = [];
  try {
    const entries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    flatMilestoneFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => path.join(path.relative(cwd, milestonesDir), e.name));
  } catch {
    // milestones dir may not exist
  }

  // Inventory legacy phase dirs (flat under milestones, not under milestones/{version}/phases/)
  let legacyPhaseDirs = [];
  try {
    const entries = fs.readdirSync(milestonesDir, { withFileTypes: true });
    legacyPhaseDirs = entries
      .filter((e) => e.isDirectory() && /^\d{2}-/.test(e.name))
      .map((e) => path.join(path.relative(cwd, milestonesDir), e.name));
  } catch {
    // milestones dir may not exist
  }

  const result = buildInitContext(cwd, {
    // Migration scope
    flat_milestone_files: flatMilestoneFiles,
    legacy_phase_dirs: legacyPhaseDirs,
    complex_items_count: flatMilestoneFiles.length + legacyPhaseDirs.length,

    // File existence
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),

    // Paths
    planning_dir: path.relative(cwd, planningDir),
    milestones_dir: path.relative(cwd, milestonesDir),
  });

  output(result, raw, `Backend: ${result.backend}, complex_items: ${result.complex_items_count}`);
}

/**
 * CLI command: Initialize plan-check context with phase plan files and roadmap goal.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to check plans for
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs plan-check context to stdout and exits
 */
function cmdInitPlanCheck(cwd, phase, raw) {
  if (!phase) {
    error('phase required for init plan-check. Usage: init plan-check <phase-number>. Provide a phase number, e.g.: init plan-check 2');
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const planningDir = getPlanningDir(cwd);

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    checker_model: resolveModelForAgent(config, 'planner'),

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,

    // Plan artifacts
    plans: phaseInfo?.plans || [],
    plan_count: phaseInfo?.plans?.length || 0,
    has_research: phaseInfo?.has_research || false,
    has_context: phaseInfo?.has_context || false,
    has_eval: phaseInfo?.has_eval || false,

    // File existence
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    requirements_exists: pathExistsInternal(cwd, path.join(planningDir, 'REQUIREMENTS.md')),

    // Milestone-scoped paths
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}, plans: ${result.plan_count}`);
}

/**
 * CLI command: Initialize phase-research context with research files and phase details.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to research for
 * @param {Set<string>} includes - Set of content sections to include
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs phase-research context to stdout and exits
 */
function cmdInitPhaseResearch(cwd, phase, includes, raw) {
  if (!phase) {
    error('phase required for init phase-research. Usage: init phase-research <phase-number>. Provide a phase number, e.g.: init phase-research 2');
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    researcher_model: resolveModelForAgent(config, 'researcher'),

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,

    // Research files
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    knowhow_exists: fs.existsSync(path.join(researchDir, 'KNOWHOW.md')),
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),

    // File existence
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    requirements_exists: pathExistsInternal(cwd, path.join(planningDir, 'REQUIREMENTS.md')),

    // Milestone-scoped paths
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

/**
 * CLI command: Initialize code-review context with phase plans, summaries, and reviewer model.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to review code for
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs code-review context to stdout and exits
 */
function cmdInitCodeReview(cwd, phase, raw) {
  if (!phase) {
    error('phase required for init code-review. Usage: init code-review <phase-number>. Provide a phase number, e.g.: init code-review 2');
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const planningDir = getPlanningDir(cwd);

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    reviewer_model: resolveModelInternal(cwd, 'grd-code-reviewer'),

    // Config
    code_review_enabled: config.code_review_enabled,
    code_review_timing: config.code_review_timing,
    code_review_severity_gate: config.code_review_severity_gate,

    // Phase info
    phase_found: !!phaseInfo,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,

    // Plan and summary artifacts
    plans: phaseInfo?.plans || [],
    summaries: phaseInfo?.summaries || [],
    plan_count: phaseInfo?.plans?.length || 0,
    summary_count: phaseInfo?.summaries?.length || 0,
    has_research: phaseInfo?.has_research || false,

    // File existence
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    requirements_exists: pathExistsInternal(cwd, path.join(planningDir, 'REQUIREMENTS.md')),

    // Milestone-scoped paths
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}, plans: ${result.plan_count}`);
}

/**
 * CLI command: Initialize assess-baseline context for grd-baseline-assessor agent.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs baseline assessment context to stdout and exits
 */
function cmdInitAssessBaseline(cwd, raw) {
  const config = loadConfig(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);

  const result = buildInitContext(cwd, {
    // Model
    assessor_model: resolveModelInternal(cwd, 'grd-baseline-assessor'),

    // Config
    eval_config: config.eval_config || {},
    autonomous_mode: config.autonomous_mode || false,

    // File existence
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),
    benchmarks_exists: pathExistsInternal(cwd, path.join(researchDir, 'BENCHMARKS.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
  });

  output(result, raw, `Backend: ${result.backend}, assessor ready`);
}

/**
 * CLI command: Initialize deep-dive context for grd-deep-diver agent.
 * @param {string} cwd - Project working directory
 * @param {string} topic - Paper title or topic to analyze
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs deep-dive context to stdout and exits
 */
function cmdInitDeepDive(cwd, topic, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const researchDir = getResearchDirPath(cwd);
  const deepDivesDir = path.join(researchDir, 'deep-dives');
  let deepDives = [];
  try {
    if (fs.existsSync(deepDivesDir)) {
      deepDives = fs.readdirSync(deepDivesDir).filter((f) => f.endsWith('.md'));
    }
  } catch {
    deepDives = [];
  }

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    deep_diver_model: resolveModelInternal(cwd, 'grd-deep-diver'),

    // Topic
    topic: topic || null,

    // Research files
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    deep_dives: deepDives,
    deep_dives_count: deepDives.length,

    // Config
    autonomous_mode: config.autonomous_mode || false,
    research_gates: config.research_gates || {},

    // Paths
    research_dir: path.relative(cwd, researchDir),
    deep_dives_dir: path.relative(cwd, deepDivesDir),
  };

  output(result, raw, `Backend: ${result.backend}, deep-diver ready${topic ? ', topic: ' + topic : ''}`);
}

/**
 * CLI command: Initialize eval-plan context for grd-eval-planner agent.
 * @param {string} cwd - Project working directory
 * @param {string|null} phase - Optional phase number
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs eval-plan context to stdout and exits
 */
function cmdInitEvalPlan(cwd, phase, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    eval_planner_model: resolveModelInternal(cwd, 'grd-eval-planner'),

    // Phase info (optional)
    phase_found: phaseInfo ? phaseInfo.found : false,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,

    // Config
    eval_config: config.eval_config || {},
    autonomous_mode: config.autonomous_mode || false,

    // File existence
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),
    benchmarks_exists: pathExistsInternal(cwd, path.join(researchDir, 'BENCHMARKS.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),

    // Paths
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, researchDir),
  };

  output(result, raw, `Backend: ${result.backend}, eval-planner ready${phase ? ', phase: ' + phase : ''}`);
}

/**
 * CLI command: Initialize eval-report context for grd-eval-reporter agent.
 * @param {string} cwd - Project working directory
 * @param {string|null} phase - Phase number to report on
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs eval-report context to stdout and exits
 */
function cmdInitEvalReport(cwd, phase, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    eval_reporter_model: resolveModelInternal(cwd, 'grd-eval-reporter'),

    // Phase info
    phase_found: phaseInfo ? phaseInfo.found : false,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    plans: phaseInfo?.plans || [],
    summaries: phaseInfo?.summaries || [],

    // Config
    eval_config: config.eval_config || {},

    // File existence
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),
    benchmarks_exists: pathExistsInternal(cwd, path.join(researchDir, 'BENCHMARKS.md')),

    // Paths
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, researchDir),
  };

  output(result, raw, `Backend: ${result.backend}, eval-reporter ready${phase ? ', phase: ' + phase : ''}`);
}

/**
 * CLI command: Initialize feasibility context for grd-feasibility-analyst agent.
 * @param {string} cwd - Project working directory
 * @param {string} topic - Approach or paper to analyze
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs feasibility context to stdout and exits
 */
function cmdInitFeasibility(cwd, topic, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);
  const deepDivesDir = path.join(researchDir, 'deep-dives');
  let deepDives = [];
  try {
    if (fs.existsSync(deepDivesDir)) {
      deepDives = fs.readdirSync(deepDivesDir).filter((f) => f.endsWith('.md'));
    }
  } catch {
    deepDives = [];
  }

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    feasibility_model: resolveModelInternal(cwd, 'grd-feasibility-analyst'),

    // Topic
    topic: topic || null,

    // Research files
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    knowhow_exists: pathExistsInternal(cwd, path.join(planningDir, 'KNOWHOW.md')),
    deep_dives: deepDives,
    deep_dives_count: deepDives.length,

    // Config
    autonomous_mode: config.autonomous_mode || false,

    // Paths
    research_dir: path.relative(cwd, researchDir),
    deep_dives_dir: path.relative(cwd, deepDivesDir),
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, feasibility-analyst ready${topic ? ', topic: ' + topic : ''}`);
}

/**
 * CLI command: Initialize product-owner context for grd-product-owner agent.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs product-owner context to stdout and exits
 */
function cmdInitProductOwner(cwd, raw) {
  const config = loadConfig(cwd);
  const planningDir = getPlanningDir(cwd);
  const milestone = getMilestoneInfo(cwd);

  const result = buildInitContext(cwd, {
    // Model
    product_owner_model: resolveModelInternal(cwd, 'grd-product-owner'),

    // Milestone (milestone_version comes from buildInitContext; add milestone_dir separately)
    milestone_dir: milestone.dir,

    // File existence
    project_exists: pathExistsInternal(cwd, path.join(planningDir, 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    requirements_exists: pathExistsInternal(cwd, path.join(planningDir, 'REQUIREMENTS.md')),
    product_quality_exists: pathExistsInternal(cwd, path.join(planningDir, 'PRODUCT-QUALITY.md')),

    // Config
    autonomous_mode: config.autonomous_mode || false,
    eval_config: config.eval_config || {},

    // Paths
    milestones_dir: path.relative(cwd, getMilestonesDirPath(cwd)),
  });

  output(result, raw, `Backend: ${result.backend}, product-owner ready`);
}

/**
 * CLI command: Initialize project-researcher context for grd-project-researcher agent.
 * @param {string} cwd - Project working directory
 * @param {string} topic - Research topic
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs project-researcher context to stdout and exits
 */
function cmdInitProjectResearcher(cwd, topic, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);
  const milestone = getMilestoneInfo(cwd);

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    researcher_model: resolveModelInternal(cwd, 'grd-project-researcher'),

    // Topic
    topic: topic || null,

    // Milestone
    milestone_version: milestone.version,

    // File existence
    project_exists: pathExistsInternal(cwd, path.join(planningDir, 'PROJECT.md')),
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),

    // Config
    autonomous_mode: config.autonomous_mode || false,
    research_gates: config.research_gates || {},

    // Paths
    research_dir: path.relative(cwd, researchDir),
    milestones_dir: path.relative(cwd, getMilestonesDirPath(cwd)),
  };

  output(result, raw, `Backend: ${result.backend}, project-researcher ready${topic ? ', topic: ' + topic : ''}`);
}

/**
 * CLI command: Initialize research-synthesizer context for grd-research-synthesizer agent.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs research-synthesizer context to stdout and exits
 */
function cmdInitResearchSynthesizer(cwd, raw) {
  const config = loadConfig(cwd);
  const researchDir = getResearchDirPath(cwd);
  let deepDives = [];
  try {
    const deepDivesDir = path.join(researchDir, 'deep-dives');
    if (fs.existsSync(deepDivesDir)) {
      deepDives = fs.readdirSync(deepDivesDir).filter((f) => f.endsWith('.md'));
    }
  } catch {
    deepDives = [];
  }

  const result = buildInitContext(cwd, {
    // Model
    synthesizer_model: resolveModelInternal(cwd, 'grd-research-synthesizer'),

    // Research files
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    benchmarks_exists: fs.existsSync(path.join(researchDir, 'BENCHMARKS.md')),
    deep_dives: deepDives,
    deep_dives_count: deepDives.length,

    // Config
    autonomous_mode: config.autonomous_mode || false,

    // Paths
    deep_dives_dir: path.relative(cwd, path.join(researchDir, 'deep-dives')),
  });

  output(result, raw, `Backend: ${result.backend}, research-synthesizer ready`);
}

/**
 * CLI command: Initialize roadmapper context for grd-roadmapper agent.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs roadmapper context to stdout and exits
 */
function cmdInitRoadmapper(cwd, raw) {
  const config = loadConfig(cwd);
  const planningDir = getPlanningDir(cwd);

  const result = buildInitContext(cwd, {
    // Model
    roadmapper_model: resolveModelInternal(cwd, 'grd-roadmapper'),

    // File existence
    project_exists: pathExistsInternal(cwd, path.join(planningDir, 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    requirements_exists: pathExistsInternal(cwd, path.join(planningDir, 'REQUIREMENTS.md')),
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),

    // Config
    ceremony: config.ceremony || {},
    tracker: config.tracker || {},

    // Paths
    milestones_dir: path.relative(cwd, getMilestonesDirPath(cwd)),
  });

  output(result, raw, `Backend: ${result.backend}, roadmapper ready`);
}

/**
 * CLI command: Initialize survey context for grd-surveyor agent.
 * @param {string} cwd - Project working directory
 * @param {string} topic - Research topic to survey
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs surveyor context to stdout and exits
 */
function cmdInitSurveyor(cwd, topic, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const researchDir = getResearchDirPath(cwd);
  const planningDir = getPlanningDir(cwd);

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    surveyor_model: resolveModelInternal(cwd, 'grd-surveyor'),

    // Topic
    topic: topic || null,

    // Research files
    landscape_exists: fs.existsSync(path.join(researchDir, 'LANDSCAPE.md')),
    papers_exists: fs.existsSync(path.join(researchDir, 'PAPERS.md')),
    benchmarks_exists: fs.existsSync(path.join(researchDir, 'BENCHMARKS.md')),

    // Config
    autonomous_mode: config.autonomous_mode || false,
    research_gates: config.research_gates || {},

    // Paths
    research_dir: path.relative(cwd, researchDir),
    milestones_dir: path.relative(cwd, getMilestonesDirPath(cwd)),
    project_exists: pathExistsInternal(cwd, path.join(planningDir, 'PROJECT.md')),
  };

  output(result, raw, `Backend: ${result.backend}, surveyor ready${topic ? ', topic: ' + topic : ''}`);
}

/**
 * CLI command: Initialize verifier context for grd-verifier agent.
 * @param {string} cwd - Project working directory
 * @param {string|null} phase - Phase number to verify
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs verifier context to stdout and exits
 */
function cmdInitVerifier(cwd, phase, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const planningDir = getPlanningDir(cwd);
  const researchDir = getResearchDirPath(cwd);
  const phaseInfo = phase ? findPhaseInternal(cwd, phase) : null;

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    verifier_model: resolveModelInternal(cwd, 'grd-verifier'),

    // Phase info
    phase_found: phaseInfo ? phaseInfo.found : false,
    phase_dir: phaseInfo?.directory || null,
    phase_number: phaseInfo?.phase_number || null,
    phase_name: phaseInfo?.phase_name || null,
    plans: phaseInfo?.plans || [],
    summaries: phaseInfo?.summaries || [],

    // File existence
    baseline_exists: pathExistsInternal(cwd, path.join(planningDir, 'BASELINE.md')),
    benchmarks_exists: pathExistsInternal(cwd, path.join(researchDir, 'BENCHMARKS.md')),

    // Config
    eval_config: config.eval_config || {},

    // Paths
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, researchDir),
  };

  output(result, raw, `Backend: ${result.backend}, verifier ready${phase ? ', phase: ' + phase : ''}`);
}

/**
 * CLI command: Initialize baseline-assessor context for grd-baseline-assessor agent.
 * Alias for cmdInitAssessBaseline — provides STATE, ROADMAP, and BASELINE.md context.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs baseline assessor context to stdout and exits
 */
function cmdInitBaselineAssessor(cwd, raw) {
  return cmdInitAssessBaseline(cwd, raw);
}

/**
 * CLI command: Initialize code-reviewer context with phase plans, recent git diffs, and STATE.
 * Alias for cmdInitCodeReview — provides reviewer model, phase plans, and summaries.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to review code for
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs code-reviewer context to stdout and exits
 */
function cmdInitCodeReviewer(cwd, phase, raw) {
  return cmdInitCodeReview(cwd, phase, raw);
}

/**
 * CLI command: Initialize codebase-mapper context with project root info and file listing.
 * Alias for cmdInitMapCodebase — provides mapper model, existing maps, and codebase paths.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs codebase-mapper context to stdout and exits
 */
function cmdInitCodebaseMapper(cwd, raw) {
  return cmdInitMapCodebase(cwd, raw);
}

/**
 * CLI command: Initialize debugger context with STATE, recent logs, and phase info.
 * Alias for cmdInitDebug — provides debug files, phase scope, and project state.
 * @param {string} cwd - Project working directory
 * @param {string|null} phase - Optional phase number to scope debugging
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs debugger context to stdout and exits
 */
function cmdInitDebugger(cwd, phase, raw) {
  return cmdInitDebug(cwd, phase, raw);
}

/**
 * CLI command: Initialize deep-diver context with research dir, PAPERS.md, and LANDSCAPE.md.
 * Alias for cmdInitDeepDive — provides deep-diver model, topic, and research file inventory.
 * @param {string} cwd - Project working directory
 * @param {string} topic - Paper title or topic to analyze
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs deep-diver context to stdout and exits
 */
function cmdInitDeepDiver(cwd, topic, raw) {
  return cmdInitDeepDive(cwd, topic, raw);
}

/**
 * CLI command: Initialize eval-planner context with phase EVAL.md, STATE, and BASELINE.md.
 * Alias for cmdInitEvalPlan — provides eval-planner model and eval config context.
 * @param {string} cwd - Project working directory
 * @param {string|null} phase - Optional phase number
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs eval-planner context to stdout and exits
 */
function cmdInitEvalPlanner(cwd, phase, raw) {
  return cmdInitEvalPlan(cwd, phase, raw);
}

/**
 * CLI command: Initialize eval-reporter context with phase EVAL.md, SUMMARY files, and baselines.
 * Alias for cmdInitEvalReport — provides eval-reporter model, phase plans, and summaries.
 * @param {string} cwd - Project working directory
 * @param {string|null} phase - Phase number to report on
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs eval-reporter context to stdout and exits
 */
function cmdInitEvalReporter(cwd, phase, raw) {
  return cmdInitEvalReport(cwd, phase, raw);
}

/**
 * CLI command: Initialize executor context with phase plans, STATE, and ROADMAP.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to execute
 * @param {Set<string>} includes - Set of content sections to include (e.g., 'state', 'config', 'roadmap')
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs executor context to stdout and exits
 */
function cmdInitExecutor(cwd, phase, includes, raw) {
  if (!phase) {
    error('phase required for init executor. Usage: init executor <phase-number>. Provide a phase number, e.g.: init executor 2');
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const milestone = getMilestoneInfo(cwd);
  const planningDir = getPlanningDir(cwd);

  const result = {
    // Backend
    backend,
    backend_capabilities: getBackendCapabilities(backend),

    // Model
    executor_model: resolveModelInternal(cwd, 'grd-executor'),

    // Config flags
    commit_docs: config.commit_docs,
    parallelization: config.parallelization,
    use_teams: config.use_teams,
    team_timeout_minutes: config.team_timeout_minutes,

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

    // Milestone info
    milestone_version: milestone.version,
    milestone_name: milestone.name,

    // File existence
    state_exists: pathExistsInternal(cwd, path.join(planningDir, 'STATE.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(planningDir, 'ROADMAP.md')),
    principles_exists: pathExistsInternal(cwd, path.join(planningDir, 'PRINCIPLES.md')),

    // Milestone-scoped paths
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
  };

  // Include file contents if requested
  if (includes && includes.has('state')) {
    result.state_content = safeReadMarkdown(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes && includes.has('roadmap')) {
    result.roadmap_content = safeReadMarkdown(path.join(cwd, '.planning', 'ROADMAP.md'));
  }

  output(result, raw, `Backend: ${result.backend}, phase: ${result.phase_number || 'unknown'}, plans: ${result.plan_count}`);
}

/**
 * CLI command: Initialize feasibility-analyst context with LANDSCAPE.md and research files.
 * Alias for cmdInitFeasibility — provides feasibility model, topic, and research file inventory.
 * @param {string} cwd - Project working directory
 * @param {string} topic - Approach or paper to analyze
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs feasibility-analyst context to stdout and exits
 */
function cmdInitFeasibilityAnalyst(cwd, topic, raw) {
  return cmdInitFeasibility(cwd, topic, raw);
}

/**
 * CLI command: Initialize integration-checker context with STATE and all phase SUMMARYs.
 * Alias for cmdInitIntegrationCheck — provides phase inventory and deferred validations.
 * @param {string} cwd - Project working directory
 * @param {string|null} phase - Optional phase number to scope integration check
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs integration-checker context to stdout and exits
 */
function cmdInitIntegrationChecker(cwd, phase, raw) {
  return cmdInitIntegrationCheck(cwd, phase, raw);
}

/**
 * CLI command: Initialize migrator context with .planning dir structure and ROADMAP.
 * Alias for cmdInitMigrate — provides planning directory layout inventory for migration.
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs migrator context to stdout and exits
 */
function cmdInitMigrator(cwd, raw) {
  return cmdInitMigrate(cwd, raw);
}

/**
 * CLI command: Initialize phase-researcher context with phase info and LANDSCAPE.md.
 * Alias for cmdInitPhaseResearch — provides researcher model and research file references.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to research for
 * @param {Set<string>} includes - Set of content sections to include
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs phase-researcher context to stdout and exits
 */
function cmdInitPhaseResearcher(cwd, phase, includes, raw) {
  return cmdInitPhaseResearch(cwd, phase, includes, raw);
}

/**
 * CLI command: Initialize plan-checker context with PLAN.md files and STATE.
 * Alias for cmdInitPlanCheck — provides checker model, phase plans, and roadmap goal.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to check plans for
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs plan-checker context to stdout and exits
 */
function cmdInitPlanChecker(cwd, phase, raw) {
  return cmdInitPlanCheck(cwd, phase, raw);
}

module.exports = {
  cmdInitExecutePhase,
  cmdInitPlanPhase,
  cmdInitNewProject,
  cmdInitNewMilestone,
  cmdInitQuick,
  cmdInitResume,
  cmdInitVerifyWork,
  cmdInitPhaseOp,
  cmdInitTodos,
  cmdInitMilestoneOp,
  cmdInitMapCodebase,
  cmdInitProgress,
  cmdInitResearchWorkflow,
  cmdInitPlanMilestoneGaps,
  cmdInitDebug,
  cmdInitIntegrationCheck,
  cmdInitMigrate,
  cmdInitPlanCheck,
  cmdInitPhaseResearch,
  cmdInitCodeReview,
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
  // New agent-named aliases
  cmdInitBaselineAssessor,
  cmdInitCodeReviewer,
  cmdInitCodebaseMapper,
  cmdInitDebugger,
  cmdInitDeepDiver,
  cmdInitEvalPlanner,
  cmdInitEvalReporter,
  cmdInitExecutor,
  cmdInitFeasibilityAnalyst,
  cmdInitIntegrationChecker,
  cmdInitMigrator,
  cmdInitPhaseResearcher,
  cmdInitPlanChecker,
  // Cache helpers (exported for testing)
  _progressCachePath,
  _computeProgressMtimeKey,
};
