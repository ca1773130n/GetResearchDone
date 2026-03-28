'use strict';

/**
 * GRD Validation Gate System — Pre-flight checks for workflow commands
 *
 * Detects phase directory collisions, orphaned phases, stale artifacts,
 * and milestone state inconsistencies before commands execute.
 *
 * Dependencies: utils.js (one-directional, no circular deps)
 */


import type { RunCache, GrdConfig, GateViolation, PreflightResult } from './types';

const fs = require('fs');
const path = require('path');

const {
  loadConfig,
  normalizePhaseName,
  safeReadFile,
  stripShippedSections,
  createRunCache,
} = require('./utils');
const { phasesDir: getPhasesDirPath } = require('./paths');
const { validateStructural, validateCrossPhase, extractPlanArtifact } = require('./invariants') as {
  validateStructural: (plan: import('./types').PlanArtifact) => import('./types').ValidationResult;
  validateCrossPhase: (plans: import('./types').PlanArtifact[]) => import('./types').ValidationResult;
  extractPlanArtifact: (content: string) => import('./types').PlanArtifact;
};
const { buildCitationGraph, findUnresolved } = require('./citations') as {
  buildCitationGraph: (papersDir: string) => import('./types').CitationGraph;
  findUnresolved: (graph: import('./types').CitationGraph, priority?: 'critical' | 'normal' | 'low') => import('./types').CitationNode[];
};

import type { TraversalOptions, TraversalResult, CitationGraph } from './types';

// ─── Domain Types ─────────────────────────────────────────────────────────────

/** Options passed to gate checks and runPreflightGates. */
interface GateOptions {
  phase?: string;
  skipGates?: boolean;
  [key: string]: unknown;
}

/** A gate check function signature. */
type GateCheckFn = (cwd: string, opts: GateOptions) => GateViolation[];

/** Registry mapping command names to gate check names. */
type GateRegistryMap = Record<string, string[]>;

/** Registry mapping gate names to check functions. */
type GateCheckMap = Record<string, GateCheckFn>;

// ─── File Content Cache ───────────────────────────────────────────────────────
const _gatesCache: RunCache = createRunCache();

function _gatesCachedRead(p: string): string | null {
  return _gatesCache.get(p, safeReadFile) as string | null;
}

// ─── Gate Check Functions ─────────────────────────────────────────────────────

/**
 * Check for phase directories on disk that are not in ROADMAP.md.
 */
function checkOrphanedPhases(cwd: string): GateViolation[] {
  const violations: GateViolation[] = [];
  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir: string = getPhasesDirPath(cwd);

  const roadmapContent: string | null = _gatesCachedRead(roadmapPath);
  if (!roadmapContent) return violations;
  const activeContent: string = stripShippedSections(roadmapContent);

  // Extract phases from ROADMAP
  const roadmapPhases: Set<string> = new Set();
  const phasePattern: RegExp = /#{2,3}\s*Phase\s+(\d+(?:\.\d+)?)\s*:/gi;
  let m: RegExpExecArray | null;
  while ((m = phasePattern.exec(activeContent)) !== null) {
    roadmapPhases.add(m[1]);
  }

  // Get phases on disk
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);

    for (const dir of dirs) {
      const dm: RegExpMatchArray | null = dir.match(/^(\d+(?:\.\d+)?)/);
      if (!dm) continue;
      const phaseNum: string = dm[1];
      const unpadded: string = String(parseInt(phaseNum, 10));

      if (!roadmapPhases.has(phaseNum) && !roadmapPhases.has(unpadded)) {
        violations.push({
          code: 'ORPHANED_PHASE',
          severity: 'error',
          message: `Phase directory "${dir}" exists on disk but not in ROADMAP.md`,
          fix: 'Run `/grd:complete-milestone` to archive old phase directories, or manually remove the orphaned directory',
          context: { directory: dir, phase_number: phaseNum },
        });
      }
    }
  } catch (err: unknown) {
    // ENOENT: phases dir may not exist — silent
    const fsErr = err as { code?: string; message?: string };
    if (fsErr.code !== 'ENOENT') {
      process.stderr.write(
        `Warning: unexpected error reading phases directory: ${fsErr.message}\n`
      );
    }
  }

  return violations;
}

/**
 * Check that a target phase exists in ROADMAP.md.
 */
function checkPhaseInRoadmap(cwd: string, phase: string): GateViolation[] {
  const violations: GateViolation[] = [];
  if (!phase) return violations;

  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir: string = getPhasesDirPath(cwd);
  const roadmapContent: string | null = _gatesCachedRead(roadmapPath);
  if (!roadmapContent) return violations;
  const activeContent: string = stripShippedSections(roadmapContent);

  // Only flag if the phase exists on disk but not in ROADMAP.
  // If it doesn't exist on disk either, let normal command logic handle "not found".
  const normalized: string = normalizePhaseName(phase);
  let existsOnDisk: boolean = false;
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);
    existsOnDisk = dirs.some((d: string) => d.startsWith(normalized));
  } catch {
    // phases dir may not exist
  }

  if (!existsOnDisk) return violations;

  const unpadded: string = String(parseInt(normalized, 10));
  const phaseRegex: RegExp = new RegExp(
    `#{2,}\\s*Phase\\s+(?:${normalized}|${unpadded})\\s*:`,
    'i'
  );

  if (!phaseRegex.test(activeContent)) {
    violations.push({
      code: 'PHASE_NOT_IN_ROADMAP',
      severity: 'error',
      message: `Phase ${phase} not found in ROADMAP.md — may be from a previous milestone`,
      fix: 'Ensure the phase exists in the current ROADMAP.md, or archive old phases with `/grd:complete-milestone`',
      context: { phase },
    });
  }

  return violations;
}

/**
 * Check that a target phase has at least one plan.
 */
function checkPhaseHasPlans(cwd: string, phase: string): GateViolation[] {
  const violations: GateViolation[] = [];
  if (!phase) return violations;

  const phasesDir: string = getPhasesDirPath(cwd);
  const normalized: string = normalizePhaseName(phase);

  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);
    const match: string | undefined = dirs.find((d: string) => d.startsWith(normalized));
    if (!match) return violations;

    const phaseFiles: string[] = fs.readdirSync(path.join(phasesDir, match));
    const plans: string[] = phaseFiles.filter(
      (f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md'
    );

    if (plans.length === 0) {
      violations.push({
        code: 'PHASE_NO_PLANS',
        severity: 'error',
        message: `Phase ${phase} has no plans — run /grd:plan-phase ${phase} first`,
        fix: `Run \`/grd:plan-phase ${phase}\` to create execution plans`,
        context: { phase, directory: match },
      });
    }
  } catch {
    // phase dir may not exist
  }

  return violations;
}

/**
 * Check for stale artifacts (summaries without matching plans).
 */
function checkNoStaleArtifacts(cwd: string, phase: string): GateViolation[] {
  const violations: GateViolation[] = [];
  if (!phase) return violations;

  const phasesDir: string = getPhasesDirPath(cwd);
  const normalized: string = normalizePhaseName(phase);

  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);
    const match: string | undefined = dirs.find((d: string) => d.startsWith(normalized));
    if (!match) return violations;

    const phaseFiles: string[] = fs.readdirSync(path.join(phasesDir, match));
    const plans: Set<string> = new Set(
      phaseFiles
        .filter((f: string) => f.endsWith('-PLAN.md'))
        .map((f: string) => f.replace('-PLAN.md', ''))
    );
    const summaries: string[] = phaseFiles
      .filter((f: string) => f.endsWith('-SUMMARY.md'))
      .map((f: string) => f.replace('-SUMMARY.md', ''));

    for (const sid of summaries) {
      if (!plans.has(sid)) {
        violations.push({
          code: 'STALE_ARTIFACTS',
          severity: 'warning',
          message: `Summary ${sid}-SUMMARY.md in phase ${phase} has no matching PLAN.md`,
          fix: 'Remove the orphaned summary or recreate the missing plan',
          context: { phase, summary: `${sid}-SUMMARY.md` },
        });
      }
    }
  } catch {
    // phase dir may not exist
  }

  return violations;
}

/**
 * Check that completed milestone phases have been archived.
 */
function checkOldPhasesArchived(cwd: string): GateViolation[] {
  const violations: GateViolation[] = [];
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  const phasesDir: string = getPhasesDirPath(cwd);

  const stateContent: string | null = safeReadFile(statePath);
  if (!stateContent) return violations;

  // Check if STATE.md indicates a milestone was completed
  const milestoneCompletePattern: RegExp = /milestone\s+complete/i;
  if (!milestoneCompletePattern.test(stateContent)) return violations;

  // If milestone is marked complete, phases dir should be empty
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name);

    if (dirs.length > 0) {
      violations.push({
        code: 'UNARCHIVED_PHASES',
        severity: 'error',
        message: `STATE.md indicates milestone complete but ${dirs.length} phase directories remain on disk`,
        fix: 'Run `/grd:complete-milestone` to properly archive phase directories before starting a new milestone',
        context: { phase_count: dirs.length, directories: dirs },
      });
    }
  } catch {
    // phases dir may not exist
  }

  return violations;
}

/**
 * Check milestone state coherence between STATE.md and disk state.
 */
function checkMilestoneStateCoherence(cwd: string): GateViolation[] {
  const violations: GateViolation[] = [];
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');

  const stateContent: string | null = safeReadFile(statePath);
  if (!stateContent) return violations;

  const roadmapContent: string | null = _gatesCachedRead(roadmapPath);
  const activeContent: string | null = roadmapContent ? stripShippedSections(roadmapContent) : null;

  // Check: STATE references a phase that doesn't exist in ROADMAP
  const activePhaseMatch: RegExpMatchArray | null = stateContent.match(
    /\*\*(?:Active phase|Current Phase):\*\*\s*(\d+(?:\.\d+)?)/i
  );
  if (activePhaseMatch && activeContent) {
    const activePhase: string = activePhaseMatch[1];
    const unpadded: string = String(parseInt(activePhase, 10));
    const phaseInRoadmap: RegExp = new RegExp(
      `#{2,}\\s*Phase\\s+(?:${activePhase}|${unpadded})\\s*:`,
      'i'
    );
    if (!phaseInRoadmap.test(activeContent)) {
      violations.push({
        code: 'MILESTONE_STATE_CONFUSION',
        severity: 'error',
        message: `STATE.md references Phase ${activePhase} but it does not exist in ROADMAP.md`,
        fix: 'Update STATE.md to reference a valid phase, or run `/grd:complete-milestone` to reset state',
        context: { active_phase: activePhase },
      });
    }
  }

  return violations;
}

/**
 * Check plan invariants: structural validity for each plan and cross-phase consistency.
 *
 * Satisfies REQ-180 (Pre-Flight Validation Gate): invalid plans are hard-rejected
 * before execution. Reads all *-PLAN.md files in the target phase directory,
 * runs validateStructural per plan, then validateCrossPhase across all plans.
 */
function checkInvariantValidation(cwd: string, opts: GateOptions): GateViolation[] {
  const violations: GateViolation[] = [];
  if (!opts.phase) return violations;

  const phasesDir: string = getPhasesDirPath(cwd);
  const normalized: string = normalizePhaseName(opts.phase as string);

  // Locate the phase directory on disk
  let phaseDir: string;
  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, { withFileTypes: true });
    const match = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name)
      .find((d: string) => d.startsWith(normalized));
    if (!match) return violations;
    phaseDir = path.join(phasesDir, match);
  } catch {
    return violations;
  }

  // Read all *-PLAN.md files
  let planFiles: string[];
  try {
    const phaseContents: string[] = fs.readdirSync(phaseDir);
    planFiles = phaseContents.filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md');
  } catch {
    return violations;
  }

  if (planFiles.length === 0) return violations;

  const planArtifacts: import('./types').PlanArtifact[] = [];

  // Structural validation per plan
  for (const planFile of planFiles) {
    const planPath = path.join(phaseDir, planFile);
    const content: string | null = safeReadFile(planPath);
    if (!content) continue;

    const artifact = extractPlanArtifact(content);
    planArtifacts.push(artifact);

    const result = validateStructural(artifact);
    for (const err of result.errors) {
      violations.push({
        code: 'INVARIANT_STRUCTURAL',
        severity: 'error',
        message: `${planFile}: ${err}`,
        fix: `Fix the structural issue in ${planFile} before execution`,
        context: { plan: planFile, error: err },
      });
    }
    for (const warn of result.warnings) {
      violations.push({
        code: 'INVARIANT_STRUCTURAL',
        severity: 'warning',
        message: `${planFile}: ${warn}`,
        fix: `Consider fixing the structural warning in ${planFile}`,
        context: { plan: planFile, warning: warn },
      });
    }
  }

  // Cross-phase validation across all plans in the set
  if (planArtifacts.length > 0) {
    const crossResult = validateCrossPhase(planArtifacts);
    for (const err of crossResult.errors) {
      violations.push({
        code: 'INVARIANT_CROSS_PHASE',
        severity: 'error',
        message: err,
        fix: 'Resolve cross-phase dependency conflicts between plans',
        context: { error: err },
      });
    }
    for (const warn of crossResult.warnings) {
      violations.push({
        code: 'INVARIANT_CROSS_PHASE',
        severity: 'warning',
        message: warn,
        fix: 'Consider adding provides/requires to plans for dependency tracking',
        context: { warning: warn },
      });
    }
  }

  return violations;
}

/**
 * Check for unresolved critical citation dependencies.
 *
 * Only runs when citation_gate is enabled in config (default: false).
 * Reads the citation graph from .planning/research/PAPERS.md if it exists.
 * Returns GateViolation[] for each critical unresolved CitationNode.
 *
 * Satisfies REQ-184 (Citation Recovery — configurable gate).
 */
function checkCitationGate(cwd: string, _opts: GateOptions): GateViolation[] {
  const violations: GateViolation[] = [];
  const config: GrdConfig = loadConfig(cwd);

  // Only run if citation_gate is enabled in config (default: false)
  const citationGateEnabled = (config as unknown as Record<string, unknown>).citation_gate === true;
  if (!citationGateEnabled) return violations;

  // Find research directory for current milestone
  const researchDir = path.join(cwd, '.planning', 'research');
  const papersPath = path.join(researchDir, 'PAPERS.md');

  // Only check if PAPERS.md exists
  try {
    fs.statSync(papersPath);
  } catch {
    return violations;
  }

  try {
    const graph = buildCitationGraph(researchDir);
    const criticalUnresolved = findUnresolved(graph, 'critical');

    for (const node of criticalUnresolved) {
      violations.push({
        code: 'CITATION_UNRESOLVED_CRITICAL',
        severity: 'error',
        message: `Critical citation dependency "${node.slug}" (${node.title}) is unresolved — run citation recovery before planning`,
        fix: 'Run `/grd:research-phase` with citation recovery enabled, or manually resolve the dependency',
        context: { slug: node.slug, title: node.title, priority: node.priority },
      });
    }
  } catch {
    // Citation graph build failed — non-blocking
  }

  return violations;
}

/**
 * Check for unresolved transitive citation dependencies (warning severity).
 *
 * Only runs when transitive_citation_gate is enabled in config (default: false).
 * Performs BFS traversal of the citation graph and reports unresolved leaf nodes
 * as warnings — these do not block plan-phase execution.
 *
 * Warning (not error) severity follows the principle that transitive dependencies
 * are informational — they inform what additional work may be needed without
 * blocking a researcher from planning a phase.
 */
function checkTransitiveCitationGate(cwd: string, _opts: GateOptions): GateViolation[] {
  const violations: GateViolation[] = [];
  const config: GrdConfig = loadConfig(cwd);
  const enabled = (config as unknown as Record<string, unknown>).transitive_citation_gate === true;
  if (!enabled) return violations;

  const researchDir = path.join(cwd, '.planning', 'research');
  const papersPath = path.join(researchDir, 'PAPERS.md');
  try { fs.statSync(papersPath); } catch { return violations; }

  try {
    const graph: CitationGraph = buildCitationGraph(researchDir);
    const { traverseCitationGraph } = require('./citations') as {
      traverseCitationGraph: (g: CitationGraph, opts?: Partial<TraversalOptions>) => TraversalResult;
    };
    const result: TraversalResult = traverseCitationGraph(graph);
    for (const node of result.unresolved_leaves) {
      violations.push({
        code: 'CITATION_UNRESOLVED_TRANSITIVE',
        severity: 'warning',
        message: `Transitive citation dependency "${node.slug}" is unresolved — consider running auto-retrieval`,
        fix: 'Enable transitive auto-retrieval or manually add a PAPERS.md entry for this dependency',
        context: { slug: node.slug, priority: node.priority },
      });
    }
  } catch {
    // Non-blocking
  }
  return violations;
}

// ─── Gate Registry ────────────────────────────────────────────────────────────

/**
 * Declarative mapping of commands to their required gate checks.
 */
const GATE_REGISTRY: GateRegistryMap = {
  'execute-phase': ['orphaned-phases', 'phase-in-roadmap', 'phase-has-plans', 'invariant-validation'],
  'plan-phase': ['orphaned-phases', 'phase-in-roadmap', 'no-stale-artifacts', 'invariant-validation', 'citation-gate', 'transitive-citation-gate'],
  'new-milestone': ['old-phases-archived', 'milestone-state-coherence'],
  'phase-add': ['orphaned-phases'],
  'phase-insert': ['orphaned-phases'],
  'phase-complete': ['phase-in-roadmap'],
  'milestone-complete': ['milestone-state-coherence'],
  'verify-work': ['phase-in-roadmap'],
  iterate: ['phase-in-roadmap', 'phase-has-plans'],
};

/**
 * Map gate names to check functions.
 */
const GATE_CHECKS: GateCheckMap = {
  'orphaned-phases': (cwd: string) => checkOrphanedPhases(cwd),
  'phase-in-roadmap': (cwd: string, opts: GateOptions) =>
    checkPhaseInRoadmap(cwd, opts.phase || ''),
  'phase-has-plans': (cwd: string, opts: GateOptions) => checkPhaseHasPlans(cwd, opts.phase || ''),
  'no-stale-artifacts': (cwd: string, opts: GateOptions) =>
    checkNoStaleArtifacts(cwd, opts.phase || ''),
  'old-phases-archived': (cwd: string) => checkOldPhasesArchived(cwd),
  'milestone-state-coherence': (cwd: string) => checkMilestoneStateCoherence(cwd),
  'invariant-validation': (cwd: string, opts: GateOptions) => checkInvariantValidation(cwd, opts),
  'citation-gate': (cwd: string, opts: GateOptions) => checkCitationGate(cwd, opts),
  'transitive-citation-gate': (cwd: string, opts: GateOptions) => checkTransitiveCitationGate(cwd, opts),
};

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Run pre-flight gate checks for a command.
 */
function runPreflightGates(
  cwd: string,
  command: string,
  options: GateOptions = {}
): PreflightResult {
  const result: PreflightResult = {
    passed: true,
    bypassed: false,
    errors: [],
    warnings: [],
    command,
  };

  // skipGates: true bypasses all checks immediately
  if (options.skipGates) {
    result.bypassed = true;
    return result;
  }

  // New project safety: if no ROADMAP.md exists, all checks pass
  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  try {
    fs.statSync(roadmapPath);
  } catch {
    return result;
  }

  // Look up gates for this command
  const gateNames: string[] | undefined = GATE_REGISTRY[command];
  if (!gateNames) return result;

  _gatesCache.init();
  try {
    // Run each gate check
    for (const gateName of gateNames) {
      const checkFn: GateCheckFn | undefined = GATE_CHECKS[gateName];
      if (!checkFn) continue;

      try {
        const violations: GateViolation[] = checkFn(cwd, options);
        for (const v of violations) {
          if (v.severity === 'error') {
            result.errors.push(v);
          } else {
            result.warnings.push(v);
          }
        }
      } catch {
        // Gate checks are non-blocking on internal errors
      }
    }

    // YOLO bypass: if autonomous_mode is enabled, pass regardless of errors
    const config: GrdConfig = loadConfig(cwd);
    if (config.autonomous_mode) {
      result.bypassed = true;
      result.passed = true;
      return result;
    }

    // Determine pass/fail based on errors
    if (result.errors.length > 0) {
      result.passed = false;
    }

    return result;
  } finally {
    _gatesCache.reset();
  }
}

/**
 * Reset the internal gates run cache (useful for testing).
 */
function resetGatesCache(): void {
  _gatesCache.reset();
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Gate check functions (for direct use and testing)
  checkOrphanedPhases,
  checkPhaseInRoadmap,
  checkPhaseHasPlans,
  checkNoStaleArtifacts,
  checkOldPhasesArchived,
  checkMilestoneStateCoherence,
  checkInvariantValidation,
  checkCitationGate,
  checkTransitiveCitationGate,
  // Registry and runner
  GATE_REGISTRY,
  runPreflightGates,
  resetGatesCache,
};
