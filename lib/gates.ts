/**
 * GRD Validation Gate System — Pre-flight checks for workflow commands
 *
 * Detects phase directory collisions, orphaned phases, stale artifacts,
 * and milestone state inconsistencies before commands execute.
 *
 * Dependencies: utils.js (one-directional, no circular deps)
 */

'use strict';

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
    const match: string | undefined = dirs.find((d: string) =>
      d.startsWith(normalized)
    );
    if (!match) return violations;

    const phaseFiles: string[] = fs.readdirSync(
      path.join(phasesDir, match)
    );
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
    const match: string | undefined = dirs.find((d: string) =>
      d.startsWith(normalized)
    );
    if (!match) return violations;

    const phaseFiles: string[] = fs.readdirSync(
      path.join(phasesDir, match)
    );
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
  const activeContent: string | null = roadmapContent
    ? stripShippedSections(roadmapContent)
    : null;

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

// ─── Gate Registry ────────────────────────────────────────────────────────────

/**
 * Declarative mapping of commands to their required gate checks.
 */
const GATE_REGISTRY: GateRegistryMap = {
  'execute-phase': ['orphaned-phases', 'phase-in-roadmap', 'phase-has-plans'],
  'plan-phase': [
    'orphaned-phases',
    'phase-in-roadmap',
    'no-stale-artifacts',
  ],
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
  'phase-has-plans': (cwd: string, opts: GateOptions) =>
    checkPhaseHasPlans(cwd, opts.phase || ''),
  'no-stale-artifacts': (cwd: string, opts: GateOptions) =>
    checkNoStaleArtifacts(cwd, opts.phase || ''),
  'old-phases-archived': (cwd: string) => checkOldPhasesArchived(cwd),
  'milestone-state-coherence': (cwd: string) =>
    checkMilestoneStateCoherence(cwd),
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
  // Registry and runner
  GATE_REGISTRY,
  runPreflightGates,
  resetGatesCache,
};
