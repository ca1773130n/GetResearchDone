'use strict';

export type ThreadStatus =
  | 'active' | 'paused' | 'supported' | 'exhausted' | 'error' | 'abandoned';
export type Station =
  | 'seed' | 'ground' | 'hypothesize' | 'design' | 'run'
  | 'measure' | 'learn' | 'decide' | 'persist' | 'finalize';
export type Verdict = 'supported' | 'refuted' | 'inconclusive';
export type HypothesisStatus =
  | 'open' | 'testing' | 'supported' | 'refuted' | 'inconclusive' | 'superseded';
export type FailureClass = 'H2' | 'H3' | 'H4' | 'none';
export type TakeawayKind =
  | 'success_pattern' | 'failure_root_cause' | 'constraint' | 'domain_fact' | 'tool_pattern';
export type Comparator = '>=' | '<=' | '>' | '<' | '==';

export interface ThreadGates { execute: boolean; kg_write: boolean; }

// ── Checkpoint schema (v0.5.0 Interactive Research Steering) ────────────────
// These types define the human-in-the-loop checkpoint family. They are added
// STANDALONE this phase: nothing in orchestrator.ts emits a Checkpoint yet
// (locked hybrid-churn strategy). All ResearchThread integration is via
// OPTIONAL fields, so pre-0.5.0 thread.json files load and re-serialize
// byte-identically. See SUMMARY.md §4.2 / FEATURES.md F1.

/** The four loop stations at which a checkpoint may be raised. */
export type CheckpointPoint = 'seed' | 'hypothesize' | 'design' | 'decide';
/** The interaction kind a checkpoint represents. */
export type CheckpointType = 'clarification' | 'selection' | 'approval' | 'branch';
/** Who supplied a given answer. */
export type CheckpointAnsweredBy = 'human' | 'panel' | 'default';

export interface CheckpointOption {
  label: string;
  description: string;
  recommended?: boolean;
}

export interface CheckpointQuestion {
  // Per-checkpoint label; NOT stable across rounds (plan-phase precedent).
  // The dedupe key across rounds is the `ask` TEXT, not this id.
  id: string;
  ask: string;
  options: CheckpointOption[];
  freeform?: boolean;
}

export interface CheckpointAnswer {
  questionId: string;
  label: string;
  text?: string;
  answeredBy: CheckpointAnsweredBy;
}

export interface Checkpoint {
  checkpoint_version: 1;
  // id format: `ck-<iteration>-<point>-r<round>` (constructed in checkpoints.ts, plan 101-02).
  id: string;
  point: CheckpointPoint;
  type: CheckpointType;
  iteration: number;
  round: number;
  createdAt: string;
  context?: string;
  questions: CheckpointQuestion[];
  answers?: CheckpointAnswer[];
  resolvedAt?: string;
  discussionFile?: string;
}

/** The RESOLVED shape readInteractiveConfig returns (plan 101-02); shared type. */
export interface InteractiveConfig {
  enabled: boolean;
  seed: boolean;
  hypothesize: boolean;
  design: boolean;
  decide: boolean;
  max_rounds: number;
  max_questions: number;
  hypothesis_candidates: number;
  every_iteration: boolean;
  fallback: 'recommended' | 'panel';
}

export interface ResearchThread {
  id: string;
  question: string;
  status: ThreadStatus;
  iteration: number;
  maxIterations: number;
  gates: ThreadGates;
  budgetUsed: number;
  modelProfile: string;
  tokenProfile: string;
  currentStation: Station;
  pendingGate: 'execute' | 'kg_write' | null;
  createdAt: string;
  seededFrom?: { synthesisTopicId: string; sourceNodeIds: string[]; seedKey: string };
  resurveyCount?: number;
  pendingPivot?: boolean;
  baseMaxIterations?: number;
  errorReason?: string;
  // v0.5.0 checkpoint plumbing — all OPTIONAL (back-compat: absent on pre-0.5.0 threads).
  pendingCheckpoint?: Checkpoint | null;
  refinedQuestion?: string;
  checkpointRounds?: Partial<Record<CheckpointPoint, number>>;
}

export interface Hypothesis {
  id: string;
  iteration: number;
  statement: string;
  rationale: string;
  predictedOutcome: string;
  status: HypothesisStatus;
  parentId: string | null;
  verdict: Verdict | null;
  origin?: 'loop' | 'synthesis';
  sourceNodeIds?: string[];
}

export interface ExperimentPlan {
  procedure: string;
  metricKey: string;
  comparator: Comparator;
  target: number;
  predictedOutcome: string;
  scriptPath: string;
  language: 'shell' | 'python';
}

export interface ExperimentResult {
  metrics: Record<string, number>;
  exitCode: number;
  runner: 'subprocess' | 'docker';
  durationMs: number;
  stdoutExcerpt: string;
  /** stderr excerpt, captured on failure paths only — feeds the bounded debug fix-and-retry. */
  stderrExcerpt?: string;
  failureClass: FailureClass;
}

export interface Takeaway {
  kind: TakeawayKind;
  content: string;
  confidence: number;
  evidence: string;
  failureClass: FailureClass;
  iteration: number;
}

export interface MeasureOutcome { verdict: Verdict; detail: string; }

export function defaultGates(): ThreadGates {
  return { execute: true, kg_write: true };
}

module.exports = { defaultGates };
