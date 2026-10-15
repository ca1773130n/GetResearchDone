'use strict';
import type { Comparator } from '../research/types';

/** The human-approved decision rule, as the interview writes it. */
export interface FactoryContract { metric: string; comparator: Comparator; target: number; }
export interface SandboxSpec { image: string; setup: string; memory: string; cpus: number; }
/** `files`: repo-relative paths the dev evaluation itself reads or runs. Never editable. */
export interface DevEvalSpec { command: string; repeats: number; files: string[]; }
/** `script`: a path under `hidden/`, relative to the order's vault. */
export interface HiddenEvalSpec { script: string; repeats: number; }
export interface Budget { tokens: number; candidates: number; hidden_queries: number; wall_minutes: number; }
export interface Baseline { dev: number; hidden: number; devSpread: number; }

export interface WorkOrder {
  version: 1;
  id: string;
  repo: string;
  base: string;
  remote: string;
  objective: string;
  contract: FactoryContract;
  editable: string[];
  sandbox: SandboxSpec;
  dev_eval: DevEvalSpec;
  hidden_eval: HiddenEvalSpec;
  budget: Budget;
  baseline?: Baseline;
}

export type CandidateOutcome =
  | 'dev_miss' | 'out_of_scope' | 'tampering' | 'build_failed'
  | 'did_not_replicate' | 'rejected_at_gate' | 'not_judged' | 'shipped';

/**
 * One append-only row of candidates.jsonl; rows with the same `id` fold left to right.
 * Never carries a hidden-evaluation value: these rows feed the next hypothesis prompt.
 */
export interface CandidateEvent {
  id: string;
  at: string;
  attempt?: number;
  threadId?: string;
  iteration?: number;
  hypothesis?: string;
  strategy?: string;
  devMedian?: number | null;
  replicaDevMedian?: number | null;
  outcome?: CandidateOutcome;
  detail?: string;
}

export type StopReason =
  | 'shipped' | 'budget_spent' | 'holdout_spent' | 'plateau'
  | 'hidden_broken' | 'build_failures' | 'docker_unavailable';

/**
 * One row of queries.jsonl. The `started` row is written before the hidden evaluation runs.
 * `detail` says why a `broken` evaluation could not be judged. This file is factory-private:
 * it is the only place a measured hidden value or a hidden-evaluation error message is written.
 */
export interface QueryRecord {
  candidate: string;
  status: 'started' | 'pass' | 'fail' | 'broken';
  median?: number | null;
  detail?: string;
  at: string;
}

export interface SpendRecord { agent: string; candidate: string | null; tokens: number; backend: string; at: string; }

export interface MeasureResult {
  ok: boolean;
  values: number[];
  median: number | null;
  exitCode: number;
  stdoutExcerpt: string;
  stderrExcerpt: string;
}
