'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureErrorAsync, captureOutputAsync } = require('../../helpers/setup') as {
  captureErrorAsync: (fn: () => Promise<void>) => Promise<{ stderr: string; exitCode: number }>;
  captureOutputAsync: (fn: () => Promise<void>) => Promise<{ stdout: string; exitCode: number }>;
};
const { cmdIngest, cmdSynthesize, statusWarning } = require('../../../lib/research/cli-kb') as {
  cmdIngest: (
    cwd: string,
    inputPath: string,
    raw: boolean,
    deps?: { ingest?: (cwd: string, p: string) => Promise<{ status: string; files: number; detail: string }> }
  ) => Promise<never>;
  cmdSynthesize: (cwd: string, topic: string, raw: boolean, deps?: Record<string, unknown>) => Promise<never>;
  statusWarning: (status: string, detail: string) => string | null;
};

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-clikb-')) as string;
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('cli-kb', () => {
  describe('statusWarning', () => {
    it('warns only on partial', () => {
      expect(statusWarning('partial', 'x')).toMatch(/not retrievable/);
    });

    it('returns null for compiled', () => {
      expect(statusWarning('compiled', 'x')).toBeNull();
    });

    it('returns null for skipped_no_tesserae', () => {
      expect(statusWarning('skipped_no_tesserae', 'x')).toBeNull();
    });

    it('returns null for compile_failed (error path, not warning)', () => {
      expect(statusWarning('compile_failed', 'x')).toBeNull();
    });
  });

  describe('cmdIngest', () => {
    it('exits non-zero on compile_failed', async () => {
      const cwd = tmp();
      const fakeIngest = async () => ({ status: 'compile_failed', files: 0, detail: 'boom' });
      const res = await captureErrorAsync(() => cmdIngest(cwd, 'p.md', false, { ingest: fakeIngest }));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/compile failed/i);
    });

    it('exits 0 on compiled', async () => {
      const cwd = tmp();
      const fakeIngest = async () => ({ status: 'compiled', files: 1, detail: 'ok' });
      const res = await captureOutputAsync(() => cmdIngest(cwd, 'p.md', false, { ingest: fakeIngest }));
      expect(res.exitCode).toBe(0);
    });

    it('exits 0 but writes a warning to stderr on partial', async () => {
      const cwd = tmp();
      const fakeIngest = async () => ({ status: 'partial', files: 1, detail: 'no nodes' });

      // captureOutputAsync only captures stdout; spy on stderr separately to verify the warning.
      let stderrOutput = '';
      const stderrSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation((data: string | Uint8Array): boolean => {
          stderrOutput += data;
          return true;
        });

      let exitCode: number | null = null;
      try {
        const res = await captureOutputAsync(() => cmdIngest(cwd, 'p.md', false, { ingest: fakeIngest }));
        exitCode = res.exitCode;
      } finally {
        stderrSpy.mockRestore();
      }

      expect(exitCode).toBe(0);
      expect(stderrOutput).toMatch(/not retrievable/i);
    });

    it('errors when no inputPath provided', async () => {
      const cwd = tmp();
      const res = await captureErrorAsync(() => cmdIngest(cwd, '', false));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/required/i);
    });
  });

  describe('cmdIngest remote routing', () => {
    it('routes a local path to ingest() (no fetch)', async () => {
      const cwd = tmp();
      let fetched = 0; let ingested = '';
      fs.writeFileSync(path.join(cwd, 'a.md'), '# x');
      const deps = {
        ingest: async (_c: string, p: string) => { ingested = p; return { status: 'compiled', files: 1, detail: 'ok' }; },
        fetchSource: async () => { fetched++; return { filePath: 'X', slug: 's', kind: 'web' }; },
      };
      const res = await captureOutputAsync(() => cmdIngest(cwd, 'a.md', true, deps));
      expect(res.exitCode).toBe(0);
      expect(fetched).toBe(0);
      expect(ingested).toBe('a.md');
    });

    it('routes an arXiv id through fetchSource then ingest', async () => {
      const cwd = tmp();
      const calls: string[] = [];
      const deps = {
        ingest: async (_c: string, p: string) => { calls.push(`ingest:${p}`); return { status: 'compiled', files: 1, detail: 'ok' }; },
        fetchSource: async (_c: string, input: string) => { calls.push(`fetch:${input}`); return { filePath: '/abs/arxiv-2401.00001.md', slug: 'arxiv-2401.00001', kind: 'arxiv' }; },
      };
      const res = await captureOutputAsync(() => cmdIngest(cwd, '2401.00001', true, deps));
      expect(res.exitCode).toBe(0);
      expect(calls).toEqual(['fetch:2401.00001', 'ingest:/abs/arxiv-2401.00001.md']);
    });

    it('exits 1 with a clear message when fetch fails', async () => {
      const cwd = tmp();
      const deps = {
        ingest: async () => ({ status: 'compiled', files: 1, detail: 'ok' }),
        fetchSource: async () => { throw new Error('HTTP 404'); },
      };
      const res = await captureErrorAsync(() => cmdIngest(cwd, 'https://example.com/x', true, deps));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/HTTP 404/);
    });

    it('exits 1 on unrecognized input', async () => {
      const cwd = tmp();
      const res = await captureErrorAsync(() => cmdIngest(cwd, 'just-text', true, {
        ingest: async () => ({ status: 'compiled', files: 1, detail: 'ok' }),
      }));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/unrecognized|expected/i);
    });
  });

  describe('cmdSynthesize', () => {
    it('seeds candidates and auto-runs only rank-1', async () => {
      const cwd = tmp();
      fs.mkdirSync(path.join(cwd, '.planning/research'), { recursive: true });
      const resumed: string[] = [];
      const deps = {
        synthesize: async () => ({
          status: 'compiled', topicId: 'topic', synthKey: 'sk1', docPath: path.join(cwd, 'd.md'), detail: 'ok',
          candidates: [
            { rank: 1, statement: 'A', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n1'] },
            { rank: 2, statement: 'B', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n2'] },
          ],
        }),
        resumeRunner: async (_cwd: string, id: string) => { resumed.push(id); return { threadId: id, status: 'paused' }; },
      };
      const res = await captureOutputAsync(() => cmdSynthesize(cwd, 'topic', true, deps));
      expect(res.exitCode).toBe(0);
      const { listThreads } = require('../../../lib/research/thread');
      expect(listThreads(cwd).length).toBe(2);   // both seeded
      expect(resumed.length).toBe(1);            // only rank-1 auto-run
    });

    it('does not auto-run (or double-seed) when the same candidates are re-synthesized', async () => {
      const cwd = tmp();
      fs.mkdirSync(path.join(cwd, '.planning/research'), { recursive: true });
      const resumed: string[] = [];
      const deps = {
        synthesize: async () => ({
          status: 'compiled', topicId: 'topic', synthKey: 'sk1', docPath: path.join(cwd, 'd.md'), detail: 'ok',
          candidates: [
            { rank: 1, statement: 'A', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n1'] },
            { rank: 2, statement: 'B', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n2'] },
          ],
        }),
        resumeRunner: async (_cwd: string, id: string) => { resumed.push(id); return { threadId: id, status: 'paused' }; },
      };
      await captureOutputAsync(() => cmdSynthesize(cwd, 'topic', true, deps)); // first: seeds 2, auto-runs rank-1
      await captureOutputAsync(() => cmdSynthesize(cwd, 'topic', true, deps)); // second: all already seeded
      const { listThreads } = require('../../../lib/research/thread');
      expect(listThreads(cwd).length).toBe(2);   // no double-seed
      expect(resumed.length).toBe(1);            // rank-1 NOT resumed again (no spurious auto-ran)
    });

    it('honors research_max_candidates from .planning/config.json', async () => {
      const cwd = tmp();
      fs.mkdirSync(path.join(cwd, '.planning/research'), { recursive: true });
      fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_max_candidates: 1 }));
      const resumed: string[] = [];
      const deps = {
        synthesize: async () => ({
          status: 'compiled', topicId: 'topic', synthKey: 'sk1', docPath: path.join(cwd, 'd.md'), detail: 'ok',
          candidates: [
            { rank: 1, statement: 'A', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n1'] },
            { rank: 2, statement: 'B', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n2'] },
            { rank: 3, statement: 'C', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n3'] },
          ],
        }),
        resumeRunner: async (_cwd: string, id: string) => { resumed.push(id); return { threadId: id, status: 'paused' }; },
      };
      const res = await captureOutputAsync(() => cmdSynthesize(cwd, 'topic', true, deps));
      expect(res.exitCode).toBe(0);
      expect(require('../../../lib/research/thread').listThreads(cwd).length).toBe(1); // capped at 1
    });

    it('does not seed when synthesize returns no candidates (idempotent)', async () => {
      const cwd = tmp();
      fs.mkdirSync(path.join(cwd, '.planning/research'), { recursive: true });
      const resumed: string[] = [];
      const deps = {
        synthesize: async () => ({ status: 'compiled', topicId: 'topic', synthKey: '', docPath: null, detail: 'unchanged (idempotent)', candidates: [] }),
        resumeRunner: async (_cwd: string, id: string) => { resumed.push(id); return { threadId: id, status: 'paused' }; },
      };
      const res = await captureOutputAsync(() => cmdSynthesize(cwd, 'topic', true, deps));
      expect(res.exitCode).toBe(0);
      expect(require('../../../lib/research/thread').listThreads(cwd).length).toBe(0);
      expect(resumed.length).toBe(0);
    });
  });
});
