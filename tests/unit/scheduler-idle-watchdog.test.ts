'use strict';

const {
  _startIdleWatchdog,
  _resolveIdleTimeoutSeconds,
  _killProcessTree,
} = require('../../lib/scheduler') as {
  _startIdleWatchdog: (
    idleTimeoutMs: number,
    onIdle: () => void
  ) => { markActivity: () => void; stop: () => void };
  _resolveIdleTimeoutSeconds: (
    backend: string,
    config: { idle_timeout_seconds_by_backend?: Record<string, number>; idle_timeout_seconds?: number },
  ) => number;
  _killProcessTree: (
    child: { pid?: number; kill: (sig: string) => void },
    signal: string
  ) => void;
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

describe('_resolveIdleTimeoutSeconds', () => {
  it('returns the default 900 when no config is set', () => {
    expect(_resolveIdleTimeoutSeconds('claude', {})).toBe(900);
  });

  it('returns idle_timeout_seconds when set globally', () => {
    expect(_resolveIdleTimeoutSeconds('claude', { idle_timeout_seconds: 600 })).toBe(600);
  });

  it('returns per-backend override when present', () => {
    expect(
      _resolveIdleTimeoutSeconds('gemini', {
        idle_timeout_seconds: 600,
        idle_timeout_seconds_by_backend: { gemini: 1800 },
      }),
    ).toBe(1800);
  });

  it('falls back to global when per-backend has no entry for this backend', () => {
    expect(
      _resolveIdleTimeoutSeconds('claude', {
        idle_timeout_seconds: 600,
        idle_timeout_seconds_by_backend: { gemini: 1800 },
      }),
    ).toBe(600);
  });
});

describe('_killProcessTree', () => {
  it('no-ops when child has no pid', () => {
    const mockKill = jest.fn();
    _killProcessTree({ pid: undefined, kill: mockKill }, 'SIGTERM');
    expect(mockKill).not.toHaveBeenCalled();
  });

  it('calls process.kill with negative pid on POSIX', () => {
    if (process.platform === 'win32') return; // skip on Windows
    const pk = jest.spyOn(process, 'kill').mockImplementation(() => true);
    try {
      _killProcessTree({ pid: 99999, kill: () => {} }, 'SIGTERM');
      expect(pk).toHaveBeenCalledWith(-99999, 'SIGTERM');
    } finally {
      pk.mockRestore();
    }
  });

  it('silently handles ESRCH (process already exited)', () => {
    if (process.platform === 'win32') return;
    const pk = jest.spyOn(process, 'kill').mockImplementation(() => {
      const err = new Error('no such process') as NodeJS.ErrnoException;
      err.code = 'ESRCH';
      throw err;
    });
    try {
      expect(() =>
        _killProcessTree({ pid: 99999, kill: () => {} }, 'SIGTERM'),
      ).not.toThrow();
    } finally {
      pk.mockRestore();
    }
  });
});
