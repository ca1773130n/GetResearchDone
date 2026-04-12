'use strict';

const {
  incrementCounter,
  getCounters,
  resetCounters,
} = require('../../lib/metrics') as {
  incrementCounter: (name: string, delta?: number) => void;
  getCounters: () => Record<string, number>;
  resetCounters: () => void;
};

describe('metrics counters', () => {
  beforeEach(() => {
    resetCounters();
  });

  it('increments a new counter from 0 to 1 by default', () => {
    incrementCounter('foo');
    expect(getCounters().foo).toBe(1);
  });

  it('increments with custom delta', () => {
    incrementCounter('bar', 5);
    expect(getCounters().bar).toBe(5);
  });

  it('accumulates multiple increments', () => {
    incrementCounter('baz');
    incrementCounter('baz', 2);
    incrementCounter('baz');
    expect(getCounters().baz).toBe(4);
  });

  it('returns an empty object when no counters set', () => {
    expect(getCounters()).toEqual({});
  });

  it('resetCounters clears all counters', () => {
    incrementCounter('foo');
    incrementCounter('bar', 3);
    resetCounters();
    expect(getCounters()).toEqual({});
  });

  it('getCounters returns a snapshot (mutating the return does not affect state)', () => {
    incrementCounter('foo');
    const snapshot = getCounters();
    snapshot.foo = 999;
    expect(getCounters().foo).toBe(1);
  });
});
