/**
 * Unit tests for lib/cleanup.js
 *
 * Tests config schema handling and quality analysis functions:
 * getCleanupConfig, analyzeComplexity, analyzeDeadExports, analyzeFileSize, runQualityAnalysis.
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
    writeFile(
      tmpDir,
      'tests/consumer.test.js',
      "const { funcA } = require('../lib');\nfuncA();\n"
    );
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
    writeFile(tmpDir, 'lib/clean.js', 'function hello() { return 1; }\nmodule.exports = { hello };\n');
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
