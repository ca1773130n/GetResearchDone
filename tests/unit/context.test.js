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

  test('all 14 cmdInit* functions include backend (spot check)', () => {
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
