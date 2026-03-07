/**
 * GRD Context -- Barrel re-export of all 48 context init functions
 *
 * This is the single entry point for all cmdInit* functions. Sub-modules
 * are grouped by workflow family:
 *   - base.ts:     inferCeremonyLevel, buildInitContext
 *   - execute.ts:  execution/planning inits (5 functions)
 *   - project.ts:  project lifecycle inits (8 functions)
 *   - research.ts: R&D research inits (13 functions)
 *   - agents.ts:   agent aliases + operation inits (23 functions)
 *   - progress.ts: progress cache + progress init (3 functions)
 */

'use strict';

// ─── Base ────────────────────────────────────────────────────────────────────

const _base = require('./base');

// ─── Execute & Plan ──────────────────────────────────────────────────────────

const _execute = require('./execute');

// ─── Project Lifecycle ───────────────────────────────────────────────────────

const _project = require('./project');

// ─── R&D Research ────────────────────────────────────────────────────────────

const _research = require('./research');

// ─── Agents & Operation Workflows ────────────────────────────────────────────

const _agents = require('./agents');

// ─── Progress & Cache ────────────────────────────────────────────────────────

const _progress = require('./progress');

// ─── Barrel Export ───────────────────────────────────────────────────────────

module.exports = {
  // Base
  inferCeremonyLevel: _base.inferCeremonyLevel,
  buildInitContext: _base.buildInitContext,

  // Execute & Plan
  cmdInitExecutePhase: _execute.cmdInitExecutePhase,
  cmdInitPlanPhase: _execute.cmdInitPlanPhase,
  cmdInitVerifyWork: _execute.cmdInitVerifyWork,
  cmdInitCodeReview: _execute.cmdInitCodeReview,
  cmdInitPhaseResearch: _execute.cmdInitPhaseResearch,

  // Project Lifecycle
  cmdInitNewProject: _project.cmdInitNewProject,
  cmdInitNewMilestone: _project.cmdInitNewMilestone,
  cmdInitQuick: _project.cmdInitQuick,
  cmdInitResume: _project.cmdInitResume,
  cmdInitPhaseOp: _project.cmdInitPhaseOp,
  cmdInitTodos: _project.cmdInitTodos,
  cmdInitMilestoneOp: _project.cmdInitMilestoneOp,
  cmdInitMapCodebase: _project.cmdInitMapCodebase,

  // R&D Research
  cmdInitResearchWorkflow: _research.cmdInitResearchWorkflow,
  cmdInitPlanMilestoneGaps: _research.cmdInitPlanMilestoneGaps,
  cmdInitAssessBaseline: _research.cmdInitAssessBaseline,
  cmdInitDeepDive: _research.cmdInitDeepDive,
  cmdInitEvalPlan: _research.cmdInitEvalPlan,
  cmdInitEvalReport: _research.cmdInitEvalReport,
  cmdInitFeasibility: _research.cmdInitFeasibility,

  // Agents & Operation Workflows
  cmdInitDebug: _agents.cmdInitDebug,
  cmdInitIntegrationCheck: _agents.cmdInitIntegrationCheck,
  cmdInitMigrate: _agents.cmdInitMigrate,
  cmdInitPlanCheck: _agents.cmdInitPlanCheck,
  cmdInitExecutor: _agents.cmdInitExecutor,
  cmdInitBaselineAssessor: _agents.cmdInitBaselineAssessor,
  cmdInitCodeReviewer: _agents.cmdInitCodeReviewer,
  cmdInitCodebaseMapper: _agents.cmdInitCodebaseMapper,
  cmdInitDebugger: _agents.cmdInitDebugger,
  cmdInitDeepDiver: _agents.cmdInitDeepDiver,
  cmdInitEvalPlanner: _agents.cmdInitEvalPlanner,
  cmdInitEvalReporter: _agents.cmdInitEvalReporter,
  cmdInitFeasibilityAnalyst: _agents.cmdInitFeasibilityAnalyst,
  cmdInitIntegrationChecker: _agents.cmdInitIntegrationChecker,
  cmdInitMigrator: _agents.cmdInitMigrator,
  cmdInitPhaseResearcher: _agents.cmdInitPhaseResearcher,
  cmdInitPlanChecker: _agents.cmdInitPlanChecker,
  cmdInitProductOwner: _agents.cmdInitProductOwner,
  cmdInitProjectResearcher: _agents.cmdInitProjectResearcher,
  cmdInitResearchSynthesizer: _agents.cmdInitResearchSynthesizer,
  cmdInitRoadmapper: _agents.cmdInitRoadmapper,
  cmdInitSurveyor: _agents.cmdInitSurveyor,
  cmdInitVerifier: _agents.cmdInitVerifier,

  // Progress & Cache
  _progressCachePath: _progress._progressCachePath,
  _computeProgressMtimeKey: _progress._computeProgressMtimeKey,
  cmdInitProgress: _progress.cmdInitProgress,
};
