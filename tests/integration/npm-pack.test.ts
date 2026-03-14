/**
 * Integration tests for npm distribution pipeline.
 *
 * Validates end-to-end: npm build -> npm pack -> install from tarball ->
 * dist/ bin entries -> MCP server start -> plugin.json resolution.
 * Uses real npm commands via execFileSync/spawn against a temp consumer project.
 *
 * Created in Phase 18 Plan 02 (Distribution Validation).
 * Updated in Phase 65 Plan 03 to validate dist/ build paths.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.setTimeout(60000);

const PROJECT_ROOT = path.resolve(__dirname, '../../');

let tarballPath: string;
let tarballName: string;
let tempDir: string;
let consumerDir: string;

// --- Setup / Teardown --------------------------------------------------------

beforeAll(() => {
  // Build dist/ first so it is included in the tarball
  execFileSync('npm', ['run', 'build'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  // Pack once for all tests
  const packOutput = execFileSync('npm', ['pack', '--json'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
  });
  const packInfo = JSON.parse(packOutput);
  tarballName = packInfo[0].filename;
  tarballPath = path.join(PROJECT_ROOT, tarballName);

  // Create temp consumer directory
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-pack-test-'));
  consumerDir = path.join(tempDir, 'consumer');
  fs.mkdirSync(consumerDir, { recursive: true });

  // Create minimal consumer package.json
  fs.writeFileSync(
    path.join(consumerDir, 'package.json'),
    JSON.stringify(
      { name: 'test-consumer', version: '1.0.0', private: true },
      null,
      2,
    ) + '\n',
  );

  // Install from tarball with --ignore-scripts to avoid postinstall requiring
  // ts-jest or native TS support in the consumer context
  execFileSync('npm', ['install', '--ignore-scripts', tarballPath], {
    cwd: consumerDir,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
});

afterAll(() => {
  // Clean up tarball
  if (tarballPath && fs.existsSync(tarballPath)) {
    fs.unlinkSync(tarballPath);
  }
  // Clean up temp directory
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// --- 1. npm pack validation --------------------------------------------------

describe('npm pack validation', () => {
  let dryRunInfo: any;
  let dryRunFilePaths: string[];

  beforeAll(() => {
    const dryRunOutput = execFileSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
    });
    dryRunInfo = JSON.parse(dryRunOutput);
    dryRunFilePaths = dryRunInfo[0].files.map((f: any) => f.path);
  });

  test('npm pack produces a .tgz tarball', () => {
    expect(tarballName).toMatch(/^grd-tools-.*\.tgz$/);
    expect(fs.existsSync(tarballPath)).toBe(true);
  });

  test('pack JSON output includes expected file count', () => {
    // Should have at least 20 files (bin, lib, dist, commands, agents, plugin.json)
    expect(dryRunInfo[0].files.length).toBeGreaterThanOrEqual(20);
  });

  test('tarball contains all required files', () => {
    // bin/ entries (CJS proxies)
    expect(dryRunFilePaths).toContain('bin/grd-tools.js');
    expect(dryRunFilePaths).toContain('bin/grd-mcp-server.js');
    expect(dryRunFilePaths).toContain('bin/postinstall.js');

    // lib/ files (spot-check key .ts modules — no .js proxies after tsx migration)
    expect(dryRunFilePaths).toContain('lib/backend.ts');
    expect(dryRunFilePaths).toContain('lib/mcp-server.ts');
    expect(dryRunFilePaths).toContain('lib/utils.ts');

    // dist/ compiled output
    const distFiles = dryRunFilePaths.filter((p) => p.startsWith('dist/'));
    expect(distFiles.length).toBeGreaterThan(0);
    expect(dryRunFilePaths).toContain('dist/bin/grd-tools.js');
    expect(dryRunFilePaths).toContain('dist/bin/grd-mcp-server.js');

    // .claude-plugin/plugin.json
    expect(dryRunFilePaths).toContain('.claude-plugin/plugin.json');

    // agents/ and commands/ directories should have contents
    const agentFiles = dryRunFilePaths.filter((p) => p.startsWith('agents/'));
    expect(agentFiles.length).toBeGreaterThan(0);

    const commandFiles = dryRunFilePaths.filter((p) =>
      p.startsWith('commands/'),
    );
    expect(commandFiles.length).toBeGreaterThan(0);
  });

  test('tarball excludes test files, .planning/, .github/, and coverage/', () => {
    const excluded = dryRunFilePaths.filter(
      (p) =>
        p.startsWith('tests/') ||
        p.startsWith('.planning/') ||
        p.startsWith('.github/') ||
        p.startsWith('coverage/'),
    );
    expect(excluded).toEqual([]);
  });
});

// --- 2. npm install from tarball ---------------------------------------------

describe('npm install from tarball', () => {
  test('consumer project has node_modules/grd-tools/', () => {
    const installedDir = path.join(consumerDir, 'node_modules', 'grd-tools');
    expect(fs.existsSync(installedDir)).toBe(true);
  });

  test('grd-tools bin symlink exists', () => {
    const binDir = path.join(consumerDir, 'node_modules', '.bin');
    // On all platforms, the .bin directory should contain grd-tools entry
    const entries = fs.readdirSync(binDir) as string[];
    const hasGrdTools = entries.some((e: string) => e.startsWith('grd-tools'));
    expect(hasGrdTools).toBe(true);
  });

  test('grd-mcp-server bin symlink exists', () => {
    const binDir = path.join(consumerDir, 'node_modules', '.bin');
    const entries = fs.readdirSync(binDir) as string[];
    const hasMcpServer = entries.some((e: string) =>
      e.startsWith('grd-mcp-server'),
    );
    expect(hasMcpServer).toBe(true);
  });

  test('installed package contains bin/ lib/ dist/ agents/ commands/ directories', () => {
    const installedDir = path.join(consumerDir, 'node_modules', 'grd-tools');
    expect(fs.existsSync(path.join(installedDir, 'bin'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'lib'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'dist'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'agents'))).toBe(true);
    expect(fs.existsSync(path.join(installedDir, 'commands'))).toBe(true);
  });
});

// --- 3. Bin entry execution (via dist/ build) --------------------------------

describe('bin entry execution', () => {
  test('dist/bin/grd-tools.js produces valid output', () => {
    const grdToolsPath = path.join(
      consumerDir,
      'node_modules',
      'grd-tools',
      'dist',
      'bin',
      'grd-tools.js',
    );

    try {
      const stdout = execFileSync('node', [grdToolsPath], {
        encoding: 'utf-8',
        timeout: 10000,
      });
      // If it exits 0, verify it produced some output
      expect(stdout.length).toBeGreaterThan(0);
    } catch (err: unknown) {
      // Exit code 1 with usage info in stderr is acceptable
      const e = err as { status?: number; stderr?: string };
      expect(e.status).toBe(1);
      expect(e.stderr).toMatch(/Usage/i);
    }
  });

  test('dist/bin/grd-mcp-server.js responds to MCP initialize handshake', () => {
    const mcpServerPath = path.join(
      consumerDir,
      'node_modules',
      'grd-tools',
      'dist',
      'bin',
      'grd-mcp-server.js',
    );

    // Send initialize message via stdin using input option (synchronous, no open handles)
    const initMsg = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    const stdout = execFileSync('node', [mcpServerPath], {
      cwd: consumerDir,
      encoding: 'utf-8',
      input: initMsg + '\n',
      timeout: 10000,
    });

    const response = JSON.parse(stdout.trim().split('\n')[0]);
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result).toBeDefined();
    expect(response.result.protocolVersion).toBeDefined();
  });

  test('postinstall.js has executable shebang', () => {
    const postinstallPath = path.join(
      consumerDir,
      'node_modules',
      'grd-tools',
      'bin',
      'postinstall.js',
    );
    const content = fs.readFileSync(postinstallPath, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });
});

// --- 4. plugin.json path resolution -----------------------------------------

describe('plugin.json path resolution', () => {
  test('plugin.json exists at expected installed path', () => {
    const pluginPath = path.join(
      consumerDir,
      'node_modules',
      'grd-tools',
      '.claude-plugin',
      'plugin.json',
    );
    expect(fs.existsSync(pluginPath)).toBe(true);
  });

  test('plugin.json parses as valid JSON with expected fields', () => {
    const pluginPath = path.join(
      consumerDir,
      'node_modules',
      'grd-tools',
      '.claude-plugin',
      'plugin.json',
    );
    const content = JSON.parse(fs.readFileSync(pluginPath, 'utf-8'));
    expect(content.name).toBeDefined();
    expect(content.version).toBeDefined();
    expect(content.description).toBeDefined();
  });

  test('plugin.json hook command uses ${CLAUDE_PLUGIN_ROOT} variable', () => {
    const pluginPath = path.join(
      consumerDir,
      'node_modules',
      'grd-tools',
      '.claude-plugin',
      'plugin.json',
    );
    const raw = fs.readFileSync(pluginPath, 'utf-8');
    expect(raw).toContain('${CLAUDE_PLUGIN_ROOT}');
    // Should NOT have hardcoded absolute paths
    expect(raw).not.toMatch(/\/Users\/|\/home\//);
  });
});
