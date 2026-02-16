/**
 * Context init backward compatibility tests across all 4 backends (DEFER-10-01)
 *
 * Validates all 14 cmdInit* functions produce correct output under each backend.
 * Uses config override (writing backend to .planning/config.json) rather than
 * env vars for backend switching to test the highest-priority detection path
 * and avoid env var interference between parallel tests.
 *
 * Coverage:
 *   - All 14 cmdInit* functions verified under claude (baseline regression check)
 *   - Representative functions verified under codex, gemini, opencode
 *   - Model fields are backend-resolved
 *   - No regressions under claude backend
 */

const fs = require('fs');
const path = require('path');
const { captureOutput } = require('../helpers/setup');
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
const { VALID_BACKENDS, BACKEND_CAPABILITIES, DEFAULT_BACKEND_MODELS, clearModelCache } = require('../../lib/backend');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Write a backend value into the fixture's config.json, preserving existing fields.
 */
function setFixtureBackend(fixtureDir, backend) {
  const configPath = path.join(fixtureDir, '.planning', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  config.backend = backend;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Remove backend field from fixture config (restore to default/claude).
 */
function clearFixtureBackend(fixtureDir) {
  const configPath = path.join(fixtureDir, '.planning', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  delete config.backend;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Call a cmdInit* function and return parsed JSON result.
 */
function callInit(fn) {
  const { stdout, exitCode } = captureOutput(fn);
  expect(exitCode).toBe(0);
  return JSON.parse(stdout);
}

// ─── Save/restore env vars ───────────────────────────────────────────────

const savedEnv = {};
const claudeCodeVars = Object.keys(process.env).filter((k) => k.startsWith('CLAUDE_CODE_'));
const envVarsToClean = [
  ...claudeCodeVars,
  'CODEX_HOME',
  'CODEX_THREAD_ID',
  'GEMINI_CLI_HOME',
  'OPENCODE',
];

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Context init backward compatibility (DEFER-10-01)', () => {
  let tmpDir;

  beforeEach(() => {
    // Save and clear env vars to prevent env var interference
    for (const key of envVarsToClean) {
      savedEnv[key] = process.env[key];
    }
    for (const key of envVarsToClean) {
      delete process.env[key];
    }
    // Also clear any new CLAUDE_CODE_* that may appear
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CLAUDE_CODE_')) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
      }
    }
    // Clear dynamic model detection cache to ensure clean state
    clearModelCache();
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    // Restore env vars
    for (const key of Object.keys(savedEnv)) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
    cleanupFixtureDir(tmpDir);
  });

  // ─── All 14 cmdInit* functions under claude (baseline regression) ──────

  describe('claude backend baseline (all 14 functions)', () => {
    test('cmdInitExecutePhase: correct structure under claude', () => {
      const result = callInit(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('executor_model');
      expect(result).toHaveProperty('verifier_model');
      expect(result).toHaveProperty('reviewer_model');
      expect(result).toHaveProperty('phase_found');
      expect(result).toHaveProperty('plans');
      expect(result).toHaveProperty('summaries');
      expect(result).toHaveProperty('plan_count');
    });

    test('cmdInitPlanPhase: correct structure under claude', () => {
      const result = callInit(() => cmdInitPlanPhase(tmpDir, '1', new Set(), false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('researcher_model');
      expect(result).toHaveProperty('planner_model');
      expect(result).toHaveProperty('checker_model');
      expect(result).toHaveProperty('phase_found');
      expect(result).toHaveProperty('has_plans');
    });

    test('cmdInitNewProject: correct structure under claude', () => {
      const result = callInit(() => cmdInitNewProject(tmpDir, false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('researcher_model');
      expect(result).toHaveProperty('synthesizer_model');
      expect(result).toHaveProperty('roadmapper_model');
      expect(result).toHaveProperty('is_brownfield');
    });

    test('cmdInitNewMilestone: correct structure under claude', () => {
      const result = callInit(() => cmdInitNewMilestone(tmpDir, false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('researcher_model');
      expect(result).toHaveProperty('current_milestone');
    });

    test('cmdInitQuick: correct structure under claude', () => {
      const result = callInit(() => cmdInitQuick(tmpDir, 'test task', false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('planner_model');
      expect(result).toHaveProperty('executor_model');
      expect(result).toHaveProperty('slug');
      expect(result).toHaveProperty('next_num');
    });

    test('cmdInitResume: correct structure under claude', () => {
      const result = callInit(() => cmdInitResume(tmpDir, false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('state_exists');
      expect(result).toHaveProperty('has_interrupted_agent');
    });

    test('cmdInitVerifyWork: correct structure under claude', () => {
      const result = callInit(() => cmdInitVerifyWork(tmpDir, '1', false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('planner_model');
      expect(result).toHaveProperty('checker_model');
      expect(result).toHaveProperty('phase_found');
    });

    test('cmdInitPhaseOp: correct structure under claude', () => {
      const result = callInit(() => cmdInitPhaseOp(tmpDir, '1', false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('phase_found');
      expect(result).toHaveProperty('phase_slug');
      expect(result).toHaveProperty('has_plans');
    });

    test('cmdInitTodos: correct structure under claude', () => {
      const result = callInit(() => cmdInitTodos(tmpDir, null, false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('todo_count');
      expect(result).toHaveProperty('todos');
    });

    test('cmdInitMilestoneOp: correct structure under claude', () => {
      const result = callInit(() => cmdInitMilestoneOp(tmpDir, false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('milestone_version');
      expect(result).toHaveProperty('phase_count');
      expect(result).toHaveProperty('all_phases_complete');
    });

    test('cmdInitMapCodebase: correct structure under claude', () => {
      const result = callInit(() => cmdInitMapCodebase(tmpDir, false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('mapper_model');
      expect(result).toHaveProperty('codebase_dir');
    });

    test('cmdInitProgress: correct structure under claude', () => {
      const result = callInit(() => cmdInitProgress(tmpDir, new Set(), false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('executor_model');
      expect(result).toHaveProperty('planner_model');
      expect(result).toHaveProperty('phases');
      expect(result).toHaveProperty('phase_count');
    });

    test('cmdInitResearchWorkflow: correct structure under claude', () => {
      const result = callInit(() =>
        cmdInitResearchWorkflow(tmpDir, 'survey', 'test topic', new Set(), false)
      );
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('researcher_model');
      expect(result).toHaveProperty('planner_model');
      expect(result).toHaveProperty('workflow');
    });

    test('cmdInitPlanMilestoneGaps: correct structure under claude', () => {
      const result = callInit(() => cmdInitPlanMilestoneGaps(tmpDir, false));
      expect(result.backend).toBe('claude');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.claude);
      expect(result).toHaveProperty('milestone_version');
      expect(result).toHaveProperty('phase_count');
    });
  });

  // ─── Claude model resolution check ─────────────────────────────────────

  describe('claude model resolution (regression check)', () => {
    test('executor_model uses claude model names (not backend-resolved)', () => {
      const result = callInit(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
      // Under claude + balanced profile, executor_model maps to 'sonnet'
      expect(['opus', 'sonnet', 'haiku']).toContain(result.executor_model);
    });

    test('planner_model uses claude model names', () => {
      const result = callInit(() => cmdInitPlanPhase(tmpDir, '1', new Set(), false));
      expect(['opus', 'sonnet', 'haiku']).toContain(result.planner_model);
    });

    test('researcher_model uses claude model names', () => {
      const result = callInit(() =>
        cmdInitResearchWorkflow(tmpDir, 'survey', null, new Set(), false)
      );
      expect(['opus', 'sonnet', 'haiku']).toContain(result.researcher_model);
    });
  });

  // ─── Backend-per-function matrix (representative sample) ───────────────

  describe('backend-per-function matrix (codex/gemini/opencode)', () => {
    const nonClaudeBackends = ['codex', 'gemini', 'opencode'];

    describe.each(nonClaudeBackends)('%s backend', (backend) => {
      test('cmdInitExecutePhase: backend and capabilities correct', () => {
        setFixtureBackend(tmpDir, backend);
        const result = callInit(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
        expect(result.backend).toBe(backend);
        expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES[backend]);
      });

      test('cmdInitExecutePhase: executor_model is backend-resolved', () => {
        setFixtureBackend(tmpDir, backend);
        const result = callInit(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
        // Model should NOT be raw tier names (opus/sonnet/haiku) but backend-specific.
        // For opencode, dynamic detection may return different model names from
        // the `opencode models` CLI, so we check it's not a raw Claude tier name.
        const rawClaudeTiers = ['opus', 'sonnet', 'haiku'];
        expect(rawClaudeTiers).not.toContain(result.executor_model);
      });

      test('cmdInitPlanPhase: backend and model resolution', () => {
        setFixtureBackend(tmpDir, backend);
        const result = callInit(() => cmdInitPlanPhase(tmpDir, '1', new Set(), false));
        expect(result.backend).toBe(backend);
        expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES[backend]);
        // Model should not be raw Claude tier names
        const rawClaudeTiers = ['opus', 'sonnet', 'haiku'];
        expect(rawClaudeTiers).not.toContain(result.planner_model);
      });

      test('cmdInitNewProject: backend and capabilities', () => {
        setFixtureBackend(tmpDir, backend);
        const result = callInit(() => cmdInitNewProject(tmpDir, false));
        expect(result.backend).toBe(backend);
        expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES[backend]);
      });

      test('cmdInitProgress: backend and model resolution', () => {
        setFixtureBackend(tmpDir, backend);
        const result = callInit(() => cmdInitProgress(tmpDir, new Set(), false));
        expect(result.backend).toBe(backend);
        // Model should not be raw Claude tier names
        const rawClaudeTiers = ['opus', 'sonnet', 'haiku'];
        expect(rawClaudeTiers).not.toContain(result.executor_model);
        expect(rawClaudeTiers).not.toContain(result.planner_model);
      });
    });
  });

  // ─── All 14 functions produce valid JSON with backend fields ───────────

  describe('all 14 functions produce valid JSON with backend fields', () => {
    const functions = [
      { name: 'cmdInitExecutePhase', fn: (dir) => cmdInitExecutePhase(dir, '1', new Set(), false) },
      { name: 'cmdInitPlanPhase', fn: (dir) => cmdInitPlanPhase(dir, '1', new Set(), false) },
      { name: 'cmdInitNewProject', fn: (dir) => cmdInitNewProject(dir, false) },
      { name: 'cmdInitNewMilestone', fn: (dir) => cmdInitNewMilestone(dir, false) },
      { name: 'cmdInitQuick', fn: (dir) => cmdInitQuick(dir, 'test', false) },
      { name: 'cmdInitResume', fn: (dir) => cmdInitResume(dir, false) },
      { name: 'cmdInitVerifyWork', fn: (dir) => cmdInitVerifyWork(dir, '1', false) },
      { name: 'cmdInitPhaseOp', fn: (dir) => cmdInitPhaseOp(dir, '1', false) },
      { name: 'cmdInitTodos', fn: (dir) => cmdInitTodos(dir, null, false) },
      { name: 'cmdInitMilestoneOp', fn: (dir) => cmdInitMilestoneOp(dir, false) },
      { name: 'cmdInitMapCodebase', fn: (dir) => cmdInitMapCodebase(dir, false) },
      { name: 'cmdInitProgress', fn: (dir) => cmdInitProgress(dir, new Set(), false) },
      { name: 'cmdInitResearchWorkflow', fn: (dir) => cmdInitResearchWorkflow(dir, 'survey', null, new Set(), false) },
      { name: 'cmdInitPlanMilestoneGaps', fn: (dir) => cmdInitPlanMilestoneGaps(dir, false) },
    ];

    test.each(functions.map((f) => [f.name, f.fn]))('%s produces valid JSON with backend and backend_capabilities under codex', (name, fn) => {
      setFixtureBackend(tmpDir, 'codex');
      const result = callInit(() => fn(tmpDir));
      expect(result.backend).toBe('codex');
      expect(result.backend_capabilities).toEqual(BACKEND_CAPABILITIES.codex);
    });
  });

  // ─── No regressions: output shape consistency ──────────────────────────

  describe('no regressions: output shape unchanged across backends', () => {
    test('cmdInitExecutePhase output keys are identical across all 4 backends', () => {
      // Get claude baseline keys
      clearFixtureBackend(tmpDir);
      const claudeResult = callInit(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
      const claudeKeys = Object.keys(claudeResult).sort();

      for (const backend of ['codex', 'gemini', 'opencode']) {
        setFixtureBackend(tmpDir, backend);
        const result = callInit(() => cmdInitExecutePhase(tmpDir, '1', new Set(), false));
        const keys = Object.keys(result).sort();
        expect(keys).toEqual(claudeKeys);
      }
    });

    test('cmdInitPlanPhase output keys are identical across all 4 backends', () => {
      clearFixtureBackend(tmpDir);
      const claudeResult = callInit(() => cmdInitPlanPhase(tmpDir, '1', new Set(), false));
      const claudeKeys = Object.keys(claudeResult).sort();

      for (const backend of ['codex', 'gemini', 'opencode']) {
        setFixtureBackend(tmpDir, backend);
        const result = callInit(() => cmdInitPlanPhase(tmpDir, '1', new Set(), false));
        const keys = Object.keys(result).sort();
        expect(keys).toEqual(claudeKeys);
      }
    });

    test('cmdInitNewProject output keys are identical across all 4 backends', () => {
      clearFixtureBackend(tmpDir);
      const claudeResult = callInit(() => cmdInitNewProject(tmpDir, false));
      const claudeKeys = Object.keys(claudeResult).sort();

      for (const backend of ['codex', 'gemini', 'opencode']) {
        setFixtureBackend(tmpDir, backend);
        const result = callInit(() => cmdInitNewProject(tmpDir, false));
        const keys = Object.keys(result).sort();
        expect(keys).toEqual(claudeKeys);
      }
    });
  });
});
