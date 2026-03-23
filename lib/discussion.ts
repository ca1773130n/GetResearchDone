'use strict';

/**
 * GRD Cross-Backend Dispatch Primitive
 *
 * Provides dispatchToBackend() — the foundational function for multi-backend
 * discussions. Spawns any configured AI CLI backend with a structured prompt
 * and returns a typed BackendResponse. Used by higher-level discussion
 * orchestration to route turns to multiple backends and synthesize results.
 *
 * Supported dispatchable backends: claude, codex, gemini, opencode.
 * Meta-backends (overstory, superpowers, grd) are not dispatchable.
 *
 * @module discussion
 */

import type { BackendId, BackendResponse, DispatchOptions, BackendAvailability } from './types';

const { execFileSync } = require('child_process') as {
  execFileSync: (
    file: string,
    args: string[],
    options: {
      timeout: number;
      encoding: string;
      cwd: string;
      stdio: string[];
      maxBuffer: number;
    }
  ) => string;
};
const { detectAvailableBackends } = require('./backend') as {
  detectAvailableBackends: (cwd?: string) => Record<BackendId, BackendAvailability>;
};

// --- Constants ---------------------------------------------------------------

/**
 * Sonnet-tier model ceiling for primary-backend discussion subagent spawns.
 * Mirrors the pattern from lib/wireup/state.ts and lib/evolve/state.ts.
 * REQ-149: discussion subagents must not exceed sonnet tier.
 */
const DISCUSSION_SONNET_MODEL: string = 'sonnet';

/**
 * Default dispatch timeout: 5 minutes.
 */
const DEFAULT_DISPATCH_TIMEOUT_MS: number = 5 * 60 * 1000;

/**
 * CLI binary name and argument builder for each dispatchable backend.
 * Only the four backends with known CLI invocation conventions are included.
 */
const BACKEND_CLI_MAP: Record<
  string,
  { bin: string; buildArgs: (prompt: string, model?: string) => string[] }
> = {
  claude: {
    bin: 'claude',
    buildArgs: (prompt: string, model?: string): string[] => [
      '--print',
      '-p',
      prompt,
      ...(model ? ['--model', model] : []),
    ],
  },
  codex: {
    bin: 'codex',
    buildArgs: (prompt: string, _model?: string): string[] => ['-q', prompt],
  },
  gemini: {
    bin: 'gemini',
    buildArgs: (prompt: string, _model?: string): string[] => [prompt],
  },
  opencode: {
    bin: 'opencode',
    buildArgs: (prompt: string, _model?: string): string[] => [prompt],
  },
};

// --- Functions ---------------------------------------------------------------

/**
 * Dispatch a prompt to a backend CLI subprocess and return a typed response.
 *
 * Validates the backend is dispatchable and currently available on PATH before
 * spawning. Times out after `options.timeout_ms` (default 5 minutes) and
 * returns a structured error response instead of throwing.
 *
 * @param backendId - Which backend CLI to invoke (must be in BACKEND_CLI_MAP)
 * @param prompt - The full prompt string to send to the backend
 * @param options - Optional dispatch configuration (timeout, cwd, model override)
 * @returns A BackendResponse with response_text populated on success, or
 *          stderr populated with an error description on failure
 */
function dispatchToBackend(
  backendId: BackendId,
  prompt: string,
  options?: DispatchOptions
): BackendResponse {
  const cliEntry = BACKEND_CLI_MAP[backendId as string];

  // Validate backend is dispatchable
  if (!cliEntry) {
    return {
      backend: backendId,
      response_text: '',
      duration_ms: 0,
      stderr: `Backend "${backendId}" is not dispatchable`,
    };
  }

  // Check availability via detectAvailableBackends
  const cwd: string = options?.cwd ?? process.cwd();
  const availability: Record<BackendId, BackendAvailability> = detectAvailableBackends(cwd);
  if (!availability[backendId]?.available) {
    return {
      backend: backendId,
      response_text: '',
      duration_ms: 0,
      stderr: `Backend "${backendId}" is not available on PATH`,
    };
  }

  const timeout: number = options?.timeout_ms ?? DEFAULT_DISPATCH_TIMEOUT_MS;
  const args: string[] = cliEntry.buildArgs(prompt, options?.model);
  const start: number = Date.now();

  try {
    const stdout: string = execFileSync(cliEntry.bin, args, {
      timeout,
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      backend: backendId,
      response_text: stdout.trim(),
      duration_ms: Date.now() - start,
      stderr: '',
    };
  } catch (err: unknown) {
    const duration_ms: number = Date.now() - start;
    const error = err as {
      killed?: boolean;
      signal?: string;
      stderr?: string;
      message?: string;
    };

    // Timeout: killed by signal or exceeded timeout
    if (error.killed || error.signal === 'SIGTERM') {
      return {
        backend: backendId,
        response_text: '',
        duration_ms,
        stderr: `Dispatch timed out after ${timeout}ms`,
      };
    }

    return {
      backend: backendId,
      response_text: '',
      duration_ms,
      stderr: error.stderr || error.message || 'Unknown dispatch error',
    };
  }
}

// --- Exports -----------------------------------------------------------------

module.exports = {
  dispatchToBackend,
  DISCUSSION_SONNET_MODEL,
  BACKEND_CLI_MAP,
  DEFAULT_DISPATCH_TIMEOUT_MS,
};
