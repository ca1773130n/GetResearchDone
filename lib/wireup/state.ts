'use strict';

/**
 * GRD Wireup -- State I/O and iteration management
 *
 * Constants, state persistence (read/write), creation, and
 * iteration advancement for the wireup subsystem.
 * Parallels lib/evolve/state.ts for consistency.
 *
 * @dependencies ./types, ../utils (safeReadFile)
 */

import type { WireupState, WireupIterationHistory } from './types';

const fs = require('fs');
const path = require('path');
const {
  safeReadFile,
}: {
  safeReadFile: (filePath: string) => string | null;
} = require('../utils');

// ─── Constants ──────────────────────────────────────────────────────────────

const WIREUP_STATE_FILENAME: string = 'WIREUP-STATE.json';

// ─── State Path ─────────────────────────────────────────────────────────────

/**
 * Return the absolute path to the wireup state file.
 *
 * WIREUP-STATE.json is project-scoped (.planning/), living alongside
 * EVOLVE-STATE.json in the project's .planning directory.
 */
function wireupStatePath(cwd: string): string {
  return path.join(cwd, '.planning', WIREUP_STATE_FILENAME);
}

// ─── State Creation ─────────────────────────────────────────────────────────

/**
 * Create a fresh initial WireupState for a given milestone.
 * All counters start at zero, iteration history is empty.
 */
function createInitialWireupState(milestone: string): WireupState {
  return {
    features_discovered: 0,
    scenarios_generated: 0,
    scenarios_passed: 0,
    scenarios_failed: 0,
    fixes_applied: 0,
    iteration_history: [],
    timestamp: new Date().toISOString(),
    milestone,
  };
}

// ─── State I/O ──────────────────────────────────────────────────────────────

/**
 * Read and parse the wireup state JSON from disk.
 * Returns null if the file does not exist, is unreadable, or contains invalid JSON.
 */
function readWireupState(cwd: string): WireupState | null {
  const filePath: string = wireupStatePath(cwd);
  const raw: string | null = safeReadFile(filePath);
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as WireupState;
  } catch {
    return null;
  }
}

/**
 * Write the wireup state JSON to disk with 2-space indentation and trailing newline.
 * Creates parent directory if needed.
 */
function writeWireupState(cwd: string, state: WireupState): void {
  const filePath: string = wireupStatePath(cwd);
  const dir: string = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n');
}

// ─── Iteration Advancement ──────────────────────────────────────────────────

/**
 * Return a new WireupState advanced by one iteration.
 * Increments cumulative counters, appends a history entry.
 * Does NOT mutate the input state — returns a new object.
 */
function advanceWireupIteration(
  state: WireupState,
  results: {
    scenarios_run: number;
    passed: number;
    failed: number;
    fixes_applied: number;
  }
): WireupState {
  const historyEntry: WireupIterationHistory = {
    iteration: state.iteration_history.length + 1,
    timestamp: new Date().toISOString(),
    scenarios_run: results.scenarios_run,
    passed: results.passed,
    failed: results.failed,
    fixes_applied: results.fixes_applied,
  };

  return {
    ...state,
    scenarios_passed: state.scenarios_passed + results.passed,
    scenarios_failed: state.scenarios_failed + results.failed,
    fixes_applied: state.fixes_applied + results.fixes_applied,
    iteration_history: [...state.iteration_history, historyEntry],
    timestamp: new Date().toISOString(),
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  WIREUP_STATE_FILENAME,
  wireupStatePath,
  createInitialWireupState,
  readWireupState,
  writeWireupState,
  advanceWireupIteration,
};
