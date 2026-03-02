'use strict';

/**
 * GRD Evolve -- Domain type definitions
 *
 * All interfaces and type aliases for the evolve subsystem.
 * Pure type definitions with no runtime code or imports.
 *
 * @dependencies None (pure types)
 */

// ─── Type Aliases ───────────────────────────────────────────────────────────

/** Effort estimates for work items. */
export type WorkItemEffort = 'small' | 'medium' | 'large';

/** Source of a work item. */
export type WorkItemSource = 'discovery' | 'bugfix' | 'carryover';

/** Status of a work item. */
export type WorkItemStatus = 'pending' | 'selected' | 'completed' | 'failed';

// ─── Work Item Interfaces ───────────────────────────────────────────────────

/** A single unit of improvement work. */
export interface WorkItem {
  id: string;
  dimension: string;
  slug: string;
  title: string;
  description: string;
  effort: WorkItemEffort;
  source: WorkItemSource;
  status: WorkItemStatus;
  iteration_added: number;
}

/** Optional overrides for createWorkItem. */
export interface WorkItemOptions {
  effort?: WorkItemEffort;
  source?: WorkItemSource;
  status?: WorkItemStatus;
  iteration_added?: number;
}

// ─── History & State Interfaces ─────────────────────────────────────────────

/** Iteration history record. */
export interface HistoryEntry {
  iteration: number;
  timestamp: string;
  selected_count: number;
  completed_count: number;
  failed_count: number;
}

/** Full evolve state (legacy item-based format). */
export interface EvolveState {
  iteration: number;
  timestamp: string;
  milestone: string;
  items_per_iteration: number;
  selected: WorkItem[];
  remaining: WorkItem[];
  bugfix: WorkItem[];
  completed: WorkItem[];
  failed: WorkItem[];
  history: HistoryEntry[];
}

/** Group-based evolve state (Phase 56+ format). */
export interface EvolveGroupState {
  iteration: number;
  timestamp: string;
  milestone: string;
  pick_pct: number;
  selected_groups: WorkGroup[];
  remaining_groups: WorkGroup[];
  completed_groups: WorkGroup[];
  failed_groups: WorkGroup[];
  all_items_count: number;
  groups_count: number;
  history: HistoryEntry[];
}

// ─── Group Interfaces ───────────────────────────────────────────────────────

/** Grouped work items by theme. */
export interface WorkGroup {
  id: string;
  theme: string;
  dimension: string;
  title?: string;
  items: WorkItem[];
  priority: number;
  effort: WorkItemEffort;
  status?: string;
}

/** Result from runGroupDiscovery. */
export interface GroupDiscoveryResult {
  groups: WorkGroup[];
  selected_groups: WorkGroup[];
  remaining_groups: WorkGroup[];
  all_items_count: number;
  merged_items_count: number;
  groups_count: number;
}

/** Theme pattern for slug-based grouping. */
export interface ThemePattern {
  pattern: RegExp;
  theme: string;
}

// ─── Evolve Options & Results ───────────────────────────────────────────────

/** Options for runEvolve. */
export interface EvolveOptions {
  iterations?: number;
  pickPct?: number;
  timeout?: number;
  maxTurns?: number;
  dryRun?: boolean;
  useWorktree?: boolean;
}

/** Result of processing one group. */
export interface GroupOutcome {
  group: string;
  status: 'pass' | 'fail' | 'skip';
  step?: string;
  reason?: string;
}

/** Per-iteration summary. */
export interface IterationResult {
  iteration: number;
  status: string;
  groups_attempted: number;
  groups_passed: number;
  groups_failed: number;
  remaining_groups: number;
}

/** Dry-run iteration result. */
export interface DryRunIterationResult {
  iteration: number;
  status: 'dry-run';
  groups: Array<{
    id: string;
    priority: number;
    item_count: number;
    effort: string;
  }>;
  total_items: number;
  total_groups: number;
  groups_per_iteration: number;
  estimated_iterations: number;
}

/** Full result from runEvolve. */
export interface EvolveResult {
  iterations_completed: number;
  results: Array<IterationResult | DryRunIterationResult>;
  evolution_notes_path: string;
  worktree?: { path: string; branch: string };
  pr?: Record<string, unknown>;
}

/** Tracked worktree state during evolve. */
export interface WorktreeInfo {
  path: string;
  branch: string;
  baseBranch: string;
}

/** Data for writeEvolutionNotes. */
export interface EvolutionNotesData {
  iteration: number;
  items: WorkItem[];
  outcomes: Array<{
    item: string;
    status: string;
    step?: string;
    reason?: string;
  }>;
  decisions: string[];
  patterns: string[];
  takeaways: string[];
}

/** Context for _runIterationStep. */
export interface IterationContext {
  discoveryCwd: string;
  executionCwd: string;
  state: EvolveGroupState | EvolveState | null;
  useWorktree: boolean;
  worktreeInfo: WorktreeInfo | null;
  effectivePickPct: number;
  dryRun: boolean;
  timeoutMs: number | undefined;
  maxTurns: number | undefined;
  cwd: string;
  log: (msg: string) => void;
}

/** Return from _runIterationStep. */
export interface IterationStepResult {
  discovery: GroupDiscoveryResult;
  outcomes: GroupOutcome[] | null;
  worktreeInfo: WorktreeInfo | null;
  executionCwd: string;
  useWorktree: boolean;
  isDryRun: boolean;
}

/** Return from _handleIterationResult. */
export interface HandleIterationReturn {
  newState: EvolveGroupState;
  iterResult: IterationResult;
}

// ── Product Ideation Types ───────────────────────────────────────────────────

/** Structured context gathered from project planning files for product ideation. */
export interface ProductIdeationContext {
  projectVision: string | null;
  longTermGoals: string | null;
  existingCommands: string[];
  existingAgents: string[];
  recentPhases: string | null;
  productQuality: string | null;
}
