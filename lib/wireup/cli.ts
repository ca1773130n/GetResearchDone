'use strict';

/**
 * GRD Wireup -- CLI context builder
 *
 * Provides cmdInitWireup: the pre-flight context builder for the /grd:wireup
 * slash command. Follows the cmdInitEvolve pattern from lib/evolve/cli.ts.
 *
 * @dependencies ./types, ./state, ../utils, ../backend, ../paths
 */

import type { WireupState } from './types';
import type { BackendCapabilities, GrdConfig, MilestoneInfo } from '../types';

const {
  SONNET_MODEL,
  readWireupState,
}: {
  SONNET_MODEL: string;
  readWireupState: (cwd: string) => WireupState | null;
} = require('./state');

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

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  cmdInitWireup,
};
