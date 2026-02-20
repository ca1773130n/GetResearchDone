/**
 * GRD Path Resolution — Centralized .planning/ subdirectory path construction
 *
 * Single source of truth for all milestone-scoped directory paths.
 * All other modules should import from this module instead of
 * hardcoding path.join(cwd, '.planning', 'phases', ...) constructions.
 *
 * Includes backward-compatible fallback: when the new-style milestone
 * directory (.planning/milestones/{milestone}/) does not exist on disk,
 * functions return old-style paths (.planning/phases/, .planning/research/,
 * etc.) to ensure existing tests and workflows continue to work during
 * the transition period (Phase 35 performs the physical migration).
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

// ─── Internal Fallback Helper ───────────────────────────────────────────────

/**
 * Check if a milestone directory exists on disk.
 * @param {string} cwd - Project working directory
 * @param {string} milestone - Milestone identifier
 * @returns {boolean} True if .planning/milestones/{milestone}/ exists
 */
function milestoneExistsOnDisk(cwd, milestone) {
  const milestoneRoot = path.join(cwd, '.planning', 'milestones', milestone);
  try {
    return fs.existsSync(milestoneRoot);
  } catch {
    return false;
  }
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
 * Milestone-scoped phases directory with backward-compatible fallback.
 *
 * Returns the new-style path (.planning/milestones/{milestone}/phases/) when the
 * milestone directory exists on disk, otherwise falls back to the old-style path
 * (.planning/phases/) for backward compatibility during the transition period.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to phases directory (new or old layout)
 */
function phasesDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  if (milestoneExistsOnDisk(cwd, milestone)) {
    return path.join(cwd, '.planning', 'milestones', milestone, 'phases');
  }
  return path.join(cwd, '.planning', 'phases');
}

/**
 * Specific phase subdirectory within a milestone.
 *
 * Uses phasesDir() for the base path, inheriting its backward-compatible fallback.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @param {string} phaseDirName - Phase directory name (e.g., '32-centralized-path-resolution-module')
 * @returns {string} Absolute path to phase directory (new or old layout)
 */
function phaseDir(cwd, milestone, phaseDirName) {
  return path.join(phasesDir(cwd, milestone), phaseDirName);
}

/**
 * Milestone-scoped research directory with backward-compatible fallback.
 *
 * Returns the new-style path when the milestone directory exists on disk,
 * otherwise falls back to .planning/research/.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to research directory (new or old layout)
 */
function researchDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  if (milestoneExistsOnDisk(cwd, milestone)) {
    return path.join(cwd, '.planning', 'milestones', milestone, 'research');
  }
  return path.join(cwd, '.planning', 'research');
}

/**
 * Project-level codebase analysis directory.
 *
 * Always returns .planning/codebase/ — codebase maps are project-wide,
 * not scoped to a specific milestone.
 *
 * @param {string} cwd - Project working directory
 * @returns {string} Absolute path to codebase directory
 */
function codebaseDir(cwd) {
  return path.join(cwd, '.planning', 'codebase');
}

/**
 * Milestone-scoped todos directory with backward-compatible fallback.
 *
 * Returns the new-style path when the milestone directory exists on disk,
 * otherwise falls back to .planning/todos/.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to todos directory (new or old layout)
 */
function todosDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  if (milestoneExistsOnDisk(cwd, milestone)) {
    return path.join(cwd, '.planning', 'milestones', milestone, 'todos');
  }
  return path.join(cwd, '.planning', 'todos');
}

/**
 * Milestone-scoped quick tasks directory with backward-compatible fallback.
 *
 * Returns the new-style path (.planning/milestones/{milestone}/quick/) when the
 * milestone directory exists on disk, otherwise falls back to .planning/quick/.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to quick tasks directory (new or old layout)
 */
function quickDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  if (milestoneExistsOnDisk(cwd, milestone)) {
    return path.join(cwd, '.planning', 'milestones', milestone, 'quick');
  }
  return path.join(cwd, '.planning', 'quick');
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
