/**
 * Unit tests for lib/autopilot.js
 *
 * Tests autopilot orchestration: phase range resolution, plan/execute detection,
 * prompt building, status markers, state updates, spawn wrapper, and the main loop
 * with dependency-aware parallel planning.
 */

const EventEmitter = require('events');
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
  spawnClaudeAsync,
  buildWaves,
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
    roadmap += `### Phase ${p.num}: ${p.name}\n\n**Goal:** Build ${p.name}\n`;
    if (p.depends_on) {
      roadmap += `**Depends on:** ${p.depends_on}\n`;
    }
    roadmap += '\n';
  }
  fs.writeFileSync(path.join(planning, 'ROADMAP.md'), roadmap);

  // Create milestone-scoped phases dir
  const phasesDir = path.join(planning, 'milestones', 'v1.0', 'phases');
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

/** Create a mock child process EventEmitter for spawn tests */
function createMockChild(exitCode = 0) {
  const child = new EventEmitter();
  child.kill = jest.fn(() => {
    // When killed, emit close with null code
    process.nextTick(() => child.emit('close', null));
  });
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  // Schedule close event on next tick
  process.nextTick(() => child.emit('close', exitCode));
  return child;
}

/** Capture stdout from an async function (handles process.exit) */
async function captureOutputAsync(fn) {
  let captured = '';
  const EXIT_SENTINEL = '__GRD_TEST_EXIT__';

  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    const err = new Error(EXIT_SENTINEL);
    err.__EXIT__ = true;
    err.code = code;
    throw err;
  });

  const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((data) => {
    captured += data;
    return true;
  });

  try {
    await fn();
  } catch (e) {
    if (!(e && e.__EXIT__)) {
      writeSpy.mockRestore();
      exitSpy.mockRestore();
      throw e;
    }
  } finally {
    writeSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { stdout: captured };
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

  // ── spawnClaudeAsync ──

  describe('spawnClaudeAsync', () => {
    let spawnSpy;

    afterEach(() => {
      if (spawnSpy) {
        spawnSpy.mockRestore();
        spawnSpy = null;
      }
    });

    it('calls spawn with correct arguments and stdio pipe', async () => {
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        return createMockChild(0);
      });

      const result = await spawnClaudeAsync('/test', 'Run something');
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);

      expect(spawnSpy).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['-p', 'Run something', '--verbose']),
        expect.objectContaining({ cwd: '/test', stdio: ['ignore', 'inherit', 'inherit'] })
      );
    });

    it('passes max-turns and model flags', async () => {
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        return createMockChild(0);
      });

      await spawnClaudeAsync('/test', 'Run something', { maxTurns: 50, model: 'opus' });
      const callArgs = spawnSpy.mock.calls[0][1];
      expect(callArgs).toContain('--max-turns');
      expect(callArgs).toContain('50');
      expect(callArgs).toContain('--model');
      expect(callArgs).toContain('opus');
    });

    it('returns non-zero exit code on failure', async () => {
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        return createMockChild(1);
      });

      const result = await spawnClaudeAsync('/test', 'Run something');
      expect(result.exitCode).toBe(1);
      expect(result.timedOut).toBe(false);
    });

    it('handles timeout by killing child process', async () => {
      jest.useFakeTimers();
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        const child = new EventEmitter();
        child.kill = jest.fn(() => {
          // Emit close after kill
          process.nextTick(() => child.emit('close', null));
        });
        // Never emits close naturally — simulates a hanging process
        return child;
      });

      const promise = spawnClaudeAsync('/test', 'Run something', { timeout: 5000 });
      jest.advanceTimersByTime(5000);
      const result = await promise;

      expect(result.exitCode).toBe(124);
      expect(result.timedOut).toBe(true);
      jest.useRealTimers();
    });

    it('handles spawn error', async () => {
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        const child = new EventEmitter();
        child.kill = jest.fn();
        process.nextTick(() => child.emit('error', new Error('spawn ENOENT')));
        return child;
      });

      const result = await spawnClaudeAsync('/test', 'Run something');
      expect(result.exitCode).toBe(1);
      expect(result.timedOut).toBe(false);
    });
  });

  // ── buildWaves ──

  describe('buildWaves', () => {
    it('puts all phases in single wave when no dependencies', () => {
      const phases = [
        { number: '48', name: 'A', depends_on: null },
        { number: '49', name: 'B', depends_on: null },
        { number: '50', name: 'C', depends_on: null },
      ];
      const waves = buildWaves(phases);
      expect(waves).toHaveLength(1);
      expect(waves[0]).toEqual(['48', '49', '50']);
    });

    it('separates phases into multiple waves based on dependencies', () => {
      const phases = [
        { number: '48', name: 'A', depends_on: null },
        { number: '49', name: 'B', depends_on: null },
        { number: '50', name: 'C', depends_on: 'Phase 48, Phase 49' },
      ];
      const waves = buildWaves(phases);
      expect(waves).toHaveLength(2);
      expect(waves[0]).toEqual(['48', '49']);
      expect(waves[1]).toEqual(['50']);
    });

    it('handles chain dependencies across 3 waves', () => {
      const phases = [
        { number: '1', name: 'A', depends_on: null },
        { number: '2', name: 'B', depends_on: 'Phase 1' },
        { number: '3', name: 'C', depends_on: 'Phase 2' },
      ];
      const waves = buildWaves(phases);
      expect(waves).toHaveLength(3);
      expect(waves[0]).toEqual(['1']);
      expect(waves[1]).toEqual(['2']);
      expect(waves[2]).toEqual(['3']);
    });

    it('handles empty phases array', () => {
      const waves = buildWaves([]);
      expect(waves).toEqual([]);
    });

    it('handles "Nothing" depends_on', () => {
      const phases = [
        { number: '1', name: 'A', depends_on: 'Nothing' },
        { number: '2', name: 'B', depends_on: 'Nothing' },
      ];
      const waves = buildWaves(phases);
      expect(waves).toHaveLength(1);
      expect(waves[0]).toEqual(['1', '2']);
    });
  });

  // ── runAutopilot ──

  describe('runAutopilot', () => {
    let tmpDir;
    let spawnSyncSpy;
    let spawnSpy;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
      if (spawnSyncSpy) {
        spawnSyncSpy.mockRestore();
        spawnSyncSpy = null;
      }
      if (spawnSpy) {
        spawnSpy.mockRestore();
        spawnSpy = null;
      }
    });

    it('returns error when no ROADMAP.md', async () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-autopilot-'));
      fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), '# State\n');

      const result = await runAutopilot(tmpDir);
      expect(result.phases_attempted).toBe(0);
      expect(result.stopped_at).toBeTruthy();
    });

    it('dry-run mode shows phases without executing', async () => {
      tmpDir = createAutopilotFixture();
      const result = await runAutopilot(tmpDir, { dryRun: true });
      expect(result.phases_completed).toBe(3);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].status).toBe('dry-run');
      expect(result.results[0].prompt).toBeTruthy();
    });

    it('dry-run includes waves in output', async () => {
      tmpDir = createAutopilotFixture();
      const result = await runAutopilot(tmpDir, { dryRun: true });
      expect(result.waves).toBeDefined();
      expect(result.waves.length).toBeGreaterThan(0);
    });

    it('skip-plan only runs execute steps in dry-run', async () => {
      tmpDir = createAutopilotFixture();
      const result = await runAutopilot(tmpDir, { dryRun: true, skipPlan: true });
      const steps = result.results.map((r) => r.step);
      expect(steps).not.toContain('plan');
      expect(steps).toContain('execute');
    });

    it('skip-execute only runs plan steps in dry-run', async () => {
      tmpDir = createAutopilotFixture();
      const result = await runAutopilot(tmpDir, { dryRun: true, skipExecute: true });
      const steps = result.results.map((r) => r.step);
      expect(steps).toContain('plan');
      expect(steps).not.toContain('execute');
    });

    it('resume skips already planned/executed phases', async () => {
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

      const result = await runAutopilot(tmpDir, { dryRun: true, resume: true, from: '48', to: '48' });
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe('skipped');
      expect(result.results[0].reason).toContain('already planned');
      expect(result.results[1].status).toBe('skipped');
      expect(result.results[1].reason).toContain('already executed');
    });

    it('stops on plan failure', async () => {
      tmpDir = createAutopilotFixture();
      // Plan step uses spawn (async)
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        return createMockChild(1);
      });

      const result = await runAutopilot(tmpDir, { from: '48', to: '50' });
      expect(result.phases_completed).toBe(0);
      expect(result.stopped_at).toContain('Phase 48');
      expect(result.stopped_at).toContain('plan failed');
    });

    it('stops when plan verification fails (no PLAN.md after spawn)', async () => {
      tmpDir = createAutopilotFixture();
      // Spawn succeeds but doesn't create files
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        return createMockChild(0);
      });

      const result = await runAutopilot(tmpDir, { from: '48', to: '48' });
      expect(result.stopped_at).toContain('plan verification failed');
    });

    it('completes successfully when spawn creates expected files', async () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: {},
          },
        ],
      });

      // Plan step (async spawn) — create PLAN.md
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '48-first-feature');
        fs.writeFileSync(path.join(phaseDir, '48-01-PLAN.md'), '# Plan');
        return createMockChild(0);
      });

      // Execute step (sync spawnSync) — create SUMMARY.md
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
        const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '48-first-feature');
        fs.writeFileSync(path.join(phaseDir, '48-01-SUMMARY.md'), '# Summary');
        return { status: 0, error: null };
      });

      const result = await runAutopilot(tmpDir, { from: '48', to: '48' });
      expect(result.phases_completed).toBe(1);
      expect(result.stopped_at).toBeNull();
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({ step: 'plan', status: 'completed' });
      expect(result.results[1]).toMatchObject({ step: 'execute', status: 'completed' });
    });

    it('handles timeout during execution', async () => {
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

      const result = await runAutopilot(tmpDir, { from: '48', to: '48', skipPlan: true });
      expect(result.stopped_at).toContain('timeout');
    });

    it('respects --from and --to in the loop', async () => {
      tmpDir = createAutopilotFixture();
      const result = await runAutopilot(tmpDir, { dryRun: true, from: '49', to: '49' });
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

    it('outputs JSON result', async () => {
      tmpDir = createAutopilotFixture();
      const { stdout } = await captureOutputAsync(() =>
        cmdAutopilot(tmpDir, ['--dry-run', '--from', '48', '--to', '48'], false)
      );
      const result = JSON.parse(stdout);
      expect(result.phases_attempted).toBe(1);
      expect(result.results).toHaveLength(2);
    });

    it('parses --timeout flag', async () => {
      tmpDir = createAutopilotFixture();
      const { stdout } = await captureOutputAsync(() =>
        cmdAutopilot(tmpDir, ['--dry-run', '--timeout', '60', '--from', '48', '--to', '48'], false)
      );
      const result = JSON.parse(stdout);
      expect(result.phases_attempted).toBe(1);
    });

    it('parses --resume and --skip-plan flags', async () => {
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

      const { stdout } = await captureOutputAsync(() =>
        cmdAutopilot(tmpDir, ['--dry-run', '--resume', '--from', '48', '--to', '48'], false)
      );
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

  // ── Milestone-scoped path tests ──

  describe('milestone-scoped paths', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    it('isPhasePlanned finds plans in milestone-scoped directory', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-autopilot-'));
      const planning = path.join(tmpDir, '.planning');
      fs.mkdirSync(planning, { recursive: true });
      fs.writeFileSync(path.join(planning, 'STATE.md'), '# State\n\n**Milestone:** v1.0\n');
      fs.writeFileSync(
        path.join(planning, 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      fs.writeFileSync(
        path.join(planning, 'ROADMAP.md'),
        '# Roadmap\n\n## v1.0 Test\n\n### Phase 1: Setup\n\n**Goal:** Build setup\n\n'
      );
      // Create milestone-scoped phase dir
      const phaseDir = path.join(planning, 'milestones', 'v1.0', 'phases', '01-setup');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan');

      expect(isPhasePlanned(tmpDir, '1')).toBe(true);
    });

    it('isPhaseExecuted finds summaries in milestone-scoped directory', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-autopilot-'));
      const planning = path.join(tmpDir, '.planning');
      fs.mkdirSync(planning, { recursive: true });
      fs.writeFileSync(path.join(planning, 'STATE.md'), '# State\n\n**Milestone:** v1.0\n');
      fs.writeFileSync(
        path.join(planning, 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      fs.writeFileSync(
        path.join(planning, 'ROADMAP.md'),
        '# Roadmap\n\n## v1.0 Test\n\n### Phase 1: Setup\n\n**Goal:** Build setup\n\n'
      );
      const phaseDir = path.join(planning, 'milestones', 'v1.0', 'phases', '01-setup');
      fs.mkdirSync(phaseDir, { recursive: true });
      fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), '# Plan');
      fs.writeFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), '# Summary');

      expect(isPhaseExecuted(tmpDir, '1')).toBe(true);
    });
  });

  // ── runAutopilot execute verification failure ──

  describe('runAutopilot execute verification', () => {
    let tmpDir;
    let spawnSyncSpy;
    let spawnSpy;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
      if (spawnSyncSpy) {
        spawnSyncSpy.mockRestore();
        spawnSyncSpy = null;
      }
      if (spawnSpy) {
        spawnSpy.mockRestore();
        spawnSpy = null;
      }
    });

    it('stops when execute verification fails (no SUMMARY.md after successful spawn)', async () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: {},
          },
        ],
      });

      // Plan step (async) — create PLAN.md
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '48-first-feature');
        fs.writeFileSync(path.join(phaseDir, '48-01-PLAN.md'), '# Plan');
        return createMockChild(0);
      });

      // Execute step (sync) — do NOT create SUMMARY.md
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 0,
        error: null,
      });

      const result = await runAutopilot(tmpDir, { from: '48', to: '48' });
      expect(result.phases_completed).toBe(0);
      expect(result.stopped_at).toContain('execute verification failed');
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toMatchObject({ step: 'plan', status: 'completed' });
      expect(result.results[1]).toMatchObject({
        step: 'execute',
        status: 'failed',
        reason: 'no SUMMARY.md files found after execution',
      });

      // Verify status marker was written
      const markerPath = path.join(tmpDir, '.planning', 'autopilot', 'phase-48-execute.json');
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
      expect(marker.status).toBe('failed');
    });

    it('runAutopilot with 3 phases completes all when files are created', async () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          { dir: '48-first-feature', files: {} },
          { dir: '49-second-feature', files: {} },
          { dir: '50-third-feature', files: {} },
        ],
      });

      const dirs = ['48-first-feature', '49-second-feature', '50-third-feature'];
      const nums = ['48', '49', '50'];

      // Plan step (async spawn) — create PLAN.md for whichever phase is being planned
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation((_cmd, args) => {
        // Extract phase number from prompt
        const prompt = args[1]; // -p <prompt>
        for (let i = 0; i < nums.length; i++) {
          if (prompt.includes(`plan-phase ${nums[i]}`)) {
            const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', dirs[i]);
            fs.writeFileSync(path.join(phaseDir, `${nums[i]}-01-PLAN.md`), '# Plan');
          }
        }
        return createMockChild(0);
      });

      // Execute step (sync spawnSync) — create SUMMARY.md
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockImplementation((_cmd, args) => {
        const prompt = args[1];
        for (let i = 0; i < nums.length; i++) {
          if (prompt.includes(`execute-phase ${nums[i]}`)) {
            const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', dirs[i]);
            fs.writeFileSync(path.join(phaseDir, `${nums[i]}-01-SUMMARY.md`), '# Summary');
          }
        }
        return { status: 0, error: null };
      });

      const result = await runAutopilot(tmpDir, { from: '48', to: '50' });
      expect(result.phases_completed).toBe(3);
      expect(result.stopped_at).toBeNull();
      expect(result.results).toHaveLength(6);
      result.results.forEach((r) => {
        expect(r.status).toBe('completed');
      });
    });
  });

  // ── Edge cases: resolvePhaseRange ──

  describe('resolvePhaseRange edge cases', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    it('returns error for ROADMAP with no phase headings', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-autopilot-'));
      const planning = path.join(tmpDir, '.planning');
      fs.mkdirSync(planning, { recursive: true });
      fs.writeFileSync(path.join(planning, 'STATE.md'), '# State\n');
      fs.writeFileSync(
        path.join(planning, 'config.json'),
        JSON.stringify({ model_profile: 'balanced' })
      );
      // ROADMAP with milestone heading but no Phase headings
      fs.writeFileSync(
        path.join(planning, 'ROADMAP.md'),
        '# Roadmap\n\n## v1.0 Test Milestone\n\nJust some text, no phases.\n'
      );

      const result = resolvePhaseRange(tmpDir, null, null);
      expect(result.error).toContain('No phases found');
      expect(result.phases).toHaveLength(0);
    });

    it('handles decimal phase numbers with from filter', () => {
      tmpDir = createAutopilotFixture({
        phases: [
          { num: '12', name: 'Base' },
          { num: '12.1', name: 'Inserted' },
          { num: '13', name: 'Next' },
        ],
      });

      const result = resolvePhaseRange(tmpDir, '12.1', null);
      expect(result.error).toBeNull();
      expect(result.phases).toHaveLength(2);
      expect(result.phases[0].number).toBe('12.1');
      expect(result.phases[1].number).toBe('13');
    });

    it('handles decimal phase numbers with to filter', () => {
      tmpDir = createAutopilotFixture({
        phases: [
          { num: '12', name: 'Base' },
          { num: '12.1', name: 'Inserted' },
          { num: '13', name: 'Next' },
        ],
      });

      const result = resolvePhaseRange(tmpDir, null, '12');
      expect(result.error).toBeNull();
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].number).toBe('12');
    });

    it('handles single decimal phase range (from === to)', () => {
      tmpDir = createAutopilotFixture({
        phases: [
          { num: '12', name: 'Base' },
          { num: '12.1', name: 'Inserted' },
          { num: '13', name: 'Next' },
        ],
      });

      const result = resolvePhaseRange(tmpDir, '12.1', '12.1');
      expect(result.error).toBeNull();
      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].number).toBe('12.1');
    });
  });

  // ── Edge cases: spawnClaude ──

  describe('spawnClaude edge cases', () => {
    let spawnSyncSpy;

    afterEach(() => {
      if (spawnSyncSpy) {
        spawnSyncSpy.mockRestore();
        spawnSyncSpy = null;
      }
    });

    it('returns exit code 1 when status is null (process killed)', () => {
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: null,
        error: new Error('SIGKILL'),
      });

      const result = spawnClaude('/test', 'Run something');
      expect(result.exitCode).toBe(1);
      expect(result.timedOut).toBe(false);
    });

    it('passes custom timeout through to spawnSync', () => {
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 0,
        error: null,
      });

      spawnClaude('/test', 'Run something', { timeout: 5000 });
      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('uses default args when no maxTurns or model provided', () => {
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
        status: 0,
        error: null,
      });

      spawnClaude('/test', 'Run something');
      const callArgs = spawnSyncSpy.mock.calls[0][1];
      expect(callArgs).toEqual(['-p', 'Run something', '--verbose', '--dangerously-skip-permissions']);
    });

    it('strips CLAUDECODE env var so nested claude can launch', () => {
      const origEnv = process.env.CLAUDECODE;
      process.env.CLAUDECODE = '1';
      try {
        spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({
          status: 0,
          error: null,
        });

        spawnClaude('/test', 'Run something');
        const passedEnv = spawnSyncSpy.mock.calls[0][2].env;
        expect(passedEnv).not.toHaveProperty('CLAUDECODE');
      } finally {
        if (origEnv === undefined) {
          delete process.env.CLAUDECODE;
        } else {
          process.env.CLAUDECODE = origEnv;
        }
      }
    });

  });

  // ── Edge cases: cmdAutopilot flag parsing ──

  describe('cmdAutopilot flag parsing edge cases', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    it('parses --max-turns flag correctly', async () => {
      tmpDir = createAutopilotFixture();
      const { stdout } = await captureOutputAsync(() =>
        cmdAutopilot(
          tmpDir,
          ['--dry-run', '--max-turns', '100', '--from', '48', '--to', '48'],
          false
        )
      );
      const result = JSON.parse(stdout);
      expect(result.phases_attempted).toBe(1);
      expect(result.phases_completed).toBe(1);
    });

    it('parses --model flag correctly', async () => {
      tmpDir = createAutopilotFixture();
      const { stdout } = await captureOutputAsync(() =>
        cmdAutopilot(tmpDir, ['--dry-run', '--model', 'opus', '--from', '48', '--to', '48'], false)
      );
      const result = JSON.parse(stdout);
      expect(result.phases_attempted).toBe(1);
    });

    it('parses --skip-execute flag correctly', async () => {
      tmpDir = createAutopilotFixture();
      const { stdout } = await captureOutputAsync(() =>
        cmdAutopilot(tmpDir, ['--dry-run', '--skip-execute', '--from', '48', '--to', '48'], false)
      );
      const result = JSON.parse(stdout);
      const steps = result.results.map((r) => r.step);
      expect(steps).toContain('plan');
      expect(steps).not.toContain('execute');
    });

    it('processes all phases when no --from/--to flags given', async () => {
      tmpDir = createAutopilotFixture();
      const { stdout } = await captureOutputAsync(() =>
        cmdAutopilot(tmpDir, ['--dry-run'], false)
      );
      const result = JSON.parse(stdout);
      expect(result.phases_attempted).toBe(3);
      expect(result.phases_completed).toBe(3);
      expect(result.results).toHaveLength(6);
    });
  });

  // ── Edge cases: updateStateProgress ──

  describe('updateStateProgress edge cases', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    it('is a no-op when STATE.md has no Current Phase field', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-autopilot-'));
      const planning = path.join(tmpDir, '.planning');
      fs.mkdirSync(planning, { recursive: true });
      const content = '# State\n\nSome text without Current Phase field.\n';
      fs.writeFileSync(path.join(planning, 'STATE.md'), content);

      updateStateProgress(tmpDir, '49', 'planning');

      const updated = fs.readFileSync(path.join(planning, 'STATE.md'), 'utf-8');
      expect(updated).toBe(content); // unchanged
    });

    it('overwrites previous update when called twice', () => {
      tmpDir = createAutopilotFixture();
      updateStateProgress(tmpDir, '48', 'planning');
      updateStateProgress(tmpDir, '49', 'executing');

      const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
      expect(content).toContain('Phase 49 (autopilot: executing)');
      expect(content).not.toContain('Phase 48 (autopilot: planning)');
    });
  });

  // ── Edge cases: runAutopilot ──

  describe('runAutopilot edge cases', () => {
    let tmpDir;
    let spawnSyncSpy;
    let spawnSpy;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
      if (spawnSyncSpy) {
        spawnSyncSpy.mockRestore();
        spawnSyncSpy = null;
      }
      if (spawnSpy) {
        spawnSpy.mockRestore();
        spawnSpy = null;
      }
    });

    it('both skipPlan and skipExecute produces empty results but counts phases', async () => {
      tmpDir = createAutopilotFixture();
      const result = await runAutopilot(tmpDir, {
        dryRun: true,
        skipPlan: true,
        skipExecute: true,
      });
      expect(result.phases_completed).toBe(3);
      expect(result.results).toHaveLength(0);
      expect(result.stopped_at).toBeNull();
    });

    it('passes custom timeout to spawnClaude (converted to ms)', async () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: {},
          },
        ],
      });

      // Plan step (async)
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '48-first-feature');
        fs.writeFileSync(path.join(phaseDir, '48-01-PLAN.md'), '# Plan');
        return createMockChild(0);
      });

      // Execute step (sync)
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
        const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '48-first-feature');
        fs.writeFileSync(path.join(phaseDir, '48-01-SUMMARY.md'), '# Summary');
        return { status: 0, error: null };
      });

      await runAutopilot(tmpDir, { from: '48', to: '48', timeout: 60 });
      // timeout is 60 minutes * 60 * 1000 = 3,600,000ms — checked on the sync spawnSync call
      expect(spawnSyncSpy).toHaveBeenCalledWith(
        'claude',
        expect.any(Array),
        expect.objectContaining({ timeout: 3600000 })
      );
    });

    it('passes model override through to spawnClaude', async () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          {
            dir: '48-first-feature',
            files: {},
          },
        ],
      });

      // Plan step (async)
      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
        const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '48-first-feature');
        fs.writeFileSync(path.join(phaseDir, '48-01-PLAN.md'), '# Plan');
        return createMockChild(0);
      });

      // Execute step (sync)
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockImplementation(() => {
        const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '48-first-feature');
        fs.writeFileSync(path.join(phaseDir, '48-01-SUMMARY.md'), '# Summary');
        return { status: 0, error: null };
      });

      await runAutopilot(tmpDir, { from: '48', to: '48', model: 'haiku' });
      const callArgs = spawnSyncSpy.mock.calls[0][1];
      expect(callArgs).toContain('--model');
      expect(callArgs).toContain('haiku');
    });
  });

  // ── Edge cases: writeStatusMarker ──

  describe('writeStatusMarker edge cases', () => {
    let tmpDir;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
    });

    it('creates separate files for different step names', () => {
      tmpDir = createAutopilotFixture();
      writeStatusMarker(tmpDir, '48', 'plan', 'started');
      writeStatusMarker(tmpDir, '48', 'execute', 'completed');
      writeStatusMarker(tmpDir, '48', 'review', 'started');

      const dir = path.join(tmpDir, '.planning', 'autopilot');
      expect(fs.existsSync(path.join(dir, 'phase-48-plan.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'phase-48-execute.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'phase-48-review.json'))).toBe(true);
    });

    it('creates correct filenames for different phase numbers', () => {
      tmpDir = createAutopilotFixture();
      writeStatusMarker(tmpDir, '1', 'plan', 'started');
      writeStatusMarker(tmpDir, '12.1', 'plan', 'started');
      writeStatusMarker(tmpDir, '99', 'plan', 'started');

      const dir = path.join(tmpDir, '.planning', 'autopilot');
      expect(fs.existsSync(path.join(dir, 'phase-1-plan.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'phase-12.1-plan.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'phase-99-plan.json'))).toBe(true);
    });
  });

  // ── Parallel planning ──

  describe('parallel planning', () => {
    let tmpDir;
    let spawnSpy;
    let spawnSyncSpy;

    afterEach(() => {
      if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
      }
      if (spawnSpy) {
        spawnSpy.mockRestore();
        spawnSpy = null;
      }
      if (spawnSyncSpy) {
        spawnSyncSpy.mockRestore();
        spawnSyncSpy = null;
      }
    });

    it('plans independent phases in parallel (multiple spawn calls before resolution)', async () => {
      tmpDir = createAutopilotFixture({
        phaseDirs: [
          { dir: '48-first-feature', files: {} },
          { dir: '49-second-feature', files: {} },
          { dir: '50-third-feature', files: {} },
        ],
      });

      const spawnCallTimes = [];
      const resolvers = [];

      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation((_cmd, args) => {
        spawnCallTimes.push(Date.now());
        const child = new EventEmitter();
        child.kill = jest.fn();

        // Extract phase number and create plan files
        const prompt = args[1];
        const nums = ['48', '49', '50'];
        const dirs = ['48-first-feature', '49-second-feature', '50-third-feature'];
        for (let i = 0; i < nums.length; i++) {
          if (prompt.includes(`plan-phase ${nums[i]}`)) {
            const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', dirs[i]);
            fs.writeFileSync(path.join(phaseDir, `${nums[i]}-01-PLAN.md`), '# Plan');
          }
        }

        // Delay resolution to prove parallelism
        resolvers.push(() => child.emit('close', 0));
        return child;
      });

      // Execute step (sync)
      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockImplementation((_cmd, args) => {
        const prompt = args[1];
        const nums = ['48', '49', '50'];
        const dirs = ['48-first-feature', '49-second-feature', '50-third-feature'];
        for (let i = 0; i < nums.length; i++) {
          if (prompt.includes(`execute-phase ${nums[i]}`)) {
            const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', dirs[i]);
            fs.writeFileSync(path.join(phaseDir, `${nums[i]}-01-SUMMARY.md`), '# Summary');
          }
        }
        return { status: 0, error: null };
      });

      const promise = runAutopilot(tmpDir, { from: '48', to: '50' });

      // Wait for spawn calls to be made (async, so use nextTick)
      await new Promise((r) => setImmediate(r));

      // All 3 phases should have been spawned before any resolved
      expect(spawnSpy).toHaveBeenCalledTimes(3);

      // Now resolve all
      resolvers.forEach((r) => r());

      const result = await promise;
      expect(result.phases_completed).toBe(3);
      expect(result.stopped_at).toBeNull();
    });

    it('respects dependency waves — dependent phases wait for earlier wave', async () => {
      tmpDir = createAutopilotFixture({
        phases: [
          { num: '48', name: 'First Feature' },
          { num: '49', name: 'Second Feature' },
          { num: '50', name: 'Third Feature', depends_on: 'Phase 48' },
        ],
        phaseDirs: [
          { dir: '48-first-feature', files: {} },
          { dir: '49-second-feature', files: {} },
          { dir: '50-third-feature', files: {} },
        ],
      });

      const spawnOrder = [];
      const nums = ['48', '49', '50'];
      const dirs = ['48-first-feature', '49-second-feature', '50-third-feature'];

      spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation((_cmd, args) => {
        const prompt = args[1];
        for (let i = 0; i < nums.length; i++) {
          if (prompt.includes(`plan-phase ${nums[i]}`)) {
            spawnOrder.push(nums[i]);
            const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', dirs[i]);
            fs.writeFileSync(path.join(phaseDir, `${nums[i]}-01-PLAN.md`), '# Plan');
          }
        }
        return createMockChild(0);
      });

      spawnSyncSpy = jest.spyOn(childProcess, 'spawnSync').mockImplementation((_cmd, args) => {
        const prompt = args[1];
        for (let i = 0; i < nums.length; i++) {
          if (prompt.includes(`execute-phase ${nums[i]}`)) {
            const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', dirs[i]);
            fs.writeFileSync(path.join(phaseDir, `${nums[i]}-01-SUMMARY.md`), '# Summary');
          }
        }
        return { status: 0, error: null };
      });

      const result = await runAutopilot(tmpDir, { from: '48', to: '50' });

      expect(result.phases_completed).toBe(3);
      expect(result.waves).toHaveLength(2);
      expect(result.waves[0]).toEqual(['48', '49']);
      expect(result.waves[1]).toEqual(['50']);
    });
  });

  // ── DEFAULT_TIMEOUT_MINUTES ──

  describe('DEFAULT_TIMEOUT_MINUTES', () => {
    it('is 30 minutes', () => {
      expect(DEFAULT_TIMEOUT_MINUTES).toBe(30);
    });
  });
});
