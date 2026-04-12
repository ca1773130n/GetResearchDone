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
export type BackendId =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'opencode'
  | 'overstory'
  | 'superpowers'
  | 'grd';

/**
 * Abstract model tiers mapped to backend-specific model names.
 */
export type ModelTier = 'opus' | 'sonnet' | 'haiku';

/**
 * Configuration profile names controlling model tier selection per agent.
 */
export type ModelProfileName = 'quality' | 'balanced' | 'budget';

/**
 * Token budget optimization preference, orthogonal to model_profile.
 * - 'frugal': aggressively downgrade for cost savings
 * - 'balanced': moderate adaptive downgrade (default)
 * - 'quality': preserve tier unless budget is critical
 */
export type TokenProfileName = 'frugal' | 'balanced' | 'quality';

/**
 * Budget pressure classification based on rolling-window consumption.
 * Thresholds are configurable via SchedulerConfig.budget_pressure_thresholds.
 */
export type BudgetPressureLevel = 'none' | 'warning' | 'high' | 'critical';

/**
 * Task complexity estimate used by adaptive model-tier routing.
 * Produced by estimateComplexity() from lib/complexity.ts.
 */
export type ComplexityLevel = 'low' | 'medium' | 'high';

/**
 * Configurable thresholds for budget pressure classification. Values are
 * ratios of (consumed + reserved) / budget. Defaults: 60%, 80%, 95%.
 */
export interface BudgetPressureThresholds {
  warning: number;
  high: number;
  critical: number;
}

/**
 * Effort levels for controlling reasoning depth in supported backends.
 * Claude Code v2.1.68+: low (fast), medium (default for Opus 4.6), high (ultrathink).
 */
export type EffortLevel = 'low' | 'medium' | 'high';

/**
 * Maps agent types to effort level selections per model profile.
 * Parallels AgentModelProfiles but for the effort dimension.
 */
export type AgentEffortProfiles = Record<string, Record<ModelProfileName, EffortLevel>>;

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
  smart_approvals: boolean;
  plan_mode: boolean;
  sandbox_gvisor: boolean;
  sandbox_lxc: boolean;
  mcp_elicitation: boolean;
  model_overrides: boolean;
  max_output_tokens: { default: number; upper_bound: number } | null;
}

/**
 * Result of Chrome DevTools MCP availability detection.
 */
export interface WebMcpResult {
  available: boolean;
  source: string;
  reason?: string;
}

/**
 * Result of Playwright MCP availability detection.
 */
export interface PlaywrightResult {
  available: boolean;
  source: 'config' | 'env' | 'mcp-config' | 'default';
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

// ─── Discussion Types (from discussion infrastructure) ───────────────────────

/**
 * Role a backend plays in a multi-backend discussion round.
 */
export type DiscussionRole = 'reviewer' | 'brainstormer' | 'verifier' | 'executor';

/**
 * Maps discussion roles to the backend that fulfills each role.
 * Partial — not all roles need to be assigned.
 */
export type BackendRolesConfig = Partial<Record<DiscussionRole, BackendId>>;

/**
 * Configuration for the cross-backend discussion feature.
 * All fields have defaults; partial objects are merged with defaults in loadConfig().
 */
export interface DiscussionConfig {
  /** Whether discussion is enabled at all. Default: true */
  enabled: boolean;
  /** Run a discussion round before planning. Default: true */
  before_planning: boolean;
  /** Run a discussion round before execution. Default: false */
  before_execution: boolean;
  /** Number of rounds (clamped 1-3). Default: 2 */
  max_rounds: number;
  /** Per-round timeout in seconds. Default: 180 */
  timeout_per_round_seconds: number;
  /** Which backend synthesizes the final answer. Default: 'claude' */
  synthesizer: BackendId;
}

/**
 * Result of probing whether a backend CLI binary is on PATH.
 */
export interface BackendAvailability {
  available: boolean;
  version: string | null;
}

/**
 * Options for dispatching a prompt to a backend CLI subprocess.
 */
export interface DispatchOptions {
  /** Timeout in milliseconds. */
  timeout_ms?: number;
  /** Working directory for the subprocess. Defaults to process.cwd(). */
  cwd?: string;
  /** Model name override (backend-specific string). Optional. */
  model?: string;
}

/**
 * Typed response from a backend CLI subprocess dispatch.
 */
export interface BackendResponse {
  /** Which backend produced this response. */
  backend: BackendId;
  /** Trimmed stdout from the subprocess, or '' on error. */
  response_text: string;
  /** Wall-clock duration of the dispatch in milliseconds. */
  duration_ms: number;
  /** Stderr output or error message. Empty string on success. */
  stderr?: string;
}

/**
 * Result of detecting an elicitation (question/clarification request) in
 * a backend subprocess output. Used by detectElicitation() in discussion.ts.
 */
export interface ElicitationDetection {
  /** The extracted question text (matched line or combined lines for numbered options) */
  question: string;
  /** Which detection patterns matched (for debugging/logging) */
  patterns: string[];
  /** Confidence: 'high' for direct questions/numbered options/clarification phrases, 'medium' for option prompts */
  confidence: 'high' | 'medium';
}

/**
 * A single entry in a discussion round — either a successful backend response
 * or a skipped entry when a participant was unavailable.
 *
 * Discriminated union: check `'skipped' in entry` to distinguish the two variants.
 */
export type DiscussionRoundEntry =
  | BackendResponse
  | { backend: BackendId; skipped: true; reason: string };

/**
 * Result of detecting an elicitation pattern in backend output.
 * Used by the elicitation detection pipeline to identify when a backend
 * is asking the user a question rather than executing autonomously.
 */
export interface ElicitationDetection {
  /** The extracted question text */
  question: string;
  /** Which detection patterns matched (for debugging/logging) */
  patterns: string[];
  /** Confidence: 'high' for direct questions, 'medium' for heuristic matches */
  confidence: 'high' | 'medium';
}

/**
 * Result returned by runDiscussion() after a multi-backend discussion completes.
 */
export interface DiscussionResult {
  /** The topic/question posed to all participants. */
  topic: string;
  /** Backend IDs of all requested participants (including skipped). */
  participants: BackendId[];
  /** Per-round array of participant responses. rounds[0] = round 1, etc. */
  rounds: DiscussionRoundEntry[][];
  /** Synthesizer backend response after round 1 collection. */
  synthesis: BackendResponse;
  /** Total wall-clock duration in milliseconds. */
  duration_ms: number;
  /** Absolute path to the written markdown history file. */
  discussion_file: string;
}

/**
 * Options for the runDiscussion() orchestration function.
 * All fields are optional; defaults are applied by runDiscussion().
 */
export interface RunDiscussionOptions {
  /** Number of discussion rounds. Default: 2. Clamped to 1-3. */
  rounds?: number;
  /** Backend that synthesizes the final answer. Default: 'claude'. */
  synthesizer?: BackendId;
  /** Per-round timeout in seconds. Default: 180. */
  timeout_per_round_seconds?: number;
  /** Working directory for backend subprocesses. Default: process.cwd(). */
  cwd?: string;
  /** Phase identifier used in the output filename. Default: 'unknown'. */
  phase?: string;
  /** Type label used in the output filename. Default: 'discussion'. */
  type?: string;
  /** Milestone version string used to locate the discussions directory. Default: currentMilestone(cwd). */
  milestone?: string | null;
}

/**
 * A concern raised during a plan review.
 * severity distinguishes blocking issues from minor suggestions.
 */
export interface Concern {
  description: string;
  severity: 'blocker' | 'warning' | 'suggestion';
}

/**
 * Result returned by reviewPlanViaBackend() after a plan is reviewed.
 * Contains approval verdict, concerns list, and raw response for debugging.
 */
export interface PlanReviewResult {
  approved: boolean;
  concerns: Concern[];
  suggestions: string[];
  reviewer_backend: BackendId;
  duration_ms: number;
  raw_response: string;
}

/**
 * A single issue found during a code review.
 * Includes file location, line range, and severity classification.
 */
export interface ReviewIssue {
  severity: 'blocker' | 'warning' | 'suggestion';
  file: string;
  line_range: string;
  description: string;
}

/**
 * Result returned by reviewCodeViaBackend() after a code diff is reviewed.
 * Contains approval verdict, issues list, and raw response for debugging.
 */
export interface CodeReviewResult {
  approved: boolean;
  issues: ReviewIssue[];
  summary: string;
  reviewer_backend: BackendId;
  duration_ms: number;
  raw_response: string;
}

/**
 * A single PR review comment targeting a file and line.
 * Used for posting structured feedback to GitHub PR review threads.
 */
export interface PRReviewComment {
  file: string;
  line: number;
  body: string;
  severity: 'blocker' | 'warning' | 'suggestion';
}

/**
 * Result returned by reviewPRViaBackend() after a PR diff is reviewed.
 * Contains structured comments suitable for GitHub PR review posting.
 */
export interface PRReviewResult {
  comments: PRReviewComment[];
  summary: string;
  reviewer_backend: BackendId;
  duration_ms: number;
  raw_response: string;
}

/**
 * Full GRD project configuration as returned by loadConfig().
 * All fields are populated with defaults when not present in config.json.
 */
export interface GrdConfig {
  model_profile: ModelProfileName;
  /**
   * Token optimization preference (Spec 4). Controls adaptive model-tier
   * routing behavior under budget pressure or low task complexity.
   * Default: 'balanced'. Set via `gd settings token_profile <value>`.
   */
  token_profile?: TokenProfileName;
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
  backend_roles?: BackendRolesConfig;
  discussion?: DiscussionConfig;
  /** When true, plan-phase gate blocks on unresolved critical citation nodes. Default: false */
  citation_gate?: boolean;
  /** When true, run transitive citation gate during plan-phase (warning severity). Default: false */
  transitive_citation_gate?: boolean;
  /** When true, run post-phase metric-driven refinement loop. Default: false */
  refinement_loop?: boolean;
  /**
   * When true, autopilot and `gd phase complete` invoke an LLM fallback
   * if the mechanical phase-completion regex-based path fails. The
   * fallback spawns Claude via the scheduler, gives it the current
   * ROADMAP.md + STATE.md contents, and asks it to perform the edits.
   *
   * Default: false. Opt-in. When disabled, mechanical failures return
   * null and log a hint advising manual recovery.
   *
   * Spec 3B of the gsd-2-selective-adoption milestone.
   */
  phase_complete_llm_fallback?: boolean;
  /**
   * Optional per-agent-type override of the baseline complexity used
   * by estimateComplexity. Keys are agent type names (e.g.,
   * 'grd-verifier'); values are 'low' | 'medium' | 'high'. When a
   * key is present, its value takes precedence over the built-in
   * AGENT_BASELINE_COMPLEXITY table.
   *
   * Example:
   *   agent_complexity_overrides: { 'my-custom-agent': 'high' }
   */
  agent_complexity_overrides?: Record<string, ComplexityLevel>;
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
  /**
   * Maximum wait time (in minutes) for account recovery via sample aging
   * before falling through to free_fallback. Default: 90.
   *
   * When all priority accounts are exhausted, scheduler.spawn computes the
   * soonest time any account will regain headroom (via sample window aging)
   * and sleeps until then — unless that wait would exceed max_wait_minutes,
   * in which case it falls through to today's free_fallback behavior.
   *
   * Set to 0 to disable the wait entirely (preserves pre-Spec 2A behavior).
   * Set arbitrarily high (e.g., 10080 = 1 week) to effectively uncap.
   */
  max_wait_minutes?: number;
  /**
   * Thresholds for budget pressure classification (Spec 4). Each value
   * is a ratio of (tokens_consumed_in_window + tokens_reserved) / token_budget.
   * Defaults: { warning: 0.6, high: 0.8, critical: 0.95 }.
   */
  budget_pressure_thresholds?: BudgetPressureThresholds;
  /**
   * Maximum time (seconds) the scheduler will wait for a spawned backend
   * subprocess to produce any stdout/stderr data before killing it.
   * Default: 900 (15 minutes). Set arbitrarily high (e.g., 3600) to
   * effectively disable. Set low to catch hangs faster.
   *
   * Distinct from `opts.timeout`, which is a total wall-clock upper
   * bound. The idle timeout fires only when the subprocess is completely
   * silent for the configured duration — legitimate streaming inference
   * with progressive output is unaffected.
   */
  idle_timeout_seconds?: number;
  /**
   * Optional per-backend override of idle_timeout_seconds. If a backend
   * has an entry here, it takes precedence over the global
   * idle_timeout_seconds default. Example:
   *
   *     idle_timeout_seconds_by_backend: { claude: 600, gemini: 1800 }
   *
   * Keys are backend IDs (claude, codex, gemini, opencode, etc.).
   * Missing backends fall back to the global idle_timeout_seconds
   * (default 900).
   */
  idle_timeout_seconds_by_backend?: Record<string, number>;
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
  /**
   * Captured subprocess stdout. Populated whenever the backend subprocess
   * writes to stdout; callers that pass captureOutput: true in SpawnOpts can
   * rely on this field being set. Otherwise may be undefined or empty string.
   */
  stdout?: string;
  stderr?: string;
  timedOut: boolean;
  /**
   * True if the subprocess was killed because it exceeded the idle
   * timeout (no stdout/stderr activity for `idle_timeout_seconds`).
   * Distinct from `timedOut` which indicates total-timeout.
   */
  idleTimedOut?: boolean;
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
export type AgentModelProfiles = Record<string, Record<ModelProfileName, ModelTier>>;

// ─── Invariant Types (from invariants.ts) ────────────────────────────────────

/**
 * Result returned by all validation functions in invariants.ts.
 * valid is true when errors is empty; warnings are non-fatal informational notices.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Typed representation of a parsed plan artifact (PLAN.md frontmatter + objective).
 * Used by validateStructural, validateSemantic, validateCrossPhase, and extractPlanArtifact.
 */
export interface PlanArtifact {
  objective: string;
  files_modified: string[];
  phase: string;
  plan: number;
  type: string;
  wave: number;
  depends_on: string[];
  autonomous: boolean;
  provides: string[];
  requires: string[];
  integration_points: string[];
}

// ─── Artifact DAG Types (from deps.ts) ───────────────────────────────────────

/**
 * A node representing a plan's artifact declarations in the artifact DAG.
 * Each plan that declares provides/requires/integration_points becomes a node.
 */
export interface ArtifactDAGNode {
  /** Unique plan identifier, e.g. "94-01" */
  id: string;
  /** Numeric plan number */
  plan_number: number;
  /** Artifact names this plan produces, e.g. ["lib/deps.ts:buildArtifactDAG"] */
  provides: string[];
  /** Artifact names this plan depends on */
  requires: string[];
  /** Integration surface declarations */
  integration_points: string[];
}

/**
 * A directed edge representing a requires→provides dependency between plans.
 * from_plan is the consumer (requires the artifact); to_plan is the producer (provides it).
 */
export interface ArtifactDAGEdge {
  /** Plan that requires the artifact (consumer) */
  from_plan: string;
  /** Plan that provides the artifact (producer) */
  to_plan: string;
  /** The artifact name creating this edge */
  artifact: string;
  /** Whether this is a hard dependency or integration point */
  type: 'requires' | 'integration';
}

/**
 * The complete artifact dependency graph built from plan provides/requires declarations.
 * Used by the wave builder and executor to reason about fine-grained dependencies.
 */
export interface ArtifactDAG {
  /** All plan nodes */
  nodes: ArtifactDAGNode[];
  /** All directed dependency edges */
  edges: ArtifactDAGEdge[];
  /** Topologically sorted plan IDs (Kahn's algorithm) */
  sorted_plans: string[];
  /** Map from artifact name to providing plan ID */
  providers: Record<string, string>;
}

/**
 * Result of validating an ArtifactDAG for cycles, missing dependencies, and warnings.
 */
export interface ArtifactDAGValidation {
  /** True when cycles and missing_deps are both empty */
  valid: boolean;
  /** All detected cycles; each inner array is a cycle path (start node repeated at end) */
  cycles: string[][];
  /** Requires entries with no matching provider in the plan set */
  missing_deps: Array<{ plan: string; artifact: string }>;
  /** Non-fatal issues (unused provides, duplicate provides declarations) */
  warnings: string[];
}

// ─── GoT Execution Types (from got.ts) ───────────────────────────────────────

/**
 * Represents a frozen contract for an artifact — the interface definition
 * captured at the point a plan node's output is accepted downstream.
 */
export interface FrozenInterface {
  /** Plan that provides this artifact */
  plan_id: string;
  /** Artifact name (e.g. "lib/foo.ts:Bar") */
  artifact: string;
  /** The frozen interface definition as a string comment */
  contract: string;
}

/**
 * Result of executing a single DAG node (plan).
 */
export interface NodeExecutionResult {
  /** The plan node ID (e.g. "98-01") */
  node_id: string;
  /** Whether execution succeeded */
  success: boolean;
  /** List of artifact names actually produced */
  artifacts_produced: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Result of smoke-testing a node's output against its declared provides.
 */
export interface SmokeTestResult {
  /** The plan node ID */
  node_id: string;
  /** Whether all provides artifacts were produced */
  passed: boolean;
  /** Provides artifacts NOT found in artifacts_produced */
  missing_artifacts: string[];
  /** Human-readable result message */
  message: string;
}

/**
 * Options for executeArtifactDAG.
 */
export interface GoTExecuteOptions {
  /** Max retry attempts per node on smoke failure (default 1) */
  maxRetries?: number;
  /** When true, return stub results without dispatching agents */
  dryRun?: boolean;
}

/**
 * Full result of executing an artifact DAG via GoT synthesis engine.
 */
export interface GoTExecutionResult {
  /** Topological wave groupings of plan IDs */
  waves: string[][];
  /** Per-node execution results */
  results: NodeExecutionResult[];
  /** Per-node smoke test results */
  smoke_tests: SmokeTestResult[];
  /** Total retry count across all nodes */
  retries: number;
  /** True when all smoke tests passed */
  success: boolean;
}

/**
 * Context passed to buildNodePrompt when constructing per-node execution prompts.
 */
export interface NodePromptContext {
  /** Phase name */
  phase_name: string;
  /** Phase directory path */
  phase_dir: string;
  /** Research directory path (optional) */
  research_dir?: string;
}

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
  timeout?: number; // Per-subprocess timeout in minutes
  maxTurns?: number; // Max turns per claude -p subprocess
  model?: string; // Model override
  skipPlan?: boolean; // Skip planning step
  skipExecute?: boolean; // Skip execution step
  skipPostPipeline?: boolean; // Skip post-phase pipeline (simplify, PR, review, merge)
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

// ─── Citation Types (from citations.ts) ──────────────────────────────────────

/** Parsed missing component from PAPERS.md structured output. */
export interface MissingComponent {
  /** Component identifier */
  name: string;
  /** Paper slug or title where component originates */
  source_paper: string;
  /** What the component does */
  description: string;
  /** Whether source code exists for this component */
  code_available: boolean;
}

/** Parsed borrowed component from PAPERS.md structured output. */
export interface BorrowedComponent {
  /** Component identifier */
  name: string;
  /** Paper slug or title */
  source_paper: string;
  /** What the component does */
  description: string;
}

/** Citation graph node representing a paper and its dependencies. */
export interface CitationNode {
  /** Paper slug (e.g., "vaswani-attention-2017") */
  slug: string;
  /** Full paper title */
  title: string;
  /** Whether the paper has been fetched and analyzed */
  resolved: boolean;
  /** How important this dependency is */
  priority: 'critical' | 'normal' | 'low';
  /** Extracted technique description (empty until resolved) */
  technique_summary: string;
  /** Components referenced but not implemented in this paper */
  missing_components: MissingComponent[];
  /** Components adopted from other papers */
  borrowed_components: BorrowedComponent[];
}

/** Citation graph edge — a directed dependency between papers. */
export interface CitationEdge {
  /** Paper that depends on another */
  from_slug: string;
  /** Paper being depended upon */
  to_slug: string;
  /** Whether this is a missing or borrowed dependency */
  type: 'missing' | 'borrowed';
  /** Which component creates this edge */
  component_name: string;
}

/** Complete citation graph with nodes and directed edges. */
export interface CitationGraph {
  /** All paper nodes (source papers + dependency papers) */
  nodes: CitationNode[];
  /** All directed dependency edges */
  edges: CitationEdge[];
  /** ISO timestamp of graph construction */
  built_at: string;
}

/**
 * Options for controlling BFS traversal of the citation graph.
 * max_depth and max_nodes prevent unbounded traversal on large real citation chains.
 */
export interface TraversalOptions {
  /** Maximum BFS depth from root nodes. Default: 3 */
  max_depth: number;
  /** Maximum total nodes to visit before stopping. Default: 50 */
  max_nodes: number;
  /** Injectable fetch function for auto-retrieval (used in Plan 02). Optional. */
  fetchFn?: (url: string, timeoutMs: number) => Promise<string | null>;
}

/**
 * Result of a BFS traversal through the citation graph.
 * Captures visited nodes, traversed edges, leaf nodes, and depth/count statistics.
 */
export interface TraversalResult {
  /** All CitationNodes discovered during traversal (including root nodes) */
  visited_nodes: CitationNode[];
  /** All CitationEdges traversed (subset of graph edges reachable from roots) */
  edges_traversed: CitationEdge[];
  /** Nodes that have no outgoing edges in the graph (leaf dependencies not in PAPERS.md) */
  unresolved_leaves: CitationNode[];
  /** Maximum depth level actually reached during BFS */
  depth_reached: number;
  /** Total node count visited (may equal max_nodes if limit was hit) */
  total_visited: number;
}

/** Configuration for citation resolution API calls. */
export interface ApiConfig {
  arxiv_enabled: boolean;
  semantic_scholar_enabled: boolean;
  timeout_ms: number;
  fetchFn?: (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>;
}

// ─── Knowledge Types (from knowledge.ts) ─────────────────────────────────────

/**
 * A structured knowledge entry mined from phase execution output.
 * Stored in KNOWHOW.md and injected into planning/execution prompts to
 * compound improvements across phases.
 */
export interface KnowhowEntry {
  /** Descriptive name of the pattern or technique. */
  pattern_name: string;
  /** Where this knowledge came from (paper slug, codebase path, or execution result). */
  source: string;
  /** Conditions under which this pattern is useful. */
  applicability: string;
  /** Representative code example or reference. */
  code_snippet: string;
  /** Which phase produced this entry. */
  phase_number: number;
  /** ISO timestamp when entry was created. */
  created_at: string;
}

// ─── Refinement Types (from refinement.ts) ───────────────────────────────────

/**
 * Quantitative metrics collected from a single test/lint/build run.
 * Adapted from NERFIFY PSNR-minima ROI analysis to GRD's domain:
 * test coverage minima, type error density, lint violation clustering.
 */
export interface RefinementMetrics {
  /** Percentage of lines/statements covered by tests (0–100). */
  test_coverage_pct: number;
  /** Number of TypeScript type errors from tsc --noEmit. */
  type_error_count: number;
  /** Number of ESLint violations (errors + warnings). */
  lint_violation_count: number;
  /** ISO 8601 timestamp when these metrics were collected. */
  timestamp: string;
}

/**
 * A metric snapshot tied to a specific phase and plan.
 * Used for building time-series data to detect convergence and minima.
 */
export interface MetricSnapshot {
  metrics: RefinementMetrics;
  phase: string;
  plan: string;
}

/**
 * Discriminated branch type for closed-loop refinement routing.
 * - macro: metric-minima guided patching (coverage dips, error spikes)
 * - geometry: structural validation (type errors, export consistency)
 * - generative: artifact analysis (lint patterns, code smell clustering)
 */
export type CritiqueBranch = 'macro' | 'geometry' | 'generative';

/**
 * Configuration for convergence detection in the refinement loop.
 * Epsilon values define the minimum change threshold below which a dimension
 * is considered converged.
 */
export interface ConvergenceConfig {
  /** Minimum coverage change (in percentage points) to consider not-converged. */
  epsilon_coverage: number;
  /** Minimum type error count change to consider not-converged. */
  epsilon_type_errors: number;
  /** Minimum lint violation count change to consider not-converged. */
  epsilon_lint: number;
  /** Maximum refinement iterations before forcing convergence. */
  max_iterations: number;
}

/**
 * A detected minima region in a metric time series.
 * For coverage: local dips (where coverage drops below neighbors).
 * For errors/violations: local spikes (where count rises above neighbors).
 */
export interface MinimaRegion {
  /** Which metric dimension this region belongs to. */
  dimension: 'test_coverage_pct' | 'type_error_count' | 'lint_violation_count';
  /** Index in the snapshot array where this region occurs. */
  index: number;
  /** Metric value at this region. */
  value: number;
  /** Absolute delta from the average of the two neighbors. */
  delta: number;
}

// ─── Benchmark Types (Phase 100 — Evaluation Benchmark Framework) ────────────

/**
 * Classification of a research paper by implementation difficulty.
 * Adapted from NERFIFY-BENCH Figure 7 categorization.
 *
 * - directly-integrable: Paper's technique can be implemented using existing
 *   GRD infrastructure without external model dependencies.
 * - requires-external-models: Implementation needs external model weights or
 *   services not bundled with GRD.
 * - out-of-scope: Paper describes capabilities beyond code synthesis (hardware,
 *   large-scale training infrastructure, etc.)
 * - novelty-coverage: Paper contributes novel ideas but implementation fidelity
 *   is measured differently (architecture variants, ablation studies, etc.)
 */
export type IntegrationCategory =
  | 'directly-integrable'
  | 'requires-external-models'
  | 'out-of-scope'
  | 'novelty-coverage';

/**
 * Quantitative metrics from actually running the generated code.
 */
export interface TrainabilityMetrics {
  /** Whether the generated code compiles/builds without errors. */
  build_success: boolean;
  /** Whether execution completes without crashes. */
  runtime_stable: boolean;
  /** Whether training/optimization converges (if applicable). */
  convergence_detected: boolean;
  /** Wall-clock execution time in milliseconds. */
  execution_time_ms: number;
  /** Captured stderr/error output (empty string if none). */
  error_log: string;
}

/**
 * Qualitative assessment of how faithfully the generated code captures the paper's semantics.
 */
export interface SemanticScore {
  /** 0-1 score for how well the code captures the paper's novel contributions. */
  novelty_capture: number;
  /** 0-1 score for alignment between paper's described interface and generated code. */
  api_surface_match: number;
  /** 0-1 score for correctness of core algorithm implementation. */
  algorithmic_fidelity: number;
  /** Optional free-text notes from evaluator. */
  notes: string;
}

/**
 * Configurable weight distribution for composite scoring.
 * semantic_weight + trainability_weight must equal 1.0.
 */
export interface ScoringRubric {
  /** Weight for semantic dimension (0-1, all weights sum to 1). */
  semantic_weight: number;
  /** Weight for trainability dimension. */
  trainability_weight: number;
  /** Per-category difficulty multiplier (1.0 = neutral). */
  category_adjustments: Record<IntegrationCategory, number>;
}

/**
 * A single research paper entry in the benchmark corpus.
 */
export interface BenchmarkEntry {
  /** Unique identifier (typically paper slug). */
  id: string;
  /** Paper title. */
  title: string;
  /** Source reference (arXiv ID, DOI, or URL). */
  source: string;
  /** Integration difficulty classification. */
  category: IntegrationCategory;
  /** Domain/method tags for filtering. */
  tags: string[];
  /** ISO 8601 timestamp when entry was added to corpus. */
  added_at: string;
}

/**
 * A scored evaluation result for a single benchmark entry.
 */
export interface BenchmarkResult {
  /** References BenchmarkEntry.id. */
  entry_id: string;
  /** Semantic implementation scoring. */
  semantic: SemanticScore;
  /** Build/run/convergence metrics. */
  trainability: TrainabilityMetrics;
  /** Weighted composite score (0-1). */
  composite_score: number;
  /** Which ScoringRubric version was used. */
  rubric_version: string;
  /** ISO 8601 timestamp. */
  evaluated_at: string;
  /** Who/what produced this result (agent name or 'manual'). */
  evaluator: string;
}

// ─── Phase Complete Types (from phase.ts) ────────────────────────────────────

/** Quality analysis result returned from cleanup module. */
export interface QualityAnalysisResult {
  skipped?: boolean;
  reason?: string;
  phase?: string;
  timestamp?: string;
  summary?: QualityAnalysisSummary;
  details?: Record<string, unknown>;
  trends?: Record<string, unknown> | null;
}

/** Generated cleanup plan info from cleanup module. */
export interface CleanupPlanResult {
  path: string;
  plan_number: string;
  issues_addressed: number;
}

/** Options for cmdPhaseComplete. */
export interface PhaseCompleteOptions {
  dryRun?: boolean;
  force?: boolean;
  skip_cleanup?: boolean;
  raw?: boolean;
}

/** Result from the phase complete core logic. */
export interface PhaseCompleteResult {
  dry_run?: boolean;
  would_complete_phase?: string;
  phase_found?: boolean;
  gate_failed?: boolean;
  gate_errors?: GateViolation[];
  gate_warnings?: GateViolation[];
  completed_phase?: string;
  phase_name?: string | null;
  plans_executed?: string;
  next_phase?: string | null;
  next_phase_name?: string | null;
  is_last_phase?: boolean;
  date?: string;
  roadmap_updated?: boolean;
  state_updated?: boolean;
  quality_report?: QualityAnalysisResult;
  cleanup_plan_generated?: CleanupPlanResult;
  /**
   * True if this result was produced by the LLM fallback path (Spec 3B),
   * not the mechanical regex path. Callers may want to log differently
   * or skip certain downstream operations.
   */
  llm_fallback?: boolean;
}

module.exports = {};
