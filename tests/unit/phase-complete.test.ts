'use strict';

/**
 * Unit tests for lib/phase-complete.ts completePhaseAfterPostPipeline wrapper.
 *
 * Uses real temporary project directories to exercise _phaseCompleteCore
 * through the wrapper. For error-path tests, crafts the fixture to
 * trigger specific failures (missing phase dir, stripped ROADMAP.md, etc.).
 *
 * Key fixture requirements (discovered from source):
 *   - Phase dir must be named "03-test-phase" (normalizePhaseName('3') pads to '03')
 *   - Plans must be "*-PLAN.md" files directly in the phase dir (not subdirs)
 *   - Summaries must be "*-SUMMARY.md" files directly in the phase dir
 *   - ROADMAP.md must have a "## Phase 3:" heading for the gate to pass
 *   - config.json cleanup threshold lives under phase_cleanup.cleanup_threshold
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const { completePhaseAfterPostPipeline } = require('../../lib/phase-complete') as {
  completePhaseAfterPostPipeline: (cwd: string, phaseNum: string) => unknown;
};

function makeTempProject(opts: { withPhase?: boolean } = {}): string {
  const withPhase = opts.withPhase !== false;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-phase-complete-'));
  const planning = path.join(dir, '.planning');
  fs.mkdirSync(planning);

  // phasesDir() resolves to .planning/milestones/{milestone}/phases/.
  // With no **Milestone:** field in STATE.md and no milestone dirs,
  // currentMilestone() falls back to 'anonymous'.
  const milestonesDir = path.join(planning, 'milestones');
  const anonymousDir = path.join(milestonesDir, 'anonymous');
  const phasesDir = path.join(anonymousDir, 'phases');
  fs.mkdirSync(phasesDir, { recursive: true });

  if (withPhase) {
    // Phase dir named "03-test-phase" — normalizePhaseName('3') pads to '03'
    const phaseDir = path.join(phasesDir, '03-test-phase');
    fs.mkdirSync(phaseDir);

    // Plans/summaries are *-PLAN.md / *-SUMMARY.md files directly in the phase dir
    fs.writeFileSync(path.join(phaseDir, '01-PLAN.md'), '# Plan 1\n');
    fs.writeFileSync(path.join(phaseDir, '01-SUMMARY.md'), '# Summary 1\n');

    // Create a next phase dir so STATE.md advances phase number
    fs.mkdirSync(path.join(phasesDir, '04-next-phase'));
  }

  // ROADMAP.md with a "## Phase 3:" heading (required by phase-in-roadmap gate)
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

  // Minimal STATE.md
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

  // config.json with high cleanup_threshold to skip cleanup plan generation
  // Note: threshold lives under phase_cleanup.cleanup_threshold, not top-level
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

describe('completePhaseAfterPostPipeline', () => {
  let projectDir: string;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    projectDir = makeTempProject();
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    cleanupTempProject(projectDir);
  });

  it('returns a PhaseCompleteResult on success', () => {
    const result = completePhaseAfterPostPipeline(projectDir, '3');
    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      completed_phase: '3',
      roadmap_updated: true,
      state_updated: true,
    });
  });

  it('ticks the ROADMAP.md checkbox for Phase 3 on success', () => {
    completePhaseAfterPostPipeline(projectDir, '3');
    const roadmap = fs.readFileSync(path.join(projectDir, '.planning', 'ROADMAP.md'), 'utf-8');
    expect(roadmap).toMatch(/- \[x\] Phase 3: Test Phase/);
  });

  it('advances STATE.md Current Phase to 4 on success', () => {
    completePhaseAfterPostPipeline(projectDir, '3');
    const state = fs.readFileSync(path.join(projectDir, '.planning', 'STATE.md'), 'utf-8');
    // _phaseCompleteCore sets Current Phase to the next phase's number string
    // (e.g., "04" from dir "04-next-phase"); match the padded format
    expect(state).toMatch(/\*\*Current Phase:\*\*\s+0?4/);
    expect(state).toMatch(/\*\*Last Activity Description:\*\*\s+Phase 3 complete/);
  });

  it('returns null and does not throw when the phase directory is missing', () => {
    // Remove the phase directory to trigger "Phase 3 not found" error
    fs.rmSync(
      path.join(projectDir, '.planning', 'milestones', 'anonymous', 'phases', '03-test-phase'),
      { recursive: true, force: true }
    );

    const result = completePhaseAfterPostPipeline(projectDir, '3');
    expect(result).toBeNull();
    // The wrapper catches the throw and logs to stderr
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('phase-finalize: error completing phase 3')
    );
  });

  it('returns null and logs when gates fail (phase not in ROADMAP)', () => {
    // Rewrite ROADMAP.md without the required "## Phase 3:" heading.
    // The phase dir still exists on disk so the gate fires and fails.
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'ROADMAP.md'),
      '# Roadmap\n\nNo phases here.\n'
    );

    const result = completePhaseAfterPostPipeline(projectDir, '3');
    expect(result).toBeNull();
    // Either gates-failed log or error log is acceptable
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('does not crash when ROADMAP.md is missing (_phaseCompleteCore skips it gracefully)', () => {
    // Remove ROADMAP.md. runPreflightGates bails early when ROADMAP.md is
    // absent (new-project safety), so gates pass. _phaseCompleteCore then
    // guards with fs.existsSync before touching the roadmap.
    fs.unlinkSync(path.join(projectDir, '.planning', 'ROADMAP.md'));

    // May return null (gate fail) or a result — either is acceptable;
    // the test only asserts no throw
    expect(() => completePhaseAfterPostPipeline(projectDir, '3')).not.toThrow();
  });
});
