'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { MeasureResult, SandboxSpec } from '../../../lib/factory/types';
import type { OracleResult, OracleSpec, SandboxCtx } from '../../../lib/factory/sandbox';
const sb = require('../../../lib/factory/sandbox') as {
  buildContainerArgs: (s: Record<string, unknown>) => string[];
  runSetup: (c: SandboxCtx, s: SandboxSpec, wt: string, label: string) => { ok: boolean; detail: string };
  measure: (c: SandboxCtx, s: SandboxSpec, wt: string, cmd: string, n: number, metric: string,
    label: string) => MeasureResult;
  measureOracle: (c: SandboxCtx, s: SandboxSpec, spec: OracleSpec, n: number, metric: string,
    label: string) => OracleResult;
  removeRecordedContainers: (exec: Exec, dir: string) => void;
  median: (xs: number[]) => number;
  spread: (xs: number[]) => number;
};
const { tmpDir, execFailure } = require('./fixtures') as {
  tmpDir: (p: string) => string; execFailure: (s: number, e: string, o?: string) => Error;
};

const SANDBOX: SandboxSpec = { image: 'node:22-bookworm', setup: 'npm ci', memory: '1g', cpus: 2 };
function ctxWith(exec: Exec): SandboxCtx {
  return { exec, ledgerDir: tmpDir('grd-factory-ledger-'), orderId: 'o1', user: '501:20', timeoutMs: 1000 };
}

describe('buildContainerArgs', () => {
  it('hardens, mounts the worktree, and never mounts an extra directory writable', () => {
    const args = sb.buildContainerArgs({
      name: 'n', worktree: '/wt', sandbox: SANDBOX, network: 'none', command: 'npm run bench',
      user: '501:20', roMounts: [{ src: '/vault/hidden', dst: '/grader' }, { src: '/vault/hidden/data', dst: '/inputs' }],
    });
    expect(args.slice(0, 4)).toEqual(['run', '--rm', '--name', 'n']);
    expect(args).toEqual(expect.arrayContaining(['--network', 'none', '--memory', '1g', '--cpus', '2', '--read-only']));
    expect(args).toContain('type=bind,src=/wt,dst=/work');
    expect(args).toContain('type=bind,src=/vault/hidden,dst=/grader,readonly');
    expect(args).toContain('type=bind,src=/vault/hidden/data,dst=/inputs,readonly');
    expect(args.slice(-4)).toEqual(['sh', 'node:22-bookworm', '-c', 'npm run bench']);
    expect(args[args.indexOf('--user') + 1]).toBe('501:20');
    expect(args[args.indexOf('--env') + 1]).toBe('HOME=/tmp');
  });

  it('mounts nothing but the worktree when no read-only mount is asked for', () => {
    const args = sb.buildContainerArgs({
      name: 'n', worktree: '/wt', sandbox: SANDBOX, network: 'none', command: 'bench', user: null,
    });
    expect(args.filter((a) => a.startsWith('type=bind,'))).toEqual(['type=bind,src=/wt,dst=/work']);
  });
});

describe('runSetup', () => {
  it('runs nothing when there is no setup command', () => {
    const calls: string[][] = [];
    const r = sb.runSetup(ctxWith((b, a) => { calls.push([b, ...a]); return ''; }), { ...SANDBOX, setup: ' ' }, '/wt', 's');
    expect(r.ok).toBe(true);
    expect(calls).toEqual([]);
  });
  it('runs setup with network on and reports a failure', () => {
    const calls: string[][] = [];
    const r = sb.runSetup(ctxWith((b, a) => { calls.push([b, ...a]); throw execFailure(1, 'npm ERR!'); }), SANDBOX, '/wt', 's');
    expect(calls[0]).toEqual(expect.arrayContaining(['--network', 'bridge']));
    expect(r).toEqual({ ok: false, detail: expect.stringContaining('npm ERR!') });
  });
});

describe('measure', () => {
  it('takes the median over repeats', () => {
    const outs = ['__RESULT__ {"lat": 30}', '__RESULT__ {"lat": 10}', '__RESULT__ {"lat": 20}'];
    let i = 0;
    const runs: string[][] = [];
    const m = sb.measure(ctxWith((_b, a) => { runs.push(a); return outs[i++]; }), SANDBOX, '/wt', 'b', 3, 'lat', 'dev');
    expect(m).toEqual(expect.objectContaining({ ok: true, values: [30, 10, 20], median: 20 }));
    expect(runs).toHaveLength(3);
    for (const a of runs) expect(a[a.indexOf('--network') + 1]).toBe('none');
  });
  it('takes no extra mount: the dev evaluation never sees held-out material', () => {
    const runs: string[][] = [];
    sb.measure(ctxWith((_b, a) => { runs.push(a); return '__RESULT__ {"lat": 1}'; }), SANDBOX, '/wt', 'b', 1, 'lat', 'dev');
    expect(runs[0].filter((a) => a.startsWith('type=bind,'))).toEqual(['type=bind,src=/wt,dst=/work']);
  });
  it('fails on a nonzero exit without further runs', () => {
    let runs = 0;
    const m = sb.measure(ctxWith(() => { runs++; throw execFailure(2, 'crash'); }), SANDBOX, '/wt', 'b', 3, 'lat', 'dev');
    expect(runs).toBe(1);
    expect(m).toEqual(expect.objectContaining({ ok: false, median: null, exitCode: 2, stderrExcerpt: 'crash' }));
  });
  it('fails when the metric is not printed', () => {
    const m = sb.measure(ctxWith(() => '__RESULT__ {"other": 1}'), SANDBOX, '/wt', 'b', 1, 'lat', 'dev');
    expect(m.ok).toBe(false);
    expect(m.stderrExcerpt).toMatch(/metric "lat" not printed/);
  });
});

describe('container ledger', () => {
  it('removes exactly the recorded containers and forgets them', () => {
    const calls: string[][] = [];
    const exec: Exec = (b, a) => { calls.push([b, ...a]); return '__RESULT__ {"lat": 1}'; };
    const ctx = ctxWith(exec);
    sb.measure(ctx, SANDBOX, '/wt', 'b', 2, 'lat', 'dev');
    const names = calls.filter((c) => c[1] === 'run').map((c) => c[c.indexOf('--name') + 1]);
    calls.length = 0;
    sb.removeRecordedContainers(exec, ctx.ledgerDir);
    expect(calls).toEqual(names.map((n) => ['docker', 'rm', '-f', n]));
    expect(fs.existsSync(path.join(ctx.ledgerDir, 'containers.jsonl'))).toBe(false);
  });
});

describe('container ledger write-ahead', () => {
  const recorded = (dir: string): string[] =>
    String(fs.readFileSync(path.join(dir, 'containers.jsonl'), 'utf8')).split('\n').filter(Boolean)
      .map((l: string) => (JSON.parse(l) as { name: string }).name);
  it('records the name before docker run starts', () => {
    let ctx: SandboxCtx | null = null;
    const seen: boolean[] = [];
    ctx = ctxWith((_b, a) => {
      const name = a[a.indexOf('--name') + 1];
      seen.push(recorded((ctx as SandboxCtx).ledgerDir).includes(name));
      return '__RESULT__ {"lat": 1}';
    });
    sb.measure(ctx, SANDBOX, '/wt', 'b', 2, 'lat', 'dev');
    expect(seen).toEqual([true, true]);
  });
  it('keeps the name recorded when the run throws', () => {
    let name = '';
    const ctx = ctxWith((_b, a) => { name = a[a.indexOf('--name') + 1]; throw execFailure(1, 'boom'); });
    sb.measure(ctx, SANDBOX, '/wt', 'b', 1, 'lat', 'dev');
    expect(recorded(ctx.ledgerDir)).toEqual([name]);
  });
  it('skips a truncated last line, still removes valid names, and deletes the file', () => {
    const dir = tmpDir('grd-factory-ledger-');
    fs.writeFileSync(path.join(dir, 'containers.jsonl'), '{"name":"a"}\n{"name":"b"}\n{"name":"c', 'utf8');
    const calls: string[][] = [];
    sb.removeRecordedContainers((b, a) => { calls.push([b, ...a]); return ''; }, dir);
    expect(calls).toEqual([['docker', 'rm', '-f', 'a'], ['docker', 'rm', '-f', 'b']]);
    expect(fs.existsSync(path.join(dir, 'containers.jsonl'))).toBe(false);
  });
});

describe('median and spread', () => {
  it('handles odd and even lengths', () => {
    expect(sb.median([3, 1, 2])).toBe(2);
    expect(sb.median([4, 1, 3, 2])).toBe(2.5);
    expect(sb.spread([5, 9, 7])).toBe(4);
    expect(sb.spread([])).toBe(0);
  });
});

describe('measureOracle', () => {
  /**
   * A real worktree, vault and staging root on disk. `score` answers the scoring step; `run`
   * answers the candidate's run step and by default writes the output file, as a working
   * candidate would.
   */
  function world(score: () => string, opts: { inputs?: boolean; run?: (wt: string) => string } = {}) {
    const root = tmpDir('grd-factory-oracle-');
    const wt = path.join(root, 'wt');
    const vault = path.join(root, 'hidden');
    fs.mkdirSync(wt, { recursive: true });
    fs.mkdirSync(path.join(vault, 'data'), { recursive: true });
    const spec: OracleSpec = {
      worktree: wt, vault, stageRoot: path.join(root, 'stage'),
      run: 'run-candidate', score: 'score.sh', output: 'out/result.json',
      ...(opts.inputs === true ? { inputs: 'data' } : {}),
    };
    const runs: string[][] = [];
    const staged: string[][] = [];
    const exec: Exec = (_b, a) => {
      runs.push(a);
      if (a[a.lastIndexOf('-c') + 1] === spec.run) {
        if (opts.run !== undefined) return opts.run(wt);
        fs.mkdirSync(path.join(wt, 'out'), { recursive: true });
        fs.writeFileSync(path.join(wt, spec.output), '{"n":1}');
        return '';
      }
      const mounted = /^type=bind,src=(.+),dst=\/work$/.exec(a.find((x) => x.endsWith('dst=/work')) as string);
      staged.push(fs.readdirSync(mounted![1]) as string[]);
      return score();
    };
    return { spec, runs, staged, root, wt, vault, ctx: ctxWith(exec) };
  }

  const phases = (runs: string[][]): string[] => runs.map((a) => a[a.lastIndexOf('-c') + 1]);
  const binds = (a: string[]): string[] => a.filter((x) => x.startsWith('type=bind,'));

  it('runs the candidate and the scorer in separate containers, and medians over repeats', () => {
    const vals = ['__RESULT__ {"lat": 30}', '__RESULT__ {"lat": 10}'];
    let i = 0;
    const w = world(() => vals[i++]);
    const m = sb.measureOracle(w.ctx, SANDBOX, w.spec, 2, 'lat', 'c1-hidden');
    expect(m).toEqual(expect.objectContaining({ ok: true, values: [30, 10], median: 20, failedPhase: null }));
    expect(phases(w.runs)).toEqual(['run-candidate', 'sh /grader/score.sh', 'run-candidate', 'sh /grader/score.sh']);
    for (const a of w.runs) expect(a[a.indexOf('--network') + 1]).toBe('none');
  });

  it('keeps the vault out of the run step and the repo out of the score step', () => {
    const w = world(() => '__RESULT__ {"lat": 1}');
    sb.measureOracle(w.ctx, SANDBOX, w.spec, 1, 'lat', 'c1-hidden');
    expect(binds(w.runs[0])).toEqual([`type=bind,src=${w.wt},dst=/work`]);
    expect(binds(w.runs[1])).toEqual([
      `type=bind,src=${path.join(w.root, 'stage', 'c1-hidden-1')},dst=/work`,
      `type=bind,src=${w.vault},dst=/grader,readonly`,
    ]);
    // The scorer saw the candidate's output file, by name, and nothing else.
    expect(w.staged).toEqual([['result.json']]);
  });

  it('gives the run step the declared inputs, read-only, and the scorer still gets the vault', () => {
    const w = world(() => '__RESULT__ {"lat": 1}', { inputs: true });
    sb.measureOracle(w.ctx, SANDBOX, w.spec, 1, 'lat', 'c1-hidden');
    expect(binds(w.runs[0])).toEqual([
      `type=bind,src=${w.wt},dst=/work`,
      `type=bind,src=${path.join(w.vault, 'data')},dst=/inputs,readonly`,
    ]);
  });

  it('removes the staging directory on the way out', () => {
    const w = world(() => '__RESULT__ {"lat": 1}');
    sb.measureOracle(w.ctx, SANDBOX, w.spec, 1, 'lat', 'c1-hidden');
    expect(fs.existsSync(path.join(w.root, 'stage', 'c1-hidden-1'))).toBe(false);
  });

  it('removes the staging directory even when the scorer throws', () => {
    const w = world(() => { throw execFailure(2, 'scorer crash'); });
    const m = sb.measureOracle(w.ctx, SANDBOX, w.spec, 1, 'lat', 'c1-hidden');
    expect(m.failedPhase).toBe('score');
    expect(fs.existsSync(path.join(w.root, 'stage', 'c1-hidden-1'))).toBe(false);
  });

  it('blames the run step when the candidate crashes, and never scores it', () => {
    const w = world(() => '__RESULT__ {"lat": 1}', { run: () => { throw execFailure(1, 'candidate crash'); } });
    const m = sb.measureOracle(w.ctx, SANDBOX, w.spec, 1, 'lat', 'c1-hidden');
    expect(m).toEqual(expect.objectContaining({ ok: false, failedPhase: 'run', exitCode: 1, stderrExcerpt: 'candidate crash' }));
    expect(phases(w.runs)).toEqual(['run-candidate']);
  });

  it('blames the run step when it exits clean without writing its output', () => {
    const w = world(() => '__RESULT__ {"lat": 1}', { run: () => '' });
    const m = sb.measureOracle(w.ctx, SANDBOX, w.spec, 1, 'lat', 'c1-hidden');
    expect(m.failedPhase).toBe('run');
    expect(m.stderrExcerpt).toBe('the run step exited 0 without writing a file at out/result.json');
    expect(phases(w.runs)).toEqual(['run-candidate']);
  });

  it('blames the score step when the metric is not printed', () => {
    const w = world(() => '__RESULT__ {"other": 1}');
    const m = sb.measureOracle(w.ctx, SANDBOX, w.spec, 1, 'lat', 'c1-hidden');
    expect(m.failedPhase).toBe('score');
    expect(m.stderrExcerpt).toMatch(/metric "lat" not printed/);
  });
});

describe('measureOracle output shape', () => {
  it('blames the run step when the output path is a directory rather than a file', () => {
    // Otherwise reading it back throws EISDIR, and a candidate could take the order down.
    const root = tmpDir('grd-factory-oracle-');
    const wt = path.join(root, 'wt');
    fs.mkdirSync(path.join(root, 'hidden'), { recursive: true });
    fs.mkdirSync(path.join(wt, 'out', 'result.json'), { recursive: true });
    const spec: OracleSpec = {
      worktree: wt, vault: path.join(root, 'hidden'), stageRoot: path.join(root, 'stage'),
      run: 'run-candidate', score: 'score.sh', output: 'out/result.json',
    };
    const runs: string[][] = [];
    const ctx = ctxWith((_b, a) => { runs.push(a); return ''; });
    const m = sb.measureOracle(ctx, SANDBOX, spec, 1, 'lat', 'c1-hidden');
    expect(m.failedPhase).toBe('run');
    expect(m.stderrExcerpt).toBe('the run step exited 0 without writing a file at out/result.json');
    expect(runs).toHaveLength(1);
  });
});
