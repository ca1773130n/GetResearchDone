#!/usr/bin/env node
/**
 * GRD Tools -- Thin CLI router. All business logic lives in lib/ modules.
 * Usage: node grd-tools.js <command> [args] [--raw]
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ─── Typed Imports ──────────────────────────────────────────────────────────

const {
  parseIncludeFlag,
  output,
  error,
  validatePhaseArg,
  validateFileArg,
  validateSubcommand,
  validateGitRef,
  findClosestCommand,
} = require('../lib/utils.ts') as {
  parseIncludeFlag: (args: string[]) => Set<string>;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
  validatePhaseArg: (phase: string) => string;
  validateFileArg: (filePath: string, cwd: string) => string;
  validateSubcommand: (sub: string, validSubs: string[], parentCmd: string) => string;
  validateGitRef: (ref: string) => string;
  findClosestCommand: (input: string | null, commands: string[]) => string | null;
};

const {
  cmdFrontmatterGet,
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
} = require('../lib/frontmatter.ts') as {
  cmdFrontmatterGet: (cwd: string, filePath: string, field: string | null, raw: boolean) => void;
  cmdFrontmatterSet: (cwd: string, filePath: string, field: string, value: string, raw: boolean) => void;
  cmdFrontmatterMerge: (cwd: string, filePath: string, data: string, raw: boolean) => void;
  cmdFrontmatterValidate: (cwd: string, filePath: string, schemaName: string, raw: boolean) => void;
};

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
} = require('../lib/state.ts') as {
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
  cmdStateRecordSession: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdStateSnapshot: (cwd: string, raw: boolean, opts?: Record<string, string | undefined>) => void;
};

const { cmdRoadmapGetPhase, cmdPhaseNextDecimal, cmdRoadmapAnalyze } = require('../lib/roadmap.ts') as {
  cmdRoadmapGetPhase: (cwd: string, phaseNum: string, raw: boolean) => void;
  cmdPhaseNextDecimal: (cwd: string, basePhase: string, raw: boolean) => void;
  cmdRoadmapAnalyze: (cwd: string, raw: boolean) => void;
};

const { cmdTemplateSelect, cmdTemplateFill, cmdScaffold } = require('../lib/scaffold.ts') as {
  cmdTemplateSelect: (cwd: string, planPath: string, raw: boolean) => void;
  cmdTemplateFill: (cwd: string, templateType: string, options: Record<string, unknown>, raw: boolean) => void;
  cmdScaffold: (cwd: string, type: string, options: Record<string, string | null>, raw: boolean) => void;
};

const {
  cmdVerifySummary,
  cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness,
  cmdVerifyReferences,
  cmdVerifyCommits,
  cmdVerifyArtifacts,
  cmdVerifyKeyLinks,
} = require('../lib/verify.ts') as {
  cmdVerifySummary: (cwd: string, summaryPath: string, checkFileCount: number, raw: boolean) => void;
  cmdVerifyPlanStructure: (cwd: string, filePath: string, raw: boolean) => void;
  cmdVerifyPhaseCompleteness: (cwd: string, phase: string, raw: boolean) => void;
  cmdVerifyReferences: (cwd: string, filePath: string, raw: boolean) => void;
  cmdVerifyCommits: (cwd: string, hashes: string[], raw: boolean) => void;
  cmdVerifyArtifacts: (cwd: string, planFilePath: string, raw: boolean) => void;
  cmdVerifyKeyLinks: (cwd: string, planFilePath: string, raw: boolean) => void;
};

const {
  cmdPhasesList,
  cmdPhaseAdd,
  cmdPhaseInsert,
  cmdPhaseRemove,
  cmdPhaseComplete,
  cmdMilestoneComplete,
  cmdValidateConsistency,
  cmdVersionBump,
} = require('../lib/phase.ts') as {
  cmdPhasesList: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdPhaseAdd: (cwd: string, name: string, raw: boolean, context?: string) => void;
  cmdPhaseInsert: (cwd: string, phase: string, name: string, raw: boolean) => void;
  cmdPhaseRemove: (cwd: string, phase: string, options: Record<string, boolean>, raw: boolean) => void;
  cmdPhaseComplete: (cwd: string, phase: string, raw: boolean, options?: Record<string, boolean>) => void;
  cmdMilestoneComplete: (cwd: string, version: string | null, options: Record<string, string | boolean | null>, raw: boolean) => void;
  cmdValidateConsistency: (cwd: string, raw: boolean) => void;
  cmdVersionBump: (cwd: string, version: string, raw: boolean) => void;
};

const { cmdTracker } = require('../lib/tracker.ts') as {
  cmdTracker: (cwd: string, sub: string, args: string[], raw: boolean) => Promise<void>;
};

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
} = require('../lib/worktree.ts') as {
  cmdWorktreeCreate: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdWorktreeRemove: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdWorktreeList: (cwd: string, raw: boolean) => void;
  cmdWorktreeRemoveStale: (cwd: string, raw: boolean) => void;
  cmdWorktreePushAndPR: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdWorktreeEnsureMilestoneBranch: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdWorktreeMerge: (cwd: string, options: Record<string, string | boolean | null>, raw: boolean) => void;
  cmdWorktreeHookCreate: (cwd: string, wtPath: string, wtBranch: string, raw: boolean) => void;
  cmdWorktreeHookRemove: (cwd: string, wtPath: string, wtBranch: string, raw: boolean) => void;
};

const { cmdPhaseAnalyzeDeps } = require('../lib/deps.ts') as {
  cmdPhaseAnalyzeDeps: (cwd: string, raw: boolean) => void;
};

const { cmdAutopilot, cmdInitAutopilot } = require('../lib/autopilot.ts') as {
  cmdAutopilot: (cwd: string, args: string[], raw: boolean) => Promise<void>;
  cmdInitAutopilot: (cwd: string, raw: boolean) => void;
};

const {
  cmdEvolve,
  cmdEvolveDiscover,
  cmdEvolveState,
  cmdEvolveAdvance,
  cmdEvolveReset,
  cmdInitEvolve,
} = require('../lib/evolve/index.ts') as {
  cmdEvolve: (cwd: string, args: string[], raw: boolean) => Promise<void>;
  cmdEvolveDiscover: (cwd: string, args: string[], raw: boolean) => Promise<void>;
  cmdEvolveState: (cwd: string, args: string[], raw: boolean) => void;
  cmdEvolveAdvance: (cwd: string, args: string[], raw: boolean) => void;
  cmdEvolveReset: (cwd: string, args: string[], raw: boolean) => void;
  cmdInitEvolve: (cwd: string, raw: boolean) => void;
};

const { cmdInitExecuteParallel, cmdParallelProgress } = require('../lib/parallel.ts') as {
  cmdInitExecuteParallel: (cwd: string, phases: string[], includes: Set<string>, raw: boolean) => void;
  cmdParallelProgress: (args: string[], raw: boolean) => void;
};

const { splitMarkdown, isIndexFile, estimateTokens } = require('../lib/markdown-split.ts') as {
  splitMarkdown: (content: string, options?: { threshold?: number; basename?: string }) => {
    split_performed: boolean;
    reason?: string;
    index_content?: string;
    parts?: Array<{ filename: string; content: string }>;
  };
  isIndexFile: (content: unknown) => boolean;
  estimateTokens: (content: string) => number;
};

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
} = require('../lib/context/index.ts') as {
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
  cmdInitResearchWorkflow: (cwd: string, workflow: string, topic: string, includes: Set<string>, raw: boolean) => void;
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
};

const {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
  cmdListTodos,
  cmdTodoComplete,
  cmdVerifyPathExists,
  cmdConfigEnsureSection,
  cmdConfigSet,
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
} = require('../lib/commands/index.ts') as {
  cmdGenerateSlug: (text: string, raw: boolean) => void;
  cmdCurrentTimestamp: (format: string, raw: boolean) => void;
  cmdListTodos: (cwd: string, area: string | null, raw: boolean) => void;
  cmdTodoComplete: (cwd: string, filename: string, raw: boolean, dryRun?: boolean) => void;
  cmdVerifyPathExists: (cwd: string, targetPath: string, raw: boolean, dryRun?: boolean) => void;
  cmdConfigEnsureSection: (cwd: string, raw: boolean, dryRun?: boolean) => void;
  cmdConfigSet: (cwd: string, key: string, value: string, raw: boolean, dryRun?: boolean) => void;
  cmdHistoryDigest: (cwd: string, raw: boolean) => void;
  cmdResolveModel: (cwd: string, agentType: string, raw: boolean) => void;
  cmdFindPhase: (cwd: string, phase: string, raw: boolean) => void;
  cmdCommit: (cwd: string, message: string, files: string[], raw: boolean, amend?: boolean) => void;
  cmdPhasePlanIndex: (cwd: string, phase: string, raw: boolean) => void;
  cmdSummaryExtract: (cwd: string, summaryPath: string, fields: string[] | null, raw: boolean) => void;
  cmdProgressRender: (cwd: string, format: string, raw: boolean) => void;
  cmdDashboard: (cwd: string, raw: boolean, options?: Record<string, unknown>) => void;
  cmdPhaseDetail: (cwd: string, phase: string, raw: boolean) => void;
  cmdHealth: (cwd: string, raw: boolean) => void;
  cmdDetectBackend: (cwd: string, raw: boolean) => void;
  cmdLongTermRoadmap: (cwd: string, subcommand: string, args: string[], raw: boolean) => void;
  cmdQualityAnalysis: (cwd: string, args: string[], raw: boolean) => void;
  cmdSetup: (cwd: string, raw: boolean) => void;
  cmdRequirementGet: (cwd: string, reqId: string, raw: boolean) => void;
  cmdRequirementList: (cwd: string, options: Record<string, string | boolean | null>, raw: boolean) => void;
  cmdRequirementTraceability: (cwd: string, options: Record<string, string | null>, raw: boolean) => void;
  cmdRequirementUpdateStatus: (cwd: string, reqId: string, status: string, raw: boolean, dryRun?: boolean) => void;
  cmdSearch: (cwd: string, query: string, raw: boolean) => void;
  cmdMigrateDirs: (cwd: string, raw: boolean, dryRun?: boolean) => void;
  cmdCoverageReport: (cwd: string, options: Record<string, unknown>, raw: boolean) => void;
  cmdHealthCheck: (cwd: string, options: Record<string, unknown>, raw: boolean) => void;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract --flag value from args, returns value or fallback */
function flag(args: string[], name: string, fallback?: string): string | undefined {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : fallback;
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
  { command: 'current-timestamp', handler: (args, _cwd, raw) => cmdCurrentTimestamp(args[1] || 'full', raw) },
  { command: 'list-todos', handler: (args, cwd, raw) => cmdListTodos(cwd, args[1], raw) },
  { command: 'verify-path-exists', handler: (args, cwd, raw) => cmdVerifyPathExists(cwd, args[1], raw, args.includes('--dry-run')) },
  { command: 'config-ensure-section', handler: (args, cwd, raw) => cmdConfigEnsureSection(cwd, raw, args.includes('--dry-run')) },
  { command: 'config-set', handler: (args, cwd, raw) => cmdConfigSet(cwd, args[1], args[2], raw, args.includes('--dry-run')) },
  { command: 'history-digest', handler: (_args, cwd, raw) => cmdHistoryDigest(cwd, raw) },
  { command: 'progress', handler: (args, cwd, raw) => cmdProgressRender(cwd, args[1] || 'json', raw) },
  { command: 'migrate-dirs', handler: (args, cwd, raw) => cmdMigrateDirs(cwd, raw, args.includes('--dry-run')) },
  { command: 'dashboard', handler: (_args, cwd, raw) => cmdDashboard(cwd, raw) },
  { command: 'health', handler: (_args, cwd, raw) => cmdHealth(cwd, raw) },
  { command: 'detect-backend', handler: (_args, cwd, raw) => cmdDetectBackend(cwd, raw) },
  { command: 'quality-analysis', handler: (args, cwd, raw) => cmdQualityAnalysis(cwd, args.slice(1), raw) },
  { command: 'setup', handler: (_args, cwd, raw) => cmdSetup(cwd, raw) },
  { command: 'parallel-progress', handler: (args, _cwd, raw) => cmdParallelProgress(args.slice(1), raw) },
  { command: 'resolve-model', handler: (args, cwd, raw) => cmdResolveModel(cwd, args[1], raw) },
  { command: 'find-phase', handler: (args, cwd, raw) => cmdFindPhase(cwd, args[1], raw) },
  { command: 'coverage-report', handler: (args, cwd, raw) => cmdCoverageReport(cwd, { threshold: parseInt(flag(args, '--threshold', '85') as string, 10) }, raw) },
  { command: 'health-check', handler: (args, cwd, raw) => cmdHealthCheck(cwd, { fix: args.includes('--fix') }, raw) },
  { command: 'phase-detail', handler: (args, cwd, raw) => { validatePhaseArg(args[1]); return cmdPhaseDetail(cwd, args[1], raw); } },
  { command: 'phase-plan-index', handler: (args, cwd, raw) => { validatePhaseArg(args[1]); return cmdPhasePlanIndex(cwd, args[1], raw); } },
  { command: 'search', handler: (args, cwd, raw) => { if (!args[1]) error('Search query is required'); return cmdSearch(cwd, args[1], raw); } },
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
];
const PHASES_SUBS: readonly string[] = ['list'];
const ROADMAP_SUBS: readonly string[] = ['get-phase', 'analyze'];
const PHASE_SUBS: readonly string[] = ['next-decimal', 'add', 'insert', 'remove', 'complete', 'analyze-deps'];
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
const WORKTREE_SUBS: readonly string[] = ['create', 'remove', 'list', 'push-pr', 'ensure-milestone-branch', 'merge', 'hook'];
const INIT_WORKFLOWS: readonly string[] = [
  'execute-phase',
  'execute-parallel',
  'plan-phase',
  'new-project',
  'new-milestone',
  'quick',
  'resume',
  'verify-work',
  'phase-op',
  'todos',
  'milestone-op',
  'plan-milestone-gaps',
  'map-codebase',
  'progress',
  'survey',
  'deep-dive',
  'feasibility',
  'eval-plan',
  'eval-report',
  'assess-baseline',
  'product-plan',
  'iterate',
  'autopilot',
  'evolve',
  'debug',
  'integration-check',
  'migrate',
  'plan-check',
  'phase-research',
  'code-review',
  'project-researcher',
  'research-synthesizer',
  'roadmapper',
  'verifier',
];

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);
  const command = args[0];
  const cwd = process.cwd();

  if (!command) {
    error(
      'Usage: grd-tools <command> [args] [--raw]\nCommands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, tracker, init, dashboard, phase-detail, health, detect-backend, long-term-roadmap, quality-analysis, setup, search, requirement, worktree, migrate-dirs, coverage-report, health-check'
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
async function routeCommand(command: string, args: string[], cwd: string, raw: boolean): Promise<void> {
  // Descriptor-based dispatch: check ROUTE_DESCRIPTORS before falling through to switch
  const descriptor = ROUTE_DESCRIPTORS.find(d => d.command === command);
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
        filesIndex !== -1 ? args.slice(filesIndex + 1).filter((a: string) => !a.startsWith('--')) : [],
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
        cmdFrontmatterSet(
          cwd,
          file,
          flag(args, '--field') ?? '',
          flag(args, '--value') ?? '',
          raw
        );
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
    case 'history-digest':
      cmdHistoryDigest(cwd, raw);
      break;
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
      }
      else if (sub === 'insert') {
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
        cmdPhaseComplete(cwd, args[2], raw, { dryRun: args.includes('--dry-run') });
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
        const version: string | null = args.slice(2).find((a: string) => !a.startsWith('--')) || null;
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
        case 'evolve':
          cmdInitEvolve(cwd, raw);
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
      const snapshotOptions: Record<string, string | undefined> = sinceIdx !== -1 ? { since: args[sinceIdx + 1] } : {};
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
    case 'autopilot':
      await cmdAutopilot(cwd, args.slice(1), raw);
      break;
    case 'worktree-hook-create':
      cmdWorktreeHookCreate(cwd, args[1], args[2], raw);
      break;
    case 'worktree-hook-remove':
      cmdWorktreeHookRemove(cwd, args[1], args[2], raw);
      break;
    case 'coverage-report':
      cmdCoverageReport(cwd, { threshold: parseInt(flag(args, '--threshold', '85') as string, 10) }, raw);
      break;
    case 'health-check':
      cmdHealthCheck(cwd, { fix: args.includes('--fix') }, raw);
      break;
    case 'markdown-split': {
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
    default: {
      const TOP_LEVEL_COMMANDS: readonly string[] = [
        'state', 'resolve-model', 'find-phase', 'commit', 'verify-summary',
        'template', 'frontmatter', 'verify', 'generate-slug', 'current-timestamp',
        'list-todos', 'verify-path-exists', 'config-ensure-section', 'config-set',
        'history-digest', 'phases', 'roadmap', 'phase', 'milestone', 'version',
        'validate', 'progress', 'todo', 'scaffold', 'migrate-dirs', 'init',
        'phase-plan-index', 'state-snapshot', 'summary-extract', 'tracker',
        'dashboard', 'phase-detail', 'health', 'detect-backend', 'long-term-roadmap',
        'quality-analysis', 'setup', 'search', 'requirement', 'worktree',
        'evolve', 'autopilot', 'worktree-hook-create', 'worktree-hook-remove',
        'coverage-report', 'health-check', 'markdown-split', 'parallel-progress',
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
