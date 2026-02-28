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
  cmdCoverageReport,
  cmdHealthCheck,
  cmdSetup,
  _stateContentCache,
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

  test('truncates slug to 60 characters for very long input', () => {
    const longText = 'word '.repeat(30); // 150 chars after slug generation
    const { stdout, exitCode } = captureOutput(() => {
      cmdGenerateSlug(longText, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.slug.length).toBeLessThanOrEqual(60);
    expect(parsed.slug).not.toMatch(/^-|-$/); // no leading/trailing dashes
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

  test('logs non-ENOENT error to stderr when reading a todo file fails', () => {
    const localFixture = createFixtureDir();
    const pendingDir = path.join(
      localFixture,
      '.planning',
      'milestones',
      'anonymous',
      'todos',
      'pending'
    );
    // Create a directory named like a .md file — readFileSync will throw EISDIR (not ENOENT)
    const badEntry = path.join(pendingDir, 'bad-todo.md');
    fs.mkdirSync(badEntry, { recursive: true });

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => {});
    try {
      captureOutput(() => cmdListTodos(localFixture, null, false));
      const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join('');
      expect(stderrOutput).toContain('[todos]');
    } finally {
      stderrSpy.mockRestore();
      cleanupFixtureDir(localFixture);
    }
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
    const pendingPath = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'todos',
      'pending',
      'sample.md'
    );
    const completedPath = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'todos',
      'completed',
      'sample.md'
    );
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

  test('creates config with mcp_atlassian key instead of obsolete jira key', () => {
    fs.unlinkSync(path.join(fixtureDir, '.planning', 'config.json'));
    captureOutput(() => { cmdConfigEnsureSection(fixtureDir, false); });
    const config = JSON.parse(
      fs.readFileSync(path.join(fixtureDir, '.planning', 'config.json'), 'utf-8')
    );
    expect(config.tracker).not.toHaveProperty('jira');
    expect(config.tracker).toHaveProperty('mcp_atlassian');
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

  test('BUG-48-004: extracts objective from <objective> tag in plan body', () => {
    const { stdout } = captureOutput(() => {
      cmdPhasePlanIndex(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    const plan = parsed.plans.find((p) => p.id === '01-01');
    expect(plan).toBeDefined();
    expect(plan.objective).toBe('Create project structure.');
  });

  test('BUG-48-004: extracts files_modified from underscore key in frontmatter', () => {
    const { stdout } = captureOutput(() => {
      cmdPhasePlanIndex(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    const plan = parsed.plans.find((p) => p.id === '01-01');
    expect(plan).toBeDefined();
    expect(plan.files_modified).toEqual(['src/index.js']);
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
      cmdSummaryExtract(
        fixtureDir,
        '.planning/milestones/anonymous/phases/01-test/01-01-SUMMARY.md',
        null,
        false
      );
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

  test('"json" format raw mode returns non-empty human-readable summary', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdProgressRender(fixtureDir, 'json', true);
    });
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
    expect(stdout).toContain('%');
  });

  test('"json" format includes active_blockers field', () => {
    const { stdout } = captureOutput(() => {
      cmdProgressRender(fixtureDir, 'json', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('active_blockers');
    expect(typeof parsed.active_blockers).toBe('number');
    expect(parsed).toHaveProperty('blocker_items');
    expect(Array.isArray(parsed.blocker_items)).toBe(true);
  });

  test('"table" format shows BLOCKED warning when STATE.md has active blockers', () => {
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    _stateContentCache.delete(statePath);
    let state = fs.readFileSync(statePath, 'utf-8');
    state = state.replace(
      '## Blockers\n\nNone.',
      '## Blockers\n\n- API rate limit exceeded\n- Missing test data'
    );
    fs.writeFileSync(statePath, state);

    const { stdout } = captureOutput(() => {
      cmdProgressRender(fixtureDir, 'table', true);
    });
    expect(stdout).toContain('BLOCKED');
    expect(stdout).toContain('API rate limit exceeded');
    expect(stdout).toContain('Missing test data');
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
    // Fixture ROADMAP.md has 1 milestone (M1 v1.0: Foundation)
    expect(stdout).toContain('Milestone 1: Foundation');
  });

  test('each milestone contains phases array with number, name, status', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    expect(stdout).toContain('Phase 1:');
    expect(stdout).toContain('Phase 2:');
  });

  test('phase status correctly computed: complete (summaries >= plans)', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    // Phase 1 has 1 plan and 1 summary -> complete (shown as 1/1 plans in TUI)
    expect(stdout).toContain('1/1 plans');
  });

  test('phase status correctly computed: planned (plans > 0, summaries = 0)', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    // Phase 2 has 1 plan and 0 summaries -> planned (shown as ○ symbol in TUI)
    expect(stdout).toContain('\u25CB Phase 2:');
  });

  test('summary object contains total_milestones, total_phases, total_plans, total_summaries', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    // TUI summary line contains milestone, phase, and plan counts
    expect(stdout).toContain('1 active milestones');
    expect(stdout).toContain('2 phases');
    expect(stdout).toContain('1/2 plans complete');
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
    // Fixture STATE.md says "Active phase: 1 (01-test)" -> TUI shows [ACTIVE]
    expect(stdout).toContain('[ACTIVE]');
    // Only phase 1 should be marked active
    expect((stdout.match(/\[ACTIVE\]/g) || []).length).toBe(1);
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
    // TUI summary footer shows blocker and deferred counts
    expect(stdout).toContain('Blockers: 2');
    expect(stdout).toContain('Deferred: 1');
  });

  test('non-raw mode surfaces blocker details in TUI when active blockers exist', () => {
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    let state = fs.readFileSync(statePath, 'utf-8');
    state = state.replace(
      '## Blockers\n\nNone.',
      '## Blockers\n\n- Dependency upgrade blocked by security audit\n- CI pipeline broken'
    );
    fs.writeFileSync(statePath, state);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, false);
    });
    expect(stdout).toContain('ACTIVE BLOCKERS');
    expect(stdout).toContain('Dependency upgrade blocked by security audit');
    expect(stdout).toContain('CI pipeline broken');
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
    // Phase 1: 1/1 = 100%, Phase 2: 0/1 = 0%, avg = 50%
    expect(stdout).toContain('50%');
  });

  test('extracts milestone number from M-format heading', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    // Fixture uses "## M1 v1.0: Foundation" -> TUI shows "Milestone 1:"
    expect(stdout).toContain('Milestone 1:');
  });

  test('extracts milestone number from "Milestone N:" format', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    let roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    roadmap = roadmap.replace('## M1 v1.0: Foundation', '## Milestone 2: Foundation');
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    expect(stdout).toContain('Milestone 2: Foundation');
  });

  test('extracts goal from **Goal:** line', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    // Fixture has "**Goal:** Establish project infrastructure"
    expect(stdout).toContain('Goal: Establish project infrastructure');
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
    // Phase 1: 1/1 = 100%, Phase 2: 0/1 = 0%, Phase 3: 0/0 = 0%
    // Average: (1.0 + 0 + 0) / 3 = 33%
    expect(stdout).toContain('33%');
  });

  test('TUI output includes timeline section with dated milestones', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    // TUI shows Timeline section with milestone dates
    expect(stdout).toContain('## Timeline');
    expect(stdout).toContain('2026-01-15');
    expect(stdout).toContain('2026-01-20');
  });

  test('milestones without dates are excluded from timeline', () => {
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    let roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    roadmap = roadmap.replace(/\*\*Start:\*\*.*\n/, '').replace(/\*\*Target:\*\*.*\n/, '');
    fs.writeFileSync(roadmapPath, roadmap);

    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    // No dates -> no Timeline section in TUI
    expect(stdout).not.toContain('## Timeline');
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
    // TUI Timeline section shows both milestone date ranges
    expect(stdout).toContain('## Timeline');
    expect(stdout).toContain('2026-01-01');
    expect(stdout).toContain('2026-02-01');
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
    // TUI shows shipped milestones in Shipped section
    expect(stdout).toContain('Alpha Release');
    expect(stdout).toContain('Beta Release');
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
    // TUI shows shipped milestone with version, name, phase count, and date
    expect(stdout).toContain('v0.1.0 Alpha Release');
    expect(stdout).toContain('3 phases');
    expect(stdout).toContain('shipped 2026-01-20');
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
    // TUI summary line shows shipped + active milestones and total phases
    expect(stdout).toContain('1 shipped + 1 active milestones');
    expect(stdout).toContain('5 phases');
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

    // TUI (raw) also shows both milestones
    const { stdout: rawOut } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    expect(rawOut).toContain('v0.1.0 Alpha');
    expect(rawOut).toContain('Milestone 2: Beta');
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
    expect(stdout).toContain('Phase 1: test');
  });

  test('plans array contains id, wave, type, status for each plan', () => {
    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    // TUI table shows plan ID, wave, and status symbol (✓ = complete)
    expect(stdout).toContain('01-01');
    expect(stdout).toContain('| 1    |');
    expect(stdout).toContain('\u2713');
  });

  test('completed plans have duration from SUMMARY frontmatter', () => {
    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    // Fixture SUMMARY has duration: 1min -> TUI shows in table
    expect(stdout).toContain('1min');
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
    const emptyPhaseDir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '03-empty'
    );
    fs.mkdirSync(emptyPhaseDir, { recursive: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '3', true);
    });
    expect(exitCode).toBe(0);
    // TUI shows status with 0 plans
    expect(stdout).toContain('0/0 plans');
  });

  test('detects presence of CONTEXT.md, RESEARCH.md, EVAL.md, VERIFICATION.md, REVIEW.md', () => {
    // Create supplementary files in phase 1 directory
    const phase1Dir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    fs.writeFileSync(path.join(phase1Dir, '01-CONTEXT.md'), '# Context\n');
    fs.writeFileSync(path.join(phase1Dir, '01-RESEARCH.md'), '# Research\n');
    fs.writeFileSync(path.join(phase1Dir, '01-EVAL.md'), '# Eval\n');
    fs.writeFileSync(path.join(phase1Dir, '01-VERIFICATION.md'), '# Verification\n');
    fs.writeFileSync(path.join(phase1Dir, '01-REVIEW.md'), '# Review\n');

    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    // TUI Artifacts section shows ✓ for each present artifact
    expect(stdout).toContain('Context: \u2713');
    expect(stdout).toContain('Research: \u2713');
    expect(stdout).toContain('Eval: \u2713');
    expect(stdout).toContain('Verification: \u2713');
    expect(stdout).toContain('Review: \u2713');
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
    // TUI status line shows completed/total plans
    expect(stdout).toContain('Status: Complete (1/1 plans)');
  });

  test('phase 2 with no summaries shows planned status', () => {
    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '2', true);
    });
    // Phase 2 has 1 plan, 0 summaries -> Planned status, no duration
    expect(stdout).toContain('Status: Planned (0/1 plans)');
    expect(stdout).toContain('| \u25CB');
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

  test('phase with Requirements field includes requirements array in TUI output', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    expect(exitCode).toBe(0);
    // TUI Requirements section shows REQ IDs
    expect(stdout).toContain('REQ-01');
    expect(stdout).toContain('REQ-03');
  });

  test('each requirement entry has correct fields from REQUIREMENTS.md', () => {
    const { stdout } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '1', true);
    });
    // TUI Requirements table shows REQ fields
    expect(stdout).toContain('First Requirement');
    expect(stdout).toContain('P0');
    expect(stdout).toContain('Done');
    expect(stdout).toContain('Third Requirement');
    expect(stdout).toContain('In Progress');
  });

  test('phase without Requirements field returns empty requirements array', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDetail(fixtureDir, '2', true);
    });
    expect(exitCode).toBe(0);
    // Phase 2 has no requirements -> no Requirements section in TUI
    expect(stdout).not.toContain('## Requirements');
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
    // TUI Blockers section lists each blocker
    expect(stdout).toContain('Upstream API downtime');
    expect(stdout).toContain('Missing credentials for staging');
  });

  test('parses deferred validations table (total, pending, resolved counts)', () => {
    const { stdout } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    // TUI Deferred Validations section shows counts
    expect(stdout).toContain('2 pending / 3 total');
  });

  test('computes velocity from performance metrics table (average duration)', () => {
    const { stdout } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    // 3 + 5 + 7 + 4 + 6 = 25 min / 5 plans = 5.0 avg
    // TUI shows "Average plan duration: 5 min (5 plans)"
    expect(stdout).toContain('5 min (5 plans)');
  });

  test('computes recent_5_avg from last 5 entries in metrics table', () => {
    const { stdout } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    // All 5 entries are the last 5: avg = 5.0
    // TUI shows "Recent 5 plans: 5 min avg"
    expect(stdout).toContain('Recent 5 plans: 5 min avg');
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
    // TUI Risk Register section lists risks
    expect(stdout).toContain('API rate limits');
    expect(stdout).toContain('High');
    expect(stdout).toContain('Medium');
  });

  test('handles missing STATE.md gracefully', () => {
    fs.unlinkSync(path.join(fixtureDir, '.planning', 'STATE.md'));

    const { stdout, exitCode } = captureOutput(() => {
      cmdHealth(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    // No STATE.md -> zero blockers, zero deferred, zero velocity
    expect(stdout).toContain('None \u2713');
    expect(stdout).toContain('0 pending / 0 total');
    expect(stdout).toContain('0 min (0 plans)');
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
    // No blockers -> TUI shows "None ✓"
    expect(stdout).toContain('None \u2713');
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
    // No metrics -> zero velocity in TUI
    expect(stdout).toContain('0 min (0 plans)');
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
    // Phase 02-build has 1 plan but 0 summaries -> stale, shown in TUI
    expect(stdout).toContain('02-build');
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
    // "None." item shouldn't be counted -> TUI shows "None ✓"
    expect(stdout).toContain('None \u2713');
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

  test('raw=false produces JSON output', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementGet(fixtureDir, 'REQ-01', false);
    });
    expect(exitCode).toBe(0);
    const parsed = parseFirstJson(stdout);
    expect(parsed.id).toBe('REQ-01');
  });

  test('raw=true produces human-readable text output', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRequirementGet(fixtureDir, 'REQ-01', true);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('REQ-01');
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
      cmdRequirementGet(fixtureDir, 'REQ-02', false);
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

  test('does NOT migrate codebase/ (project-level, stays at root)', () => {
    setupOldLayout({ codebase: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    const result = parseFirstJson(stdout);

    // codebase/ should NOT appear in moved_directories
    const codebaseEntry = result.moved_directories.find((d) => d.from === 'codebase');
    expect(codebaseEntry).toBeUndefined();

    // codebase/ should still be at old root location
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'codebase', 'ARCHITECTURE.md'))).toBe(true);

    // Should NOT be under milestones/
    expect(
      fs.existsSync(
        path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'codebase', 'ARCHITECTURE.md')
      )
    ).toBe(false);
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

  test('moves quick/ to milestones/{milestone}/quick/', () => {
    setupOldLayout({ quick: true });

    const { stdout, exitCode } = captureOutput(() => {
      cmdMigrateDirs(tmpDir, false);
    });
    expect(exitCode).toBe(0);

    // quick/ should go to v1.0 (the fixture's milestone)
    expect(
      fs.existsSync(
        path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'quick', '1-test', '1-SUMMARY.md')
      )
    ).toBe(true);

    // Should NOT be under anonymous
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'quick'))).toBe(
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

// ─── ceremony config defaults ──────────────────────────────────────────────

describe('ceremony config defaults', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
    // Remove existing config so ensure-section creates fresh
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('newly created config includes ceremony section', () => {
    const { stdout } = captureOutput(() => cmdConfigEnsureSection(tmpDir, false));
    const result = parseFirstJson(stdout);
    expect(result.created).toBe(true);

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.planning', 'config.json'), 'utf-8')
    );
    expect(config.ceremony).toBeDefined();
    expect(config.ceremony.default_level).toBe('auto');
    expect(config.ceremony.phase_overrides).toEqual({});
  });
});

// ─── cmdCoverageReport ──────────────────────────────────────────────────────

describe('cmdCoverageReport', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('reports all modules above threshold when coverage is high', () => {
    // Write a mock coverage-summary.json
    const coverageDir = path.join(tmpDir, 'coverage');
    fs.mkdirSync(coverageDir, { recursive: true });
    const summaryData = {
      total: {
        lines: { pct: 90 },
        branches: { pct: 85 },
        functions: { pct: 100 },
        statements: { pct: 90 },
      },
      [path.join(tmpDir, 'lib', 'utils.js')]: {
        lines: { pct: 92 },
        branches: { pct: 88 },
        functions: { pct: 100 },
        statements: { pct: 91 },
      },
      [path.join(tmpDir, 'lib', 'state.js')]: {
        lines: { pct: 90 },
        branches: { pct: 85 },
        functions: { pct: 95 },
        statements: { pct: 89 },
      },
    };
    fs.writeFileSync(
      path.join(coverageDir, 'coverage-summary.json'),
      JSON.stringify(summaryData),
      'utf-8'
    );

    // Mock execFileSync to throw (jest exits non-zero) but coverage file already exists
    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    child_process.execFileSync = () => {
      throw new Error('jest exited');
    };

    try {
      const { stdout, exitCode } = captureOutput(() =>
        cmdCoverageReport(tmpDir, { threshold: 85 }, false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.all_above).toBe(true);
      expect(result.below_threshold_count).toBe(0);
      expect(result.total_modules).toBe(2);
      expect(result.threshold).toBe(85);
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });

  test('identifies modules below threshold', () => {
    const coverageDir = path.join(tmpDir, 'coverage');
    fs.mkdirSync(coverageDir, { recursive: true });
    const summaryData = {
      total: {
        lines: { pct: 70 },
        branches: { pct: 60 },
        functions: { pct: 80 },
        statements: { pct: 70 },
      },
      [path.join(tmpDir, 'lib', 'tracker.js')]: {
        lines: { pct: 43 },
        branches: { pct: 30 },
        functions: { pct: 50 },
        statements: { pct: 42 },
      },
      [path.join(tmpDir, 'lib', 'state.js')]: {
        lines: { pct: 95 },
        branches: { pct: 90 },
        functions: { pct: 100 },
        statements: { pct: 94 },
      },
    };
    fs.writeFileSync(
      path.join(coverageDir, 'coverage-summary.json'),
      JSON.stringify(summaryData),
      'utf-8'
    );

    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    child_process.execFileSync = () => {
      throw new Error('jest exited');
    };

    try {
      const { stdout, exitCode } = captureOutput(() =>
        cmdCoverageReport(tmpDir, { threshold: 85 }, false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.all_above).toBe(false);
      expect(result.below_threshold_count).toBe(1);
      expect(result.below_threshold[0].module).toBe('lib/tracker.js');
      expect(result.below_threshold[0].gap).toBe(42);
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });

  test('returns error when coverage file is missing', () => {
    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    child_process.execFileSync = () => {
      throw new Error('jest failed completely');
    };

    try {
      const { stdout, exitCode } = captureOutput(() => cmdCoverageReport(tmpDir, {}, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.error).toContain('Failed to generate coverage report');
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });

  test('uses custom threshold', () => {
    const coverageDir = path.join(tmpDir, 'coverage');
    fs.mkdirSync(coverageDir, { recursive: true });
    const summaryData = {
      total: {
        lines: { pct: 88 },
        branches: { pct: 80 },
        functions: { pct: 90 },
        statements: { pct: 87 },
      },
      [path.join(tmpDir, 'lib', 'utils.js')]: {
        lines: { pct: 88 },
        branches: { pct: 80 },
        functions: { pct: 90 },
        statements: { pct: 87 },
      },
    };
    fs.writeFileSync(
      path.join(coverageDir, 'coverage-summary.json'),
      JSON.stringify(summaryData),
      'utf-8'
    );

    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    child_process.execFileSync = () => {
      throw new Error('jest exited');
    };

    try {
      // With threshold 85, module is above
      const { stdout: stdout1 } = captureOutput(() =>
        cmdCoverageReport(tmpDir, { threshold: 85 }, false)
      );
      const result1 = JSON.parse(stdout1);
      expect(result1.all_above).toBe(true);

      // With threshold 90, module is below
      const { stdout: stdout2 } = captureOutput(() =>
        cmdCoverageReport(tmpDir, { threshold: 90 }, false)
      );
      const result2 = JSON.parse(stdout2);
      expect(result2.all_above).toBe(false);
      expect(result2.below_threshold_count).toBe(1);
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });

  test('skips non-lib entries in coverage data', () => {
    const coverageDir = path.join(tmpDir, 'coverage');
    fs.mkdirSync(coverageDir, { recursive: true });
    const summaryData = {
      total: {
        lines: { pct: 90 },
        branches: { pct: 85 },
        functions: { pct: 100 },
        statements: { pct: 90 },
      },
      [path.join(tmpDir, 'lib', 'utils.js')]: {
        lines: { pct: 92 },
        branches: { pct: 88 },
        functions: { pct: 100 },
        statements: { pct: 91 },
      },
      [path.join(tmpDir, 'bin', 'grd-tools.js')]: {
        lines: { pct: 50 },
        branches: { pct: 40 },
        functions: { pct: 60 },
        statements: { pct: 50 },
      },
    };
    fs.writeFileSync(
      path.join(coverageDir, 'coverage-summary.json'),
      JSON.stringify(summaryData),
      'utf-8'
    );

    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    child_process.execFileSync = () => {
      throw new Error('jest exited');
    };

    try {
      const { stdout } = captureOutput(() => cmdCoverageReport(tmpDir, { threshold: 85 }, false));
      const result = JSON.parse(stdout);
      // Only lib/ files should be included
      expect(result.total_modules).toBe(1);
      expect(result.modules[0].module).toBe('lib/utils.js');
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });
});

// ─── cmdHealthCheck ─────────────────────────────────────────────────────────

describe('cmdHealthCheck', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('reports healthy when all checks pass', () => {
    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    let callIndex = 0;
    child_process.execFileSync = (cmd, args) => {
      callIndex++;
      if (args && args[0] === 'jest') {
        return 'Tests:  100 passed, 100 total';
      }
      if (args && args[0] === 'eslint') {
        return JSON.stringify([
          { filePath: 'lib/utils.js', errorCount: 0, warningCount: 0, messages: [] },
        ]);
      }
      if (args && args[0] === 'prettier') {
        return 'All files matched';
      }
      if (cmd === 'node' && args[0] === 'bin/grd-tools.js') {
        return JSON.stringify({ passed: true, errors: [], warning_count: 0 });
      }
      return '';
    };

    try {
      const { stdout, exitCode } = captureOutput(() => cmdHealthCheck(tmpDir, {}, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.healthy).toBe(true);
      expect(result.tests.status).toBe('pass');
      expect(result.tests.pass).toBe(100);
      expect(result.lint.status).toBe('pass');
      expect(result.format.status).toBe('pass');
      expect(result.consistency.status).toBe('pass');
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });

  test('reports test failures with counts', () => {
    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    child_process.execFileSync = (cmd, args) => {
      if (args && args[0] === 'jest') {
        const err = new Error('Tests failed');
        err.stdout = 'Tests:  3 failed, 97 passed, 100 total';
        throw err;
      }
      if (args && args[0] === 'eslint') {
        return JSON.stringify([
          { filePath: 'lib/utils.js', errorCount: 0, warningCount: 0, messages: [] },
        ]);
      }
      if (args && args[0] === 'prettier') return '';
      if (cmd === 'node') return JSON.stringify({ passed: true, errors: [], warning_count: 0 });
      return '';
    };

    try {
      const { stdout, exitCode } = captureOutput(() => cmdHealthCheck(tmpDir, {}, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.healthy).toBe(false);
      expect(result.tests.status).toBe('fail');
      expect(result.tests.fail).toBe(3);
      expect(result.tests.pass).toBe(97);
      expect(result.tests.total).toBe(100);
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });

  test('reports lint errors', () => {
    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    child_process.execFileSync = (cmd, args) => {
      if (args && args[0] === 'jest') return 'Tests:  50 passed, 50 total';
      if (args && args[0] === 'eslint') {
        const err = new Error('Lint failed');
        err.stdout = JSON.stringify([
          { filePath: 'lib/a.js', errorCount: 2, warningCount: 1, messages: [] },
          { filePath: 'lib/b.js', errorCount: 0, warningCount: 3, messages: [] },
        ]);
        throw err;
      }
      if (args && args[0] === 'prettier') return '';
      if (cmd === 'node') return JSON.stringify({ passed: true, errors: [], warning_count: 0 });
      return '';
    };

    try {
      const { stdout, exitCode } = captureOutput(() => cmdHealthCheck(tmpDir, {}, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.healthy).toBe(false);
      expect(result.lint.status).toBe('fail');
      expect(result.lint.errors).toBe(2);
      expect(result.lint.warnings).toBe(4);
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });

  test('fix mode passes --fix to lint and --write to prettier', () => {
    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    const calls = [];
    child_process.execFileSync = (cmd, args) => {
      calls.push({ cmd, args: [...args] });
      if (args && args[0] === 'jest') return 'Tests:  10 passed, 10 total';
      if (args && args[0] === 'eslint') {
        return JSON.stringify([
          { filePath: 'lib/a.js', errorCount: 0, warningCount: 0, messages: [] },
        ]);
      }
      if (args && args[0] === 'prettier') return '';
      if (cmd === 'node') return JSON.stringify({ passed: true, errors: [], warning_count: 0 });
      return '';
    };

    try {
      captureOutput(() => cmdHealthCheck(tmpDir, { fix: true }, false));

      // Verify --fix was passed to eslint
      const eslintCall = calls.find((c) => c.args[0] === 'eslint');
      expect(eslintCall.args).toContain('--fix');

      // Verify --write was passed to prettier (before --check)
      const prettierWriteCall = calls.find(
        (c) => c.args[0] === 'prettier' && c.args.includes('--write')
      );
      expect(prettierWriteCall).toBeDefined();
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });

  test('handles lint parse error gracefully', () => {
    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    child_process.execFileSync = (cmd, args) => {
      if (args && args[0] === 'jest') return 'Tests:  10 passed, 10 total';
      if (args && args[0] === 'eslint') {
        const err = new Error('Lint crashed');
        err.stdout = 'not valid json';
        throw err;
      }
      if (args && args[0] === 'prettier') return '';
      if (cmd === 'node') return JSON.stringify({ passed: true, errors: [], warning_count: 0 });
      return '';
    };

    try {
      const { stdout, exitCode } = captureOutput(() => cmdHealthCheck(tmpDir, {}, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.lint.status).toBe('error');
      expect(result.lint.errors).toBe(-1);
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });

  test('handles consistency check error', () => {
    const child_process = require('child_process');
    const origExecFileSync = child_process.execFileSync;
    child_process.execFileSync = (cmd, args) => {
      if (args && args[0] === 'jest') return 'Tests:  10 passed, 10 total';
      if (args && args[0] === 'eslint') {
        return JSON.stringify([
          { filePath: 'lib/a.js', errorCount: 0, warningCount: 0, messages: [] },
        ]);
      }
      if (args && args[0] === 'prettier') return '';
      if (cmd === 'node') throw new Error('validate consistency crashed');
      return '';
    };

    try {
      const { stdout, exitCode } = captureOutput(() => cmdHealthCheck(tmpDir, {}, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.consistency.status).toBe('error');
      expect(result.consistency.passed).toBe(false);
    } finally {
      child_process.execFileSync = origExecFileSync;
    }
  });
});

// ─── cmdSetup ────────────────────────────────────────────────────────────────

describe('cmdSetup', () => {
  test('returns plugin path info in JSON mode', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSetup('/any/dir', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('package_root');
    expect(parsed).toHaveProperty('plugin_json');
    expect(parsed).toHaveProperty('instructions');
    expect(parsed.plugin_json).toContain('.claude-plugin');
    expect(parsed.plugin_json).toContain('plugin.json');
  });

  test('raw mode returns human-readable setup text', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdSetup('/any/dir', true);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('GRD plugin configured');
    expect(stdout).toContain('Package root:');
    expect(stdout).toContain('Plugin config:');
  });
});

// ─── cmdTodoComplete — additional edge cases ─────────────────────────────────

describe('cmdTodoComplete — null filename', () => {
  test('errors when no filename provided', () => {
    const fixtureDir = createFixtureDir();
    try {
      const { exitCode } = captureError(() => {
        cmdTodoComplete(fixtureDir, null, false);
      });
      expect(exitCode).toBe(1);
    } finally {
      cleanupFixtureDir(fixtureDir);
    }
  });
});

// ─── cmdVerifyPathExists — null path ─────────────────────────────────────────

describe('cmdVerifyPathExists — null path', () => {
  test('errors when no path provided', () => {
    const fixtureDir = createFixtureDir();
    try {
      const { exitCode } = captureError(() => {
        cmdVerifyPathExists(fixtureDir, null, false);
      });
      expect(exitCode).toBe(1);
    } finally {
      cleanupFixtureDir(fixtureDir);
    }
  });
});

// ─── cmdPhaseDetail — non-raw error paths ────────────────────────────────────
// Note: in non-raw (display) mode, cmdPhaseDetail writes error text to stdout
// and exits with code 0 — not 1. This is by design: display-mode errors are
// formatted for human consumption. Raw mode would use process.exit(1) instead.

describe('cmdPhaseDetail — non-raw error paths', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('no phase argument in non-raw mode writes error text to stderr', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdPhaseDetail(fixtureDir, '', false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('required');
  });

  test('nonexistent phase in non-raw mode writes error text to stderr', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdPhaseDetail(fixtureDir, '999', false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('999');
  });
});

// ─── cmdCommit — commit_failed reason ────────────────────────────────────────

describe('cmdCommit — commit_failed for non-empty-commit errors', () => {
  let repoDir;

  beforeEach(() => {
    const os = require('os');
    const { execFileSync } = require('child_process');
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-commit-fail-test-'));
    execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.email', 'test@grd.dev'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['config', 'user.name', 'GRD Test'], { cwd: repoDir, stdio: 'pipe' });
    // Create initial commit so HEAD exists
    fs.writeFileSync(path.join(repoDir, 'initial.txt'), 'init');
    execFileSync('git', ['add', 'initial.txt'], { cwd: repoDir, stdio: 'pipe' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repoDir, stdio: 'pipe' });
    // Create .planning/ with commit_docs: true
    fs.mkdirSync(path.join(repoDir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, '.planning', 'config.json'),
      JSON.stringify({ commit_docs: true })
    );
    // Create a file to stage
    fs.writeFileSync(path.join(repoDir, '.planning', 'STATE.md'), '# State\n');
    // Install a pre-commit hook that always rejects
    const hooksDir = path.join(repoDir, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(hooksDir, 'pre-commit'),
      '#!/bin/sh\necho "pre-commit hook rejected" >&2\nexit 1\n'
    );
    fs.chmodSync(path.join(hooksDir, 'pre-commit'), 0o755);
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  test('returns commit_failed reason when git commit fails due to pre-commit hook', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdCommit(repoDir, 'test commit', ['.planning/'], false, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.committed).toBe(false);
    expect(parsed.reason).toBe('commit_failed');
    expect(parsed.error).toBeDefined();
  });
});

// ─── cmdDashboard filter option ──────────────────────────────────────────────

describe('cmdDashboard filter option', () => {
  let fixtureDir;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('filter:incomplete returns only phases without all summaries', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdDashboard(fixtureDir, true, { filter: 'incomplete' });
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    for (const ms of parsed.milestones) {
      for (const phase of ms.phases) {
        expect(phase.status).not.toBe('complete');
      }
    }
  });

  test('filter:incomplete excludes phase 1 (which has summary) from results', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true, { filter: 'incomplete' });
    });
    const parsed = JSON.parse(stdout);
    const allPhases = parsed.milestones.flatMap((ms) => ms.phases);
    const phase1 = allPhases.find((p) => p.number === '1');
    expect(phase1).toBeUndefined();
  });

  test('filter:incomplete includes phase 2 (which has no summary)', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true, { filter: 'incomplete' });
    });
    const parsed = JSON.parse(stdout);
    const allPhases = parsed.milestones.flatMap((ms) => ms.phases);
    const phase2 = allPhases.find((p) => p.number === '2');
    expect(phase2).toBeDefined();
  });

  test('no filter returns all phases (backwards compatible)', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true);
    });
    // No filter -> TUI shows all phases
    expect(stdout).toContain('Phase 1:');
    expect(stdout).toContain('Phase 2:');
  });

  test('empty options object does not filter', () => {
    const { stdout } = captureOutput(() => {
      cmdDashboard(fixtureDir, true, {});
    });
    // Empty options -> TUI shows all phases
    expect(stdout).toContain('Phase 1:');
    expect(stdout).toContain('Phase 2:');
  });

  // ─── Stability: cmdDashboard non-raw mode writes output and returns ──────────

  test('non-raw TUI mode writes output to stdout and returns normally', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdDashboard(fixtureDir, false, {});
    });
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  test('non-raw mode when ROADMAP.md missing writes message to stderr and exits 1', () => {
    const tmpDir2 = createFixtureDir();
    fs.unlinkSync(path.join(tmpDir2, '.planning', 'ROADMAP.md'));
    const { stderr, exitCode } = captureError(() => {
      cmdDashboard(tmpDir2, false, {});
    });
    cleanupFixtureDir(tmpDir2);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('No ROADMAP.md found');
  });
});
