'use strict';

/**
 * Integration test for autoresearch to scheduler routing.
 *
 * Verifies _spawnClaude routes through a provided scheduler.spawn when
 * captureOutput is false, and falls back to the sync path otherwise.
 */

import type { Scheduler } from '../../lib/scheduler';
import type { SchedulerSpawnResult, SpawnOpts } from '../../lib/types';

const autoresearch = require('../../lib/autoresearch') as {
  _spawnClaude?: (
    cwd: string,
    prompt: string,
    opts: {
      timeout?: number;
      maxTurns?: number;
      model?: string;
      captureOutput?: boolean;
      scheduler?: Scheduler | null;
    }
  ) => Promise<{ exitCode: number; stdout: string; timedOut: boolean }>;
};

function makeFakeScheduler(behavior: 'ok' | 'rate-limit' | 'throw'): Scheduler {
  const spawn = jest.fn(
    async (_prompt: string, _opts: SpawnOpts): Promise<SchedulerSpawnResult> => {
      if (behavior === 'throw') throw new Error('fake scheduler exploded');
      if (behavior === 'rate-limit') {
        return {
          exitCode: 1,
          timedOut: false,
          backend: 'claude',
          tokensUsed: 0,
          workItemId: 'fake-rate-limit',
        };
      }
      return {
        exitCode: 0,
        timedOut: false,
        backend: 'claude',
        tokensUsed: 1500,
        workItemId: 'fake-ok',
      };
    }
  );
  return {
    spawn,
    getState: jest.fn(() => undefined),
    recordExternalSample: jest.fn(),
    persistState: jest.fn(),
    loadPersistedState: jest.fn(),
  } as unknown as Scheduler;
}

describe('autoresearch scheduler routing', () => {
  it('exports _spawnClaude for direct testing', () => {
    expect(autoresearch._spawnClaude).toBeDefined();
    expect(typeof autoresearch._spawnClaude).toBe('function');
  });

  it('routes through scheduler.spawn when scheduler is provided and captureOutput is false', async () => {
    if (!autoresearch._spawnClaude) return;
    const scheduler = makeFakeScheduler('ok');
    const result = await autoresearch._spawnClaude('/tmp', 'test prompt', {
      scheduler,
      captureOutput: false,
    });
    expect(result.exitCode).toBe(0);
    expect(scheduler.spawn as jest.Mock).toHaveBeenCalledTimes(1);
    expect((scheduler.spawn as jest.Mock).mock.calls[0][0]).toBe('test prompt');
  });

  it('does not route through scheduler when captureOutput is true (sync fallback)', async () => {
    if (!autoresearch._spawnClaude) return;
    const scheduler = makeFakeScheduler('ok');
    // With captureOutput: true, the wrapper falls back to _spawnClaudeSync
    // which will try to run the real 'claude' binary. That may fail with
    // a missing binary (exit code != 0), which is fine — we just verify
    // the scheduler mock was NOT called.
    try {
      await autoresearch._spawnClaude('/tmp', 'test prompt', {
        scheduler,
        captureOutput: true,
        timeout: 1000,
      });
    } catch {
      // Ignore — we only care whether scheduler.spawn was called
    }
    expect(scheduler.spawn as jest.Mock).not.toHaveBeenCalled();
  });

  it('handles scheduler throwing gracefully', async () => {
    if (!autoresearch._spawnClaude) return;
    const scheduler = makeFakeScheduler('throw');
    const result = await autoresearch._spawnClaude('/tmp', 'test prompt', {
      scheduler,
      captureOutput: false,
    });
    expect(result.exitCode).not.toBe(0);
  });
});
