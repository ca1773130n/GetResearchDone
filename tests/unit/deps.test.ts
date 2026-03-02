/**
 * Unit tests for lib/deps.ts — Dependency analysis module
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
const { COMMAND_DESCRIPTORS } = require('../../lib/mcp-server');

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
  let fixtureDir: string;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = '';
    }
  });

  function writeCustomRoadmap(dir: string, content: string): void {
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

// ─── CLI Integration — phase analyze-deps ────────────────────────────────────

describe('CLI integration — phase analyze-deps', () => {
  let fixtureDir: string;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = '';
    }
  });

  function writeCustomRoadmap(dir: string, content: string): void {
    const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, content, 'utf-8');
  }

  test('CLI outputs valid JSON with expected fields', () => {
    fixtureDir = createFixtureDir();
    writeCustomRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '',
        '## M1 v1.0: Foundation',
        '',
        '### Phase 1: Alpha',
        '**Goal:** Build A',
        '**Depends on:** Nothing',
        '',
        '### Phase 2: Beta',
        '**Goal:** Build B',
        '**Depends on:** Phase 1',
        '',
        '### Phase 3: Gamma',
        '**Goal:** Build C',
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
    expect(typeof parsed.has_cycle).toBe('boolean');
    expect(parsed.has_cycle).toBe(false);
  });

  test('parallel groups match expected structure for v0.2.0 layout', () => {
    fixtureDir = createFixtureDir();
    writeCustomRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '',
        '## v0.2.0: Parallel Execution',
        '',
        '### Phase 27: Worktree Infrastructure',
        '**Goal:** Git worktree support',
        '**Depends on:** Nothing',
        '',
        '### Phase 28: PR Workflow',
        '**Goal:** PR creation from worktrees',
        '**Depends on:** Phase 27',
        '',
        '### Phase 29: Dependency Analysis',
        '**Goal:** Phase dep graph',
        '**Depends on:** Nothing',
        '',
        '### Phase 30: Parallel Execution',
        '**Goal:** Spawn parallel teammates',
        '**Depends on:** Phase 27, Phase 29',
        '',
        '### Phase 31: Integration',
        '**Goal:** Full E2E validation',
        '**Depends on:** Phase 27, Phase 28, Phase 29, Phase 30',
      ].join('\n')
    );

    const { stdout } = captureOutput(() => {
      cmdPhaseAnalyzeDeps(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.parallel_groups).toEqual([['27', '29'], ['28', '30'], ['31']]);
  });

  test('JSON output contains all expected phase numbers with no duplicates', () => {
    fixtureDir = createFixtureDir();
    writeCustomRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '',
        '## v1.0: Core',
        '',
        '### Phase 10: Setup',
        '**Goal:** Init',
        '**Depends on:** Nothing',
        '',
        '### Phase 11: Build',
        '**Goal:** Compile',
        '**Depends on:** Phase 10',
        '',
        '### Phase 12: Test',
        '**Goal:** Validate',
        '**Depends on:** Phase 10',
        '',
        '### Phase 13: Deploy',
        '**Goal:** Ship',
        '**Depends on:** Phase 11, Phase 12',
      ].join('\n')
    );

    const { stdout } = captureOutput(() => {
      cmdPhaseAnalyzeDeps(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    const allPhases = parsed.parallel_groups.flat();
    expect(allPhases.sort()).toEqual(['10', '11', '12', '13']);
    // No duplicates
    expect(new Set(allPhases).size).toBe(allPhases.length);
  });

  test('cycle detection returns error in output', () => {
    fixtureDir = createFixtureDir();
    writeCustomRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '',
        '## v1.0: Core',
        '',
        '### Phase 1: Alpha',
        '**Goal:** A',
        '**Depends on:** Phase 2',
        '',
        '### Phase 2: Beta',
        '**Goal:** B',
        '**Depends on:** Phase 1',
      ].join('\n')
    );

    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseAnalyzeDeps(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.has_cycle).toBe(true);
    expect(parsed.cycle_path).toBeInstanceOf(Array);
    expect(parsed.cycle_path).toContain('1');
    expect(parsed.cycle_path).toContain('2');
  });

  test('MCP descriptor grd_phase_analyze_deps exists with empty params', () => {
    const descriptor = COMMAND_DESCRIPTORS.find((d: Record<string, unknown>) => d.name === 'grd_phase_analyze_deps') as Record<string, unknown>;
    expect(descriptor).toBeDefined();
    expect(descriptor.params).toEqual([]);
    expect(typeof descriptor.execute).toBe('function');
    expect(descriptor.description).toContain('dependencies');
  });
});
