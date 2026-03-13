'use strict';

import type { BackendId, BackendAdapter, BackendUsageState, UsageSample, SpawnOpts } from './types';

// ─── Per-backend CLI Adapters ─────────────────────────────────────────────────

/**
 * Map of backend adapters for all supported CLI backends.
 * Each adapter encapsulates binary name, argument building, token parsing,
 * and rate-limit detection for a specific backend CLI.
 */
export const ADAPTERS: Record<BackendId, BackendAdapter> = {
  claude: {
    binary: 'claude',
    buildArgs(prompt: string, opts: SpawnOpts): string[] {
      const args = ['-p', prompt, '--verbose', '--dangerously-skip-permissions'];
      if (opts.maxTurns) {
        args.push('--max-turns', String(opts.maxTurns));
      }
      if (opts.model) {
        args.push('--model', opts.model);
      }
      args.push('--output-format', 'json');
      return args;
    },
    parseTokenUsage(stderr: string): number | null {
      const totalMatch = stderr.match(/[Tt]otal.tokens:\s*(\d+)/);
      if (totalMatch) return parseInt(totalMatch[1], 10);
      const inputMatch = stderr.match(/input_tokens:\s*(\d+)/);
      const outputMatch = stderr.match(/output_tokens:\s*(\d+)/);
      if (inputMatch && outputMatch) {
        return parseInt(inputMatch[1], 10) + parseInt(outputMatch[1], 10);
      }
      return null;
    },
    isRateLimited(exitCode: number, stderr: string): boolean {
      if (exitCode === 0) return false;
      return /rate.limit|429|overloaded_error|too many requests/i.test(stderr);
    },
  },

  codex: {
    binary: 'codex',
    buildArgs(prompt: string, opts: SpawnOpts): string[] {
      const args = ['--prompt', prompt, '--approval-mode', 'full-auto'];
      if (opts.model) {
        args.push('--model', opts.model);
      }
      return args;
    },
    parseTokenUsage(stderr: string): number | null {
      const match = stderr.match(/"total_tokens":\s*(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited(_exitCode: number, stderr: string): boolean {
      return /rate.limit|429|rate_limit_exceeded/i.test(stderr);
    },
  },

  gemini: {
    binary: 'gemini',
    buildArgs(prompt: string, opts: SpawnOpts): string[] {
      const args = ['-p', prompt, '--sandbox', 'off'];
      if (opts.model) {
        args.push('--model', opts.model);
      }
      return args;
    },
    parseTokenUsage(stderr: string): number | null {
      const match = stderr.match(/tokenCount["\s:]*(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited(_exitCode: number, stderr: string): boolean {
      return /rate.limit|429|RESOURCE_EXHAUSTED|quota/i.test(stderr);
    },
  },

  opencode: {
    binary: 'opencode',
    buildArgs(prompt: string, opts: SpawnOpts): string[] {
      const args = ['--non-interactive', '--prompt', prompt];
      if (opts.model) {
        args.push('--model', opts.model);
      }
      return args;
    },
    parseTokenUsage(stderr: string): number | null {
      const match = stderr.match(/(?:total_tokens|tokens?.used)[\s:"]*(\d+)/i);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited(_exitCode: number, stderr: string): boolean {
      return /rate.limit|429|too many requests|quota/i.test(stderr);
    },
  },

  overstory: {
    binary: 'ov',
    buildArgs(prompt: string, opts: SpawnOpts): string[] {
      const args = ['run', '--prompt', prompt];
      if (opts.model) {
        args.push('--model', opts.model);
      }
      return args;
    },
    parseTokenUsage(stderr: string): number | null {
      const match = stderr.match(/tokens?:\s*(\d+)/i);
      return match ? parseInt(match[1], 10) : null;
    },
    isRateLimited(_exitCode: number, stderr: string): boolean {
      return /rate.limit|429|quota/i.test(stderr);
    },
  },
};

// ─── EWMA and Rolling Window ──────────────────────────────────────────────────

/** Default token-per-minute budget for backends with no explicit limit configured. */
export const DEFAULT_BUDGET_TPM = 40000;

/** Token-per-minute budget for the free-fallback backend (effectively unlimited). */
export const FREE_FALLBACK_BUDGET = 1000000;

/**
 * Creates a fresh BackendUsageState with the given token budget.
 *
 * @param tokenBudget - tokens-per-minute budget for this backend
 * @returns initialized state with zeroed counters
 */
export function createBackendState(tokenBudget: number): BackendUsageState {
  return {
    samples: [],
    ewma_tokens_per_task: 0,
    tokens_consumed_in_window: 0,
    tokens_reserved: 0,
    in_flight_count: 0,
    token_budget: tokenBudget,
    budget_learned: false,
    budget_confidence: 0,
    cooldown_until: undefined,
  };
}

/**
 * Updates the EWMA estimate in-place with a new token observation.
 * On first observation (ewma === 0), sets directly to the observed value.
 *
 * @param state - backend usage state to update
 * @param tokens - observed token count for the latest task
 * @param alpha - EWMA smoothing factor (0 < alpha < 1)
 */
export function updateEWMA(state: BackendUsageState, tokens: number, alpha: number): void {
  if (state.ewma_tokens_per_task === 0) {
    state.ewma_tokens_per_task = tokens;
  } else {
    state.ewma_tokens_per_task = alpha * tokens + (1 - alpha) * state.ewma_tokens_per_task;
  }
}

/**
 * Removes samples older than windowMinutes from state and recalculates
 * tokens_consumed_in_window from the remaining samples.
 *
 * @param state - backend usage state to mutate
 * @param windowMinutes - rolling window duration in minutes
 */
export function evictExpiredSamples(state: BackendUsageState, windowMinutes: number): void {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  state.samples = state.samples.filter((s) => s.timestamp >= cutoff);
  state.tokens_consumed_in_window = state.samples.reduce((sum, s) => sum + s.tokenEstimate, 0);
}

/**
 * Records a completed usage sample, evicts stale samples from the window,
 * updates EWMA, and recalculates budget_confidence.
 *
 * @param state - backend usage state to update
 * @param sample - new usage sample to record
 * @param windowMinutes - rolling window duration in minutes
 * @param alpha - EWMA smoothing factor
 */
export function recordSample(
  state: BackendUsageState,
  sample: UsageSample,
  windowMinutes: number,
  alpha: number,
): void {
  state.samples.push(sample);
  evictExpiredSamples(state, windowMinutes);
  state.tokens_consumed_in_window = state.samples.reduce((sum, s) => sum + s.tokenEstimate, 0);
  updateEWMA(state, sample.tokenEstimate, alpha);
  state.budget_confidence = 1 - 1 / (1 + state.samples.length * 0.2);
}

// ─── Backend Picker with Concurrency Accounting ───────────────────────────────

/**
 * Selects the highest-priority backend that has sufficient token headroom.
 * Skips backends in cooldown or without enough remaining capacity (accounting
 * for in-flight reservations). Falls back to freeFallback if none qualify.
 *
 * @param priority - ordered list of backend IDs to try
 * @param states - map of backend ID to usage state
 * @param safetyMargin - minimum remaining tasks before a backend is considered full
 * @param freeFallback - fallback backend used when all priority backends are exhausted
 * @returns selected BackendId
 */
export function pickBackend(
  priority: BackendId[],
  states: Map<string, BackendUsageState>,
  safetyMargin: number,
  freeFallback: { backend: BackendId },
): BackendId {
  const now = Date.now();
  for (const backend of priority) {
    const state = states.get(backend);
    if (!state) continue;
    if (state.cooldown_until && state.cooldown_until > now) continue;
    if (state.ewma_tokens_per_task === 0) return backend;
    const effective = state.tokens_consumed_in_window + state.tokens_reserved;
    const remaining = state.token_budget - effective;
    const tasksRemaining = remaining / state.ewma_tokens_per_task;
    if (tasksRemaining >= safetyMargin) return backend;
  }
  return freeFallback.backend;
}

/**
 * Marks one task as in-flight, incrementing the in-flight counter and
 * reserving the EWMA-predicted token cost.
 *
 * @param state - backend usage state to mutate
 */
export function markInFlight(state: BackendUsageState): void {
  state.in_flight_count += 1;
  state.tokens_reserved += state.ewma_tokens_per_task;
}

/**
 * Marks one in-flight task as complete, decrementing the counter and
 * recalculating tokens_reserved from the updated in-flight count.
 *
 * @param state - backend usage state to mutate
 */
export function markComplete(state: BackendUsageState): void {
  state.in_flight_count = Math.max(0, state.in_flight_count - 1);
  state.tokens_reserved = state.ewma_tokens_per_task * state.in_flight_count;
}

module.exports = {
  ADAPTERS,
  DEFAULT_BUDGET_TPM,
  FREE_FALLBACK_BUDGET,
  createBackendState,
  updateEWMA,
  evictExpiredSamples,
  recordSample,
  pickBackend,
  markInFlight,
  markComplete,
};
