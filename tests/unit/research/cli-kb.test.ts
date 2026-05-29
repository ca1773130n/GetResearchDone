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

  describe('cmdSynthesize', () => {
    it('seeds candidates and auto-runs only rank-1', async () => {
      const cwd = tmp();
      fs.mkdirSync(path.join(cwd, '.planning/research'), { recursive: true });
      const resumed: string[] = [];
      const deps = {
        synthesize: async () => ({
          status: 'compiled', topicId: 'topic', docPath: path.join(cwd, 'd.md'), detail: 'ok',
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

    it('does not seed when synthesize returns no candidates (idempotent)', async () => {
      const cwd = tmp();
      fs.mkdirSync(path.join(cwd, '.planning/research'), { recursive: true });
      const resumed: string[] = [];
      const deps = {
        synthesize: async () => ({ status: 'compiled', topicId: 'topic', docPath: null, detail: 'unchanged (idempotent)', candidates: [] }),
        resumeRunner: async (_cwd: string, id: string) => { resumed.push(id); return { threadId: id, status: 'paused' }; },
      };
      const res = await captureOutputAsync(() => cmdSynthesize(cwd, 'topic', true, deps));
      expect(res.exitCode).toBe(0);
      expect(require('../../../lib/research/thread').listThreads(cwd).length).toBe(0);
      expect(resumed.length).toBe(0);
    });
  });
});
