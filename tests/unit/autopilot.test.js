/**
 * Unit tests for lib/autopilot.js
 *
 * Tests autopilot orchestration: phase range resolution, plan/execute detection,
 * prompt building, status markers, state updates, spawn wrapper, and the main loop.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  resolvePhaseRange,
  isPhasePlanned,
  isPhaseExecuted,
  buildPlanPrompt,
  buildExecutePrompt,
  writeStatusMarker,
  updateStateProgress,
  spawnClaude,
  runAutopilot,
  cmdAutopilot,
  cmdInitAutopilot,
  DEFAULT_TIMEOUT_MINUTES,
} = require('../../lib/autopilot');

// ─── Fixture Helpers ────────────────────────────────────────────────────────

/** Create a minimal fixture dir with ROADMAP.md and phase directories */
function createAutopilotFixture(opts = {}) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-autopilot-'));
  const planning = path.join(tmpRoot, '.planning');
  fs.mkdirSync(planning, { recursive: true });

  // STATE.md with milestone
  fs.writeFileSync(
    path.join(planning, 'STATE.md'),
    '# State\n\n**Milestone:** v1.0\n**Current Phase:** Phase 1\n'
  );

  // config.json
  fs.writeFileSync(
    path.join(planning, 'config.json'),
    JSON.stringify({ model_profile: 'balanced', autonomous_mode: true }, null, 2)
  );

  // ROADMAP.md with phases
  const phases = opts.phases || [
    { num: '48', name: 'First Feature' },
    { num: '49', name: 'Second Feature' },
    { num: '50', name: 'Third Feature' },
  ];

  let roadmap = '# Roadmap\n\n## v1.0 Test Milestone\n\n';
  for (const p of phases) {
    roadmap += `### Phase ${p.num}: ${p.name}\n\n**Goal:** Build ${p.name}\n\n`;
  }
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), roadmap);

  // Create phases dir
  const phasesDir = path.join(planning, 'phases');
  fs.mkdirSync(phasesDir, { recursive: true });

  // Create phase dirs with optional plans/summaries
  if (opts.phaseDirs) {
    for (const pd of opts.phaseDirs) {
      const dir = path.join(phasesDir, pd.dir);
      fs.mkdirSync(dir, { recursive: true });
      if (pd.files) {
        for (const [name, content] of Object.entries(pd.files)) {
          fs.writeFileSync(path.join(dir, name), content || '');
        }
      }
    }
  }

  return tmpRoot;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('lib/autopilot', () => {
  // ── buildPlanPrompt / buildExecutePrompt ──

  describe('buildPlanPrompt', () => {
    it('includes the phase number', () => {
      const prompt = buildPlanPrompt('48');
      expect(prompt).toContain('/grd:plan-phase 48');
      expect(prompt).toContain('Autonomous');
    });

    it('includes different phase numbers', () => {
      expect(buildPlanPrompt('07')).toContain('/grd:plan-phase 07');
      expect(buildPlanPrompt('12.1')).toContain('/grd:plan-phase 12.1');
    });
  });

  describe('buildExecutePrompt', () => {
    it('includes the phase number', () => {
      const prompt = buildExecutePrompt('49');
      expect(prompt).toContain('/grd:execute-phase 49');
      expect(prompt).toContain('Autonomous');
    });

    it('mentions merge locally', () => {
      const prompt = buildExecutePrompt('50');
      expect(prompt.toLowerCase()).toContain('merge locally');
    });
  });

  // ── resolvePhaseRange ──

  describe('resolvePhaseRange', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    it('returns all phases when no range specified', () => {
      tmpDir = createAutopilotFixture();
      const result = resolvePhaseRange(tmpDir, null, null);
      expect(result.error).toBeNull();
      expect(result.phases).toHaveLength(3);
      expect(result.phases[0].number).toBe('48');
      expect(result.phases[2].number).toBe('50');
    });

    it('filters from a start phase', () => {
      tmpDir = createAutopilotFixture();
      const result = resolvePhaseRange(tmpDir, '49', null);
      expect(result.error).toBeNull();
      expect(result.phases).toHaveLength(2);
      expect(result.phases[0].number).toBe('49');
    });

    it('filters to an end phase', () => {
      tmpDir = createAutopilotFixture();
      const result = resolvePhaseRange(tmpDir, null, '49');
      expect(result.error).toBeNull();
      expect(result.phases).toHaveLength(2);
      expect(result.phases[1].number).toBe('49');
    });

    it('filters both from and to', () => {
      tmpDir = createAutopilotFixture();
      const result = resolvePhaseRange(tmpDir, '49', '49');
      expect(result.error).toBeNull();
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].number).toBe('49');
    });

    it('returns error when no phases in range', () => {
      tmpDir = createAutopilotFixture();
      const result = resolvePhaseRange(tmpDir, '99', '100');
      expect(result.error).toContain('No phases found');
      expect(result.phases).toHaveLength(0);
    });

    it('returns error when ROADMAP.md missing', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-autopilot-'));
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n');
      const result = resolvePhaseRange(tmpDir, null, null);
      expect(result.error).toBeTruthy();
    });
  });

  // ── isPhasePlanned / isPhaseExecuted ──

  describe('isPhasePlanned', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    it('returns false when phase dir does not exist', () => {
      tmpDir = createAutopilotFixture();
      expect(isPhasePlanned(tmpDir, '48')).toBe(false);
    });

    it('returns false when phase dir exists but has no plans', () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [{ dir: '48-first-feature', files: {} }],
      });
      expect(isPhasePlanned(tmpDir, '48')).toBe(false);
    });

    it('returns true when phase has a PLAN.md file', () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: { '48-01-PLAN.md': '---\ntitle: Plan\n---\n# Plan' },
          },
        ],
      });
      expect(isPhasePlanned(tmpDir, '48')).toBe(true);
    });
  });

  describe('isPhaseExecuted', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    it('returns false when no plans exist', () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [{ dir: '48-first-feature', files: {} }],
      });
      expect(isPhaseExecuted(tmpDir, '48')).toBe(false);
    });

    it('returns false when plans exist but no summaries', () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: { '48-01-PLAN.md': '# Plan' },
          },
        ],
      });
      expect(isPhaseExecuted(tmpDir, '48')).toBe(false);
    });

    it('returns true when all plans have matching summaries', () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: {
              '48-01-PLAN.md': '# Plan',
              '48-01-SUMMARY.md': '# Summary',
            },
          },
        ],
      });
      expect(isPhaseExecuted(tmpDir, '48')).toBe(true);
    });

    it('returns false when some plans are incomplete', () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: {
              '48-01-PLAN.md': '# Plan 1',
              '48-02-PLAN.md': '# Plan 2',
              '48-01-SUMMARY.md': '# Summary 1',
            },
          },
        ],
      });
      expect(isPhaseExecuted(tmpDir, '48')).toBe(false);
    });
  });

  // ── writeStatusMarker ──

  describe('writeStatusMarker', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    it('creates the autopilot directory and writes marker', () => {
      tmpDir = createAutopilotFixture();
      writeStatusMarker(tmpDir, '48', 'plan', 'started');

      const markerPath = path.join(tmpDir, '.planning', 'autopilot', 'phase-48-plan.json');
      expect(fs.existsSync(markerPath)).toBe(true);

      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
      expect(marker.phase).toBe('48');
      expect(marker.step).toBe('plan');
      expect(marker.status).toBe('started');
      expect(marker.timestamp).toBeTruthy();
    });

    it('overwrites existing marker', () => {
      tmpDir = createAutopilotFixture();
      writeStatusMarker(tmpDir, '48', 'plan', 'started');
      writeStatusMarker(tmpDir, '48', 'plan', 'completed');

      const markerPath = path.join(tmpDir, '.planning', 'autopilot', 'phase-48-plan.json');
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
      expect(marker.status).toBe('completed');
    });
  });

  // ── updateStateProgress ──

  describe('updateStateProgress', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    it('updates the Current Phase field in STATE.md', () => {
      tmpDir = createAutopilotFixture();
      updateStateProgress(tmpDir, '49', 'planning');

      const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
      expect(content).toContain('Phase 49 (autopilot: planning)');
    });

    it('does nothing when STATE.md does not exist', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-autopilot-'));
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      // Should not throw
      expect(() => updateStateProgress(tmpDir, '49', 'planning')).not.toThrow();
    });
  });

  // ── spawnClaude ──

  describe('spawnClaude', () => {
    let spawnSyncSpy;

    afterEach(() => {
      if (spawnSyncSpy) {
        spawnSyncSpy.mockRestore();
        spawnSyncSpy = null;
      }
    });

    it('calls spawnSync with correct arguments', () => {
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 0,
        error: null,
      });

      const result = spawnClaude('/test', 'Run something');
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);

      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', 'Run something', '--verbose']),
        expect.objectContaining({ cwd: '/test', stdio: 'inherit' })
      );
    });

    it('passes max-turns flag when provided', () => {
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 0,
        error: null,
      });

      spawnClaude('/test', 'Run something', { maxTurns: 50 });
      const callArgs = spawnSyncSpy.mock.calls[0][1];
      expect(callArgs).toContain('--max-turns');
      expect(callArgs).toContain('50');
    });

    it('passes model flag when provided', () => {
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 0,
        error: null,
      });

      spawnClaude('/test', 'Run something', { model: 'opus' });
      const callArgs = spawnSyncSpy.mock.calls[0][1];
      expect(callArgs).toContain('--model');
      expect(callArgs).toContain('opus');
    });

    it('detects timeout', () => {
      const timeoutError = new Error('timed out');
      timeoutError.code = 'ETIMEDOUT';
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: null,
        error: timeoutError,
      });

      const result = spawnClaude('/test', 'Run something', { timeout: 1000 });
      expect(result.exitCode).toBe(124);
      expect(result.timedOut).toBe(true);
    });

    it('returns non-zero exit code on failure', () => {
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 1,
        error: null,
      });

      const result = spawnClaude('/test', 'Run something');
      expect(result.exitCode).toBe(1);
      expect(result.timedOut).toBe(false);
    });
  });

  // ── runAutopilot ──

  describe('runAutopilot', () => {
    let tmpDir;
    let spawnSyncSpy;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
      if (spawnSyncSpy) {
        spawnSyncSpy.mockRestore();
        spawnSyncSpy = null;
      }
    });

    it('returns error when no ROADMAP.md', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-autopilot-'));
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n');

      const result = runAutopilot(tmpDir);
      expect(result.phases_attempted).toBe(0);
      expect(result.stopped_at).toBeTruthy();
    });

    it('dry-run mode shows phases without executing', () => {
      tmpDir = createAutopilotFixture();
      const result = runAutopilot(tmpDir, { dryRun: true });
      expect(result.phases_completed).toBe(3);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].status).toBe('dry-run');
      expect(result.results[0].prompt).toBeTruthy();
    });

    it('skip-plan only runs execute steps in dry-run', () => {
      tmpDir = createAutopilotFixture();
      const result = runAutopilot(tmpDir, { dryRun: true, skipPlan: true });
      const steps = result.results.map((r) => r.step);
      expect(steps).not.toContain('plan');
      expect(steps).toContain('execute');
    });

    it('skip-execute only runs plan steps in dry-run', () => {
      tmpDir = createAutopilotFixture();
      const result = runAutopilot(tmpDir, { dryRun: true, skipExecute: true });
      const steps = result.results.map((r) => r.step);
      expect(steps).toContain('plan');
      expect(steps).not.toContain('execute');
    });

    it('resume skips already planned/executed phases', () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: {
              '48-01-PLAN.md': '# Plan',
              '48-01-SUMMARY.md': '# Summary',
            },
          },
        ],
      });

      const result = runAutopilot(tmpDir, { dryRun: true, resume: true, from: '48', to: '48' });
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe('skipped');
      expect(result.results[0].reason).toContain('already planned');
      expect(result.results[1].status).toBe('skipped');
      expect(result.results[1].reason).toContain('already executed');
    });

    it('stops on plan failure', () => {
      tmpDir = createAutopilotFixture();
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 1,
        error: null,
      });

      const result = runAutopilot(tmpDir, { from: '48', to: '50' });
      expect(result.phases_completed).toBe(0);
      expect(result.stopped_at).toContain('Phase 48');
      expect(result.stopped_at).toContain('plan failed');
    });

    it('stops when plan verification fails (no PLAN.md after spawn)', () => {
      tmpDir = createAutopilotFixture();
      // Spawn succeeds but doesn't create files
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 0,
        error: null,
      });

      const result = runAutopilot(tmpDir, { from: '48', to: '48' });
      expect(result.stopped_at).toContain('plan verification failed');
    });

    it('completes successfully when spawn creates expected files', () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: {},
          },
        ],
      });

      let callCount = 0;
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
        callCount++;
        const phaseDir = path.join(tmpDir, '.planning', 'phases', '48-first-feature');
        if (callCount === 1) {
          // Plan step — create PLAN.md
          fs.writeFileSync(path.join(phaseDir, '48-01-PLAN.md'), '# Plan');
        } else if (callCount === 2) {
          // Execute step — create SUMMARY.md
          fs.writeFileSync(path.join(phaseDir, '48-01-SUMMARY.md'), '# Summary');
        }
        return { status: 0, error: null };
      });

      const result = runAutopilot(tmpDir, { from: '48', to: '48' });
      expect(result.phases_completed).toBe(1);
      expect(result.stopped_at).toBeNull();
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({ step: 'plan', status: 'completed' });
      expect(result.results[1]).toMatchObject({ step: 'execute', status: 'completed' });
    });

    it('handles timeout during execution', () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: { '48-01-PLAN.md': '# Plan' },
          },
        ],
      });

      const timeoutError = new Error('timed out');
      timeoutError.code = 'ETIMEDOUT';

      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: null,
        error: timeoutError,
      });

      const result = runAutopilot(tmpDir, { from: '48', to: '48', skipPlan: true });
      expect(result.stopped_at).toContain('timeout');
    });

    it('respects --from and --to in the loop', () => {
      tmpDir = createAutopilotFixture();
      const result = runAutopilot(tmpDir, { dryRun: true, from: '49', to: '49' });
      expect(result.phases_attempted).toBe(1);
      const phases = [...new Set(result.results.map((r) => r.phase))];
      expect(phases).toEqual(['49']);
    });
  });

  // ── cmdAutopilot ──

  describe('cmdAutopilot', () => {
    let tmpDir;
    let spawnSyncSpy;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
      if (spawnSyncSpy) {
        spawnSyncSpy.mockRestore();
        spawnSyncSpy = null;
      }
    });

    it('outputs JSON result', () => {
      tmpDir = createAutopilotFixture();
      const { stdout } = captureOutput(() => {
        cmdAutopilot(tmpDir, ['--dry-run', '--from', '48', '--to', '48'], false);
      });
      const result = JSON.parse(stdout);
      expect(result.phases_attempted).toBe(1);
      expect(result.results).toHaveLength(2);
    });

    it('parses --timeout flag', () => {
      tmpDir = createAutopilotFixture();
      // dry-run so no actual spawning
      const { stdout } = captureOutput(() => {
        cmdAutopilot(tmpDir, ['--dry-run', '--timeout', '60', '--from', '48', '--to', '48'], false);
      });
      const result = JSON.parse(stdout);
      expect(result.phases_attempted).toBe(1);
    });

    it('parses --resume and --skip-plan flags', () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: {
              '48-01-PLAN.md': '# Plan',
              '48-01-SUMMARY.md': '# Summary',
            },
          },
        ],
      });

      const { stdout } = captureOutput(() => {
        cmdAutopilot(tmpDir, ['--dry-run', '--resume', '--from', '48', '--to', '48'], false);
      });
      const result = JSON.parse(stdout);
      expect(result.results[0].status).toBe('skipped');
    });
  });

  // ── cmdInitAutopilot ──

  describe('cmdInitAutopilot', () => {
    let tmpDir;
    let spawnSyncSpy;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
      if (spawnSyncSpy) {
        spawnSyncSpy.mockRestore();
        spawnSyncSpy = null;
      }
    });

    it('returns context with phase info', () => {
      tmpDir = createAutopilotFixture();
      // Mock spawnSync for the claude --version check
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 0,
        error: null,
      });

      const { stdout } = captureOutput(() => {
        cmdInitAutopilot(tmpDir, false);
      });
      const result = JSON.parse(stdout);
      expect(result.total_phases).toBe(3);
      expect(result.phase_range.first).toBe('48');
      expect(result.phase_range.last).toBe('50');
      expect(result.config).toBeDefined();
      expect(result.config.model_profile).toBe('balanced');
      expect(result.phases).toHaveLength(3);
    });

    it('detects claude availability', () => {
      tmpDir = createAutopilotFixture();
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 0,
        error: null,
      });

      const { stdout } = captureOutput(() => {
        cmdInitAutopilot(tmpDir, false);
      });
      const result = JSON.parse(stdout);
      expect(result.claude_available).toBe(true);
    });

    it('reports claude unavailable when spawn fails', () => {
      tmpDir = createAutopilotFixture();
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
        throw new Error('not found');
      });

      const { stdout } = captureOutput(() => {
        cmdInitAutopilot(tmpDir, false);
      });
      const result = JSON.parse(stdout);
      expect(result.claude_available).toBe(false);
    });
  });

  // ── DEFAULT_TIMEOUT_MINUTES ──

  describe('DEFAULT_TIMEOUT_MINUTES', () => {
    it('is 30 minutes', () => {
      expect(DEFAULT_TIMEOUT_MINUTES).toBe(30);
    });
  });
});
