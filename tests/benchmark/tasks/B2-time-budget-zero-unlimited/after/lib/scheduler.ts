'use strict';

const DEFAULT_TIMEOUT_MS = 120 * 60 * 1000;

export interface SpawnOpts {
  timeout?: number;
}

export function buildTotalTimer(opts: SpawnOpts): NodeJS.Timeout | null {
  const totalTimeoutMs =
    opts.timeout === 0
      ? null
      : (typeof opts.timeout === 'number' ? opts.timeout : DEFAULT_TIMEOUT_MS);
  if (totalTimeoutMs === null) return null;
  return setTimeout(() => {
    // ... kill subprocess ...
  }, totalTimeoutMs);
}
