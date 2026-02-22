/**
 * Unit tests for lib/paths.js
 *
 * Tests centralized path resolution: currentMilestone, milestonesDir, phasesDir,
 * phaseDir, researchDir, codebaseDir, todosDir, quickDir, archivedPhasesDir,
 * standardsDir.
 *
 * All directory functions always return milestone-scoped paths — no fallback.
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

  test('BUG-48-001: handles space-separated name without dash', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.7 Self-Evolution\n');
    expect(currentMilestone(tmpDir)).toBe('v0.2.7');
  });

  test('BUG-48-001: handles v0.0.5 format with long name', () => {
    tmpDir = makeTmpDir(
      '# State\n\n- **Milestone:** v0.0.5 Production-Ready R&D Workflow Automation\n'
    );
    expect(currentMilestone(tmpDir)).toBe('v0.0.5');
  });

  test('BUG-48-001: returns Milestone field version even when other version strings exist', () => {
    const content = [
      '# State',
      '',
      '## Milestones',
      '- v0.0.5 shipped',
      '- v0.1.0 shipped',
      '',
      '## Current Position',
      '- **Milestone:** v0.2.7 Self-Evolution',
    ].join('\n');
    tmpDir = makeTmpDir(content);
    expect(currentMilestone(tmpDir)).toBe('v0.2.7');
  });

  test('BUG-48-001: handles v1.0.0 Initial Release format', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v1.0.0 Initial Release\n');
    expect(currentMilestone(tmpDir)).toBe('v1.0.0');
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

  test('with explicit milestone always returns milestone-scoped path', () => {
    expect(phasesDir('/project', 'v0.2.1')).toBe(
      path.join('/project', '.planning', 'milestones', 'v0.2.1', 'phases')
    );
  });

  test('with milestone omitted reads from STATE.md', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(phasesDir(tmpDir)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'phases')
    );
  });

  test('with null milestone reads from STATE.md', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v1.0 — Null Test\n');
    expect(phasesDir(tmpDir, null)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases')
    );
  });

  test('with anonymous milestone returns anonymous-scoped path', () => {
    expect(phasesDir('/project', 'anonymous')).toBe(
      path.join('/project', '.planning', 'milestones', 'anonymous', 'phases')
    );
  });

  test('does not require milestone dir to exist on disk', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    // No milestone dir on disk — still returns milestone-scoped path
    expect(phasesDir(tmpDir)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'phases')
    );
  });
});

// ─── phaseDir ─────────────────────────────────────────────────────────────────

describe('phaseDir', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanTmpDir(tmpDir);
    tmpDir = null;
  });

  test('with all args returns milestone-scoped path', () => {
    expect(phaseDir('/project', 'v0.2.1', '32-centralized-path-resolution-module')).toBe(
      path.join(
        '/project',
        '.planning',
        'milestones',
        'v0.2.1',
        'phases',
        '32-centralized-path-resolution-module'
      )
    );
  });

  test('with milestone omitted reads from STATE.md', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(phaseDir(tmpDir, undefined, '01-setup')).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'phases', '01-setup')
    );
  });

  test('with null milestone reads from STATE.md', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(phaseDir(tmpDir, null, '01-setup')).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'phases', '01-setup')
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

  test('with explicit milestone returns milestone-scoped path', () => {
    expect(researchDir('/project', 'v0.2.1')).toBe(
      path.join('/project', '.planning', 'milestones', 'v0.2.1', 'research')
    );
  });

  test('with milestone omitted reads from STATE.md', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(researchDir(tmpDir)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'research')
    );
  });
});

// ─── codebaseDir ──────────────────────────────────────────────────────────────

describe('codebaseDir', () => {
  test('always returns project-level .planning/codebase/', () => {
    expect(codebaseDir('/project')).toBe(path.join('/project', '.planning', 'codebase'));
  });

  test('ignores milestone existence — always project-level', () => {
    const tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
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

  test('with explicit milestone returns milestone-scoped path', () => {
    expect(todosDir('/project', 'v0.2.1')).toBe(
      path.join('/project', '.planning', 'milestones', 'v0.2.1', 'todos')
    );
  });

  test('with milestone omitted reads from STATE.md', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(todosDir(tmpDir)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'todos')
    );
  });
});

// ─── quickDir ─────────────────────────────────────────────────────────────────

describe('quickDir', () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) cleanTmpDir(tmpDir);
    tmpDir = null;
  });

  test('returns milestone-scoped path even when milestone dir does not exist', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(quickDir(tmpDir)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'quick')
    );
  });

  test('accepts an optional milestone parameter', () => {
    expect(quickDir('/project', 'v1.0')).toBe(
      path.join('/project', '.planning', 'milestones', 'v1.0', 'quick')
    );
  });

  test('uses anonymous when currentMilestone returns anonymous', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-paths-test-'));
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

  test('with explicit milestone returns milestone-scoped path', () => {
    expect(standardsDir('/project', 'v0.2.1')).toBe(
      path.join('/project', '.planning', 'milestones', 'v0.2.1', 'standards')
    );
  });

  test('with milestone omitted reads from STATE.md', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v0.2.1 — Test\n');
    expect(standardsDir(tmpDir)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v0.2.1', 'standards')
    );
  });

  test('with null milestone defaults to currentMilestone', () => {
    tmpDir = makeTmpDir('# State\n\n- **Milestone:** v1.0 — Null Test\n');
    expect(standardsDir(tmpDir, null)).toBe(
      path.join(tmpDir, '.planning', 'milestones', 'v1.0', 'standards')
    );
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
