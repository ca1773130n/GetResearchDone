'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SchedulerSpawnResult, SpawnOpts } from '../../lib/types';
import type { Scheduler } from '../../lib/scheduler';

const { completePhaseAfterPostPipeline } = require('../../lib/phase-complete') as {
  completePhaseAfterPostPipeline: (
    cwd: string,
    phaseNum: string,
    scheduler?: Scheduler | null
  ) => Promise<unknown>;
};

function makeProject(llmFallbackEnabled: boolean): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-llm-flow-'));
  const planning = path.join(dir, '.planning');
  fs.mkdirSync(planning);
  fs.mkdirSync(path.join(planning, 'milestones'));
  fs.mkdirSync(path.join(planning, 'milestones', 'anonymous'));
  fs.mkdirSync(path.join(planning, 'milestones', 'anonymous', 'phases'));
  // NOTE: no phase directory for Phase 3 → _phaseCompleteCore throws
  fs.writeFileSync(
    path.join(planning, 'ROADMAP.md'),
    '# Roadmap\n\n- [ ] Phase 3: Test\n\n## Phase 3: Test\n\n**Plans:** 0/0 plans complete\n'
  );
  fs.writeFileSync(
    path.join(planning, 'STATE.md'),
    '# State\n\n**Current Phase:** 3\n**Current Phase Name:** Test\n**Status:** Executing\n**Current Plan:** 01\n**Last Activity:** 2026-04-12\n**Last Activity Description:** running\n'
  );
  fs.writeFileSync(
    path.join(planning, 'config.json'),
    JSON.stringify({
      phase_cleanup: { cleanup_threshold: 99999 },
      phase_complete_llm_fallback: llmFallbackEnabled,
    })
  );
  return dir;
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function makeTickingScheduler(): Scheduler {
  return {
    spawn: jest.fn(async (_prompt: string, opts: SpawnOpts): Promise<SchedulerSpawnResult> => {
      const basePath = opts.cwd || '';
      const roadmapPath = path.join(basePath, '.planning', 'ROADMAP.md');
      const statePath = path.join(basePath, '.planning', 'STATE.md');
      try {
        const content = fs.readFileSync(roadmapPath, 'utf-8');
        fs.writeFileSync(
          roadmapPath,
          content.replace('- [ ] Phase 3: Test', '- [x] Phase 3: Test (completed)')
        );
      } catch {}
      try {
        const stateContent = fs.readFileSync(statePath, 'utf-8');
        fs.writeFileSync(
          statePath,
          stateContent.replace('**Current Phase:** 3', '**Current Phase:** 4')
        );
      } catch {}
      return {
        exitCode: 0,
        timedOut: false,
        backend: 'claude',
        tokensUsed: 500,
        workItemId: 'fake',
      };
    }),
    getState: jest.fn(() => undefined),
    getStates: jest.fn(() => new Map()),
    recordExternalSample: jest.fn(),
    persistState: jest.fn(),
    loadPersistedState: jest.fn(),
  } as unknown as Scheduler;
}

describe('completePhaseAfterPostPipeline + LLM fallback flow', () => {
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('returns null when mechanical fails and config flag is false', async () => {
    const dir = makeProject(false);
    try {
      const scheduler = makeTickingScheduler();
      const result = await completePhaseAfterPostPipeline(dir, '3', scheduler);
      expect(result).toBeNull();
      expect(scheduler.spawn as jest.Mock).not.toHaveBeenCalled();
    } finally {
      cleanup(dir);
    }
  });

  it('invokes LLM fallback when mechanical fails and config flag is true', async () => {
    const dir = makeProject(true);
    try {
      const scheduler = makeTickingScheduler();
      const result = await completePhaseAfterPostPipeline(dir, '3', scheduler);
      expect(result).not.toBeNull();
      expect((result as { llm_fallback?: boolean }).llm_fallback).toBe(true);
      expect(scheduler.spawn as jest.Mock).toHaveBeenCalledTimes(1);
    } finally {
      cleanup(dir);
    }
  });

  it('returns null when LLM fallback verification fails', async () => {
    const dir = makeProject(true);
    try {
      // Non-ticking scheduler: success exit but does NOT edit ROADMAP
      const scheduler = {
        spawn: jest.fn(
          async (): Promise<SchedulerSpawnResult> => ({
            exitCode: 0,
            timedOut: false,
            backend: 'claude',
            tokensUsed: 500,
            workItemId: 'fake',
          })
        ),
        getState: jest.fn(),
        getStates: jest.fn(() => new Map()),
        recordExternalSample: jest.fn(),
        persistState: jest.fn(),
        loadPersistedState: jest.fn(),
      } as unknown as Scheduler;

      const result = await completePhaseAfterPostPipeline(dir, '3', scheduler);
      expect(result).toBeNull();
      expect(scheduler.spawn as jest.Mock).toHaveBeenCalled();
    } finally {
      cleanup(dir);
    }
  });
});
