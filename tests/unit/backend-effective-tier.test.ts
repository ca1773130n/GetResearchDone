'use strict';

import type {
  TokenProfileName,
  BudgetPressureLevel,
  ComplexityLevel,
} from '../../lib/types';

type ModelTier = 'opus' | 'sonnet' | 'haiku';

const { computeEffectiveModelTier } = require('../../lib/backend') as {
  computeEffectiveModelTier: (opts: {
    baseTier: ModelTier;
    tokenProfile: TokenProfileName;
    pressure: BudgetPressureLevel;
    complexity: ComplexityLevel;
  }) => ModelTier;
};

describe('computeEffectiveModelTier', () => {
  it('quality profile: never downgrades on none/warning/high pressure', () => {
    for (const complexity of ['low', 'medium', 'high'] as const) {
      for (const pressure of ['none', 'warning', 'high'] as const) {
        expect(
          computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'quality', pressure, complexity }),
        ).toBe('opus');
      }
    }
  });

  it('quality profile: downgrades 1 step on critical pressure', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'quality', pressure: 'critical', complexity: 'high' }),
    ).toBe('sonnet');
  });

  it('balanced profile: returns base tier when pressure=none and complexity=high', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'balanced', pressure: 'none', complexity: 'high' }),
    ).toBe('opus');
  });

  it('balanced profile: returns base tier when pressure=none and complexity=medium', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'balanced', pressure: 'none', complexity: 'medium' }),
    ).toBe('opus');
  });

  it('balanced profile: downgrades 1 step when pressure=none and complexity=low', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'balanced', pressure: 'none', complexity: 'low' }),
    ).toBe('sonnet');
  });

  it('balanced profile: downgrades 1 step on warning pressure and medium complexity', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'balanced', pressure: 'warning', complexity: 'medium' }),
    ).toBe('sonnet');
  });

  it('balanced profile: downgrades 2 steps on high pressure + low complexity', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'balanced', pressure: 'high', complexity: 'low' }),
    ).toBe('haiku');
  });

  it('frugal profile: returns base tier when complexity=high and pressure=none', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'frugal', pressure: 'none', complexity: 'high' }),
    ).toBe('opus');
  });

  it('frugal profile: downgrades 1 step when complexity=medium and pressure=none', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'frugal', pressure: 'none', complexity: 'medium' }),
    ).toBe('sonnet');
  });

  it('frugal profile: downgrades 1 step when complexity=low and pressure=none', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'frugal', pressure: 'none', complexity: 'low' }),
    ).toBe('sonnet');
  });

  it('frugal profile: downgrades 2 steps on high pressure regardless of complexity', () => {
    for (const complexity of ['low', 'medium', 'high'] as const) {
      expect(
        computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'frugal', pressure: 'high', complexity }),
      ).toBe('haiku');
    }
  });

  it('downgrade floor: haiku stays haiku', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'haiku', tokenProfile: 'frugal', pressure: 'critical', complexity: 'low' }),
    ).toBe('haiku');
  });

  it('downgrade floor: sonnet → haiku (2 steps applied)', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'sonnet', tokenProfile: 'frugal', pressure: 'critical', complexity: 'low' }),
    ).toBe('haiku');
  });

  it('downgrade floor: opus → sonnet → haiku (2 steps applied)', () => {
    expect(
      computeEffectiveModelTier({ baseTier: 'opus', tokenProfile: 'frugal', pressure: 'critical', complexity: 'low' }),
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
