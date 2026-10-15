'use strict';
const fs = require('fs');
const path = require('path');
import type { FactoryCliDeps } from '../../../lib/factory/cli';
const cli = require('../../../lib/factory/cli') as {
  cmdFactoryScan: (c: string, repo: string, raw: boolean, d?: FactoryCliDeps) => never;
  cmdFactoryValidate: (c: string, id: string, raw: boolean, d?: FactoryCliDeps) => never;
  cmdFactorySave: (c: string, id: string, raw: boolean, d?: FactoryCliDeps) => never;
  cmdFactoryRun: (c: string, id: string, raw: boolean, d?: FactoryCliDeps) => Promise<never>;
  cmdFactoryStatus: (c: string, id: string | undefined, raw: boolean, d?: FactoryCliDeps) => never;
};
const { captureOutput, captureError, captureOutputAsync, captureErrorAsync } = require('../../helpers/setup') as {
  captureOutput: (fn: () => void) => { stdout: string; exitCode: number };
  captureError: (fn: () => void) => { stderr: string; exitCode: number };
  captureOutputAsync: (fn: () => Promise<void>) => Promise<{ stdout: string; exitCode: number }>;
  captureErrorAsync: (fn: () => Promise<void>) => Promise<{ stderr: string; exitCode: number }>;
};
const { tmpDir, sampleOrder, installOrder } = require('./fixtures') as {
  tmpDir: (p: string) => string;
  sampleOrder: (repo: string) => import('../../../lib/factory/types').WorkOrder;
  installOrder: (home: string, o: import('../../../lib/factory/types').WorkOrder) => string;
};

describe('factory CLI', () => {
  it('prints validate checks as PASS/FAIL lines with --raw', () => {
    const r = captureOutput(() => cli.cmdFactoryValidate('/x', 'o1', true, {
      home: '/h', validateDraft: () => ({ ok: false, noisy: false, checks: [{ id: 'docker', ok: false, detail: 'no docker' }] }),
    }));
    expect(r.stdout).toBe('FAIL  docker  no docker\n');
  });

  it('reports a save error on stderr with a nonzero exit', () => {
    const r = captureError(() => cli.cmdFactorySave('/x', 'o1', false, {
      home: '/h', saveOrder: () => { throw new Error('has not passed validate'); },
    }));
    expect(r.stderr).toMatch(/factory save: has not passed validate/);
    expect(r.exitCode).not.toBe(0);
  });

  it('passes the host scheduler config to the line and prints the outcome', async () => {
    const cwd = tmpDir('grd-factory-cwd-');
    fs.mkdirSync(path.join(cwd, '.planning'));
    fs.writeFileSync(path.join(cwd, '.planning', 'config.json'), JSON.stringify({ scheduler: { a: 1 }, other: 2 }));
    let seen: Record<string, unknown> | undefined;
    const r = await captureOutputAsync(() => cli.cmdFactoryRun(cwd, 'o1', true, {
      home: '/h',
      runOrder: async (_h, _id, d) => { seen = d.hostConfig; return { stop: 'shipped', reportPath: '/h/r.md', prUrl: 'https://x/pull/1', candidates: 1, tokens: 9, hiddenQueries: 1 }; },
    }));
    expect(seen).toEqual({ scheduler: { a: 1 } });
    expect(r.stdout).toBe('shipped  https://x/pull/1\nreport: /h/r.md\n');
  });

  it('lists drafts and orders under the factory home', () => {
    const home = tmpDir('grd-factory-home-');
    fs.mkdirSync(path.join(home, 'drafts', 'd1'), { recursive: true });
    fs.mkdirSync(path.join(home, 'orders', 'o1'), { recursive: true });
    const r = captureOutput(() => cli.cmdFactoryStatus('/x', undefined, false, { home }));
    expect(JSON.parse(r.stdout)).toEqual({ home, drafts: ['d1'], orders: ['o1'] });
  });

  it('prints the scan with (ask) when no image can be proposed', () => {
    const report = {
      ecosystem: 'unknown', proposedImage: null, proposedSetup: '', dockerfile: false, devcontainer: false,
      measurements: [{ kind: 'npm-script', name: 'bench', command: 'npm run bench', files: [] }],
      freeMemoryMb: 4096, proposedMemory: '2g',
    };
    const r = captureOutput(() => cli.cmdFactoryScan('/x', '/repo', true, { scanRepo: () => report as never }));
    expect(r.stdout).toBe('ecosystem: unknown\nimage: (ask)  setup: (none)  memory: 2g of 4096 MB free\nnpm-script  bench  npm run bench\n');
  });

  it('reports a run failure on stderr with a nonzero exit', async () => {
    const r = await captureErrorAsync(() => cli.cmdFactoryRun('/nonexistent', 'o1', false, {
      home: '/h', runOrder: async () => { throw new Error('docker is not running'); },
    }));
    expect(r.stderr).toMatch(/factory run: docker is not running/);
    expect(r.exitCode).not.toBe(0);
  });

  describe('status of one order', () => {
    function orderHome(): { home: string; od: string } {
      const home = tmpDir('grd-factory-home-');
      return { home, od: installOrder(home, sampleOrder('/repo')) };
    }

    it('aggregates candidates, tokens and hidden queries behind the stop line', () => {
      const { home, od } = orderHome();
      fs.writeFileSync(path.join(od, 'status.json'), JSON.stringify({ stop: 'shipped', prUrl: 'https://x/pull/1' }));
      fs.writeFileSync(path.join(od, 'candidates.jsonl'), [
        { id: 'c1', at: 't', outcome: 'dev_miss' },
        { id: 'c2', at: 't' },
        { id: 'c2', at: 't', outcome: 'shipped' },
      ].map((e) => JSON.stringify(e)).join('\n') + '\n');
      fs.writeFileSync(path.join(od, 'spend.jsonl'), '{"tokens":40}\n{"tokens":2}\n');
      fs.writeFileSync(path.join(od, 'queries.jsonl'), '{"status":"started"}\n{"status":"finished"}\n{"status":"started"}\n');
      const json = JSON.parse(captureOutput(() => cli.cmdFactoryStatus('/x', 'search-p95', false, { home })).stdout);
      expect(json).toMatchObject({ id: 'search-p95', stop: 'shipped', prUrl: 'https://x/pull/1', tokens: 42, hiddenQueries: 2 });
      expect(json.candidates.map((c: { id: string; outcome: string }) => [c.id, c.outcome])).toEqual([['c1', 'dev_miss'], ['c2', 'shipped']]);
      const text = captureOutput(() => cli.cmdFactoryStatus('/x', 'search-p95', true, { home })).stdout;
      expect(text).toBe([
        'search-p95: shipped  https://x/pull/1',
        'tokens 42 of 1000000; candidates 2 of 3; hidden queries 2 of 2',
        'c1  dev_miss',
        'c2  shipped',
      ].join('\n') + '\n');
    });

    it('says not finished when the order has no status.json', () => {
      const { home } = orderHome();
      const r = captureOutput(() => cli.cmdFactoryStatus('/x', 'search-p95', true, { home }));
      expect(r.stdout).toBe('search-p95: not finished\ntokens 0 of 1000000; candidates 0 of 3; hidden queries 0 of 2\n');
    });

    it('fails in the factory status shape on an unknown id', () => {
      const r = captureError(() => cli.cmdFactoryStatus('/x', 'nope', false, { home: tmpDir('grd-factory-home-') }));
      expect(r.stderr).toMatch(/factory status: /);
      expect(r.exitCode).not.toBe(0);
    });

    it('fails in the factory status shape on a truncated status.json', () => {
      const { home, od } = orderHome();
      fs.writeFileSync(path.join(od, 'status.json'), '{"stop": "shi');
      const r = captureError(() => cli.cmdFactoryStatus('/x', 'search-p95', false, { home }));
      expect(r.stderr).toMatch(/factory status: cannot read .*status\.json/);
      expect(r.exitCode).not.toBe(0);
    });
  });
});
