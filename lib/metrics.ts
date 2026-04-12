'use strict';

/**
 * GRD Metrics -- In-memory counters for observability.
 *
 * Simple counter module. Each counter is a number keyed by an event
 * name. Reset on process start. Scheduler, phase-complete-llm, and
 * autopilot increment counters at event points; gd metrics reads
 * them.
 *
 * For persistent metrics across processes, see future spec —
 * current scope is single-process observability.
 */

const _counters: Map<string, number> = new Map();

/**
 * Increments the counter for the given event name by delta (default 1).
 * Creates the counter if it doesn't exist.
 */
export function incrementCounter(name: string, delta: number = 1): void {
  _counters.set(name, (_counters.get(name) || 0) + delta);
}

/**
 * Returns a snapshot of all counters as a plain object. Safe to call
 * repeatedly; does not reset counters.
 */
export function getCounters(): Record<string, number> {
  const snapshot: Record<string, number> = {};
  for (const [k, v] of _counters.entries()) {
    snapshot[k] = v;
  }
  return snapshot;
}

/**
 * Resets all counters to zero. Useful for tests; not currently exposed
 * via CLI.
 */
export function resetCounters(): void {
  _counters.clear();
}

module.exports = {
  incrementCounter,
  getCounters,
  resetCounters,
};
