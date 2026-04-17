'use strict';

/**
 * GRD Autopilot/Milestone -- Multi-milestone loop helpers.
 * Extracted from lib/autopilot.ts as part of the post-gsd-2 decomposition.
 *
 * Depends only on existing lib/roadmap and lib/long-term-roadmap modules.
 * No dependencies on other autopilot modules.
 */

const fs = require('fs');
const path = require('path');
const {
  analyzeRoadmap,
}: {
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
} = require('./roadmap');
const {
  parseLongTermRoadmap,
}: {
  parseLongTermRoadmap: (content: unknown) => {
    milestones: Array<{
      id: string;
      name: string;
      status: string;
      normal_milestones: Array<{ version: string; note?: string }>;
    }>;
  } | null;
} = require('./long-term-roadmap');
const {
  getBackendCapabilities,
}: {
  getBackendCapabilities: (backend: string) => import('./types').BackendCapabilities;
} = require('./backend');

// ─── Multi-Milestone Helpers ─────────────────────────────────────────────────

/**
 * Check if all phases in the current milestone are complete.
 * Returns true if every phase has disk_status 'complete' or roadmap_complete is true,
 * AND there is at least one phase.
 */
function isMilestoneComplete(cwd: string): boolean {
  const analysis = analyzeRoadmap(cwd);
  if (analysis.error || !analysis.phases || analysis.phases.length === 0) {
    return false;
  }

  return analysis.phases.every(
    (p) => (p as { disk_status?: string }).disk_status === 'complete' || p.roadmap_complete === true
  );
}

/**
 * Determine the next milestone to work on from LONG-TERM-ROADMAP.md.
 * Strategy:
 * - Parse LT roadmap, find the first "active" or "planned" LT milestone
 *   that has linked normal milestones not yet shipped (note != "shipped"),
 *   or find the next LT milestone that is "planned" with no linked milestones yet.
 * - Returns { version, name } of the next milestone to create, or null if none found.
 *
 * @param cwd - Absolute path to the project root directory
 * @returns The version and name of the next milestone to create, or null if no next milestone is found
 */
function resolveNextMilestone(cwd: string): { version: string; name: string } | null {
  const ltRoadmapPath: string = path.join(cwd, '.planning', 'LONG-TERM-ROADMAP.md');
  if (!fs.existsSync(ltRoadmapPath)) {
    return null;
  }

  const content: string = fs.readFileSync(ltRoadmapPath, 'utf-8');
  const parsed = parseLongTermRoadmap(content);
  if (!parsed) {
    return null;
  }

  // Find the first LT milestone that is "active" or "planned"
  for (const ltMs of parsed.milestones) {
    if (ltMs.status === 'completed') continue;

    // Check linked normal milestones -- find first that isn't shipped
    for (const nm of ltMs.normal_milestones) {
      const note: string = (nm.note || '').toLowerCase();
      if (note === 'shipped' || note === 'complete' || note === 'completed') {
        continue;
      }
      // This normal milestone isn't shipped yet -- it's the next one
      return { version: nm.version, name: ltMs.name };
    }

    // If all linked milestones are shipped but LT milestone isn't completed,
    // or if there are no linked milestones, this LT milestone needs a new normal milestone
    if (ltMs.status === 'planned') {
      return { version: `next-${ltMs.id.toLowerCase()}`, name: ltMs.name };
    }
  }

  return null;
}

/**
 * Build the prompt string for spawning `/grd:new-milestone` via `claude -p`.
 * Prepends "ultrathink" when the backend supports the effort capability.
 */
function buildNewMilestonePrompt(backend?: string): string {
  const basePrompt =
    'Use the Skill tool to invoke skill "grd:new-milestone" with no additional args. Autonomous mode — make all decisions yourself, no questions. Complete all milestone creation steps including research, requirements, and roadmap setup.';
  if (backend && getBackendCapabilities(backend).effort) {
    return `ultrathink\n\n${basePrompt}`;
  }
  return basePrompt;
}

/**
 * Build the prompt string for completing a milestone via `claude -p`.
 * Uses grd-tools.js milestone complete directly since it is a deterministic operation.
 */
function buildMilestoneCompletePrompt(version: string): string {
  return `Run the following command to complete the milestone: node \${CLAUDE_PLUGIN_ROOT}/bin/grd-tools.js milestone complete --name "${version}". Then verify the milestone was archived successfully by checking .planning/STATE.md.`;
}

module.exports = {
  isMilestoneComplete,
  resolveNextMilestone,
  buildNewMilestonePrompt,
  buildMilestoneCompletePrompt,
};
