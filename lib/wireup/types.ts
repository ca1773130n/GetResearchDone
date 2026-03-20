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
