'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError, captureOutputAsync, captureErrorAsync } = require('../../helpers/setup');
const { cmdResearchStatus, cmdResearchReport, cmdResearchResume } = require('../../../lib/research/cli');
const { createThread, saveThread } = require('../../../lib/research/thread');
const { readCheckpointLog } = require('../../../lib/research/checkpoints');

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

  describe('status pending-checkpoint rendering', () => {
    function threadWithCheckpoint(cwd: string) {
      const t = createThread(cwd, 'Approve the design?', {});
      t.pendingCheckpoint = {
        checkpoint_version: 1, id: 'ck-1-design-r1', point: 'design', type: 'approval',
        iteration: 1, round: 1, createdAt: '2026-07-12T00:00:00.000Z',
        questions: [
          {
            id: 'q1', ask: 'Approve & run the experiment as designed?',
            options: [
              { label: 'Revise', description: 'send back for revision' },
              { label: 'Approve & run', description: 'proceed', recommended: true },
            ],
          },
          {
            id: 'q2', ask: 'Any metric contract edits?',
            options: [
              { label: 'No changes', description: 'keep as-is', recommended: true },
            ],
            freeform: true,
          },
        ],
      };
      t.status = 'paused';
      saveThread(cwd, t);
      return t;
    }

    it('--json path still returns the full thread with pendingCheckpoint intact (contract unchanged)', () => {
      const cwd = tmp();
      const t = threadWithCheckpoint(cwd);
      const res = captureOutput(() => cmdResearchStatus(cwd, t.id, true));
      const parsed = JSON.parse(res.stdout);
      expect(parsed.pendingCheckpoint).toBeTruthy();
      expect(parsed.pendingCheckpoint.questions).toHaveLength(2);
      expect(parsed.pendingCheckpoint.point).toBe('design');
    });

    it('human (default, non --json) path renders questions, recommended marker, and resume hint', () => {
      const cwd = tmp();
      const t = threadWithCheckpoint(cwd);
      const res = captureOutput(() => cmdResearchStatus(cwd, t.id, false));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).toContain('Approve & run the experiment as designed?');
      expect(res.stdout).toContain('Any metric contract edits?');
      expect(res.stdout).toContain('Approve & run (recommended)');
      expect(res.stdout).toContain('freeform text also accepted');
      expect(res.stdout).toContain(`gd research resume ${t.id} --answers <file>`);
    });

    it('a thread with no pendingCheckpoint prints no checkpoint block (human path)', () => {
      const cwd = tmp();
      const t = createThread(cwd, 'No checkpoint here', {});
      const res = captureOutput(() => cmdResearchStatus(cwd, t.id, false));
      expect(res.exitCode).toBe(0);
      expect(res.stdout).not.toContain('Pending checkpoint');
      expect(res.stdout).not.toContain('--answers');
    });
  });

  describe('cmdResearchResume checkpoint answers', () => {
    it('forwards --answers checkpointAnswers through ResearchOptions to the resume-with-answers branch', async () => {
      const cwd = tmp();
      const t = createThread(cwd, 'Approve?', {});
      t.pendingCheckpoint = {
        checkpoint_version: 1, id: 'ck-1-design-r1', point: 'design', type: 'approval',
        iteration: 1, round: 1, createdAt: '2026-07-12T00:00:00.000Z',
        questions: [{ id: 'q1', ask: 'Approve & run?', options: [
          { label: 'Approve & run', description: 'go', recommended: true },
          { label: 'Revise', description: 'no' },
        ] }],
      };
      t.status = 'paused'; saveThread(cwd, t);
      const opts = {
        checkpointAnswers: { q1: { label: 'Approve & run' } },
        spawn: async (_p: string, a: string) => (
          a === 'grd-hypothesizer' ? '__HYPOTHESIS__ {"statement":"s","rationale":"r","predictedOutcome":"p","refutationCondition":"if the mechanism is absent the effect disappears / amplifying it makes the effect worse"}'
            : a === 'grd-experiment-runner' ? '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/1/run.sh"}'
              : a === 'grd-knowledge-miner' ? '__TAKEAWAY__ {"kind":"domain_fact","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}' : ''),
        runner: { run: () => ({ metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) },
      };
      const res = await captureOutputAsync(() => cmdResearchResume(cwd, t.id, opts, true));
      expect(res.exitCode).toBe(0);
      const log = readCheckpointLog(path.join(cwd, '.planning/research/threads', t.id));
      expect(log).toHaveLength(1);
      expect(log[0].answers[0].answeredBy).toBe('human');
      expect(log[0].answers[0].label).toBe('Approve & run');
    });
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
