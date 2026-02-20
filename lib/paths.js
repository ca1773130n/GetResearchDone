/**
 * GRD Path Resolution — Centralized .planning/ subdirectory path construction
 *
 * Single source of truth for all milestone-scoped directory paths.
 * All other modules should import from this module instead of
 * hardcoding path.join(cwd, '.planning', 'phases', ...) constructions.
 *
 * Dependencies: fs, path (Node built-in only — no circular lib/ deps)
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ─── Milestone Detection ────────────────────────────────────────────────────

/**
 * Read the current milestone version from STATE.md.
 *
 * Reads the **Milestone:** field from .planning/STATE.md and extracts
 * the version string (e.g., 'v0.2.1'). Returns 'anonymous' when
 * STATE.md is missing, unreadable, has no Milestone field, or the
 * field value contains no version string.
 *
 * @param {string} cwd - Project working directory
 * @returns {string} Milestone version (e.g., 'v0.2.1') or 'anonymous'
 */
function currentMilestone(cwd) {
  const statePath = path.join(cwd, '.planning', 'STATE.md');

  let content;
  try {
    content = fs.readFileSync(statePath, 'utf-8');
  } catch {
    return 'anonymous';
  }

  // Extract the **Milestone:** field value
  const fieldMatch = content.match(/\*\*Milestone:\*\*\s*(.+)/i);
  if (!fieldMatch) return 'anonymous';

  const fieldValue = fieldMatch[1].trim();
  if (!fieldValue) return 'anonymous';

  // Extract just the version string (vX.Y or vX.Y.Z etc.)
  const versionMatch = fieldValue.match(/(v[\d.]+)/);
  if (!versionMatch) return 'anonymous';

  return versionMatch[1];
}

// ─── Directory Path Functions ───────────────────────────────────────────────

/**
 * Root milestones container directory.
 *
 * @param {string} cwd - Project working directory
 * @returns {string} Absolute path to .planning/milestones/
 */
function milestonesDir(cwd) {
  return path.join(cwd, '.planning', 'milestones');
}

/**
 * Milestone-scoped phases directory.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to .planning/milestones/{milestone}/phases/
 */
function phasesDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(cwd, '.planning', 'milestones', milestone, 'phases');
}

/**
 * Specific phase subdirectory within a milestone.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @param {string} phaseDirName - Phase directory name (e.g., '32-centralized-path-resolution-module')
 * @returns {string} Absolute path to .planning/milestones/{milestone}/phases/{phaseDirName}
 */
function phaseDir(cwd, milestone, phaseDirName) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(cwd, '.planning', 'milestones', milestone, 'phases', phaseDirName);
}

/**
 * Milestone-scoped research directory.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to .planning/milestones/{milestone}/research/
 */
function researchDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(cwd, '.planning', 'milestones', milestone, 'research');
}

/**
 * Milestone-scoped codebase analysis directory.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to .planning/milestones/{milestone}/codebase/
 */
function codebaseDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(cwd, '.planning', 'milestones', milestone, 'codebase');
}

/**
 * Milestone-scoped todos directory.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to .planning/milestones/{milestone}/todos/
 */
function todosDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(cwd, '.planning', 'milestones', milestone, 'todos');
}

/**
 * Quick tasks directory — always under the 'anonymous' milestone.
 *
 * Quick tasks are milestone-independent and always stored under the
 * anonymous namespace.
 *
 * @param {string} cwd - Project working directory
 * @returns {string} Absolute path to .planning/milestones/anonymous/quick/
 */
function quickDir(cwd) {
  return path.join(cwd, '.planning', 'milestones', 'anonymous', 'quick');
}

/**
 * Archived phases directory for a completed milestone.
 *
 * Matches the existing archive layout where completed milestone phases
 * are stored as {version}-phases/ directories.
 *
 * @param {string} cwd - Project working directory
 * @param {string} version - Milestone version to archive (e.g., 'v0.1.6')
 * @returns {string} Absolute path to .planning/milestones/{version}-phases/
 */
function archivedPhasesDir(cwd, version) {
  return path.join(cwd, '.planning', 'milestones', version + '-phases');
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  currentMilestone,
  milestonesDir,
  phasesDir,
  phaseDir,
  researchDir,
  codebaseDir,
  todosDir,
  quickDir,
  archivedPhasesDir,
};
