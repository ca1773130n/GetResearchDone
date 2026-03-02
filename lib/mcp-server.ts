/**
 * GRD MCP Server -- Model Context Protocol server exposing all GRD CLI commands as MCP tools.
 *
 * Implements JSON-RPC 2.0 over stdio transport. Zero external runtime dependencies (Node.js built-ins only).
 * All tool definitions are auto-generated from a declarative COMMAND_DESCRIPTORS table.
 *
 * Created in Phase 16 Plan 01 (MCP Server).
 * Migrated to TypeScript in Phase 63 Plan 03.
 */

'use strict';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Parameter descriptor for an MCP tool */
interface ParamDescriptor {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
}

/** Command descriptor mapping an MCP tool to its handler */
interface CommandDescriptor {
  name: string;
  description: string;
  params: ParamDescriptor[];
  execute: (cwd: string, args: Record<string, unknown>) => void | unknown;
}

/** Result from captureExecution/captureExecutionAsync */
interface CaptureResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** MCP tool definition with JSON Schema */
interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; items?: { type: string } }>;
    required?: string[];
  };
}

/** JSON-RPC 2.0 message */
interface JsonRpcMessage {
  jsonrpc?: string;
  method?: string;
  id?: number | string | null;
  params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 response */
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** MCP exit error thrown by intercepted process.exit */
interface McpExitError extends Error {
  __MCP_EXIT__: true;
  exitCode: number;
}

// ─── Imports from lib/ modules ──────────────────────────────────────────────

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
} = require('./state') as {
  cmdStateLoad: (cwd: string, raw: boolean) => void;
  cmdStateGet: (cwd: string, section: string | undefined, raw: boolean) => void;
  cmdStatePatch: (cwd: string, patches: Record<string, unknown>, raw: boolean) => void;
  cmdStateUpdate: (cwd: string, field: string, value: string) => void;
  cmdStateAdvancePlan: (cwd: string, raw: boolean) => void;
  cmdStateRecordMetric: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdStateUpdateProgress: (cwd: string, raw: boolean) => void;
  cmdStateAddDecision: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdStateAddBlocker: (cwd: string, text: string, raw: boolean) => void;
  cmdStateResolveBlocker: (cwd: string, text: string, raw: boolean) => void;
  cmdStateRecordSession: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdStateSnapshot: (cwd: string, raw: boolean) => void;
};

const {
  cmdFrontmatterGet,
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
} = require('./frontmatter') as {
  cmdFrontmatterGet: (cwd: string, file: string, field: string | null, raw: boolean) => void;
  cmdFrontmatterSet: (cwd: string, file: string, field: string, value: string, raw: boolean) => void;
  cmdFrontmatterMerge: (cwd: string, file: string, data: string, raw: boolean) => void;
  cmdFrontmatterValidate: (cwd: string, file: string, schema: string | null, raw: boolean) => void;
};

const { cmdRoadmapGetPhase, cmdPhaseNextDecimal, cmdRoadmapAnalyze } = require('./roadmap') as {
  cmdRoadmapGetPhase: (cwd: string, phase: string, raw: boolean) => void;
  cmdPhaseNextDecimal: (cwd: string, phase: string, raw: boolean) => void;
  cmdRoadmapAnalyze: (cwd: string, raw: boolean) => void;
};
const { cmdPhaseAnalyzeDeps } = require('./deps') as {
  cmdPhaseAnalyzeDeps: (cwd: string, raw: boolean) => void;
};
const { cmdAutopilot, cmdInitAutopilot, cmdMultiMilestoneAutopilot, cmdInitMultiMilestoneAutopilot } = require('./autopilot') as {
  cmdAutopilot: (cwd: string, args: string[], raw: boolean) => void;
  cmdInitAutopilot: (cwd: string, raw: boolean) => void;
  cmdMultiMilestoneAutopilot: (cwd: string, args: string[], raw: boolean) => void;
  cmdInitMultiMilestoneAutopilot: (cwd: string, raw: boolean) => void;
};
const { cmdAutoplan, cmdInitAutoplan } = require('./autoplan') as {
  cmdAutoplan: (cwd: string, args: string[], raw: boolean) => Promise<void>;
  cmdInitAutoplan: (cwd: string, raw: boolean) => void;
};
const {
  cmdEvolve,
  cmdEvolveDiscover,
  cmdEvolveState,
  cmdEvolveAdvance,
  cmdEvolveReset,
  cmdInitEvolve,
} = require('./evolve') as {
  cmdEvolve: (cwd: string, args: string[], raw: boolean) => unknown;
  cmdEvolveDiscover: (cwd: string, args: string[], raw: boolean) => Promise<unknown>;
  cmdEvolveState: (cwd: string, args: string[], raw: boolean) => void;
  cmdEvolveAdvance: (cwd: string, args: string[], raw: boolean) => void;
  cmdEvolveReset: (cwd: string, args: string[], raw: boolean) => void;
  cmdInitEvolve: (cwd: string, raw: boolean) => void;
};
const { splitMarkdown, isIndexFile, estimateTokens } = require('./markdown-split') as {
  splitMarkdown: (content: string, opts: { threshold?: number; basename: string }) => {
    split_performed: boolean;
    reason?: string;
    index_content?: string;
    parts?: Array<{ filename: string; content: string }>;
  };
  isIndexFile: (content: string) => boolean;
  estimateTokens: (content: string) => number;
};
const { cmdInitExecuteParallel } = require('./parallel') as {
  cmdInitExecuteParallel: (cwd: string, phases: string[], includes: Set<string>, raw: boolean) => void;
};
const { cmdTemplateSelect, cmdTemplateFill, cmdScaffold } = require('./scaffold') as {
  cmdTemplateSelect: (cwd: string, type: string, raw: boolean) => void;
  cmdTemplateFill: (cwd: string, template: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdScaffold: (cwd: string, type: string, opts: Record<string, unknown>, raw: boolean) => void;
};

const {
  cmdVerifySummary,
  cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness,
  cmdVerifyReferences,
  cmdVerifyCommits,
  cmdVerifyArtifacts,
  cmdVerifyKeyLinks,
} = require('./verify') as {
  cmdVerifySummary: (cwd: string, file: string, checkCount: number, raw: boolean) => void;
  cmdVerifyPlanStructure: (cwd: string, file: string, raw: boolean) => void;
  cmdVerifyPhaseCompleteness: (cwd: string, phase: string, raw: boolean) => void;
  cmdVerifyReferences: (cwd: string, file: string, raw: boolean) => void;
  cmdVerifyCommits: (cwd: string, hashes: string[], raw: boolean) => void;
  cmdVerifyArtifacts: (cwd: string, file: string, raw: boolean) => void;
  cmdVerifyKeyLinks: (cwd: string, file: string, raw: boolean) => void;
};

const {
  cmdPhasesList,
  cmdPhaseAdd,
  cmdPhaseInsert,
  cmdPhaseRemove,
  cmdPhaseComplete,
  cmdMilestoneComplete,
  cmdValidateConsistency,
} = require('./phase') as {
  cmdPhasesList: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdPhaseAdd: (cwd: string, description: string, raw: boolean, context?: string) => void;
  cmdPhaseInsert: (cwd: string, phase: string, description: string, raw: boolean) => void;
  cmdPhaseRemove: (cwd: string, phase: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdPhaseComplete: (cwd: string, phase: string, raw: boolean) => void;
  cmdMilestoneComplete: (cwd: string, version: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdValidateConsistency: (cwd: string, raw: boolean) => void;
};

const { cmdTracker } = require('./tracker') as {
  cmdTracker: (cwd: string, subcommand: string, args: string[] | unknown[], raw: boolean) => void;
};

const {
  cmdWorktreeCreate,
  cmdWorktreeRemove,
  cmdWorktreeList,
  cmdWorktreeRemoveStale,
  cmdWorktreePushAndPR,
} = require('./worktree') as {
  cmdWorktreeCreate: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdWorktreeRemove: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdWorktreeList: (cwd: string, raw: boolean) => void;
  cmdWorktreeRemoveStale: (cwd: string, raw: boolean) => void;
  cmdWorktreePushAndPR: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
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
} = require('./context') as {
  cmdInitExecutePhase: (cwd: string, phase: string, includes: Set<string>, raw: boolean) => void;
  cmdInitPlanPhase: (cwd: string, phase: string, includes: Set<string>, raw: boolean) => void;
  cmdInitNewProject: (cwd: string, raw: boolean) => void;
  cmdInitNewMilestone: (cwd: string, raw: boolean) => void;
  cmdInitQuick: (cwd: string, description: string, raw: boolean) => void;
  cmdInitResume: (cwd: string, raw: boolean) => void;
  cmdInitVerifyWork: (cwd: string, phase: string, raw: boolean) => void;
  cmdInitPhaseOp: (cwd: string, phase: string, raw: boolean) => void;
  cmdInitTodos: (cwd: string, area: string | undefined, raw: boolean) => void;
  cmdInitMilestoneOp: (cwd: string, raw: boolean) => void;
  cmdInitMapCodebase: (cwd: string, raw: boolean) => void;
  cmdInitProgress: (cwd: string, includes: Set<string>, raw: boolean) => void;
  cmdInitResearchWorkflow: (cwd: string, workflow: string, topic: string, includes: Set<string>, raw: boolean) => void;
  cmdInitPlanMilestoneGaps: (cwd: string, raw: boolean) => void;
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
  cmdRequirementGet,
  cmdRequirementList,
  cmdRequirementTraceability,
  cmdRequirementUpdateStatus,
  cmdSearch,
  cmdCoverageReport,
  cmdHealthCheck,
} = require('./commands') as {
  cmdGenerateSlug: (text: string, raw: boolean) => void;
  cmdCurrentTimestamp: (format: string, raw: boolean) => void;
  cmdListTodos: (cwd: string, area: string | undefined, raw: boolean) => void;
  cmdTodoComplete: (cwd: string, filename: string, raw: boolean) => void;
  cmdVerifyPathExists: (cwd: string, targetPath: string, raw: boolean) => void;
  cmdConfigEnsureSection: (cwd: string, raw: boolean) => void;
  cmdConfigSet: (cwd: string, key: string, value: string, raw: boolean) => void;
  cmdHistoryDigest: (cwd: string, raw: boolean) => void;
  cmdResolveModel: (cwd: string, agentType: string, raw: boolean) => void;
  cmdFindPhase: (cwd: string, phase: string, raw: boolean) => void;
  cmdCommit: (cwd: string, message: string, files: string[], raw: boolean, amend: boolean) => void;
  cmdPhasePlanIndex: (cwd: string, phase: string, raw: boolean) => void;
  cmdSummaryExtract: (cwd: string, file: string, fields: string[] | null, raw: boolean) => void;
  cmdProgressRender: (cwd: string, format: string, raw: boolean) => void;
  cmdDashboard: (cwd: string, raw: boolean) => void;
  cmdPhaseDetail: (cwd: string, phase: string, raw: boolean) => void;
  cmdHealth: (cwd: string, raw: boolean) => void;
  cmdDetectBackend: (cwd: string, raw: boolean) => void;
  cmdLongTermRoadmap: (cwd: string, subcommand: string, args: string[], raw: boolean) => void;
  cmdQualityAnalysis: (cwd: string, args: string[], raw: boolean) => void;
  cmdRequirementGet: (cwd: string, reqId: string, raw: boolean) => void;
  cmdRequirementList: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdRequirementTraceability: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdRequirementUpdateStatus: (cwd: string, reqId: string, status: string, raw: boolean) => void;
  cmdSearch: (cwd: string, query: string, raw: boolean) => void;
  cmdCoverageReport: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
  cmdHealthCheck: (cwd: string, opts: Record<string, unknown>, raw: boolean) => void;
};

// ─── Tool Descriptor Factory Functions ──────────────────────────────────────
//
// These factory functions reduce repetition in COMMAND_DESCRIPTORS for common
// command shapes. Each returns a full descriptor object.
//
// NOTE: COMMAND_DESCRIPTORS is defined in this file rather than a separate
// lib/mcp-descriptors.ts because every execute handler directly references
// imported cmd* functions at the top of this file. Extracting to a separate
// file would require moving all those imports too, which is tracked as future work.

/**
 * Create a descriptor for a simple single-required-string-argument command.
 */
function makeSimpleCommand(
  name: string,
  description: string,
  argName: string,
  argDescription: string,
  handler: (cwd: string, argValue: string) => void | unknown
): CommandDescriptor {
  return {
    name,
    description,
    params: [{ name: argName, type: 'string', required: true, description: argDescription }],
    execute: (cwd: string, args: Record<string, unknown>) =>
      handler(cwd, args[argName] as string),
  };
}

/**
 * Create a descriptor for a command that takes a single required 'phase' string argument.
 */
function makePhaseCommand(
  name: string,
  description: string,
  handler: (cwd: string, phase: string) => void | unknown
): CommandDescriptor {
  return makeSimpleCommand(name, description, 'phase', 'Phase number', handler);
}

/**
 * Create a descriptor for a zero-argument state-reading/mutation command.
 */
function makeStateCommand(
  name: string,
  description: string,
  handler: (cwd: string) => void | unknown
): CommandDescriptor {
  return {
    name,
    description,
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => handler(cwd),
  };
}

// ─── Tool Descriptors ────────────────────────────────────────────────────────
//
// Each descriptor declares: name, description, params (with type, required, description).
// The buildToolDefinitions() function transforms these into MCP-format tool definitions.

const COMMAND_DESCRIPTORS: CommandDescriptor[] = [
  // ── State commands ──
  makeStateCommand(
    'grd_state_load',
    'Load full project config, state, and roadmap status',
    (cwd) => cmdStateLoad(cwd, false)
  ),
  {
    name: 'grd_state_get',
    description: 'Read a specific field or section from STATE.md',
    params: [
      {
        name: 'section',
        type: 'string',
        required: false,
        description: 'Field or section name to read',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdStateGet(cwd, (args.section as string) || undefined, false),
  },
  {
    name: 'grd_state_patch',
    description: 'Batch update STATE.md fields',
    params: [
      {
        name: 'patches',
        type: 'object',
        required: true,
        description: 'Object of field:value pairs to update',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdStatePatch(cwd, (args.patches as Record<string, unknown>) || {}, false),
  },
  {
    name: 'grd_state_update',
    description: 'Update a single STATE.md field',
    params: [
      { name: 'field', type: 'string', required: true, description: 'Field name to update' },
      { name: 'value', type: 'string', required: true, description: 'New value for the field' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdStateUpdate(cwd, args.field as string, args.value as string),
  },
  makeStateCommand(
    'grd_state_advance_plan',
    'Increment the current plan counter in STATE.md',
    (cwd) => cmdStateAdvancePlan(cwd, false)
  ),
  {
    name: 'grd_state_record_metric',
    description: 'Record execution metrics (phase, plan, duration, tasks, files) to STATE.md',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number' },
      { name: 'plan', type: 'string', required: true, description: 'Plan number' },
      { name: 'duration', type: 'string', required: true, description: 'Duration (e.g. "3min")' },
      { name: 'tasks', type: 'string', required: false, description: 'Number of tasks' },
      { name: 'files', type: 'string', required: false, description: 'Number of files modified' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdStateRecordMetric(
        cwd,
        {
          phase: args.phase,
          plan: args.plan,
          duration: args.duration,
          tasks: (args.tasks as string) || null,
          files: (args.files as string) || null,
        },
        false
      ),
  },
  makeStateCommand(
    'grd_state_update_progress',
    'Recalculate progress bar from disk state',
    (cwd) => cmdStateUpdateProgress(cwd, false)
  ),
  {
    name: 'grd_state_add_decision',
    description: 'Add a decision to the Key Decisions table in STATE.md',
    params: [
      { name: 'summary', type: 'string', required: true, description: 'Decision summary text' },
      {
        name: 'phase',
        type: 'string',
        required: false,
        description: 'Phase number for the decision',
      },
      {
        name: 'rationale',
        type: 'string',
        required: false,
        description: 'Rationale for the decision',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdStateAddDecision(
        cwd,
        {
          summary: args.summary,
          phase: (args.phase as string) || null,
          rationale: (args.rationale as string) || '',
        },
        false
      ),
  },
  {
    name: 'grd_state_add_blocker',
    description: 'Add a blocker to STATE.md',
    params: [{ name: 'text', type: 'string', required: true, description: 'Blocker description' }],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdStateAddBlocker(cwd, args.text as string, false),
  },
  {
    name: 'grd_state_resolve_blocker',
    description: 'Resolve a blocker in STATE.md',
    params: [
      { name: 'text', type: 'string', required: true, description: 'Blocker text to resolve' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdStateResolveBlocker(cwd, args.text as string, false),
  },
  {
    name: 'grd_state_record_session',
    description: 'Update session continuity info in STATE.md',
    params: [
      {
        name: 'stopped_at',
        type: 'string',
        required: true,
        description: 'Where execution stopped',
      },
      { name: 'resume_file', type: 'string', required: false, description: 'File to resume from' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdStateRecordSession(
        cwd,
        {
          stopped_at: args.stopped_at,
          resume_file: (args.resume_file as string) || 'None',
        },
        false
      ),
  },

  // ── Top-level commands ──
  {
    name: 'grd_resolve_model',
    description: 'Resolve the model name for a given agent type from project configuration',
    params: [
      {
        name: 'agent_type',
        type: 'string',
        required: true,
        description: 'Agent type key (e.g. grd-executor)',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdResolveModel(cwd, args.agent_type as string, false),
  },
  {
    name: 'grd_find_phase',
    description: 'Find a phase directory by number and list its plans and summaries',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase identifier to find' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdFindPhase(cwd, args.phase as string, false),
  },
  {
    name: 'grd_commit',
    description: 'Create a git commit with specified files',
    params: [
      { name: 'message', type: 'string', required: true, description: 'Commit message' },
      {
        name: 'files',
        type: 'array',
        required: false,
        description: 'File paths to stage (defaults to .planning/)',
      },
      { name: 'amend', type: 'boolean', required: false, description: 'Amend previous commit' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdCommit(
        cwd,
        args.message as string,
        (args.files as string[]) || [],
        false,
        (args.amend as boolean) || false
      ),
  },

  // ── Verify commands ──
  {
    name: 'grd_verify_summary',
    description: 'Verify a SUMMARY.md file structure and content',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Path to the SUMMARY.md file' },
      { name: 'check_count', type: 'number', required: false, description: 'Expected task count' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdVerifySummary(cwd, args.file as string, (args.check_count as number) || 2, false),
  },
  makeSimpleCommand(
    'grd_verify_plan_structure',
    'Validate a PLAN.md file structure and frontmatter',
    'file',
    'Path to the PLAN.md file',
    (cwd, file) => cmdVerifyPlanStructure(cwd, file, false)
  ),
  {
    name: 'grd_verify_phase_completeness',
    description: 'Check that all plans in a phase have corresponding summaries',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number or directory' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdVerifyPhaseCompleteness(cwd, args.phase as string, false),
  },
  {
    name: 'grd_verify_references',
    description: 'Validate @-references and file paths in a file',
    params: [
      { name: 'file', type: 'string', required: true, description: 'File to check references in' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdVerifyReferences(cwd, args.file as string, false),
  },
  {
    name: 'grd_verify_commits',
    description: 'Batch verify that git commits exist',
    params: [
      {
        name: 'hashes',
        type: 'array',
        required: true,
        description: 'Array of git commit hashes to verify',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdVerifyCommits(cwd, (args.hashes as string[]) || [], false),
  },
  makeSimpleCommand(
    'grd_verify_artifacts',
    'Check that must_haves.artifacts from a plan file exist on disk',
    'file',
    'Path to the PLAN.md file',
    (cwd, file) => cmdVerifyArtifacts(cwd, file, false)
  ),
  makeSimpleCommand(
    'grd_verify_key_links',
    'Validate must_haves.key_links patterns between source files',
    'file',
    'Path to the PLAN.md file',
    (cwd, file) => cmdVerifyKeyLinks(cwd, file, false)
  ),

  // ── Template & Scaffold ──
  {
    name: 'grd_template_select',
    description: 'Select the appropriate template for a given type',
    params: [
      {
        name: 'type',
        type: 'string',
        required: true,
        description: 'Template type (e.g. summary, plan)',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdTemplateSelect(cwd, args.type as string, false),
  },
  {
    name: 'grd_template_fill',
    description: 'Fill a template with provided values',
    params: [
      { name: 'template', type: 'string', required: true, description: 'Template path or type' },
      { name: 'phase', type: 'string', required: false, description: 'Phase number' },
      { name: 'plan', type: 'string', required: false, description: 'Plan number' },
      { name: 'name', type: 'string', required: false, description: 'Plan or phase name' },
      {
        name: 'type',
        type: 'string',
        required: false,
        description: 'Plan type (default: execute)',
      },
      { name: 'wave', type: 'string', required: false, description: 'Wave number (default: 1)' },
      {
        name: 'fields',
        type: 'object',
        required: false,
        description: 'Additional template fields',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdTemplateFill(
        cwd,
        args.template as string,
        {
          phase: (args.phase as string) || null,
          plan: (args.plan as string) || null,
          name: (args.name as string) || null,
          type: (args.type as string) || 'execute',
          wave: (args.wave as string) || '1',
          fields: (args.fields as Record<string, unknown>) || {},
        },
        false
      ),
  },
  {
    name: 'grd_scaffold',
    description:
      'Scaffold project structures (context, uat, verification, phase-dir, research-dir, eval, baseline)',
    params: [
      { name: 'type', type: 'string', required: true, description: 'Scaffold type' },
      { name: 'phase', type: 'string', required: false, description: 'Phase number' },
      { name: 'name', type: 'string', required: false, description: 'Name for the scaffold' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdScaffold(
        cwd,
        args.type as string,
        {
          phase: (args.phase as string) || null,
          name: (args.name as string) || null,
        },
        false
      ),
  },

  // ── Frontmatter ──
  {
    name: 'grd_frontmatter_get',
    description: 'Get frontmatter from a markdown file',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Markdown file path' },
      { name: 'field', type: 'string', required: false, description: 'Specific field to extract' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdFrontmatterGet(cwd, args.file as string, (args.field as string) || null, false),
  },
  {
    name: 'grd_frontmatter_set',
    description: 'Set a frontmatter field in a markdown file',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Markdown file path' },
      { name: 'field', type: 'string', required: true, description: 'Field name to set' },
      { name: 'value', type: 'string', required: true, description: 'Value to set' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdFrontmatterSet(
        cwd,
        args.file as string,
        args.field as string,
        args.value as string,
        false
      ),
  },
  {
    name: 'grd_frontmatter_merge',
    description: 'Merge data into frontmatter of a markdown file',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Markdown file path' },
      { name: 'data', type: 'string', required: true, description: 'JSON string of data to merge' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdFrontmatterMerge(cwd, args.file as string, args.data as string, false),
  },
  {
    name: 'grd_frontmatter_validate',
    description: 'Validate frontmatter of a markdown file against a schema',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Markdown file path' },
      {
        name: 'schema',
        type: 'string',
        required: false,
        description: 'Schema name to validate against',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdFrontmatterValidate(cwd, args.file as string, (args.schema as string) || null, false),
  },

  // ── Utility commands ──
  {
    name: 'grd_generate_slug',
    description: 'Generate a kebab-case slug from input text',
    params: [
      { name: 'text', type: 'string', required: true, description: 'Text to convert to slug' },
    ],
    execute: (_cwd: string, args: Record<string, unknown>) =>
      cmdGenerateSlug(args.text as string, false),
  },
  {
    name: 'grd_current_timestamp',
    description: 'Output the current timestamp in the specified format',
    params: [
      {
        name: 'format',
        type: 'string',
        required: false,
        description: 'Format: date, filename, or full (default: full)',
      },
    ],
    execute: (_cwd: string, args: Record<string, unknown>) =>
      cmdCurrentTimestamp((args.format as string) || 'full', false),
  },
  {
    name: 'grd_list_todos',
    description: 'List pending todo files with optional area filter',
    params: [
      { name: 'area', type: 'string', required: false, description: 'Area filter (e.g. general)' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdListTodos(cwd, (args.area as string) || undefined, false),
  },
  {
    name: 'grd_todo_complete',
    description: 'Mark a todo file as completed',
    params: [
      {
        name: 'filename',
        type: 'string',
        required: true,
        description: 'Todo filename to complete',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdTodoComplete(cwd, args.filename as string, false),
  },
  {
    name: 'grd_verify_path_exists',
    description: 'Check if a path exists in the project and report its type',
    params: [
      { name: 'path', type: 'string', required: true, description: 'Path to check for existence' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdVerifyPathExists(cwd, args.path as string, false),
  },
  {
    name: 'grd_config_ensure_section',
    description: 'Ensure config.json exists with required sections',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdConfigEnsureSection(cwd, false),
  },
  {
    name: 'grd_config_set',
    description: 'Set a configuration value by dot-path key in config.json',
    params: [
      {
        name: 'key',
        type: 'string',
        required: true,
        description: 'Dot-notation key path (e.g. workflow.research)',
      },
      { name: 'value', type: 'string', required: true, description: 'Value to set' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdConfigSet(cwd, args.key as string, args.value as string, false),
  },
  makeStateCommand(
    'grd_history_digest',
    'Aggregate metrics, decisions, and tech stack from all SUMMARY.md files',
    (cwd) => cmdHistoryDigest(cwd, false)
  ),

  // ── Phases ──
  {
    name: 'grd_phases_list',
    description: 'List all phases with optional type or phase filter',
    params: [
      { name: 'type', type: 'string', required: false, description: 'Filter by phase type' },
      { name: 'phase', type: 'string', required: false, description: 'Filter by phase number' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdPhasesList(
        cwd,
        { type: (args.type as string) || null, phase: (args.phase as string) || null },
        false
      ),
  },

  // ── Roadmap ──
  makePhaseCommand(
    'grd_roadmap_get_phase',
    'Get roadmap section for a specific phase',
    (cwd, phase) => cmdRoadmapGetPhase(cwd, phase, false)
  ),
  {
    name: 'grd_roadmap_analyze',
    description: 'Analyze roadmap structure and status',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdRoadmapAnalyze(cwd, false),
  },

  // ── Phase operations ──
  makePhaseCommand(
    'grd_phase_next_decimal',
    'Get the next decimal phase number after a given phase',
    (cwd, phase) => cmdPhaseNextDecimal(cwd, phase, false)
  ),
  {
    name: 'grd_phase_add',
    description: 'Add a new phase to the roadmap',
    params: [
      { name: 'description', type: 'string', required: true, description: 'Phase description' },
      {
        name: 'context',
        type: 'string',
        required: false,
        description: 'Optional context text to capture in CONTEXT.md',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdPhaseAdd(cwd, args.description as string, false, args.context as string | undefined),
  },
  {
    name: 'grd_phase_insert',
    description: 'Insert a phase at a specific position in the roadmap',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number to insert at' },
      { name: 'description', type: 'string', required: true, description: 'Phase description' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdPhaseInsert(cwd, args.phase as string, args.description as string, false),
  },
  {
    name: 'grd_phase_remove',
    description: 'Remove a phase from the roadmap',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number to remove' },
      {
        name: 'force',
        type: 'boolean',
        required: false,
        description: 'Force removal even if phase has content',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdPhaseRemove(
        cwd,
        args.phase as string,
        { force: (args.force as boolean) || false },
        false
      ),
  },
  makePhaseCommand('grd_phase_complete', 'Mark a phase as complete', (cwd, phase) =>
    cmdPhaseComplete(cwd, phase, false)
  ),
  {
    name: 'grd_phase_analyze_deps',
    description: 'Analyze roadmap phase dependencies and identify parallel execution groups',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdPhaseAnalyzeDeps(cwd, false),
  },

  // ── Milestone ──
  {
    name: 'grd_milestone_complete',
    description: 'Mark a milestone as complete and archive it',
    params: [
      {
        name: 'version',
        type: 'string',
        required: true,
        description: 'Milestone version (e.g. v1.0)',
      },
      { name: 'name', type: 'string', required: false, description: 'Milestone name' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdMilestoneComplete(
        cwd,
        args.version as string,
        { name: (args.name as string) || null },
        false
      ),
  },

  // ── Validate ──
  {
    name: 'grd_validate_consistency',
    description: 'Validate phase numbering and disk/roadmap sync',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdValidateConsistency(cwd, false),
  },

  // ── Progress ──
  {
    name: 'grd_progress',
    description: 'Render project progress in the specified format',
    params: [
      {
        name: 'format',
        type: 'string',
        required: false,
        description: 'Output format: json, table, or bar (default: json)',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdProgressRender(cwd, (args.format as string) || 'json', false),
  },

  // ── Todo ──
  // (grd_todo_complete is already defined above under utility commands)

  // ── Phase Plan Index ──
  makePhaseCommand(
    'grd_phase_plan_index',
    'Index plans in a phase with wave grouping and completion status',
    (cwd, phase) => cmdPhasePlanIndex(cwd, phase, false)
  ),

  // ── State Snapshot ──
  makeStateCommand('grd_state_snapshot', 'Structured parse of STATE.md', (cwd) =>
    cmdStateSnapshot(cwd, false)
  ),

  // ── Summary Extract ──
  {
    name: 'grd_summary_extract',
    description: 'Extract structured data from a SUMMARY.md file',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Path to the SUMMARY.md file' },
      {
        name: 'fields',
        type: 'string',
        required: false,
        description: 'Comma-separated list of fields to extract',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdSummaryExtract(
        cwd,
        args.file as string,
        (args.fields as string) ? (args.fields as string).split(',') : null,
        false
      ),
  },

  // ── Tracker (12 subcommands) ──
  {
    name: 'grd_tracker_get_config',
    description: 'Get tracker configuration',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdTracker(cwd, 'get-config', [], false),
  },
  {
    name: 'grd_tracker_sync_roadmap',
    description: 'Sync roadmap to issue tracker',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdTracker(cwd, 'sync-roadmap', [], false),
  },
  {
    name: 'grd_tracker_sync_phase',
    description: 'Sync a phase to issue tracker',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number to sync' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdTracker(cwd, 'sync-phase', [args.phase as string], false),
  },
  {
    name: 'grd_tracker_update_status',
    description: 'Update phase status in tracker',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number' },
      { name: 'status', type: 'string', required: true, description: 'New status' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdTracker(cwd, 'update-status', [args.phase as string, args.status as string], false),
  },
  {
    name: 'grd_tracker_add_comment',
    description: 'Add a comment to a phase issue in tracker',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number' },
      {
        name: 'file',
        type: 'string',
        required: true,
        description: 'Path to file to post as comment',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdTracker(cwd, 'add-comment', [args.phase as string, args.file as string], false),
  },
  {
    name: 'grd_tracker_sync_status',
    description: 'Sync all phase statuses to tracker',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdTracker(cwd, 'sync-status', [], false),
  },
  {
    name: 'grd_tracker_schedule',
    description: 'Compute and display schedule for tracker sync',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdTracker(cwd, 'schedule', [], false),
  },
  {
    name: 'grd_tracker_prepare_reschedule',
    description: 'Prepare reschedule data for tracker',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdTracker(cwd, 'prepare-reschedule', [], false),
  },
  {
    name: 'grd_tracker_prepare_roadmap_sync',
    description: 'Prepare roadmap sync payload for tracker',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdTracker(cwd, 'prepare-roadmap-sync', [], false),
  },
  {
    name: 'grd_tracker_prepare_phase_sync',
    description: 'Prepare phase sync payload for tracker',
    params: [{ name: 'phase', type: 'string', required: true, description: 'Phase number' }],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdTracker(cwd, 'prepare-phase-sync', [args.phase as string], false),
  },
  {
    name: 'grd_tracker_record_mapping',
    description: 'Record tracker mapping entry',
    params: [{ name: 'args', type: 'array', required: true, description: 'Mapping arguments' }],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdTracker(cwd, 'record-mapping', (args.args as string[]) || [], false),
  },
  {
    name: 'grd_tracker_record_status',
    description: 'Record tracker status update',
    params: [{ name: 'args', type: 'array', required: true, description: 'Status arguments' }],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdTracker(cwd, 'record-status', (args.args as string[]) || [], false),
  },

  // ── Dashboard, Phase Detail, Health ──
  {
    name: 'grd_dashboard',
    description: 'Render full project dashboard with milestones, phases, plans, and timeline',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdDashboard(cwd, true),
  },
  {
    name: 'grd_phase_detail',
    description: 'Render detailed drill-down for a single phase',
    params: [{ name: 'phase', type: 'string', required: true, description: 'Phase number' }],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdPhaseDetail(cwd, args.phase as string, true),
  },
  {
    name: 'grd_health',
    description:
      'Display project health indicators including blockers, deferred validations, velocity, and risks',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdHealth(cwd, true),
  },
  {
    name: 'grd_detect_backend',
    description: 'Detect the current AI coding CLI backend and capabilities',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdDetectBackend(cwd, false),
  },

  // ── Init workflows (21 total) ──
  {
    name: 'grd_init_execute_phase',
    description: 'Initialize context for execute-phase workflow',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number' },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitExecutePhase(
        cwd,
        args.phase as string,
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_execute_parallel',
    description:
      'Initialize context for parallel multi-phase execution with independence validation',
    params: [
      {
        name: 'phases',
        type: 'string',
        required: true,
        description: 'Comma-separated phase numbers to execute in parallel (e.g., "27,29")',
      },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated content sections to include (e.g., "state,config")',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) => {
      const phases = ((args.phases as string) || '')
        .split(',')
        .map((p: string) => p.trim())
        .filter(Boolean);
      const includes = new Set(
        ((args.include as string) || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      );
      cmdInitExecuteParallel(cwd, phases, includes, false);
    },
  },
  {
    name: 'grd_init_plan_phase',
    description: 'Initialize context for plan-phase workflow',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number' },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitPlanPhase(
        cwd,
        args.phase as string,
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_new_project',
    description: 'Initialize context for new-project workflow',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdInitNewProject(cwd, false),
  },
  {
    name: 'grd_init_new_milestone',
    description: 'Initialize context for new-milestone workflow',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdInitNewMilestone(cwd, false),
  },
  {
    name: 'grd_init_quick',
    description: 'Initialize context for quick workflow',
    params: [
      {
        name: 'description',
        type: 'string',
        required: false,
        description: 'Quick task description',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitQuick(cwd, (args.description as string) || '', false),
  },
  {
    name: 'grd_init_resume',
    description: 'Initialize context for resume workflow',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdInitResume(cwd, false),
  },
  {
    name: 'grd_init_verify_work',
    description: 'Initialize context for verify-work workflow',
    params: [{ name: 'phase', type: 'string', required: true, description: 'Phase number' }],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitVerifyWork(cwd, args.phase as string, false),
  },
  {
    name: 'grd_init_phase_op',
    description: 'Initialize context for phase-op workflow',
    params: [{ name: 'phase', type: 'string', required: true, description: 'Phase number' }],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitPhaseOp(cwd, args.phase as string, false),
  },
  {
    name: 'grd_init_todos',
    description: 'Initialize context for todos workflow',
    params: [{ name: 'area', type: 'string', required: false, description: 'Area filter' }],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitTodos(cwd, (args.area as string) || undefined, false),
  },
  {
    name: 'grd_init_milestone_op',
    description: 'Initialize context for milestone-op workflow',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdInitMilestoneOp(cwd, false),
  },
  {
    name: 'grd_init_plan_milestone_gaps',
    description: 'Initialize context for plan-milestone-gaps workflow',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdInitPlanMilestoneGaps(cwd, false),
  },
  {
    name: 'grd_init_map_codebase',
    description: 'Initialize context for map-codebase workflow',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdInitMapCodebase(cwd, false),
  },
  {
    name: 'grd_init_progress',
    description: 'Initialize context for progress workflow',
    params: [
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitProgress(
        cwd,
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_survey',
    description: 'Initialize context for survey research workflow',
    params: [
      { name: 'topic', type: 'string', required: false, description: 'Survey topic' },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitResearchWorkflow(
        cwd,
        'survey',
        (args.topic as string) || '',
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_deep_dive',
    description: 'Initialize context for deep-dive research workflow',
    params: [
      { name: 'paper', type: 'string', required: false, description: 'Paper identifier' },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitResearchWorkflow(
        cwd,
        'deep-dive',
        (args.paper as string) || '',
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_feasibility',
    description: 'Initialize context for feasibility research workflow',
    params: [
      { name: 'approach', type: 'string', required: false, description: 'Approach description' },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitResearchWorkflow(
        cwd,
        'feasibility',
        (args.approach as string) || '',
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_eval_plan',
    description: 'Initialize context for eval-plan research workflow',
    params: [
      {
        name: 'description',
        type: 'string',
        required: false,
        description: 'Evaluation plan description',
      },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitResearchWorkflow(
        cwd,
        'eval-plan',
        (args.description as string) || '',
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_eval_report',
    description: 'Initialize context for eval-report research workflow',
    params: [
      {
        name: 'description',
        type: 'string',
        required: false,
        description: 'Evaluation report description',
      },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitResearchWorkflow(
        cwd,
        'eval-report',
        (args.description as string) || '',
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_assess_baseline',
    description: 'Initialize context for assess-baseline research workflow',
    params: [
      {
        name: 'description',
        type: 'string',
        required: false,
        description: 'Baseline assessment description',
      },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitResearchWorkflow(
        cwd,
        'assess-baseline',
        (args.description as string) || '',
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_product_plan',
    description: 'Initialize context for product-plan workflow',
    params: [
      {
        name: 'description',
        type: 'string',
        required: false,
        description: 'Product plan description',
      },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitResearchWorkflow(
        cwd,
        'product-plan',
        (args.description as string) || '',
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_iterate',
    description: 'Initialize context for iterate workflow',
    params: [
      {
        name: 'description',
        type: 'string',
        required: false,
        description: 'Iteration description',
      },
      {
        name: 'include',
        type: 'string',
        required: false,
        description: 'Comma-separated include items',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdInitResearchWorkflow(
        cwd,
        'iterate',
        (args.description as string) || '',
        new Set((args.include as string) ? (args.include as string).split(',') : []),
        false
      ),
  },

  // ── Long-Term Roadmap (12 subcommands) ──
  {
    name: 'grd_long_term_roadmap_list',
    description: 'List all LT milestones',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdLongTermRoadmap(cwd, 'list', [], false),
  },
  {
    name: 'grd_long_term_roadmap_add',
    description: 'Add a new LT milestone',
    params: [
      { name: 'name', type: 'string', required: true, description: 'LT milestone name' },
      { name: 'goal', type: 'string', required: true, description: 'LT milestone goal' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdLongTermRoadmap(
        cwd,
        'add',
        ['--name', args.name as string, '--goal', args.goal as string],
        false
      ),
  },
  {
    name: 'grd_long_term_roadmap_remove',
    description: 'Remove an LT milestone (protected if shipped)',
    params: [
      { name: 'id', type: 'string', required: true, description: 'LT milestone ID (e.g. LT-2)' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdLongTermRoadmap(cwd, 'remove', ['--id', args.id as string], false),
  },
  {
    name: 'grd_long_term_roadmap_update',
    description: 'Update LT milestone fields (name, goal, status)',
    params: [
      { name: 'id', type: 'string', required: true, description: 'LT milestone ID' },
      { name: 'name', type: 'string', required: false, description: 'New name' },
      { name: 'goal', type: 'string', required: false, description: 'New goal' },
      {
        name: 'status',
        type: 'string',
        required: false,
        description: 'New status (completed/active/planned)',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) => {
      const subArgs: string[] = ['--id', args.id as string];
      if (args.name) subArgs.push('--name', args.name as string);
      if (args.goal) subArgs.push('--goal', args.goal as string);
      if (args.status) subArgs.push('--status', args.status as string);
      return cmdLongTermRoadmap(cwd, 'update', subArgs, false);
    },
  },
  {
    name: 'grd_long_term_roadmap_link',
    description: 'Link a normal milestone to an LT milestone',
    params: [
      { name: 'id', type: 'string', required: true, description: 'LT milestone ID' },
      { name: 'version', type: 'string', required: true, description: 'Normal milestone version' },
      {
        name: 'note',
        type: 'string',
        required: false,
        description: 'Optional note (e.g. "planned")',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) => {
      const subArgs: string[] = ['--id', args.id as string, '--version', args.version as string];
      if (args.note) subArgs.push('--note', args.note as string);
      return cmdLongTermRoadmap(cwd, 'link', subArgs, false);
    },
  },
  {
    name: 'grd_long_term_roadmap_unlink',
    description: 'Unlink a normal milestone from an LT milestone (protected if shipped)',
    params: [
      { name: 'id', type: 'string', required: true, description: 'LT milestone ID' },
      { name: 'version', type: 'string', required: true, description: 'Normal milestone version' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdLongTermRoadmap(
        cwd,
        'unlink',
        ['--id', args.id as string, '--version', args.version as string],
        false
      ),
  },
  {
    name: 'grd_long_term_roadmap_init',
    description: 'Auto-group existing ROADMAP.md milestones into LT-1',
    params: [{ name: 'project', type: 'string', required: false, description: 'Project name' }],
    execute: (cwd: string, args: Record<string, unknown>) => {
      const subArgs: string[] = (args.project as string)
        ? ['--project', args.project as string]
        : [];
      return cmdLongTermRoadmap(cwd, 'init', subArgs, false);
    },
  },
  {
    name: 'grd_long_term_roadmap_display',
    description: 'Display the long-term roadmap in formatted text',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdLongTermRoadmap(cwd, 'display', [], false),
  },
  {
    name: 'grd_long_term_roadmap_parse',
    description: 'Parse the long-term roadmap file into structured data',
    params: [
      {
        name: 'file',
        type: 'string',
        required: false,
        description: 'Path to LONG-TERM-ROADMAP.md',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdLongTermRoadmap(
        cwd,
        'parse',
        (args.file as string) ? [args.file as string] : [],
        false
      ),
  },
  {
    name: 'grd_long_term_roadmap_validate',
    description: 'Validate the long-term roadmap structure',
    params: [
      {
        name: 'file',
        type: 'string',
        required: false,
        description: 'Path to LONG-TERM-ROADMAP.md',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdLongTermRoadmap(
        cwd,
        'validate',
        (args.file as string) ? [args.file as string] : [],
        false
      ),
  },
  {
    name: 'grd_long_term_roadmap_refine',
    description: 'Output context for AI discussion of an LT milestone',
    params: [{ name: 'id', type: 'string', required: true, description: 'LT milestone ID' }],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdLongTermRoadmap(cwd, 'refine', ['--id', args.id as string], false),
  },
  {
    name: 'grd_long_term_roadmap_history',
    description: 'Update refinement history in the long-term roadmap',
    params: [
      { name: 'action', type: 'string', required: true, description: 'History action' },
      { name: 'details', type: 'string', required: true, description: 'Action details' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdLongTermRoadmap(
        cwd,
        'history',
        ['--action', args.action as string, '--details', args.details as string],
        false
      ),
  },

  // ── Quality Analysis ──
  {
    name: 'grd_quality_analysis',
    description: 'Run quality analysis for a phase',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number to analyze' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdQualityAnalysis(cwd, ['--phase', args.phase as string], false),
  },

  // ── Requirement & Search commands ──
  {
    name: 'grd_requirement_get',
    description: 'Get a requirement by ID with status and phase from traceability matrix',
    params: [
      {
        name: 'req_id',
        type: 'string',
        required: true,
        description: 'Requirement ID (e.g. REQ-37)',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdRequirementGet(cwd, args.req_id as string, false),
  },
  {
    name: 'grd_requirement_list',
    description: 'List requirements with optional filters (phase, priority, status, category)',
    params: [
      { name: 'phase', type: 'string', required: false, description: 'Filter by phase number' },
      {
        name: 'priority',
        type: 'string',
        required: false,
        description: 'Filter by priority (e.g. P1, P2)',
      },
      {
        name: 'status',
        type: 'string',
        required: false,
        description: 'Filter by status (Pending, In Progress, Done, Deferred)',
      },
      { name: 'category', type: 'string', required: false, description: 'Filter by category' },
      {
        name: 'all',
        type: 'boolean',
        required: false,
        description: 'Include archived milestone requirements',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdRequirementList(
        cwd,
        {
          phase: (args.phase as string) || null,
          priority: (args.priority as string) || null,
          status: (args.status as string) || null,
          category: (args.category as string) || null,
          all: (args.all as boolean) || false,
        },
        false
      ),
  },
  {
    name: 'grd_requirement_traceability',
    description: 'Get the traceability matrix with optional phase filter',
    params: [
      { name: 'phase', type: 'string', required: false, description: 'Filter by phase number' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdRequirementTraceability(cwd, { phase: (args.phase as string) || null }, false),
  },
  {
    name: 'grd_requirement_update_status',
    description: 'Update the status of a requirement in the traceability matrix',
    params: [
      {
        name: 'req_id',
        type: 'string',
        required: true,
        description: 'Requirement ID (e.g. REQ-37)',
      },
      {
        name: 'status',
        type: 'string',
        required: true,
        description: 'New status (Pending, In Progress, Done, Deferred)',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdRequirementUpdateStatus(cwd, args.req_id as string, args.status as string, false),
  },
  {
    name: 'grd_search',
    description: 'Search across all .planning/ markdown files for a text query',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Text query to search for' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdSearch(cwd, args.query as string, false),
  },

  // ── Worktree commands ──
  {
    name: 'grd_worktree_create',
    description: 'Create a git worktree for isolated phase execution',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number' },
      {
        name: 'milestone',
        type: 'string',
        required: false,
        description: 'Milestone version (defaults to current)',
      },
      { name: 'slug', type: 'string', required: false, description: 'Phase slug for branch name' },
      {
        name: 'start_point',
        type: 'string',
        required: false,
        description:
          'Branch or commit to fork from (for stacked PRs). If omitted, forks from current HEAD.',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdWorktreeCreate(
        cwd,
        {
          phase: args.phase,
          milestone: (args.milestone as string) || null,
          slug: (args.slug as string) || null,
          startPoint: (args.start_point as string) || null,
        },
        false
      ),
  },
  {
    name: 'grd_worktree_remove',
    description: 'Remove a git worktree and clean up temp directory',
    params: [
      {
        name: 'phase',
        type: 'string',
        required: false,
        description: 'Phase number to remove worktree for',
      },
      { name: 'path', type: 'string', required: false, description: 'Direct path to worktree' },
      {
        name: 'stale',
        type: 'boolean',
        required: false,
        description: 'Remove all stale worktrees',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      (args.stale as boolean)
        ? cmdWorktreeRemoveStale(cwd, false)
        : cmdWorktreeRemove(
            cwd,
            { phase: (args.phase as string) || null, path: (args.path as string) || null },
            false
          ),
  },
  {
    name: 'grd_worktree_list',
    description: 'List all active GRD worktrees',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdWorktreeList(cwd, false),
  },
  {
    name: 'grd_worktree_push_pr',
    description: 'Push worktree branch and create a PR targeting the base branch',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number' },
      { name: 'milestone', type: 'string', required: false, description: 'Milestone version' },
      { name: 'title', type: 'string', required: false, description: 'PR title' },
      { name: 'body', type: 'string', required: false, description: 'PR body markdown' },
      { name: 'base', type: 'string', required: false, description: 'Base branch for PR' },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdWorktreePushAndPR(
        cwd,
        {
          phase: args.phase,
          milestone: (args.milestone as string) || null,
          title: (args.title as string) || null,
          body: (args.body as string) || null,
          base: (args.base as string) || null,
        },
        false
      ),
  },

  // ── Autopilot ──
  {
    name: 'grd_autopilot_run',
    description:
      'Run autopilot to plan and execute multiple phases sequentially with fresh context per step',
    params: [
      {
        name: 'from',
        type: 'string',
        required: false,
        description: 'Starting phase number (inclusive)',
      },
      {
        name: 'to',
        type: 'string',
        required: false,
        description: 'Ending phase number (inclusive)',
      },
      {
        name: 'resume',
        type: 'boolean',
        required: false,
        description: 'Skip already-completed steps',
      },
      {
        name: 'dry_run',
        type: 'boolean',
        required: false,
        description: 'Show plan without executing',
      },
      {
        name: 'skip_plan',
        type: 'boolean',
        required: false,
        description: 'Skip planning step',
      },
      {
        name: 'skip_execute',
        type: 'boolean',
        required: false,
        description: 'Skip execution step',
      },
      {
        name: 'timeout',
        type: 'number',
        required: false,
        description: 'Timeout per invocation in minutes (default: 30)',
      },
      {
        name: 'max_turns',
        type: 'number',
        required: false,
        description: 'Max turns per claude -p invocation',
      },
      {
        name: 'model',
        type: 'string',
        required: false,
        description: 'Model override for claude -p',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) => {
      const cliArgs: string[] = [];
      if (args.from) cliArgs.push('--from', args.from as string);
      if (args.to) cliArgs.push('--to', args.to as string);
      if (args.resume) cliArgs.push('--resume');
      if (args.dry_run) cliArgs.push('--dry-run');
      if (args.skip_plan) cliArgs.push('--skip-plan');
      if (args.skip_execute) cliArgs.push('--skip-execute');
      if (args.timeout) cliArgs.push('--timeout', String(args.timeout));
      if (args.max_turns) cliArgs.push('--max-turns', String(args.max_turns));
      if (args.model) cliArgs.push('--model', args.model as string);
      return cmdAutopilot(cwd, cliArgs, false);
    },
  },
  {
    name: 'grd_autopilot_init',
    description: 'Get autopilot pre-flight context: phase range, config, claude availability',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdInitAutopilot(cwd, false),
  },

  // ── Multi-Milestone Autopilot ──
  {
    name: 'grd_multi_milestone_autopilot_run',
    description:
      'Plan and execute phases across multiple milestones autonomously, completing one milestone and starting the next',
    params: [
      {
        name: 'max_milestones',
        type: 'number',
        required: false,
        description: 'Maximum milestones to process (default: 10)',
      },
      {
        name: 'dry_run',
        type: 'boolean',
        required: false,
        description: 'Preview without executing',
      },
      {
        name: 'resume',
        type: 'boolean',
        required: false,
        description: 'Skip already-completed work',
      },
      {
        name: 'timeout',
        type: 'number',
        required: false,
        description: 'Per-subprocess timeout in minutes',
      },
      {
        name: 'max_turns',
        type: 'number',
        required: false,
        description: 'Max turns per subprocess',
      },
      {
        name: 'model',
        type: 'string',
        required: false,
        description: 'Model override',
      },
      {
        name: 'skip_plan',
        type: 'boolean',
        required: false,
        description: 'Skip planning step',
      },
      {
        name: 'skip_execute',
        type: 'boolean',
        required: false,
        description: 'Skip execution step',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) => {
      const cliArgs: string[] = [];
      if (args.max_milestones) cliArgs.push('--max-milestones', String(args.max_milestones));
      if (args.dry_run) cliArgs.push('--dry-run');
      if (args.resume) cliArgs.push('--resume');
      if (args.timeout) cliArgs.push('--timeout', String(args.timeout));
      if (args.max_turns) cliArgs.push('--max-turns', String(args.max_turns));
      if (args.model) cliArgs.push('--model', args.model as string);
      if (args.skip_plan) cliArgs.push('--skip-plan');
      if (args.skip_execute) cliArgs.push('--skip-execute');
      return cmdMultiMilestoneAutopilot(cwd, cliArgs, false);
    },
  },
  {
    name: 'grd_multi_milestone_autopilot_init',
    description:
      'Pre-flight context for multi-milestone autopilot: LT roadmap state, milestone completion, next milestone',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdInitMultiMilestoneAutopilot(cwd, false),
  },
  // ── Autoplan ──
  {
    name: 'grd_autoplan_run',
    description:
      'Automatically generate a milestone from evolve discovery results or fresh discovery',
    params: [
      {
        name: 'dry_run',
        type: 'boolean' as const,
        required: false,
        description: 'Preview the autoplan prompt without executing',
      },
      {
        name: 'timeout',
        type: 'number' as const,
        required: false,
        description: 'Subprocess timeout in minutes',
      },
      {
        name: 'max_turns',
        type: 'number' as const,
        required: false,
        description: 'Max turns for subprocess',
      },
      {
        name: 'model',
        type: 'string' as const,
        required: false,
        description: 'Model override',
      },
      {
        name: 'pick_pct',
        type: 'number' as const,
        required: false,
        description: 'Discovery pick percentage (default: 50)',
      },
      {
        name: 'name',
        type: 'string' as const,
        required: false,
        description: 'Override milestone name',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) => {
      const cliArgs: string[] = [];
      if (args.dry_run) cliArgs.push('--dry-run');
      if (args.timeout) cliArgs.push('--timeout', String(args.timeout));
      if (args.max_turns) cliArgs.push('--max-turns', String(args.max_turns));
      if (args.model) cliArgs.push('--model', args.model as string);
      if (args.pick_pct) cliArgs.push('--pick-pct', String(args.pick_pct));
      if (args.name) cliArgs.push('--name', args.name as string);
      return cmdAutoplan(cwd, cliArgs, false);
    },
  },
  {
    name: 'grd_autoplan_init',
    description:
      'Pre-flight context for autoplan: evolve state, current milestone, config',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) =>
      cmdInitAutoplan(cwd, false),
  },
  // ── Evolve Orchestrator ──
  {
    name: 'grd_evolve_run',
    description: 'Run autonomous self-improvement loop with sonnet-tier models',
    params: [
      {
        name: 'iterations',
        type: 'number',
        description: 'Number of iterations to run (default: 1)',
        required: false,
      },
      {
        name: 'items',
        type: 'number',
        description: 'Work items per iteration (default: 5)',
        required: false,
      },
      {
        name: 'timeout',
        type: 'number',
        description: 'Timeout per subprocess in minutes',
        required: false,
      },
      {
        name: 'max_turns',
        type: 'number',
        description: 'Max turns per claude -p invocation',
        required: false,
      },
      {
        name: 'dry_run',
        type: 'boolean',
        description: 'Show plan without executing',
        required: false,
      },
    ],
    execute: async (cwd: string, args: Record<string, unknown>) => {
      const cliArgs: string[] = [];
      if (args.iterations) cliArgs.push('--iterations', String(args.iterations));
      if (args.items) cliArgs.push('--items', String(args.items));
      if (args.timeout) cliArgs.push('--timeout', String(args.timeout));
      if (args.max_turns) cliArgs.push('--max-turns', String(args.max_turns));
      if (args.dry_run) cliArgs.push('--dry-run');
      return cmdEvolve(cwd, cliArgs, false);
    },
  },
  // ── Evolve Engine ──
  {
    name: 'grd_evolve_discover',
    description:
      'Discover work items for self-improvement across 8 dimensions (product-ideation, improve-features, new-features, productivity, quality, usability, consistency, stability) and select top priority items. Product ideation discovers creative feature ideas by analyzing PROJECT.md and the product roadmap.',
    params: [
      {
        name: 'count',
        type: 'number',
        required: false,
        description: 'Number of items to select (default: 5)',
      },
    ],
    execute: async (cwd: string, args: Record<string, unknown>) => {
      const cliArgs: string[] = [];
      if (args.count) cliArgs.push('--count', String(args.count));
      return await cmdEvolveDiscover(cwd, cliArgs, false);
    },
  },
  {
    name: 'grd_evolve_state',
    description:
      'Read the current evolve iteration state file (selected items, remaining items, iteration history)',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdEvolveState(cwd, [], false),
  },
  {
    name: 'grd_evolve_advance',
    description:
      'Advance to the next evolve iteration: carry over remaining items, merge bugfixes, increment counter',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdEvolveAdvance(cwd, [], false),
  },
  {
    name: 'grd_evolve_reset',
    description: 'Delete the evolve state file to start a fresh iteration',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdEvolveReset(cwd, [], false),
  },
  {
    name: 'grd_evolve_init',
    description:
      'Get evolve pre-flight context: backend, models, existing evolve state, milestone info',
    params: [],
    execute: (cwd: string, _args: Record<string, unknown>) => cmdInitEvolve(cwd, false),
  },

  // ── Markdown Splitting ──
  {
    name: 'grd_markdown_split',
    description:
      'Split a large markdown file into numbered partials with an index file. Returns split result with partial paths.',
    params: [
      {
        name: 'file',
        type: 'string',
        required: true,
        description: 'Path to markdown file to split (relative to project root)',
      },
      {
        name: 'threshold',
        type: 'number',
        required: false,
        description: 'Token threshold for splitting (default: 25000)',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) => {
      const fs = require('fs');
      const path = require('path');
      const filePath: string = path.resolve(cwd, args.file as string);
      if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      const content: string = fs.readFileSync(filePath, 'utf-8');
      const basename: string = path.basename(filePath, '.md');
      const dir: string = path.dirname(filePath);
      const result = splitMarkdown(content, {
        threshold: args.threshold as number | undefined,
        basename,
      });
      if (!result.split_performed) {
        process.stdout.write(JSON.stringify({ split_performed: false, reason: result.reason }));
        return;
      }
      fs.writeFileSync(filePath, result.index_content, 'utf-8');
      const partials: string[] = [];
      for (const part of result.parts!) {
        const partPath: string = path.join(dir, part.filename);
        fs.writeFileSync(partPath, part.content, 'utf-8');
        partials.push(partPath);
      }
      process.stdout.write(
        JSON.stringify({
          split_performed: true,
          index_file: filePath,
          partials,
          part_count: result.parts!.length,
        })
      );
    },
  },
  {
    name: 'grd_markdown_check',
    description: 'Check if a markdown file is a GRD split index and estimate its token count.',
    params: [
      {
        name: 'file',
        type: 'string',
        required: true,
        description: 'Path to markdown file to check (relative to project root)',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) => {
      const fs = require('fs');
      const path = require('path');
      const filePath: string = path.resolve(cwd, args.file as string);
      if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
      const content: string = fs.readFileSync(filePath, 'utf-8');
      const tokens: number = estimateTokens(content);
      process.stdout.write(
        JSON.stringify({
          file: filePath,
          is_index: isIndexFile(content),
          estimated_tokens: tokens,
          exceeds_threshold: tokens > 25000,
        })
      );
    },
  },

  // ── Coverage & Health ──
  {
    name: 'grd_coverage_report',
    description: 'Generate structured coverage report identifying lib/ modules below a threshold',
    params: [
      {
        name: 'threshold',
        type: 'number',
        required: false,
        description: 'Minimum line coverage percentage (default: 85)',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdCoverageReport(cwd, { threshold: (args.threshold as number) || 85 }, false),
  },
  {
    name: 'grd_health_check',
    description:
      'Run comprehensive project health checks: tests, lint, format, consistency validation',
    params: [
      {
        name: 'fix',
        type: 'boolean',
        required: false,
        description: 'Whether to auto-fix lint and format issues (default: false)',
      },
    ],
    execute: (cwd: string, args: Record<string, unknown>) =>
      cmdHealthCheck(cwd, { fix: (args.fix as boolean) || false }, false),
  },
];

// ─── Tool Definition Builder ────────────────────────────────────────────────

/**
 * Transform COMMAND_DESCRIPTORS into MCP-format tool definitions with JSON Schema inputSchema.
 */
function buildToolDefinitions(): McpToolDefinition[] {
  return COMMAND_DESCRIPTORS.map((desc) => {
    const properties: Record<
      string,
      { type: string; description: string; items?: { type: string } }
    > = {};
    const required: string[] = [];

    for (const param of desc.params) {
      const prop: { type: string; description: string; items?: { type: string } } = {
        description: param.description,
        type: 'string',
      };

      switch (param.type) {
        case 'string':
          prop.type = 'string';
          break;
        case 'number':
          prop.type = 'number';
          break;
        case 'boolean':
          prop.type = 'boolean';
          break;
        case 'array':
          prop.type = 'array';
          prop.items = { type: 'string' };
          break;
        case 'object':
          prop.type = 'object';
          break;
        default:
          prop.type = 'string';
      }

      properties[param.name] = prop;

      if (param.required) {
        required.push(param.name);
      }
    }

    const inputSchema: McpToolDefinition['inputSchema'] = {
      type: 'object',
      properties,
    };

    if (required.length > 0) {
      inputSchema.required = required;
    }

    return {
      name: desc.name,
      description: desc.description,
      inputSchema,
    };
  });
}

// ─── Output Capture ─────────────────────────────────────────────────────────

const EXIT_SENTINEL = '__MCP_EXEC_EXIT__';

/**
 * Execute a cmd* function while capturing stdout, stderr, and process.exit calls.
 *
 * The existing cmd* functions call output() which writes to stdout and calls process.exit(0),
 * or error() which writes to stderr and calls process.exit(1). We intercept these to capture
 * the output without actually exiting the process.
 */
function captureExecution(fn: () => void): CaptureResult {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  const origStdoutWrite = process.stdout.write;
  const origStderrWrite = process.stderr.write;
  const origExit = process.exit;

  process.stdout.write = function (data: unknown): boolean {
    stdout += String(data);
    return true;
  } as typeof process.stdout.write;

  process.stderr.write = function (data: unknown): boolean {
    stderr += String(data);
    return true;
  } as typeof process.stderr.write;

  process.exit = function (code?: number): never {
    exitCode = code as number;
    const err = new Error(EXIT_SENTINEL) as unknown as McpExitError;
    (err as McpExitError).__MCP_EXIT__ = true;
    (err as McpExitError).exitCode = code as number;
    throw err;
  } as typeof process.exit;

  try {
    fn();
  } catch (e) {
    if (e && (e as McpExitError).__MCP_EXIT__) {
      // Expected -- process.exit was intercepted
    } else {
      // Real error from the command
      process.stdout.write = origStdoutWrite;
      process.stderr.write = origStderrWrite;
      process.exit = origExit;
      throw e;
    }
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    process.exit = origExit;
  }

  return { stdout, stderr, exitCode };
}

/**
 * Async variant of captureExecution for async tool handlers.
 * Intercepts stdout/stderr/process.exit while awaiting the async function.
 */
async function captureExecutionAsync(fn: () => void | Promise<void>): Promise<CaptureResult> {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  const origStdoutWrite = process.stdout.write;
  const origStderrWrite = process.stderr.write;
  const origExit = process.exit;

  process.stdout.write = function (data: unknown): boolean {
    stdout += String(data);
    return true;
  } as typeof process.stdout.write;

  process.stderr.write = function (data: unknown): boolean {
    stderr += String(data);
    return true;
  } as typeof process.stderr.write;

  process.exit = function (code?: number): never {
    exitCode = code as number;
    const err = new Error(EXIT_SENTINEL) as unknown as McpExitError;
    (err as McpExitError).__MCP_EXIT__ = true;
    (err as McpExitError).exitCode = code as number;
    throw err;
  } as typeof process.exit;

  try {
    await fn();
  } catch (e) {
    if (e && (e as McpExitError).__MCP_EXIT__) {
      // Expected -- process.exit was intercepted
    } else {
      process.stdout.write = origStdoutWrite;
      process.stderr.write = origStderrWrite;
      process.exit = origExit;
      throw e;
    }
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    process.exit = origExit;
  }

  return { stdout, stderr, exitCode };
}

// ─── MCP Server Class ──────────────────────────────────────────────────────

/**
 * MCP Server implementing JSON-RPC 2.0 protocol.
 *
 * Handles: initialize, notifications/initialized, tools/list, tools/call.
 * Dispatches tool calls to GRD lib/ functions via the COMMAND_DESCRIPTORS registry.
 */
class McpServer {
  cwd: string;
  toolDefinitions: McpToolDefinition[];
  _initialized: boolean;
  _descriptorMap: Map<string, CommandDescriptor>;

  constructor(options: { cwd?: string } = {}) {
    this.cwd = options.cwd || process.cwd();
    this.toolDefinitions = buildToolDefinitions();
    this._initialized = false;

    // Build lookup map: toolName -> descriptor
    this._descriptorMap = new Map();
    for (const desc of COMMAND_DESCRIPTORS) {
      this._descriptorMap.set(desc.name, desc);
    }
  }

  /**
   * Handle an incoming JSON-RPC 2.0 message and return a response (or null for notifications).
   */
  handleMessage(
    message: JsonRpcMessage
  ): JsonRpcResponse | Promise<JsonRpcResponse> | null {
    // Validate basic JSON-RPC structure
    if (!message || typeof message !== 'object') {
      return this._errorResponse(null, -32600, 'Invalid Request');
    }

    const { method, id, params } = message;

    if (!method || typeof method !== 'string') {
      return this._errorResponse(id || null, -32600, 'Invalid Request');
    }

    // Notifications (no id) -- no response expected
    if (id === undefined || id === null) {
      // Handle known notifications silently
      if (method === 'notifications/initialized') {
        this._initialized = true;
      }
      return null;
    }

    // Request methods
    switch (method) {
      case 'initialize':
        return this._handleInitialize(id, params);
      case 'tools/list':
        return this._handleToolsList(id);
      case 'tools/call':
        return this._handleToolsCall(id, params);
      default:
        return this._errorResponse(id, -32601, 'Method not found');
    }
  }

  /**
   * Handle initialize request -- return server capabilities and info.
   */
  _handleInitialize(
    id: number | string,
    _params?: Record<string, unknown>
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'grd-mcp-server',
          version: '0.1.0',
        },
      },
    };
  }

  /**
   * Handle tools/list request -- return all tool definitions.
   */
  _handleToolsList(id: number | string): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: this.toolDefinitions,
      },
    };
  }

  /**
   * Handle tools/call request -- validate params, execute tool, return result.
   */
  _handleToolsCall(
    id: number | string,
    params?: Record<string, unknown>
  ): JsonRpcResponse | Promise<JsonRpcResponse> {
    if (!params || !params.name) {
      return this._errorResponse(id, -32602, 'Invalid params', { missing: ['name'] });
    }

    const toolName = params.name as string;
    const toolArgs = (params.arguments as Record<string, unknown>) || {};

    const descriptor = this._descriptorMap.get(toolName);
    if (!descriptor) {
      return this._errorResponse(id, -32601, 'Method not found', { tool: toolName });
    }

    // Validate required params
    const missingParams: string[] = [];
    for (const param of descriptor.params) {
      if (
        param.required &&
        (toolArgs[param.name] === undefined || toolArgs[param.name] === null)
      ) {
        missingParams.push(param.name);
      }
    }

    if (missingParams.length > 0) {
      return this._errorResponse(id, -32602, 'Invalid params', { missing: missingParams });
    }

    // Execute the tool
    return this._executeTool(id, descriptor, toolArgs);
  }

  /**
   * Execute a tool by calling its cmd* function with output capture.
   */
  _executeTool(
    id: number | string,
    descriptor: CommandDescriptor,
    args: Record<string, unknown>
  ): JsonRpcResponse | Promise<JsonRpcResponse> {
    // Async handlers (declared with async keyword) use async capture
    if (descriptor.execute.constructor.name === 'AsyncFunction') {
      return this._executeToolAsync(id, descriptor, args);
    }

    try {
      const result = captureExecution(() => {
        descriptor.execute(this.cwd, args);
      });

      return this._formatToolResult(id, result);
    } catch (e) {
      return this._errorResponse(id, -32603, 'Internal error', {
        error: (e as Error).message || String(e),
      });
    }
  }

  /**
   * Async variant of _executeTool for async tool handlers.
   */
  async _executeToolAsync(
    id: number | string,
    descriptor: CommandDescriptor,
    args: Record<string, unknown>
  ): Promise<JsonRpcResponse> {
    try {
      const result = await captureExecutionAsync(() => {
        return descriptor.execute(this.cwd, args) as void | Promise<void>;
      });
      return this._formatToolResult(id, result);
    } catch (e) {
      return this._errorResponse(id, -32603, 'Internal error', {
        error: (e as Error).message || String(e),
      });
    }
  }

  /**
   * Format captured execution result into a JSON-RPC response.
   */
  _formatToolResult(id: number | string, result: CaptureResult): JsonRpcResponse {
    if (result.exitCode !== 0) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: result.stderr || result.stdout || 'Command failed',
            },
          ],
          isError: true,
        },
      };
    }

    let text: string = result.stdout;
    try {
      const parsed: unknown = JSON.parse(text);
      text = JSON.stringify(parsed, null, 2);
    } catch {
      // Not JSON -- use raw text
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text,
          },
        ],
      },
    };
  }

  /**
   * Build a JSON-RPC error response.
   */
  _errorResponse(
    id: number | string | null,
    code: number,
    message: string,
    data?: unknown
  ): JsonRpcResponse {
    const error: { code: number; message: string; data?: unknown } = { code, message };
    if (data) {
      error.data = data;
    }
    return {
      jsonrpc: '2.0',
      id,
      error,
    };
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  McpServer,
  buildToolDefinitions,
  COMMAND_DESCRIPTORS,
  captureExecution,
};
