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
const { safeReadFile, output, error, loadConfig, resolveModelForAgent, getMilestoneInfo } =
  require('./utils');
const { detectBackend, getBackendCapabilities } = require('./backend');
const { spawnClaude } = require('./autopilot');

// ─── Constants ──────────────────────────────────────────────────────────────

const EVOLVE_STATE_FILENAME = 'EVOLVE-STATE.json';

const SONNET_MODEL = 'sonnet';

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

// ─── Orchestrator (Phase 56) ─────────────────────────────────────────────────

/**
 * Build a prompt for planning a work item improvement.
 * Instructs a Claude subprocess to analyze and plan (not implement).
 *
 * @param {WorkItem} item - Work item to plan
 * @returns {string} Prompt string for spawnClaude
 */
function buildPlanPrompt(item) {
  return [
    'Read CLAUDE.md for project conventions.',
    `Analyze the codebase for the following improvement opportunity:`,
    `Title: ${item.title}`,
    `Description: ${item.description}`,
    `Dimension: ${item.dimension}`,
    `Effort: ${item.effort}`,
    'Create a brief implementation plan: what files to change and what changes to make.',
    'Do NOT implement anything — only plan.',
  ].join('\n');
}

/**
 * Build a prompt for executing a work item improvement.
 * Instructs a Claude subprocess to implement and verify.
 *
 * @param {WorkItem} item - Work item to execute
 * @returns {string} Prompt string for spawnClaude
 */
function buildExecutePrompt(item) {
  return [
    'Read CLAUDE.md for project conventions.',
    `Implement the following improvement:`,
    `Title: ${item.title}`,
    `Description: ${item.description}`,
    `Dimension: ${item.dimension}`,
    `Effort: ${item.effort}`,
    'Run `npm test` to verify changes do not break tests.',
    'Fix any test failures before completing.',
    'Keep changes focused and minimal.',
  ].join('\n');
}

/**
 * Build a prompt for reviewing an executed improvement.
 * Instructs a Claude subprocess to verify quality.
 *
 * @param {WorkItem} item - Work item to review
 * @returns {string} Prompt string for spawnClaude
 */
function buildReviewPrompt(item) {
  return [
    `Review the improvement that was just made:`,
    `Title: ${item.title}`,
    `Description: ${item.description}`,
    'Run `npm test` and `npm run lint` to check for regressions.',
    'Verify the improvement was actually made.',
    'Fix any issues found.',
  ].join('\n');
}

/**
 * Create or append evolution notes to .planning/EVOLUTION.md.
 *
 * @param {string} cwd - Project working directory
 * @param {Object} iterationData - Iteration data
 * @param {number} iterationData.iteration - Iteration number
 * @param {WorkItem[]} iterationData.items - Items attempted
 * @param {Array<{item: string, status: string, step?: string, reason?: string}>} iterationData.outcomes - Outcome per item
 * @param {string[]} iterationData.decisions - Decisions made
 * @param {string[]} iterationData.patterns - Patterns discovered
 * @param {string[]} iterationData.takeaways - Takeaways
 */
function writeEvolutionNotes(cwd, iterationData) {
  const filePath = path.join(cwd, '.planning', 'EVOLUTION.md');
  const { iteration, items, outcomes, decisions, patterns, takeaways } = iterationData;

  // Create file with header if it doesn't exist
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '# Evolution Notes\n\n');
  }

  const lines = [];
  lines.push(`## Iteration ${iteration}`);
  lines.push(`_${new Date().toISOString()}_\n`);

  // Items Attempted
  lines.push('### Items Attempted\n');
  if (items.length === 0) {
    lines.push('None\n');
  } else {
    for (const item of items) {
      const outcome = outcomes.find((o) => o.item === item.title);
      const status = outcome ? outcome.status : 'unknown';
      lines.push(`- **${item.title}** — ${status}`);
    }
    lines.push('');
  }

  // Decisions Made
  lines.push('### Decisions Made\n');
  if (decisions.length === 0) {
    lines.push('None\n');
  } else {
    for (const d of decisions) {
      lines.push(`- ${d}`);
    }
    lines.push('');
  }

  // Patterns Discovered
  lines.push('### Patterns Discovered\n');
  if (patterns.length === 0) {
    lines.push('None\n');
  } else {
    for (const p of patterns) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  // Takeaways
  lines.push('### Takeaways\n');
  if (takeaways.length === 0) {
    lines.push('None\n');
  } else {
    for (const t of takeaways) {
      lines.push(`- ${t}`);
    }
    lines.push('');
  }

  lines.push('---\n');

  fs.appendFileSync(filePath, lines.join('\n'));
}

/**
 * Main evolve orchestration loop.
 * Discovers improvements, then for each: plan -> execute -> review using spawnClaude.
 * All subprocess calls enforce SONNET_MODEL ceiling.
 *
 * @param {string} cwd - Project working directory
 * @param {Object} [options={}] - Options
 * @param {number} [options.iterations=1] - Number of iterations to run
 * @param {number} [options.itemsPerIteration] - Override items per iteration
 * @param {number} [options.timeout] - Timeout per subprocess in minutes
 * @param {number} [options.maxTurns] - Max turns per subprocess
 * @param {boolean} [options.dryRun=false] - If true, discover but don't execute
 * @returns {Promise<{iterations_completed: number, results: Array, evolution_notes_path: string}>}
 */
async function runEvolve(cwd, options = {}) {
  const { iterations = 1, itemsPerIteration, timeout, maxTurns, dryRun = false } = options;
  const timeoutMs = timeout ? timeout * 60 * 1000 : undefined;

  // Set up logging (same pattern as autopilot.js)
  const logFile = path.join(cwd, '.planning', 'autopilot', 'evolve.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stderr.write(`[evolve] ${msg}\n`);
    fs.appendFileSync(logFile, line);
  };

  const results = [];
  let state = readEvolveState(cwd);

  for (let iter = 0; iter < iterations; iter++) {
    const iterNum = state ? state.iteration + 1 : 1;
    log(`Starting iteration ${iterNum}`);

    // Override items_per_iteration if CLI flag provided
    if (itemsPerIteration && state) state.items_per_iteration = itemsPerIteration;

    // 1. Discover: pure function, no subprocess
    const discovery = runDiscovery(cwd, state);
    log(`Discovered ${discovery.all_discovered_count} items, selected ${discovery.selected.length}`);

    if (dryRun) {
      results.push({
        iteration: iterNum,
        status: 'dry-run',
        selected: discovery.selected,
        remaining_count: discovery.remaining.length,
      });
      continue;
    }

    // 2. Process each selected item: plan -> execute -> review
    const outcomes = [];
    for (const item of discovery.selected) {
      log(`Processing: ${item.title}`);
      let failed = false;

      for (const [step, promptFn] of [
        ['plan', buildPlanPrompt],
        ['execute', buildExecutePrompt],
        ['review', buildReviewPrompt],
      ]) {
        const result = spawnClaude(cwd, promptFn(item), {
          model: SONNET_MODEL,
          timeout: timeoutMs,
          maxTurns,
        });
        if (result.exitCode !== 0) {
          const reason = result.timedOut ? 'timeout' : `exit ${result.exitCode}`;
          log(`${item.title}: ${step} FAILED (${reason})`);
          outcomes.push({ item: item.title, status: 'fail', step, reason });
          failed = true;
          break;
        }
        log(`${item.title}: ${step} completed`);
      }
      if (!failed) outcomes.push({ item: item.title, status: 'pass' });
    }

    // 3. Write evolution notes
    writeEvolutionNotes(cwd, {
      iteration: iterNum,
      items: discovery.selected,
      outcomes,
      decisions: [],
      patterns: [],
      takeaways: [],
    });

    // 4. Update and persist state
    if (!state) state = createInitialState(cwd);
    state.selected = discovery.selected;
    state.remaining = discovery.remaining;
    state.completed = outcomes
      .filter((o) => o.status === 'pass')
      .map((o) => discovery.selected.find((i) => i.title === o.item))
      .filter(Boolean);
    state.failed = outcomes
      .filter((o) => o.status === 'fail')
      .map((o) => discovery.selected.find((i) => i.title === o.item))
      .filter(Boolean);
    state.iteration = iterNum;
    state.timestamp = new Date().toISOString();
    writeEvolveState(cwd, state);

    results.push({
      iteration: iterNum,
      status: 'completed',
      items_attempted: outcomes.length,
      items_passed: outcomes.filter((o) => o.status === 'pass').length,
      items_failed: outcomes.filter((o) => o.status === 'fail').length,
    });

    // Advance for next iteration
    if (iter < iterations - 1) state = advanceIteration(state);
  }

  log(`Done: ${results.length} iteration(s) completed`);
  return {
    iterations_completed: results.length,
    results,
    evolution_notes_path: path.join('.planning', 'EVOLUTION.md'),
  };
}

/**
 * CLI entry point for the evolve command.
 * Parses flags and delegates to runEvolve.
 *
 * @param {string} cwd - Project working directory
 * @param {string[]} args - CLI arguments
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
async function cmdEvolve(cwd, args, raw) {
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const hasFlag = (name) => args.indexOf(name) !== -1;
  const options = {
    iterations: hasFlag('--iterations') ? parseInt(flag('--iterations', '1'), 10) : undefined,
    itemsPerIteration: hasFlag('--items') ? parseInt(flag('--items', '5'), 10) : undefined,
    timeout: hasFlag('--timeout') ? parseInt(flag('--timeout', '0'), 10) : undefined,
    maxTurns: hasFlag('--max-turns') ? parseInt(flag('--max-turns', '0'), 10) : undefined,
    dryRun: hasFlag('--dry-run'),
  };
  const result = await runEvolve(cwd, options);
  output(result, raw, raw ? JSON.stringify(result) : undefined);
}

// ─── CLI Command Functions ─────────────────────────────────────────────────

/**
 * CLI entry point: run discovery and output results.
 *
 * @param {string} cwd - Project working directory
 * @param {string[]} args - CLI arguments (supports --count N)
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdEvolveDiscover(cwd, args, raw) {
  // Parse --count flag
  let count = DEFAULT_ITEMS_PER_ITERATION;
  const countIdx = args.indexOf('--count');
  if (countIdx !== -1 && args[countIdx + 1]) {
    const parsed = parseInt(args[countIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) count = parsed;
  }

  const previousState = readEvolveState(cwd);
  const result = runDiscovery(cwd, previousState);

  const out = {
    selected: result.selected,
    remaining: result.remaining,
    all_discovered_count: result.all_discovered_count,
    merged_count: result.merged_count,
    items_per_iteration: count,
  };

  output(out, raw, raw ? `${result.selected.length} items selected` : undefined);
}

/**
 * CLI entry point: read and output the current evolve state.
 *
 * @param {string} cwd - Project working directory
 * @param {string[]} _args - CLI arguments (unused)
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdEvolveState(cwd, _args, raw) {
  const state = readEvolveState(cwd);

  if (state === null) {
    const out = { exists: false, state: null };
    output(out, raw, raw ? 'No evolve state found' : undefined);
  } else {
    const out = { exists: true, state };
    output(out, raw, raw ? JSON.stringify(state) : undefined);
  }
}

/**
 * CLI entry point: advance to the next iteration.
 *
 * @param {string} cwd - Project working directory
 * @param {string[]} _args - CLI arguments (unused)
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdEvolveAdvance(cwd, _args, raw) {
  const previousState = readEvolveState(cwd);

  if (previousState === null) {
    error('No evolve state found. Run discover first.');
  }

  const newState = advanceIteration(previousState);
  writeEvolveState(cwd, newState);

  output(newState, raw, raw ? `iteration ${newState.iteration}` : undefined);
}

/**
 * CLI entry point: delete the evolve state file (start fresh).
 *
 * @param {string} cwd - Project working directory
 * @param {string[]} _args - CLI arguments (unused)
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdEvolveReset(cwd, _args, raw) {
  const filePath = evolveStatePath(cwd);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // File doesn't exist — that's fine
  }

  output({ reset: true }, raw, raw ? 'Evolve state reset' : undefined);
}

/**
 * CLI entry point: pre-flight context for the evolve workflow.
 * Follows the cmdInitAutopilot pattern from lib/autopilot.js.
 *
 * @param {string} cwd - Project working directory
 * @param {boolean} raw - If true, output raw text instead of JSON
 */
function cmdInitEvolve(cwd, raw) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const capabilities = getBackendCapabilities(backend);
  const state = readEvolveState(cwd);
  const plannerModel = resolveModelForAgent(config, 'grd-planner', cwd);
  const executorModel = resolveModelForAgent(config, 'grd-executor', cwd);
  const milestone = getMilestoneInfo(cwd);

  const result = {
    backend,
    capabilities,
    config: {
      model_profile: config.model_profile || 'balanced',
      autonomous_mode: config.autonomous_mode || false,
      items_per_iteration: (state && state.items_per_iteration) || DEFAULT_ITEMS_PER_ITERATION,
    },
    evolve_state: {
      exists: state !== null,
      iteration: state ? state.iteration : 0,
      remaining_count: state ? (state.remaining || []).length : 0,
      bugfix_count: state ? (state.bugfix || []).length : 0,
    },
    models: {
      planner: plannerModel,
      executor: executorModel,
    },
    milestone,
  };

  output(result, raw, raw ? JSON.stringify(result) : undefined);
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
  // Orchestrator (Phase 56)
  SONNET_MODEL,
  buildPlanPrompt,
  buildExecutePrompt,
  buildReviewPrompt,
  writeEvolutionNotes,
  runEvolve,
  cmdEvolve,
  // CLI command functions
  cmdEvolveDiscover,
  cmdEvolveState,
  cmdEvolveAdvance,
  cmdEvolveReset,
  cmdInitEvolve,
};
