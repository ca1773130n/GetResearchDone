/**
 * Unit tests for lib/commands.js
 *
 * Tests 17 standalone utility commands: slug, timestamp, todos, path verify,
 * config operations, history digest, model resolution, phase lookup, commit,
 * plan indexing, summary extraction, progress rendering, dashboard,
 * phase detail, health.
 */

const fs = require('fs');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdListTodos,
  cmdTodoComplete,
  cmdVerifyPathExists,
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdHistoryDigest,
  cmdResolveModel,
  cmdFindPhase,
  cmdCommit,
  cmdPhasePlanIndex,
  cmdSummaryExtract,
  cmdProgressRender,
  cmdDashboard,
  cmdPhaseDetail,
  cmdHealth,
  cmdDetectBackend,
  cmdLongTermRoadmap,
  cmdQualityAnalysis,
  cmdRequirementGet,
  cmdRequirementList,
  cmdRequirementTraceability,
  cmdSearch,
  cmdRequirementUpdateStatus,
  cmdMigrateDirs,
} = require('../../lib/commands');
const { clearModelCache } = require('../../lib/backend');

/**
 * Parse the first JSON object from stdout that may contain concatenated
 * pretty-printed JSON (when cmd functions have try/catch that catches the
 * process.exit sentinel and calls output() again).
 */
function parseFirstJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return JSON.parse(str.slice(0, i + 1));
      }
    }
    throw new Error('Failed to parse first JSON from: ' + str.slice(0, 100));
  }
}

// ─── cmdGenerateSlug ────────────────────────────────────────────────────────

describe('cmdGenerateSlug', () => {
  test('"Hello World" produces slug field', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdGenerateSlug('Hello World', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.slug).toBe('hello-world');
  });

  test('errors on empty input', () => {
    const { exitCode } = captureError(() => {
      cmdGenerateSlug('', false);
    });
    expect(exitCode).toBe(1);
  });
});

// ─── cmdCurrentTimestamp ────────────────────────────────────────────────────

describe('cmdCurrentTimestamp', () => {
  test('"full" mode returns ISO timestamp', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdCurrentTimestamp('full', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('"date" mode returns date only', () => {
    const { stdout } = captureOutput(() => {
      cmdCurrentTimestamp('date', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('"filename" mode returns filename-safe timestamp', () => {
    const { stdout } = captureOutput(() => {
      cmdCurrentTimestamp('filename', false);
    });
    const parsed = JSON.parse(stdout);
    // filename mode replaces colons with dashes
    expect(parsed.timestamp).not.toContain(':');
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('raw mode returns plain text timestamp', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdCurrentTimestamp('full', true);
    });
    expect(exitCode).toBe(0);
    // Raw mode outputs the value directly, not JSON
    expect(stdout).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ─── cmdListTodos ───────────────────────────────────────────────────────────

describe('cmdListTodos', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns array of pending todos from fixture', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdListTodos(fixtureDir, null, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.count).toBeGreaterThanOrEqual(1);
    expect(parsed.todos).toBeInstanceOf(Array);
    expect(parsed.todos[0]).toHaveProperty('file');
    expect(parsed.todos[0]).toHaveProperty('title');
  });

  test('returns empty array with no todos', () => {
    const { stdout } = captureOutput(() => {
      cmdListTodos('/tmp/nonexistent-dir-12345', null, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.count).toBe(0);
    expect(parsed.todos).toEqual([]);
  });
});

// ─── cmdTodoComplete ────────────────────────────────────────────────────────

describe('cmdTodoComplete', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('moves todo from pending to completed', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdTodoComplete(fixtureDir, 'sample.md', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.completed).toBe(true);

    // Verify file moved
    const pendingPath = path.join(fixtureDir, '.planning', 'milestones', 'anonymous', 'todos', 'pending', 'sample.md');
    const completedPath = path.join(fixtureDir, '.planning', 'milestones', 'anonymous', 'todos', 'completed', 'sample.md');
    expect(fs.existsSync(pendingPath)).toBe(false);
    expect(fs.existsSync(completedPath)).toBe(true);
  });

  test('errors when todo not found', () => {
    const { exitCode } = captureError(() => {
      cmdTodoComplete(fixtureDir, 'nonexistent.md', false);
    });
    expect(exitCode).toBe(1);
  });
});

// ─── cmdVerifyPathExists ────────────────────────────────────────────────────

describe('cmdVerifyPathExists', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('existing file returns exists: true', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyPathExists(fixtureDir, '.planning/config.json', false);
    });
    expect(exitCode).toBe(0);
    // cmdVerifyPathExists has try/catch that catches exit sentinel
    const parsed = parseFirstJson(stdout);
    expect(parsed.exists).toBe(true);
    expect(parsed.type).toBe('file');
  });

  test('existing directory returns type: directory', () => {
    const { stdout } = captureOutput(() => {
      cmdVerifyPathExists(fixtureDir, '.planning/milestones/anonymous/phases', false);
    });
    const parsed = parseFirstJson(stdout);
    expect(parsed.exists).toBe(true);
    expect(parsed.type).toBe('directory');
  });

  test('missing file returns exists: false', () => {
    const { stdout } = captureOutput(() => {
      cmdVerifyPathExists(fixtureDir, 'nonexistent/file.txt', false);
    });
    // Missing file also has try/catch pattern
    const parsed = parseFirstJson(stdout);
    expect(parsed.exists).toBe(false);
    expect(parsed.type).toBeNull();
  });
});

// ─── cmdConfigEnsureSection ─────────────────────────────────────────────────

describe('cmdConfigEnsureSection', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns already_exists when config.json present', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdConfigEnsureSection(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(false);
    expect(parsed.reason).toBe('already_exists');
  });

  test('creates default config when missing', () => {
    // Remove config.json
    fs.unlinkSync(path.join(fixtureDir, '.planning', 'config.json'));

    const { stdout, exitCode } = captureOutput(() => {
      cmdConfigEnsureSection(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.created).toBe(true);

    // Verify config was created with all expected sections
    const config = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, '.planning', 'config.json'), 'utf-8')
    );
    expect(config).toHaveProperty('model_profile');
    expect(config).toHaveProperty('workflow');
    expect(config).toHaveProperty('tracker');
  });
});

// ─── cmdConfigSet ───────────────────────────────────────────────────────────

describe('cmdConfigSet', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('sets a config key value', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdConfigSet(fixtureDir, 'autonomous_mode', 'true', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.updated).toBe(true);
    expect(parsed.key).toBe('autonomous_mode');
    expect(parsed.value).toBe(true);
  });

  test('persists config change to disk', () => {
    captureOutput(() => {
      cmdConfigSet(fixtureDir, 'model_profile', 'quality', false);
    });
    const config = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, '.planning', 'config.json'), 'utf-8')
    );
    expect(config.model_profile).toBe('quality');
  });

  test('sets nested keys with dot notation', () => {
    captureOutput(() => {
      cmdConfigSet(fixtureDir, 'workflow.research', 'true', false);
    });
    const config = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, '.planning', 'config.json'), 'utf-8')
    );
    expect(config.workflow.research).toBe(true);
  });
});

// ─── cmdHistoryDigest ───────────────────────────────────────────────────────

describe('cmdHistoryDigest', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns digest with phase data from fixture summaries', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdHistoryDigest(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('phases');
    expect(parsed).toHaveProperty('decisions');
    expect(parsed).toHaveProperty('tech_stack');
  });

  test('returns empty digest with no summaries', () => {
    const { stdout } = captureOutput(() => {
      cmdHistoryDigest('/tmp/nonexistent-dir-12345', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.tech_stack).toEqual([]);
  });
});

// ─── cmdResolveModel ────────────────────────────────────────────────────────

describe('cmdResolveModel', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('"grd-executor" returns model for current profile', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdResolveModel(fixtureDir, 'grd-executor', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('model');
    expect(parsed).toHaveProperty('profile');
    // Fixture is "balanced" profile => executor = sonnet
    expect(parsed.model).toBe('sonnet');
    expect(parsed.profile).toBe('balanced');
  });

  test('unknown agent returns sonnet with unknown flag', () => {
    const { stdout } = captureOutput(() => {
      cmdResolveModel(fixtureDir, 'unknown-agent', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.model).toBe('sonnet');
    expect(parsed.unknown_agent).toBe(true);
  });

  test('errors when no agent type provided', () => {
    const { exitCode } = captureError(() => {
      cmdResolveModel(fixtureDir, '', false);
    });
    expect(exitCode).toBe(1);
  });
});

// ─── cmdFindPhase ───────────────────────────────────────────────────────────

describe('cmdFindPhase', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('phase 1 returns directory path and metadata', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdFindPhase(fixtureDir, '1', false);
    });
    expect(exitCode).toBe(0);
    // cmdFindPhase has try/catch that catches exit sentinel
    const parsed = parseFirstJson(stdout);
    expect(parsed.found).toBe(true);
    expect(parsed.directory).toContain('01-test');
    expect(parsed.phase_number).toBe('01');
    expect(parsed.plans.length).toBeGreaterThan(0);
  });

  test('nonexistent phase returns found: false', () => {
    const { stdout } = captureOutput(() => {
      cmdFindPhase(fixtureDir, '99', false);
    });
    const parsed = parseFirstJson(stdout);
    expect(parsed.found).toBe(false);
  });

  test('errors when no phase provided', () => {
    const { exitCode } = captureError(() => {
      cmdFindPhase(fixtureDir, '', false);
    });
    expect(exitCode).toBe(1);
  });
});

// ─── cmdCommit ──────────────────────────────────────────────────────────────

describe('cmdCommit', () => {
  test('errors when no commit message provided', () => {
    const { exitCode } = captureError(() => {
      cmdCommit('/tmp', '', [], false, false);
    });
    expect(exitCode).toBe(1);
  });

  test('returns skipped when commit_docs is false', () => {
    // Create a temp dir with config that has commit_docs: false
    const tmpDir = createFixtureDir();
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.commit_docs = false;
    fs.writeFileSync(configPath, JSON.stringify(config), 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdCommit(tmpDir, 'test commit', [], false, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.committed).toBe(false);
    expect(parsed.reason).toBe('skipped_commit_docs_false');
    cleanupFixtureDir(tmpDir);
  });
});

// ─── cmdPhasePlanIndex ──────────────────────────────────────────────────────

describe('cmdPhasePlanIndex', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('phase 1 returns plan index with wave and status', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhasePlanIndex(fixtureDir, '1', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.plans.length).toBeGreaterThan(0);
    expect(parsed.plans[0]).toHaveProperty('id');
    expect(parsed.plans[0]).toHaveProperty('wave');
    expect(parsed.plans[0]).toHaveProperty('has_summary');
    expect(parsed).toHaveProperty('waves');
    expect(parsed).toHaveProperty('incomplete');
  });

  test('nonexistent phase returns error', () => {
    const { stdout } = captureOutput(() => {
      cmdPhasePlanIndex(fixtureDir, '99', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });

  test('errors when no phase provided', () => {
    const { exitCode } = captureError(() => {
      cmdPhasePlanIndex(fixtureDir, '', false);
    });
    expect(exitCode).toBe(1);
  });
});

// ─── cmdSummaryExtract ──────────────────────────────────────────────────────

describe('cmdSummaryExtract', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('extracts frontmatter fields from fixture summary', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSummaryExtract(fixtureDir, '.planning/milestones/anonymous/phases/01-test/01-01-SUMMARY.md', null, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.path).toContain('SUMMARY.md');
    expect(parsed).toHaveProperty('key_files');
    expect(parsed).toHaveProperty('tech_added');
    expect(parsed).toHaveProperty('patterns');
    expect(parsed).toHaveProperty('decisions');
  });

  test('with --fields filter returns only specified fields', () => {
    const { stdout } = captureOutput(() => {
      cmdSummaryExtract(
        fixtureDir,
        '.planning/milestones/anonymous/phases/01-test/01-01-SUMMARY.md',
        ['tech_added', 'patterns'],
        false
      );
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('tech_added');
    expect(parsed).toHaveProperty('patterns');
    // Should NOT have unfiltered fields
    expect(parsed).not.toHaveProperty('decisions');
  });

  test('returns error for non-existent file', () => {
    const { stdout } = captureOutput(() => {
      cmdSummaryExtract(fixtureDir, 'nonexistent-SUMMARY.md', null, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });
});

// ─── cmdProgressRender ──────────────────────────────────────────────────────

describe('cmdProgressRender', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('"json" format returns progress JSON', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdProgressRender(fixtureDir, 'json', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('phases');
    expect(parsed).toHaveProperty('total_plans');
    expect(parsed).toHaveProperty('total_summaries');
    expect(parsed).toHaveProperty('percent');
    expect(typeof parsed.percent).toBe('number');
  });

  test('"table" format returns markdown table (raw)', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdProgressRender(fixtureDir, 'table', true);
    });
    expect(exitCode).toBe(0);
    // Table output includes phase rows
    expect(stdout).toContain('Phase');
    expect(stdout).toContain('|');
  });

  test('"bar" format returns progress bar', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdProgressRender(fixtureDir, 'bar', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('bar');
    expect(parsed).toHaveProperty('percent');
    expect(parsed.bar).toContain('[');
    expect(parsed.bar).toContain(']');
  });
});

// ─── cmdDashboard ──────────────────────────────────────────────────────────

describe('cmdDashboard', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns milestones array with correct count from fixture ROADMAP.md', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('milestones');
    expect(Array.isArray(parsed.milestones)).toBe(true);
    // Fixture ROADMAP.md has 1 milestone (M1 v1.0: Foundation)
    expect(parsed.milestones.length).toBe(1);
  });

  test('each milestone contains phases array with number, name, status', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    const ms = parsed.milestones[0];
    expect(ms).toHaveProperty('phases');
    expect(ms.phases.length).toBeGreaterThanOrEqual(1);
    const phase = ms.phases[0];
    expect(phase).toHaveProperty('number');
    expect(phase).toHaveProperty('name');
    expect(phase).toHaveProperty('status');
  });

  test('phase status correctly computed: complete (summaries >= plans)', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    // Phase 1 has 1 plan and 1 summary -> complete
    const phase1 = parsed.milestones[0].phases.find((p) => p.number === '1');
    expect(phase1.status).toBe('complete');
  });

  test('phase status correctly computed: planned (plans > 0, summaries = 0)', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    // Phase 2 has 1 plan and 0 summaries -> planned
    const phase2 = parsed.milestones[0].phases.find((p) => p.number === '2');
    expect(phase2.status).toBe('planned');
  });

  test('summary object contains total_milestones, total_phases, total_plans, total_summaries', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('summary');
    expect(parsed.summary).toHaveProperty('total_milestones');
    expect(parsed.summary).toHaveProperty('total_phases');
    expect(parsed.summary).toHaveProperty('total_plans');
    expect(parsed.summary).toHaveProperty('total_summaries');
    expect(parsed.summary.total_milestones).toBe(1);
    expect(parsed.summary.total_phases).toBe(2);
    expect(parsed.summary.total_plans).toBe(2);
    expect(parsed.summary.total_summaries).toBe(1);
  });

  test('handles missing ROADMAP.md gracefully (returns empty milestones array)', () => {
    // Remove ROADMAP.md
    fs.unlinkSync(path.join(fixtureDir, '.planning', 'ROADMAP.md'));

    const { stdout, exitCode } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('milestones');
    expect(parsed.milestones).toEqual([]);
  });

  test('handles missing .planning/ directory gracefully (no crash)', () => {
    // Remove entire .planning directory
    fs.rmSync(path.join(fixtureDir, '.planning'), { recursive: true, force: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('milestones');
    expect(parsed.milestones).toEqual([]);
  });

  test('includes active phase marker based on STATE.md current position', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    // Fixture STATE.md says "Active phase: 1 (01-test)"
    const phase1 = parsed.milestones[0].phases.find((p) => p.number === '1');
    expect(phase1.active).toBe(true);
    // Phase 2 should not be active
    const phase2 = parsed.milestones[0].phases.find((p) => p.number === '2');
    expect(phase2.active).toBe(false);
  });

  test('includes deferred validation and blocker counts from STATE.md', () => {
    // Enhance STATE.md with blockers and deferred validations
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    let state = fs.readFileSync(statePath, 'utf-8');
    state = state.replace(
      '## Blockers\n\nNone.',
      '## Blockers\n\n- API rate limit exceeded\n- Missing test data'
    );
    state = state.replace(
      '| ID | Description | From Phase | Validates At | Status |\n|----|-------------|-----------|-------------|--------|',
      '| ID | Description | From Phase | Validates At | Status |\n|----|-------------|-----------|-------------|--------|\n| DEFER-01-01 | Verify output format | Phase 1 | Phase 2 | PENDING |'
    );
    fs.writeFileSync(statePath, state);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.summary.active_blockers).toBe(2);
    expect(parsed.summary.pending_deferred).toBe(1);
  });

  test('non-raw mode produces TUI text output containing milestone name', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdDashboard(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    // TUI output contains milestone name
    expect(stdout).toContain('Foundation');
    // Should contain phase info
    expect(stdout).toContain('Phase 1');
    expect(stdout).toContain('Phase 2');
  });

  test('milestone progress_percent calculated correctly', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    // Phase 1: 1/1 = 100%, Phase 2: 0/1 = 0%, avg = 50%
    expect(parsed.milestones[0].progress_percent).toBe(50);
  });

  test('extracts milestone number from M-format heading', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    // Fixture uses "## M1 v1.0: Foundation"
    expect(parsed.milestones[0].number).toBe(1);
  });

  test('extracts milestone number from "Milestone N:" format', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    let roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    roadmap = roadmap.replace('## M1 v1.0: Foundation', '## Milestone 2: Foundation');
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.milestones[0].number).toBe(2);
    expect(parsed.milestones[0].name).toBe('Foundation');
  });

  test('extracts goal from **Goal:** line', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    // Fixture has "**Goal:** Establish project infrastructure"
    expect(parsed.milestones[0].goal).toBe('Establish project infrastructure');
  });

  test('0-plan phases drag progress down instead of being invisible', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    let roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    roadmap +=
      '\n### Phase 3: Empty Phase -- No plans yet\n- **Duration:** 1d\n- **Type:** research\n';
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    // Phase 1: 1/1 = 100%, Phase 2: 0/1 = 0%, Phase 3: 0/0 = 0%
    // Average: (1.0 + 0 + 0) / 3 = 33%
    expect(parsed.milestones[0].progress_percent).toBe(33);
  });

  test('JSON output includes timeline array with dated milestones', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('timeline');
    expect(Array.isArray(parsed.timeline)).toBe(true);
    expect(parsed.timeline.length).toBe(1);
    expect(parsed.timeline[0]).toMatchObject({
      number: 1,
      name: 'Foundation',
      start: '2026-01-15',
      target: '2026-01-20',
      phase_count: 2,
    });
    expect(parsed.timeline[0]).toHaveProperty('progress_percent');
  });

  test('milestones without dates are excluded from timeline', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    let roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    roadmap = roadmap.replace(/\*\*Start:\*\*.*\n/, '').replace(/\*\*Target:\*\*.*\n/, '');
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.timeline).toEqual([]);
  });

  test('TUI shows "Milestone N:" prefix in heading', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, false);
    });
    expect(stdout).toContain('Milestone 1: Foundation');
  });

  test('TUI shows goal line under milestone heading', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, false);
    });
    expect(stdout).toContain('Goal: Establish project infrastructure');
  });

  test('TUI includes Timeline section when milestones have dates', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, false);
    });
    expect(stdout).toContain('## Timeline');
    expect(stdout).toContain('M1');
    expect(stdout).toContain('2026-01-15');
    expect(stdout).toContain('2026-01-20');
  });

  test('multiple milestones render in timeline with correct dates', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    const roadmap = `# Roadmap

## Milestone 1: Alpha
**Start:** 2026-01-01
**Target:** 2026-01-15
**Goal:** Build alpha

### Phase 1: Test Phase -- Setup and configuration
- **Duration:** 2d
- **Type:** implement

## Milestone 2: Beta
**Start:** 2026-01-16
**Target:** 2026-02-01
**Goal:** Build beta

### Phase 2: Build Phase -- Core implementation
- **Duration:** 3d
- **Type:** implement
`;
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.timeline.length).toBe(2);
    expect(parsed.timeline[0].name).toBe('Alpha');
    expect(parsed.timeline[1].name).toBe('Beta');
    expect(parsed.timeline[0].start).toBe('2026-01-01');
    expect(parsed.timeline[1].target).toBe('2026-02-01');
  });

  test('shipped milestones in <details> blocks are parsed from bullet list', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    const roadmap = `# Roadmap

## Milestones

- v0.1.0 Alpha Release - Phases 1-3 (shipped 2026-01-20)
- v0.2.0 Beta Release - Phases 4-6 (shipped 2026-02-01)

## Phases

<details>
<summary>v0.1.0 Alpha Release (Phases 1-3) - SHIPPED 2026-01-20</summary>
Phases 1-3 delivered core features.
</details>

<details>
<summary>v0.2.0 Beta Release (Phases 4-6) - SHIPPED 2026-02-01</summary>
Phases 4-6 delivered beta features.
</details>
`;
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.milestones.length).toBe(2);
    expect(parsed.milestones[0].name).toBe('Alpha Release');
    expect(parsed.milestones[1].name).toBe('Beta Release');
  });

  test('shipped milestones have status "shipped" and progress_percent 100', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    const roadmap = `# Roadmap

## Milestones

- v0.1.0 Alpha Release - Phases 1-3 (shipped 2026-01-20)

## Phases

<details>
<summary>v0.1.0 Alpha Release (Phases 1-3) - SHIPPED 2026-01-20</summary>
Shipped.
</details>
`;
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    const ms = parsed.milestones[0];
    expect(ms.status).toBe('shipped');
    expect(ms.progress_percent).toBe(100);
    expect(ms.shipped_date).toBe('2026-01-20');
    expect(ms.phase_range).toBe('1-3');
    expect(ms.phase_count).toBe(3);
    expect(ms.version).toBe('v0.1.0');
  });

  test('summary totals include shipped milestone and phase counts', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    const roadmap = `# Roadmap

## Milestones

- v0.1.0 Alpha - Phases 1-4 (shipped 2026-01-20)

## Phases

<details>
<summary>v0.1.0 Alpha (Phases 1-4) - SHIPPED 2026-01-20</summary>
Shipped.
</details>

## Milestone 2: Beta
**Start:** 2026-02-01
**Target:** 2026-02-15
**Goal:** Build beta

### Phase 5: Test -- Testing
- **Duration:** 1d
- **Type:** implement
`;
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.summary.total_milestones).toBe(2);
    expect(parsed.summary.shipped_milestones).toBe(1);
    // 4 shipped + 1 active = 5 total phases
    expect(parsed.summary.total_phases).toBe(5);
  });

  test('TUI output includes shipped milestone names', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    const roadmap = `# Roadmap

## Milestones

- v0.1.0 Alpha Release - Phases 1-3 (shipped 2026-01-20)

## Phases

<details>
<summary>v0.1.0 Alpha Release (Phases 1-3) - SHIPPED 2026-01-20</summary>
Shipped.
</details>
`;
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, false);
    });
    expect(stdout).toContain('## Shipped');
    expect(stdout).toContain('v0.1.0 Alpha Release');
    expect(stdout).toContain('3 phases');
    expect(stdout).toContain('shipped 2026-01-20');
    expect(stdout).toContain('1 shipped milestones');
  });

  test('mix of shipped + active milestones renders both', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    const roadmap = `# Roadmap

## Milestones

- v0.1.0 Alpha - Phases 1-3 (shipped 2026-01-20)

## Phases

<details>
<summary>v0.1.0 Alpha (Phases 1-3) - SHIPPED 2026-01-20</summary>
Shipped.
</details>

## Milestone 2: Beta
**Start:** 2026-02-01
**Target:** 2026-02-15
**Goal:** Build beta

### Phase 4: Build -- Core build
- **Duration:** 2d
- **Type:** implement
`;
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, false);
    });
    // Shipped section
    expect(stdout).toContain('## Shipped');
    expect(stdout).toContain('v0.1.0 Alpha');
    // Active section
    expect(stdout).toContain('Milestone 2: Beta');
    expect(stdout).toContain('Phase 4');
    // Summary line shows both
    expect(stdout).toContain('1 shipped + 1 active milestones');

    // JSON also has both
    const { stdout: jsonOut } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    const parsed = JSON.parse(jsonOut);
    expect(parsed.milestones.length).toBe(2);
    expect(parsed.milestones[0].status).toBe('shipped');
    expect(parsed.milestones[1].name).toBe('Beta');
  });
});

// ─── cmdPhaseDetail ────────────────────────────────────────────────────────

describe('cmdPhaseDetail', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns correct phase_number and phase_name for existing phase', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.phase_number).toBe('1');
    expect(parsed.phase_name).toBe('test');
  });

  test('plans array contains id, wave, type, status for each plan', () => {
    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.plans.length).toBe(1);
    const plan = parsed.plans[0];
    expect(plan).toHaveProperty('id');
    expect(plan).toHaveProperty('wave');
    expect(plan).toHaveProperty('type');
    expect(plan).toHaveProperty('status');
    expect(plan.id).toBe('01-01');
    expect(plan.wave).toBe(1);
    expect(plan.type).toBe('execute');
    expect(plan.status).toBe('complete');
  });

  test('completed plans have duration from SUMMARY frontmatter', () => {
    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    const parsed = JSON.parse(stdout);
    const plan = parsed.plans[0];
    // Fixture SUMMARY has duration: 1min
    expect(plan.duration).toBe('1min');
  });

  test('returns error for nonexistent phase number', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '99', true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('not found');
  });

  test('returns empty plans array for phase with no PLAN.md files', () => {
    // Create an empty phase directory
    const emptyPhaseDir = path.join(fixtureDir, '.planning', 'milestones', 'anonymous', 'phases', '03-empty');
    fs.mkdirSync(emptyPhaseDir, { recursive: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '3', true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.plans).toEqual([]);
    expect(parsed.summary_stats.total_plans).toBe(0);
  });

  test('detects presence of CONTEXT.md, RESEARCH.md, EVAL.md, VERIFICATION.md, REVIEW.md', () => {
    // Create supplementary files in phase 1 directory
    const phase1Dir = path.join(fixtureDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    fs.writeFileSync(path.join(phase1Dir, '01-CONTEXT.md'), '# Context\n');
    fs.writeFileSync(path.join(phase1Dir, '01-RESEARCH.md'), '# Research\n');
    fs.writeFileSync(path.join(phase1Dir, '01-EVAL.md'), '# Eval\n');
    fs.writeFileSync(path.join(phase1Dir, '01-VERIFICATION.md'), '# Verification\n');
    fs.writeFileSync(path.join(phase1Dir, '01-REVIEW.md'), '# Review\n');

    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.has_context).toBe(true);
    expect(parsed.has_research).toBe(true);
    expect(parsed.has_eval).toBe(true);
    expect(parsed.has_verification).toBe(true);
    expect(parsed.has_review).toBe(true);
  });

  test('non-raw mode produces TUI text containing phase name', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', false);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Phase 1');
    expect(stdout).toContain('test');
  });

  test('no phase argument in raw mode returns error', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '', true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('required');
  });

  test('summary_stats has correct completed count', () => {
    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.summary_stats.completed).toBe(1);
    expect(parsed.summary_stats.total_plans).toBe(1);
  });

  test('phase 2 with no summaries shows planned status', () => {
    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '2', true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.plans[0].status).toBe('planned');
    expect(parsed.plans[0].duration).toBeNull();
  });
});

// ─── cmdPhaseDetail requirements ──────────────────────────────────────────

describe('cmdPhaseDetail requirements', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('phase with Requirements field includes requirements array in JSON output', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(Array.isArray(parsed.requirements)).toBe(true);
    expect(parsed.requirements.length).toBe(2);
    const ids = parsed.requirements.map((r) => r.id);
    expect(ids).toContain('REQ-01');
    expect(ids).toContain('REQ-03');
  });

  test('each requirement entry has correct fields from REQUIREMENTS.md', () => {
    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    const parsed = parseFirstJson(stdout);
    const req01 = parsed.requirements.find((r) => r.id === 'REQ-01');
    expect(req01).toBeDefined();
    expect(req01.title).toBe('First Requirement');
    expect(req01.priority).toBe('P0');
    expect(req01.status).toBe('Done');

    const req03 = parsed.requirements.find((r) => r.id === 'REQ-03');
    expect(req03).toBeDefined();
    expect(req03.title).toBe('Third Requirement');
    expect(req03.priority).toBe('P0');
    expect(req03.status).toBe('In Progress');
  });

  test('phase without Requirements field returns empty requirements array', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '2', true);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(Array.isArray(parsed.requirements)).toBe(true);
    expect(parsed.requirements.length).toBe(0);
  });

  test('TUI output includes Requirements section when requirements exist', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', false);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('## Requirements');
    expect(stdout).toContain('REQ-01');
    expect(stdout).toContain('REQ-03');
  });

  test('TUI output does NOT include Requirements section when phase has no requirements', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '2', false);
    });
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('## Requirements');
  });
});

// ─── cmdHealth ─────────────────────────────────────────────────────────────

describe('cmdHealth', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
    // Enhance fixture STATE.md with performance metrics and deferred validations
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    let state = fs.readFileSync(statePath, 'utf-8');
    // Add performance metrics data
    state = state.replace(
      '| Phase-Plan | Duration | Tasks | Files |\n|------------|----------|-------|-------|',
      '| Phase-Plan | Duration | Tasks | Files |\n|------------|----------|-------|-------|\n| 01-01 | 3min | 2 | 3 |\n| 01-02 | 5min | 3 | 4 |\n| 02-01 | 7min | 2 | 5 |\n| 02-02 | 4min | 1 | 2 |\n| 03-01 | 6min | 4 | 6 |'
    );
    // Add deferred validations data
    state = state.replace(
      '| ID | Description | From Phase | Validates At | Status |\n|----|-------------|-----------|-------------|--------|',
      '| ID | Description | From Phase | Validates At | Status |\n|----|-------------|-----------|-------------|--------|\n| DEFER-01-01 | Verify output format | Phase 1 | Phase 3 | PENDING |\n| DEFER-01-02 | Validate error handling | Phase 1 | Phase 2 | RESOLVED (02-01) |\n| DEFER-02-01 | Check API responses | Phase 2 | Phase 4 | PENDING |'
    );
    fs.writeFileSync(statePath, state);
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('parses blockers section from STATE.md (count and items)', () => {
    // Add blockers
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    let state = fs.readFileSync(statePath, 'utf-8');
    state = state.replace(
      '## Blockers\n\nNone.',
      '## Blockers\n\n- Upstream API downtime\n- Missing credentials for staging'
    );
    fs.writeFileSync(statePath, state);

    const { stdout, exitCode } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.blockers.count).toBe(2);
    expect(parsed.blockers.items).toContain('Upstream API downtime');
    expect(parsed.blockers.items).toContain('Missing credentials for staging');
  });

  test('parses deferred validations table (total, pending, resolved counts)', () => {
    const { stdout } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.deferred_validations.total).toBe(3);
    expect(parsed.deferred_validations.pending).toBe(2);
    expect(parsed.deferred_validations.resolved).toBe(1);
    expect(parsed.deferred_validations.items.length).toBe(3);
  });

  test('computes velocity from performance metrics table (average duration)', () => {
    const { stdout } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    // 3 + 5 + 7 + 4 + 6 = 25 min / 5 plans = 5.0 avg
    expect(parsed.velocity.total_plans).toBe(5);
    expect(parsed.velocity.total_duration_min).toBe(25);
    expect(parsed.velocity.avg_duration_min).toBe(5);
  });

  test('computes recent_5_avg from last 5 entries in metrics table', () => {
    const { stdout } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    // All 5 entries are the last 5: avg = 5.0
    expect(parsed.velocity.recent_5_avg_min).toBe(5);
  });

  test('parses risk register from ROADMAP.md (risk, probability, impact columns)', () => {
    // Add risk register to ROADMAP.md
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    let roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    roadmap +=
      '\n\n## Risk Register\n\n| Risk | Probability | Impact | Mitigation | Phase |\n|------|-------------|--------|------------|-------|\n| API rate limits | High | Medium | Caching layer | Phase 2 |\n| Data migration failure | Low | High | Backup strategy | Phase 3 |\n';
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.risks.length).toBe(2);
    expect(parsed.risks[0].risk).toBe('API rate limits');
    expect(parsed.risks[0].probability).toBe('High');
    expect(parsed.risks[0].impact).toBe('Medium');
  });

  test('handles missing STATE.md gracefully', () => {
    fs.unlinkSync(path.join(fixtureDir, '.planning', 'STATE.md'));

    const { stdout, exitCode } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.blockers.count).toBe(0);
    expect(parsed.deferred_validations.total).toBe(0);
    expect(parsed.velocity.total_plans).toBe(0);
  });

  test('handles STATE.md with no blockers section', () => {
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    // Write a minimal STATE.md without blockers
    fs.writeFileSync(
      statePath,
      '# State\n\n## Current Position\n\n- Active phase: 1\n\n## Performance Metrics\n\n| Phase-Plan | Duration | Tasks | Files |\n|------------|----------|-------|-------|\n'
    );

    const { stdout, exitCode } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.blockers.count).toBe(0);
    expect(parsed.blockers.items).toEqual([]);
  });

  test('handles STATE.md with no performance metrics', () => {
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    // Write a STATE.md without performance metrics table
    fs.writeFileSync(
      statePath,
      '# State\n\n## Current Position\n\n- Active phase: 1\n\n## Blockers\n\nNone.\n'
    );

    const { stdout, exitCode } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.velocity.total_plans).toBe(0);
    expect(parsed.velocity.avg_duration_min).toBe(0);
    expect(parsed.velocity.recent_5_avg_min).toBe(0);
  });

  test('non-raw mode produces TUI text containing Blockers and Velocity', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdHealth(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Blockers');
    expect(stdout).toContain('Velocity');
  });

  test('detects stale phases (plans but no summaries)', () => {
    const { stdout } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    // Phase 02-build has 1 plan but 0 summaries -> stale
    expect(parsed.stale_phases).toContain('02-build');
  });

  test('"None." in blockers is not counted as a blocker', () => {
    // The default fixture has "None." in blockers section
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    let state = fs.readFileSync(statePath, 'utf-8');
    // Ensure blockers section explicitly has "None." as a list item
    state = state.replace('## Blockers\n\nNone.', '## Blockers\n\n- None.');
    fs.writeFileSync(statePath, state);

    const { stdout } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.blockers.count).toBe(0);
  });
});

// ─── cmdDetectBackend ────────────────────────────────────────────────────────

describe('cmdDetectBackend', () => {
  let fixtureDir;
  let savedEnv;

  // Detection-relevant env vars (same list as backend.test.js)
  const DETECTION_ENV_VARS = [
    'CODEX_HOME',
    'CODEX_THREAD_ID',
    'GEMINI_CLI_HOME',
    'OPENCODE',
    'AGENT',
  ];

  beforeEach(() => {
    fixtureDir = createFixtureDir();
    // Save and clean all detection-relevant env vars
    savedEnv = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('CLAUDE_CODE_') || DETECTION_ENV_VARS.includes(key)) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = savedEnv;
    cleanupFixtureDir(fixtureDir);
    clearModelCache();
  });

  test('JSON output (raw=false) returns object with backend, models, and capabilities', () => {
    // Default detection (no env vars, no config override) -> claude
    const { stdout, exitCode } = captureOutput(() => {
      cmdDetectBackend(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('backend');
    expect(parsed).toHaveProperty('models');
    expect(parsed).toHaveProperty('models_source');
    expect(parsed).toHaveProperty('capabilities');
    expect(parsed.models).toHaveProperty('opus');
    expect(parsed.models).toHaveProperty('sonnet');
    expect(parsed.models).toHaveProperty('haiku');
    expect(['detected', 'defaults']).toContain(parsed.models_source);
    expect(parsed.capabilities).toHaveProperty('subagents');
    expect(parsed.capabilities).toHaveProperty('parallel');
    expect(parsed.capabilities).toHaveProperty('teams');
    expect(parsed.capabilities).toHaveProperty('hooks');
    expect(parsed.capabilities).toHaveProperty('mcp');
  });

  test('raw output (raw=true) returns just the backend name string', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdDetectBackend(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    // Raw mode: just the backend name, no JSON
    expect(stdout.trim()).toBe('claude');
  });

  test('Claude backend: models are opus/sonnet/haiku, all capabilities true', () => {
    // Default detection -> claude
    const { stdout } = captureOutput(() => {
      cmdDetectBackend(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.backend).toBe('claude');
    expect(parsed.models.opus).toBe('opus');
    expect(parsed.models.sonnet).toBe('sonnet');
    expect(parsed.models.haiku).toBe('haiku');
    expect(parsed.capabilities.subagents).toBe(true);
    expect(parsed.capabilities.parallel).toBe(true);
    expect(parsed.capabilities.teams).toBe(true);
    expect(parsed.capabilities.hooks).toBe(true);
    expect(parsed.capabilities.mcp).toBe(true);
  });

  test('Codex backend: correct models and capabilities', () => {
    // Force codex via config override
    const configPath = path.join(fixtureDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.backend = 'codex';
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const { stdout } = captureOutput(() => {
      cmdDetectBackend(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.backend).toBe('codex');
    expect(parsed.models.opus).toBe('gpt-5.3-codex');
    expect(parsed.models.sonnet).toBe('gpt-5.3-codex-spark');
    expect(parsed.models.haiku).toBe('gpt-5.3-codex-spark');
    expect(parsed.capabilities.subagents).toBe(true);
    expect(parsed.capabilities.parallel).toBe(true);
    expect(parsed.capabilities.teams).toBe(false);
    expect(parsed.capabilities.hooks).toBe(false);
    expect(parsed.capabilities.mcp).toBe(true);
  });

  test('Gemini backend: correct models and capabilities (experimental subagents)', () => {
    const configPath = path.join(fixtureDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.backend = 'gemini';
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const { stdout } = captureOutput(() => {
      cmdDetectBackend(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.backend).toBe('gemini');
    expect(parsed.models.opus).toBe('gemini-3-pro');
    expect(parsed.models.sonnet).toBe('gemini-3-flash');
    expect(parsed.models.haiku).toBe('gemini-2.5-flash');
    expect(parsed.capabilities.subagents).toBe('experimental');
    expect(parsed.capabilities.parallel).toBe(false);
    expect(parsed.capabilities.teams).toBe(false);
    expect(parsed.capabilities.hooks).toBe(true);
    expect(parsed.capabilities.mcp).toBe(true);
  });

  test('OpenCode backend: models resolved and capabilities correct', () => {
    const configPath = path.join(fixtureDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.backend = 'opencode';
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const { stdout } = captureOutput(() => {
      cmdDetectBackend(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.backend).toBe('opencode');
    // Models may come from detection or defaults depending on opencode availability
    expect(typeof parsed.models.opus).toBe('string');
    expect(typeof parsed.models.sonnet).toBe('string');
    expect(typeof parsed.models.haiku).toBe('string');
    expect(['detected', 'defaults']).toContain(parsed.models_source);
    expect(parsed.capabilities.subagents).toBe(true);
    expect(parsed.capabilities.parallel).toBe(true);
    expect(parsed.capabilities.teams).toBe(false);
    expect(parsed.capabilities.hooks).toBe(true);
    expect(parsed.capabilities.mcp).toBe(true);
  });

  test('config model overrides: backend_models overrides are reflected in models field', () => {
    const configPath = path.join(fixtureDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.backend_models = {
      claude: {
        opus: 'custom-opus-model',
        haiku: 'custom-haiku-model',
      },
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const { stdout } = captureOutput(() => {
      cmdDetectBackend(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.backend).toBe('claude');
    expect(parsed.models.opus).toBe('custom-opus-model');
    expect(parsed.models.sonnet).toBe('sonnet'); // Not overridden
    expect(parsed.models.haiku).toBe('custom-haiku-model');
  });

  test('unknown backend falls back to claude defaults', () => {
    const configPath = path.join(fixtureDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.backend = 'unknown-backend';
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Unknown backends are not in VALID_BACKENDS, so detectBackend ignores the
    // config override and falls through to default 'claude'. Test that the
    // output is claude with correct defaults regardless.
    const { stdout } = captureOutput(() => {
      cmdDetectBackend(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    // detectBackend skips invalid config.backend values -> falls to default claude
    expect(parsed.backend).toBe('claude');
    expect(parsed.models.opus).toBe('opus');
    expect(parsed.capabilities.subagents).toBe(true);
  });
});

// ─── cmdLongTermRoadmap ──────────────────────────────────────────────────────

/** Well-formed LONG-TERM-ROADMAP.md fixture content (flat LT-N format) */
const LONG_TERM_ROADMAP_FIXTURE = `---
project: TestProject
created: 2026-01-01
last_refined: 2026-02-15
---

# Long-Term Roadmap: TestProject

## LT-1: Foundation
**Status:** completed
**Goal:** Build the foundational infrastructure for the project
**Normal milestones:** v0.0.5, v0.1.0

## LT-2: Feature Expansion
**Status:** active
**Goal:** Add advanced features and integrations
**Normal milestones:** v0.2.0 (planned)

## LT-3: Scalability
**Status:** planned
**Goal:** Scale the system for production workloads
**Normal milestones:** (none yet)

## Refinement History

| Date | Action | Details |
|------|--------|---------|
| 2026-01-01 | Initial roadmap | Created 3 LT milestones |
`;

/** ROADMAP.md fixture for shipped detection */
const ROADMAP_MD_FIXTURE = `# Roadmap: TestProject

## Milestones

- v0.0.5 Alpha (shipped 2026-01-15)
- v0.1.0 Beta (shipped 2026-02-01)
- v0.2.0 GA
`;

describe('cmdLongTermRoadmap', () => {
  // ─── list subcommand ───────────────────────────────────────────────────

  describe('list', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('lists all LT milestones', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'list', [], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.count).toBe(3);
      expect(parsed.milestones).toHaveLength(3);
      expect(parsed.milestones[0].id).toBe('LT-1');
    });

    test('returns error when file missing', () => {
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'list', [], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toHaveProperty('error');
    });

    test('raw mode returns summary text', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'list', [], true);
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain('LT-1');
      expect(stdout).toContain('LT-2');
      expect(stdout).toContain('LT-3');
    });
  });

  // ─── add subcommand ────────────────────────────────────────────────────

  describe('add', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('adds a new LT milestone', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(
          fixtureDir,
          'add',
          ['--name', 'Enterprise', '--goal', 'Enterprise features'],
          false
        );
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.id).toBe('LT-4');
      expect(parsed.content).toContain('LT-4: Enterprise');
    });

    test('errors when --name missing', () => {
      const { exitCode } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'add', ['--goal', 'X'], false);
      });
      expect(exitCode).toBe(1);
    });

    test('errors when --goal missing', () => {
      const { exitCode } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'add', ['--name', 'X'], false);
      });
      expect(exitCode).toBe(1);
    });
  });

  // ─── remove subcommand ─────────────────────────────────────────────────

  describe('remove', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('removes a planned milestone', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'remove', ['--id', 'LT-3'], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.removed).toBe('LT-3');
      expect(parsed.content).not.toContain('LT-3: Scalability');
    });

    test('refuses to remove completed milestone', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'remove', ['--id', 'LT-1'], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('completed');
    });

    test('refuses to remove if linked milestones are shipped', () => {
      // Create LT-2 with a shipped version linked
      const content = LONG_TERM_ROADMAP_FIXTURE.replace(
        '**Normal milestones:** v0.2.0 (planned)',
        '**Normal milestones:** v0.0.5, v0.2.0 (planned)'
      );
      fs.writeFileSync(path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'), content);
      fs.writeFileSync(path.join(fixtureDir, '.planning', 'ROADMAP.md'), ROADMAP_MD_FIXTURE);
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'remove', ['--id', 'LT-2'], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toContain('shipped');
    });

    test('errors when --id missing', () => {
      const { exitCode } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'remove', [], false);
      });
      expect(exitCode).toBe(1);
    });
  });

  // ─── update subcommand ─────────────────────────────────────────────────

  describe('update', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('updates milestone goal', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(
          fixtureDir,
          'update',
          ['--id', 'LT-2', '--goal', 'New goal text'],
          false
        );
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.updated_fields).toContain('goal');
      expect(parsed.content).toContain('New goal text');
    });

    test('updates milestone status', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'update', ['--id', 'LT-3', '--status', 'active'], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.content).toContain('**Status:** active');
    });

    test('returns error for invalid status', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'update', ['--id', 'LT-3', '--status', 'badstatus'], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toHaveProperty('error');
    });

    test('errors when --id missing', () => {
      const { exitCode } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'update', ['--goal', 'X'], false);
      });
      expect(exitCode).toBe(1);
    });

    test('errors when no update fields provided', () => {
      const { exitCode } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'update', ['--id', 'LT-1'], false);
      });
      expect(exitCode).toBe(1);
    });
  });

  // ─── refine subcommand ─────────────────────────────────────────────────

  describe('refine', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('outputs milestone context for discussion', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'refine', ['--id', 'LT-2'], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.milestone.id).toBe('LT-2');
      expect(parsed.milestone.name).toBe('Feature Expansion');
    });

    test('returns error for non-existent ID', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'refine', ['--id', 'LT-99'], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toHaveProperty('error');
    });

    test('errors when --id missing', () => {
      const { exitCode } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'refine', [], false);
      });
      expect(exitCode).toBe(1);
    });

    test('raw mode returns formatted context', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'refine', ['--id', 'LT-2'], true);
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain('LT-2');
      expect(stdout).toContain('Feature Expansion');
    });
  });

  // ─── link subcommand ───────────────────────────────────────────────────

  describe('link', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('links a version to an LT milestone', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'link', ['--id', 'LT-3', '--version', 'v0.3.0'], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.linked).toBe('v0.3.0');
      expect(parsed.content).toContain('v0.3.0');
    });

    test('returns error if already linked', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'link', ['--id', 'LT-1', '--version', 'v0.0.5'], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toHaveProperty('error');
    });

    test('errors when --id missing', () => {
      const { exitCode } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'link', ['--version', 'v1.0'], false);
      });
      expect(exitCode).toBe(1);
    });

    test('errors when --version missing', () => {
      const { exitCode } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'link', ['--id', 'LT-1'], false);
      });
      expect(exitCode).toBe(1);
    });
  });

  // ─── unlink subcommand ─────────────────────────────────────────────────

  describe('unlink', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('unlinks a non-shipped version', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'unlink', ['--id', 'LT-2', '--version', 'v0.2.0'], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.unlinked).toBe('v0.2.0');
    });

    test('refuses to unlink shipped version', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      fs.writeFileSync(path.join(fixtureDir, '.planning', 'ROADMAP.md'), ROADMAP_MD_FIXTURE);
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'unlink', ['--id', 'LT-1', '--version', 'v0.0.5'], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toHaveProperty('error');
    });
  });

  // ─── display subcommand ────────────────────────────────────────────────

  describe('display', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('displays formatted roadmap with status icons', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'display', [], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.formatted).toContain('[done]');
      expect(parsed.formatted).toContain('[active]');
      expect(parsed.formatted).toContain('[planned]');
      expect(parsed.milestone_count).toBe(3);
    });

    test('raw mode returns formatted text', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'display', [], true);
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain('[done]');
      expect(stdout).toContain('TestProject');
    });

    test('returns error when file missing', () => {
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'display', [], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toHaveProperty('error');
    });
  });

  // ─── init subcommand ───────────────────────────────────────────────────

  describe('init', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('auto-groups ROADMAP.md milestones into LT-1', () => {
      fs.writeFileSync(path.join(fixtureDir, '.planning', 'ROADMAP.md'), ROADMAP_MD_FIXTURE);
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'init', ['--project', 'TestProject'], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.content).toContain('LT-1');
      expect(parsed.content).toContain('v0.0.5');
    });

    test('returns error when ROADMAP.md missing', () => {
      fs.unlinkSync(path.join(fixtureDir, '.planning', 'ROADMAP.md'));
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'init', [], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toHaveProperty('error');
    });
  });

  // ─── history subcommand ────────────────────────────────────────────────

  describe('history', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('appends refinement history entry', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(
          fixtureDir,
          'history',
          ['--action', 'Added', '--details', 'Added LT-4'],
          false
        );
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.action).toBe('Added');
      expect(parsed.content).toContain('Added');
      expect(parsed.content).toContain('Initial roadmap');
    });

    test('errors when --action missing', () => {
      const { exitCode } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'history', ['--details', 'X'], false);
      });
      expect(exitCode).toBe(1);
    });

    test('errors when --details missing', () => {
      const { exitCode } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'history', ['--action', 'X'], false);
      });
      expect(exitCode).toBe(1);
    });

    test('raw mode returns markdown', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(
          fixtureDir,
          'history',
          ['--action', 'Test', '--details', 'Details'],
          true
        );
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Refinement History');
    });
  });

  // ─── parse subcommand ──────────────────────────────────────────────────

  describe('parse', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('parses LONG-TERM-ROADMAP.md into structured data', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'parse', [], false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.milestones).toHaveLength(3);
      expect(parsed.frontmatter.project).toBe('TestProject');
    });

    test('raw mode returns count', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'parse', [], true);
      });
      expect(exitCode).toBe(0);
      expect(stdout).toContain('3 LT milestones');
    });

    test('returns error when file missing', () => {
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'parse', [], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toHaveProperty('error');
    });

    test('parses custom file path', () => {
      const customPath = path.join(fixtureDir, 'custom.md');
      fs.writeFileSync(customPath, LONG_TERM_ROADMAP_FIXTURE);
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'parse', [customPath], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout).milestones).toHaveLength(3);
    });
  });

  // ─── validate subcommand ───────────────────────────────────────────────

  describe('validate', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('valid roadmap returns valid=true', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'validate', [], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout).valid).toBe(true);
    });

    test('invalid roadmap returns errors', () => {
      const invalid = `---\nproject: Test\n---\n\n# Roadmap\n`;
      fs.writeFileSync(path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'), invalid);
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'validate', [], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout).valid).toBe(false);
    });

    test('raw mode returns valid or invalid string', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'validate', [], true);
      });
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe('valid');
    });
  });

  // ─── edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    let fixtureDir;
    beforeEach(() => {
      fixtureDir = createFixtureDir();
    });
    afterEach(() => {
      cleanupFixtureDir(fixtureDir);
    });

    test('unknown subcommand returns error listing all 12 subcommands', () => {
      const { exitCode, stderr } = captureError(() => {
        cmdLongTermRoadmap(fixtureDir, 'badcommand', [], false);
      });
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Unknown subcommand');
      expect(stderr).toContain(
        'list, add, remove, update, refine, link, unlink, display, init, history, parse, validate'
      );
    });

    test('parse with relative file path resolves from cwd', () => {
      fs.writeFileSync(
        path.join(fixtureDir, '.planning', 'LONG-TERM-ROADMAP.md'),
        LONG_TERM_ROADMAP_FIXTURE
      );
      const { stdout, exitCode } = captureOutput(() => {
        cmdLongTermRoadmap(fixtureDir, 'parse', ['.planning/LONG-TERM-ROADMAP.md'], false);
      });
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout).milestones).toHaveLength(3);
    });
  });
});

// ─── cmdQualityAnalysis ──────────────────────────────────────────────────────

describe('cmdQualityAnalysis', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  // Helper: write config with optional phase_cleanup section
  function setCleanupConfig(enabled) {
    const configPath = path.join(fixtureDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (enabled !== undefined) {
      config.phase_cleanup = { enabled };
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  // Helper: create a minimal JS file in lib/ for analysis
  function createSourceFile(name, content) {
    const libDir = path.join(fixtureDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(path.join(libDir, name), content, 'utf-8');
  }

  // ─── Config handling ──────────────────────────────────────────────────

  test('returns skipped when phase_cleanup not enabled', () => {
    setCleanupConfig(false);
    const { stdout, exitCode } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '13'], false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.skipped).toBe(true);
    expect(parsed.reason).toContain('not enabled');
  });

  test('returns skipped when phase_cleanup section missing', () => {
    // Default fixture config has no phase_cleanup section
    const { stdout, exitCode } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '13'], false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.skipped).toBe(true);
  });

  test('returns error when --phase flag missing', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdQualityAnalysis(fixtureDir, [], false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--phase');
  });

  // ─── Quality report output ────────────────────────────────────────────

  test('returns structured report when enabled', () => {
    setCleanupConfig(true);
    createSourceFile('sample.js', 'function hello() { return 1; }\nmodule.exports = { hello };\n');

    const { stdout, exitCode } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '13'], false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('summary');
    expect(parsed).toHaveProperty('details');
  });

  test('report includes phase number', () => {
    setCleanupConfig(true);
    createSourceFile('sample.js', 'module.exports = {};\n');

    const { stdout } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '42'], false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.phase).toBe('42');
  });

  test('report includes timestamp matching YYYY-MM-DD', () => {
    setCleanupConfig(true);
    createSourceFile('sample.js', 'module.exports = {};\n');

    const { stdout } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '13'], false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('report summary has all count fields', () => {
    setCleanupConfig(true);
    createSourceFile('sample.js', 'module.exports = {};\n');

    const { stdout } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '13'], false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.summary).toHaveProperty('total_issues');
    expect(parsed.summary).toHaveProperty('complexity_violations');
    expect(parsed.summary).toHaveProperty('dead_exports');
    expect(parsed.summary).toHaveProperty('oversized_files');
  });

  test('report details has all arrays', () => {
    setCleanupConfig(true);
    createSourceFile('sample.js', 'module.exports = {};\n');

    const { stdout } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '13'], false);
    });
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed.details.complexity)).toBe(true);
    expect(Array.isArray(parsed.details.dead_exports)).toBe(true);
    expect(Array.isArray(parsed.details.file_size)).toBe(true);
  });

  // ─── Raw output mode ──────────────────────────────────────────────────

  test('raw mode outputs human-readable text', () => {
    setCleanupConfig(true);
    createSourceFile('sample.js', 'module.exports = {};\n');

    const { stdout, exitCode } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '13'], true);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Quality Analysis');
    expect(stdout).toContain('Total issues');
  });

  test('raw mode for skipped outputs reason', () => {
    setCleanupConfig(false);

    const { stdout, exitCode } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '13'], true);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('not enabled');
  });

  // ─── File analysis integration ────────────────────────────────────────

  test('detects oversized files in report', () => {
    setCleanupConfig(true);
    // Create a file with 600+ lines
    const bigContent = Array.from({ length: 601 }, (_, i) => `// line ${i + 1}`).join('\n') + '\n';
    createSourceFile('big-file.js', bigContent);

    const { stdout } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '13'], false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.summary.oversized_files).toBeGreaterThan(0);
    expect(parsed.details.file_size.length).toBeGreaterThan(0);
  });

  test('clean codebase produces zero-issue report', () => {
    setCleanupConfig(true);
    // Two files: one exports, the other consumes -- no dead exports, no oversized, no complexity
    createSourceFile(
      'math.js',
      'function add(a, b) { return a + b; }\nmodule.exports = { add };\n'
    );
    createSourceFile('main.js', 'const { add } = require("./math");\nconsole.log(add(1, 2));\n');

    const { stdout } = captureOutput(() => {
      cmdQualityAnalysis(fixtureDir, ['--phase', '13'], false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.summary.total_issues).toBe(0);
  });
});

// ─── cmdRequirementGet ──────────────────────────────────────────────────────

describe('cmdRequirementGet', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns structured JSON for existing REQ-01 with all fields', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementGet(fixtureDir, 'REQ-01', false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.id).toBe('REQ-01');
    expect(parsed.title).toBe('First Requirement');
    expect(parsed.priority).toBe('P0');
    expect(parsed.category).toBe('Core');
    expect(parsed.description).toContain('first requirement');
    expect(parsed.status).toBe('Done');
  });

  test('returns deferred_from and resolves fields for REQ-03', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementGet(fixtureDir, 'REQ-03', false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.id).toBe('REQ-03');
    expect(parsed.deferred_from).toBe('REQ-99 (v0.9)');
    expect(parsed.resolves).toBe('DEFER-01-01');
  });

  test('falls back to archived milestone file for REQ-99', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementGet(fixtureDir, 'REQ-99', false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.id).toBe('REQ-99');
    expect(parsed.title).toBe('Archived Requirement');
    expect(parsed.priority).toBe('P2');
    expect(parsed.category).toBe('Legacy');
    expect(parsed.milestone).toBeDefined();
  });

  test('returns error JSON for non-existent REQ-999', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementGet(fixtureDir, 'REQ-999', false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.error).toContain('not found');
    expect(parsed.id).toBe('REQ-999');
  });

  test('raw=true produces JSON output', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementGet(fixtureDir, 'REQ-01', true);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.id).toBe('REQ-01');
  });
});

// ─── cmdRequirementList ─────────────────────────────────────────────────────

describe('cmdRequirementList', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('no filters returns all requirements (3 items)', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementList(fixtureDir, {}, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.requirements.length).toBe(3);
    expect(parsed.count).toBe(3);
  });

  test('--phase 1 returns only Phase 1 requirements', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementList(fixtureDir, { phase: '1' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.requirements.length).toBe(2);
    const ids = parsed.requirements.map((r) => r.id);
    expect(ids).toContain('REQ-01');
    expect(ids).toContain('REQ-03');
  });

  test('--priority P0 returns only P0 requirements', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementList(fixtureDir, { priority: 'P0' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.requirements.length).toBe(2);
    const ids = parsed.requirements.map((r) => r.id);
    expect(ids).toContain('REQ-01');
    expect(ids).toContain('REQ-03');
  });

  test('--status Pending returns only REQ-02', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementList(fixtureDir, { status: 'Pending' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.requirements.length).toBe(1);
    expect(parsed.requirements[0].id).toBe('REQ-02');
  });

  test('--category Core returns REQ-01 and REQ-03', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementList(fixtureDir, { category: 'Core' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.requirements.length).toBe(2);
    const ids = parsed.requirements.map((r) => r.id);
    expect(ids).toContain('REQ-01');
    expect(ids).toContain('REQ-03');
  });

  test('--all includes archived requirements from milestones', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementList(fixtureDir, { all: true }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.requirements.length).toBe(4);
    const ids = parsed.requirements.map((r) => r.id);
    expect(ids).toContain('REQ-99');
  });

  test('filters compose: --phase 1 --priority P0', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementList(fixtureDir, { phase: '1', priority: 'P0' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.requirements.length).toBe(2);
    const ids = parsed.requirements.map((r) => r.id);
    expect(ids).toContain('REQ-01');
    expect(ids).toContain('REQ-03');
  });

  test('filter with no matches returns empty array', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementList(fixtureDir, { status: 'NonExistent' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.requirements).toEqual([]);
    expect(parsed.count).toBe(0);
  });
});

// ─── cmdRequirementTraceability ─────────────────────────────────────────────

describe('cmdRequirementTraceability', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns full traceability matrix as JSON array (3 rows)', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementTraceability(fixtureDir, {}, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.matrix.length).toBe(3);
    expect(parsed.count).toBe(3);
  });

  test('each row has req, feature, priority, phase, status fields', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementTraceability(fixtureDir, {}, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    const row = parsed.matrix[0];
    expect(row).toHaveProperty('req');
    expect(row).toHaveProperty('feature');
    expect(row).toHaveProperty('priority');
    expect(row).toHaveProperty('phase');
    expect(row).toHaveProperty('status');
  });

  test('--phase 1 returns only Phase 1 rows', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementTraceability(fixtureDir, { phase: '1' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.matrix.length).toBe(2);
    for (const row of parsed.matrix) {
      expect(row.phase).toContain('1');
    }
  });

  test('--phase 99 returns empty array', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementTraceability(fixtureDir, { phase: '99' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.matrix).toEqual([]);
    expect(parsed.count).toBe(0);
  });
});

// ─── cmdSearch ───────────────────────────────────────────────────────────────

describe('cmdSearch', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });
  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns matches for a known string in REQUIREMENTS.md', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSearch(fixtureDir, 'REQ-01', true);
    });
    expect(exitCode).toBe(0);
    const result = parseFirstJson(stdout);
    expect(Array.isArray(result.matches)).toBe(true);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    for (const m of result.matches) {
      expect(typeof m.file).toBe('string');
      expect(typeof m.line).toBe('number');
      expect(m.line).toBeGreaterThanOrEqual(1);
      expect(typeof m.content).toBe('string');
      expect(m.content.toLowerCase()).toContain('req-01');
    }
    expect(result.count).toBe(result.matches.length);
  });

  test('returns matches across multiple files', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSearch(fixtureDir, 'REQ-01', true);
    });
    expect(exitCode).toBe(0);
    const result = parseFirstJson(stdout);
    const uniqueFiles = new Set(result.matches.map((m) => m.file));
    expect(uniqueFiles.size).toBeGreaterThanOrEqual(2);
  });

  test('search is case-insensitive', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSearch(fixtureDir, 'req-01', true);
    });
    expect(exitCode).toBe(0);
    const result = parseFirstJson(stdout);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
  });

  test('returns line numbers starting from 1', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSearch(fixtureDir, 'Traceability Matrix', true);
    });
    expect(exitCode).toBe(0);
    const result = parseFirstJson(stdout);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    for (const m of result.matches) {
      expect(m.line).toBeGreaterThanOrEqual(1);
    }
  });

  test('recurses into subdirectories (phases/, milestones/)', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSearch(fixtureDir, 'REQ-99', true);
    });
    expect(exitCode).toBe(0);
    const result = parseFirstJson(stdout);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    const hasSubdirMatch = result.matches.some((m) => m.file.includes('milestones/'));
    expect(hasSubdirMatch).toBe(true);
  });

  test('query with no matches returns empty array', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSearch(fixtureDir, 'NONEXISTENT_QUERY_12345', true);
    });
    expect(exitCode).toBe(0);
    const result = parseFirstJson(stdout);
    expect(result.matches).toEqual([]);
    expect(result.count).toBe(0);
  });

  test('missing .planning/ directory returns empty matches', () => {
    const os = require('os');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-no-planning-'));
    try {
      const { stdout, exitCode } = captureOutput(() => {
        cmdSearch(tempDir, 'anything', true);
      });
      expect(exitCode).toBe(0);
      const result = parseFirstJson(stdout);
      expect(result.matches).toEqual([]);
      expect(result.count).toBe(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('raw=false produces JSON output', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSearch(fixtureDir, 'REQ-01', false);
    });
    expect(exitCode).toBe(0);
    const result = parseFirstJson(stdout);
    expect(result.matches).toBeDefined();
    expect(result.count).toBeDefined();
    expect(result.query).toBe('REQ-01');
  });
});

// ─── cmdRequirementUpdateStatus ─────────────────────────────────────────────

describe('cmdRequirementUpdateStatus', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });
  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('updates status for existing REQ-01 from Done to Deferred', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementUpdateStatus(fixtureDir, 'REQ-01', 'Deferred', true);
    });
    expect(exitCode).toBe(0);
    const result = parseFirstJson(stdout);
    expect(result.updated).toBe(true);
    expect(result.id).toBe('REQ-01');
    expect(result.old_status).toBe('Done');
    expect(result.new_status).toBe('Deferred');

    // Verify file was actually modified on disk
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'REQUIREMENTS.md'), 'utf-8');
    const reqRow = content
      .split('\n')
      .find((line) => line.includes('REQ-01') && line.startsWith('|'));
    expect(reqRow).toContain('Deferred');
    expect(reqRow).not.toContain('Done');
  });

  test('updates status to In Progress (multi-word status)', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementUpdateStatus(fixtureDir, 'REQ-01', 'In Progress', true);
    });
    expect(exitCode).toBe(0);
    const result = parseFirstJson(stdout);
    expect(result.new_status).toBe('In Progress');

    // Verify file was actually modified on disk
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'REQUIREMENTS.md'), 'utf-8');
    const reqRow = content
      .split('\n')
      .find((line) => line.includes('REQ-01') && line.startsWith('|'));
    expect(reqRow).toContain('In Progress');
  });

  test('validates all four valid statuses: Pending, In Progress, Done, Deferred', () => {
    ['Pending', 'In Progress', 'Done', 'Deferred'].forEach((status) => {
      const dir = createFixtureDir();
      try {
        const { exitCode } = captureOutput(() => {
          cmdRequirementUpdateStatus(dir, 'REQ-02', status, true);
        });
        expect(exitCode).toBe(0);
      } finally {
        cleanupFixtureDir(dir);
      }
    });
  });

  test('rejects invalid status with clear error', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdRequirementUpdateStatus(fixtureDir, 'REQ-01', 'Invalid', true);
    });
    expect(exitCode).toBe(1);
    expect(stderr.toLowerCase()).toContain('invalid status');
  });

  test('rejects non-existent REQ-ID with clear error', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdRequirementUpdateStatus(fixtureDir, 'REQ-999', 'Done', true);
    });
    expect(exitCode).toBe(1);
    expect(stderr.toLowerCase()).toContain('not found');
  });

  test('case-insensitive REQ-ID matching', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementUpdateStatus(fixtureDir, 'req-01', 'Deferred', true);
    });
    expect(exitCode).toBe(0);
    const result = parseFirstJson(stdout);
    expect(result.updated).toBe(true);
  });

  test('preserves other columns and file content after update', () => {
    const reqPath = path.join(fixtureDir, '.planning', 'REQUIREMENTS.md');
    const before = fs.readFileSync(reqPath, 'utf-8');

    captureOutput(() => {
      cmdRequirementUpdateStatus(fixtureDir, 'REQ-02', 'Done', true);
    });

    const after = fs.readFileSync(reqPath, 'utf-8');

    // REQ-01 row should be unchanged (still Done)
    const req01Before = before.split('\n').find((l) => l.startsWith('|') && l.includes('REQ-01'));
    const req01After = after.split('\n').find((l) => l.startsWith('|') && l.includes('REQ-01'));
    expect(req01After).toBe(req01Before);

    // REQ-03 row should be unchanged (still In Progress)
    const req03Before = before.split('\n').find((l) => l.startsWith('|') && l.includes('REQ-03'));
    const req03After = after.split('\n').find((l) => l.startsWith('|') && l.includes('REQ-03'));
    expect(req03After).toBe(req03Before);

    // Content above Traceability Matrix section is unchanged
    const matrixIdx = (text) => text.indexOf('## Traceability Matrix');
    expect(after.substring(0, matrixIdx(after))).toBe(before.substring(0, matrixIdx(before)));

    // REQ-02 Feature and Priority columns preserved
    const req02After = after.split('\n').find((l) => l.startsWith('|') && l.includes('REQ-02'));
    expect(req02After).toContain('CLI Feature');
    expect(req02After).toContain('P1');
  });

  test('round-trip: update-status then get returns new status', () => {
    const { exitCode: updateExit } = captureOutput(() => {
      cmdRequirementUpdateStatus(fixtureDir, 'REQ-02', 'Done', true);
    });
    expect(updateExit).toBe(0);

    const { stdout, exitCode: getExit } = captureOutput(() => {
      cmdRequirementGet(fixtureDir, 'REQ-02', true);
    });
    expect(getExit).toBe(0);
    const result = parseFirstJson(stdout);
    expect(result.status).toBe('Done');
  });
});

// ─── cmdMigrateDirs ──────────────────────────────────────────────────────────

describe('cmdMigrateDirs', () => {
  const os = require('os');
  let tmpDir;

  /**
   * Helper: create an old-style .planning/ layout with STATE.md containing
   * a milestone field and optional directories with sample files.
   */
  function setupOldLayout(opts = {}) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-migrate-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });

    // Write STATE.md with optional milestone
    const milestone = opts.milestone !== undefined ? opts.milestone : 'v1.0';
    const milestoneField = milestone ? `- **Milestone:** ${milestone} — Test Milestone` : '';
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      `# State\n\n## Current Position\n\n${milestoneField}\n`,
      'utf-8'
    );

    // Write config.json (minimal)
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ model_profile: 'balanced' }),
      'utf-8'
    );

    // Create old-style directories with sample content
    if (opts.phases) {
      const phaseDir = path.join(planningDir, 'phases', '01-test');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan 01', 'utf-8');
    }

    if (opts.research) {
      const researchDir = path.join(planningDir, 'research');
      fs.mkdirSync(researchDir, { recursive: true });
      fs.writeFileSync(path.join(researchDir, 'LANDSCAPE.md'), '# Landscape', 'utf-8');
    }

    if (opts.codebase) {
      const codebaseDir = path.join(planningDir, 'codebase');
      fs.mkdirSync(codebaseDir, { recursive: true });
      fs.writeFileSync(path.join(codebaseDir, 'ARCHITECTURE.md'), '# Architecture', 'utf-8');
    }

    if (opts.todos) {
      const pendingDir = path.join(planningDir, 'todos', 'pending');
      fs.mkdirSync(pendingDir, { recursive: true });
      fs.writeFileSync(path.join(pendingDir, 'sample.md'), '# Todo', 'utf-8');
    }

    if (opts.quick) {
      const quickDir = path.join(planningDir, 'quick', '1-test');
      fs.mkdirSync(quickDir, { recursive: true });
      fs.writeFileSync(path.join(quickDir, '1-SUMMARY.md'), '# Quick Summary', 'utf-8');
    }

    return tmpDir;
  }

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('moves phases/ to milestones/{milestone}/phases/', () => {
    setupOldLayout({ phases: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    const result = parseFirstJson(stdout);

    // Verify file moved to new location
    expect(
      fs.existsSync(
        path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '01-test', '01-01-PLAN.md')
      )
    ).toBe(true);

    // Old location should be empty or not exist
    const oldPhases = path.join(tmpDir, '.planning', 'phases');
    const oldContents = fs.existsSync(oldPhases) ? fs.readdirSync(oldPhases) : [];
    expect(oldContents).toHaveLength(0);

    // Result should include moved_directories with phases entry
    expect(result.moved_directories).toBeDefined();
    const phasesEntry = result.moved_directories.find((d) => d.from === 'phases');
    expect(phasesEntry).toBeDefined();
  });

  test('moves research/ to milestones/{milestone}/research/', () => {
    setupOldLayout({ research: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    expect(
      fs.existsSync(
        path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'research', 'LANDSCAPE.md')
      )
    ).toBe(true);
  });

  test('moves codebase/ to milestones/{milestone}/codebase/', () => {
    setupOldLayout({ codebase: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    expect(
      fs.existsSync(
        path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'codebase', 'ARCHITECTURE.md')
      )
    ).toBe(true);
  });

  test('moves todos/ to milestones/{milestone}/todos/', () => {
    setupOldLayout({ todos: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    expect(
      fs.existsSync(
        path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'todos', 'pending', 'sample.md')
      )
    ).toBe(true);
  });

  test('moves quick/ to milestones/anonymous/quick/ regardless of milestone', () => {
    setupOldLayout({ quick: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    // quick/ should go to anonymous, NOT v1.0
    expect(
      fs.existsSync(
        path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'quick', '1-test', '1-SUMMARY.md')
      )
    ).toBe(true);

    // Should NOT be under v1.0
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'quick'))).toBe(
      false
    );
  });

  test('is idempotent — second run produces no changes', () => {
    setupOldLayout({ phases: true, research: true });

    // First run
    captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });

    // Second run
    const { stdout, exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    const result = parseFirstJson(stdout);
    expect(result.moved_directories).toHaveLength(0);
    expect(result.already_migrated).toBe(true);
  });

  test('skips directories that do not exist at old location', () => {
    // Create .planning/ with only STATE.md and config.json (no subdirs)
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-migrate-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'STATE.md'),
      '# State\n\n## Current Position\n\n- **Milestone:** v1.0 — Test\n',
      'utf-8'
    );
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{}', 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    const result = parseFirstJson(stdout);
    expect(result.moved_directories).toHaveLength(0);
  });

  test('uses anonymous milestone when STATE.md has no milestone', () => {
    setupOldLayout({ phases: true, milestone: '' });

    const { stdout, exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    const result = parseFirstJson(stdout);
    expect(result.milestone).toBe('anonymous');

    expect(
      fs.existsSync(
        path.join(
          tmpDir,
          '.planning',
          'milestones',
          'anonymous',
          'phases',
          '01-test',
          '01-01-PLAN.md'
        )
      )
    ).toBe(true);
  });

  test('creates milestone directory structure if needed', () => {
    setupOldLayout({ phases: true });

    // Ensure milestones/ does not pre-exist
    const milestonesDir = path.join(tmpDir, '.planning', 'milestones');
    expect(fs.existsSync(milestonesDir)).toBe(false);

    const { exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    // milestones/v1.0/ should now exist
    expect(fs.existsSync(path.join(milestonesDir, 'v1.0'))).toBe(true);
  });

  test('merges into existing milestone directory without overwriting', () => {
    setupOldLayout({ research: true });

    // Pre-create milestone research dir with an existing file
    const existingDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'research');
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(path.join(existingDir, 'PAPERS.md'), '# Papers', 'utf-8');

    const { exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    // Both files should exist
    expect(fs.existsSync(path.join(existingDir, 'PAPERS.md'))).toBe(true);
    expect(fs.existsSync(path.join(existingDir, 'LANDSCAPE.md'))).toBe(true);

    // Original PAPERS.md content should be preserved (not overwritten)
    const papersContent = fs.readFileSync(path.join(existingDir, 'PAPERS.md'), 'utf-8');
    expect(papersContent).toBe('# Papers');
  });
});
