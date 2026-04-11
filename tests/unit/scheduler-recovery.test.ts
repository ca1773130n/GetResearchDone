'use strict';

import type {
  BackendUsageState,
  UsageSample,
  SuperpowersConfig,
} from '../../lib/types';

const {
  computeSoonestRecovery,
  _anyPriorityHasHeadroom,
}: {
  computeSoonestRecovery: (
    states: Map<string, BackendUsageState>,
    priority: string[],
    accounts: SuperpowersConfig['accounts'],
    windowMinutes: number,
    maxWaitMs: number,
  ) => number | null;
  _anyPriorityHasHeadroom: (
    priority: string[],
    accounts: SuperpowersConfig['accounts'],
    states: Map<string, BackendUsageState>,
    safetyMargin: number,
  ) => boolean;
} = require('../../lib/scheduler');

function makeState(opts: {
  samples?: Partial<UsageSample>[];
  ewma?: number;
  budget?: number;
  consumed?: number;
  reserved?: number;
  cooldownUntil?: number;
}): BackendUsageState {
  return {
    samples: (opts.samples ?? []) as UsageSample[],
    ewma_tokens_per_task: opts.ewma ?? 0,
    tokens_consumed_in_window: opts.consumed ?? 0,
    tokens_reserved: opts.reserved ?? 0,
    in_flight_count: 0,
    token_budget: opts.budget ?? 1_000_000,
    budget_learned: false,
    budget_confidence: 0,
    cooldown_until: opts.cooldownUntil,
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

const WINDOW_MIN = 60;
const MAX_WAIT_MS = 90 * 60 * 1000;

describe('computeSoonestRecovery', () => {
  it('returns null when the states map is empty', () => {
    const states = new Map<string, BackendUsageState>();
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBeNull();
  });

  it('returns null when an account has zero samples', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState({ samples: [], ewma: 5000 }));
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBeNull();
  });

  it('returns null when ewma_tokens_per_task is zero (no prediction data)', () => {
    const states = new Map<string, BackendUsageState>();
    const now = Date.now();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [{ timestamp: now - 30 * 60 * 1000, tokenEstimate: 50_000 }],
        ewma: 0,
        budget: 100_000,
        consumed: 50_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBeNull();
  });

  it('returns the correct recovery timestamp for a single exhausted account', () => {
    const now = Date.now();
    const oldSampleTs = now - 30 * 60 * 1000;
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [
          { timestamp: oldSampleTs, tokenEstimate: 90_000 },
          { timestamp: now - 10 * 60 * 1000, tokenEstimate: 10_000 },
        ],
        ewma: 20_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).not.toBeNull();
    expect(result).toBe(oldSampleTs + WINDOW_MIN * 60 * 1000);
  });

  it('returns null when the soonest recovery exceeds maxWaitMs', () => {
    const now = Date.now();
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [{ timestamp: now - 1 * 60 * 1000, tokenEstimate: 100_000 }],
        ewma: 50_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const shortCap = 10 * 60 * 1000;
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, shortCap,
    );
    expect(result).toBeNull();
  });

  it('picks the minimum recovery time across multiple accounts', () => {
    const now = Date.now();
    const oldTs1 = now - 45 * 60 * 1000;
    const oldTs2 = now - 30 * 60 * 1000;
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/account-a',
      makeState({
        samples: [{ timestamp: oldTs1, tokenEstimate: 100_000 }],
        ewma: 50_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    states.set(
      'claude/~/account-b',
      makeState({
        samples: [{ timestamp: oldTs2, tokenEstimate: 100_000 }],
        ewma: 50_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    const accounts = makeAccounts([
      { backend: 'claude', configDir: '~/account-a' },
      { backend: 'claude', configDir: '~/account-b' },
    ]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBe(oldTs1 + WINDOW_MIN * 60 * 1000);
  });

  it('returns null when the priority list is empty', () => {
    const states = new Map<string, BackendUsageState>();
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, [], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBeNull();
  });

  it('participates with budget_learned=false when ewma is nonzero', () => {
    const now = Date.now();
    const oldTs = now - 30 * 60 * 1000;
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [{ timestamp: oldTs, tokenEstimate: 100_000 }],
        ewma: 25_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBe(oldTs + WINDOW_MIN * 60 * 1000);
  });

  it('returns null when the account already has headroom (break fires immediately)', () => {
    const now = Date.now();
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [{ timestamp: now - 10 * 60 * 1000, tokenEstimate: 10_000 }],
        ewma: 5_000,
        budget: 100_000,
        consumed: 10_000, // projected remaining 90_000 >= ewma 5_000 immediately
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = computeSoonestRecovery(
      states, ['claude'], accounts, WINDOW_MIN, MAX_WAIT_MS,
    );
    expect(result).toBeNull();
  });
});

describe('_anyPriorityHasHeadroom', () => {
  it('returns false when no priority accounts have headroom', () => {
    const now = Date.now();
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [{ timestamp: now, tokenEstimate: 100_000 }],
        ewma: 50_000,
        budget: 100_000,
        consumed: 100_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = _anyPriorityHasHeadroom(['claude'], accounts, states, 1);
    expect(result).toBe(false);
  });

  it('returns true when at least one priority account has headroom', () => {
    const states = new Map<string, BackendUsageState>();
    states.set(
      'claude/~/.claude',
      makeState({
        samples: [],
        ewma: 0,
        budget: 100_000,
      }),
    );
    const accounts = makeAccounts([{ backend: 'claude', configDir: '~/.claude' }]);
    const result = _anyPriorityHasHeadroom(['claude'], accounts, states, 1);
    expect(result).toBe(true);
  });
});
