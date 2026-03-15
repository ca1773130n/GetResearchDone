'use strict';

import type {
  BackendId,
  AdapterBackendId,
  BackendAdapter,
  BackendUsageState,
  UsageSample,
  SpawnOpts,
  AccountResolution,
  SuperpowersConfig,
  SchedulerConfig,
  SchedulerSpawnResult,
} from './types';

// ─── Per-backend CLI Adapters ─────────────────────────────────────────────────

/**
 * Map of backend adapters for all supported CLI backends.
 * Each adapter encapsulates binary name, argument building, token parsing,
 * and rate-limit detection for a specific backend CLI.
 *
 * Meta-backends (superpowers, grd) are not included — they are scheduling
 * strategies that resolve to one of these real adapters at spawn time.
 */
const _claudeAdapter: BackendAdapter = {
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
};

export const ADAPTERS: Record<AdapterBackendId, BackendAdapter> = {
  claude: _claudeAdapter,

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

/**
 * Maps each adapter backend to its config-directory environment variable.
 * Used by account rotation to override which account a CLI binary uses.
 */
const ENV_VAR_MAP: Record<AdapterBackendId, string> = {
  claude: 'CLAUDE_CONFIG_DIR',
  codex: 'CODEX_HOME',
  gemini: 'GEMINI_CLI_HOME',
  opencode: 'OPENCODE_CONFIG_DIR',
  overstory: 'OVERSTORY_HOME',
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

// ─── Account Resolution Waterfall ─────────────────────────────────────────────

/**
 * Checks whether a single account state key has sufficient headroom for
 * scheduling, considering EWMA prediction, in-flight reservations, and cooldown.
 *
 * @param state - the account's usage state
 * @param safetyMargin - minimum remaining tasks before considered full
 * @returns true if the account has capacity or no EWMA data yet
 */
function _hasHeadroom(state: BackendUsageState, safetyMargin: number): boolean {
  const now = Date.now();
  if (state.cooldown_until && state.cooldown_until > now) return false;
  if (state.ewma_tokens_per_task === 0) return true;
  const effective = state.tokens_consumed_in_window + state.tokens_reserved;
  const remaining = state.token_budget - effective;
  const tasksRemaining = remaining / state.ewma_tokens_per_task;
  return tasksRemaining >= safetyMargin;
}

/**
 * Resolves which backend and account to use for the next scheduled task.
 * Walks the backend_priority list, and within each backend tries every
 * configured account in order. Falls back to the free_fallback backend
 * when all priority accounts are exhausted.
 *
 * Edge cases:
 * - Empty accounts ({}) — returns default_backend with no config dir override
 * - Empty account array ([]) — skips that backend
 * - Backend in priority but missing from accounts — skipped
 *
 * @param superpowersConfig - superpowers configuration with accounts
 * @param schedulerConfig - scheduler configuration with priority and fallback
 * @param states - map of compound state keys to usage state
 * @param safetyMargin - minimum remaining tasks before an account is considered full
 * @returns resolved backend, account, and state key
 */
export function resolveAccount(
  superpowersConfig: SuperpowersConfig,
  schedulerConfig: SchedulerConfig,
  states: Map<string, BackendUsageState>,
  safetyMargin: number,
): AccountResolution {
  const accounts = superpowersConfig.accounts;

  // Edge case: accounts is empty — use default_backend with no config dir
  const hasAnyAccounts = Object.keys(accounts).some(
    (k) => (accounts[k as AdapterBackendId] || []).length > 0,
  );
  if (!hasAnyAccounts) {
    return {
      backend: superpowersConfig.default_backend as AdapterBackendId,
      account: { config_dir: '' },
      stateKey: superpowersConfig.default_backend,
    };
  }

  // Walk priority list, try each account within each backend
  for (const backend of schedulerConfig.backend_priority) {
    const backendAccounts = accounts[backend];
    if (!backendAccounts || backendAccounts.length === 0) continue;

    for (const account of backendAccounts) {
      const stateKey = `${backend}/${account.config_dir}`;
      const state = states.get(stateKey);
      if (!state) continue;
      if (_hasHeadroom(state, safetyMargin)) {
        return { backend, account, stateKey };
      }
    }
  }

  // Exhaustion fallback: use free_fallback backend
  const fallbackBackend = schedulerConfig.free_fallback.backend;
  const fallbackAccounts = accounts[fallbackBackend];
  if (fallbackAccounts && fallbackAccounts.length > 0) {
    return {
      backend: fallbackBackend,
      account: fallbackAccounts[0],
      stateKey: `${fallbackBackend}/${fallbackAccounts[0].config_dir}`,
    };
  }

  // No accounts configured for fallback — use default account (empty config_dir)
  return {
    backend: fallbackBackend,
    account: { config_dir: '' },
    stateKey: fallbackBackend,
  };
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

// ─── Shared Helpers ──────────────────────────────────────────────────────────

/**
 * Checks whether a CLI binary is available on the system PATH.
 */
export function checkBinary(binary: string): boolean {
  try {
    const { execFileSync } = require('child_process') as typeof import('child_process');
    execFileSync('which', [binary], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ─── Scheduler Interface and Factory ─────────────────────────────────────────

/**
 * High-level scheduler that selects backends, spawns CLI processes,
 * records usage samples, and persists learned state across sessions.
 */
export interface Scheduler {
  spawn(prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult>;
  getState(stateKey: string): BackendUsageState | undefined;
  recordExternalSample(stateKey: string, sample: UsageSample): void;
  persistState(planningDir: string): void;
  loadPersistedState(planningDir: string): void;
}

/**
 * Initializes per-account states when account rotation is enabled.
 * Creates a BackendUsageState for each account across all priority backends
 * and the fallback backend, using compound keys like "claude/~/.claude-personal".
 *
 * @param states - state map to populate
 * @param schedulerConfig - scheduler configuration with priority and fallback
 * @param superpowersConfig - superpowers configuration with accounts
 */
function _initAccountStates(
  states: Map<string, BackendUsageState>,
  schedulerConfig: SchedulerConfig,
  superpowersConfig: SuperpowersConfig,
): void {
  const accounts = superpowersConfig.accounts;
  const allBackends = new Set([
    ...schedulerConfig.backend_priority,
    schedulerConfig.free_fallback.backend,
  ]);

  for (const backend of allBackends) {
    const backendAccounts = accounts[backend];
    if (!backendAccounts || backendAccounts.length === 0) continue;

    const limit = schedulerConfig.backend_limits?.[backend]?.tpm;
    const isFallback = backend === schedulerConfig.free_fallback.backend;
    const budget = limit ?? (isFallback ? FREE_FALLBACK_BUDGET : DEFAULT_BUDGET_TPM);

    for (const account of backendAccounts) {
      const stateKey = `${backend}/${account.config_dir}`;
      states.set(stateKey, createBackendState(budget));
    }
  }
}

/**
 * Computes the maximum number of 429 retries allowed for account rotation.
 * Equals total number of accounts across all priority backends.
 *
 * @param schedulerConfig - scheduler configuration with priority
 * @param superpowersConfig - superpowers configuration with accounts
 * @returns maximum retry count
 */
function _computeMaxRetries(
  schedulerConfig: SchedulerConfig,
  superpowersConfig: SuperpowersConfig,
): number {
  let maxAccountsPerBackend = 0;
  for (const backend of schedulerConfig.backend_priority) {
    const backendAccounts = superpowersConfig.accounts[backend];
    if (backendAccounts) {
      maxAccountsPerBackend = Math.max(maxAccountsPerBackend, backendAccounts.length);
    }
  }
  return schedulerConfig.backend_priority.length * Math.max(maxAccountsPerBackend, 1);
}

/**
 * Creates a Scheduler instance from the given config, or returns null
 * when no config is provided (pass-through / disabled mode).
 *
 * When superpowersConfig is provided with account_rotation enabled, the
 * scheduler tracks per-account state and uses resolveAccount() for backend
 * selection. Otherwise, it uses the simple pickBackend() flow.
 *
 * @param config - scheduler configuration, or undefined to disable
 * @param superpowersConfig - optional superpowers configuration for account rotation
 * @returns Scheduler instance, or null if config is absent
 */
export function createScheduler(
  config: SchedulerConfig | undefined,
  superpowersConfig?: SuperpowersConfig,
): Scheduler | null {
  if (!config) return null;

  // Re-bind after guard so closures see the narrowed SchedulerConfig type
  const schedulerConfig = config;
  const states = new Map<string, BackendUsageState>();
  const prediction = schedulerConfig.prediction;
  const accountRotation = !!(superpowersConfig?.account_rotation);

  if (accountRotation && superpowersConfig) {
    // Per-account state initialization
    _initAccountStates(states, schedulerConfig, superpowersConfig);

    // Also initialize fallback backend with no config_dir for the exhaustion case
    const fallbackBackend = schedulerConfig.free_fallback.backend;
    if (!states.has(fallbackBackend)) {
      const limit = schedulerConfig.backend_limits?.[fallbackBackend]?.tpm;
      const budget = limit ?? FREE_FALLBACK_BUDGET;
      states.set(fallbackBackend, createBackendState(budget));
    }

    // If no accounts at all, initialize default_backend with no config_dir
    const hasAnyAccounts = Object.keys(superpowersConfig.accounts).some(
      (k) => (superpowersConfig.accounts[k as AdapterBackendId] || []).length > 0,
    );
    if (!hasAnyAccounts) {
      const defaultBackend = superpowersConfig.default_backend as AdapterBackendId;
      if (!states.has(defaultBackend)) {
        const limit = schedulerConfig.backend_limits?.[defaultBackend]?.tpm;
        const budget = limit ?? DEFAULT_BUDGET_TPM;
        states.set(defaultBackend, createBackendState(budget));
      }
    }
  } else {
    // Simple per-backend state initialization (existing behavior)
    const allBackends = [...schedulerConfig.backend_priority, schedulerConfig.free_fallback.backend];
    for (const backend of new Set(allBackends)) {
      const limit = schedulerConfig.backend_limits?.[backend]?.tpm;
      const isFallback = backend === schedulerConfig.free_fallback.backend;
      const budget = limit ?? (isFallback ? FREE_FALLBACK_BUDGET : DEFAULT_BUDGET_TPM);
      states.set(backend, createBackendState(budget));
    }
  }

  // Check which backend binaries are available
  const availableBackends = new Set<string>();
  const allBackendIds = new Set([...schedulerConfig.backend_priority, schedulerConfig.free_fallback.backend]);
  for (const backend of allBackendIds) {
    const adapter = ADAPTERS[backend];
    if (adapter && checkBinary(adapter.binary)) availableBackends.add(backend);
  }

  const maxRetries = accountRotation && superpowersConfig
    ? _computeMaxRetries(schedulerConfig, superpowersConfig)
    : schedulerConfig.backend_priority.length;

  /**
   * Internal spawn implementation with retry counter for 429 rate-limit retries.
   * Capped at maxRetries to prevent infinite loops when all accounts are exhausted.
   */
  async function _spawnWithRetry(
    prompt: string,
    opts: SpawnOpts,
    retryCount: number,
  ): Promise<SchedulerSpawnResult> {
    let backend: AdapterBackendId;
    let stateKey: string;
    const envOverrides: Record<string, string> = {};

    if (accountRotation && superpowersConfig) {
      // Account-rotation path: resolve backend + account
      const resolution = resolveAccount(
        superpowersConfig,
        schedulerConfig,
        states,
        prediction.safety_margin_tasks,
      );
      backend = resolution.backend;
      stateKey = resolution.stateKey;

      // Set env var for the account's config directory
      if (resolution.account.config_dir) {
        envOverrides[ENV_VAR_MAP[backend]] = resolution.account.config_dir;
      }
    } else {
      // Simple backend picker path (existing behavior)
      const filteredPriority = schedulerConfig.backend_priority.filter((b) => availableBackends.has(b));
      backend = pickBackend(
        filteredPriority,
        states,
        prediction.safety_margin_tasks,
        schedulerConfig.free_fallback,
      ) as AdapterBackendId;
      stateKey = backend;
    }

    const adapter = ADAPTERS[backend] || ADAPTERS.claude;
    const state = states.get(stateKey) || createBackendState(DEFAULT_BUDGET_TPM);
    const args = adapter.buildArgs(prompt, opts);
    const workItemId = opts.workItemId || `task-${Date.now()}`;

    markInFlight(state);
    const startTime = Date.now();

    try {
      const { execFile } = require('child_process') as typeof import('child_process');
      const result = await new Promise<SchedulerSpawnResult>((resolve) => {
        const child = execFile(
          adapter.binary,
          args,
          {
            cwd: opts.cwd || process.cwd(),
            maxBuffer: 50 * 1024 * 1024,
            timeout: opts.timeout || 120 * 60 * 1000,
            env: { ...process.env, ...envOverrides },
          },
          (error, stdout, stderr) => {
            const duration = Date.now() - startTime;
            const timedOut = !!(
              error && (error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
            );
            const exitCode = error ? (child.exitCode || 1) : 0;

            const tokens =
              adapter.parseTokenUsage(stderr || '') ?? Math.round(duration * 10);

            const sample: UsageSample = {
              backend: backend as BackendId,
              stateKey,
              timestamp: Date.now(),
              duration,
              tokenEstimate: tokens,
              exitCode,
              workItemId,
            };

            markComplete(state);
            recordSample(state, sample, prediction.window_minutes, prediction.ewma_alpha);

            // Periodic persistence: every 10 samples across all backends
            const totalSamples = Array.from(states.values()).reduce(
              (sum, s) => sum + s.samples.length,
              0,
            );
            if (totalSamples % 10 === 0 && opts.cwd) {
              const { join } = require('path') as typeof import('path');
              scheduler.persistState(join(opts.cwd, '.planning'));
            }

            resolve({
              exitCode,
              stdout: stdout || undefined,
              stderr: stderr || undefined,
              timedOut,
              backend: backend as BackendId,
              tokensUsed: tokens,
              workItemId,
            });
          },
        );
      });

      // Rate limit retry: if rate-limited despite prediction, cooldown and retry
      if (adapter.isRateLimited(result.exitCode, result.stderr || '')) {
        state.cooldown_until = Date.now() + prediction.window_minutes * 60 * 1000;

        // Max retry guard: cap recursive retries
        if (retryCount >= maxRetries) {
          return result; // Exhausted all retries, return last result
        }

        return _spawnWithRetry(prompt, opts, retryCount + 1);
      }

      return result;
    } catch (_err) {
      markComplete(state);
      return {
        exitCode: 1,
        timedOut: false,
        backend: backend as BackendId,
        tokensUsed: 0,
        workItemId,
      };
    }
  }

  const scheduler: Scheduler = {
    getState(stateKey: string): BackendUsageState | undefined {
      return states.get(stateKey);
    },

    recordExternalSample(stateKey: string, sample: UsageSample): void {
      let state = states.get(stateKey);
      if (!state) {
        state = createBackendState(DEFAULT_BUDGET_TPM);
        states.set(stateKey, state);
      }
      recordSample(state, sample, prediction.window_minutes, prediction.ewma_alpha);
    },

    async spawn(prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult> {
      return _spawnWithRetry(prompt, opts, 0);
    },

    persistState(planningDir: string): void {
      const { writeFileSync } = require('fs') as typeof import('fs');
      const { join } = require('path') as typeof import('path');
      const data: Record<string, unknown> = { version: 1, backends: {} };
      const backends = data.backends as Record<string, unknown>;
      for (const [key, state] of states) {
        backends[key] = {
          token_budget: state.token_budget,
          ewma_tokens_per_task: state.ewma_tokens_per_task,
          budget_learned: state.budget_learned,
          budget_confidence: state.budget_confidence,
          last_updated: Date.now(),
        };
      }
      writeFileSync(
        join(planningDir, 'scheduler-state.json'),
        JSON.stringify(data, null, 2) + '\n',
      );
    },

    loadPersistedState(planningDir: string): void {
      const { safeReadJSON }: { safeReadJSON: (p: string, d?: unknown) => unknown } = require('./utils');
      const { join } = require('path') as typeof import('path');
      const raw = safeReadJSON(join(planningDir, 'scheduler-state.json')) as {
        version?: number;
        backends?: Record<
          string,
          {
            token_budget: number;
            ewma_tokens_per_task: number;
            budget_learned: boolean;
            budget_confidence: number;
          }
        >;
      } | null;
      if (!raw || raw.version !== 1 || !raw.backends) return;
      for (const [key, saved] of Object.entries(raw.backends)) {
        const state = states.get(key);
        if (!state) continue;
        if (saved.budget_learned) state.token_budget = saved.token_budget;
        state.ewma_tokens_per_task = saved.ewma_tokens_per_task;
        state.budget_learned = saved.budget_learned;
        state.budget_confidence = saved.budget_confidence;
      }
    },
  };

  return scheduler;
}

module.exports = {
  ADAPTERS,
  ENV_VAR_MAP,
  DEFAULT_BUDGET_TPM,
  FREE_FALLBACK_BUDGET,
  checkBinary,
  createBackendState,
  updateEWMA,
  evictExpiredSamples,
  recordSample,
  pickBackend,
  resolveAccount,
  markInFlight,
  markComplete,
  createScheduler,
};
