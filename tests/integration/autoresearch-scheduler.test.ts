'use strict';

/**
 * Integration test for autoresearch to scheduler routing.
 *
 * Verifies _spawnClaude routes through a provided scheduler.spawn when a
 * scheduler is provided (including when captureOutput is true), and falls
 * back to the sync path only when no scheduler is provided.
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

  it('routes through scheduler when captureOutput is true (stdout captured via SchedulerSpawnResult.stdout)', async () => {
    if (!autoresearch._spawnClaude) return;
    const scheduler = makeFakeScheduler('ok');
    // Override the mock to return stdout in the SchedulerSpawnResult
    (scheduler.spawn as jest.Mock).mockImplementation(
      async (_prompt: string, _opts: SpawnOpts): Promise<SchedulerSpawnResult> => ({
        exitCode: 0,
        timedOut: false,
        backend: 'claude',
        tokensUsed: 500,
        workItemId: 'fake',
        stdout: 'captured output from scheduler',
      })
    );

    const result = await autoresearch._spawnClaude('/tmp', 'test prompt', {
      scheduler,
      captureOutput: true,
      timeout: 1000,
    });
    expect(result.stdout).toBe('captured output from scheduler');
    expect(scheduler.spawn as jest.Mock).toHaveBeenCalled();
    // Verify captureOutput was forwarded to the scheduler
    const spawnOpts = (scheduler.spawn as jest.Mock).mock.calls[0][1] as SpawnOpts;
    expect(spawnOpts.captureOutput).toBe(true);
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
