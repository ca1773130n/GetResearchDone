/**
 * Unit tests for lib/got.ts — GoT Synthesis Execution Engine
 *
 * Tests freezeInterfaces, buildNodePrompt, runSmokeTest, and executeArtifactDAG.
 */

'use strict';

const {
  freezeInterfaces,
  buildNodePrompt,
  runSmokeTest,
  executeArtifactDAG,
} = require('../../lib/got') as {
  freezeInterfaces: (dag: import('../../lib/types').ArtifactDAG) => import('../../lib/types').FrozenInterface[];
  buildNodePrompt: (
    node: import('../../lib/types').ArtifactDAGNode,
    frozenInterfaces: import('../../lib/types').FrozenInterface[],
    context: import('../../lib/types').NodePromptContext
  ) => string;
  runSmokeTest: (
    node: import('../../lib/types').ArtifactDAGNode,
    result: import('../../lib/types').NodeExecutionResult
  ) => import('../../lib/types').SmokeTestResult;
  executeArtifactDAG: (
    dag: import('../../lib/types').ArtifactDAG,
    options?: import('../../lib/types').GoTExecuteOptions
  ) => import('../../lib/types').GoTExecutionResult;
};

// Use untyped require for buildArtifactDAG so that Record<string, unknown> test helpers are accepted
// (same pattern as deps.test.ts)
const { buildArtifactDAG } = require('../../lib/deps');

// ─── Helper ───────────────────────────────────────────────────────────────────

type PlanArtifactOverrides = {
  phase?: string;
  plan?: number;
  provides?: string[];
  requires?: string[];
  integration_points?: string[];
};

function makePlan(overrides: PlanArtifactOverrides = {}): Record<string, unknown> {
  return {
    objective: 'test',
    files_modified: ['lib/test.ts'],
    phase: '98-got-synthesis-execution-engine',
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

// ─── freezeInterfaces ─────────────────────────────────────────────────────────

describe('freezeInterfaces', () => {
  test('returns empty array for empty DAG', () => {
    const dag = buildArtifactDAG([]);
    const frozen = freezeInterfaces(dag);
    expect(frozen).toEqual([]);
  });

  test('creates contract for each provides artifact', () => {
    const plan = makePlan({ plan: 1, provides: ['lib/foo.ts:A', 'lib/bar.ts:B'], requires: [] });
    const dag = buildArtifactDAG([plan]);
    const frozen = freezeInterfaces(dag);
    expect(frozen).toHaveLength(2);
    expect(frozen[0].artifact).toBe('lib/foo.ts:A');
    expect(frozen[1].artifact).toBe('lib/bar.ts:B');
  });

  test('includes plan_id and artifact in contract string', () => {
    const plan = makePlan({ plan: 1, provides: ['lib/got.ts:executeArtifactDAG'], requires: [] });
    const dag = buildArtifactDAG([plan]);
    const frozen = freezeInterfaces(dag);
    expect(frozen).toHaveLength(1);
    expect(frozen[0].contract).toContain(frozen[0].plan_id);
    expect(frozen[0].contract).toContain('lib/got.ts:executeArtifactDAG');
  });

  test('handles multiple plans with provides', () => {
    const planA = makePlan({ plan: 1, provides: ['artifact:X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: ['artifact:Y'], requires: [] });
    const planC = makePlan({ plan: 3, provides: ['artifact:Z'], requires: [] });
    const dag = buildArtifactDAG([planA, planB, planC]);
    const frozen = freezeInterfaces(dag);
    expect(frozen).toHaveLength(3);
    const planIds = frozen.map((f) => f.plan_id);
    expect(planIds).toContain('98-got-synthesis-execution-engine-01');
    expect(planIds).toContain('98-got-synthesis-execution-engine-02');
    expect(planIds).toContain('98-got-synthesis-execution-engine-03');
  });
});

// ─── buildNodePrompt ──────────────────────────────────────────────────────────

describe('buildNodePrompt', () => {
  test('includes node provides and requires in prompt', () => {
    const plan = makePlan({ plan: 1, provides: ['lib/got.ts:freezeInterfaces'], requires: ['lib/types.ts:ArtifactDAG'] });
    const dag = buildArtifactDAG([plan]);
    const node = dag.nodes[0];
    const prompt = buildNodePrompt(node, [], {
      phase_name: 'test-phase',
      phase_dir: '/some/path',
    });
    expect(prompt).toContain('lib/got.ts:freezeInterfaces');
    expect(prompt).toContain('lib/types.ts:ArtifactDAG');
  });

  test('includes frozen contracts for required artifacts', () => {
    const planA = makePlan({ plan: 1, provides: ['lib/foo.ts:X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: [], requires: ['lib/foo.ts:X'] });
    const dag = buildArtifactDAG([planA, planB]);
    const frozen = freezeInterfaces(dag);
    const nodeB = (dag.nodes as import('../../lib/types').ArtifactDAGNode[]).find((n) => n.id === '98-got-synthesis-execution-engine-02');
    expect(nodeB).toBeDefined();
    const prompt = buildNodePrompt(nodeB!, frozen, {
      phase_name: 'test-phase',
      phase_dir: '/some/path',
    });
    // The frozen contract for lib/foo.ts:X should appear in nodeB's prompt
    expect(prompt).toContain('lib/foo.ts:X');
    expect(prompt).toContain('FROZEN CONTRACT');
  });

  test('includes phase context paths', () => {
    const plan = makePlan({ plan: 1, provides: [], requires: [] });
    const dag = buildArtifactDAG([plan]);
    const node = dag.nodes[0];
    const prompt = buildNodePrompt(node, [], {
      phase_name: '98-got-synthesis-execution-engine',
      phase_dir: '.planning/milestones/v0.3.23/phases/98-got-synthesis-execution-engine',
      research_dir: '.planning/milestones/v0.3.23/research',
    });
    expect(prompt).toContain('98-got-synthesis-execution-engine');
    expect(prompt).toContain('.planning/milestones/v0.3.23/phases/98-got-synthesis-execution-engine');
  });
});

// ─── runSmokeTest ─────────────────────────────────────────────────────────────

describe('runSmokeTest', () => {
  test('passes when all provides are in artifacts_produced', () => {
    const plan = makePlan({ plan: 1, provides: ['X', 'Y'], requires: [] });
    const dag = buildArtifactDAG([plan]);
    const node = dag.nodes[0];
    const result = {
      node_id: node.id,
      success: true,
      artifacts_produced: ['X', 'Y'],
    };
    const smoke = runSmokeTest(node, result);
    expect(smoke.passed).toBe(true);
    expect(smoke.missing_artifacts).toEqual([]);
  });

  test('fails when artifacts are missing', () => {
    const plan = makePlan({ plan: 1, provides: ['X', 'Y'], requires: [] });
    const dag = buildArtifactDAG([plan]);
    const node = dag.nodes[0];
    const result = {
      node_id: node.id,
      success: true,
      artifacts_produced: ['X'],
    };
    const smoke = runSmokeTest(node, result);
    expect(smoke.passed).toBe(false);
    expect(smoke.missing_artifacts).toContain('Y');
  });

  test('fails when execution failed', () => {
    const plan = makePlan({ plan: 1, provides: ['X', 'Y'], requires: [] });
    const dag = buildArtifactDAG([plan]);
    const node = dag.nodes[0];
    const result = {
      node_id: node.id,
      success: false,
      artifacts_produced: ['X', 'Y'],
      error: 'agent crashed',
    };
    const smoke = runSmokeTest(node, result);
    expect(smoke.passed).toBe(false);
    expect(smoke.message).toContain('agent crashed');
  });
});

// ─── executeArtifactDAG ───────────────────────────────────────────────────────

describe('executeArtifactDAG', () => {
  test('returns empty result for empty DAG', () => {
    const dag = buildArtifactDAG([]);
    const result = executeArtifactDAG(dag);
    expect(result.waves).toEqual([]);
    expect(result.results).toEqual([]);
    expect(result.success).toBe(true);
  });

  test('groups independent nodes into same wave', () => {
    const planA = makePlan({ plan: 1, provides: ['artifact:A'], requires: [] });
    const planB = makePlan({ plan: 2, provides: ['artifact:B'], requires: [] });
    const dag = buildArtifactDAG([planA, planB]);
    const result = executeArtifactDAG(dag);
    // Both are independent — should be in the same wave
    expect(result.waves).toHaveLength(1);
    expect(result.waves[0]).toHaveLength(2);
  });

  test('groups dependent nodes into sequential waves', () => {
    const planA = makePlan({ plan: 1, provides: ['lib/x.ts:X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: [], requires: ['lib/x.ts:X'] });
    const dag = buildArtifactDAG([planA, planB]);
    const result = executeArtifactDAG(dag);
    expect(result.waves).toHaveLength(2);
    expect(result.waves[0]).toContain('98-got-synthesis-execution-engine-01');
    expect(result.waves[1]).toContain('98-got-synthesis-execution-engine-02');
  });

  test('dryRun produces stub success results', () => {
    const planA = makePlan({ plan: 1, provides: ['artifact:A'], requires: [] });
    const planB = makePlan({ plan: 2, provides: ['artifact:B'], requires: [] });
    const dag = buildArtifactDAG([planA, planB]);
    const result = executeArtifactDAG(dag, { dryRun: true });
    expect(result.success).toBe(true);
    for (const r of result.results) {
      expect(r.success).toBe(true);
    }
    // Verify smoke tests all passed
    for (const s of result.smoke_tests) {
      expect(s.passed).toBe(true);
    }
  });

  test('handles diamond dependency correctly', () => {
    // A provides X; B requires X, provides Y; C requires X, provides Z; D requires Y and Z
    const planA = makePlan({ plan: 1, provides: ['X'], requires: [] });
    const planB = makePlan({ plan: 2, provides: ['Y'], requires: ['X'] });
    const planC = makePlan({ plan: 3, provides: ['Z'], requires: ['X'] });
    const planD = makePlan({ plan: 4, provides: [], requires: ['Y', 'Z'] });
    const dag = buildArtifactDAG([planA, planB, planC, planD]);
    const result = executeArtifactDAG(dag);

    // A in wave 0, B+C in wave 1, D in wave 2
    expect(result.waves).toHaveLength(3);
    expect(result.waves[0]).toContain('98-got-synthesis-execution-engine-01');
    expect(result.waves[1]).toContain('98-got-synthesis-execution-engine-02');
    expect(result.waves[1]).toContain('98-got-synthesis-execution-engine-03');
    expect(result.waves[2]).toContain('98-got-synthesis-execution-engine-04');
  });

  test('handles synthetic cyclic DAG without crashing', () => {
    // Craft a synthetic DAG with a mutual cycle: A→B→A (both require each other)
    // This bypasses buildArtifactDAG validation to exercise the cycle-handling branch
    const syntheticDag = {
      nodes: [
        { id: 'plan-A', plan_number: 1, provides: ['X'], requires: ['Y'], integration_points: [] },
        { id: 'plan-B', plan_number: 2, provides: ['Y'], requires: ['X'], integration_points: [] },
      ],
      edges: [
        { from_plan: 'plan-A', to_plan: 'plan-B', artifact: 'Y', type: 'requires' as const },
        { from_plan: 'plan-B', to_plan: 'plan-A', artifact: 'X', type: 'requires' as const },
      ],
      sorted_plans: ['plan-A', 'plan-B'],
      providers: { X: 'plan-A', Y: 'plan-B' },
    };
    // Should not throw — cycle detection emits a fallback wave
    const result = executeArtifactDAG(syntheticDag as unknown as import('../../lib/types').ArtifactDAG);
    expect(result.waves).toHaveLength(1);
    expect(result.waves[0]).toContain('plan-A');
    expect(result.waves[0]).toContain('plan-B');
  });

  test('non-dryRun mode returns failure result', () => {
    const planA = makePlan({ plan: 1, provides: ['artifact:A'], requires: [] });
    const dag = buildArtifactDAG([planA]);
    // dryRun: false — real execution is not implemented, should return failure
    const result = executeArtifactDAG(dag, { dryRun: false });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
    expect(result.results[0].error).toContain('not implemented');
  });
});
