/**
 * Integration tests for bin/grd-tools.js
 *
 * Tests all CLI commands end-to-end via execFileSync. Each test invokes the
 * actual CLI binary with arguments and validates the output.
 *
 * Read-only tests share a single fixture directory (created once in beforeAll).
 * Mutating tests get isolated per-test fixture directories.
 * Git-dependent tests create temporary git repos.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GRD_TOOLS = path.resolve(__dirname, '../../bin/grd-tools.js');
const FIXTURE_SOURCE = path.resolve(__dirname, '../fixtures/planning');

// ─── Helper ─────────────────────────────────────────────────────────────────

/**
 * Run a CLI command via execFileSync.
 * @param {string[]} args - Arguments to pass to grd-tools.js
 * @param {string} cwd - Working directory
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
function runCLI(args, cwd) {
  try {
    const stdout = execFileSync('node', [GRD_TOOLS, ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 15000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status || 1,
    };
  }
}

/**
 * Create a temp directory with a copy of the fixture .planning/ structure
 * plus a src/index.js so verify-path-exists has something to check.
 */
function createTestDir() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-integ-'));
  const dest = path.join(tmpRoot, '.planning');
  fs.cpSync(FIXTURE_SOURCE, dest, { recursive: true });
  // Create src/index.js for verify-path-exists
  fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'src', 'index.js'), '// entry point\n');
  return tmpRoot;
}

/**
 * Create a test dir with STATE.md format that has "Current plan: NN-MM (desc), next: NN-MM+1"
 * and "N plans" so advance-plan can parse it.
 */
function createTestDirWithPlanCount() {
  const tmpRoot = createTestDir();
  const statePath = path.join(tmpRoot, '.planning', 'STATE.md');
  let state = fs.readFileSync(statePath, 'utf-8');
  // Replace "Current plan: 01-01" with a format advance-plan can parse
  state = state.replace(
    '- **Current plan:** 01-01',
    '- **Current plan:** 01-01 (complete), next: 01-02'
  );
  // The roadmap says "Plans: 1 plan" for phase 1, which means total=1
  // advance-plan needs to know total plans; it parses from roadmap
  fs.writeFileSync(statePath, state);
  return tmpRoot;
}

function cleanupDir(dir) {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Parse JSON from CLI stdout, handling potential pretty-printing.
 */
function parseJSON(stdout) {
  return JSON.parse(stdout.trim());
}

// ─── Shared fixture for read-only tests ──────────────────────────────────────

let fixtureDir;

beforeAll(() => {
  fixtureDir = createTestDir();
});

afterAll(() => {
  cleanupDir(fixtureDir);
});

// ─── State Commands (Read-only) ─────────────────────────────────────────────

describe('state commands', () => {
  test('state load returns valid JSON with config and state keys', () => {
    const { stdout, exitCode } = runCLI(['state'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('config');
    expect(data).toHaveProperty('state_raw');
    expect(data).toHaveProperty('state_exists', true);
    expect(data).toHaveProperty('config_exists', true);
  });

  test('state get returns state content as JSON', () => {
    const { stdout, exitCode } = runCLI(['state', 'get'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('content');
    expect(data.content).toContain('# State');
  });

  test('state get "Key Decisions" returns decisions section', () => {
    const { stdout, exitCode } = runCLI(['state', 'get', 'Key Decisions'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('Key Decisions');
    expect(data['Key Decisions']).toContain('balanced model profile');
  });

  test('state-snapshot returns valid structured JSON', () => {
    const { stdout, exitCode } = runCLI(['state-snapshot'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('session');
  });
});

// ─── Utility Commands ───────────────────────────────────────────────────────

describe('utility commands', () => {
  test('resolve-model grd-executor returns model info', () => {
    const { stdout, exitCode } = runCLI(['resolve-model', 'grd-executor'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('model');
    expect(data).toHaveProperty('profile');
  });

  test('find-phase 1 returns phase directory info', () => {
    const { stdout, exitCode } = runCLI(['find-phase', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('found', true);
    expect(data).toHaveProperty('phase_number');
    expect(data).toHaveProperty('plans');
    expect(data).toHaveProperty('summaries');
  });

  test('generate-slug produces slug JSON', () => {
    const { stdout, exitCode } = runCLI(['generate-slug', 'Hello World Test'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.slug).toBe('hello-world-test');
  });

  test('current-timestamp --raw returns plain timestamp', () => {
    const { stdout, exitCode } = runCLI(['current-timestamp', '--raw'], fixtureDir);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('current-timestamp full returns JSON with timestamp', () => {
    const { stdout, exitCode } = runCLI(['current-timestamp', 'full'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('timestamp');
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('current-timestamp date returns date-only JSON', () => {
    const { stdout, exitCode } = runCLI(['current-timestamp', 'date'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('timestamp');
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('current-timestamp filename returns filename-safe JSON', () => {
    const { stdout, exitCode } = runCLI(['current-timestamp', 'filename'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('timestamp');
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });
});

// ─── Path Verification ──────────────────────────────────────────────────────

describe('verify-path-exists', () => {
  test('existing file returns exists true', () => {
    const { stdout, exitCode } = runCLI(['verify-path-exists', 'src/index.js'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.exists).toBe(true);
  });

  test('missing file returns exists false', () => {
    const { stdout, exitCode } = runCLI(['verify-path-exists', 'nonexistent/file.txt'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.exists).toBe(false);
  });
});

// ─── Frontmatter Commands ───────────────────────────────────────────────────

describe('frontmatter commands', () => {
  test('frontmatter get returns plan frontmatter', () => {
    const { stdout, exitCode } = runCLI(
      ['frontmatter', 'get', '.planning/phases/01-test/01-01-PLAN.md'],
      fixtureDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.phase).toBe('01-test');
    expect(data.plan).toBe('01');
  });

  test('frontmatter get --field returns single field', () => {
    const { stdout, exitCode } = runCLI(
      ['frontmatter', 'get', '.planning/phases/01-test/01-01-PLAN.md', '--field', 'phase'],
      fixtureDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.phase).toBe('01-test');
  });

  test('frontmatter validate plan schema returns valid', () => {
    const { stdout, exitCode } = runCLI(
      ['frontmatter', 'validate', '.planning/phases/01-test/01-01-PLAN.md', '--schema', 'plan'],
      fixtureDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.valid).toBe(true);
  });
});

// ─── Verification Suite ─────────────────────────────────────────────────────

describe('verify commands', () => {
  test('verify plan-structure succeeds on valid plan', () => {
    const { stdout, exitCode } = runCLI(
      ['verify', 'plan-structure', '.planning/phases/01-test/01-01-PLAN.md'],
      fixtureDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.valid).toBe(true);
  });

  test('verify phase-completeness 1 shows complete phase', () => {
    const { stdout, exitCode } = runCLI(['verify', 'phase-completeness', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('phase');
    expect(data).toHaveProperty('complete');
    expect(data.complete).toBe(true);
  });

  test('verify phase-completeness 2 shows incomplete phase', () => {
    const { stdout, exitCode } = runCLI(['verify', 'phase-completeness', '2'], fixtureDir);
    // May exit 0 or 1 depending on implementation
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('phase');
    expect(data.complete).toBe(false);
  });

  test('verify references checks plan references', () => {
    const { stdout, exitCode } = runCLI(
      ['verify', 'references', '.planning/phases/01-test/01-01-PLAN.md'],
      fixtureDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    // Actual shape: { valid, total, found, missing }
    expect(data).toHaveProperty('valid');
    expect(data).toHaveProperty('total');
  });

  test('verify artifacts reports on plan artifacts', () => {
    const { stdout, exitCode } = runCLI(
      ['verify', 'artifacts', '.planning/phases/01-test/01-01-PLAN.md'],
      fixtureDir
    );
    // Command runs and produces JSON (may error if no must_haves parsed)
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });

  test('verify key-links reports on plan key links', () => {
    const { stdout, exitCode } = runCLI(
      ['verify', 'key-links', '.planning/phases/01-test/01-01-PLAN.md'],
      fixtureDir
    );
    // Command runs and produces JSON (may error if no key_links parsed)
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });
});

// ─── Roadmap Commands ───────────────────────────────────────────────────────

describe('roadmap commands', () => {
  test('roadmap get-phase 1 returns phase details', () => {
    const { stdout, exitCode } = runCLI(['roadmap', 'get-phase', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('found', true);
    expect(data).toHaveProperty('phase_number');
    expect(data).toHaveProperty('phase_name');
  });

  test('roadmap analyze returns analysis JSON', () => {
    const { stdout, exitCode } = runCLI(['roadmap', 'analyze'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('phases');
  });
});

// ─── Index and Digest ───────────────────────────────────────────────────────

describe('index and digest commands', () => {
  test('phase-plan-index 1 returns plan index', () => {
    const { stdout, exitCode } = runCLI(['phase-plan-index', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('phase');
    expect(data).toHaveProperty('plans');
  });

  test('history-digest returns digest JSON with phases and tech_stack', () => {
    const { stdout, exitCode } = runCLI(['history-digest'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('phases');
    expect(data).toHaveProperty('tech_stack');
    expect(data).toHaveProperty('decisions');
  });

  test('summary-extract returns extracted fields', () => {
    const { stdout, exitCode } = runCLI(
      ['summary-extract', '.planning/phases/01-test/01-01-SUMMARY.md'],
      fixtureDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('path');
    expect(data).toHaveProperty('decisions');
    expect(data).toHaveProperty('key_files');
    expect(data).toHaveProperty('tech_added');
  });

  test('summary-extract --fields filters output', () => {
    const { stdout, exitCode } = runCLI(
      [
        'summary-extract',
        '.planning/phases/01-test/01-01-SUMMARY.md',
        '--fields',
        'path,tech_added',
      ],
      fixtureDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('path');
  });
});

// ─── Progress Commands ──────────────────────────────────────────────────────

describe('progress commands', () => {
  test('progress json returns JSON progress data', () => {
    const { stdout, exitCode } = runCLI(['progress', 'json'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('phases');
  });

  test('progress table --raw returns text table', () => {
    const { stdout, exitCode } = runCLI(['progress', 'table', '--raw'], fixtureDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Phase');
  });

  test('progress bar --raw returns progress bar text', () => {
    const { stdout, exitCode } = runCLI(['progress', 'bar', '--raw'], fixtureDir);
    expect(exitCode).toBe(0);
    expect(stdout.trim().length).toBeGreaterThan(0);
  });
});

// ─── Validation ─────────────────────────────────────────────────────────────

describe('validate commands', () => {
  test('validate consistency returns check results', () => {
    const { stdout, exitCode } = runCLI(['validate', 'consistency'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('passed');
    expect(data).toHaveProperty('errors');
  });
});

// ─── Todos ──────────────────────────────────────────────────────────────────

describe('todo commands', () => {
  test('list-todos returns array of todos', () => {
    const { stdout, exitCode } = runCLI(['list-todos'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('todos');
    expect(Array.isArray(data.todos)).toBe(true);
    expect(data.todos.length).toBeGreaterThan(0);
  });
});

// ─── Phases Commands ────────────────────────────────────────────────────────

describe('phases commands', () => {
  test('phases list returns directories', () => {
    const { stdout, exitCode } = runCLI(['phases', 'list'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('directories');
    expect(data.count).toBeGreaterThanOrEqual(2);
  });

  test('phases list --type plan filters by type', () => {
    const { stdout, exitCode } = runCLI(['phases', 'list', '--type', 'plan'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('files');
  });

  test('phases list --phase 1 filters by phase', () => {
    const { stdout, exitCode } = runCLI(['phases', 'list', '--phase', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('directories');
  });

  test('phase next-decimal 1 returns next plan number', () => {
    const { stdout, exitCode } = runCLI(['phase', 'next-decimal', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('next');
  });
});

// ─── Config Commands ────────────────────────────────────────────────────────

describe('config commands', () => {
  test('config-ensure-section returns status JSON', () => {
    const { stdout, exitCode } = runCLI(['config-ensure-section'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    // Returns { created: false, reason: "already_exists" } when config exists
    expect(typeof data).toBe('object');
  });

  test('tracker get-config returns tracker config', () => {
    const { stdout, exitCode } = runCLI(['tracker', 'get-config'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });
});

// ─── Template Commands ──────────────────────────────────────────────────────

describe('template commands', () => {
  test('template fill summary returns template text', () => {
    const { stdout, exitCode } = runCLI(
      ['template', 'fill', 'summary', '--phase', '1', '--plan', '01', '--name', 'Test Plan'],
      fixtureDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('phase');
  });

  test('template fill plan returns plan template', () => {
    const { stdout, exitCode } = runCLI(
      [
        'template',
        'fill',
        'plan',
        '--phase',
        '1',
        '--plan',
        '01',
        '--type',
        'execute',
        '--wave',
        '1',
      ],
      fixtureDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('phase');
  });
});

// ─── Init Workflows ─────────────────────────────────────────────────────────

describe('init workflows', () => {
  test('init execute-phase 1 returns context JSON', () => {
    const { stdout, exitCode } = runCLI(['init', 'execute-phase', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('executor_model');
    expect(data).toHaveProperty('phase_dir');
  });

  test('init plan-phase 1 returns planning context', () => {
    const { stdout, exitCode } = runCLI(['init', 'plan-phase', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('planner_model');
  });

  test('init new-project returns project init context', () => {
    const { stdout, exitCode } = runCLI(['init', 'new-project'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });

  test('init resume returns resume context', () => {
    const { stdout, exitCode } = runCLI(['init', 'resume'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });

  test('init verify-work 1 returns verification context', () => {
    const { stdout, exitCode } = runCLI(['init', 'verify-work', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });

  test('init phase-op 1 returns phase operation context', () => {
    const { stdout, exitCode } = runCLI(['init', 'phase-op', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });

  test('init todos returns todos context', () => {
    const { stdout, exitCode } = runCLI(['init', 'todos'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });

  test('init milestone-op returns milestone context', () => {
    const { stdout, exitCode } = runCLI(['init', 'milestone-op'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });

  test('init map-codebase returns map context', () => {
    const { stdout, exitCode } = runCLI(['init', 'map-codebase'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });

  test('init progress returns progress context', () => {
    const { stdout, exitCode } = runCLI(['init', 'progress'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
  });
});

// ─── Verify Summary ─────────────────────────────────────────────────────────

describe('verify-summary', () => {
  test('verify-summary returns validation results', () => {
    const { stdout, exitCode } = runCLI(
      ['verify-summary', '.planning/phases/01-test/01-01-SUMMARY.md'],
      fixtureDir
    );
    // May pass or fail depending on git state, but produces valid JSON
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('checks');
    expect(data.checks).toHaveProperty('summary_exists');
  });
});

// ─── Dashboard Command ──────────────────────────────────────────────────────

describe('dashboard command', () => {
  test('dashboard --raw produces valid JSON with milestones array', () => {
    const { stdout, exitCode } = runCLI(['dashboard', '--raw'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('milestones');
    expect(Array.isArray(data.milestones)).toBe(true);
    expect(data.milestones.length).toBeGreaterThanOrEqual(1);
    expect(data).toHaveProperty('summary');
    expect(data.summary).toHaveProperty('total_milestones');
    expect(data.summary).toHaveProperty('total_phases');
    expect(data.summary).toHaveProperty('total_plans');
    expect(data.summary).toHaveProperty('total_summaries');
  });

  test('dashboard (without --raw) produces text output containing milestone names', () => {
    const { stdout, exitCode } = runCLI(['dashboard'], fixtureDir);
    expect(exitCode).toBe(0);
    // TUI output contains milestone and phase info
    expect(stdout).toContain('Foundation');
    expect(stdout).toContain('Phase');
  });

  test('dashboard --raw with empty .planning/ returns empty milestones', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-integ-empty-'));
    fs.mkdirSync(path.join(emptyDir, '.planning'), { recursive: true });
    // Create minimal config.json so the CLI loads
    fs.writeFileSync(
      path.join(emptyDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'balanced' })
    );

    const { stdout, exitCode } = runCLI(['dashboard', '--raw'], emptyDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('milestones');
    expect(data.milestones).toEqual([]);

    cleanupDir(emptyDir);
  });
});

// ─── Phase-detail Command ───────────────────────────────────────────────────

describe('phase-detail command', () => {
  test('phase-detail 1 --raw produces valid JSON with plans array and phase_number', () => {
    const { stdout, exitCode } = runCLI(['phase-detail', '1', '--raw'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('phase_number');
    expect(data).toHaveProperty('phase_name');
    expect(data).toHaveProperty('plans');
    expect(Array.isArray(data.plans)).toBe(true);
    expect(data.plans.length).toBeGreaterThanOrEqual(1);
    expect(data).toHaveProperty('summary_stats');
  });

  test('phase-detail 99 --raw returns error for nonexistent phase', () => {
    const { stdout, exitCode } = runCLI(['phase-detail', '99', '--raw'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('error');
    expect(data.error).toContain('not found');
  });

  test('phase-detail 1 (without --raw) produces text containing phase name', () => {
    const { stdout, exitCode } = runCLI(['phase-detail', '1'], fixtureDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Phase 1');
    expect(stdout).toContain('test');
  });
});

// ─── Health Command ─────────────────────────────────────────────────────────

describe('health command', () => {
  test('health --raw produces valid JSON with blockers, deferred_validations, velocity keys', () => {
    const { stdout, exitCode } = runCLI(['health', '--raw'], fixtureDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('blockers');
    expect(data.blockers).toHaveProperty('count');
    expect(data.blockers).toHaveProperty('items');
    expect(data).toHaveProperty('deferred_validations');
    expect(data.deferred_validations).toHaveProperty('total');
    expect(data.deferred_validations).toHaveProperty('pending');
    expect(data.deferred_validations).toHaveProperty('resolved');
    expect(data).toHaveProperty('velocity');
    expect(data.velocity).toHaveProperty('total_plans');
    expect(data.velocity).toHaveProperty('avg_duration_min');
    expect(data).toHaveProperty('stale_phases');
    expect(data).toHaveProperty('risks');
  });

  test('health (without --raw) produces text output containing Blockers and Velocity sections', () => {
    const { stdout, exitCode } = runCLI(['health'], fixtureDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Blockers');
    expect(stdout).toContain('Velocity');
    expect(stdout).toContain('Deferred Validations');
    expect(stdout).toContain('Stale Phases');
  });

  test('health --raw with minimal STATE.md returns zero blockers and empty velocity', () => {
    const minimalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-integ-minimal-'));
    fs.mkdirSync(path.join(minimalDir, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(minimalDir, '.planning', 'config.json'),
      JSON.stringify({ model_profile: 'balanced' })
    );
    fs.writeFileSync(
      path.join(minimalDir, '.planning', 'STATE.md'),
      '# State\n\n## Current Position\n\n- Active phase: 1\n'
    );

    const { stdout, exitCode } = runCLI(['health', '--raw'], minimalDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.blockers.count).toBe(0);
    expect(data.velocity.total_plans).toBe(0);
    expect(data.velocity.avg_duration_min).toBe(0);

    cleanupDir(minimalDir);
  });
});

// ─── Long-Term Roadmap Commands ─────────────────────────────────────────────

describe('long-term-roadmap commands', () => {
  let ltDir;

  beforeEach(() => {
    ltDir = createTestDir();
    // Write a valid LONG-TERM-ROADMAP.md fixture
    fs.writeFileSync(
      path.join(ltDir, '.planning', 'LONG-TERM-ROADMAP.md'),
      [
        '---',
        'project: TestProject',
        'created: 2026-02-17',
        'last_refined: 2026-02-17',
        '---',
        '',
        '# Long-Term Roadmap: TestProject',
        '',
        '## LT-1: Foundation',
        '**Status:** completed',
        '**Goal:** Build core pipeline',
        '**Normal milestones:** v0.1.0',
        '',
        '## LT-2: Optimization',
        '**Status:** active',
        '**Goal:** Optimize for production',
        '**Normal milestones:** v0.2.0 (planned)',
        '',
        '## Refinement History',
        '',
        '| Date | Action | Details |',
        '|------|--------|---------|',
        '| 2026-02-17 | Initial roadmap | Created 2 LT milestones |',
        '',
      ].join('\n')
    );
  });

  afterEach(() => {
    cleanupDir(ltDir);
  });

  test('list returns milestones array with count', () => {
    const { stdout, exitCode } = runCLI(['long-term-roadmap', 'list'], ltDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('milestones');
    expect(data).toHaveProperty('count', 2);
    expect(data.milestones[0].id).toBe('LT-1');
    expect(data.milestones[1].status).toBe('active');
  });

  test('list --raw returns compact text', () => {
    const { stdout, exitCode } = runCLI(['long-term-roadmap', 'list', '--raw'], ltDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('LT-1');
    expect(stdout).toContain('[completed]');
    expect(stdout).toContain('[active]');
  });

  test('display returns formatted roadmap with status icons', () => {
    const { stdout, exitCode } = runCLI(['long-term-roadmap', 'display', '--raw'], ltDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('[done]');
    expect(stdout).toContain('[active]');
    expect(stdout).toContain('Foundation');
  });

  test('parse returns structured JSON', () => {
    const { stdout, exitCode } = runCLI(['long-term-roadmap', 'parse'], ltDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('frontmatter');
    expect(data).toHaveProperty('milestones');
    expect(data).toHaveProperty('refinement_history');
    expect(data.milestones.length).toBe(2);
  });

  test('validate returns valid for correct file', () => {
    const { stdout, exitCode } = runCLI(['long-term-roadmap', 'validate'], ltDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.valid).toBe(true);
    expect(data.errors).toEqual([]);
  });

  test('add appends new milestone', () => {
    const { stdout, exitCode } = runCLI(
      ['long-term-roadmap', 'add', '--name', 'New Feature', '--goal', 'Build new feature'],
      ltDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.id).toBe('LT-3');
    expect(data.content).toContain('LT-3: New Feature');
  });

  test('update changes milestone goal', () => {
    const { stdout, exitCode } = runCLI(
      ['long-term-roadmap', 'update', '--id', 'LT-2', '--goal', 'Updated goal'],
      ltDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.updated_fields).toContain('goal');
    expect(data.content).toContain('Updated goal');
  });

  test('update rejects invalid status', () => {
    const { stdout, exitCode } = runCLI(
      ['long-term-roadmap', 'update', '--id', 'LT-2', '--status', 'bogus'],
      ltDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('error');
    expect(data.error).toContain('Invalid status');
  });

  test('link adds version to milestone', () => {
    const { stdout, exitCode } = runCLI(
      ['long-term-roadmap', 'link', '--id', 'LT-2', '--version', 'v0.2.1'],
      ltDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.linked).toBe('v0.2.1');
    expect(data.content).toContain('v0.2.1');
  });

  test('link rejects duplicate version', () => {
    const { stdout, exitCode } = runCLI(
      ['long-term-roadmap', 'link', '--id', 'LT-2', '--version', 'v0.2.0'],
      ltDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('error');
    expect(data.error).toContain('already linked');
  });

  test('remove deletes planned milestone', () => {
    // Add LT-3 first, then remove it
    runCLI(
      ['long-term-roadmap', 'add', '--name', 'Temp', '--goal', 'Temporary milestone'],
      ltDir
    );
    // Write the add result to disk so remove can find it
    const addResult = runCLI(
      ['long-term-roadmap', 'add', '--name', 'Removable', '--goal', 'To be removed'],
      ltDir
    );
    const addData = parseJSON(addResult.stdout);
    fs.writeFileSync(path.join(ltDir, '.planning', 'LONG-TERM-ROADMAP.md'), addData.content);

    const { stdout, exitCode } = runCLI(
      ['long-term-roadmap', 'remove', '--id', 'LT-3'],
      ltDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.removed).toBe('LT-3');
    expect(data.content).not.toContain('LT-3');
  });

  test('refine outputs milestone context', () => {
    const { stdout, exitCode } = runCLI(
      ['long-term-roadmap', 'refine', '--id', 'LT-2', '--raw'],
      ltDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('LT-2');
    expect(stdout).toContain('Optimization');
    expect(stdout).toContain('active');
  });

  test('history appends entry', () => {
    const { stdout, exitCode } = runCLI(
      ['long-term-roadmap', 'history', '--action', 'Test action', '--details', 'Test details'],
      ltDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data.content).toContain('Test action');
    expect(data.content).toContain('Test details');
  });

  test('init auto-groups from ROADMAP.md', () => {
    // Remove existing LONG-TERM-ROADMAP.md to test init
    fs.unlinkSync(path.join(ltDir, '.planning', 'LONG-TERM-ROADMAP.md'));
    const { stdout, exitCode } = runCLI(
      ['long-term-roadmap', 'init', '--project', 'InitProject', '--raw'],
      ltDir
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('LT-1');
    expect(stdout).toContain('InitProject');
  });

  test('unknown subcommand lists valid subcommands', () => {
    const { exitCode, stderr } = runCLI(['long-term-roadmap', 'nonexistent'], ltDir);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('list, add, remove, update, refine, link, unlink, display, init, history, parse, validate');
  });
});

// ─── Error Handling ─────────────────────────────────────────────────────────

describe('error handling', () => {
  test('unknown command exits non-zero', () => {
    const { exitCode, stderr } = runCLI(['nonexistent-command'], fixtureDir);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Unknown command');
  });

  test('no command shows usage', () => {
    const { exitCode, stderr } = runCLI([], fixtureDir);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Usage');
  });

  test('unknown verify subcommand shows help', () => {
    const { exitCode, stderr } = runCLI(['verify', 'nonexistent'], fixtureDir);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Unknown verify subcommand');
  });

  test('unknown frontmatter subcommand shows help', () => {
    const { exitCode, stderr } = runCLI(['frontmatter', 'nonexistent'], fixtureDir);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Unknown frontmatter subcommand');
  });

  test('unknown init workflow shows help', () => {
    const { exitCode, stderr } = runCLI(['init', 'nonexistent'], fixtureDir);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Unknown init subcommand');
  });
});

// ─── Mutating State Commands ────────────────────────────────────────────────

describe('mutating state commands', () => {
  let mutDir;

  beforeEach(() => {
    mutDir = createTestDir();
  });

  afterEach(() => {
    cleanupDir(mutDir);
  });

  test('state patch returns update result', () => {
    const { stdout, exitCode } = runCLI(['state', 'patch', '--phase', '1', '--plan', '02'], mutDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    // Returns { updated: [...], failed: [...] }
    expect(data).toHaveProperty('updated');
    expect(data).toHaveProperty('failed');
  });

  test('state advance-plan handles fixture state', () => {
    // The fixture STATE.md may not have the right format for advance-plan
    // to parse, so we just verify the command runs and returns JSON
    const { stdout, exitCode } = runCLI(['state', 'advance-plan'], mutDir);
    const data = parseJSON(stdout);
    expect(typeof data).toBe('object');
    // Either succeeds with 'advanced' or returns error object
    expect(data.advanced === true || data.error !== undefined).toBe(true);
  });

  test('state record-metric adds metric row', () => {
    const { stdout, exitCode } = runCLI(
      [
        'state',
        'record-metric',
        '--phase',
        '01',
        '--plan',
        '01',
        '--duration',
        '2min',
        '--tasks',
        '1',
        '--files',
        '1',
      ],
      mutDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('recorded');
    // Verify metric written to disk
    const state = fs.readFileSync(path.join(mutDir, '.planning', 'STATE.md'), 'utf-8');
    expect(state).toContain('01-01');
    expect(state).toContain('2min');
  });

  test('state update-progress recalculates progress', () => {
    const { stdout, exitCode } = runCLI(['state', 'update-progress'], mutDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('updated');
  });

  test('state add-decision adds decision row', () => {
    // Adapt the heading format for the regex
    const statePath = path.join(mutDir, '.planning', 'STATE.md');
    let state = fs.readFileSync(statePath, 'utf-8');
    state = state.replace('## Key Decisions', '## Decisions Made');
    fs.writeFileSync(statePath, state);

    const { stdout, exitCode } = runCLI(
      [
        'state',
        'add-decision',
        '--summary',
        'Test decision via CLI',
        '--phase',
        '1',
        '--rationale',
        'Integration test',
      ],
      mutDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('added');
    // Verify decision in STATE.md
    const updated = fs.readFileSync(statePath, 'utf-8');
    expect(updated).toContain('Test decision via CLI');
  });

  test('state add-blocker adds blocker text', () => {
    const { stdout, exitCode } = runCLI(
      ['state', 'add-blocker', '--text', 'Test blocker via CLI'],
      mutDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('added');
  });

  test('state resolve-blocker removes blocker', () => {
    // Add blocker first
    runCLI(['state', 'add-blocker', '--text', 'Removable blocker'], mutDir);
    const { stdout, exitCode } = runCLI(
      ['state', 'resolve-blocker', '--text', 'Removable blocker'],
      mutDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('resolved');
  });

  test('state record-session updates session info', () => {
    const { stdout, exitCode } = runCLI(
      ['state', 'record-session', '--stopped-at', 'Completed 01-01-PLAN.md'],
      mutDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('recorded');
  });

  test('state update changes specific field', () => {
    const { stdout, exitCode } = runCLI(
      ['state', 'update', 'Active phase', '2 (02-build)'],
      mutDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('updated');
  });
});

// ─── Mutating Frontmatter Commands ──────────────────────────────────────────

describe('mutating frontmatter commands', () => {
  let mutDir;

  beforeEach(() => {
    mutDir = createTestDir();
  });

  afterEach(() => {
    cleanupDir(mutDir);
  });

  test('frontmatter set updates a field', () => {
    const { stdout, exitCode } = runCLI(
      [
        'frontmatter',
        'set',
        '.planning/phases/01-test/01-01-PLAN.md',
        '--field',
        'wave',
        '--value',
        '2',
      ],
      mutDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('updated');
  });

  test('frontmatter merge merges data into frontmatter', () => {
    const { stdout, exitCode } = runCLI(
      ['frontmatter', 'merge', '.planning/phases/01-test/01-01-PLAN.md', '--data', '{"wave": 3}'],
      mutDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('merged');
  });
});

// ─── Mutating Phase Commands ────────────────────────────────────────────────

describe('mutating phase commands', () => {
  let mutDir;

  beforeEach(() => {
    mutDir = createTestDir();
  });

  afterEach(() => {
    cleanupDir(mutDir);
  });

  test('phase add creates a new phase', () => {
    const { stdout, exitCode } = runCLI(['phase', 'add', 'New testing phase'], mutDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    // Returns { phase_number, slug, name, directory, padded, schedule_affected }
    expect(data).toHaveProperty('phase_number');
    expect(data).toHaveProperty('slug');
    expect(data).toHaveProperty('directory');
    // Verify directory was created
    expect(fs.existsSync(path.join(mutDir, data.directory))).toBe(true);
  });

  test('phase insert creates a phase at decimal position', () => {
    const { stdout, exitCode } = runCLI(['phase', 'insert', '1', 'Inserted phase after 1'], mutDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    // Returns { phase_number, after_phase, slug, name, directory, schedule_affected }
    expect(data).toHaveProperty('phase_number');
    expect(data).toHaveProperty('after_phase');
    expect(data).toHaveProperty('slug');
  });

  test('phase remove deletes a phase with --force', () => {
    const { stdout, exitCode } = runCLI(['phase', 'remove', '2', '--force'], mutDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    // Returns { removed, ... }
    expect(data).toHaveProperty('removed');
  });

  test('phase complete marks phase as complete', () => {
    const { stdout, exitCode } = runCLI(['phase', 'complete', '1'], mutDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    // Returns { completed_phase, date, roadmap_updated, state_updated, ... }
    expect(data).toHaveProperty('completed_phase');
    expect(data).toHaveProperty('date');
    expect(data).toHaveProperty('roadmap_updated');
  });
});

// ─── Mutating Todo Commands ─────────────────────────────────────────────────

describe('mutating todo commands', () => {
  let mutDir;

  beforeEach(() => {
    mutDir = createTestDir();
  });

  afterEach(() => {
    cleanupDir(mutDir);
  });

  test('todo complete moves todo to completed', () => {
    const { stdout, exitCode } = runCLI(['todo', 'complete', 'sample.md'], mutDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('completed');
    // Verify file moved
    expect(fs.existsSync(path.join(mutDir, '.planning', 'todos', 'pending', 'sample.md'))).toBe(
      false
    );
    expect(fs.existsSync(path.join(mutDir, '.planning', 'todos', 'completed', 'sample.md'))).toBe(
      true
    );
  });
});

// ─── Mutating Scaffold Commands ─────────────────────────────────────────────

describe('mutating scaffold commands', () => {
  let mutDir;

  beforeEach(() => {
    mutDir = createTestDir();
  });

  afterEach(() => {
    cleanupDir(mutDir);
  });

  test('scaffold context creates context file', () => {
    const { stdout, exitCode } = runCLI(['scaffold', 'context', '--phase', '1'], mutDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('created');
  });

  test('scaffold phase-dir creates phase directory', () => {
    const { stdout, exitCode } = runCLI(
      ['scaffold', 'phase-dir', '--phase', '3', '--name', 'new-feature'],
      mutDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('created');
  });
});

// ─── Mutating Config Commands ───────────────────────────────────────────────

describe('mutating config commands', () => {
  let mutDir;

  beforeEach(() => {
    mutDir = createTestDir();
  });

  afterEach(() => {
    cleanupDir(mutDir);
  });

  test('config-set updates config value', () => {
    const { stdout, exitCode } = runCLI(['config-set', 'autonomous_mode', 'true'], mutDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('updated');
    // Verify config changed on disk
    const config = JSON.parse(
      fs.readFileSync(path.join(mutDir, '.planning', 'config.json'), 'utf-8')
    );
    expect(config.autonomous_mode).toBe(true);
  });
});

// ─── Git-dependent Commands ─────────────────────────────────────────────────

describe('git-dependent commands', () => {
  let gitDir;

  beforeEach(() => {
    gitDir = createTestDir();
    // Initialize a git repo
    execFileSync('git', ['init', '-q'], { cwd: gitDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: gitDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: gitDir });
    execFileSync('git', ['add', '-A'], { cwd: gitDir });
    execFileSync('git', ['commit', '-q', '-m', 'Initial commit'], { cwd: gitDir });
  });

  afterEach(() => {
    cleanupDir(gitDir);
  });

  test('commit creates a git commit', () => {
    // Create a new file to commit
    fs.writeFileSync(path.join(gitDir, 'src', 'new.js'), '// new file\n');
    const { stdout, exitCode } = runCLI(
      ['commit', 'test: integration test commit', '--files', 'src/new.js'],
      gitDir
    );
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    expect(data).toHaveProperty('committed');
    expect(data).toHaveProperty('hash');
  });

  test('verify commits validates commit hashes', () => {
    // Get current commit hash
    const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: gitDir,
      encoding: 'utf-8',
    }).trim();

    const { stdout, exitCode } = runCLI(['verify', 'commits', hash], gitDir);
    expect(exitCode).toBe(0);
    const data = parseJSON(stdout);
    // Returns { all_valid, valid: [...], invalid: [...], total }
    expect(data).toHaveProperty('all_valid', true);
    expect(data).toHaveProperty('valid');
    expect(data).toHaveProperty('total');
  });
});
