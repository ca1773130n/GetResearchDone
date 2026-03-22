'use strict';

/**
 * GRD Wireup -- Scenario and test data generation
 *
 * Generates WireupScenario[] from UnwiredFeature[] discovered by the discovery engine,
 * and writes JSON test data fixture files for each scenario.
 *
 * IMPORTANT: No child process spawn or exec calls. Uses only fs.readFileSync /
 * fs.mkdirSync / fs.writeFileSync for all file operations.
 *
 * @dependencies ./types, ../utils, ../paths
 */

import type { UnwiredFeature, WireupScenario, ScenarioStep } from './types';

const fs = require('fs');
const path = require('path');
const {
  safeReadFile,
}: {
  safeReadFile: (filePath: string) => string | null;
} = require('../utils');
const {
  currentMilestone,
}: {
  currentMilestone: (cwd: string) => string;
} = require('../paths');

// ─── Type Defaults ────────────────────────────────────────────────────────────

/**
 * Map from TypeScript type name to a sensible default value for fixture generation.
 */
const TYPE_DEFAULTS: Record<string, unknown> = {
  string: 'test-value',
  number: 42,
  boolean: true,
  'string[]': ['item-1', 'item-2'],
  'Record<string, unknown>': { key: 'value' },
  object: { key: 'value' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Derive a default value for a given TypeScript type annotation string.
 * Falls back to null for unknown types.
 */
function _defaultForType(typeName: string): unknown {
  const normalized: string = typeName.trim();
  if (TYPE_DEFAULTS[normalized] !== undefined) return TYPE_DEFAULTS[normalized];
  if (normalized.endsWith('[]')) return ['item-1', 'item-2'];
  if (normalized.startsWith('Record<') || normalized === 'object') return { key: 'value' };
  return null;
}

/**
 * Extract function parameter names and types from a TypeScript/JavaScript source file.
 *
 * Handles patterns like:
 *   function name(param1: Type1, param2: Type2)
 *   const name = (param1: Type1, param2: Type2) =>
 *
 * Returns an array of { name, type } pairs.
 */
function _extractParams(
  content: string,
  functionName: string
): Array<{ name: string; type: string }> {
  const params: Array<{ name: string; type: string }> = [];

  // Match: function <name>(...) or const <name> = (...) =>
  const patterns: RegExp[] = [
    new RegExp(`function\\s+${functionName}\\s*\\(([^)]+)\\)`),
    new RegExp(`const\\s+${functionName}\\s*=\\s*(?:async\\s*)?\\(([^)]+)\\)`),
    new RegExp(`${functionName}\\s*(?:=\\s*)?(?:async\\s*)?\\(([^)]+)\\)`),
  ];

  let paramStr: string | null = null;
  for (const re of patterns) {
    const m: RegExpMatchArray | null = content.match(re);
    if (m) {
      paramStr = m[1];
      break;
    }
  }

  if (!paramStr) return params;

  // Split on comma but not inside angle brackets
  const parts: string[] = paramStr.split(',');
  for (const part of parts) {
    const trimmed: string = part.trim();
    if (!trimmed) continue;
    // Match "name: Type" or "name" (no annotation)
    const colonIdx: number = trimmed.indexOf(':');
    if (colonIdx >= 0) {
      const name: string = trimmed.slice(0, colonIdx).replace(/^[_?]/, '').trim();
      const type: string = trimmed.slice(colonIdx + 1).trim();
      if (name) params.push({ name, type });
    } else {
      const name: string = trimmed.replace(/^[_?]/, '').trim();
      if (name) params.push({ name, type: 'string' });
    }
  }

  return params;
}

// ─── Scenario Generation ─────────────────────────────────────────────────────

/**
 * Generate a WireupScenario for an 'exported-but-uncalled' feature.
 *
 * Produces two steps:
 *   1. static step: check export exists in source file
 *   2. static step: check import graph is connected
 */
function _scenarioForExportedButUncalled(
  feature: UnwiredFeature,
  fixturePath: string
): WireupScenario {
  const steps: ScenarioStep[] = [
    {
      step_type: 'static',
      parameters: {
        check: 'export_exists',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Export exists in source file',
    },
    {
      step_type: 'static',
      parameters: {
        check: 'import_graph_connected',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Export is imported or referenced somewhere',
    },
  ];
  return { feature, steps, test_data_fixture: fixturePath };
}

/**
 * Generate a WireupScenario for a 'config-without-surface' feature.
 *
 * Produces two steps:
 *   1. cli step: run gd settings and check output
 *   2. assert step: verify config key is accessible
 */
function _scenarioForConfigWithoutSurface(
  feature: UnwiredFeature,
  fixturePath: string
): WireupScenario {
  const steps: ScenarioStep[] = [
    {
      step_type: 'cli',
      parameters: {
        command: 'gd',
        args: ['settings'],
      },
      expected_outcome: 'Config key appears in settings output',
    },
    {
      step_type: 'assert',
      parameters: { check: 'config_key_visible', key: feature.functionName },
      expected_outcome: 'Config option is accessible via CLI',
    },
  ];
  return { feature, steps, test_data_fixture: fixturePath };
}

/**
 * Generate a WireupScenario for an 'endpoint-without-integration-test' feature.
 *
 * Produces two steps:
 *   1. http step: POST to the endpoint
 *   2. assert step: validate response schema
 */
function _scenarioForEndpointWithoutTest(
  feature: UnwiredFeature,
  fixturePath: string
): WireupScenario {
  const steps: ScenarioStep[] = [
    {
      step_type: 'http',
      parameters: {
        method: 'POST',
        endpoint: feature.functionName,
      },
      expected_outcome: 'Endpoint responds with valid JSON',
    },
    {
      step_type: 'assert',
      parameters: { check: 'response_schema_valid' },
      expected_outcome: 'Response matches expected schema',
    },
  ];
  return { feature, steps, test_data_fixture: fixturePath };
}

/**
 * Generate a WireupScenario for an 'app-route-without-test' feature.
 *
 * Produces two steps:
 *   1. http step: request the route with the detected method
 *   2. assert step: check response status and schema
 */
function _scenarioForAppRoute(
  feature: UnwiredFeature,
  fixturePath: string
): WireupScenario {
  // functionName is "METHOD /path" (e.g. "GET /api/users")
  const parts: string[] = feature.functionName.split(' ');
  const method: string = parts[0] || 'GET';
  const route: string = parts.slice(1).join(' ') || '/';

  const steps: ScenarioStep[] = [
    {
      step_type: 'http',
      parameters: {
        method,
        endpoint: route,
      },
      expected_outcome: `${method} ${route} responds successfully`,
    },
    {
      step_type: 'assert',
      parameters: { check: 'status_ok', method, route },
      expected_outcome: 'Response status is 2xx or 3xx',
    },
  ];
  return { feature, steps, test_data_fixture: fixturePath };
}

/**
 * Generate a WireupScenario for an 'app-exported-but-uncalled' feature.
 * Same pattern as exported-but-uncalled but resolves from app source dirs.
 */
function _scenarioForAppExportedButUncalled(
  feature: UnwiredFeature,
  fixturePath: string
): WireupScenario {
  const steps: ScenarioStep[] = [
    {
      step_type: 'static',
      parameters: {
        check: 'export_exists',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Export exists and is accessible',
    },
    {
      step_type: 'static',
      parameters: {
        check: 'import_graph_connected',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Exported symbol is referenced in the project',
    },
  ];
  return { feature, steps, test_data_fixture: fixturePath };
}

/**
 * Generate a WireupScenario for an 'app-model-without-handler' feature.
 */
function _scenarioForAppModel(
  feature: UnwiredFeature,
  fixturePath: string
): WireupScenario {
  const modelLower: string = feature.functionName.toLowerCase();
  const steps: ScenarioStep[] = [
    {
      step_type: 'http',
      parameters: {
        method: 'GET',
        endpoint: `/api/${modelLower}s`,
      },
      expected_outcome: `GET /api/${modelLower}s responds (model "${feature.functionName}" has a handler)`,
    },
    {
      step_type: 'assert',
      parameters: { check: 'model_has_handler', model: feature.functionName },
      expected_outcome: 'Model has at least one CRUD endpoint',
    },
  ];
  return { feature, steps, test_data_fixture: fixturePath };
}

/**
 * Generate a WireupScenario for an 'app-component-without-import' feature.
 */
function _scenarioForAppComponent(
  feature: UnwiredFeature,
  fixturePath: string
): WireupScenario {
  const steps: ScenarioStep[] = [
    {
      step_type: 'static',
      parameters: {
        check: 'export_exists',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Component is exported',
    },
    {
      step_type: 'static',
      parameters: {
        check: 'import_graph_connected',
        filePath: feature.filePath,
        exportName: feature.functionName,
      },
      expected_outcome: 'Component is imported or used somewhere',
    },
  ];
  return { feature, steps, test_data_fixture: fixturePath };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate wireup scenarios for a list of unwired features.
 *
 * Each scenario includes ordered steps to exercise the feature end-to-end,
 * along with a reference to the test data fixture file.
 *
 * Step types produced per category:
 *   - 'exported-but-uncalled': cli, assert
 *   - 'config-without-surface': cli, assert
 *   - 'endpoint-without-integration-test': http, assert
 *
 * @param features - Array of unwired features from discoverUnwiredFeatures()
 * @param cwd - Absolute path to the project root
 * @returns Array of WireupScenario objects ready for execution
 */
function generateScenarios(features: UnwiredFeature[], cwd: string): WireupScenario[] {
  const milestone: string = currentMilestone(cwd);
  const scenarios: WireupScenario[] = [];

  for (const feature of features) {
    const fixturePath: string = path.join(
      cwd,
      '.planning',
      'milestones',
      milestone,
      'wireup',
      'test-data',
      `${feature.functionName}.json`
    );

    let scenario: WireupScenario;
    switch (feature.category) {
      case 'exported-but-uncalled':
        scenario = _scenarioForExportedButUncalled(feature, fixturePath);
        break;
      case 'config-without-surface':
        scenario = _scenarioForConfigWithoutSurface(feature, fixturePath);
        break;
      case 'endpoint-without-integration-test':
        scenario = _scenarioForEndpointWithoutTest(feature, fixturePath);
        break;
      case 'app-route-without-test':
        scenario = _scenarioForAppRoute(feature, fixturePath);
        break;
      case 'app-exported-but-uncalled':
        scenario = _scenarioForAppExportedButUncalled(feature, fixturePath);
        break;
      case 'app-model-without-handler':
        scenario = _scenarioForAppModel(feature, fixturePath);
        break;
      case 'app-component-without-import':
        scenario = _scenarioForAppComponent(feature, fixturePath);
        break;
      default:
        scenario = _scenarioForExportedButUncalled(feature, fixturePath);
        break;
    }

    scenarios.push(scenario);
  }

  return scenarios;
}

/**
 * Generate and write JSON test data fixture files for a list of wireup scenarios.
 *
 * For each scenario, reads the source file at `scenario.feature.filePath` and
 * extracts the function signature to derive realistic parameter defaults:
 *   - string  -> "test-value"
 *   - number  -> 42
 *   - boolean -> true
 *   - string[] -> ["item-1", "item-2"]
 *   - object/Record -> { "key": "value" }
 *   - unknown -> null
 *
 * Writes each fixture as JSON to `scenario.test_data_fixture`.
 * Parent directories are created with { recursive: true }.
 *
 * @param scenarios - Array of WireupScenario objects from generateScenarios()
 * @param cwd - Absolute path to the project root
 */
function generateTestData(scenarios: WireupScenario[], cwd: string): void {
  for (const scenario of scenarios) {
    const { feature, test_data_fixture: fixturePath } = scenario;

    // Resolve the source file path (may be relative or absolute)
    const sourceAbsPath: string = path.isAbsolute(feature.filePath)
      ? feature.filePath
      : path.join(cwd, feature.filePath);

    const sourceContent: string | null = safeReadFile(sourceAbsPath);

    const paramDefs: Array<{ name: string; type: string }> = sourceContent
      ? _extractParams(sourceContent, feature.functionName)
      : [];

    const parameters: Record<string, unknown> = {};
    for (const { name, type } of paramDefs) {
      parameters[name] = _defaultForType(type);
    }

    const fixture: Record<string, unknown> = {
      feature: feature.functionName,
      parameters,
      generated_at: new Date().toISOString(),
    };

    // Ensure parent directory exists
    const parentDir: string = path.dirname(fixturePath);
    fs.mkdirSync(parentDir, { recursive: true });

    // Write the fixture as formatted JSON
    fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), 'utf-8');
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { generateScenarios, generateTestData };
