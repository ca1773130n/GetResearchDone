/**
 * Unit tests for lib/roadmap.ts
 *
 * Tests schedule helpers, roadmap parsing, and command-level functions.
 */

const path = require('path');
const fs = require('fs');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  formatScheduleDate,
  addDays,
  computeSchedule,
  getScheduleForPhase,
  getScheduleForMilestone,
  cmdRoadmapGetPhase,
  cmdPhaseNextDecimal,
  cmdRoadmapAnalyze,
} = require('../../lib/roadmap');

// ─── formatScheduleDate ─────────────────────────────────────────────────────

describe('formatScheduleDate', () => {
  test('formats Date object to YYYY-MM-DD', () => {
    const date = new Date('2026-01-15T00:00:00');
    expect(formatScheduleDate(date)).toBe('2026-01-15');
  });

  test('pads single-digit months and days', () => {
    const date = new Date('2026-03-05T00:00:00');
    expect(formatScheduleDate(date)).toBe('2026-03-05');
  });

  test('handles December correctly', () => {
    const date = new Date('2026-12-31T00:00:00');
    expect(formatScheduleDate(date)).toBe('2026-12-31');
  });

  test('handles January 1st', () => {
    const date = new Date('2027-01-01T00:00:00');
    expect(formatScheduleDate(date)).toBe('2027-01-01');
  });
});

// ─── addDays ────────────────────────────────────────────────────────────────

describe('addDays', () => {
  test('adds days to a date', () => {
    const date = new Date('2026-01-15T00:00:00');
    const result = addDays(date, 5);
    expect(formatScheduleDate(result)).toBe('2026-01-20');
  });

  test('handles month boundary', () => {
    const date = new Date('2026-01-30T00:00:00');
    const result = addDays(date, 3);
    expect(formatScheduleDate(result)).toBe('2026-02-02');
  });

  test('handles year boundary', () => {
    const date = new Date('2026-12-30T00:00:00');
    const result = addDays(date, 5);
    expect(formatScheduleDate(result)).toBe('2027-01-04');
  });

  test('does not mutate original date', () => {
    const date = new Date('2026-01-15T00:00:00');
    addDays(date, 10);
    expect(formatScheduleDate(date)).toBe('2026-01-15');
  });

  test('handles zero days', () => {
    const date = new Date('2026-06-15T00:00:00');
    const result = addDays(date, 0);
    expect(formatScheduleDate(result)).toBe('2026-06-15');
  });
});

// ─── computeSchedule ────────────────────────────────────────────────────────

describe('computeSchedule', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('computes schedule from fixture ROADMAP.md', () => {
    const schedule = computeSchedule(fixtureDir);
    expect(schedule.milestones).toBeDefined();
    expect(schedule.phases).toBeDefined();
    // Fixture has "## M1 v1.0: Foundation" -> 1 milestone
    expect(schedule.milestones.length).toBeGreaterThanOrEqual(1);
    expect(schedule.phases.length).toBeGreaterThanOrEqual(2);
  });

  test('phases have start_date and due_date when milestone has start date', () => {
    const schedule = computeSchedule(fixtureDir);
    const phase1 = schedule.phases.find((p: Record<string, unknown>) => p.number === '1');
    expect(phase1).toBeDefined();
    expect(phase1.start_date).toBe('2026-01-15');
    // Duration is 2d, so due_date = start + (2-1) = 2026-01-16
    expect(phase1.due_date).toBe('2026-01-16');
  });

  test('second phase starts after first phase ends', () => {
    const schedule = computeSchedule(fixtureDir);
    const phase2 = schedule.phases.find((p: Record<string, unknown>) => p.number === '2');
    expect(phase2).toBeDefined();
    // Phase 1 ends 2026-01-16, phase 2 starts 2026-01-17
    expect(phase2.start_date).toBe('2026-01-17');
  });

  test('returns empty schedule for missing roadmap', () => {
    const schedule = computeSchedule('/tmp/nonexistent-dir-12345');
    expect(schedule.milestones).toEqual([]);
    expect(schedule.phases).toEqual([]);
  });
});

// ─── getScheduleForPhase / getScheduleForMilestone ──────────────────────────

describe('getScheduleForPhase', () => {
  let schedule: any; // computeSchedule result with deep property access

  beforeAll(() => {
    const fixtureDir = createFixtureDir();
    schedule = computeSchedule(fixtureDir);
    cleanupFixtureDir(fixtureDir);
  });

  test('returns correct phase by number', () => {
    const phase = getScheduleForPhase(schedule, '1');
    expect(phase).toBeDefined();
    expect(phase.name).toContain('Test Phase');
  });

  test('returns null for nonexistent phase', () => {
    const phase = getScheduleForPhase(schedule, '99');
    expect(phase).toBeNull();
  });
});

describe('getScheduleForMilestone', () => {
  let schedule: any; // computeSchedule result with deep property access

  beforeAll(() => {
    const fixtureDir = createFixtureDir();
    schedule = computeSchedule(fixtureDir);
    cleanupFixtureDir(fixtureDir);
  });

  test('returns milestone by version', () => {
    const ms = getScheduleForMilestone(schedule, 'v1.0');
    expect(ms).toBeDefined();
    expect(ms.version).toBe('v1.0');
  });

  test('returns null for nonexistent milestone', () => {
    const ms = getScheduleForMilestone(schedule, 'v99.0');
    expect(ms).toBeNull();
  });
});

// ─── cmdRoadmapGetPhase ─────────────────────────────────────────────────────

describe('cmdRoadmapGetPhase', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns phase details for existing phase', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRoadmapGetPhase(fixtureDir, '1', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.found).toBe(true);
    expect(parsed.phase_number).toBe('1');
    expect(parsed.phase_name).toContain('Test Phase');
  });

  test('returns found: false for nonexistent phase', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRoadmapGetPhase(fixtureDir, '99', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.found).toBe(false);
  });
});

// ─── cmdPhaseNextDecimal ────────────────────────────────────────────────────

describe('cmdPhaseNextDecimal', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('computes next decimal for existing base phase', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseNextDecimal(fixtureDir, '01', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.next).toBe('01.1');
    expect(parsed.base_phase).toBe('01');
  });

  test('handles non-existent phases directory gracefully', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdPhaseNextDecimal('/tmp/nonexistent-dir-12345', '05', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.next).toBe('05.1');
  });
});

// ─── cmdRoadmapAnalyze ──────────────────────────────────────────────────────

describe('cmdRoadmapAnalyze', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns analysis with phase count and milestones', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRoadmapAnalyze(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.phase_count).toBeGreaterThanOrEqual(2);
    expect(parsed.phases).toBeInstanceOf(Array);
    expect(parsed.total_plans).toBeGreaterThanOrEqual(1);
  });

  test('phases include disk_status', () => {
    const { stdout } = captureOutput(() => {
      cmdRoadmapAnalyze(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    for (const phase of parsed.phases) {
      expect(phase).toHaveProperty('disk_status');
    }
  });

  test('handles missing ROADMAP.md', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdRoadmapAnalyze('/tmp/nonexistent-dir-12345', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toContain('not found');
  });

  test('logs to stderr when phase directory scan fails with non-ENOENT error', () => {
    const localDir = createFixtureDir();
    // Replace the phases directory with a regular file to trigger ENOTDIR
    const phasesDir = path.join(localDir, '.planning', 'milestones', 'anonymous', 'phases');
    fs.rmSync(phasesDir, { recursive: true });
    fs.writeFileSync(phasesDir, 'not a directory');

    const stderrSpy = (jest.spyOn(process.stderr, 'write') as jest.SpyInstance).mockImplementation(() => {});
    try {
      captureOutput(() => cmdRoadmapAnalyze(localDir, false));
      const stderrOutput = stderrSpy.mock.calls.map((c) => c[0]).join('');
      expect(stderrOutput).toContain('[roadmap]');
    } finally {
      stderrSpy.mockRestore();
      cleanupFixtureDir(localDir);
    }
  });

  test('parses depends_on with colon outside bold markers', () => {
    const tmpDir = createFixtureDir();
    const roadmap = [
      '# Project Roadmap',
      '## Milestone v1.0: Test',
      '**Start:** 2026-01-01',
      '**Target:** 2026-06-01',
      '',
      '### Phase 1: First',
      '**Goal:** Do first thing',
      '**Depends on**: Nothing',
      '',
      '### Phase 2: Second',
      '**Goal:** Do second thing',
      '**Depends on**: Phase 1',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const { stdout } = captureOutput(() => {
      cmdRoadmapAnalyze(tmpDir, false);
    });
    const parsed = JSON.parse(stdout);
    const phase2 = parsed.phases.find((p: Record<string, unknown>) => p.number === '2');
    expect(phase2.depends_on).toBe('Phase 1');
    cleanupFixtureDir(tmpDir);
  });
});

// ─── Multi-milestone: shipped sections are stripped ──────────────────────────

describe('multi-milestone shipped sections', () => {
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
    '**Goal:** Old goal',
    '**Duration:** 5d',
    '',
    '### Phase 2: Old Build',
    '**Goal:** Old build goal',
    '**Duration:** 3d',
    '',
    '</details>',
    '',
    '## M1 v0.2.0: Active Milestone',
    '**Start:** 2026-02-01',
    '',
    '### Phase 29: New Work',
    '**Goal:** Build new things',
    '**Duration:** 7d',
    '',
    '### Phase 30: Final Work',
    '**Goal:** Ship it',
    '**Duration:** 5d',
  ].join('\n');

  test('computeSchedule only finds active milestone phases', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      MULTI_MILESTONE_ROADMAP,
      'utf-8'
    );
    const schedule = computeSchedule(tmpDir);
    const phaseNumbers = schedule.phases.map((p: Record<string, unknown>) => p.number);
    expect(phaseNumbers).toContain('29');
    expect(phaseNumbers).toContain('30');
    expect(phaseNumbers).not.toContain('1');
    expect(phaseNumbers).not.toContain('2');
  });

  test('computeSchedule finds active milestone version', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      MULTI_MILESTONE_ROADMAP,
      'utf-8'
    );
    const schedule = computeSchedule(tmpDir);
    const versions = schedule.milestones.map((m: Record<string, unknown>) => m.version);
    expect(versions).toContain('v0.2.0');
    expect(versions).not.toContain('v0.0.5');
  });

  test('cmdRoadmapGetPhase finds active phase, not shipped', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      MULTI_MILESTONE_ROADMAP,
      'utf-8'
    );
    const { stdout } = captureOutput(() => {
      cmdRoadmapGetPhase(tmpDir, '29', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.found).toBe(true);
    expect(parsed.phase_name).toContain('New Work');
  });

  test('cmdRoadmapGetPhase does not find shipped phase', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      MULTI_MILESTONE_ROADMAP,
      'utf-8'
    );
    const { stdout } = captureOutput(() => {
      cmdRoadmapGetPhase(tmpDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.found).toBe(false);
  });

  test('cmdRoadmapAnalyze only reports active phases', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      MULTI_MILESTONE_ROADMAP,
      'utf-8'
    );
    const { stdout } = captureOutput(() => {
      cmdRoadmapAnalyze(tmpDir, false);
    });
    const parsed = JSON.parse(stdout);
    const phaseNumbers = parsed.phases.map((p: Record<string, unknown>) => p.number);
    expect(phaseNumbers).toContain('29');
    expect(phaseNumbers).toContain('30');
    expect(phaseNumbers).not.toContain('1');
    expect(phaseNumbers).not.toContain('2');
  });

  test('cmdRoadmapAnalyze only reports active milestones', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'ROADMAP.md'),
      MULTI_MILESTONE_ROADMAP,
      'utf-8'
    );
    const { stdout } = captureOutput(() => {
      cmdRoadmapAnalyze(tmpDir, false);
    });
    const parsed = JSON.parse(stdout);
    const versions = parsed.milestones.map((m: Record<string, unknown>) => m.version);
    expect(versions).toContain('v0.2.0');
    expect(versions).not.toContain('v0.0.5');
  });
});

// ─── BUG-48-002: Goal regex handles both **Goal:** and **Goal**: ────────────

describe('BUG-48-002: goal regex both formats', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('cmdRoadmapGetPhase extracts goal with colon outside bold (**Goal**:)', () => {
    const roadmap = [
      '# Project Roadmap',
      '## Milestone v1.0: Test',
      '**Start:** 2026-01-01',
      '',
      '### Phase 1: First',
      '**Goal**: Build the foundation',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const { stdout } = captureOutput(() => {
      cmdRoadmapGetPhase(tmpDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.found).toBe(true);
    expect(parsed.goal).toBe('Build the foundation');
  });

  test('cmdRoadmapGetPhase extracts goal with colon inside bold (**Goal:**)', () => {
    const roadmap = [
      '# Project Roadmap',
      '## Milestone v1.0: Test',
      '**Start:** 2026-01-01',
      '',
      '### Phase 1: First',
      '**Goal:** Build the foundation',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const { stdout } = captureOutput(() => {
      cmdRoadmapGetPhase(tmpDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.found).toBe(true);
    expect(parsed.goal).toBe('Build the foundation');
  });

  test('cmdRoadmapGetPhase returns null goal when no goal line', () => {
    const roadmap = [
      '# Project Roadmap',
      '## Milestone v1.0: Test',
      '**Start:** 2026-01-01',
      '',
      '### Phase 1: First',
      '**Type:** implement',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const { stdout } = captureOutput(() => {
      cmdRoadmapGetPhase(tmpDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.found).toBe(true);
    expect(parsed.goal).toBeNull();
  });

  test('cmdRoadmapAnalyze extracts goal with colon outside bold', () => {
    const roadmap = [
      '# Project Roadmap',
      '## Milestone v1.0: Test',
      '**Start:** 2026-01-01',
      '',
      '### Phase 1: First',
      '**Goal**: Build the foundation',
      '',
      '### Phase 2: Second',
      '**Goal:** Ship it',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const { stdout } = captureOutput(() => {
      cmdRoadmapAnalyze(tmpDir, false);
    });
    const parsed = JSON.parse(stdout);
    const phase1 = parsed.phases.find((p: Record<string, unknown>) => p.number === '1');
    const phase2 = parsed.phases.find((p: Record<string, unknown>) => p.number === '2');
    expect(phase1.goal).toBe('Build the foundation');
    expect(phase2.goal).toBe('Ship it');
  });

  test('phases include line number of their heading in ROADMAP.md', () => {
    const tmpDir = createFixtureDir();
    const roadmap = [
      '# Project Roadmap',
      '## Milestone v1.0: Test',
      '**Start:** 2026-01-01',
      '',
      '### Phase 1: Alpha',
      '**Goal:** First goal',
      '',
      '### Phase 2: Beta',
      '**Goal:** Second goal',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const { stdout } = captureOutput(() => {
      cmdRoadmapAnalyze(tmpDir, false);
    });
    const parsed = JSON.parse(stdout);
    const phase1 = parsed.phases.find((p: Record<string, unknown>) => p.number === '1');
    const phase2 = parsed.phases.find((p: Record<string, unknown>) => p.number === '2');
    expect(phase1).toHaveProperty('line');
    expect(typeof phase1.line).toBe('number');
    expect(phase1.line).toBeGreaterThan(0);
    // Phase 2 heading is on a later line than Phase 1
    expect(phase2.line).toBeGreaterThan(phase1.line);
  });

  test('phases with missing goal include a warning', () => {
    const tmpDir = createFixtureDir();
    const roadmap = [
      '# Project Roadmap',
      '## Milestone v1.0: Test',
      '**Start:** 2026-01-01',
      '',
      '### Phase 1: No Goal Here',
      '',
      '### Phase 2: Has Goal',
      '**Goal:** Properly specified',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const { stdout } = captureOutput(() => {
      cmdRoadmapAnalyze(tmpDir, false);
    });
    const parsed = JSON.parse(stdout);
    const phase1 = parsed.phases.find((p: Record<string, unknown>) => p.number === '1');
    const phase2 = parsed.phases.find((p: Record<string, unknown>) => p.number === '2');
    expect(phase1.warnings).toBeInstanceOf(Array);
    expect(phase1.warnings.length).toBeGreaterThan(0);
    expect(phase1.warnings[0]).toMatch(/goal/i);
    expect(phase1.warnings[0]).toContain(String(phase1.line));
    // Phase with goal should have no warnings
    expect(phase2.warnings).toEqual([]);
  });
});

// ─── Branch coverage additions ───────────────────────────────────────────────

describe('cmdRoadmapGetPhase edge cases', () => {
  test('returns found:false error when ROADMAP.md does not exist', () => {
    const tmpDir = fs.mkdtempSync(require('os').tmpdir() + '/grd-roadmap-');
    try {
      const { stdout, exitCode } = captureOutput(() => {
        cmdRoadmapGetPhase(tmpDir, '1', false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.found).toBe(false);
      expect(parsed.error).toMatch(/not found/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('cmdPhaseNextDecimal with existing decimal phases', () => {
  test('returns next decimal after existing ones', () => {
    const tmpDir = fs.mkdtempSync(require('os').tmpdir() + '/grd-decimal-');
    try {
      const phasesDir = require('path').join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases');
      fs.mkdirSync(phasesDir, { recursive: true });
      fs.mkdirSync(require('path').join(phasesDir, '01-base'));
      fs.mkdirSync(require('path').join(phasesDir, '01.1-sub'));
      fs.mkdirSync(require('path').join(phasesDir, '01.2-sub2'));
      const { stdout, exitCode } = captureOutput(() => {
        cmdPhaseNextDecimal(tmpDir, '01', false);
      });
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.next).toBe('01.3');
      expect(parsed.existing).toHaveLength(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('computeSchedule with mcp_atlassian default_duration_days', () => {
  test('uses default_duration_days from config when set', () => {
    const tmpDir = createFixtureDir();
    try {
      // Write config with mcp_atlassian.default_duration_days
      const configPath = require('path').join(tmpDir, '.planning', 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        tracker: { mcp_atlassian: { default_duration_days: 14 } }
      }), 'utf-8');
      const schedule = computeSchedule(tmpDir);
      // Should still produce a valid schedule object
      expect(schedule).toHaveProperty('phases');
      expect(schedule).toHaveProperty('milestones');
    } finally {
      cleanupFixtureDir(tmpDir);
    }
  });
});

describe('analyzeRoadmap phase disk statuses', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(require('os').tmpdir() + '/grd-analyze-');
    fs.mkdirSync(require('path').join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('phase with only research file gets researched status', () => {
    const roadmap = [
      '# Project Roadmap',
      '## Milestone v1.0: Test',
      '**Start:** 2026-01-01',
      '',
      '### Phase 1: Research Phase',
      '**Goal:** Do research',
      '',
    ].join('\n');
    fs.writeFileSync(require('path').join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const phasesDir = require('path').join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    const phaseDir = require('path').join(phasesDir, '01-research-phase');
    fs.mkdirSync(phaseDir);
    fs.writeFileSync(require('path').join(phaseDir, '01-RESEARCH.md'), '# Research');
    const { stdout } = captureOutput(() => cmdRoadmapAnalyze(tmpDir, false));
    const parsed = JSON.parse(stdout);
    const phase1 = parsed.phases.find((p: Record<string, unknown>) => p.number === '1');
    expect(phase1.disk_status).toBe('researched');
  });

  test('phase with only context file gets discussed status', () => {
    const roadmap = [
      '# Project Roadmap',
      '## Milestone v1.0: Test',
      '**Start:** 2026-01-01',
      '',
      '### Phase 1: Context Phase',
      '**Goal:** Discuss context',
      '',
    ].join('\n');
    fs.writeFileSync(require('path').join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const phasesDir = require('path').join(tmpDir, '.planning', 'milestones', 'v1.0', 'phases');
    fs.mkdirSync(phasesDir, { recursive: true });
    const phaseDir = require('path').join(phasesDir, '01-context-phase');
    fs.mkdirSync(phaseDir);
    fs.writeFileSync(require('path').join(phaseDir, '01-CONTEXT.md'), '# Context');
    const { stdout } = captureOutput(() => cmdRoadmapAnalyze(tmpDir, false));
    const parsed = JSON.parse(stdout);
    const phase1 = parsed.phases.find((p: Record<string, unknown>) => p.number === '1');
    expect(phase1.disk_status).toBe('discussed');
  });

  test('phase with no start_date milestone gets null dates', () => {
    const roadmap = [
      '# Project Roadmap',
      '## Milestone v1.0: Test',
      '',
      '### Phase 1: Undated Phase',
      '**Goal:** No date',
      '',
    ].join('\n');
    fs.writeFileSync(require('path').join(tmpDir, '.planning', 'ROADMAP.md'), roadmap);
    const { stdout } = captureOutput(() => cmdRoadmapAnalyze(tmpDir, false));
    const parsed = JSON.parse(stdout);
    const phase1 = parsed.phases.find((p: Record<string, unknown>) => p.number === '1');
    expect(phase1.start_date).toBeNull();
    expect(phase1.due_date).toBeNull();
  });
});
