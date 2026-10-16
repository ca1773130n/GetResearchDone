'use strict';
const fs = require('fs');
const path = require('path');
import type { Exec } from '../../../lib/factory/exec';
import type { WorkOrder } from '../../../lib/factory/types';
import type { ScanReport, ValidateReport } from '../../../lib/factory/intake';
const intake = require('../../../lib/factory/intake') as {
  scanRepo: (repo: string, free?: number) => ScanReport;
  availableMemoryBytes: (platform?: string, readLevel?: () => string) => number;
  validateDraft: (home: string, id: string, deps?: { exec?: Exec }) => ValidateReport;
};
const order = require('../../../lib/factory/order') as {
  writeDraft: (h: string, o: WorkOrder) => void; draftDir: (h: string, id: string) => string;
  readDraft: (h: string, id: string) => WorkOrder; saveOrder: (h: string, id: string) => string;
};
const os = require('os');
const fx = require('./fixtures') as {
  HIDDEN_RUN: string; HIDDEN_OUTPUT: string;
  isScoreStep: (a: string[]) => boolean; isHiddenRunStep: (a: string[]) => boolean;
  writeOracleOutput: (a: string[], c?: string) => string;
  mountedWorktree: (a: string[]) => string | null;
  tmpDir: (p: string) => string; makeRepo: (f: Record<string, string>) => string;
  sampleOrder: (repo: string, over?: Partial<WorkOrder>) => WorkOrder;
  fakeExec: (onRun: (a: string[]) => string, calls?: string[][]) => Exec;
  containerCommand: (a: string[]) => string; worktreeCount: (r: string) => number;
};

describe('scanRepo', () => {
  it('proposes a Node image, npm ci, and the bench scripts with their files', () => {
    const repo = fx.makeRepo({
      'package.json': JSON.stringify({ scripts: { 'bench:search': 'node bench/search.js', build: 'tsc' } }),
      'package-lock.json': '{}', 'bench/search.js': '', 'Makefile': 'perf:\n\ttrue\nclean:\n\ttrue\n',
    });
    const r = intake.scanRepo(repo, 8 * 1024 * 1024 * 1024);
    expect(r.ecosystem).toBe('node');
    expect([r.proposedImage, r.proposedSetup]).toEqual(['node:22-bookworm', 'npm ci']);
    expect(r.measurements).toEqual([
      { kind: 'npm-script', name: 'bench:search', command: 'npm run bench:search', files: ['package.json', 'bench/search.js'] },
      { kind: 'make-target', name: 'perf', command: 'make perf', files: ['Makefile'] },
      { kind: 'directory', name: 'bench', command: '', files: [] },
    ]);
    expect(r.proposedMemory).toBe('2048m');
  });

  it('proposes uv for a uv project and caps memory at half of what is free', () => {
    const repo = fx.makeRepo({ 'pyproject.toml': '[project]\nname="x"\n', 'uv.lock': '' });
    const r = intake.scanRepo(repo, 1536 * 1024 * 1024);
    expect(r.ecosystem).toBe('python');
    expect(r.proposedSetup).toBe('uv sync --frozen');
    expect(r.proposedMemory).toBe('768m');
    expect(r.memoryWarning).toBeNull();
  });

  it('never proposes more than half of free memory, and warns when that is too little to work', () => {
    // A 512 MB floor used to apply here, proposing 512m with only 400 MB free — more than the
    // host had. The limit stays at half, and the shortfall is said rather than papered over.
    const r = intake.scanRepo(fx.makeRepo({ 'package.json': '{}' }), 400 * 1024 * 1024);
    expect(r.proposedMemory).toBe('200m');
    expect(r.memoryWarning).toBe('only 400 MB is free, so the proposed limit is 200 MB — under the '
      + '512 MB most setups need. Free memory and scan again, or raise the limit knowing a runaway '
      + 'candidate could then exhaust the host.');
  });

  it('keeps a proposal Docker will accept even with almost nothing free', () => {
    expect(intake.scanRepo(fx.makeRepo({ 'package.json': '{}' }), 4 * 1024 * 1024).proposedMemory).toBe('6m');
  });

  it('leaves image and setup to the interview for other ecosystems', () => {
    const r = intake.scanRepo(fx.makeRepo({ 'go.mod': 'module x\n' }), 4e9);
    expect([r.ecosystem, r.proposedImage, r.proposedSetup]).toEqual(['unknown', null, '']);
  });

  describe('availableMemoryBytes', () => {
    // os.freemem() on macOS counts only never-used pages: 81 MB on a 16 GB Mac the kernel said
    // was 12% free, so scan proposed a 68 MB limit and warned the host was out of memory.
    it('uses the kernel availability level on macOS, not the free-page count', () => {
      expect(intake.availableMemoryBytes('darwin', () => '12\n')).toBe(Math.floor(os.totalmem() * 0.12));
    });

    it('falls back to os.freemem when the level cannot be read or makes no sense', () => {
      const unreadable = () => { throw new Error('no sysctl'); };
      for (const read of [unreadable, () => '', () => 'abc', () => '150']) {
        const r = intake.availableMemoryBytes('darwin', read);
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThan(os.totalmem());
        expect(r).not.toBe(Math.floor(os.totalmem() * 1.5));
      }
    });

    it('reads the real sysctl, or falls back where there is none (Linux CI)', () => {
      const r = intake.availableMemoryBytes('darwin');
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(os.totalmem());
    });

    it('trusts os.freemem elsewhere, where it already means available', () => {
      const read = jest.fn(() => '12');
      intake.availableMemoryBytes('linux', read);
      expect(read).not.toHaveBeenCalled();
    });
  });
});

describe('validateDraft', () => {
  function draft(files: Record<string, string>, over: Partial<WorkOrder> = {}) {
    const repo = fx.makeRepo(files);
    const home = fx.tmpDir('grd-factory-home-');
    const o = fx.sampleOrder(repo, { baseline: undefined, ...over });
    order.writeDraft(home, o);
    fs.mkdirSync(path.join(order.draftDir(home, o.id), 'hidden'));
    fs.writeFileSync(path.join(order.draftDir(home, o.id), 'hidden', 'score.sh'), 'echo hidden\n');
    return { repo, home, o };
  }
  const FILES = { 'src/search.js': 'slow', 'bench/run.js': '', 'package.json': '{}' };
  /** The held-out run step writes its output and prints nothing; the scoring step prints the metric. */
  const answer = (dev: number, hidden: number) => (args: string[]) =>
    fx.isHiddenRunStep(args) ? fx.writeOracleOutput(args)
      : fx.isScoreStep(args) ? `__RESULT__ {"latency_p95_ms": ${hidden}}`
        : `__RESULT__ {"latency_p95_ms": ${dev}}`;

  it('passes a draft whose base misses the target, records the baseline, and cleans up', () => {
    const d = draft(FILES);
    const r = intake.validateDraft(d.home, d.o.id, { exec: fx.fakeExec(answer(187, 191)) });
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.baseline).toEqual({ dev: 187, hidden: 191, devSpread: 0 });
    expect(order.readDraft(d.home, d.o.id).baseline).toEqual(r.baseline);
    expect(() => order.saveOrder(d.home, d.o.id)).not.toThrow();
    expect(fx.worktreeCount(d.repo)).toBe(1);
  });

  it('refuses a target the unmodified code already meets', () => {
    const d = draft(FILES);
    const r = intake.validateDraft(d.home, d.o.id, { exec: fx.fakeExec(answer(100, 191)) });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'base_fails')?.detail).toMatch(/already meets/);
    expect(fx.worktreeCount(d.repo)).toBe(1);
  });

  it('refuses an allowlist that covers an evaluation file, before starting any container', () => {
    const calls: string[][] = [];
    const d = draft(FILES, { editable: ['src/**', 'bench/**'] });
    const r = intake.validateDraft(d.home, d.o.id, { exec: fx.fakeExec(answer(187, 191), calls) });
    expect(r.checks.find((c) => c.id === 'editable')?.detail).toMatch(/evaluation files inside the editable paths: bench\/run.js/);
    expect(calls.some((c) => c[0] === 'docker' && c[1] === 'run')).toBe(false);
  });

  it('says nothing about globs it could not check when the repo check fails', () => {
    const calls: string[][] = [];
    const d = draft(FILES, { base: 'no-such-ref' });
    const r = intake.validateDraft(d.home, d.o.id, { exec: fx.fakeExec(answer(187, 191), calls) });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.id === 'repo')?.ok).toBe(false);
    // Without a file list every glob would look unmatched: noise about a failure the user
    // cannot act on until the repo check passes.
    const editable = r.checks.find((c) => c.id === 'editable');
    expect(editable?.ok).toBe(true);
    expect(editable?.detail).not.toMatch(/matching no file/);
    expect(editable?.detail).toMatch(/Not checked against no-such-ref/);
    expect(calls.some((c) => c[0] === 'docker' && c[1] === 'run')).toBe(false);
  });

  it('claims only what the editable check can know', () => {
    const d = draft(FILES);
    const r = intake.validateDraft(d.home, d.o.id, { exec: fx.fakeExec(answer(187, 191)) });
    // Only declared dev_eval.files can be compared; what either evaluation reads without
    // declaring it is invisible here, so the PASS text must not claim "no evaluation files".
    expect(r.checks.find((c) => c.id === 'editable')?.detail)
      .toBe('1 editable glob(s) match at main; none covers a path listed in dev_eval.files');
  });

  it('flags a metric whose spread exceeds the gap to the target', () => {
    const d = draft(FILES, { dev_eval: { command: 'node bench/run.js', repeats: 3, files: ['bench/run.js', 'package.json'] } });
    const vals = [100, 190, 125];
    let i = 0;
    const r = intake.validateDraft(d.home, d.o.id, {
      exec: fx.fakeExec((a) => (fx.isHiddenRunStep(a) ? fx.writeOracleOutput(a)
        : fx.isScoreStep(a) ? '__RESULT__ {"latency_p95_ms": 191}'
          : `__RESULT__ {"latency_p95_ms": ${vals[i++ % 3]}}`)),
    });
    expect(r.noisy).toBe(true);
    expect(r.checks.find((c) => c.id === 'dev_eval')?.detail).toMatch(/too noisy to decide/);
  });
});
