'use strict';

import type {
  BackendUsageState,
  SuperpowersConfig,
  BudgetPressureThresholds,
} from '../../lib/types';

const {
  isBudgetPressured,
  computeBudgetPressureLevel,
}: {
  isBudgetPressured: (
    states: Map<string, BackendUsageState>,
    priority: string[],
    accounts: SuperpowersConfig['accounts'],
    thresholds?: BudgetPressureThresholds
  ) => boolean;
  computeBudgetPressureLevel: (
    states: Map<string, BackendUsageState>,
    priority: string[],
    accounts: SuperpowersConfig['accounts'],
    thresholds?: BudgetPressureThresholds
  ) => 'none' | 'warning' | 'high' | 'critical';
} = require('../../lib/scheduler');

function makeState(consumed: number, reserved: number, budget: number): BackendUsageState {
  return {
    samples: [],
    ewma_tokens_per_task: 0,
    tokens_consumed_in_window: consumed,
    tokens_reserved: reserved,
    in_flight_count: 0,
    token_budget: budget,
    budget_learned: false,
    budget_confidence: 0,
  };
}

function makeAccounts(
  entries: Array<{ backend: string; configDir: string }>
): SuperpowersConfig['accounts'] {
  const accounts: Record<string, Array<{ config_dir: string }>> = {};
  for (const e of entries) {
    if (!accounts[e.backend]) accounts[e.backend] = [];
    accounts[e.backend].push({ config_dir: e.configDir });
  }
  return accounts as SuperpowersConfig['accounts'];
}

describe('computeBudgetPressureLevel', () => {
  it("returns 'none' for an empty states map", () => {
    const states = new Map<string, BackendUsageState>();
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('none');
  });

  it("returns 'none' for accounts with zero consumption", () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(0, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('none');
  });

  it("returns 'warning' when any account is at 65% consumed", () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(65_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('warning');
  });

  it("returns 'high' when any account is at 85% consumed", () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(85_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('high');
  });

  it("returns 'critical' when any account is at 97% consumed", () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(97_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('critical');
  });

  it('picks the worst level across multiple accounts', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/account-a', makeState(10_000, 0, 100_000));
    states.set('claude/~/account-b', makeState(90_000, 0, 100_000));
    const accounts = makeAccounts([
      { backend: 'claude', configDir: '~/account-a' },
      { backend: 'claude', configDir: '~/account-b' },
    ]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('high');
  });

  it('includes tokens_reserved in the ratio', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(50_000, 40_000, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(computeBudgetPressureLevel(states, ['claude'], accounts)).toBe('high');
  });

  it('respects custom thresholds', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(50_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const thresholds = { warning: 0.4, high: 0.6, critical: 0.9 };
    expect(computeBudgetPressureLevel(states, ['claude'], accounts, thresholds)).toBe('warning');
  });
});

describe('isBudgetPressured', () => {
  it('returns false when level is none', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(10_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(isBudgetPressured(states, ['claude'], accounts)).toBe(false);
  });

  it('returns true when level is warning', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(65_000, 0, 100_000));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    expect(isBudgetPressured(states, ['claude'], accounts)).toBe(true);
  });
});

describe('logPressureTransition', () => {
  const { logPressureTransition } = require('../../lib/scheduler') as {
    logPressureTransition: (
      sessionKey: string,
      current: 'none' | 'warning' | 'high' | 'critical',
      agentType: string,
      baseTier: string,
      effectiveTier: string,
    ) => void;
  };

  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('logs once on transition from none to warning', () => {
    const key = `test-transition-${Math.random()}`;
    logPressureTransition(key, 'warning', 'grd-planner', 'opus', 'opus');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('budget pressure detected — level=warning'),
    );
  });

  it('does not log on repeat call at the same level', () => {
    const key = `test-repeat-${Math.random()}`;
    logPressureTransition(key, 'warning', 'grd-planner', 'opus', 'opus');
    stderrSpy.mockClear();
    logPressureTransition(key, 'warning', 'grd-planner', 'opus', 'opus');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('logs downgrade note when baseTier != effectiveTier', () => {
    const key = `test-downgrade-${Math.random()}`;
    logPressureTransition(key, 'high', 'grd-executor', 'opus', 'sonnet');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('downgrading grd-executor from opus to sonnet'),
    );
  });

  it('does not log when transitioning back to none', () => {
    const key = `test-recovery-${Math.random()}`;
    logPressureTransition(key, 'high', 'grd-executor', 'opus', 'sonnet');
    stderrSpy.mockClear();
    logPressureTransition(key, 'none', 'grd-executor', 'opus', 'opus');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

describe('logPressureTransition session isolation (O3 regression)', () => {
  const { logPressureTransition } = require('../../lib/scheduler') as {
    logPressureTransition: (
      sessionKey: string,
      level: 'none' | 'warning' | 'high' | 'critical',
      agentType: string,
      baseTier: string,
      effectiveTier: string,
    ) => void;
  };

  it('multiple session keys track transitions independently', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      // Use unique keys not already in the map
      const keyA = `isolation-test-A-${Math.random()}`;
      const keyB = `isolation-test-B-${Math.random()}`;

      logPressureTransition(keyA, 'warning', 'grd-planner', 'opus', 'opus');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      stderrSpy.mockClear();

      // Same level on different session — should still log (independent)
      logPressureTransition(keyB, 'warning', 'grd-planner', 'opus', 'opus');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      stderrSpy.mockClear();

      // Same level on same session — should NOT log
      logPressureTransition(keyA, 'warning', 'grd-planner', 'opus', 'opus');
      expect(stderrSpy).not.toHaveBeenCalled();
    } finally {
      stderrSpy.mockRestore();
    }
  });
});

describe('createScheduler unique session keys (O3 regression)', () => {
  const { createScheduler } = require('../../lib/scheduler') as {
    createScheduler: (config: unknown) => { sessionKey: string } | null;
  };

  it('two createScheduler calls produce different sessionKeys', () => {
    const minimalConfig = {
      backend_priority: ['claude'],
      free_fallback: { backend: 'claude' },
      prediction: {
        window_minutes: 60,
        ewma_alpha: 0.3,
        safety_margin_tasks: 1,
        min_samples: 3,
      },
    };
    const s1 = createScheduler(minimalConfig);
    const s2 = createScheduler(minimalConfig);
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect(s1!.sessionKey).not.toEqual(s2!.sessionKey);
    expect(s1!.sessionKey).toMatch(/^pid-\d+-session-\d+$/);
  });
});
