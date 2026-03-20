'use strict';

/**
 * GRD Wireup -- Missing Connection Detection Engine
 *
 * Analyses failed ScenarioResult[] and classifies each failure into a
 * structured MissingConnection report using pure filesystem heuristics.
 *
 * Design constraints:
 *   - NO LLM subprocess calls (no spawnClaude, no claude -p)
 *   - All classification is done via regex/grep against the local filesystem
 *   - Each heuristic is independent and returns MissingConnection | null
 *   - Results are deduplicated and sorted high-confidence first
 *
 * @dependencies ./types, child_process (built-in), fs (built-in), path (built-in)
 */

import type {
  ScenarioResult,
  StepResult,
  HttpStepResult,
  CliStepResult,
  WireupScenario,
  MissingConnection,
  IssueType,
  Confidence,
} from './types';

const { spawnSync } = require('child_process') as {
  spawnSync: (
    file: string,
    args: string[],
    options: { encoding: 'utf-8'; cwd?: string; timeout?: number }
  ) => { stdout: string; stderr: string; status: number | null; error?: Error };
};

const path = require('path') as typeof import('path');

// Suppress unused import warning — IssueType is used as a type guard below
void (undefined as unknown as IssueType);

// ─── Helper: grep wrapper ──────────────────────────────────────────────────────

/**
 * Search for a regex pattern across files in `cwd`, optionally filtered by globs.
 *
 * Uses spawnSync with grep — no shell so no injection risk.
 * Returns matching file paths (unique).
 */
function grepForPattern(cwd: string, pattern: string, globs?: string[]): string[] {
  const includeArgs: string[] =
    globs !== undefined && globs.length > 0
      ? globs.map((g) => `--include=${g}`)
      : ['--include=*.ts', '--include=*.js'];

  const args = ['-rl', ...includeArgs, pattern, '.'];

  const result = spawnSync('grep', args, {
    encoding: 'utf-8',
    cwd,
    timeout: 10_000,
  });

  if (result.error !== undefined || result.status === null) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// ─── Helper: find route/controller files ──────────────────────────────────────

/**
 * Heuristic scan for files that likely contain route registrations.
 *
 * Searches for files whose name matches route/router/controller/handler conventions.
 */
function findRouteFiles(cwd: string): string[] {
  const result = spawnSync(
    'find',
    [
      '.',
      '-type', 'f',
      '(',
      '-name', '*route*',
      '-o', '-name', '*router*',
      '-o', '-name', '*controller*',
      '-o', '-name', '*handler*',
      ')',
    ],
    { encoding: 'utf-8', cwd, timeout: 5_000 }
  );

  if (result.error !== undefined) {
    return [];
  }

  return result.stdout
    .split('\n')
    .map((l) => l.trim().replace(/^\.\//, ''))
    .filter((l) => l.length > 0 && (l.endsWith('.ts') || l.endsWith('.js')));
}

// ─── Helper: parse module name from error string ───────────────────────────────

/**
 * Extract a module name from a "Cannot find module" or similar error message.
 *
 * Returns null if no module name can be parsed.
 */
function parseModuleFromError(stderr: string): string | null {
  // Node.js: Cannot find module 'some-module'
  const nodeMatch = /Cannot find module ['"]([^'"]+)['"]/i.exec(stderr);
  if (nodeMatch !== null) return nodeMatch[1];

  // Python: ModuleNotFoundError: No module named 'some_module'
  const pyMatch = /No module named ['"]([^'"]+)['"]/i.exec(stderr);
  if (pyMatch !== null) return pyMatch[1];

  // ImportError: cannot import name 'X' from 'Y'
  const importMatch = /ImportError[^']*'([^']+)'/i.exec(stderr);
  if (importMatch !== null) return importMatch[1];

  return null;
}

// ─── Helper: type guards ───────────────────────────────────────────────────────

function isHttpStepResult(r: StepResult): r is HttpStepResult {
  return r.step_type === 'http';
}

function isCliStepResult(r: StepResult): r is CliStepResult {
  return r.step_type === 'cli';
}

// ─── Heuristic: missing-route ──────────────────────────────────────────────────

/**
 * Detect a missing route registration when an HTTP step returns 404.
 *
 * Confidence HIGH when no route matching the URL path is found in the codebase.
 */
function detectMissingRoute(
  cwd: string,
  step: StepResult,
  scenario: Pick<WireupScenario, 'feature'>
): MissingConnection | null {
  if (!isHttpStepResult(step)) return null;
  if (step.status_code !== 404) return null;

  // Extract URL path from actual result context
  let urlPath = '/unknown';
  if (step.actual !== null && typeof step.actual === 'object') {
    const act = step.actual as Record<string, unknown>;
    if (typeof act['url'] === 'string') urlPath = act['url'];
  }

  // Check whether a route registration pattern exists for this path
  const routePattern = urlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const routeMatches = grepForPattern(cwd, routePattern, ['*.ts', '*.js']);
  const confidence: Confidence = routeMatches.length === 0 ? 'high' : 'medium';

  const routeFiles = findRouteFiles(cwd);
  const targetFile = routeFiles.length > 0 ? routeFiles[0] : 'routes.ts';

  return {
    issue_type: 'missing-route',
    source_file: scenario.feature.filePath,
    target_file: targetFile,
    suggested_fix: `Register route for ${urlPath} in ${targetFile}`,
    confidence,
    scenario_id: '',
    step_index: step.step_index,
    error_context: `HTTP 404 for ${urlPath}`,
  };
}

// ─── Heuristic: unconnected-handler ───────────────────────────────────────────

/**
 * Detect a handler that exists but is not connected (2xx with empty/unexpected body).
 *
 * Confidence MEDIUM — empty body is a weak signal.
 */
function detectUnconnectedHandler(
  cwd: string,
  step: StepResult,
  scenario: Pick<WireupScenario, 'feature'>
): MissingConnection | null {
  if (!isHttpStepResult(step)) return null;
  if (step.status_code < 200 || step.status_code >= 300) return null;
  if (step.passed) return null;

  const bodyEmpty =
    step.body.trim().length === 0 ||
    step.body.trim() === '{}' ||
    step.body.trim() === '[]';
  if (!bodyEmpty) return null;

  const routeFiles = findRouteFiles(cwd);
  const targetFile = routeFiles.length > 0 ? routeFiles[0] : 'handlers.ts';

  return {
    issue_type: 'unconnected-handler',
    source_file: scenario.feature.filePath,
    target_file: targetFile,
    suggested_fix: `Connect handler logic in ${targetFile} — response body is empty`,
    confidence: 'medium',
    scenario_id: '',
    step_index: step.step_index,
    error_context: `HTTP ${step.status_code} returned empty body`,
  };
}

// ─── Heuristic: missing-import ─────────────────────────────────────────────────

/**
 * Detect a missing import when a CLI step fails with a module-not-found error.
 *
 * Confidence HIGH when module name can be parsed from stderr.
 */
function detectMissingImport(
  cwd: string,
  step: StepResult,
  scenario: Pick<WireupScenario, 'feature'>
): MissingConnection | null {
  if (!isCliStepResult(step)) return null;
  if (step.passed) return null;

  const combined = `${step.stderr} ${step.error ?? ''}`;
  const isModuleError =
    /Cannot find module/i.test(combined) ||
    /ModuleNotFoundError/i.test(combined) ||
    /ImportError/i.test(combined);

  if (!isModuleError) return null;

  const moduleName = parseModuleFromError(combined) ?? 'unknown-module';
  const sourceFile = scenario.feature.filePath;
  const targetFile = moduleName.startsWith('.')
    ? path.join(path.dirname(sourceFile), moduleName)
    : moduleName;

  void cwd;

  return {
    issue_type: 'missing-import',
    source_file: sourceFile,
    target_file: targetFile,
    suggested_fix: `Add import for '${moduleName}' in ${sourceFile} or create ${targetFile}`,
    confidence: 'high',
    scenario_id: '',
    step_index: step.step_index,
    error_context: combined.slice(0, 200),
  };
}

// ─── Heuristic: missing-middleware ────────────────────────────────────────────

/**
 * Detect missing auth middleware when an HTTP step returns 401 or 403.
 *
 * Confidence MEDIUM — status code is suggestive but the route may be intentionally protected.
 */
function detectMissingMiddleware(
  cwd: string,
  step: StepResult,
  scenario: Pick<WireupScenario, 'feature'>
): MissingConnection | null {
  if (!isHttpStepResult(step)) return null;
  if (step.status_code !== 401 && step.status_code !== 403) return null;

  const authMatches = grepForPattern(cwd, 'auth|middleware|passport|jwt|bearer', ['*.ts', '*.js']);
  const targetFile = authMatches.length > 0 ? authMatches[0] : 'middleware/auth.ts';

  return {
    issue_type: 'missing-middleware',
    source_file: scenario.feature.filePath,
    target_file: targetFile,
    suggested_fix: `Register authentication middleware for the route — HTTP ${step.status_code} returned`,
    confidence: 'medium',
    scenario_id: '',
    step_index: step.step_index,
    error_context: `HTTP ${step.status_code} Unauthorized/Forbidden`,
  };
}

// ─── Heuristic: broken-nav-link ───────────────────────────────────────────────

/**
 * Detect a broken navigation link when a 404 occurs on a path that looks like
 * a page route (not an API endpoint).
 *
 * Confidence LOW — heuristic uses path naming convention only.
 */
function detectBrokenNavLink(
  cwd: string,
  step: StepResult,
  scenario: Pick<WireupScenario, 'feature'>
): MissingConnection | null {
  if (!isHttpStepResult(step)) return null;
  if (step.status_code !== 404) return null;

  let urlPath = '/unknown';
  if (step.actual !== null && typeof step.actual === 'object') {
    const act = step.actual as Record<string, unknown>;
    if (typeof act['url'] === 'string') urlPath = act['url'];
  }

  const isPageRoute =
    !urlPath.startsWith('/api/') &&
    !urlPath.includes('.') &&
    !/\.(json|xml|csv|txt|png|jpg|svg|ico)$/.test(urlPath);

  if (!isPageRoute) return null;

  const navPattern = urlPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const navFiles = grepForPattern(cwd, navPattern, [
    '*.tsx', '*.jsx', '*.html', '*.vue', '*.svelte', '*.ts', '*.js',
  ]);

  const sourceFile = navFiles.length > 0 ? navFiles[0] : scenario.feature.filePath;

  return {
    issue_type: 'broken-nav-link',
    source_file: sourceFile,
    target_file: scenario.feature.filePath,
    suggested_fix: `Add page route for ${urlPath} or fix navigation link in ${sourceFile}`,
    confidence: 'low',
    scenario_id: '',
    step_index: step.step_index,
    error_context: `HTTP 404 for page-like path ${urlPath}`,
  };
}

// ─── Heuristic: missing-env-var ───────────────────────────────────────────────

/**
 * Detect a missing environment variable when the error contains ECONNREFUSED
 * or references to undefined env-var-like identifiers.
 *
 * Confidence HIGH when a specific ENV var pattern can be extracted.
 */
function detectMissingEnvVar(
  cwd: string,
  step: StepResult,
  scenario: Pick<WireupScenario, 'feature'>
): MissingConnection | null {
  const errorText = [
    step.error ?? '',
    isCliStepResult(step) ? step.stderr : '',
    isHttpStepResult(step) ? step.body.slice(0, 300) : '',
  ].join(' ');

  const hasEnvSignal =
    /ECONNREFUSED/i.test(errorText) ||
    /process\.env\.[A-Z_]+.*undefined/i.test(errorText) ||
    /environment variable.*not set/i.test(errorText) ||
    /missing.*required.*env/i.test(errorText);

  if (!hasEnvSignal) return null;

  const envVarMatch =
    /process\.env\.([A-Z_][A-Z0-9_]*)/i.exec(errorText) ??
    /\b([A-Z][A-Z0-9_]{2,})\s*(?:is undefined|not set|missing)/i.exec(errorText);

  const varName = envVarMatch !== null ? envVarMatch[1] : 'REQUIRED_ENV_VAR';

  const envFiles = grepForPattern(cwd, varName, ['.env', '.env.*', '*.ts', '*.js']);
  const targetFile = envFiles.length > 0 ? envFiles[0] : '.env';

  return {
    issue_type: 'missing-env-var',
    source_file: scenario.feature.filePath,
    target_file: targetFile,
    suggested_fix: `Set environment variable ${varName} or add to .env`,
    confidence: envVarMatch !== null ? 'high' : 'medium',
    scenario_id: '',
    step_index: step.step_index,
    error_context: errorText.slice(0, 200),
  };
}

// ─── Classifier dispatcher ─────────────────────────────────────────────────────

/**
 * Run each heuristic in priority order for a single failed step.
 * Returns the first match, or null if no heuristic matches.
 *
 * Priority order (highest confidence heuristics first):
 *   1. missing-env-var   — connection-level failure; ECONNREFUSED
 *   2. missing-import    — module-level failure; Cannot find module
 *   3. missing-route     — 404 + no route registration found
 *   4. missing-middleware — 401/403 Unauthorized/Forbidden
 *   5. unconnected-handler — 2xx + empty body (step still failed)
 *   6. broken-nav-link   — 404 on page-like path (weak signal)
 */
export function classifyFailure(
  cwd: string,
  step: StepResult,
  scenario: Pick<WireupScenario, 'feature'>
): MissingConnection | null {
  return (
    detectMissingEnvVar(cwd, step, scenario) ??
    detectMissingImport(cwd, step, scenario) ??
    detectMissingRoute(cwd, step, scenario) ??
    detectMissingMiddleware(cwd, step, scenario) ??
    detectUnconnectedHandler(cwd, step, scenario) ??
    detectBrokenNavLink(cwd, step, scenario) ??
    null
  );
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Deduplicate MissingConnection[] by (issue_type, source_file, target_file).
 * When duplicates exist the first occurrence (highest confidence, per sort) is kept.
 */
function deduplicateConnections(connections: MissingConnection[]): MissingConnection[] {
  const seen = new Set<string>();
  const result: MissingConnection[] = [];

  for (const conn of connections) {
    const key = `${conn.issue_type}:${conn.source_file}:${conn.target_file}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(conn);
    }
  }

  return result;
}

// ─── Confidence sort order ────────────────────────────────────────────────────

const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyse failed ScenarioResult[] and return a deduplicated, confidence-sorted
 * array of MissingConnection reports.
 *
 * Only scenarios with overall_passed === false are analysed.
 * Each failed step is passed to classifyFailure().
 * Results with null classification are discarded.
 * Final list is deduplicated by (issue_type, source_file, target_file) and
 * sorted high-confidence first.
 *
 * No LLM subprocess calls are made. All classification is filesystem-based.
 *
 * @param cwd           - Absolute path to the project root
 * @param failedResults - ScenarioResult[] to analyse (may include passing ones; they are skipped)
 * @returns             Deduplicated MissingConnection[] sorted by confidence
 */
export function detectMissingConnections(
  cwd: string,
  failedResults: ScenarioResult[]
): MissingConnection[] {
  const rawConnections: MissingConnection[] = [];

  for (const scenarioResult of failedResults) {
    if (scenarioResult.overall_passed) continue;

    // Build a minimal feature stub for the classifyFailure API
    const scenarioStub: Pick<WireupScenario, 'feature'> = {
      feature: {
        category: 'exported-but-uncalled',
        filePath: scenarioResult.feature_id,
        functionName: scenarioResult.scenario_id,
        suggestedAction: '',
      },
    };

    for (const step of scenarioResult.step_results) {
      if (step.passed) continue;

      const connection = classifyFailure(cwd, step, scenarioStub);
      if (connection === null) continue;

      rawConnections.push({
        ...connection,
        scenario_id: scenarioResult.scenario_id,
      });
    }
  }

  const deduplicated = deduplicateConnections(rawConnections);
  deduplicated.sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]);

  return deduplicated;
}

// ─── CommonJS Exports ─────────────────────────────────────────────────────────

module.exports = {
  detectMissingConnections,
  classifyFailure,
};
