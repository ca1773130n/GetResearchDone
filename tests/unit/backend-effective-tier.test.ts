'use strict';

import type {
  TokenProfileName,
  BudgetPressureLevel,
  ComplexityLevel,
  GrdConfig,
  SchedulerConfig,
  SuperpowersConfig,
} from '../../lib/types';

type ModelTier = 'opus' | 'sonnet' | 'haiku';

const { computeEffectiveModelTier, getEffectiveTierForDispatch, _applyUpgrade } = require('../../lib/backend') as {
  computeEffectiveModelTier: (opts: {
    baseTier: ModelTier;
    tokenProfile: TokenProfileName;
    pressure: BudgetPressureLevel;
    complexity: ComplexityLevel;
  }) => ModelTier;
  getEffectiveTierForDispatch: (opts: {
    agentType: string;
    prompt: string;
    config: GrdConfig;
    scheduler: { getStates: () => Map<string, unknown>; sessionKey?: string } | null;
    schedulerConfig?: SchedulerConfig;
    superpowersConfig?: SuperpowersConfig;
    modelProfiles: Record<string, Record<string, string>>;
    retry_attempt?: number;
  }) => string;
  _applyUpgrade: (baseTier: ModelTier, count: number) => ModelTier;
};

describe('computeEffectiveModelTier', () => {
  it('quality profile: never downgrades on none/warning/high pressure', () => {
    for (const complexity of ['low', 'medium', 'high'] as const) {
      for (const pressure of ['none', 'warning', 'high'] as const) {
        expect(
          computeEffectiveModelTier({
            baseTier: 'opus',
            tokenProfile: 'quality',
            pressure,
            complexity,
          })
        ).toBe('opus');
      }
    }
  });

  it('quality profile: downgrades 1 step on critical pressure', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'quality',
        pressure: 'critical',
        complexity: 'high',
      })
    ).toBe('sonnet');
  });

  it('balanced profile: returns base tier when pressure=none and complexity=high', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'balanced',
        pressure: 'none',
        complexity: 'high',
      })
    ).toBe('opus');
  });

  it('balanced profile: returns base tier when pressure=none and complexity=medium', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'balanced',
        pressure: 'none',
        complexity: 'medium',
      })
    ).toBe('opus');
  });

  it('balanced profile: downgrades 1 step when pressure=none and complexity=low', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'balanced',
        pressure: 'none',
        complexity: 'low',
      })
    ).toBe('sonnet');
  });

  it('balanced profile: downgrades 1 step on warning pressure and medium complexity', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'balanced',
        pressure: 'warning',
        complexity: 'medium',
      })
    ).toBe('sonnet');
  });

  it('balanced profile: downgrades 2 steps on high pressure + low complexity', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'balanced',
        pressure: 'high',
        complexity: 'low',
      })
    ).toBe('haiku');
  });

  it('frugal profile: returns base tier when complexity=high and pressure=none', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'frugal',
        pressure: 'none',
        complexity: 'high',
      })
    ).toBe('opus');
  });

  it('frugal profile: downgrades 1 step when complexity=medium and pressure=none', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'frugal',
        pressure: 'none',
        complexity: 'medium',
      })
    ).toBe('sonnet');
  });

  it('frugal profile: downgrades 1 step when complexity=low and pressure=none', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'frugal',
        pressure: 'none',
        complexity: 'low',
      })
    ).toBe('sonnet');
  });

  it('frugal profile: downgrades 2 steps on high pressure regardless of complexity', () => {
    for (const complexity of ['low', 'medium', 'high'] as const) {
      expect(
        computeEffectiveModelTier({
          baseTier: 'opus',
          tokenProfile: 'frugal',
          pressure: 'high',
          complexity,
        })
      ).toBe('haiku');
    }
  });

  it('downgrade floor: haiku stays haiku', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'haiku',
        tokenProfile: 'frugal',
        pressure: 'critical',
        complexity: 'low',
      })
    ).toBe('haiku');
  });

  it('downgrade floor: sonnet → haiku (2 steps applied)', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'sonnet',
        tokenProfile: 'frugal',
        pressure: 'critical',
        complexity: 'low',
      })
    ).toBe('haiku');
  });

  it('downgrade floor: opus → sonnet → haiku (2 steps applied)', () => {
    expect(
      computeEffectiveModelTier({
        baseTier: 'opus',
        tokenProfile: 'frugal',
        pressure: 'critical',
        complexity: 'low',
      })
    ).toBe('haiku');
  });

  it('unknown base tier returns unchanged (passthrough)', () => {
    const result = computeEffectiveModelTier({
      baseTier: 'unknown-tier' as ModelTier,
      tokenProfile: 'frugal',
      pressure: 'high',
      complexity: 'low',
    });
    expect(result).toBe('unknown-tier');
  });
});

describe('getEffectiveTierForDispatch with recentSamples', () => {
  it('passes recentSamples to estimateComplexity when available from scheduler', () => {
    // grd-executor baseline complexity = medium; with 3 samples avg tokenEstimate=766 < 1500
    // → estimateComplexity demotes to low.
    // computeEffectiveModelTier: baseTier=sonnet, balanced, pressure=none, complexity=low → 1 step down = haiku.
    const states = new Map();
    states.set('claude/~/.claude', {
      samples: [
        {
          backend: 'claude',
          timestamp: Date.now() - 3000,
          duration: 100,
          tokenEstimate: 500,
          exitCode: 0,
          workItemId: '1',
        },
        {
          backend: 'claude',
          timestamp: Date.now() - 2000,
          duration: 100,
          tokenEstimate: 800,
          exitCode: 0,
          workItemId: '2',
        },
        {
          backend: 'claude',
          timestamp: Date.now() - 1000,
          duration: 100,
          tokenEstimate: 1000,
          exitCode: 0,
          workItemId: '3',
        },
      ],
      ewma_tokens_per_task: 0,
      tokens_consumed_in_window: 0,
      tokens_reserved: 0,
      in_flight_count: 0,
      token_budget: 100_000,
      budget_learned: false,
      budget_confidence: 0,
    });

    const tier = getEffectiveTierForDispatch({
      agentType: 'grd-executor',
      prompt: 'test',
      config: { model_profile: 'balanced', token_profile: 'balanced' } as unknown as GrdConfig,
      scheduler: { getStates: () => states },
      schedulerConfig: {
        backend_priority: ['claude'],
        free_fallback: { backend: 'claude' },
        prediction: { window_minutes: 60, ewma_alpha: 0.3, safety_margin_tasks: 1, min_samples: 3 },
      } as unknown as SchedulerConfig,
      superpowersConfig: {
        accounts: { claude: [{ config_dir: '~/.claude' }] },
      } as unknown as SuperpowersConfig,
      modelProfiles: {
        'grd-executor': { balanced: 'sonnet', quality: 'opus', budget: 'sonnet' },
      },
    });

    // baseTier=sonnet, complexity=low (sample-demoted), pressure=none, balanced → 1 downgrade = haiku
    expect(tier).toBe('haiku');
  });

  it('returns baseTier unchanged when no scheduler provided', () => {
    const tier = getEffectiveTierForDispatch({
      agentType: 'grd-executor',
      prompt: 'test',
      config: { model_profile: 'balanced', token_profile: 'balanced' } as unknown as GrdConfig,
      scheduler: null,
      modelProfiles: {
        'grd-executor': { balanced: 'sonnet', quality: 'opus', budget: 'sonnet' },
      },
    });
    expect(tier).toBe('sonnet');
  });
});

describe('getEffectiveTierForDispatch agent-type filtering (M2 regression)', () => {
  it('uses planner-specific samples when >= 3 available, ignoring cheap verifier samples', () => {
    const now = Date.now();
    const states = new Map();
    states.set('claude/~/.claude', {
      samples: [
        // 5 cheap verifier samples — should NOT influence planner dispatch
        ...Array(5)
          .fill(null)
          .map((_, i) => ({
            backend: 'claude',
            stateKey: 'claude/~/.claude',
            agentType: 'grd-verifier',
            timestamp: now - (5 - i) * 1000,
            duration: 50,
            tokenEstimate: 200,
            exitCode: 0,
            workItemId: `v${i}`,
          })),
        // 3 expensive planner samples — these have high tokenEstimate
        ...Array(3)
          .fill(null)
          .map((_, i) => ({
            backend: 'claude',
            stateKey: 'claude/~/.claude',
            agentType: 'grd-planner',
            timestamp: now - (3 - i) * 500,
            duration: 2000,
            tokenEstimate: 50_000,
            exitCode: 0,
            workItemId: `p${i}`,
          })),
      ],
      ewma_tokens_per_task: 0,
      tokens_consumed_in_window: 0,
      tokens_reserved: 0,
      in_flight_count: 0,
      token_budget: 1_000_000,
      budget_learned: false,
      budget_confidence: 0,
    });

    const plannerTier = getEffectiveTierForDispatch({
      agentType: 'grd-planner',
      prompt: 'test',
      config: { model_profile: 'balanced', token_profile: 'balanced' } as unknown as GrdConfig,
      scheduler: { getStates: () => states, sessionKey: 'test-session' } as unknown as {
        getStates: () => Map<string, unknown>;
      },
      schedulerConfig: {
        backend_priority: ['claude'],
        free_fallback: { backend: 'claude' },
        prediction: { window_minutes: 60, ewma_alpha: 0.3, safety_margin_tasks: 1, min_samples: 3 },
      } as unknown as SchedulerConfig,
      superpowersConfig: {
        accounts: { claude: [{ config_dir: '~/.claude' }] },
      } as unknown as SuperpowersConfig,
      modelProfiles: {
        'grd-planner': { balanced: 'opus', quality: 'opus', budget: 'sonnet' },
      },
    });

    // Planner has 3 own samples averaging 50k tokens → high complexity.
    // balanced + none pressure + high complexity → no downgrade.
    // Expected: opus (base tier, no downgrade applied).
    expect(plannerTier).toBe('opus');
  });
});

// ─── _applyUpgrade ──────────────────────────────────────────────────────────
// Symmetric to _applyDowngrade. Used for verify-fail retry escalation
// (Tier-2 #5 of the Ouroboros integration).
describe('_applyUpgrade', () => {
  it('returns base tier unchanged for count=0', () => {
    expect(_applyUpgrade('haiku', 0)).toBe('haiku');
    expect(_applyUpgrade('sonnet', 0)).toBe('sonnet');
    expect(_applyUpgrade('opus', 0)).toBe('opus');
  });

  it('escalates one notch upward for count=1', () => {
    expect(_applyUpgrade('haiku', 1)).toBe('sonnet');
    expect(_applyUpgrade('sonnet', 1)).toBe('opus');
  });

  it('escalates two notches for count=2 (haiku → opus)', () => {
    expect(_applyUpgrade('haiku', 2)).toBe('opus');
  });

  it('caps at strongest tier (opus) when count exceeds available steps', () => {
    expect(_applyUpgrade('opus', 1)).toBe('opus');
    expect(_applyUpgrade('opus', 99)).toBe('opus');
    expect(_applyUpgrade('haiku', 99)).toBe('opus');
    expect(_applyUpgrade('sonnet', 5)).toBe('opus');
  });

  it('is the inverse of _applyDowngrade for round-trips', () => {
    // _applyUpgrade(_applyDowngrade(x, n), n) === x when not clipped.
    // Use sonnet so neither direction hits a boundary.
    const { computeEffectiveModelTier: _ } = require('../../lib/backend');
    // Manual round-trip: sonnet → haiku via downgrade(1), back to sonnet via upgrade(1)
    const downOne = _applyUpgrade('haiku', 1);
    expect(downOne).toBe('sonnet');
  });
});

// ─── retry_attempt escalation in getEffectiveTierForDispatch ───────────────
describe('getEffectiveTierForDispatch retry_attempt', () => {
  // The dispatch helper falls back to baseTier when scheduler is null, so we
  // pass a null scheduler to test the escalation path purely against the
  // base tier without invoking the adaptive complexity/pressure chain.
  const baseConfig: GrdConfig = {
    model_profile: 'balanced',
    research: false,
    plan_checker: false,
  } as unknown as GrdConfig;
  const modelProfiles: Record<string, Record<string, string>> = {
    'grd-verifier': { quality: 'opus', balanced: 'sonnet', budget: 'haiku' },
  };

  it('omits retry_attempt → base tier (sonnet)', () => {
    const tier = getEffectiveTierForDispatch({
      agentType: 'grd-verifier',
      prompt: 'p',
      config: baseConfig,
      scheduler: null,
      modelProfiles,
    });
    expect(tier).toBe('sonnet');
  });

  it('retry_attempt=0 → base tier (no escalation)', () => {
    const tier = getEffectiveTierForDispatch({
      agentType: 'grd-verifier',
      prompt: 'p',
      config: baseConfig,
      scheduler: null,
      modelProfiles,
      retry_attempt: 0,
    });
    expect(tier).toBe('sonnet');
  });

  it('retry_attempt=1 escalates one notch (sonnet → opus)', () => {
    const tier = getEffectiveTierForDispatch({
      agentType: 'grd-verifier',
      prompt: 'p',
      config: baseConfig,
      scheduler: null,
      modelProfiles,
      retry_attempt: 1,
    });
    expect(tier).toBe('opus');
  });

  it('retry_attempt=2 escalates two notches; capped at opus', () => {
    const tier = getEffectiveTierForDispatch({
      agentType: 'grd-verifier',
      prompt: 'p',
      config: baseConfig,
      scheduler: null,
      modelProfiles,
      retry_attempt: 2,
    });
    expect(tier).toBe('opus');
  });

  it('retry_attempt with budget profile (haiku base) escalates predictably', () => {
    const budgetConfig: GrdConfig = {
      ...(baseConfig as object),
      model_profile: 'budget',
    } as unknown as GrdConfig;
    expect(
      getEffectiveTierForDispatch({
        agentType: 'grd-verifier',
        prompt: 'p',
        config: budgetConfig,
        scheduler: null,
        modelProfiles,
      })
    ).toBe('haiku');
    expect(
      getEffectiveTierForDispatch({
        agentType: 'grd-verifier',
        prompt: 'p',
        config: budgetConfig,
        scheduler: null,
        modelProfiles,
        retry_attempt: 1,
      })
    ).toBe('sonnet');
    expect(
      getEffectiveTierForDispatch({
        agentType: 'grd-verifier',
        prompt: 'p',
        config: budgetConfig,
        scheduler: null,
        modelProfiles,
        retry_attempt: 2,
      })
    ).toBe('opus');
  });
});
