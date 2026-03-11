/**
 * GRD Context/Base -- Shared utilities for all cmdInit* context functions
 *
 * Provides inferCeremonyLevel and buildInitContext, the two shared
 * functions imported by every other context sub-module.
 *
 * Dependencies: utils.ts, backend.ts, paths.ts (one-directional, no circular deps)
 */

'use strict';

import type {
  GrdConfig,
  PhaseInfo,
  MilestoneInfo,
  BackendCapabilities,
} from '../types';

const {
  path,
  safeReadFile,
  getMilestoneInfo,
}: {
  path: typeof import('path');
  safeReadFile: (filePath: string) => string | null;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
} = require('../utils');

const { detectBackend, getBackendCapabilities }: {
  detectBackend: (cwd: string) => string;
  getBackendCapabilities: (backend: string) => BackendCapabilities;
} = require('../backend');

const {
  phasesDir: getPhasesDirPath,
  researchDir: getResearchDirPath,
}: {
  phasesDir: (cwd: string) => string;
  researchDir: (cwd: string) => string;
} = require('../paths');

// ─── Ceremony Level Inference ────────────────────────────────────────────────

/**
 * Infer ceremony level from phase context signals.
 * @param config - Project config
 * @param phaseInfo - Phase info from findPhaseInternal
 * @param cwd - Project working directory
 * @returns 'light' | 'standard' | 'full'
 */
function inferCeremonyLevel(
  config: GrdConfig,
  phaseInfo: PhaseInfo | null,
  cwd: string
): string {
  // User override: config.ceremony.default_level
  const ceremony = config.ceremony || {};
  if (ceremony.default_level && ceremony.default_level !== 'auto') {
    return ceremony.default_level;
  }

  // Per-phase override
  if (phaseInfo && phaseInfo.phase_number && ceremony.phase_overrides) {
    const override =
      ceremony.phase_overrides[phaseInfo.phase_number] ||
      ceremony.phase_overrides[String(parseInt(phaseInfo.phase_number, 10))];
    if (override) return override;
  }

  // Auto-inference from signals
  if (!phaseInfo) return 'standard';

  const planCount = (phaseInfo.plans && phaseInfo.plans.length) || 0;
  const hasResearch = phaseInfo.has_research || false;

  // Check for eval targets in roadmap description
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  let hasEvalTargets = false;
  try {
    const roadmap = safeReadFile(roadmapPath) || '';
    const phaseNum = parseInt(phaseInfo.phase_number, 10);
    const phasePattern = new RegExp('## Phase ' + phaseNum + '[^#]*', 's');
    const phaseSection = (roadmap.match(phasePattern) || [])[0] || '';
    hasEvalTargets = /eval|experiment|metric|target|baseline/i.test(phaseSection);
  } catch (_e) {
    /* ignore */
  }

  if (planCount >= 5 || hasEvalTargets) return 'full';
  if (planCount >= 2 || hasResearch) return 'standard';
  return 'light';
}

// ─── Base Init Context Builder ───────────────────────────────────────────────

/**
 * Build a base init context object with common fields shared across all cmdInit* functions.
 * Loads backend, milestone, and path info; merges in caller-supplied overrides.
 * Does NOT call output() -- that responsibility stays in each cmdInit* function.
 * @param cwd - Project working directory
 * @param overrides - Additional fields to merge into the base context
 * @returns Merged context object
 */
function buildInitContext(
  cwd: string,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);
  const phases_dir = path.relative(cwd, getPhasesDirPath(cwd));
  const research_dir = path.relative(cwd, getResearchDirPath(cwd));
  const caps = getBackendCapabilities(backend);
  return {
    backend,
    backend_capabilities: caps,
    effort_supported: caps.effort === true,
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    phases_dir,
    research_dir,
    ...overrides,
  };
}

module.exports = {
  inferCeremonyLevel,
  buildInitContext,
};
