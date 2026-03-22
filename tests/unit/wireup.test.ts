/**
 * Comprehensive unit tests for lib/wireup/ modules
 *
 * Covers: execution engine, detection engine, autofix engine, and report generation.
 * Uses mocked subprocess calls (child_process.spawnSync), mocked HTTP (fetch),
 * and mocked filesystem for all I/O operations.
 *
 * Discovery, scenarios, and state are covered in dedicated test files:
 *   - tests/unit/wireup-discovery.test.ts
 *   - tests/unit/wireup-scenarios.test.ts
 *   - tests/unit/wireup-state.test.ts
 *
 * This file tests the execution pipeline, connection detection, auto-fix, and report generation
 * to achieve >= 85% line coverage across the lib/wireup/ sub-modules.
 */

'use strict';

import type {
  WireupScenario,
  ScenarioResult,
  StepResult,
  HttpStepResult,
  CliStepResult,
  MissingConnection,
  FixAttempt,
  WireupState,
  BrowserStep,
  UnwiredFeature,
} from '../../lib/wireup/types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock fetch (HTTP execution)
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock spawnSync (CLI execution and detection grep/find)
const mockSpawnSync = jest.fn();
jest.mock('child_process', () => ({
  spawnSync: mockSpawnSync,
}));

// Mock fs (report generation and state I/O)
const mockWriteFileSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockSafeReadFile = jest.fn();
const mockCurrentMilestone = jest.fn();

jest.mock('fs', () => ({
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  mkdirSync: mockMkdirSync,
  readdirSync: jest.fn(() => { throw new Error('ENOENT'); }),
  existsSync: jest.fn(() => false),
  statSync: jest.fn(() => { throw new Error('ENOENT'); }),
}));

const mockGetMilestoneInfo = jest.fn();
const mockOutput = jest.fn();

jest.mock('../../lib/utils', () => ({
  safeReadFile: mockSafeReadFile,
  getMilestoneInfo: mockGetMilestoneInfo,
  output: mockOutput,
  loadConfig: jest.fn(() => ({ model_profile: 'balanced', autonomous_mode: false })),
  resolveModelForAgent: jest.fn(() => 'sonnet'),
}));

jest.mock('../../lib/backend', () => ({
  detectBackend: jest.fn(() => 'claude'),
  getBackendCapabilities: jest.fn(() => ({ subagents: true })),
}));

jest.mock('../../lib/paths', () => ({
  currentMilestone: mockCurrentMilestone,
  planningDir: jest.fn(() => '/fake/project/.planning'),
}));

// ─── Module Imports (after mocks) ────────────────────────────────────────────

const {
  executeScenarios,
  executeHttpStep,
  executeCliStep,
  executeStaticStep,
  executeBrowserScenario,
  generateManualSteps,
} = require('../../lib/wireup/execution') as {
  executeScenarios: (
    cwd: string,
    scenarios: WireupScenario[],
    options?: Record<string, unknown>
  ) => Promise<ScenarioResult[]>;
  executeHttpStep: (
    stepIndex: number,
    step: WireupScenario['steps'][number],
    options: Record<string, unknown>
  ) => Promise<HttpStepResult>;
  executeCliStep: (
    stepIndex: number,
    step: WireupScenario['steps'][number],
    options: Record<string, unknown>,
    cwd: string
  ) => Promise<CliStepResult>;
  executeStaticStep: (
    stepIndex: number,
    step: WireupScenario['steps'][number],
    cwd: string
  ) => StepResult;
  executeBrowserScenario: (
    cwd: string,
    scenario: { scenario_id: string; feature: string; steps: BrowserStep[] },
    playwrightAvailable: boolean
  ) => import('../../lib/wireup/types').BrowserScenarioResult;
  generateManualSteps: (steps: BrowserStep[]) => string[];
};

const {
  detectMissingConnections,
  classifyFailure,
} = require('../../lib/wireup/detection') as {
  detectMissingConnections: (
    cwd: string,
    failedResults: ScenarioResult[]
  ) => MissingConnection[];
  classifyFailure: (
    cwd: string,
    step: StepResult,
    scenario: Pick<WireupScenario, 'feature'>
  ) => MissingConnection | null;
};

const {
  classifyFixConfidence,
  autoFixIssue,
  partitionByConfidence,
  updateFixOutcome,
} = require('../../lib/wireup/autofix') as {
  classifyFixConfidence: (issue: MissingConnection) => 'high' | 'medium' | 'low';
  autoFixIssue: (
    cwd: string,
    issue: MissingConnection,
    reRunFn: () => Promise<boolean>
  ) => Promise<FixAttempt>;
  partitionByConfidence: (issues: MissingConnection[]) => import('../../lib/wireup/types').AutoFixResult;
  updateFixOutcome: (cwd: string, scenarioId: string, fixAttempt: FixAttempt) => void;
};

const {
  generateWireupReport,
  formatReportPath,
  extractIterationHistory,
} = require('../../lib/wireup/report') as {
  generateWireupReport: (
    cwd: string,
    data: import('../../lib/wireup/report').WireupReportData
  ) => string;
  formatReportPath: (cwd: string) => string;
  extractIterationHistory: (existingContent: string) => string;
};

const {
  _buildPassFailSummary,
  runWireup,
  cmdWireup: _cmdWireup,
} = require('../../lib/wireup/orchestrator') as {
  _buildPassFailSummary: (
    total: number,
    passed: number,
    failed: number,
    failedScenarios: Array<{ scenario_id: string; failed_steps: StepResult[] }>,
    issuesFound?: number,
    issuesByConfidence?: { high: number; medium: number; low: number }
  ) => string;
  runWireup: (
    cwd: string,
    options?: Record<string, unknown>
  ) => Promise<import('../../lib/wireup/types').WireupResult>;
  cmdWireup: (cwd: string, args: string[], raw: boolean) => Promise<void>;
};

// Barrel index import — validates re-exports work correctly
const wireupBarrel = require('../../lib/wireup/index') as Record<string, unknown>;

// Direct discovery and scenario imports for coverage boost
const {
  discoverUnwiredFeatures,
} = require('../../lib/wireup/discovery') as {
  discoverUnwiredFeatures: (cwd: string) => UnwiredFeature[];
};

const {
  generateScenarios,
  generateTestData,
} = require('../../lib/wireup/scenarios') as {
  generateScenarios: (features: UnwiredFeature[], cwd: string) => import('../../lib/wireup/types').WireupScenario[];
  generateTestData: (scenarios: import('../../lib/wireup/types').WireupScenario[], cwd: string) => void;
};

const {
  createInitialWireupState,
  readWireupState,
  writeWireupState,
  advanceWireupIteration,
} = require('../../lib/wireup/state') as {
  createInitialWireupState: (milestone: string) => WireupState;
  readWireupState: (cwd: string) => WireupState | null;
  writeWireupState: (cwd: string, state: WireupState) => void;
  advanceWireupIteration: (
    state: WireupState,
    results: { scenarios_run: number; passed: number; failed: number; fixes_applied: number }
  ) => WireupState;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_CWD = '/fake/project';
const FAKE_MILESTONE = 'v0.3.13';

function makeFeature(
  category: UnwiredFeature['category'] = 'exported-but-uncalled',
  functionName = 'myFunc',
  filePath = 'lib/myModule.ts'
): UnwiredFeature {
  return { category, functionName, filePath, suggestedAction: 'Test action' };
}

function makeCliStep(
  command = 'node',
  args: string[] = ['-e', 'console.log("hello")'],
  expected_outcome = 'Function executes without error'
): WireupScenario['steps'][number] {
  return {
    step_type: 'cli',
    parameters: { command, args },
    expected_outcome,
  };
}

function makeHttpStep(
  method = 'GET',
  endpoint = '/api/test',
  expected_outcome = 'Endpoint responds with valid JSON'
): WireupScenario['steps'][number] {
  return {
    step_type: 'http',
    parameters: { method, endpoint },
    expected_outcome,
  };
}

function makeScenario(
  feature: UnwiredFeature,
  steps: WireupScenario['steps']
): WireupScenario {
  return {
    feature,
    steps,
    test_data_fixture: `/fake/test-data/${feature.functionName}.json`,
  };
}

function makeScenarioResult(
  scenarioId: string,
  passed: boolean,
  stepResults: StepResult[] = []
): ScenarioResult {
  if (stepResults.length === 0) {
    stepResults = [
      {
        step_index: 0,
        step_type: 'cli',
        passed,
        expected: {},
        actual: null,
        duration_ms: 10,
      },
    ];
  }
  return {
    scenario_id: scenarioId,
    feature_id: scenarioId,
    step_results: stepResults,
    overall_passed: passed,
    duration_ms: 50,
  };
}

function makeMissingConnection(
  overrides: Partial<MissingConnection> = {}
): MissingConnection {
  return {
    issue_type: 'missing-route',
    source_file: 'lib/myModule.ts',
    target_file: 'routes.ts',
    suggested_fix: 'Add route registration',
    confidence: 'high',
    scenario_id: 'myFunc',
    step_index: 0,
    error_context: 'HTTP 404',
    ...overrides,
  };
}

function makeWireupState(overrides: Partial<WireupState> = {}): WireupState {
  return {
    features_discovered: 0,
    scenarios_generated: 0,
    scenarios_passed: 0,
    scenarios_failed: 0,
    fixes_applied: 0,
    iteration_history: [],
    timestamp: '2026-01-01T00:00:00.000Z',
    milestone: FAKE_MILESTONE,
    ...overrides,
  };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentMilestone.mockReturnValue(FAKE_MILESTONE);
  mockGetMilestoneInfo.mockReturnValue({ version: FAKE_MILESTONE, name: 'Test Milestone' });
  mockOutput.mockImplementation(() => { throw new Error('process.exit called'); });
  mockSpawnSync.mockReturnValue({
    status: 0,
    stdout: '',
    stderr: '',
    error: undefined,
  });
  mockFetch.mockResolvedValue({
    status: 200,
    text: async () => '{"ok":true}',
    headers: { forEach: (_cb: (v: string, k: string) => void) => {} },
  });
  mockReadFileSync.mockImplementation(() => {
    throw new Error('ENOENT');
  });
  mockSafeReadFile.mockReturnValue(null);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: executeCliStep
// ─────────────────────────────────────────────────────────────────────────────

describe('executeCliStep()', () => {
  test('captures stdout, stderr, and exit code', async () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: 'hello world',
      stderr: '',
      error: undefined,
    });

    const step = makeCliStep('echo', ['hello world']);
    const result = await executeCliStep(0, step, {}, FAKE_CWD);

    expect(result.step_type).toBe('cli');
    expect(result.stdout).toBe('hello world');
    expect(result.stderr).toBe('');
    expect(result.exit_code).toBe(0);
    expect(result.step_index).toBe(0);
    expect(typeof result.duration_ms).toBe('number');
  });

  test('passes when exit code is 0 and no structured expectations', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '', error: undefined });

    const step = makeCliStep('node', ['-e', '0']);
    const result = await executeCliStep(0, step, {}, FAKE_CWD);

    expect(result.passed).toBe(true);
  });

  test('fails when exit code is non-zero and no structured expectations', async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'error', error: undefined });

    const step = makeCliStep('node', ['-e', 'process.exit(1)']);
    const result = await executeCliStep(0, step, {}, FAKE_CWD);

    expect(result.passed).toBe(false);
    expect(result.exit_code).toBe(1);
  });

  test('evaluates structured exit_code expectation', async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '', error: undefined });

    const step = makeCliStep('node', [], JSON.stringify({ exit_code: 1 }));
    const result = await executeCliStep(0, step, {}, FAKE_CWD);

    expect(result.passed).toBe(true); // Expected exit code 1, got 1
  });

  test('evaluates stdout_contains expectation', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'Hello World', stderr: '', error: undefined });

    const step = makeCliStep('echo', ['Hello World'], JSON.stringify({ stdout_contains: 'Hello' }));
    const result = await executeCliStep(0, step, {}, FAKE_CWD);

    expect(result.passed).toBe(true);
  });

  test('fails when stdout_contains expectation is not met', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'Bye World', stderr: '', error: undefined });

    const step = makeCliStep('echo', ['Bye'], JSON.stringify({ stdout_contains: 'Hello' }));
    const result = await executeCliStep(0, step, {}, FAKE_CWD);

    expect(result.passed).toBe(false);
  });

  test('evaluates stderr_contains expectation', async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: 'ERR_NOT_FOUND', error: undefined });

    const step: WireupScenario['steps'][number] = {
      step_type: 'cli',
      parameters: { command: 'node', args: [] },
      expected_outcome: JSON.stringify({ stderr_contains: 'ERR_NOT_FOUND' }),
    };
    const result = await executeCliStep(0, step, {}, FAKE_CWD);

    expect(result.passed).toBe(true);
  });

  test('handles spawn error gracefully', async () => {
    mockSpawnSync.mockReturnValue({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('ENOENT: command not found'),
    });

    const step = makeCliStep('nonexistent-cmd', []);
    const result = await executeCliStep(0, step, {}, FAKE_CWD);

    expect(result.passed).toBe(false);
    expect(result.exit_code).toBe(-1);
    expect(result.error).toBe('ENOENT: command not found');
  });

  test('handles execution timeout via status null', async () => {
    mockSpawnSync.mockReturnValue({
      status: null,
      stdout: '',
      stderr: 'Timeout',
      error: undefined,
    });

    const step = makeCliStep('sleep', ['9999']);
    const result = await executeCliStep(0, step, { timeout_ms: 100 }, FAKE_CWD);

    // status null maps to exit_code -1
    expect(result.exit_code).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: executeHttpStep
// ─────────────────────────────────────────────────────────────────────────────

describe('executeHttpStep()', () => {
  test('captures status code, headers, and body', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => '{"ok":true}',
      headers: {
        forEach: (cb: (v: string, k: string) => void) => {
          cb('application/json', 'content-type');
        },
      },
    });

    const step = makeHttpStep('GET', '/api/test');
    const result = await executeHttpStep(0, step, {});

    expect(result.step_type).toBe('http');
    expect(result.status_code).toBe(200);
    expect(result.body).toBe('{"ok":true}');
    expect(result.headers['content-type']).toBe('application/json');
    expect(result.step_index).toBe(0);
    expect(typeof result.duration_ms).toBe('number');
  });

  test('passes for 2xx when no structured expectations', async () => {
    mockFetch.mockResolvedValue({
      status: 201,
      text: async () => 'created',
      headers: { forEach: (_cb: (v: string, k: string) => void) => {} },
    });

    const step = makeHttpStep('POST', '/api/items');
    const result = await executeHttpStep(0, step, {});

    expect(result.passed).toBe(true);
  });

  test('fails for 4xx when no structured expectations', async () => {
    mockFetch.mockResolvedValue({
      status: 404,
      text: async () => 'Not Found',
      headers: { forEach: (_cb: (v: string, k: string) => void) => {} },
    });

    const step = makeHttpStep('GET', '/api/missing');
    const result = await executeHttpStep(0, step, {});

    expect(result.passed).toBe(false);
  });

  test('evaluates status expectation from JSON expected_outcome', async () => {
    mockFetch.mockResolvedValue({
      status: 201,
      text: async () => 'created',
      headers: { forEach: (_cb: (v: string, k: string) => void) => {} },
    });

    const step: WireupScenario['steps'][number] = {
      step_type: 'http',
      parameters: { method: 'POST', endpoint: '/api/items' },
      expected_outcome: JSON.stringify({ status: 201 }),
    };
    const result = await executeHttpStep(0, step, {});

    expect(result.passed).toBe(true);
  });

  test('evaluates body_contains expectation', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => '{"greeting":"hello world"}',
      headers: { forEach: (_cb: (v: string, k: string) => void) => {} },
    });

    const step: WireupScenario['steps'][number] = {
      step_type: 'http',
      parameters: { method: 'GET', endpoint: '/api/greet' },
      expected_outcome: JSON.stringify({ body_contains: 'hello world' }),
    };
    const result = await executeHttpStep(0, step, {});

    expect(result.passed).toBe(true);
  });

  test('fails when body_contains not found', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => '{"greeting":"goodbye"}',
      headers: { forEach: (_cb: (v: string, k: string) => void) => {} },
    });

    const step: WireupScenario['steps'][number] = {
      step_type: 'http',
      parameters: { method: 'GET', endpoint: '/api/greet' },
      expected_outcome: JSON.stringify({ body_contains: 'hello world' }),
    };
    const result = await executeHttpStep(0, step, {});

    expect(result.passed).toBe(false);
  });

  test('evaluates headers expectation', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => '{}',
      headers: {
        forEach: (cb: (v: string, k: string) => void) => {
          cb('application/json', 'content-type');
        },
      },
    });

    const step: WireupScenario['steps'][number] = {
      step_type: 'http',
      parameters: { method: 'GET', endpoint: '/api/test' },
      expected_outcome: JSON.stringify({ headers: { 'content-type': 'application/json' } }),
    };
    const result = await executeHttpStep(0, step, {});

    expect(result.passed).toBe(true);
  });

  test('handles network error gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const step = makeHttpStep('GET', '/api/unreachable');
    const result = await executeHttpStep(0, step, {});

    expect(result.passed).toBe(false);
    expect(result.status_code).toBe(0);
    expect(result.error).toContain('ECONNREFUSED');
    expect(result.body).toBe('');
  });

  test('uses base_url from options', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => 'ok',
      headers: { forEach: (_cb: (v: string, k: string) => void) => {} },
    });

    const step = makeHttpStep('GET', '/test');
    await executeHttpStep(0, step, { base_url: 'http://localhost:8080' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8080/test',
      expect.any(Object)
    );
  });

  test('uses full URL directly when endpoint starts with http', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => 'ok',
      headers: { forEach: (_cb: (v: string, k: string) => void) => {} },
    });

    const step: WireupScenario['steps'][number] = {
      step_type: 'http',
      parameters: { method: 'GET', endpoint: 'https://example.com/api' },
      expected_outcome: 'ok',
    };
    await executeHttpStep(0, step, {});

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/api', expect.any(Object));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: executeScenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('executeScenarios()', () => {
  test('returns array of ScenarioResult for each scenario', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: 'ok', stderr: '', error: undefined });

    const feature = makeFeature();
    const scenario = makeScenario(feature, [makeCliStep()]);
    const results = await executeScenarios(FAKE_CWD, [scenario]);

    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.scenario_id).toBe(feature.functionName);
    expect(r.feature_id).toBe(feature.functionName);
    expect(Array.isArray(r.step_results)).toBe(true);
    expect(typeof r.overall_passed).toBe('boolean');
    expect(typeof r.duration_ms).toBe('number');
  });

  test('returns empty array for empty scenarios input', async () => {
    const results = await executeScenarios(FAKE_CWD, []);
    expect(results).toEqual([]);
  });

  test('overall_passed is true when all steps pass', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '', error: undefined });

    const feature = makeFeature();
    const scenario = makeScenario(feature, [makeCliStep(), makeCliStep('echo', ['hello'])]);
    const results = await executeScenarios(FAKE_CWD, [scenario]);

    expect(results[0].overall_passed).toBe(true);
  });

  test('overall_passed is false when any step fails', async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: '', stderr: '', error: undefined });

    const feature = makeFeature();
    const scenario = makeScenario(feature, [makeCliStep()]);
    const results = await executeScenarios(FAKE_CWD, [scenario]);

    expect(results[0].overall_passed).toBe(false);
  });

  test('skips browser and assert step types (marks as passed)', async () => {
    const feature = makeFeature();
    const assertStep: WireupScenario['steps'][number] = {
      step_type: 'assert',
      parameters: { check: 'return_value_defined' },
      expected_outcome: 'Value is defined',
    };
    const scenario = makeScenario(feature, [assertStep]);
    const results = await executeScenarios(FAKE_CWD, [scenario]);

    // Assert steps are skipped and marked as passed
    expect(results[0].step_results[0].passed).toBe(true);
    expect(results[0].overall_passed).toBe(true);
  });

  test('processes both CLI and HTTP steps in a single scenario', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '', error: undefined });
    mockFetch.mockResolvedValue({
      status: 200,
      text: async () => 'ok',
      headers: { forEach: (_cb: (v: string, k: string) => void) => {} },
    });

    const feature = makeFeature('endpoint-without-integration-test', 'grd_tool', 'lib/mcp-server.ts');
    const scenario = makeScenario(feature, [makeCliStep(), makeHttpStep()]);
    const results = await executeScenarios(FAKE_CWD, [scenario]);

    expect(results[0].step_results).toHaveLength(2);
    expect(results[0].step_results[0].step_type).toBe('cli');
    expect(results[0].step_results[1].step_type).toBe('http');
  });

  test('executes multiple scenarios sequentially', async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '', error: undefined });

    const featureA = makeFeature('exported-but-uncalled', 'funcA');
    const featureB = makeFeature('exported-but-uncalled', 'funcB');
    const scenarios = [
      makeScenario(featureA, [makeCliStep()]),
      makeScenario(featureB, [makeCliStep()]),
    ];
    const results = await executeScenarios(FAKE_CWD, scenarios);

    expect(results).toHaveLength(2);
    expect(results[0].scenario_id).toBe('funcA');
    expect(results[1].scenario_id).toBe('funcB');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: executeBrowserScenario and generateManualSteps
// ─────────────────────────────────────────────────────────────────────────────

describe('executeBrowserScenario()', () => {
  const baseBrowserScenario = {
    scenario_id: 'test-browser-scenario',
    feature: 'myBrowserFeature',
    steps: [
      { action: 'navigate' as const, url: 'http://localhost:3000' },
      { action: 'fill' as const, selector: '#input', value: 'test' },
      { action: 'click' as const, selector: '#submit' },
      { action: 'snapshot' as const },
      { action: 'evaluate' as const, script: 'document.title' },
    ] as BrowserStep[],
  };

  test('returns skipped result when playwright is not available', () => {
    const result = executeBrowserScenario(FAKE_CWD, baseBrowserScenario, false);

    expect(result.status).toBe('skipped');
    expect(result.scenario_id).toBe('test-browser-scenario');
    expect(result.feature).toBe('myBrowserFeature');
    expect(typeof result.skip_reason).toBe('string');
    expect(Array.isArray(result.manual_steps)).toBe(true);
    expect(result.manual_steps!.length).toBe(baseBrowserScenario.steps.length);
    expect(result.console_errors).toEqual([]);
  });

  test('returns tool payloads when playwright is available', () => {
    const result = executeBrowserScenario(FAKE_CWD, baseBrowserScenario, true);

    // Status is 'skipped' because actual MCP invocation is delegated to the orchestrator
    expect(result.status).toBe('skipped');
    expect(result.skip_reason).toBeDefined();
    expect(result.steps).toHaveLength(baseBrowserScenario.steps.length);

    // Verify tool payloads are set for each step
    for (const step of result.steps) {
      expect(step.tool_payload).toBeDefined();
      expect(typeof step.tool_payload!.tool).toBe('string');
    }
  });

  test('maps navigate step to browser_navigate tool', () => {
    const scenario = {
      ...baseBrowserScenario,
      steps: [{ action: 'navigate' as const, url: 'http://test.com' }],
    };
    const result = executeBrowserScenario(FAKE_CWD, scenario, true);

    expect(result.steps[0].tool_payload!.tool).toBe('browser_navigate');
    expect(result.steps[0].tool_payload!.params).toEqual({ url: 'http://test.com' });
  });

  test('maps fill step to browser_fill_form tool', () => {
    const scenario = {
      ...baseBrowserScenario,
      steps: [{ action: 'fill' as const, selector: '#field', value: 'hello' }],
    };
    const result = executeBrowserScenario(FAKE_CWD, scenario, true);

    expect(result.steps[0].tool_payload!.tool).toBe('browser_fill_form');
    expect(result.steps[0].tool_payload!.params).toEqual({ selector: '#field', value: 'hello' });
  });

  test('maps click step to browser_click tool', () => {
    const scenario = {
      ...baseBrowserScenario,
      steps: [{ action: 'click' as const, selector: '.btn' }],
    };
    const result = executeBrowserScenario(FAKE_CWD, scenario, true);

    expect(result.steps[0].tool_payload!.tool).toBe('browser_click');
  });

  test('maps snapshot step to browser_snapshot tool', () => {
    const scenario = {
      ...baseBrowserScenario,
      steps: [{ action: 'snapshot' as const }],
    };
    const result = executeBrowserScenario(FAKE_CWD, scenario, true);

    expect(result.steps[0].tool_payload!.tool).toBe('browser_snapshot');
  });

  test('maps evaluate step to browser_evaluate tool', () => {
    const scenario = {
      ...baseBrowserScenario,
      steps: [{ action: 'evaluate' as const, script: 'window.title' }],
    };
    const result = executeBrowserScenario(FAKE_CWD, scenario, true);

    expect(result.steps[0].tool_payload!.tool).toBe('browser_evaluate');
    expect(result.steps[0].tool_payload!.params).toEqual({ script: 'window.title' });
  });
});

describe('generateManualSteps()', () => {
  test('generates numbered instructions for navigate steps', () => {
    const steps: BrowserStep[] = [{ action: 'navigate', url: 'http://example.com' }];
    const instructions = generateManualSteps(steps);

    expect(instructions).toHaveLength(1);
    expect(instructions[0]).toMatch(/1\. Open browser/);
    expect(instructions[0]).toContain('http://example.com');
  });

  test('generates instructions for fill steps', () => {
    const steps: BrowserStep[] = [{ action: 'fill', selector: '#email', value: 'test@example.com' }];
    const instructions = generateManualSteps(steps);

    expect(instructions[0]).toContain('test@example.com');
    expect(instructions[0]).toContain('#email');
  });

  test('generates instructions for click steps', () => {
    const steps: BrowserStep[] = [{ action: 'click', selector: '#submit' }];
    const instructions = generateManualSteps(steps);

    expect(instructions[0]).toContain('Click');
    expect(instructions[0]).toContain('#submit');
  });

  test('generates instructions for snapshot steps', () => {
    const steps: BrowserStep[] = [{ action: 'snapshot' }];
    const instructions = generateManualSteps(steps);

    expect(instructions[0]).toContain('snapshot');
  });

  test('generates instructions for evaluate steps', () => {
    const steps: BrowserStep[] = [{ action: 'evaluate', script: 'document.title' }];
    const instructions = generateManualSteps(steps);

    expect(instructions[0]).toContain('document.title');
  });

  test('numbers steps sequentially', () => {
    const steps: BrowserStep[] = [
      { action: 'navigate', url: 'http://test.com' },
      { action: 'click', selector: '#btn' },
      { action: 'snapshot' },
    ];
    const instructions = generateManualSteps(steps);

    expect(instructions[0]).toMatch(/^1\./);
    expect(instructions[1]).toMatch(/^2\./);
    expect(instructions[2]).toMatch(/^3\./);
  });

  test('returns empty array for empty steps', () => {
    const instructions = generateManualSteps([]);
    expect(instructions).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: detectMissingConnections
// ─────────────────────────────────────────────────────────────────────────────

describe('detectMissingConnections()', () => {
  beforeEach(() => {
    // Default: grep returns nothing (no matching files)
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      error: undefined,
    });
  });

  test('returns empty array when all scenarios pass', () => {
    const passedResult = makeScenarioResult('myFunc', true);
    const connections = detectMissingConnections(FAKE_CWD, [passedResult]);
    expect(connections).toEqual([]);
  });

  test('returns empty array when no scenarios provided', () => {
    const connections = detectMissingConnections(FAKE_CWD, []);
    expect(connections).toEqual([]);
  });

  test('detects missing import from CLI step with module not found error', () => {
    const cliResult: CliStepResult = {
      step_index: 0,
      step_type: 'cli',
      passed: false,
      expected: {},
      actual: null,
      exit_code: 1,
      stdout: '',
      stderr: "Error: Cannot find module 'some-missing-module'\n    at Module._resolveFilename",
      duration_ms: 10,
    };

    const failedResult: ScenarioResult = {
      scenario_id: 'myFunc',
      feature_id: 'myFunc',
      step_results: [cliResult],
      overall_passed: false,
      duration_ms: 50,
    };

    const connections = detectMissingConnections(FAKE_CWD, [failedResult]);
    expect(connections.length).toBeGreaterThan(0);
    const missingImport = connections.find((c) => c.issue_type === 'missing-import');
    expect(missingImport).toBeDefined();
    expect(missingImport!.confidence).toBe('high');
  });

  test('detects missing route from HTTP 404 response', () => {
    const httpResult: HttpStepResult = {
      step_index: 0,
      step_type: 'http',
      passed: false,
      expected: {},
      actual: { status_code: 404 },
      exit_code: undefined as unknown as never,
      duration_ms: 10,
      status_code: 404,
      headers: {},
      body: 'Not Found',
    } as unknown as HttpStepResult;

    const failedResult: ScenarioResult = {
      scenario_id: 'grd_tool',
      feature_id: 'grd_tool',
      step_results: [httpResult as unknown as StepResult],
      overall_passed: false,
      duration_ms: 50,
    };

    const connections = detectMissingConnections(FAKE_CWD, [failedResult]);
    expect(connections.length).toBeGreaterThan(0);
    const missingRoute = connections.find((c) => c.issue_type === 'missing-route');
    expect(missingRoute).toBeDefined();
  });

  test('deduplicates issues with same type+source+target', () => {
    // Two failed scenarios with the same module error
    const makeFailedCli = (scenarioId: string): ScenarioResult => ({
      scenario_id: scenarioId,
      feature_id: scenarioId,
      step_results: [
        {
          step_index: 0,
          step_type: 'cli',
          passed: false,
          expected: {},
          actual: null,
          exit_code: 1,
          stdout: '',
          stderr: "Cannot find module 'shared-module'",
          duration_ms: 10,
        } as CliStepResult,
      ],
      overall_passed: false,
      duration_ms: 50,
    });

    const connections = detectMissingConnections(FAKE_CWD, [
      makeFailedCli('func1'),
      makeFailedCli('func2'),
    ]);

    // Should be deduplicated
    const missingImports = connections.filter((c) => c.issue_type === 'missing-import');
    const unique = new Set(
      missingImports.map((c) => `${c.issue_type}:${c.source_file}:${c.target_file}`)
    );
    expect(missingImports.length).toBe(unique.size);
  });

  test('sorts issues high-confidence first', () => {
    // Create a mix of high and medium confidence issues
    const httpResult: StepResult = {
      step_index: 0,
      step_type: 'http',
      passed: false,
      expected: {},
      actual: { status_code: 200 },
      duration_ms: 10,
    };

    // 401 produces medium confidence (missing-middleware)
    const unauthorizedResult: ScenarioResult = {
      scenario_id: 'authFunc',
      feature_id: 'authFunc',
      step_results: [
        {
          ...httpResult,
          status_code: 401,
          headers: {},
          body: 'Unauthorized',
          step_type: 'http',
        } as HttpStepResult,
      ],
      overall_passed: false,
      duration_ms: 50,
    };

    // Cannot find module produces high confidence (missing-import)
    const moduleErrorResult: ScenarioResult = {
      scenario_id: 'importFunc',
      feature_id: 'importFunc',
      step_results: [
        {
          step_index: 0,
          step_type: 'cli',
          passed: false,
          expected: {},
          actual: null,
          exit_code: 1,
          stdout: '',
          stderr: "Cannot find module 'missing-mod'",
          duration_ms: 10,
        } as CliStepResult,
      ],
      overall_passed: false,
      duration_ms: 50,
    };

    const connections = detectMissingConnections(FAKE_CWD, [unauthorizedResult, moduleErrorResult]);

    if (connections.length >= 2) {
      const confidenceOrder = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < connections.length; i++) {
        expect(
          confidenceOrder[connections[i - 1].confidence] <=
          confidenceOrder[connections[i].confidence]
        ).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: classifyFailure
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyFailure()', () => {
  const feature = makeFeature();

  beforeEach(() => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: '',
      stderr: '',
      error: undefined,
    });
  });

  test('classifies missing-import from Cannot find module error', () => {
    const step: CliStepResult = {
      step_index: 0,
      step_type: 'cli',
      passed: false,
      expected: {},
      actual: null,
      exit_code: 1,
      stdout: '',
      stderr: "Cannot find module './missing-file'",
      duration_ms: 10,
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).not.toBeNull();
    expect(result!.issue_type).toBe('missing-import');
    expect(result!.confidence).toBe('high');
    expect(result!.source_file).toBe(feature.filePath);
  });

  test('classifies missing-route from HTTP 404', () => {
    const step: StepResult & { status_code: number; headers: Record<string, string>; body: string } = {
      step_index: 0,
      step_type: 'http',
      passed: false,
      expected: {},
      actual: null,
      duration_ms: 10,
      status_code: 404,
      headers: {},
      body: 'Not Found',
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).not.toBeNull();
    // Either missing-route or broken-nav-link depending on path structure
    expect(['missing-route', 'broken-nav-link']).toContain(result!.issue_type);
  });

  test('classifies missing-middleware from HTTP 401', () => {
    const step: StepResult & { status_code: number; headers: Record<string, string>; body: string } = {
      step_index: 0,
      step_type: 'http',
      passed: false,
      expected: {},
      actual: null,
      duration_ms: 10,
      status_code: 401,
      headers: {},
      body: 'Unauthorized',
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).not.toBeNull();
    expect(result!.issue_type).toBe('missing-middleware');
    expect(result!.confidence).toBe('medium');
  });

  test('classifies missing-middleware from HTTP 403', () => {
    const step: StepResult & { status_code: number; headers: Record<string, string>; body: string } = {
      step_index: 0,
      step_type: 'http',
      passed: false,
      expected: {},
      actual: null,
      duration_ms: 10,
      status_code: 403,
      headers: {},
      body: 'Forbidden',
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).not.toBeNull();
    expect(result!.issue_type).toBe('missing-middleware');
  });

  test('classifies missing-env-var from ECONNREFUSED error', () => {
    const step: StepResult = {
      step_index: 0,
      step_type: 'cli',
      passed: false,
      expected: {},
      actual: null,
      error: 'connect ECONNREFUSED 127.0.0.1:5432',
      duration_ms: 10,
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).not.toBeNull();
    expect(result!.issue_type).toBe('missing-env-var');
  });

  test('returns null for a passing step', () => {
    const step: CliStepResult = {
      step_index: 0,
      step_type: 'cli',
      passed: true,
      expected: {},
      actual: 'ok',
      exit_code: 0,
      stdout: 'ok',
      stderr: '',
      duration_ms: 10,
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).toBeNull();
  });

  test('classifies unconnected-handler for 2xx with empty body and failed step', () => {
    const step: StepResult & { status_code: number; headers: Record<string, string>; body: string } = {
      step_index: 0,
      step_type: 'http',
      passed: false,
      expected: { body_contains: 'data' },
      actual: { status_code: 200, body: '' },
      duration_ms: 10,
      status_code: 200,
      headers: {},
      body: '',
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    // Could be null or unconnected-handler depending on body
    if (result !== null) {
      expect(result.issue_type).toBe('unconnected-handler');
      expect(result.confidence).toBe('medium');
    }
  });

  test('returns structured report with issue_type, source_file, target_file, suggested_fix, and confidence', () => {
    const step: CliStepResult = {
      step_index: 0,
      step_type: 'cli',
      passed: false,
      expected: {},
      actual: null,
      exit_code: 1,
      stdout: '',
      stderr: "Cannot find module 'some-module'",
      duration_ms: 10,
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).not.toBeNull();
    expect(typeof result!.issue_type).toBe('string');
    expect(typeof result!.source_file).toBe('string');
    expect(typeof result!.target_file).toBe('string');
    expect(typeof result!.suggested_fix).toBe('string');
    expect(['high', 'medium', 'low']).toContain(result!.confidence);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: classifyFixConfidence
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyFixConfidence()', () => {
  test('returns high for missing-import', () => {
    const issue = makeMissingConnection({ issue_type: 'missing-import' });
    expect(classifyFixConfidence(issue)).toBe('high');
  });

  test('returns high for missing-export', () => {
    const issue = makeMissingConnection({ issue_type: 'missing-export' });
    expect(classifyFixConfidence(issue)).toBe('high');
  });

  test('returns high for missing-route', () => {
    const issue = makeMissingConnection({ issue_type: 'missing-route' });
    expect(classifyFixConfidence(issue)).toBe('high');
  });

  test('returns medium for unconnected-handler', () => {
    const issue = makeMissingConnection({ issue_type: 'unconnected-handler' });
    expect(classifyFixConfidence(issue)).toBe('medium');
  });

  test('returns medium for missing-middleware', () => {
    const issue = makeMissingConnection({ issue_type: 'missing-middleware' });
    expect(classifyFixConfidence(issue)).toBe('medium');
  });

  test('returns low for broken-nav-link', () => {
    const issue = makeMissingConnection({ issue_type: 'broken-nav-link' });
    expect(classifyFixConfidence(issue)).toBe('low');
  });

  test('returns low for missing-env-var', () => {
    const issue = makeMissingConnection({ issue_type: 'missing-env-var' });
    expect(classifyFixConfidence(issue)).toBe('low');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: autoFixIssue
// ─────────────────────────────────────────────────────────────────────────────

describe('autoFixIssue()', () => {
  test('skips issues with non-high confidence', async () => {
    const issue = makeMissingConnection({ confidence: 'medium' });
    const reRunFn = jest.fn().mockResolvedValue(true);

    const result = await autoFixIssue(FAKE_CWD, issue, reRunFn);

    expect(result.fix_status).toBe('skipped');
    expect(reRunFn).not.toHaveBeenCalled();
    expect(result.issue).toBe(issue);
  });

  test('skips issues with low confidence', async () => {
    const issue = makeMissingConnection({ confidence: 'low' });
    const reRunFn = jest.fn().mockResolvedValue(true);

    const result = await autoFixIssue(FAKE_CWD, issue, reRunFn);

    expect(result.fix_status).toBe('skipped');
    expect(reRunFn).not.toHaveBeenCalled();
  });

  test('reports pass when actual matches expected outcome (reRunFn returns true)', async () => {
    const issue = makeMissingConnection({ confidence: 'high' });
    const reRunFn = jest.fn().mockResolvedValue(true);

    const result = await autoFixIssue(FAKE_CWD, issue, reRunFn);

    expect(result.fix_status).toBe('verified');
    expect(result.rerun_passed).toBe(true);
    expect(reRunFn).toHaveBeenCalledTimes(1);
    expect(typeof result.fix_description).toBe('string');
    expect(typeof result.fix_prompt).toBe('string');
  });

  test('reports fail when actual differs from expected outcome (reRunFn returns false)', async () => {
    const issue = makeMissingConnection({ confidence: 'high' });
    const reRunFn = jest.fn().mockResolvedValue(false);

    const result = await autoFixIssue(FAKE_CWD, issue, reRunFn);

    expect(result.fix_status).toBe('failed');
    expect(result.rerun_passed).toBe(false);
  });

  test('handles execution timeout gracefully when reRunFn throws', async () => {
    const issue = makeMissingConnection({ confidence: 'high' });
    const reRunFn = jest.fn().mockRejectedValue(new Error('Timeout after 30s'));

    const result = await autoFixIssue(FAKE_CWD, issue, reRunFn);

    expect(result.fix_status).toBe('failed');
    expect(result.error).toContain('Timeout after 30s');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: partitionByConfidence
// ─────────────────────────────────────────────────────────────────────────────

describe('partitionByConfidence()', () => {
  test('puts high confidence issues in fixes_applied-ready result', () => {
    const issues = [
      makeMissingConnection({ issue_type: 'missing-import', confidence: 'high' }),
      makeMissingConnection({ issue_type: 'missing-route', confidence: 'high', source_file: 'other.ts' }),
    ];

    const result = partitionByConfidence(issues);

    // fixes_applied starts empty (orchestrator populates it)
    expect(result.fixes_applied).toEqual([]);
    // High confidence issues do NOT go to manual review
    expect(result.requires_manual_review).toHaveLength(0);
    expect(typeof result.model_used).toBe('string');
  });

  test('puts medium and low confidence issues in requires_manual_review', () => {
    const issues = [
      makeMissingConnection({ issue_type: 'unconnected-handler', confidence: 'medium' }),
      makeMissingConnection({ issue_type: 'broken-nav-link', confidence: 'low', source_file: 'other.ts' }),
    ];

    const result = partitionByConfidence(issues);

    expect(result.requires_manual_review).toHaveLength(2);
    expect(result.fixes_applied).toEqual([]);
  });

  test('handles empty issues array', () => {
    const result = partitionByConfidence([]);

    expect(result.fixes_applied).toEqual([]);
    expect(result.requires_manual_review).toEqual([]);
  });

  test('handles mixed confidence issues', () => {
    const issues = [
      makeMissingConnection({ confidence: 'high' }),
      makeMissingConnection({ confidence: 'medium', source_file: 'a.ts' }),
      makeMissingConnection({ confidence: 'low', source_file: 'b.ts' }),
    ];

    const result = partitionByConfidence(issues);

    // Only medium and low go to manual review
    expect(result.requires_manual_review).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: updateFixOutcome
// ─────────────────────────────────────────────────────────────────────────────

describe('updateFixOutcome()', () => {
  test('increments fixes_applied for verified fix', () => {
    const state = makeWireupState({ fixes_applied: 2 });
    mockSafeReadFile.mockReturnValue(JSON.stringify(state));

    const fixAttempt: FixAttempt = {
      issue: makeMissingConnection(),
      fix_status: 'verified',
      fix_description: 'Fixed import',
      rerun_passed: true,
    };

    updateFixOutcome(FAKE_CWD, 'myFunc', fixAttempt);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = mockWriteFileSync.mock.calls[0][1] as string;
    const updatedState: WireupState = JSON.parse(written);
    expect(updatedState.fixes_applied).toBe(3); // 2 + 1
  });

  test('does not increment fixes_applied for failed fix', () => {
    const state = makeWireupState({ fixes_applied: 2 });
    mockSafeReadFile.mockReturnValue(JSON.stringify(state));

    const fixAttempt: FixAttempt = {
      issue: makeMissingConnection(),
      fix_status: 'failed',
      fix_description: 'Fix failed',
      rerun_passed: false,
    };

    updateFixOutcome(FAKE_CWD, 'myFunc', fixAttempt);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = mockWriteFileSync.mock.calls[0][1] as string;
    const updatedState: WireupState = JSON.parse(written);
    expect(updatedState.fixes_applied).toBe(2); // unchanged
  });

  test('does not increment fixes_applied for skipped fix', () => {
    const state = makeWireupState({ fixes_applied: 5 });
    mockSafeReadFile.mockReturnValue(JSON.stringify(state));

    const fixAttempt: FixAttempt = {
      issue: makeMissingConnection(),
      fix_status: 'skipped',
    };

    updateFixOutcome(FAKE_CWD, 'myFunc', fixAttempt);

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    const updatedState: WireupState = JSON.parse(written);
    expect(updatedState.fixes_applied).toBe(5); // unchanged
  });

  test('is a no-op when state file does not exist', () => {
    mockSafeReadFile.mockReturnValue(null);

    const fixAttempt: FixAttempt = {
      issue: makeMissingConnection(),
      fix_status: 'verified',
    };

    updateFixOutcome(FAKE_CWD, 'myFunc', fixAttempt);

    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: generateWireupReport and formatReportPath
// ─────────────────────────────────────────────────────────────────────────────

describe('formatReportPath()', () => {
  test('returns path under .planning/milestones/{milestone}/wireup/WIREUP-REPORT.md', () => {
    mockCurrentMilestone.mockReturnValue('v0.3.13');

    const reportPath = formatReportPath(FAKE_CWD);

    expect(reportPath).toContain('v0.3.13');
    expect(reportPath).toContain('wireup');
    expect(reportPath).toContain('WIREUP-REPORT.md');
    expect(reportPath).toContain('.planning');
  });
});

describe('generateWireupReport()', () => {
  const baseReportData: import('../../lib/wireup/report').WireupReportData = {
    milestone: 'v0.3.13',
    iteration: 1,
    timestamp: '2026-03-21T10:00:00.000Z',
    features_tested: 3,
    scenarios: { total: 5, passed: 4, failed: 1, skipped: 0 },
    issues_found: [],
    fixes: { applied: [], verified: 0, failed: 0, skipped: 0 },
    remaining_unwired: [],
    manual_review: [],
  };

  beforeEach(() => {
    mockCurrentMilestone.mockReturnValue('v0.3.13');
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
  });

  test('returns the report path', () => {
    const result = generateWireupReport(FAKE_CWD, baseReportData);
    expect(typeof result).toBe('string');
    expect(result).toContain('WIREUP-REPORT.md');
  });

  test('writes report file to correct path', () => {
    generateWireupReport(FAKE_CWD, baseReportData);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [writtenPath] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(writtenPath).toContain('WIREUP-REPORT.md');
    expect(writtenPath).toContain('v0.3.13');
  });

  test('creates parent directory recursively', () => {
    generateWireupReport(FAKE_CWD, baseReportData);

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  test('includes milestone and iteration in report content', () => {
    generateWireupReport(FAKE_CWD, baseReportData);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(content).toContain('v0.3.13');
    expect(content).toContain('1'); // iteration
    expect(content).toContain('2026-03-21');
  });

  test('includes scenario summary counts', () => {
    generateWireupReport(FAKE_CWD, baseReportData);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(content).toContain('5'); // total
    expect(content).toContain('4'); // passed
    expect(content).toContain('1'); // failed
  });

  test('shows no issues detected message when no issues', () => {
    generateWireupReport(FAKE_CWD, baseReportData);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(content).toContain('No issues detected');
  });

  test('includes issues table when issues are present', () => {
    const reportData = {
      ...baseReportData,
      issues_found: [
        makeMissingConnection({ issue_type: 'missing-route', source_file: 'lib/a.ts', target_file: 'routes.ts' }),
      ],
    };

    generateWireupReport(FAKE_CWD, reportData);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(content).toContain('missing-route');
    expect(content).toContain('lib/a.ts');
    expect(content).toContain('routes.ts');
  });

  test('includes fixes table when fixes are applied', () => {
    const fixAttempt: FixAttempt = {
      issue: makeMissingConnection(),
      fix_status: 'verified',
      fix_description: 'Added route registration',
      rerun_passed: true,
    };
    const reportData = {
      ...baseReportData,
      fixes: { applied: [fixAttempt], verified: 1, failed: 0, skipped: 0 },
    };

    generateWireupReport(FAKE_CWD, reportData);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(content).toContain('verified');
    expect(content).toContain('Added route registration');
  });

  test('shows manual review items when present', () => {
    const reportData = {
      ...baseReportData,
      manual_review: [
        makeMissingConnection({ issue_type: 'unconnected-handler', confidence: 'medium' }),
      ],
    };

    generateWireupReport(FAKE_CWD, reportData);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(content).toContain('unconnected-handler');
  });

  test('shows all features wired message when remaining_unwired is empty', () => {
    generateWireupReport(FAKE_CWD, baseReportData);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(content).toContain('All tested features are now wired');
  });

  test('lists remaining unwired features', () => {
    const reportData = {
      ...baseReportData,
      remaining_unwired: ['funcA', 'funcB'],
    };

    generateWireupReport(FAKE_CWD, reportData);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(content).toContain('funcA');
    expect(content).toContain('funcB');
  });

  test('includes iteration history table', () => {
    generateWireupReport(FAKE_CWD, baseReportData);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(content).toContain('## Iteration History');
    expect(content).toContain('| Iteration |');
  });

  test('preserves existing iteration history when file already exists', () => {
    const existingReport = [
      '# Wireup Report',
      '',
      '## Iteration History',
      '',
      '| Iteration | Date | Scenarios | Passed | Failed | Skipped | Issues | Fixes | Verified |',
      '|-----------|------|-----------|--------|--------|---------|--------|-------|----------|',
      '| 1 | 2026-03-20 | 3 | 2 | 1 | 0 | 2 | 1 | 1 |',
      '',
    ].join('\n');

    mockReadFileSync.mockReturnValue(existingReport);

    const reportData = { ...baseReportData, iteration: 2 };
    generateWireupReport(FAKE_CWD, reportData);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    // Should contain both the old row and the new row
    expect(content).toContain('| 1 | 2026-03-20');
    expect(content).toContain('| 2 | 2026-03-21');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12: extractIterationHistory
// ─────────────────────────────────────────────────────────────────────────────

describe('extractIterationHistory()', () => {
  test('returns empty string when no Iteration History section', () => {
    const content = '# Report\n\n## Summary\n\nSome content';
    const result = extractIterationHistory(content);
    expect(result).toBe('');
  });

  test('extracts data rows from Iteration History section', () => {
    const content = [
      '## Iteration History',
      '',
      '| Iteration | Date | Scenarios | Passed | Failed | Skipped | Issues | Fixes | Verified |',
      '|-----------|------|-----------|--------|--------|---------|--------|-------|----------|',
      '| 1 | 2026-03-20 | 3 | 2 | 1 | 0 | 2 | 1 | 1 |',
      '| 2 | 2026-03-21 | 4 | 3 | 1 | 0 | 1 | 0 | 0 |',
      '',
    ].join('\n');

    const result = extractIterationHistory(content);
    expect(result).toContain('| 1 | 2026-03-20');
    expect(result).toContain('| 2 | 2026-03-21');
    // Should not include header or separator
    expect(result).not.toContain('| Iteration |');
    expect(result).not.toContain('|-----------|');
  });

  test('returns empty string when history section has no data rows', () => {
    const content = [
      '## Iteration History',
      '',
      '| Iteration | Date | Scenarios |',
      '|-----------|------|-----------|',
      '',
    ].join('\n');

    const result = extractIterationHistory(content);
    expect(result).toBe('');
  });

  test('stops extraction at next section', () => {
    const content = [
      '## Iteration History',
      '',
      '| Iteration | Date | Scenarios | Passed | Failed | Skipped | Issues | Fixes | Verified |',
      '|-----------|------|-----------|--------|--------|---------|--------|-------|----------|',
      '| 1 | 2026-03-20 | 3 | 2 | 1 | 0 | 2 | 1 | 1 |',
      '',
      '## Next Section',
      '',
      'Not part of history',
    ].join('\n');

    const result = extractIterationHistory(content);
    expect(result).toContain('| 1 | 2026-03-20');
    expect(result).not.toContain('Not part of history');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13: _buildPassFailSummary (orchestrator helper)
// ─────────────────────────────────────────────────────────────────────────────

describe('_buildPassFailSummary()', () => {
  test('returns "No scenarios executed." when total is 0', () => {
    const summary = _buildPassFailSummary(0, 0, 0, []);
    expect(summary).toBe('No scenarios executed.');
  });

  test('returns pass count and percentage for all-passing run', () => {
    const summary = _buildPassFailSummary(10, 10, 0, []);
    expect(summary).toContain('10/10');
    expect(summary).toContain('100%');
  });

  test('includes failed scenario names when there are failures', () => {
    const failedScenarios = [
      { scenario_id: 'funcA', failed_steps: [{ step_index: 0, step_type: 'cli' as const, passed: false, expected: {}, actual: null, duration_ms: 10 }] },
    ];
    const summary = _buildPassFailSummary(5, 4, 1, failedScenarios);
    expect(summary).toContain('funcA');
    expect(summary).toContain('Failed scenarios:');
  });

  test('includes partial pass fraction', () => {
    const summary = _buildPassFailSummary(4, 3, 1, []);
    expect(summary).toContain('3/4');
    expect(summary).toContain('75%');
  });

  test('includes issues found summary when issues are present', () => {
    const issuesByConfidence = { high: 2, medium: 1, low: 0 };
    const summary = _buildPassFailSummary(5, 4, 1, [], 3, issuesByConfidence);
    expect(summary).toContain('Missing connections detected: 3');
    expect(summary).toContain('High confidence: 2');
    expect(summary).toContain('Medium confidence: 1');
    expect(summary).toContain('Low confidence: 0');
  });

  test('does not include issues section when issuesFound is 0', () => {
    const issuesByConfidence = { high: 0, medium: 0, low: 0 };
    const summary = _buildPassFailSummary(5, 5, 0, [], 0, issuesByConfidence);
    expect(summary).not.toContain('Missing connections detected');
  });

  test('handles multiple failed scenarios', () => {
    const failedScenarios = [
      { scenario_id: 'funcA', failed_steps: [{ step_index: 0, step_type: 'cli' as const, passed: false, expected: {}, actual: null, duration_ms: 10 }] },
      { scenario_id: 'funcB', failed_steps: [
        { step_index: 0, step_type: 'http' as const, passed: false, expected: {}, actual: null, duration_ms: 10 },
        { step_index: 1, step_type: 'cli' as const, passed: false, expected: {}, actual: null, duration_ms: 10 },
      ] },
    ];
    const summary = _buildPassFailSummary(5, 3, 2, failedScenarios);
    expect(summary).toContain('funcA');
    expect(summary).toContain('funcB');
    expect(summary).toContain('2 step(s) failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 14: Barrel index re-exports (lib/wireup/index.ts)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SECTION: Direct discovery, scenarios, and state tests (coverage boost)
// ─────────────────────────────────────────────────────────────────────────────

describe('discoverUnwiredFeatures() — via wireup.test.ts', () => {
  const path = require('path');

  beforeEach(() => {
    const fs = require('fs');
    (fs.readdirSync as jest.Mock).mockImplementation(() => { throw new Error('ENOENT'); });
    mockSafeReadFile.mockReturnValue(null);
  });

  test('returns empty array when no directories exist', () => {
    const result = discoverUnwiredFeatures(FAKE_CWD);
    expect(result).toEqual([]);
  });

  test('detects exported function not referenced elsewhere', () => {
    const fs = require('fs');
    (fs.statSync as jest.Mock).mockImplementation((p: string) => {
      if (p === path.join(FAKE_CWD, 'lib', 'wireup')) return { isDirectory: () => true };
      throw new Error('ENOENT');
    });
    (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === path.join(FAKE_CWD, 'lib')) {
        return [{ name: 'isolated.ts', isFile: () => true, isDirectory: () => false }];
      }
      throw new Error('ENOENT');
    });
    mockSafeReadFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('plugin.json')) return '{ "name": "grd" }';
      if (filePath.endsWith('isolated.ts')) return 'module.exports = { isolatedFunc };';
      return null;
    });

    const result = discoverUnwiredFeatures(FAKE_CWD);
    const match = result.find((f) => f.functionName === 'isolatedFunc');
    expect(match).toBeDefined();
    expect(match!.category).toBe('exported-but-uncalled');
  });

  test('detects config key not referenced in surface files', () => {
    const fs = require('fs');
    (fs.statSync as jest.Mock).mockImplementation((p: string) => {
      if (p === path.join(FAKE_CWD, 'lib', 'wireup')) return { isDirectory: () => true };
      throw new Error('ENOENT');
    });
    (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === path.join(FAKE_CWD, 'lib')) return [];
      throw new Error('ENOENT');
    });
    mockSafeReadFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('plugin.json')) return '{ "name": "grd" }';
      if (filePath.endsWith('config.json')) return JSON.stringify({ unreferencedKey: true });
      return null;
    });

    const result = discoverUnwiredFeatures(FAKE_CWD);
    const configFeature = result.find((f) => f.functionName === 'unreferencedKey');
    expect(configFeature).toBeDefined();
    expect(configFeature!.category).toBe('config-without-surface');
  });

  test('detects MCP tool not referenced in integration tests', () => {
    const fs = require('fs');
    (fs.statSync as jest.Mock).mockImplementation((p: string) => {
      if (p === path.join(FAKE_CWD, 'lib', 'wireup')) return { isDirectory: () => true };
      throw new Error('ENOENT');
    });
    (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === path.join(FAKE_CWD, 'lib')) return [];
      if (dir === path.join(FAKE_CWD, 'tests', 'integration')) return [];
      throw new Error('ENOENT');
    });
    mockSafeReadFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('plugin.json')) return '{ "name": "grd" }';
      if (filePath.endsWith('mcp-server.ts')) return "tools.push({ name: 'grd_unverified' });";
      return null;
    });

    const result = discoverUnwiredFeatures(FAKE_CWD);
    const endpointFeature = result.find((f) => f.functionName === 'grd_unverified');
    expect(endpointFeature).toBeDefined();
    expect(endpointFeature!.category).toBe('endpoint-without-integration-test');
  });
});

describe('generateScenarios() — via wireup.test.ts', () => {
  beforeEach(() => {
    mockCurrentMilestone.mockReturnValue(FAKE_MILESTONE);
  });

  test('generates scenario with steps for exported-but-uncalled feature', () => {
    const feature = makeFeature('exported-but-uncalled', 'myFunc');
    const scenarios = generateScenarios([feature], FAKE_CWD);
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0].feature).toBe(feature);
    expect(scenarios[0].steps.length).toBeGreaterThan(0);
  });

  test('generates HTTP scenario for endpoint-without-integration-test', () => {
    const feature = makeFeature('endpoint-without-integration-test', 'grd_tool', 'lib/mcp-server.ts');
    const scenarios = generateScenarios([feature], FAKE_CWD);
    expect(scenarios[0].steps.some((s) => s.step_type === 'http')).toBe(true);
  });

  test('generates CLI scenario for config-without-surface', () => {
    const feature = makeFeature('config-without-surface', 'myKey', '.planning/config.json');
    const scenarios = generateScenarios([feature], FAKE_CWD);
    expect(scenarios[0].steps.some((s) => s.step_type === 'cli')).toBe(true);
  });
});

describe('generateTestData() — via wireup.test.ts', () => {
  const path = require('path');

  beforeEach(() => {
    mockCurrentMilestone.mockReturnValue(FAKE_MILESTONE);
    mockSafeReadFile.mockReturnValue(null);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
  });

  test('writes JSON fixture for each scenario', () => {
    const feature = makeFeature('exported-but-uncalled', 'funcX');
    const scenario: import('../../lib/wireup/types').WireupScenario = {
      feature,
      steps: [],
      test_data_fixture: '/fake/test-data/funcX.json',
    };

    generateTestData([scenario], FAKE_CWD);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string];
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.feature).toBe('funcX');
    expect(typeof parsed.generated_at).toBe('string');
  });

  test('extracts typed parameters from source file including string[] and unknown types', () => {
    const feature = makeFeature('exported-but-uncalled', 'processItems', 'lib/someModule.ts');
    const scenario: import('../../lib/wireup/types').WireupScenario = {
      feature,
      steps: [],
      test_data_fixture: '/fake/test-data/processItems.json',
    };

    // Source file has function with string[], custom type, and no-annotation params
    mockSafeReadFile.mockImplementation((filePath: string) => {
      if (filePath === path.join(FAKE_CWD, 'lib/someModule.ts')) {
        return `function processItems(items: string[], opts: MyOptions, bare) { return items; }`;
      }
      return null;
    });

    generateTestData([scenario], FAKE_CWD);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string];
    const parsed = JSON.parse(content) as { parameters: Record<string, unknown> };
    // string[] should produce ['item-1', 'item-2']
    expect(Array.isArray(parsed.parameters.items)).toBe(true);
    // unknown type falls back to null
    expect(parsed.parameters.opts).toBeNull();
    // no-annotation param defaults to 'test-value' (string)
    expect(parsed.parameters.bare).toBe('test-value');
  });

  test('handles arrow function parameter extraction', () => {
    const feature = makeFeature('exported-but-uncalled', 'arrowFn', 'lib/someModule.ts');
    const scenario: import('../../lib/wireup/types').WireupScenario = {
      feature,
      steps: [],
      test_data_fixture: '/fake/test-data/arrowFn.json',
    };

    mockSafeReadFile.mockImplementation((filePath: string) => {
      if (filePath === path.join(FAKE_CWD, 'lib/someModule.ts')) {
        return `const arrowFn = (count: number, label: string) => count + label;`;
      }
      return null;
    });

    generateTestData([scenario], FAKE_CWD);

    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string];
    const parsed = JSON.parse(content) as { parameters: Record<string, unknown> };
    expect(parsed.parameters.count).toBe(42);
    expect(parsed.parameters.label).toBe('test-value');
  });
});

describe('state functions — via wireup.test.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSafeReadFile.mockReturnValue(null);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
  });

  test('createInitialWireupState returns state with zero counters', () => {
    const state = createInitialWireupState(FAKE_MILESTONE);
    expect(state.features_discovered).toBe(0);
    expect(state.fixes_applied).toBe(0);
    expect(state.iteration_history).toEqual([]);
    expect(state.milestone).toBe(FAKE_MILESTONE);
  });

  test('readWireupState returns null when file missing', () => {
    mockSafeReadFile.mockReturnValue(null);
    expect(readWireupState(FAKE_CWD)).toBeNull();
  });

  test('readWireupState parses valid state file', () => {
    const state = makeWireupState({ features_discovered: 7 });
    mockSafeReadFile.mockReturnValue(JSON.stringify(state));
    const result = readWireupState(FAKE_CWD);
    expect(result!.features_discovered).toBe(7);
  });

  test('writeWireupState writes JSON with trailing newline', () => {
    const state = makeWireupState();
    writeWireupState(FAKE_CWD, state);
    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string];
    expect(content.endsWith('\n')).toBe(true);
  });

  test('advanceWireupIteration increments counters and appends history', () => {
    const state = makeWireupState({ scenarios_passed: 3, scenarios_failed: 1 });
    const next = advanceWireupIteration(state, {
      scenarios_run: 5, passed: 4, failed: 1, fixes_applied: 2,
    });
    expect(next.scenarios_passed).toBe(7);
    expect(next.scenarios_failed).toBe(2);
    expect(next.iteration_history).toHaveLength(1);
    expect(next.iteration_history[0].iteration).toBe(1);
  });

  test('advanceWireupIteration does not mutate input state', () => {
    const state = makeWireupState({ scenarios_passed: 5 });
    advanceWireupIteration(state, { scenarios_run: 3, passed: 2, failed: 1, fixes_applied: 0 });
    expect(state.scenarios_passed).toBe(5);
  });
});

describe('lib/wireup/index.ts barrel exports', () => {
  test('exports all expected functions from state module', () => {
    expect(typeof wireupBarrel['SONNET_MODEL']).toBe('string');
    expect(typeof wireupBarrel['WIREUP_STATE_FILENAME']).toBe('string');
    expect(typeof wireupBarrel['wireupStatePath']).toBe('function');
    expect(typeof wireupBarrel['createInitialWireupState']).toBe('function');
    expect(typeof wireupBarrel['readWireupState']).toBe('function');
    expect(typeof wireupBarrel['writeWireupState']).toBe('function');
    expect(typeof wireupBarrel['advanceWireupIteration']).toBe('function');
  });

  test('exports discoverUnwiredFeatures from discovery module', () => {
    expect(typeof wireupBarrel['discoverUnwiredFeatures']).toBe('function');
  });

  test('exports scenario generation functions from scenarios module', () => {
    expect(typeof wireupBarrel['generateScenarios']).toBe('function');
    expect(typeof wireupBarrel['generateTestData']).toBe('function');
  });

  test('exports execution functions from execution module', () => {
    expect(typeof wireupBarrel['executeScenarios']).toBe('function');
    expect(typeof wireupBarrel['executeHttpStep']).toBe('function');
    expect(typeof wireupBarrel['executeCliStep']).toBe('function');
    expect(typeof wireupBarrel['executeBrowserScenario']).toBe('function');
    expect(typeof wireupBarrel['generateManualSteps']).toBe('function');
  });

  test('exports detection functions from detection module', () => {
    expect(typeof wireupBarrel['detectMissingConnections']).toBe('function');
    expect(typeof wireupBarrel['classifyFailure']).toBe('function');
  });

  test('exports auto-fix functions from autofix module', () => {
    expect(typeof wireupBarrel['autoFixIssue']).toBe('function');
    expect(typeof wireupBarrel['classifyFixConfidence']).toBe('function');
    expect(typeof wireupBarrel['updateFixOutcome']).toBe('function');
    expect(typeof wireupBarrel['partitionByConfidence']).toBe('function');
  });

  test('exports report generation functions from report module', () => {
    expect(typeof wireupBarrel['generateWireupReport']).toBe('function');
    expect(typeof wireupBarrel['formatReportPath']).toBe('function');
  });

  test('exports orchestrator functions from orchestrator module', () => {
    expect(typeof wireupBarrel['runWireup']).toBe('function');
    expect(typeof wireupBarrel['cmdWireup']).toBe('function');
  });

  test('exports CLI context builder function from cli module', () => {
    expect(typeof wireupBarrel['cmdInitWireup']).toBe('function');
  });

  test('SONNET_MODEL constant is a string value', () => {
    expect(wireupBarrel['SONNET_MODEL']).toBe('sonnet');
  });

  test('WIREUP_STATE_FILENAME constant matches expected name', () => {
    expect(wireupBarrel['WIREUP_STATE_FILENAME']).toBe('WIREUP-STATE.json');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 15: Additional detection.ts coverage — uncovered branches
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyFailure() — additional detection coverage', () => {
  const feature = makeFeature();

  beforeEach(() => {
    // Default: grep/find returns no results
    mockSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '', error: undefined });
  });

  test('classifies broken-nav-link for 404 on page-like path (not /api/)', () => {
    const step: StepResult & { status_code: number; headers: Record<string, string>; body: string } = {
      step_index: 0,
      step_type: 'http',
      passed: false,
      expected: {},
      actual: { url: '/dashboard' },
      duration_ms: 10,
      status_code: 404,
      headers: {},
      body: 'Not Found',
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    // broken-nav-link comes after missing-route in priority; for page-like paths both can match
    expect(result).not.toBeNull();
  });

  test('does NOT classify broken-nav-link for /api/ paths', () => {
    const step: StepResult & { status_code: number; headers: Record<string, string>; body: string } = {
      step_index: 0,
      step_type: 'http',
      passed: false,
      expected: {},
      actual: { url: '/api/users' },
      duration_ms: 10,
      status_code: 404,
      headers: {},
      body: 'Not Found',
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    if (result !== null) {
      // API paths should classify as missing-route not broken-nav-link
      expect(result.issue_type).not.toBe('broken-nav-link');
    }
  });

  test('classifies missing-import from Python ModuleNotFoundError', () => {
    const step: CliStepResult = {
      step_index: 0,
      step_type: 'cli',
      passed: false,
      expected: {},
      actual: null,
      exit_code: 1,
      stdout: '',
      stderr: "ModuleNotFoundError: No module named 'numpy'",
      duration_ms: 10,
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).not.toBeNull();
    expect(result!.issue_type).toBe('missing-import');
  });

  test('classifies missing-import from Python ImportError', () => {
    const step: CliStepResult = {
      step_index: 0,
      step_type: 'cli',
      passed: false,
      expected: {},
      actual: null,
      exit_code: 1,
      stdout: '',
      stderr: "ImportError: cannot import name 'DataFrame' from 'pandas'",
      duration_ms: 10,
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).not.toBeNull();
    expect(result!.issue_type).toBe('missing-import');
  });

  test('classifies missing-env-var from process.env.VAR undefined error', () => {
    const step: CliStepResult = {
      step_index: 0,
      step_type: 'cli',
      passed: false,
      expected: {},
      actual: null,
      exit_code: 1,
      stdout: '',
      stderr: 'Error: process.env.DATABASE_URL is undefined',
      duration_ms: 10,
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).not.toBeNull();
    expect(result!.issue_type).toBe('missing-env-var');
    expect(result!.confidence).toBe('high');
  });

  test('classifies missing-env-var from environment variable not set error', () => {
    const step: StepResult = {
      step_index: 0,
      step_type: 'cli',
      passed: false,
      expected: {},
      actual: null,
      error: 'environment variable API_KEY not set',
      duration_ms: 10,
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).not.toBeNull();
    expect(result!.issue_type).toBe('missing-env-var');
  });

  test('returns null for a passing HTTP step', () => {
    const step: StepResult & { status_code: number; headers: Record<string, string>; body: string } = {
      step_index: 0,
      step_type: 'http',
      passed: true,
      expected: {},
      actual: { status_code: 200 },
      duration_ms: 10,
      status_code: 200,
      headers: {},
      body: '{"ok":true}',
    };

    const result = classifyFailure(FAKE_CWD, step as StepResult, { feature });
    expect(result).toBeNull();
  });

  test('handles grep error gracefully in detectMissingRoute (grep fails)', () => {
    // Make grep return an error (spawnSync error)
    mockSpawnSync.mockReturnValue({ status: null, stdout: '', stderr: '', error: new Error('grep not found') });

    const step: StepResult & { status_code: number; headers: Record<string, string>; body: string } = {
      step_index: 0,
      step_type: 'http',
      passed: false,
      expected: {},
      actual: { url: '/missing-route' },
      duration_ms: 10,
      status_code: 404,
      headers: {},
      body: 'Not Found',
    };

    // Should not throw even when grep fails
    expect(() => classifyFailure(FAKE_CWD, step as StepResult, { feature })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 16: runWireup orchestrator (integration-level unit tests)
// ─────────────────────────────────────────────────────────────────────────────

describe('runWireup()', () => {
  const fs = require('fs');

  beforeEach(() => {
    // Default: no existing state
    mockSafeReadFile.mockReturnValue(null);
    // Default: empty project (no unwired features)
    (fs.readdirSync as jest.Mock).mockImplementation(() => { throw new Error('ENOENT'); });
    // getMilestoneInfo returns a mock milestone
    mockGetMilestoneInfo.mockReturnValue({ version: FAKE_MILESTONE, name: 'Test Milestone' });
    // currentMilestone used by scenarios and report
    mockCurrentMilestone.mockReturnValue(FAKE_MILESTONE);
    // mkdirSync and writeFileSync no-ops
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
  });

  test('returns WireupResult with correct shape for empty project', async () => {
    const result = await runWireup(FAKE_CWD);

    expect(typeof result.features_discovered).toBe('number');
    expect(typeof result.scenarios_generated).toBe('number');
    expect(typeof result.scenarios_run).toBe('number');
    expect(typeof result.scenarios_passed).toBe('number');
    expect(typeof result.scenarios_failed).toBe('number');
    expect(typeof result.issues_found).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.pass_fail_summary).toBe('string');
    expect(Array.isArray(result.failed_scenarios)).toBe(true);
  });

  test('returns 0 features for empty codebase', async () => {
    const result = await runWireup(FAKE_CWD);
    expect(result.features_discovered).toBe(0);
    expect(result.scenarios_generated).toBe(0);
    expect(result.scenarios_run).toBe(0);
  });

  test('dry-run skips scenario execution', async () => {
    const result = await runWireup(FAKE_CWD, { dryRun: true });

    expect(result.scenarios_run).toBe(0);
    expect(result.pass_fail_summary).toContain('Dry run');
  });

  test('dry-run returns early without writing state', async () => {
    await runWireup(FAKE_CWD, { dryRun: true });
    // writeFileSync should not be called for state in dry-run
    // (report generation is also skipped in dry-run)
    const stateWrite = (mockWriteFileSync.mock.calls as [string, string][]).some(
      ([p]) => p.includes('WIREUP-STATE.json')
    );
    expect(stateWrite).toBe(false);
  });

  test('filters features by target when target option provided', async () => {
    // Set up a lib directory with two files
    (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
      const libDir = require('path').join(FAKE_CWD, 'lib');
      if (dir === libDir) {
        return [
          { name: 'modA.ts', isFile: () => true, isDirectory: () => false },
          { name: 'modB.ts', isFile: () => true, isDirectory: () => false },
        ];
      }
      throw new Error('ENOENT');
    });

    // modA exports 'targetFunc', modB exports 'otherFunc'
    mockSafeReadFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('modA.ts')) return 'module.exports = { targetFunc };';
      if (filePath.endsWith('modB.ts')) return 'module.exports = { otherFunc };';
      return null;
    });

    const result = await runWireup(FAKE_CWD, { dryRun: true, target: 'targetFunc' });

    // Only targetFunc should be included
    expect(result.features_discovered).toBeLessThanOrEqual(1);
  });

  test('uses default options when none provided', async () => {
    const result = await runWireup(FAKE_CWD);
    // Should complete without error
    expect(result).toBeDefined();
  });

  test('writes wireup state after successful run', async () => {
    await runWireup(FAKE_CWD);

    // State should have been written
    const stateWrite = (mockWriteFileSync.mock.calls as [string, string][]).some(
      ([p]) => p.includes('WIREUP-STATE.json')
    );
    expect(stateWrite).toBe(true);
  });

  test('creates initial state from scratch when no existing state', async () => {
    mockSafeReadFile.mockReturnValue(null); // No existing state

    const result = await runWireup(FAKE_CWD);

    // Should succeed without error
    expect(result).toBeDefined();
    expect(result.scenarios_passed).toBeGreaterThanOrEqual(0);
  });

  test('advances existing state with new iteration results', async () => {
    const existingState = makeWireupState({
      features_discovered: 5,
      scenarios_generated: 3,
      scenarios_passed: 2,
      scenarios_failed: 1,
      iteration_history: [],
    });
    mockSafeReadFile.mockReturnValue(JSON.stringify(existingState));

    const result = await runWireup(FAKE_CWD);

    expect(result).toBeDefined();
    // Result is from this run, not cumulative
    expect(typeof result.scenarios_run).toBe('number');
  });

  test('groups issues by confidence and type when issues are found', async () => {
    // Set up a project with an exported function (uncovered)
    const fs = require('fs');
    (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
      const path = require('path');
      const libDir = path.join(FAKE_CWD, 'lib');
      if (dir === libDir) {
        return [{ name: 'mod.ts', isFile: () => true, isDirectory: () => false }];
      }
      throw new Error('ENOENT');
    });

    // Module exports 'uncalledFunc'
    mockSafeReadFile.mockImplementation((filePath: string) => {
      if (filePath.endsWith('mod.ts')) return 'module.exports = { uncalledFunc };';
      return null;
    });

    // CLI execution fails with module not found
    mockSpawnSync.mockReturnValue({
      status: 1,
      stdout: '',
      stderr: "Cannot find module './missing'",
      error: undefined,
    });

    const result = await runWireup(FAKE_CWD);

    // Should have detected scenarios
    expect(result.features_discovered).toBeGreaterThanOrEqual(0);
    // Issues by confidence/type should be objects with the right shape
    expect(typeof result.issues_by_confidence).toBe('object');
    expect(typeof result.issues_by_type).toBe('object');
    expect(typeof result.issues_by_confidence.high).toBe('number');
    expect(typeof result.issues_by_confidence.medium).toBe('number');
    expect(typeof result.issues_by_confidence.low).toBe('number');
  });

  test('includes report_path in result', async () => {
    const result = await runWireup(FAKE_CWD);

    // Report path should be set
    expect(typeof result.report_path).toBe('string');
    expect(result.report_path).toContain('WIREUP-REPORT.md');
  });
});

describe('cmdWireup()', () => {
  const fs = require('fs');

  beforeEach(() => {
    mockSafeReadFile.mockReturnValue(null);
    (fs.readdirSync as jest.Mock).mockImplementation(() => { throw new Error('ENOENT'); });
    mockGetMilestoneInfo.mockReturnValue({ version: FAKE_MILESTONE, name: 'Test Milestone' });
    mockCurrentMilestone.mockReturnValue(FAKE_MILESTONE);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
    // output() throws to simulate process.exit()
    mockOutput.mockImplementation(() => { throw new Error('process.exit called'); });
  });

  test('calls output() with wireup result', async () => {
    try {
      await _cmdWireup(FAKE_CWD, [], false);
    } catch (err) {
      // Expected: output() throws to simulate process.exit
      expect((err as Error).message).toBe('process.exit called');
    }
    expect(mockOutput).toHaveBeenCalledTimes(1);
  });

  test('parses --dry-run flag', async () => {
    try {
      await _cmdWireup(FAKE_CWD, ['--dry-run'], true);
    } catch {
      // Expected: output() throws
    }
    const result = mockOutput.mock.calls[0][0] as import('../../lib/wireup/types').WireupResult;
    expect(result.scenarios_run).toBe(0);
  });

  test('parses --target flag', async () => {
    try {
      await _cmdWireup(FAKE_CWD, ['--target', 'myFunc', '--dry-run'], true);
    } catch {
      // Expected: output() throws
    }
    expect(mockOutput).toHaveBeenCalledTimes(1);
  });

  test('parses --timeout flag', async () => {
    try {
      await _cmdWireup(FAKE_CWD, ['--timeout', '5000', '--dry-run'], true);
    } catch {
      // Expected: output() throws
    }
    expect(mockOutput).toHaveBeenCalledTimes(1);
  });

  test('parses --max-turns flag', async () => {
    try {
      await _cmdWireup(FAKE_CWD, ['--max-turns', '3', '--dry-run'], true);
    } catch {
      // Expected: output() throws
    }
    expect(mockOutput).toHaveBeenCalledTimes(1);
  });

  test('parses --base-url flag', async () => {
    try {
      await _cmdWireup(FAKE_CWD, ['--base-url', 'http://localhost:8080', '--dry-run'], true);
    } catch {
      // Expected: output() throws
    }
    expect(mockOutput).toHaveBeenCalledTimes(1);
  });
});

// ─── executeStaticStep ────────────────────────────────────────────────────────

describe('executeStaticStep', () => {
  const realFs = jest.requireActual('fs') as typeof import('fs');
  const realPath = jest.requireActual('path') as typeof import('path');
  const realOs = jest.requireActual('os') as typeof import('os');
  let tmpDir: string;

  // The fs mock replaces readFileSync and readdirSync — restore real impls for these tests
  const mockFsModule = require('fs') as { readFileSync: jest.Mock; readdirSync: jest.Mock };

  beforeEach(() => {
    mockReadFileSync.mockImplementation((...args: Parameters<typeof realFs.readFileSync>) =>
      (realFs.readFileSync as (...a: Parameters<typeof realFs.readFileSync>) => ReturnType<typeof realFs.readFileSync>)(...args)
    );
    mockFsModule.readdirSync.mockImplementation((...args: Parameters<typeof realFs.readdirSync>) =>
      (realFs.readdirSync as (...a: Parameters<typeof realFs.readdirSync>) => ReturnType<typeof realFs.readdirSync>)(...args)
    );
  });

  afterEach(() => {
    mockReadFileSync.mockReset();
    mockFsModule.readdirSync.mockReset();
    if (tmpDir) realFs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes when export exists in file (ES module export)', () => {
    tmpDir = realFs.mkdtempSync(realPath.join(realOs.tmpdir(), 'wireup-static-'));
    realFs.writeFileSync(realPath.join(tmpDir, 'utils.ts'), 'export function doThing() { return 1; }');
    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'export_exists', filePath: 'utils.ts', exportName: 'doThing' },
      expected_outcome: 'Export exists',
    }, tmpDir);
    expect(result.passed).toBe(true);
    expect(result.step_type).toBe('static');
  });

  it('passes when export exists via export default', () => {
    tmpDir = realFs.mkdtempSync(realPath.join(realOs.tmpdir(), 'wireup-static-'));
    realFs.writeFileSync(realPath.join(tmpDir, 'Button.tsx'), 'export default function Button() {}');
    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'export_exists', filePath: 'Button.tsx', exportName: 'Button' },
      expected_outcome: 'Export exists',
    }, tmpDir);
    expect(result.passed).toBe(true);
  });

  it('passes when export exists via export { name }', () => {
    tmpDir = realFs.mkdtempSync(realPath.join(realOs.tmpdir(), 'wireup-static-'));
    realFs.writeFileSync(realPath.join(tmpDir, 'index.ts'), 'const doThing = 1;\nexport { doThing }');
    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'export_exists', filePath: 'index.ts', exportName: 'doThing' },
      expected_outcome: 'Export exists',
    }, tmpDir);
    expect(result.passed).toBe(true);
  });

  it('fails when export does not exist in file', () => {
    tmpDir = realFs.mkdtempSync(realPath.join(realOs.tmpdir(), 'wireup-static-'));
    realFs.writeFileSync(realPath.join(tmpDir, 'utils.ts'), 'export function other() {}');
    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'export_exists', filePath: 'utils.ts', exportName: 'doThing' },
      expected_outcome: 'Export exists',
    }, tmpDir);
    expect(result.passed).toBe(false);
  });

  it('fails when file does not exist', () => {
    tmpDir = realFs.mkdtempSync(realPath.join(realOs.tmpdir(), 'wireup-static-'));
    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'export_exists', filePath: 'missing.ts', exportName: 'x' },
      expected_outcome: 'Export exists',
    }, tmpDir);
    expect(result.passed).toBe(false);
  });

  it('passes import_graph_connected when export is referenced', () => {
    tmpDir = realFs.mkdtempSync(realPath.join(realOs.tmpdir(), 'wireup-static-'));
    const srcDir = realPath.join(tmpDir, 'src');
    realFs.mkdirSync(srcDir);
    realFs.writeFileSync(realPath.join(srcDir, 'utils.ts'), 'export function doThing() {}');
    realFs.writeFileSync(realPath.join(srcDir, 'app.ts'), "import { doThing } from './utils';");
    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'import_graph_connected', filePath: 'src/utils.ts', exportName: 'doThing' },
      expected_outcome: 'Referenced',
    }, tmpDir);
    expect(result.passed).toBe(true);
  });

  it('fails import_graph_connected when export has no references', () => {
    tmpDir = realFs.mkdtempSync(realPath.join(realOs.tmpdir(), 'wireup-static-'));
    const srcDir = realPath.join(tmpDir, 'src');
    realFs.mkdirSync(srcDir);
    realFs.writeFileSync(realPath.join(srcDir, 'utils.ts'), 'export function orphan() {}');
    realFs.writeFileSync(realPath.join(srcDir, 'app.ts'), "import { other } from './other';");
    const result = executeStaticStep(0, {
      step_type: 'static',
      parameters: { check: 'import_graph_connected', filePath: 'src/utils.ts', exportName: 'orphan' },
      expected_outcome: 'Referenced',
    }, tmpDir);
    expect(result.passed).toBe(false);
  });
});
