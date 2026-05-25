'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runResearch, resumeResearch } = require('../../../lib/research/orchestrator');
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
    const findingText = fs.readFileSync(res.findingPath, 'utf8');
    expect(findingText).toContain('supported');
    expect(findingText).not.toMatch(/verdict:\*\* active/);
  });

  it('pauses at the execute gate when gates are on', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Gated question', {
      maxIterations: 2, noGates: false, spawn: makeSpawn(), runner: makeRunner(),
    });
    expect(res.paused).toBe(true);
    expect(res.pendingGate).toBe('execute');
  });

  it('resume after execute-gate reuses the hypothesis (no duplicate, no re-hypothesize)', async () => {
    const cwd = tmp();
    const spawn = makeSpawn();
    const runner = makeRunner();
    const first = await runResearch(cwd, 'Reuse Q', { maxIterations: 5, noGates: false, spawn, runner });
    expect(first.paused).toBe(true);
    expect(first.pendingGate).toBe('execute');
    const res = await resumeResearch(cwd, first.threadId, { spawn, runner, noGates: false });
    // After one resume, iteration 1's hypothesis was REUSED and measured (refuted), not duplicated.
    const led = readLedger(cwd, first.threadId);
    const iter1 = led.filter((h: any) => h.iteration === 1);
    expect(iter1.length).toBe(1);
    expect(iter1[0].status).toBe('refuted');
    // It then advanced to iteration 2 and paused again at the execute gate.
    expect(res.pendingGate).toBe('execute');
  });

  it('pauses at kg_write gate then resumes via finishKgSync', async () => {
    const cwd = tmp();
    // Both gates are on by default (no config file). Runner always returns supported accuracy.
    const runner = { run: () => ({
      metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess',
      durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
    // First pause: at execute gate
    const first = await runResearch(cwd, 'KG gate Q', { maxIterations: 2, noGates: false, spawn: makeSpawn(), runner });
    expect(first.paused).toBe(true);
    expect(first.pendingGate).toBe('execute');
    // Resume through execute gate -> runs experiment (accuracy 0.9 = supported) -> hits kg_write gate
    const second = await resumeResearch(cwd, first.threadId, { spawn: makeSpawn(), runner, noGates: false });
    expect(second.paused).toBe(true);
    expect(second.pendingGate).toBe('kg_write');
    // Resume through kg_write gate -> finishKgSync completes
    const res = await resumeResearch(cwd, second.threadId, { spawn: makeSpawn(), runner, noGates: false });
    expect(res.status).toBe('supported');
    expect(res.paused).toBeFalsy();
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

  it('experiment-runner writes the script where the real runner executes it', async () => {
    const cwd = tmp();
    const { createSubprocessRunner } = require('../../../lib/research/runner');
    let hypo = 0;
    const spawn = async (prompt: string, agentType: string) => {
      if (agentType === 'grd-hypothesizer') {
        hypo++;
        return `__HYPOTHESIS__ {"statement":"H${hypo}","rationale":"r","predictedOutcome":"p"}`;
      }
      if (agentType === 'grd-experiment-runner') {
        // The prompt names the absolute dir to write into. Extract it and write a real script there.
        const m = prompt.match(/runnable script to (\S+)\/run\.sh/);
        const dir = (m as RegExpMatchArray)[1];
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'run.sh'), 'echo "__RESULT__ {\\"accuracy\\": 0.95}"');
        return `__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"${dir}/run.sh"}`;
      }
      if (agentType === 'grd-knowledge-miner') {
        return '__TAKEAWAY__ {"kind":"success_pattern","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';
      }
      return '';
    };
    const res = await runResearch(cwd, 'Real runner Q', {
      maxIterations: 2, noGates: true, spawn, runner: createSubprocessRunner({ timeoutMs: 30000 }),
    });
    expect(res.status).toBe('supported');
    const led = readLedger(cwd, res.threadId);
    expect(led[0].status).toBe('supported');
  });
});
