/**
 * GRD Context/Progress -- Progress cache helpers and progress/milestone-gaps init
 *
 * Contains: _progressCachePath, _computeProgressMtimeKey,
 *           cmdInitProgress, cmdInitPlanMilestoneGaps (re-exported from research)
 *
 * Dependencies: base.ts, utils.ts, backend.ts, paths.ts
 */

'use strict';

import type {
  GrdConfig,
  MilestoneInfo,
  BackendCapabilities,
} from '../types';

const {
  fs, path, safeReadFile, safeReadMarkdown, loadConfig,
  resolveModelInternal, pathExistsInternal,
  getMilestoneInfo, output,
}: {
  fs: typeof import('fs');
  path: typeof import('path');
  safeReadFile: (p: string) => string | null;
  safeReadMarkdown: (p: string) => string | null;
  loadConfig: (cwd: string) => GrdConfig;
  resolveModelInternal: (cwd: string, agent: string) => string;
  pathExistsInternal: (cwd: string, target: string) => boolean;
  getMilestoneInfo: (cwd: string) => MilestoneInfo;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
} = require('../utils');

const { detectBackend, getBackendCapabilities }: {
  detectBackend: (cwd: string) => string;
  getBackendCapabilities: (b: string) => BackendCapabilities;
} = require('../backend');

const {
  planningDir: getPlanningDir, phasesDir: getPhasesDirPath,
  researchDir: getResearchDirPath, codebaseDir: getCodebaseDirPath,
  todosDir: getTodosDirPath, quickDir: getQuickDirPath,
}: {
  planningDir: (cwd: string) => string;
  phasesDir: (cwd: string) => string;
  researchDir: (cwd: string) => string;
  codebaseDir: (cwd: string) => string;
  todosDir: (cwd: string) => string;
  quickDir: (cwd: string) => string;
} = require('../paths');

// ─── Progress Cache Helpers ──────────────────────────────────────────────────

/**
 * Return the path to the progress cache file.
 */
function _progressCachePath(cwd: string): string {
  return path.join(cwd, '.planning', '.cache', 'progress.json');
}

/**
 * Compute an mtime-based cache key from key planning files.
 * Returns 0 if none of the files exist.
 */
function _computeProgressMtimeKey(cwd: string): number {
  const keyFiles = [
    path.join(cwd, '.planning', 'STATE.md'),
    path.join(cwd, '.planning', 'ROADMAP.md'),
    path.join(cwd, '.planning', 'config.json'),
  ];
  let key = 0;
  for (const f of keyFiles) {
    try {
      key += fs.statSync(f).mtimeMs;
    } catch {
      // File doesn't exist -- skip
    }
  }
  return key;
}

// ─── Progress Init ───────────────────────────────────────────────────────────

/** Phase info as computed for progress display. */
interface ProgressPhaseInfo {
  number: string;
  name: string | null;
  directory: string;
  status: string;
  plan_count: number;
  summary_count: number;
  has_research: boolean;
}

/**
 * CLI command: Initialize progress context with phase overview, current/next phase, and milestone info.
 */
function cmdInitProgress(
  cwd: string,
  includes: Set<string>,
  raw: boolean,
  refresh?: boolean
): void {
  // Cache: only when no includes are requested (and not bypassed by refresh)
  const noIncludes = !includes || includes.size === 0;
  if (noIncludes && !refresh) {
    const cachePath = _progressCachePath(cwd);
    let cachedHit: { mtime_key: number; data: Record<string, unknown> } | null = null;
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      const currentKey = _computeProgressMtimeKey(cwd);
      if (cached.mtime_key === currentKey && cached.data) {
        cachedHit = cached;
      }
    } catch {
      // Cache miss or invalid -- recompute
    }
    if (cachedHit) {
      output(cachedHit.data, raw, `Backend: ${cachedHit.data.backend}, milestone: ${cachedHit.data.milestone_version}, ${cachedHit.data.completed_count}/${cachedHit.data.phase_count} phases complete`);
      return;
    }
  }

  const config = loadConfig(cwd);
  const backend = detectBackend(cwd);
  const milestone = getMilestoneInfo(cwd);

  // Analyze phases
  const phasesDir = getPhasesDirPath(cwd);
  const phases: ProgressPhaseInfo[] = [];
  let currentPhase: ProgressPhaseInfo | null = null;
  let nextPhase: ProgressPhaseInfo | null = null;

  try {
    const entries: { name: string; isDirectory: () => boolean }[] =
      fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

    for (const dir of dirs) {
      const match = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      const phaseNumber = match ? match[1] : dir;
      const phaseName = match && match[2] ? match[2] : null;
      const phasePath = path.join(phasesDir, dir);
      const phaseFiles: string[] = fs.readdirSync(phasePath);

      const plans = phaseFiles.filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md');
      const summaries = phaseFiles.filter((f: string) => f.endsWith('-SUMMARY.md') || f === 'SUMMARY.md');
      const hasResearch = phaseFiles.some((f: string) => f.endsWith('-RESEARCH.md') || f === 'RESEARCH.md');

      const status =
        summaries.length >= plans.length && plans.length > 0
          ? 'complete'
          : plans.length > 0
            ? 'in_progress'
            : hasResearch
              ? 'researched'
              : 'pending';

      const phaseInfo: ProgressPhaseInfo = {
        number: phaseNumber,
        name: phaseName,
        directory: path.relative(cwd, path.join(phasesDir, dir)),
        status,
        plan_count: plans.length,
        summary_count: summaries.length,
        has_research: hasResearch,
      };

      phases.push(phaseInfo);

      if (!currentPhase && (status === 'in_progress' || status === 'researched')) {
        currentPhase = phaseInfo;
      }
      if (!nextPhase && status === 'pending') {
        nextPhase = phaseInfo;
      }
    }
  } catch {
    // Phases directory may not exist yet
  }

  // Check for paused work
  let pausedAt: string | null = null;
  const resumeState = safeReadMarkdown(path.join(cwd, '.planning', 'STATE.md'));
  if (resumeState) {
    const pauseMatch = resumeState.match(/\*\*Paused At:\*\*\s*(.+)/);
    if (pauseMatch) pausedAt = pauseMatch[1].trim();
  }

  const result: Record<string, unknown> = {
    backend,
    backend_capabilities: getBackendCapabilities(backend),
    executor_model: resolveModelInternal(cwd, 'grd-executor'),
    planner_model: resolveModelInternal(cwd, 'grd-planner'),
    commit_docs: config.commit_docs,
    milestone_version: milestone.version,
    milestone_name: milestone.name,
    phases,
    phase_count: phases.length,
    completed_count: phases.filter((p) => p.status === 'complete').length,
    in_progress_count: phases.filter((p) => p.status === 'in_progress').length,
    current_phase: currentPhase,
    next_phase: nextPhase,
    paused_at: pausedAt,
    has_work_in_progress: !!currentPhase,
    project_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'PROJECT.md')),
    roadmap_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'ROADMAP.md')),
    state_exists: pathExistsInternal(cwd, path.join(getPlanningDir(cwd), 'STATE.md')),
    phases_dir: path.relative(cwd, phasesDir),
    research_dir: path.relative(cwd, getResearchDirPath(cwd)),
    codebase_dir: path.relative(cwd, getCodebaseDirPath(cwd)),
    quick_dir: path.relative(cwd, getQuickDirPath(cwd)),
    todos_dir: path.relative(cwd, getTodosDirPath(cwd)),
  };

  // Include file contents if requested via --include
  if (includes && includes.has('state')) {
    result.state_content = safeReadMarkdown(path.join(cwd, '.planning', 'STATE.md'));
  }
  if (includes && includes.has('roadmap')) {
    result.roadmap_content = safeReadMarkdown(path.join(cwd, '.planning', 'ROADMAP.md'));
  }
  if (includes && includes.has('project')) {
    result.project_content = safeReadMarkdown(path.join(cwd, '.planning', 'PROJECT.md'));
  }
  if (includes && includes.has('config')) {
    result.config_content = safeReadFile(path.join(cwd, '.planning', 'config.json'));
  }

  // Write cache when no includes requested
  if (noIncludes) {
    try {
      const cachePath = _progressCachePath(cwd);
      fs.mkdirSync(path.dirname(cachePath), { recursive: true });
      const mtimeKey = _computeProgressMtimeKey(cwd);
      fs.writeFileSync(cachePath, JSON.stringify({ mtime_key: mtimeKey, data: result }));
    } catch {
      // Cache write failure is non-fatal
    }
  }

  output(result, raw, `Backend: ${result.backend}, milestone: ${result.milestone_version}, ${result.completed_count}/${result.phase_count} phases complete`);
}

module.exports = {
  _progressCachePath,
  _computeProgressMtimeKey,
  cmdInitProgress,
};
