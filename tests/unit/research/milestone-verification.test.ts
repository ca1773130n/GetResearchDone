'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// v0.5.0 MILESTONE VERIFICATION SUITE (REQ-209) — Integration Phase (Phase 105).
//
// Individual phase VERIFICATION.md files each proved their own slice (101 plumbing,
// 102 DESIGN pin, 103 SEED/DECIDE, 104 HYPOTHESIZE, 105-01/02 panel fallback). This
// suite proves the SEAMS between them — the four cross-phase proof obligations from
// ROADMAP Phase 105 SC4 — in one offline, deterministic file with an injected
// checkpointHandler/spawn/runner (no live backend, no coverage threshold lowered):
//
//   R1  No unattended entry point (bench / portfolio / harness / autopilot / cli-kb)
//       can reach a pausing checkpoint — resolveInteractive → active:false; and the
//       panel fallback resolves inline (answerViaDiscussion never pauses/throws).
//   R3  A pre-0.5.0 (0.4.16) thread.json with no checkpoint fields resumes
//       bit-identically — back-compat preserved, no checkpoint field pollution.
//   R4  A DESIGN checkpoint contract edit applied by the human/panel is the COMMITTED
//       debug-loop pin — never re-overwritten by the model's original contract.
//   R5  After a checkpoint is answered and the loop resumes, the same question is NOT
//       re-emitted on debug re-plan or resume (consumeAnswered one-shot holds).
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const os = require('os');
const path = require('path');

import type { Checkpoint, CheckpointAnswer } from '../../../lib/research/types';

const { runResearch, resumeResearch } = require('../../../lib/research/orchestrator');
const {
  resolveInteractive,
  readInteractiveConfig,
  consumeAnswered,
  answerViaDiscussion,
  readCheckpointLog,
} = require('../../../lib/research/checkpoints') as typeof import('../../../lib/research/checkpoints');
const { loadThread } = require('../../../lib/research/thread') as {
  loadThread: (cwd: string, id: string) => Record<string, unknown>;
};
const { readLedger } = require('../../../lib/research/ledger');

function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-milestone-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

function threadDirOf(cwd: string, id: string): string {
  return path.join(cwd, '.planning/research/threads', id);
}

// Interactive gate config ON (design station) — proves the R1 unattended lock overrides
// even an explicitly-enabled gate, and drives the R4/R5 DESIGN checkpoint end-to-end.
function writeInteractiveConfig(cwd: string, extra: Record<string, unknown> = {}): void {
  fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
    research_gates: {
      experiment_execution: false,
      kg_write: false,
      interactive: { enabled: true, design: true, decide: false, max_rounds: 2 },
    },
    ...extra,
  }));
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

// ── R1: no unattended entry point can pause ──────────────────────────────────
describe('R1: no unattended caller can reach a pausing checkpoint (REQ-209)', () => {
  it('every enumerated unattended entry point resolves active:false even with the gate config ON', () => {
    const cwd = tmp();
    // Gate says interactive steering is ON…
    fs.writeFileSync(path.join(cwd, '.planning/config.json'),
      JSON.stringify({ research_gates: { interactive: { enabled: true } } }));
    const cfg = readInteractiveConfig(cwd);
    expect(cfg.enabled).toBe(true);

    // …yet each unattended caller's posture forces steering inactive (no pause path exists).
    // The 5 declared unattended sites (Phase 101 caller-audit: bench, portfolio, harness,
    // autopilot/GRD_AUTOPILOT, cli-kb) each map to one of these postures.
    const sites: Array<[string, Parameters<typeof resolveInteractive>[1]]> = [
      ['bench.ts (--no-gates sweep)', { noGates: true }],
      ['portfolio.ts (parallel threads)', { concurrency: 2 }],
      ['harness path (autonomousMode)', { autonomousMode: true }],
      ['autopilot / GRD_AUTOPILOT env', { env: { GRD_AUTOPILOT: '1' } }],
      ['cli-kb.ts (seed resume, nonInteractive)', { nonInteractive: true }],
    ];
    for (const [label, opts] of sites) {
      expect([label, resolveInteractive(cfg, opts).active]).toEqual([label, false]);
    }
    // Only the attended, single-thread, gate-on path stays active — the sole pausing route.
    expect(resolveInteractive(cfg, {}).active).toBe(true);
  });

  it('the panel fallback variant is also non-pausing: unattended posture stays inactive AND answerViaDiscussion resolves inline', () => {
    const cwd = tmp();
    // fallback:'panel' (105-02): an unattended site routes the checkpoint through the AI panel
    // INLINE — resolveInteractive is still inactive (no human pause), the panel just answers.
    fs.writeFileSync(path.join(cwd, '.planning/config.json'),
      JSON.stringify({ research_gates: { interactive: { enabled: true, fallback: 'panel' } } }));
    const cfg = readInteractiveConfig(cwd);
    expect(cfg.fallback).toBe('panel');
    // Portfolio concurrency>1 is the canonical unattended-yet-panel-routable posture (R1).
    expect(resolveInteractive(cfg, { concurrency: 2 }).active).toBe(false);

    // answerViaDiscussion NEVER pauses/throws: an empty-synthesis panel (all panelists
    // unavailable) degrades to recommended defaults — inline, deterministic, no pause.
    const ck: Checkpoint = {
      checkpoint_version: 1,
      id: 'ck-1-design-r1',
      point: 'design',
      type: 'approval',
      iteration: 1,
      round: 1,
      createdAt: '2026-07-19T00:00:00.000Z',
      questions: [{
        id: 'q1',
        ask: 'Approve & run?',
        options: [
          { label: 'Approve & run', description: 'proceed', recommended: true },
          { label: 'Revise', description: 'go back' },
        ],
      }],
    };
    const answers = answerViaDiscussion(cwd, ck, {}, { resolveElicitation: () => '' });
    expect(answers).toHaveLength(1);
    expect(answers[0].answeredBy).toBe('default');
    expect(answers[0].label).toBe('Approve & run'); // the recommended option
  });
});

// ── R3: pre-0.5.0 back-compat ────────────────────────────────────────────────
describe('R3: a pre-0.5.0 (0.4.16) thread resumes bit-identically (back-compat)', () => {
  const FIXTURES = path.join(__dirname, '../../fixtures/research-threads');

  function plantFixture(cwd: string, name: string): { raw: string; id: string; dir: string } {
    const raw = fs.readFileSync(path.join(FIXTURES, name, 'thread.json'), 'utf8');
    const src = JSON.parse(raw);
    const dir = threadDirOf(cwd, src.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(FIXTURES, name, 'thread.json'), path.join(dir, 'thread.json'));
    return { raw, id: src.id, dir };
  }

  it('a frozen 0.4.16 thread carries NO checkpoint fields and round-trips through loadThread unchanged', () => {
    const cwd = tmp();
    const { raw, id } = plantFixture(cwd, 'paused-execute-0416');
    const parsed = JSON.parse(raw);
    // No v0.5.0 checkpoint field pollutes a pre-0.5.0 thread.
    expect('pendingCheckpoint' in parsed).toBe(false);
    expect('checkpointRounds' in parsed).toBe(false);
    // loadThread does not inject checkpoint fields into a legacy thread.
    const loaded = loadThread(cwd, id);
    expect('pendingCheckpoint' in loaded).toBe(false);
    expect('checkpointRounds' in loaded).toBe(false);
    // Bit-identical round-trip: the loaded thread re-serializes to the same key/value set.
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(parsed));
  });

  it('resuming a terminal 0.4.16 thread short-circuits: byte-identical thread.json on disk, no checkpoints.jsonl', async () => {
    const cwd = tmp();
    const { dir, id } = plantFixture(cwd, 'terminal-supported-0416');
    const before = fs.readFileSync(path.join(dir, 'thread.json'), 'utf8');
    const res = await resumeResearch(cwd, id, { spawn: makeSpawn(), runner: makeRunner() });
    expect(res.status).toBe('supported');
    // TERMINAL short-circuit never re-saves the thread → byte-identical on disk.
    expect(fs.readFileSync(path.join(dir, 'thread.json'), 'utf8')).toBe(before);
    // The v0.5.0 checkpoint branch is never entered for a legacy thread.
    expect(fs.existsSync(path.join(dir, 'checkpoints.jsonl'))).toBe(false);
    expect(res.pendingCheckpoint).toBeUndefined();
  });
});

// ── R4: DESIGN contract edit survives the debug-loop pin ─────────────────────
describe('R4: a human/panel DESIGN contract edit is the committed pin (survives debug re-plan)', () => {
  it('the checkpoint freeform edit (target 0.8 → 0.9) is pinned; a drifting debug re-plan is overwritten back to the edit', async () => {
    const cwd = tmp();
    writeInteractiveConfig(cwd, { research_max_debug_depth: 1 });
    const first = await runResearch(cwd, 'Edit the contract?', {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
    });
    expect(first.pendingCheckpoint?.point).toBe('design');

    // Force a debug retry: the runner fails once, then succeeds reporting the EDITED target
    // back as the metric — proving MEASURE judges the user-edited contract, not the model's.
    let calls = 0;
    const flakyRunner = {
      run(plan: { target: number }) {
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
    // The committed plan.json carries the USER-edited contract, not the model's original 0.8.
    const plan = JSON.parse(fs.readFileSync(path.join(dir, 'experiments/1/plan.json'), 'utf8'));
    expect(plan.target).toBe(0.9);
    // The debug fix-spawn's mock plan reports 0.8 (the model original) — the pin overwrites it
    // back to the user-edited 0.9, RECORDING the drift (never reverting the user's edit).
    const attempt = JSON.parse(fs.readFileSync(path.join(dir, 'experiments/1/debug-attempt-1.json'), 'utf8'));
    expect(attempt.contractDrift?.target?.pinned).toBe(0.9);
    expect(attempt.contractDrift?.target?.proposed).toBe(0.8);
  });
});

// ── R5: no double-ask on re-plan / resume ────────────────────────────────────
describe('R5: an answered checkpoint is never re-emitted (consumeAnswered one-shot)', () => {
  it('consumeAnswered returns the answers exactly once, then null (WeakSet one-shot, matched point+iteration)', () => {
    const answers: CheckpointAnswer[] = [{ questionId: 'q1', label: 'Approve & run', answeredBy: 'human' }];
    const resumed: Checkpoint = {
      checkpoint_version: 1,
      id: 'ck-1-design-r1',
      point: 'design',
      type: 'approval',
      iteration: 1,
      round: 1,
      createdAt: '2026-07-19T00:00:00.000Z',
      questions: [{ id: 'q1', ask: 'Approve & run?', options: [{ label: 'Approve & run', description: 'proceed', recommended: true }] }],
      answers,
    };
    // First read at the matching station consumes the answers.
    expect(consumeAnswered(resumed, 'design', 1)).toEqual(answers);
    // Second read (debug re-plan or resume revisiting the same station) returns null — no re-ask.
    expect(consumeAnswered(resumed, 'design', 1)).toBeNull();
    // A mismatched point/iteration never mis-fires the wrong station's answers.
    const fresh: Checkpoint = { ...resumed };
    delete (fresh as { answers?: unknown }).answers;
    expect(consumeAnswered(fresh, 'design', 2)).toBeNull();
  });

  it('end-to-end: an approve resume RUNs without emitting a second design checkpoint — only the round-1 resolve is logged', async () => {
    const cwd = tmp();
    writeInteractiveConfig(cwd);
    const first = await runResearch(cwd, 'No double ask?', {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
    });
    expect(first.pendingCheckpoint?.point).toBe('design');

    const res = await resumeResearch(cwd, first.threadId, {
      spawn: makeSpawn(), runner: makeRunner(), noGates: false,
      checkpointAnswers: { q1: { label: 'Approve & run' } },
    });
    // The loop ran to a verdict without re-pausing for the same question.
    expect(res.pendingCheckpoint).toBeUndefined();
    expect(['supported', 'refuted', 'exhausted', 'inconclusive']).toContain(res.status);
    // checkpoints.jsonl holds ONLY the original round-1 resolve — no duplicate re-ask.
    const log = readCheckpointLog(threadDirOf(cwd, first.threadId));
    expect(log.length).toBe(1);
    expect(log[0].point).toBe('design');
    expect(log[0].round).toBe(1);
    expect(readLedger(cwd, first.threadId).length).toBeGreaterThanOrEqual(1);
  });
});

// ── Coverage guard: no per-file jest threshold lowered by this milestone ──────
describe('coverage guard: no per-file jest threshold is lowered by the v0.5.0 milestone', () => {
  // Snapshot of the per-file thresholds this milestone touches, captured at 105-03. The suite
  // FAILS if any is lowered below these baselines (git diff jest.config.js is the supporting
  // evidence recorded in the SUMMARY). These files own the checkpoint machinery under test.
  const BASELINE: Record<string, { lines: number; functions: number; branches: number }> = {
    './lib/research/checkpoints.ts': { lines: 90, functions: 100, branches: 80 },
    './lib/research/portfolio.ts': { lines: 90, functions: 90, branches: 60 },
    './lib/discussion.ts': { lines: 85, functions: 100, branches: 85 },
  };

  it('checkpoints.ts / portfolio.ts / discussion.ts thresholds are >= their pre-milestone baselines', () => {
    const cfg = require('../../../jest.config.js') as {
      coverageThreshold: Record<string, { lines: number; functions: number; branches: number }>;
    };
    for (const [file, base] of Object.entries(BASELINE)) {
      const actual = cfg.coverageThreshold[file];
      expect([file, actual]).toEqual([file, expect.anything()]);
      expect(actual.lines).toBeGreaterThanOrEqual(base.lines);
      expect(actual.functions).toBeGreaterThanOrEqual(base.functions);
      expect(actual.branches).toBeGreaterThanOrEqual(base.branches);
    }
  });
});
