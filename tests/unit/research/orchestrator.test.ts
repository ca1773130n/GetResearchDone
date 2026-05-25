'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runResearch } = require('../../../lib/research/orchestrator');
const { readLedger } = require('../../../lib/research/ledger');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-orch-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

function makeSpawn() {
  let hypoCalls = 0;
  return async (_prompt: string, agentType: string): Promise<string> => {
    if (agentType === 'grd-hypothesizer') {
      hypoCalls++;
      return `__HYPOTHESIS__ {"statement":"hypothesis ${hypoCalls}","rationale":"r","predictedOutcome":"p"}`;
    }
    if (agentType === 'grd-experiment-runner') {
      return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/run.sh"}';
    }
    if (agentType === 'grd-knowledge-miner') {
      return '__TAKEAWAY__ {"kind":"failure_root_cause","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';
    }
    return '';
  };
}

function makeRunner() {
  let n = 0;
  return {
    run() {
      n++;
      return {
        metrics: { accuracy: n === 1 ? 0.5 : 0.9 },
        exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none',
      };
    },
  };
}

describe('orchestrator', () => {
  it('closes the loop: refuted h1 -> revised h2 -> supported -> finalize', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Does X help?', {
      maxIterations: 5, noGates: true, spawn: makeSpawn(), runner: makeRunner(),
    });
    expect(res.status).toBe('supported');
    expect(res.iterations).toBe(2);
    const led = readLedger(cwd, res.threadId);
    expect(led.map((h: any) => h.id)).toEqual(['h1', 'h2']);
    expect(led[0].status).toBe('refuted');
    expect(led[1].status).toBe('supported');
    expect(led[1].parentId).toBe('h1');
    expect(fs.existsSync(path.join(cwd, '.planning/research/threads', res.threadId, 'FINDING.md'))).toBe(true);
  });

  it('pauses at the execute gate when gates are on', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Gated question', {
      maxIterations: 2, noGates: false, spawn: makeSpawn(), runner: makeRunner(),
    });
    expect(res.paused).toBe(true);
    expect(res.pendingGate).toBe('execute');
  });

  it('exhausts when never supported', async () => {
    const cwd = tmp();
    const runner = { run: () => ({
      metrics: { accuracy: 0.1 }, exitCode: 0, runner: 'subprocess',
      durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
    const res = await runResearch(cwd, 'Hard question', {
      maxIterations: 2, noGates: true, spawn: makeSpawn(), runner,
    });
    expect(res.status).toBe('exhausted');
    expect(res.iterations).toBe(2);
  });
});
