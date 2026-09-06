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

const { attemptLlmFallbackCompletion, _verifyFallbackOutput } =
  require('../../lib/phase-complete-llm') as {
    attemptLlmFallbackCompletion: (
      cwd: string,
      phaseNum: string,
      scheduler: Scheduler | null,
      failure: Error | { gate_errors?: GateViolation[] }
    ) => Promise<unknown>;
    _verifyFallbackOutput: (
      cwd: string,
      phaseNum: string
    ) => { ok: boolean; checks: { name: string; passed: boolean }[] };
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
      const statePath = path.join(dir, '.planning', 'STATE.md');
      // scheduler "succeeds" AND modifies files to tick checkbox and advance state
      const scheduler = makeFakeScheduler('success', () => {
        const content = fs.readFileSync(roadmapPath, 'utf-8');
        fs.writeFileSync(
          roadmapPath,
          content.replace('- [ ] Phase 3: Test', '- [x] Phase 3: Test (completed today)')
        );
        const stateContent = fs.readFileSync(statePath, 'utf-8');
        fs.writeFileSync(
          statePath,
          stateContent.replace('**Current Phase:** 3', '**Current Phase:** 4')
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
      const result = await attemptLlmFallbackCompletion(dir, '3', scheduler, new Error('test'));
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
      const statePath = path.join(dir, '.planning', 'STATE.md');
      let callCount = 0;
      const scheduler = {
        spawn: jest.fn(async (): Promise<SchedulerSpawnResult> => {
          callCount++;
          if (callCount === 2) {
            // Second call ticks the roadmap and advances state
            const content = fs.readFileSync(roadmapPath, 'utf-8');
            fs.writeFileSync(
              roadmapPath,
              content.replace('- [ ] Phase 3: Test', '- [x] Phase 3: Test (done)')
            );
            const stateContent = fs.readFileSync(statePath, 'utf-8');
            fs.writeFileSync(
              statePath,
              stateContent.replace('**Current Phase:** 3', '**Current Phase:** 4')
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

      const result = await attemptLlmFallbackCompletion(dir, '3', scheduler, new Error('test'));
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
      expect(scheduler.spawn as jest.Mock).toHaveBeenCalledTimes(1);
      expect(mockSleep).not.toHaveBeenCalled();
    } finally {
      cleanup(dir);
    }
  });
});

describe('I7 regression: _buildSyntheticResult uses real next-phase discovery', () => {
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockSleep.mockClear();
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('result next_phase is non-null and plans_executed is real (I7 regression)', async () => {
    // Build a full project fixture with milestones/anonymous/phases structure
    // so _resolvePhaseSuccession can discover the next phase and plan counts.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-i7-'));
    const planning = path.join(dir, '.planning');
    fs.mkdirSync(planning);
    const phasesDir = path.join(planning, 'milestones', 'anonymous', 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });

    // Phase 03 with 1 plan + 1 summary
    const phase3Dir = path.join(phasesDir, '03-test-phase');
    fs.mkdirSync(phase3Dir);
    fs.writeFileSync(path.join(phase3Dir, '01-PLAN.md'), '# Plan\n');
    fs.writeFileSync(path.join(phase3Dir, '01-SUMMARY.md'), '# Summary\n');

    // Phase 04 must exist so next-phase discovery returns it
    fs.mkdirSync(path.join(phasesDir, '04-next-phase'));

    const roadmapPath = path.join(planning, 'ROADMAP.md');
    const statePath = path.join(planning, 'STATE.md');

    fs.writeFileSync(roadmapPath, '# Roadmap\n\n- [ ] Phase 3: Test\n- [ ] Phase 4: Next\n');
    fs.writeFileSync(statePath, '# State\n\n**Current Phase:** 3\n');
    fs.writeFileSync(
      path.join(planning, 'config.json'),
      JSON.stringify({ phase_cleanup: { cleanup_threshold: 99999 } })
    );

    try {
      const scheduler = makeFakeScheduler('success', () => {
        // Tick roadmap and advance state so verification passes
        const content = fs.readFileSync(roadmapPath, 'utf-8');
        fs.writeFileSync(
          roadmapPath,
          content.replace('- [ ] Phase 3: Test', '- [x] Phase 3: Test (completed)')
        );
        const stateContent = fs.readFileSync(statePath, 'utf-8');
        fs.writeFileSync(
          statePath,
          stateContent.replace('**Current Phase:** 3', '**Current Phase:** 4')
        );
      });
      const result = (await attemptLlmFallbackCompletion(
        dir,
        '3',
        scheduler,
        new Error('test')
      )) as {
        next_phase: string | null;
        is_last_phase: boolean;
        plans_executed: string;
        llm_fallback?: boolean;
      } | null;

      expect(result).not.toBeNull();
      expect(result!.llm_fallback).toBe(true);
      // Real next-phase discovery: should be '04' (from dir '04-next-phase'), not null
      expect(result!.next_phase).not.toBeNull();
      expect(result!.is_last_phase).toBe(false);
      // Real plan count from phase dir: 1 summary / 1 plan
      expect(result!.plans_executed).not.toBe('N/A');
      expect(result!.plans_executed).toMatch(/\d+\/\d+/);
    } finally {
      cleanup(dir);
    }
  });
});

describe('_verifyFallbackOutput', () => {
  function makeProjectWithStates(roadmapContent: string, stateContent: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-verify-'));
    const planning = path.join(dir, '.planning');
    fs.mkdirSync(planning);
    fs.writeFileSync(path.join(planning, 'ROADMAP.md'), roadmapContent);
    fs.writeFileSync(path.join(planning, 'STATE.md'), stateContent);
    return dir;
  }

  it('passes when roadmap is ticked and state is advanced', () => {
    const dir = makeProjectWithStates('- [x] Phase 3: Test\n', '**Current Phase:** 4\n');
    try {
      const result = _verifyFallbackOutput(dir, '3');
      expect(result.ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when roadmap is not ticked', () => {
    const dir = makeProjectWithStates('- [ ] Phase 3: Test\n', '**Current Phase:** 4\n');
    try {
      const result = _verifyFallbackOutput(dir, '3');
      expect(result.ok).toBe(false);
      expect(result.checks.find((c) => c.name === 'roadmap-ticked')?.passed).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when state still shows completed phase as current', () => {
    const dir = makeProjectWithStates('- [x] Phase 3: Test\n', '**Current Phase:** 3\n');
    try {
      const result = _verifyFallbackOutput(dir, '3');
      expect(result.ok).toBe(false);
      expect(result.checks.find((c) => c.name === 'state-advanced')?.passed).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when state shows Milestone complete', () => {
    const dir = makeProjectWithStates(
      '- [x] Phase 3: Test\n',
      '**Current Phase:** Milestone complete\n'
    );
    try {
      const result = _verifyFallbackOutput(dir, '3');
      expect(result.ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('state-advanced check is skipped when Current Phase field is missing', () => {
    const dir = makeProjectWithStates('- [x] Phase 3: Test\n', 'no current phase field here\n');
    try {
      const result = _verifyFallbackOutput(dir, '3');
      expect(result.ok).toBe(true);
      expect(result.checks.find((c) => c.name === 'state-advanced')?.passed).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails state-advanced check when STATE.md is missing (M3)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-m3-'));
    const planning = path.join(dir, '.planning');
    fs.mkdirSync(planning);
    fs.writeFileSync(path.join(planning, 'ROADMAP.md'), '- [x] Phase 3: Test (completed)\n');
    // No STATE.md written — it is absent

    try {
      const result = _verifyFallbackOutput(dir, '3');
      expect(result.ok).toBe(false);
      expect(result.checks.find((c) => c.name === 'state-advanced')?.passed).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when state still uses zero-padded phase number', () => {
    const dir = makeProjectWithStates('- [x] Phase 3: Test\n', '**Current Phase:** 03\n');
    try {
      const result = _verifyFallbackOutput(dir, '3');
      expect(result.ok).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // I5 regression (the sibling file the 2026-04 audit never covered).
  //
  // `phaseNum.replace('.', '\\.')` escapes only the FIRST dot, because
  // String.replace with a string pattern replaces one occurrence. For a
  // three-part phase number like "1.1.2" that yields `1\.1.2`, whose second
  // dot is an unescaped regex wildcard matching any character. The fix in
  // lib/phase-complete.ts used the global form; this file kept the broken one
  // in four places, so the same false match survived here.
  //
  // Each case below feeds a decoy row that differs from the real phase number
  // only where that wildcard sits. Reintroduce the single-replacement form and
  // all three assertions flip to true.
  describe('I5: multi-level phase numbers escape every dot', () => {
    it('does not treat the second dot as a wildcard when matching the roadmap', () => {
      const dir = makeProjectWithStates(
        '- [x] Phase 1.1X2: a different phase entirely\n',
        '**Current Phase:** 1.1.2\n'
      );
      try {
        const result = _verifyFallbackOutput(dir, '1.1.2');
        const roadmap = result.checks.find((c) => c.name === 'roadmap-ticked');
        expect(roadmap?.passed).toBe(false);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('does not treat the second dot as a wildcard when matching STATE', () => {
      // state-advanced passes when the current phase is NOT still phaseNum.
      // "1.1X2" is a different phase, so the check must report advanced.
      const dir = makeProjectWithStates(
        '- [x] Phase 1.1.2: done\n',
        '**Current Phase:** 1.1X2\n'
      );
      try {
        const result = _verifyFallbackOutput(dir, '1.1.2');
        const state = result.checks.find((c) => c.name === 'state-advanced');
        expect(state?.passed).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('does not treat the second dot as a wildcard when matching the progress table', () => {
      // The only row belongs to a DIFFERENT phase (1.1X2) and is not Complete.
      // Correct behaviour: no row matches 1.1.2, so the check is skipped (true).
      // With the single-replacement bug the decoy row matches
      // rowPatternIncomplete but not rowPattern, so the check reports false —
      // a phase marked incomplete on the strength of another phase's row.
      const dir = makeProjectWithStates(
        '- [x] Phase 1.1.2: done\n\n| 1.1X2 | Other | In Progress |\n',
        '**Current Phase:** 2\n'
      );
      try {
        const result = _verifyFallbackOutput(dir, '1.1.2');
        const row = result.checks.find((c) => c.name === 'progress-row');
        expect(row?.passed).toBe(true);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
