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
  loadConfig,
  findCodeFiles,
  resolveModelInternal,
  findPhaseInternal,
  pathExistsInternal,
  generateSlugInternal,
  getMilestoneInfo,
  resolveModelForAgent,
  output,
  error,
} = require('./utils');
const { detectBackend, getBackendCapabilities } = require('./backend');

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

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);
  const milestone = getMilestoneInfo(cwd);

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

    // Milestone info
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    milestone_slug: generateSlugInternal(milestone.name),

    // File existence
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    config_exists: pathExistsInternal(cwd, '.planning/config.json'),
  };

  // Include file contents if requested via --include
  if (includes.has('state')) {
    result.state_content = safeReadFile(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes.has('config')) {
    result.config_content = safeReadFile(path.join(cwd, '.planning', 'config.json'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
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

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const phaseInfo = findPhaseInternal(cwd, phase);

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
  };

  // Include file contents if requested via --include
  if (includes.has('state')) {
    result.state_content = safeReadFile(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes.has('requirements')) {
    result.requirements_content = safeReadFile(path.join(cwd, '.planning', 'REQUIREMENTS.md'));
  }
  if (includes.has('context') && phaseInfo?.directory) {
    // Find *-CONTEXT.md in phase directory
    const phaseDirFull = path.join(cwd, phaseInfo.directory);
    try {
      const files = fs.readdirSync(phaseDirFull);
      const contextFile = files.find((f) => f.endsWith('-CONTEXT.md') || f === 'CONTEXT.md');
      if (contextFile) {
        result.context_content = safeReadFile(path.join(phaseDirFull, contextFile));
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
        result.research_content = safeReadFile(path.join(phaseDirFull, researchFile));
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
        result.verification_content = safeReadFile(path.join(phaseDirFull, verificationFile));
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
        result.uat_content = safeReadFile(path.join(phaseDirFull, uatFile));
      }
    } catch {}
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
    has_codebase_map: pathExistsInternal(cwd, '.planning/codebase'),
    planning_exists: pathExistsInternal(cwd, '.planning'),

    // Brownfield detection
    has_existing_code: hasCode,
    has_package_file: hasPackageFile,
    is_brownfield: hasCode || hasPackageFile,
    needs_codebase_map:
      (hasCode || hasPackageFile) && !pathExistsInternal(cwd, '.planning/codebase'),

    // Git state
    has_git: pathExistsInternal(cwd, '.git'),
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
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);

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

    // File existence
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),
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
  const quickDir = path.join(cwd, '.planning', 'quick');
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
    quick_dir: '.planning/quick',
    task_dir: slug ? `.planning/quick/${nextNum}-${slug}` : null,

    // File existence
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    planning_exists: pathExistsInternal(cwd, '.planning'),
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
  let interruptedAgentId = null;
  try {
    interruptedAgentId = fs
      .readFileSync(path.join(cwd, '.planning', 'current-agent-id.txt'), 'utf-8')
      .trim();
  } catch {}

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
  const pendingDir = path.join(cwd, '.planning', 'todos', 'pending');
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
          path: path.join('.planning', 'todos', 'pending', file),
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
    pending_dir: '.planning/todos/pending',
    completed_dir: '.planning/todos/completed',

    // File existence
    planning_exists: pathExistsInternal(cwd, '.planning'),
    todos_dir_exists: pathExistsInternal(cwd, '.planning/todos'),
    pending_dir_exists: pathExistsInternal(cwd, '.planning/todos/pending'),
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
  const phasesDir = path.join(cwd, '.planning', 'phases');
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
    phases_dir_exists: pathExistsInternal(cwd, '.planning/phases'),
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
  const codebaseDir = path.join(cwd, '.planning', 'codebase');
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
    codebase_dir: '.planning/codebase',

    // Existing maps
    existing_maps: existingMaps,
    has_maps: existingMaps.length > 0,

    // File existence
    planning_exists: pathExistsInternal(cwd, '.planning'),
    codebase_dir_exists: pathExistsInternal(cwd, '.planning/codebase'),
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
  const phasesDir = path.join(cwd, '.planning', 'phases');
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
        directory: path.join('.planning', 'phases', dir),
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
  try {
    const state = fs.readFileSync(path.join(cwd, '.planning', 'STATE.md'), 'utf-8');
    const pauseMatch = state.match(/\*\*Paused At:\*\*\s*(.+)/);
    if (pauseMatch) pausedAt = pauseMatch[1].trim();
  } catch {}

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
  };

  // Include file contents if requested via --include
  if (includes.has('state')) {
    result.state_content = safeReadFile(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadFile(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes.has('project')) {
    result.project_content = safeReadFile(path.join(cwd, '.planning', 'PROJECT.md'));
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
  const researchDir = path.join(planningDir, 'research');
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
    landscape_exists: pathExistsInternal(cwd, '.planning/research/LANDSCAPE.md'),
    papers_exists: pathExistsInternal(cwd, '.planning/research/PAPERS.md'),
    benchmarks_exists: pathExistsInternal(cwd, '.planning/research/BENCHMARKS.md'),
    knowhow_exists: pathExistsInternal(cwd, '.planning/KNOWHOW.md'),
    baseline_exists: pathExistsInternal(cwd, '.planning/BASELINE.md'),

    // Standard files
    project_exists: pathExistsInternal(cwd, '.planning/PROJECT.md'),
    roadmap_exists: pathExistsInternal(cwd, '.planning/ROADMAP.md'),
    state_exists: pathExistsInternal(cwd, '.planning/STATE.md'),

    // Model resolution
    researcher_model: resolveModelForAgent(config, 'researcher'),
    planner_model: resolveModelForAgent(config, 'planner'),
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
    result.landscape_content = safeReadFile(path.join(researchDir, 'LANDSCAPE.md'));
  }
  if (includes.has('papers')) {
    result.papers_content = safeReadFile(path.join(researchDir, 'PAPERS.md'));
  }
  if (includes.has('knowhow')) {
    result.knowhow_content = safeReadFile(path.join(planningDir, 'KNOWHOW.md'));
  }
  if (includes.has('baseline')) {
    result.baseline_content = safeReadFile(path.join(planningDir, 'BASELINE.md'));
  }
  if (includes.has('state')) {
    result.state_content = safeReadFile(path.join(planningDir, 'STATE.md'));
  }
  if (includes.has('roadmap')) {
    result.roadmap_content = safeReadFile(path.join(planningDir, 'ROADMAP.md'));
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
  const phasesDir = path.join(planningDir, 'phases');
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
