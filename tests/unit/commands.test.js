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
} = require('../../lib/commands');

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
    const pendingPath = path.join(fixtureDir, '.planning', 'todos', 'pending', 'sample.md');
    const completedPath = path.join(fixtureDir, '.planning', 'todos', 'completed', 'sample.md');
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
      cmdVerifyPathExists(fixtureDir, '.planning/phases', false);
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
      cmdSummaryExtract(fixtureDir, '.planning/phases/01-test/01-01-SUMMARY.md', null, false);
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
        '.planning/phases/01-test/01-01-SUMMARY.md',
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
    const emptyPhaseDir = path.join(fixtureDir, '.planning', 'phases', '03-empty');
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
    const phase1Dir = path.join(fixtureDir, '.planning', 'phases', '01-test');
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
      if (
        key.startsWith('CLAUDE_CODE_') ||
        DETECTION_ENV_VARS.includes(key)
      ) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = savedEnv;
    cleanupFixtureDir(fixtureDir);
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
    expect(parsed).toHaveProperty('capabilities');
    expect(parsed.models).toHaveProperty('opus');
    expect(parsed.models).toHaveProperty('sonnet');
    expect(parsed.models).toHaveProperty('haiku');
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

  test('OpenCode backend: models use anthropic/claude-* format', () => {
    const configPath = path.join(fixtureDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.backend = 'opencode';
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const { stdout } = captureOutput(() => {
      cmdDetectBackend(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.backend).toBe('opencode');
    expect(parsed.models.opus).toBe('anthropic/claude-opus-4-5');
    expect(parsed.models.sonnet).toBe('anthropic/claude-sonnet-4-5');
    expect(parsed.models.haiku).toBe('anthropic/claude-haiku-4-5');
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
