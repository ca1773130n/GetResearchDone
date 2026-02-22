/**
 * GRD Context / Init Workflows — Context loading for all 20 workflow initializers
 *
 * Extracted from bin/grd-tools.js during Phase 3 modularization.
 * Each cmdInit* function loads config, phase info, model resolution, and file existence
 * to provide a comprehensive context JSON for Claude Code workflow agents.
 */

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
    error('phase required for init execute-phase');
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
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    config_exists: pathExistsInternal(cwd, '.planning/config.json'),
    principles_exists: pathExistsInternal(cwd, '.planning/PRINCIPLES.md'),
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
    } catch {}
  }

  output(result, raw);
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
    error('phase required for init plan-phase');
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
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    principles_exists: pathExistsInternal(cwd, '.planning/PRINCIPLES.md'),
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
    } catch {}
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
    } catch {}
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
    } catch {}
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
    } catch {}
  }
  if (includes.has('principles')) {
    result.principles_content = safeReadMarkdown(path.join(cwd, '.planning', 'PRINCIPLES.md'));
  }

  output(result, raw);
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
  } catch {}

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
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    has_codebase_map: fs.existsSync(getCodebaseDirPath(cwd)),
    planning_exists: pathExistsInternal(cwd, '.planning'),
    principles_exists: pathExistsInternal(cwd, '.planning/PRINCIPLES.md'),
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

  output(result, raw);
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
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw);
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
  } catch {}

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
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    planning_exists: pathExistsInternal(cwd, '.planning'),
    principles_exists: pathExistsInternal(cwd, '.planning/PRINCIPLES.md'),
    standards_exists: fs.existsSync(path.join(getStandardsDirPath(cwd), 'index.yml')),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
    standards_dir: path.relative(cwd, getStandardsDirPath(cwd)),
  };

  output(result, raw);
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
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
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

  output(result, raw);
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

  output(result, raw);
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
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, getPhasesDirPath(cwd)),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw);
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
      } catch {}
    }
  } catch {}

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

  output(result, raw);
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
      } catch {}
    }
  } catch {}

  // Check archive
  const archiveDir = path.join(cwd, '.planning', 'archive');
  let archivedMilestones = [];
  try {
    archivedMilestones = fs
      .readdirSync(archiveDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {}

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
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    archive_exists: pathExistsInternal(cwd, '.planning/archive'),
    phases_dir_exists: fs.existsSync(phasesDir),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw);
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
  } catch {}

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

  output(result, raw);
}

/**
 * CLI command: Initialize progress context with phase overview, current/next phase, and milestone info.
 * @param {string} cwd - Project working directory
 * @param {Set<string>} includes - Set of content sections to include (e.g., 'state', 'roadmap', 'project', 'config')
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs progress context to stdout and exits
 */
function cmdInitProgress(cwd, includes, raw) {
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
  } catch {}

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
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  // Include file contents if requested via --include
  if (includes.has('state')) {
    result.state_content = safeReadMarkdown(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadMarkdown(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes.has('project')) {
    result.project_content = safeReadMarkdown(path.join(cwd, '.planning', 'PROJECT.md'));
  }
  if (includes.has('config')) {
    result.config_content = safeReadFile(path.join(cwd, '.planning', 'config.json'));
  }

  output(result, raw);
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
    knowhow_exists: pathExistsInternal(cwd, '.planning/KNOWHOW.md'),
    baseline_exists: pathExistsInternal(cwd, '.planning/BASELINE.md'),

    // Standard files
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),

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

  output(result, raw);
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
  } catch {}

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
  } catch {}

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

    requirements_exists: pathExistsInternal(cwd, '.planning/REQUIREMENTS.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),

    // Milestone-scoped paths (REQ-56)
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  output(result, raw);
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
};
