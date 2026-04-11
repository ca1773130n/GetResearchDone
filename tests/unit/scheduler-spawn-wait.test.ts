'use strict';

import type { SchedulerConfig, SuperpowersConfig } from '../../lib/types';

const { createScheduler } = require('../../lib/scheduler') as {
  createScheduler: (
    config: SchedulerConfig | undefined,
    superpowersConfig?: SuperpowersConfig,
  ) => { spawn: Function; getState: Function } | null;
};

describe('createScheduler with max_wait_minutes', () => {
  it('creates a scheduler with an explicit max_wait_minutes value', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude'],
      free_fallback: { backend: 'claude' },
      prediction: {
        window_minutes: 60,
        ewma_alpha: 0.3,
        safety_margin_tasks: 1,
        min_samples: 3,
      },
      max_wait_minutes: 90,
    };
    const scheduler = createScheduler(config);
    expect(scheduler).not.toBeNull();
    expect(typeof scheduler!.spawn).toBe('function');
  });

  it('creates a scheduler with max_wait_minutes omitted (uses default)', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude'],
      free_fallback: { backend: 'claude' },
      prediction: {
        window_minutes: 60,
        ewma_alpha: 0.3,
        safety_margin_tasks: 1,
        min_samples: 3,
      },
    };
    const scheduler = createScheduler(config);
    expect(scheduler).not.toBeNull();
  });

  it('infinite-loop mitigation: _spawnWithRetry signature accepts lastRecoveryTime', () => {
    // Smoke test — we can't directly invoke _spawnWithRetry (it's a closure
    // inside createScheduler), but we verify createScheduler still works and
    // exposes spawn normally. The lastRecoveryTime param is tested
    // indirectly via integration testing of the wait branch (spec 2A).
    const config: SchedulerConfig = {
      backend_priority: ['claude'],
      free_fallback: { backend: 'claude' },
      prediction: {
        window_minutes: 60,
        ewma_alpha: 0.3,
        safety_margin_tasks: 1,
        min_samples: 3,
      },
      max_wait_minutes: 0, // disable wait — should preserve pre-Spec 2A behavior
    };
    const scheduler = createScheduler(config);
    expect(scheduler).not.toBeNull();
    expect(typeof scheduler!.spawn).toBe('function');
  });
});
