'use strict';
import type { CandidateEvent, CandidateOutcome, WorkOrder } from './types';
import type { ExperimentResult, Hypothesis } from '../research/types';

/** A candidate whose run finished: the only kind `describeOutcome` can speak about. */
type FinishedCandidate = CandidateEvent & { outcome: CandidateOutcome };

function rule(o: WorkOrder): string { return `${o.contract.metric} ${o.contract.comparator} ${o.contract.target}`; }

/** What later hypotheses learn about a candidate. A hidden-gate rejection is one bit, nothing more. */
function describeOutcome(e: FinishedCandidate): string {
  switch (e.outcome) {
    case 'dev_miss': return `missed the rule on the dev evaluation (dev median ${e.devMedian ?? 'not measured'})`;
    case 'out_of_scope': return `changed paths outside the allowlist (${e.detail ?? ''})`;
    case 'tampering': return `added the evaluation's result marker (${e.detail ?? ''})`;
    case 'build_failed': return 'the builder did not produce a usable change';
    case 'did_not_replicate': return `a fresh builder could not reproduce it from its strategy note (replica dev median ${e.replicaDevMedian ?? 'not measured'})`;
    case 'rejected_at_gate': return 'rejected at the final gate';
    case 'not_judged': return 'never judged: the sandbox went away before the final gate could run';
    case 'shipped': return 'shipped';
    default: {
      // Exhaustive at compile time, so a new outcome cannot silently read as one of these;
      // at run time an unknown one says so rather than claiming the candidate shipped.
      const exhaustive: never = e.outcome;
      return `an outcome this version does not recognise (${String(exhaustive)})`;
    }
  }
}

function composeQuestion(o: WorkOrder, baseWorktree: string, history: CandidateEvent[]): string {
  const lines = [
    o.objective,
    '',
    `Decision rule, pinned for every experiment: ${rule(o)}. On the unmodified code the dev evaluation measures ${o.baseline?.dev ?? 'unknown'}.`,
    `A reference copy of the code at ${o.base} is at ${baseWorktree}. Read it there; do not modify it.`,
    `A change may touch only these paths: ${o.editable.join(', ')}.`,
  ];
  const finished = history.filter((e): e is FinishedCandidate => e.outcome !== undefined);
  if (finished.length > 0) {
    lines.push('', 'Earlier candidates. Do not resubmit these ideas:');
    for (const e of finished) lines.push(`- ${e.id}: ${e.hypothesis ?? '(hypothesis not recorded)'} Outcome: ${describeOutcome(e)}.`);
  }
  return lines.join('\n');
}

function rules(o: WorkOrder, worktree: string): string[] {
  return [
    `Work only inside the git worktree at ${worktree}.`,
    `Edit files only under these paths: ${o.editable.join(', ')}. A change anywhere else is rejected.`,
    'Never write the text __RESULT__ anywhere. A change containing it is rejected as tampering.',
    'Do not try to run, build or measure anything. The factory measures your change in a sandbox.',
  ];
}

function finalBlock(o: WorkOrder, iterDir: string): string[] {
  return [
    'When you are done, emit exactly one final block:',
    '__PLAN__',
    `{"procedure":"<the strategy in at most 80 plain words, no code>","metricKey":"${o.contract.metric}","comparator":"${o.contract.comparator}","target":${o.contract.target},"language":"shell","scriptPath":"${iterDir}/run.sh"}`,
  ];
}

function buildPrompt(o: WorkOrder, hyp: Pick<Hypothesis, 'id' | 'statement'>, worktree: string, iterDir: string): string {
  return [
    'You are grd-factory-builder. Implement ONE hypothesis as a minimal code change.',
    '',
    `Objective: ${o.objective}`,
    `Hypothesis (${hyp.id}): ${hyp.statement}`,
    `The change is judged on: ${rule(o)}.`,
    '',
    ...rules(o, worktree),
    '',
    ...finalBlock(o, iterDir),
  ].join('\n');
}

function fixPrompt(
  o: WorkOrder, hyp: Pick<Hypothesis, 'id' | 'statement'>, result: Pick<ExperimentResult, 'exitCode' | 'stderrExcerpt'>,
  worktree: string, iterDir: string, attempt: number, maxDepth: number,
): string {
  return [
    `You are grd-factory-builder in FIX mode (attempt ${attempt} of ${maxDepth}). Your change could not be judged:`,
    `- exit code: ${result.exitCode}`,
    `- detail: ${String(result.stderrExcerpt ?? '').slice(0, 2000) || '(none)'}`,
    '',
    `Objective: ${o.objective}`,
    `Hypothesis (${hyp.id}): ${hyp.statement}`,
    '',
    ...rules(o, worktree),
    '',
    ...finalBlock(o, iterDir),
  ].join('\n');
}

/** The blind replicator gets the objective, the rule, the paths and the note: no hypothesis, no diff. */
function replicationPrompt(o: WorkOrder, strategy: string, worktree: string, iterDir: string): string {
  return [
    'You are grd-factory-builder. Implement the strategy below as a code change, starting from unmodified code.',
    '',
    `Objective: ${o.objective}`,
    `The change is judged on: ${rule(o)}.`,
    `Strategy: ${strategy}`,
    '',
    ...rules(o, worktree),
    '',
    ...finalBlock(o, iterDir),
  ].join('\n');
}

/** About 128 tokens, at roughly four characters per token. */
function strategyNote(procedure: string): string {
  const s = procedure.replace(/\s+/g, ' ').trim();
  return s.length <= 512 ? s : `${s.slice(0, 509)}...`;
}

module.exports = { composeQuestion, buildPrompt, fixPrompt, replicationPrompt, strategyNote };
