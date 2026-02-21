/**
 * Unit tests for lib/paths.js
 *
 * Tests centralized path resolution: currentMilestone, milestonesDir, phasesDir,
 * phaseDir, researchDir, codebaseDir, todosDir, quickDir, archivedPhasesDir.
 *
 * Tests both the new-style paths (when milestone directory exists) and the
 * backward-compatible fallback (when milestone directory does not exist).
 *
 * Uses isolated temp directories with controlled STATE.md content.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  currentMilestone,
  milestonesDir,
  phasesDir,
  phaseDir,
  researchDir,
  codebaseDir,
  todosDir,
  quickDir,
  archivedPhasesDir,
  standardsDir,
} = require('../../lib/paths');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create an isolated temp directory for testing.
 * Optionally writes a STATE.md with the given content.
 */
function makeTmpDir(stateContent) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-paths-test-'));
  if (stateContent !== undefined) {
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(path.join(planningDir, 'STATE.md'), stateContent, 'utf-8');
  }
  return tmpDir;
}

/**
 * Create a temp directory with STATE.md AND the milestone directory on disk,
 * so that the fallback logic resolves to new-style paths.
 */
function makeTmpDirWithMilestone(stateContent, milestone) {
  const tmpDir = makeTmpDir(stateContent);
  const milestoneRoot = path.join(tmpDir, '.planning', 'milestones', milestone);
  fs.mkdirSync(milestoneRoot, { recursive: true });
  return tmpDir;
}

function cleanTmpDir(dir) {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ─── currentMilestone ─────────────────────────────────────────────────────────

describe('currentMilestone', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanTmpDir(tmpDir);
    tmpDir = null;
  });

  test('returns version string when STATE.md has Milestone field', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Hierarchical Planning Directory\n');
    expect(currentMilestone(tmpDir)).toBe('v0.2.1');
  });

  test('extracts only the version portion, not the full description', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v1.0.0 — Some Long Milestone Name\n');
    expect(currentMilestone(tmpDir)).toBe('v1.0.0');
  });

  test('returns anonymous when STATE.md does not exist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-paths-test-'));
    // No .planning/ directory at all
    expect(currentMilestone(tmpDir)).toBe('anonymous');
  });

  test('returns anonymous when STATE.md exists but has no Milestone field', () => {
    tmpDir = makeTmpDir('# State\n\n- **Active phase:** Phase 1\n');
    expect(currentMilestone(tmpDir)).toBe('anonymous');
  });

  test('returns anonymous when Milestone field value is empty', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:**\n');
    expect(currentMilestone(tmpDir)).toBe('anonymous');
  });

  test('returns anonymous when Milestone field value is just whitespace', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:**   \n');
    expect(currentMilestone(tmpDir)).toBe('anonymous');
  });

  test('handles v1.0 format', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v1.0 — Foundation\n');
    expect(currentMilestone(tmpDir)).toBe('v1.0');
  });

  test('handles v0.2.1 format', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Name\n');
    expect(currentMilestone(tmpDir)).toBe('v0.2.1');
  });

  test('handles v10.20.30 format', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v10.20.30 — Big Version\n');
    expect(currentMilestone(tmpDir)).toBe('v10.20.30');
  });

  test('returns anonymous when Milestone field has text but no version', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** some-text-no-version\n');
    expect(currentMilestone(tmpDir)).toBe('anonymous');
  });
});

// ─── milestonesDir ────────────────────────────────────────────────────────────

describe('milestonesDir', () => {
  test('returns .planning/milestones under cwd', () => {
    expect(milestonesDir('/project')).toBe(path.join('/project', '.planning', 'milestones'));
  });

  test('does not depend on filesystem state', () => {
    const nonExistent = path.join(os.tmpdir(), 'grd-paths-nonexistent-' + Date.now());
    expect(milestonesDir(nonExistent)).toBe(path.join(nonExistent, '.planning', 'milestones'));
  });
});

// ─── phasesDir ────────────────────────────────────────────────────────────────

describe('phasesDir', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanTmpDir(tmpDir);
    tmpDir = null;
  });

  test('with explicit milestone falls back to old-style when milestone dir does not exist', () => {
    // /project does not exist on disk, so fallback kicks in
    expect(phasesDir('/project', 'v0.2.1')).toBe(path.join('/project', '.planning', 'phases'));
  });

  test('with explicit milestone returns new-style when milestone dir exists', () => {
    tmpDir = makeTmpDirWithMilestone('# State\n\n- **Milestone:** v0.2.1 — Test\n', 'v0.2.1');
    expect(phasesDir(tmpDir, 'v0.2.1')).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'phases')
    );
  });

  test('with milestone omitted falls back when milestone dir does not exist', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(phasesDir(tmpDir)).toBe(path.join(tmpDir, '.planning', 'phases'));
  });

  test('with milestone omitted returns new-style when milestone dir exists', () => {
    tmpDir = makeTmpDirWithMilestone('# State\n\n- **Milestone:** v0.2.1 — Test\n', 'v0.2.1');
    expect(phasesDir(tmpDir)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'phases')
    );
  });

  test('with null milestone falls back when milestone dir does not exist', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v1.0 — Null Test\n');
    expect(phasesDir(tmpDir, null)).toBe(path.join(tmpDir, '.planning', 'phases'));
  });

  test('with anonymous milestone falls back when milestone dir does not exist', () => {
    // /project does not exist on disk, so fallback kicks in
    expect(phasesDir('/project', 'anonymous')).toBe(path.join('/project', '.planning', 'phases'));
  });
});

// ─── phaseDir ─────────────────────────────────────────────────────────────────

describe('phaseDir', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanTmpDir(tmpDir);
    tmpDir = null;
  });

  test('with all args falls back to old-style when milestone dir does not exist', () => {
    expect(phaseDir('/project', 'v0.2.1', '32-centralized-path-resolution-module')).toBe(
      path.join('/project', '.planning', 'phases', '32-centralized-path-resolution-module')
    );
  });

  test('with all args returns new-style when milestone dir exists', () => {
    tmpDir = makeTmpDirWithMilestone('# State\n\n- **Milestone:** v0.2.1 — Test\n', 'v0.2.1');
    expect(phaseDir(tmpDir, 'v0.2.1', '32-centralized-path-resolution-module')).toBe(
      path.join(
        tmpDir,
        '.planning',
        'milestones',
        'v0.2.1',
        'phases',
        '32-centralized-path-resolution-module'
      )
    );
  });

  test('with milestone omitted falls back when milestone dir does not exist', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(phaseDir(tmpDir, undefined, '01-setup')).toBe(
      path.join(tmpDir, '.planning', 'phases', '01-setup')
    );
  });

  test('with null milestone falls back when milestone dir does not exist', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(phaseDir(tmpDir, null, '01-setup')).toBe(
      path.join(tmpDir, '.planning', 'phases', '01-setup')
    );
  });
});

// ─── researchDir ──────────────────────────────────────────────────────────────

describe('researchDir', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanTmpDir(tmpDir);
    tmpDir = null;
  });

  test('with explicit milestone falls back to old-style when milestone dir does not exist', () => {
    expect(researchDir('/project', 'v0.2.1')).toBe(path.join('/project', '.planning', 'research'));
  });

  test('with explicit milestone returns new-style when milestone dir exists', () => {
    tmpDir = makeTmpDirWithMilestone('# State\n\n- **Milestone:** v0.2.1 — Test\n', 'v0.2.1');
    expect(researchDir(tmpDir, 'v0.2.1')).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'research')
    );
  });

  test('with milestone omitted falls back when milestone dir does not exist', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(researchDir(tmpDir)).toBe(path.join(tmpDir, '.planning', 'research'));
  });
});

// ─── codebaseDir ──────────────────────────────────────────────────────────────

describe('codebaseDir', () => {
  test('always returns project-level .planning/codebase/', () => {
    expect(codebaseDir('/project')).toBe(path.join('/project', '.planning', 'codebase'));
  });

  test('ignores milestone existence — always project-level', () => {
    const tmpDir = makeTmpDirWithMilestone('# State\n\n- **Milestone:** v0.2.1 — Test\n', 'v0.2.1');
    try {
      expect(codebaseDir(tmpDir)).toBe(path.join(tmpDir, '.planning', 'codebase'));
    } finally {
      cleanTmpDir(tmpDir);
    }
  });
});

// ─── todosDir ─────────────────────────────────────────────────────────────────

describe('todosDir', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanTmpDir(tmpDir);
    tmpDir = null;
  });

  test('with explicit milestone falls back to old-style when milestone dir does not exist', () => {
    expect(todosDir('/project', 'v0.2.1')).toBe(path.join('/project', '.planning', 'todos'));
  });

  test('with explicit milestone returns new-style when milestone dir exists', () => {
    tmpDir = makeTmpDirWithMilestone('# State\n\n- **Milestone:** v0.2.1 — Test\n', 'v0.2.1');
    expect(todosDir(tmpDir, 'v0.2.1')).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'todos')
    );
  });

  test('with milestone omitted falls back when milestone dir does not exist', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(todosDir(tmpDir)).toBe(path.join(tmpDir, '.planning', 'todos'));
  });
});

// ─── quickDir ─────────────────────────────────────────────────────────────────

describe('quickDir', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanTmpDir(tmpDir);
    tmpDir = null;
  });

  test('falls back to old-style when milestone dir does not exist on disk', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(quickDir(tmpDir)).toBe(path.join(tmpDir, '.planning', 'quick'));
  });

  test('returns new-style when milestone dir exists on disk', () => {
    tmpDir = makeTmpDirWithMilestone('# State\n\n- **Milestone:** v0.2.1 — Test\n', 'v0.2.1');
    expect(quickDir(tmpDir)).toBe(path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'quick'));
  });

  test('accepts an optional milestone parameter', () => {
    tmpDir = makeTmpDirWithMilestone('# State\n\n- **Milestone:** v0.2.1 — Test\n', 'v1.0');
    expect(quickDir(tmpDir, 'v1.0')).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'quick')
    );
  });

  test('uses anonymous when currentMilestone returns anonymous', () => {
    // No STATE.md → currentMilestone returns 'anonymous'
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-paths-test-'));
    // anonymous dir does not exist on disk, so falls back
    expect(quickDir(tmpDir)).toBe(path.join(tmpDir, '.planning', 'quick'));

    // Now create the anonymous milestone dir
    const anonDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous');
    fs.mkdirSync(anonDir, { recursive: true });
    expect(quickDir(tmpDir)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'quick')
    );
  });
});

// ─── standardsDir ─────────────────────────────────────────────────────────────

describe('standardsDir', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanTmpDir(tmpDir);
    tmpDir = null;
  });

  test('with explicit milestone returns new-style when milestone dir exists', () => {
    tmpDir = makeTmpDirWithMilestone('# State\n\n- **Milestone:** v0.2.1 — Test\n', 'v0.2.1');
    expect(standardsDir(tmpDir, 'v0.2.1')).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'standards')
    );
  });

  test('with explicit milestone falls back to old-style when milestone dir does not exist', () => {
    expect(standardsDir('/project', 'v0.2.1')).toBe(
      path.join('/project', '.planning', 'standards')
    );
  });

  test('with milestone omitted uses currentMilestone and falls back when dir does not exist', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(standardsDir(tmpDir)).toBe(path.join(tmpDir, '.planning', 'standards'));
  });

  test('with milestone omitted uses currentMilestone and returns new-style when dir exists', () => {
    tmpDir = makeTmpDirWithMilestone('# State\n\n- **Milestone:** v0.2.1 — Test\n', 'v0.2.1');
    expect(standardsDir(tmpDir)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'standards')
    );
  });

  test('with null milestone defaults to currentMilestone', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v1.0 — Null Test\n');
    expect(standardsDir(tmpDir, null)).toBe(path.join(tmpDir, '.planning', 'standards'));
  });
});

// ─── archivedPhasesDir ────────────────────────────────────────────────────────

describe('archivedPhasesDir', () => {
  test('returns version-phases path for v0.1.6', () => {
    expect(archivedPhasesDir('/project', 'v0.1.6')).toBe(
      path.join('/project', '.planning', 'milestones', 'v0.1.6-phases')
    );
  });

  test('returns version-phases path for v0.2.0', () => {
    expect(archivedPhasesDir('/project', 'v0.2.0')).toBe(
      path.join('/project', '.planning', 'milestones', 'v0.2.0-phases')
    );
  });

  test('works with any version string', () => {
    expect(archivedPhasesDir('/project', 'v10.20.30')).toBe(
      path.join('/project', '.planning', 'milestones', 'v10.20.30-phases')
    );
  });
});
