'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec, ExecError } from './exec';
import type { CandidateEvent, StopReason, WorkOrder } from './types';
const { commitCandidate } = require('./worktrees') as {
  commitCandidate: (e: Exec, dir: string, branch: string, paths: string[], msg: string) => void;
};

export interface Evidence {
  order: WorkOrder;
  candidate: string;
  hypothesis: string;
  strategy: string;
  devMedian: number;
  replicaDevMedian: number;
  hiddenMedian: number;
  changed: string[];
  tokens: number;
  hiddenQueriesUsed: number;
}

function evidenceBody(e: Evidence): string {
  const o = e.order;
  return [
    `Opened by the GRD research factory for work order \`${o.id}\`. Nothing here was merged automatically; a human merges it.`,
    '',
    `**Objective.** ${o.objective}`,
    '',
    `**Decision rule, fixed before any experiment ran:** \`${o.contract.metric} ${o.contract.comparator} ${o.contract.target}\``,
    '',
    '| Measurement | Unmodified code | This change |',
    '|---|---|---|',
    `| Dev evaluation (median of ${o.dev_eval.repeats}) | ${o.baseline?.dev} | ${e.devMedian} |`,
    `| Blind replication, dev evaluation | | ${e.replicaDevMedian} |`,
    `| Hidden evaluation (median of ${o.hidden_eval.repeats}) | ${o.baseline?.hidden} | ${e.hiddenMedian} |`,
    '',
    `**Hypothesis.** ${e.hypothesis}`,
    '',
    `**Strategy note** given to the blind replicator, which saw no diff and no transcript: ${e.strategy}`,
    '',
    `**Scope.** Every changed path is inside the allowlist (${o.editable.map((g) => `\`${g}\``).join(', ')}):`,
    ...e.changed.map((p) => `- \`${p}\``),
    '',
    `**Cost.** ${e.tokens} tokens. Hidden-evaluation queries used: ${e.hiddenQueriesUsed} of ${o.budget.hidden_queries}.`,
  ].join('\n') + '\n';
}

function why(e: unknown): string {
  const err = e as ExecError;
  return String(err.stderr || err.message || e).trim().slice(0, 500);
}

function shq(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

function candidateBranch(o: WorkOrder, candidate: string): string { return `factory/${o.id}/${candidate}`; }
function prTitle(o: WorkOrder): string { return `factory: ${o.objective}`.slice(0, 72); }

/**
 * Commits exactly `changed` on the candidate's branch, and nothing else.
 *
 * Called BEFORE the hidden evaluation runs, so the tree that ships is exactly the tree that
 * passed the scope check, the tamper scan, the dev rule and blind replication. The hidden
 * evaluation executes the patched code against a read-write `/work`, so anything it leaves in
 * the worktree — a warmed cache, a build artifact — would otherwise ride into the PR unchecked.
 */
function commitForShipping(exec: Exec, o: WorkOrder, candidate: string, strategy: string, changed: string[], worktree: string): string {
  const branch = candidateBranch(o, candidate);
  commitCandidate(exec, worktree, branch, changed, `${prTitle(o)}\n\n${strategy}`);
  return branch;
}

/** Deletes a branch `commitForShipping` created for a candidate that then did not ship. */
function discardBranch(exec: Exec, o: WorkOrder, candidate: string): void {
  try {
    exec('git', ['-C', o.repo, 'branch', '-D', candidateBranch(o, candidate)]);
  } catch { /* never created, or already gone with its worktree */ }
}

/** Pushes the commit `commitForShipping` made and opens the PR. The commit must already exist. */
function shipCandidate(
  exec: Exec, e: Evidence, worktree: string, orderDir: string,
): { branch: string; prUrl: string | null; error: string | null; manual: string | null } {
  const branch = candidateBranch(e.order, e.candidate);
  const title = prTitle(e.order);
  const bodyFile = path.join(orderDir, `pr-body-${e.candidate}.md`);
  fs.writeFileSync(bodyFile, evidenceBody(e));
  // The worktree is removed after shipping, so recovery commands run from the repo and quote every value for the user's shell.
  const prCommand = `cd ${shq(e.order.repo)} && gh pr create --base ${shq(e.order.base)} --head ${shq(branch)} --title ${shq(title)} --body-file ${shq(bodyFile)}`;
  try {
    exec('git', ['-C', worktree, 'push', e.order.remote, `HEAD:refs/heads/${branch}`], { timeout: 120000 });
  } catch (err) {
    return { branch, prUrl: null, error: `push failed: ${why(err)}`, manual: `cd ${shq(e.order.repo)} && git push ${shq(e.order.remote)} ${shq(branch)} && ${prCommand}` };
  }
  try {
    const out = exec('gh', ['pr', 'create', '--base', e.order.base, '--head', branch, '--title', title, '--body-file', bodyFile],
      { cwd: worktree, timeout: 120000 });
    const url = out.trim().split('\n').pop() ?? '';
    if (!/^https?:\/\//.test(url)) {
      return { branch, prUrl: null, error: `PR creation failed: gh printed no pull request URL: ${out.trim().slice(0, 200) || '(empty)'}`, manual: prCommand };
    }
    return { branch, prUrl: url, error: null, manual: null };
  } catch (err) {
    return { branch, prUrl: null, error: `PR creation failed: ${why(err)}`, manual: prCommand };
  }
}

const STOP_TEXT: Record<StopReason, string> = {
  shipped: 'A patch cleared every gate and a PR was opened.',
  budget_spent: 'The budget ran out before any patch cleared every gate.',
  holdout_spent: 'The hidden-evaluation queries are used up. More would start overfitting it; a new hidden evaluation resets this.',
  plateau: 'Several candidates in a row missed the rule without beating the best dev result.',
  hidden_broken: 'The scoring half of the hidden evaluation failed on a candidate; its own error is the last `broken` row of queries.jsonl. A candidate that crashes under the evaluation is recorded as failing the gate instead, so this means your own script. Fix it before trusting this order again; the query still counts.',
  build_failures: 'The builder failed to produce a usable change three times in a row.',
  docker_unavailable: 'Docker is not available. The factory never runs candidate code on the host.',
};

export interface ReportInput {
  order: WorkOrder;
  stop: StopReason;
  prUrl: string | null;
  shipError: string | null;
  manual: string | null;
  events: CandidateEvent[];
  tokens: number;
  /** Spawns whose backend reported no token count, so `tokens` under-states the real spend. */
  unmeteredSpawns: number;
  hiddenQueries: number;
  warnings: string[];
}

function writeReport(orderDir: string, r: ReportInput): string {
  const o = r.order;
  const lines = [
    `# Research factory report: ${o.id}`,
    '',
    `**Stopped: ${r.stop}.** ${STOP_TEXT[r.stop]}`,
    '',
    ...(r.prUrl ? [`PR: ${r.prUrl}`, ''] : []),
    ...(r.shipError ? [`Shipping failed: ${r.shipError}`, '', 'Finish it with:', '', '```', r.manual ?? '', '```', ''] : []),
    `Objective: ${o.objective}`,
    `Rule: \`${o.contract.metric} ${o.contract.comparator} ${o.contract.target}\`; unmodified code: dev ${o.baseline?.dev}, hidden ${o.baseline?.hidden}.`,
    '',
    '| Candidate | Outcome | Dev median | Detail |',
    '|---|---|---|---|',
    ...r.events.map((e) => `| ${e.id} | ${e.outcome ?? 'unfinished'} | ${e.devMedian ?? ''} | ${(e.detail ?? '').replace(/\|/g, '/')} |`),
    '',
    `Tokens: ${r.tokens} of ${o.budget.tokens}${r.unmeteredSpawns > 0 ? ` (${r.unmeteredSpawns} spawn(s) reported no token count, so the real spend is higher than this and can exceed the cap)` : ''}.`,
    `Candidates: ${r.events.length} of ${o.budget.candidates}. Hidden queries: ${r.hiddenQueries} of ${o.budget.hidden_queries}.`,
    ...(r.warnings.length ? ['', 'Warnings:', ...r.warnings.map((w) => `- ${w}`)] : []),
  ];
  const file = path.join(orderDir, 'report.md');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  fs.writeFileSync(path.join(orderDir, 'status.json'), JSON.stringify({ stop: r.stop, prUrl: r.prUrl, at: new Date().toISOString() }) + '\n');
  return file;
}

module.exports = { evidenceBody, commitForShipping, discardBranch, shipCandidate, writeReport, STOP_TEXT };
