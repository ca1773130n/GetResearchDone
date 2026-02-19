#!/usr/bin/env node
/**
 * GRD Tools — Thin CLI router. All business logic lives in lib/ modules.
 * Usage: node grd-tools.js <command> [args] [--raw]
 */
const {
  parseIncludeFlag,
  error,
  validatePhaseArg,
  validateFileArg,
  validateSubcommand,
  validateGitRef,
} = require('../lib/utils');
const {
  cmdFrontmatterGet,
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
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
} = require('../lib/state');
const { cmdRoadmapGetPhase, cmdPhaseNextDecimal, cmdRoadmapAnalyze } = require('../lib/roadmap');
const { cmdTemplateSelect, cmdTemplateFill, cmdScaffold } = require('../lib/scaffold');
const {
  cmdVerifySummary,
  cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness,
  cmdVerifyReferences,
  cmdVerifyCommits,
  cmdVerifyArtifacts,
  cmdVerifyKeyLinks,
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
} = require('../lib/phase');
const { cmdTracker } = require('../lib/tracker');
const {
  cmdWorktreeCreate,
  cmdWorktreeRemove,
  cmdWorktreeList,
  cmdWorktreeRemoveStale,
  cmdWorktreePushAndPR,
} = require('../lib/worktree');
const { cmdPhaseAnalyzeDeps } = require('../lib/deps');
const { cmdInitExecuteParallel } = require('../lib/parallel');
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
} = require('../lib/context');
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
} = require('../lib/commands');

/** Extract --flag value from args, returns value or fallback */
function flag(args, name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : fallback;
}

function main() {
  const args = process.argv.slice(2);
  const rawIndex = args.indexOf('--raw');
  const raw = rawIndex !== -1;
  if (rawIndex !== -1) args.splice(rawIndex, 1);
  const command = args[0];
  const cwd = process.cwd();

  if (!command) {
    error(
      'Usage: grd-tools <command> [args] [--raw]\nCommands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, tracker, init, dashboard, phase-detail, health, detect-backend, long-term-roadmap, quality-analysis, setup, search, requirement, worktree'
    );
  }

  try {
    routeCommand(command, args, cwd, raw);
  } catch (e) {
    if (e && e.message) error(e.message);
    else throw e;
  }
}

/** Validate and route CLI commands */
function routeCommand(command, args, cwd, raw) {
  const STATE_SUBS = [
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
  const TEMPLATE_SUBS = ['select', 'fill'];
  const FRONTMATTER_SUBS = ['get', 'set', 'merge', 'validate'];
  const VERIFY_SUBS = [
    'plan-structure',
    'phase-completeness',
    'references',
    'commits',
    'artifacts',
    'key-links',
  ];
  const PHASES_SUBS = ['list'];
  const ROADMAP_SUBS = ['get-phase', 'analyze'];
  const PHASE_SUBS = ['next-decimal', 'add', 'insert', 'remove', 'complete', 'analyze-deps'];
  const MILESTONE_SUBS = ['complete'];
  const VALIDATE_SUBS = ['consistency'];
  const TODO_SUBS = ['complete'];
  const TRACKER_SUBS = [
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
  const REQUIREMENT_SUBS = ['get', 'list', 'traceability', 'update-status'];
  const WORKTREE_SUBS = ['create', 'remove', 'list', 'push-pr'];
  const INIT_WORKFLOWS = [
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
  ];

  switch (command) {
    case 'state': {
      const sub = args[1];
      // No subcommand defaults to load — only validate if provided
      if (sub) validateSubcommand(sub, STATE_SUBS, 'state');
      if (sub === 'update') cmdStateUpdate(cwd, args[2], args[3]);
      else if (sub === 'get') cmdStateGet(cwd, args[2], raw);
      else if (sub === 'patch') {
        const patches = {};
        for (let i = 2; i < args.length; i += 2) {
          const k = args[i].replace(/^--/, '');
          if (k && args[i + 1] !== undefined) patches[k] = args[i + 1];
        }
        cmdStatePatch(cwd, patches, raw);
      } else if (sub === 'advance-plan') cmdStateAdvancePlan(cwd, raw);
      else if (sub === 'record-metric') {
        cmdStateRecordMetric(
          cwd,
          {
            phase: flag(args, '--phase', null),
            plan: flag(args, '--plan', null),
            duration: flag(args, '--duration', null),
            tasks: flag(args, '--tasks', null),
            files: flag(args, '--files', null),
          },
          raw
        );
      } else if (sub === 'update-progress') cmdStateUpdateProgress(cwd, raw);
      else if (sub === 'add-decision') {
        cmdStateAddDecision(
          cwd,
          {
            phase: flag(args, '--phase', null),
            summary: flag(args, '--summary', null),
            rationale: flag(args, '--rationale', ''),
          },
          raw
        );
      } else if (sub === 'add-blocker') cmdStateAddBlocker(cwd, flag(args, '--text', null), raw);
      else if (sub === 'resolve-blocker')
        cmdStateResolveBlocker(cwd, flag(args, '--text', null), raw);
      else if (sub === 'record-session') {
        cmdStateRecordSession(
          cwd,
          {
            stopped_at: flag(args, '--stopped-at', null),
            resume_file: flag(args, '--resume-file', 'None'),
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
      const filesIndex = args.indexOf('--files');
      cmdCommit(
        cwd,
        args[1],
        filesIndex !== -1 ? args.slice(filesIndex + 1).filter((a) => !a.startsWith('--')) : [],
        raw,
        args.includes('--amend')
      );
      break;
    }
    case 'verify-summary': {
      validateFileArg(args[1], cwd);
      const cc = args.indexOf('--check-count');
      cmdVerifySummary(cwd, args[1], cc !== -1 ? parseInt(args[cc + 1], 10) : 2, raw);
      break;
    }
    case 'template': {
      const sub = args[1];
      validateSubcommand(sub, TEMPLATE_SUBS, 'template');
      if (sub === 'select') cmdTemplateSelect(cwd, args[2], raw);
      else if (sub === 'fill') {
        cmdTemplateFill(
          cwd,
          args[2],
          {
            phase: flag(args, '--phase', null),
            plan: flag(args, '--plan', null),
            name: flag(args, '--name', null),
            type: flag(args, '--type', 'execute'),
            wave: flag(args, '--wave', '1'),
            fields: flag(args, '--fields', null) ? JSON.parse(flag(args, '--fields', '{}')) : {},
          },
          raw
        );
      }
      break;
    }
    case 'frontmatter': {
      const sub = args[1];
      validateSubcommand(sub, FRONTMATTER_SUBS, 'frontmatter');
      const file = args[2];
      validateFileArg(file, cwd);
      if (sub === 'get') cmdFrontmatterGet(cwd, file, flag(args, '--field', null), raw);
      else if (sub === 'set')
        cmdFrontmatterSet(
          cwd,
          file,
          flag(args, '--field', null),
          flag(args, '--value', undefined),
          raw
        );
      else if (sub === 'merge') cmdFrontmatterMerge(cwd, file, flag(args, '--data', null), raw);
      else if (sub === 'validate')
        cmdFrontmatterValidate(cwd, file, flag(args, '--schema', null), raw);
      break;
    }
    case 'verify': {
      const sub = args[1];
      validateSubcommand(sub, VERIFY_SUBS, 'verify');
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
      cmdVerifyPathExists(cwd, args[1], raw);
      break;
    case 'config-ensure-section':
      cmdConfigEnsureSection(cwd, raw);
      break;
    case 'config-set':
      cmdConfigSet(cwd, args[1], args[2], raw);
      break;
    case 'history-digest':
      cmdHistoryDigest(cwd, raw);
      break;
    case 'phases': {
      const sub = args[1];
      validateSubcommand(sub, PHASES_SUBS, 'phases');
      cmdPhasesList(
        cwd,
        { type: flag(args, '--type', null), phase: flag(args, '--phase', null) },
        raw
      );
      break;
    }
    case 'roadmap': {
      const sub = args[1];
      validateSubcommand(sub, ROADMAP_SUBS, 'roadmap');
      if (sub === 'get-phase') {
        validatePhaseArg(args[2]);
        cmdRoadmapGetPhase(cwd, args[2], raw);
      } else if (sub === 'analyze') cmdRoadmapAnalyze(cwd, raw);
      break;
    }
    case 'phase': {
      const sub = args[1];
      validateSubcommand(sub, PHASE_SUBS, 'phase');
      if (sub === 'next-decimal') {
        validatePhaseArg(args[2]);
        cmdPhaseNextDecimal(cwd, args[2], raw);
      } else if (sub === 'add') cmdPhaseAdd(cwd, args.slice(2).join(' '), raw);
      else if (sub === 'insert') {
        validatePhaseArg(args[2]);
        cmdPhaseInsert(cwd, args[2], args.slice(3).join(' '), raw);
      } else if (sub === 'remove') {
        validatePhaseArg(args[2]);
        cmdPhaseRemove(cwd, args[2], { force: args.includes('--force') }, raw);
      } else if (sub === 'complete') {
        validatePhaseArg(args[2]);
        cmdPhaseComplete(cwd, args[2], raw);
      } else if (sub === 'analyze-deps') {
        cmdPhaseAnalyzeDeps(cwd, raw);
      }
      break;
    }
    case 'milestone': {
      const sub = args[1];
      validateSubcommand(sub, MILESTONE_SUBS, 'milestone');
      if (sub === 'complete') {
        const ni = args.indexOf('--name');
        cmdMilestoneComplete(
          cwd,
          args[2],
          { name: ni !== -1 ? args.slice(ni + 1).join(' ') : null },
          raw
        );
      }
      break;
    }
    case 'version': {
      const VERSION_SUBS = ['bump'];
      validateSubcommand(args[1], VERSION_SUBS, 'version');
      if (args[1] === 'bump') {
        if (!args[2]) error('version string required (e.g., v1.0.0)');
        cmdVersionBump(cwd, args[2], raw);
      }
      break;
    }
    case 'validate': {
      validateSubcommand(args[1], VALIDATE_SUBS, 'validate');
      cmdValidateConsistency(cwd, raw);
      break;
    }
    case 'progress':
      cmdProgressRender(cwd, args[1] || 'json', raw);
      break;
    case 'todo': {
      validateSubcommand(args[1], TODO_SUBS, 'todo');
      cmdTodoComplete(cwd, args[2], raw);
      break;
    }
    case 'scaffold': {
      const pi = args.indexOf('--phase'),
        ni = args.indexOf('--name');
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
    case 'init': {
      const wf = args[1],
        includes = parseIncludeFlag(args);
      validateSubcommand(wf, INIT_WORKFLOWS, 'init');
      switch (wf) {
        case 'execute-phase':
          validatePhaseArg(args[2]);
          cmdInitExecutePhase(cwd, args[2], includes, raw);
          break;
        case 'execute-parallel': {
          const phases = args.slice(2).filter(a => !a.startsWith('--'));
          if (phases.length === 0) error('At least one phase number required for init execute-parallel');
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
          cmdInitProgress(cwd, includes, raw);
          break;
        case 'survey':
        case 'deep-dive':
        case 'feasibility':
        case 'eval-plan':
        case 'eval-report':
        case 'assess-baseline':
        case 'product-plan':
        case 'iterate':
          cmdInitResearchWorkflow(cwd, wf, args.slice(2).join(' '), includes, raw);
          break;
      }
      break;
    }
    case 'phase-plan-index':
      validatePhaseArg(args[1]);
      cmdPhasePlanIndex(cwd, args[1], raw);
      break;
    case 'state-snapshot':
      cmdStateSnapshot(cwd, raw);
      break;
    case 'summary-extract': {
      validateFileArg(args[1], cwd);
      const fi = args.indexOf('--fields');
      cmdSummaryExtract(cwd, args[1], fi !== -1 ? args[fi + 1].split(',') : null, raw);
      break;
    }
    case 'tracker': {
      validateSubcommand(args[1], TRACKER_SUBS, 'tracker');
      cmdTracker(cwd, args[1], args.slice(2), raw);
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
      const sub = args[1];
      if (!sub)
        error(
          'subcommand required: list, add, remove, update, refine, link, unlink, display, init, history, parse, validate'
        );
      const subArgs = args.slice(2);
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
      const sub = args[1];
      validateSubcommand(sub, REQUIREMENT_SUBS, 'requirement');
      if (sub === 'get') {
        if (!args[2]) error('REQ-ID required');
        cmdRequirementGet(cwd, args[2], raw);
      } else if (sub === 'list') {
        cmdRequirementList(
          cwd,
          {
            phase: flag(args, '--phase', null),
            priority: flag(args, '--priority', null),
            status: flag(args, '--status', null),
            category: flag(args, '--category', null),
            all: args.includes('--all'),
          },
          raw
        );
      } else if (sub === 'traceability') {
        cmdRequirementTraceability(
          cwd,
          {
            phase: flag(args, '--phase', null),
          },
          raw
        );
      } else if (sub === 'update-status') {
        if (!args[2]) error('REQ-ID required');
        if (!args[3]) error('Status required (Pending, In Progress, Done, Deferred)');
        // Handle multi-word status "In Progress" — args[3] might be "In" and args[4] "Progress"
        let status = args[3];
        if (args[3] === 'In' && args[4] === 'Progress') {
          status = 'In Progress';
        }
        cmdRequirementUpdateStatus(cwd, args[2], status, raw);
      }
      break;
    }
    case 'worktree': {
      const sub = args[1];
      validateSubcommand(sub, WORKTREE_SUBS, 'worktree');
      if (sub === 'create') {
        cmdWorktreeCreate(cwd, {
          phase: flag(args, '--phase', null),
          milestone: flag(args, '--milestone', null),
          slug: flag(args, '--slug', null),
        }, raw);
      } else if (sub === 'remove') {
        if (args.includes('--stale')) {
          cmdWorktreeRemoveStale(cwd, raw);
        } else {
          cmdWorktreeRemove(cwd, {
            phase: flag(args, '--phase', null),
            path: flag(args, '--path', null),
            milestone: flag(args, '--milestone', null),
          }, raw);
        }
      } else if (sub === 'list') {
        cmdWorktreeList(cwd, raw);
      } else if (sub === 'push-pr') {
        cmdWorktreePushAndPR(cwd, {
          phase: flag(args, '--phase', null),
          milestone: flag(args, '--milestone', null),
          title: flag(args, '--title', null),
          body: flag(args, '--body', null),
          base: flag(args, '--base', null),
        }, raw);
      }
      break;
    }
    default:
      error(`Unknown command: ${command}`);
  }
}

main();
