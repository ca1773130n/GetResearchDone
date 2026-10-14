'use strict';
const fs = require('fs');
const path = require('path');
import type { SchedulerSpawnResult, SpawnOpts } from '../../../lib/types';
import type { MeteredSpawn } from '../../../lib/factory/spawn';
const sp = require('../../../lib/factory/spawn') as {
  BudgetSpentError: new (m: string) => Error;
  tokensFrom: (r: SchedulerSpawnResult) => number;
  createMeteredSpawn: (o: { scheduler: { spawn: (p: string, o: SpawnOpts) => Promise<SchedulerSpawnResult> };
    orderDir: string; budgetTokens: number; warn: (m: string) => void }) => MeteredSpawn;
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
    const orderDir = tmpDir('grd-factory-od-');
    const m = sp.createMeteredSpawn({
      scheduler: { spawn: async (_p, o) => { seen.push(o); return result(); } },
      orderDir, budgetTokens: budget, warn: (w) => { warnings.push(w); },
    });
    return { m, orderDir, fn: m.spawnFn((a) => (a === 'grd-factory-builder' ? '/wt/c1' : '/line'), () => 'c1') };
  }

  it('logs every spawn and refuses the next one once the budget is spent', async () => {
    const { m, orderDir, fn } = meter(1500, () => res());
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-factory-builder');
    await expect(fn('p', 'grd-knowledge-miner')).rejects.toThrow(/token budget spent \(2000 of 1500\)/);
    expect(m.spent()).toBe(2000);
    const rows = String(fs.readFileSync(path.join(orderDir, 'spend.jsonl'), 'utf8')).trim().split('\n');
    expect(rows.map((r: string) => JSON.parse(r).agent)).toEqual(['grd-hypothesizer', 'grd-factory-builder']);
  });

  it('takes the shell away from the builder only, and sets each working directory', async () => {
    const seen: SpawnOpts[] = [];
    const { fn } = meter(1e9, () => res(), seen);
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-factory-builder');
    expect(seen[0]).toEqual(expect.objectContaining({ cwd: '/line', strictMcp: true, captureOutput: true }));
    expect(seen[0].disallowedTools).toBeUndefined();
    expect(seen[1]).toEqual(expect.objectContaining({ cwd: '/wt/c1', disallowedTools: ['Bash'] }));
  });

  it('warns once and stops enforcing the token cap when the backend reports no count', async () => {
    const warnings: string[] = [];
    const { m, fn } = meter(1, () => res({ tokensUsed: 0, stdout: JSON.stringify({ result: 'x' }) }), [], warnings);
    await fn('p', 'grd-hypothesizer');
    await fn('p', 'grd-hypothesizer');
    expect(m.tokenCapEnforced()).toBe(false);
    expect(warnings.filter((w) => /no token count/.test(w))).toHaveLength(1);
  });

  it('warns when a builder ran on a backend that cannot remove the shell', async () => {
    const warnings: string[] = [];
    const { fn } = meter(1e9, () => res({ backend: 'codex' as SchedulerSpawnResult['backend'] }), [], warnings);
    await fn('p', 'grd-factory-builder');
    expect(warnings.join('')).toMatch(/builder ran on codex/);
  });
});
