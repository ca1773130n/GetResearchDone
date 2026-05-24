'use strict';

const DEFAULT_TIMEOUT_MS = 120 * 60 * 1000;

export interface SpawnOpts {
  timeout?: number;
}

export function buildTotalTimer(opts: SpawnOpts): NodeJS.Timeout | null {
  const totalTimeoutMs = opts.timeout || DEFAULT_TIMEOUT_MS;
  return setTimeout(() => {
    // ... kill subprocess ...
  }, totalTimeoutMs);
}
