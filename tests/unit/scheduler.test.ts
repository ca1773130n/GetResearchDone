'use strict';

import type {
  SchedulerConfig,
  UsageSample,
  BackendUsageState,
  SchedulerSpawnResult,
  BackendAdapter,
  SpawnOpts,
  SuperpowersConfig,
  AdapterBackendId,
} from '../../lib/types';

import {
  ADAPTERS,
  createBackendState,
  updateEWMA,
  recordSample,
  evictExpiredSamples,
  pickBackend,
  resolveAccount,
  markInFlight,
  markComplete,
  createScheduler,
  ENV_VAR_MAP,
} from '../../lib/scheduler';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('scheduler types', () => {
  it('SchedulerConfig has required fields', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude', 'codex'],
      free_fallback: { backend: 'opencode', model: 'gemini-2.5-flash' },
      prediction: {
        window_minutes: 15,
        ewma_alpha: 0.3,
        safety_margin_tasks: 1.5,
        min_samples: 3,
      },
    };
    expect(config.backend_priority).toHaveLength(2);
  });

  it('UsageSample has required fields', () => {
    const sample: UsageSample = {
      backend: 'claude',
      timestamp: Date.now(),
      duration: 5000,
      tokenEstimate: 12000,
      exitCode: 0,
      workItemId: 'phase-1-plan',
    };
    expect(sample.backend).toBe('claude');
  });

  it('BackendUsageState tracks in-flight reservations', () => {
    const state: BackendUsageState = {
      samples: [],
      ewma_tokens_per_task: 10000,
      tokens_consumed_in_window: 0,
      tokens_reserved: 0,
      in_flight_count: 0,
      token_budget: 80000,
      budget_learned: false,
      budget_confidence: 0,
      cooldown_until: undefined,
    };
    expect(state.in_flight_count).toBe(0);
  });

  it('SchedulerSpawnResult matches SpawnResult optionality', () => {
    const result: SchedulerSpawnResult = {
      exitCode: 0,
      timedOut: false,
      backend: 'claude',
      tokensUsed: 12000,
      workItemId: 'test',
    };
    expect(result.stdout).toBeUndefined();
  });
});

describe('backend adapters', () => {
  describe('claude adapter', () => {
    it('parses "Total tokens: 12345" from stderr', () => {
      expect(ADAPTERS.claude.parseTokenUsage('Total tokens: 12345')).toBe(12345);
    });
    it('parses input_tokens + output_tokens from stderr', () => {
      const stderr = 'input_tokens: 8000, output_tokens: 4000';
      expect(ADAPTERS.claude.parseTokenUsage(stderr)).toBe(12000);
    });
    it('returns null when no token info found', () => {
      expect(ADAPTERS.claude.parseTokenUsage('no tokens here')).toBeNull();
    });
    it('detects rate limit from stderr', () => {
      expect(ADAPTERS.claude.isRateLimited(1, 'rate limit exceeded')).toBe(true);
      expect(ADAPTERS.claude.isRateLimited(1, 'overloaded_error')).toBe(true);
      expect(ADAPTERS.claude.isRateLimited(0, 'completed successfully')).toBe(false);
    });
    it('builds correct args', () => {
      const args = ADAPTERS.claude.buildArgs('test prompt', { model: 'opus' });
      expect(args).toContain('-p');
      expect(args).toContain('test prompt');
      expect(args).toContain('--model');
      expect(args).toContain('opus');
      expect(args).toContain('--dangerously-skip-permissions');
    });
  });
  describe('codex adapter', () => {
    it('parses total_tokens from JSON in stderr', () => {
      expect(ADAPTERS.codex.parseTokenUsage('"total_tokens": 9500')).toBe(9500);
    });
    it('detects rate limit', () => {
      expect(ADAPTERS.codex.isRateLimited(1, 'rate_limit_exceeded')).toBe(true);
    });
    it('builds correct args', () => {
      const args = ADAPTERS.codex.buildArgs('test prompt', {});
      expect(args).toContain('--prompt');
      expect(args).toContain('--approval-mode');
    });
  });
  describe('gemini adapter', () => {
    it('parses tokenCount from stderr', () => {
      expect(ADAPTERS.gemini.parseTokenUsage('tokenCount: 7000')).toBe(7000);
    });
    it('detects RESOURCE_EXHAUSTED', () => {
      expect(ADAPTERS.gemini.isRateLimited(1, 'RESOURCE_EXHAUSTED')).toBe(true);
    });
  });
  describe('opencode adapter', () => {
    it('parses total_tokens pattern', () => {
      expect(ADAPTERS.opencode.parseTokenUsage('total_tokens: 5000')).toBe(5000);
    });
    it('parses tokens_used pattern', () => {
      expect(ADAPTERS.opencode.parseTokenUsage('tokens used: 3000')).toBe(3000);
    });
  });
  describe('overstory adapter', () => {
    it('parses tokens from stderr', () => {
      expect(ADAPTERS.overstory.parseTokenUsage('tokens: 6000')).toBe(6000);
    });
    it('uses ov binary', () => {
      expect(ADAPTERS.overstory.binary).toBe('ov');
    });
  });
});

describe('EWMA prediction', () => {
  it('initializes with default values', () => {
    const state = createBackendState(80000);
    expect(state.ewma_tokens_per_task).toBe(0);
    expect(state.tokens_consumed_in_window).toBe(0);
    expect(state.token_budget).toBe(80000);
    expect(state.budget_learned).toBe(false);
  });
  it('computes EWMA correctly with alpha=0.3', () => {
    const state = createBackendState(80000);
    state.ewma_tokens_per_task = 10000;
    updateEWMA(state, 14000, 0.3);
    expect(state.ewma_tokens_per_task).toBe(11200);
  });
  it('sets EWMA to first value when no prior data', () => {
    const state = createBackendState(80000);
    updateEWMA(state, 12000, 0.3);
    expect(state.ewma_tokens_per_task).toBe(12000);
  });
  it('evicts samples older than window', () => {
    const state = createBackendState(80000);
    const now = Date.now();
    state.samples = [
      { backend: 'claude', timestamp: now - 20 * 60 * 1000, duration: 5000, tokenEstimate: 10000, exitCode: 0, workItemId: 'old' },
      { backend: 'claude', timestamp: now - 5 * 60 * 1000, duration: 5000, tokenEstimate: 12000, exitCode: 0, workItemId: 'recent' },
    ];
    state.tokens_consumed_in_window = 22000;
    evictExpiredSamples(state, 15);
    expect(state.samples).toHaveLength(1);
    expect(state.samples[0].workItemId).toBe('recent');
    expect(state.tokens_consumed_in_window).toBe(12000);
  });
  it('recordSample updates consumed tokens and EWMA', () => {
    const state = createBackendState(80000);
    const sample = { backend: 'claude' as const, timestamp: Date.now(), duration: 5000, tokenEstimate: 10000, exitCode: 0, workItemId: 'test-1' };
    recordSample(state, sample, 15, 0.3);
    expect(state.tokens_consumed_in_window).toBe(10000);
    expect(state.ewma_tokens_per_task).toBe(10000);
    expect(state.samples).toHaveLength(1);
  });
  it('budget_confidence increases with sample count', () => {
    const state = createBackendState(80000);
    state.samples = new Array(5).fill(null).map((_, i) => ({
      backend: 'claude' as const, timestamp: Date.now(), duration: 5000, tokenEstimate: 10000, exitCode: 0, workItemId: `test-${i}`,
    }));
    expect(state.budget_confidence).toBe(0);
    recordSample(state, state.samples[0], 15, 0.3);
    expect(state.budget_confidence).toBeGreaterThan(0);
  });
});

describe('backend selection', () => {
  function makeStates(): Map<string, BackendUsageState> {
    const states = new Map<string, BackendUsageState>();
    const claude = createBackendState(80000);
    claude.tokens_consumed_in_window = 70000;
    claude.ewma_tokens_per_task = 10000;
    states.set('claude', claude);
    const codex = createBackendState(100000);
    codex.tokens_consumed_in_window = 20000;
    codex.ewma_tokens_per_task = 10000;
    states.set('codex', codex);
    return states;
  }
  it('picks first backend with sufficient headroom', () => {
    const states = makeStates();
    const result = pickBackend(['claude', 'codex'], states, 1.5, { backend: 'opencode' });
    expect(result).toBe('codex');
  });
  it('falls back to free_fallback when all backends exhausted', () => {
    const states = makeStates();
    states.get('codex')!.tokens_consumed_in_window = 95000;
    const result = pickBackend(['claude', 'codex'], states, 1.5, { backend: 'opencode' });
    expect(result).toBe('opencode');
  });
  it('skips backends in cooldown', () => {
    const states = makeStates();
    states.get('codex')!.cooldown_until = Date.now() + 60000;
    const result = pickBackend(['codex', 'claude'], states, 1.5, { backend: 'opencode' });
    expect(result).toBe('opencode');
  });
});

describe('concurrency accounting', () => {
  it('markInFlight reserves tokens', () => {
    const state = createBackendState(80000);
    state.ewma_tokens_per_task = 10000;
    markInFlight(state);
    expect(state.in_flight_count).toBe(1);
    expect(state.tokens_reserved).toBe(10000);
  });
  it('markComplete recalculates tokens_reserved', () => {
    const state = createBackendState(80000);
    state.ewma_tokens_per_task = 10000;
    state.in_flight_count = 3;
    state.tokens_reserved = 30000;
    markComplete(state);
    expect(state.in_flight_count).toBe(2);
    expect(state.tokens_reserved).toBe(20000);
  });
  it('markInFlight accounts for reserved tokens in headroom', () => {
    const states = new Map<string, BackendUsageState>();
    const claude = createBackendState(80000);
    claude.tokens_consumed_in_window = 50000;
    claude.ewma_tokens_per_task = 10000;
    claude.tokens_reserved = 20000;
    claude.in_flight_count = 2;
    states.set('claude', claude);
    const result = pickBackend(['claude'], states, 1.5, { backend: 'opencode' });
    expect(result).toBe('opencode');
  });
});

describe('createScheduler', () => {
  it('returns null in pass-through mode when no config', () => {
    const scheduler = createScheduler(undefined);
    expect(scheduler).toBeNull();
  });

  it('creates scheduler with config', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude' as const, 'codex' as const],
      free_fallback: { backend: 'opencode' as const },
      backend_limits: { claude: { tpm: 80000 }, codex: { tpm: 100000 } },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
    };
    const scheduler = createScheduler(config);
    expect(scheduler).not.toBeNull();
    expect(scheduler!.getState('claude')).toBeDefined();
    expect(scheduler!.getState('codex')).toBeDefined();
  });

  it('uses default budget 40000 when backend_limits not specified', () => {
    const config: SchedulerConfig = {
      backend_priority: ['gemini' as const],
      free_fallback: { backend: 'opencode' as const },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
    };
    const scheduler = createScheduler(config);
    expect(scheduler!.getState('gemini')!.token_budget).toBe(40000);
  });
});

describe('state persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists and reloads learned budgets', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude' as const],
      free_fallback: { backend: 'opencode' as const },
      backend_limits: { claude: { tpm: 80000 } },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
    };
    const scheduler = createScheduler(config)!;

    const state = scheduler.getState('claude')!;
    state.ewma_tokens_per_task = 12345;
    state.budget_learned = true;
    state.budget_confidence = 0.7;

    scheduler.persistState(tmpDir);

    const scheduler2 = createScheduler(config)!;
    scheduler2.loadPersistedState(tmpDir);
    const reloaded = scheduler2.getState('claude')!;
    expect(reloaded.ewma_tokens_per_task).toBe(12345);
    expect(reloaded.budget_learned).toBe(true);
    expect(reloaded.budget_confidence).toBe(0.7);
  });

  it('handles missing persistence file gracefully', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude' as const],
      free_fallback: { backend: 'opencode' as const },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
    };
    const scheduler = createScheduler(config)!;
    scheduler.loadPersistedState(tmpDir);
    expect(scheduler.getState('claude')!.ewma_tokens_per_task).toBe(0);
  });
});

// ─── Account-aware scheduling ─────────────────────────────────────────────────

describe('Account-aware scheduling', () => {
  // Shared helpers for constructing test configs
  function makeSchedulerConfig(overrides?: Partial<SchedulerConfig>): SchedulerConfig {
    return {
      backend_priority: ['claude', 'codex'],
      free_fallback: { backend: 'opencode' },
      backend_limits: { claude: { tpm: 80000 }, codex: { tpm: 100000 } },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
      ...overrides,
    };
  }

  function makeSuperpowersConfig(overrides?: Partial<SuperpowersConfig>): SuperpowersConfig {
    return {
      default_backend: 'claude',
      account_rotation: true,
      accounts: {
        claude: [
          { config_dir: '~/.claude-personal' },
          { config_dir: '~/.claude-work' },
        ],
        codex: [
          { config_dir: '~/.codex-main' },
        ],
      },
      ...overrides,
    };
  }

  function makeAccountStates(
    superpowersConfig: SuperpowersConfig,
    schedulerConfig: SchedulerConfig,
  ): Map<string, BackendUsageState> {
    const states = new Map<string, BackendUsageState>();
    const accounts = superpowersConfig.accounts;

    for (const backend of schedulerConfig.backend_priority) {
      const backendAccounts = accounts[backend];
      if (!backendAccounts) continue;
      const limit = schedulerConfig.backend_limits?.[backend]?.tpm;
      const budget = limit ?? 40000;
      for (const account of backendAccounts) {
        states.set(`${backend}/${account.config_dir}`, createBackendState(budget));
      }
    }

    // Also initialize fallback if it has accounts
    const fallbackBackend = schedulerConfig.free_fallback.backend;
    const fallbackAccounts = accounts[fallbackBackend];
    if (fallbackAccounts) {
      for (const account of fallbackAccounts) {
        states.set(`${fallbackBackend}/${account.config_dir}`, createBackendState(1000000));
      }
    }

    return states;
  }

  describe('resolveAccount', () => {
    it('should select first account with headroom', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const states = makeAccountStates(superpowersConfig, schedulerConfig);

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      expect(result.backend).toBe('claude');
      expect(result.account.config_dir).toBe('~/.claude-personal');
      expect(result.stateKey).toBe('claude/~/.claude-personal');
    });

    it('should skip backends with no accounts configured', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig({
        accounts: {
          // claude has no accounts
          codex: [{ config_dir: '~/.codex-main' }],
        },
      });
      const states = makeAccountStates(superpowersConfig, schedulerConfig);

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      expect(result.backend).toBe('codex');
      expect(result.account.config_dir).toBe('~/.codex-main');
    });

    it('should skip accounts in cooldown', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const states = makeAccountStates(superpowersConfig, schedulerConfig);

      // Put both claude accounts in cooldown
      states.get('claude/~/.claude-personal')!.cooldown_until = Date.now() + 60000;
      states.get('claude/~/.claude-work')!.cooldown_until = Date.now() + 60000;

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      expect(result.backend).toBe('codex');
      expect(result.account.config_dir).toBe('~/.codex-main');
    });

    it('should skip accounts without headroom', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const states = makeAccountStates(superpowersConfig, schedulerConfig);

      // Exhaust both claude accounts (consumed nearly all of 80000 budget)
      const claudePersonal = states.get('claude/~/.claude-personal')!;
      claudePersonal.tokens_consumed_in_window = 75000;
      claudePersonal.ewma_tokens_per_task = 10000;

      const claudeWork = states.get('claude/~/.claude-work')!;
      claudeWork.tokens_consumed_in_window = 75000;
      claudeWork.ewma_tokens_per_task = 10000;

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      expect(result.backend).toBe('codex');
      expect(result.account.config_dir).toBe('~/.codex-main');
    });

    it('should fall back to free_fallback when all accounts exhausted', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const states = makeAccountStates(superpowersConfig, schedulerConfig);

      // Exhaust ALL accounts across ALL priority backends
      for (const [_key, state] of states) {
        state.tokens_consumed_in_window = state.token_budget - 1000;
        state.ewma_tokens_per_task = 10000;
      }

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      // opencode is the free_fallback and has no accounts, so should fall through
      expect(result.backend).toBe('opencode');
      expect(result.account.config_dir).toBe('');
    });

    it('should handle empty accounts object (use default_backend with no config dir)', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig({
        accounts: {},
      });
      const states = new Map<string, BackendUsageState>();

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      expect(result.backend).toBe('claude'); // default_backend
      expect(result.account.config_dir).toBe('');
      expect(result.stateKey).toBe('claude');
    });

    it('should handle empty account array for a backend (skip it)', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig({
        accounts: {
          claude: [], // empty array
          codex: [{ config_dir: '~/.codex-main' }],
        },
      });
      const states = new Map<string, BackendUsageState>();
      states.set('codex/~/.codex-main', createBackendState(100000));

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      expect(result.backend).toBe('codex');
      expect(result.account.config_dir).toBe('~/.codex-main');
    });

    it('should handle backend in priority but missing from accounts (skip it)', () => {
      const schedulerConfig = makeSchedulerConfig({
        backend_priority: ['claude', 'codex', 'gemini'],
      });
      const superpowersConfig = makeSuperpowersConfig({
        accounts: {
          // claude and gemini are in priority but only codex has accounts
          codex: [{ config_dir: '~/.codex-main' }],
        },
      });
      const states = new Map<string, BackendUsageState>();
      states.set('codex/~/.codex-main', createBackendState(100000));

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      expect(result.backend).toBe('codex');
    });

    it('should use first fallback account if fallback backend has accounts', () => {
      const schedulerConfig = makeSchedulerConfig({
        free_fallback: { backend: 'opencode' },
      });
      const superpowersConfig = makeSuperpowersConfig({
        accounts: {
          claude: [{ config_dir: '~/.claude-personal' }],
          opencode: [
            { config_dir: '~/.opencode-1' },
            { config_dir: '~/.opencode-2' },
          ],
        },
      });
      const states = new Map<string, BackendUsageState>();
      const claudeState = createBackendState(80000);
      claudeState.tokens_consumed_in_window = 79000;
      claudeState.ewma_tokens_per_task = 10000;
      states.set('claude/~/.claude-personal', claudeState);

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      expect(result.backend).toBe('opencode');
      expect(result.account.config_dir).toBe('~/.opencode-1');
      expect(result.stateKey).toBe('opencode/~/.opencode-1');
    });

    it('should use empty config_dir if fallback backend has no accounts', () => {
      const schedulerConfig = makeSchedulerConfig({
        free_fallback: { backend: 'opencode' },
      });
      const superpowersConfig = makeSuperpowersConfig({
        accounts: {
          claude: [{ config_dir: '~/.claude-personal' }],
          // no opencode accounts
        },
      });
      const states = new Map<string, BackendUsageState>();
      const claudeState = createBackendState(80000);
      claudeState.tokens_consumed_in_window = 79000;
      claudeState.ewma_tokens_per_task = 10000;
      states.set('claude/~/.claude-personal', claudeState);

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      expect(result.backend).toBe('opencode');
      expect(result.account.config_dir).toBe('');
      expect(result.stateKey).toBe('opencode');
    });
  });

  describe('per-account state', () => {
    it('should initialize per-account states with compound keys', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      // Should have compound keys for each account
      expect(scheduler.getState('claude/~/.claude-personal')).toBeDefined();
      expect(scheduler.getState('claude/~/.claude-work')).toBeDefined();
      expect(scheduler.getState('codex/~/.codex-main')).toBeDefined();

      // Simple backend keys should NOT exist (account rotation mode uses compound keys)
      // The fallback backend gets a simple key as exhaustion fallback
      expect(scheduler.getState('opencode')).toBeDefined();
    });

    it('should track EWMA independently per account', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      // Record different samples to different accounts
      const sample1: UsageSample = {
        backend: 'claude',
        stateKey: 'claude/~/.claude-personal',
        timestamp: Date.now(),
        duration: 5000,
        tokenEstimate: 20000,
        exitCode: 0,
        workItemId: 'task-1',
      };
      const sample2: UsageSample = {
        backend: 'claude',
        stateKey: 'claude/~/.claude-work',
        timestamp: Date.now(),
        duration: 5000,
        tokenEstimate: 5000,
        exitCode: 0,
        workItemId: 'task-2',
      };

      scheduler.recordExternalSample('claude/~/.claude-personal', sample1);
      scheduler.recordExternalSample('claude/~/.claude-work', sample2);

      const personal = scheduler.getState('claude/~/.claude-personal')!;
      const work = scheduler.getState('claude/~/.claude-work')!;

      expect(personal.ewma_tokens_per_task).toBe(20000);
      expect(work.ewma_tokens_per_task).toBe(5000);
      // They should be independent
      expect(personal.ewma_tokens_per_task).not.toBe(work.ewma_tokens_per_task);
    });

    it('should use stateKey for state lookup instead of backend name', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      // The state is keyed by compound key, not simple backend name
      const stateByBackend = scheduler.getState('claude');
      const stateByKey = scheduler.getState('claude/~/.claude-personal');

      // Simple 'claude' key should not exist when account_rotation is on
      // (only compound keys exist for priority backends)
      expect(stateByBackend).toBeUndefined();
      expect(stateByKey).toBeDefined();
      expect(stateByKey!.token_budget).toBe(80000);
    });
  });

  describe('ENV_VAR_MAP', () => {
    it('should map all adapter backends to env vars', () => {
      const adapterBackends: AdapterBackendId[] = ['claude', 'codex', 'gemini', 'opencode', 'overstory'];
      for (const backend of adapterBackends) {
        expect(ENV_VAR_MAP[backend]).toBeDefined();
        expect(typeof ENV_VAR_MAP[backend]).toBe('string');
        expect(ENV_VAR_MAP[backend].length).toBeGreaterThan(0);
      }
    });

    it('should have CLAUDE_CONFIG_DIR for claude', () => {
      expect(ENV_VAR_MAP.claude).toBe('CLAUDE_CONFIG_DIR');
    });

    it('should have CODEX_HOME for codex', () => {
      expect(ENV_VAR_MAP.codex).toBe('CODEX_HOME');
    });

    it('should have GEMINI_CLI_HOME for gemini', () => {
      expect(ENV_VAR_MAP.gemini).toBe('GEMINI_CLI_HOME');
    });

    it('should have OPENCODE_CONFIG_DIR for opencode', () => {
      expect(ENV_VAR_MAP.opencode).toBe('OPENCODE_CONFIG_DIR');
    });

    it('should have OVERSTORY_HOME for overstory', () => {
      expect(ENV_VAR_MAP.overstory).toBe('OVERSTORY_HOME');
    });
  });

  describe('recordExternalSample', () => {
    it('should record sample to existing state', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      const sample: UsageSample = {
        backend: 'claude',
        stateKey: 'claude/~/.claude-personal',
        timestamp: Date.now(),
        duration: 5000,
        tokenEstimate: 15000,
        exitCode: 0,
        workItemId: 'test-task',
      };

      scheduler.recordExternalSample('claude/~/.claude-personal', sample);
      const state = scheduler.getState('claude/~/.claude-personal')!;

      expect(state.samples).toHaveLength(1);
      expect(state.tokens_consumed_in_window).toBe(15000);
      expect(state.ewma_tokens_per_task).toBe(15000);
    });

    it('should create state if stateKey not found', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      // Record to a key that doesn't exist yet
      const sample: UsageSample = {
        backend: 'gemini',
        stateKey: 'gemini/~/.gemini-alt',
        timestamp: Date.now(),
        duration: 3000,
        tokenEstimate: 8000,
        exitCode: 0,
        workItemId: 'new-task',
      };

      // The key doesn't exist initially
      expect(scheduler.getState('gemini/~/.gemini-alt')).toBeUndefined();

      scheduler.recordExternalSample('gemini/~/.gemini-alt', sample);
      const state = scheduler.getState('gemini/~/.gemini-alt');

      expect(state).toBeDefined();
      expect(state!.samples).toHaveLength(1);
      expect(state!.ewma_tokens_per_task).toBe(8000);
      // Default budget when auto-created
      expect(state!.token_budget).toBe(40000);
    });

    it('should update EWMA after recording', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      const stateKey = 'claude/~/.claude-personal';

      // Record first sample
      const sample1: UsageSample = {
        backend: 'claude',
        stateKey,
        timestamp: Date.now(),
        duration: 5000,
        tokenEstimate: 10000,
        exitCode: 0,
        workItemId: 'task-1',
      };
      scheduler.recordExternalSample(stateKey, sample1);
      expect(scheduler.getState(stateKey)!.ewma_tokens_per_task).toBe(10000);

      // Record second sample — EWMA should update with alpha=0.3
      const sample2: UsageSample = {
        backend: 'claude',
        stateKey,
        timestamp: Date.now(),
        duration: 5000,
        tokenEstimate: 20000,
        exitCode: 0,
        workItemId: 'task-2',
      };
      scheduler.recordExternalSample(stateKey, sample2);
      // EWMA: 0.3 * 20000 + 0.7 * 10000 = 6000 + 7000 = 13000
      expect(scheduler.getState(stateKey)!.ewma_tokens_per_task).toBe(13000);
    });
  });

  describe('max retry guard', () => {
    it('should cap retries at priority.length * max_accounts_per_backend', () => {
      const schedulerConfig = makeSchedulerConfig({
        backend_priority: ['claude', 'codex'],
      });
      const superpowersConfig = makeSuperpowersConfig({
        accounts: {
          claude: [
            { config_dir: '~/.claude-1' },
            { config_dir: '~/.claude-2' },
            { config_dir: '~/.claude-3' },
          ],
          codex: [
            { config_dir: '~/.codex-1' },
          ],
        },
      });

      // The scheduler internally computes maxRetries = priority.length * max(accounts per backend)
      // priority.length = 2, max accounts per backend = 3 (claude has 3)
      // maxRetries = 2 * 3 = 6
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      // Verify all per-account states were created
      expect(scheduler.getState('claude/~/.claude-1')).toBeDefined();
      expect(scheduler.getState('claude/~/.claude-2')).toBeDefined();
      expect(scheduler.getState('claude/~/.claude-3')).toBeDefined();
      expect(scheduler.getState('codex/~/.codex-1')).toBeDefined();
    });

    it('should return fallback result after exhaustion', () => {
      const schedulerConfig = makeSchedulerConfig({
        free_fallback: { backend: 'opencode' },
      });
      const superpowersConfig = makeSuperpowersConfig();
      const states = makeAccountStates(superpowersConfig, schedulerConfig);

      // Exhaust all priority accounts
      for (const [key, state] of states) {
        if (key.startsWith('claude/') || key.startsWith('codex/')) {
          state.tokens_consumed_in_window = state.token_budget - 500;
          state.ewma_tokens_per_task = 10000;
        }
      }

      const result = resolveAccount(superpowersConfig, schedulerConfig, states, 1.5);
      expect(result.backend).toBe('opencode');
    });
  });

  describe('createScheduler with account rotation', () => {
    it('should create per-account states when account_rotation is true', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig();
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      expect(scheduler).not.toBeNull();
      // Per-account compound keys
      expect(scheduler.getState('claude/~/.claude-personal')).toBeDefined();
      expect(scheduler.getState('claude/~/.claude-work')).toBeDefined();
      expect(scheduler.getState('codex/~/.codex-main')).toBeDefined();
    });

    it('should create fallback backend state as exhaustion fallback', () => {
      const schedulerConfig = makeSchedulerConfig({
        free_fallback: { backend: 'opencode' },
      });
      const superpowersConfig = makeSuperpowersConfig();
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      // The fallback backend should have a simple key as exhaustion fallback
      const fallbackState = scheduler.getState('opencode');
      expect(fallbackState).toBeDefined();
      // Fallback gets FREE_FALLBACK_BUDGET (1000000)
      expect(fallbackState!.token_budget).toBe(1000000);
    });

    it('should handle empty accounts with default_backend state', () => {
      const schedulerConfig = makeSchedulerConfig();
      const superpowersConfig = makeSuperpowersConfig({
        default_backend: 'claude',
        accounts: {},
      });
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      // When no accounts at all, should initialize default_backend state
      const defaultState = scheduler.getState('claude');
      expect(defaultState).toBeDefined();
    });

    it('should use backend_limits budget for per-account states', () => {
      const schedulerConfig = makeSchedulerConfig({
        backend_limits: { claude: { tpm: 50000 }, codex: { tpm: 120000 } },
      });
      const superpowersConfig = makeSuperpowersConfig();
      const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

      expect(scheduler.getState('claude/~/.claude-personal')!.token_budget).toBe(50000);
      expect(scheduler.getState('claude/~/.claude-work')!.token_budget).toBe(50000);
      expect(scheduler.getState('codex/~/.codex-main')!.token_budget).toBe(120000);
    });

    it('should persist and reload per-account states', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-acct-test-'));
      try {
        const schedulerConfig = makeSchedulerConfig();
        const superpowersConfig = makeSuperpowersConfig();
        const scheduler = createScheduler(schedulerConfig, superpowersConfig)!;

        // Modify some account states
        const state = scheduler.getState('claude/~/.claude-personal')!;
        state.ewma_tokens_per_task = 15000;
        state.budget_learned = true;
        state.budget_confidence = 0.8;

        scheduler.persistState(tmpDir);

        // Reload into a new scheduler
        const scheduler2 = createScheduler(schedulerConfig, superpowersConfig)!;
        scheduler2.loadPersistedState(tmpDir);

        const reloaded = scheduler2.getState('claude/~/.claude-personal')!;
        expect(reloaded.ewma_tokens_per_task).toBe(15000);
        expect(reloaded.budget_learned).toBe(true);
        expect(reloaded.budget_confidence).toBe(0.8);

        // Other account should still be at defaults
        const other = scheduler2.getState('claude/~/.claude-work')!;
        expect(other.ewma_tokens_per_task).toBe(0);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
