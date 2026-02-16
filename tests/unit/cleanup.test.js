/**
 * Unit tests for lib/cleanup.js
 *
 * Tests config schema handling and quality analysis functions:
 * getCleanupConfig, analyzeComplexity, analyzeDeadExports, analyzeFileSize, runQualityAnalysis.
 * Also tests doc drift detection: analyzeChangelogDrift, analyzeReadmeLinks, analyzeJsdocDrift.
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

  test('returns defaults when config.json has no phase_cleanup section', () => {
    writeConfig(tmpDir, {});
    const result = getCleanupConfig(tmpDir);
    expect(result).toEqual({ enabled: false, refactoring: false, doc_sync: false });
  });

  test('returns user values when phase_cleanup section exists', () => {
    writeConfig(tmpDir, {
      phase_cleanup: { enabled: true, refactoring: true, doc_sync: false },
    });
    const result = getCleanupConfig(tmpDir);
    expect(result).toEqual({ enabled: true, refactoring: true, doc_sync: false });
  });

  test('merges defaults for missing fields', () => {
    writeConfig(tmpDir, {
      phase_cleanup: { enabled: true },
    });
    const result = getCleanupConfig(tmpDir);
    expect(result).toEqual({ enabled: true, refactoring: false, doc_sync: false });
  });

  test('returns defaults when config.json does not exist', () => {
    // tmpDir has no .planning/config.json
    const result = getCleanupConfig(tmpDir);
    expect(result).toEqual({ enabled: false, refactoring: false, doc_sync: false });
  });

  test('returns defaults when config.json is invalid JSON', () => {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'config.json'), 'not valid json {{{');
    const result = getCleanupConfig(tmpDir);
    expect(result).toEqual({ enabled: false, refactoring: false, doc_sync: false });
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
      '.planning/phases/01-init/01-01-SUMMARY.md',
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
      '.planning/phases/01-init/01-01-SUMMARY.md',
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
    writeFile(
      tmpDir,
      'lib/example.js',
      'function plain(a, b) { return a + b; }\n'
    );

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
