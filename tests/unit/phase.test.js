/**
 * Unit tests for lib/phase.js
 *
 * Tests phase lifecycle operations: list, add, insert, remove, complete,
 * milestone complete, and validate consistency. All mutating tests use
 * isolated temp directories via createFixtureDir/cleanupFixtureDir.
 */

const fs = require('fs');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  cmdPhasesList,
  cmdPhaseAdd,
  cmdPhaseInsert,
  cmdPhaseRemove,
  cmdPhaseComplete,
  cmdMilestoneComplete,
  cmdValidateConsistency,
} = require('../../lib/phase');

// ─── cmdPhasesList ───────────────────────────────────────────────────────────

describe('cmdPhasesList', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('lists all phase directories', () => {
    const { stdout, exitCode } = captureOutput(() => cmdPhasesList(tmpDir, {}, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.directories).toContain('01-test');
    expect(result.directories).toContain('02-build');
    expect(result.count).toBe(2);
  });

  test('lists files with --type plans', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdPhasesList(tmpDir, { type: 'plans' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.files).toContain('01-01-PLAN.md');
    expect(result.files).toContain('02-01-PLAN.md');
    expect(result.count).toBe(2);
  });

  test('lists files with --type summaries', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdPhasesList(tmpDir, { type: 'summaries' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.files).toContain('01-01-SUMMARY.md');
    expect(result.count).toBe(1);
  });

  test('filters by --phase number', () => {
    const { stdout, exitCode } = captureOutput(() => cmdPhasesList(tmpDir, { phase: '1' }, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.directories).toEqual(['01-test']);
    expect(result.count).toBe(1);
  });

  test('filters by --phase and --type together', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdPhasesList(tmpDir, { phase: '1', type: 'plans' }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.files).toContain('01-01-PLAN.md');
    expect(result.count).toBe(1);
  });

  test('returns empty for nonexistent phase', () => {
    const { stdout, exitCode } = captureOutput(() => cmdPhasesList(tmpDir, { phase: '99' }, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.files).toEqual([]);
    expect(result.error).toBe('Phase not found');
  });

  test('returns empty when phases directory does not exist', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdPhasesList('/tmp/nonexistent-dir-grd-phase-test', {}, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.directories).toEqual([]);
    expect(result.count).toBe(0);
  });
});

// ─── cmdPhaseAdd ─────────────────────────────────────────────────────────────

describe('cmdPhaseAdd', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('adds a new phase after existing phases', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdPhaseAdd(tmpDir, 'Integration Testing', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.phase_number).toBe(3);
    expect(result.padded).toBe('03');
    expect(result.name).toBe('Integration Testing');
    expect(result.slug).toBe('integration-testing');
  });

  test('creates phase directory on disk', () => {
    captureOutput(() => cmdPhaseAdd(tmpDir, 'Integration Testing', false));
    const dirPath = path.join(tmpDir, '.planning', 'phases', '03-integration-testing');
    expect(fs.existsSync(dirPath)).toBe(true);
  });

  test('updates ROADMAP.md with new phase entry', () => {
    captureOutput(() => cmdPhaseAdd(tmpDir, 'Integration Testing', false));
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    expect(roadmap).toContain('Phase 3: Integration Testing');
    expect(roadmap).toContain('Depends on:** Phase 2');
  });

  test('errors when no description provided', () => {
    const { stderr, exitCode } = captureError(() => cmdPhaseAdd(tmpDir, null, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('description required');
  });
});

// ─── cmdPhaseInsert ──────────────────────────────────────────────────────────

describe('cmdPhaseInsert', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('inserts phase after specified phase', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdPhaseInsert(tmpDir, '1', 'Hotfix Phase', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.phase_number).toBe('01.1');
    expect(result.after_phase).toBe('1');
    expect(result.name).toBe('Hotfix Phase');
  });

  test('creates decimal phase directory on disk', () => {
    captureOutput(() => cmdPhaseInsert(tmpDir, '1', 'Hotfix Phase', false));
    const dirPath = path.join(tmpDir, '.planning', 'phases', '01.1-hotfix-phase');
    expect(fs.existsSync(dirPath)).toBe(true);
  });

  test('updates ROADMAP.md with inserted phase', () => {
    captureOutput(() => cmdPhaseInsert(tmpDir, '1', 'Hotfix Phase', false));
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    expect(roadmap).toContain('Phase 01.1: Hotfix Phase (INSERTED)');
  });

  test('increments decimal for second insert after same phase', () => {
    captureOutput(() => cmdPhaseInsert(tmpDir, '1', 'First Insert', false));
    const { stdout } = captureOutput(() => cmdPhaseInsert(tmpDir, '1', 'Second Insert', false));
    const result = JSON.parse(stdout);
    expect(result.phase_number).toBe('01.2');
    // Both directories should exist
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'phases', '01.1-first-insert'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'phases', '01.2-second-insert'))).toBe(
      true
    );
  });

  test('errors when missing arguments', () => {
    const { stderr, exitCode } = captureError(() => cmdPhaseInsert(tmpDir, null, null, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('after-phase and description required');
  });
});

// ─── cmdPhaseRemove ──────────────────────────────────────────────────────────

describe('cmdPhaseRemove', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('removes phase with --force (phase has summaries)', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdPhaseRemove(tmpDir, '1', { force: true }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.removed).toBe('1');
    expect(result.directory_deleted).toBe('01-test');
    expect(result.roadmap_updated).toBe(true);
  });

  test('deletes phase directory from disk', () => {
    captureOutput(() => cmdPhaseRemove(tmpDir, '1', { force: true }, false));
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'phases', '01-test'))).toBe(false);
  });

  test('renumbers subsequent phases on disk', () => {
    captureOutput(() => cmdPhaseRemove(tmpDir, '1', { force: true }, false));
    // Phase 02-build should now be 01-build
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'phases', '01-build'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'phases', '02-build'))).toBe(false);
  });

  test('renames files inside renumbered directories', () => {
    captureOutput(() => cmdPhaseRemove(tmpDir, '1', { force: true }, false));
    const renamedDir = path.join(tmpDir, '.planning', 'phases', '01-build');
    const files = fs.readdirSync(renamedDir);
    // 02-01-PLAN.md should become 01-01-PLAN.md
    expect(files).toContain('01-01-PLAN.md');
    expect(files).not.toContain('02-01-PLAN.md');
  });

  test('removes phase section from ROADMAP.md', () => {
    captureOutput(() => cmdPhaseRemove(tmpDir, '1', { force: true }, false));
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    // Original "Test Phase" content should be gone (renumbered "Build Phase" may now be Phase 1)
    expect(roadmap).not.toContain('Test Phase');
  });

  test('errors when removing phase with summaries without --force', () => {
    const { stderr, exitCode } = captureError(() => cmdPhaseRemove(tmpDir, '1', {}, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('executed plan');
    expect(stderr).toContain('--force');
  });

  test('errors when no phase number provided', () => {
    const { stderr, exitCode } = captureError(() => cmdPhaseRemove(tmpDir, null, {}, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase number required');
  });
});

// ─── cmdPhaseComplete ────────────────────────────────────────────────────────

describe('cmdPhaseComplete', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('marks phase as complete and returns result', () => {
    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.completed_phase).toBe('1');
    expect(result.plans_executed).toMatch(/\d+\/\d+/);
    expect(result.next_phase).toBeTruthy();
    expect(result.roadmap_updated).toBe(true);
    expect(result.state_updated).toBe(true);
  });

  test('updates ROADMAP.md plan count to complete', () => {
    captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    // The **Plans:** line should be updated to show completion fraction
    expect(roadmap).toMatch(/\*\*Plans:\*\*\s*\d+\/\d+\s*plans complete/);
  });

  test('identifies next phase', () => {
    const { stdout } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.next_phase).toBe('02');
    expect(result.is_last_phase).toBe(false);
  });

  test('errors for nonexistent phase', () => {
    const { stderr, exitCode } = captureError(() => cmdPhaseComplete(tmpDir, '99', false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  test('errors when no phase number provided', () => {
    const { stderr, exitCode } = captureError(() => cmdPhaseComplete(tmpDir, null, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('phase number required');
  });
});

// ─── cmdMilestoneComplete ────────────────────────────────────────────────────

describe('cmdMilestoneComplete', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('marks milestone as complete and returns stats', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdMilestoneComplete(tmpDir, 'v1.0', {}, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.version).toBe('v1.0');
    expect(result.phases).toBeGreaterThanOrEqual(2);
    expect(result.milestones_updated).toBe(true);
    expect(result.state_updated).toBe(true);
  });

  test('creates milestone archive on disk', () => {
    captureOutput(() => cmdMilestoneComplete(tmpDir, 'v1.0', {}, false));
    const archiveDir = path.join(tmpDir, '.planning', 'milestones');
    expect(fs.existsSync(archiveDir)).toBe(true);
    expect(fs.existsSync(path.join(archiveDir, 'v1.0-ROADMAP.md'))).toBe(true);
  });

  test('creates or updates MILESTONES.md', () => {
    captureOutput(() => cmdMilestoneComplete(tmpDir, 'v1.0', {}, false));
    const milestones = fs.readFileSync(path.join(tmpDir, '.planning', 'MILESTONES.md'), 'utf-8');
    expect(milestones).toContain('v1.0');
    expect(milestones).toContain('Shipped:');
  });

  test('accepts custom milestone name', () => {
    const { stdout } = captureOutput(() =>
      cmdMilestoneComplete(tmpDir, 'v1.0', { name: 'Custom Name' }, false)
    );
    const result = JSON.parse(stdout);
    expect(result.name).toBe('Custom Name');
  });

  test('extracts accomplishments from summaries', () => {
    const { stdout } = captureOutput(() => cmdMilestoneComplete(tmpDir, 'v1.0', {}, false));
    const result = JSON.parse(stdout);
    // Phase 01-test has a SUMMARY.md with one-liner in frontmatter
    expect(Array.isArray(result.accomplishments)).toBe(true);
  });

  test('errors when no version provided', () => {
    const { stderr, exitCode } = captureError(() => cmdMilestoneComplete(tmpDir, null, {}, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('version required');
  });
});

// ─── cmdValidateConsistency ──────────────────────────────────────────────────

describe('cmdValidateConsistency', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('returns passed for consistent state', () => {
    const { stdout, exitCode } = captureOutput(() => cmdValidateConsistency(tmpDir, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('detects directory on disk but not in ROADMAP', () => {
    // Create an orphan phase directory
    fs.mkdirSync(path.join(tmpDir, '.planning', 'phases', '99-orphan'), { recursive: true });
    const { stdout } = captureOutput(() => cmdValidateConsistency(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result.warnings.some((w) => w.includes('99'))).toBe(true);
  });

  test('detects missing frontmatter wave field in plans', () => {
    // Create a plan without wave in frontmatter
    const planDir = path.join(tmpDir, '.planning', 'phases', '02-build');
    const planPath = path.join(planDir, '02-01-PLAN.md');
    // Read existing plan and strip the wave field
    const content = fs.readFileSync(planPath, 'utf-8');
    const stripped = content.replace(/^wave:.*$/m, '');
    fs.writeFileSync(planPath, stripped, 'utf-8');

    const { stdout } = captureOutput(() => cmdValidateConsistency(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result.warnings.some((w) => w.includes('wave'))).toBe(true);
  });

  test('fails when ROADMAP.md is missing', () => {
    fs.unlinkSync(path.join(tmpDir, '.planning', 'ROADMAP.md'));
    const { stdout } = captureOutput(() => cmdValidateConsistency(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('ROADMAP.md not found');
  });
});
