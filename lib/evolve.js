'use strict';

/**
 * GRD Evolve State Layer — Data structures, disk I/O, merge, and iteration tracking
 *
 * Foundation data layer for the self-evolving loop (/grd:evolve). Provides
 * work item creation, iteration state persistence, merge/deduplication, and
 * iteration advancement logic.
 *
 * Created in Phase 55 (Evolve Core Engine).
 */

const fs = require('fs');
const path = require('path');
const { safeReadFile } = require('./utils');

// ─── Constants ──────────────────────────────────────────────────────────────

const EVOLVE_STATE_FILENAME = 'EVOLVE-STATE.json';

const WORK_ITEM_DIMENSIONS = [
  'productivity',
  'quality',
  'usability',
  'consistency',
  'stability',
  'new-features',
];

const DEFAULT_ITEMS_PER_ITERATION = 5;

// ─── Work Item Factory ──────────────────────────────────────────────────────

/**
 * Create a work item object with deterministic id and sensible defaults.
 *
 * Work item structure:
 * @typedef {Object} WorkItem
 * @property {string} id - Deterministic identifier: `${dimension}/${slug}`
 * @property {string} dimension - One of WORK_ITEM_DIMENSIONS
 * @property {string} slug - Kebab-case identifier
 * @property {string} title - Human-readable title
 * @property {string} description - What needs to change and why
 * @property {string} effort - 'small' | 'medium' | 'large'
 * @property {string} source - 'discovery' | 'bugfix' | 'carryover'
 * @property {string} status - 'pending' | 'selected' | 'completed' | 'failed'
 * @property {number} iteration_added - Iteration number when first discovered
 *
 * @param {string} dimension - One of WORK_ITEM_DIMENSIONS
 * @param {string} slug - Kebab-case identifier for the work item
 * @param {string} title - Human-readable title
 * @param {string} description - What needs to change and why
 * @param {Object} [opts={}] - Optional overrides
 * @param {string} [opts.effort='medium'] - Effort estimate
 * @param {string} [opts.source='discovery'] - Item source
 * @param {string} [opts.status='pending'] - Initial status
 * @param {number} [opts.iteration_added=1] - Iteration when discovered
 * @returns {WorkItem} The constructed work item
 * @throws {Error} If dimension is not in WORK_ITEM_DIMENSIONS
 */
function createWorkItem(dimension, slug, title, description, opts = {}) {
  if (!WORK_ITEM_DIMENSIONS.includes(dimension)) {
    throw new Error(
      `Invalid dimension "${dimension}". Must be one of: ${WORK_ITEM_DIMENSIONS.join(', ')}`
    );
  }

  return {
    id: `${dimension}/${slug}`,
    dimension,
    slug,
    title,
    description,
    effort: opts.effort || 'medium',
    source: opts.source || 'discovery',
    status: opts.status || 'pending',
    iteration_added: opts.iteration_added !== undefined ? opts.iteration_added : 1,
  };
}

// ─── State Path ─────────────────────────────────────────────────────────────

/**
 * Return the absolute path to the evolve state file.
 *
 * The evolve state lives at the project root level of .planning/ (not
 * milestone-scoped) because the evolve loop operates across milestones.
 *
 * @param {string} cwd - Project working directory
 * @returns {string} Absolute path to .planning/EVOLVE-STATE.json
 */
function evolveStatePath(cwd) {
  return path.join(cwd, '.planning', EVOLVE_STATE_FILENAME);
}

// ─── State I/O ──────────────────────────────────────────────────────────────

/**
 * Read and parse the evolve state JSON from disk.
 *
 * @param {string} cwd - Project working directory
 * @returns {Object|null} Parsed state object, or null if file doesn't exist or is malformed
 */
function readEvolveState(cwd) {
  const filePath = evolveStatePath(cwd);
  const raw = safeReadFile(filePath);
  if (raw === null) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write the evolve state JSON to disk with 2-space indentation.
 * Creates parent directory if needed.
 *
 * @param {string} cwd - Project working directory
 * @param {Object} state - State object to persist
 */
function writeEvolveState(cwd, state) {
  const filePath = evolveStatePath(cwd);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n');
}

// ─── State Creation ─────────────────────────────────────────────────────────

/**
 * Create a fresh iteration state object.
 *
 * Iteration state structure:
 * @typedef {Object} EvolveState
 * @property {number} iteration - 1-based iteration counter
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {string} milestone - Current milestone version
 * @property {number} items_per_iteration - Max items per iteration
 * @property {WorkItem[]} selected - Items picked for this iteration
 * @property {WorkItem[]} remaining - Items not yet attempted
 * @property {WorkItem[]} bugfix - Newly-discovered bugfix items
 * @property {WorkItem[]} completed - Items completed in this iteration
 * @property {WorkItem[]} failed - Items that failed in this iteration
 * @property {Array<{iteration: number, timestamp: string, selected_count: number, completed_count: number, failed_count: number}>} history
 *
 * @param {string} milestone - Current milestone version (e.g., 'v0.2.8')
 * @param {number} [itemsPerIteration] - Max items per iteration
 * @returns {EvolveState} Fresh state object with iteration=1 and empty arrays
 */
function createInitialState(milestone, itemsPerIteration) {
  return {
    iteration: 1,
    timestamp: new Date().toISOString(),
    milestone,
    items_per_iteration: itemsPerIteration !== undefined ? itemsPerIteration : DEFAULT_ITEMS_PER_ITERATION,
    selected: [],
    remaining: [],
    bugfix: [],
    completed: [],
    failed: [],
    history: [],
  };
}

// ─── Merge Logic ────────────────────────────────────────────────────────────

/**
 * Merge two arrays of work items, deduplicating by `id` field.
 *
 * Items from `discovered` that share an `id` with `existing` are dropped
 * (existing wins). This is the core deduplication logic for REQ-55.
 *
 * @param {WorkItem[]} existing - Current work items (take priority)
 * @param {WorkItem[]} discovered - Newly discovered items to merge in
 * @returns {WorkItem[]} Merged array with no duplicate ids
 */
function mergeWorkItems(existing, discovered) {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];

  for (const item of discovered) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }

  return merged;
}

// ─── Iteration Advancement ──────────────────────────────────────────────────

/**
 * Create a new state object for the next iteration.
 *
 * - Increments `iteration` counter
 * - Moves `remaining` items (status still 'pending') to new state's `remaining`
 * - Merges `bugfix` items into new state's `remaining`
 * - Appends a history entry summarizing the previous iteration
 * - Resets `selected`, `completed`, `failed` to empty arrays
 * - Sets new timestamp
 *
 * @param {EvolveState} previousState - The completed iteration's state
 * @returns {EvolveState} New state object for the next iteration
 */
function advanceIteration(previousState) {
  // Build history entry from previous iteration
  const historyEntry = {
    iteration: previousState.iteration,
    timestamp: previousState.timestamp,
    selected_count: previousState.selected.length,
    completed_count: previousState.completed.length,
    failed_count: previousState.failed.length,
  };

  // Carry over remaining items that are still pending
  const carryoverRemaining = previousState.remaining.filter(
    (item) => item.status === 'pending'
  );

  // Merge bugfix items into remaining (bugfix items have priority as new discoveries)
  const mergedRemaining = mergeWorkItems(carryoverRemaining, previousState.bugfix);

  return {
    iteration: previousState.iteration + 1,
    timestamp: new Date().toISOString(),
    milestone: previousState.milestone,
    items_per_iteration: previousState.items_per_iteration,
    selected: [],
    remaining: mergedRemaining,
    bugfix: [],
    completed: [],
    failed: [],
    history: [...previousState.history, historyEntry],
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  EVOLVE_STATE_FILENAME,
  WORK_ITEM_DIMENSIONS,
  DEFAULT_ITEMS_PER_ITERATION,
  // Work item factory
  createWorkItem,
  // State path
  evolveStatePath,
  // State I/O
  readEvolveState,
  writeEvolveState,
  // State creation
  createInitialState,
  // Merge logic
  mergeWorkItems,
  // Iteration advancement
  advanceIteration,
};
