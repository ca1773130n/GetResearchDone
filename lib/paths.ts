/**
 * GRD Path Resolution -- Centralized .planning/ subdirectory path construction
 *
 * Single source of truth for all milestone-scoped directory paths.
 * All other modules should import from this module instead of
 * hardcoding path.join(cwd, '.planning', 'phases', ...) constructions.
 *
 * Always returns milestone-scoped paths (.planning/milestones/{milestone}/...).
 * Callers use fs.mkdirSync({ recursive: true }) to create directories as needed.
 *
 * Dependencies: fs, path (Node built-in only -- no circular lib/ deps)
 */
'use strict';

import type { Dirent } from 'fs';

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
 */
function currentMilestone(cwd: string): string {
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');

  let content: string;
  try {
    content = fs.readFileSync(statePath, 'utf-8');
  } catch {
    return inferMilestoneFromDisk(cwd);
  }

  // Extract the **Milestone:** field value
  const fieldMatch: RegExpMatchArray | null = content.match(
    /\*\*Milestone:\*\*\s*(.+)/i,
  );
  if (!fieldMatch) return inferMilestoneFromDisk(cwd);

  const fieldValue: string = fieldMatch[1].trim();
  if (!fieldValue) return inferMilestoneFromDisk(cwd);

  // Extract just the version string (vX.Y or vX.Y.Z etc.)
  const versionMatch: RegExpMatchArray | null = fieldValue.match(/(v[\d.]+)/);
  if (!versionMatch) return inferMilestoneFromDisk(cwd);

  return versionMatch[1];
}

/**
 * Fallback: infer milestone from ROADMAP.md and .planning/milestones/ directory.
 *
 * Mirrors the 4-strategy approach from getMilestoneInfo() in utils.js
 * (duplicated here to avoid circular dependency: utils.js imports paths.js).
 * Falls back to scanning milestones/ directory if ROADMAP.md parsing fails.
 */
function inferMilestoneFromDisk(cwd: string): string {
  // Collect active milestone directories on disk
  const msDir: string = path.join(cwd, '.planning', 'milestones');
  let activeDirs: string[] = [];
  try {
    const entries: Dirent[] = fs.readdirSync(msDir, { withFileTypes: true });
    activeDirs = entries
      .filter(
        (e: Dirent) =>
          e.isDirectory() &&
          !e.name.endsWith('-phases') &&
          e.name !== 'anonymous',
      )
      .map((e: Dirent) => e.name);
  } catch {
    // milestones dir doesn't exist
  }

  // If exactly one active milestone dir, use it directly
  if (activeDirs.length === 1) return activeDirs[0];

  // If multiple dirs exist, disambiguate via ROADMAP.md
  if (activeDirs.length > 1) {
    const fromRoadmap: string | null = parseRoadmapMilestone(cwd);
    if (fromRoadmap && activeDirs.includes(fromRoadmap)) return fromRoadmap;
  }

  return 'anonymous';
}

/**
 * Parse ROADMAP.md for the active milestone version string.
 * Mirrors strategies 1-3 from getMilestoneInfo() in utils.js.
 * (Duplicated here to avoid circular dependency: utils.js imports paths.js.)
 */
function parseRoadmapMilestone(cwd: string): string | null {
  try {
    const raw: string = fs.readFileSync(
      path.join(cwd, '.planning', 'ROADMAP.md'),
      'utf-8',
    );
    const roadmap: string = raw.replace(/<details>[\s\S]*?<\/details>/gi, '');

    // Strategy 1: "(in progress)" milestone bullet
    const inProgress: RegExpMatchArray | null = roadmap.match(
      /-\s+(v[\d.]+)\s+[^\n(]+?\s*\(in progress\)/im,
    );
    if (inProgress) return inProgress[1];

    // Strategy 2: Last non-shipped milestone bullet
    const bulletRegex =
      /-\s+(v[\d.]+)\s+[^\n(]+?(?:\s*\(([^)]*)\))?\s*$/gim;
    let lastNonShipped: string | null = null;
    let m: RegExpExecArray | null;
    while ((m = bulletRegex.exec(roadmap)) !== null) {
      if (!/shipped/i.test(m[2] || '')) lastNonShipped = m[1];
    }
    if (lastNonShipped) return lastNonShipped;

    // Strategy 3: Heading format "## vX.Y.Z: Name"
    const headingMatch: RegExpMatchArray | null = roadmap.match(
      /^##\s+(?!#).*?(v\d+\.\d+(?:\.\d+)?)\s*[:\s]+([^\n(]+)/m,
    );
    if (headingMatch) return headingMatch[1];
  } catch {
    // ROADMAP.md doesn't exist
  }
  return null;
}

// ─── Internal Helper ────────────────────────────────────────────────────────

/**
 * Return the milestone root directory path.
 */
function milestoneRoot(cwd: string, milestone: string): string {
  return path.join(cwd, '.planning', 'milestones', milestone);
}

// ─── Directory Path Functions ───────────────────────────────────────────────

/**
 * Root milestones container directory.
 */
function milestonesDir(cwd: string): string {
  return path.join(cwd, '.planning', 'milestones');
}

/**
 * Milestone-scoped phases directory.
 *
 * Always returns the milestone-scoped path (.planning/milestones/{milestone}/phases/).
 * Callers should use fs.mkdirSync({ recursive: true }) to ensure the directory exists.
 */
function phasesDir(cwd: string, milestone?: string | null): string {
  if (milestone == null) {
    milestone = currentMilestone(cwd);
  }
  const milestonesBase: string = path.join(cwd, '.planning', 'milestones');
  const resolved: string = path.join(
    milestoneRoot(cwd, milestone),
    'phases',
  );
  if (
    !resolved.startsWith(milestonesBase + path.sep) &&
    resolved !== milestonesBase
  ) {
    throw new Error(
      `Invalid milestone: path would escape .planning directory`,
    );
  }
  return resolved;
}

/**
 * Specific phase subdirectory within a milestone.
 *
 * Uses phasesDir() for the base path, inheriting its backward-compatible fallback.
 */
function phaseDir(
  cwd: string,
  milestone: string | undefined,
  phaseDirName: string,
): string {
  const base: string = phasesDir(cwd, milestone);
  const resolved: string = path.join(base, phaseDirName);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(
      `Invalid phase directory: path would escape phases directory`,
    );
  }
  return resolved;
}

/**
 * Milestone-scoped research directory.
 */
function researchDir(cwd: string, milestone?: string | null): string {
  if (milestone == null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(milestoneRoot(cwd, milestone), 'research');
}

/**
 * Project-level codebase analysis directory.
 *
 * Always returns .planning/codebase/ -- codebase maps are project-wide,
 * not scoped to a specific milestone.
 */
function codebaseDir(cwd: string): string {
  return path.join(cwd, '.planning', 'codebase');
}

/**
 * Milestone-scoped todos directory.
 */
function todosDir(cwd: string, milestone?: string | null): string {
  if (milestone == null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(milestoneRoot(cwd, milestone), 'todos');
}

/**
 * Milestone-scoped quick tasks directory.
 */
function quickDir(cwd: string, milestone?: string | null): string {
  if (milestone == null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(milestoneRoot(cwd, milestone), 'quick');
}

/**
 * Archived phases directory for a completed milestone.
 *
 * Matches the existing archive layout where completed milestone phases
 * are stored as {version}-phases/ directories.
 */
function archivedPhasesDir(cwd: string, version: string): string {
  const milestonesBase: string = path.join(cwd, '.planning', 'milestones');
  const resolved: string = path.join(milestonesBase, version + '-phases');
  if (
    !resolved.startsWith(milestonesBase + path.sep) &&
    resolved !== milestonesBase
  ) {
    throw new Error(
      `Invalid version: path would escape .planning directory`,
    );
  }
  return resolved;
}

/**
 * Milestone-scoped standards directory.
 */
function standardsDir(cwd: string, milestone?: string | null): string {
  if (milestone == null) {
    milestone = currentMilestone(cwd);
  }
  return path.join(milestoneRoot(cwd, milestone), 'standards');
}

// ─── Exports ────────────────────────────────────────────────────────────────

/**
 * Root .planning directory path.
 *
 * Single source of truth for the .planning/ directory location.
 * Use this instead of hardcoding path.join(cwd, '.planning', ...) constructions.
 */
function planningDir(cwd: string): string {
  return path.join(cwd, '.planning');
}

module.exports = {
  currentMilestone,
  planningDir,
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
