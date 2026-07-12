'use strict';
import type { Checkpoint, InteractiveConfig, ResearchThread } from '../../../lib/research/types';
const { defaultGates } = require('../../../lib/research/types');

describe('research types', () => {
  it('defaultGates returns both gates on', () => {
    expect(defaultGates()).toEqual({ execute: true, kg_write: true });
  });

  it('a fully-formed Checkpoint literal type-checks (checkpoint_version:1, one recommended option)', () => {
    const ck: Checkpoint = {
      checkpoint_version: 1,
      id: 'ck-2-design-r1',
      point: 'design',
      type: 'approval',
      iteration: 2,
      round: 1,
      createdAt: '2026-07-12T00:00:00.000Z',
      context: 'Approve the experiment design?',
      questions: [
        {
          id: 'q1',
          ask: 'Proceed with the RoPE ablation as specified?',
          options: [
            { label: 'approve', description: 'Run the design as-is', recommended: true },
            { label: 'revise', description: 'Adjust the metric target' },
          ],
          freeform: true,
        },
      ],
      answers: [{ questionId: 'q1', label: 'approve', answeredBy: 'human' }],
      resolvedAt: '2026-07-12T00:01:00.000Z',
      discussionFile: 'ck-2-design-r1.md',
    };
    expect(ck.checkpoint_version).toBe(1);
    expect(ck.questions[0].options.filter((o) => o.recommended).length).toBe(1);
  });

  it('a ResearchThread literal carrying pendingCheckpoint compiles', () => {
    const ck: Checkpoint = {
      checkpoint_version: 1,
      id: 'ck-1-seed-r1',
      point: 'seed',
      type: 'clarification',
      iteration: 1,
      round: 1,
      createdAt: '2026-07-12T00:00:00.000Z',
      questions: [{ id: 'q1', ask: 'Narrow the scope?', options: [{ label: 'yes', description: 'do it' }] }],
    };
    const t: ResearchThread = {
      id: 'x-abc123',
      question: 'Q?',
      status: 'paused',
      iteration: 1,
      maxIterations: 5,
      gates: { execute: true, kg_write: true },
      budgetUsed: 0,
      modelProfile: 'balanced',
      tokenProfile: 'balanced',
      currentStation: 'seed',
      pendingGate: null,
      createdAt: '2026-07-12T00:00:00.000Z',
      pendingCheckpoint: ck,
      refinedQuestion: 'Q refined?',
      checkpointRounds: { seed: 1 },
    };
    expect(t.pendingCheckpoint?.point).toBe('seed');
    expect(t.checkpointRounds?.seed).toBe(1);
  });

  it('InteractiveConfig resolved shape type-checks', () => {
    const cfg: InteractiveConfig = {
      enabled: true,
      seed: false,
      hypothesize: true,
      design: true,
      decide: false,
      max_rounds: 2,
      max_questions: 4,
      hypothesis_candidates: 3,
      every_iteration: false,
      fallback: 'recommended',
    };
    expect(cfg.fallback).toBe('recommended');
  });
});
