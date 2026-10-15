'use strict';
const fs = require('fs');
const path = require('path');
import type { FactoryCliDeps } from '../../../lib/factory/cli';
const cli = require('../../../lib/factory/cli') as {
  cmdFactoryValidate: (c: string, id: string, raw: boolean, d?: FactoryCliDeps) => never;
  cmdFactorySave: (c: string, id: string, raw: boolean, d?: FactoryCliDeps) => never;
  cmdFactoryRun: (c: string, id: string, raw: boolean, d?: FactoryCliDeps) => Promise<never>;
  cmdFactoryStatus: (c: string, id: string | undefined, raw: boolean, d?: FactoryCliDeps) => never;
};
const { captureOutput, captureError, captureOutputAsync } = require('../../helpers/setup') as {
  captureOutput: (fn: () => void) => { stdout: string; exitCode: number };
  captureError: (fn: () => void) => { stderr: string; exitCode: number };
  captureOutputAsync: (fn: () => Promise<void>) => Promise<{ stdout: string; exitCode: number }>;
};
const { tmpDir } = require('./fixtures') as { tmpDir: (p: string) => string };

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
});
