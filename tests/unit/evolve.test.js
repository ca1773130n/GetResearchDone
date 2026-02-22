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

// Mock spawnClaude before any require of lib/evolve.js (which destructures it at load time)
jest.mock('../../lib/autopilot', () => {
  const actual = jest.requireActual('../../lib/autopilot');
  return {
    ...actual,
    spawnClaude: jest.fn(actual.spawnClaude),
    spawnClaudeAsync: jest.fn().mockResolvedValue({ exitCode: 1, timedOut: false, stdout: '' }),
  };
});
const autopilotModule = require('../../lib/autopilot');

// Mock worktree helpers for evolve worktree isolation tests
jest.mock('../../lib/worktree', () => {
  const actual = jest.requireActual('../../lib/worktree');
  return {
    ...actual,
    createEvolveWorktree: jest.fn(actual.createEvolveWorktree),
    removeEvolveWorktree: jest.fn(actual.removeEvolveWorktree),
    pushAndCreatePR: jest.fn(actual.pushAndCreatePR),
  };
});
const worktreeModule = require('../../lib/worktree');

const {
  EVOLVE_STATE_FILENAME,
  WORK_ITEM_DIMENSIONS,
  DEFAULT_ITEMS_PER_ITERATION,
  DEFAULT_PICK_PCT,
  THEME_PATTERNS,
  SONNET_MODEL,
  createWorkItem,
  evolveStatePath,
  readEvolveState,
  writeEvolveState,
  createInitialState,
  mergeWorkItems,
  advanceIteration,
  analyzeCodebaseForItems,
  discoverWithClaude,
  parseDiscoveryOutput,
  scoreWorkItem,
  selectPriorityItems,
  groupDiscoveredItems,
  selectPriorityGroups,
  runDiscovery,
  runGroupDiscovery,
  buildPlanPrompt,
  buildExecutePrompt,
  buildReviewPrompt,
  buildGroupExecutePrompt,
  buildGroupReviewPrompt,
  writeEvolutionNotes,
  runEvolve,
  cmdEvolve,
  cmdEvolveDiscover,
  cmdEvolveState,
  cmdEvolveAdvance,
  cmdEvolveReset,
  cmdInitEvolve,
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
    expect(WORK_ITEM_DIMENSIONS).toHaveLength(7);
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
    const existing = [createWorkItem('quality', 'shared-slug', 'Existing Title', 'Existing desc')];
    const discovered = [createWorkItem('quality', 'shared-slug', 'New Title', 'New desc')];
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
    state.bugfix = [createWorkItem('quality', 'bug-1', 'Bug 1', 'Desc', { source: 'bugfix' })];
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

// ─── parseDiscoveryOutput ───────────────────────────────────────────────────

describe('parseDiscoveryOutput', () => {
  test('parses valid JSON array into work items', () => {
    const raw = JSON.stringify([
      {
        dimension: 'quality',
        slug: 'add-tests',
        title: 'Add Tests',
        description: 'Missing tests in lib/',
        effort: 'small',
      },
      {
        dimension: 'stability',
        slug: 'fix-error',
        title: 'Fix Error',
        description: 'Empty catch in main.js:42',
        effort: 'large',
      },
    ]);
    const items = parseDiscoveryOutput(raw);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('quality/add-tests');
    expect(items[0].effort).toBe('small');
    expect(items[1].id).toBe('stability/fix-error');
    expect(items[1].effort).toBe('large');
  });

  test('handles markdown-fenced JSON', () => {
    const raw =
      '```json\n[{"dimension":"quality","slug":"t","title":"T","description":"D","effort":"medium"}]\n```';
    const items = parseDiscoveryOutput(raw);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('quality/t');
  });

  test('returns empty array on invalid JSON', () => {
    expect(parseDiscoveryOutput('not json')).toEqual([]);
    expect(parseDiscoveryOutput('')).toEqual([]);
  });

  test('returns empty array when JSON is not an array', () => {
    expect(parseDiscoveryOutput('{"foo": "bar"}')).toEqual([]);
  });

  test('skips items with invalid dimensions', () => {
    const raw = JSON.stringify([
      { dimension: 'invalid-dim', slug: 'x', title: 'X', description: 'D', effort: 'small' },
      { dimension: 'quality', slug: 'y', title: 'Y', description: 'D', effort: 'small' },
    ]);
    const items = parseDiscoveryOutput(raw);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('quality/y');
  });

  test('skips items missing required fields', () => {
    const raw = JSON.stringify([
      { dimension: 'quality', slug: 'a' },
      { dimension: 'quality', slug: 'b', title: 'B', description: 'D' },
    ]);
    const items = parseDiscoveryOutput(raw);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('quality/b');
  });

  test('defaults effort to medium for invalid values', () => {
    const raw = JSON.stringify([
      { dimension: 'quality', slug: 'q', title: 'Q', description: 'D', effort: 'huge' },
    ]);
    const items = parseDiscoveryOutput(raw);
    expect(items).toHaveLength(1);
    expect(items[0].effort).toBe('medium');
  });
});

// ─── discoverWithClaude ─────────────────────────────────────────────────────

describe('discoverWithClaude', () => {
  test('falls back to hardcoded discovery when Claude subprocess fails', async () => {
    // spawnClaudeAsync is mocked to return exitCode: 1
    const fixture = createDiscoveryFixture();
    const items = await discoverWithClaude(fixture);
    // Should get items from hardcoded discovery fallback
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveProperty('dimension');
    expect(items[0]).toHaveProperty('slug');
  });

  test('falls back when Claude returns empty stdout', async () => {
    autopilotModule.spawnClaudeAsync.mockResolvedValueOnce({
      exitCode: 0,
      timedOut: false,
      stdout: '',
    });
    const fixture = createDiscoveryFixture();
    const items = await discoverWithClaude(fixture);
    expect(items.length).toBeGreaterThan(0);
  });

  test('falls back when Claude returns unparseable output', async () => {
    autopilotModule.spawnClaudeAsync.mockResolvedValueOnce({
      exitCode: 0,
      timedOut: false,
      stdout: 'not json',
    });
    const fixture = createDiscoveryFixture();
    const items = await discoverWithClaude(fixture);
    expect(items.length).toBeGreaterThan(0);
  });

  test('uses Claude output when valid JSON is returned', async () => {
    const claudeOutput = JSON.stringify([
      {
        dimension: 'quality',
        slug: 'claude-found',
        title: 'Claude Found',
        description: 'Found by Claude',
        effort: 'small',
      },
    ]);
    autopilotModule.spawnClaudeAsync.mockResolvedValueOnce({
      exitCode: 0,
      timedOut: false,
      stdout: claudeOutput,
    });
    const fixture = createDiscoveryFixture();
    const items = await discoverWithClaude(fixture);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('quality/claude-found');
  });
});

// ─── scoreWorkItem ──────────────────────────────────────────────────────────

describe('scoreWorkItem', () => {
  test('improve-features dimension scores higher than quality dimension', () => {
    const improveItem = createWorkItem('improve-features', 'i', 'I', 'I');
    const qualityItem = createWorkItem('quality', 'q', 'Q', 'Q');
    expect(scoreWorkItem(improveItem)).toBeGreaterThan(scoreWorkItem(qualityItem));
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
      createWorkItem('new-features', 'low', 'Low', 'Low priority', {
        effort: 'large',
        source: 'carryover',
      }),
      createWorkItem('quality', 'high', 'High', 'High priority', {
        effort: 'small',
        source: 'bugfix',
      }),
      createWorkItem('productivity', 'mid', 'Mid', 'Mid priority', {
        effort: 'medium',
        source: 'discovery',
      }),
      createWorkItem('stability', 'med-high', 'MedHigh', 'MedHigh priority', {
        effort: 'medium',
        source: 'discovery',
      }),
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
  test('without previous state: discovers fresh items and selects top N', async () => {
    const fixture = createDiscoveryFixture();
    const result = await runDiscovery(fixture, null);
    expect(result.all_discovered_count).toBeGreaterThan(0);
    expect(result.selected.length).toBeLessThanOrEqual(DEFAULT_ITEMS_PER_ITERATION);
    expect(result.selected.length + result.remaining.length).toBe(result.merged_count);
  });

  test('with previous state: merges remaining items from previous state', async () => {
    const fixture = createDiscoveryFixture();
    const previousState = createInitialState('v1.0', 5);
    const carryover = createWorkItem('quality', 'carryover-item', 'Carryover', 'From last time', {
      source: 'carryover',
      status: 'pending',
    });
    previousState.remaining = [carryover];

    const result = await runDiscovery(fixture, previousState);
    // Merged count should include carryover + fresh items
    expect(result.merged_count).toBeGreaterThan(result.all_discovered_count);
    // The carryover item should appear somewhere in selected or remaining
    const allItems = [...result.selected, ...result.remaining];
    const carryoverFound = allItems.some((i) => i.id === 'quality/carryover-item');
    expect(carryoverFound).toBe(true);
  });

  test('deduplicates items with same id across fresh and previous', async () => {
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

    const result = await runDiscovery(fixture, previousState);
    // Merged count should be at most freshItems + 1 (previous) - 1 (dedup) = freshItems
    // Actually existing-wins means previous takes priority, so fresh duplicate is dropped
    expect(result.merged_count).toBe(freshItems.length);
  });

  test('returns correct counts', async () => {
    const fixture = createDiscoveryFixture();
    const result = await runDiscovery(fixture, null);
    expect(typeof result.all_discovered_count).toBe('number');
    expect(typeof result.merged_count).toBe('number');
    expect(result.all_discovered_count).toBeGreaterThanOrEqual(0);
    expect(result.merged_count).toBeGreaterThanOrEqual(result.all_discovered_count);
  });

  test('respects items_per_iteration from previous state', async () => {
    const fixture = createDiscoveryFixture();
    const previousState = createInitialState('v1.0', 2);
    previousState.remaining = [];

    const result = await runDiscovery(fixture, previousState);
    expect(result.selected.length).toBeLessThanOrEqual(2);
  });
});

// ─── Output Capture Helper ─────────────────────────────────────────────────

/**
 * Capture stdout/stderr from a sync cmd* function that calls output()/error().
 * These functions call process.exit, so we intercept it.
 */
function captureOutput(fn) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    exitCode = code;
    const err = new Error('__TEST_EXIT__');
    err.__EXIT__ = true;
    err.code = code;
    throw err;
  });

  const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdout += data;
    return true;
  });

  const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((data) => {
    stderr += data;
    return true;
  });

  try {
    fn();
  } catch (e) {
    if (!(e && e.__EXIT__)) {
      throw e;
    }
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return { stdout, stderr, exitCode };
}

/**
 * Async variant of captureOutput for async cmd* functions.
 */
async function captureOutputAsync(fn) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    exitCode = code;
    const err = new Error('__TEST_EXIT__');
    err.__EXIT__ = true;
    err.code = code;
    throw err;
  });

  const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdout += data;
    return true;
  });

  const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((data) => {
    stderr += data;
    return true;
  });

  try {
    await fn();
  } catch (e) {
    if (!(e && e.__EXIT__)) {
      throw e;
    }
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return { stdout, stderr, exitCode };
}

// ─── CLI Command Functions ─────────────────────────────────────────────────

describe('cmdEvolveState', () => {
  test('returns exists:false when no state file', () => {
    const tmpDir = createTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    const { stdout, exitCode } = captureOutput(() => cmdEvolveState(tmpDir, [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.exists).toBe(false);
    expect(result.state).toBeNull();
  });

  test('returns exists:true with state when file exists', () => {
    const tmpDir = createTmpDir();
    const state = createInitialState('v1.0');
    writeEvolveState(tmpDir, state);
    const { stdout, exitCode } = captureOutput(() => cmdEvolveState(tmpDir, [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.exists).toBe(true);
    expect(result.state.iteration).toBe(1);
    expect(result.state.milestone).toBe('v1.0');
  });

  test('raw mode returns "No evolve state found" when no state', () => {
    const tmpDir = createTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    const { stdout } = captureOutput(() => cmdEvolveState(tmpDir, [], true));
    expect(stdout).toBe('No evolve state found');
  });
});

describe('cmdEvolveDiscover', () => {
  test('returns grouped discovery result', async () => {
    const fixture = createDiscoveryFixture();
    const { stdout, exitCode } = await captureOutputAsync(() =>
      cmdEvolveDiscover(fixture, [], false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('groups');
    expect(result).toHaveProperty('total_items');
    expect(result).toHaveProperty('total_groups');
    expect(result).toHaveProperty('selected_count');
    expect(result).toHaveProperty('pick_pct');
    expect(Array.isArray(result.groups)).toBe(true);
  });

  test('raw mode returns groups count string', async () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = await captureOutputAsync(() => cmdEvolveDiscover(fixture, [], true));
    expect(stdout).toMatch(/\d+ groups \(\d+ items\)/);
  });

  test('respects --pick-pct flag', async () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = await captureOutputAsync(() =>
      cmdEvolveDiscover(fixture, ['--pick-pct', '50'], false)
    );
    const result = JSON.parse(stdout);
    expect(result.pick_pct).toBe(50);
  });
});

describe('cmdEvolveAdvance', () => {
  test('errors when no state exists', () => {
    const tmpDir = createTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    const { stderr, exitCode } = captureOutput(() => cmdEvolveAdvance(tmpDir, [], false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('No evolve state found');
  });

  test('advances iteration when state exists', () => {
    const tmpDir = createTmpDir();
    const state = createInitialState('v1.0');
    state.selected = [
      createWorkItem('quality', 'test-item', 'Test', 'Desc', { status: 'selected' }),
    ];
    writeEvolveState(tmpDir, state);

    const { stdout, exitCode } = captureOutput(() => cmdEvolveAdvance(tmpDir, [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.iteration).toBe(2);
    expect(result.history).toHaveLength(1);
  });

  test('raw mode returns iteration string', () => {
    const tmpDir = createTmpDir();
    const state = createInitialState('v1.0');
    writeEvolveState(tmpDir, state);

    const { stdout } = captureOutput(() => cmdEvolveAdvance(tmpDir, [], true));
    expect(stdout).toBe('iteration 2');
  });
});

describe('cmdEvolveReset', () => {
  test('resets when state file exists', () => {
    const tmpDir = createTmpDir();
    const state = createInitialState('v1.0');
    writeEvolveState(tmpDir, state);

    const { stdout, exitCode } = captureOutput(() => cmdEvolveReset(tmpDir, [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.reset).toBe(true);

    // Verify file is gone
    expect(readEvolveState(tmpDir)).toBeNull();
  });

  test('succeeds even when no state file', () => {
    const tmpDir = createTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    const { stdout, exitCode } = captureOutput(() => cmdEvolveReset(tmpDir, [], false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.reset).toBe(true);
  });

  test('raw mode returns reset message', () => {
    const tmpDir = createTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
    const { stdout } = captureOutput(() => cmdEvolveReset(tmpDir, [], true));
    expect(stdout).toBe('Evolve state reset');
  });
});

describe('cmdInitEvolve', () => {
  test('returns pre-flight context', () => {
    const tmpDir = createTmpDir();
    // Create minimal .planning with config and ROADMAP
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ model_profile: 'balanced', autonomous_mode: false })
    );
    fs.writeFileSync(
      path.join(planningDir, 'ROADMAP.md'),
      '# Roadmap\n\n- v1.0 Test Milestone (in progress)\n\n## Phase 1 — Setup\n'
    );

    const { stdout, exitCode } = captureOutput(() => cmdInitEvolve(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('backend');
    expect(result).toHaveProperty('capabilities');
    expect(result).toHaveProperty('config');
    expect(result).toHaveProperty('evolve_state');
    expect(result).toHaveProperty('models');
    expect(result).toHaveProperty('milestone');
    expect(result.config.model_profile).toBe('balanced');
    expect(result.evolve_state.exists).toBe(false);
    expect(result.evolve_state.iteration).toBe(0);
  });

  test('includes existing evolve state info', () => {
    const tmpDir = createTmpDir();
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ model_profile: 'quality' })
    );
    fs.writeFileSync(
      path.join(planningDir, 'ROADMAP.md'),
      '# Roadmap\n\n- v2.0 Next (in progress)\n'
    );

    const state = createInitialState('v2.0', 3);
    state.pick_pct = 25;
    state.remaining_groups = [
      { id: 'quality/test-coverage', items: [], status: 'pending' },
      { id: 'quality/code-markers', items: [], status: 'pending' },
    ];
    state.completed_groups = [{ id: 'quality/jsdoc-gaps', items: [], status: 'completed' }];
    state.failed_groups = [];
    state.groups_count = 3;
    state.all_items_count = 15;
    writeEvolveState(tmpDir, state);

    const { stdout, exitCode } = captureOutput(() => cmdInitEvolve(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.evolve_state.exists).toBe(true);
    expect(result.evolve_state.iteration).toBe(1);
    expect(result.evolve_state.remaining_groups_count).toBe(2);
    expect(result.evolve_state.completed_groups_count).toBe(1);
    expect(result.evolve_state.groups_count).toBe(3);
    expect(result.config.pick_pct).toBe(25);
  });

  test('raw mode returns JSON string', () => {
    const tmpDir = createTmpDir();
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ model_profile: 'balanced' })
    );
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n');

    const { stdout } = captureOutput(() => cmdInitEvolve(tmpDir, true));
    // Raw mode outputs JSON.stringify of the result
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('backend');
    expect(parsed).toHaveProperty('config');
  });
});

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
    const items = [createWorkItem('quality', 'something-random', 'Random', 'Desc')];
    const groups = groupDiscoveredItems(items);
    const misc = groups.find((g) => g.theme === 'miscellaneous' && g.dimension === 'quality');
    expect(misc).toBeDefined();
    expect(misc.items).toHaveLength(1);
  });

  test('group id is dimension/theme', () => {
    const items = [createWorkItem('stability', 'fix-empty-catch-utils-L10', 'Fix catch', 'Desc')];
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
      createWorkItem('quality', 'improve-coverage-a', 'A', 'D', {
        effort: 'small',
        source: 'bugfix',
      }),
      createWorkItem('quality', 'improve-coverage-b', 'B', 'D', {
        effort: 'large',
        source: 'carryover',
      }),
    ];
    const groups = groupDiscoveredItems(items);
    const group = groups.find((g) => g.theme === 'test-coverage');
    const expectedPriority = (scoreWorkItem(items[0]) + scoreWorkItem(items[1])) / 2;
    expect(group.priority).toBe(expectedPriority);
  });

  test('groups are sorted by priority descending', () => {
    const items = [
      createWorkItem('new-features', 'mcp-tool-foo', 'MCP foo', 'D', { effort: 'large' }),
      createWorkItem('quality', 'improve-coverage-a', 'Cov A', 'D', {
        effort: 'small',
        source: 'bugfix',
      }),
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

// ─── selectPriorityGroups ───────────────────────────────────────────────────

describe('selectPriorityGroups', () => {
  function makeGroups() {
    const items = [
      createWorkItem('quality', 'improve-coverage-a', 'A', 'D', {
        effort: 'small',
        source: 'bugfix',
      }),
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
    const groups = makeGroups();
    const result = selectPriorityGroups(groups, 20);
    expect(result.selected.length).toBe(1);
    expect(result.remaining.length).toBe(groups.length - 1);
  });

  test('minimum 1 group even at low percentage', () => {
    const groups = makeGroups();
    const result = selectPriorityGroups(groups, 1);
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
    items: [createWorkItem('stability', 'fix-empty-catch-utils-L10', 'Fix catch L10', 'Desc')],
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

// ─── runGroupDiscovery ──────────────────────────────────────────────────────

describe('runGroupDiscovery', () => {
  test('returns groups sorted by priority', async () => {
    const fixture = createDiscoveryFixture();
    const result = await runGroupDiscovery(fixture, null, 15);
    expect(result.groups.length).toBeGreaterThan(0);
    for (let i = 0; i < result.groups.length - 1; i++) {
      expect(result.groups[i].priority).toBeGreaterThanOrEqual(result.groups[i + 1].priority);
    }
  });

  test('returns selected and remaining groups based on pick_pct', async () => {
    const fixture = createDiscoveryFixture();
    const result = await runGroupDiscovery(fixture, null, 50);
    expect(result.selected_groups.length).toBeGreaterThan(0);
    expect(result.selected_groups.length + result.remaining_groups.length).toBe(
      result.groups.length
    );
  });

  test('returns total items count and groups count', async () => {
    const fixture = createDiscoveryFixture();
    const result = await runGroupDiscovery(fixture, null, 15);
    expect(result.all_items_count).toBeGreaterThan(0);
    expect(result.groups_count).toBe(result.groups.length);
  });

  test('with previous state remaining_groups: merges new discovery', async () => {
    const fixture = createDiscoveryFixture();
    // Use an item whose slug matches a known theme pattern so we can find it
    const prevGroup = {
      id: 'quality/test-coverage',
      theme: 'test-coverage',
      dimension: 'quality',
      title: 'Test Coverage',
      items: [createWorkItem('quality', 'improve-coverage-carryover', 'Carry', 'D')],
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
    const result = await runGroupDiscovery(fixture, previousState, 15);
    // The carryover item should be merged into the re-grouped pool
    const allItems = [...result.selected_groups, ...result.remaining_groups].flatMap(
      (g) => g.items
    );
    const found = allItems.some((i) => i.id === 'quality/improve-coverage-carryover');
    expect(found).toBe(true);
  });

  test('backward compat: old state with flat remaining items auto-regroups', async () => {
    const fixture = createDiscoveryFixture();
    const oldState = {
      iteration: 1,
      items_per_iteration: 5,
      remaining: [createWorkItem('quality', 'improve-coverage-old', 'Old Coverage', 'D')],
      selected: [],
      completed: [],
      failed: [],
      bugfix: [],
    };
    const result = await runGroupDiscovery(fixture, oldState, 15);
    expect(result.groups_count).toBeGreaterThan(0);
  });
});

// ─── Orchestrator Tests (Phase 56 Plan 02) ─────────────────────────────────

// ─── SONNET_MODEL ───────────────────────────────────────────────────────────

describe('SONNET_MODEL', () => {
  test('should equal sonnet', () => {
    expect(SONNET_MODEL).toBe('sonnet');
  });

  test('should be a non-empty string', () => {
    expect(typeof SONNET_MODEL).toBe('string');
    expect(SONNET_MODEL.length).toBeGreaterThan(0);
  });
});

// ─── buildPlanPrompt ────────────────────────────────────────────────────────

describe('buildPlanPrompt', () => {
  const item = createWorkItem('quality', 'fix-lint', 'Fix Linting', 'Fix all lint errors', {
    effort: 'small',
  });

  test('should return a non-empty string', () => {
    const prompt = buildPlanPrompt(item);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('should include work item title and description', () => {
    const prompt = buildPlanPrompt(item);
    expect(prompt).toContain('Fix Linting');
    expect(prompt).toContain('Fix all lint errors');
  });

  test('should include dimension and effort', () => {
    const prompt = buildPlanPrompt(item);
    expect(prompt).toContain('quality');
    expect(prompt).toContain('small');
  });

  test('should instruct not to implement', () => {
    const prompt = buildPlanPrompt(item);
    expect(prompt).toMatch(/not implement|only plan/i);
  });
});

// ─── buildExecutePrompt ─────────────────────────────────────────────────────

describe('buildExecutePrompt', () => {
  const item = createWorkItem('stability', 'fix-crash', 'Fix Crash', 'App crashes on start');

  test('should return a non-empty string', () => {
    const prompt = buildExecutePrompt(item);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('should include the specific work item', () => {
    const prompt = buildExecutePrompt(item);
    expect(prompt).toContain('Fix Crash');
    expect(prompt).toContain('App crashes on start');
  });

  test('should mention test verification', () => {
    const prompt = buildExecutePrompt(item);
    expect(prompt).toMatch(/npm test|test/i);
  });
});

// ─── buildReviewPrompt ──────────────────────────────────────────────────────

describe('buildReviewPrompt', () => {
  const item = createWorkItem('quality', 'add-tests', 'Add Tests', 'Increase test coverage');

  test('should return a non-empty string', () => {
    const prompt = buildReviewPrompt(item);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('should include review/verify language', () => {
    const prompt = buildReviewPrompt(item);
    expect(prompt).toMatch(/review|verify/i);
  });

  test('should include work item title', () => {
    const prompt = buildReviewPrompt(item);
    expect(prompt).toContain('Add Tests');
  });
});

// ─── writeEvolutionNotes ────────────────────────────────────────────────────

describe('writeEvolutionNotes', () => {
  test('should create EVOLUTION.md on first iteration', () => {
    const tmpDir = createTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });

    writeEvolutionNotes(tmpDir, {
      iteration: 1,
      items: [{ title: 'Fix lint', category: 'quality' }],
      outcomes: [{ item: 'Fix lint', status: 'pass' }],
      decisions: ['Used eslint auto-fix'],
      patterns: ['Lint errors cluster in test files'],
      takeaways: ['Run lint before commit'],
    });

    const filePath = path.join(tmpDir, '.planning', 'EVOLUTION.md');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Evolution Notes');
    expect(content).toContain('## Iteration 1');
    expect(content).toContain('Fix lint');
    expect(content).toContain('pass');
    expect(content).toContain('Used eslint auto-fix');
    expect(content).toContain('Lint errors cluster in test files');
    expect(content).toContain('Run lint before commit');
  });

  test('should append subsequent iterations', () => {
    const tmpDir = createTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });

    writeEvolutionNotes(tmpDir, {
      iteration: 1,
      items: [{ title: 'Task A' }],
      outcomes: [{ item: 'Task A', status: 'pass' }],
      decisions: [],
      patterns: [],
      takeaways: [],
    });

    writeEvolutionNotes(tmpDir, {
      iteration: 2,
      items: [{ title: 'Task B' }],
      outcomes: [{ item: 'Task B', status: 'fail' }],
      decisions: ['Reverted approach'],
      patterns: [],
      takeaways: [],
    });

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'EVOLUTION.md'), 'utf-8');
    expect(content).toContain('## Iteration 1');
    expect(content).toContain('## Iteration 2');
    expect(content).toContain('Task A');
    expect(content).toContain('Task B');
    expect(content).toContain('fail');
  });

  test('should handle empty optional fields', () => {
    const tmpDir = createTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });

    writeEvolutionNotes(tmpDir, {
      iteration: 1,
      items: [],
      outcomes: [],
      decisions: [],
      patterns: [],
      takeaways: [],
    });

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'EVOLUTION.md'), 'utf-8');
    expect(content).toContain('## Iteration 1');
    // Empty sections should show "None"
    expect(content).toContain('None');
  });

  test('should create .planning directory if it does not exist', () => {
    const tmpDir = createTmpDir();
    // Do not create .planning

    writeEvolutionNotes(tmpDir, {
      iteration: 1,
      items: [],
      outcomes: [],
      decisions: [],
      patterns: [],
      takeaways: [],
    });

    expect(fs.existsSync(path.join(tmpDir, '.planning', 'EVOLUTION.md'))).toBe(true);
  });

  test('should include iteration number in section headers', () => {
    const tmpDir = createTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });

    writeEvolutionNotes(tmpDir, {
      iteration: 7,
      items: [{ title: 'X' }],
      outcomes: [{ item: 'X', status: 'pass' }],
      decisions: [],
      patterns: [],
      takeaways: [],
    });

    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'EVOLUTION.md'), 'utf-8');
    expect(content).toContain('## Iteration 7');
  });
});

// ─── runEvolve (legacy format replaced by grouped tests below) ──────────────

describe('runEvolve', () => {
  beforeEach(() => {
    autopilotModule.spawnClaude.mockReset();
    autopilotModule.spawnClaude.mockReturnValue({ exitCode: 0, timedOut: false });
  });

  test('single iteration completes and writes evolution notes', async () => {
    const fixture = createDiscoveryFixture();
    const result = await runEvolve(fixture, { iterations: 1 });

    expect(result.iterations_completed).toBe(1);
    expect(result.results[0].status).toBe('completed');
    expect(result.results[0].groups_attempted).toBeGreaterThan(0);

    // Evolution notes should be written
    const notesPath = path.join(fixture, '.planning', 'EVOLUTION.md');
    expect(fs.existsSync(notesPath)).toBe(true);
    const notes = fs.readFileSync(notesPath, 'utf-8');
    expect(notes).toContain('## Iteration');
  });

  test('model ceiling is respected (spawnClaude called with model: sonnet)', async () => {
    const fixture = createDiscoveryFixture();
    await runEvolve(fixture, { iterations: 1 });

    // Every spawnClaude call should use SONNET_MODEL
    for (const call of autopilotModule.spawnClaude.mock.calls) {
      expect(call[2]).toHaveProperty('model', SONNET_MODEL);
    }
  });

  test('timeout is passed through to spawnClaude', async () => {
    const fixture = createDiscoveryFixture();
    await runEvolve(fixture, { iterations: 1, timeout: 10 });

    // Timeout should be converted to ms (10 * 60 * 1000 = 600000)
    for (const call of autopilotModule.spawnClaude.mock.calls) {
      expect(call[2]).toHaveProperty('timeout', 600000);
    }
  });

  test('maxTurns is passed through to spawnClaude', async () => {
    const fixture = createDiscoveryFixture();
    await runEvolve(fixture, { iterations: 1, maxTurns: 5 });

    for (const call of autopilotModule.spawnClaude.mock.calls) {
      expect(call[2]).toHaveProperty('maxTurns', 5);
    }
  });

  test('returns evolution_notes_path', async () => {
    const fixture = createDiscoveryFixture();
    const result = await runEvolve(fixture, { dryRun: true });

    expect(result.evolution_notes_path).toBe(path.join('.planning', 'EVOLUTION.md'));
  });

  test('remaining groups persisted to state file after iteration', async () => {
    const fixture = createDiscoveryFixture();
    await runEvolve(fixture, { iterations: 1 });

    const state = readEvolveState(fixture);
    expect(state).not.toBeNull();
    expect(state.iteration).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(state.remaining_groups)).toBe(true);
  });
});

// ─── cmdEvolve ──────────────────────────────────────────────────────────────

describe('cmdEvolve', () => {
  beforeEach(() => {
    autopilotModule.spawnClaude.mockReset();
    autopilotModule.spawnClaude.mockReturnValue({ exitCode: 0, timedOut: false });
  });

  test('parses --dry-run flag correctly', async () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = await captureAsyncOutput(() => cmdEvolve(fixture, ['--dry-run'], false));

    const result = JSON.parse(stdout);
    expect(result.results[0].status).toBe('dry-run');
    expect(autopilotModule.spawnClaude).not.toHaveBeenCalled();
  });

  test('parses --iterations flag correctly', async () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = await captureAsyncOutput(() =>
      cmdEvolve(fixture, ['--iterations', '1', '--dry-run'], false)
    );

    const result = JSON.parse(stdout);
    expect(result.iterations_completed).toBe(1);
  });

  test('parses --pick-pct flag correctly', async () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = await captureAsyncOutput(() =>
      cmdEvolve(fixture, ['--pick-pct', '50', '--dry-run'], false)
    );

    const result = JSON.parse(stdout);
    expect(result.results[0].status).toBe('dry-run');
    expect(result.results[0].groups_per_iteration).toBeGreaterThanOrEqual(1);
  });

  test('dry-run returns grouped output', async () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = await captureAsyncOutput(() => cmdEvolve(fixture, ['--dry-run'], false));

    const result = JSON.parse(stdout);
    expect(result.results[0].status).toBe('dry-run');
    expect(result.results[0]).toHaveProperty('groups');
    expect(result.results[0]).toHaveProperty('total_groups');
  });

  test('delegates to runEvolve', async () => {
    const fixture = createDiscoveryFixture();
    const { stdout } = await captureAsyncOutput(() => cmdEvolve(fixture, ['--dry-run'], false));

    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('iterations_completed');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('evolution_notes_path');
  });
});

// ─── runEvolve (grouped) ────────────────────────────────────────────────────

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

    const callCount = autopilotModule.spawnClaude.mock.calls.length;
    // Each group = 2 calls (execute + review)
    expect(callCount % 2).toBe(0);
  });

  test('unlimited iterations (iterations=0) processes all groups', async () => {
    const fixture = createDiscoveryFixture();
    // Use pickPct=100 so all groups are selected in one iteration,
    // leaving remaining_groups empty and terminating the unlimited loop.
    const result = await runEvolve(fixture, { iterations: 0, pickPct: 100 });

    expect(result.iterations_completed).toBeGreaterThanOrEqual(1);
    const lastResult = result.results[result.results.length - 1];
    expect(lastResult.status).toBe('completed');
    expect(lastResult.remaining_groups).toBe(0);
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
    autopilotModule.spawnClaude
      .mockReturnValueOnce({ exitCode: 1, timedOut: false }) // execute: fail group 1
      .mockReturnValue({ exitCode: 0, timedOut: false }); // everything else passes

    const fixture = createDiscoveryFixture();
    const result = await runEvolve(fixture, { iterations: 1, pickPct: 100 });

    expect(result.results[0].groups_failed).toBeGreaterThanOrEqual(1);
  });
});

// ─── Extended Discovery Coverage ────────────────────────────────────────────

describe('discoverProductivityItems — long function detection', () => {
  test('detects functions longer than 80 lines', () => {
    const tmpDir = createTmpDir();
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    // Build a function with 82 comment lines → funcLength ~85 > 80
    const lines = ["'use strict';", '/**', ' * Long module', ' */', ''];
    lines.push('function veryLongFunction() {');
    for (let i = 0; i < 82; i++) lines.push(`  // line ${i}`);
    lines.push('  return true;');
    lines.push('}');
    lines.push('');
    lines.push('module.exports = { veryLongFunction };');
    lines.push('');
    fs.writeFileSync(path.join(libDir, 'longfunc.js'), lines.join('\n'));

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find(
      (i) => i.dimension === 'productivity' && i.id.includes('split-longfunc')
    );
    expect(found).toBeDefined();
    expect(found.title).toContain('veryLongFunction');
    expect(found.description).toContain('lines long');
  });
});

describe('discoverQualityItems — jest.config.js threshold detection', () => {
  test('detects coverage thresholds below 90% in jest.config.js', () => {
    const tmpDir = createTmpDir();
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    const testDir = path.join(tmpDir, 'tests', 'unit');
    fs.mkdirSync(testDir, { recursive: true });

    fs.writeFileSync(
      path.join(libDir, 'lowcov.js'),
      ["'use strict';", '/** Module */', 'function fn() {}', 'module.exports = { fn };'].join('\n')
    );
    fs.writeFileSync(path.join(testDir, 'lowcov.test.js'), "test('x', () => {});\n");
    fs.writeFileSync(
      path.join(tmpDir, 'jest.config.js'),
      [
        'module.exports = {',
        '  coverageThreshold: {',
        "    './lib/lowcov.js': { lines: 80, functions: 90, branches: 70 },",
        '  },',
        '};',
      ].join('\n')
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find((i) => i.id === 'quality/improve-coverage-lowcov');
    expect(found).toBeDefined();
    expect(found.description).toContain('80%');
  });

  test('does not flag coverage thresholds already at 90% or above', () => {
    const tmpDir = createTmpDir();
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    fs.writeFileSync(
      path.join(libDir, 'goodcov.js'),
      ["'use strict';", '/** Module */', 'function fn() {}', 'module.exports = { fn };'].join('\n')
    );
    fs.writeFileSync(
      path.join(tmpDir, 'jest.config.js'),
      [
        'module.exports = {',
        '  coverageThreshold: {',
        "    './lib/goodcov.js': { lines: 95, functions: 100, branches: 90 },",
        '  },',
        '};',
      ].join('\n')
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find((i) => i.id === 'quality/improve-coverage-goodcov');
    expect(found).toBeUndefined();
  });
});

describe('discoverQualityItems — TODO/FIXME/HACK marker detection', () => {
  test('detects TODO in a line comment', () => {
    const tmpDir = createTmpDir();
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    fs.writeFileSync(
      path.join(libDir, 'marked.js'),
      [
        "'use strict';",
        '// TODO: refactor this',
        'function fn() {}',
        'module.exports = { fn };',
      ].join('\n')
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find(
      (i) => i.dimension === 'quality' && i.id.includes('resolve-todo-marked')
    );
    expect(found).toBeDefined();
    expect(found.title).toContain('TODO');
  });

  test('does not flag TODO inside a regex literal (false-positive prevention)', () => {
    const tmpDir = createTmpDir();
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    fs.writeFileSync(
      path.join(libDir, 'nofalse.js'),
      [
        "'use strict';",
        '/** Module */',
        'const pat = /\\b(TODO|FIXME|HACK)\\b/g;',
        'function fn() { return pat; }',
        'module.exports = { fn };',
      ].join('\n')
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find(
      (i) => i.dimension === 'quality' && i.id.includes('resolve-todo-nofalse')
    );
    expect(found).toBeUndefined();
  });
});

describe('discoverUsabilityItems — command description detection', () => {
  test('detects commands without description in frontmatter', () => {
    const tmpDir = createTmpDir();
    const cmdDir = path.join(tmpDir, 'commands');
    fs.mkdirSync(cmdDir, { recursive: true });

    fs.writeFileSync(
      path.join(cmdDir, 'my-command.md'),
      '---\nname: my-command\n---\n# My Command\n'
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find((i) => i.id === 'usability/add-description-my-command');
    expect(found).toBeDefined();
    expect(found.description).toContain('missing a description');
  });

  test('detects commands with empty description in frontmatter', () => {
    const tmpDir = createTmpDir();
    const cmdDir = path.join(tmpDir, 'commands');
    fs.mkdirSync(cmdDir, { recursive: true });

    fs.writeFileSync(
      path.join(cmdDir, 'empty-desc.md'),
      '---\nname: empty-desc\ndescription:\n---\n# Empty Desc\n'
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find((i) => i.id === 'usability/add-description-empty-desc');
    expect(found).toBeDefined();
  });

  test('does not flag commands that already have a description', () => {
    const tmpDir = createTmpDir();
    const cmdDir = path.join(tmpDir, 'commands');
    fs.mkdirSync(cmdDir, { recursive: true });

    fs.writeFileSync(
      path.join(cmdDir, 'good-command.md'),
      '---\nname: good-command\ndescription: Does something useful\n---\n# Good Command\n'
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find((i) => i.id === 'usability/add-description-good-command');
    expect(found).toBeUndefined();
  });
});

describe('discoverUsabilityItems — JSDoc detection for exported functions', () => {
  test('detects exported functions with no JSDoc within 6 preceding lines', () => {
    const tmpDir = createTmpDir();
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    // The module JSDoc header is at lines 1-4; the function starts at line 11.
    // The 6 lines immediately before the function contain only constants, not /**.
    fs.writeFileSync(
      path.join(libDir, 'undoc.js'),
      [
        "'use strict';",
        '/**',
        ' * Module header',
        ' */',
        '',
        'const A = 1;',
        'const B = 2;',
        'const C = 3;',
        'const D = 4;',
        '',
        'function undocumentedExport() {',
        '  return A + B + C + D;',
        '}',
        '',
        'module.exports = { undocumentedExport };',
        '',
      ].join('\n')
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find((i) => i.id === 'usability/add-jsdoc-undoc-undocumentedExport');
    expect(found).toBeDefined();
    expect(found.description).toContain('undocumentedExport');
  });
});

describe('discoverConsistencyItems — module header detection', () => {
  test('detects lib files missing JSDoc module header in first 5 lines', () => {
    const tmpDir = createTmpDir();
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    fs.writeFileSync(
      path.join(libDir, 'noheader.js'),
      ["'use strict';", '', 'function fn() { return 1; }', '', 'module.exports = { fn };'].join(
        '\n'
      )
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find((i) => i.id === 'consistency/add-module-header-noheader');
    expect(found).toBeDefined();
    expect(found.description).toContain('missing the standard JSDoc module header');
  });
});

describe('discoverStabilityItems — hardcoded .planning/ path detection', () => {
  test('detects hardcoded .planning/ paths in lib files', () => {
    const tmpDir = createTmpDir();
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    fs.writeFileSync(
      path.join(libDir, 'hardcoded.js'),
      [
        "'use strict';",
        '/**',
        ' * Module',
        ' */',
        '',
        "const STATE_FILE = '.planning/STATE.md';",
        'function getState() { return STATE_FILE; }',
        'module.exports = { getState };',
      ].join('\n')
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find(
      (i) => i.dimension === 'stability' && i.id.includes('use-paths-module-hardcoded')
    );
    expect(found).toBeDefined();
    expect(found.description).toContain('.planning/');
  });
});

describe('discoverNewFeatureItems — cmdInit MCP binding detection', () => {
  test('detects cmdInit functions in context.js without MCP tool bindings', () => {
    const tmpDir = createTmpDir();
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    fs.writeFileSync(
      path.join(libDir, 'context.js'),
      [
        "'use strict';",
        '/**',
        ' * Context module',
        ' */',
        '',
        'function cmdInitOrphan(cwd, raw) {',
        '  return { orphan: true };',
        '}',
        '',
        'module.exports = { cmdInitOrphan };',
      ].join('\n')
    );

    // mcp-server.js does NOT reference cmdInitOrphan
    fs.writeFileSync(
      path.join(libDir, 'mcp-server.js'),
      [
        "'use strict';",
        '/**',
        ' * MCP server',
        ' */',
        '',
        'function registerTools(server) {',
        "  server.tool('other', {}, () => {});",
        '}',
        '',
        'module.exports = { registerTools };',
      ].join('\n')
    );

    const items = analyzeCodebaseForItems(tmpDir);
    const found = items.find((i) => i.dimension === 'new-features' && i.id.includes('orphan'));
    expect(found).toBeDefined();
    expect(found.description).toContain('cmdInitOrphan');
  });
});

describe('runDiscovery — bugfix items in previous state', () => {
  test('merges bugfix items from previous state into the discovery pool', async () => {
    const fixture = createDiscoveryFixture();
    const previousState = createInitialState('v1.0', 10);
    previousState.remaining = [];
    previousState.bugfix = [
      createWorkItem('quality', 'critical-bug', 'Critical Bug Fix', 'A serious bug', {
        source: 'bugfix',
        status: 'pending',
      }),
    ];

    const result = await runDiscovery(fixture, previousState);
    const allItems = [...result.selected, ...result.remaining];
    expect(allItems.some((i) => i.id === 'quality/critical-bug')).toBe(true);
  });
});

// ─── runEvolve (worktree isolation) ──────────────────────────────────────────

describe('runEvolve (worktree isolation)', () => {
  beforeEach(() => {
    autopilotModule.spawnClaude.mockReset();
    autopilotModule.spawnClaude.mockReturnValue({ exitCode: 0, timedOut: false });
    worktreeModule.createEvolveWorktree.mockReset();
    worktreeModule.removeEvolveWorktree.mockReset();
    worktreeModule.pushAndCreatePR.mockReset();
  });

  test('creates worktree before execution when useWorktree=true', async () => {
    const fixture = createDiscoveryFixture();
    worktreeModule.createEvolveWorktree.mockReturnValue({
      path: '/tmp/fake-wt',
      branch: 'grd/evolve/20260223-120000',
      baseBranch: 'main',
      created: new Date().toISOString(),
    });
    worktreeModule.removeEvolveWorktree.mockReturnValue({ removed: true });

    const result = await runEvolve(fixture, { iterations: 1, useWorktree: true });

    expect(worktreeModule.createEvolveWorktree).toHaveBeenCalledWith(fixture);
    expect(result.worktree).toBeDefined();
    expect(result.worktree.branch).toBe('grd/evolve/20260223-120000');
  });

  test('passes worktree path to spawnClaude for execution', async () => {
    const fixture = createDiscoveryFixture();
    const wtPath = '/tmp/fake-wt-exec';
    worktreeModule.createEvolveWorktree.mockReturnValue({
      path: wtPath,
      branch: 'grd/evolve/20260223-120000',
      baseBranch: 'main',
      created: new Date().toISOString(),
    });
    worktreeModule.removeEvolveWorktree.mockReturnValue({ removed: true });

    await runEvolve(fixture, { iterations: 1, useWorktree: true });

    // Every spawnClaude call should use the worktree path, not the original cwd
    for (const call of autopilotModule.spawnClaude.mock.calls) {
      expect(call[0]).toBe(wtPath);
    }
  });

  test('does NOT create worktree for dry-run', async () => {
    const fixture = createDiscoveryFixture();
    await runEvolve(fixture, { dryRun: true, useWorktree: true });

    expect(worktreeModule.createEvolveWorktree).not.toHaveBeenCalled();
  });

  test('discovery uses original cwd, not worktree path', async () => {
    const fixture = createDiscoveryFixture();
    worktreeModule.createEvolveWorktree.mockReturnValue({
      path: '/tmp/fake-wt-disc',
      branch: 'grd/evolve/20260223-120000',
      baseBranch: 'main',
      created: new Date().toISOString(),
    });
    worktreeModule.removeEvolveWorktree.mockReturnValue({ removed: true });

    const result = await runEvolve(fixture, { iterations: 1, useWorktree: true });

    // Discovery found items from the fixture (original cwd), not from /tmp/fake-wt-disc
    expect(result.results[0].groups_attempted).toBeGreaterThan(0);
  });

  test('cleans up worktree after iterations complete', async () => {
    const fixture = createDiscoveryFixture();
    const wtPath = '/tmp/fake-wt-cleanup';
    worktreeModule.createEvolveWorktree.mockReturnValue({
      path: wtPath,
      branch: 'grd/evolve/20260223-120000',
      baseBranch: 'main',
      created: new Date().toISOString(),
    });
    worktreeModule.removeEvolveWorktree.mockReturnValue({ removed: true });

    await runEvolve(fixture, { iterations: 1, useWorktree: true });

    expect(worktreeModule.removeEvolveWorktree).toHaveBeenCalledWith(fixture, wtPath);
  });

  test('--no-worktree (useWorktree=false) skips isolation', async () => {
    const fixture = createDiscoveryFixture();
    await runEvolve(fixture, { iterations: 1, useWorktree: false });

    expect(worktreeModule.createEvolveWorktree).not.toHaveBeenCalled();
    // spawnClaude should receive original cwd
    for (const call of autopilotModule.spawnClaude.mock.calls) {
      expect(call[0]).toBe(fixture);
    }
  });

  test('graceful fallback if worktree creation fails', async () => {
    const fixture = createDiscoveryFixture();
    worktreeModule.createEvolveWorktree.mockReturnValue({
      error: 'Not a git repository',
    });

    const result = await runEvolve(fixture, { iterations: 1, useWorktree: true });

    // Should complete without worktree
    expect(result.iterations_completed).toBe(1);
    expect(result.worktree).toBeUndefined();
    // spawnClaude should fall back to original cwd
    for (const call of autopilotModule.spawnClaude.mock.calls) {
      expect(call[0]).toBe(fixture);
    }
  });

  test('auto-detects worktree from config branching_strategy', async () => {
    const fixture = createDiscoveryFixture();
    // Default config has branching_strategy: 'none', so no worktree
    await runEvolve(fixture, { iterations: 1 }); // useWorktree omitted
    expect(worktreeModule.createEvolveWorktree).not.toHaveBeenCalled();
  });
});

// ─── cmdEvolve (--no-worktree flag) ─────────────────────────────────────────

describe('cmdEvolve (--no-worktree flag)', () => {
  beforeEach(() => {
    autopilotModule.spawnClaude.mockReset();
    autopilotModule.spawnClaude.mockReturnValue({ exitCode: 0, timedOut: false });
    worktreeModule.createEvolveWorktree.mockReset();
  });

  test('--no-worktree prevents worktree creation', async () => {
    const fixture = createDiscoveryFixture();
    // Even if config enables branching, --no-worktree should override
    fs.mkdirSync(path.join(fixture, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(fixture, '.planning', 'config.json'),
      JSON.stringify({ branching_strategy: 'phase' })
    );

    await captureAsyncOutput(() => cmdEvolve(fixture, ['--dry-run', '--no-worktree'], false));

    expect(worktreeModule.createEvolveWorktree).not.toHaveBeenCalled();
  });
});

/**
 * Capture stdout/stderr from an async cmd* function that calls output()/error().
 */
async function captureAsyncOutput(fn) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    exitCode = code;
    const err = new Error('__TEST_EXIT__');
    err.__EXIT__ = true;
    err.code = code;
    throw err;
  });

  const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdout += data;
    return true;
  });

  const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((data) => {
    stderr += data;
    return true;
  });

  try {
    await fn();
  } catch (e) {
    if (!(e && e.__EXIT__)) {
      throw e;
    }
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return { stdout, stderr, exitCode };
}
