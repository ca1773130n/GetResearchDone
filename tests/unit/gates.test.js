/**
 * Unit tests for lib/gates.js
 *
 * Tests validation gate system: individual check functions,
 * gate registry, runPreflightGates, YOLO bypass, and new-project safety.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  checkOrphanedPhases,
  checkPhaseInRoadmap,
  checkPhaseHasPlans,
  checkNoStaleArtifacts,
  checkOldPhasesArchived,
  checkMilestoneStateCoherence,
  GATE_REGISTRY,
  runPreflightGates,
  resetGatesCache,
} = require('../../lib/gates');

// ─── checkOrphanedPhases ────────────────────────────────────────────────────

describe('checkOrphanedPhases', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns empty for clean fixture (no orphans)', () => {
    const violations = checkOrphanedPhases(tmpDir);
    expect(violations).toEqual([]);
  });

  test('returns violation for extra directory not in ROADMAP', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '99-orphan'), {
      recursive: true,
    });
    const violations = checkOrphanedPhases(tmpDir);
    expect(violations.length).toBe(1);
    expect(violations[0].code).toBe('ORPHANED_PHASE');
    expect(violations[0].severity).toBe('error');
    expect(violations[0].context.directory).toBe('99-orphan');
  });

  test('returns empty when no ROADMAP.md exists', () => {
    fs.unlinkSync(path.join(tmpDir, '.planning', 'ROADMAP.md'));
    const violations = checkOrphanedPhases(tmpDir);
    expect(violations).toEqual([]);
  });

  test('returns empty when phases directory does not exist', () => {
    fs.rmSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases'), {
      recursive: true,
      force: true,
    });
    const violations = checkOrphanedPhases(tmpDir);
    expect(violations).toEqual([]);
  });

  test('logs non-ENOENT error to stderr when phases dir read fails unexpectedly', () => {
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-gates-eisdir-'));
    try {
      const planningDir = path.join(tmpDir2, '.planning');
      const milestonesDir = path.join(planningDir, 'milestones');
      const anonymousDir = path.join(milestonesDir, 'anonymous');
      fs.mkdirSync(anonymousDir, { recursive: true });
      // Create phases as a FILE instead of directory → EISDIR when readdirSync is called
      fs.writeFileSync(path.join(anonymousDir, 'phases'), 'not a dir');
      fs.writeFileSync(
        path.join(planningDir, 'ROADMAP.md'),
        '# Roadmap\n### Phase 1: Test\n'
      );

      const stderrLines = [];
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((data) => {
        stderrLines.push(String(data));
        return true;
      });

      const violations = checkOrphanedPhases(tmpDir2);

      stderrSpy.mockRestore();

      expect(violations).toEqual([]);
      expect(stderrLines.some((line) => line.length > 0)).toBe(true);
    } finally {
      fs.rmSync(tmpDir2, { recursive: true, force: true });
    }
  });
});

// ─── checkPhaseInRoadmap ────────────────────────────────────────────────────

describe('checkPhaseInRoadmap', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns empty when phase exists in ROADMAP', () => {
    const violations = checkPhaseInRoadmap(tmpDir, '1');
    expect(violations).toEqual([]);
  });

  test('returns violation when phase exists on disk but not in ROADMAP', () => {
    // Create a phase directory on disk that is NOT in ROADMAP
    fs.mkdirSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '99-orphan'), {
      recursive: true,
    });
    const violations = checkPhaseInRoadmap(tmpDir, '99');
    expect(violations.length).toBe(1);
    expect(violations[0].code).toBe('PHASE_NOT_IN_ROADMAP');
    expect(violations[0].severity).toBe('error');
  });

  test('returns empty when phase does not exist on disk or in ROADMAP', () => {
    const violations = checkPhaseInRoadmap(tmpDir, '99');
    expect(violations).toEqual([]);
  });

  test('returns empty when no ROADMAP.md exists', () => {
    fs.unlinkSync(path.join(tmpDir, '.planning', 'ROADMAP.md'));
    const violations = checkPhaseInRoadmap(tmpDir, '1');
    expect(violations).toEqual([]);
  });

  test('returns empty when phase is null', () => {
    const violations = checkPhaseInRoadmap(tmpDir, null);
    expect(violations).toEqual([]);
  });
});

// ─── checkPhaseHasPlans ─────────────────────────────────────────────────────

describe('checkPhaseHasPlans', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns empty when phase has plans', () => {
    const violations = checkPhaseHasPlans(tmpDir, '1');
    expect(violations).toEqual([]);
  });

  test('returns violation when phase has no plans', () => {
    // Create empty phase directory
    fs.mkdirSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '03-empty'), {
      recursive: true,
    });
    // Also add Phase 3 to ROADMAP so it's not an orphan
    const roadmapPath = path.join(tmpDir, '.planning', 'ROADMAP.md');
    const roadmap = fs.readFileSync(roadmapPath, 'utf-8');
    fs.writeFileSync(roadmapPath, roadmap + '\n### Phase 3: Empty Phase\n', 'utf-8');

    const violations = checkPhaseHasPlans(tmpDir, '3');
    expect(violations.length).toBe(1);
    expect(violations[0].code).toBe('PHASE_NO_PLANS');
  });

  test('returns empty when phase directory does not exist', () => {
    const violations = checkPhaseHasPlans(tmpDir, '99');
    expect(violations).toEqual([]);
  });
});

// ─── checkNoStaleArtifacts ──────────────────────────────────────────────────

describe('checkNoStaleArtifacts', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns empty for clean phase', () => {
    const violations = checkNoStaleArtifacts(tmpDir, '1');
    expect(violations).toEqual([]);
  });

  test('returns warning for summary without matching plan', () => {
    // Create a stale summary in phase 1
    const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-99-SUMMARY.md'), '---\none-liner: stale\n---\n');

    const violations = checkNoStaleArtifacts(tmpDir, '1');
    expect(violations.length).toBe(1);
    expect(violations[0].code).toBe('STALE_ARTIFACTS');
    expect(violations[0].severity).toBe('warning');
  });
});

// ─── checkOldPhasesArchived ─────────────────────────────────────────────────

describe('checkOldPhasesArchived', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns empty when STATE does not indicate milestone complete', () => {
    const violations = checkOldPhasesArchived(tmpDir);
    expect(violations).toEqual([]);
  });

  test('returns violation when STATE says complete but phases exist', () => {
    // Update STATE.md to say milestone complete
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    let state = fs.readFileSync(statePath, 'utf-8');
    state = state.replace('IN PROGRESS', 'v1.0 milestone complete');
    fs.writeFileSync(statePath, state, 'utf-8');

    const violations = checkOldPhasesArchived(tmpDir);
    expect(violations.length).toBe(1);
    expect(violations[0].code).toBe('UNARCHIVED_PHASES');
    expect(violations[0].severity).toBe('error');
  });

  test('returns empty when no STATE.md exists', () => {
    fs.unlinkSync(path.join(tmpDir, '.planning', 'STATE.md'));
    const violations = checkOldPhasesArchived(tmpDir);
    expect(violations).toEqual([]);
  });
});

// ─── checkMilestoneStateCoherence ───────────────────────────────────────────

describe('checkMilestoneStateCoherence', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns empty for coherent state', () => {
    const violations = checkMilestoneStateCoherence(tmpDir);
    expect(violations).toEqual([]);
  });

  test('returns violation when STATE references phase not in ROADMAP', () => {
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    let state = fs.readFileSync(statePath, 'utf-8');
    state = state.replace('**Active phase:** 1', '**Active phase:** 99');
    fs.writeFileSync(statePath, state, 'utf-8');

    const violations = checkMilestoneStateCoherence(tmpDir);
    expect(violations.length).toBe(1);
    expect(violations[0].code).toBe('MILESTONE_STATE_CONFUSION');
  });
});

// ─── GATE_REGISTRY ──────────────────────────────────────────────────────────

describe('GATE_REGISTRY', () => {
  test('has entries for expected commands', () => {
    expect(GATE_REGISTRY).toHaveProperty('execute-phase');
    expect(GATE_REGISTRY).toHaveProperty('plan-phase');
    expect(GATE_REGISTRY).toHaveProperty('new-milestone');
    expect(GATE_REGISTRY).toHaveProperty('phase-add');
    expect(GATE_REGISTRY).toHaveProperty('phase-insert');
    expect(GATE_REGISTRY).toHaveProperty('phase-complete');
    expect(GATE_REGISTRY).toHaveProperty('milestone-complete');
  });

  test('each entry is a non-empty array of strings', () => {
    for (const [, gates] of Object.entries(GATE_REGISTRY)) {
      expect(Array.isArray(gates)).toBe(true);
      expect(gates.length).toBeGreaterThan(0);
      for (const gate of gates) {
        expect(typeof gate).toBe('string');
      }
    }
  });
});

// ─── runPreflightGates ──────────────────────────────────────────────────────

describe('runPreflightGates', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('passes for clean fixture with valid phase', () => {
    const result = runPreflightGates(tmpDir, 'execute-phase', { phase: '1' });
    expect(result.passed).toBe(true);
    expect(result.bypassed).toBe(false);
    expect(result.errors).toEqual([]);
  });

  test('fails for execute-phase with orphaned phases', () => {
    fs.mkdirSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '99-orphan'), {
      recursive: true,
    });
    const result = runPreflightGates(tmpDir, 'execute-phase', { phase: '1' });
    expect(result.passed).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('ORPHANED_PHASE');
  });

  test('YOLO bypass: passes with autonomous_mode despite errors', () => {
    // Enable autonomous_mode
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.autonomous_mode = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Create orphaned phase
    fs.mkdirSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '99-orphan'), {
      recursive: true,
    });

    const result = runPreflightGates(tmpDir, 'execute-phase', { phase: '1' });
    expect(result.passed).toBe(true);
    expect(result.bypassed).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('passes through for unknown command', () => {
    const result = runPreflightGates(tmpDir, 'unknown-command', {});
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('new project safety: passes when no ROADMAP.md exists', () => {
    fs.unlinkSync(path.join(tmpDir, '.planning', 'ROADMAP.md'));
    const result = runPreflightGates(tmpDir, 'execute-phase', { phase: '1' });
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('collects warnings separately from errors', () => {
    // Create stale artifact (summary without plan)
    const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-99-SUMMARY.md'), '---\none-liner: stale\n---\n');

    const result = runPreflightGates(tmpDir, 'plan-phase', { phase: '1' });
    expect(result.passed).toBe(true); // warnings don't block
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].code).toBe('STALE_ARTIFACTS');
  });

  test('skipGates: true bypasses all checks and sets bypassed flag', () => {
    // Create orphaned phase that would normally fail
    fs.mkdirSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '99-orphan'), {
      recursive: true,
    });
    const result = runPreflightGates(tmpDir, 'execute-phase', { phase: '1', skipGates: true });
    expect(result.passed).toBe(true);
    expect(result.bypassed).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

// ─── Multi-milestone: gates ignore shipped sections ──────────────────────────

describe('gates with shipped milestone sections', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  const MULTI_MILESTONE_ROADMAP = [
    '# Roadmap',
    '',
    '<details>',
    '<summary>v0.0.5 — Shipped</summary>',
    '',
    '## M0 v0.0.5: Foundation',
    '',
    '### Phase 1: Old Setup',
    '### Phase 2: Old Build',
    '',
    '</details>',
    '',
    '## M1 v0.2.0: Active',
    '',
    '### Phase 29: New Work',
    '### Phase 30: Final Work',
  ].join('\n');

  test('checkOrphanedPhases ignores phases inside <details> blocks', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      MULTI_MILESTONE_ROADMAP,
      'utf-8'
    );
    // Create a directory for Phase 29 (active) — should not be orphaned
    fs.mkdirSync(
      path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '29-new-work'),
      { recursive: true }
    );
    const violations = checkOrphanedPhases(tmpDir);
    const orphanNums = violations.map((v) => v.context.phase_number);
    expect(orphanNums).not.toContain('29');
  });

  test('checkOrphanedPhases does not match shipped phase numbers', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      MULTI_MILESTONE_ROADMAP,
      'utf-8'
    );
    // Phase 1 dir exists from fixture but Phase 1 is inside <details> in new roadmap
    // The fixture has Phase 1 and Phase 2 dirs — they should now appear orphaned
    const violations = checkOrphanedPhases(tmpDir);
    const orphanNums = violations.map((v) => v.context.phase_number);
    // Phase 1 and 2 are inside <details> so not recognized in active content
    expect(orphanNums).toContain('01');
  });

  test('checkPhaseInRoadmap finds active phase', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      MULTI_MILESTONE_ROADMAP,
      'utf-8'
    );
    fs.mkdirSync(
      path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '29-new-work'),
      { recursive: true }
    );
    const violations = checkPhaseInRoadmap(tmpDir, '29');
    expect(violations).toEqual([]);
  });

  test('checkPhaseInRoadmap flags shipped phase as not in roadmap', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      MULTI_MILESTONE_ROADMAP,
      'utf-8'
    );
    // Phase 1 exists on disk from fixture but is inside <details>
    const violations = checkPhaseInRoadmap(tmpDir, '1');
    expect(violations.length).toBe(1);
    expect(violations[0].code).toBe('PHASE_NOT_IN_ROADMAP');
  });
});

// ─── resetGatesCache ──────────────────────────────────────────────────────────

describe('resetGatesCache', () => {
  test('is exported as a function', () => {
    expect(typeof resetGatesCache).toBe('function');
  });

  test('can be called without throwing', () => {
    expect(() => resetGatesCache()).not.toThrow();
  });
});
