/**
 * Unit tests for lib/gates.ts
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
  checkInvariantValidation,
  checkCitationGate,
  checkTransitiveCitationGate,
  GATE_REGISTRY,
  runPreflightGates,
  resetGatesCache,
} = require('../../lib/gates');

// ─── checkOrphanedPhases ────────────────────────────────────────────────────

describe('checkOrphanedPhases', () => {
  let tmpDir: string;

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
      fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n### Phase 1: Test\n');

      const stderrLines: string[] = [];
      const stderrSpy = (
        jest.spyOn(process.stderr, 'write') as jest.SpyInstance
      ).mockImplementation((data: string) => {
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
  let tmpDir: string;

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
  let tmpDir: string;

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
  let tmpDir: string;

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
  let tmpDir: string;

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
  let tmpDir: string;

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

// ─── checkInvariantValidation ────────────────────────────────────────────────

describe('checkInvariantValidation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns empty when no phase option provided', () => {
    const violations = checkInvariantValidation(tmpDir, {});
    expect(violations).toEqual([]);
  });

  test('returns empty when phase directory does not exist', () => {
    const violations = checkInvariantValidation(tmpDir, { phase: '99' });
    expect(violations).toEqual([]);
  });

  test('returns empty when phases directory itself cannot be read', () => {
    // Create a path where phasesDir is a file (not a directory) — readdirSync throws
    const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-inv-bare-'));
    const planningDir = path.join(bareDir, '.planning');
    fs.mkdirSync(planningDir);
    // Write ROADMAP.md so phasesDir path is looked up
    fs.writeFileSync(path.join(planningDir, 'ROADMAP.md'), '# Roadmap\n');
    fs.writeFileSync(path.join(planningDir, 'config.json'), '{}');
    // Make phasesDir a file instead of a directory — readdirSync will throw ENOTDIR
    const milestonesDir = path.join(planningDir, 'milestones');
    fs.mkdirSync(milestonesDir);
    const anonDir = path.join(milestonesDir, 'anonymous');
    fs.mkdirSync(anonDir);
    // phases should be a directory, but make it a file
    fs.writeFileSync(path.join(anonDir, 'phases'), 'not a directory');

    try {
      const violations = checkInvariantValidation(bareDir, { phase: '1' });
      expect(violations).toEqual([]);
    } finally {
      fs.rmSync(bareDir, { recursive: true, force: true });
    }
  });

  test('returns empty when phase has no plan files', () => {
    // Create a new phase directory with no plan files
    const emptyPhaseDir = path.join(
      tmpDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '50-empty-phase'
    );
    fs.mkdirSync(emptyPhaseDir, { recursive: true });
    fs.writeFileSync(path.join(emptyPhaseDir, 'CONTEXT.md'), '# Context\n\nSome context.\n');

    const violations = checkInvariantValidation(tmpDir, { phase: '50' });
    expect(violations).toEqual([]);
  });

  test('returns empty when phaseDir exists but cannot be read (ENOTDIR)', () => {
    // Simulate readdirSync failing on the phase directory by matching the specific path.
    const phasesDir = path.join(
      tmpDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases'
    );
    const newPhaseDir = path.join(phasesDir, '50-unreadable');
    fs.mkdirSync(newPhaseDir);

    const originalReaddirSync = (fs.readdirSync as Function);
    const spy = jest
      .spyOn(fs, 'readdirSync')
      .mockImplementation(function (dirPath: unknown, ...rest: unknown[]) {
        // Throw only when called with the specific phaseDir path (no options = plan files listing)
        if (typeof dirPath === 'string' && dirPath === newPhaseDir) {
          const err = Object.assign(new Error('ENOTDIR: not a directory'), { code: 'ENOTDIR' });
          throw err;
        }
        return (originalReaddirSync as Function)(dirPath, ...rest);
      } as typeof fs.readdirSync);

    try {
      const violations = checkInvariantValidation(tmpDir, { phase: '50' });
      expect(violations).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  test('returns INVARIANT_STRUCTURAL errors for invalid plan files', () => {
    const phaseDir = path.join(
      tmpDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    // Write a plan with missing required fields (no objective, no files_modified)
    fs.writeFileSync(
      path.join(phaseDir, '01-01-PLAN.md'),
      [
        '---',
        'phase: 01-test',
        'plan: 1',
        'type: execute',
        'wave: 1',
        'autonomous: false',
        'files_modified: []',
        '---',
        '',
        '',
      ].join('\n')
    );

    const violations = checkInvariantValidation(tmpDir, { phase: '1' });

    // Should have structural violations (empty files_modified, missing objective)
    const structuralErrors = violations.filter((v: { code: string }) => v.code === 'INVARIANT_STRUCTURAL');
    expect(structuralErrors.length).toBeGreaterThan(0);
  });

  test('returns INVARIANT_CROSS_PHASE errors for duplicate provides', () => {
    const phaseDir = path.join(
      tmpDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    const validPlan = (planNum: number, provides: string) => [
      '---',
      `phase: 01-test`,
      `plan: ${planNum}`,
      'type: execute',
      'wave: 1',
      'autonomous: false',
      'files_modified: [lib/foo.ts]',
      `provides: [${provides}]`,
      'requires: []',
      '---',
      '',
      '<objective>Implement something useful</objective>',
      '',
    ].join('\n');

    fs.writeFileSync(path.join(phaseDir, '01-01-PLAN.md'), validPlan(1, 'shared-artifact'));
    fs.writeFileSync(path.join(phaseDir, '01-02-PLAN.md'), validPlan(2, 'shared-artifact'));

    const violations = checkInvariantValidation(tmpDir, { phase: '1' });

    const crossErrors = violations.filter((v: { code: string }) => v.code === 'INVARIANT_CROSS_PHASE');
    expect(crossErrors.length).toBeGreaterThan(0);
    expect(crossErrors[0].message).toContain('shared-artifact');
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
    for (const [, gates] of Object.entries(GATE_REGISTRY) as [string, string[]][]) {
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
  let tmpDir: string;

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

  test('new-milestone command runs old-phases-archived and milestone-state-coherence gates', () => {
    const result = runPreflightGates(tmpDir, 'new-milestone', {});
    // Fixture has state IN PROGRESS and no "milestone complete" text — should pass
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('milestone-complete command runs milestone-state-coherence gate', () => {
    const result = runPreflightGates(tmpDir, 'milestone-complete', {});
    // Fixture state is coherent — should pass
    expect(result.passed).toBe(true);
  });
});

// ─── Multi-milestone: gates ignore shipped sections ──────────────────────────

describe('gates with shipped milestone sections', () => {
  let tmpDir: string;

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
    const orphanNums = violations.map(
      (v: { context: { phase_number: string } }) => v.context.phase_number
    );
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
    const orphanNums = violations.map(
      (v: { context: { phase_number: string } }) => v.context.phase_number
    );
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

// ─── checkCitationGate ────────────────────────────────────────────────────────

describe('checkCitationGate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns empty violations when citation_gate is false (default)', () => {
    // Default config has citation_gate: false (not set) — gate is a no-op
    const violations = checkCitationGate(tmpDir, {});
    expect(violations).toEqual([]);
  });

  test('returns empty violations when citation_gate=true but no PAPERS.md exists', () => {
    // Enable citation_gate in config
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.citation_gate = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // No .planning/research/PAPERS.md — gate returns empty
    const violations = checkCitationGate(tmpDir, {});
    expect(violations).toEqual([]);
  });

  test('returns empty violations when citation_gate=true and no critical unresolved nodes', () => {
    // Enable citation_gate
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.citation_gate = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Create research dir with PAPERS.md that has no missing components (no critical nodes)
    const researchDir = path.join(tmpDir, '.planning', 'research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(
      path.join(researchDir, 'PAPERS.md'),
      '## Simple Paper\n\nJust a paper with no component sections.\n'
    );

    const violations = checkCitationGate(tmpDir, {});
    expect(violations).toEqual([]);
  });

  test('returns CITATION_UNRESOLVED_CRITICAL violation for critical unresolved nodes', () => {
    // Enable citation_gate
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.citation_gate = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Create research dir with PAPERS.md that has a missing component (code_available: no → critical)
    const researchDir = path.join(tmpDir, '.planning', 'research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(
      path.join(researchDir, 'PAPERS.md'),
      [
        '## Attention Is All You Need',
        '',
        '### Missing Components',
        '',
        '| Name | Source Paper | Description | Code Available |',
        '| ---- | ------------ | ----------- | -------------- |',
        '| Multi-Head Attention | vaswani-2017 | Parallel attention | no |',
      ].join('\n')
    );

    const violations = checkCitationGate(tmpDir, {});
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].code).toBe('CITATION_UNRESOLVED_CRITICAL');
    expect(violations[0].severity).toBe('error');
    expect(violations[0].message).toContain('vaswani-2017');
  });

  test('citation-gate appears in GATE_REGISTRY for plan-phase', () => {
    const planPhaseGates = GATE_REGISTRY['plan-phase'] as string[];
    expect(planPhaseGates).toContain('citation-gate');
  });
});

// ─── checkTransitiveCitationGate ──────────────────────────────────────────────

describe('checkTransitiveCitationGate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns empty array when transitive_citation_gate is false in config (default)', () => {
    // Default config has transitive_citation_gate: false — gate is a no-op, no PAPERS.md needed
    const violations = checkTransitiveCitationGate(tmpDir, {});
    expect(violations).toEqual([]);
  });

  test('returns empty array when transitive_citation_gate is true but PAPERS.md does not exist', () => {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.transitive_citation_gate = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // No .planning/research/PAPERS.md — gate returns empty
    const violations = checkTransitiveCitationGate(tmpDir, {});
    expect(violations).toEqual([]);
  });

  test('returns GateViolation[] with CITATION_UNRESOLVED_TRANSITIVE and severity warning when unresolved leaf nodes exist', () => {
    // Enable transitive_citation_gate
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.transitive_citation_gate = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Create research dir with a PAPERS.md that has a missing component with code_available: no
    // This creates a transitive leaf node (dep paper) that is unresolved
    const researchDir = path.join(tmpDir, '.planning', 'research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.writeFileSync(
      path.join(researchDir, 'PAPERS.md'),
      [
        '## Attention Is All You Need',
        '',
        '### Missing Components',
        '',
        '| Name | Source Paper | Description | Code Available |',
        '| ---- | ------------ | ----------- | -------------- |',
        '| Multi-Head Attention | vaswani-2017 | Parallel attention | no |',
      ].join('\n')
    );

    const violations = checkTransitiveCitationGate(tmpDir, {});
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].code).toBe('CITATION_UNRESOLVED_TRANSITIVE');
    expect(violations[0].severity).toBe('warning');
    expect(violations[0].message).toContain('vaswani-2017');
  });

  test('transitive-citation-gate appears in GATE_REGISTRY for plan-phase', () => {
    const planPhaseGates = GATE_REGISTRY['plan-phase'] as string[];
    expect(planPhaseGates).toContain('transitive-citation-gate');
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

// ─── runPreflightGates gate error handling (M1 regression) ───────────────────

describe('runPreflightGates gate error handling (M1 regression)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  it('logs and records a warning when a gate check throws', () => {
    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const gates = require('../../lib/gates') as {
        _GATE_CHECKS?: Record<string, unknown>;
        GATE_REGISTRY: Record<string, string[]>;
        runPreflightGates: (
          cwd: string,
          command: string,
          opts?: { phase?: string },
        ) => { errors: unknown[]; warnings: Array<{ code: string; message: string }> };
      };

      if (!gates._GATE_CHECKS) {
        console.warn('Skipping M1 test: _GATE_CHECKS not exported');
        return;
      }

      // Use 'phase-complete' command; pick its first registered gate to patch
      const command = 'phase-complete';
      const gateName = gates.GATE_REGISTRY[command][0];
      const original = gates._GATE_CHECKS[gateName];
      (gates._GATE_CHECKS as Record<string, unknown>)[gateName] = () => {
        throw new Error('injected test failure');
      };

      try {
        const result = gates.runPreflightGates(tmpDir, command, { phase: '1' });
        expect(result.warnings.some((w) => w.code === 'GATE_ERROR')).toBe(true);
        expect(stderrSpy).toHaveBeenCalledWith(
          expect.stringContaining(`gate '${gateName}' threw`),
        );
      } finally {
        (gates._GATE_CHECKS as Record<string, unknown>)[gateName] = original;
      }
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
