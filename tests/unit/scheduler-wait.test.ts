'use strict';

const { waitUntilOrAbort } = require('../../lib/scheduler-wait') as { waitUntilOrAbort: (targetMs: number) => Promise<'waited' | 'aborted'>; };

describe('waitUntilOrAbort', () => {
  // Use real timers — fake timers interact poorly with AbortController
  // event listeners in older Jest versions.

  it('resolves with "waited" after the delay elapses', async () => {
    const start = Date.now();
    const result = await waitUntilOrAbort(Date.now() + 100);
    expect(result).toBe('waited');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(95);
    expect(elapsed).toBeLessThan(500);
  });

  it('resolves immediately with "waited" when targetMs is in the past', async () => {
    const start = Date.now();
    const result = await waitUntilOrAbort(Date.now() - 1000);
    expect(result).toBe('waited');
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('resolves immediately with "waited" when targetMs is exactly now', async () => {
    const result = await waitUntilOrAbort(Date.now());
    expect(result).toBe('waited');
  });

  it('resolves with "aborted" when SIGINT is emitted mid-wait', async () => {
    const promise = waitUntilOrAbort(Date.now() + 10000);
    setTimeout(() => process.emit('SIGINT', 'SIGINT'), 50);
    const result = await promise;
    expect(result).toBe('aborted');
  });

  it('aborts multiple concurrent waits on a single SIGINT', async () => {
    const p1 = waitUntilOrAbort(Date.now() + 10000);
    const p2 = waitUntilOrAbort(Date.now() + 10000);
    const p3 = waitUntilOrAbort(Date.now() + 10000);
    setTimeout(() => process.emit('SIGINT', 'SIGINT'), 50);
    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['aborted', 'aborted', 'aborted']);
  });

  it('registers the SIGINT handler only once across multiple invocations', async () => {
    const before = process.listenerCount('SIGINT');
    await waitUntilOrAbort(Date.now());
    const afterFirst = process.listenerCount('SIGINT');
    await waitUntilOrAbort(Date.now());
    const afterSecond = process.listenerCount('SIGINT');
    expect(afterFirst - before).toBeLessThanOrEqual(1);
    expect(afterSecond).toBe(afterFirst);
  });
});
