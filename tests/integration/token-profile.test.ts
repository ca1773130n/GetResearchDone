'use strict';

import type {
  BackendUsageState,
  TokenProfileName,
  ModelTier,
} from '../../lib/types';

const { estimateComplexity } = require('../../lib/complexity') as {
  estimateComplexity: (opts: {
    agentType: string;
    promptLength?: number;
  }) => 'low' | 'medium' | 'high';
};

const { computeBudgetPressureLevel } = require('../../lib/scheduler') as {
  computeBudgetPressureLevel: (
    states: Map<string, BackendUsageState>,
    priority: string[],
    accounts: { [k: string]: Array<{ config_dir: string }> },
  ) => 'none' | 'warning' | 'high' | 'critical';
};

const { computeEffectiveModelTier } = require('../../lib/backend') as {
  computeEffectiveModelTier: (opts: {
    baseTier: ModelTier;
    tokenProfile: TokenProfileName;
    pressure: 'none' | 'warning' | 'high' | 'critical';
    complexity: 'low' | 'medium' | 'high';
  }) => ModelTier;
};

function makeState(consumed: number, budget: number): BackendUsageState {
  return {
    samples: [],
    ewma_tokens_per_task: 0,
    tokens_consumed_in_window: consumed,
    tokens_reserved: 0,
    in_flight_count: 0,
    token_budget: budget,
    budget_learned: false,
    budget_confidence: 0,
  };
}

describe('Spec 4 end-to-end adaptive routing', () => {
  const accounts = { claude: [{ config_dir: '~/.claude' }] };

  it('low pressure + balanced profile + high complexity → no downgrade', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(10_000, 100_000));
    const pressure = computeBudgetPressureLevel(states, ['claude'], accounts);
    const complexity = estimateComplexity({ agentType: 'grd-planner' });
    const tier = computeEffectiveModelTier({
      baseTier: 'opus', tokenProfile: 'balanced', pressure, complexity,
    });
    expect(pressure).toBe('none');
    expect(complexity).toBe('high');
    expect(tier).toBe('opus');
  });

  it('high pressure + balanced profile + high complexity → no downgrade', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(85_000, 100_000));
    const pressure = computeBudgetPressureLevel(states, ['claude'], accounts);
    const complexity = estimateComplexity({ agentType: 'grd-planner' });
    const tier = computeEffectiveModelTier({
      baseTier: 'opus', tokenProfile: 'balanced', pressure, complexity,
    });
    expect(pressure).toBe('high');
    expect(tier).toBe('opus');
  });

  it('high pressure + balanced profile + low complexity → 2 downgrades (haiku)', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(85_000, 100_000));
    const pressure = computeBudgetPressureLevel(states, ['claude'], accounts);
    const complexity = estimateComplexity({ agentType: 'grd-verifier' });
    const tier = computeEffectiveModelTier({
      baseTier: 'opus', tokenProfile: 'balanced', pressure, complexity,
    });
    expect(pressure).toBe('high');
    expect(complexity).toBe('low');
    expect(tier).toBe('haiku');
  });

  it('quality profile ignores high pressure for high complexity agents', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(85_000, 100_000));
    const pressure = computeBudgetPressureLevel(states, ['claude'], accounts);
    const complexity = estimateComplexity({ agentType: 'grd-planner' });
    const tier = computeEffectiveModelTier({
      baseTier: 'opus', tokenProfile: 'quality', pressure, complexity,
    });
    expect(tier).toBe('opus');
  });

  it('frugal profile downgrades even low-pressure medium-complexity tasks', () => {
    const states = new Map<string, BackendUsageState>();
    states.set('claude/~/.claude', makeState(10_000, 100_000));
    const pressure = computeBudgetPressureLevel(states, ['claude'], accounts);
    const complexity = estimateComplexity({ agentType: 'grd-executor' });
    const tier = computeEffectiveModelTier({
      baseTier: 'opus', tokenProfile: 'frugal', pressure, complexity,
    });
    expect(pressure).toBe('none');
    expect(complexity).toBe('medium');
    expect(tier).toBe('sonnet');
  });
});
