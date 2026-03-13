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
