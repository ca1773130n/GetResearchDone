/**
 * Unit tests for lib/evolve.js
 *
 * Tests the evolve iteration state layer: work item creation, state path
 * resolution, initial state creation, disk I/O (read/write), merge/deduplication,
 * iteration advancement logic, discovery engine, scoring heuristic, and
 * priority selection algorithm.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  EVOLVE_STATE_FILENAME,
  WORK_ITEM_DIMENSIONS,
  DEFAULT_ITEMS_PER_ITERATION,
  createWorkItem,
  evolveStatePath,
  readEvolveState,
  writeEvolveState,
  createInitialState,
  mergeWorkItems,
  advanceIteration,
  analyzeCodebaseForItems,
  scoreWorkItem,
  selectPriorityItems,
  runDiscovery,
} = require('../../lib/evolve');

// ─── Fixture Helpers ────────────────────────────────────────────────────────

let tmpDirs = [];

function createTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-evolve-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  tmpDirs = [];
});

// ─── WORK_ITEM_DIMENSIONS constant ─────────────────────────────────────────

describe('WORK_ITEM_DIMENSIONS', () => {
  test('contains exactly 6 dimensions', () => {
    expect(WORK_ITEM_DIMENSIONS).toHaveLength(6);
  });

  test('all dimensions are lowercase kebab-case strings', () => {
    for (const dim of WORK_ITEM_DIMENSIONS) {
      expect(typeof dim).toBe('string');
      expect(dim).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

// ─── createWorkItem ─────────────────────────────────────────────────────────

describe('createWorkItem', () => {
  test('creates item with correct id format (dimension/slug)', () => {
    const item = createWorkItem('quality', 'fix-linting', 'Fix Linting', 'Fix all lint errors');
    expect(item.id).toBe('quality/fix-linting');
    expect(item.dimension).toBe('quality');
    expect(item.slug).toBe('fix-linting');
  });

  test('applies default values (effort: medium, source: discovery, status: pending)', () => {
    const item = createWorkItem('productivity', 'speed-up', 'Speed Up', 'Improve build speed');
    expect(item.effort).toBe('medium');
    expect(item.source).toBe('discovery');
    expect(item.status).toBe('pending');
    expect(item.iteration_added).toBe(1);
  });

  test('accepts optional overrides (effort: large, source: bugfix)', () => {
    const item = createWorkItem('stability', 'fix-crash', 'Fix Crash', 'Crash on startup', {
      effort: 'large',
      source: 'bugfix',
    });
    expect(item.effort).toBe('large');
    expect(item.source).toBe('bugfix');
  });

  test('throws on invalid dimension', () => {
    expect(() => {
      createWorkItem('invalid-dim', 'slug', 'Title', 'Desc');
    }).toThrow(/Invalid dimension "invalid-dim"/);
  });

  test('handles iteration_added override', () => {
    const item = createWorkItem('usability', 'improve-ui', 'Improve UI', 'Better UX', {
      iteration_added: 3,
    });
    expect(item.iteration_added).toBe(3);
  });
});

// ─── evolveStatePath ────────────────────────────────────────────────────────

describe('evolveStatePath', () => {
  test('returns correct path under .planning/', () => {
    const result = evolveStatePath('/my/project');
    expect(result).toBe(path.join('/my/project', '.planning', 'EVOLVE-STATE.json'));
  });

  test('path ends with EVOLVE-STATE.json', () => {
    const result = evolveStatePath('/any/dir');
    expect(path.basename(result)).toBe(EVOLVE_STATE_FILENAME);
  });
});

// ─── createInitialState ─────────────────────────────────────────────────────

describe('createInitialState', () => {
  test('returns state with iteration=1', () => {
    const state = createInitialState('v0.2.8', 5);
    expect(state.iteration).toBe(1);
  });

  test('contains all required fields', () => {
    const state = createInitialState('v1.0', 3);
    expect(state).toHaveProperty('selected');
    expect(state).toHaveProperty('remaining');
    expect(state).toHaveProperty('bugfix');
    expect(state).toHaveProperty('completed');
    expect(state).toHaveProperty('failed');
    expect(state).toHaveProperty('history');
    expect(state).toHaveProperty('timestamp');
    expect(state).toHaveProperty('iteration');
    expect(Array.isArray(state.selected)).toBe(true);
    expect(Array.isArray(state.remaining)).toBe(true);
    expect(Array.isArray(state.bugfix)).toBe(true);
    expect(Array.isArray(state.completed)).toBe(true);
    expect(Array.isArray(state.failed)).toBe(true);
    expect(Array.isArray(state.history)).toBe(true);
  });

  test('sets milestone and items_per_iteration from arguments', () => {
    const state = createInitialState('v0.2.8', 10);
    expect(state.milestone).toBe('v0.2.8');
    expect(state.items_per_iteration).toBe(10);
  });

  test('uses DEFAULT_ITEMS_PER_ITERATION when itemsPerIteration is omitted', () => {
    const state = createInitialState('v1.0');
    expect(state.items_per_iteration).toBe(DEFAULT_ITEMS_PER_ITERATION);
  });
});

// ─── readEvolveState / writeEvolveState ─────────────────────────────────────

describe('readEvolveState / writeEvolveState', () => {
  test('write then read round-trips correctly', () => {
    const tmpDir = createTmpDir();
    const state = createInitialState('v1.0', 5);
    state.selected = [createWorkItem('quality', 'test-item', 'Test Item', 'A test item')];

    writeEvolveState(tmpDir, state);
    const loaded = readEvolveState(tmpDir);

    expect(loaded).not.toBeNull();
    expect(loaded.iteration).toBe(state.iteration);
    expect(loaded.milestone).toBe(state.milestone);
    expect(loaded.selected).toHaveLength(1);
    expect(loaded.selected[0].id).toBe('quality/test-item');
  });

  test('read returns null when file does not exist', () => {
    const tmpDir = createTmpDir();
    const result = readEvolveState(tmpDir);
    expect(result).toBeNull();
  });

  test('read returns null on malformed JSON', () => {
    const tmpDir = createTmpDir();
    const filePath = evolveStatePath(tmpDir);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{ broken json !!!');

    const result = readEvolveState(tmpDir);
    expect(result).toBeNull();
  });

  test('write creates parent directory if missing', () => {
    const tmpDir = createTmpDir();
    const planningDir = path.join(tmpDir, '.planning');
    // Ensure .planning/ does NOT exist
    expect(fs.existsSync(planningDir)).toBe(false);

    const state = createInitialState('v1.0', 5);
    writeEvolveState(tmpDir, state);

    expect(fs.existsSync(planningDir)).toBe(true);
    expect(fs.existsSync(evolveStatePath(tmpDir))).toBe(true);
  });

  test('written file is valid JSON with 2-space indent', () => {
    const tmpDir = createTmpDir();
    const state = createInitialState('v1.0', 5);
    writeEvolveState(tmpDir, state);

    const raw = fs.readFileSync(evolveStatePath(tmpDir), 'utf-8');
    // Should parse as valid JSON
    const parsed = JSON.parse(raw);
    expect(parsed.iteration).toBe(1);

    // Verify 2-space indentation by checking the raw content
    // JSON.stringify with 2-space indent produces lines like '  "key": value'
    const lines = raw.trim().split('\n');
    // Second line should start with 2 spaces (not 4, not tabs)
    expect(lines[1]).toMatch(/^ {2}"/);
  });
});

// ─── mergeWorkItems ─────────────────────────────────────────────────────────

describe('mergeWorkItems', () => {
  test('empty arrays merge to empty', () => {
    const result = mergeWorkItems([], []);
    expect(result).toEqual([]);
  });

  test('non-overlapping items concatenate', () => {
    const a = [createWorkItem('quality', 'item-a', 'A', 'Desc A')];
    const b = [createWorkItem('stability', 'item-b', 'B', 'Desc B')];
    const result = mergeWorkItems(a, b);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('quality/item-a');
    expect(result[1].id).toBe('stability/item-b');
  });

  test('duplicate ids deduplicate (existing wins)', () => {
    const existing = [
      createWorkItem('quality', 'shared-slug', 'Existing Title', 'Existing desc'),
    ];
    const discovered = [
      createWorkItem('quality', 'shared-slug', 'New Title', 'New desc'),
    ];
    const result = mergeWorkItems(existing, discovered);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Existing Title');
  });

  test('mixed overlap/non-overlap works correctly', () => {
    const existing = [
      createWorkItem('quality', 'shared', 'Shared Existing', 'Desc'),
      createWorkItem('quality', 'only-existing', 'Only Existing', 'Desc'),
    ];
    const discovered = [
      createWorkItem('quality', 'shared', 'Shared Discovered', 'Desc'),
      createWorkItem('stability', 'only-discovered', 'Only Discovered', 'Desc'),
    ];
    const result = mergeWorkItems(existing, discovered);
    expect(result).toHaveLength(3);
    // Existing wins for shared id
    expect(result.find((i) => i.id === 'quality/shared').title).toBe('Shared Existing');
    // Non-overlapping items both present
    expect(result.find((i) => i.id === 'quality/only-existing')).toBeDefined();
    expect(result.find((i) => i.id === 'stability/only-discovered')).toBeDefined();
  });

  test('preserves all fields on surviving items', () => {
    const item = createWorkItem('usability', 'full-fields', 'Full', 'Full desc', {
      effort: 'large',
      source: 'bugfix',
      status: 'selected',
      iteration_added: 2,
    });
    const result = mergeWorkItems([item], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(item);
  });
});

// ─── advanceIteration ───────────────────────────────────────────────────────

describe('advanceIteration', () => {
  function buildPreviousState() {
    const state = createInitialState('v1.0', 5);
    state.selected = [
      createWorkItem('quality', 'sel-1', 'Selected 1', 'Desc', { status: 'selected' }),
    ];
    state.remaining = [
      createWorkItem('productivity', 'rem-1', 'Remaining 1', 'Desc', { status: 'pending' }),
      createWorkItem('stability', 'rem-done', 'Remaining Done', 'Desc', { status: 'completed' }),
    ];
    state.bugfix = [
      createWorkItem('quality', 'bug-1', 'Bug 1', 'Desc', { source: 'bugfix' }),
    ];
    state.completed = [
      createWorkItem('usability', 'comp-1', 'Completed 1', 'Desc', { status: 'completed' }),
    ];
    state.failed = [
      createWorkItem('consistency', 'fail-1', 'Failed 1', 'Desc', { status: 'failed' }),
    ];
    return state;
  }

  test('increments iteration counter', () => {
    const prev = buildPreviousState();
    const next = advanceIteration(prev);
    expect(next.iteration).toBe(prev.iteration + 1);
  });

  test('carries over remaining items with pending status', () => {
    const prev = buildPreviousState();
    const next = advanceIteration(prev);
    // Only the pending remaining item should carry over (not the completed one)
    const remainingIds = next.remaining.map((i) => i.id);
    expect(remainingIds).toContain('productivity/rem-1');
    expect(remainingIds).not.toContain('stability/rem-done');
  });

  test('merges bugfix items into remaining', () => {
    const prev = buildPreviousState();
    const next = advanceIteration(prev);
    const remainingIds = next.remaining.map((i) => i.id);
    expect(remainingIds).toContain('quality/bug-1');
  });

  test('appends history entry with previous iteration summary', () => {
    const prev = buildPreviousState();
    const next = advanceIteration(prev);
    expect(next.history).toHaveLength(1);
    const entry = next.history[0];
    expect(entry.iteration).toBe(1);
    expect(entry.selected_count).toBe(1);
    expect(entry.completed_count).toBe(1);
    expect(entry.failed_count).toBe(1);
    expect(entry.timestamp).toBe(prev.timestamp);
  });

  test('resets selected/completed/failed to empty arrays', () => {
    const prev = buildPreviousState();
    const next = advanceIteration(prev);
    expect(next.selected).toEqual([]);
    expect(next.completed).toEqual([]);
    expect(next.failed).toEqual([]);
    expect(next.bugfix).toEqual([]);
  });
});

// ─── Discovery Engine ──────────────────────────────────────────────────────

/**
 * Create a fixture directory with controlled lib/ files for deterministic
 * discovery testing.
 */
function createDiscoveryFixture() {
  const tmpDir = createTmpDir();

  // Create lib/ directory
  const libDir = path.join(tmpDir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });

  // File with a TODO comment (quality discovery)
  fs.writeFileSync(
    path.join(libDir, 'alpha.js'),
    [
      "'use strict';",
      '/**',
      ' * Alpha module',
      ' */',
      '',
      '// TODO: refactor this function',
      'function doSomething() {',
      '  return 42;',
      '}',
      '',
      'module.exports = { doSomething };',
      '',
    ].join('\n')
  );

  // File without JSDoc on exported function (usability discovery)
  fs.writeFileSync(
    path.join(libDir, 'beta.js'),
    [
      "'use strict';",
      '/**',
      ' * Beta module',
      ' */',
      '',
      'function helperNoDoc(x) {',
      '  return x * 2;',
      '}',
      '',
      'module.exports = { helperNoDoc };',
      '',
    ].join('\n')
  );

  // File with an empty catch block (stability discovery)
  fs.writeFileSync(
    path.join(libDir, 'gamma.js'),
    [
      "'use strict';",
      '/**',
      ' * Gamma module',
      ' */',
      '',
      '/**',
      ' * Safely parse JSON',
      ' * @param {string} str - JSON string',
      ' * @returns {Object|null}',
      ' */',
      'function safeParse(str) {',
      '  try {',
      '    return JSON.parse(str);',
      '  } catch {}',
      '}',
      '',
      'module.exports = { safeParse };',
      '',
    ].join('\n')
  );

  // File with process.exit (consistency discovery)
  fs.writeFileSync(
    path.join(libDir, 'delta.js'),
    [
      "'use strict';",
      '/**',
      ' * Delta module',
      ' */',
      '',
      '/**',
      ' * Fatal error handler',
      ' * @param {string} msg - Error message',
      ' */',
      'function fatal(msg) {',
      '  console.error(msg);',
      '  process.exit(1);',
      '}',
      '',
      'module.exports = { fatal };',
      '',
    ].join('\n')
  );

  // Create tests/unit/ with only one test (for alpha, missing for beta/gamma/delta)
  const testDir = path.join(tmpDir, 'tests', 'unit');
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDir, 'alpha.test.js'),
    "test('placeholder', () => { expect(1).toBe(1); });\n"
  );

  return tmpDir;
}

describe('analyzeCodebaseForItems', () => {
  test('returns array of work items (not empty on project with lib/ files)', () => {
    const fixture = createDiscoveryFixture();
    const items = analyzeCodebaseForItems(fixture);
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  test('each item has required fields', () => {
    const fixture = createDiscoveryFixture();
    const items = analyzeCodebaseForItems(fixture);

    for (const item of items) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('dimension');
      expect(item).toHaveProperty('slug');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('effort');
      expect(item).toHaveProperty('source');
      expect(item).toHaveProperty('status');
    }
  });

  test('items span multiple dimensions', () => {
    const fixture = createDiscoveryFixture();
    const items = analyzeCodebaseForItems(fixture);
    const dimensions = new Set(items.map((i) => i.dimension));
    expect(dimensions.size).toBeGreaterThanOrEqual(2);
  });

  test('returns empty array for cwd with no lib/ directory', () => {
    const emptyDir = createTmpDir();
    const items = analyzeCodebaseForItems(emptyDir);
    expect(Array.isArray(items)).toBe(true);
    expect(items).toHaveLength(0);
  });

  test('all returned item dimensions are valid', () => {
    const fixture = createDiscoveryFixture();
    const items = analyzeCodebaseForItems(fixture);
    for (const item of items) {
      expect(WORK_ITEM_DIMENSIONS).toContain(item.dimension);
    }
  });
});

// ─── scoreWorkItem ──────────────────────────────────────────────────────────

describe('scoreWorkItem', () => {
  test('quality dimension scores higher than new-features dimension', () => {
    const qualityItem = createWorkItem('quality', 'q', 'Q', 'Q');
    const newFeatItem = createWorkItem('new-features', 'n', 'N', 'N');
    expect(scoreWorkItem(qualityItem)).toBeGreaterThan(scoreWorkItem(newFeatItem));
  });

  test('small effort scores higher than large effort (same dimension)', () => {
    const small = createWorkItem('quality', 's', 'S', 'S', { effort: 'small' });
    const large = createWorkItem('quality', 'l', 'L', 'L', { effort: 'large' });
    expect(scoreWorkItem(small)).toBeGreaterThan(scoreWorkItem(large));
  });

  test('bugfix source scores higher than discovery source (same dimension, same effort)', () => {
    const bugfix = createWorkItem('quality', 'b', 'B', 'B', { source: 'bugfix' });
    const discovery = createWorkItem('quality', 'd', 'D', 'D', { source: 'discovery' });
    expect(scoreWorkItem(bugfix)).toBeGreaterThan(scoreWorkItem(discovery));
  });

  test('score is always a positive number', () => {
    for (const dim of WORK_ITEM_DIMENSIONS) {
      for (const effort of ['small', 'medium', 'large']) {
        for (const source of ['bugfix', 'discovery', 'carryover']) {
          const item = createWorkItem(dim, 'test', 'T', 'T', { effort, source });
          const score = scoreWorkItem(item);
          expect(typeof score).toBe('number');
          expect(score).toBeGreaterThan(0);
        }
      }
    }
  });

  test('consistent scoring: same item always produces same score', () => {
    const item = createWorkItem('stability', 'consistent', 'C', 'C', {
      effort: 'medium',
      source: 'discovery',
    });
    const score1 = scoreWorkItem(item);
    const score2 = scoreWorkItem(item);
    const score3 = scoreWorkItem(item);
    expect(score1).toBe(score2);
    expect(score2).toBe(score3);
  });
});

// ─── selectPriorityItems ────────────────────────────────────────────────────

describe('selectPriorityItems', () => {
  function makeItems() {
    return [
      createWorkItem('new-features', 'low', 'Low', 'Low priority', { effort: 'large', source: 'carryover' }),
      createWorkItem('quality', 'high', 'High', 'High priority', { effort: 'small', source: 'bugfix' }),
      createWorkItem('productivity', 'mid', 'Mid', 'Mid priority', { effort: 'medium', source: 'discovery' }),
      createWorkItem('stability', 'med-high', 'MedHigh', 'MedHigh priority', { effort: 'medium', source: 'discovery' }),
    ];
  }

  test('selects exactly N items when N <= total', () => {
    const items = makeItems();
    const result = selectPriorityItems(items, 2);
    expect(result.selected).toHaveLength(2);
    expect(result.remaining).toHaveLength(2);
  });

  test('selects all items when N > total', () => {
    const items = makeItems();
    const result = selectPriorityItems(items, 10);
    expect(result.selected).toHaveLength(4);
    expect(result.remaining).toHaveLength(0);
  });

  test('selected items have status=selected', () => {
    const items = makeItems();
    const result = selectPriorityItems(items, 2);
    for (const item of result.selected) {
      expect(item.status).toBe('selected');
    }
  });

  test('remaining items retain original status', () => {
    const items = makeItems();
    const result = selectPriorityItems(items, 2);
    for (const item of result.remaining) {
      expect(item.status).toBe('pending');
    }
  });

  test('items are sorted by score descending (first selected has highest score)', () => {
    const items = makeItems();
    const result = selectPriorityItems(items, 4);
    for (let i = 0; i < result.selected.length - 1; i++) {
      const scoreA = scoreWorkItem(result.selected[i]);
      const scoreB = scoreWorkItem(result.selected[i + 1]);
      expect(scoreA).toBeGreaterThanOrEqual(scoreB);
    }
  });
});

// ─── runDiscovery ───────────────────────────────────────────────────────────

describe('runDiscovery', () => {
  test('without previous state: discovers fresh items and selects top N', () => {
    const fixture = createDiscoveryFixture();
    const result = runDiscovery(fixture, null);
    expect(result.all_discovered_count).toBeGreaterThan(0);
    expect(result.selected.length).toBeLessThanOrEqual(DEFAULT_ITEMS_PER_ITERATION);
    expect(result.selected.length + result.remaining.length).toBe(result.merged_count);
  });

  test('with previous state: merges remaining items from previous state', () => {
    const fixture = createDiscoveryFixture();
    const previousState = createInitialState('v1.0', 5);
    const carryover = createWorkItem('quality', 'carryover-item', 'Carryover', 'From last time', {
      source: 'carryover',
      status: 'pending',
    });
    previousState.remaining = [carryover];

    const result = runDiscovery(fixture, previousState);
    // Merged count should include carryover + fresh items
    expect(result.merged_count).toBeGreaterThan(result.all_discovered_count);
    // The carryover item should appear somewhere in selected or remaining
    const allItems = [...result.selected, ...result.remaining];
    const carryoverFound = allItems.some((i) => i.id === 'quality/carryover-item');
    expect(carryoverFound).toBe(true);
  });

  test('deduplicates items with same id across fresh and previous', () => {
    const fixture = createDiscoveryFixture();

    // Discover items once to know what ids exist
    const freshItems = analyzeCodebaseForItems(fixture);
    expect(freshItems.length).toBeGreaterThan(0);

    // Create previous state with one of the same ids
    const previousState = createInitialState('v1.0', 100);
    const duplicateItem = createWorkItem(
      freshItems[0].dimension,
      freshItems[0].slug,
      'Previous Version',
      'From before',
      { source: 'carryover', status: 'pending' }
    );
    previousState.remaining = [duplicateItem];

    const result = runDiscovery(fixture, previousState);
    // Merged count should be at most freshItems + 1 (previous) - 1 (dedup) = freshItems
    // Actually existing-wins means previous takes priority, so fresh duplicate is dropped
    expect(result.merged_count).toBe(freshItems.length);
  });

  test('returns correct counts', () => {
    const fixture = createDiscoveryFixture();
    const result = runDiscovery(fixture, null);
    expect(typeof result.all_discovered_count).toBe('number');
    expect(typeof result.merged_count).toBe('number');
    expect(result.all_discovered_count).toBeGreaterThanOrEqual(0);
    expect(result.merged_count).toBeGreaterThanOrEqual(result.all_discovered_count);
  });

  test('respects items_per_iteration from previous state', () => {
    const fixture = createDiscoveryFixture();
    const previousState = createInitialState('v1.0', 2);
    previousState.remaining = [];

    const result = runDiscovery(fixture, previousState);
    expect(result.selected.length).toBeLessThanOrEqual(2);
  });
});
