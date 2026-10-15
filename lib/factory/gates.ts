'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from './exec';
import type { QueryRecord, WorkOrder } from './types';
import type { SandboxCtx } from './sandbox';
import type { Comparator } from '../research/types';
const { measureOracle } = require('./sandbox') as {
  measureOracle: (c: SandboxCtx, s: WorkOrder['sandbox'], spec: import('./sandbox').OracleSpec,
    n: number, metric: string, label: string) => import('./sandbox').OracleResult;
};
const { untrackedPaths } = require('./worktrees') as { untrackedPaths: (e: Exec, dir: string) => string[] };
const { compare } = require('../research/verdict') as {
  compare: (v: number, c: Comparator, t: number) => boolean;
};
const { readJsonl } = require('./jsonl') as { readJsonl: <T>(f: string, warn?: (m: string) => void) => T[] };

/** The literal an evaluation prints its result with. A patch that adds it is tampering. */
const RESULT_MARKER = '__RESULT__';

/** `**` crosses directories, `*` and `?` do not. Matched against repo-relative paths. */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else { re += '.*'; }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(p: string, globs: string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(p));
}

/** Every path a candidate changed: tracked edits against base, plus untracked paths. */
function changedPaths(exec: Exec, dir: string, base: string): string[] {
  const tracked = exec('git', ['-C', dir, 'diff', '--name-only', '--no-renames', base]).split('\n').filter(Boolean);
  return [...new Set([...tracked, ...untrackedPaths(exec, dir)])].sort();
}

function scopeCheck(changed: string[], editable: string[], protectedFiles: string[]): { ok: boolean; violations: string[] } {
  const violations = changed.filter((p) => protectedFiles.includes(p) || !matchesAny(p, editable));
  return { ok: violations.length === 0, violations };
}

function filesUnder(root: string, rel: string): string[] {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return [];
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return (fs.readdirSync(abs) as string[]).flatMap((n) => filesUnder(root, path.posix.join(rel, n)));
}

/** Paths whose added lines, or whose untracked contents, contain the result marker. */
function tamperScan(exec: Exec, dir: string, base: string): string[] {
  const hits = new Set<string>();
  let file = '';
  let inHunk = false;
  for (const line of exec('git', ['-C', dir, 'diff', '-U0', '--no-color', '--no-renames', base]).split('\n')) {
    // A `+++ ` line is a file header only before the first hunk; inside a hunk it is an added line.
    if (line.startsWith('diff --git ')) { inHunk = false; file = ''; continue; }
    if (line.startsWith('@@')) { inHunk = true; continue; }
    if (!inHunk && line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ (b\/)?/, ''); continue; }
    if (inHunk && line.startsWith('+') && line.includes(RESULT_MARKER)) hits.add(file);
  }
  for (const entry of untrackedPaths(exec, dir)) {
    for (const f of filesUnder(dir, entry.replace(/\/$/, ''))) {
      try {
        if (String(fs.readFileSync(path.join(dir, f), 'utf8')).includes(RESULT_MARKER)) hits.add(f);
      } catch { hits.add(f); /* unreadable: fail closed, treat as tampering */ }
    }
  }
  return [...hits].sort();
}

function queriesFile(orderDir: string): string { return path.join(orderDir, 'queries.jsonl'); }

function readQueries(orderDir: string, warn?: (m: string) => void): QueryRecord[] {
  return readJsonl<QueryRecord>(queriesFile(orderDir), warn);
}

/** Queries spent, counted from write-ahead `started` rows, so a crash never refunds one. */
function queriesUsed(orderDir: string, warn?: (m: string) => void): number {
  return readQueries(orderDir, warn).filter((q) => q.status === 'started').length;
}

function appendQuery(orderDir: string, rec: QueryRecord): void {
  fs.appendFileSync(queriesFile(orderDir), JSON.stringify(rec) + '\n');
}

/**
 * The `hidden_eval` paths an oracle run needs, with the `hidden/` prefix stripped.
 * `vaultParent` is the directory holding `hidden/` — the order's vault when running a
 * candidate, the draft directory when `validate` measures the baseline.
 */
function oracleSpec(order: WorkOrder, vaultParent: string, worktree: string): import('./sandbox').OracleSpec {
  const h = order.hidden_eval;
  return {
    worktree,
    vault: path.join(vaultParent, 'hidden'),
    stageRoot: path.join(vaultParent, 'stage'),
    run: h.run,
    score: h.score.slice('hidden/'.length),
    output: h.output,
    ...(h.inputs === undefined ? {} : { inputs: h.inputs.slice('hidden/'.length) }),
  };
}

/**
 * One hidden-evaluation query. The `started` row is written before anything runs. The result
 * is returned to the factory only and never shown to an agent.
 *
 * A candidate that crashes under the held-out evaluation, or that never writes its output, has
 * failed it — the same one bit a metric miss earns. Only the human's scoring script failing
 * counts as `broken`, because only that is a reason to stop the order.
 */
function hiddenGate(
  ctx: SandboxCtx, order: WorkOrder, orderDir: string, candidate: string, worktree: string,
): { outcome: 'pass' | 'fail' | 'broken'; median: number | null; detail: string } {
  if (queriesUsed(orderDir) >= order.budget.hidden_queries) {
    throw new Error('hidden gate: query budget already spent');
  }
  appendQuery(orderDir, { candidate, status: 'started', at: new Date().toISOString() });
  const m = measureOracle(
    ctx, order.sandbox, oracleSpec(order, path.join(orderDir, 'vault'), worktree),
    order.hidden_eval.repeats, order.contract.metric, `${candidate}-hidden`,
  );
  const res = !m.ok || m.median === null
    ? {
      outcome: m.failedPhase === 'run' ? 'fail' as const : 'broken' as const,
      median: null, detail: m.stderrExcerpt || `exit ${m.exitCode}`,
    }
    : {
      outcome: compare(m.median, order.contract.comparator, order.contract.target) ? 'pass' as const : 'fail' as const,
      median: m.median, detail: '',
    };
  // The detail says why the human's own holdout script broke, so it must be written down
  // somewhere — and queries.jsonl is the one surface no agent can reach. It goes nowhere else:
  // not onto the candidate row, not into a prompt, not into the report.
  appendQuery(orderDir, {
    candidate, status: res.outcome, median: res.median, at: new Date().toISOString(),
    ...(res.detail ? { detail: res.detail } : {}),
  });
  return res;
}

module.exports = {
  RESULT_MARKER, globToRegExp, matchesAny, changedPaths, scopeCheck, tamperScan,
  readQueries, queriesUsed, oracleSpec, hiddenGate,
};
