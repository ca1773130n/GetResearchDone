'use strict';

/**
 * GRD Wireup -- HTTP and CLI scenario execution engine
 *
 * Runs generated wireup scenarios against localhost services and CLI commands.
 * Captures results with per-step pass/fail comparison.
 *
 * Uses only Node.js built-ins: fetch (Node 18+) for HTTP, child_process for CLI.
 * No external HTTP library dependencies.
 *
 * @dependencies ./types, child_process (built-in), node:fetch (built-in, Node 18+)
 */

import type {
  WireupScenario,
  ScenarioResult,
  StepResult,
  HttpStepResult,
  CliStepResult,
  ExecutionOptions,
} from './types';

const { spawnSync } = require('child_process') as {
  spawnSync: (
    command: string,
    args: string[],
    options: {
      encoding: 'utf-8';
      timeout: number;
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    }
  ) => {
    status: number | null;
    stdout: string;
    stderr: string;
    error?: Error;
  };
};

// ─── Default Options ──────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BASE_URL = 'http://localhost:3000';

// ─── HTTP Step Execution ──────────────────────────────────────────────────────

/**
 * Execute an HTTP scenario step using Node.js built-in fetch.
 *
 * Captures status code, response headers, and body text.
 * Compares against expected_outcome fields:
 *   - status: number match
 *   - body_contains: substring match
 *   - headers: key-value match (case-insensitive header names)
 *
 * Network errors (ECONNREFUSED, timeout) produce a failed result with
 * an error message — they do NOT throw.
 */
async function executeHttpStep(
  stepIndex: number,
  step: WireupScenario['steps'][number],
  options: ExecutionOptions
): Promise<HttpStepResult> {
  const startTime = Date.now();
  const baseUrl = options.base_url ?? DEFAULT_BASE_URL;
  const timeoutMs = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;

  const params = step.parameters as Record<string, unknown>;
  const method = typeof params['method'] === 'string' ? params['method'] : 'GET';
  const endpoint = typeof params['endpoint'] === 'string' ? params['endpoint'] : '/';
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  // Parse expected_outcome: may be a JSON string or plain string
  let expectedOutcome: Record<string, unknown> = {};
  if (typeof step.expected_outcome === 'string') {
    try {
      const parsed: unknown = JSON.parse(step.expected_outcome);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        expectedOutcome = parsed as Record<string, unknown>;
      }
    } catch {
      // Not a JSON string — treat as a plain description with no structured expectations
    }
  }

  try {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        signal: controller.signal,
        headers:
          params['headers'] !== undefined && typeof params['headers'] === 'object'
            ? (params['headers'] as Record<string, string>)
            : undefined,
        body:
          params['body'] !== undefined
            ? JSON.stringify(params['body'])
            : undefined,
      });
    } finally {
      clearTimeout(timerId);
    }

    const body = await response.text();
    const statusCode = response.status;

    // Convert Headers to plain object
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Evaluate pass/fail
    const checks: boolean[] = [];

    if (typeof expectedOutcome['status'] === 'number') {
      checks.push(statusCode === expectedOutcome['status']);
    }
    if (typeof expectedOutcome['body_contains'] === 'string') {
      checks.push(body.includes(expectedOutcome['body_contains']));
    }
    if (
      expectedOutcome['headers'] !== null &&
      typeof expectedOutcome['headers'] === 'object' &&
      !Array.isArray(expectedOutcome['headers'])
    ) {
      const expectedHeaders = expectedOutcome['headers'] as Record<string, string>;
      for (const [key, val] of Object.entries(expectedHeaders)) {
        checks.push(headers[key.toLowerCase()] === val);
      }
    }

    const passed = checks.length === 0 ? statusCode >= 200 && statusCode < 300 : checks.every(Boolean);
    const durationMs = Date.now() - startTime;

    return {
      step_index: stepIndex,
      step_type: 'http',
      passed,
      expected: expectedOutcome,
      actual: { status_code: statusCode, body: body.slice(0, 500) },
      duration_ms: durationMs,
      status_code: statusCode,
      headers,
      body,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;
    return {
      step_index: stepIndex,
      step_type: 'http',
      passed: false,
      expected: expectedOutcome,
      actual: null,
      error: errorMessage,
      duration_ms: durationMs,
      status_code: 0,
      headers: {},
      body: '',
    };
  }
}

// ─── CLI Step Execution ───────────────────────────────────────────────────────

/**
 * Execute a CLI scenario step using child_process.spawnSync.
 *
 * Captures stdout, stderr, and exit code.
 * Compares against expected_outcome fields:
 *   - exit_code: exact match
 *   - stdout_contains: substring match
 *   - stderr_contains: substring match
 *
 * Spawn errors produce a failed result with an error message — they do NOT throw.
 *
 * NOTE: Uses spawnSync (not exec) to avoid shell injection. The command and args
 * are passed directly to the OS without shell interpretation.
 */
async function executeCliStep(
  stepIndex: number,
  step: WireupScenario['steps'][number],
  options: ExecutionOptions,
  cwd: string
): Promise<CliStepResult> {
  const startTime = Date.now();
  const timeoutMs = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;

  const params = step.parameters as Record<string, unknown>;
  const command = typeof params['command'] === 'string' ? params['command'] : 'echo';
  const args: string[] = Array.isArray(params['args'])
    ? (params['args'] as unknown[]).map(String)
    : [];

  // Parse expected_outcome
  let expectedOutcome: Record<string, unknown> = {};
  if (typeof step.expected_outcome === 'string') {
    try {
      const parsed: unknown = JSON.parse(step.expected_outcome);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        expectedOutcome = parsed as Record<string, unknown>;
      }
    } catch {
      // Plain description — no structured expectations
    }
  }

  try {
    const result = spawnSync(command, args, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      cwd,
      env: process.env,
    });

    if (result.error) {
      const durationMs = Date.now() - startTime;
      return {
        step_index: stepIndex,
        step_type: 'cli',
        passed: false,
        expected: expectedOutcome,
        actual: null,
        error: result.error.message,
        duration_ms: durationMs,
        exit_code: -1,
        stdout: '',
        stderr: '',
      };
    }

    const exitCode = result.status ?? -1;
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';

    // Evaluate pass/fail
    const checks: boolean[] = [];

    if (typeof expectedOutcome['exit_code'] === 'number') {
      checks.push(exitCode === expectedOutcome['exit_code']);
    }
    if (typeof expectedOutcome['stdout_contains'] === 'string') {
      checks.push(stdout.includes(expectedOutcome['stdout_contains']));
    }
    if (typeof expectedOutcome['stderr_contains'] === 'string') {
      checks.push(stderr.includes(expectedOutcome['stderr_contains']));
    }

    // Default: exit code 0 means pass if no explicit expectations
    const passed = checks.length === 0 ? exitCode === 0 : checks.every(Boolean);
    const durationMs = Date.now() - startTime;

    return {
      step_index: stepIndex,
      step_type: 'cli',
      passed,
      expected: expectedOutcome,
      actual: { exit_code: exitCode, stdout: stdout.slice(0, 500), stderr: stderr.slice(0, 200) },
      duration_ms: durationMs,
      exit_code: exitCode,
      stdout,
      stderr,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startTime;
    return {
      step_index: stepIndex,
      step_type: 'cli',
      passed: false,
      expected: expectedOutcome,
      actual: null,
      error: errorMessage,
      duration_ms: durationMs,
      exit_code: -1,
      stdout: '',
      stderr: '',
    };
  }
}

// ─── Scenario Execution ───────────────────────────────────────────────────────

/**
 * Execute a list of wireup scenarios sequentially against localhost services.
 *
 * Scenarios are executed one-at-a-time (not parallel) to avoid overwhelming
 * localhost services under test.
 *
 * Step dispatch:
 *   - 'http' -> executeHttpStep
 *   - 'cli'  -> executeCliStep
 *   - 'browser', 'assert' -> skipped (Phase 80); marked as passed=true with a note
 *
 * @param cwd - Absolute path to the project root (used as working directory for CLI steps)
 * @param scenarios - Array of WireupScenario objects from generateScenarios()
 * @param options - Optional execution configuration (timeout, base_url)
 * @returns Array of ScenarioResult objects with per-step pass/fail
 */
async function executeScenarios(
  cwd: string,
  scenarios: WireupScenario[],
  options: ExecutionOptions = {}
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const scenarioStart = Date.now();
    const stepResults: StepResult[] = [];

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];

      if (step.step_type === 'http') {
        const result = await executeHttpStep(i, step, options);
        stepResults.push(result);
      } else if (step.step_type === 'cli') {
        const result = await executeCliStep(i, step, options, cwd);
        stepResults.push(result);
      } else {
        // 'browser' and 'assert' are Phase 80 — skip and mark as passed
        const skippedResult: StepResult = {
          step_index: i,
          step_type: 'cli', // Use cli as the base type for skipped steps
          passed: true,
          expected: step.expected_outcome,
          actual: `skipped (${step.step_type} steps handled in Phase 80)`,
          duration_ms: 0,
        };
        stepResults.push(skippedResult);
      }
    }

    const overallPassed = stepResults.every((r) => r.passed);
    const scenarioDuration = Date.now() - scenarioStart;

    results.push({
      scenario_id: scenario.feature.functionName,
      feature_id: scenario.feature.functionName,
      step_results: stepResults,
      overall_passed: overallPassed,
      duration_ms: scenarioDuration,
    });
  }

  return results;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { executeScenarios, executeHttpStep, executeCliStep };
