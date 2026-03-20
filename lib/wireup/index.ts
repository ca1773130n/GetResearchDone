'use strict';

/**
 * GRD Wireup -- Barrel re-export
 *
 * Re-exports all public symbols from the wireup sub-modules.
 * This file is the single entry point for consumers of lib/wireup/.
 *
 * @see lib/wireup/types.ts       -- Domain type definitions (pure types, no runtime)
 * @see lib/wireup/state.ts       -- State I/O, constants, iteration advancement
 * @see lib/wireup/discovery.ts   -- Feature discovery engine
 * @see lib/wireup/scenarios.ts   -- Scenario and test data generation
 * @see lib/wireup/orchestrator.ts -- Wireup pipeline orchestrator (runWireup, cmdWireup)
 * @see lib/wireup/cli.ts         -- Context builder (cmdInitWireup)
 * @see lib/wireup/execution.ts   -- HTTP and CLI scenario execution engine (plan 79-02)
 * @see lib/wireup/detection.ts   -- Missing connection detection engine (plan 79-03)
 */

// ─── State ───────────────────────────────────────────────────────────────────

const stateModule = require('./state');

// ─── Discovery ───────────────────────────────────────────────────────────────

const discoveryModule = require('./discovery');

// ─── Scenarios ───────────────────────────────────────────────────────────────

const scenariosModule = require('./scenarios');

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const orchestratorModule = require('./orchestrator');

// ─── CLI context builder ──────────────────────────────────────────────────────

const cliModule = require('./cli');

// ─── Execution ───────────────────────────────────────────────────────────────

const executionModule = require('./execution') as Record<string, unknown>;

// ─── Detection ───────────────────────────────────────────────────────────────

const detectionModule = require('./detection') as Record<string, unknown>;

// ─── Barrel Export ────────────────────────────────────────────────────────────

module.exports = {
  // ─── Constants (from state.ts) ──────────────────────────────────────────
  SONNET_MODEL: stateModule.SONNET_MODEL,
  WIREUP_STATE_FILENAME: stateModule.WIREUP_STATE_FILENAME,

  // ─── State path (from state.ts) ─────────────────────────────────────────
  wireupStatePath: stateModule.wireupStatePath,

  // ─── State creation (from state.ts) ─────────────────────────────────────
  createInitialWireupState: stateModule.createInitialWireupState,

  // ─── State I/O (from state.ts) ──────────────────────────────────────────
  readWireupState: stateModule.readWireupState,
  writeWireupState: stateModule.writeWireupState,

  // ─── Iteration advancement (from state.ts) ──────────────────────────────
  advanceWireupIteration: stateModule.advanceWireupIteration,

  // ─── Discovery engine (from discovery.ts) ───────────────────────────────
  discoverUnwiredFeatures: discoveryModule.discoverUnwiredFeatures,

  // ─── Scenario generation (from scenarios.ts) ─────────────────────────────
  generateScenarios: scenariosModule.generateScenarios,
  generateTestData: scenariosModule.generateTestData,

  // ─── Execution engine (from execution.ts) ────────────────────────────────
  executeScenarios: executionModule['executeScenarios'],
  executeHttpStep: executionModule['executeHttpStep'],
  executeCliStep: executionModule['executeCliStep'],

  // ─── Detection engine (from detection.ts) ────────────────────────────────
  detectMissingConnections: detectionModule['detectMissingConnections'],
  classifyFailure: detectionModule['classifyFailure'],

  // ─── Orchestrator (from orchestrator.ts) ─────────────────────────────────
  runWireup: orchestratorModule.runWireup,
  cmdWireup: orchestratorModule.cmdWireup,

  // ─── CLI context builder (from cli.ts) ──────────────────────────────────
  cmdInitWireup: cliModule.cmdInitWireup,
};
