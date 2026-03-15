'use strict';

/**
 * GRD Core Type Definitions -- Shared interfaces and type aliases for the entire codebase
 *
 * This module is pure type definitions with no runtime code. It serves as the
 * single source of truth for TypeScript interfaces used across all GRD modules.
 *
 * Pattern:
 *   - `module.exports = {}` allows `require('./types')` from JS modules (returns empty object)
 *   - `export type { ... }` allows `import type { ... } from './types'` from TS modules
 *
 * @module types
 */

// ─── Backend Types (from backend.js) ─────────────────────────────────────────

/**
 * Valid backend identifiers for AI coding CLI detection.
 */
export type BackendId = 'claude' | 'codex' | 'gemini' | 'opencode' | 'overstory' | 'superpowers' | 'grd';

/**
 * Abstract model tiers mapped to backend-specific model names.
 */
export type ModelTier = 'opus' | 'sonnet' | 'haiku';

/**
 * Configuration profile names controlling model tier selection per agent.
 */
export type ModelProfileName = 'quality' | 'balanced' | 'budget';

/**
 * Effort levels for controlling reasoning depth in supported backends.
 * Claude Code v2.1.68+: low (fast), medium (default for Opus 4.6), high (ultrathink).
 */
export type EffortLevel = 'low' | 'medium' | 'high';

/**
 * Maps agent types to effort level selections per model profile.
 * Parallels AgentModelProfiles but for the effort dimension.
 */
export type AgentEffortProfiles = Record<
  string,
  Record<ModelProfileName, EffortLevel>
>;

/**
 * Maps abstract model tiers to backend-specific model name strings.
 */
export interface ModelTierMap {
  opus: string;
  sonnet: string;
  haiku: string;
}

/**
 * Capability flags describing what orchestration features a backend supports.
 * `subagents` can be boolean or string ('experimental') for partial support.
 */
export interface BackendCapabilities {
  subagents: boolean | string;
  parallel: boolean;
  teams: boolean;
  hooks: boolean;
  mcp: boolean;
  native_worktree_isolation: boolean;
  effort: boolean;
  http_hooks: boolean;
  cron: boolean;
}

/**
 * Result of Chrome DevTools MCP availability detection.
 */
export interface WebMcpResult {
  available: boolean;
  source: string;
  reason?: string;
}

// ─── Config Types (from utils.js loadConfig) ─────────────────────────────────

/**
 * Timeout configuration values in milliseconds.
 */
export interface GrdTimeouts {
  jest_ms: number;
  lint_ms: number;
  format_ms: number;
  consistency_ms: number;
  tracker_gh_ms: number;
  tracker_auth_ms: number;
  backend_detect_ms: number;
  autopilot_check_ms: number;
}

/**
 * Ceremony configuration for scale-adaptive workflow control.
 */
export interface CeremonyConfig {
  default_level?: 'auto' | 'light' | 'standard' | 'full';
  phase_overrides?: Record<string, 'light' | 'standard' | 'full'>;
}

/**
 * Full GRD project configuration as returned by loadConfig().
 * All fields are populated with defaults when not present in config.json.
 */
export interface GrdConfig {
  model_profile: ModelProfileName;
  commit_docs: boolean;
  search_gitignored: boolean;
  branching_strategy: string;
  phase_branch_template: string;
  milestone_branch_template: string;
  base_branch: string;
  research: boolean;
  plan_checker: boolean;
  verifier: boolean;
  parallelization: boolean;
  code_review_enabled: boolean;
  code_review_timing: string;
  code_review_severity_gate: string;
  code_review_auto_fix_warnings: boolean;
  use_teams: boolean;
  team_timeout_minutes: number;
  max_concurrent_teammates: number;
  backend: string | undefined;
  backend_models: Record<string, ModelTierMap> | undefined;
  autonomous_mode: boolean;
  ceremony: CeremonyConfig | undefined;
  timeouts: GrdTimeouts;
  evolve: EvolveConfig | undefined;
  scheduler?: SchedulerConfig;
  superpowers?: SuperpowersConfig;
}

export interface EvolveConfig {
  auto_commit: boolean;
  create_pr: boolean;
}

// ─── Scheduler Types ─────────────────────────────────────────────────────────

/**
 * Options for spawning a backend subprocess.
 * Used by BackendAdapter and the scheduler spawn path.
 */
export interface SpawnOpts {
  timeout?: number;
  maxTurns?: number;
  model?: string;
  outputFormat?: string;
  captureOutput?: boolean;
  captureStderr?: boolean;
  cwd?: string;
  workItemId?: string;
  parallel?: boolean;
}

/**
 * Configuration for the cross-backend rate limit scheduler.
 * Controls backend priority, fallback, rate limits, and prediction parameters.
 */
export interface SchedulerConfig {
  backend_priority: AdapterBackendId[];
  free_fallback: { backend: AdapterBackendId; model?: string };
  backend_limits?: Record<string, { tpm: number; rpm?: number }>;
  prediction: {
    window_minutes: number;
    ewma_alpha: number;
    safety_margin_tasks: number;
    min_samples: number;
  };
}

/**
 * A single recorded usage sample from a backend spawn.
 * Used for EWMA token prediction and rate limit tracking.
 */
export interface UsageSample {
  backend: BackendId;
  stateKey?: string; // compound key for per-account state, e.g. "claude/~/.claude-personal"
  timestamp: number;
  duration: number;
  tokenEstimate: number;
  exitCode: number;
  workItemId: string;
}

/**
 * Per-backend usage state tracked by the scheduler.
 * Maintains sliding-window samples, EWMA estimates, and in-flight reservations.
 */
export interface BackendUsageState {
  samples: UsageSample[];
  ewma_tokens_per_task: number;
  tokens_consumed_in_window: number;
  tokens_reserved: number;
  in_flight_count: number;
  token_budget: number;
  budget_learned: boolean;
  budget_confidence: number;
  cooldown_until?: number;
}

/**
 * Result returned by the scheduler after a backend spawn completes.
 * Extends basic exit-code info with backend identity and token accounting.
 */
export interface SchedulerSpawnResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
  timedOut: boolean;
  backend: BackendId;
  tokensUsed: number;
  workItemId: string;
}

/**
 * Adapter interface for a backend CLI (claude, codex, gemini, opencode, overstory).
 * Encapsulates binary name, argument building, token parsing, and rate-limit detection.
 */
export interface BackendAdapter {
  binary: string;
  buildArgs(prompt: string, opts: SpawnOpts): string[];
  parseTokenUsage(stderr: string): number | null;
  isRateLimited(exitCode: number, stderr: string): boolean;
}

// ─── Phase and Milestone Types ───────────────────────────────────────────────

/**
 * Phase information returned by findPhaseInternal().
 * Contains directory paths, plan lists, and metadata flags.
 */
export interface PhaseInfo {
  found: boolean;
  directory: string;
  phase_number: string;
  phase_name: string | null;
  phase_slug: string | null;
  plans: string[];
  summaries: string[];
  incomplete_plans: string[];
  has_research: boolean;
  has_context: boolean;
  has_verification: boolean;
  consistency_warning: string | null;
}

/**
 * Milestone identification with version and display name.
 */
export interface MilestoneInfo {
  version: string;
  name: string;
}

// ─── State and Artifact Types (forward declarations for Phase 60+) ──────────

/**
 * Common STATE.md field names as optional string properties.
 * Used for typed access to STATE.md sections.
 */
export interface StateFields {
  updated?: string;
  active_phase?: string;
  current_plan?: string;
  milestone?: string;
  status?: string;
  progress?: string;
  next?: string;
  last_action?: string;
  stopped_at?: string;
  next_action?: string;
  context_needed?: string;
}

/**
 * Phase information parsed from ROADMAP.md.
 */
export interface RoadmapPhase {
  number: string;
  name: string;
  goal?: string;
  type?: string;
  depends_on?: string[];
  duration?: string;
  requirements?: string[];
  verification_level?: string;
  status: string;
  plans_count?: number;
  plans_complete?: number;
}

/**
 * YAML frontmatter as a record with common optional typed fields.
 */
export interface FrontmatterObject extends Record<string, unknown> {
  phase?: string;
  plan?: string | number;
  type?: string;
  wave?: number;
  depends_on?: string[];
  autonomous?: boolean;
  verification_level?: string;
  subsystem?: string;
  tags?: string[];
}

/**
 * MCP tool descriptor for registering tools in the MCP server.
 */
export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
  execute: (params: Record<string, string>) => Promise<string> | string;
}

// ─── Utility Types ───────────────────────────────────────────────────────────

/**
 * Result of a git command execution via execGit().
 */
export interface ExecGitResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Run-scoped file content cache with init/reset/get lifecycle.
 * Created by createRunCache() in utils.js.
 */
export interface RunCache {
  init: () => void;
  reset: () => void;
  get: (key: string, reader: (key: string) => unknown) => unknown;
}

/**
 * Model profile table mapping agent types to tier selections per profile.
 * Used by MODEL_PROFILES constant in utils.js.
 */
export type AgentModelProfiles = Record<
  string,
  Record<ModelProfileName, ModelTier>
>;

// ─── Gate Types (from gates.ts) ──────────────────────────────────────────────

/**
 * A gate check violation with code, severity, message, fix hint, and context.
 * Used by gates.ts, context.js, parallel.js, phase.js.
 */
export interface GateViolation {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  fix: string;
  context: Record<string, unknown>;
}

/**
 * Result returned by runPreflightGates().
 * Used by gates.ts, context.js, parallel.js.
 */
export interface PreflightResult {
  passed: boolean;
  bypassed: boolean;
  errors: GateViolation[];
  warnings: GateViolation[];
  command: string;
}

// ─── Cleanup Types (from cleanup.ts) ─────────────────────────────────────────

/**
 * Configuration for the phase_cleanup section of config.json.
 * Used by cleanup.ts, phase.js, commands.js.
 */
export interface CleanupConfig {
  enabled: boolean;
  refactoring: boolean;
  doc_sync: boolean;
  test_coverage: boolean;
  export_consistency: boolean;
  doc_staleness: boolean;
  config_schema: boolean;
  cleanup_threshold: number;
}

/**
 * Quality analysis summary counts from runQualityAnalysis.
 * Used by cleanup.ts, phase.js.
 */
export interface QualityAnalysisSummary {
  total_issues: number;
  complexity_violations: number;
  dead_exports: number;
  oversized_files: number;
  doc_drift_issues?: number;
  test_coverage_gaps?: number;
  stale_imports?: number;
  doc_staleness_issues?: number;
  config_schema_issues?: number;
  [key: string]: number | undefined;
}

// ─── Requirement Types (from requirements.ts) ────────────────────────────────

/**
 * A parsed requirement from REQUIREMENTS.md.
 * Used by requirements.ts, commands.js, mcp-server.js, scaffold.js, phase.js.
 */
export interface Requirement {
  id: string;
  title: string;
  priority: string | null;
  category: string | null;
  deferred_from: string | null;
  resolves: string | null;
  description: string | null;
  status?: string;
  phase?: string;
  milestone?: string;
}

/**
 * A traceability matrix entry parsed from REQUIREMENTS.md.
 * Used by requirements.ts, commands.js.
 */
export interface TraceabilityEntry {
  req: string;
  feature: string;
  priority: string;
  phase: string;
  status: string;
}

// ─── Dependency Graph Types (from deps.ts) ───────────────────────────────────

/**
 * A node in the phase dependency graph.
 * Used by deps.ts, parallel.js, autopilot.js.
 */
export interface DependencyNode {
  id: string;
  name: string;
}

/**
 * A directed edge in the phase dependency graph.
 * Used by deps.ts, parallel.js, autopilot.js.
 */
export interface DependencyEdge {
  from: string;
  to: string;
}

/**
 * Phase dependency graph with nodes and directed edges.
 * Used by deps.ts, parallel.js, autopilot.js.
 */
export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

// ─── Multi-Milestone Autopilot Types (from autopilot.ts) ─────────────────────

/**
 * Options for multi-milestone autopilot orchestration.
 * Controls how many milestones to process, subprocess behavior, and step skipping.
 */
export interface MultiMilestoneOptions {
  maxMilestones?: number; // Max milestones to process (default: 10, safety cap)
  dryRun?: boolean; // Log what would happen without spawning
  resume?: boolean; // Skip already-completed phases/milestones
  timeout?: number; // Per-subprocess timeout in minutes
  maxTurns?: number; // Max turns per claude -p subprocess
  model?: string; // Model override
  skipPlan?: boolean; // Skip planning step
  skipExecute?: boolean; // Skip execution step
}

/**
 * Per-milestone result in multi-milestone autopilot.
 * Tracks phase attempts and completion status for a single milestone iteration.
 */
export interface MilestoneStepResult {
  milestone: string; // Milestone version (e.g., "v0.3.0")
  phases_attempted: number;
  phases_completed: number;
  status: 'completed' | 'failed' | 'skipped' | 'dry-run';
  reason?: string;
}

/**
 * Returned by runMultiMilestoneAutopilot.
 * Aggregates results across all milestone iterations.
 */
export interface MultiMilestoneResult {
  milestones_attempted: number;
  milestones_completed: number;
  milestone_results: MilestoneStepResult[];
  stopped_at: string | null;
  total_phases_attempted: number;
  total_phases_completed: number;
}

// ── Autoplan Types (from autoplan.ts) ─────────────────────────────────────────

/**
 * Options for the autoplan command.
 * Controls discovery behavior, subprocess parameters, and output format.
 */
export interface AutoplanOptions {
  groups?: Array<{
    id: string;
    theme: string;
    dimension: string;
    items: Array<{ title: string; description: string; effort: string }>;
    priority: number;
    effort: string;
  }>; // Pre-discovered work groups (skip discovery if provided)
  pickPct?: number; // Discovery pick percentage (only used when groups not provided)
  dryRun?: boolean; // Build prompt only, do not spawn subprocess
  timeout?: number; // Subprocess timeout in minutes
  maxTurns?: number; // Max turns for claude -p subprocess
  model?: string; // Model override for subprocess
  milestoneName?: string; // Override for milestone name (default: derived from groups)
}

/**
 * Result returned by runAutoplan().
 */
export interface AutoplanResult {
  status: 'completed' | 'failed' | 'dry-run';
  groups_count: number; // Number of work groups used as input
  items_count: number; // Total work items across groups
  prompt: string; // The prompt that was (or would be) sent to claude -p
  milestone_name?: string; // Derived or overridden milestone name
  reason?: string; // Failure reason if status is 'failed'
}

// ─── Superpowers Types ───────────────────────────────────────────────────────

/**
 * Meta-backends that orchestrate other backends — cannot be used as
 * Superpowers' underlying default_backend target.
 * overstory is excluded because it has a real CLI adapter.
 */
export type MetaBackendId = 'superpowers' | 'grd';

/**
 * Direct AI CLI backends that have adapter implementations and can serve as
 * a Superpowers target (excludes meta-backends superpowers and grd).
 */
export type AdapterBackendId = Exclude<BackendId, MetaBackendId>;

/**
 * Direct AI CLI backends that can serve as a Superpowers target.
 * @deprecated Use AdapterBackendId instead.
 */
export type DirectBackendId = AdapterBackendId;

/**
 * Configuration for a single AI CLI account with its config directory.
 */
export interface AccountConfig {
  config_dir: string;
}

/**
 * Result of resolving which backend account to use for a scheduled task.
 * Combines backend identity, account config, and a compound state key.
 */
export interface AccountResolution {
  backend: AdapterBackendId;
  account: AccountConfig;
  stateKey: string; // e.g. "claude/~/.claude-personal"
}

/**
 * Configuration for the Superpowers execution backend.
 * Superpowers orchestrates any AI CLI backend with account rotation.
 */
export interface SuperpowersConfig {
  default_backend: DirectBackendId;
  account_rotation: boolean;
  accounts: Partial<Record<AdapterBackendId, AccountConfig[]>>;
}

// ─── Overstory Types (from overstory.ts) ─────────────────────────────────────

export interface OverstoryInfo {
  available: boolean;
  version: string;
  config_path: string;
  max_agents: number;
  default_runtime: string;
  worktree_base: string;
}

export interface SlingOpts {
  plan_path: string;
  overlay_path: string;
  runtime: string;
  model: string;
  phase_number: string;
  plan_id: string;
  milestone: string;
  timeout_minutes: number;
}

export interface SlingResult {
  agent_id: string;
  worktree_path: string;
  branch: string;
  tmux_session: string;
  runtime: string;
}

export interface AgentStatus {
  agent_id: string;
  state: 'pending' | 'running' | 'done' | 'failed' | 'stopped';
  exit_code: number | null;
  duration_ms: number;
  worktree_path: string;
  branch: string;
  runtime: string;
  model: string;
}

export interface FleetStatus {
  agents: AgentStatus[];
  active_count: number;
  completed_count: number;
  failed_count: number;
}

export interface MergeResult {
  merged: boolean;
  conflicts: string[];
  branch: string;
  commit_sha: string | null;
  error: string | null;
}

export interface OverstoryConfig {
  runtime: string;
  install_prompt: boolean;
  poll_interval_ms: number;
  merge_strategy: 'auto' | 'manual';
  overlay_template: string | null;
}

export interface OverstoryMailMessage {
  type: string;
  body: string;
  ts: number;
}

module.exports = {};
