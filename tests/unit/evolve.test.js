/**
 * Unit tests for lib/evolve.js
 *
 * Tests the evolve iteration state layer: work item creation, state path
 * resolution, initial state creation, disk I/O (read/write), merge/deduplication,
 * and iteration advancement logic.
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
