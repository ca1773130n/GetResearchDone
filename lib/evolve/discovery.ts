'use strict';

/**
 * GRD Evolve -- Discovery engine
 *
 * Claude-powered and hardcoded codebase discovery, output parsing,
 * and discovery orchestration (runDiscovery, runGroupDiscovery).
 * Dimension-specific discoverers are in ./_dimensions.ts.
 *
 * @dependencies ./types, ./state, ./_dimensions, ../utils, ../autopilot
 */

import type {
  WorkItem,
  WorkItemEffort,
  EvolveState,
  EvolveGroupState,
  GroupDiscoveryResult,
  WorkGroup,
} from './types';

const path = require('path');
const { safeReadFile } = require('../utils') as {
  safeReadFile: (filePath: string) => string | null;
};
const { spawnClaudeAsync } = require('../autopilot') as {
  spawnClaudeAsync: (
    cwd: string,
    prompt: string,
    opts?: {
      captureOutput?: boolean;
      model?: string;
      maxTurns?: number;
      timeout?: number;
      outputFormat?: string;
      captureStderr?: boolean;
    }
  ) => Promise<{
    exitCode: number;
    stdout?: string;
    stderr?: string;
    timedOut: boolean;
  }>;
};
const {
  SONNET_MODEL,
  WORK_ITEM_DIMENSIONS,
  DEFAULT_ITEMS_PER_ITERATION,
  DEFAULT_PICK_PCT,
  THEME_PATTERNS,
  createWorkItem,
  mergeWorkItems,
} = require('./state.ts') as {
  SONNET_MODEL: string;
  WORK_ITEM_DIMENSIONS: string[];
  DEFAULT_ITEMS_PER_ITERATION: number;
  DEFAULT_PICK_PCT: number;
  THEME_PATTERNS: Array<{ pattern: RegExp; theme: string }>;
  createWorkItem: (
    dimension: string,
    slug: string,
    title: string,
    description: string,
    opts?: { effort?: string }
  ) => WorkItem;
  mergeWorkItems: (existing: WorkItem[], discovered: WorkItem[]) => WorkItem[];
};
const { analyzeCodebaseForItems } = require('./_dimensions.ts') as {
  analyzeCodebaseForItems: (cwd: string) => WorkItem[];
};
const { selectPriorityItems, groupDiscoveredItems, selectPriorityGroups } =
  require('./scoring.ts') as {
    selectPriorityItems: (
      items: WorkItem[],
      count: number
    ) => { selected: WorkItem[]; remaining: WorkItem[] };
    groupDiscoveredItems: (
      items: WorkItem[],
      dimensionWeights?: Record<string, number>
    ) => WorkGroup[];
    selectPriorityGroups: (
      groups: WorkGroup[],
      pickPct: number
    ) => { selected: WorkGroup[]; remaining: WorkGroup[] };
  };

const fs = require('fs');

// ─── Codebase Digest ────────────────────────────────────────────────────────

/**
 * Build a compact file tree with line counts for Claude-powered discovery.
 */
function buildCodebaseDigest(cwd: string): string {
  const lines: string[] = [];
  const dirs: string[] = ['lib', 'bin', 'tests/unit', 'tests/integration'];

  for (const dir of dirs) {
    const dirPath: string = path.join(cwd, dir);
    try {
      const files: string[] = fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter(
          (e: { isFile: () => boolean; name: string }) => e.isFile() && e.name.endsWith('.js')
        )
        .map((e: { name: string }) => {
          const content: string | null = safeReadFile(path.join(dirPath, e.name));
          const lineCount: number = content ? content.split('\n').length : 0;
          return `${dir}/${e.name} (${lineCount}L)`;
        })
        .sort();
      lines.push(...files);
    } catch {
      continue;
    }
  }

  return lines.join('\n');
}

/**
 * Build the discovery prompt with a file tree.
 */
function buildDiscoveryPrompt(cwd: string): string {
  const tree: string = buildCodebaseDigest(cwd);
  return `Analyze this codebase for improvement opportunities. Read the source files you need. Here is the file tree:

${tree}

Output ONLY a JSON array. Each item:
{"dimension":"<dim>","slug":"<kebab-id>","title":"<short>","description":"<what+why, include file:line>","effort":"small|medium|large"}

Dimensions: productivity, quality, usability, consistency, stability, improve-features, new-features

Rules:
- Read source files to find real issues
- Be specific: file paths and line numbers
- Actionable improvements only
- 30-80 items
- ONLY the JSON array, no other text`;
}

// ─── Claude-Powered Discovery ───────────────────────────────────────────────

/**
 * Discover improvement opportunities by running Claude as a subprocess.
 */
async function discoverWithClaude(cwd: string): Promise<WorkItem[]> {
  try {
    const prompt: string = buildDiscoveryPrompt(cwd);
    const result = await spawnClaudeAsync(cwd, prompt, {
      captureOutput: true,
      model: SONNET_MODEL,
      maxTurns: 25,
      timeout: 180_000,
      outputFormat: 'text',
    });

    if (result.exitCode !== 0 || !result.stdout) {
      if (result.timedOut) {
        process.stderr.write(
          `[evolve] WARNING: Claude discovery timed out after timeout limit, using hardcoded fallback\n`
        );
      } else {
        process.stderr.write(
          `[evolve] Claude discovery failed (exit=${result.exitCode}, timedOut=${result.timedOut}), using hardcoded fallback\n`
        );
      }
      return analyzeCodebaseForItems(cwd);
    }

    // Check for max-turns error message in stdout
    if (result.stdout.startsWith('Error:')) {
      process.stderr.write(
        `[evolve] Claude discovery error: ${result.stdout.trim()}, using hardcoded fallback\n`
      );
      return analyzeCodebaseForItems(cwd);
    }

    const items: WorkItem[] = parseDiscoveryOutput(result.stdout);
    if (items.length === 0) {
      process.stderr.write(
        `[evolve] Claude discovery returned unparseable output (${result.stdout.length} chars), using hardcoded fallback\n`
      );
      return analyzeCodebaseForItems(cwd);
    }
    return items;
  } catch (err) {
    process.stderr.write(
      `[evolve] Claude discovery threw: ${(err as Error).message}, using hardcoded fallback\n`
    );
    return analyzeCodebaseForItems(cwd);
  }
}

/**
 * Parse Claude's discovery output into validated work items.
 */
function parseDiscoveryOutput(raw: string): WorkItem[] {
  let jsonStr: string = raw.trim();

  // Strip markdown fences if present
  const fenceMatch: RegExpMatchArray | null = jsonStr.match(
    /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/
  );
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const validEfforts: string[] = ['small', 'medium', 'large'];
  const items: WorkItem[] = [];

  for (const entry of parsed as Array<Record<string, unknown>>) {
    if (
      !entry ||
      typeof entry.dimension !== 'string' ||
      typeof entry.slug !== 'string' ||
      typeof entry.title !== 'string' ||
      typeof entry.description !== 'string'
    ) {
      continue;
    }

    if (!WORK_ITEM_DIMENSIONS.includes(entry.dimension)) {
      continue;
    }

    const effort: WorkItemEffort = validEfforts.includes(entry.effort as string)
      ? (entry.effort as WorkItemEffort)
      : 'medium';

    try {
      items.push(
        createWorkItem(entry.dimension, entry.slug, entry.title, entry.description, { effort })
      );
    } catch {
      // Skip invalid items
    }
  }

  // Warn when >50% of items have off-theme slugs
  if (items.length > 0) {
    const offThemeCount: number = items.filter((item) => {
      return !THEME_PATTERNS.some(({ pattern }) => pattern.test(item.slug));
    }).length;
    if (offThemeCount / items.length > 0.5) {
      process.stderr.write(
        `[evolve] WARNING: ${offThemeCount}/${items.length} items do not match any theme pattern — Claude may be generating off-theme slugs\n`
      );
    }
  }

  return items;
}

// ─── Discovery Orchestrators ────────────────────────────────────────────────

/**
 * Run the full discovery flow: analyze codebase, merge with previous state,
 * and select priority items.
 */
async function runDiscovery(
  cwd: string,
  previousState: EvolveState | null
): Promise<{
  selected: WorkItem[];
  remaining: WorkItem[];
  all_discovered_count: number;
  merged_count: number;
}> {
  const freshItems: WorkItem[] = await discoverWithClaude(cwd);
  const allDiscoveredCount: number = freshItems.length;

  let mergePool: WorkItem[] = freshItems;

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

  const mergedCount: number = mergePool.length;
  const itemsPerIteration: number = previousState
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

/**
 * Run full discovery flow returning groups instead of flat items.
 */
async function runGroupDiscovery(
  cwd: string,
  previousState: EvolveGroupState | EvolveState | null,
  pickPct?: number
): Promise<GroupDiscoveryResult> {
  const freshItems: WorkItem[] = await discoverWithClaude(cwd);
  const allItemsCount: number = freshItems.length;

  let mergePool: WorkItem[] = freshItems;

  // Backward compat: old state with flat 'remaining' array
  const stateAsLegacy = previousState as EvolveState | null;
  const stateAsGroup = previousState as EvolveGroupState | null;

  if (previousState && stateAsLegacy?.remaining && !stateAsGroup?.remaining_groups) {
    const oldItems: WorkItem[] = stateAsLegacy.remaining.filter(
      (i: WorkItem) => i.status === 'pending'
    );
    if (stateAsLegacy.bugfix && stateAsLegacy.bugfix.length > 0) {
      mergePool = mergeWorkItems(mergeWorkItems(oldItems, freshItems), stateAsLegacy.bugfix);
    } else {
      mergePool = mergeWorkItems(oldItems, freshItems);
    }
  } else if (previousState && stateAsGroup?.remaining_groups) {
    // New format: merge previous remaining groups' items back into pool for re-grouping
    const prevItems: WorkItem[] = [];
    for (const group of stateAsGroup.remaining_groups) {
      if (group.status === 'pending') {
        prevItems.push(...group.items);
      }
    }
    mergePool = mergeWorkItems(prevItems, freshItems);
  }

  const effectivePickPct: number = pickPct !== undefined ? pickPct : DEFAULT_PICK_PCT;
  const groups: WorkGroup[] = groupDiscoveredItems(mergePool);
  const { selected, remaining } = selectPriorityGroups(groups, effectivePickPct);

  return {
    groups,
    selected_groups: selected,
    remaining_groups: remaining,
    all_items_count: allItemsCount,
    merged_items_count: mergePool.length,
    groups_count: groups.length,
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  // Re-export dimension functions for backward compat
  discoverImproveFeatureItems: require('./_dimensions-features.ts').discoverImproveFeatureItems,
  analyzeCodebaseForItems: require('./_dimensions.ts').analyzeCodebaseForItems,
  // Framework functions
  buildCodebaseDigest,
  buildDiscoveryPrompt,
  discoverWithClaude,
  parseDiscoveryOutput,
  // Orchestrators
  runDiscovery,
  runGroupDiscovery,
};
