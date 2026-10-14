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

function shipCandidate(
  exec: Exec, e: Evidence, worktree: string, orderDir: string,
): { branch: string; prUrl: string | null; error: string | null; manual: string | null } {
  const branch = `factory/${e.order.id}/${e.candidate}`;
  const title = `factory: ${e.order.objective}`.slice(0, 72);
  commitCandidate(exec, worktree, branch, e.changed, `${title}\n\n${e.strategy}`);
  const bodyFile = path.join(orderDir, `pr-body-${e.candidate}.md`);
  fs.writeFileSync(bodyFile, evidenceBody(e));
  const prCommand = `gh pr create --base ${e.order.base} --head ${branch} --title ${JSON.stringify(title)} --body-file ${bodyFile}`;
  try {
    exec('git', ['-C', worktree, 'push', e.order.remote, `HEAD:refs/heads/${branch}`], { timeout: 120000 });
  } catch (err) {
    return { branch, prUrl: null, error: `push failed: ${why(err)}`, manual: `git -C ${e.order.repo} push ${e.order.remote} ${branch} && ${prCommand}` };
  }
  try {
    const out = exec('gh', ['pr', 'create', '--base', e.order.base, '--head', branch, '--title', title, '--body-file', bodyFile],
      { cwd: worktree, timeout: 120000 });
    return { branch, prUrl: out.trim().split('\n').pop() || null, error: null, manual: null };
  } catch (err) {
    return { branch, prUrl: null, error: `PR creation failed: ${why(err)}`, manual: prCommand };
  }
}

const STOP_TEXT: Record<StopReason, string> = {
  shipped: 'A patch cleared every gate and a PR was opened.',
  budget_spent: 'The budget ran out before any patch cleared every gate.',
  holdout_spent: 'The hidden-evaluation queries are used up. More would start overfitting it; a new hidden evaluation resets this.',
  plateau: 'Several candidates in a row missed the rule without beating the best dev result.',
  hidden_broken: 'The hidden evaluation failed to print its metric on a candidate. Fix it before trusting this order again; the query still counts.',
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
  tokenCapEnforced: boolean;
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
    `Tokens: ${r.tokens} of ${o.budget.tokens}${r.tokenCapEnforced ? '' : ' (the backend reported no counts, so the cap was not enforced)'}.`,
    `Candidates: ${r.events.length} of ${o.budget.candidates}. Hidden queries: ${r.hiddenQueries} of ${o.budget.hidden_queries}.`,
    ...(r.warnings.length ? ['', 'Warnings:', ...r.warnings.map((w) => `- ${w}`)] : []),
  ];
  const file = path.join(orderDir, 'report.md');
  fs.writeFileSync(file, lines.join('\n') + '\n');
  fs.writeFileSync(path.join(orderDir, 'status.json'), JSON.stringify({ stop: r.stop, prUrl: r.prUrl, at: new Date().toISOString() }) + '\n');
  return file;
}

module.exports = { evidenceBody, shipCandidate, writeReport, STOP_TEXT };
