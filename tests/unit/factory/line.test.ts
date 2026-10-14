'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { CandidateEvent, QueryRecord, WorkOrder } from '../../../lib/factory/types';
import type { RunOrderDeps, RunOrderResult } from '../../../lib/factory/line';
import type { SchedulerSpawnResult, SpawnOpts } from '../../../lib/types';
const line = require('../../../lib/factory/line') as {
  runOrder: (home: string, id: string, deps?: RunOrderDeps) => Promise<RunOrderResult>;
  readEvents: (od: string) => { byId: Map<string, CandidateEvent>; ids: string[] };
  isPlateau: (done: CandidateEvent[], cmp: string, target: number, window: number, base: number) => boolean;
};
const { readQueries } = require('../../../lib/factory/gates') as { readQueries: (od: string) => QueryRecord[] };
const fx = require('./fixtures') as {
  tmpDir: (p: string) => string; git: (c: string, ...a: string[]) => string;
  makeRepo: (f: Record<string, string>) => string; fakeExec: (r: (a: string[]) => string, c?: string[][]) => Exec;
  mountedWorktree: (a: string[]) => string | null; containerCommand: (a: string[]) => string;
  execFailure: (status: number, stderr: string, stdout?: string) => Error;
  sampleOrder: (r: string, o?: Partial<WorkOrder>) => WorkOrder;
  installOrder: (h: string, o: WorkOrder, s?: string) => string; worktreeCount: (r: string) => number;
};

const HYP = (n: number) => `__HYPOTHESIS__ {"statement":"Idea ${n}: cache the index.","rationale":"r","predictedOutcome":"p","refutationCondition":"if the mechanism is absent the effect disappears / amplifying it makes the effect worse"}`;
const PLAN = '__PLAN__ {"procedure":"Cache the search index in memory.","metricKey":"latency_p95_ms","comparator":"<=","target":120,"language":"shell","scriptPath":"x/run.sh"}';
const TAKE = '__TAKEAWAY__ {"kind":"domain_fact","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';

type Builder = (prompt: string, cwd: string) => void;
function scheduler(builder: Builder, prompts: string[], tokens = 1000, cwds: string[] = []) {
  let n = 0;
  return {
    spawn: async (prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult> => {
      prompts.push(prompt);
      cwds.push(String(opts.cwd));
      let text = TAKE;
      if (opts.agentType === 'grd-hypothesizer') text = HYP(++n);
      if (opts.agentType === 'grd-factory-builder') { builder(prompt, String(opts.cwd)); text = PLAN; }
      return { exitCode: 0, stdout: JSON.stringify({ type: 'result', result: text }), stderr: '', timedOut: false, backend: 'claude', tokensUsed: tokens, workItemId: 'w' };
    },
  };
}
const writeFast: Builder = (_p, cwd) => { fs.writeFileSync(path.join(cwd, 'src/search.js'), 'FAST'); };
const writeSlow: Builder = (_p, cwd) => { fs.writeFileSync(path.join(cwd, 'src/search.js'), 'slow but changed'); };
const isReplication = (p: string) => p.includes('Implement the strategy below');

/** dev: 100 when the worktree is FAST, else 187. hidden: `hidden(fast)`. */
function docker(hidden: (fast: boolean) => number) {
  return (args: string[]): string => {
    const wt = fx.mountedWorktree(args);
    const fast = wt !== null && String(fs.readFileSync(path.join(wt, 'src/search.js'), 'utf8')).includes('FAST');
    const value = fx.containerCommand(args).startsWith('sh /grader-') ? hidden(fast) : (fast ? 100 : 187);
    return `__RESULT__ {"latency_p95_ms": ${value}}\n`;
  };
}

function world(over: Partial<WorkOrder> = {}) {
  const repo = fx.makeRepo({ 'src/search.js': 'slow', 'bench/run.js': '', 'package.json': '{}', 'README.md': 'r' });
  const home = fx.tmpDir('grd-factory-home-');
  const order = fx.sampleOrder(repo, over);
  const od = fx.installOrder(home, order, 'echo HIDDEN_EVAL_MARKER\n');
  return { repo, home, order, od };
}

async function run(w: ReturnType<typeof world>, builder: Builder, hidden: (fast: boolean) => number,
  extra: Partial<RunOrderDeps> = {}, tokens = 1000) {
  const prompts: string[] = [];
  const cwds: string[] = [];
  const calls: string[][] = [];
  const r = await line.runOrder(w.home, w.order.id, {
    exec: fx.fakeExec(docker(hidden), calls), scheduler: scheduler(builder, prompts, tokens, cwds),
    warn: () => undefined, onAbort: () => () => undefined, ...extra,
  });
  return { r, prompts, cwds, calls, events: line.readEvents(w.od) };
}

/** Where agents are allowed to work: never the order directory, and never under it. */
function workRoot(w: ReturnType<typeof world>): string {
  return path.join(w.home, 'work', w.order.id);
}

describe('runOrder', () => {
  it('ships a replicated patch that passes the hidden gate, and leaves no worktree behind', async () => {
    const w = world();
    const { r, calls, events } = await run(w, writeFast, () => 104.25);
    expect(r.stop).toBe('shipped');
    expect(r.prUrl).toBe('https://github.com/acme/app/pull/7');
    expect(events.byId.get('c1')).toEqual(expect.objectContaining({ outcome: 'shipped', devMedian: 100, replicaDevMedian: 100 }));
    expect(readQueries(w.od).map((q) => q.status)).toEqual(['started', 'pass']);
    expect(fx.git(w.repo, 'diff', '--name-only', 'main', 'factory/search-p95/c1').trim()).toBe('src/search.js');
    expect(calls.find((c) => c[0] === 'gh')).toEqual(expect.arrayContaining(['--head', 'factory/search-p95/c1']));
    expect(fx.worktreeCount(w.repo)).toBe(1);
    expect(fs.existsSync(r.reportPath)).toBe(true);
  });

  it('never puts the hidden evaluation into any prompt', async () => {
    const w = world();
    const { prompts } = await run(w, writeFast, () => 104.25);
    expect(prompts.length).toBeGreaterThan(3);
    for (const p of prompts) {
      expect(p).not.toContain(path.join(w.od, 'vault'));
      expect(p).not.toContain('HIDDEN_EVAL_MARKER');
      expect(p).not.toContain('grader');
      expect(p).not.toContain('191.37');
      expect(p).not.toContain('104.25');
    }
  });

  it('spends no hidden query on a patch that fails blind replication', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 1, hidden_queries: 2, wall_minutes: 60 } });
    const { r, events } = await run(w, (p, cwd) => (isReplication(p) ? writeSlow(p, cwd) : writeFast(p, cwd)), () => 104.25);
    expect(events.byId.get('c1')).toEqual(expect.objectContaining({ outcome: 'did_not_replicate', replicaDevMedian: 187 }));
    expect(readQueries(w.od)).toEqual([]);
    expect(r.stop).toBe('budget_spent');
  });

  it('tells later hypotheses one bit about a hidden rejection, and stops when the holdout is spent', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 3, hidden_queries: 2, wall_minutes: 60 } });
    const { r, prompts, events } = await run(w, writeFast, () => 190);
    expect(r.stop).toBe('holdout_spent');
    expect(events.byId.get('c1')?.outcome).toBe('rejected_at_gate');
    const later = prompts.filter((p) => p.includes('- c1:'));
    expect(later.length).toBeGreaterThan(0);
    for (const p of later) { expect(p).toContain('rejected at the final gate'); expect(p).not.toContain('190'); }
  });

  it('stops at a plateau when candidates keep missing without improving', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 6, hidden_queries: 2, wall_minutes: 60 } });
    const { r, events } = await run(w, writeSlow, () => 104.25);
    expect(r.stop).toBe('plateau');
    expect(events.ids).toEqual(['c1', 'c2', 'c3']);
    expect([...events.byId.values()].every((e) => e.outcome === 'dev_miss')).toBe(true);
  });

  it('stops when the token budget is spent', async () => {
    const w = world({ budget: { tokens: 2500, candidates: 6, hidden_queries: 2, wall_minutes: 60 } });
    const { r } = await run(w, writeSlow, () => 104.25);
    expect(r.stop).toBe('budget_spent');
    expect(r.tokens).toBe(3000);
    expect(String(fs.readFileSync(path.join(w.od, 'spend.jsonl'), 'utf8')).trim().split('\n')).toHaveLength(3);
  });

  it('sends an out-of-scope change back to the builder once, with the offending path', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 1, hidden_queries: 2, wall_minutes: 60 } });
    const { r, prompts } = await run(w, (p, cwd) => {
      writeFast(p, cwd);
      if (p.includes('FIX mode')) fs.writeFileSync(path.join(cwd, 'README.md'), 'r');
      else if (!isReplication(p)) fs.writeFileSync(path.join(cwd, 'README.md'), 'touched');
    }, () => 104.25);
    const fix = prompts.find((p) => p.includes('FIX mode'));
    expect(fix).toContain('changes outside the allowlist: README.md');
    expect(r.stop).toBe('shipped');
  });

  it('resumes accounting after a crash: a started query and an unfinished candidate both count', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 3, hidden_queries: 1, wall_minutes: 60 } });
    fs.writeFileSync(path.join(w.od, 'queries.jsonl'), JSON.stringify({ candidate: 'c1', status: 'started', at: 't' }) + '\n');
    fs.writeFileSync(path.join(w.od, 'candidates.jsonl'), JSON.stringify({ id: 'c1', at: 't', attempt: 1 }) + '\n');
    const { r, prompts, events } = await run(w, writeFast, () => 104.25);
    expect(r.stop).toBe('holdout_spent');
    expect(prompts).toEqual([]);
    expect(events.byId.get('c1')).toEqual(expect.objectContaining({ outcome: 'build_failed', detail: 'interrupted by a crash or abort' }));
  });

  it('keeps every agent working directory out of the order directory', async () => {
    const w = world();
    const { cwds } = await run(w, writeFast, () => 104.25);
    const root = workRoot(w);
    expect(cwds.length).toBeGreaterThan(3);
    // The loop's own dir and a candidate's worktree, both under the work root.
    expect(cwds).toContain(path.join(root, 'line'));
    expect(cwds).toContain(path.join(root, 'worktrees', 'c1'));
    for (const c of cwds) {
      expect(c.startsWith(`${root}${path.sep}`)).toBe(true);
      expect(c).not.toBe(w.od);
      expect(c.startsWith(`${w.od}${path.sep}`)).toBe(false);
    }
    // The holdout and the per-query log stay where no agent cwd can reach them by walking up.
    expect(fs.existsSync(path.join(w.od, 'vault', 'hidden', 'eval.sh'))).toBe(true);
    expect(fs.existsSync(path.join(w.od, 'queries.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'vault'))).toBe(false);
  });

  it('resumes after three interrupted candidates instead of calling it a plateau', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 6, hidden_queries: 2, wall_minutes: 60 } });
    fs.writeFileSync(path.join(w.od, 'candidates.jsonl'),
      ['c1', 'c2', 'c3'].map((id, i) => JSON.stringify({ id, at: 't', attempt: i + 1 })).join('\n') + '\n');
    const { r, prompts, events } = await run(w, writeFast, () => 104.25);
    expect(r.stop).toBe('shipped');
    expect(events.ids).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(events.byId.get('c4')?.outcome).toBe('shipped');
    for (const id of ['c1', 'c2', 'c3']) {
      expect(events.byId.get(id)).toEqual(expect.objectContaining({ outcome: 'build_failed', detail: 'interrupted by a crash or abort' }));
    }
    // Closed on entry, so the resumed run knows what the aborted one already tried.
    const question = prompts.find((p) => p.includes('Earlier candidates'));
    for (const id of ['- c1:', '- c2:', '- c3:']) expect(question).toContain(id);
  });

  it('records a candidate before creating its worktree, so a failed start still counts', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 1, hidden_queries: 2, wall_minutes: 60 } });
    const inner = fx.fakeExec(docker(() => 104.25));
    const exec: Exec = (bin, args, opts) => {
      if (bin === 'git' && args[2] === 'worktree' && args[3] === 'add' && /[/\\]worktrees[/\\]c1$/.test(String(args[5]))) {
        throw fx.execFailure(128, 'fatal: could not create work tree dir');
      }
      return inner(bin, args, opts);
    };
    const { r, events } = await run(w, writeFast, () => 104.25, { exec });
    expect(events.ids).toEqual(['c1']);
    expect(events.byId.get('c1')).toEqual(expect.objectContaining({ attempt: 1, iteration: 1, threadId: expect.any(String) }));
    expect(r.candidates).toBe(1);
    expect(r.stop).toBe('budget_spent');
    // The row is closed before the report is written, so the report has no unfinished candidate.
    expect(events.byId.get('c1')?.outcome).toBe('build_failed');
    expect(String(fs.readFileSync(r.reportPath, 'utf8'))).not.toContain('unfinished');
  });

  it('stops after three attempts that start no candidate', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 6, hidden_queries: 1, wall_minutes: 1 } });
    const warns: string[] = [];
    let attempts = 0;
    // A monotonic clock: one tick per reading, so a run that fails to count stalled attempts
    // reaches the one-minute wall cap in ~60 readings instead of spinning.
    let clock = 0;
    const { r, events } = await run(w, writeFast, () => 104.25, {
      runResearch: async () => { attempts += 1; return { threadId: 't1', status: 'exhausted' as const, iterations: 0 }; },
      warn: (m: string) => { warns.push(m); },
      now: () => { clock += 1000; return clock; },
    });
    expect(attempts).toBe(3);
    expect(r.stop).toBe('build_failures');
    expect(r.candidates).toBe(0);
    expect(events.ids).toEqual([]);
    // Routed through warn, so an unattended run says on stderr why it is failing, and the report agrees.
    expect(warns.filter((m) => m.includes('without starting a candidate'))).toHaveLength(3);
    expect(String(fs.readFileSync(r.reportPath, 'utf8'))).toContain('attempt 1: the research loop returned status exhausted without starting a candidate');
  });

  it('removes every worktree when aborted mid-run', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 1, hidden_queries: 1, wall_minutes: 60 } });
    let abort: () => void = () => undefined;
    let during = -1;
    await run(w, (p, cwd) => { writeFast(p, cwd); if (during < 0) { abort(); during = fx.worktreeCount(w.repo); } }, () => 104.25,
      { onAbort: (h) => { abort = h; return () => undefined; } });
    expect(during).toBe(1);
    expect(fx.worktreeCount(w.repo)).toBe(1);
  });
});

describe('isPlateau', () => {
  const e = (id: string, devMedian: number | null, outcome: CandidateEvent['outcome'] = 'dev_miss'): CandidateEvent =>
    ({ id, at: 't', devMedian, outcome });
  it('needs a full window of misses with no new best', () => {
    expect(line.isPlateau([e('c1', 150), e('c2', 190)], '<=', 120, 3, 187)).toBe(false);
    expect(line.isPlateau([e('c1', 187), e('c2', 190), e('c3', null, 'build_failed')], '<=', 120, 3, 187)).toBe(true);
    expect(line.isPlateau([e('c1', 187), e('c2', 150), e('c3', 190)], '<=', 120, 3, 187)).toBe(false);
    expect(line.isPlateau([e('c1', 187), e('c2', 190), e('c3', 150, 'did_not_replicate')], '<=', 120, 3, 187)).toBe(false);
  });
});
