'use strict';

/**
 * GRD Wireup -- CLI command functions
 *
 * Provides:
 *   - cmdInitWireup: pre-flight context builder for /grd:wireup slash command
 *   - cmdWireupDiscover: discover unwired features via filesystem analysis
 *   - cmdWireupRun: run full wireup iteration (discover, scenarios, execute, report)
 *   - cmdWireupState: read current wireup iteration state
 *   - cmdWireupScenarios: list generated wireup scenarios
 *   - cmdWireupReport: get the latest WIREUP-REPORT.md content
 *
 * Follows the cmdInitEvolve / cmdEvolveDiscover / cmdEvolveState patterns
 * from lib/evolve/cli.ts.
 *
 * @dependencies ./types, ./state, ./discovery, ./scenarios, ./orchestrator, ./report,
 *               ../utils, ../backend, ../paths
 */

import type { WireupState, UnwiredFeature, WireupScenario, WireupOptions } from './types';
import type { BackendCapabilities, GrdConfig, MilestoneInfo } from '../types';

const fs = require('fs');

const {
  SONNET_MODEL,
  readWireupState,
  wireupStatePath,
}: {
  SONNET_MODEL: string;
  readWireupState: (cwd: string) => WireupState | null;
  wireupStatePath: (cwd: string) => string;
} = require('./state');

const {
  discoverUnwiredFeatures,
}: {
  discoverUnwiredFeatures: (cwd: string) => UnwiredFeature[];
} = require('./discovery');

const {
  generateScenarios,
}: {
  generateScenarios: (features: UnwiredFeature[], cwd: string) => WireupScenario[];
} = require('./scenarios');

const {
  runWireup,
}: {
  runWireup: (cwd: string, options?: WireupOptions) => Promise<import('./types').WireupResult>;
} = require('./orchestrator');

const {
  formatReportPath,
}: {
  formatReportPath: (cwd: string) => string;
} = require('./report');

const {
  loadConfig,
  resolveModelForAgent,
  getMilestoneInfo,
  output,
}: {
  loadConfig: (cwd: string) => GrdConfig;
  resolveModelForAgent: (config: GrdConfig, agent: string, cwd: string) => string;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
} = require('../utils');

const {
  detectBackend,
  getBackendCapabilities,
}: {
  detectBackend: (cwd: string) => string;
  getBackendCapabilities: (backend: string) => BackendCapabilities;
} = require('../backend');

const {
  planningDir: getPlanningDir,
}: {
  planningDir: (cwd: string) => string;
} = require('../paths');

// ─── Context Builder ──────────────────────────────────────────────────────────

/**
 * Pre-flight context builder for the /grd:wireup slash command.
 *
 * Returns a JSON bundle containing backend, capabilities, models, wireup state,
 * milestone info, and wireup_dir — mirroring the cmdInitEvolve pattern.
 */
function cmdInitWireup(cwd: string, raw: boolean): void {
  const config: GrdConfig = loadConfig(cwd);
  const backend: string = detectBackend(cwd);
  const capabilities: BackendCapabilities = getBackendCapabilities(backend);
  const wireupState: WireupState | null = readWireupState(cwd);
  const executorModel: string = resolveModelForAgent(config, 'grd-executor', cwd);
  const milestone: MilestoneInfo = getMilestoneInfo(cwd);
  const wireupDir: string = getPlanningDir(cwd);

  const result = {
    backend,
    capabilities,
    sonnet_model: SONNET_MODEL,
    models: {
      executor: executorModel,
    },
    config: {
      model_profile: config.model_profile || 'balanced',
      autonomous_mode: config.autonomous_mode || false,
    },
    wireup_state: wireupState
      ? {
          exists: true,
          features_discovered: wireupState.features_discovered,
          scenarios_generated: wireupState.scenarios_generated,
          scenarios_passed: wireupState.scenarios_passed,
          scenarios_failed: wireupState.scenarios_failed,
          fixes_applied: wireupState.fixes_applied,
          iteration_count: wireupState.iteration_history.length,
          milestone: wireupState.milestone,
          timestamp: wireupState.timestamp,
        }
      : { exists: false },
    milestone,
    wireup_dir: wireupDir,
  };

  output(result, raw, raw ? JSON.stringify(result) : undefined);
  // Unreachable — output() calls process.exit()
}

// ─── Sub-Command Wrappers ─────────────────────────────────────────────────────

/**
 * Discover unwired features in the project via filesystem analysis.
 * Outputs a list of features grouped by category (exported-but-uncalled,
 * config-without-surface, endpoint-without-integration-test).
 */
function cmdWireupDiscover(cwd: string, _args: string[], raw: boolean): unknown {
  const features: UnwiredFeature[] = discoverUnwiredFeatures(cwd);

  const out = {
    features_found: features.length,
    by_category: {
      'exported-but-uncalled': features.filter((f) => f.category === 'exported-but-uncalled')
        .length,
      'config-without-surface': features.filter((f) => f.category === 'config-without-surface')
        .length,
      'endpoint-without-integration-test': features.filter(
        (f) => f.category === 'endpoint-without-integration-test'
      ).length,
    },
    features: features.map((f) => ({
      category: f.category,
      function_name: f.functionName,
      file_path: f.filePath,
      suggested_action: f.suggestedAction,
    })),
  };

  output(out, raw, raw ? `${features.length} unwired features discovered` : undefined);
  // Unreachable — output() calls process.exit()
  return undefined as never;
}

/**
 * Run a full wireup iteration: discover, generate scenarios, execute, detect issues, report.
 *
 * Supported flags: --target <feature>, --dry-run, --timeout <ms>, --max-turns <n>
 */
async function cmdWireupRun(cwd: string, args: string[], raw: boolean): Promise<unknown> {
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
    }
  }

  const result = await runWireup(cwd, parsedOptions);
  output(result, raw, raw ? result.pass_fail_summary : undefined);
  // Unreachable — output() calls process.exit()
  return undefined as never;
}

/**
 * Read the current wireup iteration state (features discovered, scenarios, fixes applied).
 */
function cmdWireupState(cwd: string, _args: string[], raw: boolean): void {
  const state: WireupState | null = readWireupState(cwd);

  if (state === null) {
    const out = { exists: false, state: null };
    output(out, raw, raw ? 'No wireup state found' : undefined);
  } else {
    const out = { exists: true, state };
    output(out, raw, raw ? JSON.stringify(state) : undefined);
  }
  // Unreachable — output() calls process.exit()
}

/**
 * List generated wireup scenarios for discovered features.
 *
 * Re-runs discovery and scenario generation against the current codebase to
 * show what scenarios would be (or were) generated for the current state.
 */
function cmdWireupScenarios(cwd: string, _args: string[], raw: boolean): void {
  const features: UnwiredFeature[] = discoverUnwiredFeatures(cwd);
  const scenarios: WireupScenario[] = generateScenarios(features, cwd);

  const out = {
    scenarios_count: scenarios.length,
    features_count: features.length,
    scenarios: scenarios.map((s) => ({
      feature_function: s.feature.functionName,
      feature_file: s.feature.filePath,
      category: s.feature.category,
      steps_count: s.steps.length,
      test_data_fixture: s.test_data_fixture,
    })),
  };

  output(out, raw, raw ? `${scenarios.length} scenarios for ${features.length} features` : undefined);
  // Unreachable — output() calls process.exit()
}

/**
 * Get the latest wireup report with pass/fail results and issue summary.
 *
 * Reads WIREUP-REPORT.md from the current milestone wireup directory.
 */
function cmdWireupReport(cwd: string, _args: string[], raw: boolean): void {
  const reportPath: string = formatReportPath(cwd);

  let reportContent: string | null = null;
  try {
    reportContent = fs.readFileSync(reportPath, 'utf8') as string;
  } catch {
    // Report doesn't exist yet
  }

  if (reportContent === null) {
    const out = { exists: false, report_path: reportPath, content: null };
    output(out, raw, raw ? 'No wireup report found' : undefined);
  } else {
    const out = { exists: true, report_path: reportPath, content: reportContent };
    output(out, raw, raw ? reportContent : undefined);
  }
  // Unreachable — output() calls process.exit()
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  cmdInitWireup,
  cmdWireupDiscover,
  cmdWireupRun,
  cmdWireupState,
  cmdWireupScenarios,
  cmdWireupReport,
};
