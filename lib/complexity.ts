'use strict';

/**
 * GRD Complexity -- Task complexity estimator for adaptive model-tier
 * routing.
 *
 * Pure function that takes an agent type + optional signals and returns
 * a ComplexityLevel ('low' | 'medium' | 'high'). Used by the Spec 4
 * adaptive routing chain before resolveModelForAgent.
 *
 * Does NOT read files, config, or scheduler state. All inputs are
 * pre-gathered by the caller.
 */

import type { ComplexityLevel } from './types';

/**
 * Baseline complexity per agent type, seeded from the existing
 * MODEL_PROFILES 'quality' tier as a proxy for "how much reasoning
 * does this agent typically need."
 */
export const AGENT_BASELINE_COMPLEXITY: Record<string, ComplexityLevel> = {
  'grd-planner': 'high',
  'grd-roadmapper': 'high',
  'grd-phase-researcher': 'high',
  'grd-product-owner': 'high',
  'grd-feasibility-analyst': 'high',
  'grd-surveyor': 'high',
  'grd-deep-diver': 'high',
  'grd-executor': 'medium',
  'grd-debugger': 'medium',
  'grd-integration-checker': 'medium',
  'grd-research-synthesizer': 'medium',
  'grd-project-researcher': 'medium',
  'grd-plan-checker': 'medium',
  'grd-migrator': 'medium',
  'grd-eval-planner': 'medium',
  'grd-codebase-mapper': 'low',
  'grd-verifier': 'low',
  'grd-baseline-assessor': 'low',
  'grd-knowledge-miner': 'low',
  'grd-code-reviewer': 'low',
  'grd-eval-reporter': 'low',
};

const PROMPT_LENGTH_HIGH_THRESHOLD = 20_000;
const SAMPLE_DEMOTE_HIGH_TO_MEDIUM = 3_000;
const SAMPLE_DEMOTE_MEDIUM_TO_LOW = 1_500;
const MIN_SAMPLES_FOR_DEMOTION = 3;

/**
 * Estimates task complexity based on agent type, prompt length, and
 * recent sample history. Returns 'low' | 'medium' | 'high'.
 *
 * Decision order:
 *   1. Start with AGENT_BASELINE_COMPLEXITY[agentType] or 'medium'
 *      if unknown.
 *   2. If promptLength > PROMPT_LENGTH_HIGH_THRESHOLD (20k chars),
 *      return 'high' regardless of baseline.
 *   3. If >= MIN_SAMPLES_FOR_DEMOTION recent samples and average
 *      tokenEstimate is small, demote by one level:
 *      - high → medium if avg < SAMPLE_DEMOTE_HIGH_TO_MEDIUM (3k)
 *      - medium → low if avg < SAMPLE_DEMOTE_MEDIUM_TO_LOW (1.5k)
 *      - low stays low
 *   4. Otherwise return baseline.
 */
export function estimateComplexity(opts: {
  agentType: string;
  promptLength?: number;
  recentSamples?: { duration: number; tokenEstimate: number }[];
}): ComplexityLevel {
  const baseline: ComplexityLevel =
    AGENT_BASELINE_COMPLEXITY[opts.agentType] || 'medium';

  if (
    opts.promptLength !== undefined &&
    opts.promptLength > PROMPT_LENGTH_HIGH_THRESHOLD
  ) {
    return 'high';
  }

  if (
    opts.recentSamples &&
    opts.recentSamples.length >= MIN_SAMPLES_FOR_DEMOTION
  ) {
    const avgTokens =
      opts.recentSamples.reduce((sum, s) => sum + s.tokenEstimate, 0) /
      opts.recentSamples.length;
    if (baseline === 'high' && avgTokens < SAMPLE_DEMOTE_HIGH_TO_MEDIUM) {
      return 'medium';
    }
    if (baseline === 'medium' && avgTokens < SAMPLE_DEMOTE_MEDIUM_TO_LOW) {
      return 'low';
    }
  }

  return baseline;
}

module.exports = {
  estimateComplexity,
  AGENT_BASELINE_COMPLEXITY,
};
