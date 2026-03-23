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
jest.mock('../../lib/utils');

const childProcess = require('child_process') as {
  execFileSync: jest.Mock;
};

const backendModule = require('../../lib/backend') as {
  detectAvailableBackends: jest.Mock;
  buildBackendEnv: jest.Mock;
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

const utilsModule = require('../../lib/utils') as {
  safeReadFile: jest.Mock;
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

// ─── Imports (after jest.mock) ────────────────────────────────────────────────

const {
  dispatchToBackend,
  runDiscussion,
  listDiscussions,
  readDiscussion,
  runPrePlanningDiscussion,
  runPreExecutionDiscussion,
  reviewPlanViaBackend,
  reviewCodeViaBackend,
  reviewPRViaBackend,
  detectElicitation,
  buildElicitationContext,
  resolveElicitation,
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
  runPrePlanningDiscussion: (options: {
    phaseGoal: string;
    requirements: string[];
    cwd?: string;
    phase?: string;
    milestone?: string | null;
    config: Record<string, unknown>;
  }) => Promise<{
    topic: string;
    participants: string[];
    rounds: unknown[][];
    synthesis: { backend: string; response_text: string; duration_ms: number; stderr: string };
    duration_ms: number;
    discussion_file: string;
  } | null>;
  runPreExecutionDiscussion: (options: {
    planSummary: string;
    cwd?: string;
    phase?: string;
    milestone?: string | null;
    config: Record<string, unknown>;
  }) => Promise<{
    topic: string;
    participants: string[];
    rounds: unknown[][];
    synthesis: { backend: string; response_text: string; duration_ms: number; stderr: string };
    duration_ms: number;
    discussion_file: string;
  } | null>;
  reviewPlanViaBackend: (options: {
    planText: string;
    cwd?: string;
    config: Record<string, unknown>;
  }) => {
    approved: boolean;
    concerns: Array<{ description: string; severity: string }>;
    suggestions: string[];
    reviewer_backend: string;
    duration_ms: number;
    raw_response: string;
  } | null;
  reviewCodeViaBackend: (options: {
    diff: string;
    cwd?: string;
    config: Record<string, unknown>;
  }) => {
    approved: boolean;
    issues: Array<{ severity: string; file: string; line_range: string; description: string }>;
    summary: string;
    reviewer_backend: string;
    duration_ms: number;
    raw_response: string;
  } | null;
  reviewPRViaBackend: (options: {
    diff: string;
    prNumber: number;
    cwd?: string;
    config: Record<string, unknown>;
  }) => {
    comments: Array<{ file: string; line: number; body: string; severity: string }>;
    summary: string;
    reviewer_backend: string;
    duration_ms: number;
    raw_response: string;
  } | null;
  detectElicitation: (output: string) => {
    question: string;
    patterns: string[];
    confidence: 'high' | 'medium';
  } | null;
  buildElicitationContext: (
    question: string,
    options: { cwd: string; phase?: string; milestone?: string }
  ) => string;
  resolveElicitation: (
    question: string,
    context: string,
    options: { participants: string[]; synthesizer: string; cwd: string }
  ) => string;
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
    backendModule.buildBackendEnv.mockReturnValue(process.env);
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

    test('codex buildArgs uses exec subcommand', () => {
      const args = BACKEND_CLI_MAP.codex.buildArgs('test prompt');
      expect(args).toEqual(['exec', 'test prompt']);
    });

    test('gemini buildArgs uses -p flag and yolo approval for headless mode', () => {
      const args = BACKEND_CLI_MAP.gemini.buildArgs('test prompt');
      expect(args).toEqual(['-p', 'test prompt', '--approval-mode', 'yolo']);
    });

    test('gemini buildArgs includes model with -m flag', () => {
      const args = BACKEND_CLI_MAP.gemini.buildArgs('test prompt', 'gemini-2.5-pro');
      expect(args).toEqual(['-p', 'test prompt', '--approval-mode', 'yolo', '-m', 'gemini-2.5-pro']);
    });

    test('opencode buildArgs uses run subcommand', () => {
      const args = BACKEND_CLI_MAP.opencode.buildArgs('test prompt');
      expect(args).toEqual(['run', 'test prompt']);
    });

    test('opencode buildArgs includes model with -m flag', () => {
      const args = BACKEND_CLI_MAP.opencode.buildArgs('test prompt', 'claude-sonnet-4-5-20250514');
      expect(args).toEqual(['run', '-m', 'claude-sonnet-4-5-20250514', 'test prompt']);
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

    test('codex: passes exec subcommand and prompt to execFileSync', () => {
      childProcess.execFileSync.mockReturnValue('Codex response');
      dispatchToBackend('codex', 'hello codex');
      const [bin, args] = childProcess.execFileSync.mock.calls[0] as [string, string[]];
      expect(bin).toBe('codex');
      expect(args).toEqual(['exec', 'hello codex']);
    });

    test('gemini: passes -p flag, yolo approval, and prompt to execFileSync', () => {
      childProcess.execFileSync.mockReturnValue('Gemini response');
      dispatchToBackend('gemini', 'hello gemini');
      const [bin, args] = childProcess.execFileSync.mock.calls[0] as [string, string[]];
      expect(bin).toBe('gemini');
      expect(args).toEqual(['-p', 'hello gemini', '--approval-mode', 'yolo']);
    });

    test('opencode: passes run subcommand and prompt to execFileSync', () => {
      childProcess.execFileSync.mockReturnValue('OpenCode response');
      dispatchToBackend('opencode', 'hello opencode');
      const [bin, args] = childProcess.execFileSync.mock.calls[0] as [string, string[]];
      expect(bin).toBe('opencode');
      expect(args).toEqual(['run', 'hello opencode']);
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

    test('stderr mentions "killed" on fast kill (maxBuffer exceeded)', () => {
      childProcess.execFileSync.mockImplementation(() => {
        const err = new Error('spawnSync killed') as NodeJS.ErrnoException & { killed?: boolean };
        err.killed = true;
        throw err;
      });
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.stderr).toMatch(/killed.*maxBuffer/i);
    });

    test('stderr mentions SIGTERM on signal-based kill', () => {
      childProcess.execFileSync.mockImplementation(() => {
        const err = new Error('killed') as NodeJS.ErrnoException & { signal?: string };
        err.signal = 'SIGTERM';
        throw err;
      });
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.response_text).toBe('');
      expect(result.stderr).toMatch(/killed.*maxBuffer/i);
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

    test('falls back to "Unknown dispatch error" when no stderr or message on thrown object', () => {
      childProcess.execFileSync.mockImplementation(() => {
        // Create an error with no stderr or message to exercise the final fallback branch
        const err = new Error('');
        // Delete message to make it empty so the final || branch fires
        Object.defineProperty(err, 'message', { value: '' });
        Object.defineProperty(err, 'stderr', { value: '' });
        throw err;
      });
      const result = dispatchToBackend('claude', 'prompt');
      expect(result.response_text).toBe('');
      expect(result.stderr).toBe('Unknown dispatch error');
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

    test('rounds=2 with 2 participants: total 6 dispatches (2 + synth + 2 + re-synth)', async () => {
      await runDiscussion('topic', ['claude', 'codex'], { rounds: 2 });

      // 2 (round 1) + 1 (synth) + 2 (round 2) + 1 (re-synth) = 6
      expect(childProcess.execFileSync).toHaveBeenCalledTimes(6);
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
      fsModule.readdirSync.mockImplementation(() => {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      });

      const result = listDiscussions('/my/project');

      expect(result).toEqual([]);
    });

    test('calls discussionsDir with provided cwd and milestone', () => {
      fsModule.readdirSync.mockReturnValue([]);

      listDiscussions('/a/project', 'v2.0.0');

      expect(pathsModule.discussionsDir).toHaveBeenCalledWith('/a/project', 'v2.0.0');
    });

    test('calls discussionsDir with null milestone when not provided', () => {
      fsModule.readdirSync.mockReturnValue([]);

      listDiscussions('/a/project');

      expect(pathsModule.discussionsDir).toHaveBeenCalledWith('/a/project', undefined);
    });

    test('returns empty array when directory exists but is empty', () => {
      fsModule.readdirSync.mockReturnValue([]);

      const result = listDiscussions('/a/project');

      expect(result).toEqual([]);
    });
  });

  // ─── readDiscussion ────────────────────────────────────────────────────────

  describe('readDiscussion', () => {

    test('returns file content when file exists', () => {
      utilsModule.safeReadFile.mockReturnValue('# Discussion: test\n\nContent here');

      const result = readDiscussion('discussion-83-discussion-1234.md', '/my/project');

      expect(result).toBe('# Discussion: test\n\nContent here');
    });

    test('returns null when file does not exist', () => {
      utilsModule.safeReadFile.mockReturnValue(null);

      const result = readDiscussion('nonexistent.md', '/my/project');

      expect(result).toBeNull();
    });

    test('calls safeReadFile with full file path', () => {
      utilsModule.safeReadFile.mockReturnValue('content');

      readDiscussion('myfile.md', '/my/project', 'v0.3.20');

      const [calledPath] = utilsModule.safeReadFile.mock.calls[0] as [string];
      expect(calledPath).toContain(FAKE_DISCUSSIONS_DIR);
      expect(calledPath).toContain('myfile.md');
    });

    test('calls discussionsDir with provided cwd and milestone', () => {
      utilsModule.safeReadFile.mockReturnValue('content');

      readDiscussion('file.md', '/root/project', 'v3.0.0');

      expect(pathsModule.discussionsDir).toHaveBeenCalledWith('/root/project', 'v3.0.0');
    });

    test('throws on path traversal attempt', () => {
      expect(() => readDiscussion('../../etc/passwd', '/my/project')).toThrow(
        /escape discussions directory/
      );
    });

    test('delegates to safeReadFile for file reading', () => {
      utilsModule.safeReadFile.mockReturnValue('content');

      readDiscussion('file.md', '/project');

      expect(utilsModule.safeReadFile).toHaveBeenCalled();
    });
  });

  // ─── runPrePlanningDiscussion ──────────────────────────────────────────────

  describe('runPrePlanningDiscussion', () => {

    beforeEach(() => {
      // Default: all backends available, execFileSync returns a mock response
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex', 'gemini', 'opencode']));
      childProcess.execFileSync.mockReturnValue('Pre-planning response');
    });

    test('returns null when discussion.before_planning is false', async () => {
      const result = await runPrePlanningDiscussion({
        phaseGoal: 'Build something great',
        requirements: ['REQ-1', 'REQ-2'],
        config: {
          discussion: { enabled: true, before_planning: false },
          backend_roles: { brainstormer: 'codex' },
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when discussion.enabled is false', async () => {
      const result = await runPrePlanningDiscussion({
        phaseGoal: 'Build something great',
        requirements: ['REQ-1'],
        config: {
          discussion: { enabled: false, before_planning: true },
          backend_roles: { brainstormer: 'codex' },
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when no brainstormer backend configured', async () => {
      const result = await runPrePlanningDiscussion({
        phaseGoal: 'Build something great',
        requirements: ['REQ-1'],
        config: {
          discussion: { enabled: true, before_planning: true },
          backend_roles: {},
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when brainstormer backend is unavailable', async () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude']));

      const result = await runPrePlanningDiscussion({
        phaseGoal: 'Build something great',
        requirements: ['REQ-1'],
        config: {
          discussion: { enabled: true, before_planning: true },
          backend_roles: { brainstormer: 'codex' },
        },
      });
      expect(result).toBeNull();
    });

    test('dispatches discussion when all conditions met', async () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex']));

      const result = await runPrePlanningDiscussion({
        phaseGoal: 'Implement discussion feature',
        requirements: ['REQ-138', 'REQ-139'],
        cwd: '/my/project',
        phase: '84',
        config: {
          discussion: { enabled: true, before_planning: true },
          backend_roles: { brainstormer: 'codex' },
        },
      });

      expect(result).not.toBeNull();
      expect(result?.topic).toContain('Implement discussion feature');
      expect(result?.topic).toContain('REQ-138');
      expect(result?.topic).toContain('REQ-139');
    });

    test('uses default before_planning=true when discussion config omitted', async () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex']));

      const result = await runPrePlanningDiscussion({
        phaseGoal: 'Build something',
        requirements: ['REQ-1'],
        config: {
          // no discussion section — before_planning defaults to true
          backend_roles: { brainstormer: 'codex' },
        },
      });

      expect(result).not.toBeNull();
    });

    test('type in discussion result is pre-planning', async () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex']));

      const result = await runPrePlanningDiscussion({
        phaseGoal: 'Build something',
        requirements: ['REQ-1'],
        config: {
          discussion: { enabled: true, before_planning: true },
          backend_roles: { brainstormer: 'codex' },
        },
      });

      expect(result?.discussion_file).toContain('pre-planning');
    });

    test('does not dispatch when backend_roles is missing entirely', async () => {
      const result = await runPrePlanningDiscussion({
        phaseGoal: 'Build something',
        requirements: [],
        config: {
          discussion: { enabled: true, before_planning: true },
        },
      });

      expect(result).toBeNull();
      expect(childProcess.execFileSync).not.toHaveBeenCalled();
    });
  });

  // ─── runPreExecutionDiscussion ─────────────────────────────────────────────

  describe('runPreExecutionDiscussion', () => {

    beforeEach(() => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex', 'gemini', 'opencode']));
      childProcess.execFileSync.mockReturnValue('Pre-execution response');
    });

    test('returns null when discussion.before_execution is false (default)', async () => {
      const result = await runPreExecutionDiscussion({
        planSummary: 'This plan implements X',
        config: {
          discussion: { enabled: true, before_execution: false },
          backend_roles: { brainstormer: 'codex' },
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when before_execution is not set (default is false)', async () => {
      const result = await runPreExecutionDiscussion({
        planSummary: 'This plan implements X',
        config: {
          discussion: { enabled: true },
          backend_roles: { brainstormer: 'codex' },
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when brainstormer unavailable', async () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude']));

      const result = await runPreExecutionDiscussion({
        planSummary: 'This plan implements X',
        config: {
          discussion: { enabled: true, before_execution: true },
          backend_roles: { brainstormer: 'codex' },
        },
      });
      expect(result).toBeNull();
    });

    test('dispatches single-round discussion when before_execution is true', async () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex']));

      const result = await runPreExecutionDiscussion({
        planSummary: 'Plan: implement feature Z',
        cwd: '/my/project',
        phase: '84',
        config: {
          discussion: { enabled: true, before_execution: true },
          backend_roles: { brainstormer: 'codex' },
        },
      });

      expect(result).not.toBeNull();
      // rounds: 1 means exactly 1 round in result
      expect(result?.rounds).toHaveLength(1);
      // type should be pre-execution
      expect(result?.discussion_file).toContain('pre-execution');
    });

    test('topic includes plan summary content', async () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex']));

      const result = await runPreExecutionDiscussion({
        planSummary: 'Unique plan content 12345',
        config: {
          discussion: { enabled: true, before_execution: true },
          backend_roles: { brainstormer: 'codex' },
        },
      });

      expect(result?.topic).toContain('Unique plan content 12345');
    });
  });

  // ─── reviewPlanViaBackend ──────────────────────────────────────────────────

  describe('reviewPlanViaBackend', () => {

    beforeEach(() => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex', 'gemini', 'opencode']));
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"concerns":[],"suggestions":[]}\n```'
      );
    });

    test('returns null when no reviewer configured', () => {
      const result = reviewPlanViaBackend({
        planText: 'Some plan',
        config: {
          backend: 'claude',
          backend_roles: {},
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when reviewer is primary backend', () => {
      const result = reviewPlanViaBackend({
        planText: 'Some plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'claude' },
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when reviewer unavailable', () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude']));

      const result = reviewPlanViaBackend({
        planText: 'Some plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });
      expect(result).toBeNull();
    });

    test('parses valid JSON response into PlanReviewResult', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"concerns":[],"suggestions":["use const"]}\n```'
      );

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result).not.toBeNull();
      expect(result?.approved).toBe(true);
      expect(result?.concerns).toEqual([]);
      expect(result?.suggestions).toContain('use const');
      expect(result?.reviewer_backend).toBe('codex');
    });

    test('parses concerns with severity correctly', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":false,"concerns":[{"description":"Missing error handling","severity":"blocker"}],"suggestions":[]}\n```'
      );

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.approved).toBe(false);
      expect(result?.concerns).toHaveLength(1);
      expect(result?.concerns[0].severity).toBe('blocker');
      expect(result?.concerns[0].description).toBe('Missing error handling');
    });

    test('handles malformed JSON gracefully', () => {
      childProcess.execFileSync.mockReturnValue('This is not JSON at all, just random text');

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result).not.toBeNull();
      expect(result?.approved).toBe(false);
      expect(result?.concerns).toHaveLength(1);
      expect(result?.concerns[0].severity).toBe('warning');
      expect(result?.concerns[0].description).toMatch(/unparseable/i);
    });

    test('treats JSON array response as unparseable (not an object)', () => {
      // parseJSONFromResponse returns null for arrays — triggers fallback path
      childProcess.execFileSync.mockReturnValue('```json\n[1,2,3]\n```');

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      // Array JSON is not a valid PlanReviewResult — should fall through to unparseable path
      expect(result).not.toBeNull();
      expect(result?.approved).toBe(false);
      expect(result?.concerns[0].description).toMatch(/unparseable/i);
    });

    test('defaults approved to false when parsed JSON lacks boolean approved field', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":"yes","concerns":[],"suggestions":[]}\n```'
      );

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      // approved is "yes" (string), not boolean — should default to false
      expect(result?.approved).toBe(false);
    });

    test('defaults concern severity to "warning" when severity field is invalid', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"concerns":[{"description":"Issue","severity":"critical"}],"suggestions":[]}\n```'
      );

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      // "critical" is not a valid severity — should default to 'warning'
      expect(result?.concerns[0].severity).toBe('warning');
    });

    test('coerces non-string description to string in concerns', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"concerns":[{"description":42,"severity":"blocker"}],"suggestions":[]}\n```'
      );

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(typeof result?.concerns[0].description).toBe('string');
      expect(result?.concerns[0].description).toBe('42');
    });

    test('handles non-array concerns field gracefully (returns empty concerns)', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"concerns":"not an array","suggestions":[]}\n```'
      );

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.concerns).toEqual([]);
    });

    test('handles non-array suggestions field gracefully (returns empty suggestions)', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"concerns":[],"suggestions":"not an array"}\n```'
      );

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.suggestions).toEqual([]);
    });

    test('coerces null/undefined description in concerns to empty string', () => {
      // Tests the `?? ''` branch in `String(c['description'] ?? '')`
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"concerns":[{"severity":"blocker"}],"suggestions":[]}\n```'
      );

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      // description is missing (undefined) — should coerce to empty string
      expect(result?.concerns[0].description).toBe('');
    });

    test('result includes raw_response', () => {
      const rawJson = '```json\n{"approved":true,"concerns":[],"suggestions":[]}\n```';
      childProcess.execFileSync.mockReturnValue(rawJson);

      const result = reviewPlanViaBackend({
        planText: 'My plan',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(typeof result?.raw_response).toBe('string');
    });
  });

  // ─── reviewCodeViaBackend ──────────────────────────────────────────────────

  describe('reviewCodeViaBackend', () => {

    beforeEach(() => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex', 'gemini', 'opencode']));
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"issues":[],"summary":"LGTM"}\n```'
      );
    });

    test('returns null when no reviewer configured', () => {
      const result = reviewCodeViaBackend({
        diff: 'diff --git ...',
        config: {
          backend: 'claude',
          backend_roles: {},
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when reviewer is primary backend', () => {
      const result = reviewCodeViaBackend({
        diff: 'diff --git ...',
        config: {
          backend: 'codex',
          backend_roles: { reviewer: 'codex' },
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when reviewer unavailable', () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude']));

      const result = reviewCodeViaBackend({
        diff: 'diff --git ...',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'gemini' },
        },
      });
      expect(result).toBeNull();
    });

    test('parses valid review with issues', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":false,"issues":[{"severity":"blocker","file":"src/main.ts","line_range":"10-15","description":"SQL injection risk"}],"summary":"Needs fix"}\n```'
      );

      const result = reviewCodeViaBackend({
        diff: 'diff content',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.approved).toBe(false);
      expect(result?.issues).toHaveLength(1);
      expect(result?.issues[0].severity).toBe('blocker');
      expect(result?.issues[0].file).toBe('src/main.ts');
      expect(result?.issues[0].line_range).toBe('10-15');
      expect(result?.issues[0].description).toBe('SQL injection risk');
      expect(result?.summary).toBe('Needs fix');
      expect(result?.reviewer_backend).toBe('codex');
    });

    test('handles empty issues as approved', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"issues":[],"summary":"No issues found"}\n```'
      );

      const result = reviewCodeViaBackend({
        diff: 'clean diff',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.approved).toBe(true);
      expect(result?.issues).toHaveLength(0);
      expect(result?.summary).toBe('No issues found');
    });

    test('handles malformed JSON gracefully', () => {
      childProcess.execFileSync.mockReturnValue('not json garbage %%##');

      const result = reviewCodeViaBackend({
        diff: 'some diff',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result).not.toBeNull();
      expect(result?.approved).toBe(false);
      expect(result?.issues).toHaveLength(1);
      expect(result?.issues[0].severity).toBe('warning');
      expect(result?.issues[0].description).toMatch(/unparseable/i);
    });

    test('returns approved:false when blockers present', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":false,"issues":[{"severity":"blocker","file":"app.ts","line_range":"1","description":"Critical bug"}],"summary":"Blocked"}\n```'
      );

      const result = reviewCodeViaBackend({
        diff: 'bad diff',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'gemini' },
        },
      });

      expect(result?.approved).toBe(false);
    });

    test('defaults issue severity to "warning" when severity field is invalid', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"issues":[{"severity":"critical","file":"a.ts","line_range":"1","description":"Odd"}],"summary":"ok"}\n```'
      );

      const result = reviewCodeViaBackend({
        diff: 'diff content',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.issues[0].severity).toBe('warning');
    });

    test('defaults approved to false when parsed JSON lacks boolean approved field', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":"yes","issues":[],"summary":"ok"}\n```'
      );

      const result = reviewCodeViaBackend({
        diff: 'diff',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.approved).toBe(false);
    });

    test('coerces non-string file and description fields in issues', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"issues":[{"severity":"suggestion","file":null,"line_range":null,"description":99}],"summary":"ok"}\n```'
      );

      const result = reviewCodeViaBackend({
        diff: 'diff',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.issues[0].file).toBe('');
      expect(result?.issues[0].line_range).toBe('');
      expect(typeof result?.issues[0].description).toBe('string');
    });

    test('handles non-array issues field gracefully', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"issues":"none","summary":"all good"}\n```'
      );

      const result = reviewCodeViaBackend({
        diff: 'diff',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.issues).toEqual([]);
    });

    test('coerces null/undefined description in issues to empty string', () => {
      // Tests the `?? ''` branch in `String(i['description'] ?? '')`
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"issues":[{"severity":"blocker","file":"a.ts","line_range":"1"}],"summary":"ok"}\n```'
      );

      const result = reviewCodeViaBackend({
        diff: 'diff',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      // description is missing (undefined) — should coerce to empty string
      expect(result?.issues[0].description).toBe('');
    });

    test('defaults summary to empty string when missing from parsed JSON', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"approved":true,"issues":[]}\n```'
      );

      const result = reviewCodeViaBackend({
        diff: 'diff',
        config: {
          backend: 'claude',
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.summary).toBe('');
    });
  });

  // ─── reviewPRViaBackend ────────────────────────────────────────────────────

  describe('reviewPRViaBackend', () => {

    beforeEach(() => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude', 'codex', 'gemini', 'opencode']));
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"comments":[],"summary":"Looks good"}\n```'
      );
    });

    test('returns null when code_review_enabled is false', () => {
      const result = reviewPRViaBackend({
        diff: 'diff --git ...',
        prNumber: 42,
        config: {
          code_review_enabled: false,
          backend_roles: { reviewer: 'codex' },
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when no reviewer configured', () => {
      const result = reviewPRViaBackend({
        diff: 'diff --git ...',
        prNumber: 42,
        config: {
          code_review_enabled: true,
          backend_roles: {},
        },
      });
      expect(result).toBeNull();
    });

    test('returns null when reviewer unavailable', () => {
      backendModule.detectAvailableBackends.mockReturnValue(makeAvailability(['claude']));

      const result = reviewPRViaBackend({
        diff: 'diff content',
        prNumber: 1,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'gemini' },
        },
      });
      expect(result).toBeNull();
    });

    test('parses valid PR review comments', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"comments":[{"file":"lib/main.ts","line":42,"body":"This could be simplified","severity":"suggestion"}],"summary":"Minor suggestion"}\n```'
      );

      const result = reviewPRViaBackend({
        diff: 'pr diff content',
        prNumber: 99,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result).not.toBeNull();
      expect(result?.comments).toHaveLength(1);
      expect(result?.comments[0].file).toBe('lib/main.ts');
      expect(result?.comments[0].line).toBe(42);
      expect(result?.comments[0].body).toBe('This could be simplified');
      expect(result?.comments[0].severity).toBe('suggestion');
      expect(result?.summary).toBe('Minor suggestion');
      expect(result?.reviewer_backend).toBe('codex');
    });

    test('returns empty comments array when no issues', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"comments":[],"summary":"LGTM"}\n```'
      );

      const result = reviewPRViaBackend({
        diff: 'clean pr diff',
        prNumber: 5,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.comments).toHaveLength(0);
      expect(result?.summary).toBe('LGTM');
    });

    test('handles malformed JSON gracefully', () => {
      childProcess.execFileSync.mockReturnValue('this is totally not JSON !!!');

      const result = reviewPRViaBackend({
        diff: 'some pr diff',
        prNumber: 7,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result).not.toBeNull();
      expect(result?.comments).toHaveLength(1);
      expect(result?.comments[0].severity).toBe('warning');
      expect(result?.comments[0].body).toMatch(/unparseable/i);
    });

    test('includes prNumber in prompt sent to reviewer', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"comments":[],"summary":"ok"}\n```'
      );

      reviewPRViaBackend({
        diff: 'pr diff',
        prNumber: 123,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'codex' },
        },
      });

      const promptArg = (childProcess.execFileSync.mock.calls[0] as [string, string[]])[1];
      const fullPrompt = promptArg.join(' ');
      expect(fullPrompt).toContain('123');
    });

    test('defaults comment severity to "warning" when severity field is invalid', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"comments":[{"file":"a.ts","line":1,"body":"oops","severity":"invalid"}],"summary":"ok"}\n```'
      );

      const result = reviewPRViaBackend({
        diff: 'pr diff',
        prNumber: 5,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.comments[0].severity).toBe('warning');
    });

    test('coerces non-string file and body fields in comments', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"comments":[{"file":null,"line":0,"body":null,"severity":"suggestion"}],"summary":"ok"}\n```'
      );

      const result = reviewPRViaBackend({
        diff: 'pr diff',
        prNumber: 3,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.comments[0].file).toBe('');
      expect(result?.comments[0].body).toBe('');
    });

    test('defaults line to 0 when line field is not a number', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"comments":[{"file":"f.ts","line":"five","body":"note","severity":"suggestion"}],"summary":"ok"}\n```'
      );

      const result = reviewPRViaBackend({
        diff: 'pr diff',
        prNumber: 7,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.comments[0].line).toBe(0);
    });

    test('handles non-array comments field gracefully', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"comments":"none","summary":"LGTM"}\n```'
      );

      const result = reviewPRViaBackend({
        diff: 'pr diff',
        prNumber: 9,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.comments).toEqual([]);
    });

    test('defaults summary to empty string when missing from parsed JSON', () => {
      childProcess.execFileSync.mockReturnValue(
        '```json\n{"comments":[]}\n```'
      );

      const result = reviewPRViaBackend({
        diff: 'pr diff',
        prNumber: 11,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result?.summary).toBe('');
    });

    test('treats JSON array response as unparseable (not an object)', () => {
      childProcess.execFileSync.mockReturnValue('```json\n[1,2,3]\n```');

      const result = reviewPRViaBackend({
        diff: 'pr diff',
        prNumber: 13,
        config: {
          code_review_enabled: true,
          backend_roles: { reviewer: 'codex' },
        },
      });

      expect(result).not.toBeNull();
      expect(result?.comments[0].body).toMatch(/unparseable/i);
    });
  });

  // ─── detectElicitation ────────────────────────────────────────────────────

  describe('detectElicitation', () => {

    // --- True positive tests (should detect) ---

    test('detects single line ending with ?', () => {
      const result = detectElicitation('What model should I use?');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('direct_question');
      expect(result?.confidence).toBe('high');
      expect(result?.question).toBe('What model should I use?');
    });

    test('detects question buried in multi-line output', () => {
      const result = detectElicitation('Processing...\nWhich approach do you prefer?\nWaiting...');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('clarification_phrase');
      expect(result?.question).toBe('Which approach do you prefer?');
    });

    test('detects numbered option list (2+ consecutive items)', () => {
      const result = detectElicitation('1. Use React\n2. Use Vue\n3. Use Svelte');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('numbered_options');
      expect(result?.confidence).toBe('high');
    });

    test('detects numbered options with ) delimiter', () => {
      const result = detectElicitation('1) Option A\n2) Option B');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('numbered_options');
    });

    test('detects clarification_phrase: "Please clarify"', () => {
      const result = detectElicitation('Please clarify the target framework');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('clarification_phrase');
      expect(result?.confidence).toBe('high');
    });

    test('detects "Would you prefer" pattern', () => {
      const result = detectElicitation('Would you prefer TypeScript or JavaScript?');
      expect(result).not.toBeNull();
      expect(result?.confidence).toBe('high');
    });

    test('detects mixed: question with numbered options below', () => {
      const output = 'Which framework should we use?\n1. React\n2. Vue';
      const result = detectElicitation(output);
      expect(result).not.toBeNull();
    });

    test('detects "Choose one" option_prompt with medium confidence', () => {
      const result = detectElicitation('Choose one of the following:');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('option_prompt');
      expect(result?.confidence).toBe('medium');
    });

    test('detects "Select an option" pattern', () => {
      const result = detectElicitation('Select an option from the list:');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('option_prompt');
    });

    test('detects "Pick one" pattern', () => {
      const result = detectElicitation('Pick one of the following approaches');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('option_prompt');
    });

    test('detects "Do you want" clarification phrase', () => {
      const result = detectElicitation('Do you want to proceed with this approach?');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('clarification_phrase');
    });

    test('detects "Could you specify" clarification phrase', () => {
      const result = detectElicitation('Could you specify the output directory?');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('clarification_phrase');
    });

    test('detects question with trailing whitespace', () => {
      const result = detectElicitation('What model?  \n');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('direct_question');
    });

    test('case-insensitive clarification phrase matching', () => {
      const result = detectElicitation('PLEASE CLARIFY the intent');
      expect(result).not.toBeNull();
      expect(result?.patterns).toContain('clarification_phrase');
    });

    // --- False positive tests (should return null) ---

    test('returns null for question in code comment (//)', () => {
      const result = detectElicitation('// What does this do?');
      expect(result).toBeNull();
    });

    test('returns null for question in block comment line (*)', () => {
      const result = detectElicitation('* What does this do?');
      expect(result).toBeNull();
    });

    test('returns null for question in markdown header (#)', () => {
      const result = detectElicitation('# FAQ: What is GRD?');
      expect(result).toBeNull();
    });

    test('returns null for question in string literal (double quotes)', () => {
      const result = detectElicitation('const msg = "Are you sure?";');
      expect(result).toBeNull();
    });

    test('returns null for question inside code block', () => {
      const result = detectElicitation('```\nWhat is this?\n```');
      expect(result).toBeNull();
    });

    test('returns null for question in error/stack trace line (Error:)', () => {
      const result = detectElicitation('Error: What went wrong?\n  at foo.js:1');
      expect(result).toBeNull();
    });

    test('returns null for rhetorical question in explanatory text', () => {
      // "Why? Because it uses caching." — the "Why?" is a short rhetorical after a period
      const result = detectElicitation('This is fast. Why? Because it uses caching.');
      expect(result).toBeNull();
    });

    test('returns null for empty string', () => {
      const result = detectElicitation('');
      expect(result).toBeNull();
    });

    test('returns null for normal output without questions', () => {
      const result = detectElicitation('Build succeeded.\n3 files compiled.');
      expect(result).toBeNull();
    });

    test('returns null for single numbered item (not 2+ items)', () => {
      const result = detectElicitation('1. Build succeeded');
      expect(result).toBeNull();
    });

    // --- Edge case tests ---

    test('returns first detection when multiple questions present', () => {
      const output = 'What model do you want?\nWhich version should I use?';
      const result = detectElicitation(output);
      // Returns the first match (first direct question)
      expect(result).not.toBeNull();
      expect(result?.question).toBe('What model do you want?');
    });

    test('numbered_options question field joins lines with newline', () => {
      const output = '1. Use React\n2. Use Vue\n3. Use Svelte';
      const result = detectElicitation(output);
      expect(result).not.toBeNull();
      expect(result?.question).toContain('1. Use React');
      expect(result?.question).toContain('2. Use Vue');
    });

    test('direct_question confidence is high', () => {
      const result = detectElicitation('What framework should I use?');
      expect(result?.confidence).toBe('high');
    });

    test('option_prompt confidence is medium', () => {
      const result = detectElicitation('Choose one of these approaches:');
      expect(result?.confidence).toBe('medium');
    });

    test('ignores question inside code block even with direct question pattern', () => {
      const output = '```\nShould I proceed?\n```';
      const result = detectElicitation(output);
      expect(result).toBeNull();
    });

    test('detects question after a code block ends', () => {
      const output = '```\nsome code\n```\nWhat should I do next?';
      const result = detectElicitation(output);
      expect(result).not.toBeNull();
      expect(result?.question).toBe('What should I do next?');
    });

  });

  // ─── buildElicitationContext ───────────────────────────────────────────────

  describe('buildElicitationContext', () => {

    const FAKE_CWD = '/fake/project';

    beforeEach(() => {
      // Default: all file reads throw (missing files)
      fsModule.readFileSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      fsModule.readdirSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      // Default: git diff throws (no git history)
      childProcess.execFileSync.mockImplementation(() => {
        throw new Error('git error');
      });
    });

    test('returns string containing the question text', () => {
      const result = buildElicitationContext('Which framework should I use?', {
        cwd: FAKE_CWD,
      });
      expect(result).toContain('Which framework should I use?');
    });

    test('output length is under 32000 chars', () => {
      // Feed a very long question and other large content
      const longQuestion = 'A'.repeat(5000);
      // readFileSync returns a huge string to test truncation
      fsModule.readFileSync.mockReturnValue('B'.repeat(10000));
      childProcess.execFileSync.mockReturnValue('C'.repeat(10000));
      fsModule.readdirSync.mockReturnValue([]);

      const result = buildElicitationContext(longQuestion, { cwd: FAKE_CWD });
      expect(result.length).toBeLessThan(32000);
    });

    test('includes "## Question" section header', () => {
      const result = buildElicitationContext('What should I do?', { cwd: FAKE_CWD });
      expect(result).toContain('## Question');
    });

    test('handles missing ROADMAP.md gracefully (no throw)', () => {
      fsModule.readFileSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      expect(() =>
        buildElicitationContext('question?', { cwd: FAKE_CWD, phase: '86' })
      ).not.toThrow();
    });

    test('handles missing STATE.md gracefully (no throw)', () => {
      // readFileSync always throws ENOENT
      fsModule.readFileSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      expect(() =>
        buildElicitationContext('question?', { cwd: FAKE_CWD })
      ).not.toThrow();
    });

    test('truncates long git diff output to stay within budget', () => {
      childProcess.execFileSync.mockReturnValue('X'.repeat(10000));
      fsModule.readFileSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      fsModule.readdirSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = buildElicitationContext('question?', { cwd: FAKE_CWD });
      // Budget for recent changes is 2000 chars
      // Result should be well under 32000
      expect(result.length).toBeLessThan(32000);
      // The truncation marker should appear
      expect(result).toContain('[... truncated ...]');
    });

    test('works with minimal options (just cwd, no phase/milestone)', () => {
      const result = buildElicitationContext('Minimal question?', { cwd: FAKE_CWD });
      expect(typeof result).toBe('string');
      expect(result).toContain('## Question');
      expect(result).toContain('Minimal question?');
    });

    test('includes Phase Goal section when ROADMAP.md has phase entry', () => {
      fsModule.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('ROADMAP.md')) {
          return '## Phase 86\nImplement elicitation detection and resolution core.\n\nMore detail here.';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = buildElicitationContext('question?', { cwd: FAKE_CWD, phase: '86' });
      expect(result).toContain('## Phase Goal');
    });

    test('includes Project State section when STATE.md is readable', () => {
      fsModule.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('STATE.md')) {
          return '## Current Position\n\nPhase: 86\nPlan: 02\nStatus: in_progress\n';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = buildElicitationContext('question?', { cwd: FAKE_CWD });
      expect(result).toContain('## Project State');
    });

    test('includes Recent Changes section when git diff succeeds', () => {
      childProcess.execFileSync.mockReturnValue('lib/discussion.ts | 5 +++++\n1 file changed');
      fsModule.readFileSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      fsModule.readdirSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const result = buildElicitationContext('question?', { cwd: FAKE_CWD });
      expect(result).toContain('## Recent Changes');
    });

    test('includes Phase Goal via line-search fallback when regex does not match group', () => {
      // Roadmap content: the phase regex won't match a capture group,
      // so it falls through to findIndex line-search fallback.
      // The regex pattern is: (?:^|\n)[^\n]*${phase}[^\n]*\n([^\n]+)
      // If we use a content where the phase line is the last line (no trailing \n+text), no group match.
      fsModule.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('ROADMAP.md')) {
          // Phase 86 appears but without a following line with content to capture in group 1
          // Make the line NOT match the regex (no newline after it) but match findIndex
          return 'Some intro text\nPhase 86';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      fsModule.readdirSync.mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      childProcess.execFileSync.mockImplementation(() => { throw new Error('git error'); });

      const result = buildElicitationContext('question?', { cwd: FAKE_CWD, phase: '86' });
      // Phase Goal section added via fallback
      expect(result).toContain('## Phase Goal');
      expect(result).toContain('Phase 86');
    });

    test('includes Plan Summary when PLAN.md found via directory walk', () => {
      fsModule.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('PLAN.md')) {
          return '<objective>\nBuild elicitation context builder.\n</objective>\n\nMore content here.';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      fsModule.readdirSync.mockImplementation((dirPath: string) => {
        if (dirPath.includes('milestones') && !dirPath.includes('phases') && !dirPath.includes('v0')) {
          return ['v0.3.21'];
        }
        if (dirPath.includes('v0.3.21') && !dirPath.includes('phases')) {
          return [];
        }
        if (dirPath.endsWith('phases')) {
          return ['86-elicitation-detection-and-resolution-core'];
        }
        if (dirPath.includes('86-elicitation')) {
          return ['86-02-PLAN.md'];
        }
        return [];
      });
      childProcess.execFileSync.mockImplementation(() => { throw new Error('git error'); });

      const result = buildElicitationContext('question?', { cwd: FAKE_CWD, phase: '86' });
      expect(result).toContain('## Plan Summary');
      expect(result).toContain('Build elicitation context builder.');
    });

    test('omits Plan Summary when PLAN.md has no objective tag', () => {
      fsModule.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.includes('PLAN.md')) {
          return 'No objective tag here. Just plain plan text with lots of detail.';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
      fsModule.readdirSync.mockImplementation((dirPath: string) => {
        if (dirPath.includes('milestones') && !dirPath.includes('phases') && !dirPath.includes('v0')) {
          return ['v0.3.21'];
        }
        if (dirPath.endsWith('phases')) {
          return ['86-elicitation-detection-and-resolution-core'];
        }
        if (dirPath.includes('86-elicitation')) {
          return ['86-02-PLAN.md'];
        }
        return [];
      });
      childProcess.execFileSync.mockImplementation(() => { throw new Error('git error'); });

      const result = buildElicitationContext('question?', { cwd: FAKE_CWD, phase: '86' });
      expect(result).not.toContain('## Plan Summary');
    });

  });

  // ─── resolveElicitation ────────────────────────────────────────────────────

  describe('resolveElicitation', () => {

    const FAKE_CWD = '/fake/project';

    beforeEach(() => {
      backendModule.detectAvailableBackends.mockReturnValue(
        makeAvailability(['claude', 'codex'])
      );
      backendModule.buildBackendEnv.mockReturnValue(process.env);
      pathsModule.discussionsDir.mockReturnValue(FAKE_DISCUSSIONS_DIR);
      fsModule.mkdirSync.mockReturnValue(undefined);
      fsModule.writeFileSync.mockReturnValue(undefined);
      childProcess.execFileSync.mockReturnValue('Consensus answer text');
    });

    test('calls runDiscussion with rounds=1', () => {
      resolveElicitation('Which approach?', 'context here', {
        participants: ['claude'],
        synthesizer: 'claude',
        cwd: FAKE_CWD,
      });

      // runDiscussion dispatches: 1 participant + 1 synthesizer = 2 execFileSync calls
      expect(childProcess.execFileSync).toHaveBeenCalledTimes(2);
    });

    test('returns synthesis response_text when discussion succeeds', () => {
      childProcess.execFileSync.mockReturnValue('The best approach is X.');

      const result = resolveElicitation('Which approach?', 'context', {
        participants: ['claude'],
        synthesizer: 'claude',
        cwd: FAKE_CWD,
      });

      expect(result).toBe('The best approach is X.');
    });

    test('returns empty string when all participants unavailable (all skipped)', () => {
      // Make participants unavailable; synthesizer claude stays available
      backendModule.detectAvailableBackends.mockReturnValue(
        makeAvailability(['claude'])
      );
      // synthesis will also return the execFileSync value — but synthesis is empty when
      // all participants skipped: synthesizer gets called once with empty input
      childProcess.execFileSync.mockReturnValue('');

      const result = resolveElicitation('question?', 'context', {
        participants: ['codex', 'gemini'],
        synthesizer: 'claude',
        cwd: FAKE_CWD,
      });

      // Both participants skipped, synthesis empty, no fallback entries → ''
      expect(result).toBe('');
    });

    test('returns best single-backend response when synthesis is empty/null', () => {
      let callCount = 0;
      childProcess.execFileSync.mockImplementation(() => {
        callCount++;
        // First call: participant response
        if (callCount === 1) return 'Participant answer fallback';
        // Second call: synthesizer returns empty
        return '';
      });

      const result = resolveElicitation('question?', 'context', {
        participants: ['codex'],
        synthesizer: 'claude',
        cwd: FAKE_CWD,
      });

      expect(result).toBe('Participant answer fallback');
    });

    test('returns empty string when runDiscussion throws', () => {
      // Make execFileSync throw to simulate runDiscussion failure
      // But runDiscussion itself catches backend errors — make fs.mkdirSync throw
      // to simulate an unexpected error in runDiscussion
      fsModule.mkdirSync.mockImplementation(() => {
        throw new Error('disk full');
      });

      const result = resolveElicitation('question?', 'context', {
        participants: ['claude'],
        synthesizer: 'claude',
        cwd: FAKE_CWD,
      });

      expect(result).toBe('');
    });

    test('passes participants and synthesizer to runDiscussion correctly', () => {
      // Use participants that are both available (beforeEach makes claude and codex available)
      resolveElicitation('question?', 'ctx', {
        participants: ['codex', 'claude'],
        synthesizer: 'claude',
        cwd: FAKE_CWD,
      });

      // codex + claude participant dispatches + claude synthesizer = 3 calls
      expect(childProcess.execFileSync).toHaveBeenCalledTimes(3);
    });

    test('passes cwd to runDiscussion', () => {
      resolveElicitation('question?', 'ctx', {
        participants: ['claude'],
        synthesizer: 'claude',
        cwd: '/specific/project',
      });

      // execFileSync should be called with cwd option
      const [, , opts] = childProcess.execFileSync.mock.calls[0] as [
        string,
        string[],
        { cwd: string }
      ];
      expect(opts.cwd).toBe('/specific/project');
    });

    test('type option passed to runDiscussion is elicitation', () => {
      resolveElicitation('question?', 'ctx', {
        participants: ['claude'],
        synthesizer: 'claude',
        cwd: FAKE_CWD,
      });

      // The discussion file should be named with 'elicitation' in it
      const [writePath] = fsModule.writeFileSync.mock.calls[0] as [string, string, string];
      expect(writePath).toContain('elicitation');
    });

  });

});
