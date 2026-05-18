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
  buildArtifactDAG,
  validateArtifactDAG,
  buildWaves,
  cmdExecutePhaseDryRun,
} = require('../../lib/deps');
const { COMMAND_DESCRIPTORS } = require('../../lib/mcp-server');

// ─── Helper ───────────────────────────────────────────────────────────────────

type PlanArtifactOverrides = {
  objective?: string;
  files_modified?: string[];
  phase?: string;
  plan?: number;
  type?: string;
  wave?: number;
  depends_on?: string[];
  autonomous?: boolean;
  provides?: string[];
  requires?: string[];
  integration_points?: string[];
};

function makePlan(overrides: PlanArtifactOverrides = {}): Record<string, unknown> {
  return {
    objective: 'test',
    files_modified: ['lib/test.ts'],
    phase: '94-graph-of-thought-synthesis',
    plan: 1,
    type: 'execute',
    wave: 1,
    depends_on: [],
    autonomous: true,
    provides: [],
    requires: [],
    integration_points: [],
    ...overrides,
  };
}

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

  test('sorts sub-phase IDs component-wise to avoid parseFloat collision (1.1 vs 1.10)', () => {
    // parseFloat('1.10') === parseFloat('1.1') === 1.1 — component-wise sort must distinguish them
    const graph = {
      nodes: [
        { id: '1.10', name: 'TenthSub' },
        { id: '1.2', name: 'SecondSub' },
        { id: '1.1', name: 'FirstSub' },
      ],
      edges: [],
    };
    const groups = computeParallelGroups(graph);
    expect(groups).toHaveLength(1);
    // Component-wise order: 1.1 < 1.2 < 1.10
    expect(groups[0]).toEqual(['1.1', '1.2', '1.10']);
  });

  test('component-wise sort handles mixed-depth IDs (1 vs 1.1) via ?? 0 fallback', () => {
    // '1' has 1 component, '1.1' has 2 — the ?? 0 fallback fires for the missing component
    const graph = {
      nodes: [
        { id: '1.1', name: 'Sub' },
        { id: '1', name: 'Root' },
        { id: '2', name: 'Other' },
      ],
      edges: [],
    };
    const groups = computeParallelGroups(graph);
    expect(groups).toHaveLength(1);
    // '1' < '1.1' < '2' component-wise
    expect(groups[0]).toEqual(['1', '1.1', '2']);
  });

  test('component-wise sort returns 0 for numerically-equal but differently-spelled IDs', () => {
    // '01' and '1' both parse to Number 1, so d = 0 and the comparator returns 0
    const graph = {
      nodes: [
        { id: '01', name: 'A' },
        { id: '1', name: 'B' },
        { id: '2', name: 'C' },
      ],
      edges: [],
    };
    const groups = computeParallelGroups(graph);
    expect(groups).toHaveLength(1);
    // '01' and '1' tie-break at 0; '2' sorts last
    expect(groups[0]).toHaveLength(3);
    expect(groups[0]).toContain('2');
  });

  test('returns partial groups when cycle present (breaks out of loop)', () => {
    // A depends on B, B depends on A — both should be un-processable
    // But C is independent and should appear in its own group first
    const graph = {
      nodes: [
        { id: '10', name: 'C' }, // independent
        { id: '11', name: 'A' },
        { id: '12', name: 'B' },
      ],
      edges: [
        { from: '11', to: '12' }, // A depends on B
        { from: '12', to: '11' }, // B depends on A (cycle)
      ],
    };
    const groups = computeParallelGroups(graph);
    // C (10) should appear in first group; cycle pair (11, 12) should not appear
    expect(groups.length).toBeGreaterThanOrEqual(1);
    expect(groups[0]).toContain('10');
    // 11 and 12 are stuck in a cycle and will not be assigned
    const allAssigned = groups.flat();
    expect(allAssigned).not.toContain('11');
    expect(allAssigned).not.toContain('12');
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

  test('returns error for empty ROADMAP.md (no phases)', () => {
    fixtureDir = createFixtureDir();
    // Write a ROADMAP.md with no phases section
    writeCustomRoadmap(fixtureDir, '# Roadmap\n\nNo phases defined yet.\n');

    const { stdout } = captureOutput(() => {
      cmdPhaseAnalyzeDeps(fixtureDir, false);
    });
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
    const descriptor = COMMAND_DESCRIPTORS.find(
      (d: Record<string, unknown>) => d.name === 'grd_phase_analyze_deps'
    ) as Record<string, unknown>;
    expect(descriptor).toBeDefined();
    expect(descriptor.params).toEqual([]);
    expect(typeof descriptor.execute).toBe('function');
    expect(descriptor.description).toContain('dependencies');
  });
});

// ─── buildArtifactDAG ────────────────────────────────────────────────────────

describe('buildArtifactDAG', () => {
  test('returns empty DAG for empty input', () => {
    const dag = buildArtifactDAG([]);
    expect(dag.nodes).toEqual([]);
    expect(dag.edges).toEqual([]);
    expect(dag.sorted_plans).toEqual([]);
    expect(dag.providers).toEqual({});
  });

  test('builds single-node DAG for one plan', () => {
    const plan = makePlan({ plan: 1, provides: ['lib/foo.ts:bar'], requires: [] });
    const dag = buildArtifactDAG([plan]);
    expect(dag.nodes).toHaveLength(1);
    expect(dag.edges).toHaveLength(0);
    expect(dag.sorted_plans).toHaveLength(1);
    expect(dag.sorted_plans[0]).toBe('94-graph-of-thought-synthesis-01');
    expect(dag.providers['lib/foo.ts:bar']).toBe('94-graph-of-thought-synthesis-01');
  });

  test('builds edges from requires to provides', () => {
    const planA = makePlan({ plan: 1, provides: ['lib/foo.ts:X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: [], requires: ['lib/foo.ts:X'] });
    const dag = buildArtifactDAG([planA, planB]);

    expect(dag.nodes).toHaveLength(2);
    expect(dag.edges).toHaveLength(1);
    expect(dag.edges[0].from_plan).toBe('94-graph-of-thought-synthesis-02');
    expect(dag.edges[0].to_plan).toBe('94-graph-of-thought-synthesis-01');
    expect(dag.edges[0].type).toBe('requires');
    // A (provider) must come before B (consumer) in topological order
    const idxA = dag.sorted_plans.indexOf('94-graph-of-thought-synthesis-01');
    const idxB = dag.sorted_plans.indexOf('94-graph-of-thought-synthesis-02');
    expect(idxA).toBeLessThan(idxB);
  });

  test('handles multiple provides and requires', () => {
    const planA = makePlan({ plan: 1, provides: ['X', 'Y'], requires: [] });
    const planB = makePlan({ plan: 2, provides: [], requires: ['X'] });
    const planC = makePlan({ plan: 3, provides: [], requires: ['Y', 'X'] });
    const dag = buildArtifactDAG([planA, planB, planC]);

    // planA has no deps; planB and planC both depend on planA
    expect(dag.edges).toHaveLength(3); // B→A (X), C→A (Y), C→A (X)
    const idxA = dag.sorted_plans.indexOf('94-graph-of-thought-synthesis-01');
    const idxB = dag.sorted_plans.indexOf('94-graph-of-thought-synthesis-02');
    const idxC = dag.sorted_plans.indexOf('94-graph-of-thought-synthesis-03');
    expect(idxA).toBeLessThan(idxB);
    expect(idxA).toBeLessThan(idxC);
  });

  test('providers map is correct for multiple plans', () => {
    const planA = makePlan({ plan: 1, provides: ['artifact:A'], requires: [] });
    const planB = makePlan({ plan: 2, provides: ['artifact:B'], requires: [] });
    const planC = makePlan({ plan: 3, provides: ['artifact:C'], requires: [] });
    const dag = buildArtifactDAG([planA, planB, planC]);

    expect(dag.providers['artifact:A']).toBe('94-graph-of-thought-synthesis-01');
    expect(dag.providers['artifact:B']).toBe('94-graph-of-thought-synthesis-02');
    expect(dag.providers['artifact:C']).toBe('94-graph-of-thought-synthesis-03');
  });

  test('topological sort is correct for diamond dependency', () => {
    // A provides X, B provides Y (requires X), C provides Z (requires X), D requires Y and Z
    const planA = makePlan({ plan: 1, provides: ['X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: ['Y'], requires: ['X'] });
    const planC = makePlan({ plan: 3, provides: ['Z'], requires: ['X'] });
    const planD = makePlan({ plan: 4, provides: [], requires: ['Y', 'Z'] });
    const dag = buildArtifactDAG([planA, planB, planC, planD]);

    const idxA = dag.sorted_plans.indexOf('94-graph-of-thought-synthesis-01');
    const idxB = dag.sorted_plans.indexOf('94-graph-of-thought-synthesis-02');
    const idxC = dag.sorted_plans.indexOf('94-graph-of-thought-synthesis-03');
    const idxD = dag.sorted_plans.indexOf('94-graph-of-thought-synthesis-04');

    // A must be first, D must be last
    expect(idxA).toBeLessThan(idxB);
    expect(idxA).toBeLessThan(idxC);
    expect(idxB).toBeLessThan(idxD);
    expect(idxC).toBeLessThan(idxD);
  });

  test('handles plans with no provides or requires', () => {
    const planA = makePlan({ plan: 1, provides: [], requires: [] });
    const planB = makePlan({ plan: 2, provides: [], requires: [] });
    const dag = buildArtifactDAG([planA, planB]);

    expect(dag.nodes).toHaveLength(2);
    expect(dag.edges).toHaveLength(0);
    expect(dag.sorted_plans).toHaveLength(2);
  });

  test('integration_points create soft edges when provider exists', () => {
    const planA = makePlan({ plan: 1, provides: ['X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: [], requires: [], integration_points: ['X'] });
    const dag = buildArtifactDAG([planA, planB]);

    expect(dag.edges).toHaveLength(1);
    expect(dag.edges[0].type).toBe('integration');
    expect(dag.edges[0].from_plan).toBe('94-graph-of-thought-synthesis-02');
    expect(dag.edges[0].to_plan).toBe('94-graph-of-thought-synthesis-01');
  });

  test('integration_points do not create edges when provider does not exist', () => {
    const planA = makePlan({ plan: 1, provides: [], requires: [], integration_points: ['NonExistent'] });
    const dag = buildArtifactDAG([planA]);

    expect(dag.edges).toHaveLength(0);
  });

  test('first declaration wins for duplicate providers', () => {
    const planA = makePlan({ plan: 1, provides: ['X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: ['X'], requires: [] }); // also provides X
    const dag = buildArtifactDAG([planA, planB]);

    // First declaration wins
    expect(dag.providers['X']).toBe('94-graph-of-thought-synthesis-01');
  });
});

// ─── validateArtifactDAG ─────────────────────────────────────────────────────

describe('validateArtifactDAG', () => {
  test('valid for acyclic graph — linear chain A→B→C', () => {
    const planA = makePlan({ plan: 1, provides: ['A'], requires: [] });
    const planB = makePlan({ plan: 2, provides: ['B'], requires: ['A'] });
    const planC = makePlan({ plan: 3, provides: ['C'], requires: ['B'] });
    const plans = [planA, planB, planC];
    const dag = buildArtifactDAG(plans);
    const result = validateArtifactDAG(dag, plans);

    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
    expect(result.missing_deps).toHaveLength(0);
  });

  test('detects simple two-node cycle', () => {
    const planA = makePlan({ plan: 1, provides: ['A'], requires: ['B'] });
    const planB = makePlan({ plan: 2, provides: ['B'], requires: ['A'] });
    const plans = [planA, planB];
    const dag = buildArtifactDAG(plans);
    const result = validateArtifactDAG(dag, plans);

    expect(result.valid).toBe(false);
    expect(result.cycles).toHaveLength(1);
    const cycleNodes = result.cycles[0];
    expect(cycleNodes).toContain('94-graph-of-thought-synthesis-01');
    expect(cycleNodes).toContain('94-graph-of-thought-synthesis-02');
  });

  test('detects multi-node cycle (A→B→C→A)', () => {
    const planA = makePlan({ plan: 1, provides: ['A'], requires: ['C'] });
    const planB = makePlan({ plan: 2, provides: ['B'], requires: ['A'] });
    const planC = makePlan({ plan: 3, provides: ['C'], requires: ['B'] });
    const plans = [planA, planB, planC];
    const dag = buildArtifactDAG(plans);
    const result = validateArtifactDAG(dag, plans);

    expect(result.valid).toBe(false);
    expect(result.cycles).toHaveLength(1);
    const cycleNodes = result.cycles[0];
    expect(cycleNodes).toContain('94-graph-of-thought-synthesis-01');
    expect(cycleNodes).toContain('94-graph-of-thought-synthesis-02');
    expect(cycleNodes).toContain('94-graph-of-thought-synthesis-03');
  });

  test('detects missing dependency', () => {
    const planA = makePlan({ plan: 1, provides: [], requires: ['NonExistentArtifact'] });
    const plans = [planA];
    const dag = buildArtifactDAG(plans);
    const result = validateArtifactDAG(dag, plans);

    expect(result.valid).toBe(false);
    expect(result.missing_deps).toHaveLength(1);
    expect(result.missing_deps[0].plan).toBe('94-graph-of-thought-synthesis-01');
    expect(result.missing_deps[0].artifact).toBe('NonExistentArtifact');
  });

  test('warns on unused provides', () => {
    const planA = makePlan({ plan: 1, provides: ['X'], requires: [] });
    const plans = [planA];
    const dag = buildArtifactDAG(plans);
    const result = validateArtifactDAG(dag, plans);

    // X is provided but nobody requires it
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w: string) => w.includes('Unused') && w.includes('"X"'))).toBe(true);
  });

  test('warns on duplicate provides', () => {
    const planA = makePlan({ plan: 1, provides: ['X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: ['X'], requires: [] }); // duplicate
    const plans = [planA, planB];
    const dag = buildArtifactDAG(plans);
    const result = validateArtifactDAG(dag, plans);

    expect(result.warnings.some((w: string) => w.includes('Duplicate') && w.includes('"X"'))).toBe(true);
  });

  test('valid with no issues — clean DAG', () => {
    // A provides X, B requires X and provides Y, C requires Y
    // No cycle, no missing deps, no unused provides, no duplicates
    const planA = makePlan({ plan: 1, provides: ['X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: ['Y'], requires: ['X'] });
    const planC = makePlan({ plan: 3, provides: [], requires: ['Y'] });
    const plans = [planA, planB, planC];
    const dag = buildArtifactDAG(plans);
    const result = validateArtifactDAG(dag, plans);

    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
    expect(result.missing_deps).toHaveLength(0);
    // No warnings: X is required by planB, Y is required by planC — no unused; no duplicates
    expect(result.warnings).toHaveLength(0);
  });

  test('integration_points count as referenced — no unused warning for integrated artifacts', () => {
    const planA = makePlan({ plan: 1, provides: ['X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: [], requires: [], integration_points: ['X'] });
    const plans = [planA, planB];
    const dag = buildArtifactDAG(plans);
    const result = validateArtifactDAG(dag, plans);

    // X is referenced as an integration_point so it should NOT generate unused warning
    const hasUnusedX = result.warnings.some((w: string) => w.includes('Unused') && w.includes('"X"'));
    expect(hasUnusedX).toBe(false);
  });

  test('missing_requires is empty when all requires are satisfied', () => {
    const planA = makePlan({ plan: 1, provides: ['lib/foo.ts:X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: [], requires: ['lib/foo.ts:X'] });
    const dag = buildArtifactDAG([planA, planB]);
    expect(dag.missing_requires).toEqual([]);
  });

  test('missing_requires includes artifact names with no matching provider', () => {
    const planA = makePlan({ plan: 1, provides: [], requires: ['lib/missing.ts:NoProvider'] });
    const dag = buildArtifactDAG([planA]);
    expect(dag.missing_requires).toContain('lib/missing.ts:NoProvider');
  });

  test('missing_requires is empty for empty plan set', () => {
    const dag = buildArtifactDAG([]);
    expect(dag.missing_requires).toEqual([]);
  });

  test('missing_requires collects multiple unresolvable requires', () => {
    const planA = makePlan({ plan: 1, provides: [], requires: ['ArtX', 'ArtY'] });
    const dag = buildArtifactDAG([planA]);
    expect(dag.missing_requires).toContain('ArtX');
    expect(dag.missing_requires).toContain('ArtY');
  });

  test('self-dependency: plan requiring artifact it also provides creates no edge and no missing_requires', () => {
    // A plan that provides and requires the same artifact should not create an edge to itself
    const planA = makePlan({ plan: 1, provides: ['lib/self.ts:X'], requires: ['lib/self.ts:X'] });
    const dag = buildArtifactDAG([planA]);
    expect(dag.edges).toHaveLength(0);
    expect(dag.missing_requires).toHaveLength(0);
  });
});

// ─── cmdPhaseDepsVisualize ───────────────────────────────────────────────────

const { cmdPhaseDepsVisualize } = require('../../lib/deps');

describe('cmdPhaseDepsVisualize', () => {
  let fixtureDir: string;

  afterEach(() => {
    if (fixtureDir) {
      cleanupFixtureDir(fixtureDir);
      fixtureDir = '';
    }
  });

  function writeRoadmap(dir: string, content: string): void {
    const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
    fs.writeFileSync(roadmapPath, content, 'utf-8');
  }

  test('renders mermaid diagram for simple two-phase roadmap', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '## M1 v1.0: Test',
        '### Phase 1: Alpha',
        '**Goal:** do alpha',
        '**Depends on:** Nothing',
        '### Phase 2: Beta',
        '**Goal:** do beta',
        '**Depends on:** Phase 1',
      ].join('\n')
    );

    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseDepsVisualize(fixtureDir, { format: 'mermaid' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.format).toBe('mermaid');
    expect(parsed.diagram).toContain('flowchart LR');
    expect(parsed.phase_count).toBe(2);
    expect(parsed.has_cycle).toBe(false);
  });

  test('renders ascii diagram', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '## M1 v1.0: Test',
        '### Phase 1: First',
        '**Goal:** go',
        '**Depends on:** Nothing',
      ].join('\n')
    );

    const { stdout } = captureOutput(() => {
      cmdPhaseDepsVisualize(fixtureDir, { format: 'ascii' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.format).toBe('ascii');
    expect(parsed.diagram).toContain('Group 1');
    expect(parsed.diagram).toContain('Phase 1');
  });

  test('defaults to mermaid when format not specified', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(
      fixtureDir,
      ['# Roadmap', '## M1 v1.0: Test', '### Phase 1: X', '**Goal:** go', '**Depends on:** Nothing'].join('\n')
    );
    const { stdout } = captureOutput(() => {
      cmdPhaseDepsVisualize(fixtureDir, {}, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.format).toBe('mermaid');
  });

  test('returns error for missing ROADMAP.md', () => {
    fixtureDir = createFixtureDir();
    const roadmapPath = path.join(fixtureDir, '.planning', 'ROADMAP.md');
    if (fs.existsSync(roadmapPath)) fs.unlinkSync(roadmapPath);

    const { stdout } = captureOutput(() => {
      cmdPhaseDepsVisualize(fixtureDir, {}, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeDefined();
  });

  test('flags cycle in mermaid output', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '## M1 v1.0: Test',
        '### Phase 1: Alpha',
        '**Goal:** go',
        '**Depends on:** Phase 2',
        '### Phase 2: Beta',
        '**Goal:** go',
        '**Depends on:** Phase 1',
      ].join('\n')
    );
    const { stdout } = captureOutput(() => {
      cmdPhaseDepsVisualize(fixtureDir, { format: 'mermaid' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.has_cycle).toBe(true);
    expect(parsed.diagram).toContain('WARNING');
  });

  test('raw mode returns the diagram text', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(
      fixtureDir,
      ['# Roadmap', '## M1 v1.0: Test', '### Phase 1: X', '**Goal:** go', '**Depends on:** Nothing'].join('\n')
    );
    const { stdout } = captureOutput(() => {
      cmdPhaseDepsVisualize(fixtureDir, { format: 'mermaid' }, true);
    });
    expect(stdout).toContain('flowchart LR');
  });

  test('milestone filter returns error when no matching phases', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(
      fixtureDir,
      ['# Roadmap', '## M1 v1.0: Test', '### Phase 1: X', '**Goal:** go', '**Depends on:** Nothing'].join('\n')
    );
    const { stdout } = captureOutput(() => {
      cmdPhaseDepsVisualize(fixtureDir, { milestone: 'nonexistent-milestone-xyz' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeDefined();
  });

  test('ascii format with dependency shows dep arrows', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '## M1 v1.0: Test',
        '### Phase 1: Alpha',
        '**Goal:** do alpha',
        '**Depends on:** Nothing',
        '### Phase 2: Beta',
        '**Goal:** do beta',
        '**Depends on:** Phase 1',
      ].join('\n')
    );
    const { stdout } = captureOutput(() => {
      cmdPhaseDepsVisualize(fixtureDir, { format: 'ascii' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.format).toBe('ascii');
    // Phase 2 depends on Phase 1 — should show arrow
    expect(parsed.diagram).toContain('depends on');
  });

  test('ascii format with cycle shows warning', () => {
    fixtureDir = createFixtureDir();
    writeRoadmap(
      fixtureDir,
      [
        '# Roadmap',
        '## M1 v1.0: Test',
        '### Phase 1: Alpha',
        '**Goal:** go',
        '**Depends on:** Phase 2',
        '### Phase 2: Beta',
        '**Goal:** go',
        '**Depends on:** Phase 1',
      ].join('\n')
    );
    const { stdout } = captureOutput(() => {
      cmdPhaseDepsVisualize(fixtureDir, { format: 'ascii' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.has_cycle).toBe(true);
    expect(parsed.diagram).toContain('Cycle detected');
  });
});

// ─── buildWaves ──────────────────────────────────────────────────────────────

describe('buildWaves', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makePhaseDir(plans: Array<{ name: string; wave?: number; agentType?: string; files?: string[] }>): string {
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'grd-waves-'));
    for (const p of plans) {
      const fm = [
        '---',
        `phase: 1`,
        `plan: 01`,
        `type: execute`,
        `wave: ${p.wave ?? 1}`,
        `agent_type: ${p.agentType ?? 'grd-executor'}`,
        `files_modified: [${(p.files ?? []).join(', ')}]`,
        `depends_on: []`,
        `autonomous: true`,
        `must_haves:`,
        `  truths: []`,
        '---',
        '',
        '## Objective',
        'test',
      ].join('\n');
      fs.writeFileSync(path.join(tmpDir, p.name), fm, 'utf-8');
    }
    return tmpDir;
  }

  test('groups plans by wave number', () => {
    const dir = makePhaseDir([
      { name: '01-01-PLAN.md', wave: 1 },
      { name: '01-02-PLAN.md', wave: 2 },
      { name: '01-03-PLAN.md', wave: 1 },
    ]);
    const waves = buildWaves(dir);
    expect(waves).toHaveLength(2);
    expect(waves[0].wave).toBe(1);
    expect(waves[0].plans).toHaveLength(2);
    expect(waves[1].wave).toBe(2);
    expect(waves[1].plans).toHaveLength(1);
  });

  test('defaults to wave 1 when no wave frontmatter', () => {
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'grd-waves-'));
    fs.writeFileSync(path.join(tmpDir, 'PLAN.md'), '# Plan\n\nNo frontmatter', 'utf-8');
    const waves = buildWaves(tmpDir);
    expect(waves).toHaveLength(1);
    expect(waves[0].wave).toBe(1);
  });

  test('returns empty array for nonexistent directory', () => {
    const waves = buildWaves('/nonexistent/path/does/not/exist');
    expect(waves).toEqual([]);
  });

  test('returns empty array when no plan files present', () => {
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'grd-waves-'));
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Not a plan', 'utf-8');
    const waves = buildWaves(tmpDir);
    expect(waves).toEqual([]);
  });

  test('extracts target_files from files_modified frontmatter', () => {
    const dir = makePhaseDir([
      { name: '01-01-PLAN.md', wave: 1, files: ['lib/foo.ts', 'lib/bar.ts'] },
    ]);
    const waves = buildWaves(dir);
    expect(waves[0].plans[0].target_files).toEqual(['lib/foo.ts', 'lib/bar.ts']);
  });
});

// ─── cmdExecutePhaseDryRun ────────────────────────────────────────────────────

describe('cmdExecutePhaseDryRun', () => {
  let fixtureDir: string;

  afterEach(() => {
    if (fixtureDir) cleanupFixtureDir(fixtureDir);
  });

  test('errors for unknown phase', () => {
    fixtureDir = createFixtureDir();
    const { exitCode } = captureError(() => {
      cmdExecutePhaseDryRun(fixtureDir, '999', false);
    });
    expect(exitCode).toBe(1);
  });

  test('returns dry_run:true and wave data for valid phase with plans', () => {
    fixtureDir = createFixtureDir();
    // The fixture already has 01-test with 01-01-PLAN.md
    const { stdout, exitCode } = captureOutput(() => {
      cmdExecutePhaseDryRun(fixtureDir, '01', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.dry_run).toBe(true);
    expect(parsed.wave_count).toBeGreaterThanOrEqual(1);
  });

  test('raw=true output includes wave table text', () => {
    fixtureDir = createFixtureDir();
    // The fixture already has 01-test with 01-01-PLAN.md
    const { stdout, exitCode } = captureOutput(() => {
      cmdExecutePhaseDryRun(fixtureDir, '01', true);
    });
    expect(exitCode).toBe(0);
    // raw=true still outputs JSON (output() serializes to stdout) but with rawValue as string
    expect(stdout.trim().length).toBeGreaterThan(0);
  });
});
