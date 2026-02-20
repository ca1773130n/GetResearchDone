/**
 * GRD Validation Gate System — Pre-flight checks for workflow commands
 *
 * Detects phase directory collisions, orphaned phases, stale artifacts,
 * and milestone state inconsistencies before commands execute.
 *
 * Dependencies: utils.js (one-directional, no circular deps)
 */

const fs = require('fs');
const path = require('path');

const { loadConfig, normalizePhaseName, safeReadFile, stripShippedSections } = require('./utils');
const { phasesDir: getPhasesDirPath } = require('./paths');

// ─── Gate Check Functions ─────────────────────────────────────────────────────

/**
 * Check for phase directories on disk that are not in ROADMAP.md.
 * @param {string} cwd - Project working directory
 * @returns {Array<Object>} Array of violation objects
 */
function checkOrphanedPhases(cwd) {
  const violations = [];
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir = getPhasesDirPath(cwd);

  const roadmapContent = safeReadFile(roadmapPath);
  if (!roadmapContent) return violations;
  const activeContent = stripShippedSections(roadmapContent);

  // Extract phases from ROADMAP
  const roadmapPhases = new Set();
  const phasePattern = /###\s*Phase\s+(\d+(?:\.\d+)?)\s*:/gi;
  let m;
  while ((m = phasePattern.exec(activeContent)) !== null) {
    roadmapPhases.add(m[1]);
  }

  // Get phases on disk
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    for (const dir of dirs) {
      const dm = dir.match(/^(\d+(?:\.\d+)?)/);
      if (!dm) continue;
      const phaseNum = dm[1];
      const unpadded = String(parseInt(phaseNum, 10));

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
  } catch {
    // phases dir may not exist
  }

  return violations;
}

/**
 * Check that a target phase exists in ROADMAP.md.
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to check
 * @returns {Array<Object>} Array of violation objects
 */
function checkPhaseInRoadmap(cwd, phase) {
  const violations = [];
  if (!phase) return violations;

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const phasesDir = getPhasesDirPath(cwd);
  const roadmapContent = safeReadFile(roadmapPath);
  if (!roadmapContent) return violations;
  const activeContent = stripShippedSections(roadmapContent);

  // Only flag if the phase exists on disk but not in ROADMAP.
  // If it doesn't exist on disk either, let normal command logic handle "not found".
  const normalized = normalizePhaseName(phase);
  let existsOnDisk = false;
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    existsOnDisk = dirs.some((d) => d.startsWith(normalized));
  } catch {
    // phases dir may not exist
  }

  if (!existsOnDisk) return violations;

  const unpadded = String(parseInt(normalized, 10));
  const phaseRegex = new RegExp(`###\\s*Phase\\s+(?:${normalized}|${unpadded})\\s*:`, 'i');

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
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to check
 * @returns {Array<Object>} Array of violation objects
 */
function checkPhaseHasPlans(cwd, phase) {
  const violations = [];
  if (!phase) return violations;

  const phasesDir = getPhasesDirPath(cwd);
  const normalized = normalizePhaseName(phase);

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const match = dirs.find((d) => d.startsWith(normalized));
    if (!match) return violations;

    const phaseFiles = fs.readdirSync(path.join(phasesDir, match));
    const plans = phaseFiles.filter((f) => f.endsWith('-PLAN.md') || f === 'PLAN.md');

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
 * @param {string} cwd - Project working directory
 * @param {string} phase - Phase number to check
 * @returns {Array<Object>} Array of violation objects
 */
function checkNoStaleArtifacts(cwd, phase) {
  const violations = [];
  if (!phase) return violations;

  const phasesDir = getPhasesDirPath(cwd);
  const normalized = normalizePhaseName(phase);

  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const match = dirs.find((d) => d.startsWith(normalized));
    if (!match) return violations;

    const phaseFiles = fs.readdirSync(path.join(phasesDir, match));
    const plans = new Set(
      phaseFiles.filter((f) => f.endsWith('-PLAN.md')).map((f) => f.replace('-PLAN.md', ''))
    );
    const summaries = phaseFiles
      .filter((f) => f.endsWith('-SUMMARY.md'))
      .map((f) => f.replace('-SUMMARY.md', ''));

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
 * @param {string} cwd - Project working directory
 * @returns {Array<Object>} Array of violation objects
 */
function checkOldPhasesArchived(cwd) {
  const violations = [];
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const phasesDir = getPhasesDirPath(cwd);

  const stateContent = safeReadFile(statePath);
  if (!stateContent) return violations;

  // Check if STATE.md indicates a milestone was completed
  const milestoneCompletePattern = /milestone\s+complete/i;
  if (!milestoneCompletePattern.test(stateContent)) return violations;

  // If milestone is marked complete, phases dir should be empty
  try {
    const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

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
 * @param {string} cwd - Project working directory
 * @returns {Array<Object>} Array of violation objects
 */
function checkMilestoneStateCoherence(cwd) {
  const violations = [];
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');

  const stateContent = safeReadFile(statePath);
  if (!stateContent) return violations;

  const roadmapContent = safeReadFile(roadmapPath);
  const activeContent = roadmapContent ? stripShippedSections(roadmapContent) : null;

  // Check: STATE references a phase that doesn't exist in ROADMAP
  const activePhaseMatch = stateContent.match(
    /\*\*(?:Active phase|Current Phase):\*\*\s*(\d+(?:\.\d+)?)/i
  );
  if (activePhaseMatch && activeContent) {
    const activePhase = activePhaseMatch[1];
    const unpadded = String(parseInt(activePhase, 10));
    const phaseInRoadmap = new RegExp(`###\\s*Phase\\s+(?:${activePhase}|${unpadded})\\s*:`, 'i');
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
const GATE_REGISTRY = {
  'execute-phase': ['orphaned-phases', 'phase-in-roadmap', 'phase-has-plans'],
  'plan-phase': ['orphaned-phases', 'phase-in-roadmap', 'no-stale-artifacts'],
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
const GATE_CHECKS = {
  'orphaned-phases': (cwd) => checkOrphanedPhases(cwd),
  'phase-in-roadmap': (cwd, opts) => checkPhaseInRoadmap(cwd, opts.phase),
  'phase-has-plans': (cwd, opts) => checkPhaseHasPlans(cwd, opts.phase),
  'no-stale-artifacts': (cwd, opts) => checkNoStaleArtifacts(cwd, opts.phase),
  'old-phases-archived': (cwd) => checkOldPhasesArchived(cwd),
  'milestone-state-coherence': (cwd) => checkMilestoneStateCoherence(cwd),
};

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Run pre-flight gate checks for a command.
 * @param {string} cwd - Project working directory
 * @param {string} command - Command name (e.g., 'execute-phase', 'plan-phase')
 * @param {Object} [options={}] - Command options (e.g., { phase: '05' })
 * @returns {Object} Gate result with passed, bypassed, errors, warnings, command
 */
function runPreflightGates(cwd, command, options = {}) {
  const result = {
    passed: true,
    bypassed: false,
    errors: [],
    warnings: [],
    command,
  };

  // New project safety: if no ROADMAP.md exists, all checks pass
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  try {
    fs.statSync(roadmapPath);
  } catch {
    return result;
  }

  // Look up gates for this command
  const gateNames = GATE_REGISTRY[command];
  if (!gateNames) return result;

  // Run each gate check
  for (const gateName of gateNames) {
    const checkFn = GATE_CHECKS[gateName];
    if (!checkFn) continue;

    try {
      const violations = checkFn(cwd, options);
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
  const config = loadConfig(cwd);
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
};
