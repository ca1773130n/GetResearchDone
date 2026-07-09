'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runResearch, resumeResearch, decodeSpawnStdout, readResearchGatesConfig } = require('../../../lib/research/orchestrator');
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

function makeSpawnSuccess() {
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
      return '__TAKEAWAY__ {"kind":"success_pattern","content":"Batching helps a lot","confidence":0.8,"evidence":"e","failureClass":"none"}';
    }
    return '';
  };
}

function makeSpawnEval() {
  const base = makeSpawnSuccess();
  return async (prompt: string, agentType: string): Promise<string> => {
    if (agentType === 'grd-research-evaluator') return '__EVAL__\niteration=x\n## Results\nok\n__END_EVAL__';
    return base(prompt, agentType);
  };
}

describe('orchestrator', () => {
  it('forwards an injected kgClient to the KG sync compile at finalize', async () => {
    const cwd = tmp();
    let compiled = 0;
    const kgClient = {
      isAvailable: () => true,
      compile: async () => { compiled++; return { status: 'compiled', detail: '', graphPath: null }; },
      querySmokeCheck: async () => ({ found: false, nodeIds: [], detail: '' }),
    };
    await runResearch(cwd, 'Does X help?', { maxIterations: 5, noGates: true, spawn: makeSpawn(), runner: makeRunner(), kgClient });
    expect(compiled).toBeGreaterThanOrEqual(1);
  });

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
    // Advisory reconstructability score is reported at FINALIZE but never gates:
    // the verdict above is still 'supported' even though the script artifact is
    // absent (mock runner writes no run.sh) so script_present is false.
    expect(findingText).toContain('## Reconstructability (advisory)');
    expect(findingText).toContain('- **score:** 0.75');
    expect(findingText).toContain('[ ] script_present');
    expect(findingText).toContain('[x] metric_spec_valid');
    expect(findingText).toContain('[x] language_recognized');
    expect(findingText).toContain('[x] runner_metadata');
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

  it('promotes takeaways to KNOWHOW.md and a refuted hypothesis to DEAD-ENDS.md at finalize', async () => {
    const cwd = tmp();
    await runResearch(cwd, 'Does X help?', {
      maxIterations: 5, noGates: true, spawn: makeSpawnSuccess(), runner: makeRunner(),
    });
    expect(fs.existsSync(path.join(cwd, 'KNOWHOW.md'))).toBe(true);
    expect(fs.existsSync(path.join(cwd, '.planning/DEAD-ENDS.md'))).toBe(true);
  });

  it('still promotes when finalizing via the kg_write-resume path', async () => {
    const cwd = tmp();
    const runner = { run: () => ({
      metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess',
      durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
    const first = await runResearch(cwd, 'KG gate Q', { maxIterations: 2, noGates: false, spawn: makeSpawnSuccess(), runner });
    const second = await resumeResearch(cwd, first.threadId, { spawn: makeSpawnSuccess(), runner, noGates: false });
    expect(second.pendingGate).toBe('kg_write');
    await resumeResearch(cwd, second.threadId, { spawn: makeSpawnSuccess(), runner, noGates: false });
    expect(fs.existsSync(path.join(cwd, 'KNOWHOW.md'))).toBe(true);
  });

  it('does not promote when research_persist_knowledge is false', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_persist_knowledge: false }));
    await runResearch(cwd, 'Does X help?', {
      maxIterations: 5, noGates: true, spawn: makeSpawnSuccess(), runner: makeRunner(),
    });
    expect(fs.existsSync(path.join(cwd, 'KNOWHOW.md'))).toBe(false);
  });

  it('writes per-iteration EVAL.md when research_eval_report is on (verdict unchanged)', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_eval_report: true }));
    const res = await runResearch(cwd, 'Does X help?', { maxIterations: 5, noGates: true, spawn: makeSpawnEval(), runner: makeRunner() });
    expect(res.status).toBe('supported'); // same verdict as the flag-off baseline
    const evalDir = path.join(cwd, '.planning/research/threads', res.threadId, 'experiments', '1');
    expect(fs.existsSync(path.join(evalDir, 'EVAL.md'))).toBe(true);
  });

  it('decodeSpawnStdout unwraps a claude event array to the result text', () => {
    const arr = JSON.stringify([
      { type: 'system', subtype: 'init' },
      { type: 'assistant', message: { content: [{ text: 'ignored' }] } },
      { type: 'result', is_error: false, result: '__HYPOTHESIS__ {"statement":"s"}' },
    ]);
    expect(decodeSpawnStdout(arr)).toBe('__HYPOTHESIS__ {"statement":"s"}');
  });
  it('decodeSpawnStdout falls back to assistant text when no result string', () => {
    const arr = JSON.stringify([{ type: 'assistant', message: { content: [{ text: 'hello there' }] } }]);
    expect(decodeSpawnStdout(arr)).toBe('hello there');
  });
  it('decodeSpawnStdout keeps the {result} object and plain-text paths', () => {
    expect(decodeSpawnStdout('{"result":"x"}')).toBe('x');
    expect(decodeSpawnStdout('plain hi')).toBe('plain hi');
  });

  it('records errorReason when the hypothesizer output is unparseable', async () => {
    const cwd = tmp();
    const spawn = async (_p: string, a: string) => (a === 'grd-hypothesizer' ? 'garbage no block' : '');
    const res = await runResearch(cwd, 'Q?', { maxIterations: 2, noGates: true, spawn, runner: makeRunner() });
    expect(res.status).toBe('error');
    expect(res.errorReason).toMatch(/hypothesizer output not parseable/i);
    const tj = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/research/threads', res.threadId, 'thread.json'), 'utf8'));
    expect(tj.errorReason).toMatch(/hypothesizer output not parseable/i);
  });

  it('records errorReason when the plan output is unparseable', async () => {
    const cwd = tmp();
    const spawn = async (_p: string, a: string) => {
      if (a === 'grd-hypothesizer') return '__HYPOTHESIS__ {"statement":"s","rationale":"r","predictedOutcome":"p"}';
      if (a === 'grd-experiment-runner') return 'nope';
      return '';
    };
    const res = await runResearch(cwd, 'Q?', { maxIterations: 2, noGates: true, spawn, runner: makeRunner() });
    expect(res.status).toBe('error');
    expect(res.errorReason).toMatch(/experiment-runner output not parseable/i);
  });

  it('does not spawn grd-research-evaluator or write EVAL.md when the flag is off', async () => {
    const cwd = tmp();
    let evalSpawns = 0;
    const spawn = async (prompt: string, agentType: string): Promise<string> => {
      if (agentType === 'grd-research-evaluator') { evalSpawns++; return ''; }
      return makeSpawnSuccess()(prompt, agentType);
    };
    const res = await runResearch(cwd, 'Does X help?', { maxIterations: 5, noGates: true, spawn, runner: makeRunner() });
    expect(evalSpawns).toBe(0);
    const evalDir = path.join(cwd, '.planning/research/threads', res.threadId, 'experiments', '1');
    expect(fs.existsSync(path.join(evalDir, 'EVAL.md'))).toBe(false);
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

  it('decodeSpawnStdout unwraps the Claude JSON envelope and passes through raw text', () => {
    const envelope = JSON.stringify({ result: '__HYPOTHESIS__ {"statement":"S"}' });
    expect(decodeSpawnStdout(envelope)).toBe('__HYPOTHESIS__ {"statement":"S"}');
    expect(decodeSpawnStdout('__HYPOTHESIS__ {"statement":"S"}')).toBe('__HYPOTHESIS__ {"statement":"S"}');
    expect(decodeSpawnStdout('{not json')).toBe('{not json');
  });

  it('honors per-gate research_gates config (experiment_execution=false skips the execute gate)', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'),
      JSON.stringify({ research_gates: { experiment_execution: false, kg_write: true } }));
    expect(readResearchGatesConfig(cwd).research_gates).toEqual({ experiment_execution: false, kg_write: true });
    // immediate-supported runner so it reaches finalize in iteration 1
    const runner = { run: () => ({ metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
    const res = await runResearch(cwd, 'Per-gate Q', { maxIterations: 2, spawn: makeSpawn(), runner });
    // execute gate disabled by config → it should NOT pause at execute; it runs, then pauses at kg_write
    expect(res.paused).toBe(true);
    expect(res.pendingGate).toBe('kg_write');
  });

  it('resuming a completed thread is a no-op (does not re-run or corrupt it)', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Done Q', { maxIterations: 5, noGates: true, spawn: makeSpawn(), runner: makeRunner() });
    expect(res.status).toBe('supported');
    const ledgerBefore = readLedger(cwd, res.threadId).length;
    const again = await resumeResearch(cwd, res.threadId, { spawn: makeSpawn(), runner: makeRunner(), noGates: true });
    expect(again.status).toBe('supported');
    expect(readLedger(cwd, res.threadId).length).toBe(ledgerBefore); // no new hypotheses appended
  });

  it('resume with --no-gates disables the remaining gates and runs to completion', async () => {
    const cwd = tmp();
    const spawn = makeSpawn();
    const runner = makeRunner();
    const first = await runResearch(cwd, 'NoGates resume Q', { maxIterations: 5, noGates: false, spawn, runner });
    expect(first.paused).toBe(true); // paused at the first execute gate
    const res = await resumeResearch(cwd, first.threadId, { spawn, runner, noGates: true });
    // gates now disabled → it should run to a terminal status without pausing again
    expect(res.paused).toBeFalsy();
    expect(['supported', 'exhausted']).toContain(res.status);
  });

  it('readResurveyConfig: defaults + parsed values + validation', () => {
    const { readResurveyConfig } = require('../../../lib/research/orchestrator');
    const cwd = tmp();
    expect(readResurveyConfig(cwd)).toEqual({ cap: 2, window: 3, fetch: false });
    fs.writeFileSync(path.join(cwd, '.planning/config.json'),
      JSON.stringify({ research_max_resurveys: 1, research_plateau_window: 4, research_resurvey_fetch: true }));
    expect(readResurveyConfig(cwd)).toEqual({ cap: 1, window: 4, fetch: true });
    fs.writeFileSync(path.join(cwd, '.planning/config.json'),
      JSON.stringify({ research_max_resurveys: -5, research_plateau_window: 0 }));
    expect(readResurveyConfig(cwd)).toEqual({ cap: 0, window: 3, fetch: false }); // sanitized
  });

  it('plateaus → re-surveys (pivot prompt + widened retrieve), extends iterations, then exhausts at the cap', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_max_resurveys: 1, research_plateau_window: 3 }));
    const prompts: string[] = [];
    const retrieveCalls: Array<{ q: string; k: unknown }> = [];
    const spawn = async (prompt: string, agentType: string) => {
      if (agentType === 'grd-hypothesizer') { prompts.push(prompt); return '__HYPOTHESIS__ {"statement":"S","rationale":"r","predictedOutcome":"p"}'; }
      if (agentType === 'grd-experiment-runner') return '__PLAN__ {"procedure":"x","metricKey":"acc","comparator":">=","target":0.9,"language":"shell","scriptPath":"run.sh"}';
      return '__TAKEAWAY__ {"content":"t"}';
    };
    const runner = { run: () => ({ metrics: { acc: 0.1 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) }; // always refuted
    const retrieveFn = async (_c: string, q: string, o?: { k?: number }) => { retrieveCalls.push({ q, k: o?.k }); return { results: [], modes: { lexical: false, semantic: false, structure: false }, detail: '0' }; };
    const res = await runResearch(cwd, 'Does X help?', { maxIterations: 3, noGates: true, spawn, runner, retrieve: retrieveFn });
    expect(res.status).toBe('exhausted');
    expect(prompts.some((p) => /PLATEAU/.test(p))).toBe(true);
    expect(retrieveCalls.some((c) => c.k === 16)).toBe(true);
    const { loadThread } = require('../../../lib/research/thread');
    const t = loadThread(cwd, res.threadId);
    expect(t.resurveyCount).toBe(1);
    expect(t.pendingPivot).toBeFalsy();
    expect(t.maxIterations).toBe(6); // 3 + window(3)
  });

  it('calls resurveyFetch on plateau only when research_resurvey_fetch is set', async () => {
    const mk = (fetchOn: boolean) => {
      const cwd = tmp();
      fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({ research_max_resurveys: 1, research_plateau_window: 3, research_resurvey_fetch: fetchOn }));
      return cwd;
    };
    const spawn = async (_p: string, agentType: string) => {
      if (agentType === 'grd-hypothesizer') return '__HYPOTHESIS__ {"statement":"S","rationale":"r","predictedOutcome":"p"}';
      if (agentType === 'grd-experiment-runner') return '__PLAN__ {"procedure":"x","metricKey":"acc","comparator":">=","target":0.9,"language":"shell","scriptPath":"run.sh"}';
      return '__TAKEAWAY__ {"content":"t"}';
    };
    const runner = { run: () => ({ metrics: { acc: 0.1 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };

    let calls = 0;
    const resurveyFetch = async () => { calls++; };
    await runResearch(mk(false), 'Q', { maxIterations: 3, noGates: true, spawn, runner, resurveyFetch });
    expect(calls).toBe(0);
    await runResearch(mk(true), 'Q', { maxIterations: 3, noGates: true, spawn, runner, resurveyFetch });
    expect(calls).toBe(1);
  });

  it('injects a hybrid grounding pack into the hypothesizer prompt', async () => {
    const cwd = tmp();
    let hypoPrompt = '';
    const spawn = async (prompt: string, agentType: string) => {
      if (agentType === 'grd-hypothesizer') { hypoPrompt = prompt; return '__HYPOTHESIS__ {"statement":"S","rationale":"r","predictedOutcome":"p"}'; }
      if (agentType === 'grd-experiment-runner') return '__PLAN__ {"procedure":"x","metricKey":"acc","comparator":">=","target":0.5,"language":"shell","scriptPath":"run.sh"}';
      return '__TAKEAWAY__ {"content":"t"}';
    };
    const runner = { run: () => ({ metrics: { acc: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
    const retrieveFn = async () => ({ results: [{ id: 'n1', name: 'GroundNode', description: 'd', source_path: 'corpus/x.md', score: 0.9, modes: ['lexical'] }], modes: { lexical: true, semantic: false, structure: true }, detail: '1' });
    await runResearch(cwd, 'Does X help?', { maxIterations: 1, noGates: true, spawn, runner, retrieve: retrieveFn });
    expect(hypoPrompt).toContain('Retrieved grounding');
    expect(hypoPrompt).toContain('GroundNode');
  });

  it('still completes if retrieve throws (degrade)', async () => {
    const cwd = tmp();
    const retrieveFn = async () => { throw new Error('boom'); };
    const res = await runResearch(cwd, 'Q', { maxIterations: 1, noGates: true, spawn: makeSpawn(), runner: makeRunner(), retrieve: retrieveFn });
    expect(['supported', 'exhausted']).toContain(res.status);
  });

  it('a seeded synthesis thread skips grd-hypothesizer and goes straight to DESIGN', async () => {
    const cwd = tmp();
    const { seedThreadsFromCandidates } = require('../../../lib/research/seed');
    const [seed] = seedThreadsFromCandidates(cwd, 'topic', 'k', [{
      rank: 1, statement: 'Seeded claim', rationale: 'r', predictedOutcome: 'p', sourceNodeIds: ['n1'],
    }], {});
    const calls: string[] = [];
    const spawn = async (_p: string, agentType: string) => {
      calls.push(agentType);
      if (agentType === 'grd-experiment-runner') {
        return '__PLAN__ {"procedure":"x","metricKey":"acc","comparator":">=","target":0.5,"language":"shell","scriptPath":"run.sh"}';
      }
      return '__TAKEAWAY__ {"content":"t"}';
    };
    // Runner returns acc=0.9 >= target 0.5 → SUPPORTED in iteration 1, so the loop terminates
    // before any iteration-2 cold revision (which WOULD spawn grd-hypothesizer).
    const runner = { run: () => ({
      metrics: { acc: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1,
      stdoutExcerpt: '', failureClass: 'none',
    }) };
    const res = await resumeResearch(cwd, seed.threadId, { spawn, runner, noGates: true });
    expect(calls).toContain('grd-experiment-runner');     // DESIGN reached
    expect(calls).not.toContain('grd-hypothesizer');      // cold HYPOTHESIZE skipped
    expect(res.status).toBe('supported');
  });
});

describe('spawn-retry robustness', () => {
  const orch = require('../../../lib/research/orchestrator');

  describe('spawnAndParse', () => {
    const parse = (s: string) => (s.includes('OK') ? { ok: true } : null);
    it('retries on null parse then succeeds; counts attempts', async () => {
      let n = 0;
      const spawn = async () => { n++; return n < 3 ? '' : 'OK'; };
      const r = await orch.spawnAndParse(spawn, 'p', 'a', parse, 2);
      expect(r.value).toEqual({ ok: true });
      expect(n).toBe(3);
    });
    it('returns {value:null} after exhausting retries', async () => {
      let n = 0;
      const spawn = async () => { n++; return ''; };
      const r = await orch.spawnAndParse(spawn, 'p', 'a', parse, 2);
      expect(r.value).toBeNull();
      expect(n).toBe(3);
      expect(r.lastRaw).toBe('');
    });
    it('one call when first parses; retries:0 → one call', async () => {
      let n = 0; const spawn = async () => { n++; return 'OK'; };
      await orch.spawnAndParse(spawn, 'p', 'a', parse, 2); expect(n).toBe(1);
      n = 0; const empty = async () => { n++; return ''; };
      await orch.spawnAndParse(empty, 'p', 'a', parse, 0); expect(n).toBe(1);
    });
    it('a thrown spawn is caught → {value:null, error} after one call (not retried)', async () => {
      let n = 0;
      const spawn = async () => { n++; throw new Error('hard fail'); };
      const r = await orch.spawnAndParse(spawn, 'p', 'a', parse, 2);
      expect(r.value).toBeNull();
      expect(r.error).toMatch(/hard fail/);
      expect(n).toBe(1);
    });
    it('calls beforeAttempt once per attempt', async () => {
      let before = 0; const spawn = async () => '';
      await orch.spawnAndParse(spawn, 'p', 'a', parse, 2, () => { before++; });
      expect(before).toBe(3);
    });
  });

  describe('readSpawnRetries', () => {
    function cfg(obj?: object) {
      const d = tmp();
      if (obj) fs.writeFileSync(path.join(d, '.planning/config.json'), JSON.stringify(obj));
      return d;
    }
    it('defaults 2; clamps; rejects non-number', () => {
      expect(orch.readSpawnRetries(cfg())).toBe(2);
      expect(orch.readSpawnRetries(cfg({ research_spawn_retries: 4 }))).toBe(4);
      expect(orch.readSpawnRetries(cfg({ research_spawn_retries: -1 }))).toBe(0);
      expect(orch.readSpawnRetries(cfg({ research_spawn_retries: 99 }))).toBe(5);
      expect(orch.readSpawnRetries(cfg({ research_spawn_retries: false }))).toBe(2);
      expect(orch.readSpawnRetries(cfg({ research_spawn_retries: 'x' }))).toBe(2);
    });
  });

  describe('decodeSpawnResult', () => {
    it('throws on nonzero exit with exit code + stderr (no rate-limit over-attribution)', () => {
      try {
        orch.decodeSpawnResult({ exitCode: 2, stdout: '', stderr: 'boom crash' }, 'grd-experiment-runner');
        throw new Error('should have thrown');
      } catch (e: unknown) {
        const msg = (e as Error).message;
        expect(msg).toMatch(/exit 2/);
        expect(msg).toMatch(/boom crash/);
        expect(msg).not.toMatch(/rate.limit/i);
      }
      expect(orch.decodeSpawnResult({ exitCode: 0, stdout: 'hello' }, 'a')).toBe('hello');
    });
  });

  describe('bounded debug retries (research_max_debug_depth)', () => {
    const orch = require('../../../lib/research/orchestrator');

    function writeCfg(cwd: string, obj: object) {
      fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify(obj));
    }

    // Spawn that answers DESIGN and DEBUG-mode experiment prompts distinctly,
    // capturing each so tests can assert the failure context was fed back.
    // `debugPlanJson` overrides the DEBUG-mode __PLAN__ payload (drift tests).
    function makeDebugSpawn(debugPlanJson?: string) {
      const designPrompts: string[] = [];
      const debugPrompts: string[] = [];
      const spawn = async (prompt: string, agentType: string): Promise<string> => {
        if (agentType === 'grd-hypothesizer') return '__HYPOTHESIS__ {"statement":"S","rationale":"r","predictedOutcome":"p"}';
        if (agentType === 'grd-experiment-runner') {
          if (/DEBUG mode/.test(prompt)) {
            debugPrompts.push(prompt);
            return `__PLAN__ ${debugPlanJson || '{"procedure":"fixed","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/fixed.sh"}'}`;
          }
          designPrompts.push(prompt);
          return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/run.sh"}';
        }
        if (agentType === 'grd-knowledge-miner') return '__TAKEAWAY__ {"kind":"failure_root_cause","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';
        return '';
      };
      return { spawn, designPrompts, debugPrompts };
    }

    // Runner that fails with a script-execution error (nonzero exit) `failures`
    // times, then succeeds with a passing metric.
    function failThenPassRunner(failures: number) {
      const state = { calls: 0 };
      return {
        state,
        run() {
          state.calls++;
          if (state.calls <= failures) {
            return {
              metrics: {}, exitCode: 2, runner: 'subprocess', durationMs: 1,
              stdoutExcerpt: 'partial stdout', stderrExcerpt: 'ModuleNotFoundError: numpy',
              failureClass: 'H2',
            };
          }
          return {
            metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1,
            stdoutExcerpt: '', failureClass: 'none',
          };
        },
      };
    }

    function iterDirOf(cwd: string, threadId: string) {
      return path.join(cwd, '.planning/research/threads', threadId, 'experiments', '1');
    }

    it('readDebugDepth: defaults 0; clamps; rejects non-number', () => {
      const mk = (v?: unknown) => {
        const d = tmp();
        if (v !== undefined) writeCfg(d, { research_max_debug_depth: v });
        return d;
      };
      expect(orch.readDebugDepth(mk())).toBe(0);
      expect(orch.readDebugDepth(mk(3))).toBe(3);
      expect(orch.readDebugDepth(mk(2.9))).toBe(2);
      expect(orch.readDebugDepth(mk(-1))).toBe(0);
      expect(orch.readDebugDepth(mk(99))).toBe(5);
      expect(orch.readDebugDepth(mk('2'))).toBe(0);
      expect(orch.readDebugDepth(mk(true))).toBe(0);
    });

    it('research_max_debug_depth is a recognized config key (no loadConfig warning)', () => {
      const { captureError } = require('../../helpers/setup');
      const { loadConfig } = require('../../../lib/utils');
      const cwd = tmp();
      writeCfg(cwd, { research_max_debug_depth: 2 });
      const res = captureError(() => loadConfig(cwd));
      expect(res.stderr).not.toMatch(/Unrecognized config key "research_max_debug_depth"/);
    });

    it('depth=0 (default): a script-execution failure is measured inconclusive with NO debug retry and no attempt artifacts', async () => {
      const cwd = tmp(); // no config file → depth 0
      const { spawn, designPrompts, debugPrompts } = makeDebugSpawn();
      const runner = failThenPassRunner(Infinity);
      const res = await runResearch(cwd, 'Q?', { maxIterations: 1, noGates: true, spawn, runner });
      expect(res.status).toBe('exhausted');
      expect(debugPrompts.length).toBe(0);
      expect(designPrompts.length).toBe(1);
      expect(runner.state.calls).toBe(1);
      expect(readLedger(cwd, res.threadId)[0].status).toBe('inconclusive');
      expect(fs.existsSync(path.join(iterDirOf(cwd, res.threadId), 'debug-attempt-1.json'))).toBe(false);
    });

    it('depth=0: a THROWING runner still propagates (unchanged behavior)', async () => {
      const cwd = tmp();
      const { spawn } = makeDebugSpawn();
      const runner = { run() { throw new Error('runner exploded'); } };
      await expect(runResearch(cwd, 'Q?', { maxIterations: 1, noGates: true, spawn, runner }))
        .rejects.toThrow(/runner exploded/);
    });

    it('depth=2: fails once → debug fix with error context fed back → re-run succeeds → supported', async () => {
      const cwd = tmp();
      writeCfg(cwd, { research_max_debug_depth: 2 });
      const { spawn, debugPrompts } = makeDebugSpawn();
      const runner = failThenPassRunner(1);
      const res = await runResearch(cwd, 'Q?', { maxIterations: 2, noGates: true, spawn, runner });
      expect(res.status).toBe('supported');
      expect(res.iterations).toBe(1);
      expect(debugPrompts.length).toBe(1);
      expect(runner.state.calls).toBe(2);
      // failure output (exit info + stderr/stdout) fed back into the fix prompt
      expect(debugPrompts[0]).toContain('exit code: 2');
      expect(debugPrompts[0]).toContain('failure class: H2');
      expect(debugPrompts[0]).toContain('ModuleNotFoundError: numpy');
      expect(debugPrompts[0]).toContain('partial stdout');
      // attempt recorded beside the stage artifacts; final plan/result reflect the fix
      const iterDir = iterDirOf(cwd, res.threadId);
      const rec = JSON.parse(fs.readFileSync(path.join(iterDir, 'debug-attempt-1.json'), 'utf8'));
      expect(rec.attempt).toBe(1);
      expect(rec.maxDepth).toBe(2);
      expect(rec.fixed).toBe(true);
      expect(rec.contractDrift).toBeUndefined(); // same contract → no drift note
      expect(rec.trigger.exitCode).toBe(2);
      expect(rec.trigger.stderrExcerpt).toContain('ModuleNotFoundError');
      expect(rec.result.exitCode).toBe(0);
      expect(JSON.parse(fs.readFileSync(path.join(iterDir, 'plan.json'), 'utf8')).scriptPath).toBe('experiments/x/fixed.sh');
      expect(JSON.parse(fs.readFileSync(path.join(iterDir, 'result.json'), 'utf8')).exitCode).toBe(0);
      // ledger records the verdict through the normal MEASURE path
      expect(readLedger(cwd, res.threadId)[0].status).toBe('supported');
    });

    it('depth=2 exhausted: every attempt recorded, still fails (inconclusive), never crashes the loop', async () => {
      const cwd = tmp();
      writeCfg(cwd, { research_max_debug_depth: 2 });
      const { spawn, debugPrompts } = makeDebugSpawn();
      const runner = failThenPassRunner(Infinity);
      const res = await runResearch(cwd, 'Q?', { maxIterations: 1, noGates: true, spawn, runner });
      expect(res.status).toBe('exhausted');
      expect(debugPrompts.length).toBe(2);
      expect(runner.state.calls).toBe(3); // initial + 2 debug re-runs
      expect(debugPrompts[1]).toContain('debug attempt 2 of 2');
      const iterDir = iterDirOf(cwd, res.threadId);
      for (const n of [1, 2]) {
        const rec = JSON.parse(fs.readFileSync(path.join(iterDir, `debug-attempt-${n}.json`), 'utf8'));
        expect(rec.fixed).toBe(true);
        expect(rec.result.exitCode).toBe(2); // re-run still failed
      }
      expect(JSON.parse(fs.readFileSync(path.join(iterDir, 'result.json'), 'utf8')).exitCode).toBe(2);
      expect(readLedger(cwd, res.threadId)[0].status).toBe('inconclusive');
      // each re-run consumed budget like the initial run
      const tj = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/research/threads', res.threadId, 'thread.json'), 'utf8'));
      expect(tj.budgetUsed).toBe(3);
    });

    it('metric-vs-target miss (exit 0) NEVER triggers a debug retry', async () => {
      const cwd = tmp();
      writeCfg(cwd, { research_max_debug_depth: 2 });
      const { spawn, debugPrompts } = makeDebugSpawn();
      let calls = 0;
      const runner = { run() { calls++; return { metrics: { accuracy: 0.1 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }; } };
      const res = await runResearch(cwd, 'Q?', { maxIterations: 1, noGates: true, spawn, runner });
      expect(res.status).toBe('exhausted');
      expect(debugPrompts.length).toBe(0);
      expect(calls).toBe(1);
      expect(readLedger(cwd, res.threadId)[0].status).toBe('refuted');
      expect(fs.existsSync(path.join(iterDirOf(cwd, res.threadId), 'debug-attempt-1.json'))).toBe(false);
    });

    it('depth>0: a THROWING runner is normalized, its message fed to debug, and can recover', async () => {
      const cwd = tmp();
      writeCfg(cwd, { research_max_debug_depth: 1 });
      const { spawn, debugPrompts } = makeDebugSpawn();
      let calls = 0;
      const runner = {
        run() {
          calls++;
          if (calls === 1) throw new Error('spawn ENOENT: python3 missing');
          return { metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' };
        },
      };
      const res = await runResearch(cwd, 'Q?', { maxIterations: 1, noGates: true, spawn, runner });
      expect(res.status).toBe('supported');
      expect(debugPrompts.length).toBe(1);
      expect(debugPrompts[0]).toContain('python3 missing');
      const rec = JSON.parse(fs.readFileSync(path.join(iterDirOf(cwd, res.threadId), 'debug-attempt-1.json'), 'utf8'));
      expect(rec.trigger.stderrExcerpt).toContain('python3 missing');
      expect(rec.trigger.failureClass).toBe('H4');
    });

    it('a hard-failed debug fix spawn degrades to the depth=0 outcome (recorded, not fatal)', async () => {
      const cwd = tmp();
      writeCfg(cwd, { research_max_debug_depth: 2, research_spawn_retries: 0 });
      const spawn = async (prompt: string, agentType: string): Promise<string> => {
        if (agentType === 'grd-hypothesizer') return '__HYPOTHESIS__ {"statement":"S","rationale":"r","predictedOutcome":"p"}';
        if (agentType === 'grd-experiment-runner') {
          if (/DEBUG mode/.test(prompt)) throw new Error('backend down');
          return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/run.sh"}';
        }
        return '__TAKEAWAY__ {"kind":"failure_root_cause","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';
      };
      const runner = failThenPassRunner(Infinity);
      const res = await runResearch(cwd, 'Q?', { maxIterations: 1, noGates: true, spawn, runner });
      expect(res.status).toBe('exhausted'); // measured inconclusive → exhausted at maxIterations, NOT thread error
      expect(runner.state.calls).toBe(1); // no re-run after the failed fix spawn
      const iterDir = iterDirOf(cwd, res.threadId);
      const rec = JSON.parse(fs.readFileSync(path.join(iterDir, 'debug-attempt-1.json'), 'utf8'));
      expect(rec.fixed).toBe(false);
      expect(rec.spawnError).toMatch(/backend down/);
      expect(fs.existsSync(path.join(iterDir, 'debug-attempt-2.json'))).toBe(false); // break, no second attempt
      expect(readLedger(cwd, res.threadId)[0].status).toBe('inconclusive');
    });

    it('gates ON: the execute gate is re-checked before any debug re-run — denial blocks the rewritten script', async () => {
      const cwd = tmp();
      // execute gate ON (its approval covers only the DESIGN-time script);
      // kg_write off so the resume can reach a terminal status.
      writeCfg(cwd, { research_max_debug_depth: 2, research_gates: { experiment_execution: true, kg_write: false } });
      const { spawn, debugPrompts } = makeDebugSpawn();
      const runner = failThenPassRunner(Infinity);
      const first = await runResearch(cwd, 'Gated debug Q', { maxIterations: 1, noGates: false, spawn, runner });
      expect(first.paused).toBe(true);
      expect(first.pendingGate).toBe('execute');
      expect(runner.state.calls).toBe(0); // gate pauses before any execution
      const res = await resumeResearch(cwd, first.threadId, { spawn, runner, noGates: false });
      expect(res.status).toBe('exhausted');
      // The approved DESIGN-time script ran once; the debug re-run was gate-denied:
      // no fix spawn was dispatched and no rewritten script was ever executed.
      expect(runner.state.calls).toBe(1);
      expect(debugPrompts.length).toBe(0);
      const iterDir = iterDirOf(cwd, res.threadId);
      const rec = JSON.parse(fs.readFileSync(path.join(iterDir, 'debug-attempt-1.json'), 'utf8'));
      expect(rec.gateDenied).toBe('execute');
      expect(rec.fixed).toBe(false);
      expect(rec.trigger.exitCode).toBe(2);
      expect(fs.existsSync(path.join(iterDir, 'debug-attempt-2.json'))).toBe(false); // denial aborts further attempts
    });

    it('gate denial mid-debug degrades to the depth=0 outcome: inconclusive, failing result stands, no pause', async () => {
      const cwd = tmp();
      writeCfg(cwd, { research_max_debug_depth: 3, research_gates: { experiment_execution: true, kg_write: false } });
      const { spawn } = makeDebugSpawn();
      const runner = failThenPassRunner(Infinity);
      const first = await runResearch(cwd, 'Gated degrade Q', { maxIterations: 1, noGates: false, spawn, runner });
      const res = await resumeResearch(cwd, first.threadId, { spawn, runner, noGates: false });
      // depth=0 outcome: the failing result is measured inconclusive as-is
      expect(res.status).toBe('exhausted');
      expect(readLedger(cwd, res.threadId)[0].status).toBe('inconclusive');
      const iterDir = iterDirOf(cwd, res.threadId);
      expect(JSON.parse(fs.readFileSync(path.join(iterDir, 'result.json'), 'utf8')).exitCode).toBe(2);
      expect(JSON.parse(fs.readFileSync(path.join(iterDir, 'debug-attempt-1.json'), 'utf8')).gateDenied).toBe('execute');
      // the denial did NOT pause or re-gate the thread mid-RUN, and no re-run consumed budget
      const tj = JSON.parse(fs.readFileSync(path.join(cwd, '.planning/research/threads', res.threadId, 'thread.json'), 'utf8'));
      expect(tj.status).toBe('exhausted');
      expect(tj.pendingGate).toBe(null);
      expect(tj.budgetUsed).toBe(1);
    });

    it('a debug re-plan that relaxes the target is pinned: verdict judged against the ORIGINAL contract', async () => {
      const cwd = tmp();
      writeCfg(cwd, { research_max_debug_depth: 1 });
      // The debug fix tries to relax target 0.8 → 0.1 alongside the script fix.
      const { spawn, debugPrompts } = makeDebugSpawn(
        '{"procedure":"fixed","metricKey":"accuracy","comparator":">=","target":0.1,"language":"shell","scriptPath":"experiments/x/fixed.sh"}',
      );
      let calls = 0;
      const runner = {
        run() {
          calls++;
          if (calls === 1) {
            return { metrics: {}, exitCode: 2, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', stderrExcerpt: 'boom', failureClass: 'H2' };
          }
          // 0.5 passes the relaxed target (0.1) but MISSES the committed one (0.8).
          return { metrics: { accuracy: 0.5 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' };
        },
      };
      const res = await runResearch(cwd, 'Drift Q', { maxIterations: 1, noGates: true, spawn, runner });
      expect(debugPrompts.length).toBe(1);
      expect(calls).toBe(2);
      // Judged against the ORIGINAL target → refuted, NOT supported.
      expect(res.status).toBe('exhausted');
      expect(readLedger(cwd, res.threadId)[0].status).toBe('refuted');
      const iterDir = iterDirOf(cwd, res.threadId);
      // plan.json keeps the DESIGN-committed contract; only the script fields moved.
      const planJson = JSON.parse(fs.readFileSync(path.join(iterDir, 'plan.json'), 'utf8'));
      expect(planJson.target).toBe(0.8);
      expect(planJson.metricKey).toBe('accuracy');
      expect(planJson.comparator).toBe('>=');
      expect(planJson.language).toBe('shell');
      expect(planJson.procedure).toBe('fixed');
      expect(planJson.scriptPath).toBe('experiments/x/fixed.sh');
      // The drift is noted in the attempt record, and the recorded plan is the pinned one.
      const rec = JSON.parse(fs.readFileSync(path.join(iterDir, 'debug-attempt-1.json'), 'utf8'));
      expect(rec.contractDrift).toEqual({ target: { proposed: 0.1, pinned: 0.8 } });
      expect(rec.plan.target).toBe(0.8);
      expect(rec.fixed).toBe(true);
    });
  });

  describe('crash-iteration hypothesis reuse', () => {
    const { createThread, saveThread, loadThread } = require('../../../lib/research/thread');
    const { appendHypothesis, readLedger } = require('../../../lib/research/ledger');
    const spawnReaching = async (_p: string, a: string): Promise<string> => {
      if (a === 'grd-experiment-runner') return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.4,"language":"shell","scriptPath":"experiments/1/run.sh"}';
      if (a === 'grd-hypothesizer') return '__HYPOTHESIS__ {"statement":"NEW","rationale":"r","predictedOutcome":"p"}';
      return '__TAKEAWAY__ {"kind":"domain_fact","content":"c","confidence":0.6,"evidence":"e","failureClass":"none"}';
    };
    it('reuses an existing iter testing hypothesis (no plan) instead of cold-generating a new one', async () => {
      const cwd = tmp();
      const t = createThread(cwd, 'Q crash?', {});
      // simulate a crash after HYPOTHESIZE: a testing hyp exists for iter 1, station design, no plan.json
      appendHypothesis(cwd, t.id, { id: 'h1', iteration: t.iteration, statement: 'CRASHED', rationale: 'r', predictedOutcome: 'p', status: 'testing', parentId: null, verdict: null });
      t.currentStation = 'design'; t.status = 'active'; saveThread(cwd, t);
      await resumeResearch(cwd, t.id, { noGates: true, spawn: spawnReaching, runner: makeRunner() });
      const iter1 = readLedger(cwd, t.id).filter((h: { iteration: number }) => h.iteration === t.iteration);
      expect(iter1.length).toBe(1); // reused h1 — no orphan
      expect(iter1[0].statement).toBe('CRASHED'); // the existing hyp, not a fresh "NEW" one
    });
  });
});
