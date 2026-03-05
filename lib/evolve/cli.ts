'use strict';

/**
 * GRD Evolve -- CLI command functions
 *
 * Entry points for CLI commands: evolve, evolve-discover, evolve-state,
 * evolve-advance, evolve-reset, and init-evolve.
 *
 * @dependencies ./types, ./state, ./discovery, ./orchestrator, ../utils, ../backend
 */

import type {
  EvolveState,
  EvolveGroupState,
  EvolveOptions,
  EvolveResult,
  GroupDiscoveryResult,
  InfiniteEvolveOptions,
  InfiniteEvolveResult,
} from './types';
import type { BackendCapabilities, GrdConfig, MilestoneInfo } from '../types';

const {
  DEFAULT_PICK_PCT,
  readEvolveState,
  writeEvolveState,
  advanceIteration,
  evolveStatePath,
}: {
  DEFAULT_PICK_PCT: number;
  readEvolveState: (cwd: string) => EvolveGroupState | EvolveState | null;
  writeEvolveState: (cwd: string, state: EvolveGroupState | EvolveState) => void;
  advanceIteration: (previousState: EvolveState) => EvolveState;
  evolveStatePath: (cwd: string) => string;
} = require('./state');
const { runGroupDiscovery }: {
  runGroupDiscovery: (
    cwd: string,
    previousState: EvolveGroupState | EvolveState | null,
    pickPct?: number
  ) => Promise<GroupDiscoveryResult>;
} = require('./discovery');
const { runEvolve, runInfiniteEvolve }: {
  runEvolve: (cwd: string, options?: EvolveOptions) => Promise<EvolveResult>;
  runInfiniteEvolve: (cwd: string, options?: InfiniteEvolveOptions) => Promise<InfiniteEvolveResult>;
} = require('./orchestrator');
const { output, error, loadConfig, resolveModelForAgent, getMilestoneInfo }: {
    output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
    error: (message: string) => never;
    loadConfig: (cwd: string) => GrdConfig;
    resolveModelForAgent: (config: GrdConfig, agent: string, cwd: string) => string;
    getMilestoneInfo: (cwd: string) => MilestoneInfo;
  } = require('../utils');
const { detectBackend, getBackendCapabilities }: {
  detectBackend: (cwd: string) => string;
  getBackendCapabilities: (backend: string) => BackendCapabilities;
} = require('../backend');
const fs = require('fs');

// ─── CLI Command Functions ─────────────────────────────────────────────────

/**
 * CLI entry point for the evolve command.
 */
async function cmdEvolve(cwd: string, args: string[], raw: boolean): Promise<void> {
  const flag = (name: string, fallback: string): string => {
    const i: number = args.indexOf(name);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const hasFlag = (name: string): boolean => args.indexOf(name) !== -1;

  // Check for infinite mode first
  if (hasFlag('--infinite')) {
    const infiniteOptions: InfiniteEvolveOptions = {
      maxCycles: hasFlag('--max-cycles') ? parseInt(flag('--max-cycles', '10'), 10) : undefined,
      timeBudget: hasFlag('--time-budget') ? parseInt(flag('--time-budget', '0'), 10) : undefined,
      pickPct: hasFlag('--pick-pct')
        ? parseInt(flag('--pick-pct', String(DEFAULT_PICK_PCT)), 10)
        : undefined,
      timeout: hasFlag('--timeout') ? parseInt(flag('--timeout', '0'), 10) : undefined,
      maxTurns: hasFlag('--max-turns') ? parseInt(flag('--max-turns', '0'), 10) : undefined,
      dryRun: hasFlag('--dry-run'),
      model: undefined, // no model flag for infinite (uses defaults)
      maxMilestones: hasFlag('--max-milestones') ? parseInt(flag('--max-milestones', '1'), 10) : undefined,
    };
    const infiniteResult: InfiniteEvolveResult = await runInfiniteEvolve(cwd, infiniteOptions);
    output(infiniteResult, raw, raw ? JSON.stringify(infiniteResult) : undefined);
    // Unreachable — output() calls process.exit()
    return undefined as never;
  }

  const options: EvolveOptions = {
    iterations: hasFlag('--iterations') ? parseInt(flag('--iterations', '1'), 10) : undefined,
    pickPct: hasFlag('--pick-pct')
      ? parseInt(flag('--pick-pct', String(DEFAULT_PICK_PCT)), 10)
      : undefined,
    timeout: hasFlag('--timeout') ? parseInt(flag('--timeout', '0'), 10) : undefined,
    maxTurns: hasFlag('--max-turns') ? parseInt(flag('--max-turns', '0'), 10) : undefined,
    dryRun: hasFlag('--dry-run'),
    useWorktree: hasFlag('--no-worktree') ? false : undefined,
  };
  const result: EvolveResult = await runEvolve(cwd, options);
  output(result, raw, raw ? JSON.stringify(result) : undefined);
  // Unreachable — output() calls process.exit()
  return undefined as never;
}

/**
 * CLI entry point: run discovery and output results.
 */
async function cmdEvolveDiscover(cwd: string, args: string[], raw: boolean): Promise<void> {
  // Parse --pick-pct flag
  let pickPct: number = DEFAULT_PICK_PCT;
  const pctIdx: number = args.indexOf('--pick-pct');
  if (pctIdx !== -1 && args[pctIdx + 1]) {
    const parsed: number = parseInt(args[pctIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) pickPct = parsed;
  }

  const previousState: EvolveGroupState | EvolveState | null = readEvolveState(cwd);
  const discovery: GroupDiscoveryResult = await runGroupDiscovery(cwd, previousState, pickPct);

  const out = {
    groups: discovery.groups.map((g) => ({
      id: g.id,
      priority: g.priority,
      item_count: g.items.length,
      effort: g.effort,
    })),
    total_items: discovery.all_items_count,
    total_groups: discovery.groups_count,
    selected_count: discovery.selected_groups.length,
    pick_pct: pickPct,
  };

  output(
    out,
    raw,
    raw ? `${discovery.groups_count} groups (${discovery.all_items_count} items)` : undefined
  );
  // Unreachable — output() calls process.exit()
  return undefined as never;
}

/**
 * CLI entry point: read and output the current evolve state.
 */
function cmdEvolveState(cwd: string, _args: string[], raw: boolean): void {
  const state: EvolveGroupState | EvolveState | null = readEvolveState(cwd);

  if (state === null) {
    const out = { exists: false, state: null };
    output(out, raw, raw ? 'No evolve state found' : undefined);
  } else {
    const out = { exists: true, state };
    output(out, raw, raw ? JSON.stringify(state) : undefined);
  }
  // Unreachable — output() calls process.exit()
}

/**
 * CLI entry point: advance to the next iteration.
 */
function cmdEvolveAdvance(cwd: string, _args: string[], raw: boolean): void {
  const previousState: EvolveGroupState | EvolveState | null = readEvolveState(cwd);

  if (previousState === null) {
    error('No evolve state found. Run discover first.');
    // Unreachable — error() calls process.exit()
    return undefined as never;
  }

  const newState: EvolveState = advanceIteration(previousState as EvolveState);
  writeEvolveState(cwd, newState);

  output(newState, raw, raw ? `iteration ${newState.iteration}` : undefined);
  // Unreachable — output() calls process.exit()
}

/**
 * CLI entry point: delete the evolve state file (start fresh).
 */
function cmdEvolveReset(cwd: string, _args: string[], raw: boolean): void {
  const filePath: string = evolveStatePath(cwd);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // File doesn't exist — that's fine
  }

  output({ reset: true }, raw, raw ? 'Evolve state reset' : undefined);
  // Unreachable — output() calls process.exit()
}

/**
 * CLI entry point: pre-flight context for the evolve workflow.
 */
function cmdInitEvolve(cwd: string, raw: boolean): void {
  const config: GrdConfig = loadConfig(cwd);
  const backend: string = detectBackend(cwd);
  const capabilities: BackendCapabilities = getBackendCapabilities(backend);
  const state: EvolveGroupState | EvolveState | null = readEvolveState(cwd);
  const plannerModel: string = resolveModelForAgent(config, 'grd-planner', cwd);
  const executorModel: string = resolveModelForAgent(config, 'grd-executor', cwd);
  const milestone: MilestoneInfo = getMilestoneInfo(cwd);

  // Extract group state fields (works for both EvolveGroupState and EvolveState)
  const groupState = state as EvolveGroupState | null;

  const result = {
    backend,
    capabilities,
    config: {
      model_profile: config.model_profile || 'balanced',
      autonomous_mode: config.autonomous_mode || false,
      pick_pct: (groupState && groupState.pick_pct) || DEFAULT_PICK_PCT,
    },
    evolve_state: {
      exists: state !== null,
      iteration: state ? state.iteration : 0,
      remaining_groups_count: groupState ? (groupState.remaining_groups || []).length : 0,
      completed_groups_count: groupState ? (groupState.completed_groups || []).length : 0,
      failed_groups_count: groupState ? (groupState.failed_groups || []).length : 0,
      groups_count: groupState ? groupState.groups_count || 0 : 0,
      all_items_count: groupState ? groupState.all_items_count || 0 : 0,
    },
    models: {
      planner: plannerModel,
      executor: executorModel,
    },
    milestone,
    infinite_mode_available: true,
  };

  output(result, raw, raw ? JSON.stringify(result) : undefined);
  // Unreachable — output() calls process.exit()
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  cmdEvolve,
  cmdEvolveDiscover,
  cmdEvolveState,
  cmdEvolveAdvance,
  cmdEvolveReset,
  cmdInitEvolve,
};
