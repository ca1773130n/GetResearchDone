/**
 * Unit tests for cmdSetup in lib/commands.js
 *
 * Tests the setup command that configures Claude Code to use the installed
 * GRD package as a plugin. Covers JSON output, raw output, idempotency,
 * and error handling for invalid installations.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { cmdSetup } = require('../../lib/commands');

// ─── JSON Output ─────────────────────────────────────────────────────────────

describe('cmdSetup — JSON output', () => {
  test('outputs valid JSON with required fields', () => {
    const cwd = process.cwd();
    const { stdout, exitCode } = captureOutput(() => cmdSetup(cwd, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('package_root');
    expect(result).toHaveProperty('plugin_json');
    expect(result).toHaveProperty('instructions');
  });

  test('package_root is an absolute path', () => {
    const cwd = process.cwd();
    const { stdout } = captureOutput(() => cmdSetup(cwd, false));
    const result = JSON.parse(stdout);
    expect(path.isAbsolute(result.package_root)).toBe(true);
  });

  test('plugin_json ends with .claude-plugin/plugin.json', () => {
    const cwd = process.cwd();
    const { stdout } = captureOutput(() => cmdSetup(cwd, false));
    const result = JSON.parse(stdout);
    expect(result.plugin_json).toMatch(/\.claude-plugin\/plugin\.json$/);
  });

  test('plugin_json points to a file that exists on disk', () => {
    const cwd = process.cwd();
    const { stdout } = captureOutput(() => cmdSetup(cwd, false));
    const result = JSON.parse(stdout);
    expect(fs.existsSync(result.plugin_json)).toBe(true);
  });

  test('package_root points to a directory that exists on disk', () => {
    const cwd = process.cwd();
    const { stdout } = captureOutput(() => cmdSetup(cwd, false));
    const result = JSON.parse(stdout);
    expect(fs.existsSync(result.package_root)).toBe(true);
    expect(fs.statSync(result.package_root).isDirectory()).toBe(true);
  });

  test('instructions contain plugin path', () => {
    const cwd = process.cwd();
    const { stdout } = captureOutput(() => cmdSetup(cwd, false));
    const result = JSON.parse(stdout);
    expect(result.instructions).toContain('.claude-plugin');
  });
});

// ─── Raw Output ──────────────────────────────────────────────────────────────

describe('cmdSetup — raw output', () => {
  test('outputs human-readable text containing package root path', () => {
    const cwd = process.cwd();
    const { stdout, exitCode } = captureOutput(() => cmdSetup(cwd, true));
    expect(exitCode).toBe(0);
    // Should contain the package root (which is the repo root)
    const packageRoot = path.resolve(__dirname, '..', '..');
    expect(stdout).toContain(packageRoot);
  });

  test('output contains "plugin" text', () => {
    const cwd = process.cwd();
    const { stdout } = captureOutput(() => cmdSetup(cwd, true));
    expect(stdout.toLowerCase()).toContain('plugin');
  });

  test('output contains "GRD plugin configured"', () => {
    const cwd = process.cwd();
    const { stdout } = captureOutput(() => cmdSetup(cwd, true));
    expect(stdout).toContain('GRD plugin configured');
  });

  test('output contains .claude-plugin path', () => {
    const cwd = process.cwd();
    const { stdout } = captureOutput(() => cmdSetup(cwd, true));
    expect(stdout).toContain('.claude-plugin');
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

describe('cmdSetup — idempotency', () => {
  test('calling setup twice produces identical JSON output', () => {
    const cwd = process.cwd();
    const { stdout: stdout1 } = captureOutput(() => cmdSetup(cwd, false));
    const { stdout: stdout2 } = captureOutput(() => cmdSetup(cwd, false));
    expect(stdout1).toBe(stdout2);
  });

  test('calling setup twice produces identical raw output', () => {
    const cwd = process.cwd();
    const { stdout: stdout1 } = captureOutput(() => cmdSetup(cwd, true));
    const { stdout: stdout2 } = captureOutput(() => cmdSetup(cwd, true));
    expect(stdout1).toBe(stdout2);
  });
});

// ─── Error Handling ──────────────────────────────────────────────────────────

describe('cmdSetup — error handling', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && tmpDir.length > 0 && tmpDir.startsWith(os.tmpdir())) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = '';
    }
  });

  test('exits with error when .claude-plugin/plugin.json does not exist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-setup-test-'));
    // cmdSetup uses __dirname to find the package root, not cwd.
    // To test the error case, we need to mock path resolution.
    // Since cmdSetup resolves from __dirname (lib/), we mock fs.existsSync
    // to return false for the plugin.json path.
    const originalExistsSync = fs.existsSync;
    const existsMock = jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('.claude-plugin') && p.endsWith('plugin.json')) {
        return false;
      }
      return originalExistsSync(p);
    });

    try {
      const { stderr, exitCode } = captureError(() => cmdSetup(tmpDir, false));
      expect(exitCode).toBe(1);
      expect(stderr).toContain('GRD installation not found');
    } finally {
      existsMock.mockRestore();
    }
  });

  test('error message includes helpful guidance', () => {
    const originalExistsSync = fs.existsSync;
    const existsMock = jest.spyOn(fs, 'existsSync').mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('.claude-plugin') && p.endsWith('plugin.json')) {
        return false;
      }
      return originalExistsSync(p);
    });

    try {
      const { stderr } = captureError(() => cmdSetup('/tmp/nonexistent', false));
      expect(stderr).toContain('valid GRD installation');
    } finally {
      existsMock.mockRestore();
    }
  });
});
