/**
 * Unit tests for bin/postinstall.js and package.json npm configuration.
 *
 * Tests:
 * - package.json field correctness (name, version, bin, files, engines, etc.)
 * - postinstall directory structure creation
 * - postinstall config.json generation
 * - postinstall idempotency
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const POSTINSTALL_SCRIPT = path.resolve(__dirname, '../../bin/postinstall.js');
const PACKAGE_JSON_PATH = path.resolve(__dirname, '../../package.json');
const VERSION_PATH = path.resolve(__dirname, '../../VERSION');
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// ─── package.json validation tests ──────────────────────────────────────────

describe('package.json npm configuration', () => {
  let pkg;

  beforeAll(() => {
    pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
  });

  test('name is "grd-tools"', () => {
    expect(pkg.name).toBe('grd-tools');
  });

  test('version matches VERSION file', () => {
    const version = fs.readFileSync(VERSION_PATH, 'utf8').trim();
    expect(pkg.version).toBe(version);
  });

  test('private field is absent (not false — completely absent)', () => {
    expect(pkg).not.toHaveProperty('private');
  });

  test('bin["grd-tools"] points to bin/grd-tools.js and file exists', () => {
    expect(pkg.bin['grd-tools']).toBe('bin/grd-tools.js');
    const filePath = path.join(PROJECT_ROOT, pkg.bin['grd-tools']);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('bin["grd-mcp-server"] points to bin/grd-mcp-server.js and file exists', () => {
    expect(pkg.bin['grd-mcp-server']).toBe('bin/grd-mcp-server.js');
    const filePath = path.join(PROJECT_ROOT, pkg.bin['grd-mcp-server']);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('files whitelist contains required entries', () => {
    expect(pkg.files).toEqual(
      expect.arrayContaining([
        'bin/',
        'lib/',
        'commands/',
        'agents/',
        '.claude-plugin/plugin.json',
      ])
    );
  });

  test('engines.node is ">=18"', () => {
    expect(pkg.engines.node).toBe('>=18');
  });

  test('dependencies field is absent or empty (zero runtime deps)', () => {
    if (pkg.dependencies) {
      expect(Object.keys(pkg.dependencies)).toHaveLength(0);
    } else {
      expect(pkg.dependencies).toBeUndefined();
    }
  });

  test('scripts.postinstall references bin/postinstall.js', () => {
    expect(pkg.scripts.postinstall).toMatch(/bin\/postinstall\.js/);
  });

  test('has repository field', () => {
    expect(pkg.repository).toBeDefined();
    expect(pkg.repository.type).toBe('git');
  });

  test('has keywords array', () => {
    expect(Array.isArray(pkg.keywords)).toBe(true);
    expect(pkg.keywords.length).toBeGreaterThan(0);
  });
});

// ─── postinstall script tests ───────────────────────────────────────────────

describe('postinstall script', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-postinstall-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const EXPECTED_DIRS = [
    '.planning',
    '.planning/phases',
    '.planning/research',
    '.planning/research/deep-dives',
    '.planning/codebase',
    '.planning/todos',
  ];

  test('creates all expected directories in empty dir', () => {
    execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });

    for (const dir of EXPECTED_DIRS) {
      const fullPath = path.join(tmpDir, dir);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).isDirectory()).toBe(true);
    }
  });

  test('creates .planning/config.json with valid JSON', () => {
    execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });

    const configPath = path.join(tmpDir, '.planning', 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(typeof config).toBe('object');
  });

  test('default config.json has expected keys', () => {
    execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });

    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    expect(config).toHaveProperty('model_profile');
    expect(config).toHaveProperty('commit_docs');
    expect(config).toHaveProperty('autonomous_mode');
    expect(config).toHaveProperty('research_gates');
    expect(config).toHaveProperty('confirmation_gates');
    expect(config).toHaveProperty('eval_config');
    expect(config.eval_config).toHaveProperty('default_metrics');
    expect(config.eval_config).toHaveProperty('baseline_tracking');
  });

  test('default config.json has correct default values', () => {
    execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });

    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    expect(config.model_profile).toBe('balanced');
    expect(config.commit_docs).toBe(true);
    expect(config.autonomous_mode).toBe(false);
  });

  test('does NOT overwrite existing config.json (idempotency)', () => {
    // First run: create structure
    execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });

    // Modify config with custom content
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const customConfig = { custom: 'user-config', model_profile: 'quality' };
    fs.writeFileSync(configPath, JSON.stringify(customConfig));

    // Second run: should not overwrite
    execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });

    const afterConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(afterConfig).toEqual(customConfig);
  });

  test('does NOT create duplicate directories on second run (idempotent)', () => {
    // First run
    execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });

    // Add a marker file to verify existing content is preserved
    const markerPath = path.join(tmpDir, '.planning', 'marker.txt');
    fs.writeFileSync(markerPath, 'test');

    // Second run
    execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });

    // All dirs still exist
    for (const dir of EXPECTED_DIRS) {
      expect(fs.existsSync(path.join(tmpDir, dir))).toBe(true);
    }

    // Marker file preserved
    expect(fs.existsSync(markerPath)).toBe(true);
    expect(fs.readFileSync(markerPath, 'utf8')).toBe('test');
  });

  test('exits with code 0 on fresh run', () => {
    // execFileSync throws on non-zero exit, so no throw = exit 0
    expect(() => {
      execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });
    }).not.toThrow();
  });

  test('exits with code 0 on idempotent run', () => {
    execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });

    expect(() => {
      execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });
    }).not.toThrow();
  });

  test('prints creation message on first run', () => {
    const result = execFileSync('node', [POSTINSTALL_SCRIPT], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    expect(result).toContain('GRD: Created .planning/ directory structure');
  });

  test('prints nothing on subsequent runs', () => {
    execFileSync('node', [POSTINSTALL_SCRIPT], { cwd: tmpDir });

    const result = execFileSync('node', [POSTINSTALL_SCRIPT], {
      cwd: tmpDir,
      encoding: 'utf8',
    });

    expect(result.trim()).toBe('');
  });
});
