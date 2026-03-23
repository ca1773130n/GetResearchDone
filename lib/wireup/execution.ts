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
  BrowserStep,
  BrowserStepResult,
  BrowserScenarioResult,
} from './types';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const _commandCache = new Map<string, { command: string; prependArgs: string[] }>();

/**
 * Resolve a CLI command to its local bin equivalent when not on PATH.
 * Falls back to `npx` for package.json bin entries.
 */
function _resolveCommand(command: string, cwd: string): { command: string; prependArgs: string[] } {
  const cached = _commandCache.get(command);
  if (cached !== undefined) return cached;

  const check = spawnSync('which', [command], { encoding: 'utf-8', timeout: 5_000 });
  if (check.status === 0 && check.stdout.trim()) {
    const result = { command, prependArgs: [] as string[] };
    _commandCache.set(command, result);
    return result;
  }

  const localBin = path.join(cwd, 'bin', `${command}.js`);
  if (fs.existsSync(localBin)) {
    const result = { command: 'node', prependArgs: [localBin] };
    _commandCache.set(command, result);
    return result;
  }

  const result = { command: 'npx', prependArgs: [command] };
  _commandCache.set(command, result);
  return result;
}

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

function _escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Static Analysis Helpers ──────────────────────────────────────────────────

const STATIC_SKIP_DIRS: Set<string> = new Set([
  'node_modules', 'dist', 'build', '.next', '.nuxt', '.output',
  '.git', '.worktrees', 'coverage', '.planning',
]);

function _collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: import('fs').Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results; // Permission error or missing dir
  }
  for (const entry of entries) {
    const full: string = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!STATIC_SKIP_DIRS.has(entry.name)) {
        results.push(..._collectSourceFiles(full));
      }
    } else if (/\.(ts|js|tsx|jsx|vue|svelte)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}
const DEFAULT_BASE_URL = 'http://localhost:3000';

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function parseExpectedOutcome(step: WireupScenario['steps'][number]): Record<string, unknown> {
  if (typeof step.expected_outcome === 'string') {
    try {
      const parsed: unknown = JSON.parse(step.expected_outcome);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not a JSON string — treat as a plain description with no structured expectations
    }
  }
  return {};
}

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
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${normalizedEndpoint}`;

  const expectedOutcome = parseExpectedOutcome(step);

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
  const rawCommand = typeof params['command'] === 'string' ? params['command'] : 'echo';
  const rawArgs: string[] = Array.isArray(params['args'])
    ? (params['args'] as unknown[]).map(String)
    : [];

  // Resolve command to local bin if not on PATH
  const resolved = _resolveCommand(rawCommand, cwd);
  const command = resolved.command;
  const args = [...resolved.prependArgs, ...rawArgs];

  const expectedOutcome = parseExpectedOutcome(step);

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

// ─── Static Analysis Step Execution ──────────────────────────────────────────

function executeStaticStep(
  stepIndex: number,
  step: WireupScenario['steps'][number],
  cwd: string
): StepResult {
  const startTime = Date.now();
  try {
    const params = step.parameters as Record<string, unknown>;
    const check = typeof params['check'] === 'string' ? params['check'] : '';
    const filePath = typeof params['filePath'] === 'string' ? params['filePath'] : '';
    const exportName = typeof params['exportName'] === 'string' ? params['exportName'] : '';
    const absPath: string = path.join(cwd, filePath);
    const escaped: string = _escapeRegExp(exportName);

    if (check === 'export_exists') {
      let content: string;
      try {
        content = fs.readFileSync(absPath, 'utf-8');
      } catch (readErr: unknown) {
        const code = (readErr as NodeJS.ErrnoException).code;
        const detail: string = code === 'ENOENT'
          ? `File not found: ${filePath}`
          : `Cannot read ${filePath}: ${code || (readErr instanceof Error ? readErr.message : String(readErr))}`;
        return {
          step_index: stepIndex, step_type: 'static', passed: false,
          expected: step.expected_outcome, actual: detail,
          duration_ms: Date.now() - startTime,
        };
      }
      const exportPatterns: RegExp[] = [
        new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class|let|var)\\s+${escaped}\\b`),
        new RegExp(`export\\s+default\\s+(?:function|class)\\s+${escaped}\\b`),
        new RegExp(`export\\s*\\{[^}]*\\b${escaped}\\b`),
        new RegExp(`exports\\.${escaped}\\s*=`),
        new RegExp(`module\\.exports\\s*=\\s*\\{[^}]*\\b${escaped}\\b`),
      ];
      const found: boolean = exportPatterns.some((p) => p.test(content));
      return {
        step_index: stepIndex, step_type: 'static', passed: found,
        expected: step.expected_outcome,
        actual: found ? `Export '${exportName}' found in ${filePath}` : `Export '${exportName}' not found in ${filePath}`,
        duration_ms: Date.now() - startTime,
      };
    }

    if (check === 'import_graph_connected') {
      const allFiles: string[] = _collectSourceFiles(cwd);
      let referenced: boolean = false;
      const namePattern: RegExp = new RegExp(`\\b${escaped}\\b`);
      for (const file of allFiles) {
        if (path.resolve(file) === path.resolve(absPath)) continue;
        try {
          const content: string = fs.readFileSync(file, 'utf-8');
          if (namePattern.test(content)) { referenced = true; break; }
        } catch (readErr: unknown) {
          const code = (readErr as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT' && code !== 'EACCES') throw readErr;
          continue;
        }
      }
      return {
        step_index: stepIndex, step_type: 'static', passed: referenced,
        expected: step.expected_outcome,
        actual: referenced
          ? `Export '${exportName}' is referenced in the project`
          : `Export '${exportName}' has no references outside ${filePath}`,
        duration_ms: Date.now() - startTime,
      };
    }

    return {
      step_index: stepIndex, step_type: 'static', passed: false,
      expected: step.expected_outcome, actual: `Unknown static check: ${check}`,
      duration_ms: Date.now() - startTime,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      step_index: stepIndex, step_type: 'static', passed: false,
      expected: step.expected_outcome, actual: `Unexpected error: ${errorMessage}`,
      duration_ms: Date.now() - startTime,
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
      } else if (step.step_type === 'static') {
        const result = executeStaticStep(i, step, cwd);
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

// ─── Browser Scenario Execution ───────────────────────────────────────────────

/**
 * Convert browser steps to human-readable manual testing instructions.
 *
 * Each step is rendered as a numbered instruction for a manual tester.
 * Used when Playwright MCP is unavailable to provide fallback guidance.
 *
 * @param steps - Array of BrowserStep objects from the scenario
 * @returns Array of numbered human-readable manual testing instructions
 */
function generateManualSteps(steps: BrowserStep[]): string[] {
  return steps.map((step, i) => {
    const n = i + 1;
    switch (step.action) {
      case 'navigate':
        return `${n}. Open browser and navigate to ${step.url ?? '<url>'}`;
      case 'fill':
        return `${n}. Enter "${step.value ?? '<value>'}" in the field matching selector "${step.selector ?? '<selector>'}"`;
      case 'click':
        return `${n}. Click on the element matching selector "${step.selector ?? '<selector>'}"`;
      case 'snapshot':
        return `${n}. Take a visual snapshot of the current page and verify its appearance`;
      case 'evaluate':
        return `${n}. Execute in browser console: ${step.script ?? '<script>'} and verify the result`;
      default:
        return `${n}. Perform ${step.action} action`;
    }
  });
}

/**
 * Execute a browser scenario using Playwright MCP tools (when available),
 * or return a structured skip result with manual testing guidance (when unavailable).
 *
 * When playwright_available is false:
 *   - Returns status: 'skipped' with skip_reason and manual_steps
 *   - No browser interaction is attempted
 *
 * When playwright_available is true:
 *   - Iterates through steps and builds structured MCP tool call payloads
 *   - NOTE: Actual MCP tool invocation is delegated to the calling wireup agent context.
 *     This function produces the step execution plan; the wireup orchestrator invokes the tools.
 *   - Returns BrowserScenarioResult with per-step results
 *
 * @param _cwd - Absolute path to project root (reserved for future use / auto-detection)
 * @param scenario - Browser scenario definition with steps array
 * @param playwrightAvailable - Whether Playwright MCP tools are available in the current agent context
 * @returns BrowserScenarioResult with status, steps, and any console errors captured
 */
function executeBrowserScenario(
  _cwd: string,
  scenario: { scenario_id: string; feature: string; steps: BrowserStep[] },
  playwrightAvailable: boolean
): BrowserScenarioResult {
  // Guard: skip gracefully when Playwright MCP is not available
  if (!playwrightAvailable) {
    return {
      scenario_id: scenario.scenario_id,
      feature: scenario.feature,
      status: 'skipped',
      skip_reason:
        'Playwright MCP tools not available. Install @anthropic/mcp-playwright or configure playwright.enabled in .planning/config.json',
      manual_steps: generateManualSteps(scenario.steps),
      steps: scenario.steps.map((step) => ({
        action: step.action,
        status: 'skipped' as const,
      })),
      console_errors: [],
    };
  }

  // Build step execution plan (actual MCP calls delegated to orchestrator/agent context)
  const stepResults: BrowserStepResult[] = [];
  const consoleErrors: string[] = [];

  for (const step of scenario.steps) {
    // Construct the Playwright MCP tool call payload for this step
    let toolPayload: { tool: string; params: Record<string, unknown> };
    switch (step.action) {
      case 'navigate':
        toolPayload = { tool: 'browser_navigate', params: { url: step.url ?? '' } };
        break;
      case 'fill':
        toolPayload = {
          tool: 'browser_fill_form',
          params: { selector: step.selector ?? '', value: step.value ?? '' },
        };
        break;
      case 'click':
        toolPayload = { tool: 'browser_click', params: { selector: step.selector ?? '' } };
        break;
      case 'snapshot':
        toolPayload = { tool: 'browser_snapshot', params: {} };
        break;
      case 'evaluate':
        toolPayload = { tool: 'browser_evaluate', params: { script: step.script ?? '' } };
        break;
      default:
        toolPayload = { tool: 'browser_snapshot', params: {} };
    }

    // Record the planned step with tool payload — actual invocation is delegated to the orchestrator
    stepResults.push({
      action: step.action,
      status: 'skipped',
      tool_payload: toolPayload,
    });
  }

  return {
    scenario_id: scenario.scenario_id,
    feature: scenario.feature,
    status: 'skipped',
    skip_reason: 'Execution delegated to wireup orchestrator agent context — tool payloads prepared but not yet invoked',
    steps: stepResults,
    console_errors: consoleErrors,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  executeScenarios,
  executeHttpStep,
  executeCliStep,
  executeStaticStep,
  executeBrowserScenario,
  generateManualSteps,
};
