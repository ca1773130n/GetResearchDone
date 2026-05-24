'use strict';
// Resolves an effort-scaled knob. BUG: an invalid (but config-preserved)
// effort value indexes EFFORT_PROFILES[undefined] → TypeError at runtime.
export type EffortLevel = 'thrifty' | 'balanced' | 'deep';

export const EFFORT_PROFILES: Record<EffortLevel, Record<string, number>> = {
  thrifty: { candidates_per_plan_phase: 1 },
  balanced: { candidates_per_plan_phase: 3 },
  deep: { candidates_per_plan_phase: 7 },
};

export function resolveEffortKnob(config: { effort?: string }, knob: string): number {
  const level = (config.effort || 'balanced') as EffortLevel;
  return EFFORT_PROFILES[level][knob]; // crashes if effort='turbo'
}
