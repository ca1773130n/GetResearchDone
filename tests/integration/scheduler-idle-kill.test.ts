'use strict';

/**
 * Integration test for Spec 2B's idle watchdog.
 *
 * Exercises _startIdleWatchdog against real child_process.spawn
 * with bash subprocesses. Tests take ~3-5 seconds each.
 */

import { spawn } from 'child_process';

const { _startIdleWatchdog } = require('../../lib/scheduler') as {
  _startIdleWatchdog: (
    idleTimeoutMs: number,
    onIdle: () => void,
  ) => { markActivity: () => void; stop: () => void };
};

describe('idle watchdog with real bash subprocesses', () => {
  it('kills a silent subprocess after idle timeout', async () => {
    const child = spawn('bash', ['-c', 'echo starting; exec sleep 10']);
    let idleTripped = false;
    const startTime = Date.now();

    const wd = _startIdleWatchdog(2000, () => {
      idleTripped = true;
      child.kill('SIGTERM');
    });

    child.stdout?.on('data', () => wd.markActivity());
    child.stderr?.on('data', () => wd.markActivity());

    await new Promise<void>((resolve) => {
      child.on('close', () => resolve());
      child.on('error', () => resolve());
    });

    wd.stop();
    const duration = Date.now() - startTime;
    expect(idleTripped).toBe(true);
    expect(duration).toBeLessThan(6000);
    expect(duration).toBeGreaterThanOrEqual(2000);
  }, 15000);

  it('does not kill a chatty subprocess', async () => {
    const child = spawn('bash', [
      '-c',
      'for i in 1 2 3 4 5; do echo $i; sleep 0.5; done',
    ]);
    let idleTripped = false;
    const startTime = Date.now();

    const wd = _startIdleWatchdog(2000, () => {
      idleTripped = true;
      child.kill('SIGTERM');
    });

    child.stdout?.on('data', () => wd.markActivity());
    child.stderr?.on('data', () => wd.markActivity());

    await new Promise<void>((resolve) => {
      child.on('close', () => resolve());
      child.on('error', () => resolve());
    });

    wd.stop();
    const duration = Date.now() - startTime;
    expect(idleTripped).toBe(false);
    expect(duration).toBeGreaterThanOrEqual(2000);
    expect(duration).toBeLessThan(5000);
  }, 15000);
});
