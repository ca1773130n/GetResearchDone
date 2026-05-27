'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureErrorAsync, captureOutputAsync } = require('../../helpers/setup') as {
  captureErrorAsync: (fn: () => Promise<void>) => Promise<{ stderr: string; exitCode: number }>;
  captureOutputAsync: (fn: () => Promise<void>) => Promise<{ stdout: string; exitCode: number }>;
};
const { cmdIngest, statusWarning } = require('../../../lib/research/cli-kb') as {
  cmdIngest: (
    cwd: string,
    inputPath: string,
    raw: boolean,
    deps?: { ingest?: (cwd: string, p: string) => Promise<{ status: string; files: number; detail: string }> }
  ) => Promise<never>;
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
});
