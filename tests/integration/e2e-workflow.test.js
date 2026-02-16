/**
 * End-to-end integration tests for v0.1.1 feature chain
 *
 * Validates all v0.1.1 features work together in sequence:
 *   Backend detection -> Context init -> Quality analysis -> Doc drift -> MCP server
 *
 * Uses direct module imports (not CLI subprocess calls) for speed and directness.
 * Follows existing test conventions from cli.test.js (temp dirs, fixture copying).
 *
 * Satisfies REQ-20: Integration & Cross-Feature Validation.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const FIXTURE_SOURCE = path.resolve(__dirname, '../fixtures/planning');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a temp directory with a copy of the fixture .planning/ structure
 * and minimal project scaffolding for quality analysis.
 */
function createTestDir() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-e2e-'));
  const dest = path.join(tmpRoot, '.planning');
  fs.cpSync(FIXTURE_SOURCE, dest, { recursive: true });

  // Create lib/ with a sample JS file for quality analysis
  fs.mkdirSync(path.join(tmpRoot, 'lib'), { recursive: true });
  fs.writeFileSync(
    path.join(tmpRoot, 'lib', 'sample.js'),
    [
      '/**',
      ' * Sample module for quality analysis testing.',
      ' * @param {string} name - The name',
      ' * @returns {string}',
      ' */',
      'function greet(name) {',
      '  return `Hello, ${name}!`;',
      '}',
      '',
      'module.exports = { greet };',
      '',
    ].join('\n')
  );

  return tmpRoot;
}

function cleanupDir(dir) {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Shared fixture ───────────────────────────────────────────────────────────

let fixtureDir;

beforeAll(() => {
  fixtureDir = createTestDir();
});

afterAll(() => {
  cleanupDir(fixtureDir);
});

// ─── 1. Backend Detection ─────────────────────────────────────────────────────

describe('E2E: Backend detection', () => {
  const { detectBackend, getBackendCapabilities, resolveBackendModel } = require('../../lib/backend');

  test('detectBackend returns a valid backend string', () => {
    const backend = detectBackend(fixtureDir);
    expect(typeof backend).toBe('string');
    expect(['claude', 'codex', 'gemini', 'opencode']).toContain(backend);
  });

  test('getBackendCapabilities returns capability flags with expected keys', () => {
    const backend = detectBackend(fixtureDir);
    const caps = getBackendCapabilities(backend);
    expect(caps).toHaveProperty('subagents');
    expect(caps).toHaveProperty('parallel');
    expect(caps).toHaveProperty('teams');
    expect(caps).toHaveProperty('hooks');
    expect(caps).toHaveProperty('mcp');
  });

  test('resolveBackendModel maps tiers to concrete model names', () => {
    const backend = detectBackend(fixtureDir);
    const opusModel = resolveBackendModel(backend, 'opus');
    const sonnetModel = resolveBackendModel(backend, 'sonnet');
    const haikuModel = resolveBackendModel(backend, 'haiku');
    expect(typeof opusModel).toBe('string');
    expect(typeof sonnetModel).toBe('string');
    expect(typeof haikuModel).toBe('string');
    expect(opusModel.length).toBeGreaterThan(0);
  });
});

// ─── 2. Context Init Enrichment ───────────────────────────────────────────────

describe('E2E: Context init enrichment', () => {
  const { captureExecution } = require('../../lib/mcp-server');
  const {
    cmdInitExecutePhase,
    cmdInitPlanPhase,
    cmdInitResume,
  } = require('../../lib/context');

  test('cmdInitExecutePhase returns backend-enriched context', () => {
    const result = captureExecution(() => {
      cmdInitExecutePhase(fixtureDir, '1', new Set(), false);
    });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('backend');
    expect(data).toHaveProperty('backend_capabilities');
    expect(data).toHaveProperty('executor_model');
    expect(data.backend_capabilities).toHaveProperty('mcp');
    expect(['claude', 'codex', 'gemini', 'opencode']).toContain(data.backend);
  });

  test('cmdInitPlanPhase returns backend-enriched context', () => {
    const result = captureExecution(() => {
      cmdInitPlanPhase(fixtureDir, '1', new Set(), false);
    });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('backend');
    expect(data).toHaveProperty('backend_capabilities');
    expect(data).toHaveProperty('planner_model');
  });

  test('cmdInitResume returns backend-enriched context', () => {
    const result = captureExecution(() => {
      cmdInitResume(fixtureDir, false);
    });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data).toHaveProperty('backend');
    expect(data).toHaveProperty('backend_capabilities');
  });
});

// ─── 3. Quality Analysis Pipeline ─────────────────────────────────────────────

describe('E2E: Quality analysis pipeline', () => {
  const { runQualityAnalysis, generateCleanupPlan, getCleanupConfig } = require('../../lib/cleanup');

  test('runQualityAnalysis returns quality report with expected fields when enabled', () => {
    // Enable cleanup in the fixture config
    const configPath = path.join(fixtureDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.phase_cleanup = { enabled: true, refactoring: false, doc_sync: false };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const report = runQualityAnalysis(fixtureDir, '1');
    expect(report).toHaveProperty('phase', '1');
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('summary');
    expect(report.summary).toHaveProperty('total_issues');
    expect(report.summary).toHaveProperty('complexity_violations');
    expect(report.summary).toHaveProperty('dead_exports');
    expect(report.summary).toHaveProperty('oversized_files');
    expect(report).toHaveProperty('details');
  });

  test('runQualityAnalysis includes doc_drift when doc_sync is enabled', () => {
    const configPath = path.join(fixtureDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.phase_cleanup = { enabled: true, refactoring: false, doc_sync: true };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const report = runQualityAnalysis(fixtureDir, '1');
    expect(report.summary).toHaveProperty('doc_drift_issues');
    expect(report.details).toHaveProperty('doc_drift');
    expect(report.details.doc_drift).toHaveProperty('changelog');
    expect(report.details.doc_drift).toHaveProperty('readme_links');
    expect(report.details.doc_drift).toHaveProperty('jsdoc');
  });

  test('generateCleanupPlan returns null when issues below threshold', () => {
    // Use a report with 0 issues
    const lowReport = {
      phase: '1',
      timestamp: '2026-02-16',
      summary: { total_issues: 0 },
      details: { complexity: [], dead_exports: [], file_size: [] },
    };
    const result = generateCleanupPlan(fixtureDir, '1', lowReport);
    expect(result).toBeNull();
  });
});

// ─── 4. MCP Server Tool Call ──────────────────────────────────────────────────

describe('E2E: MCP server tool call', () => {
  const { McpServer } = require('../../lib/mcp-server');

  let server;

  beforeAll(() => {
    server = new McpServer({ cwd: fixtureDir });
  });

  test('initialize handshake returns protocolVersion and serverInfo', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0.0.1' },
      },
    });
    expect(response.id).toBe(1);
    expect(response.result).toHaveProperty('protocolVersion');
    expect(response.result).toHaveProperty('capabilities');
    expect(response.result).toHaveProperty('serverInfo');
    expect(response.result.serverInfo.name).toBe('grd-mcp-server');
  });

  test('tools/list returns more than 50 tools', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });
    expect(response.result).toHaveProperty('tools');
    expect(Array.isArray(response.result.tools)).toBe(true);
    expect(response.result.tools.length).toBeGreaterThan(50);
  });

  test('tools/call for grd_state_load returns content with isError absent', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'grd_state_load', arguments: {} },
    });
    expect(response.result).toHaveProperty('content');
    expect(response.result.content[0]).toHaveProperty('type', 'text');
    expect(response.result.isError).toBeUndefined();
    // Verify content is valid JSON
    const parsed = JSON.parse(response.result.content[0].text);
    expect(parsed).toHaveProperty('config');
  });

  test('tools/call for grd_detect_backend returns backend info', () => {
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'grd_detect_backend', arguments: {} },
    });
    expect(response.result).toHaveProperty('content');
    expect(response.result.isError).toBeUndefined();
    const parsed = JSON.parse(response.result.content[0].text);
    expect(parsed).toHaveProperty('backend');
    expect(parsed).toHaveProperty('capabilities');
  });
});

// ─── 5. Sequential Pipeline ──────────────────────────────────────────────────

describe('E2E: Sequential pipeline', () => {
  const { detectBackend, getBackendCapabilities } = require('../../lib/backend');
  const { captureExecution, McpServer } = require('../../lib/mcp-server');
  const { cmdInitExecutePhase } = require('../../lib/context');
  const { runQualityAnalysis } = require('../../lib/cleanup');

  test('full chain: detectBackend -> context init -> quality analysis -> MCP tool call', () => {
    // Step 1: Detect backend
    const backend = detectBackend(fixtureDir);
    expect(['claude', 'codex', 'gemini', 'opencode']).toContain(backend);

    // Step 2: Verify backend name is usable
    const caps = getBackendCapabilities(backend);
    expect(caps).toHaveProperty('mcp');

    // Step 3: Context init (uses the detected backend internally)
    const initResult = captureExecution(() => {
      cmdInitExecutePhase(fixtureDir, '1', new Set(), false);
    });
    expect(initResult.exitCode).toBe(0);
    const initData = JSON.parse(initResult.stdout);
    expect(initData.backend).toBe(backend);

    // Step 4: Quality analysis
    const configPath = path.join(fixtureDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.phase_cleanup = { enabled: true, refactoring: false, doc_sync: true };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const qualityReport = runQualityAnalysis(fixtureDir, '1');
    expect(qualityReport).toHaveProperty('summary');
    expect(typeof qualityReport.summary.total_issues).toBe('number');

    // Step 5: MCP server tool call
    const server = new McpServer({ cwd: fixtureDir });
    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 100,
      method: 'tools/call',
      params: { name: 'grd_state_load', arguments: {} },
    });
    expect(response.result).toHaveProperty('content');
    expect(response.result.isError).toBeUndefined();
  });

  test('entire pipeline completes in under 10 seconds', () => {
    const start = Date.now();

    // Run the full chain
    const backend = detectBackend(fixtureDir);
    getBackendCapabilities(backend);

    const initResult = captureExecution(() => {
      cmdInitExecutePhase(fixtureDir, '1', new Set(), false);
    });
    JSON.parse(initResult.stdout);

    runQualityAnalysis(fixtureDir, '1');

    const server = new McpServer({ cwd: fixtureDir });
    server.handleMessage({
      jsonrpc: '2.0',
      id: 200,
      method: 'tools/call',
      params: { name: 'grd_state_load', arguments: {} },
    });

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });
});
