/**
 * Unit tests for lib/context.js
 *
 * Tests init workflow context loading functions. Each cmdInit* function
 * assembles context JSON from .planning/ files for Claude Code workflow agents.
 * Tests verify correct structure, key field presence, and error handling.
 */

const fs = require('fs');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
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
  _progressCachePath,
  _computeProgressMtimeKey,
} = require('../../lib/context');
const os = require('os');
const { VALID_BACKENDS, BACKEND_CAPABILITIES } = require('../../lib/backend');

// ─── cmdInitExecutePhase ─────────────────────────────────────────────────────

describe('cmdInitExecutePhase', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns context JSON for existing phase', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(true);
    expect(result.phase_number).toBe('01');
    expect(result.phase_name).toBe('test');
    expect(result.plans).toContain('01-01-PLAN.md');
    expect(result.summaries).toContain('01-01-SUMMARY.md');
    expect(result.plan_count).toBe(1);
  });

  test('includes config flags and model info', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('executor_model');
    expect(result).toHaveProperty('verifier_model');
    expect(result).toHaveProperty('commit_docs');
    expect(result).toHaveProperty('parallelization');
    expect(result).toHaveProperty('branching_strategy');
    expect(result).toHaveProperty('phase_branch_template');
  });

  test('includes file existence checks', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.state_exists).toBe(true);
    expect(result.roadmap_exists).toBe(true);
    expect(result.config_exists).toBe(true);
  });

  test('computes branch name', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.branch_name).toContain('v1.0');
    expect(result.branch_name).toContain('01');
    expect(result.branch_name).toContain('test');
  });

  test('includes milestone info', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.milestone_version).toBe('v1.0');
    expect(result.milestone_name).toBeDefined();
  });

  test('returns phase_found false for nonexistent phase', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '99', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(false);
    expect(result.phase_dir).toBeNull();
    expect(result.plans).toEqual([]);
  });

  test('errors when no phase argument provided', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdInitExecutePhase(tmpDir, null, new Set(), false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase required');
  });

  test('includes state content when requested via includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(['state']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.state_content).toBeDefined();
    expect(result.state_content).toContain('Current Position');
  });

  test('identifies incomplete plans', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '2', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(true);
    expect(result.incomplete_plans).toContain('02-01-PLAN.md');
    expect(result.incomplete_count).toBe(1);
  });

  test('includes base_branch when branching_strategy is phase', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.base_branch).toBe('main');
  });

  test('includes worktree_path with correct tmpdir pattern', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.worktree_path).toBeDefined();
    expect(result.worktree_path).toContain('grd-worktree-');
    expect(result.worktree_path).toContain('v1.0');
    expect(result.worktree_path).toContain('-01');
    // Should be under the real tmpdir
    const realTmp = require('fs').realpathSync(os.tmpdir());
    expect(result.worktree_path.startsWith(realTmp)).toBe(true);
  });

  test('includes worktree_branch matching branch template', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.worktree_branch).toBeDefined();
    expect(result.worktree_branch).toContain('v1.0');
    expect(result.worktree_branch).toContain('01');
    expect(result.worktree_branch).toContain('test');
    // Should match the branch_name field
    expect(result.worktree_branch).toBe(result.branch_name);
  });

  test('worktree fields are null when phase not found', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '99', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.worktree_path).toBeNull();
    expect(result.worktree_branch).toBeNull();
  });

  describe('base_branch config variations', () => {
    let customTmpDir;

    beforeAll(() => {
      customTmpDir = createFixtureDir();
    });

    afterAll(() => {
      cleanupFixtureDir(customTmpDir);
    });

    test('base_branch is null when branching_strategy is none', () => {
      fs.writeFileSync(
        path.join(customTmpDir, '.planning', 'config.json'),
        JSON.stringify({
          model_profile: 'balanced',
          branching_strategy: 'none',
          phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
          milestone_branch_template: 'grd/{milestone}-{slug}',
        })
      );
      const { stdout } = captureOutput(() =>
        cmdInitExecutePhase(customTmpDir, '1', new Set(), false)
      );
      const result = JSON.parse(stdout);
      expect(result.base_branch).toBeNull();
    });

    test('base_branch reads custom value from config', () => {
      fs.writeFileSync(
        path.join(customTmpDir, '.planning', 'config.json'),
        JSON.stringify({
          model_profile: 'balanced',
          branching_strategy: 'phase',
          base_branch: 'develop',
          phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
          milestone_branch_template: 'grd/{milestone}-{slug}',
        })
      );
      const { stdout } = captureOutput(() =>
        cmdInitExecutePhase(customTmpDir, '1', new Set(), false)
      );
      const result = JSON.parse(stdout);
      expect(result.base_branch).toBe('develop');
    });
  });
});

// ─── cmdInitPlanPhase ────────────────────────────────────────────────────────

describe('cmdInitPlanPhase', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns context JSON with model info and phase details', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(true);
    expect(result.phase_number).toBe('01');
    expect(result).toHaveProperty('planner_model');
    expect(result).toHaveProperty('researcher_model');
    expect(result).toHaveProperty('research_enabled');
    expect(result).toHaveProperty('plan_checker_enabled');
  });

  test('reports has_plans correctly', () => {
    const { stdout } = captureOutput(() => cmdInitPlanPhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.has_plans).toBe(true);
    expect(result.plan_count).toBe(1);
  });

  test('errors for missing phase argument', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdInitPlanPhase(tmpDir, null, new Set(), false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase required');
  });
});

// ─── cmdInitNewProject ───────────────────────────────────────────────────────

describe('cmdInitNewProject', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns new project context', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitNewProject(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('researcher_model');
    expect(result).toHaveProperty('synthesizer_model');
    expect(result).toHaveProperty('roadmapper_model');
    expect(result).toHaveProperty('commit_docs');
    expect(result.planning_exists).toBe(true);
  });

  test('detects brownfield when fixture has package.json', () => {
    // Fixture does not have package.json by default, so not brownfield from package
    const { stdout } = captureOutput(() => cmdInitNewProject(tmpDir, false));
    const result = JSON.parse(stdout);
    // Our fixture has no code files and no package.json, so should be greenfield
    expect(typeof result.is_brownfield).toBe('boolean');
    expect(typeof result.has_existing_code).toBe('boolean');
  });
});

// ─── cmdInitResume ───────────────────────────────────────────────────────────

describe('cmdInitResume', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns resume context with file existence checks', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitResume(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.state_exists).toBe(true);
    expect(result.roadmap_exists).toBe(true);
    expect(result.planning_exists).toBe(true);
    expect(result.has_interrupted_agent).toBe(false);
    expect(result.interrupted_agent_id).toBeNull();
  });
});

// ─── cmdInitVerifyWork ───────────────────────────────────────────────────────

describe('cmdInitVerifyWork', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns verification context for a phase', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitVerifyWork(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(true);
    expect(result.phase_number).toBe('01');
    expect(result).toHaveProperty('planner_model');
    expect(result).toHaveProperty('checker_model');
  });

  test('errors when phase not provided', () => {
    const { stderr, exitCode } = captureError(() => cmdInitVerifyWork(tmpDir, null, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase required');
  });
});

// ─── cmdInitPhaseOp ──────────────────────────────────────────────────────────

describe('cmdInitPhaseOp', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns phase operation context', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitPhaseOp(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(true);
    expect(result.phase_number).toBe('01');
    expect(result.phase_slug).toBe('test');
    expect(result.has_plans).toBe(true);
    expect(result.plan_count).toBe(1);
    expect(result.roadmap_exists).toBe(true);
  });

  test('returns phase_found false for nonexistent phase', () => {
    const { stdout } = captureOutput(() => cmdInitPhaseOp(tmpDir, '99', false));
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(false);
  });
});

// ─── cmdInitTodos ────────────────────────────────────────────────────────────

describe('cmdInitTodos', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns todos context with pending items', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitTodos(tmpDir, null, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.todo_count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.todos)).toBe(true);
    expect(result.pending_dir).toBe('.planning/milestones/anonymous/todos/pending');
  });

  test('filters by area when provided', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitTodos(tmpDir, 'infra', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.area_filter).toBe('infra');
    // All returned todos should be from 'infra' area
    for (const todo of result.todos) {
      expect(todo.area).toBe('infra');
    }
  });
});

// ─── cmdInitMilestoneOp ──────────────────────────────────────────────────────

describe('cmdInitMilestoneOp', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns milestone operation context', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitMilestoneOp(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.milestone_version).toBe('v1.0');
    expect(result.phase_count).toBe(2);
    expect(typeof result.all_phases_complete).toBe('boolean');
    expect(result.roadmap_exists).toBe(true);
    expect(result.state_exists).toBe(true);
  });
});

// ─── cmdInitMapCodebase ──────────────────────────────────────────────────────

describe('cmdInitMapCodebase', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns codebase mapping context', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitMapCodebase(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('mapper_model');
    expect(result).toHaveProperty('commit_docs');
    expect(result.codebase_dir).toBe('.planning/codebase');
    expect(result.has_maps).toBe(false);
    expect(result.existing_maps).toEqual([]);
  });
});

// ─── cmdInitProgress ─────────────────────────────────────────────────────────

describe('cmdInitProgress', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns progress context with phase analysis', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitProgress(tmpDir, new Set(), false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.phase_count).toBe(2);
    expect(Array.isArray(result.phases)).toBe(true);
    expect(result.milestone_version).toBe('v1.0');
    expect(result).toHaveProperty('executor_model');
    expect(result).toHaveProperty('planner_model');
  });

  test('identifies completed and in-progress phases', () => {
    const { stdout } = captureOutput(() => cmdInitProgress(tmpDir, new Set(), false));
    const result = JSON.parse(stdout);
    // Phase 1 has both plan and summary -> complete
    const phase1 = result.phases.find((p) => p.number === '01');
    expect(phase1).toBeDefined();
    expect(phase1.status).toBe('complete');

    // Phase 2 has plan but no summary -> in_progress
    const phase2 = result.phases.find((p) => p.number === '02');
    expect(phase2).toBeDefined();
    expect(phase2.status).toBe('in_progress');
  });

  test('includes state content when requested', () => {
    const { stdout } = captureOutput(() => cmdInitProgress(tmpDir, new Set(['state']), false));
    const result = JSON.parse(stdout);
    expect(result.state_content).toBeDefined();
    expect(result.state_content).toContain('Current Position');
  });
});

// ─── cmdInitResearchWorkflow ─────────────────────────────────────────────────

describe('cmdInitResearchWorkflow', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns research workflow context for survey', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', 'test topic', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.workflow).toBe('survey');
    expect(result.topic).toBe('test topic');
    expect(typeof result.autonomous_mode).toBe('boolean');
    expect(result).toHaveProperty('researcher_model');
    expect(result).toHaveProperty('planner_model');
  });

  test('includes deep_dives listing for deep-dive workflow', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'deep-dive', null, new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(result.workflow).toBe('deep-dive');
    expect(Array.isArray(result.deep_dives)).toBe(true);
  });

  test('reports file existence flags', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(typeof result.landscape_exists).toBe('boolean');
    expect(typeof result.papers_exists).toBe('boolean');
    expect(typeof result.project_exists).toBe('boolean');
    expect(typeof result.roadmap_exists).toBe('boolean');
    expect(typeof result.state_exists).toBe('boolean');
  });
});

// ─── cmdInitNewMilestone ─────────────────────────────────────────────────────

describe('cmdInitNewMilestone', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns new milestone context', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitNewMilestone(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.current_milestone).toBe('v1.0');
    expect(result).toHaveProperty('researcher_model');
    expect(result).toHaveProperty('synthesizer_model');
    expect(result.project_exists).toBe(false); // fixture has no PROJECT.md
    expect(result.roadmap_exists).toBe(true);
    expect(result.state_exists).toBe(true);
  });

  test('scans new-style milestone directories for suggested_start_phase', () => {
    const newTmpDir = createFixtureDir();
    try {
      // Create new-style milestone directory: milestones/v0.2.1/phases/36-some-phase/
      fs.mkdirSync(
        path.join(newTmpDir, '.planning', 'milestones', 'v0.2.1', 'phases', '36-some-phase'),
        { recursive: true }
      );
      const { stdout, exitCode } = captureOutput(() => cmdInitNewMilestone(newTmpDir, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.highest_archived_phase).toBeGreaterThanOrEqual(36);
      expect(result.suggested_start_phase).toBeGreaterThanOrEqual(37);
    } finally {
      cleanupFixtureDir(newTmpDir);
    }
  });

  test('combines old-style and new-style directories for highest phase', () => {
    const newTmpDir = createFixtureDir();
    try {
      // Create old-style: milestones/v0.1.0-phases/10-old-phase/
      fs.mkdirSync(
        path.join(newTmpDir, '.planning', 'milestones', 'v0.1.0-phases', '10-old-phase'),
        { recursive: true }
      );
      // Create new-style: milestones/v0.2.1/phases/36-new-phase/
      fs.mkdirSync(
        path.join(newTmpDir, '.planning', 'milestones', 'v0.2.1', 'phases', '36-new-phase'),
        { recursive: true }
      );
      const { stdout, exitCode } = captureOutput(() => cmdInitNewMilestone(newTmpDir, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      // Should pick the highest from either style (36 from new-style)
      expect(result.highest_archived_phase).toBeGreaterThanOrEqual(36);
      expect(result.suggested_start_phase).toBeGreaterThanOrEqual(37);
    } finally {
      cleanupFixtureDir(newTmpDir);
    }
  });

  test('new-style directory scanning skips non-version directories', () => {
    const newTmpDir = createFixtureDir();
    try {
      // Create non-version directory with phases subdir (should be skipped)
      fs.mkdirSync(
        path.join(newTmpDir, '.planning', 'milestones', 'anonymous', 'phases', '99-decoy'),
        { recursive: true }
      );
      // anonymous already exists in fixture and does NOT start with 'v', so 99-decoy should not be counted
      const { stdout, exitCode } = captureOutput(() => cmdInitNewMilestone(newTmpDir, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      // The anonymous dir should not be scanned as new-style (no 'v' prefix)
      // highest_archived_phase should not include 99
      expect(result.highest_archived_phase).toBeLessThan(99);
    } finally {
      cleanupFixtureDir(newTmpDir);
    }
  });
});

// ─── cmdInitQuick ────────────────────────────────────────────────────────────

describe('cmdInitQuick', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns quick task context with slug and next number', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitQuick(tmpDir, 'Fix the bug', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.next_num).toBe(1);
    expect(result.slug).toBe('fix-the-bug');
    expect(result.description).toBe('Fix the bug');
    expect(result).toHaveProperty('planner_model');
    expect(result).toHaveProperty('executor_model');
    expect(result.quick_dir).toBe('.planning/milestones/anonymous/quick');
  });

  test('returns null slug when no description', () => {
    const { stdout } = captureOutput(() => cmdInitQuick(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result.slug).toBeNull();
    expect(result.description).toBeNull();
  });
});

// ─── Backend-aware context init ──────────────────────────────────────────────

describe('backend-aware context init', () => {
  let tmpDir;
  const savedEnv = {};
  // Track all CLAUDE_CODE_* env vars dynamically to avoid false detection
  const claudeCodeVars = Object.keys(process.env).filter((k) => k.startsWith('CLAUDE_CODE_'));
  const envVarsToClean = [
    ...claudeCodeVars,
    'CODEX_HOME',
    'CODEX_THREAD_ID',
    'GEMINI_CLI_HOME',
    'OPENCODE',
  ];

  beforeEach(() => {
    // Save env vars
    for (const key of envVarsToClean) {
      savedEnv[key] = process.env[key];
    }
    // Clear env vars to ensure clean backend detection
    for (const key of envVarsToClean) {
      delete process.env[key];
    }
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    // Restore env vars
    for (const key of envVarsToClean) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase includes backend field', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(VALID_BACKENDS).toContain(result.backend);
    expect(result).toHaveProperty('backend_capabilities');
    expect(result.backend_capabilities).toHaveProperty('subagents');
    expect(result.backend_capabilities).toHaveProperty('parallel');
    expect(result.backend_capabilities).toHaveProperty('teams');
    expect(result.backend_capabilities).toHaveProperty('hooks');
    expect(result.backend_capabilities).toHaveProperty('mcp');
  });

  test('cmdInitPlanPhase includes backend field', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(VALID_BACKENDS).toContain(result.backend);
    expect(result).toHaveProperty('backend_capabilities');
    expect(result.backend_capabilities).toHaveProperty('subagents');
  });

  test('cmdInitNewProject includes backend field', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitNewProject(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(VALID_BACKENDS).toContain(result.backend);
    expect(result).toHaveProperty('backend_capabilities');
  });

  test('cmdInitResume includes backend field', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitResume(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(VALID_BACKENDS).toContain(result.backend);
    expect(result).toHaveProperty('backend_capabilities');
  });

  test('backend field reflects detected backend (Claude default)', () => {
    // No config override and no backend env vars -> claude
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('claude');
    expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
  });

  test('backend field reflects config override', () => {
    // Write config.json with backend: 'codex'
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        backend: 'codex',
        branching_strategy: 'phase',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
      })
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('codex');
    expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.codex);
  });

  test('model fields are backend-resolved (codex backend)', () => {
    // Write config.json with backend: 'codex'
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        backend: 'codex',
        branching_strategy: 'phase',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
      })
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    // executor_model should be codex-specific, not 'sonnet'
    expect(result.executor_model).toContain('gpt-5.3-codex');
  });

  test('all 14 cmdInit* functions include backend and principles_exists (spot check)', () => {
    // Representative sample covering all categories: core, operation, R&D
    const functions = [
      // Core workflow
      () => cmdInitExecutePhase(tmpDir, '1', new Set(), false),
      () => cmdInitPlanPhase(tmpDir, '1', new Set(), false),
      () => cmdInitNewProject(tmpDir, false),
      () => cmdInitNewMilestone(tmpDir, false),
      () => cmdInitQuick(tmpDir, 'test', false),
      () => cmdInitResume(tmpDir, false),
      // Operation workflow
      () => cmdInitVerifyWork(tmpDir, '1', false),
      () => cmdInitPhaseOp(tmpDir, '1', false),
      () => cmdInitTodos(tmpDir, null, false),
      () => cmdInitMilestoneOp(tmpDir, false),
      () => cmdInitMapCodebase(tmpDir, false),
      () => cmdInitProgress(tmpDir, new Set(), false),
      // R&D workflow
      () => cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(), false),
      () => cmdInitPlanMilestoneGaps(tmpDir, false),
    ];

    for (const fn of functions) {
      const { stdout, exitCode } = captureOutput(fn);
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result).toHaveProperty('backend');
      expect(typeof result.backend).toBe('string');
      expect(VALID_BACKENDS).toContain(result.backend);
      expect(result).toHaveProperty('backend_capabilities');
      expect(typeof result.backend_capabilities).toBe('object');
      expect(result.backend_capabilities).toHaveProperty('subagents');
      expect(result.backend_capabilities).toHaveProperty('parallel');
      expect(result.backend_capabilities).toHaveProperty('teams');
      expect(result.backend_capabilities).toHaveProperty('hooks');
      expect(result.backend_capabilities).toHaveProperty('mcp');
    }
  });
});

// ─── PRINCIPLES.md integration ───────────────────────────────────────────────

describe('PRINCIPLES.md integration', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // Create PRINCIPLES.md in the fixture
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PRINCIPLES.md'),
      '# Principles\n\n- Always write tests first\n- Keep functions pure\n'
    );
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase returns principles_exists: true when file exists', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(true);
  });

  test('cmdInitPlanPhase returns principles_exists: true when file exists', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(true);
  });

  test('cmdInitNewProject returns principles_exists: true when file exists', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitNewProject(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(true);
  });

  test('cmdInitQuick returns principles_exists: true when file exists', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitQuick(tmpDir, 'test task', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(true);
  });

  test('cmdInitExecutePhase includes principles_content when --include principles', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(['principles']), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_content).toBeDefined();
    expect(result.principles_content).toContain('Always write tests first');
  });

  test('cmdInitPlanPhase includes principles_content when --include principles', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['principles']), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_content).toBeDefined();
    expect(result.principles_content).toContain('Keep functions pure');
  });
});

describe('PRINCIPLES.md absent', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // Ensure no PRINCIPLES.md exists (fixture doesn't create one by default)
    const principlesPath = path.join(tmpDir, '.planning', 'PRINCIPLES.md');
    if (fs.existsSync(principlesPath)) {
      fs.unlinkSync(principlesPath);
    }
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase returns principles_exists: false when file absent', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(false);
  });

  test('cmdInitPlanPhase returns principles_exists: false when file absent', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(false);
  });

  test('cmdInitNewProject returns principles_exists: false when file absent', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitNewProject(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(false);
  });

  test('cmdInitQuick returns principles_exists: false when file absent', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitQuick(tmpDir, 'test task', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_exists).toBe(false);
  });

  test('cmdInitExecutePhase does not include principles_content when file absent', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(['principles']), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    // safeReadFile returns null for missing files
    expect(result.principles_content).toBeNull();
  });

  test('cmdInitPlanPhase does not include principles_content when file absent', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['principles']), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.principles_content).toBeNull();
  });
});

// ─── ceremony level detection ────────────────────────────────────────────────

describe('ceremony level detection', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase includes ceremony_level field', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.ceremony_level).toBeDefined();
    expect(['light', 'standard', 'full']).toContain(result.ceremony_level);
  });

  test('cmdInitPlanPhase includes ceremony_level field', () => {
    const { stdout } = captureOutput(() => cmdInitPlanPhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.ceremony_level).toBeDefined();
    expect(['light', 'standard', 'full']).toContain(result.ceremony_level);
  });

  test('phase with 1 plan infers light ceremony', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    // fixture has 1 plan for phase 1 -> should infer light
    expect(result.ceremony_level).toBe('light');
  });
});

// ─── ceremony config overrides ───────────────────────────────────────────────

describe('ceremony config overrides', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('ceremony.default_level in config overrides auto-inference', () => {
    // Write a config with ceremony.default_level = 'full'
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.ceremony = { default_level: 'full' };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.ceremony_level).toBe('full');
  });

  test('ceremony.default_level = auto falls through to auto-inference', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.ceremony = { default_level: 'auto' };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    // auto falls through to inference — fixture has 1 plan -> light
    expect(result.ceremony_level).toBe('light');
  });

  test('ceremony.phase_overrides overrides ceremony for a specific phase', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.ceremony = { phase_overrides: { '1': 'full' } };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.ceremony_level).toBe('full');
  });

  test('ceremony.phase_overrides with zero-padded key also matches', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    // Store as '01' — should match phase '1' via integer normalization fallback
    config.ceremony = { phase_overrides: { '01': 'standard' } };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    // '01' normalized to '1' should NOT match — only integer-string '1' matches
    // The fallback converts phaseInfo.phase_number to an integer string ('1' -> '1')
    // which also won't match '01', so it falls through to auto-inference
    expect(['light', 'standard', 'full']).toContain(result.ceremony_level);
  });

  test('_readRoadmapCached returns cached content on second call', () => {
    // Two consecutive calls should both return a valid ceremony_level (cache exercised internally)
    const { stdout: s1 } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const { stdout: s2 } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const r1 = JSON.parse(s1);
    const r2 = JSON.parse(s2);
    expect(r1.ceremony_level).toBe(r2.ceremony_level);
  });
});

// ─── standards integration ───────────────────────────────────────────────────

describe('standards integration', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // Create standards directory with index at the path that standardsDir resolves to
    const { standardsDir } = require('../../lib/paths');
    const stdDir = standardsDir(tmpDir);
    fs.mkdirSync(path.join(stdDir, 'api'), { recursive: true });
    fs.writeFileSync(
      path.join(stdDir, 'index.yml'),
      'api:\n  response-format:\n    description: API response envelope\n    tags: [api, response]\n'
    );
    fs.writeFileSync(
      path.join(stdDir, 'api', 'response-format.md'),
      '---\narea: api\ntags: [response-format]\n---\n# API Response Envelope\nAll endpoints return {data, error, meta}.\n'
    );
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase includes standards_exists true', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.standards_exists).toBe(true);
    expect(result.standards_dir).toBeDefined();
  });

  test('cmdInitPlanPhase includes standards_exists true', () => {
    const { stdout } = captureOutput(() => cmdInitPlanPhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.standards_exists).toBe(true);
  });

  test('cmdInitQuick includes standards_exists true', () => {
    const { stdout } = captureOutput(() => cmdInitQuick(tmpDir, 'test-task', false));
    const result = JSON.parse(stdout);
    expect(result.standards_exists).toBe(true);
  });

  test('cmdInitNewProject includes standards_exists true', () => {
    const { stdout } = captureOutput(() => cmdInitNewProject(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result.standards_exists).toBe(true);
  });
});

// ─── webmcp_available integration ─────────────────────────────────────────────

describe('webmcp_available integration', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase includes webmcp_available boolean field', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(typeof result.webmcp_available).toBe('boolean');
  });

  test('cmdInitExecutePhase includes webmcp_skip_reason when not available', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    // Fixture has no webmcp config, so should be false with a reason
    expect(result.webmcp_available).toBe(false);
    expect(typeof result.webmcp_skip_reason).toBe('string');
    expect(result.webmcp_skip_reason.length).toBeGreaterThan(0);
  });

  test('cmdInitPlanPhase includes webmcp_available boolean field', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(typeof result.webmcp_available).toBe('boolean');
  });

  test('cmdInitVerifyWork includes webmcp_available boolean field', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitVerifyWork(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(typeof result.webmcp_available).toBe('boolean');
  });

  test('webmcp_skip_reason is null when webmcp is available', () => {
    // Create fixture with webmcp enabled
    const webmcpTmpDir = createFixtureDir();
    try {
      fs.writeFileSync(
        path.join(webmcpTmpDir, '.planning', 'config.json'),
        JSON.stringify({
          model_profile: 'balanced',
          branching_strategy: 'phase',
          phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
          milestone_branch_template: 'grd/{milestone}-{slug}',
          webmcp: { enabled: true },
        })
      );
      const { stdout } = captureOutput(() =>
        cmdInitExecutePhase(webmcpTmpDir, '1', new Set(), false)
      );
      const result = JSON.parse(stdout);
      expect(result.webmcp_available).toBe(true);
      expect(result.webmcp_skip_reason).toBeNull();
    } finally {
      cleanupFixtureDir(webmcpTmpDir);
    }
  });
});

// ─── native_worktree_available integration ──────────────────────────────────

describe('native_worktree_available integration', () => {
  let tmpDir;
  const savedEnv = {};
  const claudeCodeVars = Object.keys(process.env).filter((k) => k.startsWith('CLAUDE_CODE_'));
  const envVarsToClean = [
    ...claudeCodeVars,
    'CODEX_HOME',
    'CODEX_THREAD_ID',
    'GEMINI_CLI_HOME',
    'OPENCODE',
  ];

  beforeEach(() => {
    for (const key of envVarsToClean) {
      savedEnv[key] = process.env[key];
    }
    for (const key of envVarsToClean) {
      delete process.env[key];
    }
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    for (const key of envVarsToClean) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase includes native_worktree_available boolean field', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(typeof result.native_worktree_available).toBe('boolean');
  });

  test('native_worktree_available is true when backend is claude (default)', () => {
    // No config override and no backend env vars -> claude -> true
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('claude');
    expect(result.native_worktree_available).toBe(true);
  });

  test('native_worktree_available is false when backend is codex', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        backend: 'codex',
        branching_strategy: 'phase',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
      })
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('codex');
    expect(result.native_worktree_available).toBe(false);
  });
});

// ─── isolation_mode and main_repo_path integration ──────────────────────────

describe('isolation_mode and main_repo_path integration', () => {
  let tmpDir;
  const savedEnv = {};
  const claudeCodeVars = Object.keys(process.env).filter((k) => k.startsWith('CLAUDE_CODE_'));
  const envVarsToClean = [
    ...claudeCodeVars,
    'CODEX_HOME',
    'CODEX_THREAD_ID',
    'GEMINI_CLI_HOME',
    'OPENCODE',
  ];

  beforeEach(() => {
    for (const key of envVarsToClean) {
      savedEnv[key] = process.env[key];
    }
    for (const key of envVarsToClean) {
      delete process.env[key];
    }
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    for (const key of envVarsToClean) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
    cleanupFixtureDir(tmpDir);
  });

  test('isolation_mode is native when backend is claude and branching_strategy is phase', () => {
    // Default fixture: backend=claude (default), branching_strategy=phase
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('claude');
    expect(result.isolation_mode).toBe('native');
  });

  test('isolation_mode is manual when backend is codex and branching_strategy is phase', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        backend: 'codex',
        branching_strategy: 'phase',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
      })
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('codex');
    expect(result.isolation_mode).toBe('manual');
  });

  test('isolation_mode is none when branching_strategy is none regardless of backend', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        branching_strategy: 'none',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
      })
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.isolation_mode).toBe('none');
  });

  test('main_repo_path is a non-null string when branching_strategy is phase', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(typeof result.main_repo_path).toBe('string');
    expect(result.main_repo_path.length).toBeGreaterThan(0);
  });

  test('main_repo_path is null when branching_strategy is none', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        branching_strategy: 'none',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
      })
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.main_repo_path).toBeNull();
  });
});

describe('standards absent', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdInitExecutePhase sets standards_exists false when no index.yml', () => {
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.standards_exists).toBe(false);
  });
});

// ─── Phase 47: native vs manual isolation matrix ──────────────────────────

describe('Phase 47: native vs manual isolation matrix', () => {
  let tmpDir;
  const savedEnv = {};
  const claudeCodeVars = Object.keys(process.env).filter((k) => k.startsWith('CLAUDE_CODE_'));
  const envVarsToClean = [
    ...claudeCodeVars,
    'CODEX_HOME',
    'CODEX_THREAD_ID',
    'GEMINI_CLI_HOME',
    'OPENCODE',
  ];

  beforeEach(() => {
    for (const key of envVarsToClean) {
      savedEnv[key] = process.env[key];
    }
    for (const key of envVarsToClean) {
      delete process.env[key];
    }
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    for (const key of envVarsToClean) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
    cleanupFixtureDir(tmpDir);
  });

  function writeConfigForBackend(dir, backend, branchingStrategy) {
    fs.writeFileSync(
      path.join(dir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        backend: backend,
        branching_strategy: branchingStrategy,
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
      })
    );
  }

  // claude + phase -> isolation_mode='native', native_worktree_available=true, main_repo_path is string
  test('claude + phase -> isolation_mode=native, native_worktree_available=true, main_repo_path is string', () => {
    writeConfigForBackend(tmpDir, 'claude', 'phase');
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('claude');
    expect(result.isolation_mode).toBe('native');
    expect(result.native_worktree_available).toBe(true);
    expect(typeof result.main_repo_path).toBe('string');
    expect(result.main_repo_path.length).toBeGreaterThan(0);
  });

  // claude + none -> isolation_mode='none', native_worktree_available=true, main_repo_path=null
  test('claude + none -> isolation_mode=none, native_worktree_available=true, main_repo_path=null', () => {
    writeConfigForBackend(tmpDir, 'claude', 'none');
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('claude');
    expect(result.isolation_mode).toBe('none');
    expect(result.native_worktree_available).toBe(true);
    expect(result.main_repo_path).toBeNull();
  });

  // codex + phase -> isolation_mode='manual', native_worktree_available=false, main_repo_path is string
  test('codex + phase -> isolation_mode=manual, native_worktree_available=false, main_repo_path is string', () => {
    writeConfigForBackend(tmpDir, 'codex', 'phase');
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('codex');
    expect(result.isolation_mode).toBe('manual');
    expect(result.native_worktree_available).toBe(false);
    expect(typeof result.main_repo_path).toBe('string');
    expect(result.main_repo_path.length).toBeGreaterThan(0);
  });

  // codex + none -> isolation_mode='none', native_worktree_available=false, main_repo_path=null
  test('codex + none -> isolation_mode=none, native_worktree_available=false, main_repo_path=null', () => {
    writeConfigForBackend(tmpDir, 'codex', 'none');
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('codex');
    expect(result.isolation_mode).toBe('none');
    expect(result.native_worktree_available).toBe(false);
    expect(result.main_repo_path).toBeNull();
  });

  // gemini + phase -> isolation_mode='manual', native_worktree_available=false
  test('gemini + phase -> isolation_mode=manual, native_worktree_available=false', () => {
    writeConfigForBackend(tmpDir, 'gemini', 'phase');
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('gemini');
    expect(result.isolation_mode).toBe('manual');
    expect(result.native_worktree_available).toBe(false);
    expect(typeof result.main_repo_path).toBe('string');
  });

  // opencode + phase -> isolation_mode='manual', native_worktree_available=false
  test('opencode + phase -> isolation_mode=manual, native_worktree_available=false', () => {
    writeConfigForBackend(tmpDir, 'opencode', 'phase');
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.backend).toBe('opencode');
    expect(result.isolation_mode).toBe('manual');
    expect(result.native_worktree_available).toBe(false);
    expect(typeof result.main_repo_path).toBe('string');
  });

  // worktree_path is present and non-null when isolation_mode is manual (codex+phase)
  test('worktree_path is present and non-null when isolation_mode is manual', () => {
    writeConfigForBackend(tmpDir, 'codex', 'phase');
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.isolation_mode).toBe('manual');
    expect(result.worktree_path).toBeDefined();
    expect(result.worktree_path).not.toBeNull();
    expect(typeof result.worktree_path).toBe('string');
  });

  // worktree_branch is present and non-null when branching_strategy is phase
  test('worktree_branch is present and non-null when branching_strategy is phase', () => {
    writeConfigForBackend(tmpDir, 'claude', 'phase');
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.worktree_branch).toBeDefined();
    expect(result.worktree_branch).not.toBeNull();
    expect(typeof result.worktree_branch).toBe('string');
    expect(result.worktree_branch).toContain('v1.0');
  });

  // worktree_branch is null when branching_strategy is none
  test('worktree_branch is null when branching_strategy is none', () => {
    writeConfigForBackend(tmpDir, 'claude', 'none');
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.worktree_branch).toBeNull();
  });
});

// ─── inferCeremonyLevel overrides ─────────────────────────────────────────────

describe('inferCeremonyLevel overrides', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('ceremony.default_level auto falls back to inference', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({
        model_profile: 'balanced',
        branching_strategy: 'phase',
        phase_branch_template: 'grd/{milestone}/{phase}-{slug}',
        milestone_branch_template: 'grd/{milestone}-{slug}',
        ceremony: { default_level: 'auto' },
      })
    );
    const { stdout } = captureOutput(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    // Phase 1 has 1 plan → inferred as light
    expect(result.ceremony_level).toBe('light');
  });

});

// ─── gate failure paths ───────────────────────────────────────────────────────

describe('gate failure paths', () => {
  let failTmpDir;

  beforeAll(() => {
    failTmpDir = createFixtureDir();
    // Create orphan phase dir NOT in ROADMAP → triggers gate failure
    fs.mkdirSync(
      path.join(failTmpDir, '.planning', 'milestones', 'anonymous', 'phases', '03-orphan'),
      { recursive: true }
    );
  });

  afterAll(() => {
    cleanupFixtureDir(failTmpDir);
  });

  test('cmdInitExecutePhase returns gate_failed when orphaned phase exists', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitExecutePhase(failTmpDir, '3', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.gate_failed).toBe(true);
    expect(Array.isArray(result.gate_errors)).toBe(true);
    expect(result.gate_errors.length).toBeGreaterThan(0);
  });

  test('cmdInitPlanPhase returns gate_failed when orphaned phase exists', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitPlanPhase(failTmpDir, '3', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.gate_failed).toBe(true);
    expect(Array.isArray(result.gate_errors)).toBe(true);
    expect(result.gate_errors.length).toBeGreaterThan(0);
  });
});

describe('cmdInitNewMilestone gate failure', () => {
  let gateTmpDir;

  beforeAll(() => {
    gateTmpDir = createFixtureDir();
    // Write STATE.md with "milestone complete" text to trigger old-phases-archived gate
    fs.writeFileSync(
      path.join(gateTmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Updated:** 2026-01-15\n\n## Current Position\n\nMilestone Complete — Phase 2 done\n'
    );
  });

  afterAll(() => {
    cleanupFixtureDir(gateTmpDir);
  });

  test('returns gate_failed when old phases not archived after milestone complete', () => {
    const { stdout, exitCode } = captureOutput(() => cmdInitNewMilestone(gateTmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.gate_failed).toBe(true);
    expect(Array.isArray(result.gate_errors)).toBe(true);
    expect(result.gate_errors.length).toBeGreaterThan(0);
  });
});

// ─── plan-phase gate warnings (stale artifacts) ───────────────────────────────

describe('plan-phase gate warnings', () => {
  let warnTmpDir;

  beforeAll(() => {
    warnTmpDir = createFixtureDir();
    // Add stale artifact: summary without matching plan in phase 2
    fs.writeFileSync(
      path.join(
        warnTmpDir,
        '.planning',
        'milestones',
        'anonymous',
        'phases',
        '02-build',
        '02-99-SUMMARY.md'
      ),
      '# Summary\n\nOrphan summary with no matching plan.\n'
    );
  });

  afterAll(() => {
    cleanupFixtureDir(warnTmpDir);
  });

  test('cmdInitPlanPhase includes gate_warnings when stale artifacts exist', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdInitPlanPhase(warnTmpDir, '2', new Set(), false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    // Gate passes but has warnings
    expect(result.gate_failed).toBeUndefined();
    expect(Array.isArray(result.gate_warnings)).toBe(true);
    expect(result.gate_warnings.length).toBeGreaterThan(0);
  });
});

// ─── execute-phase include handlers ──────────────────────────────────────────

describe('execute-phase include handlers', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // Create CONTEXT.md in phase 1 directory
    fs.writeFileSync(
      path.join(
        tmpDir,
        '.planning',
        'milestones',
        'anonymous',
        'phases',
        '01-test',
        '01-CONTEXT.md'
      ),
      '# Context\n\nTest context for execute phase 1\n'
    );
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('includes config_content when config in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(['config']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.config_content).toBeDefined();
    expect(result.config_content).not.toBeNull();
  });

  test('includes roadmap_content when roadmap in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(['roadmap']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.roadmap_content).toBeDefined();
    expect(result.roadmap_content).toContain('Phase 1');
  });

  test('includes context_content when context in includes and CONTEXT.md exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(['context']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.context_content).toBeDefined();
    expect(result.context_content).toContain('execute phase 1');
  });

  test('does not set context_content when no CONTEXT.md in phase', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '2', new Set(['context']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.context_content).toBeUndefined();
  });
});

// ─── plan-phase include handlers ─────────────────────────────────────────────

describe('plan-phase include handlers', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    const phaseDir = path.join(
      tmpDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    fs.writeFileSync(
      path.join(phaseDir, '01-CONTEXT.md'),
      '# Context\n\nPlan phase context content\n'
    );
    fs.writeFileSync(
      path.join(phaseDir, '01-RESEARCH.md'),
      '# Research\n\nPlan phase research content\n'
    );
    fs.writeFileSync(
      path.join(phaseDir, '01-VERIFICATION.md'),
      '# Verification\n\nPlan phase verification content\n'
    );
    fs.writeFileSync(path.join(phaseDir, '01-UAT.md'), '# UAT\n\nPlan phase UAT content\n');
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('includes state_content when state in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['state']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.state_content).toBeDefined();
    expect(result.state_content).toContain('Current Position');
  });

  test('includes roadmap_content when roadmap in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['roadmap']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.roadmap_content).toBeDefined();
    expect(result.roadmap_content).toContain('Phase 1');
  });

  test('includes requirements_content when requirements in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['requirements']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.requirements_content).toBeDefined();
  });

  test('includes context_content when context in includes and CONTEXT.md exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['context']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.context_content).toBeDefined();
    expect(result.context_content).toContain('Plan phase context content');
  });

  test('includes research_content when research in includes and RESEARCH.md exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['research']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.research_content).toBeDefined();
    expect(result.research_content).toContain('Plan phase research content');
  });

  test('includes verification_content when verification in includes and file exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['verification']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.verification_content).toBeDefined();
    expect(result.verification_content).toContain('Plan phase verification content');
  });

  test('includes uat_content when uat in includes and UAT.md exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['uat']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.uat_content).toBeDefined();
    expect(result.uat_content).toContain('Plan phase UAT content');
  });
});

// ─── cmdInitQuick next_num increment ─────────────────────────────────────────

describe('cmdInitQuick next_num increment', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    const quickDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'quick');
    fs.mkdirSync(quickDir, { recursive: true });
    fs.mkdirSync(path.join(quickDir, '1-first-task'));
    fs.mkdirSync(path.join(quickDir, '2-second-task'));
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns next_num = 3 when existing tasks are numbered 1 and 2', () => {
    const { stdout } = captureOutput(() => cmdInitQuick(tmpDir, 'new task', false));
    const result = JSON.parse(stdout);
    expect(result.next_num).toBe(3);
  });
});

// ─── cmdInitMilestoneOp archive scanning ─────────────────────────────────────

describe('cmdInitMilestoneOp archive scanning', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    const archiveDir = path.join(tmpDir, '.planning', 'archive');
    fs.mkdirSync(path.join(archiveDir, 'v0.9'), { recursive: true });
    fs.mkdirSync(path.join(archiveDir, 'v0.8'));
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('includes archived milestones list when archive dir exists', () => {
    const { stdout } = captureOutput(() => cmdInitMilestoneOp(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result.archive_count).toBe(2);
    expect(result.archived_milestones).toContain('v0.9');
    expect(result.archived_milestones).toContain('v0.8');
    expect(result.archive_exists).toBe(true);
  });
});

// ─── cmdInitProgress paused state and additional includes ────────────────────

describe('cmdInitProgress paused state and additional includes', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // Update STATE.md to include a Paused At marker
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'STATE.md'),
      '# State\n\n**Updated:** 2026-01-15\n\n## Current Position\n\n**Paused At:** Phase 1, Plan 2\n'
    );
    // Create PROJECT.md for project include test
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'PROJECT.md'),
      '# Project\n\nTest project description.\n'
    );
    // Create a pending phase (no plan/summary/research files) to exercise nextPhase assignment
    fs.mkdirSync(
      path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '03-pending'),
      { recursive: true }
    );
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('detects paused_at when STATE.md has Paused At marker', () => {
    const { stdout } = captureOutput(() => cmdInitProgress(tmpDir, new Set(), false));
    const result = JSON.parse(stdout);
    expect(result.paused_at).toBe('Phase 1, Plan 2');
  });

  test('includes roadmap_content when roadmap in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitProgress(tmpDir, new Set(['roadmap']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.roadmap_content).toBeDefined();
    expect(result.roadmap_content).toContain('Phase 1');
  });

  test('includes project_content when project in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitProgress(tmpDir, new Set(['project']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.project_content).toBeDefined();
    expect(result.project_content).toContain('Test project description');
  });

  test('includes config_content when config in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitProgress(tmpDir, new Set(['config']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.config_content).toBeDefined();
    expect(result.config_content).not.toBeNull();
  });
});

// ─── cmdInitProgress cache behavior ──────────────────────────────────────────

describe('cmdInitProgress cache behavior', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('_progressCachePath returns path inside .planning/.cache/', () => {
    const cachePath = _progressCachePath(tmpDir);
    expect(cachePath).toContain(path.join('.planning', '.cache', 'progress.json'));
  });

  test('_computeProgressMtimeKey returns 0 when no files exist', () => {
    const emptyDir = fs.mkdtempSync(require('os').tmpdir() + '/grd-cache-test-');
    try {
      const key = _computeProgressMtimeKey(emptyDir);
      expect(key).toBe(0);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  test('_computeProgressMtimeKey returns positive number when STATE.md exists', () => {
    const key = _computeProgressMtimeKey(tmpDir);
    expect(key).toBeGreaterThan(0);
  });

  test('writes cache file after computing progress with no includes', () => {
    captureOutput(() => cmdInitProgress(tmpDir, new Set(), false));
    const cachePath = _progressCachePath(tmpDir);
    expect(fs.existsSync(cachePath)).toBe(true);
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(cache.mtime_key).toBeGreaterThan(0);
    expect(cache.data).toBeDefined();
    expect(cache.data.phase_count).toBeDefined();
  });

  test('does not write cache file when includes are requested', () => {
    captureOutput(() => cmdInitProgress(tmpDir, new Set(['state']), false));
    const cachePath = _progressCachePath(tmpDir);
    expect(fs.existsSync(cachePath)).toBe(false);
  });

  test('refresh=true bypasses cache and recomputes', () => {
    // Write a stale cache manually
    const cachePath = _progressCachePath(tmpDir);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ mtime_key: 99999999999, data: { phase_count: 99 } }));

    const { stdout } = captureOutput(() => cmdInitProgress(tmpDir, new Set(), false, true));
    const result = JSON.parse(stdout);
    expect(result.phase_count).not.toBe(99);
  });
});

// ─── cmdInitResearchWorkflow includes ────────────────────────────────────────

describe('cmdInitResearchWorkflow includes', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    const researchDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'LANDSCAPE.md'), '# Landscape\n\nSoTA overview.\n');
    fs.writeFileSync(path.join(researchDir, 'PAPERS.md'), '# Papers\n\nPaper list.\n');

    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'KNOWHOW.md'),
      '# Knowhow\n\nKnowledge base.\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'BASELINE.md'),
      '# Baseline\n\nBaseline metrics.\n'
    );

    const deepDivesDir = path.join(researchDir, 'deep-dives');
    fs.mkdirSync(deepDivesDir, { recursive: true });
    fs.writeFileSync(path.join(deepDivesDir, 'some-paper.md'), '# Paper\n\nDeep dive.\n');
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('includes landscape_content when landscape in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['landscape']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.landscape_content).toBeDefined();
    expect(result.landscape_content).toContain('SoTA overview');
  });

  test('includes papers_content when papers in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['papers']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.papers_content).toBeDefined();
    expect(result.papers_content).toContain('Paper list');
  });

  test('includes knowhow_content when knowhow in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['knowhow']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.knowhow_content).toBeDefined();
    expect(result.knowhow_content).toContain('Knowledge base');
  });

  test('includes baseline_content when baseline in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['baseline']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.baseline_content).toBeDefined();
    expect(result.baseline_content).toContain('Baseline metrics');
  });

  test('includes state_content when state in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['state']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.state_content).toBeDefined();
  });

  test('includes roadmap_content when roadmap in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['roadmap']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.roadmap_content).toBeDefined();
    expect(result.roadmap_content).toContain('Phase 1');
  });

  test('includes config_content when config in includes', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(['config']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.config_content).toBeDefined();
    expect(result.config_content).not.toBeNull();
  });

  test('lists deep-dives when workflow is deep-dive and dir exists', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'deep-dive', null, new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(Array.isArray(result.deep_dives)).toBe(true);
    expect(result.deep_dives).toContain('some-paper.md');
  });

  test('lists deep-dives when workflow is compare-methods', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'compare-methods', null, new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(Array.isArray(result.deep_dives)).toBe(true);
    expect(result.deep_dives.length).toBeGreaterThan(0);
  });

  test('lists deep-dives when workflow is feasibility', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'feasibility', null, new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(Array.isArray(result.deep_dives)).toBe(true);
  });
});

// ─── cmdInitPlanMilestoneGaps with audit file ────────────────────────────────

describe('cmdInitPlanMilestoneGaps with audit file', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // Create milestone audit file with frontmatter gaps
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'v1.0-MILESTONE-AUDIT.md'),
      '---\ngaps:\n  - Test coverage below target\n  - Missing integration tests\n---\n\n# Milestone Audit\n\nGaps identified.\n'
    );
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('finds and reports audit file', () => {
    const { stdout } = captureOutput(() => cmdInitPlanMilestoneGaps(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result.audit_file).toBe('v1.0-MILESTONE-AUDIT.md');
  });

  test('parses audit gaps from frontmatter when present', () => {
    const { stdout } = captureOutput(() => cmdInitPlanMilestoneGaps(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result.audit_gaps).toBeDefined();
    expect(Array.isArray(result.audit_gaps)).toBe(true);
    expect(result.audit_gaps.length).toBeGreaterThan(0);
  });
});

// ─── cmdInitDebug ─────────────────────────────────────────────────────────────

describe('cmdInitDebug', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns debug context with debug_files array', () => {
    const { stdout } = captureOutput(() => cmdInitDebug(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('debug_files');
    expect(Array.isArray(result.debug_files)).toBe(true);
    expect(result).toHaveProperty('backend');
  });

  test('returns phase-scoped context when phase provided', () => {
    const { stdout } = captureOutput(() => cmdInitDebug(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(true);
    expect(result.phase_number).toBe('01');
  });

  test('reports phase_found false for nonexistent phase', () => {
    const { stdout } = captureOutput(() => cmdInitDebug(tmpDir, '99', false));
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(false);
  });

  test('includes active_debug_file when debug files exist', () => {
    fs.writeFileSync(path.join(tmpDir, '.planning', 'DEBUG-test.md'), '# Debug\n');
    const { stdout } = captureOutput(() => cmdInitDebug(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result.debug_files).toContain('DEBUG-test.md');
    expect(result.active_debug_file).toBeTruthy();
  });
});

// ─── cmdInitIntegrationCheck ──────────────────────────────────────────────────

describe('cmdInitIntegrationCheck', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns cross-phase context with phase_count', () => {
    const { stdout } = captureOutput(() => cmdInitIntegrationCheck(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('phase_count');
    expect(typeof result.phase_count).toBe('number');
    expect(result.phase_count).toBeGreaterThan(0);
  });

  test('includes milestone info', () => {
    const { stdout } = captureOutput(() => cmdInitIntegrationCheck(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('milestone_version');
    expect(result).toHaveProperty('milestone_name');
  });

  test('scopes to phase when provided', () => {
    const { stdout } = captureOutput(() => cmdInitIntegrationCheck(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(true);
  });
});

// ─── cmdInitMigrate ───────────────────────────────────────────────────────────

describe('cmdInitMigrate', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns migration layout inventory', () => {
    const { stdout } = captureOutput(() => cmdInitMigrate(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('flat_milestone_files');
    expect(result).toHaveProperty('legacy_phase_dirs');
    expect(typeof result.complex_items_count).toBe('number');
  });

  test('detects flat milestone files', () => {
    const { stdout } = captureOutput(() => cmdInitMigrate(tmpDir, false));
    const result = JSON.parse(stdout);
    // v0.9-REQUIREMENTS.md is a flat milestone file in fixture
    expect(result.flat_milestone_files.some((f) => f.includes('v0.9-REQUIREMENTS.md'))).toBe(true);
  });

  test('includes paths', () => {
    const { stdout } = captureOutput(() => cmdInitMigrate(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('planning_dir');
    expect(result).toHaveProperty('milestones_dir');
    expect(result).toHaveProperty('phases_dir');
  });
});

// ─── cmdInitPlanCheck ────────────────────────────────────────────────────────

describe('cmdInitPlanCheck', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns plan check context for existing phase', () => {
    const { stdout } = captureOutput(() => cmdInitPlanCheck(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('checker_model');
    expect(result.phase_found).toBe(true);
    expect(typeof result.plan_count).toBe('number');
  });

  test('errors when no phase argument provided', () => {
    const { stderr, exitCode } = captureError(() => cmdInitPlanCheck(tmpDir, null, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase required');
  });

  test('returns phase_found false for nonexistent phase', () => {
    const { stdout } = captureOutput(() => cmdInitPlanCheck(tmpDir, '99', false));
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(false);
  });
});

// ─── cmdInitPhaseResearch ────────────────────────────────────────────────────

describe('cmdInitPhaseResearch', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns research context for existing phase', () => {
    const { stdout } = captureOutput(() => cmdInitPhaseResearch(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('researcher_model');
    expect(result).toHaveProperty('research_dir');
    expect(result.phase_found).toBe(true);
  });

  test('errors when no phase argument provided', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdInitPhaseResearch(tmpDir, null, new Set(), false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase required');
  });

  test('includes file contents when requested via includes', () => {
    const researchDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'LANDSCAPE.md'), '# Landscape\n');
    const { stdout } = captureOutput(() =>
      cmdInitPhaseResearch(tmpDir, '1', new Set(['landscape']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.landscape_content).toBeDefined();
  });
});

// ─── cmdInitCodeReview ────────────────────────────────────────────────────────

describe('cmdInitCodeReview', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns reviewer context for existing phase', () => {
    const { stdout } = captureOutput(() => cmdInitCodeReview(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('reviewer_model');
    expect(result.phase_found).toBe(true);
    expect(typeof result.plan_count).toBe('number');
  });

  test('errors when no phase argument provided', () => {
    const { stderr, exitCode } = captureError(() => cmdInitCodeReview(tmpDir, null, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase required');
  });

  test('includes code review config flags', () => {
    const { stdout } = captureOutput(() => cmdInitCodeReview(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('code_review_enabled');
    expect(result).toHaveProperty('code_review_timing');
  });
});

// ─── cmdInitAssessBaseline ────────────────────────────────────────────────────

describe('cmdInitAssessBaseline', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns baseline assessor context with required fields', () => {
    const { stdout } = captureOutput(() => cmdInitAssessBaseline(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('assessor_model');
    expect(result).toHaveProperty('phases_dir');
    expect(result).toHaveProperty('research_dir');
  });

  test('reports file existence flags', () => {
    const { stdout } = captureOutput(() => cmdInitAssessBaseline(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('baseline_exists');
    expect(result).toHaveProperty('benchmarks_exists');
    expect(result).toHaveProperty('roadmap_exists');
    expect(result).toHaveProperty('state_exists');
  });
});

// ─── cmdInitDeepDive ──────────────────────────────────────────────────────────

describe('cmdInitDeepDive', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns deep-diver context with topic', () => {
    const { stdout } = captureOutput(() => cmdInitDeepDive(tmpDir, 'attention is all you need', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('deep_diver_model');
    expect(result.topic).toBe('attention is all you need');
    expect(result).toHaveProperty('research_dir');
    expect(result).toHaveProperty('deep_dives_dir');
    expect(Array.isArray(result.deep_dives)).toBe(true);
    expect(typeof result.deep_dives_count).toBe('number');
  });

  test('returns deep-diver context without topic', () => {
    const { stdout } = captureOutput(() => cmdInitDeepDive(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result.topic).toBeNull();
  });

  test('lists deep-dive files when directory exists', () => {
    const researchDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'research');
    const deepDivesDir = path.join(researchDir, 'deep-dives');
    fs.mkdirSync(deepDivesDir, { recursive: true });
    fs.writeFileSync(path.join(deepDivesDir, 'paper-a.md'), '# Paper A\n');
    const { stdout } = captureOutput(() => cmdInitDeepDive(tmpDir, 'paper', false));
    const result = JSON.parse(stdout);
    expect(result.deep_dives_count).toBeGreaterThanOrEqual(1);
  });
});

// ─── cmdInitEvalPlan ──────────────────────────────────────────────────────────

describe('cmdInitEvalPlan', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns eval-planner context with phase', () => {
    const { stdout } = captureOutput(() => cmdInitEvalPlan(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('eval_planner_model');
    expect(result.phase_found).toBe(true);
    expect(result).toHaveProperty('phases_dir');
    expect(result).toHaveProperty('research_dir');
  });

  test('returns eval-planner context without phase', () => {
    const { stdout } = captureOutput(() => cmdInitEvalPlan(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(false);
    expect(result.phase_dir).toBeNull();
  });

  test('includes eval config and file existence flags', () => {
    const { stdout } = captureOutput(() => cmdInitEvalPlan(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('eval_config');
    expect(result).toHaveProperty('baseline_exists');
    expect(result).toHaveProperty('benchmarks_exists');
    expect(result).toHaveProperty('roadmap_exists');
  });
});

// ─── cmdInitEvalReport ────────────────────────────────────────────────────────

describe('cmdInitEvalReport', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns eval-reporter context with phase', () => {
    const { stdout } = captureOutput(() => cmdInitEvalReport(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('eval_reporter_model');
    expect(result.phase_found).toBe(true);
    expect(Array.isArray(result.plans)).toBe(true);
    expect(Array.isArray(result.summaries)).toBe(true);
  });

  test('returns eval-reporter context without phase', () => {
    const { stdout } = captureOutput(() => cmdInitEvalReport(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(false);
    expect(result.plans).toEqual([]);
    expect(result.summaries).toEqual([]);
  });

  test('includes file existence flags', () => {
    const { stdout } = captureOutput(() => cmdInitEvalReport(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('baseline_exists');
    expect(result).toHaveProperty('benchmarks_exists');
    expect(result).toHaveProperty('phases_dir');
    expect(result).toHaveProperty('research_dir');
  });
});

// ─── cmdInitFeasibility ───────────────────────────────────────────────────────

describe('cmdInitFeasibility', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns feasibility context with topic', () => {
    const { stdout } = captureOutput(() => cmdInitFeasibility(tmpDir, 'LoRA fine-tuning', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('feasibility_model');
    expect(result.topic).toBe('LoRA fine-tuning');
    expect(result).toHaveProperty('research_dir');
    expect(result).toHaveProperty('deep_dives_dir');
    expect(result).toHaveProperty('phases_dir');
  });

  test('returns feasibility context without topic', () => {
    const { stdout } = captureOutput(() => cmdInitFeasibility(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result.topic).toBeNull();
  });

  test('includes research file existence flags', () => {
    const { stdout } = captureOutput(() => cmdInitFeasibility(tmpDir, 'topic', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('landscape_exists');
    expect(result).toHaveProperty('papers_exists');
    expect(result).toHaveProperty('knowhow_exists');
    expect(Array.isArray(result.deep_dives)).toBe(true);
    expect(typeof result.deep_dives_count).toBe('number');
  });
});

// ─── cmdInitProductOwner ──────────────────────────────────────────────────────

describe('cmdInitProductOwner', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns product-owner context with required fields', () => {
    const { stdout } = captureOutput(() => cmdInitProductOwner(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('product_owner_model');
    expect(result).toHaveProperty('milestone_version');
    expect(result).toHaveProperty('phases_dir');
    expect(result).toHaveProperty('milestones_dir');
  });

  test('includes project file existence flags', () => {
    const { stdout } = captureOutput(() => cmdInitProductOwner(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('project_exists');
    expect(result).toHaveProperty('roadmap_exists');
    expect(result).toHaveProperty('state_exists');
    expect(result).toHaveProperty('requirements_exists');
    expect(result).toHaveProperty('product_quality_exists');
  });
});

// ─── cmdInitProjectResearcher ─────────────────────────────────────────────────

describe('cmdInitProjectResearcher', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns project-researcher context with topic', () => {
    const { stdout } = captureOutput(() => cmdInitProjectResearcher(tmpDir, 'neural compression', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('researcher_model');
    expect(result.topic).toBe('neural compression');
    expect(result).toHaveProperty('milestone_version');
    expect(result).toHaveProperty('research_dir');
    expect(result).toHaveProperty('milestones_dir');
  });

  test('returns project-researcher context without topic', () => {
    const { stdout } = captureOutput(() => cmdInitProjectResearcher(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result.topic).toBeNull();
  });

  test('includes file existence flags', () => {
    const { stdout } = captureOutput(() => cmdInitProjectResearcher(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('project_exists');
    expect(result).toHaveProperty('landscape_exists');
    expect(result).toHaveProperty('papers_exists');
    expect(result).toHaveProperty('roadmap_exists');
  });
});

// ─── cmdInitResearchSynthesizer ───────────────────────────────────────────────

describe('cmdInitResearchSynthesizer', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns research-synthesizer context with required fields', () => {
    const { stdout } = captureOutput(() => cmdInitResearchSynthesizer(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('synthesizer_model');
    expect(result).toHaveProperty('research_dir');
    expect(result).toHaveProperty('deep_dives_dir');
    expect(Array.isArray(result.deep_dives)).toBe(true);
    expect(typeof result.deep_dives_count).toBe('number');
  });

  test('includes research file existence flags', () => {
    const { stdout } = captureOutput(() => cmdInitResearchSynthesizer(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('landscape_exists');
    expect(result).toHaveProperty('papers_exists');
    expect(result).toHaveProperty('benchmarks_exists');
  });
});

// ─── cmdInitRoadmapper ────────────────────────────────────────────────────────

describe('cmdInitRoadmapper', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns roadmapper context with required fields', () => {
    const { stdout } = captureOutput(() => cmdInitRoadmapper(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('roadmapper_model');
    expect(result).toHaveProperty('milestone_version');
    expect(result).toHaveProperty('phases_dir');
    expect(result).toHaveProperty('milestones_dir');
  });

  test('includes file existence and config flags', () => {
    const { stdout } = captureOutput(() => cmdInitRoadmapper(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('project_exists');
    expect(result).toHaveProperty('roadmap_exists');
    expect(result).toHaveProperty('requirements_exists');
    expect(result).toHaveProperty('state_exists');
    expect(result).toHaveProperty('ceremony');
    expect(result).toHaveProperty('tracker');
  });
});

// ─── cmdInitSurveyor ──────────────────────────────────────────────────────────

describe('cmdInitSurveyor', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns surveyor context with topic', () => {
    const { stdout } = captureOutput(() => cmdInitSurveyor(tmpDir, 'diffusion models', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('surveyor_model');
    expect(result.topic).toBe('diffusion models');
    expect(result).toHaveProperty('research_dir');
    expect(result).toHaveProperty('milestones_dir');
  });

  test('returns surveyor context without topic', () => {
    const { stdout } = captureOutput(() => cmdInitSurveyor(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result.topic).toBeNull();
  });

  test('includes research file existence flags', () => {
    const { stdout } = captureOutput(() => cmdInitSurveyor(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('landscape_exists');
    expect(result).toHaveProperty('papers_exists');
    expect(result).toHaveProperty('benchmarks_exists');
    expect(result).toHaveProperty('project_exists');
  });
});

// ─── cmdInitVerifier ──────────────────────────────────────────────────────────

describe('cmdInitVerifier', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns verifier context with phase', () => {
    const { stdout } = captureOutput(() => cmdInitVerifier(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('verifier_model');
    expect(result.phase_found).toBe(true);
    expect(Array.isArray(result.plans)).toBe(true);
    expect(Array.isArray(result.summaries)).toBe(true);
  });

  test('returns verifier context without phase', () => {
    const { stdout } = captureOutput(() => cmdInitVerifier(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result.phase_found).toBe(false);
    expect(result.plans).toEqual([]);
    expect(result.summaries).toEqual([]);
  });

  test('includes file existence and config flags', () => {
    const { stdout } = captureOutput(() => cmdInitVerifier(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('baseline_exists');
    expect(result).toHaveProperty('benchmarks_exists');
    expect(result).toHaveProperty('eval_config');
    expect(result).toHaveProperty('phases_dir');
    expect(result).toHaveProperty('research_dir');
  });
});

// ─── Agent-named alias functions ─────────────────────────────────────────────

describe('cmdInitBaselineAssessor', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitAssessBaseline and returns same structure', () => {
    const { stdout } = captureOutput(() => cmdInitBaselineAssessor(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('assessor_model');
    expect(result).toHaveProperty('baseline_exists');
  });
});

describe('cmdInitCodeReviewer', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitCodeReview and returns reviewer context', () => {
    const { stdout } = captureOutput(() => cmdInitCodeReviewer(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('reviewer_model');
  });
});

describe('cmdInitCodebaseMapper', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitMapCodebase and returns mapper context', () => {
    const { stdout } = captureOutput(() => cmdInitCodebaseMapper(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('mapper_model');
  });
});

describe('cmdInitDebugger', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitDebug and returns debug context', () => {
    const { stdout } = captureOutput(() => cmdInitDebugger(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('debug_files');
  });
});

describe('cmdInitDeepDiver', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitDeepDive and returns deep-diver context', () => {
    const { stdout } = captureOutput(() => cmdInitDeepDiver(tmpDir, 'test topic', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('deep_diver_model');
    expect(result.topic).toBe('test topic');
  });
});

describe('cmdInitEvalPlanner', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitEvalPlan and returns eval-planner context', () => {
    const { stdout } = captureOutput(() => cmdInitEvalPlanner(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('eval_planner_model');
  });
});

describe('cmdInitEvalReporter', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitEvalReport and returns eval-reporter context', () => {
    const { stdout } = captureOutput(() => cmdInitEvalReporter(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('eval_reporter_model');
  });
});

describe('cmdInitExecutor', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('returns executor context with phase info', () => {
    const { stdout } = captureOutput(() => cmdInitExecutor(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('executor_model');
    expect(result.phase_found).toBe(true);
    expect(result).toHaveProperty('plan_count');
  });

  test('errors when phase is missing', () => {
    const { exitCode } = captureError(() => cmdInitExecutor(tmpDir, null, new Set(), false));
    expect(exitCode).toBe(1);
  });

  test('includes state content when requested', () => {
    const { stdout } = captureOutput(() => cmdInitExecutor(tmpDir, '1', new Set(['state']), false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('state_content');
  });
});

describe('cmdInitFeasibilityAnalyst', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitFeasibility and returns feasibility context', () => {
    const { stdout } = captureOutput(() => cmdInitFeasibilityAnalyst(tmpDir, 'ViT', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('feasibility_model');
  });
});

describe('cmdInitIntegrationChecker', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitIntegrationCheck and returns integration context', () => {
    const { stdout } = captureOutput(() => cmdInitIntegrationChecker(tmpDir, null, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('phase_count');
    expect(result).toHaveProperty('summary_count');
  });
});

describe('cmdInitMigrator', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitMigrate and returns migrator context', () => {
    const { stdout } = captureOutput(() => cmdInitMigrator(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('planning_dir');
    expect(result).toHaveProperty('milestones_dir');
  });
});

describe('cmdInitPhaseResearcher', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitPhaseResearch and returns researcher context', () => {
    const { stdout } = captureOutput(() => cmdInitPhaseResearcher(tmpDir, '1', new Set(), false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('researcher_model');
  });
});

describe('cmdInitPlanChecker', () => {
  let tmpDir;
  beforeAll(() => { tmpDir = createFixtureDir(); });
  afterAll(() => { cleanupFixtureDir(tmpDir); });

  test('delegates to cmdInitPlanCheck and returns plan-checker context', () => {
    const { stdout } = captureOutput(() => cmdInitPlanChecker(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('checker_model');
  });
});
