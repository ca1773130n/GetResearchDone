'use strict';
const fs = require('fs');
const path = require('path');
import type { SchedulerSpawnResult, SpawnOpts } from '../../../lib/types';
import type { MeteredSpawn } from '../../../lib/factory/spawn';
const sp = require('../../../lib/factory/spawn') as {
  BUILDER_DENIED: string[];
  BudgetSpentError: new (m: string) => Error;
  tokensFrom: (r: SchedulerSpawnResult) => number;
  readSpent: (od: string, warn?: (m: string) => void) => number;
  createMeteredSpawn: (o: { scheduler: { spawn: (p: string, o: SpawnOpts) => Promise<SchedulerSpawnResult> };
    orderDir: string; budgetTokens: number; deadline?: number; now?: () => number;
    warn: (m: string) => void }) => MeteredSpawn;
};
const { tmpDir } = require('./fixtures') as { tmpDir: (p: string) => string };

const res = (over: Partial<SchedulerSpawnResult> = {}): SchedulerSpawnResult => ({
  exitCode: 0, stdout: JSON.stringify({ type: 'result', result: 'ok' }), stderr: '',
  timedOut: false, backend: 'claude', tokensUsed: 1000, workItemId: 'w', ...over,
});

describe('tokensFrom', () => {
  it('prefers the scheduler count, then the usage in claude JSON output', () => {
    expect(sp.tokensFrom(res({ tokensUsed: 42 }))).toBe(42);
    const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 3, cache_read_input_tokens: 2 };
    expect(sp.tokensFrom(res({ tokensUsed: 0, stdout: JSON.stringify([{ type: 'system' }, { type: 'result', result: 'x', usage }]) }))).toBe(20);
    expect(sp.tokensFrom(res({ tokensUsed: 0, stdout: 'not json' }))).toBe(0);
  });
});

describe('createMeteredSpawn', () => {
  function meter(budget: number, result: () => SchedulerSpawnResult, seen: SpawnOpts[] = [], warnings: string[] = []) {
    const calls = { n: 0 };
    const orderDir = tmpDir('grd-factory-od-');
    const m = sp.createMeteredSpawn({
      scheduler: { spawn: async (_p, o) => { calls.n++; seen.push(o); return result(); } },
      orderDir, budgetTokens: budget, warn: (w) => { warnings.push(w); },
    });
    return { m, orderDir, calls, fn: m.spawnFn((a) => (a === 'grd-factory-builder' ? '/wt/c1' : '/line'), () => 'c1') };
  }

  it('refuses a spawn once the wall clock has run out, mid-attempt', async () => {
    // The line only checks its stop conditions between attempts, and one attempt can build
    // several candidates, so the clock has to be enforced here at every spawn.
    let t = 1000;
    let calls = 0;
    const m = sp.createMeteredSpawn({
      scheduler: { spawn: async () => { calls++; return res(); } },
      orderDir: tmpDir('grd-factory-od-'), budgetTokens: 1e9, deadline: 5000, now: () => t,
      warn: () => undefined,
    });
    const fn = m.spawnFn(() => '/line', () => 'c1');
    await fn('p', 'grd-hypothesizer');
    t = 5000;
    await expect(fn('p', 'grd-hypothesizer')).rejects.toThrow(sp.BudgetSpentError);
    await expect(fn('p', 'grd-hypothesizer')).rejects.toThrow(/the wall-clock budget ran out/);
    expect(calls).toBe(1);
  });

  it('logs every spawn and refuses the next one once the budget is spent', async () => {
    const { m, orderDir, calls, fn } = meter(1500, () => res());
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-factory-builder');
    await expect(fn('p', 'grd-knowledge-miner')).rejects.toThrow(/the token budget ran out \(2000 of 1500\)/);
    expect(calls.n).toBe(2); // the refused spawn never reached the scheduler
    expect(m.spent()).toBe(2000);
    const rows = String(fs.readFileSync(path.join(orderDir, 'spend.jsonl'), 'utf8')).trim().split('\n');
    expect(rows.map((r: string) => JSON.parse(r).agent)).toEqual(['grd-hypothesizer', 'grd-factory-builder']);
  });

  it('takes every shell-bearing tool away from the builder only, and sets each working directory', async () => {
    const seen: SpawnOpts[] = [];
    const { fn } = meter(1e9, () => res(), seen);
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-factory-builder');
    expect(seen[0]).toEqual(expect.objectContaining({ cwd: '/line', strictMcp: true, captureOutput: true }));
    expect(seen[0].disallowedTools).toBeUndefined();
    expect(seen[1]).toEqual(expect.objectContaining({ cwd: '/wt/c1', disallowedTools: sp.BUILDER_DENIED }));
    // Bash alone is not the restriction: Task spawns a subagent that has a shell, and the two
    // network tools reach what the sandbox denies.
    expect(seen[1].disallowedTools).toEqual(expect.arrayContaining(['Bash', 'Task', 'WebFetch', 'WebSearch', 'KillShell', 'BashOutput']));
    // Without this mode the denylist is inert: --dangerously-skip-permissions, which the
    // scheduler passes otherwise, permits every tool regardless of the list.
    expect(seen[1].permissionMode).toBe('acceptEdits');
    expect(seen[0].permissionMode).toBeUndefined();
  });

  it('keeps the token cap enforced when a backend reports no count, and warns once', async () => {
    const warnings: string[] = [];
    const { m, fn } = meter(1500, () => res({ tokensUsed: 0, stdout: JSON.stringify({ result: 'x' }) }), [], warnings);
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-hypothesizer');
    expect(m.unmeteredSpawns()).toBe(2);
    expect(warnings.filter((w) => /no token count/.test(w))).toHaveLength(1);
    expect(m.spent()).toBe(0);
  });

  it('a spawn that reports nothing does not uncap the money for the ones that do', async () => {
    const warnings: string[] = [];
    let silent = true;
    const { m, fn } = meter(1500, () => {
      const r = silent ? res({ tokensUsed: 0, stdout: JSON.stringify({ result: 'x' }) }) : res({ tokensUsed: 1000 });
      silent = false;
      return r;
    }, [], warnings);
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-hypothesizer');
    expect(m.spent()).toBe(2000);
    expect(m.unmeteredSpawns()).toBe(1);
    await expect(fn('p', 'grd-hypothesizer')).rejects.toThrow(/the token budget ran out \(2000 of 1500\)/);
  });

  it('resumes from a spend ledger whose last line a crash tore, naming the file', async () => {
    const warnings: string[] = [];
    const orderDir = tmpDir('grd-factory-od-');
    fs.writeFileSync(path.join(orderDir, 'spend.jsonl'),
      `${JSON.stringify({ agent: 'a', candidate: 'c1', tokens: 700, backend: 'claude', at: 't' })}\n{"agent":"a","tok`);
    const m = sp.createMeteredSpawn({
      scheduler: { spawn: async () => res() }, orderDir, budgetTokens: 1e9, warn: (w) => { warnings.push(w); },
    });
    expect(m.spent()).toBe(700);
    expect(warnings.join('')).toContain(path.join(orderDir, 'spend.jsonl'));
    expect(warnings.join('')).toMatch(/truncated/);
  });

  it('warns when a builder ran on a backend that cannot remove the shell', async () => {
    const warnings: string[] = [];
    const { fn } = meter(1e9, () => res({ backend: 'codex' as SchedulerSpawnResult['backend'] }), [], warnings);
    await fn('p', 'grd-factory-builder');
    expect(warnings.join('')).toMatch(/builder ran on codex/);
  });
});
