'use strict';

import type { BackendAdapter } from '../types';

const { ADAPTERS, checkBinary }: {
  ADAPTERS: Record<string, BackendAdapter>;
  checkBinary: (binary: string) => boolean;
} = require('../scheduler');

export interface CliAdapter {
  binary: string;
  buildArgs(prompt: string, opts: { model?: string; verbose?: boolean }): string[];
}

/**
 * Derives a CliAdapter from the scheduler's BackendAdapter by adapting
 * the buildArgs signature (SpawnOpts → simpler cli opts).
 */
function toCliAdapter(adapter: BackendAdapter): CliAdapter {
  return {
    binary: adapter.binary,
    buildArgs(prompt: string, opts: { model?: string; verbose?: boolean }): string[] {
      return adapter.buildArgs(prompt, { model: opts.model });
    },
  };
}

export function getAdapter(backend: string): CliAdapter {
  const adapter = ADAPTERS[backend] || ADAPTERS.claude;
  return toCliAdapter(adapter);
}

export function checkBackendAvailable(backend: string): boolean {
  const adapter = ADAPTERS[backend] || ADAPTERS.claude;
  return checkBinary(adapter.binary);
}

module.exports = { getAdapter, checkBackendAvailable };
