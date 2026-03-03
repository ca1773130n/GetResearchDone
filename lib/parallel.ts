/**
 * GRD Parallel Execution -- Multi-phase independence validation, context building, mode selection
 *
 * Provides tooling for validating that requested phases can execute in parallel
 * (no dependency edges between them), building per-phase execution context with
 * worktree paths, and selecting parallel vs sequential mode based on backend capabilities.
 *
 * Depends on: lib/deps.ts (buildDependencyGraph), lib/utils.ts, lib/backend.ts, lib/roadmap.ts
 */

'use strict';

import type {
  DependencyGraph,
  BackendCapabilities,
  GrdConfig,
  MilestoneInfo,
  PhaseInfo,
  GateViolation,
  PreflightResult,
} from './types';

const { output, loadConfig, findPhaseInternal, getMilestoneInfo } = require('./utils') as {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => void;
  loadConfig: (cwd: string) => GrdConfig;
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
};
const { detectBackend, getBackendCapabilities } = require('./backend') as {
  detectBackend: (cwd: string) => string;
  getBackendCapabilities: (backend: string) => BackendCapabilities;
};
const { worktreePath } = require('./worktree') as {
  worktreePath: (cwd: string, milestone: string, phase: string) => string;
};
const { buildDependencyGraph } = require('./deps') as {
  buildDependencyGraph: (
    phases: Array<{ number: string; name: string; depends_on?: string | null }>
  ) => DependencyGraph;
};
const { analyzeRoadmap } = require('./roadmap') as {
  analyzeRoadmap: (cwd: string) => {
    error?: string;
    phases?: Array<{
      number: string;
      name: string;
      depends_on?: string | null;
      disk_status?: string;
      roadmap_complete?: boolean;
    }>;
  };
};
const { runPreflightGates } = require('./gates') as {
  runPreflightGates: (
    cwd: string,
    command: string,
    options: { phase: string }
  ) => PreflightResult;
};

// ─── Domain Types ──────────────────────────────────────────────────────────

/**
 * Result of validating whether requested phases are independent (no direct edges).
 */
interface ValidationResult {
  valid: boolean;
  conflicts?: Array<{ from: string; to: string }>;
  phases: string[];
}

/**
 * Per-phase context in parallel execution with worktree paths and plan info.
 */
interface PhaseContext {
  phase_number: string;
  phase_name: string | null;
  phase_slug: string | null;
  phase_dir: string;
  worktree_path: string | null;
  worktree_branch: string;
  native_isolation: boolean;
  plans: string[];
  incomplete_plans: string[];
  plan_count: number;
}

/**
 * Full context returned by buildParallelContext consumed by execute-phase command.
 */
interface ParallelContext {
  mode: 'parallel' | 'sequential';
  fallback_note: string | null;
  backend: string;
  backend_capabilities: BackendCapabilities;
  use_teams: boolean;
  team_timeout_minutes: number;
  max_concurrent_teammates: number;
  milestone_version: string;
  milestone_name: string;
  phases: PhaseContext[];
  phase_count: number;
  status_tracker: { phases: Record<string, { status: string }> };
  error?: string;
  independence_validated?: boolean;
  gate_warnings?: GateViolation[];
}

/**
 * Options for buildParallelContext.
 */
interface BuildParallelContextOptions {
  nativeWorktreeAvailable?: boolean;
}

// ─── validateIndependentPhases ──────────────────────────────────────────────

/**
 * Validate that requested phases have no direct dependency edges between them.
 *
 * Only checks DIRECT edges (not transitive paths). This is correct because the
 * command template already receives parallel_groups from deps analysis for ordering.
 * The validation here prevents the user from requesting two phases where one
 * directly depends on the other.
 * @param graph - Dependency graph containing all phase edges
 * @param requestedPhases - Array of phase number strings to validate
 * @returns Validation result indicating whether phases are independent, with any conflict pairs
 */
function validateIndependentPhases(
  graph: DependencyGraph,
  requestedPhases: string[]
): ValidationResult {
  if (requestedPhases.length <= 1) {
    return { valid: true, phases: requestedPhases };
  }

  const requestedSet = new Set(requestedPhases);
  const conflicts: Array<{ from: string; to: string }> = [];

  for (const edge of graph.edges) {
    if (requestedSet.has(edge.from) && requestedSet.has(edge.to)) {
      conflicts.push({ from: edge.from, to: edge.to });
    }
  }

  if (conflicts.length > 0) {
    return { valid: false, conflicts, phases: requestedPhases };
  }

  return { valid: true, phases: requestedPhases };
}

// ─── buildParallelContext ───────────────────────────────────────────────────

/**
 * Build structured JSON context for parallel execution of multiple phases.
 *
 * Loads config, detects backend capabilities, resolves per-phase info (directory,
 * plans, worktree paths), and selects parallel vs sequential mode. Returns a
 * context object consumed by the execute-phase command template.
 * @param cwd - Absolute path to the working directory (project root)
 * @param phaseNumbers - Array of phase number strings to build context for
 * @param options - Optional configuration for native worktree availability
 * @returns Full parallel execution context, or an error object if a phase is not found
 */
function buildParallelContext(
  cwd: string,
  phaseNumbers: string[],
  options?: BuildParallelContextOptions
): ParallelContext | { error: string } {
  const { nativeWorktreeAvailable = false } = options || {};
  const config: GrdConfig = loadConfig(cwd);
  const backend: string = detectBackend(cwd);
  const capabilities: BackendCapabilities = getBackendCapabilities(backend);
  const milestone: MilestoneInfo = getMilestoneInfo(cwd);

  // Determine mode: parallel only if backend supports teams AND config allows it
  const mode: 'parallel' | 'sequential' =
    capabilities.teams === true && config.use_teams !== false ? 'parallel' : 'sequential';

  // Build fallback note for sequential mode
  const fallback_note: string | null =
    mode === 'sequential'
      ? 'Parallel execution available on Claude Code backend with teams enabled'
      : null;

  // Build per-phase context objects
  const phaseContexts: PhaseContext[] = [];
  for (const phaseNum of phaseNumbers) {
    const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
    if (!phaseInfo) {
      return { error: `Phase ${phaseNum} not found` };
    }

    const template: string = config.phase_branch_template || 'grd/{milestone}/{phase}-{slug}';
    const worktree_branch: string = template
      .replace('{milestone}', milestone.version)
      .replace('{phase}', phaseInfo.phase_number)
      .replace('{slug}', phaseInfo.phase_slug || 'phase');

    // When native isolation is available, skip worktree_path pre-computation
    // Claude Code creates worktrees natively via its isolation: worktree mechanism
    const wt_path: string | null = nativeWorktreeAvailable
      ? null
      : worktreePath(cwd, milestone.version, phaseInfo.phase_number);

    phaseContexts.push({
      phase_number: phaseInfo.phase_number,
      phase_name: phaseInfo.phase_name,
      phase_slug: phaseInfo.phase_slug,
      phase_dir: phaseInfo.directory,
      worktree_path: wt_path,
      worktree_branch,
      native_isolation: nativeWorktreeAvailable,
      plans: phaseInfo.plans,
      incomplete_plans: phaseInfo.incomplete_plans,
      plan_count: phaseInfo.plans ? phaseInfo.plans.length : 0,
    });
  }

  // Build status tracker with per-phase pending state
  const status_tracker: { phases: Record<string, { status: string }> } = { phases: {} };
  for (const ctx of phaseContexts) {
    status_tracker.phases[ctx.phase_number] = { status: 'pending' };
  }

  return {
    mode,
    fallback_note,
    backend,
    backend_capabilities: capabilities,
    use_teams: config.use_teams,
    team_timeout_minutes: config.team_timeout_minutes,
    max_concurrent_teammates: config.max_concurrent_teammates,
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    phases: phaseContexts,
    phase_count: phaseNumbers.length,
    status_tracker,
  };
}

// ─── cmdInitExecuteParallel ─────────────────────────────────────────────────

/**
 * CLI command: Validate phase independence and build parallel execution context.
 *
 * Follows the established cmdInit* pattern: validates inputs, runs preflight gates,
 * checks roadmap for requested phases, validates independence via dependency graph,
 * builds context, and outputs structured JSON.
 * @param cwd - Absolute path to the working directory (project root)
 * @param phaseNumbers - Array of phase number strings requested for parallel execution
 * @param _includes - Unused set of include filters (reserved for future use)
 * @param raw - Whether to output plain text instead of JSON
 * @returns void (outputs JSON or error to stdout)
 */
function cmdInitExecuteParallel(
  cwd: string,
  phaseNumbers: string[],
  _includes: Set<string>,
  raw: boolean
): void {
  // Validate at least one phase requested
  if (!phaseNumbers || phaseNumbers.length === 0) {
    output({ error: 'At least one phase number is required' }, raw);
    return;
  }

  // Run preflight gates (reuse execute-phase gates with first phase)
  const gates: PreflightResult = runPreflightGates(cwd, 'execute-phase', {
    phase: phaseNumbers[0],
  });
  if (!gates.passed) {
    output({ gate_failed: true, gate_errors: gates.errors, gate_warnings: gates.warnings }, raw);
    return;
  }

  // Analyze roadmap to get all phases
  const roadmapResult = analyzeRoadmap(cwd);
  if (roadmapResult.error || !roadmapResult.phases || roadmapResult.phases.length === 0) {
    output({ error: roadmapResult.error || 'ROADMAP.md not found or empty' }, raw);
    return;
  }

  // Verify all requested phases exist in roadmap
  const roadmapPhaseNumbers = new Set(roadmapResult.phases.map((p) => p.number));
  const missing: string[] = phaseNumbers.filter((pn) => !roadmapPhaseNumbers.has(pn));
  if (missing.length > 0) {
    output({ error: `Phase(s) not found in roadmap: ${missing.join(', ')}` }, raw);
    return;
  }

  // Build dependency graph and validate independence
  const graph: DependencyGraph = buildDependencyGraph(roadmapResult.phases);
  const validation: ValidationResult = validateIndependentPhases(graph, phaseNumbers);

  if (!validation.valid) {
    const conflictStr: string = validation.conflicts!
      .map((c) => `Phase ${c.from} -> Phase ${c.to}`)
      .join(', ');
    output(
      {
        error: `Phases are not independent: ${conflictStr}`,
        conflicts: validation.conflicts,
      },
      raw
    );
    return;
  }

  // Build parallel context with native isolation awareness
  const backend: string = detectBackend(cwd);
  const capabilities: BackendCapabilities = getBackendCapabilities(backend);
  const context = buildParallelContext(cwd, phaseNumbers, {
    nativeWorktreeAvailable: capabilities.native_worktree_isolation,
  }) as ParallelContext;
  if (context.error) {
    output(context, raw, `Error: ${context.error}`);
    return;
  }

  // Add independence validation flag
  context.independence_validated = true;

  // Include gate warnings if any
  if (gates.warnings && gates.warnings.length > 0) {
    context.gate_warnings = gates.warnings;
  }

  output(
    context,
    raw,
    `Backend: ${context.backend}, ${context.phase_count} phases, mode: ${context.mode}`
  );
}

// ─── formatProgressBar ──────────────────────────────────────────────────────

/**
 * Format a progress bar string like `[####______] 40%`
 */
function formatProgressBar(current: number, total: number, width?: number): string {
  const barWidth: number = width || 20;
  const pct: number = total === 0 ? 0 : Math.min(1, current / total);
  const filled: number = Math.round(pct * barWidth);
  const empty: number = barWidth - filled;
  const bar: string = '#'.repeat(filled) + '_'.repeat(empty);
  const pctLabel: string = Math.round(pct * 100) + '%';
  return `[${bar}] ${pctLabel}`;
}

// ─── streamPhaseProgress ────────────────────────────────────────────────────

/**
 * Write formatted phase progress to stderr.
 */
function streamPhaseProgress(
  phaseNum: string,
  current: number,
  total: number,
  status?: string
): void {
  const padded: string = String(phaseNum).padStart(2, '0');
  const bar: string = formatProgressBar(current, total);
  const statusPart: string = status ? ` [${status}]` : '';
  const line: string = `Phase ${padded}: ${current} of ${total} ${bar}${statusPart}\n`;
  process.stderr.write(line);
}

// ─── cmdParallelProgress ────────────────────────────────────────────────────

/**
 * CLI command for progress updates during parallel execution.
 * Accepts --phase, --plan, --total-plans, --status args.
 */
function cmdParallelProgress(args: string[], raw: boolean): void {
  // Parse args
  let phase: string | null = null;
  let plan: number | null = null;
  let totalPlans: number | null = null;
  let status: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--phase' && args[i + 1]) phase = args[++i];
    else if (args[i] === '--plan' && args[i + 1]) plan = parseInt(args[++i], 10);
    else if (args[i] === '--total-plans' && args[i + 1]) totalPlans = parseInt(args[++i], 10);
    else if (args[i] === '--status' && args[i + 1]) status = args[++i];
  }

  if (phase === null || plan === null || totalPlans === null) {
    output(
      { error: 'Usage: parallel-progress --phase N --plan M --total-plans T [--status label]' },
      raw
    );
    return;
  }

  const bar: string = formatProgressBar(plan, totalPlans);

  if (raw) {
    output({ phase, plan, total_plans: totalPlans, bar, status }, raw);
  } else {
    streamPhaseProgress(phase, plan, totalPlans, status || undefined);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  validateIndependentPhases,
  buildParallelContext,
  cmdInitExecuteParallel,
  formatProgressBar,
  streamPhaseProgress,
  cmdParallelProgress,
};
