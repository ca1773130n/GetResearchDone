/**
 * GRD Path Resolution — Centralized .planning/ subdirectory path construction
 *
 * Single source of truth for all milestone-scoped directory paths.
 * All other modules should import from this module instead of
 * hardcoding path.join(cwd, '.planning', 'phases', ...) constructions.
 *
 * Always returns milestone-scoped paths (.planning/milestones/{milestone}/...).
 * Callers use fs.mkdirSync({ recursive: true }) to create directories as needed.
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
    return inferMilestoneFromDisk(cwd);
  }

  // Extract the **Milestone:** field value
  const fieldMatch = content.match(/\*\*Milestone:\*\*\s*(.+)/i);
  if (!fieldMatch) return inferMilestoneFromDisk(cwd);

  const fieldValue = fieldMatch[1].trim();
  if (!fieldValue) return inferMilestoneFromDisk(cwd);

  // Extract just the version string (vX.Y or vX.Y.Z etc.)
  const versionMatch = fieldValue.match(/(v[\d.]+)/);
  if (!versionMatch) return inferMilestoneFromDisk(cwd);

  return versionMatch[1];
}

/**
 * Fallback: infer milestone from .planning/milestones/ directory contents.
 *
 * Scans for non-archived milestone directories (excludes *-phases/ archives).
 * If exactly one active milestone exists, returns it. Otherwise returns 'anonymous'.
 *
 * @param {string} cwd - Project working directory
 * @returns {string} Milestone version or 'anonymous'
 */
function inferMilestoneFromDisk(cwd) {
  const msDir = path.join(cwd, '.planning', 'milestones');
  try {
    const entries = fs.readdirSync(msDir, { withFileTypes: true });
    const active = entries
      .filter((e) => e.isDirectory() && !e.name.endsWith('-phases') && e.name !== 'anonymous')
      .map((e) => e.name);
    if (active.length === 1) return active[0];
  } catch {
    // milestones dir doesn't exist
  }
  return 'anonymous';
}

// ─── Internal Helper ────────────────────────────────────────────────────────

/**
 * Return the milestone root directory path.
 * @param {string} cwd - Project working directory
 * @param {string} milestone - Milestone identifier
 * @returns {string} Absolute path to .planning/milestones/{milestone}/
 */
function milestoneRoot(cwd, milestone) {
  return path.join(cwd, '.planning', 'milestones', milestone);
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
 * Always returns the milestone-scoped path (.planning/milestones/{milestone}/phases/).
 * Callers should use fs.mkdirSync({ recursive: true }) to ensure the directory exists.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to phases directory
 */
function phasesDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(milestoneRoot(cwd, milestone), 'phases');
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
 * Milestone-scoped research directory.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to research directory
 */
function researchDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(milestoneRoot(cwd, milestone), 'research');
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
 * Milestone-scoped todos directory.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to todos directory
 */
function todosDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(milestoneRoot(cwd, milestone), 'todos');
}

/**
 * Milestone-scoped quick tasks directory.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to quick tasks directory
 */
function quickDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(milestoneRoot(cwd, milestone), 'quick');
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

/**
 * Milestone-scoped standards directory.
 *
 * @param {string} cwd - Project working directory
 * @param {string} [milestone] - Milestone version; defaults to currentMilestone(cwd)
 * @returns {string} Absolute path to standards directory
 */
function standardsDir(cwd, milestone) {
  if (milestone === undefined || milestone === null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(milestoneRoot(cwd, milestone), 'standards');
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
  standardsDir,
  archivedPhasesDir,
};
