'use strict';

/**
 * End-to-end integration tests for evolve loop
 *
 * Validates:
 *   - Work item discovery quality (DEFER-55-01)
 *   - Full evolve iteration mechanics (criterion #1)
 *   - Iteration handoff (criterion #3)
 *   - Discovery on GRD codebase itself (DEFER-55-01 real-world)
 *
 * Uses direct module imports (not CLI subprocess calls) for speed.
 * Follows existing test conventions from e2e-workflow.test.js.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Mock spawnClaudeAsync to prevent actual Claude subprocess calls during tests
jest.mock('../../lib/autopilot', () => {
  const actual = jest.requireActual('../../lib/autopilot');
  return {
    ...actual,
    spawnClaudeAsync: jest.fn().mockResolvedValue({ exitCode: 1, timedOut: false, stdout: '' }),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTmpDir(prefix: string = 'grd-evolve-e2e-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupDir(dir: string): void {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create a fixture project with lib/ files that trigger multiple discoverers.
 * Includes: TODO comments, long functions, missing test files,
 * missing JSDoc headers, process.exit calls.
 */
function createDiscoveryFixture(tmpDir: string): void {
  // .planning/ with minimal config
  const planningDir = path.join(tmpDir, '.planning');
  fs.mkdirSync(planningDir, { recursive: true });
  fs.writeFileSync(
    path.join(planningDir, 'config.json'),
    JSON.stringify({ autonomous_mode: true }, null, 2)
  );
  fs.writeFileSync(path.join(planningDir, 'STATE.md'), '# State\n');

  // lib/ with files that trigger discoverers
  const libDir = path.join(tmpDir, 'lib');
  fs.mkdirSync(libDir, { recursive: true });

  // File 1: Has TODO, missing JSDoc header
  fs.writeFileSync(
    path.join(libDir, 'alpha.js'),
    [
      "'use strict';",
      '',
      '// TODO: refactor this function to reduce complexity',
      'function processData(input) {',
      '  return input;',
      '}',
      '',
      'module.exports = { processData };',
    ].join('\n')
  );

  // File 2: Has process.exit, FIXME comment
  fs.writeFileSync(
    path.join(libDir, 'beta.js'),
    [
      "'use strict';",
      '',
      '/**',
      ' * Beta module.',
      ' */',
      'function handleError(err) {',
      '  console.error(err);',
      '  // FIXME: should not call process.exit directly',
      '  process.exit(1);',
      '}',
      '',
      'module.exports = { handleError };',
    ].join('\n')
  );

  // File 3: Long function (>80 lines) to trigger productivity discovery
  const longFunctionLines = ['function longFunction(data) {', '  let result = data;'];
  for (let i = 0; i < 85; i++) {
    longFunctionLines.push(`  result = result + ${i}; // line ${i}`);
  }
  longFunctionLines.push('  return result;', '}');
  fs.writeFileSync(
    path.join(libDir, 'gamma.js'),
    [
      "'use strict';",
      '',
      '/**',
      ' * Gamma module with a long function.',
      ' */',
      ...longFunctionLines,
      '',
      'module.exports = { longFunction };',
    ].join('\n')
  );

  // tests/unit/ with only one test file (beta has no tests, alpha has no tests)
  const testDir = path.join(tmpDir, 'tests', 'unit');
  fs.mkdirSync(testDir, { recursive: true });
  fs.writeFileSync(
    path.join(testDir, 'gamma.test.js'),
    "test('placeholder', () => { expect(true).toBe(true); });\n"
  );
}

// ─── 1. Discovery Quality (DEFER-55-01) ──────────────────────────────────────

describe('E2E: Work item discovery quality', () => {
  const {
    analyzeCodebaseForItems,
    runDiscovery,
    WORK_ITEM_DIMENSIONS,
  } = require('../../lib/evolve');

  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTmpDir();
    createDiscoveryFixture(tmpDir);
  });

  afterAll(() => {
    cleanupDir(tmpDir);
  });

  test('analyzeCodebaseForItems returns categorized work items', () => {
    const items = analyzeCodebaseForItems(tmpDir);

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    // Items span at least 2 of 6 dimensions
    const dimensions = new Set(items.map((i: any) => i.dimension));
    expect(dimensions.size).toBeGreaterThanOrEqual(2);

    // Fixture should trigger quality (TODO/FIXME, missing tests) and consistency (process.exit, missing JSDoc)
    expect(dimensions.has('quality')).toBe(true);
    expect(dimensions.has('consistency')).toBe(true);
  });

  test('each work item has required fields', () => {
    const items = analyzeCodebaseForItems(tmpDir);

    for (const item of items) {
      expect(typeof item.id).toBe('string');
      expect(typeof item.dimension).toBe('string');
      expect(typeof item.description).toBe('string');
      expect(typeof item.effort).toBe('string');
      expect(typeof item.source).toBe('string');
      expect(typeof item.status).toBe('string');
      expect(WORK_ITEM_DIMENSIONS).toContain(item.dimension);
    }
  });

  test('runDiscovery handles empty prior state gracefully', async () => {
    const result = await runDiscovery(tmpDir);

    expect(result).toHaveProperty('selected');
    expect(result).toHaveProperty('remaining');
    expect(result).toHaveProperty('all_discovered_count');
    expect(result).toHaveProperty('merged_count');
    expect(result.all_discovered_count).toBeGreaterThan(0);
  });

  test('runDiscovery deduplicates on repeated calls', async () => {
    const first = await runDiscovery(tmpDir);

    // Simulate second discovery with first result as prior state
    const priorState = {
      iteration: 1,
      items_per_iteration: 5,
      remaining: first.remaining,
      selected: first.selected,
      bugfix: [],
      completed: [],
      failed: [],
      history: [],
    };

    const second = await runDiscovery(tmpDir, priorState);

    // Merged count should not exceed total unique items
    const allIds = [...second.selected.map((i: any) => i.id), ...second.remaining.map((i: any) => i.id)];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});

// ─── 2. Full Evolve Iteration Mechanics ──────────────────────────────────────

describe('E2E: Full evolve iteration mechanics', () => {
  const {
    runDiscovery,
    selectPriorityItems,
    advanceIteration,
    createInitialState,
    writeEvolveState,
    readEvolveState,
    writeEvolutionNotes,
  } = require('../../lib/evolve');

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    createDiscoveryFixture(tmpDir);
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('individual evolve steps complete without errors', async () => {
    // Step 1: Discover
    const discovery = await runDiscovery(tmpDir);
    expect(discovery.selected.length).toBeGreaterThan(0);

    // Step 2: Select priority items
    const allItems = [...discovery.selected, ...discovery.remaining];
    const { selected, remaining } = selectPriorityItems(allItems, 2);
    expect(selected).toHaveLength(2);
    expect(selected[0].status).toBe('selected');

    // Step 3: Create and advance state
    const state = createInitialState('test-milestone', 2);
    state.selected = selected;
    state.remaining = remaining;
    state.completed = [selected[0]];
    state.failed = [];

    const advanced = advanceIteration(state);
    expect(advanced.iteration).toBe(2);

    // Step 4: Write state to disk
    writeEvolveState(tmpDir, advanced);
    const statePath = path.join(tmpDir, '.planning', 'EVOLVE-STATE.json');
    expect(fs.existsSync(statePath)).toBe(true);

    // Step 5: Read back and verify structure
    const loaded = readEvolveState(tmpDir);
    expect(loaded.iteration).toBe(2);
    expect(loaded.milestone).toBe('test-milestone');
    expect(Array.isArray(loaded.history)).toBe(true);
    expect(loaded.history).toHaveLength(1);
  });

  test('writeEvolutionNotes creates EVOLUTION.md', () => {
    writeEvolutionNotes(tmpDir, {
      iteration: 1,
      items: [{ title: 'Test item', dimension: 'quality' }],
      outcomes: [{ item: 'Test item', status: 'pass' }],
      decisions: ['Used approach A over B'],
      patterns: ['Pattern found'],
      takeaways: ['Key learning'],
    });

    const notesPath = path.join(tmpDir, '.planning', 'EVOLUTION.md');
    expect(fs.existsSync(notesPath)).toBe(true);

    const content = fs.readFileSync(notesPath, 'utf8');
    expect(content).toContain('# Evolution Notes');
    expect(content).toContain('## Iteration 1');
    expect(content).toContain('Test item');
    expect(content).toContain('Used approach A over B');
  });

  test('runEvolve dry-run completes without subprocess calls', async () => {
    const { runEvolve } = require('../../lib/evolve');

    const result = await runEvolve(tmpDir, {
      iterations: 1,
      dryRun: true,
    });

    expect(result.iterations_completed).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe('dry-run');
    expect(result.results[0].groups.length).toBeGreaterThan(0);
    expect(result.results[0].total_groups).toBeGreaterThanOrEqual(0);
  });
});

// ─── 3. Iteration Handoff (criterion #3) ─────────────────────────────────────

describe('E2E: Iteration handoff', () => {
  const {
    createInitialState,
    createWorkItem,
    mergeWorkItems,
    advanceIteration,
    writeEvolveState,
    readEvolveState,
  } = require('../../lib/evolve');

  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpDir();
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  test('two consecutive iterations produce correct state transitions', () => {
    // Create initial state with 5 work items
    const state = createInitialState('v0.3.0', 3);

    const items = [
      createWorkItem('quality', 'fix-tests-a', 'Fix tests A', 'Add tests for module A'),
      createWorkItem('quality', 'fix-tests-b', 'Fix tests B', 'Add tests for module B'),
      createWorkItem('consistency', 'naming-c', 'Fix naming C', 'Standardize naming in C'),
      createWorkItem('productivity', 'split-d', 'Split function D', 'Break up long function'),
      createWorkItem('stability', 'error-e', 'Error handling E', 'Add error handling to E'),
    ];

    // First iteration: select 3, leave 2 remaining
    state.selected = items.slice(0, 3).map((i: any) => ({ ...i, status: 'selected' }));
    state.remaining = items.slice(3);
    // Mark 2 completed, 1 failed
    state.completed = [state.selected[0], state.selected[1]];
    state.failed = [state.selected[2]];

    // Advance to second iteration
    const iter2 = advanceIteration(state);

    expect(iter2.iteration).toBe(2);
    // Remaining from first iteration carried over (2 items that were not selected)
    expect(iter2.remaining.length).toBe(2);
    // Completed items are NOT in the remaining queue
    const remainingIds = iter2.remaining.map((i: any) => i.id);
    expect(remainingIds).not.toContain('quality/fix-tests-a');
    expect(remainingIds).not.toContain('quality/fix-tests-b');

    // History records the first iteration
    expect(iter2.history).toHaveLength(1);
    expect(iter2.history[0].iteration).toBe(1);
    expect(iter2.history[0].selected_count).toBe(3);
    expect(iter2.history[0].completed_count).toBe(2);
    expect(iter2.history[0].failed_count).toBe(1);

    // Write to disk and read back
    writeEvolveState(tmpDir, iter2);
    const loaded = readEvolveState(tmpDir);
    expect(loaded.iteration).toBe(2);
    expect(loaded.remaining).toHaveLength(2);
    expect(loaded.history).toHaveLength(1);
  });

  test('merge deduplicates correctly (existing items win)', () => {
    const existingItem = createWorkItem(
      'quality',
      'fix-tests-a',
      'Fix tests A (existing)',
      'Original description'
    );
    const discoveredItem = createWorkItem(
      'quality',
      'fix-tests-a',
      'Fix tests A (discovered)',
      'New description'
    );
    const newItem = createWorkItem(
      'consistency',
      'naming-new',
      'Fix naming new',
      'Newly discovered'
    );

    const merged = mergeWorkItems([existingItem], [discoveredItem, newItem]);

    expect(merged).toHaveLength(2);
    // Existing wins: description should be the original
    const fixItem = merged.find((i: any) => i.id === 'quality/fix-tests-a');
    expect(fixItem.description).toBe('Original description');
    // New item is added
    expect(merged.find((i: any) => i.id === 'consistency/naming-new')).toBeDefined();
  });

  test('state file on disk reflects second iteration data', () => {
    const state1 = createInitialState('v0.3.0', 2);
    const item1 = createWorkItem('quality', 'item-1', 'Item 1', 'Desc 1');
    const item2 = createWorkItem('quality', 'item-2', 'Item 2', 'Desc 2');
    const item3 = createWorkItem('consistency', 'item-3', 'Item 3', 'Desc 3');

    state1.selected = [{ ...item1, status: 'selected' }];
    state1.remaining = [item2, item3];
    state1.completed = [state1.selected[0]];

    const state2 = advanceIteration(state1);
    // Simulate second iteration: add new discovered items
    const item4 = createWorkItem('stability', 'item-4', 'Item 4', 'Desc 4');
    state2.remaining = mergeWorkItems(state2.remaining, [item4]);
    state2.selected = [{ ...state2.remaining[0], status: 'selected' }];

    writeEvolveState(tmpDir, state2);
    const loaded = readEvolveState(tmpDir);

    expect(loaded.iteration).toBe(2);
    expect(loaded.history).toHaveLength(1);
    expect(loaded.remaining.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── 4. Discovery on GRD Codebase Itself (DEFER-55-01 real-world) ────────────

describe('E2E: Discovery on GRD codebase itself', () => {
  const { analyzeCodebaseForItems, WORK_ITEM_DIMENSIONS } = require('../../lib/evolve');

  // Resolve the GRD project root
  const grdRoot = path.resolve(__dirname, '..', '..');

  test('discovers categorized actionable items from GRD codebase', () => {
    const items = analyzeCodebaseForItems(grdRoot);

    // GRD codebase should have improvement opportunities
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);

    // Should cover at least 3 of 6 dimensions (GRD has 22 modules)
    const dimensions = new Set(items.map((i: any) => i.dimension));
    expect(dimensions.size).toBeGreaterThanOrEqual(3);

    // All dimensions should be valid
    for (const dim of dimensions) {
      expect(WORK_ITEM_DIMENSIONS).toContain(dim);
    }

    // Each item should have real, non-empty descriptions
    for (const item of items) {
      expect(typeof item.description).toBe('string');
      expect(item.description.length).toBeGreaterThan(0);
      expect(item.description).not.toBe('undefined');
      expect(typeof item.id).toBe('string');
      expect(item.id.length).toBeGreaterThan(0);
    }
  }, 30000);
});
