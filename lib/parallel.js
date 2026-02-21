/**
 * GRD Parallel Execution — Multi-phase independence validation, context building, mode selection
 *
 * Provides tooling for validating that requested phases can execute in parallel
 * (no dependency edges between them), building per-phase execution context with
 * worktree paths, and selecting parallel vs sequential mode based on backend capabilities.
 *
 * Depends on: lib/deps.js (buildDependencyGraph), lib/utils.js, lib/backend.js, lib/roadmap.js
 */

const { output, loadConfig, findPhaseInternal, getMilestoneInfo } = require('./utils');
const { detectBackend, getBackendCapabilities } = require('./backend');
const { worktreePath } = require('./worktree');
const { buildDependencyGraph } = require('./deps');
const { analyzeRoadmap } = require('./roadmap');
const { runPreflightGates } = require('./gates');

// ─── validateIndependentPhases ──────────────────────────────────────────────

/**
 * Validate that requested phases have no direct dependency edges between them.
 *
 * Only checks DIRECT edges (not transitive paths). This is correct because the
 * command template already receives parallel_groups from deps analysis for ordering.
 * The validation here prevents the user from requesting two phases where one
 * directly depends on the other.
 *
 * @param {{nodes: Array<{id: string}>, edges: Array<{from: string, to: string}>}} graph - Dependency graph from buildDependencyGraph
 * @param {string[]} requestedPhases - Array of phase number strings to validate
 * @returns {{valid: boolean, conflicts?: Array<{from: string, to: string}>, phases: string[]}}
 */
function validateIndependentPhases(graph, requestedPhases) {
  if (requestedPhases.length <= 1) {
    return { valid: true, phases: requestedPhases };
  }

  const requestedSet = new Set(requestedPhases);
  const conflicts = [];

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
 *
 * @param {string} cwd - Project working directory
 * @param {string[]} phaseNumbers - Array of phase number strings
 * @returns {Object} Structured context with mode, phases, status_tracker, backend info
 */
function buildParallelContext(cwd, phaseNumbers) {
  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const capabilities = getBackendCapabilities(backend);
  const milestone = getMilestoneInfo(cwd);

  // Determine mode: parallel only if backend supports teams AND config allows it
  const mode =
    capabilities.teams === true && config.use_teams !== false ? 'parallel' : 'sequential';

  // Build fallback note for sequential mode
  const fallback_note =
    mode === 'sequential'
      ? 'Parallel execution available on Claude Code backend with teams enabled'
      : null;

  // Build per-phase context objects
  const phaseContexts = [];
  for (const phaseNum of phaseNumbers) {
    const phaseInfo = findPhaseInternal(cwd, phaseNum);
    if (!phaseInfo) {
      return { error: `Phase ${phaseNum} not found` };
    }

    const worktree_path = worktreePath(cwd, milestone.version, phaseInfo.phase_number);

    const template = config.phase_branch_template || 'grd/{milestone}/{phase}-{slug}';
    const worktree_branch = template
      .replace('{milestone}', milestone.version)
      .replace('{phase}', phaseInfo.phase_number)
      .replace('{slug}', phaseInfo.phase_slug || 'phase');

    phaseContexts.push({
      phase_number: phaseInfo.phase_number,
      phase_name: phaseInfo.phase_name,
      phase_slug: phaseInfo.phase_slug,
      phase_dir: phaseInfo.directory,
      worktree_path,
      worktree_branch,
      plans: phaseInfo.plans,
      incomplete_plans: phaseInfo.incomplete_plans,
      plan_count: phaseInfo.plans ? phaseInfo.plans.length : 0,
    });
  }

  // Build status tracker with per-phase pending state
  const status_tracker = { phases: {} };
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
 *
 * @param {string} cwd - Project working directory
 * @param {string[]} phaseNumbers - Array of phase number strings (at least 1)
 * @param {Set<string>} includes - Set of content sections to include
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs context JSON to stdout and exits
 */
function cmdInitExecuteParallel(cwd, phaseNumbers, includes, raw) {
  // Validate at least one phase requested
  if (!phaseNumbers || phaseNumbers.length === 0) {
    output({ error: 'At least one phase number is required' }, raw);
    return;
  }

  // Run preflight gates (reuse execute-phase gates with first phase)
  const gates = runPreflightGates(cwd, 'execute-phase', { phase: phaseNumbers[0] });
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
  const missing = phaseNumbers.filter((pn) => !roadmapPhaseNumbers.has(pn));
  if (missing.length > 0) {
    output({ error: `Phase(s) not found in roadmap: ${missing.join(', ')}` }, raw);
    return;
  }

  // Build dependency graph and validate independence
  const graph = buildDependencyGraph(roadmapResult.phases);
  const validation = validateIndependentPhases(graph, phaseNumbers);

  if (!validation.valid) {
    const conflictStr = validation.conflicts
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

  // Build parallel context
  const context = buildParallelContext(cwd, phaseNumbers);
  if (context.error) {
    output(context, raw);
    return;
  }

  // Add independence validation flag
  context.independence_validated = true;

  // Include gate warnings if any
  if (gates.warnings && gates.warnings.length > 0) {
    context.gate_warnings = gates.warnings;
  }

  output(context, raw);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  validateIndependentPhases,
  buildParallelContext,
  cmdInitExecuteParallel,
};
