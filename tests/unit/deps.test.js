/**
 * Unit tests for lib/deps.js — Dependency analysis module
 *
 * Tests parseDependsOn, buildDependencyGraph, computeParallelGroups,
 * detectCycle, and cmdPhaseAnalyzeDeps.
 */

const fs = require('fs');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  parseDependsOn,
  buildDependencyGraph,
  computeParallelGroups,
  detectCycle,
  cmdPhaseAnalyzeDeps,
} = require('../../lib/deps');

// ─── parseDependsOn ──────────────────────────────────────────────────────────

describe('parseDependsOn', () => {
  test('parses single phase reference', () => {
    expect(parseDependsOn('Phase 27')).toEqual(['27']);
  });

  test('parses multiple phase references', () => {
    expect(parseDependsOn('Phase 27, Phase 29')).toEqual(['27', '29']);
  });

  test('returns empty array for "Nothing"', () => {
    expect(parseDependsOn('Nothing (independent of worktree work)')).toEqual([]);
  });

  test('returns empty array for null', () => {
    expect(parseDependsOn(null)).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    expect(parseDependsOn('')).toEqual([]);
  });

  test('handles "Phase N" without comma separation', () => {
    expect(parseDependsOn('Phase 27 and Phase 29')).toEqual(['27', '29']);
  });

  test('handles decimal phase numbers', () => {
    expect(parseDependsOn('Phase 06.1')).toEqual(['06.1']);
  });
});

// ─── buildDependencyGraph ────────────────────────────────────────────────────

describe('buildDependencyGraph', () => {
  test('builds graph with no dependencies', () => {
    const phases = [
      { number: '27', name: 'Worktree', depends_on: null },
      { number: '28', name: 'PR Workflow', depends_on: null },
      { number: '29', name: 'Dep Analysis', depends_on: null },
    ];
    const graph = buildDependencyGraph(phases);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(0);
  });

  test('builds graph with linear chain', () => {
    const phases = [
      { number: '27', name: 'A', depends_on: null },
      { number: '28', name: 'B', depends_on: 'Phase 27' },
      { number: '29', name: 'C', depends_on: 'Phase 28' },
    ];
    const graph = buildDependencyGraph(phases);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
  });

  test('builds graph with diamond dependency', () => {
    const phases = [
      { number: '27', name: 'A', depends_on: null },
      { number: '28', name: 'B', depends_on: null },
      { number: '29', name: 'C', depends_on: 'Phase 27, Phase 28' },
    ];
    const graph = buildDependencyGraph(phases);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
  });

  test('nodes include phase number and name', () => {
    const phases = [{ number: '27', name: 'Worktree Infra', depends_on: null }];
    const graph = buildDependencyGraph(phases);
    expect(graph.nodes[0]).toEqual({ id: '27', name: 'Worktree Infra' });
  });

  test('edges include from and to fields', () => {
    const phases = [
      { number: '27', name: 'A', depends_on: null },
      { number: '28', name: 'B', depends_on: 'Phase 27' },
    ];
    const graph = buildDependencyGraph(phases);
    expect(graph.edges[0]).toEqual({ from: '27', to: '28' });
  });
});

// ─── computeParallelGroups ───────────────────────────────────────────────────

describe('computeParallelGroups', () => {
  test('all independent phases in one group', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
        { id: '29', name: 'C' },
      ],
      edges: [],
    };
    const groups = computeParallelGroups(graph);
    expect(groups).toEqual([['27', '28', '29']]);
  });

  test('linear chain produces one phase per group', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
        { id: '29', name: 'C' },
      ],
      edges: [
        { from: '27', to: '28' },
        { from: '28', to: '29' },
      ],
    };
    const groups = computeParallelGroups(graph);
    expect(groups).toEqual([['27'], ['28'], ['29']]);
  });

  test('diamond produces 3 groups', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
        { id: '29', name: 'C' },
        { id: '30', name: 'D' },
      ],
      edges: [
        { from: '27', to: '29' },
        { from: '28', to: '29' },
        { from: '29', to: '30' },
      ],
    };
    const groups = computeParallelGroups(graph);
    expect(groups).toEqual([['27', '28'], ['29'], ['30']]);
  });

  test('complex graph with mixed deps (v0.2.0 roadmap structure)', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'Worktree' },
        { id: '28', name: 'PR' },
        { id: '29', name: 'Deps' },
        { id: '30', name: 'Parallel' },
        { id: '31', name: 'Integration' },
      ],
      edges: [
        { from: '27', to: '28' },
        { from: '27', to: '30' },
        { from: '29', to: '30' },
        { from: '27', to: '31' },
        { from: '28', to: '31' },
        { from: '29', to: '31' },
        { from: '30', to: '31' },
      ],
    };
    const groups = computeParallelGroups(graph);
    expect(groups).toEqual([['27', '29'], ['28', '30'], ['31']]);
  });

  test('empty graph returns empty groups', () => {
    const graph = { nodes: [], edges: [] };
    const groups = computeParallelGroups(graph);
    expect(groups).toEqual([]);
  });

  test('single phase with no deps', () => {
    const graph = {
      nodes: [{ id: '27', name: 'Solo' }],
      edges: [],
    };
    const groups = computeParallelGroups(graph);
    expect(groups).toEqual([['27']]);
  });
});

// ─── detectCycle ─────────────────────────────────────────────────────────────

describe('detectCycle', () => {
  test('returns null for acyclic graph', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
        { id: '29', name: 'C' },
      ],
      edges: [
        { from: '27', to: '28' },
        { from: '28', to: '29' },
      ],
    };
    expect(detectCycle(graph)).toBeNull();
  });

  test('detects simple two-node cycle', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
      ],
      edges: [
        { from: '27', to: '28' },
        { from: '28', to: '27' },
      ],
    };
    const cycle = detectCycle(graph);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain('27');
    expect(cycle).toContain('28');
  });

  test('detects three-node cycle', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
        { id: '29', name: 'C' },
      ],
      edges: [
        { from: '27', to: '28' },
        { from: '28', to: '29' },
        { from: '29', to: '27' },
      ],
    };
    const cycle = detectCycle(graph);
    expect(cycle).not.toBeNull();
    expect(cycle.length).toBeGreaterThanOrEqual(3);
  });

  test('returns null for diamond (no cycle)', () => {
    const graph = {
      nodes: [
        { id: '27', name: 'A' },
        { id: '28', name: 'B' },
        { id: '29', name: 'C' },
      ],
      edges: [
        { from: '27', to: '29' },
        { from: '28', to: '29' },
      ],
    };
    expect(detectCycle(graph)).toBeNull();
  });
});

// ─── cmdPhaseAnalyzeDeps ─────────────────────────────────────────────────────

describe('cmdPhaseAnalyzeDeps', () => {
  let fixtureDir;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = null;
    }
  });

  function writeCustomRoadmap(dir, content) {
    const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, content, 'utf-8');
  }

  test('returns JSON with nodes, edges, parallel_groups for fixture roadmap', () => {
    fixtureDir = createFixtureDir();
    writeCustomRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '',
        '## M1 v1.0: Foundation',
        '',
        '### Phase 1: First',
        '**Goal:** Do X',
        '**Depends on:** Nothing',
        '',
        '### Phase 2: Second',
        '**Goal:** Do Y',
        '**Depends on:** Phase 1',
      ].join('\n')
    );

    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseAnalyzeDeps(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.nodes).toBeInstanceOf(Array);
    expect(parsed.edges).toBeInstanceOf(Array);
    expect(parsed.parallel_groups).toBeInstanceOf(Array);
    expect(parsed.nodes.length).toBe(2);
    expect(parsed.edges.length).toBe(1);
  });

  test('returns has_cycle: false for acyclic roadmap', () => {
    fixtureDir = createFixtureDir();
    writeCustomRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '',
        '## M1 v1.0: Foundation',
        '',
        '### Phase 1: First',
        '**Goal:** Do X',
        '**Depends on:** Nothing',
        '',
        '### Phase 2: Second',
        '**Goal:** Do Y',
        '**Depends on:** Phase 1',
      ].join('\n')
    );

    const { stdout } = captureOutput(() => {
      cmdPhaseAnalyzeDeps(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.has_cycle).toBe(false);
  });

  test('returns error for missing ROADMAP.md', () => {
    fixtureDir = createFixtureDir();
    // Remove the ROADMAP.md so it is missing
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    if (fs.existsSync(roadmapPath)) {
      fs.unlinkSync(roadmapPath);
    }

    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseAnalyzeDeps(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeDefined();
  });

  test('returns cycle path when circular dependency exists', () => {
    fixtureDir = createFixtureDir();
    writeCustomRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '',
        '## M1 v1.0: Foundation',
        '',
        '### Phase 1: First',
        '**Goal:** Do X',
        '**Depends on:** Phase 2',
        '',
        '### Phase 2: Second',
        '**Goal:** Do Y',
        '**Depends on:** Phase 1',
      ].join('\n')
    );

    const { stdout } = captureOutput(() => {
      cmdPhaseAnalyzeDeps(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.has_cycle).toBe(true);
    expect(parsed.cycle_path).toBeInstanceOf(Array);
    expect(parsed.cycle_path.length).toBeGreaterThanOrEqual(2);
  });

  test('parallel_groups contains all phase numbers from roadmap', () => {
    fixtureDir = createFixtureDir();
    writeCustomRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '',
        '## M1 v1.0: Foundation',
        '',
        '### Phase 1: First',
        '**Goal:** Do X',
        '**Depends on:** Nothing',
        '',
        '### Phase 2: Second',
        '**Goal:** Do Y',
        '**Depends on:** Phase 1',
        '',
        '### Phase 3: Third',
        '**Goal:** Do Z',
        '**Depends on:** Nothing',
      ].join('\n')
    );

    const { stdout } = captureOutput(() => {
      cmdPhaseAnalyzeDeps(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    const allPhases = parsed.parallel_groups.flat();
    expect(allPhases).toContain('1');
    expect(allPhases).toContain('2');
    expect(allPhases).toContain('3');
    // Each phase appears exactly once
    expect(allPhases.length).toBe(3);
  });
});
