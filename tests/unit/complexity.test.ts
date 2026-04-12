'use strict';

import type { ComplexityLevel } from '../../lib/types';

const { estimateComplexity, AGENT_BASELINE_COMPLEXITY } = require('../../lib/complexity') as {
  estimateComplexity: (opts: {
    agentType: string;
    promptLength?: number;
    recentSamples?: { duration: number; tokenEstimate: number }[];
    baselineOverride?: ComplexityLevel;
  }) => ComplexityLevel;
  AGENT_BASELINE_COMPLEXITY: Record<string, ComplexityLevel>;
};

describe('estimateComplexity', () => {
  it('returns the baseline for a known agent type', () => {
    expect(estimateComplexity({ agentType: 'grd-planner' })).toBe('high');
    expect(estimateComplexity({ agentType: 'grd-executor' })).toBe('medium');
    expect(estimateComplexity({ agentType: 'grd-verifier' })).toBe('low');
  });

  it('returns medium for an unknown agent type', () => {
    expect(estimateComplexity({ agentType: 'not-a-real-agent' })).toBe('medium');
  });

  it('promotes to high when promptLength > 20000', () => {
    expect(estimateComplexity({ agentType: 'grd-verifier', promptLength: 25_000 })).toBe('high');
    expect(estimateComplexity({ agentType: 'grd-executor', promptLength: 30_000 })).toBe('high');
  });

  it('respects baseline when promptLength is small and no samples', () => {
    expect(estimateComplexity({ agentType: 'grd-planner', promptLength: 500 })).toBe('high');
    expect(estimateComplexity({ agentType: 'grd-verifier', promptLength: 500 })).toBe('low');
  });

  it('demotes high→medium when recent samples average < 3000 tokens', () => {
    const samples = [
      { duration: 100, tokenEstimate: 1000 },
      { duration: 100, tokenEstimate: 1500 },
      { duration: 100, tokenEstimate: 2000 },
    ];
    expect(estimateComplexity({ agentType: 'grd-planner', recentSamples: samples })).toBe('medium');
  });

  it('demotes medium→low when recent samples average < 1500 tokens', () => {
    const samples = [
      { duration: 100, tokenEstimate: 500 },
      { duration: 100, tokenEstimate: 800 },
      { duration: 100, tokenEstimate: 1000 },
    ];
    expect(estimateComplexity({ agentType: 'grd-executor', recentSamples: samples })).toBe('low');
  });

  it('leaves low unchanged even with small samples', () => {
    const samples = [
      { duration: 100, tokenEstimate: 200 },
      { duration: 100, tokenEstimate: 300 },
      { duration: 100, tokenEstimate: 400 },
    ];
    expect(estimateComplexity({ agentType: 'grd-verifier', recentSamples: samples })).toBe('low');
  });

  it('ignores recentSamples if fewer than 3 provided', () => {
    const samples = [
      { duration: 100, tokenEstimate: 500 },
      { duration: 100, tokenEstimate: 500 },
    ];
    expect(estimateComplexity({ agentType: 'grd-planner', recentSamples: samples })).toBe('high');
  });

  it('handles empty recentSamples gracefully', () => {
    expect(estimateComplexity({ agentType: 'grd-planner', recentSamples: [] })).toBe('high');
  });

  it('handles all-zero sample values without throwing', () => {
    const samples = [
      { duration: 0, tokenEstimate: 0 },
      { duration: 0, tokenEstimate: 0 },
      { duration: 0, tokenEstimate: 0 },
    ];
    expect(estimateComplexity({ agentType: 'grd-executor', recentSamples: samples })).toBe('low');
  });
});

describe('AGENT_BASELINE_COMPLEXITY table', () => {
  it('has expected high-complexity agents', () => {
    expect(AGENT_BASELINE_COMPLEXITY['grd-planner']).toBe('high');
    expect(AGENT_BASELINE_COMPLEXITY['grd-roadmapper']).toBe('high');
  });

  it('has expected low-complexity agents', () => {
    expect(AGENT_BASELINE_COMPLEXITY['grd-verifier']).toBe('low');
    expect(AGENT_BASELINE_COMPLEXITY['grd-codebase-mapper']).toBe('low');
  });
});

describe('estimateComplexity with baselineOverride', () => {
  it('uses the override when provided, ignoring AGENT_BASELINE_COMPLEXITY', () => {
    expect(
      estimateComplexity({
        agentType: 'grd-planner',  // normally 'high'
        baselineOverride: 'low',
      }),
    ).toBe('low');
  });

  it('override still respects prompt-length promotion to high', () => {
    expect(
      estimateComplexity({
        agentType: 'grd-verifier',
        baselineOverride: 'low',
        promptLength: 25_000,
      }),
    ).toBe('high');
  });

  it('override with recent samples demotion', () => {
    const samples = [
      { duration: 100, tokenEstimate: 500 },
      { duration: 100, tokenEstimate: 500 },
      { duration: 100, tokenEstimate: 500 },
    ];
    // Override sets baseline to 'medium' — samples demote to 'low'
    expect(
      estimateComplexity({
        agentType: 'grd-planner',
        baselineOverride: 'medium',
        recentSamples: samples,
      }),
    ).toBe('low');
  });
});
