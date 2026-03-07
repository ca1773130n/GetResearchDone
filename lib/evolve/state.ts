'use strict';

/**
 * GRD Evolve -- State I/O and work item management
 *
 * Constants, state persistence (read/write), creation, merge/dedup,
 * iteration advancement, and work item factory functions.
 *
 * @dependencies ./types, ../utils (safeReadFile, loadConfig, output, error)
 */

import type {
  WorkItem,
  WorkItemOptions,
  EvolveState,
  EvolveGroupState,
  HistoryEntry,
  ThemePattern,
} from './types';

const fs = require('fs');
const path = require('path');
const { safeReadFile }: {
  safeReadFile: (filePath: string) => string | null;
} = require('../utils');

// ─── Constants ──────────────────────────────────────────────────────────────

const EVOLVE_STATE_FILENAME: string = 'EVOLVE-STATE.json';

const SONNET_MODEL: string = 'sonnet';

const WORK_ITEM_DIMENSIONS: string[] = [
  'product-ideation',
  'improve-features',
  'new-features',
  'productivity',
  'quality',
  'usability',
  'consistency',
  'stability',
];

const DEFAULT_ITEMS_PER_ITERATION: number = 5;

const DEFAULT_PICK_PCT: number = 50;

const THEME_PATTERNS: ThemePattern[] = [
  // Product ideation patterns
  { pattern: /^new-cmd-/, theme: 'new-commands' },
  { pattern: /^new-workflow-/, theme: 'new-workflows' },
  { pattern: /^new-integration-/, theme: 'new-integrations' },
  { pattern: /^ux-improve-/, theme: 'ux-improvements' },
  { pattern: /^dx-enhance-/, theme: 'dx-enhancements' },
  { pattern: /^new-analysis-/, theme: 'new-analysis' },
  { pattern: /^new-automation-/, theme: 'new-automation' },
  { pattern: /^product-/, theme: 'product-features' },
  // Existing code-quality patterns (unchanged)
  { pattern: /^split-/, theme: 'long-function-refactors' },
  { pattern: /^improve-coverage-/, theme: 'test-coverage' },
  { pattern: /^add-jsdoc-/, theme: 'jsdoc-gaps' },
  { pattern: /^add-description-/, theme: 'command-descriptions' },
  { pattern: /^resolve-(?:todo|fixme|hack)-/, theme: 'code-markers' },
  { pattern: /^fix-empty-catch-/, theme: 'empty-catch-blocks' },
  { pattern: /^add-module-header-/, theme: 'module-headers' },
  { pattern: /^remove-process-exit-/, theme: 'process-exit-cleanup' },
  { pattern: /^use-paths-module-/, theme: 'hardcoded-paths' },
  { pattern: /^add-tests-/, theme: 'missing-test-files' },
  { pattern: /^mcp-tool-/, theme: 'mcp-tool-bindings' },
  { pattern: /^missing-validation-/, theme: 'input-validation' },
  { pattern: /^generic-error-/, theme: 'error-messages' },
  { pattern: /^missing-dry-run-/, theme: 'dry-run-support' },
  { pattern: /^missing-integration-test-/, theme: 'integration-test-gaps' },
  { pattern: /^missing-agent-init-/, theme: 'agent-workflow-gaps' },
  { pattern: /^configurable-default-/, theme: 'configurable-defaults' },
  { pattern: /^missing-progress-/, theme: 'progress-feedback' },
  { pattern: /^enhance-/, theme: 'feature-enhancements' },
  { pattern: /^improve-output-/, theme: 'output-improvements' },
  { pattern: /^add-fallback-/, theme: 'error-recovery' },
  { pattern: /^consolidate-/, theme: 'api-consolidation' },
];

/** Dimension weights for priority scoring */
const DIMENSION_WEIGHTS: Record<string, number> = {
  'improve-features': 10,
  'new-features': 9,
  'product-ideation': 9,
  stability: 9,
  consistency: 7,
  productivity: 6,
  usability: 5,
  quality: 4,
};

/** Effort modifiers for priority scoring (prefer low-hanging fruit) */
const EFFORT_MODIFIERS: Record<string, number> = {
  small: 3,
  medium: 2,
  large: 1,
};

/** Source modifiers for priority scoring (prefer bugfixes) */
const SOURCE_MODIFIERS: Record<string, number> = {
  bugfix: 5,
  discovery: 2,
  carryover: 1,
};

// ─── Lib File Read Cache ─────────────────────────────────────────────────────

/**
 * Module-level cache for lib file contents.
 * Avoids re-reading the same file multiple times when discover functions
 * are called in sequence from analyzeCodebaseForItems.
 * Keyed by absolute file path; populated on first read per path.
 */
const _libFileCache = new Map<string, string | null>();

/**
 * Read a lib file using the module-level cache to avoid redundant I/O.
 */
function readLibFileCached(filePath: string): string | null {
  if (!_libFileCache.has(filePath)) {
    _libFileCache.set(filePath, safeReadFile(filePath));
  }
  return _libFileCache.get(filePath) ?? null;
}

// ─── Work Item Factory ──────────────────────────────────────────────────────

/**
 * Create a work item object with deterministic id and sensible defaults.
 */
function createWorkItem(
  dimension: string,
  slug: string,
  title: string,
  description: string,
  opts: WorkItemOptions = {}
): WorkItem {
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
 */
function evolveStatePath(cwd: string): string {
  return path.join(cwd, '.planning', EVOLVE_STATE_FILENAME);
}

// ─── State I/O ──────────────────────────────────────────────────────────────

/**
 * Read and parse the evolve state JSON from disk.
 */
function readEvolveState(cwd: string): EvolveGroupState | EvolveState | null {
  const filePath: string = evolveStatePath(cwd);
  const raw: string | null = safeReadFile(filePath);
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as EvolveGroupState | EvolveState;
  } catch {
    return null;
  }
}

/**
 * Write the evolve state JSON to disk with 2-space indentation.
 * Creates parent directory if needed.
 */
function writeEvolveState(cwd: string, state: EvolveGroupState | EvolveState): void {
  const filePath: string = evolveStatePath(cwd);
  const dir: string = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n');
}

// ─── State Creation ─────────────────────────────────────────────────────────

/**
 * Create a fresh iteration state object.
 */
function createInitialState(milestone: string, itemsPerIteration?: number): EvolveState {
  return {
    iteration: 1,
    timestamp: new Date().toISOString(),
    milestone,
    items_per_iteration:
      itemsPerIteration !== undefined ? itemsPerIteration : DEFAULT_ITEMS_PER_ITERATION,
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
 * Items from `discovered` that share an `id` with `existing` are dropped.
 */
function mergeWorkItems(existing: WorkItem[], discovered: WorkItem[]): WorkItem[] {
  const seen = new Set<string>(existing.map((item) => item.id));
  const merged: WorkItem[] = [...existing];

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
 */
function advanceIteration(previousState: EvolveState): EvolveState {
  // Build history entry from previous iteration
  const historyEntry: HistoryEntry = {
    iteration: previousState.iteration,
    timestamp: previousState.timestamp,
    selected_count: previousState.selected.length,
    completed_count: previousState.completed.length,
    failed_count: previousState.failed.length,
  };

  // Carry over remaining items that are still pending
  const carryoverRemaining: WorkItem[] = previousState.remaining.filter(
    (item) => item.status === 'pending'
  );

  // Merge bugfix items into remaining
  const mergedRemaining: WorkItem[] = mergeWorkItems(carryoverRemaining, previousState.bugfix);

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
  SONNET_MODEL,
  WORK_ITEM_DIMENSIONS,
  DEFAULT_ITEMS_PER_ITERATION,
  DEFAULT_PICK_PCT,
  THEME_PATTERNS,
  DIMENSION_WEIGHTS,
  EFFORT_MODIFIERS,
  SOURCE_MODIFIERS,
  // Cache
  readLibFileCached,
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
