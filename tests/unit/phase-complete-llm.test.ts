'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SchedulerSpawnResult, SpawnOpts, GateViolation } from '../../lib/types';
import type { Scheduler } from '../../lib/scheduler';

// Mock timers/promises so sleep() in retry tests completes instantly.
// Must be declared before require() of phase-complete-llm.
const mockSleep = jest.fn().mockResolvedValue(undefined);
jest.mock('timers/promises', () => ({
  setTimeout: mockSleep,
}));

const { attemptLlmFallbackCompletion } = require('../../lib/phase-complete-llm') as {
  attemptLlmFallbackCompletion: (
    cwd: string,
    phaseNum: string,
    scheduler: Scheduler | null,
    failure: Error | { gate_errors?: GateViolation[] }
  ) => Promise<unknown>;
};

function makeFakeScheduler(
  behavior: 'success' | 'nonzero' | 'throw',
  tickRoadmapCallback?: () => void
): Scheduler {
  const spawn = jest.fn(async (_prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult> => {
    if (behavior === 'throw') throw new Error('scheduler exploded');
    if (behavior === 'nonzero') {
      return {
        exitCode: 1,
        timedOut: false,
        backend: 'claude',
        tokensUsed: 0,
        workItemId: 'fake',
      };
    }
    // success: invoke the callback to mutate the ROADMAP.md file
    if (tickRoadmapCallback) tickRoadmapCallback();
    return {
      exitCode: 0,
      timedOut: false,
      backend: 'claude',
      tokensUsed: 1000,
      workItemId: 'fake',
    };
  });
  return {
    spawn,
    getState: jest.fn(() => undefined),
    getStates: jest.fn(() => new Map()),
    recordExternalSample: jest.fn(),
    persistState: jest.fn(),
    loadPersistedState: jest.fn(),
  } as unknown as Scheduler;
}

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-phase-llm-'));
  const planning = path.join(dir, '.planning');
  fs.mkdirSync(planning);
  fs.writeFileSync(
    path.join(planning, 'ROADMAP.md'),
    '# Roadmap\n\n- [ ] Phase 3: Test\n- [ ] Phase 4: Next\n'
  );
  fs.writeFileSync(path.join(planning, 'STATE.md'), '# State\n\n**Current Phase:** 3\n');
  fs.writeFileSync(
    path.join(planning, 'config.json'),
    JSON.stringify({ phase_cleanup: { cleanup_threshold: 99999 } })
  );
  return dir;
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

describe('attemptLlmFallbackCompletion', () => {
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockSleep.mockClear();
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('returns null when scheduler is null', async () => {
    const dir = makeTempProject();
    try {
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        null,
        new Error('mechanical failed')
      );
      expect(result).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  it('invokes scheduler.spawn with a prompt containing the phase number', async () => {
    const dir = makeTempProject();
    try {
      const scheduler = makeFakeScheduler('nonzero');
      await attemptLlmFallbackCompletion(dir, '3', scheduler, new Error('test'));
      expect(scheduler.spawn as jest.Mock).toHaveBeenCalled();
      const prompt = (scheduler.spawn as jest.Mock).mock.calls[0][0];
      expect(prompt).toContain('Phase 3');
      expect(prompt).toContain('ROADMAP.md');
      expect(prompt).toContain('STATE.md');
    } finally {
      cleanup(dir);
    }
  });

  it('returns null when scheduler.spawn throws', async () => {
    const dir = makeTempProject();
    try {
      const scheduler = makeFakeScheduler('throw');
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('mechanical')
      );
      expect(result).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  it('returns null when exit code is nonzero', async () => {
    const dir = makeTempProject();
    try {
      const scheduler = makeFakeScheduler('nonzero');
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('mechanical')
      );
      expect(result).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  it('returns null when verification fails (checkbox not ticked)', async () => {
    const dir = makeTempProject();
    try {
      // scheduler succeeds but does NOT modify the ROADMAP file
      const scheduler = makeFakeScheduler('success');
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('mechanical')
      );
      expect(result).toBeNull();
    } finally {
      cleanup(dir);
    }
  });

  it('returns synthetic result when verification succeeds (checkbox ticked)', async () => {
    const dir = makeTempProject();
    try {
      const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
      // scheduler "succeeds" AND modifies the file to tick the checkbox
      const scheduler = makeFakeScheduler('success', () => {
        const content = fs.readFileSync(roadmapPath, 'utf-8');
        fs.writeFileSync(
          roadmapPath,
          content.replace('- [ ] Phase 3: Test', '- [x] Phase 3: Test (completed today)')
        );
      });
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('mechanical')
      );
      expect(result).not.toBeNull();
      expect((result as { llm_fallback?: boolean }).llm_fallback).toBe(true);
    } finally {
      cleanup(dir);
    }
  });

  it('prompt includes the failure description', async () => {
    const dir = makeTempProject();
    try {
      const scheduler = makeFakeScheduler('nonzero');
      await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('something very specific to match')
      );
      const prompt = (scheduler.spawn as jest.Mock).mock.calls[0][0];
      expect(prompt).toContain('something very specific to match');
    } finally {
      cleanup(dir);
    }
  });

  it('handles gate_errors shape as failure input', async () => {
    const dir = makeTempProject();
    try {
      const scheduler = makeFakeScheduler('nonzero');
      await attemptLlmFallbackCompletion(dir, '3', scheduler, {
        gate_errors: [
          {
            code: 'test-gate',
            severity: 'error' as const,
            message: 'phase-in-roadmap gate tripped',
            fix: 'add phase to roadmap',
            context: {},
          },
        ],
      });
      const prompt = (scheduler.spawn as jest.Mock).mock.calls[0][0];
      expect(prompt).toContain('phase-in-roadmap gate tripped');
    } finally {
      cleanup(dir);
    }
  });
});

describe('attemptLlmFallbackCompletion with retries', () => {
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockSleep.mockClear();
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('retries on verification failure when retries > 0', async () => {
    const dir = makeTempProject();
    try {
      // Rewrite config with retries
      const configPath = path.join(dir, '.planning', 'config.json');
      const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      existing.phase_complete_llm_fallback_retries = 2;
      fs.writeFileSync(configPath, JSON.stringify(existing));

      const scheduler = makeFakeScheduler('success'); // succeeds but never ticks roadmap
      const result = await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('test'),
      );
      expect(result).toBeNull();
      // 1 initial + 2 retries = 3 spawn calls
      expect((scheduler.spawn as jest.Mock).mock.calls.length).toBe(3);
      // Sleep called twice (between attempts 1→2 and 2→3), with backoff 1s, 2s
      expect(mockSleep).toHaveBeenCalledTimes(2);
      expect(mockSleep).toHaveBeenNthCalledWith(1, 1000);
      expect(mockSleep).toHaveBeenNthCalledWith(2, 2000);
    } finally {
      cleanup(dir);
    }
  });

  it('succeeds on retry if a later attempt ticks the checkbox', async () => {
    const dir = makeTempProject();
    try {
      const configPath = path.join(dir, '.planning', 'config.json');
      const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      existing.phase_complete_llm_fallback_retries = 2;
      fs.writeFileSync(configPath, JSON.stringify(existing));

      const roadmapPath = path.join(dir, '.planning', 'ROADMAP.md');
      let callCount = 0;
      const scheduler = {
        spawn: jest.fn(async (): Promise<SchedulerSpawnResult> => {
          callCount++;
          if (callCount === 2) {
            // Second call ticks the roadmap
            const content = fs.readFileSync(roadmapPath, 'utf-8');
            fs.writeFileSync(
              roadmapPath,
              content.replace('- [ ] Phase 3: Test', '- [x] Phase 3: Test (done)'),
            );
          }
          return {
            exitCode: 0,
            timedOut: false,
            backend: 'claude' as const,
            tokensUsed: 1000,
            workItemId: 'fake',
          };
        }),
        getState: jest.fn(),
        getStates: jest.fn(() => new Map()),
        recordExternalSample: jest.fn(),
        persistState: jest.fn(),
        loadPersistedState: jest.fn(),
      } as unknown as Scheduler;

      const result = await attemptLlmFallbackCompletion(
        dir, '3', scheduler, new Error('test'),
      );
      expect(result).not.toBeNull();
      expect(scheduler.spawn).toHaveBeenCalledTimes(2);
      // Sleep called once (backoff between attempt 1 and attempt 2)
      expect(mockSleep).toHaveBeenCalledTimes(1);
      expect(mockSleep).toHaveBeenCalledWith(1000);
    } finally {
      cleanup(dir);
    }
  });

  it('does not retry when retries is 0 (default)', async () => {
    const dir = makeTempProject();
    try {
      // Default config — no retries
      const scheduler = makeFakeScheduler('success');
      await attemptLlmFallbackCompletion(dir, '3', scheduler, new Error('test'));
      expect((scheduler.spawn as jest.Mock)).toHaveBeenCalledTimes(1);
      expect(mockSleep).not.toHaveBeenCalled();
    } finally {
      cleanup(dir);
    }
  });
});
