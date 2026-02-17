/**
 * GRD MCP Server — Model Context Protocol server exposing all GRD CLI commands as MCP tools.
 *
 * Implements JSON-RPC 2.0 over stdio transport. Zero external runtime dependencies (Node.js built-ins only).
 * All tool definitions are auto-generated from a declarative COMMAND_DESCRIPTORS table.
 *
 * Created in Phase 16 Plan 01 (MCP Server).
 */

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
} = require('./state');

const {
  cmdFrontmatterGet,
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
} = require('./frontmatter');

const { cmdRoadmapGetPhase, cmdPhaseNextDecimal, cmdRoadmapAnalyze } = require('./roadmap');
const { cmdTemplateSelect, cmdTemplateFill, cmdScaffold } = require('./scaffold');

const {
  cmdVerifySummary,
  cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness,
  cmdVerifyReferences,
  cmdVerifyCommits,
  cmdVerifyArtifacts,
  cmdVerifyKeyLinks,
} = require('./verify');

const {
  cmdPhasesList,
  cmdPhaseAdd,
  cmdPhaseInsert,
  cmdPhaseRemove,
  cmdPhaseComplete,
  cmdMilestoneComplete,
  cmdValidateConsistency,
} = require('./phase');

const { cmdTracker } = require('./tracker');

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
} = require('./context');

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
} = require('./commands');

// ─── Command Descriptor Table ───────────────────────────────────────────────
//
// Each descriptor declares: name, description, params (with type, required, description).
// The buildToolDefinitions() function transforms these into MCP-format tool definitions.

const COMMAND_DESCRIPTORS = [
  // ── State commands ──
  {
    name: 'grd_state_load',
    description: 'Load full project config, state, and roadmap status',
    params: [],
    execute: (cwd, _args) => cmdStateLoad(cwd, false),
  },
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
    execute: (cwd, args) => cmdStateGet(cwd, args.section || undefined, false),
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
    execute: (cwd, args) => cmdStatePatch(cwd, args.patches || {}, false),
  },
  {
    name: 'grd_state_update',
    description: 'Update a single STATE.md field',
    params: [
      { name: 'field', type: 'string', required: true, description: 'Field name to update' },
      { name: 'value', type: 'string', required: true, description: 'New value for the field' },
    ],
    execute: (cwd, args) => cmdStateUpdate(cwd, args.field, args.value),
  },
  {
    name: 'grd_state_advance_plan',
    description: 'Increment the current plan counter in STATE.md',
    params: [],
    execute: (cwd, _args) => cmdStateAdvancePlan(cwd, false),
  },
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
    execute: (cwd, args) =>
      cmdStateRecordMetric(
        cwd,
        {
          phase: args.phase,
          plan: args.plan,
          duration: args.duration,
          tasks: args.tasks || null,
          files: args.files || null,
        },
        false
      ),
  },
  {
    name: 'grd_state_update_progress',
    description: 'Recalculate progress bar from disk state',
    params: [],
    execute: (cwd, _args) => cmdStateUpdateProgress(cwd, false),
  },
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
    execute: (cwd, args) =>
      cmdStateAddDecision(
        cwd,
        {
          summary: args.summary,
          phase: args.phase || null,
          rationale: args.rationale || '',
        },
        false
      ),
  },
  {
    name: 'grd_state_add_blocker',
    description: 'Add a blocker to STATE.md',
    params: [{ name: 'text', type: 'string', required: true, description: 'Blocker description' }],
    execute: (cwd, args) => cmdStateAddBlocker(cwd, args.text, false),
  },
  {
    name: 'grd_state_resolve_blocker',
    description: 'Resolve a blocker in STATE.md',
    params: [
      { name: 'text', type: 'string', required: true, description: 'Blocker text to resolve' },
    ],
    execute: (cwd, args) => cmdStateResolveBlocker(cwd, args.text, false),
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
    execute: (cwd, args) =>
      cmdStateRecordSession(
        cwd,
        {
          stopped_at: args.stopped_at,
          resume_file: args.resume_file || 'None',
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
    execute: (cwd, args) => cmdResolveModel(cwd, args.agent_type, false),
  },
  {
    name: 'grd_find_phase',
    description: 'Find a phase directory by number and list its plans and summaries',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase identifier to find' },
    ],
    execute: (cwd, args) => cmdFindPhase(cwd, args.phase, false),
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
    execute: (cwd, args) =>
      cmdCommit(cwd, args.message, args.files || [], false, args.amend || false),
  },

  // ── Verify commands ──
  {
    name: 'grd_verify_summary',
    description: 'Verify a SUMMARY.md file structure and content',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Path to the SUMMARY.md file' },
      { name: 'check_count', type: 'number', required: false, description: 'Expected task count' },
    ],
    execute: (cwd, args) => cmdVerifySummary(cwd, args.file, args.check_count || 2, false),
  },
  {
    name: 'grd_verify_plan_structure',
    description: 'Validate a PLAN.md file structure and frontmatter',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Path to the PLAN.md file' },
    ],
    execute: (cwd, args) => cmdVerifyPlanStructure(cwd, args.file, false),
  },
  {
    name: 'grd_verify_phase_completeness',
    description: 'Check that all plans in a phase have corresponding summaries',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number or directory' },
    ],
    execute: (cwd, args) => cmdVerifyPhaseCompleteness(cwd, args.phase, false),
  },
  {
    name: 'grd_verify_references',
    description: 'Validate @-references and file paths in a file',
    params: [
      { name: 'file', type: 'string', required: true, description: 'File to check references in' },
    ],
    execute: (cwd, args) => cmdVerifyReferences(cwd, args.file, false),
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
    execute: (cwd, args) => cmdVerifyCommits(cwd, args.hashes || [], false),
  },
  {
    name: 'grd_verify_artifacts',
    description: 'Check that must_haves.artifacts from a plan file exist on disk',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Path to the PLAN.md file' },
    ],
    execute: (cwd, args) => cmdVerifyArtifacts(cwd, args.file, false),
  },
  {
    name: 'grd_verify_key_links',
    description: 'Validate must_haves.key_links patterns between source files',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Path to the PLAN.md file' },
    ],
    execute: (cwd, args) => cmdVerifyKeyLinks(cwd, args.file, false),
  },

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
    execute: (cwd, args) => cmdTemplateSelect(cwd, args.type, false),
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
    execute: (cwd, args) =>
      cmdTemplateFill(
        cwd,
        args.template,
        {
          phase: args.phase || null,
          plan: args.plan || null,
          name: args.name || null,
          type: args.type || 'execute',
          wave: args.wave || '1',
          fields: args.fields || {},
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
    execute: (cwd, args) =>
      cmdScaffold(
        cwd,
        args.type,
        {
          phase: args.phase || null,
          name: args.name || null,
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
    execute: (cwd, args) => cmdFrontmatterGet(cwd, args.file, args.field || null, false),
  },
  {
    name: 'grd_frontmatter_set',
    description: 'Set a frontmatter field in a markdown file',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Markdown file path' },
      { name: 'field', type: 'string', required: true, description: 'Field name to set' },
      { name: 'value', type: 'string', required: true, description: 'Value to set' },
    ],
    execute: (cwd, args) => cmdFrontmatterSet(cwd, args.file, args.field, args.value, false),
  },
  {
    name: 'grd_frontmatter_merge',
    description: 'Merge data into frontmatter of a markdown file',
    params: [
      { name: 'file', type: 'string', required: true, description: 'Markdown file path' },
      { name: 'data', type: 'string', required: true, description: 'JSON string of data to merge' },
    ],
    execute: (cwd, args) => cmdFrontmatterMerge(cwd, args.file, args.data, false),
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
    execute: (cwd, args) => cmdFrontmatterValidate(cwd, args.file, args.schema || null, false),
  },

  // ── Utility commands ──
  {
    name: 'grd_generate_slug',
    description: 'Generate a kebab-case slug from input text',
    params: [
      { name: 'text', type: 'string', required: true, description: 'Text to convert to slug' },
    ],
    execute: (_cwd, args) => cmdGenerateSlug(args.text, false),
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
    execute: (_cwd, args) => cmdCurrentTimestamp(args.format || 'full', false),
  },
  {
    name: 'grd_list_todos',
    description: 'List pending todo files with optional area filter',
    params: [
      { name: 'area', type: 'string', required: false, description: 'Area filter (e.g. general)' },
    ],
    execute: (cwd, args) => cmdListTodos(cwd, args.area || undefined, false),
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
    execute: (cwd, args) => cmdTodoComplete(cwd, args.filename, false),
  },
  {
    name: 'grd_verify_path_exists',
    description: 'Check if a path exists in the project and report its type',
    params: [
      { name: 'path', type: 'string', required: true, description: 'Path to check for existence' },
    ],
    execute: (cwd, args) => cmdVerifyPathExists(cwd, args.path, false),
  },
  {
    name: 'grd_config_ensure_section',
    description: 'Ensure config.json exists with required sections',
    params: [],
    execute: (cwd, _args) => cmdConfigEnsureSection(cwd, false),
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
    execute: (cwd, args) => cmdConfigSet(cwd, args.key, args.value, false),
  },
  {
    name: 'grd_history_digest',
    description: 'Aggregate metrics, decisions, and tech stack from all SUMMARY.md files',
    params: [],
    execute: (cwd, _args) => cmdHistoryDigest(cwd, false),
  },

  // ── Phases ──
  {
    name: 'grd_phases_list',
    description: 'List all phases with optional type or phase filter',
    params: [
      { name: 'type', type: 'string', required: false, description: 'Filter by phase type' },
      { name: 'phase', type: 'string', required: false, description: 'Filter by phase number' },
    ],
    execute: (cwd, args) =>
      cmdPhasesList(cwd, { type: args.type || null, phase: args.phase || null }, false),
  },

  // ── Roadmap ──
  {
    name: 'grd_roadmap_get_phase',
    description: 'Get roadmap section for a specific phase',
    params: [{ name: 'phase', type: 'string', required: true, description: 'Phase number' }],
    execute: (cwd, args) => cmdRoadmapGetPhase(cwd, args.phase, false),
  },
  {
    name: 'grd_roadmap_analyze',
    description: 'Analyze roadmap structure and status',
    params: [],
    execute: (cwd, _args) => cmdRoadmapAnalyze(cwd, false),
  },

  // ── Phase operations ──
  {
    name: 'grd_phase_next_decimal',
    description: 'Get the next decimal phase number after a given phase',
    params: [{ name: 'phase', type: 'string', required: true, description: 'Base phase number' }],
    execute: (cwd, args) => cmdPhaseNextDecimal(cwd, args.phase, false),
  },
  {
    name: 'grd_phase_add',
    description: 'Add a new phase to the roadmap',
    params: [
      { name: 'description', type: 'string', required: true, description: 'Phase description' },
    ],
    execute: (cwd, args) => cmdPhaseAdd(cwd, args.description, false),
  },
  {
    name: 'grd_phase_insert',
    description: 'Insert a phase at a specific position in the roadmap',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number to insert at' },
      { name: 'description', type: 'string', required: true, description: 'Phase description' },
    ],
    execute: (cwd, args) => cmdPhaseInsert(cwd, args.phase, args.description, false),
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
    execute: (cwd, args) => cmdPhaseRemove(cwd, args.phase, { force: args.force || false }, false),
  },
  {
    name: 'grd_phase_complete',
    description: 'Mark a phase as complete',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number to complete' },
    ],
    execute: (cwd, args) => cmdPhaseComplete(cwd, args.phase, false),
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
    execute: (cwd, args) =>
      cmdMilestoneComplete(cwd, args.version, { name: args.name || null }, false),
  },

  // ── Validate ──
  {
    name: 'grd_validate_consistency',
    description: 'Validate phase numbering and disk/roadmap sync',
    params: [],
    execute: (cwd, _args) => cmdValidateConsistency(cwd, false),
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
    execute: (cwd, args) => cmdProgressRender(cwd, args.format || 'json', false),
  },

  // ── Todo ──
  // (grd_todo_complete is already defined above under utility commands)

  // ── Phase Plan Index ──
  {
    name: 'grd_phase_plan_index',
    description: 'Index plans in a phase with wave grouping and completion status',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number to index' },
    ],
    execute: (cwd, args) => cmdPhasePlanIndex(cwd, args.phase, false),
  },

  // ── State Snapshot ──
  {
    name: 'grd_state_snapshot',
    description: 'Structured parse of STATE.md',
    params: [],
    execute: (cwd, _args) => cmdStateSnapshot(cwd, false),
  },

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
    execute: (cwd, args) =>
      cmdSummaryExtract(cwd, args.file, args.fields ? args.fields.split(',') : null, false),
  },

  // ── Tracker (12 subcommands) ──
  {
    name: 'grd_tracker_get_config',
    description: 'Get tracker configuration',
    params: [],
    execute: (cwd, _args) => cmdTracker(cwd, 'get-config', [], false),
  },
  {
    name: 'grd_tracker_sync_roadmap',
    description: 'Sync roadmap to issue tracker',
    params: [],
    execute: (cwd, _args) => cmdTracker(cwd, 'sync-roadmap', [], false),
  },
  {
    name: 'grd_tracker_sync_phase',
    description: 'Sync a phase to issue tracker',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number to sync' },
    ],
    execute: (cwd, args) => cmdTracker(cwd, 'sync-phase', [args.phase], false),
  },
  {
    name: 'grd_tracker_update_status',
    description: 'Update phase status in tracker',
    params: [
      { name: 'phase', type: 'string', required: true, description: 'Phase number' },
      { name: 'status', type: 'string', required: true, description: 'New status' },
    ],
    execute: (cwd, args) => cmdTracker(cwd, 'update-status', [args.phase, args.status], false),
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
    execute: (cwd, args) => cmdTracker(cwd, 'add-comment', [args.phase, args.file], false),
  },
  {
    name: 'grd_tracker_sync_status',
    description: 'Sync all phase statuses to tracker',
    params: [],
    execute: (cwd, _args) => cmdTracker(cwd, 'sync-status', [], false),
  },
  {
    name: 'grd_tracker_schedule',
    description: 'Compute and display schedule for tracker sync',
    params: [],
    execute: (cwd, _args) => cmdTracker(cwd, 'schedule', [], false),
  },
  {
    name: 'grd_tracker_prepare_reschedule',
    description: 'Prepare reschedule data for tracker',
    params: [],
    execute: (cwd, _args) => cmdTracker(cwd, 'prepare-reschedule', [], false),
  },
  {
    name: 'grd_tracker_prepare_roadmap_sync',
    description: 'Prepare roadmap sync payload for tracker',
    params: [],
    execute: (cwd, _args) => cmdTracker(cwd, 'prepare-roadmap-sync', [], false),
  },
  {
    name: 'grd_tracker_prepare_phase_sync',
    description: 'Prepare phase sync payload for tracker',
    params: [{ name: 'phase', type: 'string', required: true, description: 'Phase number' }],
    execute: (cwd, args) => cmdTracker(cwd, 'prepare-phase-sync', [args.phase], false),
  },
  {
    name: 'grd_tracker_record_mapping',
    description: 'Record tracker mapping entry',
    params: [{ name: 'args', type: 'array', required: true, description: 'Mapping arguments' }],
    execute: (cwd, args) => cmdTracker(cwd, 'record-mapping', args.args || [], false),
  },
  {
    name: 'grd_tracker_record_status',
    description: 'Record tracker status update',
    params: [{ name: 'args', type: 'array', required: true, description: 'Status arguments' }],
    execute: (cwd, args) => cmdTracker(cwd, 'record-status', args.args || [], false),
  },

  // ── Dashboard, Phase Detail, Health ──
  {
    name: 'grd_dashboard',
    description: 'Render full project dashboard with milestones, phases, plans, and timeline',
    params: [],
    execute: (cwd, _args) => cmdDashboard(cwd, true),
  },
  {
    name: 'grd_phase_detail',
    description: 'Render detailed drill-down for a single phase',
    params: [{ name: 'phase', type: 'string', required: true, description: 'Phase number' }],
    execute: (cwd, args) => cmdPhaseDetail(cwd, args.phase, true),
  },
  {
    name: 'grd_health',
    description:
      'Display project health indicators including blockers, deferred validations, velocity, and risks',
    params: [],
    execute: (cwd, _args) => cmdHealth(cwd, true),
  },
  {
    name: 'grd_detect_backend',
    description: 'Detect the current AI coding CLI backend and capabilities',
    params: [],
    execute: (cwd, _args) => cmdDetectBackend(cwd, false),
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
    execute: (cwd, args) =>
      cmdInitExecutePhase(
        cwd,
        args.phase,
        new Set(args.include ? args.include.split(',') : []),
        false
      ),
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
    execute: (cwd, args) =>
      cmdInitPlanPhase(
        cwd,
        args.phase,
        new Set(args.include ? args.include.split(',') : []),
        false
      ),
  },
  {
    name: 'grd_init_new_project',
    description: 'Initialize context for new-project workflow',
    params: [],
    execute: (cwd, _args) => cmdInitNewProject(cwd, false),
  },
  {
    name: 'grd_init_new_milestone',
    description: 'Initialize context for new-milestone workflow',
    params: [],
    execute: (cwd, _args) => cmdInitNewMilestone(cwd, false),
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
    execute: (cwd, args) => cmdInitQuick(cwd, args.description || '', false),
  },
  {
    name: 'grd_init_resume',
    description: 'Initialize context for resume workflow',
    params: [],
    execute: (cwd, _args) => cmdInitResume(cwd, false),
  },
  {
    name: 'grd_init_verify_work',
    description: 'Initialize context for verify-work workflow',
    params: [{ name: 'phase', type: 'string', required: true, description: 'Phase number' }],
    execute: (cwd, args) => cmdInitVerifyWork(cwd, args.phase, false),
  },
  {
    name: 'grd_init_phase_op',
    description: 'Initialize context for phase-op workflow',
    params: [{ name: 'phase', type: 'string', required: true, description: 'Phase number' }],
    execute: (cwd, args) => cmdInitPhaseOp(cwd, args.phase, false),
  },
  {
    name: 'grd_init_todos',
    description: 'Initialize context for todos workflow',
    params: [{ name: 'area', type: 'string', required: false, description: 'Area filter' }],
    execute: (cwd, args) => cmdInitTodos(cwd, args.area || undefined, false),
  },
  {
    name: 'grd_init_milestone_op',
    description: 'Initialize context for milestone-op workflow',
    params: [],
    execute: (cwd, _args) => cmdInitMilestoneOp(cwd, false),
  },
  {
    name: 'grd_init_plan_milestone_gaps',
    description: 'Initialize context for plan-milestone-gaps workflow',
    params: [],
    execute: (cwd, _args) => cmdInitPlanMilestoneGaps(cwd, false),
  },
  {
    name: 'grd_init_map_codebase',
    description: 'Initialize context for map-codebase workflow',
    params: [],
    execute: (cwd, _args) => cmdInitMapCodebase(cwd, false),
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
    execute: (cwd, args) =>
      cmdInitProgress(cwd, new Set(args.include ? args.include.split(',') : []), false),
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
    execute: (cwd, args) =>
      cmdInitResearchWorkflow(
        cwd,
        'survey',
        args.topic || '',
        new Set(args.include ? args.include.split(',') : []),
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
    execute: (cwd, args) =>
      cmdInitResearchWorkflow(
        cwd,
        'deep-dive',
        args.paper || '',
        new Set(args.include ? args.include.split(',') : []),
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
    execute: (cwd, args) =>
      cmdInitResearchWorkflow(
        cwd,
        'feasibility',
        args.approach || '',
        new Set(args.include ? args.include.split(',') : []),
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
    execute: (cwd, args) =>
      cmdInitResearchWorkflow(
        cwd,
        'eval-plan',
        args.description || '',
        new Set(args.include ? args.include.split(',') : []),
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
    execute: (cwd, args) =>
      cmdInitResearchWorkflow(
        cwd,
        'eval-report',
        args.description || '',
        new Set(args.include ? args.include.split(',') : []),
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
    execute: (cwd, args) =>
      cmdInitResearchWorkflow(
        cwd,
        'assess-baseline',
        args.description || '',
        new Set(args.include ? args.include.split(',') : []),
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
    execute: (cwd, args) =>
      cmdInitResearchWorkflow(
        cwd,
        'product-plan',
        args.description || '',
        new Set(args.include ? args.include.split(',') : []),
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
    execute: (cwd, args) =>
      cmdInitResearchWorkflow(
        cwd,
        'iterate',
        args.description || '',
        new Set(args.include ? args.include.split(',') : []),
        false
      ),
  },

  // ── Long-Term Roadmap (12 subcommands) ──
  {
    name: 'grd_long_term_roadmap_list',
    description: 'List all LT milestones',
    params: [],
    execute: (cwd, _args) => cmdLongTermRoadmap(cwd, 'list', [], false),
  },
  {
    name: 'grd_long_term_roadmap_add',
    description: 'Add a new LT milestone',
    params: [
      { name: 'name', type: 'string', required: true, description: 'LT milestone name' },
      { name: 'goal', type: 'string', required: true, description: 'LT milestone goal' },
    ],
    execute: (cwd, args) =>
      cmdLongTermRoadmap(cwd, 'add', ['--name', args.name, '--goal', args.goal], false),
  },
  {
    name: 'grd_long_term_roadmap_remove',
    description: 'Remove an LT milestone (protected if shipped)',
    params: [
      { name: 'id', type: 'string', required: true, description: 'LT milestone ID (e.g. LT-2)' },
    ],
    execute: (cwd, args) => cmdLongTermRoadmap(cwd, 'remove', ['--id', args.id], false),
  },
  {
    name: 'grd_long_term_roadmap_update',
    description: 'Update LT milestone fields (name, goal, status)',
    params: [
      { name: 'id', type: 'string', required: true, description: 'LT milestone ID' },
      { name: 'name', type: 'string', required: false, description: 'New name' },
      { name: 'goal', type: 'string', required: false, description: 'New goal' },
      { name: 'status', type: 'string', required: false, description: 'New status (completed/active/planned)' },
    ],
    execute: (cwd, args) => {
      const subArgs = ['--id', args.id];
      if (args.name) subArgs.push('--name', args.name);
      if (args.goal) subArgs.push('--goal', args.goal);
      if (args.status) subArgs.push('--status', args.status);
      return cmdLongTermRoadmap(cwd, 'update', subArgs, false);
    },
  },
  {
    name: 'grd_long_term_roadmap_link',
    description: 'Link a normal milestone to an LT milestone',
    params: [
      { name: 'id', type: 'string', required: true, description: 'LT milestone ID' },
      { name: 'version', type: 'string', required: true, description: 'Normal milestone version' },
      { name: 'note', type: 'string', required: false, description: 'Optional note (e.g. "planned")' },
    ],
    execute: (cwd, args) => {
      const subArgs = ['--id', args.id, '--version', args.version];
      if (args.note) subArgs.push('--note', args.note);
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
    execute: (cwd, args) =>
      cmdLongTermRoadmap(cwd, 'unlink', ['--id', args.id, '--version', args.version], false),
  },
  {
    name: 'grd_long_term_roadmap_init',
    description: 'Auto-group existing ROADMAP.md milestones into LT-1',
    params: [
      { name: 'project', type: 'string', required: false, description: 'Project name' },
    ],
    execute: (cwd, args) => {
      const subArgs = args.project ? ['--project', args.project] : [];
      return cmdLongTermRoadmap(cwd, 'init', subArgs, false);
    },
  },
  {
    name: 'grd_long_term_roadmap_display',
    description: 'Display the long-term roadmap in formatted text',
    params: [],
    execute: (cwd, _args) => cmdLongTermRoadmap(cwd, 'display', [], false),
  },
  {
    name: 'grd_long_term_roadmap_parse',
    description: 'Parse the long-term roadmap file into structured data',
    params: [
      { name: 'file', type: 'string', required: false, description: 'Path to LONG-TERM-ROADMAP.md' },
    ],
    execute: (cwd, args) => cmdLongTermRoadmap(cwd, 'parse', args.file ? [args.file] : [], false),
  },
  {
    name: 'grd_long_term_roadmap_validate',
    description: 'Validate the long-term roadmap structure',
    params: [
      { name: 'file', type: 'string', required: false, description: 'Path to LONG-TERM-ROADMAP.md' },
    ],
    execute: (cwd, args) =>
      cmdLongTermRoadmap(cwd, 'validate', args.file ? [args.file] : [], false),
  },
  {
    name: 'grd_long_term_roadmap_refine',
    description: 'Output context for AI discussion of an LT milestone',
    params: [
      { name: 'id', type: 'string', required: true, description: 'LT milestone ID' },
    ],
    execute: (cwd, args) => cmdLongTermRoadmap(cwd, 'refine', ['--id', args.id], false),
  },
  {
    name: 'grd_long_term_roadmap_history',
    description: 'Update refinement history in the long-term roadmap',
    params: [
      { name: 'action', type: 'string', required: true, description: 'History action' },
      { name: 'details', type: 'string', required: true, description: 'Action details' },
    ],
    execute: (cwd, args) =>
      cmdLongTermRoadmap(
        cwd,
        'history',
        ['--action', args.action, '--details', args.details],
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
    execute: (cwd, args) => cmdQualityAnalysis(cwd, ['--phase', args.phase], false),
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
    execute: (cwd, args) => cmdRequirementGet(cwd, args.req_id, false),
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
    execute: (cwd, args) =>
      cmdRequirementList(
        cwd,
        {
          phase: args.phase || null,
          priority: args.priority || null,
          status: args.status || null,
          category: args.category || null,
          all: args.all || false,
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
    execute: (cwd, args) => cmdRequirementTraceability(cwd, { phase: args.phase || null }, false),
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
    execute: (cwd, args) => cmdRequirementUpdateStatus(cwd, args.req_id, args.status, false),
  },
  {
    name: 'grd_search',
    description: 'Search across all .planning/ markdown files for a text query',
    params: [
      { name: 'query', type: 'string', required: true, description: 'Text query to search for' },
    ],
    execute: (cwd, args) => cmdSearch(cwd, args.query, false),
  },
];

// ─── Tool Definition Builder ────────────────────────────────────────────────

/**
 * Transform COMMAND_DESCRIPTORS into MCP-format tool definitions with JSON Schema inputSchema.
 * @returns {Array<{name: string, description: string, inputSchema: Object}>}
 */
function buildToolDefinitions() {
  return COMMAND_DESCRIPTORS.map((desc) => {
    const properties = {};
    const required = [];

    for (const param of desc.params) {
      const prop = { description: param.description };

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

    const inputSchema = {
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
 *
 * @param {Function} fn - Function to execute
 * @returns {{ stdout: string, stderr: string, exitCode: number }}
 */
function captureExecution(fn) {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  const origStdoutWrite = process.stdout.write;
  const origStderrWrite = process.stderr.write;
  const origExit = process.exit;

  process.stdout.write = function (data) {
    stdout += String(data);
    return true;
  };

  process.stderr.write = function (data) {
    stderr += String(data);
    return true;
  };

  process.exit = function (code) {
    exitCode = code;
    const err = new Error(EXIT_SENTINEL);
    err.__MCP_EXIT__ = true;
    err.exitCode = code;
    throw err;
  };

  try {
    fn();
  } catch (e) {
    if (e && e.__MCP_EXIT__) {
      // Expected — process.exit was intercepted
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

// ─── MCP Server Class ──────────────────────────────────────────────────────

/**
 * MCP Server implementing JSON-RPC 2.0 protocol.
 *
 * Handles: initialize, notifications/initialized, tools/list, tools/call.
 * Dispatches tool calls to GRD lib/ functions via the COMMAND_DESCRIPTORS registry.
 */
class McpServer {
  /**
   * @param {Object} options
   * @param {string} [options.cwd] - Working directory (defaults to process.cwd())
   */
  constructor(options = {}) {
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
   *
   * @param {Object} message - Parsed JSON-RPC message
   * @returns {Object|null} JSON-RPC response, or null for notifications
   */
  handleMessage(message) {
    // Validate basic JSON-RPC structure
    if (!message || typeof message !== 'object') {
      return this._errorResponse(null, -32600, 'Invalid Request');
    }

    const { method, id, params } = message;

    if (!method || typeof method !== 'string') {
      return this._errorResponse(id || null, -32600, 'Invalid Request');
    }

    // Notifications (no id) — no response expected
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
   * Handle initialize request — return server capabilities and info.
   * @param {number|string} id
   * @param {Object} params
   * @returns {Object} JSON-RPC response
   */
  _handleInitialize(id, _params) {
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
   * Handle tools/list request — return all tool definitions.
   * @param {number|string} id
   * @returns {Object} JSON-RPC response
   */
  _handleToolsList(id) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: this.toolDefinitions,
      },
    };
  }

  /**
   * Handle tools/call request — validate params, execute tool, return result.
   * @param {number|string} id
   * @param {Object} params - { name: string, arguments: Object }
   * @returns {Object} JSON-RPC response
   */
  _handleToolsCall(id, params) {
    if (!params || !params.name) {
      return this._errorResponse(id, -32602, 'Invalid params', { missing: ['name'] });
    }

    const toolName = params.name;
    const toolArgs = params.arguments || {};

    const descriptor = this._descriptorMap.get(toolName);
    if (!descriptor) {
      return this._errorResponse(id, -32601, 'Method not found', { tool: toolName });
    }

    // Validate required params
    const missingParams = [];
    for (const param of descriptor.params) {
      if (param.required && (toolArgs[param.name] === undefined || toolArgs[param.name] === null)) {
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
   * @param {number|string} id
   * @param {Object} descriptor - Command descriptor
   * @param {Object} args - Tool arguments
   * @returns {Object} JSON-RPC response
   */
  _executeTool(id, descriptor, args) {
    try {
      const result = captureExecution(() => {
        descriptor.execute(this.cwd, args);
      });

      if (result.exitCode !== 0) {
        // Command failed — return as tool error content
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

      // Try to parse stdout as JSON for structured result
      let text = result.stdout;
      try {
        // Verify it's valid JSON and re-stringify for clean formatting
        const parsed = JSON.parse(text);
        text = JSON.stringify(parsed, null, 2);
      } catch {
        // Not JSON — use raw text
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
    } catch (e) {
      return this._errorResponse(id, -32603, 'Internal error', {
        error: e.message || String(e),
      });
    }
  }

  /**
   * Build a JSON-RPC error response.
   * @param {number|string|null} id
   * @param {number} code - JSON-RPC error code
   * @param {string} message - Error message
   * @param {Object} [data] - Additional error data
   * @returns {Object} JSON-RPC error response
   */
  _errorResponse(id, code, message, data) {
    const error = { code, message };
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
