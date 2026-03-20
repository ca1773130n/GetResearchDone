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
  | 'endpoint-without-integration-test';

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
export type ScenarioStepType = 'http' | 'cli' | 'browser' | 'assert';

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
  step_type: 'http' | 'cli';
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
  /** Human-readable pass/fail summary. */
  pass_fail_summary: string;
  /** Details of failed scenarios with their step failures. */
  failed_scenarios: FailedScenarioSummary[];
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
}
