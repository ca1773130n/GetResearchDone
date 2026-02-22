/**
 * Unit tests for lib/cleanup.js
 *
 * Tests config schema handling and quality analysis functions:
 * getCleanupConfig, analyzeComplexity, analyzeDeadExports, analyzeFileSize, runQualityAnalysis.
 * Also tests doc drift detection: analyzeChangelogDrift, analyzeReadmeLinks, analyzeJsdocDrift.
 * Also tests expanded drift detection: analyzeTestCoverageGaps, analyzeExportConsistency,
 * analyzeDocStaleness, analyzeConfigSchemaDrift.
 * Also tests generateCleanupPlan for auto-generating cleanup PLAN.md files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  getCleanupConfig,
  analyzeComplexity,
  analyzeDeadExports,
  analyzeFileSize,
  runQualityAnalysis,
  analyzeChangelogDrift,
  analyzeReadmeLinks,
  analyzeJsdocDrift,
  analyzeTestCoverageGaps,
  analyzeExportConsistency,
  analyzeDocStaleness,
  analyzeConfigSchemaDrift,
  generateCleanupPlan,
} = require('../../lib/cleanup');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a minimal temp directory (without full .planning fixture copy)
 * for tests that need custom config setups.
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-cleanup-test-'));
}

function removeTempDir(dir) {
  if (!dir || !dir.startsWith(os.tmpdir())) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeConfig(dir, configObj) {
  const planningDir = path.join(dir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(path.join(planningDir, 'config.json'), JSON.stringify(configObj, null, 2));
}

function writeFile(dir, relPath, content) {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

// ─── getCleanupConfig ─────────────────────────────────────────────────────────

describe('getCleanupConfig', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  const FULL_DEFAULTS = {
    enabled: false,
    refactoring: false,
    doc_sync: false,
    test_coverage: false,
    export_consistency: false,
    doc_staleness: false,
    config_schema: false,
    cleanup_threshold: 5,
  };

  test('returns defaults when config.json has no phase_cleanup section', () => {
    writeConfig(tmpDir, {});
    const result = getCleanupConfig(tmpDir);
    expect(result).toEqual(FULL_DEFAULTS);
  });

  test('returns user values when phase_cleanup section exists', () => {
    writeConfig(tmpDir, {
      phase_cleanup: { enabled: true, refactoring: true, doc_sync: false },
    });
    const result = getCleanupConfig(tmpDir);
    expect(result).toEqual({ ...FULL_DEFAULTS, enabled: true, refactoring: true, doc_sync: false });
  });

  test('merges defaults for missing fields', () => {
    writeConfig(tmpDir, {
      phase_cleanup: { enabled: true },
    });
    const result = getCleanupConfig(tmpDir);
    expect(result).toEqual({ ...FULL_DEFAULTS, enabled: true });
  });

  test('returns defaults when config.json does not exist', () => {
    // tmpDir has no .planning/config.json
    const result = getCleanupConfig(tmpDir);
    expect(result).toEqual(FULL_DEFAULTS);
  });

  test('returns defaults when config.json is invalid JSON', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not valid json {{{');
    const result = getCleanupConfig(tmpDir);
    expect(result).toEqual(FULL_DEFAULTS);
  });
});

// ─── analyzeComplexity ────────────────────────────────────────────────────────

describe('analyzeComplexity', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns empty array for simple functions', () => {
    const filePath = writeFile(tmpDir, 'simple.js', 'function add(a, b) { return a + b; }\n');
    const result = analyzeComplexity(tmpDir, ['simple.js']);
    expect(result).toEqual([]);
  });

  test('detects high complexity functions', () => {
    // Build a function with many branches (complexity > 10)
    let code = 'function complexFunc(x) {\n';
    for (let i = 0; i < 12; i++) {
      code += `  if (x === ${i}) return ${i};\n`;
    }
    code += '  return -1;\n}\n';
    writeFile(tmpDir, 'complex.js', code);

    const result = analyzeComplexity(tmpDir, ['complex.js']);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toMatchObject({
      file: 'complex.js',
      functionName: expect.any(String),
      complexity: expect.any(Number),
    });
    expect(result[0].complexity).toBeGreaterThan(10);
  });

  test('returns empty array when no files provided', () => {
    const result = analyzeComplexity(tmpDir, []);
    expect(result).toEqual([]);
  });

  test('handles non-existent files gracefully', () => {
    const result = analyzeComplexity(tmpDir, ['does-not-exist.js']);
    expect(result).toEqual([]);
  });

  test('custom threshold via options', () => {
    // Function with complexity ~6 (5 branches + 1 base)
    let code = 'function mediumFunc(x) {\n';
    for (let i = 0; i < 5; i++) {
      code += `  if (x === ${i}) return ${i};\n`;
    }
    code += '  return -1;\n}\n';
    writeFile(tmpDir, 'medium.js', code);

    const result = analyzeComplexity(tmpDir, ['medium.js'], { threshold: 3 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].complexity).toBeGreaterThan(3);
  });
});

// ─── analyzeDeadExports ───────────────────────────────────────────────────────

describe('analyzeDeadExports', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns empty array when all exports are imported', () => {
    writeFile(
      tmpDir,
      'lib.js',
      'function funcA() {}\nfunction funcB() {}\nmodule.exports = { funcA, funcB };\n'
    );
    writeFile(
      tmpDir,
      'consumer.js',
      "const { funcA, funcB } = require('./lib');\nfuncA(); funcB();\n"
    );
    const result = analyzeDeadExports(tmpDir, ['lib.js']);
    expect(result).toEqual([]);
  });

  test('detects unused exports', () => {
    writeFile(
      tmpDir,
      'lib.js',
      'function funcA() {}\nfunction funcB() {}\nfunction funcC() {}\nmodule.exports = { funcA, funcB, funcC };\n'
    );
    writeFile(tmpDir, 'consumer.js', "const { funcA } = require('./lib');\nfuncA();\n");
    const result = analyzeDeadExports(tmpDir, ['lib.js']);
    expect(result.length).toBe(2);
    const names = result.map((r) => r.exportName).sort();
    expect(names).toEqual(['funcB', 'funcC']);
  });

  test('handles module.exports = { ... } pattern', () => {
    writeFile(tmpDir, 'mod.js', 'const x = 1;\nconst y = 2;\nmodule.exports = { x, y };\n');
    writeFile(tmpDir, 'user.js', "const { x } = require('./mod');\nconsole.log(x);\n");
    const result = analyzeDeadExports(tmpDir, ['mod.js']);
    expect(result.length).toBe(1);
    expect(result[0].exportName).toBe('y');
  });

  test('returns empty array for empty file list', () => {
    const result = analyzeDeadExports(tmpDir, []);
    expect(result).toEqual([]);
  });

  test('ignores test files as consumers when excludePatterns set', () => {
    writeFile(tmpDir, 'lib.js', 'function funcA() {}\nmodule.exports = { funcA };\n');
    writeFile(tmpDir, 'tests/consumer.test.js', "const { funcA } = require('../lib');\nfuncA();\n");
    // With exclude pattern, test file should not count as consumer
    const result = analyzeDeadExports(tmpDir, ['lib.js'], { excludePatterns: ['tests/'] });
    expect(result.length).toBe(1);
    expect(result[0].exportName).toBe('funcA');
  });
});

// ─── analyzeFileSize ──────────────────────────────────────────────────────────

describe('analyzeFileSize', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns empty array when files are under threshold', () => {
    const lines = Array(50).fill('// line').join('\n') + '\n';
    writeFile(tmpDir, 'small.js', lines);
    const result = analyzeFileSize(tmpDir, ['small.js'], { maxLines: 300 });
    expect(result).toEqual([]);
  });

  test('detects oversized files', () => {
    const lines = Array(400).fill('// line').join('\n') + '\n';
    writeFile(tmpDir, 'big.js', lines);
    const result = analyzeFileSize(tmpDir, ['big.js'], { maxLines: 300 });
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({
      file: 'big.js',
      lines: 400,
      threshold: 300,
    });
  });

  test('uses default threshold when not specified', () => {
    // 499 lines = under default 500
    const lines = Array(499).fill('// line').join('\n') + '\n';
    writeFile(tmpDir, 'borderline.js', lines);
    const result = analyzeFileSize(tmpDir, ['borderline.js']);
    expect(result).toEqual([]);

    // 501 lines = over default 500
    const bigLines = Array(501).fill('// line').join('\n') + '\n';
    writeFile(tmpDir, 'over.js', bigLines);
    const result2 = analyzeFileSize(tmpDir, ['over.js']);
    expect(result2.length).toBe(1);
    expect(result2[0].threshold).toBe(500);
  });

  test('handles non-existent files gracefully', () => {
    const result = analyzeFileSize(tmpDir, ['missing.js'], { maxLines: 100 });
    expect(result).toEqual([]);
  });
});

// ─── runQualityAnalysis ───────────────────────────────────────────────────────

describe('runQualityAnalysis', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns skipped when phase_cleanup not enabled', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: false } });
    const result = runQualityAnalysis(tmpDir, '13');
    expect(result).toEqual({ skipped: true, reason: 'phase_cleanup not enabled' });
  });

  test('returns skipped when phase_cleanup section missing', () => {
    writeConfig(tmpDir, {});
    const result = runQualityAnalysis(tmpDir, '13');
    expect(result).toEqual({ skipped: true, reason: 'phase_cleanup not enabled' });
  });

  test('returns structured report when enabled with no issues', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    // Create a simple well-structured source file in lib/
    writeFile(
      tmpDir,
      'lib/clean.js',
      'function hello() { return 1; }\nmodule.exports = { hello };\n'
    );
    writeFile(tmpDir, 'app.js', "const { hello } = require('./lib/clean');\nhello();\n");

    const result = runQualityAnalysis(tmpDir, '13');
    expect(result.skipped).toBeUndefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.total_issues).toBe(0);
    expect(result.details).toBeDefined();
    expect(result.details.complexity).toEqual([]);
    expect(result.details.dead_exports).toEqual([]);
    expect(result.details.file_size).toEqual([]);
  });

  test('includes phase number in report', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    writeFile(tmpDir, 'lib/mod.js', 'module.exports = {};\n');
    const result = runQualityAnalysis(tmpDir, '13');
    expect(result.phase).toBe('13');
  });

  test('returns report with issues when problems found', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    // Create an oversized file
    const bigContent = Array(501).fill('// line').join('\n') + '\nmodule.exports = {};\n';
    writeFile(tmpDir, 'lib/big.js', bigContent);

    const result = runQualityAnalysis(tmpDir, '13');
    expect(result.summary.total_issues).toBeGreaterThan(0);
    expect(result.details.file_size.length).toBeGreaterThan(0);
  });

  test('includes timestamp in report', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    writeFile(tmpDir, 'lib/mod.js', 'module.exports = {};\n');
    const result = runQualityAnalysis(tmpDir, '13');
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── analyzeChangelogDrift ──────────────────────────────────────────────────

describe('analyzeChangelogDrift', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns stale warning when CHANGELOG.md mtime is older than newest SUMMARY.md', () => {
    // Create CHANGELOG.md with old timestamp
    writeFile(tmpDir, 'CHANGELOG.md', '# Changelog\n');
    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    const oldTime = new Date('2025-01-01T00:00:00Z');
    fs.utimesSync(changelogPath, oldTime, oldTime);

    // Create a SUMMARY.md with newer timestamp
    const summaryPath = writeFile(
      tmpDir,
      '.planning/milestones/anonymous/phases/01-init/01-01-SUMMARY.md',
      '# Summary\n'
    );
    const newTime = new Date('2025-06-01T00:00:00Z');
    fs.utimesSync(summaryPath, newTime, newTime);

    const result = analyzeChangelogDrift(tmpDir);
    expect(result.length).toBe(1);
    expect(result[0].file).toBe('CHANGELOG.md');
    expect(result[0].reason).toMatch(/not updated/i);
    expect(result[0].last_modified).toBeDefined();
    expect(result[0].latest_summary).toBeDefined();
  });

  test('returns empty array when CHANGELOG.md was modified after latest SUMMARY.md', () => {
    // Create SUMMARY.md with old timestamp
    const summaryPath = writeFile(
      tmpDir,
      '.planning/milestones/anonymous/phases/01-init/01-01-SUMMARY.md',
      '# Summary\n'
    );
    const oldTime = new Date('2025-01-01T00:00:00Z');
    fs.utimesSync(summaryPath, oldTime, oldTime);

    // Create CHANGELOG.md with newer timestamp
    writeFile(tmpDir, 'CHANGELOG.md', '# Changelog\n');
    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    const newTime = new Date('2025-06-01T00:00:00Z');
    fs.utimesSync(changelogPath, newTime, newTime);

    const result = analyzeChangelogDrift(tmpDir);
    expect(result).toEqual([]);
  });

  test('returns empty array when no CHANGELOG.md exists', () => {
    // No CHANGELOG.md in tmpDir
    const result = analyzeChangelogDrift(tmpDir);
    expect(result).toEqual([]);
  });

  test('returns empty array when no SUMMARY.md files exist', () => {
    writeFile(tmpDir, 'CHANGELOG.md', '# Changelog\n');
    // No .planning/phases/ directory or SUMMARY.md files
    const result = analyzeChangelogDrift(tmpDir);
    expect(result).toEqual([]);
  });
});

// ─── analyzeReadmeLinks ─────────────────────────────────────────────────────

describe('analyzeReadmeLinks', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('detects broken internal file link in README.md', () => {
    writeFile(
      tmpDir,
      'README.md',
      '# Project\n\nSee [docs](path/to/nonexistent.md) for details.\n'
    );

    const result = analyzeReadmeLinks(tmpDir);
    expect(result.length).toBe(1);
    expect(result[0].file).toBe('README.md');
    expect(result[0].link).toBe('path/to/nonexistent.md');
    expect(result[0].line).toBeDefined();
  });

  test('ignores external links (http://, https://)', () => {
    writeFile(
      tmpDir,
      'README.md',
      '# Project\n\n[Site](https://example.com) and [Other](http://other.com)\n'
    );

    const result = analyzeReadmeLinks(tmpDir);
    expect(result).toEqual([]);
  });

  test('returns empty array when all internal links resolve to existing files', () => {
    writeFile(tmpDir, 'docs/guide.md', '# Guide\n');
    writeFile(tmpDir, 'README.md', '# Project\n\nSee [guide](docs/guide.md) for help.\n');

    const result = analyzeReadmeLinks(tmpDir);
    expect(result).toEqual([]);
  });

  test('returns empty array when no README.md exists', () => {
    const result = analyzeReadmeLinks(tmpDir);
    expect(result).toEqual([]);
  });

  test('detects broken links in both [text](path) and [text](path "title") formats', () => {
    writeFile(
      tmpDir,
      'README.md',
      '# Project\n\n[A](missing-a.md) and [B](missing-b.md "some title")\n'
    );

    const result = analyzeReadmeLinks(tmpDir);
    expect(result.length).toBe(2);
    const links = result.map((r) => r.link).sort();
    expect(links).toEqual(['missing-a.md', 'missing-b.md']);
  });

  test('ignores anchor-only links (#section)', () => {
    writeFile(tmpDir, 'README.md', '# Project\n\nSee [section](#overview) below.\n');

    const result = analyzeReadmeLinks(tmpDir);
    expect(result).toEqual([]);
  });
});

// ─── analyzeJsdocDrift ──────────────────────────────────────────────────────

describe('analyzeJsdocDrift', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('detects @param annotation for parameter not in function signature', () => {
    writeFile(
      tmpDir,
      'lib/example.js',
      [
        '/**',
        ' * Does something.',
        ' * @param {string} name - The name',
        ' * @param {number} age - The age',
        ' * @param {boolean} extra - Not in signature',
        ' */',
        'function doSomething(name, age) {',
        '  return name + age;',
        '}',
        '',
      ].join('\n')
    );

    const result = analyzeJsdocDrift(tmpDir, ['lib/example.js']);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const extraParam = result.find((r) => r.issue.includes('extra') && r.issue.includes('extra'));
    expect(extraParam).toBeDefined();
    expect(extraParam.issue).toMatch(/extra/i);
  });

  test('detects missing @param for parameter that exists in signature', () => {
    writeFile(
      tmpDir,
      'lib/example.js',
      [
        '/**',
        ' * Does something.',
        ' * @param {string} name - The name',
        ' */',
        'function doSomething(name, age) {',
        '  return name + age;',
        '}',
        '',
      ].join('\n')
    );

    const result = analyzeJsdocDrift(tmpDir, ['lib/example.js']);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const missingParam = result.find((r) => r.issue.includes('missing'));
    expect(missingParam).toBeDefined();
    expect(missingParam.issue).toMatch(/missing/i);
  });

  test('returns empty array when @param annotations match function signatures exactly', () => {
    writeFile(
      tmpDir,
      'lib/example.js',
      [
        '/**',
        ' * Adds numbers.',
        ' * @param {number} a - First number',
        ' * @param {number} b - Second number',
        ' */',
        'function add(a, b) {',
        '  return a + b;',
        '}',
        '',
      ].join('\n')
    );

    const result = analyzeJsdocDrift(tmpDir, ['lib/example.js']);
    expect(result).toEqual([]);
  });

  test('handles arrow functions with JSDoc blocks', () => {
    writeFile(
      tmpDir,
      'lib/example.js',
      [
        '/**',
        ' * Multiply.',
        ' * @param {number} x - First',
        ' * @param {number} y - Second',
        ' * @param {number} ghost - Not in signature',
        ' */',
        'const multiply = (x, y) => {',
        '  return x * y;',
        '};',
        '',
      ].join('\n')
    );

    const result = analyzeJsdocDrift(tmpDir, ['lib/example.js']);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const extra = result.find((r) => r.issue.includes('ghost'));
    expect(extra).toBeDefined();
  });

  test('returns empty array for files with no JSDoc blocks', () => {
    writeFile(tmpDir, 'lib/example.js', 'function plain(a, b) { return a + b; }\n');

    const result = analyzeJsdocDrift(tmpDir, ['lib/example.js']);
    expect(result).toEqual([]);
  });

  test('returns empty array when files list is empty', () => {
    const result = analyzeJsdocDrift(tmpDir, []);
    expect(result).toEqual([]);
  });

  test('handles destructured and default parameters gracefully', () => {
    writeFile(
      tmpDir,
      'lib/example.js',
      [
        '/**',
        ' * Process options.',
        ' * @param {Object} options - The options',
        ' * @param {number} count - The count',
        ' */',
        'function process(options = {}, count = 0) {',
        '  return count;',
        '}',
        '',
      ].join('\n')
    );

    const result = analyzeJsdocDrift(tmpDir, ['lib/example.js']);
    expect(result).toEqual([]);
  });
});

// ─── runQualityAnalysis doc_drift integration ───────────────────────────────

describe('runQualityAnalysis doc_drift integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('report includes doc_drift section when config.doc_sync is true and enabled is true', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, doc_sync: true } });
    writeFile(tmpDir, 'lib/mod.js', 'function a() {}\nmodule.exports = { a };\n');
    writeFile(tmpDir, 'consumer.js', "const { a } = require('./lib/mod');\na();\n");

    const result = runQualityAnalysis(tmpDir, '14');
    expect(result.details.doc_drift).toBeDefined();
    expect(result.details.doc_drift.changelog).toBeDefined();
    expect(result.details.doc_drift.readme_links).toBeDefined();
    expect(result.details.doc_drift.jsdoc).toBeDefined();
    expect(typeof result.summary.doc_drift_issues).toBe('number');
  });

  test('report omits doc_drift section when config.doc_sync is false', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, doc_sync: false } });
    writeFile(tmpDir, 'lib/mod.js', 'function a() {}\nmodule.exports = { a };\n');
    writeFile(tmpDir, 'consumer.js', "const { a } = require('./lib/mod');\na();\n");

    const result = runQualityAnalysis(tmpDir, '14');
    expect(result.details.doc_drift).toBeUndefined();
    expect(result.summary.doc_drift_issues).toBeUndefined();
  });

  test('summary.doc_drift_issues count reflects total of all 3 doc drift checks', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, doc_sync: true } });
    writeFile(tmpDir, 'lib/mod.js', 'function a() {}\nmodule.exports = { a };\n');
    writeFile(tmpDir, 'consumer.js', "const { a } = require('./lib/mod');\na();\n");
    // Create a broken README link to produce at least 1 issue
    writeFile(tmpDir, 'README.md', '# Hello\n\n[broken](does-not-exist.md)\n');

    const result = runQualityAnalysis(tmpDir, '14');
    expect(result.summary.doc_drift_issues).toBeGreaterThanOrEqual(1);
    // Verify total_issues includes doc_drift_issues
    const baseIssues =
      result.summary.complexity_violations +
      result.summary.dead_exports +
      result.summary.oversized_files;
    expect(result.summary.total_issues).toBe(baseIssues + result.summary.doc_drift_issues);
  });

  test('backward compatible: existing summary fields unchanged when doc_sync enabled', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, doc_sync: true } });
    writeFile(tmpDir, 'lib/mod.js', 'function a() {}\nmodule.exports = { a };\n');
    writeFile(tmpDir, 'consumer.js', "const { a } = require('./lib/mod');\na();\n");

    const result = runQualityAnalysis(tmpDir, '14');
    // Original fields must still be present
    expect(typeof result.summary.complexity_violations).toBe('number');
    expect(typeof result.summary.dead_exports).toBe('number');
    expect(typeof result.summary.oversized_files).toBe('number');
    // Original details must still be present
    expect(result.details.complexity).toBeDefined();
    expect(result.details.dead_exports).toBeDefined();
    expect(result.details.file_size).toBeDefined();
  });
});

// ─── generateCleanupPlan ──────────────────────────────────────────────────────

describe('generateCleanupPlan', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  // Helper: create a phase directory structure
  function createPhaseDir(phaseNum, slug, existingPlans = []) {
    const padded = String(phaseNum).padStart(2, '0');
    const dirName = `${padded}-${slug}`;
    const dirPath = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', dirName);
    fs.mkdirSync(dirPath, { recursive: true });
    for (const plan of existingPlans) {
      const planFile = `${padded}-${String(plan).padStart(2, '0')}-PLAN.md`;
      fs.writeFileSync(path.join(dirPath, planFile), '---\nplan: ' + plan + '\n---\n');
    }
    return dirPath;
  }

  // Helper: build a quality report with configurable issue counts
  function makeQualityReport(options = {}) {
    const complexity = options.complexity || [];
    const dead_exports = options.dead_exports || [];
    const file_size = options.file_size || [];
    const doc_drift = options.doc_drift || null;

    const baseIssues = complexity.length + dead_exports.length + file_size.length;
    let docDriftCount = 0;
    if (doc_drift) {
      docDriftCount =
        (doc_drift.changelog || []).length +
        (doc_drift.readme_links || []).length +
        (doc_drift.jsdoc || []).length;
    }

    const summary = {
      total_issues: baseIssues + docDriftCount,
      complexity_violations: complexity.length,
      dead_exports: dead_exports.length,
      oversized_files: file_size.length,
    };
    if (doc_drift) {
      summary.doc_drift_issues = docDriftCount;
    }

    const details = { complexity, dead_exports, file_size };
    if (doc_drift) {
      details.doc_drift = doc_drift;
    }

    return { phase: '14', timestamp: '2026-02-16', summary, details };
  }

  test('returns null when total_issues is 0', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase');
    const report = makeQualityReport();
    const result = generateCleanupPlan(tmpDir, '14', report);
    expect(result).toBeNull();
  });

  test('returns null when total_issues is at cleanup_threshold (default 5)', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase');
    const report = makeQualityReport({
      complexity: [
        { file: 'lib/a.js', line: 1, functionName: 'f1', complexity: 15 },
        { file: 'lib/a.js', line: 10, functionName: 'f2', complexity: 12 },
        { file: 'lib/b.js', line: 1, functionName: 'f3', complexity: 11 },
      ],
      dead_exports: [
        { file: 'lib/c.js', exportName: 'unused1', line: 5 },
        { file: 'lib/c.js', exportName: 'unused2', line: 10 },
      ],
    });
    // total_issues = 5, which equals threshold
    expect(report.summary.total_issues).toBe(5);
    const result = generateCleanupPlan(tmpDir, '14', report);
    expect(result).toBeNull();
  });

  test('generates PLAN.md when total_issues exceeds cleanup_threshold', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase');
    const report = makeQualityReport({
      complexity: [
        { file: 'lib/a.js', line: 1, functionName: 'bigFunc', complexity: 20 },
        { file: 'lib/a.js', line: 50, functionName: 'bigFunc2', complexity: 15 },
      ],
      dead_exports: [
        { file: 'lib/b.js', exportName: 'unusedX', line: 3 },
        { file: 'lib/b.js', exportName: 'unusedY', line: 7 },
      ],
      file_size: [{ file: 'lib/c.js', lines: 800, threshold: 500 }],
      doc_drift: {
        changelog: [{ file: 'CHANGELOG.md', reason: 'stale' }],
        readme_links: [],
        jsdoc: [],
      },
    });
    // total_issues = 2+2+1+1 = 6 > 5
    expect(report.summary.total_issues).toBe(6);

    const result = generateCleanupPlan(tmpDir, '14', report);
    expect(result).not.toBeNull();
    expect(result.path).toMatch(/14-01-PLAN\.md$/);
    expect(result.plan_number).toBe('01');
    expect(result.issues_addressed).toBe(6);

    // Verify the file was actually written
    const planPath = path.join(tmpDir, result.path);
    expect(fs.existsSync(planPath)).toBe(true);
  });

  test('generated PLAN.md has valid YAML frontmatter with required fields', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase');
    const report = makeQualityReport({
      file_size: [
        { file: 'lib/big.js', lines: 900, threshold: 500 },
        { file: 'lib/huge.js', lines: 1200, threshold: 500 },
      ],
      dead_exports: [
        { file: 'lib/big.js', exportName: 'unused1', line: 1 },
        { file: 'lib/big.js', exportName: 'unused2', line: 2 },
        { file: 'lib/big.js', exportName: 'unused3', line: 3 },
        { file: 'lib/big.js', exportName: 'unused4', line: 4 },
      ],
    });

    const result = generateCleanupPlan(tmpDir, '14', report);
    const content = fs.readFileSync(path.join(tmpDir, result.path), 'utf-8');

    // Check frontmatter fields
    expect(content).toMatch(/^---/);
    expect(content).toContain('phase: test-phase');
    expect(content).toContain('plan: 01');
    expect(content).toContain('type: execute');
    expect(content).toContain('wave: 1');
    expect(content).toContain('autonomous: true');
    expect(content).toContain('verification_level: sanity');
    expect(content).toContain('cleanup_generated: true');
    expect(content).toContain('files_modified:');
  });

  test('generated PLAN.md contains tasks referencing actual quality issues', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase');
    const report = makeQualityReport({
      complexity: [{ file: 'lib/a.js', line: 1, functionName: 'complexFunc', complexity: 25 }],
      dead_exports: [{ file: 'lib/b.js', exportName: 'deadExport', line: 5 }],
      file_size: [{ file: 'lib/c.js', lines: 600, threshold: 500 }],
      doc_drift: {
        changelog: [{ file: 'CHANGELOG.md', reason: 'stale' }],
        readme_links: [{ file: 'README.md', link: 'missing.md', line: 3 }],
        jsdoc: [
          { file: 'lib/a.js', line: 1, functionName: 'complexFunc', issue: 'extra @param: ghost' },
        ],
      },
    });

    const result = generateCleanupPlan(tmpDir, '14', report);
    const content = fs.readFileSync(path.join(tmpDir, result.path), 'utf-8');

    // Verify tasks reference actual issues
    expect(content).toContain('complexFunc');
    expect(content).toContain('deadExport');
    expect(content).toContain('lib/c.js');
    expect(content).toContain('CHANGELOG.md');
    expect(content).toContain('missing.md');
    expect(content).toContain('JSDoc');
  });

  test('respects custom cleanup_threshold from config', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, cleanup_threshold: 2 } });
    createPhaseDir(14, 'test-phase');

    // 3 issues > threshold of 2
    const report = makeQualityReport({
      dead_exports: [
        { file: 'lib/a.js', exportName: 'x', line: 1 },
        { file: 'lib/a.js', exportName: 'y', line: 2 },
        { file: 'lib/a.js', exportName: 'z', line: 3 },
      ],
    });

    const result = generateCleanupPlan(tmpDir, '14', report);
    expect(result).not.toBeNull();
    expect(result.issues_addressed).toBe(3);
  });

  test('returns null with custom threshold when issues are at threshold', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, cleanup_threshold: 2 } });
    createPhaseDir(14, 'test-phase');

    // 2 issues = threshold of 2, should not generate
    const report = makeQualityReport({
      dead_exports: [
        { file: 'lib/a.js', exportName: 'x', line: 1 },
        { file: 'lib/a.js', exportName: 'y', line: 2 },
      ],
    });

    const result = generateCleanupPlan(tmpDir, '14', report);
    expect(result).toBeNull();
  });

  test('plan number is sequential after existing plans in the phase directory', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase', [1, 2]); // existing plans 01 and 02

    const report = makeQualityReport({
      file_size: [
        { file: 'lib/big.js', lines: 900, threshold: 500 },
        { file: 'lib/big2.js', lines: 800, threshold: 500 },
        { file: 'lib/big3.js', lines: 700, threshold: 500 },
        { file: 'lib/big4.js', lines: 600, threshold: 500 },
        { file: 'lib/big5.js', lines: 550, threshold: 500 },
        { file: 'lib/big6.js', lines: 510, threshold: 500 },
      ],
    });

    const result = generateCleanupPlan(tmpDir, '14', report);
    expect(result).not.toBeNull();
    expect(result.plan_number).toBe('03');
    expect(result.path).toMatch(/14-03-PLAN\.md$/);
  });

  test('starts at plan 01 when no existing plans in phase directory', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase'); // no existing plans

    const report = makeQualityReport({
      file_size: Array.from({ length: 6 }, (_, i) => ({
        file: `lib/f${i}.js`,
        lines: 600 + i * 100,
        threshold: 500,
      })),
    });

    const result = generateCleanupPlan(tmpDir, '14', report);
    expect(result).not.toBeNull();
    expect(result.plan_number).toBe('01');
  });

  test('files_modified in frontmatter reflects files from quality issues', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase');
    const report = makeQualityReport({
      complexity: [
        { file: 'lib/alpha.js', line: 1, functionName: 'f', complexity: 20 },
        { file: 'lib/alpha.js', line: 50, functionName: 'g', complexity: 18 },
      ],
      dead_exports: [{ file: 'lib/beta.js', exportName: 'x', line: 1 }],
      file_size: [{ file: 'lib/gamma.js', lines: 600, threshold: 500 }],
      doc_drift: {
        changelog: [{ file: 'CHANGELOG.md', reason: 'stale' }],
        readme_links: [],
        jsdoc: [{ file: 'lib/alpha.js', line: 1, functionName: 'f', issue: 'extra @param: x' }],
      },
    });

    const result = generateCleanupPlan(tmpDir, '14', report);
    const content = fs.readFileSync(path.join(tmpDir, result.path), 'utf-8');

    // Should list unique files
    expect(content).toContain('"lib/alpha.js"');
    expect(content).toContain('"lib/beta.js"');
    expect(content).toContain('"lib/gamma.js"');
    expect(content).toContain('"CHANGELOG.md"');
  });

  test('returns null when qualityReport is null', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase');
    const result = generateCleanupPlan(tmpDir, '14', null);
    expect(result).toBeNull();
  });

  test('returns null when qualityReport has no summary', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase');
    const result = generateCleanupPlan(tmpDir, '14', { details: {} });
    expect(result).toBeNull();
  });

  test('returns null when phase directory does not exist', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    // No phase dir created
    const report = makeQualityReport({
      file_size: Array.from({ length: 6 }, (_, i) => ({
        file: `lib/f${i}.js`,
        lines: 600,
        threshold: 500,
      })),
    });
    const result = generateCleanupPlan(tmpDir, '14', report);
    expect(result).toBeNull();
  });

  test('combines code quality issues into one task and doc drift into another', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    createPhaseDir(14, 'test-phase');
    const report = makeQualityReport({
      complexity: [{ file: 'lib/a.js', line: 1, functionName: 'f1', complexity: 20 }],
      dead_exports: [{ file: 'lib/a.js', exportName: 'x', line: 5 }],
      file_size: [{ file: 'lib/a.js', lines: 700, threshold: 500 }],
      doc_drift: {
        changelog: [{ file: 'CHANGELOG.md', reason: 'stale' }],
        readme_links: [{ file: 'README.md', link: 'bad.md', line: 2 }],
        jsdoc: [{ file: 'lib/a.js', line: 1, functionName: 'f1', issue: 'missing @param: x' }],
      },
    });

    const result = generateCleanupPlan(tmpDir, '14', report);
    const content = fs.readFileSync(path.join(tmpDir, result.path), 'utf-8');

    // Should have two task blocks
    expect(content).toContain('Task 1: Resolve code quality issues');
    expect(content).toContain('Task 2: Update stale documentation');
  });
});

// ─── analyzeTestCoverageGaps ──────────────────────────────────────────────────

describe('analyzeTestCoverageGaps', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns empty array when all exports are mentioned in test file', () => {
    writeFile(
      tmpDir,
      'lib/utils.js',
      'function alpha() {}\nfunction beta() {}\nmodule.exports = { alpha, beta };\n'
    );
    writeFile(
      tmpDir,
      'tests/unit/utils.test.js',
      "const { alpha, beta } = require('../../lib/utils');\ndescribe('alpha', () => {});\ndescribe('beta', () => {});\n"
    );
    const result = analyzeTestCoverageGaps(tmpDir, ['lib/utils.js']);
    expect(result).toEqual([]);
  });

  test('detects exports not mentioned in test file', () => {
    writeFile(
      tmpDir,
      'lib/utils.js',
      'function alpha() {}\nfunction beta() {}\nfunction gamma() {}\nmodule.exports = { alpha, beta, gamma };\n'
    );
    writeFile(
      tmpDir,
      'tests/unit/utils.test.js',
      "const { alpha } = require('../../lib/utils');\ndescribe('alpha', () => {});\n"
    );
    const result = analyzeTestCoverageGaps(tmpDir, ['lib/utils.js']);
    expect(result.length).toBe(2);
    const names = result.map((r) => r.exportName).sort();
    expect(names).toEqual(['beta', 'gamma']);
    expect(result[0].testFile).toBe(path.join('tests', 'unit', 'utils.test.js'));
  });

  test('flags all exports when test file does not exist', () => {
    writeFile(
      tmpDir,
      'lib/orphan.js',
      'function x() {}\nfunction y() {}\nmodule.exports = { x, y };\n'
    );
    const result = analyzeTestCoverageGaps(tmpDir, ['lib/orphan.js']);
    expect(result.length).toBe(2);
    expect(result[0].testFile).toBe(path.join('tests', 'unit', 'orphan.test.js'));
  });

  test('returns empty array for empty files list', () => {
    const result = analyzeTestCoverageGaps(tmpDir, []);
    expect(result).toEqual([]);
  });

  test('skips files with no exports', () => {
    writeFile(tmpDir, 'lib/empty.js', '// no exports\n');
    const result = analyzeTestCoverageGaps(tmpDir, ['lib/empty.js']);
    expect(result).toEqual([]);
  });
});

// ─── analyzeExportConsistency ─────────────────────────────────────────────────

describe('analyzeExportConsistency', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns empty array when all imports match exports', () => {
    writeFile(
      tmpDir,
      'lib/source.js',
      'function foo() {}\nfunction bar() {}\nmodule.exports = { foo, bar };\n'
    );
    writeFile(
      tmpDir,
      'lib/consumer.js',
      "const { foo, bar } = require('./source');\nfoo(); bar();\n"
    );
    const result = analyzeExportConsistency(tmpDir, ['lib/consumer.js']);
    expect(result).toEqual([]);
  });

  test('detects stale import not in source exports', () => {
    writeFile(tmpDir, 'lib/source.js', 'function foo() {}\nmodule.exports = { foo };\n');
    writeFile(tmpDir, 'lib/consumer.js', "const { foo, removed } = require('./source');\nfoo();\n");
    const result = analyzeExportConsistency(tmpDir, ['lib/consumer.js']);
    expect(result.length).toBe(1);
    expect(result[0].importedName).toBe('removed');
    expect(result[0].file).toBe('lib/consumer.js');
    expect(result[0].line).toBe(1);
  });

  test('skips non-relative requires', () => {
    writeFile(
      tmpDir,
      'lib/consumer.js',
      "const { readFileSync } = require('fs');\nreadFileSync('x');\n"
    );
    const result = analyzeExportConsistency(tmpDir, ['lib/consumer.js']);
    expect(result).toEqual([]);
  });

  test('returns empty array for empty files list', () => {
    const result = analyzeExportConsistency(tmpDir, []);
    expect(result).toEqual([]);
  });

  test('handles missing source module gracefully', () => {
    writeFile(tmpDir, 'lib/consumer.js', "const { foo } = require('./nonexistent');\nfoo();\n");
    const result = analyzeExportConsistency(tmpDir, ['lib/consumer.js']);
    expect(result).toEqual([]);
  });
});

// ─── analyzeDocStaleness ──────────────────────────────────────────────────────

describe('analyzeDocStaleness', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns empty array when no CLAUDE.md exists', () => {
    const result = analyzeDocStaleness(tmpDir);
    expect(result).toEqual([]);
  });

  test('returns empty array when no mcp-server.js exists', () => {
    writeFile(tmpDir, 'CLAUDE.md', '## CLI Tooling\n- `state load` — desc\n## Other\n');
    const result = analyzeDocStaleness(tmpDir);
    expect(result).toEqual([]);
  });

  test('detects documented-but-not-implemented command', () => {
    writeFile(
      tmpDir,
      'CLAUDE.md',
      '## CLI Tooling\n- `state load` — desc\n- `ghost command` — not real\n## Other\n'
    );
    writeFile(
      tmpDir,
      'lib/mcp-server.js',
      "const COMMAND_DESCRIPTORS = [\n  { name: 'grd_state_load', execute: () => {} },\n];\n"
    );
    const result = analyzeDocStaleness(tmpDir);
    const notImpl = result.filter((r) => r.issue === 'documented-but-not-implemented');
    expect(notImpl.length).toBe(1);
    expect(notImpl[0].detail).toContain('ghost command');
  });

  test('detects implemented-but-not-documented tool', () => {
    writeFile(tmpDir, 'CLAUDE.md', '## CLI Tooling\n- `state load` — desc\n## Other\n');
    writeFile(
      tmpDir,
      'lib/mcp-server.js',
      "const COMMAND_DESCRIPTORS = [\n  { name: 'grd_state_load', execute: () => {} },\n  { name: 'grd_secret_tool', execute: () => {} },\n];\n"
    );
    const result = analyzeDocStaleness(tmpDir);
    const notDoc = result.filter((r) => r.issue === 'implemented-but-not-documented');
    expect(notDoc.length).toBe(1);
    expect(notDoc[0].detail).toContain('grd_secret_tool');
  });

  test('returns empty when documented commands match implementations', () => {
    writeFile(
      tmpDir,
      'CLAUDE.md',
      '## CLI Tooling\n- `state load` — desc\n- `verify plan-structure` — desc\n## Other\n'
    );
    writeFile(
      tmpDir,
      'lib/mcp-server.js',
      "const COMMAND_DESCRIPTORS = [\n  { name: 'grd_state_load', execute: () => {} },\n  { name: 'grd_verify_plan_structure', execute: () => {} },\n];\n"
    );
    const result = analyzeDocStaleness(tmpDir);
    expect(result).toEqual([]);
  });

  test('handles slash-separated subcommands correctly', () => {
    writeFile(tmpDir, 'CLAUDE.md', '## CLI Tooling\n- `phase add/remove` — ops\n## Other\n');
    writeFile(
      tmpDir,
      'lib/mcp-server.js',
      "const COMMAND_DESCRIPTORS = [\n  { name: 'grd_phase_add', execute: () => {} },\n  { name: 'grd_phase_remove', execute: () => {} },\n];\n"
    );
    const result = analyzeDocStaleness(tmpDir);
    expect(result).toEqual([]);
  });
});

// ─── analyzeConfigSchemaDrift ─────────────────────────────────────────────────

describe('analyzeConfigSchemaDrift', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns empty array when no CLAUDE.md exists', () => {
    const result = analyzeConfigSchemaDrift(tmpDir);
    expect(result).toEqual([]);
  });

  test('detects documented key not in config', () => {
    writeFile(
      tmpDir,
      'CLAUDE.md',
      '## Configuration\n\n- `tracker` — Issue tracker\n- `execution` — Execution settings\n\n## Other\n'
    );
    writeConfig(tmpDir, { some_key: true });
    const result = analyzeConfigSchemaDrift(tmpDir);
    const notInConfig = result.filter((r) => r.issue === 'documented-key-not-in-config');
    expect(notInConfig.length).toBe(2);
    expect(notInConfig.map((r) => r.detail)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('tracker'),
        expect.stringContaining('execution'),
      ])
    );
  });

  test('detects config key not documented', () => {
    writeFile(tmpDir, 'CLAUDE.md', '## Configuration\n\n- `known_key` — Known\n\n## Other\n');
    writeConfig(tmpDir, { known_key: true, secret_key: false });
    const result = analyzeConfigSchemaDrift(tmpDir);
    const notDoc = result.filter((r) => r.issue === 'config-key-not-documented');
    expect(notDoc.length).toBe(1);
    expect(notDoc[0].detail).toContain('secret_key');
  });

  test('skips internal config keys prefixed with underscore', () => {
    writeFile(tmpDir, 'CLAUDE.md', '## Configuration\n\n- `visible` — Visible\n\n## Other\n');
    writeConfig(tmpDir, { visible: true, _internal: 'hidden' });
    const result = analyzeConfigSchemaDrift(tmpDir);
    const notDoc = result.filter((r) => r.issue === 'config-key-not-documented');
    expect(notDoc).toEqual([]);
  });

  test('returns empty when documented keys match config keys', () => {
    writeFile(
      tmpDir,
      'CLAUDE.md',
      '## Configuration\n\n- `alpha` — Alpha\n- `beta` — Beta\n\n## Other\n'
    );
    writeConfig(tmpDir, { alpha: 1, beta: 2 });
    const result = analyzeConfigSchemaDrift(tmpDir);
    const configIssues = result.filter(
      (r) => r.issue === 'documented-key-not-in-config' || r.issue === 'config-key-not-documented'
    );
    expect(configIssues).toEqual([]);
  });

  test('detects execute function not imported in mcp-server.js', () => {
    writeFile(tmpDir, 'CLAUDE.md', '## Configuration\n\n## Other\n');
    writeConfig(tmpDir, {});
    writeFile(
      tmpDir,
      'lib/mcp-server.js',
      [
        'const { cmdKnown } = require("./tools");',
        'const COMMAND_DESCRIPTORS = [',
        "  { name: 'grd_known', execute: (cwd, args) => cmdKnown(cwd, args) },",
        "  { name: 'grd_ghost', execute: (cwd, args) => cmdGhost(cwd, args) },",
        '];',
      ].join('\n')
    );
    const result = analyzeConfigSchemaDrift(tmpDir);
    const notImported = result.filter((r) => r.issue === 'execute-function-not-imported');
    expect(notImported.length).toBe(1);
    expect(notImported[0].detail).toContain('cmdGhost');
  });
});

// ─── runQualityAnalysis new analyzer integration ─────────────────────────────

describe('runQualityAnalysis new analyzer integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('includes test_coverage in report when config enabled', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, test_coverage: true } });
    writeFile(tmpDir, 'lib/mod.js', 'function aFn() {}\nmodule.exports = { aFn };\n');
    // No test file → should flag aFn as uncovered
    const result = runQualityAnalysis(tmpDir, '20');
    expect(result.details.test_coverage).toBeDefined();
    expect(result.summary.test_coverage_gaps).toBeGreaterThanOrEqual(1);
    expect(result.summary.total_issues).toBeGreaterThanOrEqual(1);
  });

  test('includes export_consistency in report when config enabled', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, export_consistency: true } });
    writeFile(tmpDir, 'lib/source.js', 'function foo() {}\nmodule.exports = { foo };\n');
    writeFile(
      tmpDir,
      'lib/consumer.js',
      "const { foo, stale } = require('./source');\nmodule.exports = { foo };\n"
    );
    const result = runQualityAnalysis(tmpDir, '20');
    expect(result.details.export_consistency).toBeDefined();
    expect(result.summary.stale_imports).toBeGreaterThanOrEqual(1);
  });

  test('new options disabled by default — backward compatible', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true } });
    writeFile(tmpDir, 'lib/mod.js', 'function a() {}\nmodule.exports = { a };\n');
    writeFile(tmpDir, 'consumer.js', "const { a } = require('./lib/mod');\na();\n");
    const result = runQualityAnalysis(tmpDir, '20');
    expect(result.details.test_coverage).toBeUndefined();
    expect(result.details.export_consistency).toBeUndefined();
    expect(result.details.doc_staleness).toBeUndefined();
    expect(result.details.config_schema).toBeUndefined();
    expect(result.summary.test_coverage_gaps).toBeUndefined();
    expect(result.summary.stale_imports).toBeUndefined();
  });

  test('total_issues sums all enabled categories correctly', () => {
    writeConfig(tmpDir, {
      phase_cleanup: {
        enabled: true,
        doc_sync: true,
        test_coverage: true,
      },
    });
    writeFile(
      tmpDir,
      'lib/mod.js',
      'function a() {}\nfunction b() {}\nmodule.exports = { a, b };\n'
    );
    writeFile(tmpDir, 'consumer.js', "const { a, b } = require('./lib/mod');\na(); b();\n");
    // No test file → 2 test coverage gaps
    // broken readme → 1 doc drift issue
    writeFile(tmpDir, 'README.md', '[broken](no.md)\n');

    const result = runQualityAnalysis(tmpDir, '20');
    const expected =
      result.summary.complexity_violations +
      result.summary.dead_exports +
      result.summary.oversized_files +
      (result.summary.doc_drift_issues || 0) +
      (result.summary.test_coverage_gaps || 0);
    expect(result.summary.total_issues).toBe(expected);
  });
});

// ─── generateCleanupPlan new task groupings ──────────────────────────────────

describe('generateCleanupPlan new task groupings', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  function createPhaseDir(phaseNum, slug, existingPlans = []) {
    const padded = String(phaseNum).padStart(2, '0');
    const dirName = `${padded}-${slug}`;
    const dirPath = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', dirName);
    fs.mkdirSync(dirPath, { recursive: true });
    for (const plan of existingPlans) {
      const planFile = `${padded}-${String(plan).padStart(2, '0')}-PLAN.md`;
      fs.writeFileSync(path.join(dirPath, planFile), '---\nplan: ' + plan + '\n---\n');
    }
    return dirPath;
  }

  test('generated plan contains test coverage task', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, cleanup_threshold: 0 } });
    createPhaseDir(20, 'drift-test');
    const report = {
      phase: '20',
      timestamp: '2026-02-16',
      summary: { total_issues: 3 },
      details: {
        complexity: [],
        dead_exports: [],
        file_size: [],
        test_coverage: [
          { file: 'lib/a.js', exportName: 'fn1', testFile: 'tests/unit/a.test.js', line: 5 },
          { file: 'lib/a.js', exportName: 'fn2', testFile: 'tests/unit/a.test.js', line: 10 },
          { file: 'lib/b.js', exportName: 'fn3', testFile: 'tests/unit/b.test.js', line: 1 },
        ],
      },
    };
    const result = generateCleanupPlan(tmpDir, '20', report);
    expect(result).not.toBeNull();
    const content = fs.readFileSync(path.join(tmpDir, result.path), 'utf-8');
    expect(content).toContain('Close test coverage gaps');
    expect(content).toContain('fn1');
    expect(content).toContain('fn2');
    expect(content).toContain('fn3');
  });

  test('generated plan contains consistency and schema task', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, cleanup_threshold: 0 } });
    createPhaseDir(20, 'drift-test');
    const report = {
      phase: '20',
      timestamp: '2026-02-16',
      summary: { total_issues: 3 },
      details: {
        complexity: [],
        dead_exports: [],
        file_size: [],
        export_consistency: [
          { file: 'lib/a.js', importedName: 'old', sourceModule: 'lib/b.js', line: 1 },
        ],
        doc_staleness: [
          {
            file: 'CLAUDE.md',
            issue: 'documented-but-not-implemented',
            detail: 'ghost cmd',
            line: 5,
          },
        ],
        config_schema: [
          {
            file: '.planning/config.json',
            issue: 'config-key-not-documented',
            detail: 'secret',
            line: 0,
          },
        ],
      },
    };
    const result = generateCleanupPlan(tmpDir, '20', report);
    expect(result).not.toBeNull();
    const content = fs.readFileSync(path.join(tmpDir, result.path), 'utf-8');
    expect(content).toContain('Fix consistency and schema issues');
    expect(content).toContain('stale import');
    expect(content).toContain('doc staleness');
    expect(content).toContain('config schema drift');
  });

  test('files from new categories appear in filesSet', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, cleanup_threshold: 0 } });
    createPhaseDir(20, 'drift-test');
    const report = {
      phase: '20',
      timestamp: '2026-02-16',
      summary: { total_issues: 2 },
      details: {
        complexity: [],
        dead_exports: [],
        file_size: [],
        test_coverage: [
          {
            file: 'lib/unique-test.js',
            exportName: 'fn',
            testFile: 'tests/unit/unique-test.test.js',
            line: 1,
          },
        ],
        export_consistency: [
          { file: 'lib/unique-import.js', importedName: 'x', sourceModule: 'lib/y.js', line: 1 },
        ],
      },
    };
    const result = generateCleanupPlan(tmpDir, '20', report);
    expect(result).not.toBeNull();
    const content = fs.readFileSync(path.join(tmpDir, result.path), 'utf-8');
    expect(content).toContain('"lib/unique-test.js"');
    expect(content).toContain('"lib/unique-import.js"');
  });

  test('backward compat: new detail categories absent → no new tasks', () => {
    writeConfig(tmpDir, { phase_cleanup: { enabled: true, cleanup_threshold: 0 } });
    createPhaseDir(20, 'drift-test');
    const report = {
      phase: '20',
      timestamp: '2026-02-16',
      summary: { total_issues: 2 },
      details: {
        complexity: [{ file: 'lib/a.js', line: 1, functionName: 'f', complexity: 20 }],
        dead_exports: [{ file: 'lib/a.js', exportName: 'x', line: 5 }],
        file_size: [],
      },
    };
    const result = generateCleanupPlan(tmpDir, '20', report);
    expect(result).not.toBeNull();
    const content = fs.readFileSync(path.join(tmpDir, result.path), 'utf-8');
    expect(content).toContain('Resolve code quality issues');
    expect(content).not.toContain('Close test coverage gaps');
    expect(content).not.toContain('Fix consistency and schema issues');
  });
});
