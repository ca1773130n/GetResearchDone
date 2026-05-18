'use strict';

/**
 * GRD Dependency Analysis -- Phase dependency graph, parallel group computation, cycle detection
 *
 * Provides tooling for analyzing ROADMAP.md phase dependencies to determine
 * which phases can execute in parallel vs. which must be sequential.
 *
 * Depends on: lib/utils.ts (output, error), lib/roadmap.ts (analyzeRoadmap)
 */


import type { DependencyGraph, DependencyNode, DependencyEdge, ArtifactDAG, ArtifactDAGNode, ArtifactDAGEdge, ArtifactDAGValidation, PlanArtifact } from './types';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const { output, error: _depsError, findPhaseInternal } = require('./utils') as {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (msg: string) => never;
  findPhaseInternal: (cwd: string, phase: string) => import('./types').PhaseInfo | null;
};
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

    // Sort component-wise to avoid parseFloat('1.10') === parseFloat('1.1') collision
    group.sort((a, b) => {
      const pa = a.split('.').map(Number);
      const pb = b.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) return d;
      }
      return 0;
    });
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
 * @returns void — outputs JSON or raw text to stdout via the output helper
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
    output(result, raw, `Circular dependency detected: ${cycle.join(' → ')}`);
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
  output(result, raw, `${graph.nodes.length} phases, ${parallelGroups.length} parallel groups`);
}

// ─── buildArtifactDAG ────────────────────────────────────────────────────────

/**
 * Build a directed artifact dependency graph from an array of plan artifacts.
 *
 * 1. Constructs a providers map: artifact_name → plan_id (first declaration wins).
 * 2. Builds ArtifactDAGNode[] from each plan's provides/requires/integration_points.
 * 3. Builds ArtifactDAGEdge[]: for each requires/integration_points entry, look up
 *    the provider and create a directed edge (consumer → producer).
 *    Integration edges are only created when a matching provider exists.
 * 4. Runs Kahn's algorithm to produce a topologically sorted execution order.
 *
 * @param plans - Array of plan artifacts parsed from PLAN.md frontmatter
 * @returns ArtifactDAG with nodes, edges, sorted_plans, and providers map
 */
function buildArtifactDAG(plans: PlanArtifact[]): ArtifactDAG {
  // Step 1: Build providers map — first declaration wins
  const providers: Record<string, string> = {};
  for (const plan of plans) {
    const planId = `${plan.phase}-${String(plan.plan).padStart(2, '0')}`;
    for (const artifact of plan.provides) {
      if (!(artifact in providers)) {
        providers[artifact] = planId;
      }
    }
  }

  // Step 2: Build nodes
  const nodes: ArtifactDAGNode[] = plans.map((plan) => ({
    id: `${plan.phase}-${String(plan.plan).padStart(2, '0')}`,
    plan_number: plan.plan,
    provides: plan.provides,
    requires: plan.requires,
    integration_points: plan.integration_points,
  }));

  // Step 3: Build edges
  const edges: ArtifactDAGEdge[] = [];
  const missing_requires: string[] = [];
  for (const node of nodes) {
    // Hard dependency edges from requires
    for (const artifact of node.requires) {
      const providerPlanId = providers[artifact];
      if (providerPlanId === undefined) {
        missing_requires.push(artifact);
      } else if (providerPlanId !== node.id) {
        edges.push({
          from_plan: node.id,
          to_plan: providerPlanId,
          artifact,
          type: 'requires',
        });
      }
    }
    // Soft dependency edges from integration_points (only when provider exists)
    for (const artifact of node.integration_points) {
      const providerPlanId = providers[artifact];
      if (providerPlanId !== undefined && providerPlanId !== node.id) {
        edges.push({
          from_plan: node.id,
          to_plan: providerPlanId,
          artifact,
          type: 'integration',
        });
      }
    }
  }

  // Step 4: Kahn's topological sort
  // adjacency: producer → [consumers] (edge from_plan depends on to_plan,
  // so to_plan must come before from_plan; in Kahn's terms: to_plan → from_plan)
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    // to_plan must execute before from_plan → edge in sort graph: to_plan → from_plan
    const producers = adjacency.get(edge.to_plan);
    if (producers !== undefined) {
      producers.push(edge.from_plan);
    }
    inDegree.set(edge.from_plan, (inDegree.get(edge.from_plan) ?? 0) + 1);
  }

  const sorted_plans: string[] = [];
  const remaining = new Set<string>(nodes.map((n) => n.id));

  while (remaining.size > 0) {
    const batch: string[] = [];
    for (const nodeId of remaining) {
      if ((inDegree.get(nodeId) ?? 0) === 0) {
        batch.push(nodeId);
      }
    }

    if (batch.length === 0) {
      // Cycle prevents full sort — return partial (validateArtifactDAG will catch this)
      break;
    }

    // Sort lexicographically for deterministic output (plan IDs are string slugs, not numeric)
    batch.sort();
    for (const nodeId of batch) {
      sorted_plans.push(nodeId);
      remaining.delete(nodeId);
      for (const dependent of adjacency.get(nodeId) as string[]) {
        if (remaining.has(dependent)) {
          inDegree.set(dependent, (inDegree.get(dependent) as number) - 1);
        }
      }
    }
  }

  return { nodes, edges, sorted_plans, providers, missing_requires };
}

// ─── validateArtifactDAG ─────────────────────────────────────────────────────

/**
 * Validate an ArtifactDAG for cycles, missing dependencies, unused provides, and duplicates.
 *
 * 1. Cycle detection via DFS: walks the requires/integration dependency graph, collecting
 *    all distinct cycles found (not just the first).
 * 2. Missing dependency detection: for each plan's requires, checks if dag.providers has
 *    a matching entry.
 * 3. Unused provides warning: for each artifact in providers, checks if any plan requires
 *    or integrates it.
 * 4. Duplicate provides warning: when multiple plans declare the same provides entry.
 *
 * @param dag - The artifact DAG to validate
 * @param plans - Original plan artifacts (for duplicate provides detection)
 * @returns ArtifactDAGValidation with valid flag, cycles, missing_deps, and warnings
 */
function validateArtifactDAG(dag: ArtifactDAG, plans: PlanArtifact[]): ArtifactDAGValidation {
  const cycles: string[][] = [];
  const missing_deps: Array<{ plan: string; artifact: string }> = [];
  const warnings: string[] = [];

  // Step 1: Cycle detection via DFS on the dependency graph
  // Build adjacency: from_plan → [to_plan] (consumer → producer)
  const cycleAdj = new Map<string, string[]>();
  for (const node of dag.nodes) {
    cycleAdj.set(node.id, []);
  }
  for (const edge of dag.edges) {
    const neighbors = cycleAdj.get(edge.from_plan);
    if (neighbors !== undefined) {
      neighbors.push(edge.to_plan);
    }
  }

  // DFS state: 0 = unvisited, 1 = visiting, 2 = visited
  const state = new Map<string, number>();
  for (const node of dag.nodes) {
    state.set(node.id, 0);
  }
  const pathStack: string[] = [];
  const seenCycles = new Set<string>();

  function dfsCollect(nodeId: string): void {
    state.set(nodeId, 1);
    pathStack.push(nodeId);

    for (const neighbor of (cycleAdj.get(nodeId) ?? [])) {
      if (state.get(neighbor) === 1) {
        // Found a back-edge — reconstruct and deduplicate the cycle
        const cycleStart = pathStack.indexOf(neighbor);
        const cyclePath = [...pathStack.slice(cycleStart), neighbor];
        // Canonical form: rotate so lexicographically smallest node is first
        const minIdx = cyclePath.slice(0, -1).reduce(
          (best, id, idx) => (id < cyclePath[best] ? idx : best),
          0
        );
        const canonical = [
          ...cyclePath.slice(minIdx, -1),
          ...cyclePath.slice(0, minIdx),
          cyclePath[minIdx],
        ];
        const key = canonical.join(',');
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          cycles.push(canonical);
        }
      } else if (state.get(neighbor) === 0) {
        dfsCollect(neighbor);
      }
    }

    pathStack.pop();
    state.set(nodeId, 2);
  }

  for (const node of dag.nodes) {
    if (state.get(node.id) === 0) {
      dfsCollect(node.id);
    }
  }

  // Step 2: Missing dependency detection
  for (const node of dag.nodes) {
    for (const artifact of node.requires) {
      if (!(artifact in dag.providers)) {
        missing_deps.push({ plan: node.id, artifact });
      }
    }
  }

  // Step 3: Unused provides warning
  // Collect all referenced artifacts across all plans
  const referencedArtifacts = new Set<string>();
  for (const node of dag.nodes) {
    for (const a of node.requires) {
      referencedArtifacts.add(a);
    }
    for (const a of node.integration_points) {
      referencedArtifacts.add(a);
    }
  }
  for (const artifact of Object.keys(dag.providers)) {
    if (!referencedArtifacts.has(artifact)) {
      warnings.push(`Unused provides: "${artifact}" (provided by ${dag.providers[artifact]}, not required by any plan)`);
    }
  }

  // Step 4: Duplicate provides warning
  const providerCount = new Map<string, string[]>(); // artifact → [plan_ids]
  for (const plan of plans) {
    const planId = `${plan.phase}-${String(plan.plan).padStart(2, '0')}`;
    for (const artifact of plan.provides) {
      const existing = providerCount.get(artifact);
      if (existing !== undefined) {
        existing.push(planId);
      } else {
        providerCount.set(artifact, [planId]);
      }
    }
  }
  for (const [artifact, planIds] of providerCount) {
    if (planIds.length > 1) {
      warnings.push(`Duplicate provides: "${artifact}" declared by ${planIds.join(', ')} (first provider wins)`);
    }
  }

  return {
    valid: cycles.length === 0 && missing_deps.length === 0,
    cycles,
    missing_deps,
    warnings,
  };
}

// ─── cmdPhaseDepsVisualize ───────────────────────────────────────────────────

/**
 * Render a phase dependency graph as a Mermaid flowchart or ASCII tree.
 *
 * Reads ROADMAP.md for the project, builds the dependency graph using the same
 * Kahn's algorithm as cmdPhaseAnalyzeDeps, then formats for human consumption.
 *
 * Mermaid format: valid `flowchart LR` block (paste into any Mermaid renderer).
 * ASCII format: indented tree showing parallel groups.
 *
 * @param cwd - Project working directory
 * @param opts - Options: milestone (override), format ('mermaid' | 'ascii')
 * @param raw - Output raw text instead of JSON
 */
function cmdPhaseDepsVisualize(
  cwd: string,
  opts: { milestone?: string | null; format?: string | null },
  raw: boolean
): void {
  const roadmapResult = analyzeRoadmap(cwd) as {
    error?: string;
    phases?: PhaseInput[];
  };

  if (roadmapResult.error || !roadmapResult.phases || roadmapResult.phases.length === 0) {
    output({ error: roadmapResult.error || 'ROADMAP.md not found or empty' }, raw);
    return;
  }

  let phases = roadmapResult.phases;

  // Apply milestone filter if specified (match phase names containing milestone string)
  const milestoneFilter = opts.milestone;
  if (milestoneFilter) {
    phases = phases.filter(
      (p) => p.name.toLowerCase().includes(milestoneFilter.toLowerCase()) ||
             String(p.number).startsWith(milestoneFilter)
    );
    if (phases.length === 0) {
      output({ error: `No phases found matching milestone "${milestoneFilter}"` }, raw);
      return;
    }
  }

  const graph: DependencyGraph = buildDependencyGraph(phases);
  const cycle = detectCycle(graph);
  const parallelGroups = computeParallelGroups(graph);
  const format = opts.format || 'mermaid';

  let diagram: string;

  if (format === 'ascii') {
    const lines: string[] = [`Phase Dependency Graph (${graph.nodes.length} phases, ${parallelGroups.length} groups)`];
    lines.push('');
    parallelGroups.forEach((group, i) => {
      lines.push(`Group ${i + 1} [parallel]:`);
      for (const id of group) {
        const node = graph.nodes.find((n) => n.id === id);
        const deps = graph.edges.filter((e) => e.to === id).map((e) => e.from);
        const depStr = deps.length > 0 ? ` ← depends on: ${deps.join(', ')}` : '';
        lines.push(`  Phase ${id}: ${node?.name || ''}${depStr}`);
      }
    });
    if (cycle) {
      lines.push('');
      lines.push(`⚠ Cycle detected: ${cycle.join(' → ')}`);
    }
    diagram = lines.join('\n');
  } else {
    // Mermaid flowchart LR
    const lines: string[] = ['flowchart LR'];
    for (const node of graph.nodes) {
      const label = `Phase ${node.id}: ${node.name.replace(/"/g, "'")}`;
      lines.push(`  ${_mermaidId(node.id)}["${label}"]`);
    }
    for (const edge of graph.edges) {
      lines.push(`  ${_mermaidId(edge.from)} --> ${_mermaidId(edge.to)}`);
    }
    if (cycle) {
      lines.push(`  %% WARNING: cycle detected ${cycle.join(' -> ')}`);
    }
    diagram = lines.join('\n');
  }

  output(
    {
      format,
      phase_count: graph.nodes.length,
      group_count: parallelGroups.length,
      has_cycle: Boolean(cycle),
      cycle_path: cycle ?? null,
      diagram,
    },
    raw,
    diagram
  );
}

/** Sanitize a phase ID for use as a Mermaid node identifier. */
function _mermaidId(id: string): string {
  return `ph${id.replace(/\./g, '_')}`;
}

// ─── buildWaves ──────────────────────────────────────────────────────────────

interface PlanWaveEntry {
  plan_file: string;
  wave: number;
  agent_type: string;
  target_files: string[];
}

/**
 * Read all *-PLAN.md files in phaseDir and group them by their `wave` frontmatter field.
 * Returns an array of wave groups sorted by wave number, each group containing the plan entries.
 * Plans without a wave field are assigned to wave 1.
 *
 * @param phaseDir - Path to the phase directory containing PLAN.md files
 * @returns Array of wave groups: [{wave, plans: PlanWaveEntry[]}]
 */
function buildWaves(phaseDir: string): { wave: number; plans: PlanWaveEntry[] }[] {
  let files: string[];
  try {
    files = (fs.readdirSync(phaseDir) as string[]).filter(
      (f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md'
    ).sort();
  } catch {
    return [];
  }

  const waveMap = new Map<number, PlanWaveEntry[]>();

  for (const file of files) {
    const content = (() => {
      try { return fs.readFileSync(path.join(phaseDir, file), 'utf-8') as string; } catch { return null; }
    })();
    if (!content) continue;

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const fm = fmMatch ? fmMatch[1] : '';

    const waveMatch = fm.match(/^wave:\s*(\d+)/m);
    const waveNum = waveMatch ? parseInt(waveMatch[1], 10) : 1;

    const agentMatch = fm.match(/^agent_type:\s*(.+)$/m);
    const agentType = agentMatch ? agentMatch[1].trim() : 'grd-executor';

    const filesMatch = fm.match(/^files_modified:\s*\[([^\]]*)\]/m);
    const targetFiles = filesMatch
      ? filesMatch[1].split(',').map((f: string) => f.trim()).filter(Boolean)
      : [];

    const entry: PlanWaveEntry = { plan_file: file, wave: waveNum, agent_type: agentType, target_files: targetFiles };
    const bucket = waveMap.get(waveNum) ?? [];
    bucket.push(entry);
    waveMap.set(waveNum, bucket);
  }

  return Array.from(waveMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([wave, plans]) => ({ wave, plans }));
}

// Effort-to-token band map for the dry-run preview.
const EFFORT_TOKEN_BANDS: Record<string, string> = {
  high: '~200K tokens',
  medium: '~80K tokens',
  low: '~30K tokens',
};

/**
 * CLI command: Dry-run preview of gd execute-phase <N>.
 * Reads plan files, groups by wave, and prints a wave table without spawning agents.
 *
 * @param cwd - Project working directory
 * @param phase - Phase number/name
 * @param raw - Output raw text instead of JSON
 */
function cmdExecutePhaseDryRun(cwd: string, phase: string, raw: boolean): void {
  const phaseInfo = findPhaseInternal(cwd, phase);
  if (!phaseInfo || !phaseInfo.found) {
    _depsError(`Phase ${phase} not found`);
  }

  const waves = buildWaves(path.join(cwd, (phaseInfo as import('./types').PhaseInfo).directory));
  if (waves.length === 0) {
    output({ dry_run: true, wave_count: 0, waves: [] }, raw, 'No plan files found in phase directory');
    return;
  }

  const rows = waves.map(({ wave, plans }) => ({
    wave,
    agent_count: plans.length,
    agents: plans.map((p) => ({
      plan_file: p.plan_file,
      agent_type: p.agent_type,
      estimated_tokens: EFFORT_TOKEN_BANDS['medium'],
      target_files: p.target_files,
    })),
  }));

  if (raw) {
    const lines: string[] = [`Dry-run: Phase ${phase} — ${waves.length} wave(s), ${waves.reduce((s, w) => s + w.plans.length, 0)} plan(s)\n`];
    for (const row of rows) {
      lines.push(`Wave ${row.wave} (${row.agent_count} agent${row.agent_count !== 1 ? 's' : ''}):`);
      for (const a of row.agents) {
        const files = a.target_files.length > 0 ? ` → ${a.target_files.join(', ')}` : '';
        lines.push(`  ${a.plan_file} [${a.agent_type}] ${a.estimated_tokens}${files}`);
      }
    }
    output({ dry_run: true, wave_count: waves.length, waves: rows }, raw, lines.join('\n'));
  } else {
    output({ dry_run: true, phase, wave_count: waves.length, waves: rows }, raw, `${waves.length} waves, ${waves.reduce((s, w) => s + w.plans.length, 0)} plans`);
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  parseDependsOn,
  buildDependencyGraph,
  computeParallelGroups,
  detectCycle,
  cmdPhaseAnalyzeDeps,
  cmdPhaseDepsVisualize,
  buildArtifactDAG,
  validateArtifactDAG,
  buildWaves,
  cmdExecutePhaseDryRun,
};
