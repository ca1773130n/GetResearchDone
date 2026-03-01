'use strict';

/**
 * GRD Evolve -- Scoring heuristic and group engine
 *
 * Priority scoring, item selection, theme-based grouping,
 * and group priority selection.
 *
 * @dependencies ./types, ./state (constants)
 */

import type { WorkItem, WorkItemEffort, WorkGroup } from './types';

const { DIMENSION_WEIGHTS, EFFORT_MODIFIERS, SOURCE_MODIFIERS, THEME_PATTERNS } =
  require('./state.ts') as {
    DIMENSION_WEIGHTS: Record<string, number>;
    EFFORT_MODIFIERS: Record<string, number>;
    SOURCE_MODIFIERS: Record<string, number>;
    THEME_PATTERNS: Array<{ pattern: RegExp; theme: string }>;
  };

// ─── Scoring Heuristic ──────────────────────────────────────────────────────

/**
 * Compute a priority score for a work item.
 */
function scoreWorkItem(item: WorkItem): number {
  const dimWeight: number = DIMENSION_WEIGHTS[item.dimension] || 0;
  const effortMod: number = EFFORT_MODIFIERS[item.effort] || 0;
  const sourceMod: number = SOURCE_MODIFIERS[item.source] || 0;
  return dimWeight + effortMod + sourceMod;
}

// ─── Priority Selection ─────────────────────────────────────────────────────

/**
 * Select the top N items by priority score from a list of work items.
 */
function selectPriorityItems(
  items: WorkItem[],
  count: number
): { selected: WorkItem[]; remaining: WorkItem[] } {
  // Score and sort (stable sort: items with equal score keep original order)
  const scored: Array<{ item: WorkItem; score: number }> = items.map((item) => ({
    item,
    score: scoreWorkItem(item),
  }));
  scored.sort((a, b) => b.score - a.score);

  const selected: WorkItem[] = [];
  const remaining: WorkItem[] = [];

  for (let i = 0; i < scored.length; i++) {
    if (i < count) {
      selected.push({ ...scored[i].item, status: 'selected' });
    } else {
      remaining.push({ ...scored[i].item });
    }
  }

  return { selected, remaining };
}

// ─── Group Engine ───────────────────────────────────────────────────────────

/**
 * Group discovered items by theme using slug pattern matching.
 * Items that don't match any pattern go to a fallback {dimension}/miscellaneous group.
 */
function groupDiscoveredItems(
  items: WorkItem[],
  dimensionWeights?: Record<string, number>
): WorkGroup[] {
  if (items.length === 0) return [];

  // Merge custom dimension weights with defaults
  const effectiveWeights: Record<string, number> = dimensionWeights
    ? Object.assign({}, DIMENSION_WEIGHTS, dimensionWeights)
    : DIMENSION_WEIGHTS;

  // Bucket items by theme
  const buckets = new Map<
    string,
    { dimension: string; theme: string; items: WorkItem[] }
  >();

  for (const item of items) {
    let theme: string | null = null;
    for (const { pattern, theme: t } of THEME_PATTERNS) {
      if (pattern.test(item.slug)) {
        theme = t;
        break;
      }
    }
    if (!theme) theme = 'miscellaneous';

    const key: string = `${item.dimension}/${theme}`;
    if (!buckets.has(key)) {
      buckets.set(key, { dimension: item.dimension, theme, items: [] });
    }
    buckets.get(key)!.items.push(item);
  }

  // Helper: score with effective weights
  const scoreWithWeights = (item: WorkItem): number => {
    const dimWeight: number = effectiveWeights[item.dimension] || 0;
    const effortMod: number = EFFORT_MODIFIERS[item.effort] || 0;
    const sourceMod: number = SOURCE_MODIFIERS[item.source] || 0;
    return dimWeight + effortMod + sourceMod;
  };

  // Convert buckets to group objects
  const groups: WorkGroup[] = [];
  for (const [key, bucket] of buckets) {
    const scoreSum: number = bucket.items.reduce((sum, i) => sum + scoreWithWeights(i), 0);
    const priority: number = scoreSum / bucket.items.length;
    const count: number = bucket.items.length;
    const effort: WorkItemEffort = count <= 3 ? 'small' : count <= 8 ? 'medium' : 'large';

    // Generate a readable title from the theme
    const titleTheme: string = bucket.theme
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    groups.push({
      id: key,
      theme: bucket.theme,
      dimension: bucket.dimension,
      title: `${titleTheme} (${bucket.dimension})`,
      items: bucket.items,
      priority,
      effort,
      status: 'pending',
    });
  }

  // Sort by priority descending
  groups.sort((a, b) => b.priority - a.priority);

  return groups;
}

/**
 * Select top N% of groups by priority.
 */
function selectPriorityGroups(
  groups: WorkGroup[],
  pickPct: number
): { selected: WorkGroup[]; remaining: WorkGroup[] } {
  if (groups.length === 0) return { selected: [], remaining: [] };

  const count: number = Math.max(1, Math.ceil((groups.length * pickPct) / 100));
  const selected: WorkGroup[] = groups
    .slice(0, count)
    .map((g) => ({ ...g, status: 'selected' }));
  const remaining: WorkGroup[] = groups.slice(count).map((g) => ({ ...g }));

  return { selected, remaining };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  scoreWorkItem,
  selectPriorityItems,
  groupDiscoveredItems,
  selectPriorityGroups,
};
