'use strict';

/**
 * Unit tests for lib/discussion.ts
 *
 * Tests dispatchToBackend CLI argument construction, success/error paths,
 * timeout handling, unavailable-backend handling, the DISCUSSION_SONNET_MODEL
 * constant, runDiscussion() orchestration, and the listDiscussions() /
 * readDiscussion() history helpers.
 *
 * child_process, ./backend, fs, and ./paths are mocked so no real CLIs
 * or filesystem writes occur.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('child_process');
jest.mock('../../lib/backend');
jest.mock('fs');
jest.mock('../../lib/paths');

const childProcess = require('child_process') as {
  execFileSync: jest.Mock;
};

const backendModule = require('../../lib/backend') as {
  detectAvailableBackends: jest.Mock;
};

const fsModule = require('fs') as {
  mkdirSync: jest.Mock;
  writeFileSync: jest.Mock;
  readdirSync: jest.Mock;
  readFileSync: jest.Mock;
  existsSync: jest.Mock;
};

const pathsModule = require('../../lib/paths') as {
  discussionsDir: jest.Mock;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_DISCUSSIONS_DIR = '/tmp/fake-planning/discussions';

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

/**
 * Create a mock BackendResponse for a given backend.
 */
function mockResponse(backend: string, text: string): Record<string, unknown> {
  return { backend, response_text: text, duration_ms: 10, stderr: '' };
}

// ─── Imports (after jest.mock) ────────────────────────────────────────────────

const {
  dispatchToBackend,
  runDiscussion,
  listDiscussions,
  readDiscussion,
  DISCUSSION_SONNET_MODEL,
  BACKEND_CLI_MAP,
  DEFAULT_DISPATCH_TIMEOUT_MS,
} = require('../../lib/discussion') as {
  dispatchToBackend: (
    backendId: string,
    prompt: string,
    options?: { timeout_ms?: number; cwd?: string; model?: string }
  ) => { backend: string; response_text: string; duration_ms: number; stderr?: string };
  runDiscussion: (
    topic: string,
    participants: string[],
    options?: {
      rounds?: number;
      synthesizer?: string;
      timeout_per_round_seconds?: number;
      cwd?: string;
      phase?: string;
      type?: string;
      milestone?: string | null;
    }
  ) => Promise<{
    topic: string;
    participants: string[];
    rounds: unknown[][];
    synthesis: { backend: string; response_text: string; duration_ms: number; stderr: string };
    duration_ms: number;
    discussion_file: string;
  }>;
  listDiscussions: (cwd: string, milestone?: string | null) => string[];
  readDiscussion: (filename: string, cwd: string, milestone?: string | null) => string | null;
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
    // Default: discussionsDir returns a known temp path
    pathsModule.discussionsDir.mockReturnValue(FAKE_DISCUSSIONS_DIR);
    // Default fs behaviour
    fsModule.mkdirSync.mockReturnValue(undefined);
    fsModule.writeFileSync.mockReturnValue(undefined);
    fsModule.existsSync.mockReturnValue(true);
    fsModule.readdirSync.mockReturnValue([]);
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

  // ─── runDiscussion ─────────────────────────────────────────────────────────

  describe('runDiscussion', () => {

    beforeEach(() => {
      // Default mock: return a deterministic response for any execFileSync call
      childProcess.execFileSync.mockReturnValue('Mock backend response');
    });

    // ─── SC1: Sequential dispatch ──────────────────────────────────────────

    test('SC1: dispatches to each participant and synthesizer for rounds=1', async () => {
      const result = await runDiscussion('test topic', ['claude', 'codex'], { rounds: 1 });

      // 2 participants (round 1) + 1 synthesizer = 3 dispatches
      expect(childProcess.execFileSync).toHaveBeenCalledTimes(3);
      // Both participant names appear in call arguments
      const allArgs = childProcess.execFileSync.mock.calls.map(
        (call: [string, string[]]) => call[1]
      ) as string[][];
      expect(allArgs.some((args) => args.includes('test topic'))).toBe(true);
      expect(result.rounds[0]).toHaveLength(2);
    });

    test('SC1: dispatches with the original topic in round 1', async () => {
      await runDiscussion('my discussion topic', ['claude'], { rounds: 1 });
      const firstCallArgs = childProcess.execFileSync.mock.calls[0][1] as string[];
      expect(firstCallArgs).toContain('my discussion topic');
    });

    // ─── SC2: DiscussionResult shape ─────────────────────────────────────

    test('SC2: returned object has all required fields', async () => {
      const result = await runDiscussion('test topic', ['claude', 'codex'], { rounds: 1 });

      expect(typeof result.topic).toBe('string');
      expect(Array.isArray(result.participants)).toBe(true);
      expect(Array.isArray(result.rounds)).toBe(true);
      expect(result.synthesis).toBeDefined();
      expect(typeof result.synthesis.backend).toBe('string');
      expect(typeof result.synthesis.response_text).toBe('string');
      expect(typeof result.duration_ms).toBe('number');
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
      expect(typeof result.discussion_file).toBe('string');
    });

    test('SC2: topic in result matches input', async () => {
      const result = await runDiscussion('specific topic', ['claude'], { rounds: 1 });
      expect(result.topic).toBe('specific topic');
    });

    test('SC2: participants in result match input', async () => {
      const result = await runDiscussion('topic', ['claude', 'codex'], { rounds: 1 });
      expect(result.participants).toEqual(['claude', 'codex']);
    });

    test('SC2: discussion_file matches naming pattern', async () => {
      const result = await runDiscussion('topic', ['claude'], {
        rounds: 1,
        phase: 'myPhase',
        type: 'myType',
      });
      expect(result.discussion_file).toContain('discussion-myPhase-myType-');
      expect(result.discussion_file).toMatch(/discussion-myPhase-myType-\d+\.md$/);
    });

    // ─── SC3: File written before return ─────────────────────────────────

    test('SC3: writeFileSync called after runDiscussion resolves', async () => {
      await runDiscussion('topic', ['claude'], { rounds: 1, phase: 'p83', type: 'discussion' });

      expect(fsModule.writeFileSync).toHaveBeenCalledTimes(1);
      const [writtenPath, content] = fsModule.writeFileSync.mock.calls[0] as [string, string, string];
      expect(writtenPath).toMatch(/discussion-p83-discussion-\d+\.md$/);
      expect(content).toContain('topic');
    });

    test('SC3: mkdirSync called with recursive:true before writeFileSync', async () => {
      await runDiscussion('topic', ['claude'], { rounds: 1 });

      expect(fsModule.mkdirSync).toHaveBeenCalledWith(FAKE_DISCUSSIONS_DIR, { recursive: true });
      const mkdirOrder = fsModule.mkdirSync.mock.invocationCallOrder[0] as number;
      const writeOrder = fsModule.writeFileSync.mock.invocationCallOrder[0] as number;
      expect(mkdirOrder).toBeLessThan(writeOrder);
    });

    test('SC3: written content contains the topic string', async () => {
      await runDiscussion('very specific topic string', ['claude'], { rounds: 1 });
      const [, content] = fsModule.writeFileSync.mock.calls[0] as [string, string, string];
      expect(content).toContain('very specific topic string');
    });

    // ─── SC4: Skipped participant ─────────────────────────────────────────

    test('SC4: unavailable participant produces skipped entry in round 1', async () => {
      // codex is unavailable; claude is available
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude']));

      const result = await runDiscussion('topic', ['claude', 'codex'], { rounds: 1 });

      const round1 = result.rounds[0] as Array<{ backend: string; skipped?: boolean; reason?: string }>;
      const codexEntry = round1.find((e) => e.backend === 'codex');
      expect(codexEntry).toBeDefined();
      expect(codexEntry?.skipped).toBe(true);
      expect(typeof codexEntry?.reason).toBe('string');
    });

    test('SC4: available participant still produces response when another is skipped', async () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude']));

      const result = await runDiscussion('topic', ['claude', 'codex'], { rounds: 1 });

      const round1 = result.rounds[0] as Array<{ backend: string; skipped?: boolean; response_text?: string }>;
      const claudeEntry = round1.find((e) => e.backend === 'claude');
      expect(claudeEntry).toBeDefined();
      expect(claudeEntry?.skipped).toBeUndefined();
      expect(typeof claudeEntry?.response_text).toBe('string');
    });

    test('SC4: discussion continues and file still written when participant skipped', async () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude']));

      await runDiscussion('topic', ['claude', 'codex'], { rounds: 1 });

      // File should still be written
      expect(fsModule.writeFileSync).toHaveBeenCalledTimes(1);
    });

    // ─── SC5: Rounds clamping ─────────────────────────────────────────────

    test('SC5: rounds=0 is clamped to 1 (result.rounds.length === 1)', async () => {
      const result = await runDiscussion('topic', ['claude'], { rounds: 0 });
      expect(result.rounds).toHaveLength(1);
    });

    test('SC5: rounds=4 is clamped to 3 (result.rounds.length === 3)', async () => {
      const result = await runDiscussion('topic', ['claude'], { rounds: 4 });
      expect(result.rounds).toHaveLength(3);
    });

    test('SC5: rounds=2 produces exactly 2 rounds', async () => {
      const result = await runDiscussion('topic', ['claude'], { rounds: 2 });
      expect(result.rounds).toHaveLength(2);
    });

    test('SC5: rounds=1 produces exactly 1 round', async () => {
      const result = await runDiscussion('topic', ['claude'], { rounds: 1 });
      expect(result.rounds).toHaveLength(1);
    });

    test('SC5: rounds=3 produces exactly 3 rounds', async () => {
      const result = await runDiscussion('topic', ['claude'], { rounds: 3 });
      expect(result.rounds).toHaveLength(3);
    });

    // ─── Timeout forwarded ────────────────────────────────────────────────

    test('timeout_per_round_seconds is converted to timeout_ms for dispatch', async () => {
      await runDiscussion('topic', ['claude'], {
        rounds: 1,
        timeout_per_round_seconds: 60,
      });

      const [, , opts] = childProcess.execFileSync.mock.calls[0] as [string, string[], { timeout: number }];
      expect(opts.timeout).toBe(60 * 1000);
    });

    test('default timeout_per_round_seconds is 180 seconds (180000ms)', async () => {
      await runDiscussion('topic', ['claude'], { rounds: 1 });

      const [, , opts] = childProcess.execFileSync.mock.calls[0] as [string, string[], { timeout: number }];
      expect(opts.timeout).toBe(180 * 1000);
    });

    // ─── Round 2 dispatch count ───────────────────────────────────────────

    test('rounds=2 with 2 participants: total 5 dispatches (2 + 1 synth + 2)', async () => {
      await runDiscussion('topic', ['claude', 'codex'], { rounds: 2 });

      // 2 (round 1) + 1 (synthesizer) + 2 (round 2) = 5
      expect(childProcess.execFileSync).toHaveBeenCalledTimes(5);
    });

    test('rounds=1 with 2 participants: total 3 dispatches (2 + 1 synth)', async () => {
      await runDiscussion('topic', ['claude', 'codex'], { rounds: 1 });

      // 2 (round 1) + 1 (synthesizer) = 3
      expect(childProcess.execFileSync).toHaveBeenCalledTimes(3);
    });

    // ─── All participants unavailable ─────────────────────────────────────

    test('all participants unavailable: returns valid DiscussionResult with all skipped', async () => {
      // No participants available (synthesizer claude still gets dispatched)
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude']));

      // claude is the synthesizer by default — available. Participants codex/gemini are not.
      const result = await runDiscussion('topic', ['codex', 'gemini'], { rounds: 1 });

      const round1 = result.rounds[0] as Array<{ backend: string; skipped?: boolean }>;
      expect(round1.every((e) => e.skipped === true)).toBe(true);
      // discussion_file still set
      expect(typeof result.discussion_file).toBe('string');
    });

    test('file still written when all participants are skipped', async () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude']));

      await runDiscussion('topic', ['codex', 'gemini'], { rounds: 1 });

      expect(fsModule.writeFileSync).toHaveBeenCalledTimes(1);
    });

    // ─── Synthesizer backend ──────────────────────────────────────────────

    test('synthesis result has backend matching synthesizer option', async () => {
      childProcess.execFileSync.mockReturnValue('synthesized answer');

      const result = await runDiscussion('topic', ['claude'], {
        rounds: 1,
        synthesizer: 'claude',
      });

      expect(result.synthesis.backend).toBe('claude');
    });

    // ─── Default options ──────────────────────────────────────────────────

    test('default rounds is 2 when not specified', async () => {
      const result = await runDiscussion('topic', ['claude']);
      expect(result.rounds).toHaveLength(2);
    });

    test('default synthesizer is claude', async () => {
      const result = await runDiscussion('topic', ['codex'], { rounds: 1 });
      expect(result.synthesis.backend).toBe('claude');
    });

    // ─── discussionsDir integration ───────────────────────────────────────

    test('discussionsDir called with cwd and milestone option', async () => {
      await runDiscussion('topic', ['claude'], {
        rounds: 1,
        cwd: '/my/project',
        milestone: 'v1.0.0',
      });

      expect(pathsModule.discussionsDir).toHaveBeenCalledWith('/my/project', 'v1.0.0');
    });

    test('discussion_file path is inside the discussions directory', async () => {
      const result = await runDiscussion('topic', ['claude'], { rounds: 1 });
      expect(result.discussion_file).toContain(FAKE_DISCUSSIONS_DIR);
    });
  });

  // ─── listDiscussions ───────────────────────────────────────────────────────

  describe('listDiscussions', () => {

    test('returns filenames from the discussions directory when it exists', () => {
      fsModule.existsSync.mockReturnValue(true);
      fsModule.readdirSync.mockReturnValue([
        'discussion-83-discussion-1234.md',
        'discussion-84-evaluation-5678.md',
      ]);

      const result = listDiscussions('/my/project');

      expect(result).toEqual([
        'discussion-83-discussion-1234.md',
        'discussion-84-evaluation-5678.md',
      ]);
    });

    test('returns empty array when discussions directory does not exist', () => {
      fsModule.existsSync.mockReturnValue(false);

      const result = listDiscussions('/my/project');

      expect(result).toEqual([]);
      expect(fsModule.readdirSync).not.toHaveBeenCalled();
    });

    test('calls discussionsDir with provided cwd and milestone', () => {
      fsModule.existsSync.mockReturnValue(true);
      fsModule.readdirSync.mockReturnValue([]);

      listDiscussions('/a/project', 'v2.0.0');

      expect(pathsModule.discussionsDir).toHaveBeenCalledWith('/a/project', 'v2.0.0');
    });

    test('calls discussionsDir with null milestone when not provided', () => {
      fsModule.existsSync.mockReturnValue(true);
      fsModule.readdirSync.mockReturnValue([]);

      listDiscussions('/a/project');

      expect(pathsModule.discussionsDir).toHaveBeenCalledWith('/a/project', undefined);
    });

    test('returns empty array when directory exists but is empty', () => {
      fsModule.existsSync.mockReturnValue(true);
      fsModule.readdirSync.mockReturnValue([]);

      const result = listDiscussions('/a/project');

      expect(result).toEqual([]);
    });
  });

  // ─── readDiscussion ────────────────────────────────────────────────────────

  describe('readDiscussion', () => {

    test('returns file content when file exists', () => {
      fsModule.existsSync.mockReturnValue(true);
      fsModule.readFileSync.mockReturnValue('# Discussion: test\n\nContent here');

      const result = readDiscussion('discussion-83-discussion-1234.md', '/my/project');

      expect(result).toBe('# Discussion: test\n\nContent here');
    });

    test('returns null when file does not exist', () => {
      fsModule.existsSync.mockReturnValue(false);

      const result = readDiscussion('nonexistent.md', '/my/project');

      expect(result).toBeNull();
      expect(fsModule.readFileSync).not.toHaveBeenCalled();
    });

    test('calls readFileSync with full file path', () => {
      fsModule.existsSync.mockReturnValue(true);
      fsModule.readFileSync.mockReturnValue('content');

      readDiscussion('myfile.md', '/my/project', 'v0.3.20');

      const [calledPath] = fsModule.readFileSync.mock.calls[0] as [string, string];
      expect(calledPath).toContain(FAKE_DISCUSSIONS_DIR);
      expect(calledPath).toContain('myfile.md');
    });

    test('calls discussionsDir with provided cwd and milestone', () => {
      fsModule.existsSync.mockReturnValue(true);
      fsModule.readFileSync.mockReturnValue('content');

      readDiscussion('file.md', '/root/project', 'v3.0.0');

      expect(pathsModule.discussionsDir).toHaveBeenCalledWith('/root/project', 'v3.0.0');
    });

    test('throws on path traversal attempt', () => {
      expect(() => readDiscussion('../../etc/passwd', '/my/project')).toThrow(
        /escape discussions directory/
      );
    });

    test('calls readFileSync with utf-8 encoding', () => {
      fsModule.existsSync.mockReturnValue(true);
      fsModule.readFileSync.mockReturnValue('content');

      readDiscussion('file.md', '/project');

      const [, encoding] = fsModule.readFileSync.mock.calls[0] as [string, string];
      expect(encoding).toBe('utf-8');
    });
  });
});
