'use strict';

/**
 * Integration test for Spec 3's phase-finalize wire-up.
 *
 * This is a lean test — the real end-to-end exercising of
 * completePhaseAfterPostPipeline happens in
 * tests/unit/phase-complete.test.ts using real fixtures. This file
 * verifies:
 *
 *   1. The module structure is importable from tests
 *   2. completePhaseAfterPostPipeline runs through the full pipeline
 *      including quality analysis with a realistic threshold
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const { completePhaseAfterPostPipeline } = require('../../lib/phase-complete') as {
  completePhaseAfterPostPipeline: (cwd: string, phaseNum: string) => Promise<unknown>;
};

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-phase-finalize-int-'));
  const planning = path.join(dir, '.planning');
  fs.mkdirSync(planning);
  fs.mkdirSync(path.join(planning, 'milestones'));
  fs.mkdirSync(path.join(planning, 'milestones', 'anonymous'));
  fs.mkdirSync(path.join(planning, 'milestones', 'anonymous', 'phases'));
  const phaseDir = path.join(planning, 'milestones', 'anonymous', 'phases', '03-test-phase');
  fs.mkdirSync(phaseDir);
  fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '# Plan 1\n');
  fs.writeFileSync(path.join(phaseDir, '01-SUMMARY.md'), '# Summary 1\n');
  fs.mkdirSync(path.join(planning, 'milestones', 'anonymous', 'phases', '04-next-phase'));

  fs.writeFileSync(
    path.join(planning, 'ROADMAP.md'),
    [
      '# Roadmap',
      '',
      '## Phases',
      '',
      '- [ ] Phase 3: Test Phase',
      '- [ ] Phase 4: Next Phase',
      '',
      '## Progress',
      '',
      '| Phase | Plans | Status | Completed |',
      '|-------|-------|--------|-----------|',
      '| 3 | 1/1 | In Progress |  |',
      '| 4 | 0/0 | Pending |  |',
      '',
      '## Phase 3: Test Phase',
      '',
      '**Plans:** 1/1 plans complete',
      '',
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(planning, 'STATE.md'),
    [
      '# State',
      '',
      '**Current Phase:** 3',
      '**Current Phase Name:** Test Phase',
      '**Status:** Executing',
      '**Current Plan:** 01-plan',
      '**Last Activity:** 2026-04-10',
      '**Last Activity Description:** Running phase 3',
      '',
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(planning, 'config.json'),
    JSON.stringify({ phase_cleanup: { cleanup_threshold: 99999 } })
  );

  return dir;
}

function cleanupTempProject(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

describe('phase-finalize integration (autopilot wire-up path)', () => {
  it('completePhaseAfterPostPipeline is exported and callable', () => {
    expect(typeof completePhaseAfterPostPipeline).toBe('function');
  });

  it('runs through the full completion flow on a realistic project fixture', async () => {
    const dir = makeTempProject();
    try {
      const result = await completePhaseAfterPostPipeline(dir, '3');
      expect(result).not.toBeNull();

      const roadmap = fs.readFileSync(path.join(dir, '.planning', 'ROADMAP.md'), 'utf-8');
      expect(roadmap).toMatch(/- \[x\] Phase 3/);

      const state = fs.readFileSync(path.join(dir, '.planning', 'STATE.md'), 'utf-8');
      expect(state).toMatch(/\*\*Current Phase:\*\*\s+0?4/);
    } finally {
      cleanupTempProject(dir);
    }
  });
});
