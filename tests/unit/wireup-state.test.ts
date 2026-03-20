/**
 * Unit tests for lib/wireup/state.ts
 *
 * Tests for createInitialWireupState(), readWireupState(), writeWireupState(),
 * and advanceWireupIteration() covering creation, I/O, round-trip, and immutability.
 *
 * Uses jest.mock for fs and ../utils to enable controlled testing.
 */

import type { WireupState } from '../../lib/wireup/types';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockWriteFileSync = jest.fn();
const mockMkdirSync = jest.fn();
const mockSafeReadFile = jest.fn();

jest.mock('fs', () => ({
  writeFileSync: mockWriteFileSync,
  mkdirSync: mockMkdirSync,
}));

jest.mock('../../lib/utils', () => ({
  safeReadFile: mockSafeReadFile,
}));

const {
  createInitialWireupState,
  readWireupState,
  writeWireupState,
  advanceWireupIteration,
}: {
  createInitialWireupState: (milestone: string) => WireupState;
  readWireupState: (cwd: string) => WireupState | null;
  writeWireupState: (cwd: string, state: WireupState) => void;
  advanceWireupIteration: (
    state: WireupState,
    results: { scenarios_run: number; passed: number; failed: number; fixes_applied: number }
  ) => WireupState;
} = require('../../lib/wireup/state');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FAKE_CWD = '/fake/project';
const FAKE_MILESTONE = 'v0.3.13';

function makeState(overrides: Partial<WireupState> = {}): WireupState {
  return {
    features_discovered: 0,
    scenarios_generated: 0,
    scenarios_passed: 0,
    scenarios_failed: 0,
    fixes_applied: 0,
    iteration_history: [],
    timestamp: '2026-01-01T00:00:00.000Z',
    milestone: FAKE_MILESTONE,
    ...overrides,
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('createInitialWireupState()', () => {
  test('creates state with all required fields', () => {
    const state = createInitialWireupState(FAKE_MILESTONE);
    expect(state).toHaveProperty('features_discovered');
    expect(state).toHaveProperty('scenarios_generated');
    expect(state).toHaveProperty('scenarios_passed');
    expect(state).toHaveProperty('scenarios_failed');
    expect(state).toHaveProperty('fixes_applied');
    expect(state).toHaveProperty('iteration_history');
    expect(state).toHaveProperty('timestamp');
    expect(state).toHaveProperty('milestone');
  });

  test('sets all counters to zero', () => {
    const state = createInitialWireupState(FAKE_MILESTONE);
    expect(state.features_discovered).toBe(0);
    expect(state.scenarios_generated).toBe(0);
    expect(state.scenarios_passed).toBe(0);
    expect(state.scenarios_failed).toBe(0);
    expect(state.fixes_applied).toBe(0);
  });

  test('sets milestone from parameter', () => {
    const state = createInitialWireupState('v0.4.0');
    expect(state.milestone).toBe('v0.4.0');
  });

  test('sets empty iteration_history', () => {
    const state = createInitialWireupState(FAKE_MILESTONE);
    expect(state.iteration_history).toEqual([]);
  });
});

describe('readWireupState()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns null when file does not exist', () => {
    mockSafeReadFile.mockReturnValue(null);
    const result = readWireupState(FAKE_CWD);
    expect(result).toBeNull();
  });

  test('returns parsed WireupState when file exists', () => {
    const state = makeState({ features_discovered: 5, scenarios_passed: 3 });
    mockSafeReadFile.mockReturnValue(JSON.stringify(state));
    const result = readWireupState(FAKE_CWD);
    expect(result).toEqual(state);
  });

  test('returns null when file contains invalid JSON', () => {
    mockSafeReadFile.mockReturnValue('{invalid json}}}');
    const result = readWireupState(FAKE_CWD);
    expect(result).toBeNull();
  });
});

describe('writeWireupState()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('writes JSON with 2-space indentation and trailing newline', () => {
    const state = makeState();
    writeWireupState(FAKE_CWD, state);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [, written] = mockWriteFileSync.mock.calls[0] as [string, string];
    expect(written).toBe(JSON.stringify(state, null, 2) + '\n');
  });

  test('creates parent directory recursively', () => {
    const state = makeState();
    writeWireupState(FAKE_CWD, state);

    expect(mockMkdirSync).toHaveBeenCalledTimes(1);
    const [, opts] = mockMkdirSync.mock.calls[0] as [string, { recursive: boolean }];
    expect(opts).toEqual({ recursive: true });
  });
});

describe('round-trip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('write then read returns identical state', () => {
    const original = makeState({
      features_discovered: 10,
      scenarios_generated: 8,
      scenarios_passed: 6,
      scenarios_failed: 2,
      fixes_applied: 3,
      iteration_history: [
        {
          iteration: 1,
          timestamp: '2026-01-01T00:00:00.000Z',
          scenarios_run: 8,
          passed: 6,
          failed: 2,
          fixes_applied: 3,
        },
      ],
    });

    // Capture what would be written
    let writtenContent = '';
    mockWriteFileSync.mockImplementation((_p: string, content: string) => {
      writtenContent = content;
    });

    writeWireupState(FAKE_CWD, original);

    // Mock read to return what was written
    mockSafeReadFile.mockReturnValue(writtenContent);
    const result = readWireupState(FAKE_CWD);

    expect(result).toEqual(original);
  });
});

describe('advanceWireupIteration()', () => {
  const results = { scenarios_run: 10, passed: 7, failed: 3, fixes_applied: 2 };

  test('increments counters from results', () => {
    const state = makeState({ scenarios_passed: 5, scenarios_failed: 1, fixes_applied: 1 });
    const next = advanceWireupIteration(state, results);

    expect(next.scenarios_passed).toBe(12); // 5 + 7
    expect(next.scenarios_failed).toBe(4);  // 1 + 3
    expect(next.fixes_applied).toBe(3);     // 1 + 2
  });

  test('appends new entry to iteration_history', () => {
    const state = makeState();
    const next = advanceWireupIteration(state, results);

    expect(next.iteration_history).toHaveLength(1);
    const entry = next.iteration_history[0];
    expect(entry.iteration).toBe(1);
    expect(entry.scenarios_run).toBe(10);
    expect(entry.passed).toBe(7);
    expect(entry.failed).toBe(3);
    expect(entry.fixes_applied).toBe(2);
  });

  test('does not mutate input state', () => {
    const state = makeState({ scenarios_passed: 5, scenarios_failed: 1 });
    const originalPassed = state.scenarios_passed;
    const originalHistory = state.iteration_history.length;

    advanceWireupIteration(state, results);

    expect(state.scenarios_passed).toBe(originalPassed);
    expect(state.iteration_history).toHaveLength(originalHistory);
  });

  test('iteration number is sequential', () => {
    const state = makeState();
    const next1 = advanceWireupIteration(state, results);
    const next2 = advanceWireupIteration(next1, results);

    expect(next1.iteration_history[0].iteration).toBe(1);
    expect(next2.iteration_history[1].iteration).toBe(2);
  });
});
