'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runResearch, resumeResearch } = require('../../lib/research/orchestrator');
const { readLedger } = require('../../lib/research/ledger');
const { getCounters, resetCounters } = require('../../lib/metrics');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-research-e2e-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
function makeSpawn() {
  let hypo = 0;
  return async (_p: string, agentType: string) => {
    if (agentType === 'grd-hypothesizer') { hypo++; return `__HYPOTHESIS__ {"statement":"H${hypo}","rationale":"r","predictedOutcome":"p"}`; }
    if (agentType === 'grd-experiment-runner') return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/run.sh"}';
    if (agentType === 'grd-knowledge-miner') return '__TAKEAWAY__ {"kind":"failure_root_cause","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';
    return '';
  };
}
function makeRunner() {
  let n = 0;
  return { run: () => { n++; return { metrics: { accuracy: n === 1 ? 0.5 : 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }; } };
}

describe('autoresearch loop (e2e, stubbed agents)', () => {
  beforeEach(() => resetCounters());

  it('closes refuted->revise->supported and emits FINDING.md (no gates)', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Does X help Y?', { maxIterations: 5, noGates: true, spawn: makeSpawn(), runner: makeRunner() });
    expect(res.status).toBe('supported');
    expect(res.iterations).toBe(2);
    const led = readLedger(cwd, res.threadId);
    expect(led[0].status).toBe('refuted');
    expect(led[1].status).toBe('supported');
    expect(fs.existsSync(res.findingPath)).toBe(true);
    const counters = getCounters();
    expect(counters['research.iterations_total']).toBe(2);
    expect(counters['research.hypotheses_supported']).toBe(1);
  });

  it('pauses at execute gate, then resumes to completion', async () => {
    const cwd = tmp();
    const spawn = makeSpawn();
    const runner = makeRunner();
    const first = await runResearch(cwd, 'Gated Q', { maxIterations: 5, noGates: false, spawn, runner });
    expect(first.paused).toBe(true);
    expect(first.pendingGate).toBe('execute');
    let res = await resumeResearch(cwd, first.threadId, { spawn, runner, noGates: false });
    let guard = 0;
    while (res.paused && guard++ < 10) res = await resumeResearch(cwd, first.threadId, { spawn, runner, noGates: false });
    expect(['supported', 'exhausted']).toContain(res.status);
  });

  it('degrades cleanly when Tesserae is unavailable (no tesserae binary on PATH)', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Degrade Q', { maxIterations: 3, noGates: true, spawn: makeSpawn(), runner: makeRunner() });
    expect(res.status).toBe('supported');
    const kg = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/research/threads', res.threadId, 'kg.json'), 'utf8'));
    expect(Array.isArray(kg.wrote)).toBe(true);
  });
});
