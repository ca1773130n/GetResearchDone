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
    thresholds?: BudgetPressureThresholds,
  ) => boolean;
  computeBudgetPressureLevel: (
    states: Map<string, BackendUsageState>,
    priority: string[],
    accounts: SuperpowersConfig['accounts'],
    thresholds?: BudgetPressureThresholds,
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
  entries: Array<{ backend: string; configDir: string }>,
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
