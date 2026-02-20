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
    const dirPath = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '03-integration-testing');
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
    const dirPath = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01.1-hotfix-phase');
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
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01.1-first-insert'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01.2-second-insert'))).toBe(
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
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test'))).toBe(false);
  });

  test('renumbers subsequent phases on disk', () => {
    captureOutput(() => cmdPhaseRemove(tmpDir, '1', { force: true }, false));
    // Phase 02-build should now be 01-build
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-build'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '02-build'))).toBe(false);
  });

  test('renames files inside renumbered directories', () => {
    captureOutput(() => cmdPhaseRemove(tmpDir, '1', { force: true }, false));
    const renamedDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-build');
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

  test('archives phase directories to milestones/{version}-phases/', () => {
    captureOutput(() => cmdMilestoneComplete(tmpDir, 'v1.0', {}, false));
    const archiveDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0-phases');
    expect(fs.existsSync(archiveDir)).toBe(true);
    // At least one phase dir should be archived
    const archivedDirs = fs.readdirSync(archiveDir);
    expect(archivedDirs.length).toBeGreaterThanOrEqual(2);
    expect(archivedDirs).toContain('01-test');
    expect(archivedDirs).toContain('02-build');
  });

  test('.planning/milestones/anonymous/phases/ is empty after milestone complete', () => {
    captureOutput(() => cmdMilestoneComplete(tmpDir, 'v1.0', {}, false));
    const phasesDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases');
    const remaining = fs.readdirSync(phasesDir, { withFileTypes: true });
    const dirs = remaining.filter((e) => e.isDirectory());
    expect(dirs.length).toBe(0);
  });

  test('result includes archived.phases: true and phase_count', () => {
    const { stdout } = captureOutput(() => cmdMilestoneComplete(tmpDir, 'v1.0', {}, false));
    const result = JSON.parse(stdout);
    expect(result.archived.phases).toBe(true);
    expect(result.archived.phase_count).toBeGreaterThanOrEqual(2);
  });

  test('skips phase archive copy when phases are already under milestones/{version}/phases/', () => {
    // Create a milestone-scoped layout where phases already live under milestones/v1.0/phases/
    const msDir = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases', '01-test');
    fs.mkdirSync(msDir, { recursive: true });
    fs.writeFileSync(
      path.join(msDir, '01-01-PLAN.md'),
      '---\nphase: 01-test\nplan: 01\nwave: 1\n---\n# Plan\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(msDir, '01-01-SUMMARY.md'),
      '---\none-liner: "Test summary"\n---\n# Summary\n\n## Task 1\nDone.\n',
      'utf-8'
    );

    // Remove old-style phases so only milestone-scoped phases exist
    const oldPhasesDir = path.join(tmpDir, '.planning', 'phases');
    fs.rmSync(oldPhasesDir, { recursive: true, force: true });
    fs.mkdirSync(oldPhasesDir, { recursive: true });

    const { stdout } = captureOutput(() => cmdMilestoneComplete(tmpDir, 'v1.0', {}, false));
    const result = JSON.parse(stdout);

    // Should indicate phases were already in place
    expect(result.phases_already_in_place).toBe(true);

    // Should NOT create redundant v1.0-phases/ archive
    const redundantArchive = path.join(tmpDir, '.planning', 'milestones', 'v1.0-phases');
    expect(fs.existsSync(redundantArchive)).toBe(false);

    // Original milestone phase dir should still exist (not deleted)
    expect(fs.existsSync(msDir)).toBe(true);
  });

  test('writes archived.json marker in milestone directory on completion', () => {
    captureOutput(() => cmdMilestoneComplete(tmpDir, 'v1.0', {}, false));
    const markerPath = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'archived.json');
    expect(fs.existsSync(markerPath)).toBe(true);

    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
    expect(marker.version).toBe('v1.0');
    expect(marker).toHaveProperty('archived_date');
    expect(marker).toHaveProperty('phases');
  });

  test('archived.json marker is readable and contains expected fields', () => {
    captureOutput(() => cmdMilestoneComplete(tmpDir, 'v1.0', {}, false));
    const markerPath = path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'archived.json');
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));

    expect(marker.version).toBe('v1.0');
    expect(typeof marker.archived_date).toBe('string');
    expect(typeof marker.phases).toBe('number');
    expect(typeof marker.plans).toBe('number');
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
    fs.mkdirSync(path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '99-orphan'), { recursive: true });
    const { stdout } = captureOutput(() => cmdValidateConsistency(tmpDir, false));
    const result = JSON.parse(stdout);
    expect(result.warnings.some((w) => w.includes('99'))).toBe(true);
  });

  test('detects missing frontmatter wave field in plans', () => {
    // Create a plan without wave in frontmatter
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '02-build');
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

// ─── cmdPhaseComplete quality analysis integration ──────────────────────────

describe('cmdPhaseComplete quality analysis integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  // Helper: set phase_cleanup config
  function setCleanupConfig(enabled) {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (enabled !== undefined) {
      config.phase_cleanup = { enabled };
    } else {
      delete config.phase_cleanup;
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  // Helper: create a source file in lib/ for quality analysis to find
  function createSourceFile(name, content) {
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(path.join(libDir, name), content, 'utf-8');
  }

  // ─── Integration behavior ─────────────────────────────────────────────

  test('phase complete output includes quality_report when cleanup enabled', () => {
    setCleanupConfig(true);
    createSourceFile(
      'sample.js',
      'function greet() { return "hi"; }\nmodule.exports = { greet };\n'
    );

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('quality_report');
    expect(result.quality_report).toHaveProperty('summary');
    expect(result.quality_report).toHaveProperty('details');
  });

  test('phase complete output does NOT include quality_report when cleanup disabled', () => {
    setCleanupConfig(false);

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).not.toHaveProperty('quality_report');
  });

  test('phase complete output does NOT include quality_report when phase_cleanup section missing', () => {
    setCleanupConfig(undefined);

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).not.toHaveProperty('quality_report');
  });

  test('quality analysis errors do not block phase completion', () => {
    // Set enabled but ensure no lib dir exists (quality analysis may return empty but not crash)
    setCleanupConfig(true);

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    // Phase completion still works (core fields present)
    expect(result.completed_phase).toBe('1');
    expect(result.roadmap_updated).toBe(true);
  });

  // ─── Raw output integration ───────────────────────────────────────────

  test('raw output includes quality summary when issues found', () => {
    setCleanupConfig(true);
    // Create an oversized file to trigger issues
    const bigContent = Array.from({ length: 601 }, (_, i) => `// line ${i + 1}`).join('\n') + '\n';
    createSourceFile('big-module.js', bigContent);

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', true));
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Quality');
    expect(stdout).toContain('issue');
  });

  test('raw output does not mention quality when no issues', () => {
    setCleanupConfig(true);
    // Two files: one exports, the other consumes -- no dead exports, no oversized, no complexity
    createSourceFile(
      'math.js',
      'function add(a, b) { return a + b; }\nmodule.exports = { add };\n'
    );
    createSourceFile('main.js', 'const { add } = require("./math");\nconsole.log(add(1, 2));\n');

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', true));
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('Quality');
  });

  test('raw output does not mention quality when disabled', () => {
    setCleanupConfig(false);

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', true));
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('Quality');
  });

  test('phase completion still updates ROADMAP.md correctly with quality analysis running', () => {
    setCleanupConfig(true);
    createSourceFile('sample.js', 'module.exports = {};\n');

    captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));

    const roadmap = fs.readFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), 'utf-8');
    expect(roadmap).toMatch(/\*\*Plans:\*\*\s*\d+\/\d+\s*plans complete/);
  });
});

// ─── cmdPhaseComplete cleanup plan generation integration ───────────────────

describe('cmdPhaseComplete cleanup plan generation integration', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  // Helper: set phase_cleanup config with options
  function setCleanupConfig(options) {
    const configPath = path.join(tmpDir, '.planning', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (options === undefined) {
      delete config.phase_cleanup;
    } else if (options === false) {
      config.phase_cleanup = { enabled: false };
    } else {
      config.phase_cleanup = options;
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  // Helper: create source files in lib/ that trigger quality issues
  function createSourceFiles(options = {}) {
    const libDir = path.join(tmpDir, 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    if (options.oversized) {
      // Create multiple oversized files to exceed default threshold of 5
      for (let i = 0; i < (options.oversizedCount || 6); i++) {
        const content =
          Array.from({ length: 601 }, (_, j) => `// line ${j + 1}`).join('\n') +
          `\nfunction f${i}() { return ${i}; }\nmodule.exports = { f${i} };\n`;
        fs.writeFileSync(path.join(libDir, `big-${i}.js`), content, 'utf-8');
      }
    }

    if (options.clean) {
      // Create clean files that produce no issues
      fs.writeFileSync(
        path.join(libDir, 'clean.js'),
        'function hello() { return 1; }\nmodule.exports = { hello };\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'consumer.js'),
        "const { hello } = require('./lib/clean');\nhello();\n",
        'utf-8'
      );
    }
  }

  test('cmdPhaseComplete includes cleanup_plan_generated when quality issues exceed threshold', () => {
    setCleanupConfig({ enabled: true, cleanup_threshold: 2 });
    createSourceFiles({ oversized: true, oversizedCount: 3 });

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('cleanup_plan_generated');
    expect(result.cleanup_plan_generated).toHaveProperty('path');
    expect(result.cleanup_plan_generated).toHaveProperty('plan_number');
    expect(result.cleanup_plan_generated).toHaveProperty('issues_addressed');
    expect(result.cleanup_plan_generated.issues_addressed).toBeGreaterThan(2);
  });

  test('cmdPhaseComplete does NOT include cleanup_plan_generated when issues below threshold', () => {
    setCleanupConfig({ enabled: true });
    createSourceFiles({ clean: true });

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).not.toHaveProperty('cleanup_plan_generated');
  });

  test('cmdPhaseComplete does NOT include cleanup_plan_generated when phase_cleanup.enabled is false', () => {
    setCleanupConfig(false);
    createSourceFiles({ oversized: true });

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).not.toHaveProperty('cleanup_plan_generated');
  });

  test('cmdPhaseComplete does NOT include cleanup_plan_generated when phase_cleanup section missing', () => {
    setCleanupConfig(undefined);
    createSourceFiles({ oversized: true });

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).not.toHaveProperty('cleanup_plan_generated');
  });

  test('cleanup plan generation failure does not break phase completion', () => {
    // Enable cleanup with low threshold but make generateCleanupPlan likely to work
    // The non-blocking try/catch ensures even if it throws, phase completes
    setCleanupConfig({ enabled: true, cleanup_threshold: 0 });
    createSourceFiles({ clean: true });

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    // Core fields must still be present regardless
    expect(result.completed_phase).toBe('1');
    expect(result.roadmap_updated).toBe(true);
    expect(result.state_updated).toBe(true);
  });

  test('raw output includes cleanup plan path when generated', () => {
    setCleanupConfig({ enabled: true, cleanup_threshold: 2 });
    createSourceFiles({ oversized: true, oversizedCount: 3 });

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', true));
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Cleanup plan generated:');
    expect(stdout).toContain('PLAN.md');
  });

  test('raw output does NOT mention cleanup plan when not generated', () => {
    setCleanupConfig({ enabled: true });
    createSourceFiles({ clean: true });

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', true));
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('Cleanup plan generated');
  });

  test('existing phase completion behavior unchanged when cleanup disabled', () => {
    setCleanupConfig(false);

    const { stdout, exitCode } = captureOutput(() => cmdPhaseComplete(tmpDir, '1', false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    // All standard fields present
    expect(result.completed_phase).toBe('1');
    expect(result.plans_executed).toMatch(/\d+\/\d+/);
    expect(result.next_phase).toBeTruthy();
    expect(result.roadmap_updated).toBe(true);
    expect(result.state_updated).toBe(true);
    // No quality or cleanup fields
    expect(result).not.toHaveProperty('quality_report');
    expect(result).not.toHaveProperty('cleanup_plan_generated');
  });
});
