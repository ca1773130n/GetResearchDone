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
  runner: 'subprocess';
  durationMs: number;
  stdoutExcerpt: string;
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
