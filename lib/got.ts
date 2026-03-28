'use strict';

/**
 * GRD GoT Synthesis Execution Engine -- Artifact DAG execution with frozen interface contracts.
 *
 * This module implements the Graph-of-Thought (GoT) execution engine that:
 * 1. Freezes interface contracts for all DAG nodes' provided artifacts.
 * 2. Builds structured execution prompts for individual DAG nodes.
 * 3. Runs smoke tests to verify a node produced all declared artifacts.
 * 4. Orchestrates topological-wave execution of an ArtifactDAG (dry-run by default).
 *
 * The actual agent spawning is NOT implemented here — that is the caller's
 * (autopilot's) responsibility. executeArtifactDAG operates in "dry-run" mode
 * by default, returning stub results.
 *
 * Created in Phase 98.
 */

import type {
  ArtifactDAG,
  ArtifactDAGNode,
  FrozenInterface,
  NodeExecutionResult,
  SmokeTestResult,
  GoTExecuteOptions,
  GoTExecutionResult,
  NodePromptContext,
} from './types';

const {
  buildArtifactDAG,
}: {
  buildArtifactDAG: (plans: import('./types').PlanArtifact[]) => ArtifactDAG;
} = require('./deps');

// ─── freezeInterfaces ─────────────────────────────────────────────────────────

/**
 * Freeze interface contracts for all artifact-providing nodes in the DAG.
 *
 * For each node that declares `provides` artifacts, creates a FrozenInterface
 * entry containing the plan_id, artifact name, and a contract comment string.
 * Downstream nodes can reference these frozen contracts when building prompts.
 *
 * @param dag - The artifact DAG built from plan artifacts
 * @returns Array of FrozenInterface entries for all provides declarations
 */
function freezeInterfaces(dag: ArtifactDAG): FrozenInterface[] {
  const frozen: FrozenInterface[] = [];

  for (const node of dag.nodes) {
    for (const artifact of node.provides) {
      frozen.push({
        plan_id: node.id,
        artifact,
        contract: `// FROZEN CONTRACT: ${artifact} provided by plan ${node.id}\n// Downstream plans may depend on this interface.`,
      });
    }
  }

  return frozen;
}

// ─── buildNodePrompt ──────────────────────────────────────────────────────────

/**
 * Build an execution prompt string for a single DAG node.
 *
 * The prompt includes:
 * 1. Header with node ID and phase name.
 * 2. Section listing what this node provides.
 * 3. Section listing what this node requires.
 * 4. Section with frozen interface contracts from dependencies.
 * 5. Section with paths (phase_dir, research_dir if present).
 * 6. Execution instructions.
 *
 * @param node - The DAG node to build a prompt for
 * @param frozenInterfaces - All frozen interface contracts for the DAG
 * @param context - Phase name and directory paths
 * @returns Assembled prompt string
 */
function buildNodePrompt(
  node: ArtifactDAGNode,
  frozenInterfaces: FrozenInterface[],
  context: NodePromptContext
): string {
  const lines: string[] = [];

  // Header
  lines.push(`## Execute Plan ${node.id}: ${context.phase_name}`);
  lines.push('');

  // Provides section
  lines.push('### Provides');
  if (node.provides.length === 0) {
    lines.push('- (none declared)');
  } else {
    for (const artifact of node.provides) {
      lines.push(`- ${artifact}`);
    }
  }
  lines.push('');

  // Requires section
  lines.push('### Requires');
  if (node.requires.length === 0) {
    lines.push('- (none)');
  } else {
    for (const req of node.requires) {
      lines.push(`- ${req}`);
    }
  }
  lines.push('');

  // Frozen contracts from dependencies
  const relevantContracts = frozenInterfaces.filter((fi) =>
    node.requires.includes(fi.artifact)
  );

  if (relevantContracts.length > 0) {
    lines.push('### Frozen Interface Contracts');
    for (const fi of relevantContracts) {
      lines.push('```');
      lines.push(fi.contract);
      lines.push('```');
    }
    lines.push('');
  }

  // Paths section
  lines.push('### Paths');
  lines.push(`- phase_dir: ${context.phase_dir}`);
  if (context.research_dir) {
    lines.push(`- research_dir: ${context.research_dir}`);
  }
  lines.push('');

  // Instructions
  lines.push('### Instructions');
  lines.push(
    'Implement all provides artifacts. Respect frozen contracts from dependencies.'
  );

  return lines.join('\n');
}

// ─── runSmokeTest ─────────────────────────────────────────────────────────────

/**
 * Verify that a node's execution result includes all artifacts it was supposed to provide.
 *
 * Compares the node's declared `provides` artifacts against the `artifacts_produced`
 * array in the execution result. Returns a SmokeTestResult describing what was
 * produced, what is missing, and an overall pass/fail assessment.
 *
 * @param node - The DAG node that was executed
 * @param result - The execution result to smoke test
 * @returns SmokeTestResult with pass/fail, missing artifacts, and message
 */
function runSmokeTest(node: ArtifactDAGNode, result: NodeExecutionResult): SmokeTestResult {
  const produced = new Set<string>(result.artifacts_produced);
  const missing_artifacts = node.provides.filter((a) => !produced.has(a));

  const passed = missing_artifacts.length === 0 && result.success === true;

  let message: string;
  if (passed) {
    message = `All ${node.provides.length} artifacts produced successfully`;
  } else if (!result.success) {
    message = `Execution failed: ${result.error ?? 'unknown error'}`;
  } else {
    message = `Missing artifacts: ${missing_artifacts.join(', ')}`;
  }

  return {
    node_id: node.id,
    passed,
    missing_artifacts,
    message,
  };
}

// ─── _buildWavesFromDAG ───────────────────────────────────────────────────────

/**
 * Group DAG nodes into topological execution waves using Kahn's algorithm.
 *
 * Wave 0: nodes with no incoming edges (no requires).
 * Wave N: nodes whose ALL dependencies are in waves < N.
 *
 * @param dag - The artifact DAG to wave-group
 * @returns Array of waves; each wave is an array of plan IDs
 */
function _buildWavesFromDAG(dag: ArtifactDAG): string[][] {
  // Build in-degree map and adjacency list (producer → [consumers])
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of dag.nodes) {
    if (!inDegree.has(node.id)) inDegree.set(node.id, 0);
    if (!adjacency.has(node.id)) adjacency.set(node.id, []);
  }

  for (const edge of dag.edges) {
    // edge: from_plan (consumer) requires to_plan (producer)
    // producer must execute before consumer
    inDegree.set(edge.from_plan, (inDegree.get(edge.from_plan) ?? 0) + 1);
    const consumers = adjacency.get(edge.to_plan);
    if (consumers !== undefined) {
      consumers.push(edge.from_plan);
    }
  }

  const waves: string[][] = [];
  const remaining = new Set<string>(dag.nodes.map((n) => n.id));

  while (remaining.size > 0) {
    const wave: string[] = [];
    for (const nodeId of remaining) {
      if ((inDegree.get(nodeId) ?? 0) === 0) {
        wave.push(nodeId);
      }
    }

    if (wave.length === 0) {
      // Cycle prevents completion — collect all remaining and emit as last wave
      wave.push(...Array.from(remaining));
      for (const nodeId of wave) {
        remaining.delete(nodeId);
      }
      waves.push(wave.sort());
      break;
    }

    wave.sort();
    for (const nodeId of wave) {
      remaining.delete(nodeId);
      for (const consumer of (adjacency.get(nodeId) ?? [])) {
        if (remaining.has(consumer)) {
          inDegree.set(consumer, (inDegree.get(consumer) as number) - 1);
        }
      }
    }

    waves.push(wave);
  }

  return waves;
}

// ─── executeArtifactDAG ───────────────────────────────────────────────────────

/**
 * Orchestrate execution of an ArtifactDAG using GoT topological wave processing.
 *
 * Groups nodes into topological waves, freezes interface contracts, then for
 * each node: builds a prompt, executes (dry-run stub by default), runs a
 * smoke test, and retries on failure up to maxRetries times.
 *
 * The actual agent spawning is NOT implemented — callers integrate by replacing
 * the dry-run stub with their own dispatch logic.
 *
 * @param dag - The artifact DAG to execute
 * @param options - Execution options (maxRetries, dryRun)
 * @returns GoTExecutionResult with waves, per-node results, smoke tests, and overall success
 */
function executeArtifactDAG(
  dag: ArtifactDAG,
  options?: GoTExecuteOptions
): GoTExecutionResult {
  const maxRetries = options?.maxRetries ?? 1;
  const dryRun = options?.dryRun !== false; // default true

  // Step 1: group into waves
  const waves = _buildWavesFromDAG(dag);

  // Step 2: freeze interfaces once
  const frozenInterfaces = freezeInterfaces(dag);

  const results: NodeExecutionResult[] = [];
  const smoke_tests: SmokeTestResult[] = [];
  let retries = 0;

  // Build a nodeId → node lookup
  const nodeMap = new Map<string, ArtifactDAGNode>();
  for (const node of dag.nodes) {
    nodeMap.set(node.id, node);
  }

  // Step 3: process each wave sequentially
  for (const wave of waves) {
    for (const nodeId of wave) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      // Build prompt (context is minimal for dry-run; result captured for future dispatch)
      void buildNodePrompt(node, frozenInterfaces, {
        phase_name: node.id,
        phase_dir: '',
      });

      // Execute the node
      let execResult: NodeExecutionResult;
      if (dryRun) {
        // Stub: success with all provides produced
        execResult = {
          node_id: node.id,
          success: true,
          artifacts_produced: [...node.provides],
        };
      } else {
        // Real dispatch is deferred to integration phase
        execResult = {
          node_id: node.id,
          success: false,
          artifacts_produced: [],
          error: 'Real execution not implemented — use dryRun mode',
        };
      }

      // Smoke test + retry loop
      let smokeResult = runSmokeTest(node, execResult);

      let attempt = 0;
      while (!smokeResult.passed && attempt < maxRetries) {
        retries++;
        attempt++;

        // Re-execute (same dry-run stub)
        if (dryRun) {
          execResult = {
            node_id: node.id,
            success: true,
            artifacts_produced: [...node.provides],
          };
        }

        smokeResult = runSmokeTest(node, execResult);
      }

      results.push(execResult);
      smoke_tests.push(smokeResult);
    }
  }

  const success = smoke_tests.every((s) => s.passed);

  return { waves, results, smoke_tests, retries, success };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

// Expose buildArtifactDAG re-export so callers can use it without double-requiring deps
void buildArtifactDAG; // used by callers; silence unused-import linting

module.exports = {
  freezeInterfaces,
  buildNodePrompt,
  runSmokeTest,
  executeArtifactDAG,
};
