'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Checkpoint, ResearchThread } from '../../../lib/research/types';

const {
  emitCheckpoint,
  resolveCheckpoint,
  consumeAnswered,
  appendCheckpointRecord,
  readCheckpointLog,
  readInteractiveConfig,
  resolveInteractive,
  validateCheckpoint,
  makeCheckpointId,
  answerViaDiscussion,
} = require('../../../lib/research/checkpoints') as typeof import('../../../lib/research/checkpoints');

const { threadDir } = require('../../../lib/research/thread') as {
  threadDir: (cwd: string, id: string) => string;
};

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-ckpt-'));
}

function makeThread(overrides: Partial<ResearchThread> = {}): ResearchThread {
  return {
    id: 'proceed-abc123',
    question: 'q',
    status: 'active',
    iteration: 1,
    maxIterations: 5,
    gates: { execute: true, kg_write: true },
    budgetUsed: 0,
    modelProfile: 'balanced',
    tokenProfile: 'default',
    currentStation: 'design',
    pendingGate: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeCk(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    checkpoint_version: 1,
    id: 'ck-1-design-r0',
    point: 'design',
    type: 'approval',
    iteration: 1,
    round: 0,
    createdAt: new Date().toISOString(),
    questions: [
      {
        id: 'q1',
        ask: 'Proceed with the design?',
        options: [
          { label: 'Yes', description: 'proceed', recommended: true },
          { label: 'No', description: 'stop' },
        ],
      },
    ],
    ...overrides,
  };
}

describe('checkpoints — emit + default pause handler', () => {
  test('valid checkpoint pauses the thread via the default handler and persists', () => {
    const cwd = mkTmp();
    const thread = makeThread();
    const ck = makeCk();
    const inc = jest.fn();
    const out = emitCheckpoint(cwd, thread, ck, { incrementCounter: inc });

    expect(thread.pendingCheckpoint).toBe(ck);
    expect(thread.status).toBe('paused');
    expect(out).toBe(ck);
    expect(inc).toHaveBeenCalledWith('research.checkpoint_pauses_total');

    const onDisk = JSON.parse(
      fs.readFileSync(path.join(threadDir(cwd, thread.id), 'thread.json'), 'utf8'),
    ) as ResearchThread;
    expect(onDisk.pendingCheckpoint?.id).toBe('ck-1-design-r0');
    expect(onDisk.status).toBe('paused');
  });

  test('injected checkpointHandler is used instead of the default pause', () => {
    const cwd = mkTmp();
    const thread = makeThread();
    const ck = makeCk();
    const handler = jest.fn(() => ck);
    const out = emitCheckpoint(cwd, thread, ck, { checkpointHandler: handler });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(out).toBe(ck);
    // handler did not pause
    expect(thread.status).toBe('active');
    expect(thread.pendingCheckpoint).toBeUndefined();
  });
});

describe('checkpoints — emit-time validation', () => {
  test('5 questions → one warning, resolves to defaults, does not pause or throw', () => {
    const cwd = mkTmp();
    const thread = makeThread();
    const q = makeCk().questions[0];
    const ck = makeCk({ questions: [q, q, q, q, q] });
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const out = emitCheckpoint(cwd, thread, ck);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(thread.status).toBe('active');
    expect(thread.pendingCheckpoint).toBeUndefined();
    expect(out.resolvedAt).toBeTruthy();
    expect(out.answers?.[0].answeredBy).toBe('default');
    spy.mockRestore();
  });

  test('a question with zero recommended options is invalid', () => {
    const ck = makeCk({
      questions: [
        { id: 'q1', ask: 'x', options: [{ label: 'A', description: 'a' }, { label: 'B', description: 'b' }] },
      ],
    });
    expect(validateCheckpoint(ck).ok).toBe(false);
  });

  test('a question with two recommended options is invalid', () => {
    const ck = makeCk({
      questions: [
        {
          id: 'q1',
          ask: 'x',
          options: [
            { label: 'A', description: 'a', recommended: true },
            { label: 'B', description: 'b', recommended: true },
          ],
        },
      ],
    });
    expect(validateCheckpoint(ck).ok).toBe(false);
  });

  test('valid checkpoint passes validation', () => {
    expect(validateCheckpoint(makeCk()).ok).toBe(true);
  });

  test('a checkpoint with zero questions is invalid', () => {
    expect(validateCheckpoint(makeCk({ questions: [] })).ok).toBe(false);
  });

  test('makeCheckpointId builds the canonical ck-<iter>-<point>-r<round> id', () => {
    expect(makeCheckpointId(2, 'hypothesize', 1)).toBe('ck-2-hypothesize-r1');
  });
});

describe('checkpoints — checkpoints.jsonl append-only IO', () => {
  test('append then read returns records in append order', () => {
    const dir = mkTmp();
    appendCheckpointRecord(dir, makeCk({ id: 'a' }));
    appendCheckpointRecord(dir, makeCk({ id: 'b' }));
    appendCheckpointRecord(dir, makeCk({ id: 'c' }));
    const log = readCheckpointLog(dir);
    expect(log.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  test('reading a missing log returns an empty array', () => {
    expect(readCheckpointLog(mkTmp())).toEqual([]);
  });
});

describe('checkpoints — consumeAnswered one-shot', () => {
  test('returns answers on point/iteration match, then null on repeat', () => {
    const ck = makeCk({
      point: 'design',
      iteration: 2,
      answers: [{ questionId: 'q1', label: 'Yes', answeredBy: 'human' }],
    });
    const first = consumeAnswered(ck, 'design', 2);
    expect(first).not.toBeNull();
    expect(first?.[0].label).toBe('Yes');
    expect(consumeAnswered(ck, 'design', 2)).toBeNull();
  });

  test('returns null on point/iteration mismatch', () => {
    const ck = makeCk({
      point: 'design',
      iteration: 2,
      answers: [{ questionId: 'q1', label: 'Yes', answeredBy: 'human' }],
    });
    expect(consumeAnswered(ck, 'design', 3)).toBeNull();
    expect(consumeAnswered(ck, 'seed', 2)).toBeNull();
  });

  test('returns null when checkpoint is null/undefined', () => {
    expect(consumeAnswered(null, 'design', 1)).toBeNull();
    expect(consumeAnswered(undefined, 'design', 1)).toBeNull();
  });
});

describe('checkpoints — resolveCheckpoint', () => {
  test('fills a missing answer with the recommended option (answeredBy default), appends jsonl, clears pending', () => {
    const cwd = mkTmp();
    const thread = makeThread({ pendingCheckpoint: makeCk() });
    const ck = makeCk();
    const resolved = resolveCheckpoint(cwd, thread, ck, []);

    expect(resolved.resolvedAt).toBeTruthy();
    expect(resolved.answers?.[0].label).toBe('Yes');
    expect(resolved.answers?.[0].answeredBy).toBe('default');
    expect(thread.pendingCheckpoint).toBeNull();

    const log = readCheckpointLog(threadDir(cwd, thread.id));
    expect(log).toHaveLength(1);
    expect(log[0].answers?.[0].label).toBe('Yes');
  });

  test('keeps a provided human answer over the recommended default', () => {
    const cwd = mkTmp();
    const thread = makeThread();
    const ck = makeCk();
    const resolved = resolveCheckpoint(cwd, thread, ck, [
      { questionId: 'q1', label: 'No', answeredBy: 'human' },
    ]);
    expect(resolved.answers?.[0].label).toBe('No');
    expect(resolved.answers?.[0].answeredBy).toBe('human');
  });
});

describe('readInteractiveConfig — defaults + clamp/warn matrix', () => {
  function writeCfg(cwd: string, interactive: unknown): void {
    fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.planning/config.json'),
      JSON.stringify({ research_gates: { interactive } }),
    );
  }

  test('absent research_gates.interactive → full defaults, enabled false', () => {
    const cwd = mkTmp();
    fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({}));
    const cfg = readInteractiveConfig(cwd);
    expect(cfg).toEqual({
      enabled: false,
      seed: true,
      hypothesize: true,
      design: true,
      decide: true,
      max_rounds: 2,
      max_questions: 4,
      hypothesis_candidates: 3,
      every_iteration: false,
      fallback: 'recommended',
    });
  });

  test('missing config file → defaults', () => {
    expect(readInteractiveConfig(mkTmp()).enabled).toBe(false);
  });

  test('hypothesis_candidates 9 clamps to 5 with one warning', () => {
    const cwd = mkTmp();
    writeCfg(cwd, { enabled: true, hypothesis_candidates: 9 });
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readInteractiveConfig(cwd).hypothesis_candidates).toBe(5);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toMatch(/hypothesis_candidates/);
    spy.mockRestore();
  });

  test('hypothesis_candidates 0 clamps to 1 with warning', () => {
    const cwd = mkTmp();
    writeCfg(cwd, { hypothesis_candidates: 0 });
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readInteractiveConfig(cwd).hypothesis_candidates).toBe(1);
    spy.mockRestore();
  });

  test('max_rounds 0 → default 2 with warning', () => {
    const cwd = mkTmp();
    writeCfg(cwd, { max_rounds: 0 });
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readInteractiveConfig(cwd).max_rounds).toBe(2);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('fallback bogus → recommended with warning', () => {
    const cwd = mkTmp();
    writeCfg(cwd, { fallback: 'bogus' });
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readInteractiveConfig(cwd).fallback).toBe('recommended');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('fallback panel is honored', () => {
    const cwd = mkTmp();
    writeCfg(cwd, { fallback: 'panel' });
    expect(readInteractiveConfig(cwd).fallback).toBe('panel');
  });

  test('max_questions non-number → 4 with warning', () => {
    const cwd = mkTmp();
    writeCfg(cwd, { max_questions: 'lots' });
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readInteractiveConfig(cwd).max_questions).toBe(4);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('wrong-typed boolean field → default with warning', () => {
    const cwd = mkTmp();
    writeCfg(cwd, { design: 'yes' });
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readInteractiveConfig(cwd).design).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('valid full config passes through untouched (no warnings)', () => {
    const cwd = mkTmp();
    writeCfg(cwd, {
      enabled: true, seed: false, hypothesize: false, design: true, decide: true,
      max_rounds: 3, max_questions: 2, hypothesis_candidates: 4,
      every_iteration: true, fallback: 'panel',
    });
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg = readInteractiveConfig(cwd);
    expect(spy).not.toHaveBeenCalled();
    expect(cfg.enabled).toBe(true);
    expect(cfg.seed).toBe(false);
    expect(cfg.max_rounds).toBe(3);
    expect(cfg.every_iteration).toBe(true);
    spy.mockRestore();
  });
});

describe('resolveInteractive — auto-skip matrix', () => {
  const enabled = { enabled: true } as ReturnType<typeof readInteractiveConfig>;

  test('active mirrors cfg.enabled when unattended flags are all absent', () => {
    expect(resolveInteractive(enabled, { env: {} })).toEqual({ active: true });
    expect(resolveInteractive({ enabled: false } as typeof enabled, { env: {} })).toEqual({ active: false });
  });

  test('disabled under opts.noGates', () => {
    expect(resolveInteractive(enabled, { noGates: true, env: {} })).toEqual({ active: false });
  });

  test('disabled under autonomousMode', () => {
    expect(resolveInteractive(enabled, { autonomousMode: true, env: {} })).toEqual({ active: false });
  });

  test('disabled under opts.autopilot with no env', () => {
    expect(resolveInteractive(enabled, { autopilot: true, env: {} })).toEqual({ active: false });
  });

  test('disabled under GRD_AUTOPILOT env with autopilot absent', () => {
    expect(resolveInteractive(enabled, { env: { GRD_AUTOPILOT: '1' } })).toEqual({ active: false });
  });

  test('disabled under portfolio concurrency > 1', () => {
    expect(resolveInteractive(enabled, { concurrency: 2, env: {} })).toEqual({ active: false });
  });

  test('disabled under nonInteractive spawn', () => {
    expect(resolveInteractive(enabled, { nonInteractive: true, env: {} })).toEqual({ active: false });
  });
});

// ── answerViaDiscussion — degrade-safe AI-panel fallback (REQ-207) ───────────

/** A checkpoint with a single decision question whose options carry distinct labels. */
function makePanelCk(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return makeCk({
    point: 'decide',
    type: 'branch',
    context: 'The last iteration was inconclusive; the metric plateaued.',
    questions: [
      {
        id: 'q1',
        ask: 'How should the loop proceed?',
        options: [
          { label: 'Continue — revise hypothesis', description: 'keep going with a new angle', recommended: true },
          { label: 'Stop — finalize', description: 'end the thread' },
        ],
      },
    ],
    ...overrides,
  });
}

describe('answerViaDiscussion — Task 1: panel answer → CheckpointAnswer[]', () => {
  test('happy path: a matched panel label produces answeredBy:panel, one answer per question', () => {
    const ck = makePanelCk();
    const resolveElicitation = jest.fn(() => 'Continue — revise hypothesis');
    const answers = answerViaDiscussion('/tmp/x', ck, {}, { resolveElicitation });

    expect(answers).toHaveLength(1);
    expect(answers[0].questionId).toBe('q1');
    expect(answers[0].label).toBe('Continue — revise hypothesis');
    expect(answers[0].answeredBy).toBe('panel');
    expect(resolveElicitation).toHaveBeenCalledTimes(1);
  });

  test('loop spawn backend is excluded from panel participants', () => {
    const ck = makePanelCk();
    let seenParticipants: string[] = [];
    const resolveElicitation = jest.fn((_q: string, _c: string, opts: { participants: string[] }) => {
      seenParticipants = opts.participants;
      return 'Continue — revise hypothesis';
    });
    answerViaDiscussion('/tmp/x', ck, { loopBackend: 'claude', participants: ['claude', 'codex', 'gemini'] }, { resolveElicitation });

    expect(seenParticipants).not.toContain('claude');
    expect(seenParticipants).toEqual(['codex', 'gemini']);
  });

  test('one CheckpointAnswer per question for a multi-question checkpoint', () => {
    const ck = makePanelCk({
      questions: [
        {
          id: 'q1', ask: 'Proceed?',
          options: [{ label: 'Yes', description: 'y', recommended: true }, { label: 'No', description: 'n' }],
        },
        {
          id: 'q2', ask: 'Bump budget?',
          options: [{ label: 'Keep', description: 'k', recommended: true }, { label: 'Raise', description: 'r' }],
        },
      ],
    });
    const resolveElicitation = jest.fn(() => 'Yes\nRaise');
    const answers = answerViaDiscussion('/tmp/x', ck, {}, { resolveElicitation });
    expect(answers.map((a) => a.questionId)).toEqual(['q1', 'q2']);
    expect(answers[0]).toMatchObject({ label: 'Yes', answeredBy: 'panel' });
    expect(answers[1]).toMatchObject({ label: 'Raise', answeredBy: 'panel' });
  });

  test('never throws: a throwing resolver degrades to recommended defaults', () => {
    const ck = makePanelCk();
    const resolveElicitation = jest.fn(() => { throw new Error('spawn exploded'); });
    const answers = answerViaDiscussion('/tmp/x', ck, {}, { resolveElicitation });
    expect(answers).toHaveLength(1);
    expect(answers[0].label).toBe('Continue — revise hypothesis');
    expect(answers[0].answeredBy).toBe('default');
  });
});

describe('answerViaDiscussion — Task 2: matching + rate-limit guard + defaults', () => {
  test('exact match sets answeredBy:panel', () => {
    const ck = makePanelCk();
    const answers = answerViaDiscussion('/tmp/x', ck, {}, {
      resolveElicitation: () => 'Stop — finalize',
    });
    expect(answers[0]).toMatchObject({ label: 'Stop — finalize', answeredBy: 'panel' });
  });

  test('prefix match sets answeredBy:panel', () => {
    const ck = makePanelCk();
    const answers = answerViaDiscussion('/tmp/x', ck, {}, {
      resolveElicitation: () => 'Continue',
    });
    expect(answers[0]).toMatchObject({ label: 'Continue — revise hypothesis', answeredBy: 'panel' });
  });

  test('no option match falls back to recommended default (answeredBy:default, NOT panel)', () => {
    const ck = makePanelCk();
    const answers = answerViaDiscussion('/tmp/x', ck, {}, {
      resolveElicitation: () => 'I have no idea what to do here honestly',
    });
    expect(answers[0]).toMatchObject({ label: 'Continue — revise hypothesis', answeredBy: 'default' });
  });

  test('empty synthesis resolves every question to recommended defaults', () => {
    const ck = makePanelCk({
      questions: [
        { id: 'q1', ask: 'a', options: [{ label: 'A', description: 'a', recommended: true }, { label: 'B', description: 'b' }] },
        { id: 'q2', ask: 'b', options: [{ label: 'C', description: 'c' }, { label: 'D', description: 'd', recommended: true }] },
      ],
    });
    const answers = answerViaDiscussion('/tmp/x', ck, {}, { resolveElicitation: () => '' });
    expect(answers).toEqual([
      { questionId: 'q1', label: 'A', answeredBy: 'default' },
      { questionId: 'q2', label: 'D', answeredBy: 'default' },
    ]);
  });

  test('a rate-limited panelist is NEVER read as an answer → recommended default', () => {
    const ck = makePanelCk();
    const answers = answerViaDiscussion('/tmp/x', ck, {}, {
      // synthesis text happens to contain an option label, but the detector flags it
      resolveElicitation: () => 'Continue — revise hypothesis',
      detectFromStdout: () => ({ rateLimited: true, unhealthy: true }),
    });
    expect(answers[0]).toMatchObject({ label: 'Continue — revise hypothesis', answeredBy: 'default' });
  });

  test('an unhealthy (logged-out) panelist → recommended default', () => {
    const ck = makePanelCk();
    const answers = answerViaDiscussion('/tmp/x', ck, {}, {
      resolveElicitation: () => 'Stop — finalize',
      detectFromStdout: () => ({ rateLimited: false, unhealthy: true }),
    });
    expect(answers[0].answeredBy).toBe('default');
  });

  test('discussionFile is recorded on the checkpoint when the panel produced a real answer', () => {
    const ck = makePanelCk();
    const answers = answerViaDiscussion('/tmp/x', ck, {}, {
      resolveElicitation: () => ({ text: 'Continue — revise hypothesis', discussionFile: '/d/elicitation-123.md' }),
    });
    expect(answers[0].answeredBy).toBe('panel');
    expect(ck.discussionFile).toBe('/d/elicitation-123.md');
  });

  test('discussionFile is NOT recorded when the panel answer degraded to a default', () => {
    const ck = makePanelCk();
    answerViaDiscussion('/tmp/x', ck, {}, {
      resolveElicitation: () => ({ text: '', discussionFile: '/d/empty.md' }),
    });
    expect(ck.discussionFile).toBeUndefined();
  });
});
