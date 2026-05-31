'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError, captureOutputAsync, captureErrorAsync } = require('../../helpers/setup');
const { cmdResearchStatus, cmdResearchReport } = require('../../../lib/research/cli');
const { createThread, saveThread } = require('../../../lib/research/thread');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-rcli-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('research cli', () => {
  it('status lists threads as json', () => {
    const cwd = tmp();
    createThread(cwd, 'Question one', {});
    const res = captureOutput(() => cmdResearchStatus(cwd, undefined, false));
    const parsed = JSON.parse(res.stdout);
    expect(parsed.threads.length).toBe(1);
    expect(parsed.threads[0].question).toBe('Question one');
  });

  it('status for a missing thread errors', () => {
    const cwd = tmp();
    const res = captureError(() => cmdResearchStatus(cwd, 'nope', false));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('nope');
  });

  describe('cmdResearchReport', () => {
    it('errors when no id is given', async () => {
      const res = await captureErrorAsync(() => cmdResearchReport(tmp(), '', true, {}));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/id is required/i);
    });
    it('calls the injected generatePaper and prints the paper path', async () => {
      const cwd = tmp();
      const t = createThread(cwd, 'Q', {}); t.status = 'supported'; saveThread(cwd, t);
      const deps = { generatePaper: async (_c: string, id: string) => ({ paperPath: `/abs/${id}/PAPER.md`, status: 'written' }) };
      const res = await captureOutputAsync(() => cmdResearchReport(cwd, t.id, true, deps));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('PAPER.md');
    });
    it('exits 1 when generatePaper throws (e.g. not terminal)', async () => {
      const cwd = tmp();
      const deps = { generatePaper: async () => { throw new Error('not finished'); } };
      const res = await captureErrorAsync(() => cmdResearchReport(cwd, 'x', true, deps));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/not finished/i);
    });
  });

  describe('cmdResearchPortfolio', () => {
    const { cmdResearchPortfolio } = require('../../../lib/research/cli');
    it('calls the injected runPortfolio and prints the summary', async () => {
      const cwd = tmp();
      const deps = { runPortfolio: async () => ({ ran: 1, paused: 0, supported: 1, skipped: 2, failed: 0, noGates: false, concurrency: 2, threads: [], reportPath: '/abs/PORTFOLIO.md' }) };
      const res = await captureOutputAsync(() => cmdResearchPortfolio(cwd, {}, true, deps));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('PORTFOLIO.md');
    });
    it('exits 1 when runPortfolio throws (e.g. report write failure)', async () => {
      const cwd = tmp();
      const deps = { runPortfolio: async () => { throw new Error('cannot write report'); } };
      const res = await captureErrorAsync(() => cmdResearchPortfolio(cwd, {}, true, deps));
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/cannot write report/i);
    });
  });
});
