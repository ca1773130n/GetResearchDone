'use strict';

/**
 * Unit tests for lib/discussion.ts
 *
 * Tests dispatchToBackend CLI argument construction, success/error paths,
 * timeout handling, unavailable-backend handling, and the DISCUSSION_SONNET_MODEL
 * constant.
 *
 * child_process and ./backend are mocked so no real CLIs are invoked.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('child_process');
jest.mock('../../lib/backend');

const childProcess = require('child_process') as {
  execFileSync: jest.Mock;
};

const backendModule = require('../../lib/backend') as {
  detectAvailableBackends: jest.Mock;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Return an availability map where the listed backends are available
 * and all others are not.
 */
function makeAvailability(available: string[]): Record<string, { available: boolean; version: string | null }> {
  const all = ['claude', 'codex', 'gemini', 'opencode', 'overstory', 'superpowers', 'grd'];
  const result: Record<string, { available: boolean; version: string | null }> = {};
  for (const b of all) {
    result[b] = available.includes(b)
      ? { available: true, version: '1.0.0' }
      : { available: false, version: null };
  }
  return result;
}

// ─── Imports (after jest.mock) ────────────────────────────────────────────────

const {
  dispatchToBackend,
  DISCUSSION_SONNET_MODEL,
  BACKEND_CLI_MAP,
  DEFAULT_DISPATCH_TIMEOUT_MS,
} = require('../../lib/discussion') as {
  dispatchToBackend: (
    backendId: string,
    prompt: string,
    options?: { timeout_ms?: number; cwd?: string; model?: string }
  ) => { backend: string; response_text: string; duration_ms: number; stderr?: string };
  DISCUSSION_SONNET_MODEL: string;
  BACKEND_CLI_MAP: Record<string, { bin: string; buildArgs: (p: string, m?: string) => string[] }>;
  DEFAULT_DISPATCH_TIMEOUT_MS: number;
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('lib/discussion.ts', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: all four dispatchable backends are available
    backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex', 'gemini', 'opencode']));
  });

  // ─── DISCUSSION_SONNET_MODEL ────────────────────────────────────────────────

  describe('DISCUSSION_SONNET_MODEL', () => {
    test('equals "sonnet"', () => {
      expect(DISCUSSION_SONNET_MODEL).toBe('sonnet');
    });

    test('matches the pattern used in wireup/state.ts and evolve/state.ts', () => {
      // The constant must be the abstract tier identifier, not a concrete model name
      expect(DISCUSSION_SONNET_MODEL).toMatch(/^sonnet$/);
    });
  });

  // ─── DEFAULT_DISPATCH_TIMEOUT_MS ───────────────────────────────────────────

  describe('DEFAULT_DISPATCH_TIMEOUT_MS', () => {
    test('is 5 minutes in milliseconds', () => {
      expect(DEFAULT_DISPATCH_TIMEOUT_MS).toBe(5 * 60 * 1000);
    });
  });

  // ─── BACKEND_CLI_MAP ───────────────────────────────────────────────────────

  describe('BACKEND_CLI_MAP', () => {
    test('contains exactly the four dispatchable backends', () => {
      expect(Object.keys(BACKEND_CLI_MAP).sort()).toEqual(['claude', 'codex', 'gemini', 'opencode']);
    });

    test('claude buildArgs includes --print and -p', () => {
      const args = BACKEND_CLI_MAP.claude.buildArgs('hello');
      expect(args).toContain('--print');
      expect(args).toContain('-p');
      expect(args).toContain('hello');
    });

    test('claude buildArgs includes --model when model specified', () => {
      const args = BACKEND_CLI_MAP.claude.buildArgs('hello', 'claude-opus');
      expect(args).toContain('--model');
      expect(args).toContain('claude-opus');
    });

    test('claude buildArgs omits --model when not specified', () => {
      const args = BACKEND_CLI_MAP.claude.buildArgs('hello');
      expect(args).not.toContain('--model');
    });

    test('codex buildArgs includes -q and the prompt', () => {
      const args = BACKEND_CLI_MAP.codex.buildArgs('test prompt');
      expect(args).toContain('-q');
      expect(args).toContain('test prompt');
    });

    test('gemini buildArgs is just [prompt]', () => {
      const args = BACKEND_CLI_MAP.gemini.buildArgs('test prompt');
      expect(args).toEqual(['test prompt']);
    });

    test('opencode buildArgs is just [prompt]', () => {
      const args = BACKEND_CLI_MAP.opencode.buildArgs('test prompt');
      expect(args).toEqual(['test prompt']);
    });
  });

  // ─── dispatchToBackend ─────────────────────────────────────────────────────

  describe('dispatchToBackend', () => {

    // ─── Argument construction per backend ─────────────────────────────────

    test('claude: passes --print, -p, and prompt to execFileSync', () => {
      childProcess.execFileSync.mockReturnValue('Claude response');
      dispatchToBackend('claude', 'hello claude');
      expect(childProcess.execFileSync).toHaveBeenCalledTimes(1);
      const [bin, args] = childProcess.execFileSync.mock.calls[0] as [string, string[]];
      expect(bin).toBe('claude');
      expect(args).toContain('--print');
      expect(args).toContain('-p');
      expect(args).toContain('hello claude');
    });

    test('claude: passes --model when model option provided', () => {
      childProcess.execFileSync.mockReturnValue('Claude response');
      dispatchToBackend('claude', 'hello', { model: 'claude-opus-4-6' });
      const [, args] = childProcess.execFileSync.mock.calls[0] as [string, string[]];
      expect(args).toContain('--model');
      expect(args).toContain('claude-opus-4-6');
    });

    test('codex: passes -q and prompt to execFileSync', () => {
      childProcess.execFileSync.mockReturnValue('Codex response');
      dispatchToBackend('codex', 'hello codex');
      const [bin, args] = childProcess.execFileSync.mock.calls[0] as [string, string[]];
      expect(bin).toBe('codex');
      expect(args).toContain('-q');
      expect(args).toContain('hello codex');
    });

    test('gemini: passes just [prompt] to execFileSync', () => {
      childProcess.execFileSync.mockReturnValue('Gemini response');
      dispatchToBackend('gemini', 'hello gemini');
      const [bin, args] = childProcess.execFileSync.mock.calls[0] as [string, string[]];
      expect(bin).toBe('gemini');
      expect(args).toEqual(['hello gemini']);
    });

    test('opencode: passes just [prompt] to execFileSync', () => {
      childProcess.execFileSync.mockReturnValue('OpenCode response');
      dispatchToBackend('opencode', 'hello opencode');
      const [bin, args] = childProcess.execFileSync.mock.calls[0] as [string, string[]];
      expect(bin).toBe('opencode');
      expect(args).toEqual(['hello opencode']);
    });

    // ─── Successful response ──────────────────────────────────────────────

    test('returns correct backend id on success', () => {
      childProcess.execFileSync.mockReturnValue('The answer');
      const result = dispatchToBackend('claude', 'a question');
      expect(result.backend).toBe('claude');
    });

    test('returns trimmed stdout as response_text on success', () => {
      childProcess.execFileSync.mockReturnValue('  trimmed response  \n');
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.response_text).toBe('trimmed response');
    });

    test('returns positive duration_ms on success', () => {
      childProcess.execFileSync.mockReturnValue('ok');
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    test('returns empty stderr on success', () => {
      childProcess.execFileSync.mockReturnValue('ok');
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.stderr).toBe('');
    });

    // ─── Timeout handling ─────────────────────────────────────────────────

    test('returns empty response_text on timeout (killed: true)', () => {
      childProcess.execFileSync.mockImplementation(() => {
        const err = new Error('spawnSync killed') as NodeJS.ErrnoException & { killed?: boolean };
        err.killed = true;
        throw err;
      });
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.response_text).toBe('');
    });

    test('stderr mentions "timed out" on timeout', () => {
      childProcess.execFileSync.mockImplementation(() => {
        const err = new Error('spawnSync killed') as NodeJS.ErrnoException & { killed?: boolean };
        err.killed = true;
        throw err;
      });
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.stderr).toMatch(/timed out/i);
    });

    test('stderr mentions SIGTERM on signal-based timeout', () => {
      childProcess.execFileSync.mockImplementation(() => {
        const err = new Error('killed') as NodeJS.ErrnoException & { signal?: string };
        err.signal = 'SIGTERM';
        throw err;
      });
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.response_text).toBe('');
      expect(result.stderr).toMatch(/timed out/i);
    });

    // ─── Unavailable backend ──────────────────────────────────────────────

    test('returns empty response_text when backend unavailable', () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability([]));
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.response_text).toBe('');
    });

    test('stderr mentions unavailability when backend not available', () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['codex', 'gemini']));
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.stderr).toMatch(/not available/i);
    });

    test('does not call execFileSync when backend unavailable', () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability([]));
      dispatchToBackend('codex', 'prompt');
      expect(childProcess.execFileSync).not.toHaveBeenCalled();
    });

    // ─── Non-dispatchable backend ─────────────────────────────────────────

    test('returns empty response_text for non-dispatchable backend "overstory"', () => {
      const result = dispatchToBackend('overstory', 'prompt');
      expect(result.response_text).toBe('');
    });

    test('stderr mentions "not dispatchable" for overstory', () => {
      const result = dispatchToBackend('overstory', 'prompt');
      expect(result.stderr).toMatch(/not dispatchable/i);
    });

    test('does not call execFileSync for non-dispatchable backend', () => {
      dispatchToBackend('overstory', 'prompt');
      expect(childProcess.execFileSync).not.toHaveBeenCalled();
    });

    // ─── Custom timeout ───────────────────────────────────────────────────

    test('passes custom timeout_ms to execFileSync', () => {
      childProcess.execFileSync.mockReturnValue('ok');
      dispatchToBackend('claude', 'prompt', { timeout_ms: 10000 });
      const [, , opts] = childProcess.execFileSync.mock.calls[0] as [string, string[], { timeout: number }];
      expect(opts.timeout).toBe(10000);
    });

    test('uses DEFAULT_DISPATCH_TIMEOUT_MS when no custom timeout', () => {
      childProcess.execFileSync.mockReturnValue('ok');
      dispatchToBackend('codex', 'prompt');
      const [, , opts] = childProcess.execFileSync.mock.calls[0] as [string, string[], { timeout: number }];
      expect(opts.timeout).toBe(DEFAULT_DISPATCH_TIMEOUT_MS);
    });

    // ─── Stderr capture ───────────────────────────────────────────────────

    test('captures stderr from thrown error object', () => {
      childProcess.execFileSync.mockImplementation(() => {
        const err = new Error('exit 1') as NodeJS.ErrnoException & { stderr?: string };
        err.stderr = 'some stderr content from CLI';
        throw err;
      });
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.stderr).toContain('some stderr content from CLI');
    });

    test('falls back to error.message when no stderr property', () => {
      childProcess.execFileSync.mockImplementation(() => {
        throw new Error('command not found');
      });
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.stderr).toContain('command not found');
    });

    test('returns a structured error on unknown dispatch failure', () => {
      childProcess.execFileSync.mockImplementation(() => {
        throw new Error('Unknown error');
      });
      const result = dispatchToBackend('gemini', 'prompt');
      expect(result.response_text).toBe('');
      expect(typeof result.stderr).toBe('string');
    });
  });
});
