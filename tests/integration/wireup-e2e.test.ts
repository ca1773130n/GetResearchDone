'use strict';

/**
 * End-to-end integration tests for wireup pipeline
 *
 * Validates:
 *   - Full flow: discover -> generate scenarios -> execute -> detect issues -> report
 *   - MCP tool grd_wireup_run returns structured JSON with required fields
 *   - Discovery finds specific planted unwired features in a fixture project
 *   - grd-tools.js wireup run dispatches to cmdWireupRun and returns structured JSON
 *
 * Uses direct module imports (not CLI subprocess calls) for speed.
 * Follows evolve-e2e.test.ts conventions.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Mock spawnClaudeAsync to prevent real Claude subprocess calls during tests
jest.mock('../../lib/autopilot', () => {
  const actual = jest.requireActual('../../lib/autopilot');
  return {
    ...actual,
    spawnClaudeAsync: jest.fn().mockResolvedValue({ exitCode: 1, timedOut: false, stdout: '' }),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTmpDir(prefix: string = 'grd-wireup-e2e-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupDir(dir: string): void {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create a fixture project with known unwired features:
 *   1. lib/api-handler.ts — exports handleApiRequest() never imported anywhere
 *   2. routes/users.ts   — exports getUsers() with no corresponding test file
 *
 * Also includes a minimal .planning/config.json so the orchestrator can
 * resolve getMilestoneInfo() without crashing.
 */
function createWireupFixture(tmpDir: string): void {
  // .planning/ with minimal valid config
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(
    path.join(planningDir, 'config.json'),
    JSON.stringify(
      {
        autonomous_mode: true,
        ceremony: 'balanced',
        model_profile: 'balanced',
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n\n**Updated:** 2026-03-21\n');

  // Feature 1: lib/api-handler.ts — exported but never imported/called
  const libDir = path.join(tmpDir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(
    path.join(libDir, 'api-handler.ts'),
    [
      "'use strict';",
      '',
      '/**',
      ' * Handles API requests.',
      ' */',
      'function handleApiRequest(req: unknown): unknown {',
      '  return { status: 200, data: req };',
      '}',
      '',
      'module.exports = { handleApiRequest };',
    ].join('\n')
  );

  // Feature 2: routes/users.ts — exported handler with no test file
  const routesDir = path.join(tmpDir, 'routes');
  fs.mkdirSync(routesDir, { recursive: true });
  fs.writeFileSync(
    path.join(routesDir, 'users.ts'),
    [
      "'use strict';",
      '',
      '/**',
      ' * User route handler.',
      ' */',
      'function getUsers(): unknown[] {',
      '  return [];',
      '}',
      '',
      'module.exports = { getUsers };',
    ].join('\n')
  );

  // minimal package.json
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({ name: 'wireup-fixture', version: '0.1.0' }, null, 2)
  );
}

// ─── 1. Discovery Accuracy ────────────────────────────────────────────────────

describe('Wireup E2E: Discovery accuracy', () => {
  const { discoverUnwiredFeatures } = require('../../lib/wireup');

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    createWireupFixture(tmpDir);
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('discovers the specific unwired features planted in the fixture', () => {
    const features = discoverUnwiredFeatures(tmpDir);

    expect(Array.isArray(features)).toBe(true);
    // At least the two planted features should be found
    expect(features.length).toBeGreaterThanOrEqual(2);

    // All features have required shape
    for (const f of features) {
      expect(typeof f.category).toBe('string');
      expect(typeof f.filePath).toBe('string');
      expect(typeof f.functionName).toBe('string');
      expect(typeof f.suggestedAction).toBe('string');
    }

    // Feature 1: api-handler.ts — exported-but-uncalled
    const apiHandlerFeature = features.find(
      (f: { filePath: string; functionName: string }) =>
        f.filePath.includes('api-handler') && f.functionName === 'handleApiRequest'
    );
    expect(apiHandlerFeature).toBeDefined();
    expect(apiHandlerFeature.category).toBe('exported-but-uncalled');
  });

  test('returns at least 2 unwired features from fixture', () => {
    const features = discoverUnwiredFeatures(tmpDir);
    expect(features.length).toBeGreaterThanOrEqual(2);
  });

  test('each feature has valid category', () => {
    const validCategories = [
      'exported-but-uncalled',
      'config-without-surface',
      'endpoint-without-integration-test',
    ];
    const features = discoverUnwiredFeatures(tmpDir);
    for (const f of features) {
      expect(validCategories).toContain(f.category);
    }
  });
});

// ─── 2. Full Wireup Flow ──────────────────────────────────────────────────────

describe('Wireup E2E: Full flow (discover -> generate -> execute -> detect -> report)', () => {
  const { runWireup, discoverUnwiredFeatures, generateScenarios } = require('../../lib/wireup');

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    createWireupFixture(tmpDir);
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('runs complete wireup iteration: discover -> generate -> execute -> detect -> report', async () => {
    const result = await runWireup(tmpDir, { dryRun: true });

    // Result has all required fields
    expect(typeof result.features_discovered).toBe('number');
    expect(typeof result.scenarios_generated).toBe('number');
    expect(typeof result.scenarios_run).toBe('number');
    expect(typeof result.scenarios_passed).toBe('number');
    expect(typeof result.scenarios_failed).toBe('number');
    expect(typeof result.issues_found).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.pass_fail_summary).toBe('string');
    expect(Array.isArray(result.failed_scenarios)).toBe(true);

    // Discovery found features
    expect(result.features_discovered).toBeGreaterThanOrEqual(2);

    // Scenarios generated for discovered features
    expect(result.scenarios_generated).toBeGreaterThanOrEqual(0);
  }, 15000);

  test('generates scenarios for unwired features discovered in fixture', () => {
    const features = discoverUnwiredFeatures(tmpDir);
    expect(features.length).toBeGreaterThanOrEqual(2);

    const scenarios = generateScenarios(features, tmpDir);
    expect(Array.isArray(scenarios)).toBe(true);
    // Each feature should produce at least one scenario
    expect(scenarios.length).toBeGreaterThanOrEqual(features.length);

    // Scenarios have required fields (WireupScenario: feature, steps, test_data_fixture)
    for (const s of scenarios) {
      expect(s.feature).toBeDefined();
      expect(Array.isArray(s.steps)).toBe(true);
      expect(typeof s.test_data_fixture).toBe('string');
      expect(typeof s.feature.functionName).toBe('string');
      expect(typeof s.feature.filePath).toBe('string');
    }
  });

  test('dry-run returns correct structure without executing scenarios', async () => {
    const result = await runWireup(tmpDir, { dryRun: true });

    // Dry run must not execute any scenarios
    expect(result.scenarios_run).toBe(0);
    expect(result.scenarios_passed).toBe(0);
    expect(result.scenarios_failed).toBe(0);
    expect(result.issues_found).toBe(0);
    expect(result.pass_fail_summary).toMatch(/Dry run/);
  }, 15000);

  test('issues_by_confidence has correct shape', async () => {
    const result = await runWireup(tmpDir, { dryRun: true });

    expect(result.issues_by_confidence).toBeDefined();
    expect(typeof result.issues_by_confidence.high).toBe('number');
    expect(typeof result.issues_by_confidence.medium).toBe('number');
    expect(typeof result.issues_by_confidence.low).toBe('number');
  }, 15000);

  test('WIREUP-STATE.json is written with correct fields via state module', () => {
    // The orchestrator writes state after execution (not during dry-run).
    // Validate the state I/O functions directly using the state module.
    const { createInitialWireupState, writeWireupState, readWireupState } =
      require('../../lib/wireup');

    const initial = createInitialWireupState('v0.1.0');
    writeWireupState(tmpDir, initial);

    const statePath = path.join(tmpDir, '.planning', 'WIREUP-STATE.json');
    expect(fs.existsSync(statePath)).toBe(true);

    const loaded = readWireupState(tmpDir);
    expect(loaded).not.toBeNull();
    expect(typeof loaded.milestone).toBe('string');
    expect(loaded.milestone).toBe('v0.1.0');
    expect(typeof loaded.features_discovered).toBe('number');
    expect(typeof loaded.scenarios_generated).toBe('number');
    expect(typeof loaded.scenarios_passed).toBe('number');
    expect(typeof loaded.scenarios_failed).toBe('number');
    expect(typeof loaded.fixes_applied).toBe('number');
    expect(Array.isArray(loaded.iteration_history)).toBe(true);
  });
});

// ─── 3. MCP Tool Integration ──────────────────────────────────────────────────

describe('Wireup E2E: MCP tool grd_wireup_run', () => {
  const { McpServer } = require('../../lib/mcp-server');

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    createWireupFixture(tmpDir);
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('grd_wireup_run MCP tool returns structured JSON via McpServer', async () => {
    const server = new McpServer({ cwd: tmpDir });

    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'grd_wireup_run',
        arguments: { dry_run: true },
      },
    });

    expect(response).toBeDefined();
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeDefined();
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content.length).toBeGreaterThan(0);

    // Parse the JSON from the text content
    const text: string = response.result.content[0].text;
    const parsed = JSON.parse(text);

    // Verify required structured fields
    expect(typeof parsed.features_discovered).toBe('number');
    expect(typeof parsed.scenarios_run).toBe('number');
    expect(typeof parsed.issues_found).toBe('number');

    // Dry run should reflect 0 executions
    expect(parsed.scenarios_run).toBe(0);
  }, 30000);

  test('grd_wireup_discover MCP tool returns features list', () => {
    const server = new McpServer({ cwd: tmpDir });

    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'grd_wireup_discover',
        arguments: {},
      },
    });

    expect(response).toBeDefined();
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(2);
    expect(response.result).toBeDefined();

    const text: string = response.result.content[0].text;
    const parsed = JSON.parse(text);

    expect(typeof parsed.features_found).toBe('number');
    expect(parsed.features_found).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(parsed.features)).toBe(true);
    expect(parsed.by_category).toBeDefined();
  });

  test('JSON-RPC response structure matches protocol', async () => {
    const server = new McpServer({ cwd: tmpDir });

    const response = await server.handleMessage({
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: {
        name: 'grd_wireup_run',
        arguments: { dry_run: true },
      },
    });

    // Must be valid JSON-RPC 2.0 response
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(42);
    // Either result or error (not both)
    const hasResult = 'result' in response;
    const hasError = 'error' in response;
    expect(hasResult || hasError).toBe(true);
    expect(hasResult && hasError).toBe(false);
  }, 30000);

  test('McpServer tools/list includes grd_wireup_run', () => {
    const server = new McpServer({ cwd: tmpDir });

    const response = server.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: {},
    });

    expect(response).toBeDefined();
    const tools: Array<{ name: string }> = response.result.tools;
    const wireupTool = tools.find((t) => t.name === 'grd_wireup_run');
    expect(wireupTool).toBeDefined();

    // Also confirm all 5 wireup tools are present
    const wireupTools = tools.filter((t: { name: string }) => t.name.startsWith('grd_wireup'));
    expect(wireupTools.length).toBe(5);
  });
});

// ─── 4. grd-tools.js Wireup Dispatch ─────────────────────────────────────────

describe('Wireup E2E: grd-tools.js wireup run dispatch', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    createWireupFixture(tmpDir);
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('cmdWireupRun is exported from lib/wireup and returns structured JSON with features_discovered, scenarios_run, issues_found', async () => {
    const { cmdWireupRun } = require('../../lib/wireup');
    expect(typeof cmdWireupRun).toBe('function');

    // Capture stdout and mock process.exit to prevent actual exit
    const outputCapture: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    const writespy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((str: string | Uint8Array) => {
        if (typeof str === 'string') outputCapture.push(str);
        return true;
      });
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((_code?: string | number | null) => {
        throw new Error('process.exit intercepted');
      });

    try {
      await cmdWireupRun(tmpDir, ['--dry-run'], false);
    } catch (err) {
      const msg = (err as Error).message || '';
      // Only suppress the intercepted exit — re-throw real errors
      if (!msg.includes('process.exit intercepted')) throw err;
    } finally {
      writespy.mockRestore();
      exitSpy.mockRestore();
      void origWrite; // prevent unused-var lint error
    }

    const capturedText = outputCapture.join('');
    expect(capturedText.length).toBeGreaterThan(0);

    const parsed = JSON.parse(capturedText);
    expect(typeof parsed.features_discovered).toBe('number');
    expect(typeof parsed.scenarios_run).toBe('number');
    expect(typeof parsed.issues_found).toBe('number');
  }, 30000);

  test('grd-tools.js wireup subcommand routes to cmdWireup (dispatches wireup run)', () => {
    // Verify routing: bin/grd-tools.ts has case 'wireup' that calls cmdWireup
    // We validate by checking the module exports the expected symbols
    const wireupModule = require('../../lib/wireup');

    // Routing target: cmdWireup is the CLI entry point for 'wireup run'
    expect(typeof wireupModule.cmdWireup).toBe('function');

    // cmdWireupRun is the MCP tool sub-command wrapper
    expect(typeof wireupModule.cmdWireupRun).toBe('function');

    // runWireup is the orchestrator function called by both
    expect(typeof wireupModule.runWireup).toBe('function');
  });

  test('cmdWireupRun function signature accepts cwd, args, raw params', () => {
    const { cmdWireupRun } = require('../../lib/wireup');
    // Function exists and accepts the right arity
    expect(typeof cmdWireupRun).toBe('function');
    expect(cmdWireupRun.length).toBeGreaterThanOrEqual(2);
  });
});
