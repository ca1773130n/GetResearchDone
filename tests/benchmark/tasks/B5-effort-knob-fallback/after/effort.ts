'use strict';
// Resolves an effort-scaled knob. An invalid effort value falls back to
// 'balanced' instead of crashing (config preserves invalid values with a warning).
export type EffortLevel = 'thrifty' | 'balanced' | 'deep';

export const EFFORT_PROFILES: Record<EffortLevel, Record<string, number>> = {
  thrifty: { candidates_per_plan_phase: 1 },
  balanced: { candidates_per_plan_phase: 3 },
  deep: { candidates_per_plan_phase: 7 },
};

export function resolveEffortKnob(config: { effort?: string }, knob: string): number {
  const raw = config.effort;
  const level: EffortLevel =
    raw !== undefined && Object.prototype.hasOwnProperty.call(EFFORT_PROFILES, raw)
      ? (raw as EffortLevel)
      : 'balanced';
  return EFFORT_PROFILES[level][knob];
}
