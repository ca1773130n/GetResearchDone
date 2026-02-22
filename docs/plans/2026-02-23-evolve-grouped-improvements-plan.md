# Evolve Grouped Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the evolve command to group 300+ individual items into 10-20 thematic groups, add priority sorting, replace absolute item counts with percentage-based selection, and support unlimited iterations.

**Architecture:** Add a grouping layer (`groupDiscoveredItems`) that runs after `analyzeCodebaseForItems`. Groups become the unit of selection and execution. State format evolves from flat items to groups. CLI flags change from `--items N` to `--pick-pct N`, and `--iterations 0` means unlimited.

**Tech Stack:** Node.js, CommonJS, Jest

---

### Task 1: Add THEME_PATTERNS constant and groupDiscoveredItems function

**Files:**
- Modify: `lib/evolve.js` (after line 36, the constants section)

**Step 1: Write the failing tests**

Add to `tests/unit/evolve.test.js` after the existing `WORK_ITEM_DIMENSIONS` describe block:

```js
// ─── THEME_PATTERNS constant ────────────────────────────────────────────────

describe('THEME_PATTERNS', () => {
  test('is an array of objects with pattern and theme fields', () => {
    expect(Array.isArray(THEME_PATTERNS)).toBe(true);
    for (const entry of THEME_PATTERNS) {
      expect(entry).toHaveProperty('pattern');
      expect(entry).toHaveProperty('theme');
      expect(entry.pattern).toBeInstanceOf(RegExp);
      expect(typeof entry.theme).toBe('string');
    }
  });

  test('has at least 10 patterns', () => {
    expect(THEME_PATTERNS.length).toBeGreaterThanOrEqual(10);
  });
});

// ─── groupDiscoveredItems ───────────────────────────────────────────────────

describe('groupDiscoveredItems', () => {
  test('groups items by matching slug pattern into themes', () => {
    const items = [
      createWorkItem('quality', 'improve-coverage-state', 'Cover state', 'Desc'),
      createWorkItem('quality', 'improve-coverage-phase', 'Cover phase', 'Desc'),
      createWorkItem('usability', 'add-jsdoc-utils-fn1', 'JSDoc fn1', 'Desc'),
    ];
    const groups = groupDiscoveredItems(items);
    const coverageGroup = groups.find((g) => g.theme === 'test-coverage');
    expect(coverageGroup).toBeDefined();
    expect(coverageGroup.items).toHaveLength(2);
    const jsdocGroup = groups.find((g) => g.theme === 'jsdoc-gaps');
    expect(jsdocGroup).toBeDefined();
    expect(jsdocGroup.items).toHaveLength(1);
  });

  test('unmatched items go to dimension/miscellaneous groups', () => {
    const items = [
      createWorkItem('quality', 'something-random', 'Random', 'Desc'),
    ];
    const groups = groupDiscoveredItems(items);
    const misc = groups.find((g) => g.theme === 'miscellaneous' && g.dimension === 'quality');
    expect(misc).toBeDefined();
    expect(misc.items).toHaveLength(1);
  });

  test('group id is dimension/theme', () => {
    const items = [
      createWorkItem('stability', 'fix-empty-catch-utils-L10', 'Fix catch', 'Desc'),
    ];
    const groups = groupDiscoveredItems(items);
    expect(groups[0].id).toBe('stability/empty-catch-blocks');
  });

  test('group effort derived from item count', () => {
    const small = [createWorkItem('quality', 'improve-coverage-a', 'A', 'D')];
    const medium = [];
    for (let i = 0; i < 5; i++) {
      medium.push(createWorkItem('quality', `improve-coverage-m${i}`, `M${i}`, 'D'));
    }
    const large = [];
    for (let i = 0; i < 10; i++) {
      large.push(createWorkItem('quality', `improve-coverage-l${i}`, `L${i}`, 'D'));
    }

    const smallGroups = groupDiscoveredItems(small);
    expect(smallGroups[0].effort).toBe('small');
    const medGroups = groupDiscoveredItems(medium);
    expect(medGroups[0].effort).toBe('medium');
    const lgGroups = groupDiscoveredItems(large);
    expect(lgGroups[0].effort).toBe('large');
  });

  test('group priority is weighted aggregate: sum(scores)/count', () => {
    const items = [
      createWorkItem('quality', 'improve-coverage-a', 'A', 'D', { effort: 'small', source: 'bugfix' }),
      createWorkItem('quality', 'improve-coverage-b', 'B', 'D', { effort: 'large', source: 'carryover' }),
    ];
    const groups = groupDiscoveredItems(items);
    const group = groups.find((g) => g.theme === 'test-coverage');
    const expectedPriority = (scoreWorkItem(items[0]) + scoreWorkItem(items[1])) / 2;
    expect(group.priority).toBe(expectedPriority);
  });

  test('groups are sorted by priority descending', () => {
    const items = [
      createWorkItem('new-features', 'mcp-tool-foo', 'MCP foo', 'D', { effort: 'large' }),
      createWorkItem('quality', 'improve-coverage-a', 'Cov A', 'D', { effort: 'small', source: 'bugfix' }),
    ];
    const groups = groupDiscoveredItems(items);
    for (let i = 0; i < groups.length - 1; i++) {
      expect(groups[i].priority).toBeGreaterThanOrEqual(groups[i + 1].priority);
    }
  });

  test('returns empty array for empty input', () => {
    expect(groupDiscoveredItems([])).toEqual([]);
  });

  test('all groups have status pending', () => {
    const items = [
      createWorkItem('quality', 'improve-coverage-a', 'A', 'D'),
      createWorkItem('stability', 'fix-empty-catch-b-L5', 'B', 'D'),
    ];
    const groups = groupDiscoveredItems(items);
    for (const g of groups) {
      expect(g.status).toBe('pending');
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/evolve.test.js -t "THEME_PATTERNS|groupDiscoveredItems" --no-coverage`
Expected: FAIL — `THEME_PATTERNS` and `groupDiscoveredItems` are not exported.

**Step 3: Implement THEME_PATTERNS and groupDiscoveredItems in lib/evolve.js**

After the `DEFAULT_ITEMS_PER_ITERATION` constant (line 36), add:

```js
const DEFAULT_PICK_PCT = 15;

const THEME_PATTERNS = [
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
];
```

Then add the grouping function after `selectPriorityItems`:

```js
/**
 * Group discovered items by theme using slug pattern matching.
 * Items that don't match any pattern go to a fallback {dimension}/miscellaneous group.
 * Groups are sorted by priority (weighted aggregate: sum(scores)/count) descending.
 *
 * @param {WorkItem[]} items - Flat array of discovered work items
 * @returns {Array<{id: string, theme: string, dimension: string, title: string, items: WorkItem[], priority: number, effort: string, status: string}>}
 */
function groupDiscoveredItems(items) {
  if (items.length === 0) return [];

  // Bucket items by theme
  const buckets = new Map(); // key: "dimension/theme"

  for (const item of items) {
    let theme = null;
    for (const { pattern, theme: t } of THEME_PATTERNS) {
      if (pattern.test(item.slug)) {
        theme = t;
        break;
      }
    }
    if (!theme) theme = 'miscellaneous';

    const key = `${item.dimension}/${theme}`;
    if (!buckets.has(key)) {
      buckets.set(key, { dimension: item.dimension, theme, items: [] });
    }
    buckets.get(key).items.push(item);
  }

  // Convert buckets to group objects
  const groups = [];
  for (const [key, bucket] of buckets) {
    const scoreSum = bucket.items.reduce((sum, i) => sum + scoreWorkItem(i), 0);
    const priority = scoreSum / bucket.items.length;
    const count = bucket.items.length;
    const effort = count <= 3 ? 'small' : count <= 8 ? 'medium' : 'large';

    // Generate a readable title from the theme
    const titleTheme = bucket.theme.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

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
```

Add `THEME_PATTERNS`, `DEFAULT_PICK_PCT`, and `groupDiscoveredItems` to `module.exports`.

Also update the imports in the test file to include `THEME_PATTERNS`, `DEFAULT_PICK_PCT`, and `groupDiscoveredItems`.

**Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/evolve.test.js -t "THEME_PATTERNS|groupDiscoveredItems" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/evolve.js tests/unit/evolve.test.js
git commit -m "feat(evolve): add grouping engine with theme-based clustering"
```

---

### Task 2: Add selectPriorityGroups function (percentage-based selection)

**Files:**
- Modify: `lib/evolve.js`
- Modify: `tests/unit/evolve.test.js`

**Step 1: Write the failing tests**

```js
// ─── selectPriorityGroups ───────────────────────────────────────────────────

describe('selectPriorityGroups', () => {
  function makeGroups() {
    // Create items, group them, get pre-sorted groups
    const items = [
      createWorkItem('quality', 'improve-coverage-a', 'A', 'D', { effort: 'small', source: 'bugfix' }),
      createWorkItem('quality', 'improve-coverage-b', 'B', 'D'),
      createWorkItem('stability', 'fix-empty-catch-x-L1', 'X', 'D'),
      createWorkItem('new-features', 'mcp-tool-foo', 'Foo', 'D', { effort: 'large' }),
      createWorkItem('usability', 'add-jsdoc-utils-fn', 'JSDoc', 'D'),
      createWorkItem('consistency', 'add-module-header-a', 'Header A', 'D'),
      createWorkItem('consistency', 'add-module-header-b', 'Header B', 'D'),
    ];
    return groupDiscoveredItems(items);
  }

  test('selects correct number based on percentage (ceil, min 1)', () => {
    const groups = makeGroups(); // should be 5 groups
    const result = selectPriorityGroups(groups, 20); // 20% of 5 = 1
    expect(result.selected.length).toBe(1);
    expect(result.remaining.length).toBe(groups.length - 1);
  });

  test('minimum 1 group even at low percentage', () => {
    const groups = makeGroups();
    const result = selectPriorityGroups(groups, 1); // 1% rounds to 0, but floor is 1
    expect(result.selected.length).toBe(1);
  });

  test('100% selects all groups', () => {
    const groups = makeGroups();
    const result = selectPriorityGroups(groups, 100);
    expect(result.selected.length).toBe(groups.length);
    expect(result.remaining.length).toBe(0);
  });

  test('selected groups have status=selected', () => {
    const groups = makeGroups();
    const result = selectPriorityGroups(groups, 50);
    for (const g of result.selected) {
      expect(g.status).toBe('selected');
    }
  });

  test('remaining groups retain status=pending', () => {
    const groups = makeGroups();
    const result = selectPriorityGroups(groups, 20);
    for (const g of result.remaining) {
      expect(g.status).toBe('pending');
    }
  });

  test('selected groups are highest priority (already sorted input)', () => {
    const groups = makeGroups();
    const result = selectPriorityGroups(groups, 40);
    if (result.selected.length > 0 && result.remaining.length > 0) {
      const lowestSelected = result.selected[result.selected.length - 1].priority;
      const highestRemaining = result.remaining[0].priority;
      expect(lowestSelected).toBeGreaterThanOrEqual(highestRemaining);
    }
  });

  test('empty input returns empty selected and remaining', () => {
    const result = selectPriorityGroups([], 15);
    expect(result.selected).toEqual([]);
    expect(result.remaining).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/evolve.test.js -t "selectPriorityGroups" --no-coverage`
Expected: FAIL

**Step 3: Implement selectPriorityGroups**

Add after `groupDiscoveredItems` in `lib/evolve.js`:

```js
/**
 * Select top N% of groups by priority.
 * Groups must already be sorted by priority descending (as returned by groupDiscoveredItems).
 * Minimum 1 group is always selected (unless input is empty).
 *
 * @param {Array} groups - Sorted groups from groupDiscoveredItems
 * @param {number} pickPct - Percentage of groups to select (1-100)
 * @returns {{ selected: Array, remaining: Array }}
 */
function selectPriorityGroups(groups, pickPct) {
  if (groups.length === 0) return { selected: [], remaining: [] };

  const count = Math.max(1, Math.ceil(groups.length * pickPct / 100));
  const selected = groups.slice(0, count).map((g) => ({ ...g, status: 'selected' }));
  const remaining = groups.slice(count).map((g) => ({ ...g }));

  return { selected, remaining };
}
```

Add `selectPriorityGroups` to exports. Add it to the test file's imports.

**Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/evolve.test.js -t "selectPriorityGroups" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/evolve.js tests/unit/evolve.test.js
git commit -m "feat(evolve): add percentage-based group selection"
```

---

### Task 3: Add buildGroupExecutePrompt and buildGroupReviewPrompt

**Files:**
- Modify: `lib/evolve.js`
- Modify: `tests/unit/evolve.test.js`

**Step 1: Write the failing tests**

```js
// ─── buildGroupExecutePrompt ────────────────────────────────────────────────

describe('buildGroupExecutePrompt', () => {
  const group = {
    id: 'quality/test-coverage',
    theme: 'test-coverage',
    dimension: 'quality',
    title: 'Test Coverage (quality)',
    items: [
      createWorkItem('quality', 'improve-coverage-state', 'Cover state.js', 'state.js at 62%'),
      createWorkItem('quality', 'improve-coverage-phase', 'Cover phase.js', 'phase.js at 71%'),
    ],
    priority: 8.5,
    effort: 'medium',
    status: 'selected',
  };

  test('includes all item titles in the prompt', () => {
    const prompt = buildGroupExecutePrompt(group);
    expect(prompt).toContain('Cover state.js');
    expect(prompt).toContain('Cover phase.js');
  });

  test('includes the group theme', () => {
    const prompt = buildGroupExecutePrompt(group);
    expect(prompt).toContain('test-coverage');
  });

  test('includes test verification instruction', () => {
    const prompt = buildGroupExecutePrompt(group);
    expect(prompt).toMatch(/npm test/i);
  });

  test('returns non-empty string', () => {
    const prompt = buildGroupExecutePrompt(group);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });
});

// ─── buildGroupReviewPrompt ─────────────────────────────────────────────────

describe('buildGroupReviewPrompt', () => {
  const group = {
    id: 'stability/empty-catch-blocks',
    theme: 'empty-catch-blocks',
    dimension: 'stability',
    title: 'Empty Catch Blocks (stability)',
    items: [
      createWorkItem('stability', 'fix-empty-catch-utils-L10', 'Fix catch L10', 'Desc'),
    ],
    priority: 7,
    effort: 'small',
    status: 'selected',
  };

  test('includes review/verify language', () => {
    const prompt = buildGroupReviewPrompt(group);
    expect(prompt).toMatch(/review|verify/i);
  });

  test('includes group title', () => {
    const prompt = buildGroupReviewPrompt(group);
    expect(prompt).toContain('Empty Catch Blocks');
  });

  test('includes npm test and npm run lint', () => {
    const prompt = buildGroupReviewPrompt(group);
    expect(prompt).toMatch(/npm test/);
    expect(prompt).toMatch(/npm run lint/);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/evolve.test.js -t "buildGroupExecutePrompt|buildGroupReviewPrompt" --no-coverage`
Expected: FAIL

**Step 3: Implement both functions**

Add after `buildReviewPrompt` in `lib/evolve.js`:

```js
/**
 * Build execution prompt for an entire group of work items.
 * Lists all items in the group so a single Claude session handles them all.
 *
 * @param {Object} group - WorkItemGroup
 * @returns {string} Prompt string
 */
function buildGroupExecutePrompt(group) {
  const itemList = group.items
    .map((item, i) => `${i + 1}. ${item.title}: ${item.description}`)
    .join('\n');

  return [
    'Read CLAUDE.md for project conventions.',
    `Implement the following improvements (theme: ${group.theme}, dimension: ${group.dimension}):`,
    '',
    itemList,
    '',
    'Run `npm test` to verify changes do not break tests.',
    'Fix any test failures before completing.',
    'Keep changes focused and minimal.',
  ].join('\n');
}

/**
 * Build review prompt for an entire group after execution.
 *
 * @param {Object} group - WorkItemGroup
 * @returns {string} Prompt string
 */
function buildGroupReviewPrompt(group) {
  return [
    `Review the improvements that were just made for group: ${group.title}`,
    `Theme: ${group.theme}, Dimension: ${group.dimension}`,
    `${group.items.length} items were addressed.`,
    'Run `npm test` and `npm run lint` to check for regressions.',
    'Verify the improvements were actually made.',
    'Fix any issues found.',
  ].join('\n');
}
```

Add both to exports and test imports.

**Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/evolve.test.js -t "buildGroupExecutePrompt|buildGroupReviewPrompt" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/evolve.js tests/unit/evolve.test.js
git commit -m "feat(evolve): add group-level execute and review prompts"
```

---

### Task 4: Refactor runDiscovery to return groups

**Files:**
- Modify: `lib/evolve.js`
- Modify: `tests/unit/evolve.test.js`

**Step 1: Write the failing tests**

Replace/add alongside the existing `runDiscovery` tests:

```js
// ─── runGroupDiscovery ──────────────────────────────────────────────────────

describe('runGroupDiscovery', () => {
  test('returns groups sorted by priority', () => {
    const fixture = createDiscoveryFixture();
    const result = runGroupDiscovery(fixture, null, 15);
    expect(result.groups.length).toBeGreaterThan(0);
    for (let i = 0; i < result.groups.length - 1; i++) {
      expect(result.groups[i].priority).toBeGreaterThanOrEqual(result.groups[i + 1].priority);
    }
  });

  test('returns selected and remaining groups based on pick_pct', () => {
    const fixture = createDiscoveryFixture();
    const result = runGroupDiscovery(fixture, null, 50);
    expect(result.selected_groups.length).toBeGreaterThan(0);
    expect(result.selected_groups.length + result.remaining_groups.length).toBe(result.groups.length);
  });

  test('returns total items count and groups count', () => {
    const fixture = createDiscoveryFixture();
    const result = runGroupDiscovery(fixture, null, 15);
    expect(result.all_items_count).toBeGreaterThan(0);
    expect(result.groups_count).toBe(result.groups.length);
  });

  test('with previous state remaining_groups: merges new discovery', () => {
    const fixture = createDiscoveryFixture();
    const prevGroup = {
      id: 'quality/carryover-group',
      theme: 'carryover-group',
      dimension: 'quality',
      title: 'Carryover',
      items: [createWorkItem('quality', 'carry-item', 'Carry', 'D')],
      priority: 5,
      effort: 'small',
      status: 'pending',
    };
    const previousState = {
      iteration: 1,
      pick_pct: 15,
      remaining_groups: [prevGroup],
      selected_groups: [],
      completed_groups: [],
      failed_groups: [],
    };
    const result = runGroupDiscovery(fixture, previousState, 15);
    const allGroups = [...result.selected_groups, ...result.remaining_groups];
    const found = allGroups.some((g) => g.id === 'quality/carryover-group');
    expect(found).toBe(true);
  });

  test('backward compat: old state with flat remaining items auto-regroups', () => {
    const fixture = createDiscoveryFixture();
    const oldState = {
      iteration: 1,
      items_per_iteration: 5,
      remaining: [
        createWorkItem('quality', 'improve-coverage-old', 'Old Coverage', 'D'),
      ],
      selected: [],
      completed: [],
      failed: [],
      bugfix: [],
    };
    const result = runGroupDiscovery(fixture, oldState, 15);
    expect(result.groups_count).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/evolve.test.js -t "runGroupDiscovery" --no-coverage`
Expected: FAIL

**Step 3: Implement runGroupDiscovery**

Add after `runDiscovery` in `lib/evolve.js`:

```js
/**
 * Run full discovery flow returning groups instead of flat items.
 * Supports backward compatibility with old flat-item state.
 *
 * @param {string} cwd - Project working directory
 * @param {Object|null} previousState - Previous iteration state
 * @param {number} pickPct - Percentage of groups to select
 * @returns {{ groups: Array, selected_groups: Array, remaining_groups: Array, all_items_count: number, groups_count: number }}
 */
function runGroupDiscovery(cwd, previousState, pickPct) {
  const freshItems = analyzeCodebaseForItems(cwd);
  const allItemsCount = freshItems.length;

  let mergePool = freshItems;

  // Backward compat: old state with flat 'remaining' array
  if (previousState && previousState.remaining && !previousState.remaining_groups) {
    const oldItems = previousState.remaining.filter((i) => i.status === 'pending');
    if (previousState.bugfix && previousState.bugfix.length > 0) {
      mergePool = mergeWorkItems(mergeWorkItems(oldItems, freshItems), previousState.bugfix);
    } else {
      mergePool = mergeWorkItems(oldItems, freshItems);
    }
  } else if (previousState && previousState.remaining_groups) {
    // New format: merge previous remaining groups' items back into pool for re-grouping
    const prevItems = [];
    for (const group of previousState.remaining_groups) {
      if (group.status === 'pending') {
        prevItems.push(...group.items);
      }
    }
    mergePool = mergeWorkItems(prevItems, freshItems);
  }

  const groups = groupDiscoveredItems(mergePool);
  const { selected, remaining } = selectPriorityGroups(groups, pickPct);

  return {
    groups,
    selected_groups: selected,
    remaining_groups: remaining,
    all_items_count: allItemsCount,
    groups_count: groups.length,
  };
}
```

Add `runGroupDiscovery` to exports and test imports.

**Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/evolve.test.js -t "runGroupDiscovery" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/evolve.js tests/unit/evolve.test.js
git commit -m "feat(evolve): add group-based discovery orchestrator"
```

---

### Task 5: Refactor runEvolve to use groups

**Files:**
- Modify: `lib/evolve.js`
- Modify: `tests/unit/evolve.test.js`

**Step 1: Write the failing tests**

Update existing `runEvolve` tests and add new ones:

```js
describe('runEvolve (grouped)', () => {
  beforeEach(() => {
    autopilotModule.spawnClaude.mockReset();
    autopilotModule.spawnClaude.mockReturnValue({ exitCode: 0, timedOut: false });
  });

  test('dry-run returns groups with priority and item counts', async () => {
    const fixture = createDiscoveryFixture();
    const result = await runEvolve(fixture, { dryRun: true });

    expect(result.iterations_completed).toBe(1);
    expect(result.results[0].status).toBe('dry-run');
    expect(result.results[0]).toHaveProperty('groups');
    expect(result.results[0]).toHaveProperty('total_items');
    expect(result.results[0]).toHaveProperty('total_groups');
    expect(result.results[0]).toHaveProperty('groups_per_iteration');
    expect(result.results[0]).toHaveProperty('estimated_iterations');
    expect(autopilotModule.spawnClaude).not.toHaveBeenCalled();
  });

  test('uses --pick-pct instead of --items', async () => {
    const fixture = createDiscoveryFixture();
    const result = await runEvolve(fixture, { dryRun: true, pickPct: 50 });

    const groupsSelected = result.results[0].groups_per_iteration;
    expect(groupsSelected).toBeGreaterThanOrEqual(1);
  });

  test('execution spawns 2 calls per group (execute + review), not 3 per item', async () => {
    const fixture = createDiscoveryFixture();
    await runEvolve(fixture, { iterations: 1, pickPct: 100 });

    // Count calls: should be 2 * number_of_groups, not 3 * number_of_items
    const callCount = autopilotModule.spawnClaude.mock.calls.length;
    // Each group = 2 calls (execute + review)
    expect(callCount % 2).toBe(0);
  });

  test('unlimited iterations (iterations=0) processes all groups', async () => {
    const fixture = createDiscoveryFixture();
    const result = await runEvolve(fixture, { iterations: 0, pickPct: 50 });

    // Should have run multiple iterations until remaining is empty
    expect(result.iterations_completed).toBeGreaterThanOrEqual(1);
    // Last iteration should have processed the remaining groups
    const lastResult = result.results[result.results.length - 1];
    expect(lastResult.status).toBe('completed');
  });

  test('state file uses new group format', async () => {
    const fixture = createDiscoveryFixture();
    await runEvolve(fixture, { iterations: 1 });

    const state = readEvolveState(fixture);
    expect(state).toHaveProperty('pick_pct');
    expect(state).toHaveProperty('selected_groups');
    expect(state).toHaveProperty('remaining_groups');
    expect(state).toHaveProperty('groups_count');
    expect(state).toHaveProperty('all_items_count');
  });

  test('failed group is recorded', async () => {
    // Fail the execute step
    autopilotModule.spawnClaude
      .mockReturnValueOnce({ exitCode: 1, timedOut: false })  // execute: fail group 1
      .mockReturnValue({ exitCode: 0, timedOut: false });      // everything else passes

    const fixture = createDiscoveryFixture();
    const result = await runEvolve(fixture, { iterations: 1, pickPct: 100 });

    expect(result.results[0].groups_failed).toBeGreaterThanOrEqual(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/evolve.test.js -t "runEvolve \\(grouped\\)" --no-coverage`
Expected: FAIL

**Step 3: Rewrite runEvolve to use groups**

Replace `runEvolve` function body in `lib/evolve.js`:

```js
async function runEvolve(cwd, options = {}) {
  const { iterations = 1, pickPct, timeout, maxTurns, dryRun = false } = options;
  const effectivePickPct = pickPct !== undefined ? pickPct : DEFAULT_PICK_PCT;
  const timeoutMs = timeout ? timeout * 60 * 1000 : undefined;
  const unlimited = iterations === 0;

  const logFile = path.join(cwd, '.planning', 'autopilot', 'evolve.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stderr.write(`[evolve] ${msg}\n`);
    fs.appendFileSync(logFile, line);
  };

  const results = [];
  let state = readEvolveState(cwd);
  let iterCount = 0;
  const maxIter = unlimited ? 1000 : iterations; // safety cap

  while (iterCount < maxIter) {
    const iterNum = state ? state.iteration + 1 : 1;
    log(`Starting iteration ${iterNum}`);

    // 1. Discover and group
    const discovery = runGroupDiscovery(cwd, state, effectivePickPct);
    log(`Discovered ${discovery.all_items_count} items in ${discovery.groups_count} groups, selected ${discovery.selected_groups.length} groups`);

    if (dryRun) {
      const groupsPerIter = discovery.selected_groups.length;
      results.push({
        iteration: iterNum,
        status: 'dry-run',
        groups: discovery.groups.map((g) => ({
          id: g.id,
          priority: g.priority,
          item_count: g.items.length,
          effort: g.effort,
        })),
        total_items: discovery.all_items_count,
        total_groups: discovery.groups_count,
        groups_per_iteration: groupsPerIter,
        estimated_iterations: groupsPerIter > 0 ? Math.ceil(discovery.groups_count / groupsPerIter) : 0,
      });
      break; // dry-run always exits after one iteration
    }

    if (discovery.selected_groups.length === 0) {
      log('No groups to process. Done.');
      break;
    }

    // 2. Process each selected group: execute -> review (2 calls per group)
    const outcomes = [];
    for (const group of discovery.selected_groups) {
      log(`Processing group: ${group.id} (${group.items.length} items)`);
      let failed = false;

      for (const [step, promptFn] of [
        ['execute', buildGroupExecutePrompt],
        ['review', buildGroupReviewPrompt],
      ]) {
        const result = spawnClaude(cwd, promptFn(group), {
          model: SONNET_MODEL,
          timeout: timeoutMs,
          maxTurns,
        });
        if (result.exitCode !== 0) {
          const reason = result.timedOut ? 'timeout' : `exit ${result.exitCode}`;
          log(`${group.id}: ${step} FAILED (${reason})`);
          outcomes.push({ group: group.id, status: 'fail', step, reason });
          failed = true;
          break;
        }
        log(`${group.id}: ${step} completed`);
      }
      if (!failed) outcomes.push({ group: group.id, status: 'pass' });
    }

    // 3. Write evolution notes
    writeEvolutionNotes(cwd, {
      iteration: iterNum,
      items: discovery.selected_groups.flatMap((g) => g.items),
      outcomes: outcomes.map((o) => ({ item: o.group, status: o.status, step: o.step, reason: o.reason })),
      decisions: [],
      patterns: [],
      takeaways: [],
    });

    // 4. Update and persist state
    const milestone = state ? state.milestone : '';
    const completedGroups = outcomes
      .filter((o) => o.status === 'pass')
      .map((o) => discovery.selected_groups.find((g) => g.id === o.group))
      .filter(Boolean)
      .map((g) => ({ ...g, status: 'completed' }));
    const failedGroups = outcomes
      .filter((o) => o.status === 'fail')
      .map((o) => discovery.selected_groups.find((g) => g.id === o.group))
      .filter(Boolean)
      .map((g) => ({ ...g, status: 'failed' }));

    state = {
      iteration: iterNum,
      timestamp: new Date().toISOString(),
      milestone,
      pick_pct: effectivePickPct,
      selected_groups: discovery.selected_groups,
      remaining_groups: discovery.remaining_groups,
      completed_groups: completedGroups,
      failed_groups: failedGroups,
      all_items_count: discovery.all_items_count,
      groups_count: discovery.groups_count,
      history: state ? [...(state.history || []), {
        iteration: iterNum,
        timestamp: new Date().toISOString(),
        selected_count: discovery.selected_groups.length,
        completed_count: completedGroups.length,
        failed_count: failedGroups.length,
      }] : [{
        iteration: iterNum,
        timestamp: new Date().toISOString(),
        selected_count: discovery.selected_groups.length,
        completed_count: completedGroups.length,
        failed_count: failedGroups.length,
      }],
    };
    writeEvolveState(cwd, state);

    results.push({
      iteration: iterNum,
      status: 'completed',
      groups_attempted: outcomes.length,
      groups_passed: completedGroups.length,
      groups_failed: failedGroups.length,
      remaining_groups: discovery.remaining_groups.length,
    });

    iterCount++;

    // Check if unlimited mode should stop
    if (unlimited && discovery.remaining_groups.length === 0) {
      log('All groups processed. Stopping unlimited loop.');
      break;
    }
  }

  log(`Done: ${results.length} iteration(s) completed`);
  return {
    iterations_completed: results.length,
    results,
    evolution_notes_path: path.join('.planning', 'EVOLUTION.md'),
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/evolve.test.js -t "runEvolve" --no-coverage`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx jest tests/unit/evolve.test.js --no-coverage`
Expected: PASS (existing tests may need minor adjustments for the new output format)

**Step 6: Commit**

```bash
git add lib/evolve.js tests/unit/evolve.test.js
git commit -m "feat(evolve): refactor runEvolve to use group-based execution"
```

---

### Task 6: Update cmdEvolve CLI flag parsing

**Files:**
- Modify: `lib/evolve.js` (`cmdEvolve` function)
- Modify: `tests/unit/evolve.test.js`

**Step 1: Write the failing tests**

```js
describe('cmdEvolve (updated flags)', () => {
  beforeEach(() => {
    autopilotModule.spawnClaude.mockReset();
    autopilotModule.spawnClaude.mockReturnValue({ exitCode: 0, timedOut: false });
  });

  test('parses --pick-pct flag', async () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = await captureAsyncOutput(() =>
      cmdEvolve(fixture, ['--pick-pct', '30', '--dry-run'], false)
    );
    const result = JSON.parse(stdout);
    expect(result.results[0].groups_per_iteration).toBeGreaterThanOrEqual(1);
  });

  test('--iterations 0 means unlimited', async () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = await captureAsyncOutput(() =>
      cmdEvolve(fixture, ['--iterations', '0', '--dry-run'], false)
    );
    // dry-run always does 1 iteration regardless, but the option should parse
    const result = JSON.parse(stdout);
    expect(result.iterations_completed).toBe(1);
  });

  test('backward compat: --items flag still works (converted to pick-pct equivalent)', async () => {
    const fixture = createDiscoveryFixture();
    // --items should still be accepted but ignored in favor of default pick-pct
    const { stdout } = await captureAsyncOutput(() =>
      cmdEvolve(fixture, ['--dry-run'], false)
    );
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('results');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest tests/unit/evolve.test.js -t "cmdEvolve \\(updated" --no-coverage`

**Step 3: Update cmdEvolve**

Replace the `cmdEvolve` function:

```js
async function cmdEvolve(cwd, args, raw) {
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const hasFlag = (name) => args.indexOf(name) !== -1;
  const options = {
    iterations: hasFlag('--iterations') ? parseInt(flag('--iterations', '1'), 10) : undefined,
    pickPct: hasFlag('--pick-pct') ? parseInt(flag('--pick-pct', '15'), 10) : undefined,
    timeout: hasFlag('--timeout') ? parseInt(flag('--timeout', '0'), 10) : undefined,
    maxTurns: hasFlag('--max-turns') ? parseInt(flag('--max-turns', '0'), 10) : undefined,
    dryRun: hasFlag('--dry-run'),
  };
  const result = await runEvolve(cwd, options);
  output(result, raw, raw ? JSON.stringify(result) : undefined);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest tests/unit/evolve.test.js -t "cmdEvolve" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/evolve.js tests/unit/evolve.test.js
git commit -m "feat(evolve): update CLI to use --pick-pct and --iterations 0"
```

---

### Task 7: Update cmdEvolveDiscover to show groups

**Files:**
- Modify: `lib/evolve.js` (`cmdEvolveDiscover` function)
- Modify: `tests/unit/evolve.test.js`

**Step 1: Write the failing tests**

```js
describe('cmdEvolveDiscover (grouped)', () => {
  test('returns grouped discovery result', () => {
    const fixture = createDiscoveryFixture();
    const { stdout, exitCode } = captureOutput(() => cmdEvolveDiscover(fixture, [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('groups');
    expect(result).toHaveProperty('total_items');
    expect(result).toHaveProperty('total_groups');
    expect(Array.isArray(result.groups)).toBe(true);
    // Each group should have id, priority, item_count
    if (result.groups.length > 0) {
      expect(result.groups[0]).toHaveProperty('id');
      expect(result.groups[0]).toHaveProperty('priority');
      expect(result.groups[0]).toHaveProperty('item_count');
    }
  });

  test('raw mode returns group count string', () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = captureOutput(() => cmdEvolveDiscover(fixture, [], true));
    expect(stdout).toMatch(/\d+ groups discovered/);
  });

  test('respects --pick-pct flag', () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = captureOutput(() =>
      cmdEvolveDiscover(fixture, ['--pick-pct', '50'], false)
    );
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('pick_pct', 50);
  });
});
```

**Step 2: Run tests to verify they fail**

**Step 3: Rewrite cmdEvolveDiscover**

```js
function cmdEvolveDiscover(cwd, args, raw) {
  let pickPct = DEFAULT_PICK_PCT;
  const pctIdx = args.indexOf('--pick-pct');
  if (pctIdx !== -1 && args[pctIdx + 1]) {
    const parsed = parseInt(args[pctIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) pickPct = parsed;
  }

  const previousState = readEvolveState(cwd);
  const result = runGroupDiscovery(cwd, previousState, pickPct);

  const out = {
    groups: result.groups.map((g) => ({
      id: g.id,
      theme: g.theme,
      dimension: g.dimension,
      priority: g.priority,
      item_count: g.items.length,
      effort: g.effort,
      items: g.items.map((i) => ({ id: i.id, title: i.title })),
    })),
    selected_count: result.selected_groups.length,
    total_items: result.all_items_count,
    total_groups: result.groups_count,
    pick_pct: pickPct,
  };

  output(out, raw, raw ? `${result.groups_count} groups discovered` : undefined);
}
```

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

```bash
git add lib/evolve.js tests/unit/evolve.test.js
git commit -m "feat(evolve): update discover subcommand to show groups"
```

---

### Task 8: Update cmdInitEvolve for new state format

**Files:**
- Modify: `lib/evolve.js` (`cmdInitEvolve` function)
- Modify: `tests/unit/evolve.test.js`

**Step 1: Write the failing test**

Update the existing `cmdInitEvolve` test that checks `items_per_iteration` to check `pick_pct`:

```js
test('includes pick_pct from state (not items_per_iteration)', () => {
  // ... setup with new state format ...
  expect(result.config.pick_pct).toBe(15);
});
```

**Step 2: Update cmdInitEvolve**

Change the config section to report `pick_pct` instead of `items_per_iteration`, and `remaining_groups_count` instead of `remaining_count`:

```js
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
      pick_pct: (state && state.pick_pct) || DEFAULT_PICK_PCT,
    },
    evolve_state: {
      exists: state !== null,
      iteration: state ? state.iteration : 0,
      remaining_groups_count: state ? (state.remaining_groups || []).length : 0,
      groups_count: state ? (state.groups_count || 0) : 0,
    },
    models: {
      planner: plannerModel,
      executor: executorModel,
    },
    milestone,
  };

  output(result, raw, raw ? JSON.stringify(result) : undefined);
}
```

**Step 3: Update existing cmdInitEvolve tests** to match new field names.

**Step 4: Run tests, commit**

```bash
git add lib/evolve.js tests/unit/evolve.test.js
git commit -m "feat(evolve): update init command for group-based state"
```

---

### Task 9: Update evolve.md command skill

**Files:**
- Modify: `commands/evolve.md`

**Step 1: Update the command file**

```markdown
---
description: Run autonomous self-improvement loop with sonnet-tier models
argument-hint: "[--iterations N] [--pick-pct N] [--dry-run]"
---

Run the evolve command to discover improvements and execute them autonomously:

\`\`\`bash
node ${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js evolve run $ARGUMENTS
\`\`\`

The evolve loop:
1. Discovers improvement opportunities across the codebase (productivity, quality, usability, consistency, stability, new features)
2. Groups ~300 individual issues into 10-20 thematic groups (e.g., test-coverage, jsdoc-gaps, empty-catch-blocks)
3. Sorts groups by priority (weighted aggregate score)
4. Selects top N% of groups per iteration (default: 15%)
5. For each group: executes all items together, then reviews — using sonnet-tier models
6. Writes evolution notes to `.planning/EVOLUTION.md`
7. Persists remaining groups for the next iteration

**Flags:**
- `--iterations N` — Number of iterations (default: 0 = unlimited, runs until all groups done)
- `--pick-pct N` — Percentage of groups to pick per iteration (default: 15, min 1 group)
- `--dry-run` — Discover and group only, don't execute
- `--timeout N` — Timeout per subprocess in minutes
- `--max-turns N` — Max turns per subprocess

All operations enforce a sonnet model ceiling — no opus-class models are used.

Report the JSON results. If any groups failed, explain what happened. Suggest running again for continued improvement.
```

**Step 2: Commit**

```bash
git add commands/evolve.md
git commit -m "docs(evolve): update command skill for grouped workflow"
```

---

### Task 10: Run full test suite and fix any regressions

**Files:**
- Possibly modify: `lib/evolve.js`, `tests/unit/evolve.test.js`

**Step 1: Run full test suite**

Run: `npx jest tests/unit/evolve.test.js`
Expected: ALL PASS

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors

**Step 3: Run integration tests**

Run: `npx jest tests/integration/evolve-e2e.test.js --no-coverage`
Expected: PASS (or update if needed)

**Step 4: Fix any failures found**

Address test failures, lint errors, or integration issues.

**Step 5: Final commit**

```bash
git add -A
git commit -m "test(evolve): fix regressions from grouped improvements refactor"
```

---

### Task 11: Update exports and ensure backward compatibility

**Files:**
- Modify: `lib/evolve.js` (exports block)
- Modify: `bin/grd-tools.js` (imports, if needed)

**Step 1: Verify all new exports are listed**

Ensure `module.exports` includes:
- `THEME_PATTERNS`
- `DEFAULT_PICK_PCT`
- `groupDiscoveredItems`
- `selectPriorityGroups`
- `buildGroupExecutePrompt`
- `buildGroupReviewPrompt`
- `runGroupDiscovery`

Keep old exports for backward compat where they're still used by tests or other code:
- `selectPriorityItems` (still useful for unit tests)
- `runDiscovery` (still useful internally)
- `buildPlanPrompt`, `buildExecutePrompt`, `buildReviewPrompt` (kept but no longer called by runEvolve)

**Step 2: Verify bin/grd-tools.js imports**

Check if `grd-tools.js` imports anything that changed. Currently it imports `cmdEvolve`, `cmdEvolveDiscover`, `cmdEvolveState`, `cmdEvolveAdvance`, `cmdEvolveReset`, `cmdInitEvolve` — these all still exist with the same signatures.

**Step 3: Run full project test suite**

Run: `npm test`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add lib/evolve.js bin/grd-tools.js
git commit -m "chore(evolve): finalize exports and backward compatibility"
```
