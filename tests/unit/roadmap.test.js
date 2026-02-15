/**
 * Unit tests for lib/roadmap.js
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
  let fixtureDir;

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
    const phase1 = schedule.phases.find((p) => p.number === '1');
    expect(phase1).toBeDefined();
    expect(phase1.start_date).toBe('2026-01-15');
    // Duration is 2d, so due_date = start + (2-1) = 2026-01-16
    expect(phase1.due_date).toBe('2026-01-16');
  });

  test('second phase starts after first phase ends', () => {
    const schedule = computeSchedule(fixtureDir);
    const phase2 = schedule.phases.find((p) => p.number === '2');
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
  let schedule;

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
  let schedule;

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
  let fixtureDir;

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
  let fixtureDir;

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
  let fixtureDir;

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
});
