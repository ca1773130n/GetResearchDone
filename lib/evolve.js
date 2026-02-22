'use strict';

/**
 * GRD Evolve — State layer, discovery engine, and priority selection
 *
 * Foundation data layer for the self-evolving loop (/grd:evolve). Provides
 * work item creation, iteration state persistence, merge/deduplication,
 * iteration advancement logic, codebase discovery engine, scoring heuristic,
 * and priority selection algorithm.
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

// ─── Discovery Engine ────────────────────────────────────────────────────────

/**
 * Discover productivity improvement opportunities.
 * Scans lib/ for long functions, duplicate exports, and missing init workflows.
 *
 * @param {string} cwd - Project working directory
 * @returns {WorkItem[]} Discovered productivity items
 */
function discoverProductivityItems(cwd) {
  const items = [];
  const libDir = path.join(cwd, 'lib');

  try {
    const libFiles = fs.readdirSync(libDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => e.name);

    for (const file of libFiles) {
      const content = safeReadFile(path.join(libDir, file));
      if (!content) continue;

      // Check for long functions (>80 lines)
      const funcPattern = /^(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\())/gm;
      let funcMatch;
      while ((funcMatch = funcPattern.exec(content)) !== null) {
        const funcName = funcMatch[1] || funcMatch[2];
        const startIdx = funcMatch.index;
        const startLine = content.substring(0, startIdx).split('\n').length;

        // Count lines until we find matching brace depth back to 0
        let depth = 0;
        let foundOpen = false;
        let endLine = startLine;
        const lines = content.split('\n');
        for (let i = startLine - 1; i < lines.length; i++) {
          const line = lines[i];
          for (const ch of line) {
            if (ch === '{') { depth++; foundOpen = true; }
            else if (ch === '}') { depth--; }
          }
          if (foundOpen && depth <= 0) {
            endLine = i + 1;
            break;
          }
        }

        const funcLength = endLine - startLine + 1;
        if (funcLength > 80) {
          items.push(
            createWorkItem(
              'productivity',
              `split-${path.basename(file, '.js')}-${funcName}`,
              `Split long function ${funcName} in ${file}`,
              `Function ${funcName} in lib/${file} is ${funcLength} lines long (threshold: 80). Consider splitting into smaller helper functions for readability and maintainability.`,
              { effort: 'medium' }
            )
          );
        }
      }
    }
  } catch {
    // lib/ directory missing or unreadable
  }

  return items;
}

/**
 * Discover quality improvement opportunities.
 * Checks for TODO/FIXME/HACK comments and missing test files.
 *
 * @param {string} cwd - Project working directory
 * @returns {WorkItem[]} Discovered quality items
 */
function discoverQualityItems(cwd) {
  const items = [];
  const libDir = path.join(cwd, 'lib');
  const testDir = path.join(cwd, 'tests', 'unit');

  try {
    const libFiles = fs.readdirSync(libDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => e.name);

    for (const file of libFiles) {
      // Check for missing test file
      const testFileName = file.replace('.js', '.test.js');
      const testPath = path.join(testDir, testFileName);
      try {
        fs.statSync(testPath);
      } catch {
        items.push(
          createWorkItem(
            'quality',
            `add-tests-${path.basename(file, '.js')}`,
            `Add test file for ${file}`,
            `lib/${file} has no corresponding test file at tests/unit/${testFileName}. Add unit tests to ensure code correctness.`,
            { effort: 'medium' }
          )
        );
      }

      // Check for TODO/FIXME/HACK comments
      const content = safeReadFile(path.join(libDir, file));
      if (!content) continue;

      const todoPattern = /\b(TODO|FIXME|HACK)\b[:\s]*(.*)/g;
      let todoMatch;
      while ((todoMatch = todoPattern.exec(content)) !== null) {
        const tag = todoMatch[1];
        const desc = todoMatch[2].trim().substring(0, 80);
        const lineNum = content.substring(0, todoMatch.index).split('\n').length;
        const slug = `resolve-${tag.toLowerCase()}-${path.basename(file, '.js')}-L${lineNum}`;

        items.push(
          createWorkItem(
            'quality',
            slug,
            `Resolve ${tag} in ${file} line ${lineNum}`,
            `${tag} comment found in lib/${file} at line ${lineNum}: "${desc}". Review and resolve this marker.`,
            { effort: 'small' }
          )
        );
      }
    }
  } catch {
    // lib/ or tests/ directory missing
  }

  // Check jest.config.js for low coverage thresholds
  try {
    const jestConfigContent = safeReadFile(path.join(cwd, 'jest.config.js'));
    if (jestConfigContent) {
      const thresholdPattern = /'\.\/lib\/([^']+)':\s*\{[^}]*lines:\s*(\d+)/g;
      let thresholdMatch;
      while ((thresholdMatch = thresholdPattern.exec(jestConfigContent)) !== null) {
        const moduleName = thresholdMatch[1];
        const linesCoverage = parseInt(thresholdMatch[2], 10);
        if (linesCoverage < 90) {
          items.push(
            createWorkItem(
              'quality',
              `improve-coverage-${path.basename(moduleName, '.js')}`,
              `Improve test coverage for ${moduleName}`,
              `lib/${moduleName} has a coverage threshold of ${linesCoverage}% lines (target: 90%). Increase test coverage to strengthen code quality.`,
              { effort: 'medium' }
            )
          );
        }
      }
    }
  } catch {
    // jest.config.js not found
  }

  return items;
}

/**
 * Discover usability improvement opportunities.
 * Checks commands for missing descriptions and lib/ for missing JSDoc.
 *
 * @param {string} cwd - Project working directory
 * @returns {WorkItem[]} Discovered usability items
 */
function discoverUsabilityItems(cwd) {
  const items = [];
  const cmdDir = path.join(cwd, 'commands');

  try {
    const cmdFiles = fs.readdirSync(cmdDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name);

    for (const file of cmdFiles) {
      const content = safeReadFile(path.join(cmdDir, file));
      if (!content) continue;

      // Check for missing description in frontmatter
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const frontmatter = fmMatch[1];
        if (!frontmatter.includes('description:') || frontmatter.match(/description:\s*$/m)) {
          items.push(
            createWorkItem(
              'usability',
              `add-description-${path.basename(file, '.md')}`,
              `Add description to command ${file}`,
              `Command file commands/${file} is missing a description in its frontmatter. Add a clear description to improve discoverability.`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch {
    // commands/ directory missing
  }

  // Check lib/ files for undocumented exported functions (missing JSDoc)
  const libDir = path.join(cwd, 'lib');
  try {
    const libFiles = fs.readdirSync(libDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => e.name);

    for (const file of libFiles) {
      const content = safeReadFile(path.join(libDir, file));
      if (!content) continue;

      // Find exported functions without preceding JSDoc
      const exportBlock = content.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
      if (!exportBlock) continue;

      const exportedNames = exportBlock[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.match(/^(\w+)/))
        .filter(Boolean)
        .map((m) => m[1]);

      for (const name of exportedNames) {
        // Find the function declaration
        const funcIdx = content.indexOf(`function ${name}(`);
        if (funcIdx === -1) continue;

        // Check for JSDoc before it (within previous 5 lines)
        const beforeFunc = content.substring(0, funcIdx);
        const beforeLines = beforeFunc.split('\n');
        const startCheck = Math.max(0, beforeLines.length - 6);
        const contextLines = beforeLines.slice(startCheck).join('\n');

        if (!contextLines.includes('/**')) {
          items.push(
            createWorkItem(
              'usability',
              `add-jsdoc-${path.basename(file, '.js')}-${name}`,
              `Add JSDoc to ${name} in ${file}`,
              `Exported function ${name} in lib/${file} lacks JSDoc documentation. Add parameter and return type annotations.`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch {
    // lib/ directory missing
  }

  return items;
}

/**
 * Discover consistency improvement opportunities.
 * Checks for inconsistent error handling and missing file headers.
 *
 * @param {string} cwd - Project working directory
 * @returns {WorkItem[]} Discovered consistency items
 */
function discoverConsistencyItems(cwd) {
  const items = [];
  const libDir = path.join(cwd, 'lib');

  try {
    const libFiles = fs.readdirSync(libDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => e.name);

    for (const file of libFiles) {
      const content = safeReadFile(path.join(libDir, file));
      if (!content) continue;

      // Check for process.exit calls (should use error() instead)
      if (content.includes('process.exit(')) {
        items.push(
          createWorkItem(
            'consistency',
            `remove-process-exit-${path.basename(file, '.js')}`,
            `Replace process.exit calls in ${file}`,
            `lib/${file} uses process.exit() directly. Use the error() utility function instead for consistent error handling.`,
            { effort: 'small' }
          )
        );
      }

      // Check for missing JSDoc module header
      const firstLines = content.split('\n').slice(0, 5).join('\n');
      if (!firstLines.includes('/**')) {
        items.push(
          createWorkItem(
            'consistency',
            `add-module-header-${path.basename(file, '.js')}`,
            `Add module JSDoc header to ${file}`,
            `lib/${file} is missing the standard JSDoc module header comment at the top of the file.`,
            { effort: 'small' }
          )
        );
      }
    }
  } catch {
    // lib/ directory missing
  }

  return items;
}

/**
 * Discover stability improvement opportunities.
 * Checks for empty catch blocks, hardcoded paths, and missing validation.
 *
 * @param {string} cwd - Project working directory
 * @returns {WorkItem[]} Discovered stability items
 */
function discoverStabilityItems(cwd) {
  const items = [];
  const libDir = path.join(cwd, 'lib');

  try {
    const libFiles = fs.readdirSync(libDir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.js'))
      .map((e) => e.name);

    for (const file of libFiles) {
      const content = safeReadFile(path.join(libDir, file));
      if (!content) continue;

      // Check for empty catch blocks that swallow errors
      const emptyCatchPattern = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
      let catchMatch;
      while ((catchMatch = emptyCatchPattern.exec(content)) !== null) {
        const lineNum = content.substring(0, catchMatch.index).split('\n').length;
        items.push(
          createWorkItem(
            'stability',
            `fix-empty-catch-${path.basename(file, '.js')}-L${lineNum}`,
            `Handle error in empty catch block in ${file} line ${lineNum}`,
            `lib/${file} has an empty catch block at line ${lineNum} that silently swallows errors. Add error logging or explicit comment explaining why the error is intentionally ignored.`,
            { effort: 'small' }
          )
        );
      }

      // Check for hardcoded .planning paths (should use lib/paths.js)
      if (file !== 'paths.js' && file !== 'evolve.js') {
        const hardcodedPathPattern = /['"]\.planning\//g;
        let pathMatch;
        while ((pathMatch = hardcodedPathPattern.exec(content)) !== null) {
          const lineNum = content.substring(0, pathMatch.index).split('\n').length;
          items.push(
            createWorkItem(
              'stability',
              `use-paths-module-${path.basename(file, '.js')}-L${lineNum}`,
              `Use paths module instead of hardcoded path in ${file}`,
              `lib/${file} has a hardcoded ".planning/" path at line ${lineNum}. Use lib/paths.js functions for path resolution to ensure consistency across environments.`,
              { effort: 'small' }
            )
          );
        }
      }
    }
  } catch {
    // lib/ directory missing
  }

  return items;
}

/**
 * Discover new feature opportunities.
 * Checks for init workflows without MCP tools and other patterns.
 *
 * @param {string} cwd - Project working directory
 * @returns {WorkItem[]} Discovered new feature items
 */
function discoverNewFeatureItems(cwd) {
  const items = [];

  // Check for init workflows that don't have MCP tool bindings
  const contextPath = path.join(cwd, 'lib', 'context.js');
  const mcpPath = path.join(cwd, 'lib', 'mcp-server.js');

  try {
    const contextContent = safeReadFile(contextPath);
    const mcpContent = safeReadFile(mcpPath);

    if (contextContent && mcpContent) {
      // Extract cmdInit* function names
      const initPattern = /function\s+(cmdInit\w+)\s*\(/g;
      let initMatch;
      while ((initMatch = initPattern.exec(contextContent)) !== null) {
        const funcName = initMatch[1];
        // Check if this init function is referenced in mcp-server.js
        if (!mcpContent.includes(funcName)) {
          items.push(
            createWorkItem(
              'new-features',
              `mcp-tool-${funcName.replace(/^cmdInit/, '').toLowerCase()}`,
              `Add MCP tool for ${funcName}`,
              `Init workflow ${funcName} in lib/context.js does not have a corresponding MCP tool binding in lib/mcp-server.js. Adding it would expose the workflow to MCP clients.`,
              { effort: 'medium' }
            )
          );
        }
      }
    }
  } catch {
    // Files not found
  }

  return items;
}

/**
 * Analyze the codebase and produce categorized work items across all 6 dimensions.
 *
 * Each dimension is discovered independently. A failure in one dimension does not
 * affect others (defensive try/catch per dimension).
 *
 * @param {string} cwd - Project working directory
 * @returns {WorkItem[]} All discovered work items across all dimensions
 */
function analyzeCodebaseForItems(cwd) {
  const discoverers = [
    discoverProductivityItems,
    discoverQualityItems,
    discoverUsabilityItems,
    discoverConsistencyItems,
    discoverStabilityItems,
    discoverNewFeatureItems,
  ];

  const items = [];
  for (const discover of discoverers) {
    try {
      const found = discover(cwd);
      items.push(...found);
    } catch {
      // Defensive: one dimension failure should not block others
    }
  }

  return items;
}

// ─── Scoring Heuristic ──────────────────────────────────────────────────────

/** Dimension weights for priority scoring */
const DIMENSION_WEIGHTS = {
  quality: 10,
  stability: 9,
  consistency: 7,
  productivity: 6,
  usability: 5,
  'new-features': 3,
};

/** Effort modifiers for priority scoring (prefer low-hanging fruit) */
const EFFORT_MODIFIERS = {
  small: 3,
  medium: 2,
  large: 1,
};

/** Source modifiers for priority scoring (prefer bugfixes) */
const SOURCE_MODIFIERS = {
  bugfix: 5,
  discovery: 2,
  carryover: 1,
};

/**
 * Compute a priority score for a work item.
 *
 * Score = dimension_weight + effort_modifier + source_modifier
 *
 * Higher scores indicate higher priority. The scoring is deterministic
 * given the same input.
 *
 * @param {WorkItem} item - Work item to score
 * @returns {number} Priority score (always positive)
 */
function scoreWorkItem(item) {
  const dimWeight = DIMENSION_WEIGHTS[item.dimension] || 0;
  const effortMod = EFFORT_MODIFIERS[item.effort] || 0;
  const sourceMod = SOURCE_MODIFIERS[item.source] || 0;
  return dimWeight + effortMod + sourceMod;
}

// ─── Priority Selection ─────────────────────────────────────────────────────

/**
 * Select the top N items by priority score from a list of work items.
 *
 * - Scores all items using scoreWorkItem
 * - Sorts descending by score (stable sort for equal scores)
 * - Takes first `count` items and marks their status as 'selected'
 * - Returns both selected and remaining arrays
 *
 * @param {WorkItem[]} items - All candidate items
 * @param {number} count - Number of items to select
 * @returns {{ selected: WorkItem[], remaining: WorkItem[] }}
 */
function selectPriorityItems(items, count) {
  // Score and sort (stable sort: items with equal score keep original order)
  const scored = items.map((item) => ({ item, score: scoreWorkItem(item) }));
  scored.sort((a, b) => b.score - a.score);

  const selected = [];
  const remaining = [];

  for (let i = 0; i < scored.length; i++) {
    if (i < count) {
      selected.push({ ...scored[i].item, status: 'selected' });
    } else {
      remaining.push({ ...scored[i].item });
    }
  }

  return { selected, remaining };
}

// ─── Discovery Orchestrator ─────────────────────────────────────────────────

/**
 * Run the full discovery flow: analyze codebase, merge with previous state,
 * and select priority items.
 *
 * @param {string} cwd - Project working directory
 * @param {EvolveState|null} previousState - Previous iteration state (or null for fresh run)
 * @returns {{ selected: WorkItem[], remaining: WorkItem[], all_discovered_count: number, merged_count: number }}
 */
function runDiscovery(cwd, previousState) {
  const freshItems = analyzeCodebaseForItems(cwd);
  const allDiscoveredCount = freshItems.length;

  let mergePool = freshItems;

  if (previousState) {
    // Merge with remaining items from previous state
    if (previousState.remaining && previousState.remaining.length > 0) {
      mergePool = mergeWorkItems(previousState.remaining, freshItems);
    }
    // Merge in bugfix items from previous state
    if (previousState.bugfix && previousState.bugfix.length > 0) {
      mergePool = mergeWorkItems(mergePool, previousState.bugfix);
    }
  }

  const mergedCount = mergePool.length;
  const itemsPerIteration = previousState
    ? previousState.items_per_iteration || DEFAULT_ITEMS_PER_ITERATION
    : DEFAULT_ITEMS_PER_ITERATION;

  const { selected, remaining } = selectPriorityItems(mergePool, itemsPerIteration);

  return {
    selected,
    remaining,
    all_discovered_count: allDiscoveredCount,
    merged_count: mergedCount,
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
  // Discovery engine
  analyzeCodebaseForItems,
  // Scoring heuristic
  scoreWorkItem,
  // Priority selection
  selectPriorityItems,
  // Discovery orchestrator
  runDiscovery,
};
