#!/usr/bin/env node
'use strict';

/**
 * GRD Tools -- Thin CLI router. All business logic lives in lib/ modules.
 * Usage: node grd-tools.js <command> [args] [--raw]
 */

const fs = require('fs');
const path = require('path');

import type { Scheduler } from '../lib/scheduler';
import type { GrdConfig, TokenProfileName } from '../lib/types';
import type { ResearchOptions } from '../lib/research/orchestrator';

// ─── Typed Imports ──────────────────────────────────────────────────────────

const {
  parseIncludeFlag,
  output,
  error,
  loadConfig,
  validatePhaseArg,
  validateFileArg,
  validateSubcommand,
  validateGitRef,
  findClosestCommand,
}: {
  parseIncludeFlag: (args: string[]) => Set<string>;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  loadConfig: (cwd: string) => GrdConfig;
  validatePhaseArg: (phase: string) => string;
  validateFileArg: (filePath: string, cwd: string) => string;
  validateSubcommand: (sub: string, validSubs: string[], parentCmd: string) => string;
  validateGitRef: (ref: string) => string;
  findClosestCommand: (input: string | null, commands: string[]) => string | null;
} = require('../lib/utils');

const {
  cmdFrontmatterGet,
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
}: {
  cmdFrontmatterGet: (cwd: string, filePath: string, field: string | null, raw: boolean) => void;
  cmdFrontmatterSet: (
    cwd: string,
    filePath: string,
    field: string,
    value: string,
    raw: boolean
  ) => void;
  cmdFrontmatterMerge: (cwd: string, filePath: string, data: string, raw: boolean) => void;
  cmdFrontmatterValidate: (cwd: string, filePath: string, schemaName: string, raw: boolean) => void;
} = require('../lib/frontmatter');

const {
  cmdStateLoad,
  cmdStateGet,
  cmdStatePatch,
  cmdStateUpdate,
  cmdStateAdvancePlan,
  cmdStateRecordMetric,
  cmdStateUpdateProgress,
  cmdStateAddDecision,
  cmdStateAddBlocker,
  cmdStateResolveBlocker,
  cmdStateRecordSession,
  cmdStateSnapshot,
}: {
  cmdStateLoad: (cwd: string, raw: boolean) => void;
  cmdStateGet: (cwd: string, section: string | null, raw: boolean) => void;
  cmdStatePatch: (cwd: string, patches: Record<string, string>, raw: boolean) => void;
  cmdStateUpdate: (cwd: string, field: string, value: string) => void;
  cmdStateAdvancePlan: (cwd: string, raw: boolean) => void;
  cmdStateRecordMetric: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdStateUpdateProgress: (cwd: string, raw: boolean) => void;
  cmdStateAddDecision: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdStateAddBlocker: (cwd: string, text: string, raw: boolean) => void;
  cmdStateResolveBlocker: (cwd: string, text: string, raw: boolean) => void;
  cmdStateRecordSession: (
    cwd: string,
    options: Record<string, string | null>,
    raw: boolean
  ) => void;
  cmdStateSnapshot: (cwd: string, raw: boolean, opts?: Record<string, string | undefined>) => void;
} = require('../lib/state');

const {
  cmdRoadmapGetPhase,
  cmdPhaseNextDecimal,
  cmdRoadmapAnalyze,
}: {
  cmdRoadmapGetPhase: (cwd: string, phaseNum: string, raw: boolean) => void;
  cmdPhaseNextDecimal: (cwd: string, basePhase: string, raw: boolean) => void;
  cmdRoadmapAnalyze: (cwd: string, raw: boolean) => void;
} = require('../lib/roadmap');

const {
  cmdTemplateSelect,
  cmdTemplateFill,
  cmdScaffold,
}: {
  cmdTemplateSelect: (cwd: string, planPath: string, raw: boolean) => void;
  cmdTemplateFill: (
    cwd: string,
    templateType: string,
    options: Record<string, unknown>,
    raw: boolean
  ) => void;
  cmdScaffold: (
    cwd: string,
    type: string,
    options: Record<string, string | null>,
    raw: boolean
  ) => void;
} = require('../lib/scaffold');

const {
  cmdVerifySummary,
  cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness,
  cmdVerifyReferences,
  cmdVerifyCommits,
  cmdVerifyArtifacts,
  cmdVerifyKeyLinks,
  cmdVerifyMechanical,
}: {
  cmdVerifySummary: (
    cwd: string,
    summaryPath: string,
    checkFileCount: number,
    raw: boolean
  ) => void;
  cmdVerifyPlanStructure: (cwd: string, filePath: string, raw: boolean) => void;
  cmdVerifyPhaseCompleteness: (cwd: string, phase: string, raw: boolean) => void;
  cmdVerifyReferences: (cwd: string, filePath: string, raw: boolean) => void;
  cmdVerifyCommits: (cwd: string, hashes: string[], raw: boolean) => void;
  cmdVerifyArtifacts: (cwd: string, planFilePath: string, raw: boolean) => void;
  cmdVerifyKeyLinks: (cwd: string, planFilePath: string, raw: boolean) => void;
  cmdVerifyMechanical: (cwd: string, phase: string, raw: boolean) => void;
} = require('../lib/verify');

const {
  cmdPhasesList,
  cmdPhaseAdd,
  cmdPhaseInsert,
  cmdPhaseRemove,
  cmdPhaseComplete,
  cmdMilestoneComplete,
  cmdValidateConsistency,
  cmdVersionBump,
}: {
  cmdPhasesList: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdPhaseAdd: (cwd: string, name: string, raw: boolean, context?: string) => void;
  cmdPhaseInsert: (cwd: string, phase: string, name: string, raw: boolean) => void;
  cmdPhaseRemove: (
    cwd: string,
    phase: string,
    options: Record<string, boolean>,
    raw: boolean
  ) => void;
  cmdPhaseComplete: (
    cwd: string,
    phase: string,
    raw: boolean,
    options?: Record<string, boolean>
  ) => Promise<void>;
  cmdMilestoneComplete: (
    cwd: string,
    version: string | null,
    options: Record<string, string | boolean | null>,
    raw: boolean
  ) => void;
  cmdValidateConsistency: (cwd: string, raw: boolean) => void;
  cmdVersionBump: (cwd: string, version: string, raw: boolean) => void;
} = require('../lib/phase');

const {
  cmdTracker,
}: {
  cmdTracker: (cwd: string, sub: string, args: string[], raw: boolean) => Promise<void>;
} = require('../lib/tracker');

const {
  cmdWorktreeCreate,
  cmdWorktreeRemove,
  cmdWorktreeList,
  cmdWorktreeRemoveStale,
  cmdWorktreePushAndPR,
  cmdWorktreeEnsureMilestoneBranch,
  cmdWorktreeMerge,
  cmdWorktreeHookCreate,
  cmdWorktreeHookRemove,
  cmdTeammateIdleHook,
  cmdTaskCompletedHook,
  cmdInstructionsLoadedHook,
  cmdStopFailureHook,
  cmdPostCompactHook,
}: {
  cmdWorktreeCreate: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdWorktreeRemove: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdWorktreeList: (cwd: string, raw: boolean) => void;
  cmdWorktreeRemoveStale: (cwd: string, raw: boolean) => void;
  cmdWorktreePushAndPR: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdWorktreeEnsureMilestoneBranch: (
    cwd: string,
    options: Record<string, string | null>,
    raw: boolean
  ) => void;
  cmdWorktreeMerge: (
    cwd: string,
    options: Record<string, string | boolean | null>,
    raw: boolean
  ) => void;
  cmdWorktreeHookCreate: (cwd: string, wtPath: string, wtBranch: string, raw: boolean) => void;
  cmdWorktreeHookRemove: (cwd: string, wtPath: string, wtBranch: string, raw: boolean) => void;
  cmdTeammateIdleHook: (cwd: string, raw: boolean) => void;
  cmdTaskCompletedHook: (cwd: string, raw: boolean) => void;
  cmdInstructionsLoadedHook: (cwd: string, raw: boolean) => void;
  cmdStopFailureHook: (cwd: string, raw: boolean) => void;
  cmdPostCompactHook: (cwd: string, raw: boolean) => void;
} = require('../lib/worktree');

const {
  cmdPhaseAnalyzeDeps,
}: {
  cmdPhaseAnalyzeDeps: (cwd: string, raw: boolean) => void;
} = require('../lib/deps');

const {
  detectOverstory,
  installOverstory,
}: {
  detectOverstory: (cwd: string) => Record<string, unknown> | null;
  installOverstory: (cwd: string) => void;
} = require('../lib/overstory');

const {
  cmdAutopilot,
  cmdInitAutopilot,
  cmdMultiMilestoneAutopilot,
  cmdInitMultiMilestoneAutopilot,
}: {
  cmdAutopilot: (cwd: string, args: string[], raw: boolean) => Promise<void>;
  cmdInitAutopilot: (cwd: string, raw: boolean) => void;
  cmdMultiMilestoneAutopilot: (cwd: string, args: string[], raw: boolean) => Promise<void>;
  cmdInitMultiMilestoneAutopilot: (cwd: string, raw: boolean) => void;
} = require('../lib/autopilot');

const {
  cmdAutoplan,
  cmdInitAutoplan,
}: {
  cmdAutoplan: (cwd: string, args: string[], raw: boolean) => Promise<void>;
  cmdInitAutoplan: (cwd: string, raw: boolean) => void;
} = require('../lib/autoplan');

const {
  createScheduler,
}: {
  createScheduler: (
    config: import('../lib/types').SchedulerConfig | undefined,
    superpowersConfig?: import('../lib/types').SuperpowersConfig
  ) => Scheduler | null;
} = require('../lib/scheduler');

const {
  cmdAutoResearch,
  cmdInitAutoResearch,
}: {
  cmdAutoResearch: (
    cwd: string,
    args: string[],
    raw: boolean,
    scheduler?: Scheduler | null
  ) => Promise<void>;
  cmdInitAutoResearch: (cwd: string, raw: boolean) => void;
} = require('../lib/autoresearch');

const {
  cmdEvolve,
  cmdEvolveDiscover,
  cmdEvolveState,
  cmdEvolveAdvance,
  cmdEvolveReset,
  cmdInitEvolve,
}: {
  cmdEvolve: (cwd: string, args: string[], raw: boolean) => Promise<void>;
  cmdEvolveDiscover: (cwd: string, args: string[], raw: boolean) => Promise<void>;
  cmdEvolveState: (cwd: string, args: string[], raw: boolean) => void;
  cmdEvolveAdvance: (cwd: string, args: string[], raw: boolean) => void;
  cmdEvolveReset: (cwd: string, args: string[], raw: boolean) => void;
  cmdInitEvolve: (cwd: string, raw: boolean) => void;
} = require('../lib/evolve/index');

const {
  cmdInitExecuteParallel,
  cmdParallelProgress,
}: {
  cmdInitExecuteParallel: (
    cwd: string,
    phases: string[],
    includes: Set<string>,
    raw: boolean
  ) => void;
  cmdParallelProgress: (args: string[], raw: boolean) => void;
} = require('../lib/parallel');

const {
  cmdWireup,
  cmdInitWireup,
}: {
  cmdWireup: (cwd: string, args: string[], raw: boolean) => Promise<void>;
  cmdInitWireup: (cwd: string, raw: boolean) => void;
} = require('../lib/wireup/index');

const {
  splitMarkdown,
  isIndexFile,
  estimateTokens,
}: {
  splitMarkdown: (
    content: string,
    options?: { threshold?: number; basename?: string }
  ) => {
    split_performed: boolean;
    reason?: string;
    index_content?: string;
    parts?: Array<{ filename: string; content: string }>;
  };
  isIndexFile: (content: unknown) => boolean;
  estimateTokens: (content: string) => number;
} = require('../lib/markdown-split');

const {
  cmdInitExecutePhase,
  cmdInitPlanPhase,
  cmdInitNewProject,
  cmdInitNewMilestone,
  cmdInitQuick,
  cmdInitResume,
  cmdInitVerifyWork,
  cmdInitPhaseOp,
  cmdInitTodos,
  cmdInitMilestoneOp,
  cmdInitMapCodebase,
  cmdInitProgress,
  cmdInitResearchWorkflow,
  cmdInitPlanMilestoneGaps,
  cmdInitDebug,
  cmdInitIntegrationCheck,
  cmdInitMigrate,
  cmdInitPlanCheck,
  cmdInitPhaseResearch,
  cmdInitCodeReview,
  cmdInitAssessBaseline,
  cmdInitDeepDive,
  cmdInitEvalPlan,
  cmdInitEvalReport,
  cmdInitFeasibility,
  cmdInitProductOwner,
  cmdInitProjectResearcher,
  cmdInitResearchSynthesizer,
  cmdInitRoadmapper,
  cmdInitSurveyor,
  cmdInitVerifier,
}: {
  cmdInitExecutePhase: (cwd: string, phase: string, includes: Set<string>, raw: boolean) => void;
  cmdInitPlanPhase: (cwd: string, phase: string, includes: Set<string>, raw: boolean) => void;
  cmdInitNewProject: (cwd: string, raw: boolean) => void;
  cmdInitNewMilestone: (cwd: string, raw: boolean) => void;
  cmdInitQuick: (cwd: string, description: string, raw: boolean) => void;
  cmdInitResume: (cwd: string, raw: boolean) => void;
  cmdInitVerifyWork: (cwd: string, phase: string, raw: boolean) => void;
  cmdInitPhaseOp: (cwd: string, phase: string, raw: boolean) => void;
  cmdInitTodos: (cwd: string, area: string | null, raw: boolean) => void;
  cmdInitMilestoneOp: (cwd: string, raw: boolean) => void;
  cmdInitMapCodebase: (cwd: string, raw: boolean) => void;
  cmdInitProgress: (cwd: string, includes: Set<string>, raw: boolean, refresh?: boolean) => void;
  cmdInitResearchWorkflow: (
    cwd: string,
    workflow: string,
    topic: string,
    includes: Set<string>,
    raw: boolean
  ) => void;
  cmdInitPlanMilestoneGaps: (cwd: string, raw: boolean) => void;
  cmdInitDebug: (cwd: string, phase: string | null, raw: boolean) => void;
  cmdInitIntegrationCheck: (cwd: string, phase: string | null, raw: boolean) => void;
  cmdInitMigrate: (cwd: string, raw: boolean) => void;
  cmdInitPlanCheck: (cwd: string, phase: string, raw: boolean) => void;
  cmdInitPhaseResearch: (cwd: string, phase: string, includes: Set<string>, raw: boolean) => void;
  cmdInitCodeReview: (cwd: string, phase: string, raw: boolean) => void;
  cmdInitAssessBaseline: (cwd: string, raw: boolean) => void;
  cmdInitDeepDive: (cwd: string, topic: string, raw: boolean) => void;
  cmdInitEvalPlan: (cwd: string, phase: string | null, raw: boolean) => void;
  cmdInitEvalReport: (cwd: string, phase: string | null, raw: boolean) => void;
  cmdInitFeasibility: (cwd: string, topic: string, raw: boolean) => void;
  cmdInitProductOwner: (cwd: string, raw: boolean) => void;
  cmdInitProjectResearcher: (cwd: string, topic: string, raw: boolean) => void;
  cmdInitResearchSynthesizer: (cwd: string, raw: boolean) => void;
  cmdInitRoadmapper: (cwd: string, raw: boolean) => void;
  cmdInitSurveyor: (cwd: string, topic: string, raw: boolean) => void;
  cmdInitVerifier: (cwd: string, phase: string | null, raw: boolean) => void;
} = require('../lib/context/index');

const {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdListTodos,
  cmdTodoComplete,
  cmdVerifyPathExists,
  cmdConfigEnsureSection,
  cmdConfigSet,
  cmdConfigYolo,
  cmdHistoryDigest,
  cmdResolveModel,
  cmdFindPhase,
  cmdCommit,
  cmdPhasePlanIndex,
  cmdSummaryExtract,
  cmdProgressRender,
  cmdDashboard,
  cmdPhaseDetail,
  cmdHealth,
  cmdDetectBackend,
  cmdLongTermRoadmap,
  cmdQualityAnalysis,
  cmdSetup,
  cmdRequirementGet,
  cmdRequirementList,
  cmdRequirementTraceability,
  cmdRequirementUpdateStatus,
  cmdSearch,
  cmdMigrateDirs,
  cmdCoverageReport,
  cmdHealthCheck,
  cmdPhaseRiskAssessment,
  cmdCitationBacklinks,
  cmdEvalRegressionCheck,
  cmdPhaseTimeBudget,
  cmdConfigDiff,
  cmdPhaseReadiness,
  cmdMilestoneHealth,
  cmdDecisionTimeline,
  cmdImportKnowledge,
  cmdTodoDuplicates,
  cmdKnowhowList,
  cmdCitationGraph,
  cmdArtifactDAG,
  cmdBenchmarkReport,
  cmdKnowhowSearch,
  cmdCheckPlans,
  cmdEvalDiff,
  cmdTail,
  cmdEstimatePhase,
  cmdImpact,
  cmdCheckAssumptions,
}: {
  cmdGenerateSlug: (text: string, raw: boolean) => void;
  cmdCurrentTimestamp: (format: string, raw: boolean) => void;
  cmdListTodos: (cwd: string, area: string | null, raw: boolean) => void;
  cmdTodoComplete: (cwd: string, filename: string, raw: boolean, dryRun?: boolean) => void;
  cmdVerifyPathExists: (cwd: string, targetPath: string, raw: boolean, dryRun?: boolean) => void;
  cmdConfigEnsureSection: (cwd: string, raw: boolean, dryRun?: boolean) => void;
  cmdConfigSet: (cwd: string, key: string, value: string, raw: boolean, dryRun?: boolean) => void;
  cmdConfigYolo: (cwd: string, mode: string, raw: boolean, dryRun?: boolean) => void;
  cmdHistoryDigest: (cwd: string, raw: boolean) => void;
  cmdResolveModel: (cwd: string, agentType: string, raw: boolean) => void;
  cmdFindPhase: (cwd: string, phase: string, raw: boolean) => void;
  cmdCommit: (cwd: string, message: string, files: string[], raw: boolean, amend?: boolean) => void;
  cmdPhasePlanIndex: (cwd: string, phase: string, raw: boolean) => void;
  cmdSummaryExtract: (
    cwd: string,
    summaryPath: string,
    fields: string[] | null,
    raw: boolean
  ) => void;
  cmdProgressRender: (cwd: string, format: string, raw: boolean) => void;
  cmdDashboard: (cwd: string, raw: boolean, options?: Record<string, unknown>) => void;
  cmdPhaseDetail: (cwd: string, phase: string, raw: boolean) => void;
  cmdHealth: (cwd: string, raw: boolean) => void;
  cmdDetectBackend: (cwd: string, raw: boolean) => void;
  cmdLongTermRoadmap: (cwd: string, subcommand: string, args: string[], raw: boolean) => void;
  cmdQualityAnalysis: (cwd: string, args: string[], raw: boolean) => void;
  cmdSetup: (cwd: string, raw: boolean) => void;
  cmdRequirementGet: (cwd: string, reqId: string, raw: boolean) => void;
  cmdRequirementList: (
    cwd: string,
    options: Record<string, string | boolean | null>,
    raw: boolean
  ) => void;
  cmdRequirementTraceability: (
    cwd: string,
    options: Record<string, string | null>,
    raw: boolean
  ) => void;
  cmdRequirementUpdateStatus: (
    cwd: string,
    reqId: string,
    status: string,
    raw: boolean,
    dryRun?: boolean
  ) => void;
  cmdSearch: (cwd: string, query: string, raw: boolean) => void;
  cmdMigrateDirs: (cwd: string, raw: boolean, dryRun?: boolean) => void;
  cmdCoverageReport: (cwd: string, options: Record<string, unknown>, raw: boolean) => void;
  cmdHealthCheck: (cwd: string, options: Record<string, unknown>, raw: boolean) => void;
  cmdPhaseRiskAssessment: (cwd: string, phase: string, raw: boolean) => void;
  cmdCitationBacklinks: (cwd: string, raw: boolean) => void;
  cmdEvalRegressionCheck: (cwd: string, phase: string, raw: boolean, thresholdPct?: number) => void;
  cmdPhaseTimeBudget: (cwd: string, raw: boolean) => void;
  cmdConfigDiff: (cwd: string, raw: boolean, reset?: boolean, dryRun?: boolean) => void;
  cmdPhaseReadiness: (cwd: string, phase: string, raw: boolean) => void;
  cmdMilestoneHealth: (cwd: string, raw: boolean) => void;
  cmdDecisionTimeline: (cwd: string, raw: boolean) => void;
  cmdImportKnowledge: (
    cwd: string,
    sourcePath: string,
    types: string,
    raw: boolean,
    force?: boolean,
    dryRun?: boolean
  ) => void;
  cmdTodoDuplicates: (cwd: string, raw: boolean, threshold?: number) => void;
  cmdKnowhowList: (cwd: string, raw: boolean, moduleHint?: string, limit?: number) => void;
  cmdCitationGraph: (cwd: string, raw: boolean, unresolvedOnly?: boolean) => void;
  cmdArtifactDAG: (cwd: string, phase: string, raw: boolean) => void;
  cmdBenchmarkReport: (cwd: string, raw: boolean) => void;
  cmdKnowhowSearch: (cwd: string, query: string, topN: number, raw: boolean) => void;
  cmdCheckPlans: (cwd: string, options: { phase?: string | null; milestone?: string | null }, raw: boolean) => void;
  cmdEvalDiff: (cwd: string, phaseA: string, phaseB: string, raw: boolean) => void;
  cmdTail: (cwd: string, phaseFilter: string | null, follow: boolean, raw: boolean) => void;
  cmdEstimatePhase: (cwd: string, phase: string, raw: boolean) => void;
  cmdImpact: (cwd: string, phase: string, raw: boolean) => void;
  cmdCheckAssumptions: (cwd: string, phase: string, raw: boolean, skipCheck?: boolean) => void;
} = require('../lib/commands/index');

const {
  cmdDeadEndAdd,
  cmdDeadEndPromoteFromPhase,
}: {
  cmdDeadEndAdd: (
    cwd: string,
    opts: {
      approach: string;
      phase: string;
      verdict?: string;
      evidence?: string[];
      notes?: string;
    },
    raw: boolean
  ) => void;
  cmdDeadEndPromoteFromPhase: (cwd: string, phase: string, raw: boolean) => void;
} = require('../lib/dead-ends');

const {
  cmdPlanTournament,
}: {
  cmdPlanTournament: (
    cwd: string,
    opts: { phase: string; candidates: string[] },
    raw: boolean
  ) => void;
} = require('../lib/plan-tournament');

const {
  cmdThink,
}: {
  cmdThink: (cwd: string, opts: { limit?: number }, raw: boolean) => void;
} = require('../lib/think');

const {
  cmdExportResearch,
  cmdImportResearch,
}: {
  cmdExportResearch: (cwd: string, outputPath: string | null, raw: boolean) => void;
  cmdImportResearch: (cwd: string, bundlePath: string, raw: boolean) => void;
} = require('../lib/research-bundle');

const {
  cmdDiagnosePhase,
}: {
  cmdDiagnosePhase: (cwd: string, phase: string, raw: boolean) => void;
} = require('../lib/verify');

const {
  cmdKnowhowAudit,
  cmdKnowhowDedup,
  cmdKnowhowRank,
}: {
  cmdKnowhowAudit: (cwd: string, raw: boolean) => void;
  cmdKnowhowDedup: (cwd: string, raw: boolean, threshold?: number) => void;
  cmdKnowhowRank: (cwd: string, query: string, topN: number, raw: boolean) => void;
} = require('../lib/knowledge');

const {
  cmdPhaseDepsVisualize,
  cmdExecutePhaseDryRun,
}: {
  cmdPhaseDepsVisualize: (
    cwd: string,
    opts: { milestone?: string | null; format?: string | null },
    raw: boolean
  ) => void;
  cmdExecutePhaseDryRun: (cwd: string, phase: string, raw: boolean) => void;
} = require('../lib/deps');

const {
  cmdTodosRank,
}: {
  cmdTodosRank: (cwd: string, raw: boolean, topN?: number) => void;
} = require('../lib/commands/todo');

const {
  cmdRollback,
}: {
  cmdRollback: (cwd: string, phase: string, raw: boolean) => void;
} = require('../lib/commands/rollback');

const {
  cmdEstimate,
}: {
  cmdEstimate: (cwd: string, phase: string, raw: boolean) => void;
} = require('../lib/commands/estimate');

const {
  cmdBudget,
}: {
  cmdBudget: (cwd: string, phaseArg: string, raw: boolean) => void;
} = require('../lib/commands/budget');

const {
  cmdBlame,
}: {
  cmdBlame: (cwd: string, phaseArg: string, raw: boolean) => void;
} = require('../lib/commands/blame');

const {
  cmdKnowhowAggregate,
  cmdImportKnowhow,
}: {
  cmdKnowhowAggregate: (cwd: string, raw: boolean, exportFlag?: boolean, dryRun?: boolean) => void;
  cmdImportKnowhow: (cwd: string, sourcePath: string, raw: boolean, topN?: number, importAll?: boolean, dryRun?: boolean) => void;
} = require('../lib/commands/knowhow-aggregator');

const {
  cmdFreshness,
}: {
  cmdFreshness: (cwd: string, phaseArg: string | null, raw: boolean) => void;
} = require('../lib/commands/freshness');

const {
  cmdGenomeInit,
  cmdGenomeShow,
  cmdGenomeSnapshot,
  cmdGenomePromoteSuggestion,
}: {
  cmdGenomeInit: (cwd: string, raw: boolean) => void;
  cmdGenomeShow: (cwd: string, raw: boolean) => void;
  cmdGenomeSnapshot: (cwd: string, raw: boolean) => void;
  cmdGenomePromoteSuggestion: (cwd: string, slug: string, raw: boolean) => void;
} = require('../lib/genome');

const {
  cmdResearchGaps,
}: {
  cmdResearchGaps: (cwd: string, raw: boolean) => void;
} = require('../lib/commands/progress');

const {
  cmdDepsRisk,
}: {
  cmdDepsRisk: (cwd: string, startPhase: string | null, raw: boolean) => void;
} = require('../lib/commands/phase-info');

const {
  cmdWatch,
}: {
  cmdWatch: (cwd: string, raw: boolean) => void;
} = require('../lib/commands/watch');

const {
  cmdSingularity,
}: {
  cmdSingularity: (
    cwd: string,
    options: { since?: string | null; all?: boolean; byIteration?: boolean },
    raw: boolean
  ) => void;
} = require('../lib/commands/singularity');

const {
  cmdPlanLint,
}: {
  cmdPlanLint: (cwd: string, milestone: string, raw: boolean) => void;
} = require('../lib/commands/plan-lint');

const {
  cmdPlanPhase,
}: {
  cmdPlanPhase: (
    cwd: string,
    phaseNum: string,
    opts: { candidates: number; inputFile?: string; allowPartial?: boolean },
    raw: boolean
  ) => void;
} = require('../lib/commands/plan-phase');

const {
  cmdSelectCandidate,
}: {
  cmdSelectCandidate: (
    cwd: string,
    phaseNum: string,
    opts: { dryRun?: boolean; force?: boolean; runVerificationCommands?: boolean },
    raw: boolean
  ) => void;
} = require('../lib/commands/select-candidate');

const {
  cmdPatterns,
}: {
  cmdPatterns: (
    cwd: string,
    opts: {
      minOccurrences?: number;
      effectSize?: number;
      fdrQ?: number;
      apply?: boolean;
      yes?: boolean;
    },
    raw: boolean
  ) => void;
} = require('../lib/commands/patterns');

const {
  cmdInstall,
}: {
  cmdInstall: (
    cwd: string,
    opts: {
      harnesses?: Array<'claude' | 'codex' | 'gemini' | 'opencode'>;
      all?: boolean;
      list?: boolean;
      dryRun?: boolean;
    },
    raw: boolean
  ) => void;
} = require('../lib/commands/install');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract --flag value from args, returns value or fallback */
function flag(args: string[], name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : fallback;
}

/**
 * Print a deprecation warning to stderr. See docs/DEPRECATIONS.md for the
 * v0.4.x trim plan. Commands listed in DEPRECATED_COMMANDS will be removed
 * in v0.4.0; this helper fires once per invocation.
 */
const DEPRECATED_COMMANDS: Record<string, string> = {
  dashboard: 'Use `gd health` + `gd think` instead',
  'health-check': 'Subset of `gd health`',
  'coverage-report': 'Use `npx jest --coverage` directly',
  'phase-time-budget': 'Subsumed by `gd estimate-phase`',
  'todo-duplicates': 'One-off helper; rarely used',
  'markdown-split': 'Internal infrastructure — surfaced by accident',
  setup: '`gd init` does this',
};
function _warnDeprecated(cmd: string): void {
  const replacement = DEPRECATED_COMMANDS[cmd];
  if (!replacement) return;
  process.stderr.write(
    `Warning: \`gd ${cmd}\` is DEPRECATED and will be removed in v0.4.0.\n` +
      `         ${replacement}.\n` +
      `         See docs/DEPRECATIONS.md.\n`
  );
}

// ─── Route Descriptor Interface ─────────────────────────────────────────────

interface RouteDescriptor {
  command: string;
  handler: (args: string[], cwd: string, raw: boolean) => void | unknown;
}

// ─── Descriptor-Based Dispatch Table ────────────────────────────────────────

/**
 * Descriptor-based dispatch table for simple top-level commands.
 * Each entry maps a command string to a handler function.
 * routeCommand() checks this table first before falling through to the switch.
 */
const ROUTE_DESCRIPTORS: RouteDescriptor[] = [
  { command: 'generate-slug', handler: (args, _cwd, raw) => cmdGenerateSlug(args[1], raw) },
  {
    command: 'current-timestamp',
    handler: (args, _cwd, raw) => cmdCurrentTimestamp(args[1] || 'full', raw),
  },
  { command: 'list-todos', handler: (args, cwd, raw) => cmdListTodos(cwd, args[1], raw) },
  {
    command: 'verify-path-exists',
    handler: (args, cwd, raw) => cmdVerifyPathExists(cwd, args[1], raw, args.includes('--dry-run')),
  },
  {
    command: 'config-ensure-section',
    handler: (args, cwd, raw) => cmdConfigEnsureSection(cwd, raw, args.includes('--dry-run')),
  },
  {
    command: 'config-set',
    handler: (args, cwd, raw) =>
      cmdConfigSet(cwd, args[1], args[2], raw, args.includes('--dry-run')),
  },
  {
    command: 'config-yolo',
    handler: (args, cwd, raw) => cmdConfigYolo(cwd, args[1], raw, args.includes('--dry-run')),
  },
  { command: 'history-digest', handler: (_args, cwd, raw) => cmdHistoryDigest(cwd, raw) },
  {
    command: 'progress',
    handler: (args, cwd, raw) => cmdProgressRender(cwd, args[1] || 'json', raw),
  },
  {
    command: 'migrate-dirs',
    handler: (args, cwd, raw) => cmdMigrateDirs(cwd, raw, args.includes('--dry-run')),
  },
  {
    command: 'dashboard',
    handler: (_args, cwd, raw) => {
      _warnDeprecated('dashboard');
      cmdDashboard(cwd, raw);
    },
  },
  { command: 'health', handler: (_args, cwd, raw) => cmdHealth(cwd, raw) },
  { command: 'detect-backend', handler: (_args, cwd, raw) => cmdDetectBackend(cwd, raw) },
  {
    command: 'quality-analysis',
    handler: (args, cwd, raw) => cmdQualityAnalysis(cwd, args.slice(1), raw),
  },
  {
    command: 'setup',
    handler: (_args, cwd, raw) => {
      _warnDeprecated('setup');
      cmdSetup(cwd, raw);
    },
  },
  {
    command: 'parallel-progress',
    handler: (args, _cwd, raw) => cmdParallelProgress(args.slice(1), raw),
  },
  { command: 'resolve-model', handler: (args, cwd, raw) => cmdResolveModel(cwd, args[1], raw) },
  { command: 'find-phase', handler: (args, cwd, raw) => cmdFindPhase(cwd, args[1], raw) },
  {
    command: 'coverage-report',
    handler: (args, cwd, raw) => {
      _warnDeprecated('coverage-report');
      return cmdCoverageReport(
        cwd,
        { threshold: parseInt(flag(args, '--threshold', '85') as string, 10) },
        raw
      );
    },
  },
  {
    command: 'health-check',
    handler: (args, cwd, raw) => {
      _warnDeprecated('health-check');
      return cmdHealthCheck(cwd, { fix: args.includes('--fix') }, raw);
    },
  },
  {
    command: 'phase-detail',
    handler: (args, cwd, raw) => {
      validatePhaseArg(args[1]);
      return cmdPhaseDetail(cwd, args[1], raw);
    },
  },
  {
    command: 'phase-plan-index',
    handler: (args, cwd, raw) => {
      validatePhaseArg(args[1]);
      return cmdPhasePlanIndex(cwd, args[1], raw);
    },
  },
  {
    command: 'search',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('Search query is required');
      return cmdSearch(cwd, args[1], raw);
    },
  },
  {
    command: 'phase-risk',
    handler: (args, cwd, raw) => {
      validatePhaseArg(args[1]);
      return cmdPhaseRiskAssessment(cwd, args[1], raw);
    },
  },
  { command: 'citation-backlinks', handler: (_args, cwd, raw) => cmdCitationBacklinks(cwd, raw) },
  {
    command: 'eval-regression-check',
    handler: (args, cwd, raw) => {
      validatePhaseArg(args[1]);
      const t = flag(args, '--threshold');
      return cmdEvalRegressionCheck(cwd, args[1], raw, t ? parseFloat(t) : undefined);
    },
  },
  {
    command: 'phase-time-budget',
    handler: (_args, cwd, raw) => {
      _warnDeprecated('phase-time-budget');
      cmdPhaseTimeBudget(cwd, raw);
    },
  },
  {
    command: 'config-diff',
    handler: (args, cwd, raw) => cmdConfigDiff(cwd, raw, args.includes('--reset'), args.includes('--dry-run')),
  },
  {
    command: 'phase-readiness',
    handler: (args, cwd, raw) => {
      validatePhaseArg(args[1]);
      return cmdPhaseReadiness(cwd, args[1], raw);
    },
  },
  { command: 'milestone-health', handler: (_args, cwd, raw) => cmdMilestoneHealth(cwd, raw) },
  { command: 'decision-timeline', handler: (_args, cwd, raw) => cmdDecisionTimeline(cwd, raw) },
  {
    command: 'import-knowledge',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('Source path required');
      return cmdImportKnowledge(
        cwd,
        args[1],
        flag(args, '--types') || 'all',
        raw,
        args.includes('--force'),
        args.includes('--dry-run')
      );
    },
  },
  {
    command: 'todo-duplicates',
    handler: (args, cwd, raw) => {
      _warnDeprecated('todo-duplicates');
      const t = flag(args, '--threshold');
      return cmdTodoDuplicates(cwd, raw, t ? parseFloat(t) : undefined);
    },
  },
  { command: 'teammate-idle-hook', handler: (_args, cwd, raw) => cmdTeammateIdleHook(cwd, raw) },
  { command: 'task-completed-hook', handler: (_args, cwd, raw) => cmdTaskCompletedHook(cwd, raw) },
  {
    command: 'instructions-loaded-hook',
    handler: (_args, cwd, raw) => cmdInstructionsLoadedHook(cwd, raw),
  },
  { command: 'stop-failure-hook', handler: (_args, cwd, raw) => cmdStopFailureHook(cwd, raw) },
  { command: 'post-compact-hook', handler: (_args, cwd, raw) => cmdPostCompactHook(cwd, raw) },
  {
    command: 'citation-graph',
    handler: (args, cwd, raw) => cmdCitationGraph(cwd, raw, args.includes('--unresolved')),
  },
  {
    command: 'artifact-dag',
    handler: (args, cwd, raw) => {
      validatePhaseArg(args[1]);
      return cmdArtifactDAG(cwd, args[1], raw);
    },
  },
  { command: 'benchmark-report', handler: (_args, cwd, raw) => cmdBenchmarkReport(cwd, raw) },
  {
    command: 'diagnose',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('phase required. Usage: gd diagnose <phase>');
      validatePhaseArg(args[1]);
      return cmdDiagnosePhase(cwd, args[1], raw);
    },
  },
  {
    command: 'export-research',
    handler: (args, cwd, raw) => cmdExportResearch(cwd, flag(args, '--output') ?? null, raw),
  },
  {
    command: 'import-research',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('bundle path required. Usage: gd import-research <bundle.tar.gz>');
      return cmdImportResearch(cwd, args[1], raw);
    },
  },
  {
    command: 'deps',
    handler: (args, cwd, raw) =>
      cmdPhaseDepsVisualize(
        cwd,
        { milestone: flag(args, '--milestone') ?? null, format: flag(args, '--format') ?? null },
        raw
      ),
  },
  {
    command: 'todos',
    handler: (args, cwd, raw) => {
      const sub = args[1];
      if (sub === 'rank') {
        const topStr = flag(args, '--top');
        const topN = topStr ? parseInt(topStr, 10) : undefined;
        if (topN !== undefined && (isNaN(topN) || topN < 0)) {
          error('--top must be a non-negative integer');
        }
        return cmdTodosRank(cwd, raw, topN);
      }
      error(`Unknown todos subcommand: ${sub || '(none)'}. Valid: rank`);
    },
  },
  {
    command: 'knowhow',
    handler: (args, cwd, raw) => {
      const sub = args[1];
      if (sub === 'audit') return cmdKnowhowAudit(cwd, raw);
      if (sub === 'aggregate' || sub === 'agg') return cmdKnowhowAggregate(cwd, raw, args.includes('--export'), args.includes('--dry-run'));
      if (sub === 'dedup') {
        const t = flag(args, '--threshold');
        return cmdKnowhowDedup(cwd, raw, t ? parseFloat(t) : undefined);
      }
      if (sub === 'rank') {
        const query = args[2];
        if (!query) error('query required. Usage: gd knowhow rank "<query>"');
        const topStr = flag(args, '--top');
        const topN = topStr ? parseInt(topStr, 10) : 5;
        if (isNaN(topN) || topN <= 0) error('--top must be a positive integer');
        return cmdKnowhowRank(cwd, query, topN, raw);
      }
      return cmdKnowhowList(
        cwd,
        raw,
        flag(args, '--module'),
        flag(args, '--limit') ? parseInt(flag(args, '--limit')!, 10) : undefined
      );
    },
  },
  {
    command: 'budget',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('phase required. Usage: gd budget <phase>');
      return cmdBudget(cwd, args[1], raw);
    },
  },
  {
    command: 'blame',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('phase required. Usage: gd blame <phase>');
      return cmdBlame(cwd, args[1], raw);
    },
  },
  {
    command: 'freshness',
    handler: (args, cwd, raw) => cmdFreshness(cwd, args[1] ?? null, raw),
  },
  {
    command: 'rollback',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('phase required. Usage: gd rollback <phase>');
      validatePhaseArg(args[1]);
      return cmdRollback(cwd, args[1], raw);
    },
  },
  {
    command: 'estimate',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('phase required. Usage: gd estimate <phase>');
      validatePhaseArg(args[1]);
      return cmdEstimate(cwd, args[1], raw);
    },
  },
  {
    command: 'estimate-phase',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('phase required. Usage: gd estimate-phase <phase>');
      validatePhaseArg(args[1]);
      return cmdEstimatePhase(cwd, args[1], raw);
    },
  },
  {
    command: 'impact',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('phase required. Usage: gd impact <phase>');
      validatePhaseArg(args[1]);
      return cmdImpact(cwd, args[1], raw);
    },
  },
  {
    command: 'check-assumptions',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('phase required. Usage: gd check-assumptions <phase>');
      validatePhaseArg(args[1]);
      return cmdCheckAssumptions(cwd, args[1], raw, args.includes('--skip-assumption-check'));
    },
  },
  {
    command: 'execute-phase',
    handler: (args, cwd, raw) => {
      if (args.includes('--dry-run')) {
        if (!args[1] || args[1].startsWith('--')) error('phase required. Usage: gd execute-phase <phase> --dry-run');
        validatePhaseArg(args[1]);
        return cmdExecutePhaseDryRun(cwd, args[1], raw);
      }
      // Non-dry-run execute-phase falls through to init workflow
      const includes: Set<string> = parseIncludeFlag(args);
      const phase = args[1];
      if (!phase || phase.startsWith('--')) error('phase required. Usage: gd execute-phase <phase>');
      validatePhaseArg(phase);
      const { cmdInitExecutePhase } = require('../lib/context/index') as {
        cmdInitExecutePhase: (cwd: string, phase: string, includes: Set<string>, raw: boolean) => void;
      };
      return cmdInitExecutePhase(cwd, phase, includes, raw);
    },
  },
  {
    command: 'knowledge',
    handler: (args, cwd, raw) => {
      const sub = args[1];
      if (sub === 'search') {
        // Codex r3 P2: skip both the flag and its value so e.g.
        // `gd knowledge search cache --top 5` searches for "cache",
        // not "cache 5". Walks the slice, skipping flags and the
        // token immediately following any value-bearing flag.
        const FLAGS_WITH_VALUE = new Set(['--top']);
        const queryParts: string[] = [];
        const rest = args.slice(2);
        for (let i = 0; i < rest.length; i++) {
          const a = rest[i];
          if (a.startsWith('--')) {
            if (FLAGS_WITH_VALUE.has(a)) i++;
            continue;
          }
          queryParts.push(a);
        }
        const query = queryParts.join(' ');
        if (!query) error('query required. Usage: gd knowledge search <query>');
        const topN = parseInt(flag(args, '--top') ?? '10', 10);
        return cmdKnowhowSearch(cwd, query, topN, raw);
      }
      error(`Unknown knowledge subcommand: ${sub || '(none)'}. Valid: search`);
    },
  },
  {
    command: 'check-plans',
    handler: (args, cwd, raw) => {
      const phase = flag(args, '--phase') ?? null;
      const milestone = flag(args, '--milestone') ?? null;
      return cmdCheckPlans(cwd, { phase, milestone }, raw);
    },
  },
  {
    command: 'eval',
    handler: (args, cwd, raw) => {
      const sub = args[1];
      if (sub === 'diff') {
        const phaseA = args[2];
        const phaseB = args[3] ?? 'latest';
        if (!phaseA) error('Usage: gd eval diff <phaseA> <phaseB> — or: gd eval diff latest');
        if (phaseA !== 'latest') validatePhaseArg(phaseA);
        if (phaseB !== 'latest') validatePhaseArg(phaseB);
        return cmdEvalDiff(cwd, phaseA, phaseB, raw);
      }
      error(`Unknown eval subcommand: ${sub || '(none)'}. Valid: diff`);
    },
  },
  {
    command: 'tail',
    handler: (args, cwd, raw) => {
      const phaseFilter = flag(args, '--phase') ?? null;
      const follow = args.includes('-f') || args.includes('--follow');
      return cmdTail(cwd, phaseFilter, follow, raw);
    },
  },
  {
    command: 'forecast-phase',
    handler: (args, cwd, raw) => {
      const phase = args[1];
      if (!phase) error('phase required. Usage: gd forecast-phase <phase>');
      validatePhaseArg(phase);

      const { phasesDir: _phasesDir } = require('../lib/paths') as { phasesDir: (cwd: string) => string };
      const { safeReadFile: _safeRead, execGit: _execGit } = require('../lib/utils') as {
        safeReadFile: (p: string) => string | null;
        execGit: (cwd: string, args: string[]) => { exitCode: number; stdout: string; stderr: string };
      };

      const phasesBase = _phasesDir(cwd);
      let phaseDir: string | null = null;
      try {
        // Codex r15 P2: match the canonical zero-padded form too so
        // `gd forecast-phase 1` resolves to `01-test/`.
        const padded = /^\d+$/.test(phase) ? phase.padStart(2, '0') : phase;
        const dirs: string[] = fs.readdirSync(phasesBase);
        const match = dirs.find(
          (d: string) =>
            d === phase || d === padded ||
            d.startsWith(`${phase}-`) || d.startsWith(`${padded}-`)
        );
        if (match) phaseDir = path.join(phasesBase, match);
      } catch { /* phases dir not found */ }

      if (!phaseDir) {
        output({ phase, error: `Phase ${phase} not found`, files: [] }, raw, `Phase ${phase} not found`);
        return;
      }

      // Extract file paths from all PLAN.md files via regex
      const fileRegex = /(?:^|[\s`"'(,])([a-zA-Z][a-zA-Z0-9_/-]*\.[a-zA-Z]{1,5})(?=$|[\s`"',):])/gm;
      const fileCounts = new Map<string, number>();

      let planFiles: string[] = [];
      try {
        planFiles = (fs.readdirSync(phaseDir) as string[]).filter((f: string) => f.endsWith('-PLAN.md') || f === 'PLAN.md');
      } catch { /* ignore */ }

      for (const pf of planFiles) {
        const content = _safeRead(path.join(phaseDir, pf));
        if (!content) continue;
        let m: RegExpExecArray | null;
        fileRegex.lastIndex = 0;
        while ((m = fileRegex.exec(content)) !== null) {
          const fp = m[1];
          if (fp && fp.length > 3 && fp.includes('.') && !fp.startsWith('.')) {
            fileCounts.set(fp, (fileCounts.get(fp) ?? 0) + 1);
          }
        }
      }

      // Cross-reference with git history for co-modification frequency
      interface ForecastEntry { file: string; mentions: number; git_touches: number; confidence: number; last_modified: string }
      const fileScores: ForecastEntry[] = [];
      for (const [fp, mentions] of fileCounts) {
        const logResult = _execGit(cwd, ['log', '--oneline', '--', fp]);
        const gitTouches = logResult.exitCode === 0 ? logResult.stdout.trim().split('\n').filter(Boolean).length : 0;
        const lastResult = _execGit(cwd, ['log', '-1', '--format=%ci', '--', fp]);
        const lastModified = lastResult.exitCode === 0 ? lastResult.stdout.trim().slice(0, 10) : '';
        const confidence = Math.round(Math.min(1, mentions * 0.4 + Math.min(gitTouches, 10) * 0.06) * 100) / 100;
        fileScores.push({ file: fp, mentions, git_touches: gitTouches, confidence, last_modified: lastModified });
      }

      fileScores.sort((a, b) => b.confidence - a.confidence || b.mentions - a.mentions);
      const top = fileScores.slice(0, 20);

      // Write FORECAST.md to phase dir
      let forecastPath: string | null = null;
      try {
        const lines = [
          `# File Touch Forecast — Phase ${phase}`,
          '',
          `Generated: ${new Date().toISOString().slice(0, 10)}`,
          '',
          '| File | Mentions | Git Touches | Confidence | Last Modified |',
          '|------|----------|-------------|------------|---------------|',
          ...top.map((r) => `| \`${r.file}\` | ${r.mentions} | ${r.git_touches} | ${r.confidence} | ${r.last_modified || 'n/a'} |`),
        ];
        const fp = path.join(phaseDir, 'FORECAST.md');
        fs.writeFileSync(fp, lines.join('\n') + '\n', 'utf-8');
        forecastPath = path.relative(cwd, fp);
      } catch { /* non-fatal */ }

      const summary = top.length > 0
        ? `Top predicted files:\n${top.slice(0, 5).map((r, i) => `  ${i + 1}. ${r.file} (confidence: ${r.confidence})`).join('\n')}`
        : 'No file paths found in plan descriptions';

      output({ phase, files_found: fileScores.length, top_files: top, forecast_path: forecastPath }, raw, summary);
    },
  },
  {
    command: 'import-knowhow',
    handler: (args, cwd, raw) => {
      if (!args[1]) error('source project directory required. Usage: gd import-knowhow <source-dir>');
      const topStr = flag(args, '--top');
      const topN = topStr ? parseInt(topStr, 10) : undefined;
      return cmdImportKnowhow(cwd, args[1], raw, topN, args.includes('--all'), args.includes('--dry-run'));
    },
  },
  { command: 'research-gaps', handler: (_args, cwd, raw) => cmdResearchGaps(cwd, raw) },
  {
    command: 'deps-risk',
    handler: (args, cwd, raw) => cmdDepsRisk(cwd, args[1] ?? null, raw),
  },
  { command: 'watch', handler: (_args, cwd, raw) => cmdWatch(cwd, raw) },
  {
    command: 'singularity',
    handler: (args, cwd, raw) => {
      const since = flag(args, '--since') ?? null;
      const all = args.includes('--all');
      const byIteration = args.includes('--by-iteration');
      cmdSingularity(cwd, { since, all, byIteration }, raw);
    },
  },
  {
    command: 'plan-lint',
    handler: (args, cwd, raw) => {
      if (!args[1]) {
        error('milestone name required. Usage: gd plan-lint <milestone>');
      }
      cmdPlanLint(cwd, args[1], raw);
    },
  },
  {
    command: 'plan-candidates',
    handler: (args, cwd, raw) => {
      if (!args[1]) {
        error(
          'phase number required. Usage: gd plan-candidates <N> --candidates K [--input FILE] [--allow-partial-candidates]'
        );
      }
      const phaseNum: string = args[1];
      const candidatesArg: string | undefined = flag(args, '--candidates');
      const inputFile: string | undefined = flag(args, '--input');
      const allowPartial: boolean = args.includes('--allow-partial-candidates');
      const candidates: number = candidatesArg ? parseInt(candidatesArg, 10) : 0;
      if (candidatesArg && (!Number.isInteger(candidates) || candidates < 1)) {
        error(`--candidates must be a positive integer, got "${candidatesArg}"`);
      }
      cmdPlanPhase(cwd, phaseNum, { candidates, inputFile, allowPartial }, raw);
    },
  },
  {
    command: 'select-candidate',
    handler: (args, cwd, raw) => {
      if (!args[1]) {
        error(
          'phase number required. Usage: gd select-candidate <N> [--dry-run] [--force] [--run-verification-commands]'
        );
      }
      const phaseNum: string = args[1];
      const dryRun: boolean = args.includes('--dry-run');
      const force: boolean = args.includes('--force');
      const runVerificationCommands: boolean = args.includes('--run-verification-commands');
      cmdSelectCandidate(cwd, phaseNum, { dryRun, force, runVerificationCommands }, raw);
    },
  },
  {
    command: 'patterns',
    handler: (args, cwd, raw) => {
      // --dry-run is the default; --apply requires --yes (never-auto-write).
      const apply: boolean = args.includes('--apply');
      const yes: boolean = args.includes('--yes');
      const minOcc = flag(args, '--min-occurrences');
      const effSize = flag(args, '--effect-size');
      const fdr = flag(args, '--fdr-q');
      cmdPatterns(
        cwd,
        {
          apply,
          yes,
          minOccurrences: minOcc !== undefined ? parseInt(minOcc, 10) : undefined,
          effectSize: effSize !== undefined ? parseFloat(effSize) : undefined,
          fdrQ: fdr !== undefined ? parseFloat(fdr) : undefined,
        },
        raw
      );
    },
  },
  {
    command: 'install',
    handler: (args, cwd, raw) => {
      // Positional harness names (everything after `install` that isn't a flag).
      const harnesses = args
        .slice(1)
        .filter((a) => !a.startsWith('--')) as Array<'claude' | 'codex' | 'gemini' | 'opencode'>;
      cmdInstall(
        cwd,
        {
          harnesses,
          all: args.includes('--all'),
          list: args.includes('--list'),
          dryRun: args.includes('--dry-run'),
        },
        raw
      );
    },
  },
];

// ─── Subcommand Arrays ──────────────────────────────────────────────────────

const STATE_SUBS: readonly string[] = [
  'load',
  'get',
  'patch',
  'update',
  'advance-plan',
  'record-metric',
  'update-progress',
  'add-decision',
  'add-blocker',
  'resolve-blocker',
  'record-session',
];
const TEMPLATE_SUBS: readonly string[] = ['select', 'fill'];
const FRONTMATTER_SUBS: readonly string[] = ['get', 'set', 'merge', 'validate'];
const VERIFY_SUBS: readonly string[] = [
  'plan-structure',
  'phase-completeness',
  'references',
  'commits',
  'artifacts',
  'key-links',
  'mechanical',
];
const PHASES_SUBS: readonly string[] = ['list'];
const ROADMAP_SUBS: readonly string[] = ['get-phase', 'analyze'];
const PHASE_SUBS: readonly string[] = [
  'next-decimal',
  'add',
  'insert',
  'remove',
  'complete',
  'analyze-deps',
];
const MILESTONE_SUBS: readonly string[] = ['complete'];
const VALIDATE_SUBS: readonly string[] = ['consistency'];
const TODO_SUBS: readonly string[] = ['complete'];
const TRACKER_SUBS: readonly string[] = [
  'get-config',
  'sync-roadmap',
  'sync-phase',
  'update-status',
  'add-comment',
  'sync-status',
  'schedule',
  'prepare-reschedule',
  'prepare-roadmap-sync',
  'prepare-phase-sync',
  'record-mapping',
  'record-status',
];
const REQUIREMENT_SUBS: readonly string[] = ['get', 'list', 'traceability', 'update-status'];
const WORKTREE_SUBS: readonly string[] = [
  'create',
  'remove',
  'list',
  'push-pr',
  'ensure-milestone-branch',
  'merge',
  'hook',
];
const { INIT_WORKFLOWS } = require('../lib/cli/index') as { INIT_WORKFLOWS: readonly string[] };

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // ultracode max-effort mode: set the process-tree env carrier BEFORE dispatch so
  // every downstream spawn (autopilot waves/pipeline, autoresearch loop) inherits
  // best-model + max effort. This is what makes `ultracode` / `--ultracode` work via
  // the Claude Code plugin's /grd:* slash commands (they route through grd-tools.js),
  // not just the `gd` CLI. Strip the token so no command's parser mis-reads it.
  const { maybeApplyUltracode } = require('../lib/ultracode') as {
    maybeApplyUltracode: (tokens: string[]) => boolean;
  };
  if (maybeApplyUltracode(args)) {
    for (let i = args.length - 1; i >= 0; i--) {
      if (args[i] === 'ultracode' || args[i] === '--ultracode') args.splice(i, 1);
    }
  }
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);
  const command = args[0];
  const cwd = process.cwd();

  if (!command) {
    error(
      'Usage: grd-tools <command> [args] [--raw]\nCommands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, tracker, init, dashboard, phase-detail, health, detect-backend, long-term-roadmap, quality-analysis, setup, search, requirement, worktree, migrate-dirs, coverage-report, health-check, dead-end'
    );
  }

  try {
    await routeCommand(command, args, cwd, raw);
  } catch (e: unknown) {
    error((e as Error).stack || String(e));
  }
}

// ─── Route Command ──────────────────────────────────────────────────────────

/** Validate and route CLI commands */
async function routeCommand(
  command: string,
  args: string[],
  cwd: string,
  raw: boolean
): Promise<void> {
  // Descriptor-based dispatch: check ROUTE_DESCRIPTORS before falling through to switch
  const descriptor = ROUTE_DESCRIPTORS.find((d) => d.command === command);
  if (descriptor) {
    return descriptor.handler(args, cwd, raw) as void;
  }

  switch (command) {
    case 'state': {
      const sub: string = args[1];
      // No subcommand defaults to load -- only validate if provided
      if (sub) validateSubcommand(sub, STATE_SUBS as string[], 'state');
      if (sub === 'update') cmdStateUpdate(cwd, args[2], args[3]);
      else if (sub === 'get') cmdStateGet(cwd, args[2], raw);
      else if (sub === 'patch') {
        const patches: Record<string, string> = {};
        for (let i = 2; i < args.length; i += 2) {
          const k: string = args[i].replace(/^--/, '');
          if (k && args[i + 1] !== undefined) patches[k] = args[i + 1];
        }
        cmdStatePatch(cwd, patches, raw);
      } else if (sub === 'advance-plan') cmdStateAdvancePlan(cwd, raw);
      else if (sub === 'record-metric') {
        cmdStateRecordMetric(
          cwd,
          {
            phase: flag(args, '--phase') ?? null,
            plan: flag(args, '--plan') ?? null,
            duration: flag(args, '--duration') ?? null,
            tasks: flag(args, '--tasks') ?? null,
            files: flag(args, '--files') ?? null,
          },
          raw
        );
      } else if (sub === 'update-progress') cmdStateUpdateProgress(cwd, raw);
      else if (sub === 'add-decision') {
        cmdStateAddDecision(
          cwd,
          {
            phase: flag(args, '--phase') ?? null,
            summary: flag(args, '--summary') ?? null,
            rationale: flag(args, '--rationale') ?? '',
          },
          raw
        );
      } else if (sub === 'add-blocker') cmdStateAddBlocker(cwd, flag(args, '--text') ?? '', raw);
      else if (sub === 'resolve-blocker')
        cmdStateResolveBlocker(cwd, flag(args, '--text') ?? '', raw);
      else if (sub === 'record-session') {
        cmdStateRecordSession(
          cwd,
          {
            stopped_at: flag(args, '--stopped-at') ?? null,
            resume_file: flag(args, '--resume-file') ?? 'None',
          },
          raw
        );
      } else cmdStateLoad(cwd, raw);
      break;
    }
    case 'resolve-model':
      cmdResolveModel(cwd, args[1], raw);
      break;
    case 'find-phase':
      cmdFindPhase(cwd, args[1], raw);
      break;
    case 'commit': {
      const filesIndex: number = args.indexOf('--files');
      cmdCommit(
        cwd,
        args[1],
        filesIndex !== -1
          ? args.slice(filesIndex + 1).filter((a: string) => !a.startsWith('--'))
          : [],
        raw,
        args.includes('--amend')
      );
      break;
    }
    case 'verify-summary': {
      validateFileArg(args[1], cwd);
      const cc: number = args.indexOf('--check-count');
      cmdVerifySummary(cwd, args[1], cc !== -1 ? parseInt(args[cc + 1], 10) : 2, raw);
      break;
    }
    case 'template': {
      const sub: string = args[1];
      validateSubcommand(sub, TEMPLATE_SUBS as string[], 'template');
      if (sub === 'select') cmdTemplateSelect(cwd, args[2], raw);
      else if (sub === 'fill') {
        cmdTemplateFill(
          cwd,
          args[2],
          {
            phase: flag(args, '--phase') ?? null,
            plan: flag(args, '--plan') ?? null,
            name: flag(args, '--name') ?? null,
            type: flag(args, '--type') ?? 'execute',
            wave: flag(args, '--wave') ?? '1',
            fields: flag(args, '--fields') ? JSON.parse(flag(args, '--fields') as string) : {},
          },
          raw
        );
      }
      break;
    }
    case 'frontmatter': {
      const sub: string = args[1];
      validateSubcommand(sub, FRONTMATTER_SUBS as string[], 'frontmatter');
      const file: string = args[2];
      validateFileArg(file, cwd);
      if (sub === 'get') cmdFrontmatterGet(cwd, file, flag(args, '--field') ?? null, raw);
      else if (sub === 'set')
        cmdFrontmatterSet(cwd, file, flag(args, '--field') ?? '', flag(args, '--value') ?? '', raw);
      else if (sub === 'merge') cmdFrontmatterMerge(cwd, file, flag(args, '--data') ?? '', raw);
      else if (sub === 'validate')
        cmdFrontmatterValidate(cwd, file, flag(args, '--schema') ?? '', raw);
      break;
    }
    case 'verify': {
      const sub: string = args[1];
      validateSubcommand(sub, VERIFY_SUBS as string[], 'verify');
      if (sub === 'commits') {
        for (const ref of args.slice(2)) validateGitRef(ref);
        cmdVerifyCommits(cwd, args.slice(2), raw);
      } else if (sub === 'mechanical') {
        // Bundle: arg is a phase number/name, not a file path
        cmdVerifyMechanical(cwd, args[2], raw);
      } else {
        validateFileArg(args[2], cwd);
        if (sub === 'plan-structure') cmdVerifyPlanStructure(cwd, args[2], raw);
        else if (sub === 'phase-completeness') cmdVerifyPhaseCompleteness(cwd, args[2], raw);
        else if (sub === 'references') cmdVerifyReferences(cwd, args[2], raw);
        else if (sub === 'artifacts') cmdVerifyArtifacts(cwd, args[2], raw);
        else if (sub === 'key-links') cmdVerifyKeyLinks(cwd, args[2], raw);
      }
      break;
    }
    case 'generate-slug':
      cmdGenerateSlug(args[1], raw);
      break;
    case 'current-timestamp':
      cmdCurrentTimestamp(args[1] || 'full', raw);
      break;
    case 'list-todos':
      cmdListTodos(cwd, args[1], raw);
      break;
    case 'verify-path-exists':
      cmdVerifyPathExists(cwd, args[1], raw, args.includes('--dry-run'));
      break;
    case 'config-ensure-section':
      cmdConfigEnsureSection(cwd, raw, args.includes('--dry-run'));
      break;
    case 'config-set':
      cmdConfigSet(cwd, args[1], args[2], raw, args.includes('--dry-run'));
      break;
    case 'config-yolo':
      cmdConfigYolo(cwd, args[1], raw, args.includes('--dry-run'));
      break;
    case 'history-digest':
      cmdHistoryDigest(cwd, raw);
      break;
    case 'dead-end': {
      const sub: string = args[1];
      if (sub === 'add') {
        // Collect all --evidence flags (repeatable)
        const evidence: string[] = [];
        for (let i = 0; i < args.length; i++) {
          if (args[i] === '--evidence' && args[i + 1]) evidence.push(args[i + 1]);
        }
        cmdDeadEndAdd(
          cwd,
          {
            approach: flag(args, '--approach') ?? '',
            phase: flag(args, '--phase') ?? '',
            verdict: flag(args, '--verdict'),
            evidence,
            notes: flag(args, '--notes'),
          },
          raw
        );
      } else if (sub === 'promote-from-phase') {
        // Prefer the explicit --phase flag when present. Fall back to
        // positional args[2], but only if it is NOT itself a flag —
        // otherwise `promote-from-phase --phase 1` would pass the literal
        // string "--phase" to findPhaseInternal (codex r1 P2 on PR #37).
        const flagPhase = flag(args, '--phase');
        const positional = args[2] && !args[2].startsWith('--') ? args[2] : undefined;
        const phaseArg = flagPhase ?? positional ?? '';
        cmdDeadEndPromoteFromPhase(cwd, phaseArg, raw);
      } else {
        error(`Unknown dead-end subcommand: ${sub}. Valid: add, promote-from-phase`);
      }
      break;
    }
    case 'genome': {
      const sub: string = args[1];
      if (sub === 'init') {
        cmdGenomeInit(cwd, raw);
      } else if (sub === 'show') {
        cmdGenomeShow(cwd, raw);
      } else if (sub === 'snapshot') {
        cmdGenomeSnapshot(cwd, raw);
      } else if (sub === 'promote-suggestion') {
        const slug = args[2] && !args[2].startsWith('--') ? args[2] : '';
        cmdGenomePromoteSuggestion(cwd, slug, raw);
      } else {
        error(
          `Unknown genome subcommand: ${sub}. Valid: init, show, snapshot, promote-suggestion`
        );
      }
      break;
    }
    case 'think': {
      // Tier-3 #11 of the Ouroboros integration. One-shot project-state
      // aggregator. No daemon, no LLM, writes only to .planning/thoughts/.
      //
      // codex r1 P3 on PR #42: strictly validate --limit. Pre-fix:
      //   `--limit 1.5` parseInt → 1 (silent truncation)
      //   `--limit 3abc` parseInt → 3 (silent truncation)
      //   `--limit` (no value) → silently defaulted
      // All three slipped past the positive-integer check downstream.
      let limit: number | undefined;
      if (args.indexOf('--limit') !== -1) {
        const limitRaw = flag(args, '--limit');
        if (limitRaw === undefined || !/^\d+$/.test(limitRaw)) {
          error(
            `--limit requires a positive integer value (got ${limitRaw === undefined ? '<missing>' : `"${limitRaw}"`})`
          );
        }
        limit = parseInt(limitRaw as string, 10);
      }
      cmdThink(cwd, { limit }, raw);
      break;
    }
    case 'plan-tournament': {
      // Tier-3 #9 of the Ouroboros integration. Scoring + selection over
      // N candidate PLAN.md files. Caller supplies paths; this command
      // does NOT auto-generate candidates (that's a deliberate follow-up
      // to avoid worktree orchestration + backend variance per the
      // proposal's caveat).
      const rawCandidates: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--candidate' && args[i + 1]) rawCandidates.push(args[i + 1]);
      }
      // Also accept comma-separated list via --candidates "a.md,b.md"
      const csv = flag(args, '--candidates');
      if (csv) {
        for (const p of csv.split(',')) {
          const trimmed = p.trim();
          if (trimmed) rawCandidates.push(trimmed);
        }
      }
      // codex r4 P2 on PR #41: validate each candidate path against the
      // project boundary before passing it to the scorer. Without this
      // guard, absolute paths or `../` traversal could read files
      // outside the repo when gd is invoked via automation / MCP.
      //
      // codex r5 P2 on PR #41: validateFileArg's underlying check is
      // prefix-based, so a sibling like `${cwd}-secrets/PLAN.md` would
      // squeak through. Tighten with a path.relative containment check.
      const path_lib = require('path') as typeof import('path');
      const candidates: string[] = rawCandidates.map((p) => {
        const validated = validateFileArg(p, cwd);
        const rel = path_lib.relative(cwd, validated);
        if (rel === '' || rel.startsWith('..') || path_lib.isAbsolute(rel)) {
          error(`Candidate path "${p}" is outside the project directory`);
        }
        return validated;
      });
      // codex r5 P3: validate phase format before interpolating into
      // _extractRoadmapGoal's regex, where a malformed value would
      // crash with a regex syntax error.
      const phaseArg = flag(args, '--phase') ?? '';
      if (phaseArg) validatePhaseArg(phaseArg);
      cmdPlanTournament(cwd, { phase: phaseArg, candidates }, raw);
      break;
    }
    case 'phases': {
      const sub: string = args[1];
      validateSubcommand(sub, PHASES_SUBS as string[], 'phases');
      cmdPhasesList(
        cwd,
        { type: flag(args, '--type') ?? null, phase: flag(args, '--phase') ?? null },
        raw
      );
      break;
    }
    case 'roadmap': {
      const sub: string = args[1];
      validateSubcommand(sub, ROADMAP_SUBS as string[], 'roadmap');
      if (sub === 'get-phase') {
        validatePhaseArg(args[2]);
        cmdRoadmapGetPhase(cwd, args[2], raw);
      } else if (sub === 'analyze') cmdRoadmapAnalyze(cwd, raw);
      break;
    }
    case 'phase': {
      const sub: string = args[1];
      validateSubcommand(sub, PHASE_SUBS as string[], 'phase');
      if (sub === 'next-decimal') {
        validatePhaseArg(args[2]);
        cmdPhaseNextDecimal(cwd, args[2], raw);
      } else if (sub === 'add') {
        const ctxIdx: number = args.indexOf('--context');
        let context: string | undefined;
        if (ctxIdx !== -1) {
          context = args.slice(ctxIdx + 1).join(' ');
          args.splice(ctxIdx);
        }
        cmdPhaseAdd(cwd, args.slice(2).join(' '), raw, context);
      } else if (sub === 'insert') {
        validatePhaseArg(args[2]);
        cmdPhaseInsert(cwd, args[2], args.slice(3).join(' '), raw);
      } else if (sub === 'remove') {
        validatePhaseArg(args[2]);
        cmdPhaseRemove(
          cwd,
          args[2],
          { force: args.includes('--force'), dryRun: args.includes('--dry-run') },
          raw
        );
      } else if (sub === 'complete') {
        validatePhaseArg(args[2]);
        await cmdPhaseComplete(cwd, args[2], raw, { dryRun: args.includes('--dry-run') });
      } else if (sub === 'analyze-deps') {
        cmdPhaseAnalyzeDeps(cwd, raw);
      }
      break;
    }
    case 'milestone': {
      const sub: string = args[1];
      validateSubcommand(sub, MILESTONE_SUBS as string[], 'milestone');
      if (sub === 'complete') {
        const ni: number = args.indexOf('--name');
        const version: string | null =
          args.slice(2).find((a: string) => !a.startsWith('--')) || null;
        cmdMilestoneComplete(
          cwd,
          version,
          {
            name: ni !== -1 ? args[ni + 1] : null,
            dryRun: args.includes('--dry-run'),
          },
          raw
        );
      }
      break;
    }
    case 'version': {
      const VERSION_SUBS: readonly string[] = ['bump'];
      validateSubcommand(args[1], VERSION_SUBS as string[], 'version');
      if (args[1] === 'bump') {
        if (!args[2]) error('version string required (e.g., v1.0.0)');
        cmdVersionBump(cwd, args[2], raw);
      }
      break;
    }
    case 'validate': {
      validateSubcommand(args[1], VALIDATE_SUBS as string[], 'validate');
      cmdValidateConsistency(cwd, raw);
      break;
    }
    case 'progress':
      cmdProgressRender(cwd, args[1] || 'json', raw);
      break;
    case 'todo': {
      validateSubcommand(args[1], TODO_SUBS as string[], 'todo');
      cmdTodoComplete(cwd, args[2], raw, args.includes('--dry-run'));
      break;
    }
    case 'scaffold': {
      const pi: number = args.indexOf('--phase');
      const ni: number = args.indexOf('--name');
      cmdScaffold(
        cwd,
        args[1],
        {
          phase: pi !== -1 ? args[pi + 1] : null,
          name: ni !== -1 ? args.slice(ni + 1).join(' ') : null,
        },
        raw
      );
      break;
    }
    case 'migrate-dirs':
      cmdMigrateDirs(cwd, raw, args.includes('--dry-run'));
      break;
    case 'init': {
      const wf: string = args[1];
      const includes: Set<string> = parseIncludeFlag(args);
      validateSubcommand(wf, INIT_WORKFLOWS as string[], 'init');
      switch (wf) {
        case 'execute-phase':
          validatePhaseArg(args[2]);
          cmdInitExecutePhase(cwd, args[2], includes, raw);
          break;
        case 'execute-parallel': {
          const phases: string[] = args.slice(2).filter((a: string) => !a.startsWith('--'));
          if (phases.length === 0)
            error('At least one phase number required for init execute-parallel');
          for (const p of phases) validatePhaseArg(p);
          cmdInitExecuteParallel(cwd, phases, includes, raw);
          break;
        }
        case 'plan-phase':
          validatePhaseArg(args[2]);
          cmdInitPlanPhase(cwd, args[2], includes, raw);
          break;
        case 'new-project':
          cmdInitNewProject(cwd, raw);
          break;
        case 'new-milestone':
          cmdInitNewMilestone(cwd, raw);
          break;
        case 'quick':
          cmdInitQuick(cwd, args.slice(2).join(' '), raw);
          break;
        case 'resume':
          cmdInitResume(cwd, raw);
          break;
        case 'verify-work':
          validatePhaseArg(args[2]);
          cmdInitVerifyWork(cwd, args[2], raw);
          break;
        case 'phase-op':
          validatePhaseArg(args[2]);
          cmdInitPhaseOp(cwd, args[2], raw);
          break;
        case 'todos':
          cmdInitTodos(cwd, args[2], raw);
          break;
        case 'milestone-op':
          cmdInitMilestoneOp(cwd, raw);
          break;
        case 'plan-milestone-gaps':
          cmdInitPlanMilestoneGaps(cwd, raw);
          break;
        case 'map-codebase':
          cmdInitMapCodebase(cwd, raw);
          break;
        case 'progress':
          cmdInitProgress(cwd, includes, raw, args.includes('--refresh'));
          break;
        case 'survey':
          cmdInitSurveyor(cwd, args.slice(2).join(' ') || '', raw);
          break;
        case 'deep-dive':
          cmdInitDeepDive(cwd, args.slice(2).join(' ') || '', raw);
          break;
        case 'feasibility':
          cmdInitFeasibility(cwd, args.slice(2).join(' ') || '', raw);
          break;
        case 'eval-plan':
          cmdInitEvalPlan(cwd, args[2] || null, raw);
          break;
        case 'eval-report':
          cmdInitEvalReport(cwd, args[2] || null, raw);
          break;
        case 'assess-baseline':
          cmdInitAssessBaseline(cwd, raw);
          break;
        case 'product-plan':
          cmdInitProductOwner(cwd, raw);
          break;
        case 'iterate':
          cmdInitResearchWorkflow(cwd, 'iterate', args.slice(2).join(' '), includes, raw);
          break;
        case 'project-researcher':
          cmdInitProjectResearcher(cwd, args.slice(2).join(' ') || '', raw);
          break;
        case 'research-synthesizer':
          cmdInitResearchSynthesizer(cwd, raw);
          break;
        case 'roadmapper':
          cmdInitRoadmapper(cwd, raw);
          break;
        case 'verifier':
          cmdInitVerifier(cwd, args[2] || null, raw);
          break;
        case 'autopilot':
          cmdInitAutopilot(cwd, raw);
          break;
        case 'multi-milestone-autopilot':
          cmdInitMultiMilestoneAutopilot(cwd, raw);
          break;
        case 'autoplan':
          cmdInitAutoplan(cwd, raw);
          break;
        case 'autoresearch':
          cmdInitAutoResearch(cwd, raw);
          break;
        case 'evolve':
          cmdInitEvolve(cwd, raw);
          break;
        case 'wireup':
          cmdInitWireup(cwd, raw);
          break;
        case 'debug':
          cmdInitDebug(cwd, args[2] || null, raw);
          break;
        case 'integration-check':
          cmdInitIntegrationCheck(cwd, args[2] || null, raw);
          break;
        case 'migrate':
          cmdInitMigrate(cwd, raw);
          break;
        case 'plan-check':
          validatePhaseArg(args[2]);
          cmdInitPlanCheck(cwd, args[2], raw);
          break;
        case 'phase-research':
          validatePhaseArg(args[2]);
          cmdInitPhaseResearch(cwd, args[2], includes, raw);
          break;
        case 'code-review':
          validatePhaseArg(args[2]);
          cmdInitCodeReview(cwd, args[2], raw);
          break;
      }
      break;
    }
    case 'phase-plan-index':
      validatePhaseArg(args[1]);
      cmdPhasePlanIndex(cwd, args[1], raw);
      break;
    case 'state-snapshot': {
      const sinceIdx: number = args.indexOf('--since');
      const snapshotOptions: Record<string, string | undefined> =
        sinceIdx !== -1 ? { since: args[sinceIdx + 1] } : {};
      cmdStateSnapshot(cwd, raw, snapshotOptions);
      break;
    }
    case 'summary-extract': {
      validateFileArg(args[1], cwd);
      const fi: number = args.indexOf('--fields');
      cmdSummaryExtract(cwd, args[1], fi !== -1 ? args[fi + 1].split(',') : null, raw);
      break;
    }
    case 'tracker': {
      validateSubcommand(args[1], TRACKER_SUBS as string[], 'tracker');
      await cmdTracker(cwd, args[1], args.slice(2), raw);
      break;
    }
    case 'dashboard':
      cmdDashboard(cwd, raw);
      break;
    case 'phase-detail':
      validatePhaseArg(args[1]);
      cmdPhaseDetail(cwd, args[1], raw);
      break;
    case 'health':
      cmdHealth(cwd, raw);
      break;
    case 'detect-backend':
      cmdDetectBackend(cwd, raw);
      break;
    case 'long-term-roadmap': {
      const sub: string = args[1];
      if (!sub)
        error(
          'subcommand required: list, add, remove, update, refine, link, unlink, display, init, history, parse, validate'
        );
      const subArgs: string[] = args.slice(2);
      cmdLongTermRoadmap(cwd, sub, subArgs, raw);
      break;
    }
    case 'quality-analysis':
      cmdQualityAnalysis(cwd, args.slice(1), raw);
      break;
    case 'setup':
      cmdSetup(cwd, raw);
      break;
    case 'search':
      if (!args[1]) error('Search query is required');
      cmdSearch(cwd, args[1], raw);
      break;
    case 'requirement': {
      const sub: string = args[1];
      validateSubcommand(sub, REQUIREMENT_SUBS as string[], 'requirement');
      if (sub === 'get') {
        if (!args[2]) error('REQ-ID required');
        cmdRequirementGet(cwd, args[2], raw);
      } else if (sub === 'list') {
        cmdRequirementList(
          cwd,
          {
            phase: flag(args, '--phase') ?? null,
            priority: flag(args, '--priority') ?? null,
            status: flag(args, '--status') ?? null,
            category: flag(args, '--category') ?? null,
            all: args.includes('--all'),
          },
          raw
        );
      } else if (sub === 'traceability') {
        cmdRequirementTraceability(
          cwd,
          {
            phase: flag(args, '--phase') ?? null,
          },
          raw
        );
      } else if (sub === 'update-status') {
        if (!args[2]) error('REQ-ID required');
        if (!args[3]) error('Status required (Pending, In Progress, Done, Deferred)');
        // Handle multi-word status "In Progress" -- args[3] might be "In" and args[4] "Progress"
        let status: string = args[3];
        if (args[3] === 'In' && args[4] === 'Progress') {
          status = 'In Progress';
        }
        cmdRequirementUpdateStatus(cwd, args[2], status, raw, args.includes('--dry-run'));
      }
      break;
    }
    case 'worktree': {
      const sub: string = args[1];
      validateSubcommand(sub, WORKTREE_SUBS as string[], 'worktree');
      if (sub === 'create') {
        cmdWorktreeCreate(
          cwd,
          {
            phase: flag(args, '--phase') ?? null,
            milestone: flag(args, '--milestone') ?? null,
            slug: flag(args, '--slug') ?? null,
            startPoint: flag(args, '--start-point') ?? null,
          },
          raw
        );
      } else if (sub === 'remove') {
        if (args.includes('--stale')) {
          cmdWorktreeRemoveStale(cwd, raw);
        } else {
          cmdWorktreeRemove(
            cwd,
            {
              phase: flag(args, '--phase') ?? null,
              path: flag(args, '--path') ?? null,
              milestone: flag(args, '--milestone') ?? null,
            },
            raw
          );
        }
      } else if (sub === 'list') {
        cmdWorktreeList(cwd, raw);
      } else if (sub === 'push-pr') {
        cmdWorktreePushAndPR(
          cwd,
          {
            phase: flag(args, '--phase') ?? null,
            milestone: flag(args, '--milestone') ?? null,
            title: flag(args, '--title') ?? null,
            body: flag(args, '--body') ?? null,
            base: flag(args, '--base') ?? null,
          },
          raw
        );
      } else if (sub === 'ensure-milestone-branch') {
        cmdWorktreeEnsureMilestoneBranch(
          cwd,
          {
            milestone: flag(args, '--milestone') ?? null,
            baseBranch: flag(args, '--base-branch') ?? null,
          },
          raw
        );
      } else if (sub === 'merge') {
        cmdWorktreeMerge(
          cwd,
          {
            phase: flag(args, '--phase') ?? null,
            milestone: flag(args, '--milestone') ?? null,
            slug: flag(args, '--slug') ?? null,
            base: flag(args, '--base') ?? null,
            branch: flag(args, '--branch') ?? null,
            deleteBranch: args.includes('--delete-branch'),
          },
          raw
        );
      } else if (sub === 'hook') {
        const hookSub: string = args[2];
        if (hookSub === 'create') {
          cmdWorktreeHookCreate(cwd, args[3], args[4], raw);
        } else if (hookSub === 'remove') {
          cmdWorktreeHookRemove(cwd, args[3], args[4], raw);
        } else {
          error(`Unknown worktree hook subcommand: ${hookSub}. Use 'create' or 'remove'.`);
        }
      }
      break;
    }
    case 'settings': {
      const sub: string = args[1];
      if (sub === 'token_profile') {
        const value: string = args[2];
        const validProfiles: TokenProfileName[] = ['frugal', 'balanced', 'quality'];
        if (!value || !validProfiles.includes(value as TokenProfileName)) {
          error(
            `Invalid token_profile value "${value || ''}". Valid values: ${validProfiles.join(', ')}`
          );
        }
        cmdConfigSet(cwd, 'token_profile', value, raw);
      } else if (sub === 'phase_complete_llm_fallback') {
        const value: string = args[2];
        if (value !== 'true' && value !== 'false') {
          error(
            `Invalid phase_complete_llm_fallback value "${value || ''}". Valid values: true, false`
          );
        }
        cmdConfigSet(cwd, 'phase_complete_llm_fallback', value, raw);
      } else if (sub === 'effort') {
        // v0.4 Phase 1: effort axis
        const value: string = args[2];
        const validEffortLevels: string[] = ['thrifty', 'balanced', 'deep'];
        if (!value || !validEffortLevels.includes(value)) {
          error(
            `Invalid effort value "${value || ''}". Valid values: ${validEffortLevels.join(', ')}`
          );
        }
        cmdConfigSet(cwd, 'effort', value, raw);
      } else {
        error(
          `Unknown settings subcommand "${sub || ''}". Tool-mode settings subcommands: token_profile, effort, phase_complete_llm_fallback`
        );
      }
      break;
    }
    case 'evolve': {
      const sub: string = args[1];
      validateSubcommand(sub, ['run', 'discover', 'state', 'advance', 'reset'], 'evolve');
      switch (sub) {
        case 'run':
          await cmdEvolve(cwd, args.slice(2), raw);
          return;
        case 'discover':
          await cmdEvolveDiscover(cwd, args.slice(2), raw);
          return;
        case 'state':
          cmdEvolveState(cwd, args.slice(2), raw);
          return;
        case 'advance':
          cmdEvolveAdvance(cwd, args.slice(2), raw);
          return;
        case 'reset':
          cmdEvolveReset(cwd, args.slice(2), raw);
          return;
      }
      break;
    }
    case 'research': {
      const {
        cmdResearchStart,
        cmdResearchResume,
        cmdResearchStatus,
        cmdResearchReport,
        cmdResearchPortfolio,
      } = require('../lib/research') as {
        cmdResearchStart: (
          cwd: string,
          q: string,
          o: ResearchOptions,
          raw: boolean
        ) => Promise<never>;
        cmdResearchResume: (
          cwd: string,
          id: string,
          o: ResearchOptions,
          raw: boolean
        ) => Promise<never>;
        cmdResearchStatus: (cwd: string, id: string | undefined, raw: boolean) => never;
        cmdResearchReport: (cwd: string, id: string, raw: boolean) => Promise<never>;
        cmdResearchPortfolio: (cwd: string, o: Record<string, unknown>, raw: boolean) => Promise<never>;
      };
      // args[0] === 'research'; subcommand (if any) is args[1].
      const sub: string | undefined = args[1];
      const noGates: boolean = args.includes('--no-gates');
      const maxIdx: number = args.indexOf('--max-iterations');
      const maxRaw = maxIdx !== -1 ? Number(args[maxIdx + 1]) : undefined;
      const maxIterations = (maxRaw !== undefined && !Number.isNaN(maxRaw)) ? maxRaw : undefined;
      // --answers <file|-> : read the JSON answers object from a FILE, or from stdin when the
      // value is '-'. NEVER read answer text directly from argv (R8: zsh '!' + ARG_MAX). A
      // malformed/missing source leaves checkpointAnswers undefined → bare-resume recommended
      // defaults (the deterministic timeout behavior).
      const ansIdx: number = args.indexOf('--answers');
      let checkpointAnswers: Record<string, { label: string; text?: string }> | undefined;
      if (ansIdx !== -1 && args[ansIdx + 1]) {
        const src = args[ansIdx + 1];
        try {
          const rawTxt = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
          const parsed = JSON.parse(rawTxt) as unknown;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            checkpointAnswers = parsed as Record<string, { label: string; text?: string }>;
          }
        } catch { /* malformed/missing → undefined → bare-resume defaults */ }
      }
      // --interactive (bare = one-shot enable; --interactive=seed,design → per-point list) and
      // --no-interactive (one-shot disable). --no-gates implies --no-interactive. DORMANT this
      // phase (no emission consumes it) but must parse cleanly into ResearchOptions.
      let interactive: { enabled?: boolean; points?: string[] } | undefined;
      if (noGates || args.includes('--no-interactive')) {
        interactive = { enabled: false };
      } else {
        const intIdx = args.findIndex((a) => a === '--interactive' || a.startsWith('--interactive='));
        if (intIdx !== -1) {
          const tok = args[intIdx];
          const eq = tok.indexOf('=');
          const points = eq !== -1
            ? tok.slice(eq + 1).split(',').map((s) => s.trim()).filter(Boolean)
            : undefined;
          interactive = { enabled: true, ...(points && points.length ? { points } : {}) };
        }
      }
      const opts: ResearchOptions = { noGates, maxIterations, checkpointAnswers, interactive };
      if (sub === 'status') {
        cmdResearchStatus(cwd, args[2], raw);
        return;
      }
      if (sub === 'resume') {
        await cmdResearchResume(cwd, args[2], opts, raw);
        return;
      }
      if (sub === 'report') {
        await cmdResearchReport(cwd, args[2], raw);
        return;
      }
      if (sub === 'portfolio') {
        const rest = args.slice(2);
        const pIds: string[] = [];
        let topicId: string | undefined;
        let concurrency: number | undefined;
        for (let i = 0; i < rest.length; i++) {
          const a = rest[i];
          if (a === '--topic') { topicId = rest[++i]; continue; }
          if (a === '--concurrency') { concurrency = Number(rest[++i]); continue; }
          if (a.startsWith('--')) continue; // --force / --no-gates handled below
          pIds.push(a);
        }
        await cmdResearchPortfolio(cwd, { ids: pIds, topicId, concurrency, force: args.includes('--force'), noGates }, raw);
        return;
      }
      // No recognized subcommand → treat remaining non-flag args (after the
      // 'research' command token at index 0) as the question. Skip the value
      // that follows --max-iterations.
      const question: string = args
        .filter(
          (a, i) =>
            i >= 1 && !a.startsWith('--')
            && !(maxIdx !== -1 && i === maxIdx + 1)
            && !(ansIdx !== -1 && i === ansIdx + 1)
        )
        .join(' ');
      await cmdResearchStart(cwd, question, opts, raw);
      return;
    }
    case 'bench': {
      const { cmdBenchList, cmdBenchRun } = require('../lib/research/cli-bench') as {
        cmdBenchList: (cwd: string, raw: boolean) => never;
        cmdBenchRun: (
          cwd: string,
          o: { tasks?: string[]; keepWorkdir?: boolean; requireDocker?: boolean },
          raw: boolean
        ) => Promise<never>;
      };
      const sub: string = args[1];
      validateSubcommand(sub, ['run', 'list'], 'bench');
      if (sub === 'list') {
        cmdBenchList(cwd, raw);
        return;
      }
      const tasksIdx: number = args.indexOf('--tasks');
      const tasks: string[] | undefined =
        tasksIdx !== -1 && args[tasksIdx + 1]
          ? args[tasksIdx + 1].split(',').map((s) => s.trim()).filter(Boolean)
          : undefined;
      await cmdBenchRun(
        cwd,
        {
          tasks,
          keepWorkdir: args.includes('--keep-workdir'),
          requireDocker: args.includes('--require-docker'),
        },
        raw
      );
      return;
    }
    case 'ingest': {
      const { cmdIngest } = require('../lib/research/cli-kb') as {
        cmdIngest: (cwd: string, p: string, raw: boolean, deps?: Record<string, unknown>, pdfBody?: boolean) => Promise<never>;
      };
      const pdfBody = args.includes('--pdf');
      const target = args.slice(1).find((a) => !a.startsWith('--')) || '';
      await cmdIngest(cwd, target, raw, {}, pdfBody);
      break;
    }
    case 'synthesize': {
      const { cmdSynthesize } = require('../lib/research/cli-kb') as {
        cmdSynthesize: (cwd: string, t: string, raw: boolean) => Promise<never>;
      };
      await cmdSynthesize(cwd, args.slice(1).filter((a) => !a.startsWith('--')).join(' '), raw);
      break;
    }
    case 'retrieve': {
      const { cmdRetrieve } = require('../lib/research/cli-kb') as {
        cmdRetrieve: (cwd: string, q: string, raw: boolean) => Promise<never>;
      };
      await cmdRetrieve(cwd, args.slice(1).filter((a) => !a.startsWith('--')).join(' '), raw);
      break;
    }
    case 'accounts': {
      const sub: string = args[1];
      validateSubcommand(sub, ['discover', 'sync'], 'accounts');
      const { cmdAccountsDiscover, cmdAccountsSync } = require('../lib/commands/accounts') as {
        cmdAccountsDiscover: (cwd: string, raw: boolean) => Promise<void>;
        cmdAccountsSync: (cwd: string, opts: { dryRun: boolean; raw: boolean }) => Promise<void>;
      };
      if (sub === 'discover') await cmdAccountsDiscover(cwd, raw);
      else await cmdAccountsSync(cwd, { dryRun: args.includes('--dry-run'), raw });
      break;
    }
    case 'wireup': {
      const sub: string = args[1];
      validateSubcommand(sub, ['run'], 'wireup');
      if (sub === 'run') {
        await cmdWireup(cwd, args.slice(2), raw);
        return;
      }
      break;
    }
    case 'autopilot':
      await cmdAutopilot(cwd, args.slice(1), raw);
      break;
    case 'multi-milestone-autopilot':
      await cmdMultiMilestoneAutopilot(cwd, args.slice(1), raw);
      break;
    case 'autoplan':
      await cmdAutoplan(cwd, args.slice(1), raw);
      break;
    case 'autoresearch': {
      const arConfig: GrdConfig = loadConfig(cwd);
      const arScheduler = createScheduler(arConfig.scheduler, arConfig.superpowers);
      if (arScheduler) {
        arScheduler.loadPersistedState(path.join(cwd, '.planning'));
      }
      await cmdAutoResearch(cwd, args.slice(1), raw, arScheduler);
      break;
    }
    case 'worktree-hook-create':
      cmdWorktreeHookCreate(cwd, args[1], args[2], raw);
      break;
    case 'worktree-hook-remove':
      cmdWorktreeHookRemove(cwd, args[1], args[2], raw);
      break;
    case 'coverage-report':
      cmdCoverageReport(
        cwd,
        { threshold: parseInt(flag(args, '--threshold', '85') as string, 10) },
        raw
      );
      break;
    case 'health-check':
      cmdHealthCheck(cwd, { fix: args.includes('--fix') }, raw);
      break;
    case 'markdown-split': {
      _warnDeprecated('markdown-split');
      const sub: string = args[1];
      validateSubcommand(sub, ['split', 'check'], 'markdown-split');
      switch (sub) {
        case 'split': {
          const filePath: string = args[2];
          if (!filePath) error('file path required for markdown-split split');
          const absPath: string = path.resolve(cwd, filePath);
          if (!fs.existsSync(absPath)) error(`File not found: ${absPath}`);

          const thresholdIdx: number = args.indexOf('--threshold');
          const threshold: number | undefined =
            thresholdIdx !== -1 ? parseInt(args[thresholdIdx + 1], 10) : undefined;

          const content: string = fs.readFileSync(absPath, 'utf-8');
          const basename: string = path.basename(absPath, '.md');
          const dir: string = path.dirname(absPath);
          const result = splitMarkdown(content, { threshold, basename });

          if (!result.split_performed) {
            output({ split_performed: false, reason: result.reason, file: absPath }, raw);
            break;
          }

          // Write index file (overwrite original)
          fs.writeFileSync(absPath, result.index_content, 'utf-8');

          // Write partial files
          const partials: string[] = [];
          for (const part of result.parts || []) {
            const partPath: string = path.join(dir, part.filename);
            fs.writeFileSync(partPath, part.content, 'utf-8');
            partials.push(partPath);
          }

          output(
            {
              split_performed: true,
              index_file: absPath,
              partials,
              part_count: (result.parts || []).length,
            },
            raw
          );
          break;
        }
        case 'check': {
          const filePath: string = args[2];
          if (!filePath) error('file path required for markdown-split check');
          const absPath: string = path.resolve(cwd, filePath);
          if (!fs.existsSync(absPath)) error(`File not found: ${absPath}`);

          const content: string = fs.readFileSync(absPath, 'utf-8');
          const tokens: number = estimateTokens(content);
          const is_index: boolean = isIndexFile(content);
          output(
            {
              file: absPath,
              is_index,
              estimated_tokens: tokens,
              exceeds_threshold: tokens > 25000,
            },
            raw
          );
          break;
        }
      }
      break;
    }
    case 'parallel-progress':
      cmdParallelProgress(args.slice(1), raw);
      break;
    case 'overstory': {
      const sub = validateSubcommand(args[1] || '', ['detect', 'install'], 'overstory');

      if (sub === 'detect') {
        const result = detectOverstory(cwd);
        output(result || { available: false, reason: 'Overstory not detected' }, raw);
      } else if (sub === 'install') {
        try {
          installOverstory(cwd);
          output({ ok: true, message: 'Overstory installed and initialized' }, raw);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          output({ ok: false, error: msg }, raw);
        }
      }
      break;
    }
    case 'metrics': {
      const { getCounters } = require('../lib/metrics') as {
        getCounters: () => Record<string, number>;
      };
      const counters = getCounters();
      output(counters, raw, JSON.stringify(counters, null, 2));
      break;
    }
    default: {
      const TOP_LEVEL_COMMANDS: readonly string[] = [
        'state',
        'resolve-model',
        'find-phase',
        'commit',
        'verify-summary',
        'template',
        'frontmatter',
        'verify',
        'generate-slug',
        'current-timestamp',
        'list-todos',
        'verify-path-exists',
        'config-ensure-section',
        'config-set',
        'config-yolo',
        'history-digest',
        'phases',
        'roadmap',
        'phase',
        'milestone',
        'version',
        'validate',
        'progress',
        'todo',
        'scaffold',
        'migrate-dirs',
        'init',
        'phase-plan-index',
        'state-snapshot',
        'summary-extract',
        'tracker',
        'dashboard',
        'phase-detail',
        'health',
        'detect-backend',
        'long-term-roadmap',
        'quality-analysis',
        'setup',
        'search',
        'requirement',
        'worktree',
        'settings',
        'evolve',
        'autopilot',
        'multi-milestone-autopilot',
        'autoplan',
        'worktree-hook-create',
        'worktree-hook-remove',
        'teammate-idle-hook',
        'task-completed-hook',
        'instructions-loaded-hook',
        'stop-failure-hook',
        'post-compact-hook',
        'coverage-report',
        'health-check',
        'markdown-split',
        'parallel-progress',
        'overstory',
        'metrics',
        'diagnose',
        'export-research',
        'import-research',
        'deps',
        'todos',
        'knowhow',
        'budget',
        'blame',
        'freshness',
        'rollback',
        'estimate',
        'estimate-phase',
        'impact',
        'check-assumptions',
        'execute-phase',
        'phase-risk',
        'citation-backlinks',
        'eval-regression-check',
        'phase-time-budget',
        'config-diff',
        'phase-readiness',
        'milestone-health',
        'decision-timeline',
        'import-knowledge',
        'todo-duplicates',
        'citation-graph',
        'artifact-dag',
        'benchmark-report',
        'forecast-phase',
        'tail',
        'eval',
        'check-plans',
        'knowledge',
        'autoresearch',
        'wireup',
        'watch',
        'research-gaps',
        'deps-risk',
        'import-knowhow',
        'bench',
      ];
      const suggestion: string | null = findClosestCommand(command, TOP_LEVEL_COMMANDS as string[]);
      const hint: string = suggestion ? ` Did you mean "${suggestion}"?` : '';
      error(`Unknown command: "${command}".${hint}`);
    }
  }
}

main().catch((err: Error) => {
  process.stderr.write(`[grd] fatal error: ${err.message}\n`);
  process.exit(1);
});
