/**
 * GRD Dependency Analysis -- Phase dependency graph, parallel group computation, cycle detection
 *
 * Provides tooling for analyzing ROADMAP.md phase dependencies to determine
 * which phases can execute in parallel vs. which must be sequential.
 *
 * Depends on: lib/utils.ts (output, error), lib/roadmap.ts (analyzeRoadmap)
 */

'use strict';

import type { DependencyGraph, DependencyNode, DependencyEdge } from './types';

const { output } = require('./utils');
const { analyzeRoadmap } = require('./roadmap');

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Phase input for building dependency graphs.
 * Compatible with AnalyzedPhaseEntry from roadmap.ts.
 */
interface PhaseInput {
  number: string;
  name: string;
  depends_on?: string | null;
}

/**
 * Result of dependency analysis with graph, parallel groups, and cycle info.
 */
interface DepsAnalysisResult {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  parallel_groups?: string[][];
  has_cycle: boolean;
  phase_count?: number;
  group_count?: number;
  error?: string;
  cycle_path?: string[];
}

// ─── parseDependsOn ──────────────────────────────────────────────────────────

/**
 * Parse a raw depends_on string from ROADMAP.md into an array of phase number strings.
 * @param dependsOnStr - Raw depends_on string (e.g., "Phase 27, Phase 29", "Nothing", null)
 * @returns Array of phase number strings (e.g., ['27', '29']), or [] if no dependencies
 */
function parseDependsOn(dependsOnStr: string | null | undefined): string[] {
  if (!dependsOnStr || typeof dependsOnStr !== 'string' || dependsOnStr.trim() === '') {
    return [];
  }

  // "Nothing" (case-insensitive) means no dependencies
  if (/nothing/i.test(dependsOnStr)) {
    return [];
  }

  // Extract all "Phase N" or "Phase N.M" references
  const matches: string[] = [];
  const regex = /Phase\s+(\d+(?:\.\d+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(dependsOnStr)) !== null) {
    matches.push(m[1]);
  }

  return matches;
}

// ─── buildDependencyGraph ────────────────────────────────────────────────────

/**
 * Build a dependency graph from an array of phase objects.
 * @param phases - Phase objects from roadmap analysis
 * @returns Dependency graph with typed nodes and edges
 */
function buildDependencyGraph(phases: PhaseInput[]): DependencyGraph {
  const nodeIds = new Set<string>(phases.map((p) => p.number));

  const nodes: DependencyNode[] = phases.map((p) => ({
    id: p.number,
    name: p.name,
  }));

  const edges: DependencyEdge[] = [];
  for (const phase of phases) {
    const deps = parseDependsOn(phase.depends_on);
    for (const dep of deps) {
      // Only include edges where the dependency exists in the node set
      if (nodeIds.has(dep)) {
        edges.push({ from: dep, to: phase.number });
      }
    }
  }

  return { nodes, edges };
}

// ─── computeParallelGroups ───────────────────────────────────────────────────

/**
 * Compute parallel execution groups via Kahn's algorithm (topological sort by levels).
 * Each group contains phases that can run concurrently because all their
 * dependencies have been satisfied in previous groups.
 * @param graph - Dependency graph
 * @returns Array of arrays, each inner array is a set of phase IDs that can run together
 */
function computeParallelGroups(graph: DependencyGraph): string[][] {
  if (graph.nodes.length === 0) {
    return [];
  }

  // Build adjacency list and in-degree map
  const adjacency = new Map<string, string[]>(); // from -> [to]
  const inDegree = new Map<string, number>();

  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    (adjacency.get(edge.from) as string[]).push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  const groups: string[][] = [];
  const remaining = new Set<string>(graph.nodes.map((n) => n.id));

  while (remaining.size > 0) {
    // Collect nodes with in-degree 0 among remaining nodes
    const group: string[] = [];
    for (const nodeId of remaining) {
      if (inDegree.get(nodeId) === 0) {
        group.push(nodeId);
      }
    }

    if (group.length === 0) {
      // All remaining nodes have dependencies -- cycle exists
      // Return what we have (caller should use detectCycle separately)
      break;
    }

    // Sort for deterministic output
    group.sort();
    groups.push(group);

    // Remove current group's nodes and decrement in-degrees
    for (const nodeId of group) {
      remaining.delete(nodeId);
      for (const dependent of adjacency.get(nodeId) as string[]) {
        if (remaining.has(dependent)) {
          inDegree.set(dependent, (inDegree.get(dependent) as number) - 1);
        }
      }
    }
  }

  return groups;
}

// ─── detectCycle ─────────────────────────────────────────────────────────────

/**
 * Detect cycles in a dependency graph using DFS.
 * @param graph - Dependency graph
 * @returns Cycle path array if cycle found (e.g., ['27', '28', '27']), or null if acyclic
 */
function detectCycle(graph: DependencyGraph): string[] | null {
  // Build adjacency list (forward edges: from -> [to])
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    (adjacency.get(edge.from) as string[]).push(edge.to);
  }

  // Node states: 0 = unvisited, 1 = visiting (in current DFS path), 2 = visited
  const state = new Map<string, number>();
  for (const node of graph.nodes) {
    state.set(node.id, 0);
  }

  // Track the DFS path for cycle reconstruction
  const pathStack: string[] = [];

  function dfs(nodeId: string): string[] | null {
    state.set(nodeId, 1); // visiting
    pathStack.push(nodeId);

    for (const neighbor of adjacency.get(nodeId) as string[]) {
      if (state.get(neighbor) === 1) {
        // Found a back-edge -- reconstruct cycle
        const cycleStart = pathStack.indexOf(neighbor);
        const cyclePath = pathStack.slice(cycleStart);
        cyclePath.push(neighbor); // close the cycle
        return cyclePath;
      }
      if (state.get(neighbor) === 0) {
        const result = dfs(neighbor);
        if (result) return result;
      }
    }

    pathStack.pop();
    state.set(nodeId, 2); // visited
    return null;
  }

  for (const node of graph.nodes) {
    if (state.get(node.id) === 0) {
      const cycle = dfs(node.id);
      if (cycle) return cycle;
    }
  }

  return null;
}

// ─── cmdPhaseAnalyzeDeps ─────────────────────────────────────────────────────

/**
 * CLI command: Analyze phase dependencies from ROADMAP.md, build graph, compute parallel groups.
 * Calls analyzeRoadmap(cwd) internally to reuse roadmap parsing (including depends_on extraction).
 * @param cwd - Project working directory
 * @param raw - Output raw text instead of JSON
 */
function cmdPhaseAnalyzeDeps(cwd: string, raw: boolean): void {
  const roadmapResult = analyzeRoadmap(cwd) as {
    error?: string;
    phases?: PhaseInput[];
  };

  // Handle missing roadmap or error
  if (roadmapResult.error || !roadmapResult.phases || roadmapResult.phases.length === 0) {
    output({ error: roadmapResult.error || 'ROADMAP.md not found or empty' }, raw);
    return;
  }

  const phases = roadmapResult.phases;
  const graph: DependencyGraph = buildDependencyGraph(phases);
  const cycle = detectCycle(graph);

  if (cycle) {
    const result: DepsAnalysisResult = {
      error: 'Circular dependency detected',
      cycle_path: cycle,
      has_cycle: true,
      nodes: graph.nodes,
      edges: graph.edges,
    };
    output(result, raw);
    return;
  }

  const parallelGroups = computeParallelGroups(graph);

  const result: DepsAnalysisResult = {
    nodes: graph.nodes,
    edges: graph.edges,
    parallel_groups: parallelGroups,
    has_cycle: false,
    phase_count: graph.nodes.length,
    group_count: parallelGroups.length,
  };
  output(result, raw);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  parseDependsOn,
  buildDependencyGraph,
  computeParallelGroups,
  detectCycle,
  cmdPhaseAnalyzeDeps,
};
