'use strict';

const { _startIdleWatchdog } = require('../../lib/scheduler') as {
  _startIdleWatchdog: (
    idleTimeoutMs: number,
    onIdle: () => void
  ) => { markActivity: () => void; stop: () => void };
};

describe('_startIdleWatchdog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fires onIdle after idleTimeoutMs with no markActivity calls', () => {
    const onIdle = jest.fn();
    const wd = _startIdleWatchdog(2000, onIdle);
    jest.advanceTimersByTime(2500);
    expect(onIdle).toHaveBeenCalledTimes(1);
    wd.stop();
  });

  it('does not fire if markActivity is called within the window', () => {
    const onIdle = jest.fn();
    const wd = _startIdleWatchdog(2000, onIdle);
    jest.advanceTimersByTime(1500);
    wd.markActivity();
    jest.advanceTimersByTime(1500);
    expect(onIdle).not.toHaveBeenCalled();
    wd.stop();
  });

  it('can be stopped before firing', () => {
    const onIdle = jest.fn();
    const wd = _startIdleWatchdog(2000, onIdle);
    jest.advanceTimersByTime(1000);
    wd.stop();
    jest.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('only fires onIdle once even if the timer continues to tick', () => {
    const onIdle = jest.fn();
    const wd = _startIdleWatchdog(1000, onIdle);
    jest.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledTimes(1);
    wd.stop();
  });
});
