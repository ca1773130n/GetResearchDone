'use strict';

/**
 * GRD Evolve -- Barrel re-export
 *
 * Re-exports all 39 public symbols from the evolve sub-modules.
 * This file is the single entry point for consumers of lib/evolve/.
 *
 * @see lib/evolve/types.ts     -- Domain types (re-exported via module.exports)
 * @see lib/evolve/state.ts     -- Constants, state I/O, work item factory
 * @see lib/evolve/discovery.ts -- Discovery engine + orchestrators
 * @see lib/evolve/scoring.ts   -- Scoring heuristic + group engine
 * @see lib/evolve/orchestrator.ts -- Evolve loop + todos
 * @see lib/evolve/_prompts.ts  -- Prompt templates
 * @see lib/evolve/cli.ts       -- CLI command functions
 */

// ─── State (constants + state I/O + work item factory) ──────────────────────

const stateModule = require('./state.ts');
const discoveryModule = require('./discovery.ts');
const scoringModule = require('./scoring.ts');
const orchestratorModule = require('./orchestrator.ts');
const promptsModule = require('./_prompts.ts');
const cliModule = require('./cli.ts');

module.exports = {
  // ─── Constants (from state.ts) ──────────────────────────────────────────
  EVOLVE_STATE_FILENAME: stateModule.EVOLVE_STATE_FILENAME,
  WORK_ITEM_DIMENSIONS: stateModule.WORK_ITEM_DIMENSIONS,
  DEFAULT_ITEMS_PER_ITERATION: stateModule.DEFAULT_ITEMS_PER_ITERATION,
  DEFAULT_PICK_PCT: stateModule.DEFAULT_PICK_PCT,
  THEME_PATTERNS: stateModule.THEME_PATTERNS,
  SONNET_MODEL: stateModule.SONNET_MODEL,

  // ─── Work item factory (from state.ts) ──────────────────────────────────
  createWorkItem: stateModule.createWorkItem,

  // ─── State path (from state.ts) ─────────────────────────────────────────
  evolveStatePath: stateModule.evolveStatePath,

  // ─── State I/O (from state.ts) ──────────────────────────────────────────
  readEvolveState: stateModule.readEvolveState,
  writeEvolveState: stateModule.writeEvolveState,

  // ─── State creation (from state.ts) ─────────────────────────────────────
  createInitialState: stateModule.createInitialState,

  // ─── Merge logic (from state.ts) ────────────────────────────────────────
  mergeWorkItems: stateModule.mergeWorkItems,

  // ─── Iteration advancement (from state.ts) ──────────────────────────────
  advanceIteration: stateModule.advanceIteration,

  // ─── Discovery engine (from discovery.ts) ───────────────────────────────
  discoverImproveFeatureItems: discoveryModule.discoverImproveFeatureItems,
  analyzeCodebaseForItems: discoveryModule.analyzeCodebaseForItems,
  buildCodebaseDigest: discoveryModule.buildCodebaseDigest,
  buildDiscoveryPrompt: discoveryModule.buildDiscoveryPrompt,
  discoverWithClaude: discoveryModule.discoverWithClaude,
  parseDiscoveryOutput: discoveryModule.parseDiscoveryOutput,

  // ─── Scoring heuristic (from scoring.ts) ────────────────────────────────
  scoreWorkItem: scoringModule.scoreWorkItem,

  // ─── Priority selection (from scoring.ts) ───────────────────────────────
  selectPriorityItems: scoringModule.selectPriorityItems,

  // ─── Group engine (from scoring.ts) ─────────────────────────────────────
  groupDiscoveredItems: scoringModule.groupDiscoveredItems,
  selectPriorityGroups: scoringModule.selectPriorityGroups,

  // ─── Discovery orchestrator (from discovery.ts) ─────────────────────────
  runDiscovery: discoveryModule.runDiscovery,
  runGroupDiscovery: discoveryModule.runGroupDiscovery,

  // ─── Prompt builders (from _prompts.ts) ─────────────────────────────────
  buildPlanPrompt: promptsModule.buildPlanPrompt,
  buildExecutePrompt: promptsModule.buildExecutePrompt,
  buildReviewPrompt: promptsModule.buildReviewPrompt,
  buildGroupExecutePrompt: promptsModule.buildGroupExecutePrompt,
  buildGroupReviewPrompt: promptsModule.buildGroupReviewPrompt,

  // ─── Orchestrator (from orchestrator.ts) ────────────────────────────────
  writeEvolutionNotes: orchestratorModule.writeEvolutionNotes,
  writeDiscoveriesToTodos: orchestratorModule.writeDiscoveriesToTodos,
  runEvolve: orchestratorModule.runEvolve,

  // ─── CLI commands (from cli.ts) ─────────────────────────────────────────
  cmdEvolve: cliModule.cmdEvolve,
  cmdEvolveDiscover: cliModule.cmdEvolveDiscover,
  cmdEvolveState: cliModule.cmdEvolveState,
  cmdEvolveAdvance: cliModule.cmdEvolveAdvance,
  cmdEvolveReset: cliModule.cmdEvolveReset,
  cmdInitEvolve: cliModule.cmdInitEvolve,
};
