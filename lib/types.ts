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
export type BackendId = 'claude' | 'codex' | 'gemini' | 'opencode';

/**
 * Abstract model tiers mapped to backend-specific model names.
 */
export type ModelTier = 'opus' | 'sonnet' | 'haiku';

/**
 * Configuration profile names controlling model tier selection per agent.
 */
export type ModelProfileName = 'quality' | 'balanced' | 'budget';

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

module.exports = {};
