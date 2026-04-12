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

/**
 * Configurable thresholds for estimateComplexity's internal heuristics.
 * All fields are optional; unspecified fields use DEFAULT_HEURISTICS values.
 */
export interface ComplexityHeuristics {
  prompt_length_high_threshold?: number;
  sample_demote_high_to_medium?: number;
  sample_demote_medium_to_low?: number;
  min_samples_for_demotion?: number;
}

/** Default values matching the previously hardcoded constants. */
const DEFAULT_HEURISTICS: Required<ComplexityHeuristics> = {
  prompt_length_high_threshold: 20_000,
  sample_demote_high_to_medium: 3_000,
  sample_demote_medium_to_low: 1_500,
  min_samples_for_demotion: 3,
};

/**
 * Estimates task complexity based on agent type, prompt length, and
 * recent sample history. Returns 'low' | 'medium' | 'high'.
 *
 * Decision order:
 *   1. Start with baselineOverride (if provided), else
 *      AGENT_BASELINE_COMPLEXITY[agentType], else 'medium'.
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
  baselineOverride?: ComplexityLevel;
  heuristics?: ComplexityHeuristics;
}): ComplexityLevel {
  const h: Required<ComplexityHeuristics> = {
    ...DEFAULT_HEURISTICS,
    ...(opts.heuristics || {}),
  };

  const baseline: ComplexityLevel =
    opts.baselineOverride ?? AGENT_BASELINE_COMPLEXITY[opts.agentType] ?? 'medium';

  if (opts.promptLength !== undefined && opts.promptLength > h.prompt_length_high_threshold) {
    return 'high';
  }

  if (opts.recentSamples && opts.recentSamples.length >= h.min_samples_for_demotion) {
    const avgTokens =
      opts.recentSamples.reduce((sum, s) => sum + s.tokenEstimate, 0) / opts.recentSamples.length;
    if (baseline === 'high' && avgTokens < h.sample_demote_high_to_medium) {
      return 'medium';
    }
    if (baseline === 'medium' && avgTokens < h.sample_demote_medium_to_low) {
      return 'low';
    }
  }

  return baseline;
}

module.exports = {
  estimateComplexity,
  AGENT_BASELINE_COMPLEXITY,
};
