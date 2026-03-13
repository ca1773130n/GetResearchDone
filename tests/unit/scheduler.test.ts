'use strict';

import type {
  SchedulerConfig,
  UsageSample,
  BackendUsageState,
  SchedulerSpawnResult,
  BackendAdapter,
  SpawnOpts,
} from '../../lib/types';

import {
  ADAPTERS,
  createBackendState,
  updateEWMA,
  recordSample,
  evictExpiredSamples,
} from '../../lib/scheduler';

describe('scheduler types', () => {
  it('SchedulerConfig has required fields', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude', 'codex'],
      free_fallback: { backend: 'opencode', model: 'gemini-2.5-flash' },
      prediction: {
        window_minutes: 15,
        ewma_alpha: 0.3,
        safety_margin_tasks: 1.5,
        min_samples: 3,
      },
    };
    expect(config.backend_priority).toHaveLength(2);
  });

  it('UsageSample has required fields', () => {
    const sample: UsageSample = {
      backend: 'claude',
      timestamp: Date.now(),
      duration: 5000,
      tokenEstimate: 12000,
      exitCode: 0,
      workItemId: 'phase-1-plan',
    };
    expect(sample.backend).toBe('claude');
  });

  it('BackendUsageState tracks in-flight reservations', () => {
    const state: BackendUsageState = {
      samples: [],
      ewma_tokens_per_task: 10000,
      tokens_consumed_in_window: 0,
      tokens_reserved: 0,
      in_flight_count: 0,
      token_budget: 80000,
      budget_learned: false,
      budget_confidence: 0,
      cooldown_until: undefined,
    };
    expect(state.in_flight_count).toBe(0);
  });

  it('SchedulerSpawnResult matches SpawnResult optionality', () => {
    const result: SchedulerSpawnResult = {
      exitCode: 0,
      timedOut: false,
      backend: 'claude',
      tokensUsed: 12000,
      workItemId: 'test',
    };
    expect(result.stdout).toBeUndefined();
  });
});

describe('backend adapters', () => {
  describe('claude adapter', () => {
    it('parses "Total tokens: 12345" from stderr', () => {
      expect(ADAPTERS.claude.parseTokenUsage('Total tokens: 12345')).toBe(12345);
    });
    it('parses input_tokens + output_tokens from stderr', () => {
      const stderr = 'input_tokens: 8000, output_tokens: 4000';
      expect(ADAPTERS.claude.parseTokenUsage(stderr)).toBe(12000);
    });
    it('returns null when no token info found', () => {
      expect(ADAPTERS.claude.parseTokenUsage('no tokens here')).toBeNull();
    });
    it('detects rate limit from stderr', () => {
      expect(ADAPTERS.claude.isRateLimited(1, 'rate limit exceeded')).toBe(true);
      expect(ADAPTERS.claude.isRateLimited(1, 'overloaded_error')).toBe(true);
      expect(ADAPTERS.claude.isRateLimited(0, 'completed successfully')).toBe(false);
    });
    it('builds correct args', () => {
      const args = ADAPTERS.claude.buildArgs('test prompt', { model: 'opus' });
      expect(args).toContain('-p');
      expect(args).toContain('test prompt');
      expect(args).toContain('--model');
      expect(args).toContain('opus');
      expect(args).toContain('--dangerously-skip-permissions');
    });
  });
  describe('codex adapter', () => {
    it('parses total_tokens from JSON in stderr', () => {
      expect(ADAPTERS.codex.parseTokenUsage('"total_tokens": 9500')).toBe(9500);
    });
    it('detects rate limit', () => {
      expect(ADAPTERS.codex.isRateLimited(1, 'rate_limit_exceeded')).toBe(true);
    });
    it('builds correct args', () => {
      const args = ADAPTERS.codex.buildArgs('test prompt', {});
      expect(args).toContain('--prompt');
      expect(args).toContain('--approval-mode');
    });
  });
  describe('gemini adapter', () => {
    it('parses tokenCount from stderr', () => {
      expect(ADAPTERS.gemini.parseTokenUsage('tokenCount: 7000')).toBe(7000);
    });
    it('detects RESOURCE_EXHAUSTED', () => {
      expect(ADAPTERS.gemini.isRateLimited(1, 'RESOURCE_EXHAUSTED')).toBe(true);
    });
  });
  describe('opencode adapter', () => {
    it('parses total_tokens pattern', () => {
      expect(ADAPTERS.opencode.parseTokenUsage('total_tokens: 5000')).toBe(5000);
    });
    it('parses tokens_used pattern', () => {
      expect(ADAPTERS.opencode.parseTokenUsage('tokens used: 3000')).toBe(3000);
    });
  });
  describe('overstory adapter', () => {
    it('parses tokens from stderr', () => {
      expect(ADAPTERS.overstory.parseTokenUsage('tokens: 6000')).toBe(6000);
    });
    it('uses ov binary', () => {
      expect(ADAPTERS.overstory.binary).toBe('ov');
    });
  });
});

describe('EWMA prediction', () => {
  it('initializes with default values', () => {
    const state = createBackendState(80000);
    expect(state.ewma_tokens_per_task).toBe(0);
    expect(state.tokens_consumed_in_window).toBe(0);
    expect(state.token_budget).toBe(80000);
    expect(state.budget_learned).toBe(false);
  });
  it('computes EWMA correctly with alpha=0.3', () => {
    const state = createBackendState(80000);
    state.ewma_tokens_per_task = 10000;
    updateEWMA(state, 14000, 0.3);
    expect(state.ewma_tokens_per_task).toBe(11200);
  });
  it('sets EWMA to first value when no prior data', () => {
    const state = createBackendState(80000);
    updateEWMA(state, 12000, 0.3);
    expect(state.ewma_tokens_per_task).toBe(12000);
  });
  it('evicts samples older than window', () => {
    const state = createBackendState(80000);
    const now = Date.now();
    state.samples = [
      { backend: 'claude', timestamp: now - 20 * 60 * 1000, duration: 5000, tokenEstimate: 10000, exitCode: 0, workItemId: 'old' },
      { backend: 'claude', timestamp: now - 5 * 60 * 1000, duration: 5000, tokenEstimate: 12000, exitCode: 0, workItemId: 'recent' },
    ];
    state.tokens_consumed_in_window = 22000;
    evictExpiredSamples(state, 15);
    expect(state.samples).toHaveLength(1);
    expect(state.samples[0].workItemId).toBe('recent');
    expect(state.tokens_consumed_in_window).toBe(12000);
  });
  it('recordSample updates consumed tokens and EWMA', () => {
    const state = createBackendState(80000);
    const sample = { backend: 'claude' as const, timestamp: Date.now(), duration: 5000, tokenEstimate: 10000, exitCode: 0, workItemId: 'test-1' };
    recordSample(state, sample, 15, 0.3);
    expect(state.tokens_consumed_in_window).toBe(10000);
    expect(state.ewma_tokens_per_task).toBe(10000);
    expect(state.samples).toHaveLength(1);
  });
  it('budget_confidence increases with sample count', () => {
    const state = createBackendState(80000);
    state.samples = new Array(5).fill(null).map((_, i) => ({
      backend: 'claude' as const, timestamp: Date.now(), duration: 5000, tokenEstimate: 10000, exitCode: 0, workItemId: `test-${i}`,
    }));
    expect(state.budget_confidence).toBe(0);
    recordSample(state, state.samples[0], 15, 0.3);
    expect(state.budget_confidence).toBeGreaterThan(0);
  });
});
