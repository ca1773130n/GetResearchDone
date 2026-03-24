'use strict';

/**
 * GRD Wireup -- Domain type definitions
 *
 * All interfaces and type aliases for the wireup subsystem.
 * Pure type definitions with no runtime code or imports.
 *
 * @dependencies None (pure types)
 */

// ─── Category Types ──────────────────────────────────────────────────────────

/**
 * The category of an unwired feature — describes what kind of integration gap exists.
 */
export type UnwiredFeatureCategory =
  | 'exported-but-uncalled'
  | 'config-without-surface'
  | 'endpoint-without-integration-test'
  | 'app-route-without-test'
  | 'app-exported-but-uncalled'
  | 'app-model-without-handler'
  | 'app-component-without-import'
  | 'lib-exported-without-test'
  | 'bin-entry-without-test'
  | 'command-without-registration'
  | 'agent-without-command'
  | 'command-without-agent-file';

// ─── Feature Interfaces ──────────────────────────────────────────────────────

/**
 * A single feature that exists in the codebase but lacks full integration.
 */
export interface UnwiredFeature {
  /** Category describing the type of integration gap. */
  category: UnwiredFeatureCategory;
  /** Relative path to the file containing the feature. */
  filePath: string;
  /** Exported function name, config key name, or endpoint name. */
  functionName: string;
  /** Human-readable description of what wiring is needed. */
  suggestedAction: string;
}

// ─── Scenario Types ──────────────────────────────────────────────────────────

/**
 * The type of step in a wireup scenario.
 */
export type ScenarioStepType = 'http' | 'cli' | 'browser' | 'assert' | 'static';

/**
 * A single step in a wireup scenario.
 */
export interface ScenarioStep {
  /** The type of step to execute. */
  step_type: ScenarioStepType;
  /** Step-specific parameters (URL, command, selector, assertion, etc.). */
  parameters: Record<string, unknown>;
  /** Human-readable description of the expected outcome. */
  expected_outcome: string;
}

/**
 * A complete scenario for wiring and testing an unwired feature.
 */
export interface WireupScenario {
  /** The feature being wired and tested. */
  feature: UnwiredFeature;
  /** Ordered list of steps to execute in the scenario. */
  steps: ScenarioStep[];
  /** Path to the generated test data fixture file. */
  test_data_fixture: string;
}

// ─── Execution Result Types ───────────────────────────────────────────────────

/**
 * Result of a single step execution.
 */
export interface StepResult {
  /** Index of this step within its scenario (0-based). */
  step_index: number;
  /** Step type that was executed. */
  step_type: 'http' | 'cli' | 'static';
  /** Whether this step passed all expected outcome comparisons. */
  passed: boolean;
  /** The expected outcome value(s) used for comparison. */
  expected: unknown;
  /** The actual outcome value(s) captured during execution. */
  actual: unknown;
  /** Error message if execution failed (network error, spawn error, etc.). */
  error?: string;
  /** Execution duration in milliseconds. */
  duration_ms: number;
}

/**
 * Result of an HTTP step execution.
 */
export interface HttpStepResult extends StepResult {
  step_type: 'http';
  /** HTTP response status code. */
  status_code: number;
  /** HTTP response headers as a plain object. */
  headers: Record<string, string>;
  /** HTTP response body as a string. */
  body: string;
}

/**
 * Result of a CLI step execution.
 */
export interface CliStepResult extends StepResult {
  step_type: 'cli';
  /** Process exit code (0 = success). */
  exit_code: number;
  /** Standard output captured from the process. */
  stdout: string;
  /** Standard error captured from the process. */
  stderr: string;
}

/**
 * Result of a complete scenario execution.
 */
export interface ScenarioResult {
  /** Unique identifier for the scenario (derived from feature function name). */
  scenario_id: string;
  /** Feature ID this scenario tests. */
  feature_id: string;
  /** Per-step execution results. */
  step_results: StepResult[];
  /** True only if ALL steps passed. */
  overall_passed: boolean;
  /** Total execution duration in milliseconds. */
  duration_ms: number;
}

/**
 * Options for scenario execution.
 */
export interface ExecutionOptions {
  /** Per-step timeout in milliseconds (default 30000). */
  timeout_ms?: number;
  /** Base URL for HTTP steps (e.g. "http://localhost:3000"). */
  base_url?: string;
  /**
   * Model to use for any subagent spawns within the executor.
   * MUST be set to SONNET_MODEL — no opus-class models permitted.
   */
  model?: string;
}

// ─── Orchestrator Types ───────────────────────────────────────────────────────

/**
 * Options passed to the wireup orchestrator runWireup().
 */
export interface WireupOptions {
  /** Focus wireup on a specific feature area (substring match on function name). */
  target?: string;
  /** If true, discover and generate scenarios but do not execute them. */
  dryRun?: boolean;
  /** Per-step execution timeout in milliseconds (default 30000). */
  timeout?: number;
  /** Base URL for HTTP scenario steps. */
  baseUrl?: string;
  /** Maximum number of Claude subagent turns (for future use). */
  maxTurns?: number;
}

/**
 * Failed scenario summary for pass/fail reporting.
 */
export interface FailedScenarioSummary {
  /** Scenario ID of the failed scenario. */
  scenario_id: string;
  /** Steps within the scenario that failed. */
  failed_steps: StepResult[];
}

/**
 * Issues grouped by confidence level for summary reporting.
 */
export interface IssuesByConfidence {
  high: number;
  medium: number;
  low: number;
}

/**
 * Issues grouped by issue_type for summary reporting.
 */
export interface IssuesByType {
  'missing-route': number;
  'unconnected-handler': number;
  'missing-import': number;
  'missing-middleware': number;
  'broken-nav-link': number;
  'missing-env-var': number;
  'missing-export': number;
}

/**
 * Result returned by runWireup().
 */
export interface WireupResult {
  /** Number of unwired features discovered. */
  features_discovered: number;
  /** Number of scenarios generated. */
  scenarios_generated: number;
  /** Number of scenarios actually run (0 if dryRun). */
  scenarios_run: number;
  /** Number of scenarios that passed all steps. */
  scenarios_passed: number;
  /** Number of scenarios that failed at least one step. */
  scenarios_failed: number;
  /** Number of missing connections detected from failed scenarios. */
  issues_found: number;
  /** Full list of detected missing connections (empty array when issues_found === 0). */
  issues: MissingConnection[];
  /** Issues grouped by confidence level. */
  issues_by_confidence: IssuesByConfidence;
  /** Issues grouped by issue type. */
  issues_by_type: IssuesByType;
  /** Human-readable pass/fail summary. */
  pass_fail_summary: string;
  /** Details of failed scenarios with their step failures. */
  failed_scenarios: FailedScenarioSummary[];
  /** Absolute path to the generated WIREUP-REPORT.md (undefined in dry-run mode). */
  report_path?: string;
  /** Number of fix attempts made during this run. */
  fixes_attempted: number;
  /** Number of fixes that were verified by re-running the scenario. */
  fixes_verified: number;
}

// ─── Detection Types ──────────────────────────────────────────────────────────

/**
 * The category of a missing connection discovered during failure analysis.
 *
 * Each value maps to a specific root-cause heuristic in detection.ts.
 */
export type IssueType =
  | 'missing-route'
  | 'unconnected-handler'
  | 'missing-import'
  | 'missing-middleware'
  | 'broken-nav-link'
  | 'missing-env-var'
  | 'missing-export';

/**
 * Confidence level for a detected missing connection.
 *
 * high   — pattern match is unambiguous (e.g., 404 + no route registration found)
 * medium — pattern is suggestive but not conclusive (e.g., 200 + empty body)
 * low    — weak signal; manual review recommended
 */
export type Confidence = 'high' | 'medium' | 'low';

/**
 * A structured report of a missing integration connection discovered by
 * analysing failed scenario results.
 *
 * Produced by detectMissingConnections() in lib/wireup/detection.ts.
 * Consumed by the auto-fix layer in Phase 80.
 */
export interface MissingConnection {
  /** Category of the integration gap. */
  issue_type: IssueType;
  /** Relative path to the file that is the source of the gap. */
  source_file: string;
  /** Relative path to the file that should be created or modified to fix the gap. */
  target_file: string;
  /** Human-readable description of the recommended fix. */
  suggested_fix: string;
  /** How confident the heuristic is in this classification. */
  confidence: Confidence;
  /** Scenario ID that produced the failure leading to this issue. */
  scenario_id: string;
  /** Zero-based index of the failed step within the scenario. */
  step_index: number;
  /** Snippet of the raw error / status context used to classify the failure. */
  error_context: string;
}

// ─── Auto-Fix Types ───────────────────────────────────────────────────────────

/**
 * Result of a single auto-fix attempt on a MissingConnection.
 */
export interface FixAttempt {
  /** The issue that was (or was not) fixed. */
  issue: MissingConnection;
  /**
   * Outcome of the fix attempt:
   * - 'verified': fix was applied and the re-run scenario passed
   * - 'failed': fix was applied but the re-run scenario still failed
   * - 'skipped': issue confidence was not 'high' — no fix attempted
   */
  fix_status: 'verified' | 'failed' | 'skipped';
  /** Human-readable description of what the fix did (set when fix was attempted). */
  fix_description?: string;
  /** Whether the re-run scenario passed (set when fix was attempted). */
  rerun_passed?: boolean;
  /** Error message if the fix application itself threw an exception. */
  error?: string;
  /** Structured prompt for the sonnet-tier fix agent (set for high-confidence issues). */
  fix_prompt?: string;
}

/**
 * Aggregated result of partitioning and attempting fixes on a set of issues.
 */
export interface AutoFixResult {
  /** Fix attempts for high-confidence issues (populated after fix attempts). */
  fixes_applied: FixAttempt[];
  /** Medium and low confidence issues that require manual review. */
  requires_manual_review: MissingConnection[];
  /** Model constant used for all fix agents. */
  model_used: string;
}

// ─── Browser Scenario Types ───────────────────────────────────────────────────

/**
 * A single step in a browser scenario.
 *
 * Each step maps to a Playwright MCP tool call when playwright_available is true,
 * or is converted to a human-readable manual instruction when unavailable.
 */
export interface BrowserStep {
  /** The browser action to perform. */
  action: 'navigate' | 'fill' | 'click' | 'snapshot' | 'evaluate';
  /** CSS selector for fill/click actions. */
  selector?: string;
  /** Value to fill for fill actions. */
  value?: string;
  /** URL for navigate actions. */
  url?: string;
  /** JavaScript expression for evaluate actions. */
  script?: string;
  /** Expected outcome fields for assertion (e.g. title, text content). */
  expected?: Record<string, unknown>;
}

/**
 * Result of a single browser step execution.
 */
export interface BrowserStepResult {
  /** The action that was attempted. */
  action: string;
  /** Whether this step passed (or was skipped). */
  status: 'passed' | 'failed' | 'skipped';
  /** Error message if the step failed. */
  error?: string;
  /** Captured DOM snapshot (when available via snapshot action). */
  dom_snapshot?: string;
  /** Playwright MCP tool call payload for the orchestrator to invoke. */
  tool_payload?: { tool: string; params: Record<string, unknown> };
}

/**
 * Result of a complete browser scenario execution.
 */
export interface BrowserScenarioResult {
  /** Unique identifier for the scenario. */
  scenario_id: string;
  /** Feature this scenario tests. */
  feature: string;
  /** Overall status: passed, failed, or skipped (when playwright unavailable). */
  status: 'passed' | 'failed' | 'skipped';
  /** Reason the scenario was skipped (when playwright_available is false). */
  skip_reason?: string;
  /** Human-readable manual testing instructions (when playwright_available is false). */
  manual_steps?: string[];
  /** Per-step execution results. */
  steps: BrowserStepResult[];
  /** Console errors captured during execution. */
  console_errors: string[];
}

// ─── History & State Interfaces ──────────────────────────────────────────────

/**
 * A single iteration's history record for the wireup loop.
 */
export interface WireupIterationHistory {
  /** Iteration number (1-based). */
  iteration: number;
  /** ISO timestamp when this iteration ran. */
  timestamp: string;
  /** Number of scenarios run in this iteration. */
  scenarios_run: number;
  /** Number of scenarios that passed. */
  passed: number;
  /** Number of scenarios that failed. */
  failed: number;
  /** Number of auto-fixes applied by the executor. */
  fixes_applied: number;
  /** Number of distinct features tested in this iteration. */
  features_tested?: number;
  /** Number of missing connections detected in this iteration. */
  issues_found?: number;
  /** Number of fixes that were applied and verified (scenario re-run passed). */
  fixes_verified?: number;
}

/**
 * Full wireup state persisted between runs.
 */
export interface WireupState {
  /** Total features discovered across all iterations. */
  features_discovered: number;
  /** Total scenarios generated across all iterations. */
  scenarios_generated: number;
  /** Total scenarios that passed across all iterations. */
  scenarios_passed: number;
  /** Total scenarios that failed across all iterations. */
  scenarios_failed: number;
  /** Total auto-fixes applied across all iterations. */
  fixes_applied: number;
  /** Per-iteration history records. */
  iteration_history: WireupIterationHistory[];
  /** ISO timestamp of the last wireup run. */
  timestamp: string;
  /** Milestone this wireup state belongs to. */
  milestone: string;
  /** Absolute path to the last written WIREUP-REPORT.md (set after each iteration). */
  last_report_path?: string;
}
