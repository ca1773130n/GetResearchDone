/** GRD Commands -- Barrel re-export of all command sub-modules */

'use strict';

export {};

// ─── Slug & Timestamp ────────────────────────────────────────────────────────
const _slugTimestamp = require('./slug-timestamp.ts') as {
  cmdGenerateSlug: (text: string, raw: boolean) => void;
  cmdCurrentTimestamp: (format: string, raw: boolean) => void;
};

// ─── Todo ────────────────────────────────────────────────────────────────────
const _todo = require('./todo.ts') as {
  cmdListTodos: (cwd: string, area: string | null, raw: boolean) => void;
  cmdTodoComplete: (cwd: string, filename: string, raw: boolean, dryRun?: boolean) => void;
};

// ─── Config ──────────────────────────────────────────────────────────────────
const _config = require('./config.ts') as {
  cmdConfigEnsureSection: (cwd: string, raw: boolean) => void;
  cmdConfigSet: (cwd: string, key: string, value: string, raw: boolean) => void;
  cmdVerifyPathExists: (cwd: string, targetPath: string, raw: boolean) => void;
};

// ─── Phase Info ──────────────────────────────────────────────────────────────
const _phaseInfo = require('./phase-info.ts') as {
  cmdFindPhase: (cwd: string, phase: string, raw: boolean) => void;
  cmdResolveModel: (cwd: string, agentType: string, raw: boolean) => void;
  cmdDetectBackend: (cwd: string, raw: boolean) => void;
  cmdCommit: (cwd: string, message: string, files: string[], raw: boolean, amend?: boolean) => void;
  cmdPhasePlanIndex: (cwd: string, phase: string, raw: boolean) => void;
  cmdSummaryExtract: (cwd: string, summaryPath: string, fields: string[] | null, raw: boolean) => void;
  cmdHistoryDigest: (cwd: string, raw: boolean) => void;
  readCachedRoadmap: (roadmapPath: string) => string | null;
  readCachedState: (statePath: string) => string | null;
  _stateContentCache: Map<string, string>;
};

// ─── Progress ────────────────────────────────────────────────────────────────
const _progress = require('./progress.ts') as {
  cmdProgressRender: (cwd: string, format: string, raw: boolean) => void;
};

// ─── Dashboard ───────────────────────────────────────────────────────────────
const _dashboard = require('./dashboard.ts') as {
  buildDashboardData: (cwd: string) => Record<string, unknown> | null;
  renderDashboard: (data: Record<string, unknown>, options?: Record<string, unknown>) => { jsonResult: Record<string, unknown>; tui: string };
  cmdDashboard: (cwd: string, raw: boolean, options?: Record<string, unknown>) => void;
  cmdPhaseDetail: (cwd: string, phase: string, raw: boolean) => void;
};

// ─── Health ──────────────────────────────────────────────────────────────────
const _health = require('./health.ts') as {
  cmdHealth: (cwd: string, raw: boolean) => void;
  cmdHealthCheck: (cwd: string, options: Record<string, unknown>, raw: boolean) => void;
};

// ─── Long-Term Roadmap ───────────────────────────────────────────────────────
const _longTermRoadmap = require('./long-term-roadmap.ts') as {
  cmdLongTermRoadmap: (cwd: string, subcommand: string, args: string[], raw: boolean) => void;
};

// ─── Quality ─────────────────────────────────────────────────────────────────
const _quality = require('./quality.ts') as {
  cmdQualityAnalysis: (cwd: string, args: string[], raw: boolean) => void;
  cmdSetup: (cwd: string, raw: boolean) => void;
};

// ─── Search ──────────────────────────────────────────────────────────────────
const _search = require('./search.ts') as {
  cmdSearch: (cwd: string, query: string, raw: boolean) => void;
  cmdMigrateDirs: (cwd: string, raw: boolean, dryRun?: boolean) => void;
  cmdCoverageReport: (cwd: string, options: Record<string, unknown>, raw: boolean) => void;
};

// ─── Requirements (re-export from lib/requirements) ─────────────────────────
const _requirements = require('../requirements') as {
  cmdRequirementGet: (...args: unknown[]) => void;
  cmdRequirementList: (...args: unknown[]) => void;
  cmdRequirementTraceability: (...args: unknown[]) => void;
  cmdRequirementUpdateStatus: (...args: unknown[]) => void;
};

// ─── Barrel Exports ─────────────────────────────────────────────────────────

module.exports = {
  // slug-timestamp
  cmdGenerateSlug: _slugTimestamp.cmdGenerateSlug,
  cmdCurrentTimestamp: _slugTimestamp.cmdCurrentTimestamp,

  // todo
  cmdListTodos: _todo.cmdListTodos,
  cmdTodoComplete: _todo.cmdTodoComplete,

  // config
  cmdConfigEnsureSection: _config.cmdConfigEnsureSection,
  cmdConfigSet: _config.cmdConfigSet,
  cmdVerifyPathExists: _config.cmdVerifyPathExists,

  // phase-info
  cmdFindPhase: _phaseInfo.cmdFindPhase,
  cmdResolveModel: _phaseInfo.cmdResolveModel,
  cmdDetectBackend: _phaseInfo.cmdDetectBackend,
  cmdCommit: _phaseInfo.cmdCommit,
  cmdPhasePlanIndex: _phaseInfo.cmdPhasePlanIndex,
  cmdSummaryExtract: _phaseInfo.cmdSummaryExtract,
  cmdHistoryDigest: _phaseInfo.cmdHistoryDigest,
  readCachedRoadmap: _phaseInfo.readCachedRoadmap,
  readCachedState: _phaseInfo.readCachedState,
  _stateContentCache: _phaseInfo._stateContentCache,

  // progress
  cmdProgressRender: _progress.cmdProgressRender,

  // dashboard
  buildDashboardData: _dashboard.buildDashboardData,
  renderDashboard: _dashboard.renderDashboard,
  cmdDashboard: _dashboard.cmdDashboard,
  cmdPhaseDetail: _dashboard.cmdPhaseDetail,

  // health
  cmdHealth: _health.cmdHealth,
  cmdHealthCheck: _health.cmdHealthCheck,

  // long-term-roadmap
  cmdLongTermRoadmap: _longTermRoadmap.cmdLongTermRoadmap,

  // quality
  cmdQualityAnalysis: _quality.cmdQualityAnalysis,
  cmdSetup: _quality.cmdSetup,

  // search
  cmdSearch: _search.cmdSearch,
  cmdMigrateDirs: _search.cmdMigrateDirs,
  cmdCoverageReport: _search.cmdCoverageReport,

  // requirements (pass-through re-export)
  cmdRequirementGet: _requirements.cmdRequirementGet,
  cmdRequirementList: _requirements.cmdRequirementList,
  cmdRequirementTraceability: _requirements.cmdRequirementTraceability,
  cmdRequirementUpdateStatus: _requirements.cmdRequirementUpdateStatus,
};
