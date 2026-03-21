'use strict';

/**
 * GRD Wireup -- Orchestrator
 *
 * Main wireup pipeline: discover -> generate scenarios -> execute HTTP/CLI scenarios ->
 * detect missing connections -> report pass/fail summary.
 *
 * All spawnClaudeAsync calls use SONNET_MODEL — sonnet-tier ceiling enforced.
 *
 * @dependencies ./types, ./state, ./discovery, ./scenarios, ./execution, ../utils
 */

import type {
  WireupOptions,
  WireupResult,
  WireupScenario,
  ScenarioResult,
  WireupState,
  FailedScenarioSummary,
  StepResult,
  MissingConnection,
  IssuesByConfidence,
  IssuesByType,
} from './types';
const {
  SONNET_MODEL,
  readWireupState,
  writeWireupState,
  createInitialWireupState,
  advanceWireupIteration,
}: {
  SONNET_MODEL: string;
  readWireupState: (cwd: string) => WireupState | null;
  writeWireupState: (cwd: string, state: WireupState) => void;
  createInitialWireupState: (milestone: string) => WireupState;
  advanceWireupIteration: (
    state: WireupState,
    results: { scenarios_run: number; passed: number; failed: number; fixes_applied: number }
  ) => WireupState;
} = require('./state');

const {
  discoverUnwiredFeatures,
}: {
  discoverUnwiredFeatures: (cwd: string) => import('./types').UnwiredFeature[];
} = require('./discovery');

const {
  generateScenarios,
  generateTestData,
}: {
  generateScenarios: (features: import('./types').UnwiredFeature[], cwd: string) => WireupScenario[];
  generateTestData: (scenarios: WireupScenario[], cwd: string) => void;
} = require('./scenarios');

const {
  detectMissingConnections,
}: {
  detectMissingConnections: (cwd: string, failedResults: ScenarioResult[]) => MissingConnection[];
} = require('./detection');

// ─── Execution Stub (implemented in plan 79-02) ──────────────────────────────

/**
 * Resolve executeScenarios at runtime to allow graceful fallback when
 * lib/wireup/execution.ts has not yet been implemented (plan 79-02).
 * All spawnClaudeAsync calls within the execution module MUST use SONNET_MODEL.
 */
function _resolveExecuteScenarios(): (
  cwd: string,
  scenarios: WireupScenario[],
  options?: import('./types').ExecutionOptions
) => Promise<ScenarioResult[]> {
  try {
    const execModule = require('./execution') as {
      executeScenarios: (
        cwd: string,
        scenarios: WireupScenario[],
        options?: import('./types').ExecutionOptions
      ) => Promise<ScenarioResult[]>;
    };
    return execModule.executeScenarios;
  } catch {
    // execution.ts not yet implemented (plan 79-02) — return stub
    return (_cwd: string, _scenarios: WireupScenario[]) => Promise.resolve([]);
  }
}

const {
  output,
  getMilestoneInfo,
}: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  getMilestoneInfo: (cwd: string) => import('../types').MilestoneInfo;
} = require('../utils');

// ─── Pass/Fail Summary ────────────────────────────────────────────────────────

/**
 * Build a human-readable pass/fail summary string from execution results.
 * Includes issue detection summary when issues were found.
 */
function _buildPassFailSummary(
  total: number,
  passed: number,
  failed: number,
  failedScenarios: FailedScenarioSummary[],
  issuesFound?: number,
  issuesByConfidence?: IssuesByConfidence
): string {
  if (total === 0) {
    return 'No scenarios executed.';
  }

  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  let summary = `${passed}/${total} scenarios passed (${pct}%)`;

  if (failed > 0) {
    summary += `\nFailed scenarios:`;
    for (const fs of failedScenarios) {
      summary += `\n  - ${fs.scenario_id} (${fs.failed_steps.length} step(s) failed)`;
    }
  }

  if (issuesFound !== undefined && issuesFound > 0 && issuesByConfidence !== undefined) {
    summary += `\n\nMissing connections detected: ${issuesFound}`;
    summary += `\n  High confidence: ${issuesByConfidence.high}`;
    summary += `\n  Medium confidence: ${issuesByConfidence.medium}`;
    summary += `\n  Low confidence: ${issuesByConfidence.low}`;
  }

  return summary;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run the wireup pipeline end-to-end:
 *   1. Read current wireup state (or create fresh)
 *   2. Discover unwired features in the project
 *   3. Filter to target if --target provided
 *   4. Generate test scenarios and fixture files
 *   5. Execute HTTP/CLI scenarios (skipped if --dry-run)
 *   6. Detect missing connections from failures (Phase 79-03)
 *   7. Update wireup state with iteration results
 *   8. Return WireupResult with full summary
 *
 * All spawnClaude calls use SONNET_MODEL from ./state.
 */
async function runWireup(cwd: string, options: WireupOptions = {}): Promise<WireupResult> {
  // Step 1: Read or create wireup state
  const milestoneInfo = getMilestoneInfo(cwd);
  const milestone = milestoneInfo.version ?? 'unknown';

  let wireupState = readWireupState(cwd);
  if (!wireupState) {
    wireupState = createInitialWireupState(milestone);
  }

  // Step 2: Discover unwired features
  const allFeatures = discoverUnwiredFeatures(cwd);

  // Step 3: Filter to target if specified
  const features =
    options.target !== undefined
      ? allFeatures.filter(
          (f) =>
            f.functionName.includes(options.target as string) ||
            f.filePath.includes(options.target as string)
        )
      : allFeatures;

  // Step 4: Generate test scenarios and fixture data
  const scenarios: WireupScenario[] = generateScenarios(features, cwd);
  generateTestData(scenarios, cwd);

  // Step 5: Early return for dry-run
  if (options.dryRun) {
    return {
      features_discovered: features.length,
      scenarios_generated: scenarios.length,
      scenarios_run: 0,
      scenarios_passed: 0,
      scenarios_failed: 0,
      issues_found: 0,
      issues: [],
      issues_by_confidence: { high: 0, medium: 0, low: 0 },
      issues_by_type: {
        'missing-route': 0,
        'unconnected-handler': 0,
        'missing-import': 0,
        'missing-middleware': 0,
        'broken-nav-link': 0,
        'missing-env-var': 0,
        'missing-export': 0,
      },
      pass_fail_summary: `Dry run: ${features.length} features discovered, ${scenarios.length} scenarios generated. Execution skipped.`,
      failed_scenarios: [],
    };
  }

  // Step 6: Execute HTTP/CLI scenarios (plan 79-02)
  // Execution options carry SONNET_MODEL so the executor enforces the model ceiling.
  const executeScenarios = _resolveExecuteScenarios();
  const executionResults: ScenarioResult[] = await executeScenarios(cwd, scenarios, {
    timeout_ms: options.timeout,
    base_url: options.baseUrl,
    model: SONNET_MODEL,
  });

  // Compute pass/fail summary
  const totalScenarios = executionResults.length;
  const passedCount = executionResults.filter((r) => r.overall_passed).length;
  const failedCount = executionResults.filter((r) => !r.overall_passed).length;

  const failedScenarios: FailedScenarioSummary[] = executionResults
    .filter((r) => !r.overall_passed)
    .map((r) => ({
      scenario_id: r.scenario_id,
      failed_steps: r.step_results.filter((s: StepResult) => !s.passed),
    }));

  // Step 7: Detect missing connections from failed scenario results
  const failedResults = executionResults.filter((r) => !r.overall_passed);
  const missingConnections: MissingConnection[] = failedResults.length > 0
    ? detectMissingConnections(cwd, failedResults)
    : [];

  const issuesFound = missingConnections.length;

  // Group issues by confidence and by type for summary output
  const issuesByConfidence: IssuesByConfidence = { high: 0, medium: 0, low: 0 };
  const issuesByType: IssuesByType = {
    'missing-route': 0,
    'unconnected-handler': 0,
    'missing-import': 0,
    'missing-middleware': 0,
    'broken-nav-link': 0,
    'missing-env-var': 0,
    'missing-export': 0,
  };

  for (const issue of missingConnections) {
    issuesByConfidence[issue.confidence] += 1;
    issuesByType[issue.issue_type] += 1;
  }

  // Step 8: Update wireup state
  const updatedState = advanceWireupIteration(wireupState, {
    scenarios_run: totalScenarios,
    passed: passedCount,
    failed: failedCount,
    fixes_applied: 0,
  });

  // Update cumulative features_discovered, scenarios_generated, and issues counts
  const finalState: WireupState = {
    ...updatedState,
    features_discovered: wireupState.features_discovered + features.length,
    scenarios_generated: wireupState.scenarios_generated + scenarios.length,
  };

  writeWireupState(cwd, finalState);

  // Step 9: Build summary and return WireupResult
  const passFail = _buildPassFailSummary(
    totalScenarios,
    passedCount,
    failedCount,
    failedScenarios,
    issuesFound,
    issuesByConfidence
  );

  return {
    features_discovered: features.length,
    scenarios_generated: scenarios.length,
    scenarios_run: totalScenarios,
    scenarios_passed: passedCount,
    scenarios_failed: failedCount,
    issues_found: issuesFound,
    issues: missingConnections,
    issues_by_confidence: issuesByConfidence,
    issues_by_type: issuesByType,
    pass_fail_summary: passFail,
    failed_scenarios: failedScenarios,
  };
}

// ─── CLI Command ──────────────────────────────────────────────────────────────

/**
 * CLI command entry point for `grd-tools.js wireup run`.
 *
 * Parses CLI args and delegates to runWireup().
 * Supported flags: --target <feature>, --dry-run, --timeout <ms>, --max-turns <n>
 */
async function cmdWireup(cwd: string, args: string[], raw: boolean): Promise<void> {
  const parsedOptions: WireupOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target' && args[i + 1]) {
      parsedOptions.target = args[++i];
    } else if (arg === '--dry-run') {
      parsedOptions.dryRun = true;
    } else if (arg === '--timeout' && args[i + 1]) {
      const t = parseInt(args[++i], 10);
      if (!isNaN(t)) parsedOptions.timeout = t;
    } else if (arg === '--max-turns' && args[i + 1]) {
      const mt = parseInt(args[++i], 10);
      if (!isNaN(mt)) parsedOptions.maxTurns = mt;
    } else if (arg === '--base-url' && args[i + 1]) {
      parsedOptions.baseUrl = args[++i];
    }
  }

  const result = await runWireup(cwd, parsedOptions);

  // Print human-readable summary to stdout
  if (!raw) {
    process.stdout.write('\n');
    process.stdout.write(`Wireup complete\n`);
    process.stdout.write(`  Features discovered: ${result.features_discovered}\n`);
    process.stdout.write(`  Scenarios generated: ${result.scenarios_generated}\n`);
    process.stdout.write(`  Scenarios run:       ${result.scenarios_run}\n`);
    process.stdout.write(`  Passed:              ${result.scenarios_passed}\n`);
    process.stdout.write(`  Failed:              ${result.scenarios_failed}\n`);
    process.stdout.write(`  Issues found:        ${result.issues_found}`);
    if (result.issues_found > 0) {
      process.stdout.write(
        ` (high: ${result.issues_by_confidence.high}, medium: ${result.issues_by_confidence.medium}, low: ${result.issues_by_confidence.low})`
      );
    }
    process.stdout.write('\n');
    process.stdout.write(`\n${result.pass_fail_summary}\n`);
  }

  output(result, raw);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  runWireup,
  cmdWireup,
  _buildPassFailSummary,
};
