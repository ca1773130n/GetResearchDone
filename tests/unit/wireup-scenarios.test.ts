/**
 * Unit tests for lib/wireup/scenarios.ts
 *
 * Tests for generateScenarios() and generateTestData() covering:
 * 1. Scenario generation for all three feature categories
 * 2. Test data fixture writing with type-derived defaults
 * 3. Edge cases: empty input, fixture path, parameter extraction
 *
 * Uses jest.mock for fs, ../utils, and ../paths to enable controlled testing.
 */

import type { UnwiredFeature, WireupScenario } from '../../lib/wireup/types';

const path = require('path');

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockSafeReadFile = jest.fn();
const mockCurrentMilestone = jest.fn();

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
  existsSync: jest.fn(),
}));

jest.mock('../../lib/utils', () => ({
  safeReadFile: mockSafeReadFile,
}));

jest.mock('../../lib/paths', () => ({
  currentMilestone: mockCurrentMilestone,
}));

const {
  generateScenarios,
  generateTestData,
}: {
  generateScenarios: (features: UnwiredFeature[], cwd: string) => WireupScenario[];
  generateTestData: (scenarios: WireupScenario[], cwd: string) => void;
} = require('../../lib/wireup/scenarios');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAKE_CWD = '/fake/project';
const FAKE_MILESTONE = 'v0.3.13';

function makeFeature(
  category: UnwiredFeature['category'],
  functionName: string,
  filePath = 'lib/someModule.ts'
): UnwiredFeature {
  return {
    category,
    filePath,
    functionName,
    suggestedAction: 'Test suggested action',
  };
}

// ─── Test Suite: generateScenarios() ─────────────────────────────────────────

describe('generateScenarios()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentMilestone.mockReturnValue(FAKE_MILESTONE);
  });

  test('1. generates CLI scenario for exported-but-uncalled feature', () => {
    const feature: UnwiredFeature = makeFeature('exported-but-uncalled', 'myFunc');
    const scenarios: WireupScenario[] = generateScenarios([feature], FAKE_CWD);

    expect(scenarios).toHaveLength(1);
    const [scenario] = scenarios;

    // Steps must contain cli and assert types
    const stepTypes = scenario.steps.map((s) => s.step_type);
    expect(stepTypes).toContain('cli');
    expect(stepTypes).toContain('assert');

    // cli step should reference the function
    const cliStep = scenario.steps.find((s) => s.step_type === 'cli');
    expect(cliStep).toBeDefined();
    expect(cliStep!.expected_outcome).toBe('Function executes without error');
  });

  test('2. generates CLI scenario for config-without-surface feature', () => {
    const feature: UnwiredFeature = makeFeature('config-without-surface', 'model_profile', '.planning/config.json');
    const scenarios: WireupScenario[] = generateScenarios([feature], FAKE_CWD);

    expect(scenarios).toHaveLength(1);
    const [scenario] = scenarios;

    // cli step should reference gd settings command
    const cliStep = scenario.steps.find((s) => s.step_type === 'cli');
    expect(cliStep).toBeDefined();
    const params = cliStep!.parameters as { command: string; args: string[] };
    expect(params.command).toBe('gd');
    expect(params.args).toContain('settings');

    // assert step should check config key visibility
    const assertStep = scenario.steps.find((s) => s.step_type === 'assert');
    expect(assertStep).toBeDefined();
    const assertParams = assertStep!.parameters as { check: string; key: string };
    expect(assertParams.check).toBe('config_key_visible');
    expect(assertParams.key).toBe('model_profile');
  });

  test('3. generates HTTP scenario for endpoint-without-integration-test feature', () => {
    const feature: UnwiredFeature = makeFeature('endpoint-without-integration-test', 'grd_my_tool', 'lib/mcp-server.ts');
    const scenarios: WireupScenario[] = generateScenarios([feature], FAKE_CWD);

    expect(scenarios).toHaveLength(1);
    const [scenario] = scenarios;

    // Steps must contain http and assert types
    const stepTypes = scenario.steps.map((s) => s.step_type);
    expect(stepTypes).toContain('http');
    expect(stepTypes).toContain('assert');

    // http step should reference the endpoint
    const httpStep = scenario.steps.find((s) => s.step_type === 'http');
    expect(httpStep).toBeDefined();
    const params = httpStep!.parameters as { method: string; endpoint: string };
    expect(params.method).toBe('POST');
    expect(params.endpoint).toBe('grd_my_tool');
    expect(httpStep!.expected_outcome).toBe('Endpoint responds with valid JSON');
  });

  test('4. sets correct test_data_fixture path using milestone', () => {
    const feature: UnwiredFeature = makeFeature('exported-but-uncalled', 'myFunc');
    const scenarios: WireupScenario[] = generateScenarios([feature], FAKE_CWD);

    const [scenario] = scenarios;
    expect(scenario.test_data_fixture).toContain('v0.3.13');
    expect(scenario.test_data_fixture).toContain('wireup');
    expect(scenario.test_data_fixture).toContain('test-data');
    expect(scenario.test_data_fixture).toContain('myFunc.json');
  });

  test('5. returns empty array for empty features input', () => {
    const scenarios: WireupScenario[] = generateScenarios([], FAKE_CWD);
    expect(scenarios).toEqual([]);
  });

  test('6. generates one scenario per feature', () => {
    const features: UnwiredFeature[] = [
      makeFeature('exported-but-uncalled', 'funcA'),
      makeFeature('config-without-surface', 'configKey', '.planning/config.json'),
      makeFeature('endpoint-without-integration-test', 'grd_tool', 'lib/mcp-server.ts'),
    ];
    const scenarios: WireupScenario[] = generateScenarios(features, FAKE_CWD);
    expect(scenarios).toHaveLength(3);
  });

  test('7. each scenario has feature reference preserved', () => {
    const feature: UnwiredFeature = makeFeature('exported-but-uncalled', 'myFunc');
    const scenarios: WireupScenario[] = generateScenarios([feature], FAKE_CWD);
    expect(scenarios[0].feature).toBe(feature);
  });

  test('8. each scenario step has step_type, parameters, and expected_outcome', () => {
    const feature: UnwiredFeature = makeFeature('exported-but-uncalled', 'myFunc');
    const scenarios: WireupScenario[] = generateScenarios([feature], FAKE_CWD);
    for (const scenario of scenarios) {
      for (const step of scenario.steps) {
        expect(typeof step.step_type).toBe('string');
        expect(typeof step.parameters).toBe('object');
        expect(step.parameters).not.toBeNull();
        expect(typeof step.expected_outcome).toBe('string');
      }
    }
  });
});

// ─── Test Suite: generateTestData() ──────────────────────────────────────────

describe('generateTestData()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentMilestone.mockReturnValue(FAKE_MILESTONE);
    mockSafeReadFile.mockReturnValue(null);
    mockMkdirSync.mockImplementation(() => undefined);
    mockWriteFileSync.mockImplementation(() => undefined);
  });

  function makeScenario(feature: UnwiredFeature): WireupScenario {
    const fixturePath = path.join(
      FAKE_CWD,
      '.planning', 'milestones', FAKE_MILESTONE, 'wireup', 'test-data',
      `${feature.functionName}.json`
    );
    return {
      feature,
      steps: [],
      test_data_fixture: fixturePath,
    };
  }

  test('9. writes JSON fixture file for each scenario', () => {
    const feature: UnwiredFeature = makeFeature('exported-but-uncalled', 'myFunc');
    const scenario: WireupScenario = makeScenario(feature);

    generateTestData([scenario], FAKE_CWD);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenContent] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    expect(writtenPath).toBe(scenario.test_data_fixture);

    // Content should be valid JSON
    const parsed: Record<string, unknown> = JSON.parse(writtenContent);
    expect(typeof parsed).toBe('object');
  });

  test('10. creates parent directories recursively', () => {
    const feature: UnwiredFeature = makeFeature('exported-but-uncalled', 'myFunc');
    const scenario: WireupScenario = makeScenario(feature);

    generateTestData([scenario], FAKE_CWD);

    expect(mockMkdirSync).toHaveBeenCalledWith(
      path.dirname(scenario.test_data_fixture),
      { recursive: true }
    );
  });

  test('11. fixture contains feature name and generated_at timestamp', () => {
    const feature: UnwiredFeature = makeFeature('exported-but-uncalled', 'myFunc');
    const scenario: WireupScenario = makeScenario(feature);

    generateTestData([scenario], FAKE_CWD);

    const [, writtenContent] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    const parsed: Record<string, unknown> = JSON.parse(writtenContent);

    expect(parsed.feature).toBe('myFunc');
    expect(typeof parsed.generated_at).toBe('string');
    // Should be an ISO timestamp
    expect(new Date(parsed.generated_at as string).toISOString()).toBe(parsed.generated_at);
  });

  test('12. extracts parameter types from source file signatures', () => {
    const feature: UnwiredFeature = makeFeature('exported-but-uncalled', 'doWork');
    const scenario: WireupScenario = makeScenario(feature);

    // Mock the source file with a typed function signature
    mockSafeReadFile.mockImplementation((filePath: string) => {
      if (filePath === path.join(FAKE_CWD, feature.filePath)) {
        return `function doWork(name: string, count: number, enabled: boolean) { return name; }`;
      }
      return null;
    });

    generateTestData([scenario], FAKE_CWD);

    const [, writtenContent] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    const parsed: Record<string, unknown> = JSON.parse(writtenContent);
    const parameters = parsed.parameters as Record<string, unknown>;

    expect(parameters.name).toBe('test-value');
    expect(parameters.count).toBe(42);
    expect(parameters.enabled).toBe(true);
  });

  test('13. fixture has empty parameters when source file is missing', () => {
    const feature: UnwiredFeature = makeFeature('exported-but-uncalled', 'noSource');
    const scenario: WireupScenario = makeScenario(feature);

    mockSafeReadFile.mockReturnValue(null);

    generateTestData([scenario], FAKE_CWD);

    const [, writtenContent] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    const parsed: Record<string, unknown> = JSON.parse(writtenContent);
    expect(parsed.parameters).toEqual({});
  });

  test('14. writes one fixture per scenario', () => {
    const features: UnwiredFeature[] = [
      makeFeature('exported-but-uncalled', 'funcA'),
      makeFeature('config-without-surface', 'configKey', '.planning/config.json'),
      makeFeature('endpoint-without-integration-test', 'grd_tool', 'lib/mcp-server.ts'),
    ];
    const scenarios: WireupScenario[] = features.map(makeScenario);

    generateTestData(scenarios, FAKE_CWD);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(3);
    expect(mockMkdirSync).toHaveBeenCalledTimes(3);
  });

  test('15. handles string[] and object param types with sensible defaults', () => {
    const feature: UnwiredFeature = makeFeature('exported-but-uncalled', 'processItems');
    const scenario: WireupScenario = makeScenario(feature);

    mockSafeReadFile.mockImplementation((filePath: string) => {
      if (filePath === path.join(FAKE_CWD, feature.filePath)) {
        return `function processItems(items: string[], config: Record<string, unknown>) { return items; }`;
      }
      return null;
    });

    generateTestData([scenario], FAKE_CWD);

    const [, writtenContent] = mockWriteFileSync.mock.calls[0] as [string, string, string];
    const parsed: Record<string, unknown> = JSON.parse(writtenContent);
    const parameters = parsed.parameters as Record<string, unknown>;

    expect(Array.isArray(parameters.items)).toBe(true);
    expect(typeof parameters.config).toBe('object');
    expect(parameters.config).not.toBeNull();
  });
});
