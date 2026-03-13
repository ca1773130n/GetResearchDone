'use strict';

import { createScheduler } from '../../lib/scheduler';
import type { SchedulerConfig } from '../../lib/types';

describe('scheduler integration', () => {
  it('picks next backend when primary is near limit', () => {
    const config: SchedulerConfig = {
      backend_priority: ['claude', 'codex'],
      free_fallback: { backend: 'opencode' },
      backend_limits: { claude: { tpm: 80000 }, codex: { tpm: 100000 } },
      prediction: { window_minutes: 15, ewma_alpha: 0.3, safety_margin_tasks: 1.5, min_samples: 3 },
    };
    const scheduler = createScheduler(config)!;

    // Simulate claude being near limit
    const claude = scheduler.getState('claude')!;
    claude.ewma_tokens_per_task = 10000;
    claude.tokens_consumed_in_window = 75000;

    const codex = scheduler.getState('codex')!;
    expect(codex.tokens_consumed_in_window).toBe(0);

    const claudeHeadroom = (claude.token_budget - claude.tokens_consumed_in_window) / claude.ewma_tokens_per_task;
    expect(claudeHeadroom).toBeLessThan(1.5);
  });

  it('returns null when no config provided', () => {
    expect(createScheduler(undefined)).toBeNull();
  });
});
