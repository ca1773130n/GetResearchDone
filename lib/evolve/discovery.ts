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
const { safeReadFile }: {
  safeReadFile: (filePath: string) => string | null;
} = require('../utils');
const { spawnClaudeAsync }: {
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
} = require('../autopilot');
const {
  SONNET_MODEL,
  WORK_ITEM_DIMENSIONS,
  DEFAULT_ITEMS_PER_ITERATION,
  DEFAULT_PICK_PCT,
  THEME_PATTERNS,
  createWorkItem,
  mergeWorkItems,
}: {
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
} = require('./state');
const { analyzeCodebaseForItems }: {
  analyzeCodebaseForItems: (cwd: string) => WorkItem[];
} = require('./_dimensions');
const { discoverProductIdeationItems }: {
  discoverProductIdeationItems: (cwd: string) => Promise<WorkItem[]>;
} = require('./_product-ideation');
const { selectPriorityItems, groupDiscoveredItems, selectPriorityGroups }: {
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
  } = require('./scoring');

const fs = require('fs');

// ─── Saturated Dimensions ───────────────────────────────────────────────────

/**
 * Dimensions that have been verified as 100% false-positive for 5+ consecutive
 * iterations. Items in these themes are filtered out before grouping to avoid
 * wasting subprocess calls on work that's already been done.
 */
const SATURATED_THEMES: Set<string> = new Set([
  'error-recovery',
  'agent-workflow-gaps',
  'process-exit-cleanup',
  'long-function-refactors',
  'jsdoc-gaps',
]);

// ─── Codebase Digest ────────────────────────────────────────────────────────

/** File extensions to include in codebase digest. */
const CODE_EXTENSIONS: Set<string> = new Set([
  '.ts', '.js', '.tsx', '.jsx', '.py', '.rs', '.go', '.java', '.kt',
  '.rb', '.php', '.swift', '.c', '.cpp', '.h', '.hpp', '.cs', '.vue',
  '.svelte', '.astro', '.sql', '.sh', '.bash', '.zsh',
]);

/** Directories to always skip. */
const SKIP_DIRS: Set<string> = new Set([
  'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out',
  '.cache', '.turbo', '.vercel', '__pycache__', '.tox', '.mypy_cache',
  'target', 'vendor', '.worktrees', '.planning', 'coverage',
]);

/**
 * Recursively collect source files from a directory (max 2 levels deep).
 */
function _collectSourceFiles(
  baseDir: string,
  relPrefix: string,
  depth: number,
  maxDepth: number
): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  let entries: Array<{ isFile: () => boolean; isDirectory: () => boolean; name: string }>;
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return results;
  }
  const names: Set<string> = new Set(entries.map((e: { name: string }) => e.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const sub: string = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      results.push(..._collectSourceFiles(path.join(baseDir, entry.name), sub, depth + 1, maxDepth));
    } else if (entry.isFile()) {
      const ext: string = path.extname(entry.name);
      if (!CODE_EXTENSIONS.has(ext)) continue;
      // Skip JS files that have a matching TS file
      if (ext === '.js' && names.has(entry.name.replace(/\.js$/, '.ts'))) continue;
      if (ext === '.jsx' && names.has(entry.name.replace(/\.jsx$/, '.tsx'))) continue;
      const rel: string = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      const content: string | null = safeReadFile(path.join(baseDir, entry.name));
      const lineCount: number = content ? content.split('\n').length : 0;
      results.push(`${rel} (${lineCount}L)`);
    }
  }
  return results;
}

/**
 * Build a compact file tree with line counts for Claude-powered discovery.
 * Dynamically scans the project's actual directories (max 2 levels deep).
 */
function buildCodebaseDigest(cwd: string): string {
  const files: string[] = _collectSourceFiles(cwd, '', 0, 2);
  files.sort();
  return files.join('\n');
}

/**
 * Build the discovery prompt with a file tree and optional exclusions.
 */
function buildDiscoveryPrompt(cwd: string, completedTitles?: string[]): string {
  const tree: string = buildCodebaseDigest(cwd);

  const exclusionBlock: string = completedTitles && completedTitles.length > 0
    ? `\nDo NOT rediscover these already-completed items:\n${completedTitles.map((t) => `- ${t}`).join('\n')}\n`
    : '';

  return `Analyze this codebase for improvement opportunities. Read the source files you need. Here is the file tree:

${tree}
${exclusionBlock}
Output ONLY a JSON array. Each item:
{"dimension":"<dim>","slug":"<kebab-id>","title":"<short>","description":"<what+why, include file:line>","effort":"small|medium|large"}

Dimensions: productivity, quality, usability, consistency, stability, improve-features, new-features, product-ideation

Rules:
- Read source files to find real issues
- Be specific: file paths and line numbers
- Actionable improvements only
- Focus on real code changes: new features, bug fixes, refactors, tests — NOT documentation stubs or markdown files
- Do NOT suggest adding JSDoc, fixing error messages, cleaning up process.exit, splitting long functions, or adding agent init workflows — these are already done
- 30-80 items
- ONLY the JSON array, no other text`;
}

// ─── Claude-Powered Discovery ───────────────────────────────────────────────

/**
 * Discover code-quality improvement opportunities by running Claude as a subprocess.
 * (Renamed from discoverWithClaude -- handles the code-quality dimension only.)
 */
async function _discoverCodeQualityWithClaude(cwd: string, completedTitles?: string[]): Promise<WorkItem[]> {
  try {
    const prompt: string = buildDiscoveryPrompt(cwd, completedTitles);
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
 * Discover ALL improvement opportunities: code-quality AND product ideation.
 * Runs both discovery pathways in parallel and merges the results.
 */
async function discoverWithClaude(cwd: string, completedTitles?: string[]): Promise<WorkItem[]> {
  // Run both discovery pathways in parallel.
  // IMPORTANT: Wrap discoverProductIdeationItems in .catch so an unexpected
  // throw (as opposed to the graceful empty-array return it already does
  // internally) cannot reject the Promise.all and crash the whole pipeline.
  const [codeQualityItems, productIdeationItems] = await Promise.all([
    _discoverCodeQualityWithClaude(cwd, completedTitles),
    discoverProductIdeationItems(cwd).catch(() => [] as WorkItem[]),
  ]);

  // Merge: product ideation items come first (they have higher dimension weight)
  return [...productIdeationItems, ...codeQualityItems];
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
  // Extract completed titles from history to prevent rediscovery
  const stateAsLegacy = previousState as EvolveState | null;
  const stateAsGroup = previousState as EvolveGroupState | null;
  const completedTitles: string[] = stateAsGroup?.completed_groups
    ? stateAsGroup.completed_groups.flatMap((g) => g.items.map((i: WorkItem) => i.title))
    : [];

  const freshItems: WorkItem[] = await discoverWithClaude(cwd, completedTitles);
  const allItemsCount: number = freshItems.length;

  let mergePool: WorkItem[] = freshItems;

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

  // Filter out items belonging to saturated themes (100% false-positive for 5+ iterations)
  const preFilterCount: number = mergePool.length;
  mergePool = mergePool.filter((item) => {
    for (const { pattern, theme } of THEME_PATTERNS) {
      if (pattern.test(item.slug) && SATURATED_THEMES.has(theme)) {
        return false;
      }
    }
    return true;
  });
  if (mergePool.length < preFilterCount) {
    process.stderr.write(
      `[evolve] Filtered ${preFilterCount - mergePool.length} items from saturated themes\n`
    );
  }

  // Deduplicate against completed groups from history
  if (previousState && stateAsGroup?.completed_groups) {
    const completedIds = new Set<string>(
      stateAsGroup.completed_groups.flatMap((g) => g.items.map((i: WorkItem) => i.id))
    );
    if (completedIds.size > 0) {
      const beforeDedup: number = mergePool.length;
      mergePool = mergePool.filter((item) => !completedIds.has(item.id));
      if (mergePool.length < beforeDedup) {
        process.stderr.write(
          `[evolve] Deduped ${beforeDedup - mergePool.length} items already completed in prior iterations\n`
        );
      }
    }
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
  discoverImproveFeatureItems: require('./_dimensions-features').discoverImproveFeatureItems,
  analyzeCodebaseForItems: require('./_dimensions').analyzeCodebaseForItems,
  // Framework functions
  buildCodebaseDigest,
  buildDiscoveryPrompt,
  discoverWithClaude,
  parseDiscoveryOutput,
  // Orchestrators
  runDiscovery,
  runGroupDiscovery,
};
