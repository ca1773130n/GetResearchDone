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
  it('decodeSpawnStdout extracts the last agent_message from a codex exec JSONL stream', () => {
    const jsonl = [
      '{"type":"thread.started","thread_id":"019f5672-1b75-77d0-b32e-b938aaaac7f2"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"I will inspect the workspace."}}',
      '{"type":"item.completed","item":{"id":"item_1","type":"command_execution","text":"ls"}}',
      '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"__PLAN__ {\\"metric\\":\\"recall\\"}"}}',
      '{"type":"turn.completed","usage":{"total_tokens":1234}}',
    ].join('\n');
    expect(decodeSpawnStdout(jsonl)).toBe('__PLAN__ {"metric":"recall"}');
  });
  it('decodeSpawnStdout returns raw when JSONL has no agent_message', () => {
    const jsonl = ['{"type":"thread.started"}', '{"type":"turn.completed"}'].join('\n');
    expect(decodeSpawnStdout(jsonl)).toBe(jsonl);
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

// ── v0.5.0 interactive steering: resume-with-answers + caller-audit + 0.4.16 back-compat ──
describe('resume-with-answers plumbing (101-04)', () => {
  const { createThread, saveThread, loadThread } = require('../../../lib/research/thread');
  const { readCheckpointLog } = require('../../../lib/research/checkpoints');

  function ckLogPath(cwd: string, id: string): string {
    return path.join(cwd, '.planning/research/threads', id, 'checkpoints.jsonl');
  }

  function threadWithPendingCheckpoint(cwd: string): { id: string } {
    const t = createThread(cwd, 'Approve the design?', {});
    t.pendingCheckpoint = {
      checkpoint_version: 1,
      id: 'ck-1-design-r1',
      point: 'design',
      type: 'approval',
      iteration: 1,
      round: 1,
      createdAt: '2026-07-12T00:00:00.000Z',
      questions: [{
        id: 'q1',
        ask: 'Approve & run this experiment?',
        options: [
          { label: 'Approve & run', description: 'proceed', recommended: true },
          { label: 'Revise design', description: 'go back' },
        ],
      }],
    };
    t.status = 'paused';
    saveThread(cwd, t);
    return t;
  }

  it('records human answers to checkpoints.jsonl and clears the pending checkpoint', async () => {
    const cwd = tmp();
    const t = threadWithPendingCheckpoint(cwd);
    // NOT noGates: --no-gates would force recommended defaults; human answers require the gate on.
    await resumeResearch(cwd, t.id, {
      spawn: makeSpawn(), runner: makeRunner(),
      checkpointAnswers: { q1: { label: 'Approve & run' } },
    });
    const log = readCheckpointLog(path.join(cwd, '.planning/research/threads', t.id));
    expect(log.length).toBe(1);
    expect(log[0].answers).toHaveLength(1);
    expect(log[0].answers[0].label).toBe('Approve & run');
    expect(log[0].answers[0].answeredBy).toBe('human');
    // pendingCheckpoint cleared on the persisted thread.
    const tj = loadThread(cwd, t.id);
    expect(tj.pendingCheckpoint == null).toBe(true);
  });

  it('bare resume (no --answers) resolves to the recommended option answeredBy default (timeout behavior)', async () => {
    const cwd = tmp();
    const t = threadWithPendingCheckpoint(cwd);
    // Bare resume: no --answers, gate ON → every question resolves to its recommended option.
    await resumeResearch(cwd, t.id, { spawn: makeSpawn(), runner: makeRunner() });
    const log = readCheckpointLog(path.join(cwd, '.planning/research/threads', t.id));
    expect(log.length).toBe(1);
    expect(log[0].answers[0].label).toBe('Approve & run'); // the recommended option
    expect(log[0].answers[0].answeredBy).toBe('default');
  });

  it('--no-gates ignores supplied answers and resolves to recommended defaults', async () => {
    const cwd = tmp();
    const t = threadWithPendingCheckpoint(cwd);
    await resumeResearch(cwd, t.id, {
      noGates: true, spawn: makeSpawn(), runner: makeRunner(),
      checkpointAnswers: { q1: { label: 'Revise design' } },
    });
    const log = readCheckpointLog(path.join(cwd, '.planning/research/threads', t.id));
    expect(log[0].answers[0].answeredBy).toBe('default');
    expect(log[0].answers[0].label).toBe('Approve & run');
  });
});

describe('caller-audit: exactly 5 unattended runResearch/resumeResearch sites (101-04)', () => {
  const { resolveInteractive, readInteractiveConfig } = require('../../../lib/research/checkpoints');

  it('grep-style discovery finds exactly the 5 declared call sites (a 6th fails until it declares posture)', () => {
    const dir = path.join(__dirname, '../../../lib/research');
    const files: string[] = fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts') && f !== 'orchestrator.ts');
    const rx = /\b(?:runResearch|resumeResearch)\b/;
    // Strip comment-only lines so a mere mention (e.g. paper.ts's "mirrors resumeResearch"
    // note) is NOT counted as a caller — only real code references declare an interactive posture.
    const codeOf = (f: string): string => fs.readFileSync(path.join(dir, f), 'utf8')
      .split('\n').filter((l: string) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    const callers = files.filter((f: string) => rx.test(codeOf(f))).sort();
    expect(callers).toEqual(['bench.ts', 'cli-kb.ts', 'cli.ts', 'index.ts', 'portfolio.ts']);
  });

  it('every unattended posture forces interactive steering inactive even with the gate config ON', () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'),
      JSON.stringify({ research_gates: { interactive: { enabled: true } } }));
    const cfg = readInteractiveConfig(cwd);
    expect(cfg.enabled).toBe(true); // config says ON…
    // …but no unattended path may pause interactively:
    expect(resolveInteractive(cfg, { noGates: true }).active).toBe(false);       // cli --no-gates / bench
    expect(resolveInteractive(cfg, { autonomousMode: true }).active).toBe(false); // autopilot config
    expect(resolveInteractive(cfg, { autopilot: true }).active).toBe(false);      // GRD_AUTOPILOT
    expect(resolveInteractive(cfg, { concurrency: 2 }).active).toBe(false);        // portfolio parallel
    expect(resolveInteractive(cfg, { nonInteractive: true }).active).toBe(false);  // cli-kb seed resume
    // …and only the attended, single-thread, gate-on path stays active:
    expect(resolveInteractive(cfg, {}).active).toBe(true);
  });
});

describe('0.4.16 back-compat: fixtures resume bit-identically (101-04, R3)', () => {
  const { loadThread } = require('../../../lib/research/thread');
  const FIXTURES = path.join(__dirname, '../../fixtures/research-threads');

  function plantFixture(cwd: string, name: string): { id: string } {
    const src = JSON.parse(fs.readFileSync(path.join(FIXTURES, name, 'thread.json'), 'utf8'));
    const dir = path.join(cwd, '.planning/research/threads', src.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, name, 'thread.json'), path.join(dir, 'thread.json'));
    return src;
  }

  it('terminal-supported-0416 short-circuits unchanged (no re-run, byte-identical thread.json, no checkpoints.jsonl)', async () => {
    const cwd = tmp();
    const src = plantFixture(cwd, 'terminal-supported-0416');
    const dir = path.join(cwd, '.planning/research/threads', src.id);
    const before = fs.readFileSync(path.join(dir, 'thread.json'), 'utf8');
    const res = await resumeResearch(cwd, src.id, { spawn: makeSpawn(), runner: makeRunner() });
    expect(res.status).toBe('supported');
    expect(res.iterations).toBe(3);
    // TERMINAL short-circuit never saves the thread → byte-identical on disk.
    expect(fs.readFileSync(path.join(dir, 'thread.json'), 'utf8')).toBe(before);
    expect(fs.existsSync(path.join(dir, 'checkpoints.jsonl'))).toBe(false);
  });

  it('paused-execute-0416 flows through the pendingGate:execute path, NOT the checkpoint branch', async () => {
    const cwd = tmp();
    const src = plantFixture(cwd, 'paused-execute-0416');
    const dir = path.join(cwd, '.planning/research/threads', src.id);
    // gates.execute is off in the fixture (approved on resume); loop advances then re-pauses.
    const res = await resumeResearch(cwd, src.id, { spawn: makeSpawn(), runner: makeRunner(), noGates: false });
    // pendingCheckpoint was undefined → the new checkpoint branch is never entered:
    expect(fs.existsSync(path.join(dir, 'checkpoints.jsonl'))).toBe(false);
    const tj = loadThread(cwd, src.id);
    expect(tj.pendingCheckpoint == null).toBe(true);
    // it resumed via the existing pendingGate path (never the checkpoint branch) — the run advanced
    // and re-paused at a downstream gate. The proof is a gate pause with NO checkpoint artifact.
    expect(res.paused).toBe(true);
    expect(['execute', 'kg_write']).toContain(res.pendingGate);
    expect(res.pendingCheckpoint).toBeUndefined();
  });
});

describe('DESIGN approval checkpoint (Phase 102)', () => {
  const { loadThread } = require('../../../lib/research/thread');
  const { readCheckpointLog } = require('../../../lib/research/checkpoints');

  // experiment_execution:false decouples the classic execute gate from the DESIGN checkpoint
  // system under test — the debug-loop's internal re-check (orchestrator.ts ~L561) is a
  // separate, untouched no-touch-list mechanism (§4 decision 5) and must always proceed here.
  function writeInteractiveConfig(cwd: string, extra: Record<string, unknown> = {}): void {
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      research_gates: {
        experiment_execution: false,
        kg_write: false,
        // decide:false isolates these to the DESIGN station — the Phase 103 DECIDE checkpoint
        // (default-on when interactive.enabled) would otherwise legitimately pause the
        // would-continue branch after a refuted verdict.
        interactive: { enabled: true, design: true, decide: false, max_rounds: 2 },
      },
      ...extra,
    }));
  }

  function threadDirOf(cwd: string, id: string): string {
    return path.join(cwd, '.planning/research/threads', id);
  }

  it('EMIT/ONE-PAUSE: interactive.design on, iteration 1 ⇒ exactly ONE pause carrying a valid design-approval checkpoint (not the execute gate)', async () => {
    const cwd = tmp();
    writeInteractiveConfig(cwd);
    const res = await runResearch(cwd, 'Approve my design?', {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
    });
    expect(res.status).toBe('paused');
    expect(res.paused).toBe(true);
    expect(res.pendingGate).toBeUndefined();
    expect(res.pendingCheckpoint?.point).toBe('design');
    expect(res.pendingCheckpoint?.type).toBe('approval');
    expect(res.pendingCheckpoint?.round).toBe(1);
    expect(res.pendingCheckpoint?.questions.length).toBeLessThanOrEqual(4);
    for (const q of res.pendingCheckpoint?.questions || []) {
      expect(q.options.filter((o: any) => o.recommended === true).length).toBe(1);
    }
  });

  it('R4: contract edit from the checkpoint freeform answer survives the debug-loop pin', async () => {
    const cwd = tmp();
    writeInteractiveConfig(cwd, { research_max_debug_depth: 1 });
    const first = await runResearch(cwd, 'Edit the contract?', {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
    });
    expect(first.pendingCheckpoint?.point).toBe('design');

    // Force a debug retry: the runner fails once (script-execution failure), then succeeds
    // reporting the EDITED target back as the metric — proving MEASURE judges the edit.
    let calls = 0;
    const flakyRunner = {
      run(plan: any) {
        calls++;
        if (calls === 1) {
          return {
            metrics: {}, exitCode: 1, runner: 'subprocess', durationMs: 1,
            stdoutExcerpt: '', stderrExcerpt: 'boom', failureClass: 'H4',
          };
        }
        return {
          metrics: { accuracy: plan.target }, exitCode: 0, runner: 'subprocess',
          durationMs: 1, stdoutExcerpt: '', failureClass: 'none',
        };
      },
    };
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: makeSpawn(), runner: flakyRunner, noGates: false,
      checkpointAnswers: {
        q1: { label: 'Approve & run' },
        q2: { label: 'Keep as designed', text: 'target: 0.9' },
      },
    });
    expect(res.status).toBe('supported');
    const dir = threadDirOf(cwd, first.threadId);
    const plan = JSON.parse(fs.readFileSync(path.join(dir, 'experiments/1/plan.json'), 'utf8'));
    expect(plan.target).toBe(0.9);
    const attempt = JSON.parse(fs.readFileSync(path.join(dir, 'experiments/1/debug-attempt-1.json'), 'utf8'));
    // The debug fix-spawn's mock plan reports target 0.8 (the model's original) — the pin
    // overwrites it back to the user-edited 0.9, recording the drift (not reverting it).
    expect(attempt.contractDrift?.target?.pinned).toBe(0.9);
    expect(attempt.contractDrift?.target?.proposed).toBe(0.8);
  });

  it('R5: consumeAnswered one-shot — approve resume RUNs without emitting a second design checkpoint this iteration', async () => {
    const cwd = tmp();
    writeInteractiveConfig(cwd);
    const first = await runResearch(cwd, 'No double ask?', {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
    });
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'Approve & run' } },
    });
    expect(res.pendingCheckpoint).toBeUndefined();
    const log = readCheckpointLog(threadDirOf(cwd, first.threadId));
    expect(log.length).toBe(1); // only the original round-1 resolve — no re-ask
  });

  it('REVISE is capped at max_rounds — the (max_rounds+1)th resolves to APPROVE default and RUNs', async () => {
    const cwd = tmp();
    writeInteractiveConfig(cwd);
    const pause1 = await runResearch(cwd, 'Revise cap?', {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
    });
    expect(pause1.pendingCheckpoint?.round).toBe(1);

    const pause2 = await resumeResearch(cwd, pause1.threadId, {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'Revise the plan' } },
    });
    expect(pause2.paused).toBe(true);
    expect(pause2.pendingCheckpoint?.round).toBe(2);

    const pause3 = await resumeResearch(cwd, pause1.threadId, {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'Revise the plan' } },
    });
    expect(pause3.paused).toBe(true);
    expect(pause3.pendingCheckpoint?.round).toBe(3);

    const final = await resumeResearch(cwd, pause1.threadId, {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'Revise the plan' } },
    });
    // Cap exceeded (round 3 > max_rounds:2) -> routed to the APPROVE reuse path -> RUNs;
    // no 4th design checkpoint is ever emitted.
    expect(final.pendingCheckpoint).toBeUndefined();

    const t = loadThread(cwd, pause1.threadId);
    expect(t.checkpointRounds?.design).toBe(2);
    const log = readCheckpointLog(threadDirOf(cwd, pause1.threadId));
    expect(log.length).toBe(3); // r1, r2, r3 resolved; no r4 ever emitted
  });

  it('ABORT sets thread.status=abandoned and returns a terminal result (no RUN)', async () => {
    const cwd = tmp();
    writeInteractiveConfig(cwd);
    const pause1 = await runResearch(cwd, 'Abort me?', {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
    });
    const res = await resumeResearch(cwd, pause1.threadId, {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'Abort this thread' } },
    });
    expect(res.status).toBe('abandoned');
    const t = loadThread(cwd, pause1.threadId);
    expect(t.status).toBe('abandoned');
    expect(fs.existsSync(path.join(threadDirOf(cwd, pause1.threadId), 'experiments/1/result.json'))).toBe(false);
  });

  it('BYTE-IDENTICAL DEFAULT: interactive absent/disabled ⇒ execute-gate pauses; no checkpoints.jsonl written', async () => {
    const cwd = tmp();
    const res = await runResearch(cwd, 'Plain gated question', {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
    });
    expect(res.paused).toBe(true);
    expect(res.pendingGate).toBe('execute');
    expect(res.pendingCheckpoint).toBeUndefined();
    expect(fs.existsSync(path.join(threadDirOf(cwd, res.threadId), 'checkpoints.jsonl'))).toBe(false);
  });
});

describe('SEED clarification checkpoint (Phase 103)', () => {
  const { loadThread, createThread, saveThread } = require('../../../lib/research/thread');
  const { readCheckpointLog } = require('../../../lib/research/checkpoints');

  const AMBIGUOUS = '__CLARIFY__ {"dimensions":[{"ask":"What is measured?","options":['
    + '{"label":"accuracy","description":"top-1","recommended":true},{"label":"f1","description":"macro"}]}]}';
  const UNAMBIGUOUS = '__CLARIFY__ {"dimensions":[]}';

  function threadDirOf(cwd: string, id: string): string {
    return path.join(cwd, '.planning/research/threads', id);
  }

  // seed on; design/hypothesize/decide OFF so only the SEED station under test can pause.
  // experiment_execution/kg_write off so the classic gates never pause the loop either.
  function writeSeedConfig(cwd: string, extra: Record<string, unknown> = {}): void {
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      research_gates: {
        experiment_execution: false,
        kg_write: false,
        // hypothesize:false isolates these to the SEED station — the Phase 104 selection
        // checkpoint (default-on when interactive.enabled) would otherwise legitimately spawn the
        // multi-candidate hypothesizer at iteration 1 and inflate the cold-HYPOTHESIZE spawn count.
        interactive: { enabled: true, seed: true, design: false, hypothesize: false },
      },
      ...extra,
    }));
  }

  function makeSeedSpawn(clarifyBlock: string) {
    const state = { clarifyCalls: 0, hypoCalls: 0, lastHypoPrompt: '' };
    const spawn = async (prompt: string, agentType: string): Promise<string> => {
      if (agentType === 'grd-hypothesizer') {
        if (prompt.includes('__CLARIFY__')) { state.clarifyCalls++; return clarifyBlock; }
        state.hypoCalls++; state.lastHypoPrompt = prompt;
        return '__HYPOTHESIS__ {"statement":"h","rationale":"r","predictedOutcome":"p"}';
      }
      if (agentType === 'grd-experiment-runner') {
        return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/run.sh"}';
      }
      if (agentType === 'grd-knowledge-miner') {
        return '__TAKEAWAY__ {"kind":"success_pattern","content":"c","confidence":0.8,"evidence":"e","failureClass":"none"}';
      }
      return '';
    };
    return { spawn, state };
  }

  function supportedRunner() {
    return { run: () => ({ metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
  }

  it('AMBIGUOUS + interactive.seed on ⇒ pauses with pendingCheckpoint.point="seed" BEFORE any HYPOTHESIZE spawn', async () => {
    const cwd = tmp();
    writeSeedConfig(cwd);
    const { spawn, state } = makeSeedSpawn(AMBIGUOUS);
    const res = await runResearch(cwd, 'Does batching help throughput?', { spawn, runner: supportedRunner(), noGates: false });
    expect(res.status).toBe('paused');
    expect(res.paused).toBe(true);
    expect(res.pendingCheckpoint?.point).toBe('seed');
    expect(res.pendingCheckpoint?.type).toBe('clarification');
    expect(res.pendingGate).toBeUndefined();
    expect(state.clarifyCalls).toBe(1);
    expect(state.hypoCalls).toBe(0); // NO hypothesizer spawn before the seed pause
    // The verbatim question is the checkpoint context, and each question has exactly one recommended.
    expect(res.pendingCheckpoint?.context).toBe('Does batching help throughput?');
    for (const q of res.pendingCheckpoint?.questions || []) {
      expect(q.options.filter((o: any) => o.recommended === true).length).toBe(1);
    }
  });

  it('RESUME folds the chosen answers into thread.refinedQuestion (question stays verbatim) and HYPOTHESIZE grounds on it', async () => {
    const cwd = tmp();
    writeSeedConfig(cwd);
    const first = await runResearch(cwd, 'How to measure it?', { spawn: makeSeedSpawn(AMBIGUOUS).spawn, runner: supportedRunner(), noGates: false });
    expect(first.pendingCheckpoint?.point).toBe('seed');

    const resumeSpawn = makeSeedSpawn(AMBIGUOUS);
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: resumeSpawn.spawn, runner: supportedRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'f1' } },
    });
    expect(res.status).toBe('supported');
    const t = loadThread(cwd, first.threadId);
    expect(t.question).toBe('How to measure it?'); // verbatim, never mutated (seeds threadId)
    expect(t.refinedQuestion).toContain('f1');
    expect(t.refinedQuestion).toContain('How to measure it?');
    // HYPOTHESIZE grounded on the refined question, not the bare one.
    expect(resumeSpawn.state.hypoCalls).toBe(1);
    expect(resumeSpawn.state.lastHypoPrompt).toContain('f1');
  });

  it('UNAMBIGUOUS (empty dimensions) ⇒ exactly ONE clarifier spawn, NO pause, refinedQuestion === verbatim question', async () => {
    const cwd = tmp();
    writeSeedConfig(cwd);
    const { spawn, state } = makeSeedSpawn(UNAMBIGUOUS);
    const res = await runResearch(cwd, 'Precise falsifiable question', { spawn, runner: supportedRunner(), noGates: false });
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('supported');
    expect(state.clarifyCalls).toBe(1);
    expect(state.hypoCalls).toBeGreaterThanOrEqual(1);
    const t = loadThread(cwd, res.threadId);
    expect(t.refinedQuestion).toBe('Precise falsifiable question');
    expect(fs.existsSync(path.join(threadDirOf(cwd, res.threadId), 'checkpoints.jsonl'))).toBe(false);
  });

  it('SEEDED thread (seededFrom set) ⇒ SEED skipped, no clarifier spawn, refinedQuestion never written', async () => {
    const cwd = tmp();
    writeSeedConfig(cwd);
    const seeded = createThread(cwd, 'Seeded synthesis question', {
      seededFrom: { synthesisTopicId: 'topic-1', sourceNodeIds: ['n1', 'n2'], seedKey: 'k' },
    });
    saveThread(cwd, seeded);
    const { spawn, state } = makeSeedSpawn(AMBIGUOUS);
    const res = await resumeResearch(cwd, seeded.id, { spawn, runner: supportedRunner(), noGates: false });
    expect(state.clarifyCalls).toBe(0);
    const t = loadThread(cwd, seeded.id);
    expect(t.refinedQuestion).toBeUndefined();
  });

  it('BYTE-IDENTICAL DEFAULT: interactive off ⇒ no clarifier spawn, grounds on thread.question, no refinedQuestion written', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      research_gates: { experiment_execution: false, kg_write: false },
    }));
    const { spawn, state } = makeSeedSpawn(AMBIGUOUS);
    const res = await runResearch(cwd, 'Baseline pre-103 question', { spawn, runner: supportedRunner(), noGates: false });
    expect(res.status).toBe('supported');
    expect(state.clarifyCalls).toBe(0);
    expect(state.lastHypoPrompt).toContain('Baseline pre-103 question');
    const t = loadThread(cwd, res.threadId);
    expect(t.refinedQuestion).toBeUndefined();
  });

  it('NO DOUBLE-ASK: after a seed resume, the loop does not re-emit a seed checkpoint (one seed resolve logged)', async () => {
    const cwd = tmp();
    writeSeedConfig(cwd);
    const first = await runResearch(cwd, 'Ask me once', { spawn: makeSeedSpawn(AMBIGUOUS).spawn, runner: supportedRunner(), noGates: false });
    const resumeSpawn = makeSeedSpawn(AMBIGUOUS);
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: resumeSpawn.spawn, runner: supportedRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'accuracy' } },
    });
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('supported');
    expect(resumeSpawn.state.clarifyCalls).toBe(0); // never re-spawns the clarifier on resume
    const log = readCheckpointLog(threadDirOf(cwd, first.threadId));
    expect(log.length).toBe(1); // only the original seed resolve — no re-ask
    expect(log[0].point).toBe('seed');
  });
});

describe('DECIDE branch checkpoint (Phase 103)', () => {
  const { loadThread } = require('../../../lib/research/thread');
  const { readCheckpointLog } = require('../../../lib/research/checkpoints');

  function threadDirOf(cwd: string, id: string): string {
    return path.join(cwd, '.planning/research/threads', id);
  }

  // decide ON; seed/hypothesize/design OFF so ONLY the DECIDE station can pause.
  // experiment_execution/kg_write off so the classic gates never pause the loop.
  function writeDecideConfig(cwd: string): void {
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      research_gates: {
        experiment_execution: false,
        kg_write: false,
        interactive: { enabled: true, decide: true, seed: false, hypothesize: false, design: false },
      },
    }));
  }

  // Hypothesizer/experiment/miner spawn that counts hypothesizer calls and captures the last
  // hypothesizer prompt (to prove the PIVOT path fires on a pivot resume). Seed off ⇒ no clarifier.
  function makeDecideSpawn() {
    const state = { hypoCalls: 0, lastHypoPrompt: '' };
    const spawn = async (prompt: string, agentType: string): Promise<string> => {
      if (agentType === 'grd-hypothesizer') {
        state.hypoCalls++; state.lastHypoPrompt = prompt;
        return `__HYPOTHESIS__ {"statement":"h${state.hypoCalls}","rationale":"r","predictedOutcome":"p"}`;
      }
      if (agentType === 'grd-experiment-runner') {
        return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/run.sh"}';
      }
      if (agentType === 'grd-knowledge-miner') {
        return '__TAKEAWAY__ {"kind":"failure_root_cause","content":"needs work","confidence":0.5,"evidence":"e","failureClass":"none"}';
      }
      return '';
    };
    return { spawn, state };
  }

  // Always-refuting runner (accuracy 0.5 < target 0.8) so the loop WOULD continue; counts runs.
  function refutingRunner() {
    const state = { runs: 0 };
    const runner = { run: () => { state.runs++; return { metrics: { accuracy: 0.5 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }; } };
    return { runner, state };
  }

  function supportedRunner() {
    return { run: () => ({ metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
  }

  it('WOULD-CONTINUE + decide on ⇒ pauses with pendingCheckpoint.point="decide" after MEASURE, before the iteration increments', async () => {
    const cwd = tmp();
    writeDecideConfig(cwd);
    const { spawn, state } = makeDecideSpawn();
    const res = await runResearch(cwd, 'Does batching help?', { maxIterations: 5, spawn, runner: refutingRunner().runner, noGates: false });
    expect(res.status).toBe('paused');
    expect(res.paused).toBe(true);
    expect(res.pendingCheckpoint?.point).toBe('decide');
    expect(res.pendingCheckpoint?.type).toBe('branch');
    expect(res.pendingCheckpoint?.iteration).toBe(1); // paused BEFORE the increment
    expect(res.pendingGate).toBeUndefined();
    expect(state.hypoCalls).toBe(1); // exactly one iteration ran
    // Single question, exactly one recommended, four continue/pivot/stop/adjust options.
    expect(res.pendingCheckpoint?.questions.length).toBe(1);
    const q1 = res.pendingCheckpoint!.questions[0];
    expect(q1.options.map((o: any) => o.label)).toEqual(['Continue', 'Pivot', 'Stop', 'Adjust budget']);
    expect(q1.options.filter((o: any) => o.recommended === true).length).toBe(1);
    // Evidence summary in the context.
    expect(res.pendingCheckpoint?.context).toContain('verdict: refuted');
    expect(res.pendingCheckpoint?.context).toContain('measured 0.5');
    expect(res.pendingCheckpoint?.context).toContain('iteration 1 of 5');
  });

  it('TERMINAL verdict is NOT delayed: a supported verdict finalizes with NO decide checkpoint', async () => {
    const cwd = tmp();
    writeDecideConfig(cwd);
    const { spawn } = makeDecideSpawn();
    const res = await runResearch(cwd, 'Precise question', { maxIterations: 5, spawn, runner: supportedRunner(), noGates: false });
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('supported');
    expect(fs.existsSync(path.join(threadDirOf(cwd, res.threadId), 'checkpoints.jsonl'))).toBe(false);
  });

  it('TERMINAL (budget exhausted) is NOT delayed: last-iteration refuted finalizes exhausted, no decide checkpoint', async () => {
    const cwd = tmp();
    writeDecideConfig(cwd);
    const { spawn } = makeDecideSpawn();
    const res = await runResearch(cwd, 'One shot', { maxIterations: 1, spawn, runner: refutingRunner().runner, noGates: false });
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('exhausted');
    expect(fs.existsSync(path.join(threadDirOf(cwd, res.threadId), 'checkpoints.jsonl'))).toBe(false);
  });

  it('CONTINUE resume ⇒ iteration advances and the next hypothesis runs (pauses again at iter 2)', async () => {
    const cwd = tmp();
    writeDecideConfig(cwd);
    const first = await runResearch(cwd, 'Continue me', { maxIterations: 5, spawn: makeDecideSpawn().spawn, runner: refutingRunner().runner, noGates: false });
    expect(first.pendingCheckpoint?.iteration).toBe(1);
    const resume = makeDecideSpawn();
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: resume.spawn, runner: refutingRunner().runner, noGates: false,
      checkpointAnswers: { q1: { label: 'Continue' } },
    });
    expect(res.status).toBe('paused');
    expect(res.pendingCheckpoint?.point).toBe('decide');
    expect(res.pendingCheckpoint?.iteration).toBe(2); // advanced one iteration
    expect(resume.state.hypoCalls).toBe(1); // next hypothesis ran (cold HYPOTHESIZE)
  });

  it('PIVOT resume ⇒ pendingPivot drives the next HYPOTHESIZE down the pivot path', async () => {
    const cwd = tmp();
    writeDecideConfig(cwd);
    const first = await runResearch(cwd, 'Pivot me', { maxIterations: 5, spawn: makeDecideSpawn().spawn, runner: refutingRunner().runner, noGates: false });
    const resume = makeDecideSpawn();
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: resume.spawn, runner: refutingRunner().runner, noGates: false,
      checkpointAnswers: { q1: { label: 'Pivot' } },
    });
    expect(res.pendingCheckpoint?.iteration).toBe(2);
    expect(resume.state.lastHypoPrompt).toContain('PIVOT HARD'); // pivot path fired
  });

  it('ADJUST-BUDGET resume ⇒ maxIterations increased by DECIDE_BUDGET_BUMP; loop continues', async () => {
    const cwd = tmp();
    writeDecideConfig(cwd);
    const first = await runResearch(cwd, 'More budget', { maxIterations: 2, spawn: makeDecideSpawn().spawn, runner: refutingRunner().runner, noGates: false });
    expect(first.pendingCheckpoint?.iteration).toBe(1);
    const resume = makeDecideSpawn();
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: resume.spawn, runner: refutingRunner().runner, noGates: false,
      checkpointAnswers: { q1: { label: 'Adjust budget' } },
    });
    expect(res.status).toBe('paused');
    const t = loadThread(cwd, first.threadId);
    expect(t.maxIterations).toBe(4); // 2 + DECIDE_BUDGET_BUMP(2)
    expect(res.pendingCheckpoint?.iteration).toBe(2);
  });

  it('STOP resume ⇒ finalizes exhausted, writes FINDING from the persisted result, no re-run of the completed experiment', async () => {
    const cwd = tmp();
    writeDecideConfig(cwd);
    const firstRunner = refutingRunner();
    const first = await runResearch(cwd, 'Stop me', { maxIterations: 5, spawn: makeDecideSpawn().spawn, runner: firstRunner.runner, noGates: false });
    expect(first.pendingCheckpoint?.point).toBe('decide');
    const resume = makeDecideSpawn();
    const resumeRunner = refutingRunner();
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: resume.spawn, runner: resumeRunner.runner, noGates: false,
      checkpointAnswers: { q1: { label: 'Stop' } },
    });
    expect(res.status).toBe('exhausted');
    expect(res.paused).toBeFalsy();
    // No re-run: neither the runner nor the hypothesizer fire for the already-completed iteration.
    expect(resume.state.hypoCalls).toBe(0);
    expect(resumeRunner.state.runs).toBe(0);
    const findingText = fs.readFileSync(path.join(threadDirOf(cwd, first.threadId), 'FINDING.md'), 'utf8');
    expect(findingText).toContain('verdict:** exhausted');
    expect(findingText).toContain('0.5'); // metric from the persisted result.json
  });

  it('BYTE-IDENTICAL DEFAULT: interactive off ⇒ no decide checkpoint; loop drives to exhausted', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      research_gates: { experiment_execution: false, kg_write: false },
    }));
    const { spawn } = makeDecideSpawn();
    const res = await runResearch(cwd, 'Baseline pre-103 loop', { maxIterations: 2, spawn, runner: refutingRunner().runner, noGates: false });
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('exhausted');
    expect(fs.existsSync(path.join(threadDirOf(cwd, res.threadId), 'checkpoints.jsonl'))).toBe(false);
  });

  it('NO DOUBLE-ASK: a stop resume resolves the decide checkpoint exactly once', async () => {
    const cwd = tmp();
    writeDecideConfig(cwd);
    const first = await runResearch(cwd, 'Ask once', { maxIterations: 5, spawn: makeDecideSpawn().spawn, runner: refutingRunner().runner, noGates: false });
    const resume = makeDecideSpawn();
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: resume.spawn, runner: refutingRunner().runner, noGates: false,
      checkpointAnswers: { q1: { label: 'Stop' } },
    });
    expect(res.paused).toBeFalsy();
    const log = readCheckpointLog(threadDirOf(cwd, first.threadId));
    expect(log.length).toBe(1); // only the one decide resolve
    expect(log[0].point).toBe('decide');
  });
});

describe('HYPOTHESIZE candidate selection (Phase 104)', () => {
  const { createThread, saveThread, loadThread } = require('../../../lib/research/thread');
  const { appendHypothesis, readLedger, writeLedger } = require('../../../lib/research/ledger');
  const { readCheckpointLog } = require('../../../lib/research/checkpoints');

  const THREE = '__HYPOTHESES__ {"candidates":['
    + '{"statement":"C1","rationale":"r1","predictedOutcome":"p1"},'
    + '{"statement":"C2","rationale":"r2","predictedOutcome":"p2"},'
    + '{"statement":"C3","rationale":"r3","predictedOutcome":"p3"}]}';
  const EMPTY = '__HYPOTHESES__ {"candidates":[]}';
  const ONE = '__HYPOTHESES__ {"candidates":[{"statement":"SOLO","rationale":"rs","predictedOutcome":"ps"}]}';

  function threadDirOf(cwd: string, id: string): string {
    return path.join(cwd, '.planning/research/threads', id);
  }

  // hypothesize on; seed/design/decide OFF and the classic gates OFF so ONLY the selection
  // station under test can pause.
  function writeSelConfig(cwd: string, interactiveExtra: Record<string, unknown> = {}): void {
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      research_gates: {
        experiment_execution: false,
        kg_write: false,
        interactive: {
          enabled: true, seed: false, hypothesize: true, design: false, decide: false,
          ...interactiveExtra,
        },
      },
    }));
  }

  // Spawn: __HYPOTHESES__ (multi) when the multi prompt is detected, __HYPOTHESIS__ (single)
  // otherwise; a passing plan + takeaway for DESIGN/LEARN.
  function makeSelSpawn(multiBlock: string) {
    const state = { multiCalls: 0, singleCalls: 0, planCalls: 0 };
    const spawn = async (prompt: string, agentType: string): Promise<string> => {
      if (agentType === 'grd-hypothesizer') {
        if (prompt.includes('__HYPOTHESES__')) { state.multiCalls++; return multiBlock; }
        state.singleCalls++;
        return '__HYPOTHESIS__ {"statement":"SINGLE","rationale":"r","predictedOutcome":"p"}';
      }
      if (agentType === 'grd-experiment-runner') {
        state.planCalls++;
        return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/run.sh"}';
      }
      if (agentType === 'grd-knowledge-miner') {
        return '__TAKEAWAY__ {"kind":"success_pattern","content":"c","confidence":0.8,"evidence":"e","failureClass":"none"}';
      }
      return '';
    };
    return { spawn, state };
  }

  function supportedRunner() {
    return { run: () => ({ metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
  }

  it('PRE-LEDGER PAUSE + ZERO POLLUTION: >=2 candidates ⇒ selection pause with an EMPTY ledger', async () => {
    const cwd = tmp();
    writeSelConfig(cwd);
    const { spawn, state } = makeSelSpawn(THREE);
    const res = await runResearch(cwd, 'Which lever helps throughput?', { spawn, runner: supportedRunner(), noGates: false });
    expect(res.status).toBe('paused');
    expect(res.pendingCheckpoint?.point).toBe('hypothesize');
    expect(res.pendingCheckpoint?.type).toBe('selection');
    expect(res.pendingGate).toBeUndefined();
    // one multi spawn, NO single-block spawn, NO DESIGN spawn before the pause.
    expect(state.multiCalls).toBe(1);
    expect(state.singleCalls).toBe(0);
    expect(state.planCalls).toBe(0);
    // ZERO POLLUTION: no hypothesis in the ledger for this iteration.
    expect(readLedger(cwd, res.threadId).filter((h: any) => h.iteration === 1).length).toBe(0);
    // one option per candidate, rank-1 recommended, freeform true; context holds the full set.
    const q = res.pendingCheckpoint?.questions[0];
    expect(q?.options.length).toBe(3);
    expect(q?.options.filter((o: any) => o.recommended === true).length).toBe(1);
    expect(q?.options[0].recommended).toBe(true);
    expect((q as any).freeform).toBe(true);
    expect(JSON.parse(res.pendingCheckpoint?.context as string).length).toBe(3);
    // the round is 1 AND persisted to the thread (symmetry with DESIGN) so a re-emit increments.
    expect(res.pendingCheckpoint?.round).toBe(1);
    expect(loadThread(cwd, res.threadId).checkpointRounds?.hypothesize).toBe(1);
  });

  it('MATCHED RESUME: choosing candidate 2 appends ONLY it and proceeds to DESIGN', async () => {
    const cwd = tmp();
    writeSelConfig(cwd);
    const first = await runResearch(cwd, 'Pick one', { spawn: makeSelSpawn(THREE).spawn, runner: supportedRunner(), noGates: false });
    const resume = makeSelSpawn(THREE);
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: resume.spawn, runner: supportedRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'C2' } },
    });
    expect(res.status).toBe('supported');
    const led = readLedger(cwd, first.threadId).filter((h: any) => h.iteration === 1);
    expect(led.length).toBe(1);
    expect(led[0].statement).toBe('C2');
    expect(led[0].rationale).toBe('r2');
    expect(led[0].predictedOutcome).toBe('p2');
    // the unchosen candidates never entered the ledger.
    const all = readLedger(cwd, first.threadId).map((h: any) => h.statement);
    expect(all).not.toContain('C1');
    expect(all).not.toContain('C3');
    // proceeded to DESIGN — the experiment-runner fired.
    expect(resume.state.planCalls).toBeGreaterThanOrEqual(1);
  });

  it('FREEFORM RESUME: "Other" + text ⇒ user-authored statement + fixed rationale', async () => {
    const cwd = tmp();
    writeSelConfig(cwd);
    const first = await runResearch(cwd, 'Author your own', { spawn: makeSelSpawn(THREE).spawn, runner: supportedRunner(), noGates: false });
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: makeSelSpawn(THREE).spawn, runner: supportedRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'Other', text: 'my own hypothesis' } },
    });
    expect(res.status).toBe('supported');
    const led = readLedger(cwd, first.threadId).filter((h: any) => h.iteration === 1);
    expect(led.length).toBe(1);
    expect(led[0].statement).toBe('my own hypothesis');
    expect(led[0].rationale).toBe('user-provided at checkpoint');
  });

  it('BYTE-IDENTICAL DEFAULT: interactive off ⇒ single-block spawn, one hyp, NO selection checkpoint', async () => {
    const cwd = tmp();
    // interactive disabled → the selection station is off; classic execute gate off so the loop runs.
    writeSelConfig(cwd, { enabled: false });
    const { spawn, state } = makeSelSpawn(THREE);
    const res = await runResearch(cwd, 'Plain question', { spawn, runner: supportedRunner(), noGates: false });
    expect(res.status).toBe('supported');
    expect(res.pendingCheckpoint).toBeUndefined();
    expect(state.multiCalls).toBe(0);
    expect(state.singleCalls).toBe(1);
    const led = readLedger(cwd, res.threadId).filter((h: any) => h.iteration === 1);
    expect(led.length).toBe(1);
    expect(led[0].statement).toBe('SINGLE');
    expect(fs.existsSync(path.join(threadDirOf(cwd, res.threadId), 'checkpoints.jsonl'))).toBe(false);
  });

  it('ZERO-CANDIDATE DEGRADE: gate on but parser yields 0 candidates ⇒ single-block, no pause', async () => {
    const cwd = tmp();
    writeSelConfig(cwd);
    const { spawn, state } = makeSelSpawn(EMPTY);
    const res = await runResearch(cwd, 'Degrade me', { spawn, runner: supportedRunner(), noGates: false });
    expect(res.status).toBe('supported');
    expect(res.pendingCheckpoint).toBeUndefined();
    expect(state.multiCalls).toBeGreaterThanOrEqual(1); // multi tried (+retries)
    expect(state.singleCalls).toBe(1); // then degraded to single-block
    const led = readLedger(cwd, res.threadId).filter((h: any) => h.iteration === 1);
    expect(led.length).toBe(1);
    expect(led[0].statement).toBe('SINGLE');
  });

  it('SINGLE-CANDIDATE DIRECT-APPEND: exactly 1 candidate ⇒ appended, no pointless pause', async () => {
    const cwd = tmp();
    writeSelConfig(cwd, { hypothesis_candidates: 1 });
    const { spawn, state } = makeSelSpawn(ONE);
    const res = await runResearch(cwd, 'Only one', { spawn, runner: supportedRunner(), noGates: false });
    expect(res.status).toBe('supported');
    expect(res.pendingCheckpoint).toBeUndefined();
    expect(state.multiCalls).toBe(1);
    expect(state.singleCalls).toBe(0); // the 1 candidate is used directly
    const led = readLedger(cwd, res.threadId).filter((h: any) => h.iteration === 1);
    expect(led.length).toBe(1);
    expect(led[0].statement).toBe('SOLO');
  });

  it('SKIP PATH (SC4a): seeded synthesis hypothesis ⇒ adopted, NO selection checkpoint', async () => {
    const cwd = tmp();
    writeSelConfig(cwd);
    const t = createThread(cwd, 'Seeded Q', {});
    appendHypothesis(cwd, t.id, { id: 'h1', iteration: t.iteration, statement: 'SEEDED', rationale: 'r', predictedOutcome: 'p', status: 'testing', parentId: null, verdict: null, origin: 'synthesis' });
    t.currentStation = 'seed'; t.status = 'active'; t.pendingGate = null; saveThread(cwd, t);
    const { spawn, state } = makeSelSpawn(THREE);
    const res = await resumeResearch(cwd, t.id, { spawn, runner: supportedRunner(), noGates: false });
    expect(res.pendingCheckpoint?.point).not.toBe('hypothesize');
    expect(state.multiCalls).toBe(0); // no cold multi spawn
    const led = readLedger(cwd, t.id).filter((h: any) => h.iteration === 1);
    expect(led.length).toBe(1);
    expect(led[0].statement).toBe('SEEDED');
  });

  it('SKIP PATH (SC4b): execute-gate resume (plan on disk) ⇒ reuse, NO selection checkpoint', async () => {
    const cwd = tmp();
    writeSelConfig(cwd);
    const t = createThread(cwd, 'Execute resume Q', {});
    appendHypothesis(cwd, t.id, { id: 'h1', iteration: t.iteration, statement: 'REVIEWED', rationale: 'r', predictedOutcome: 'p', status: 'testing', parentId: null, verdict: null });
    const iterDir = path.join(threadDirOf(cwd, t.id), 'experiments', '1');
    fs.mkdirSync(iterDir, { recursive: true });
    fs.writeFileSync(path.join(iterDir, 'plan.json'), JSON.stringify({ procedure: 'p', metricKey: 'accuracy', comparator: '>=', target: 0.8, language: 'shell', scriptPath: 'experiments/1/run.sh' }));
    t.currentStation = 'run'; t.status = 'paused'; t.pendingGate = 'execute'; saveThread(cwd, t);
    const { spawn, state } = makeSelSpawn(THREE);
    const res = await resumeResearch(cwd, t.id, { spawn, runner: supportedRunner(), noGates: false });
    expect(res.pendingCheckpoint?.point).not.toBe('hypothesize');
    expect(state.multiCalls).toBe(0);
    const led = readLedger(cwd, t.id).filter((h: any) => h.iteration === 1);
    expect(led.length).toBe(1);
    expect(led[0].statement).toBe('REVIEWED');
  });

  it('SKIP PATH (SC4c): crash-recovery (testing hyp, no plan) ⇒ reuse, NO selection checkpoint', async () => {
    const cwd = tmp();
    writeSelConfig(cwd);
    const t = createThread(cwd, 'Crash Q', {});
    appendHypothesis(cwd, t.id, { id: 'h1', iteration: t.iteration, statement: 'CRASHED', rationale: 'r', predictedOutcome: 'p', status: 'testing', parentId: null, verdict: null });
    t.currentStation = 'design'; t.status = 'active'; saveThread(cwd, t);
    const { spawn, state } = makeSelSpawn(THREE);
    const res = await resumeResearch(cwd, t.id, { spawn, runner: supportedRunner(), noGates: false });
    expect(res.pendingCheckpoint?.point).not.toBe('hypothesize');
    expect(state.multiCalls).toBe(0);
    const led = readLedger(cwd, t.id).filter((h: any) => h.iteration === 1);
    expect(led.length).toBe(1);
    expect(led[0].statement).toBe('CRASHED');
  });

  it('NO DOUBLE-ASK: a matched resume advances once and does not re-pause on the same checkpoint', async () => {
    const cwd = tmp();
    writeSelConfig(cwd);
    const first = await runResearch(cwd, 'Once only', { spawn: makeSelSpawn(THREE).spawn, runner: supportedRunner(), noGates: false });
    const res = await resumeResearch(cwd, first.threadId, {
      spawn: makeSelSpawn(THREE).spawn, runner: supportedRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'C1' } },
    });
    expect(res.paused).toBeFalsy();
    const log = readCheckpointLog(threadDirOf(cwd, first.threadId));
    // exactly one selection resolve — the resume did not re-emit/re-consume.
    expect(log.filter((c: any) => c.point === 'hypothesize').length).toBe(1);
  });
});

// ── AI-panel fallback: fallback:'panel' resolves checkpoints inline, no pause (Phase 105-02) ──
describe('AI-panel fallback (fallback:"panel") — REQ-208', () => {
  const { loadThread } = require('../../../lib/research/thread');
  const { readCheckpointLog } = require('../../../lib/research/checkpoints');
  const { getCounters, resetCounters } = require('../../../lib/metrics');

  function threadDirOf(cwd: string, id: string): string {
    return path.join(cwd, '.planning/research/threads', id);
  }

  // Unattended posture: autonomous_mode:true forces resolveInteractive INACTIVE (no human pause);
  // fallback:'panel' routes the still-enabled checkpoint points through answerViaDiscussion inline.
  // Classic execute/kg_write gates off so ONLY the interactive stations under test can act.
  function writePanelConfig(cwd: string, interactiveExtra: Record<string, unknown> = {}): void {
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      autonomous_mode: true,
      research_gates: {
        experiment_execution: false,
        kg_write: false,
        interactive: {
          enabled: true, fallback: 'panel',
          seed: false, hypothesize: false, design: false, decide: false,
          ...interactiveExtra,
        },
      },
    }));
  }

  // A panel stub mirroring answerViaDiscussion's contract: one CheckpointAnswer per question.
  // `pick(ck)` returns [{questionId,label,answeredBy}] — answeredBy:'panel' for a real decision.
  function makePanel(pick: (ck: any) => any[]) {
    const state = { calls: 0, points: [] as string[] };
    const fn = (_cwd: string, ck: any) => { state.calls++; state.points.push(ck.point); return pick(ck); };
    return { fn, state };
  }

  // Multi-station spawn: clarifier (seed), single/multi hypothesizer, experiment-runner, miner.
  function makePanelSpawn(opts: { clarify?: string; multi?: string } = {}) {
    const state = { clarifyCalls: 0, hypoCalls: 0, planCalls: 0 };
    const spawn = async (prompt: string, agentType: string): Promise<string> => {
      if (agentType === 'grd-hypothesizer') {
        if (prompt.includes('__CLARIFY__')) {
          state.clarifyCalls++;
          return opts.clarify ?? '__CLARIFY__ {"dimensions":[{"ask":"What is measured?","options":['
            + '{"label":"accuracy","description":"top-1","recommended":true},{"label":"f1","description":"macro"}]}]}';
        }
        if (prompt.includes('__HYPOTHESES__')) {
          state.hypoCalls++;
          return opts.multi ?? '__HYPOTHESES__ {"candidates":['
            + '{"statement":"C1","rationale":"r1","predictedOutcome":"p1"},'
            + '{"statement":"C2","rationale":"r2","predictedOutcome":"p2"}]}';
        }
        state.hypoCalls++;
        return '__HYPOTHESIS__ {"statement":"SINGLE","rationale":"r","predictedOutcome":"p"}';
      }
      if (agentType === 'grd-experiment-runner') {
        state.planCalls++;
        return '__PLAN__ {"procedure":"p","metricKey":"accuracy","comparator":">=","target":0.8,"language":"shell","scriptPath":"experiments/x/run.sh"}';
      }
      if (agentType === 'grd-knowledge-miner') {
        return '__TAKEAWAY__ {"kind":"success_pattern","content":"c","confidence":0.8,"evidence":"e","failureClass":"none"}';
      }
      return '';
    };
    return { spawn, state };
  }

  const supportedRunner = { run: () => ({ metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };
  const refutingRunner = { run: () => ({ metrics: { accuracy: 0.5 }, exitCode: 0, runner: 'subprocess', durationMs: 1, stdoutExcerpt: '', failureClass: 'none' }) };

  it('DESIGN + fallback:panel autonomous ⇒ resolves inline via the panel, NEVER pauses', async () => {
    const cwd = tmp();
    writePanelConfig(cwd, { design: true });
    const panel = makePanel((ck) => [{ questionId: 'q1', label: 'Approve & run', answeredBy: 'panel' }].concat(
      (ck.questions || []).filter((q: any) => q.id !== 'q1').map((q: any) => ({ questionId: q.id, label: q.options[0].label, answeredBy: 'panel' })),
    ));
    const { spawn } = makePanelSpawn();
    const res = await runResearch(cwd, 'Approve autonomously?', {
      spawn, runner: supportedRunner, noGates: false,
      answerViaDiscussion: panel.fn,
    });
    // No pause: the checkpoint resolved inline and the loop drove to a terminal verdict.
    expect(res.status).not.toBe('paused');
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('supported');
    expect(res.pendingCheckpoint).toBeUndefined();
    // The panel WAS consulted for the design checkpoint, and the resolve was logged (audit trail).
    expect(panel.state.calls).toBe(1);
    expect(panel.state.points).toEqual(['design']);
    const log = readCheckpointLog(threadDirOf(cwd, res.threadId));
    expect(log.filter((c: any) => c.point === 'design').length).toBe(1);
    // Ledger holds the single hypothesis (approve reused the persisted plan — no re-derive/duplicate).
    expect(readLedger(cwd, res.threadId).filter((h: any) => h.iteration === 1).length).toBe(1);
  });

  it('DESIGN + fallback:panel ABORT ⇒ thread abandoned inline, no pause', async () => {
    const cwd = tmp();
    writePanelConfig(cwd, { design: true });
    const panel = makePanel((ck) => (ck.questions || []).map((q: any, i: number) => ({
      questionId: q.id, label: i === 0 ? 'Abort this thread' : q.options[0].label, answeredBy: 'panel',
    })));
    const { spawn } = makePanelSpawn();
    const res = await runResearch(cwd, 'Abort autonomously?', {
      spawn, runner: supportedRunner, noGates: false, answerViaDiscussion: panel.fn,
    });
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('abandoned');
    expect(loadThread(cwd, res.threadId).status).toBe('abandoned');
  });

  it('SEED + fallback:panel autonomous ⇒ folds the PANEL-chosen answer into refinedQuestion, no pause', async () => {
    const cwd = tmp();
    writePanelConfig(cwd, { seed: true });
    // The panel picks 'f1' — the NON-recommended option — so a match proves the panel answer (not
    // the recommended default 'accuracy') flowed into refinedQuestion.
    const panel = makePanel(() => [{ questionId: 'q1', label: 'f1', answeredBy: 'panel' }]);
    const { spawn, state } = makePanelSpawn();
    const res = await runResearch(cwd, 'Does batching help throughput?', {
      spawn, runner: supportedRunner, noGates: false, answerViaDiscussion: panel.fn,
    });
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('supported');
    expect(state.clarifyCalls).toBe(1); // exactly one clarifier spawn, then inline resolve
    expect(panel.state.points).toEqual(['seed']);
    const t = loadThread(cwd, res.threadId);
    expect(t.question).toBe('Does batching help throughput?'); // verbatim, never mutated
    expect(t.refinedQuestion).toContain('f1');
  });

  it('HYPOTHESIZE selection + fallback:panel autonomous ⇒ appends ONLY the panel-chosen candidate, no pause', async () => {
    const cwd = tmp();
    writePanelConfig(cwd, { hypothesize: true });
    const panel = makePanel(() => [{ questionId: 'q1', label: 'C2', answeredBy: 'panel' }]);
    const { spawn, state } = makePanelSpawn();
    const res = await runResearch(cwd, 'Which lever helps?', {
      spawn, runner: supportedRunner, noGates: false, answerViaDiscussion: panel.fn,
    });
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('supported');
    expect(state.hypoCalls).toBe(1); // one multi-candidate spawn, no extra single-block spawn
    expect(panel.state.points).toEqual(['hypothesize']);
    const led = readLedger(cwd, res.threadId).filter((h: any) => h.iteration === 1);
    expect(led.length).toBe(1);
    expect(led[0].statement).toBe('C2'); // the panel-chosen candidate only
    expect(led.map((h: any) => h.statement)).not.toContain('C1');
  });

  it('DECIDE + fallback:panel STOP ⇒ finalizes inline (exhausted), no pause', async () => {
    const cwd = tmp();
    writePanelConfig(cwd, { decide: true });
    const panel = makePanel(() => [{ questionId: 'q1', label: 'Stop', answeredBy: 'panel' }]);
    const { spawn, state } = makePanelSpawn();
    const res = await runResearch(cwd, 'Continue or stop?', {
      maxIterations: 5, spawn, runner: refutingRunner, noGates: false, answerViaDiscussion: panel.fn,
    });
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('exhausted'); // Stop finalizes the would-continue point
    expect(state.hypoCalls).toBe(1); // only the first iteration ran; Stop halted before iter 2
    expect(panel.state.points).toEqual(['decide']);
  });

  it('TELEMETRY: a matched panel decision increments checkpoint_panel_answered_total', async () => {
    const cwd = tmp();
    writePanelConfig(cwd, { design: true });
    const panel = makePanel(() => [{ questionId: 'q1', label: 'Approve & run', answeredBy: 'panel' }, { questionId: 'q2', label: 'Keep as designed', answeredBy: 'panel' }]);
    resetCounters();
    await runResearch(cwd, 'Counter answered', {
      spawn: makePanelSpawn().spawn, runner: supportedRunner, noGates: false, answerViaDiscussion: panel.fn,
    });
    const c = getCounters();
    expect(c['research.checkpoint_panel_answered_total']).toBeGreaterThanOrEqual(1);
    expect(c['research.checkpoint_panel_unavailable_total'] ?? 0).toBe(0);
    // The pause counter is NEVER touched on the panel path (no human pause happened).
    expect(c['research.checkpoint_pauses_total'] ?? 0).toBe(0);
  });

  it('TELEMETRY: an unavailable/empty panel (all defaults) increments checkpoint_panel_unavailable_total', async () => {
    const cwd = tmp();
    writePanelConfig(cwd, { design: true });
    // Simulate a rate-limited/empty panel: answerViaDiscussion returns recommended defaults only.
    const panel = makePanel((ck) => (ck.questions || []).map((q: any) => ({
      questionId: q.id, label: (q.options.find((o: any) => o.recommended) || q.options[0]).label, answeredBy: 'default',
    })));
    resetCounters();
    const res = await runResearch(cwd, 'Counter unavailable', {
      spawn: makePanelSpawn().spawn, runner: supportedRunner, noGates: false, answerViaDiscussion: panel.fn,
    });
    const c = getCounters();
    expect(c['research.checkpoint_panel_unavailable_total']).toBeGreaterThanOrEqual(1);
    expect(c['research.checkpoint_panel_answered_total'] ?? 0).toBe(0);
    // Degrade-safe: recommended default ('Approve & run') still drove the loop to a verdict.
    expect(res.status).toBe('supported');
  });

  it('BYTE-IDENTICAL RECOMMENDED: fallback:recommended autonomous ⇒ answerViaDiscussion NEVER called, no checkpoints.jsonl', async () => {
    const cwd = tmp();
    // Same enabled points, but fallback:'recommended' (the default) — today's autonomous path.
    writePanelConfig(cwd, { design: true, seed: true, hypothesize: true, decide: true, fallback: 'recommended' });
    let panelCalls = 0;
    const panel = (_cwd: string, _ck: any) => { panelCalls++; return []; };
    const { spawn } = makePanelSpawn();
    const res = await runResearch(cwd, 'Recommended baseline', {
      spawn, runner: supportedRunner, noGates: false, answerViaDiscussion: panel,
    });
    expect(res.status).toBe('supported');
    expect(res.paused).toBeFalsy();
    expect(panelCalls).toBe(0); // recommended never consults the panel
    // No checkpoint resolves were logged — behavior is byte-identical to the pre-105 autonomous loop.
    expect(fs.existsSync(path.join(threadDirOf(cwd, res.threadId), 'checkpoints.jsonl'))).toBe(false);
    // A single hypothesis via the byte-identical single-block path (no selection checkpoint).
    expect(readLedger(cwd, res.threadId).filter((h: any) => h.iteration === 1)[0].statement).toBe('SINGLE');
  });

  it('PORTFOLIO/CONCURRENCY (R1): concurrency>1 forces non-human — recommended never pauses even with the checkpoint enabled', async () => {
    const cwd = tmp();
    // NOT autonomous — the ONLY thing keeping this non-human is concurrency>1 (portfolio parallel).
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      research_gates: {
        experiment_execution: false, kg_write: false,
        interactive: { enabled: true, design: true, seed: false, hypothesize: false, decide: false },
      },
    }));
    // concurrency:1 (default) WOULD pause at the design checkpoint...
    const paused = await runResearch(cwd, 'Would pause solo', {
      spawn: makePanelSpawn().spawn, runner: supportedRunner, noGates: false,
    });
    expect(paused.paused).toBe(true);
    expect(paused.pendingCheckpoint?.point).toBe('design');
    // ...but concurrency:2 (a portfolio parallel run) NEVER pauses a concurrent thread.
    const cwd2 = tmp();
    fs.writeFileSync(path.join(cwd2, '.planning/config.json'), fs.readFileSync(path.join(cwd, '.planning/config.json')));
    const concurrent = await runResearch(cwd2, 'Concurrent no pause', {
      spawn: makePanelSpawn().spawn, runner: supportedRunner, noGates: false, concurrency: 2,
    });
    expect(concurrent.paused).toBeFalsy();
    expect(concurrent.status).toBe('supported');
  });

  it('PORTFOLIO/CONCURRENCY + fallback:panel ⇒ concurrent thread routes through the panel inline (still no pause)', async () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      research_gates: {
        experiment_execution: false, kg_write: false,
        interactive: { enabled: true, fallback: 'panel', design: true, seed: false, hypothesize: false, decide: false },
      },
    }));
    const panel = makePanel(() => [{ questionId: 'q1', label: 'Approve & run', answeredBy: 'panel' }]);
    const res = await runResearch(cwd, 'Concurrent panel', {
      spawn: makePanelSpawn().spawn, runner: supportedRunner, noGates: false,
      concurrency: 2, answerViaDiscussion: panel.fn,
    });
    expect(res.paused).toBeFalsy();
    expect(res.status).toBe('supported');
    expect(panel.state.points).toEqual(['design']); // panel consulted despite concurrency
  });
});
