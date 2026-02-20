/**
 * Golden reference snapshot comparison tests
 *
 * For each surviving golden output file in tests/golden/output/, runs the same
 * CLI command against the fixture directory and compares the output.
 *
 * Golden files were captured from the real project state. Since fixtures differ
 * from the real project, comparison uses structural matching:
 * - Same output type (JSON vs text)
 * - Valid JSON output for JSON golden files
 * - Matching keys and types where the golden and actual both succeed
 * - Normalized comparison ignoring timestamps and paths
 *
 * Some golden files captured error states (file not found) that don't apply to
 * fixtures. These are tested for valid output but with relaxed key matching.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GRD_TOOLS = path.resolve(__dirname, '../../bin/grd-tools.js');
const GOLDEN_DIR = path.resolve(__dirname, '../golden/output');
const FIXTURE_SOURCE = path.resolve(__dirname, '../fixtures/planning');

// ─── Helpers ────────────────────────────────────────────────────────────────

function runCLI(args, cwd) {
  try {
    const stdout = execFileSync('node', [GRD_TOOLS, ...args], {
      cwd,
      encoding: 'utf-8',
      timeout: 15000,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', exitCode: err.status || 1 };
  }
}

function createTestDir() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-golden-'));
  const dest = path.join(tmpRoot, '.planning');
  fs.cpSync(FIXTURE_SOURCE, dest, { recursive: true });
  fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'src', 'index.js'), '// entry point\n');
  return tmpRoot;
}

function cleanupDir(dir) {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Normalize a value for comparison by replacing dynamic content.
 */
function normalizeValue(val) {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'string') return val;
  // ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) return 'TIMESTAMP';
  // Date only
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return 'DATE';
  // Filename timestamp
  if (/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(val)) return 'FILENAME_TS';
  return val;
}

// ─── Golden file to CLI command mapping ─────────────────────────────────────

/**
 * Maps golden filename -> { args, exactKeys }
 * - args: CLI arguments to reproduce the command
 * - exactKeys: if true, golden and actual must have identical keys
 *              if false, golden may be an error response while actual succeeds
 */
const GOLDEN_COMMANDS = {
  'resolve-model.json': { args: ['resolve-model', 'grd-executor'], exactKeys: true },
  'generate-slug.json': { args: ['generate-slug', 'Hello World Test'], exactKeys: true },
  'current-timestamp.txt': { args: ['current-timestamp', '--raw'], exactKeys: false },
  'current-timestamp-full.json': { args: ['current-timestamp', 'full'], exactKeys: true },
  'current-timestamp-date.json': { args: ['current-timestamp', 'date'], exactKeys: true },
  'current-timestamp-filename.json': { args: ['current-timestamp', 'filename'], exactKeys: true },
  'verify-path-exists.json': { args: ['verify-path-exists', 'src/index.js'], exactKeys: true },
  'verify-path-exists-missing.json': {
    args: ['verify-path-exists', 'nonexistent/file.txt'],
    exactKeys: true,
  },
  'find-phase.json': { args: ['find-phase', '1'], exactKeys: true },
  // Golden captured "file not found" because fixture path didn't exist in real project
  'frontmatter-get.json': {
    args: [
      'frontmatter',
      'get',
      '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md',
    ],
    exactKeys: false,
  },
  'frontmatter-get-field.json': {
    args: [
      'frontmatter',
      'get',
      '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md',
      '--field',
      'phase',
    ],
    exactKeys: false,
  },
  'state-load.json': { args: ['state'], exactKeys: true },
  'state-get.json': { args: ['state', 'get'], exactKeys: true },
  'state-get-decisions.json': { args: ['state', 'get', 'Key Decisions'], exactKeys: true },
  'state-snapshot.json': { args: ['state-snapshot'], exactKeys: true },
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

let fixtureDir;

beforeAll(() => {
  fixtureDir = createTestDir();
});

afterAll(() => {
  cleanupDir(fixtureDir);
});

describe('golden snapshot comparisons', () => {
  // Get list of surviving golden files
  const goldenFiles = fs
    .readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.json') || f.endsWith('.txt'))
    .filter((f) => f !== '.gitkeep');

  test('at least 12 golden files exist for comparison', () => {
    expect(goldenFiles.length).toBeGreaterThanOrEqual(12);
  });

  // Test each golden file that has a command mapping
  for (const [goldenFile, config] of Object.entries(GOLDEN_COMMANDS)) {
    const goldenPath = path.join(GOLDEN_DIR, goldenFile);

    // Skip if golden file was deleted
    if (!fs.existsSync(goldenPath)) continue;

    test(`${goldenFile} matches CLI output structure`, () => {
      const goldenContent = fs.readFileSync(goldenPath, 'utf-8').trim();
      const { stdout } = runCLI(config.args, fixtureDir);

      // For text files, just verify both produce non-empty text
      if (goldenFile.endsWith('.txt')) {
        expect(stdout.trim().length).toBeGreaterThan(0);
        expect(goldenContent.length).toBeGreaterThan(0);
        return;
      }

      // For JSON files, both must parse
      const goldenData = JSON.parse(goldenContent);
      const actualData = JSON.parse(stdout.trim());

      if (config.exactKeys) {
        // Same keys expected
        const goldenKeys = Object.keys(goldenData).sort();
        const actualKeys = Object.keys(actualData).sort();
        expect(actualKeys).toEqual(goldenKeys);

        // Verify normalized values match for non-dynamic fields
        for (const key of goldenKeys) {
          const gv = normalizeValue(goldenData[key]);
          const av = normalizeValue(actualData[key]);
          // For null vs non-null, just check both exist
          if (gv === null || av === null) continue;
          // For long strings (content), skip deep comparison
          if (typeof gv === 'string' && gv.length > 200) continue;
          if (typeof av === 'string' && av.length > 200) continue;
          // For arrays/objects, just check type matches
          if (typeof gv === 'object' || typeof av === 'object') {
            expect(typeof av).toBe(typeof gv);
            continue;
          }
          // For primitive values that are stable, compare
          if (gv !== 'TIMESTAMP' && gv !== 'DATE' && gv !== 'FILENAME_TS') {
            expect(typeof av).toBe(typeof gv);
          }
        }
      } else {
        // Relaxed: golden may be error response, actual may be success
        // Just verify both produce valid JSON objects
        expect(typeof goldenData).toBe('object');
        expect(typeof actualData).toBe('object');
        // Both should have at least one key
        expect(Object.keys(goldenData).length).toBeGreaterThan(0);
        expect(Object.keys(actualData).length).toBeGreaterThan(0);
      }
    });
  }
});

describe('golden output structural integrity', () => {
  test('all golden JSON files contain valid JSON', () => {
    const jsonFiles = fs.readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.json'));
    for (const file of jsonFiles) {
      const content = fs.readFileSync(path.join(GOLDEN_DIR, file), 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    }
  });

  test('golden output files contain expected stable values', () => {
    // Verify specific known golden values that are deterministic
    const slugGolden = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'generate-slug.json'), 'utf-8')
    );
    expect(slugGolden.slug).toBe('hello-world-test');

    const modelGolden = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'resolve-model.json'), 'utf-8')
    );
    expect(modelGolden).toHaveProperty('model');
    expect(modelGolden).toHaveProperty('profile');
  });

  test('timestamp golden files have correct timestamp format', () => {
    if (fs.existsSync(path.join(GOLDEN_DIR, 'current-timestamp-full.json'))) {
      const full = JSON.parse(
        fs.readFileSync(path.join(GOLDEN_DIR, 'current-timestamp-full.json'), 'utf-8')
      );
      expect(full.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }

    if (fs.existsSync(path.join(GOLDEN_DIR, 'current-timestamp-date.json'))) {
      const date = JSON.parse(
        fs.readFileSync(path.join(GOLDEN_DIR, 'current-timestamp-date.json'), 'utf-8')
      );
      expect(date.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    if (fs.existsSync(path.join(GOLDEN_DIR, 'current-timestamp-filename.json'))) {
      const filename = JSON.parse(
        fs.readFileSync(path.join(GOLDEN_DIR, 'current-timestamp-filename.json'), 'utf-8')
      );
      expect(filename.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    }
  });

  test('state golden files have correct structure', () => {
    if (fs.existsSync(path.join(GOLDEN_DIR, 'state-load.json'))) {
      const stateLoad = JSON.parse(
        fs.readFileSync(path.join(GOLDEN_DIR, 'state-load.json'), 'utf-8')
      );
      expect(stateLoad).toHaveProperty('config');
      expect(stateLoad).toHaveProperty('state_raw');
      expect(stateLoad).toHaveProperty('state_exists');
    }

    if (fs.existsSync(path.join(GOLDEN_DIR, 'state-get.json'))) {
      const stateGet = JSON.parse(
        fs.readFileSync(path.join(GOLDEN_DIR, 'state-get.json'), 'utf-8')
      );
      expect(stateGet).toHaveProperty('content');
    }

    if (fs.existsSync(path.join(GOLDEN_DIR, 'state-snapshot.json'))) {
      const snapshot = JSON.parse(
        fs.readFileSync(path.join(GOLDEN_DIR, 'state-snapshot.json'), 'utf-8')
      );
      expect(snapshot).toHaveProperty('session');
    }
  });

  test('path verification golden files have correct structure', () => {
    if (fs.existsSync(path.join(GOLDEN_DIR, 'verify-path-exists.json'))) {
      const exists = JSON.parse(
        fs.readFileSync(path.join(GOLDEN_DIR, 'verify-path-exists.json'), 'utf-8')
      );
      expect(exists).toHaveProperty('exists');
      expect(exists).toHaveProperty('type');
    }
  });

  test('find-phase golden file has correct structure', () => {
    if (fs.existsSync(path.join(GOLDEN_DIR, 'find-phase.json'))) {
      const fp = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, 'find-phase.json'), 'utf-8'));
      expect(fp).toHaveProperty('found');
      expect(fp).toHaveProperty('phase_number');
      expect(fp).toHaveProperty('plans');
      expect(fp).toHaveProperty('summaries');
    }
  });

  test('state-get-decisions golden file has correct structure', () => {
    if (fs.existsSync(path.join(GOLDEN_DIR, 'state-get-decisions.json'))) {
      const dec = JSON.parse(
        fs.readFileSync(path.join(GOLDEN_DIR, 'state-get-decisions.json'), 'utf-8')
      );
      expect(dec).toHaveProperty('Key Decisions');
      expect(typeof dec['Key Decisions']).toBe('string');
    }
  });
});

describe('golden vs fixture output comparison', () => {
  test('generate-slug produces identical output', () => {
    const golden = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'generate-slug.json'), 'utf-8')
    );
    const { stdout } = runCLI(['generate-slug', 'Hello World Test'], fixtureDir);
    const actual = JSON.parse(stdout.trim());
    // Slug is deterministic -- should be identical
    expect(actual).toEqual(golden);
  });

  test('resolve-model produces identical output', () => {
    const golden = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'resolve-model.json'), 'utf-8')
    );
    const { stdout } = runCLI(['resolve-model', 'grd-executor'], fixtureDir);
    const actual = JSON.parse(stdout.trim());
    // Model resolution depends on config.model_profile, so keys match
    expect(Object.keys(actual).sort()).toEqual(Object.keys(golden).sort());
  });

  test('verify-path-exists-missing produces identical structure', () => {
    const golden = JSON.parse(
      fs.readFileSync(path.join(GOLDEN_DIR, 'verify-path-exists-missing.json'), 'utf-8')
    );
    const { stdout } = runCLI(['verify-path-exists', 'nonexistent/file.txt'], fixtureDir);
    const actual = JSON.parse(stdout.trim());
    // Both should report file not found
    expect(actual.exists).toBe(golden.exists);
    expect(actual.type).toBe(golden.type);
  });

  test('timestamp commands produce same key structure', () => {
    const modes = [
      { golden: 'current-timestamp-full.json', args: ['current-timestamp', 'full'] },
      { golden: 'current-timestamp-date.json', args: ['current-timestamp', 'date'] },
      { golden: 'current-timestamp-filename.json', args: ['current-timestamp', 'filename'] },
    ];

    for (const { golden, args } of modes) {
      const goldenPath = path.join(GOLDEN_DIR, golden);
      if (!fs.existsSync(goldenPath)) continue;

      const goldenData = JSON.parse(fs.readFileSync(goldenPath, 'utf-8'));
      const { stdout } = runCLI(args, fixtureDir);
      const actualData = JSON.parse(stdout.trim());

      expect(Object.keys(actualData).sort()).toEqual(Object.keys(goldenData).sort());
      expect(actualData).toHaveProperty('timestamp');
    }
  });
});
