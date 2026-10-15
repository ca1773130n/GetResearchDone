'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { CandidateEvent, QueryRecord, WorkOrder } from '../../../lib/factory/types';
import type { RunOrderDeps, RunOrderResult } from '../../../lib/factory/line';
import type { SchedulerSpawnResult, SpawnOpts } from '../../../lib/types';
import type { SignalTarget } from '../../../lib/factory/line';
const line = require('../../../lib/factory/line') as {
  runOrder: (home: string, id: string, deps?: RunOrderDeps) => Promise<RunOrderResult>;
  readEvents: (od: string) => { byId: Map<string, CandidateEvent>; ids: string[] };
  isPlateau: (done: CandidateEvent[], cmp: string, target: number, window: number, base: number) => boolean;
  defaultOnAbort: (handler: () => void, target?: SignalTarget) => () => void;
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

const isHiddenRun = (args: string[]): boolean => fx.containerCommand(args).startsWith('sh /grader-');

/**
 * dev: 100 when the worktree is FAST, else 187. hidden: `hidden(fast)`. `onHidden` runs in the
 * mounted worktree first, the way a real hidden evaluation can write into a read-write /work.
 */
function docker(hidden: (fast: boolean) => number, onHidden?: (wt: string) => void) {
  return (args: string[]): string => {
    const wt = fx.mountedWorktree(args);
    const fast = wt !== null && String(fs.readFileSync(path.join(wt, 'src/search.js'), 'utf8')).includes('FAST');
    if (isHiddenRun(args) && onHidden && wt !== null) onHidden(wt);
    const value = isHiddenRun(args) ? hidden(fast) : (fast ? 100 : 187);
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

  it('ships the tree the gates saw, not what the hidden evaluation left behind', async () => {
    const w = world();
    const litter = path.join('src', 'cache', 'warm.json');
    let littered = false;
    const exec = fx.fakeExec(docker(() => 104.25, (wtDir) => {
      // A latency patch's holdout run populating a cache is ordinary, not adversarial: it lands
      // inside the allowlist, so neither the scope check nor the tamper scan would ever see it.
      fs.mkdirSync(path.join(wtDir, 'src', 'cache'), { recursive: true });
      fs.writeFileSync(path.join(wtDir, litter), '{"warm":true}');
      littered = true;
    }));
    const { r } = await run(w, writeFast, () => 104.25, { exec });
    expect(r.stop).toBe('shipped');
    expect(littered).toBe(true);
    expect(fx.git(w.repo, 'diff', '--name-only', 'main', 'factory/search-p95/c1').trim()).toBe('src/search.js');
    expect(fx.git(w.repo, 'show', '--name-only', '--format=', 'factory/search-p95/c1')).not.toContain('warm.json');
  });

  it('keeps a broken hidden evaluation\'s reason in queries.jsonl and out of everything else', async () => {
    const holdout = 'holdout/eval.sh: line 12: dataset p95-holdout-2026: not found';
    const w = world({ budget: { tokens: 1e9, candidates: 2, hidden_queries: 2, wall_minutes: 60 } });
    const base = docker(() => 0);
    const exec = fx.fakeExec((args) => {
      if (isHiddenRun(args)) throw fx.execFailure(127, holdout);
      return base(args);
    });
    const { r, prompts, events } = await run(w, writeFast, () => 0, { exec });
    expect(r.stop).toBe('hidden_broken');
    // The human's own script broke: the reason is on disk, in the one file no agent can reach.
    const queries = readQueries(w.od);
    expect(queries.map((q) => q.status)).toEqual(['started', 'broken']);
    expect(queries[1].detail).toContain(holdout);
    expect(queries[1].median).toBeNull();
    // And nowhere else: not on the candidate row, not in a prompt, not in the report.
    expect(events.byId.get('c1')).toEqual(expect.objectContaining({
      outcome: 'rejected_at_gate', detail: 'the hidden evaluation broke on this candidate',
    }));
    const report = String(fs.readFileSync(r.reportPath, 'utf8'));
    expect(report).toContain('Stopped: hidden_broken');
    expect(report).toContain('queries.jsonl');
    for (const text of [report, ...prompts, String(fs.readFileSync(path.join(w.od, 'candidates.jsonl'), 'utf8'))]) {
      expect(text).not.toContain(holdout);
      expect(text).not.toContain('p95-holdout-2026');
    }
    // The candidate was committed before the query; a rejected one leaves no branch behind.
    expect(fx.git(w.repo, 'branch', '--list', 'factory/search-p95/c1').trim()).toBe('');
  });

  it('does not blame the builder when docker vanishes between replication and the hidden gate', async () => {
    const w = world({ budget: { tokens: 1e9, candidates: 2, hidden_queries: 2, wall_minutes: 60 } });
    const base = docker(() => 104.25);
    let replicated = false;
    const inner = fx.fakeExec((args) => {
      const wtDir = fx.mountedWorktree(args);
      if (wtDir !== null && /c1r$/.test(wtDir)) replicated = true;
      return base(args);
    });
    const exec: Exec = (bin, args, opts) => {
      if (bin === 'docker' && args[0] === 'version' && replicated) {
        throw fx.execFailure(1, 'Cannot connect to the Docker daemon');
      }
      return inner(bin, args, opts);
    };
    const { r, events } = await run(w, writeFast, () => 104.25, { exec });
    expect(r.stop).toBe('docker_unavailable');
    expect(readQueries(w.od)).toEqual([]);
    // It passed the dev rule and blind replication; only the sandbox went away.
    expect(events.byId.get('c1')).toEqual(expect.objectContaining({
      outcome: 'not_judged', detail: 'docker went away before the final gate could run',
      devMedian: 100, replicaDevMedian: 100,
    }));
    const report = String(fs.readFileSync(r.reportPath, 'utf8'));
    expect(report).toContain('| c1 | not_judged |');
    expect(report).not.toContain('build_failed');
    expect(report).not.toContain('interrupted by a crash or abort');
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

describe('defaultOnAbort', () => {
  function target(): { t: SignalTarget; on: string[]; off: string[]; exits: number[]; fire: (s: string) => void } {
    const handlers = new Map<string, () => void>();
    const on: string[] = [];
    const off: string[] = [];
    const exits: number[] = [];
    return {
      on, off, exits,
      fire: (s) => { (handlers.get(s) as () => void)(); },
      t: {
        once: (s, fn) => { on.push(s); handlers.set(s, fn); return undefined; },
        removeListener: (s) => { off.push(s); return undefined; },
        exit: (code) => { exits.push(code); },
      },
    };
  }

  it('cleans up and exits 130 on the signal, and unregisters both signals', () => {
    const g = target();
    let cleaned = 0;
    const unregister = line.defaultOnAbort(() => { cleaned += 1; }, g.t);
    expect(g.on).toEqual(['SIGINT', 'SIGTERM']);
    g.fire('SIGINT');
    expect([cleaned, g.exits]).toEqual([1, [130]]);
    unregister();
    expect(g.off).toEqual(['SIGINT', 'SIGTERM']);
  });

  it('still exits when the cleanup itself throws, rather than wedging a half-aborted run', () => {
    const g = target();
    const unregister = line.defaultOnAbort(() => { throw new Error('worktree is busy'); }, g.t);
    expect(() => g.fire('SIGTERM')).toThrow(/worktree is busy/);
    expect(g.exits).toEqual([130]);
    unregister();
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
