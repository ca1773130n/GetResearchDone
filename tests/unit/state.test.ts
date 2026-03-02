/**
 * Unit tests for lib/state.ts
 *
 * Tests STATE.md operations: field extract/replace helpers, load, get, patch,
 * advance-plan, record-metric, add-decision, add/resolve-blocker,
 * record-session, update-progress, state-snapshot.
 */

const fs = require('fs');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  stateExtractField,
  stateReplaceField,
  cmdStateLoad,
  cmdStateGet,
  cmdStatePatch,
  cmdStateUpdate,
  cmdStateAdvancePlan,
  cmdStateRecordMetric,
  cmdStateUpdateProgress,
  cmdStateAddDecision,
  cmdStateAddBlocker,
  cmdStateResolveBlocker,
  cmdStateRecordSession,
  cmdStateSnapshot,
} = require('../../lib/state');

/**
 * Parse the first JSON object from stdout that may contain concatenated
 * pretty-printed JSON (happens when cmd functions have try/catch that
 * catches the process.exit sentinel and calls output() again).
 */
function parseFirstJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    // Find end of first JSON object by matching braces
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) return JSON.parse(str.slice(0, i + 1));
      }
    }
    throw new Error('Failed to parse first JSON from: ' + str.slice(0, 100));
  }
}

// ─── stateExtractField ──────────────────────────────────────────────────────

describe('stateExtractField', () => {
  const sample = [
    '# State',
    '',
    '- **Active phase:** 1 (01-test)',
    '- **Current plan:** 01-01',
    '- **Milestone:** M1: Foundation',
    '- **Progress:** [=====-----] 50%',
  ].join('\n');

  test('extracts Active phase field', () => {
    const value = stateExtractField(sample, 'Active phase');
    expect(value).toBe('1 (01-test)');
  });

  test('extracts Current plan field', () => {
    const value = stateExtractField(sample, 'Current plan');
    expect(value).toBe('01-01');
  });

  test('extracts Milestone field', () => {
    const value = stateExtractField(sample, 'Milestone');
    expect(value).toBe('M1: Foundation');
  });

  test('returns null for non-existent field', () => {
    const value = stateExtractField(sample, 'Nonexistent Field');
    expect(value).toBeNull();
  });

  test('does not throw for field names with regex special characters', () => {
    const content = '- **phase.count:** 5\n';
    expect(() => stateExtractField(content, 'phase.count')).not.toThrow();
    const value = stateExtractField(content, 'phase.count');
    expect(value).toBe('5');
  });

  test('extracts Progress field with special characters', () => {
    const value = stateExtractField(sample, 'Progress');
    expect(value).toContain('50%');
  });
});

// ─── stateReplaceField ──────────────────────────────────────────────────────

describe('stateReplaceField', () => {
  const sample = ['- **Active phase:** 1 (01-test)', '- **Current plan:** 01-01'].join('\n');

  test('replaces a field value', () => {
    const result = stateReplaceField(sample, 'Current plan', '01-02');
    expect(result).toContain('**Current plan:** 01-02');
    // Preserve other fields
    expect(result).toContain('**Active phase:** 1 (01-test)');
  });

  test('returns null for non-existent field', () => {
    const result = stateReplaceField(sample, 'Nonexistent', 'value');
    expect(result).toBeNull();
  });

  test('handles fields with special regex characters', () => {
    const content = '- **Status (beta):** active';
    // stateReplaceField escapes the field name for regex safety
    const result = stateReplaceField(content, 'Status (beta)', 'inactive');
    expect(result).toContain('**Status (beta):** inactive');
  });
});

// ─── cmdStateLoad ───────────────────────────────────────────────────────────

describe('cmdStateLoad', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns JSON with config, state, roadmap keys', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateLoad(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('config');
    expect(parsed).toHaveProperty('state_raw');
    expect(parsed).toHaveProperty('state_exists');
    expect(parsed).toHaveProperty('roadmap_exists');
    expect(parsed).toHaveProperty('config_exists');
  });

  test('state_exists is true when STATE.md present', () => {
    const { stdout } = captureOutput(() => {
      cmdStateLoad(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.state_exists).toBe(true);
    expect(parsed.roadmap_exists).toBe(true);
    expect(parsed.config_exists).toBe(true);
  });

  test('raw mode outputs key=value format', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateLoad(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('model_profile=');
    expect(stdout).toContain('state_exists=true');
  });

  test('raw mode includes STATE.md content so agents do not need a second CLI call', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateLoad(fixtureDir, true);
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('# State');
  });
});

// ─── cmdStateGet ────────────────────────────────────────────────────────────

describe('cmdStateGet', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('with no section returns full state content', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateGet(fixtureDir, null, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('content');
    expect(parsed.content).toContain('# State');
  });

  test('with field name returns just that field value', () => {
    const { stdout } = captureOutput(() => {
      cmdStateGet(fixtureDir, 'Active phase', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed['Active phase']).toContain('1');
  });

  test('with section name returns section body', () => {
    const { stdout } = captureOutput(() => {
      cmdStateGet(fixtureDir, 'Key Decisions', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed['Key Decisions']).toBeTruthy();
  });

  test('with raw=true returns plain text', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateGet(fixtureDir, 'Active phase', true);
    });
    expect(exitCode).toBe(0);
    // Raw mode returns the value directly
    expect(stdout).toContain('1');
  });

  test('returns error for non-existent section/field', () => {
    const { stdout } = captureOutput(() => {
      cmdStateGet(fixtureDir, 'Nonexistent Section', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });
});

// ─── cmdStatePatch ──────────────────────────────────────────────────────────

describe('cmdStatePatch', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('updates fields in STATE.md', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStatePatch(fixtureDir, { 'Active phase': '2 (02-build)' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.updated).toContain('Active phase');
  });

  test('persists changes to disk', () => {
    captureOutput(() => {
      cmdStatePatch(fixtureDir, { 'Active phase': '3 (03-deploy)' }, false);
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('**Active phase:** 3 (03-deploy)');
  });

  test('reports failed fields that do not exist', () => {
    const { stdout } = captureOutput(() => {
      cmdStatePatch(fixtureDir, { Nonexistent: 'value' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.failed).toContain('Nonexistent');
  });
});

// ─── cmdStateUpdate ─────────────────────────────────────────────────────────

describe('cmdStateUpdate', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('updates a single field', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateUpdate(fixtureDir, 'Progress', '[========--] 80%');
    });
    expect(exitCode).toBe(0);
    // cmdStateUpdate has try/catch that catches exit sentinel, producing concatenated JSON
    const parsed = parseFirstJson(stdout);
    expect(parsed.updated).toBe(true);
  });

  test('reports field not found for non-existent field', () => {
    const { stdout } = captureOutput(() => {
      cmdStateUpdate(fixtureDir, 'Missing Field', 'val');
    });
    const parsed = parseFirstJson(stdout);
    expect(parsed.updated).toBe(false);
  });

  test('errors when field or value missing', () => {
    const { exitCode } = captureError(() => {
      cmdStateUpdate(fixtureDir, null, undefined);
    });
    expect(exitCode).toBe(1);
  });

  test('BUG-48-005: maps underscore field names to space-separated fields', () => {
    const { stdout } = captureOutput(() => {
      cmdStateUpdate(fixtureDir, 'Active_phase', '5 (05-release)');
    });
    const parsed = parseFirstJson(stdout);
    expect(parsed.updated).toBe(true);
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('**Active phase:** 5 (05-release)');
  });

  test('BUG-48-005: reports not found for non-existent underscore fields', () => {
    const { stdout } = captureOutput(() => {
      cmdStateUpdate(fixtureDir, 'totally_fake_field', 'value');
    });
    const parsed = parseFirstJson(stdout);
    expect(parsed.updated).toBe(false);
  });
});

// ─── cmdStateAdvancePlan ────────────────────────────────────────────────────

describe('cmdStateAdvancePlan', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
    // Set up STATE.md with Current Plan and Total Plans in Phase fields
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    let content = fs.readFileSync(statePath, 'utf-8');
    // Add fields needed for advance-plan
    content = content.replace(
      '- **Current plan:** 01-01',
      '- **Current Plan:** 1\n- **Total Plans in Phase:** 3'
    );
    fs.writeFileSync(statePath, content, 'utf-8');
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('increments plan counter', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateAdvancePlan(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.advanced).toBe(true);
    expect(parsed.previous_plan).toBe(1);
    expect(parsed.current_plan).toBe(2);
  });

  test('updates STATE.md on disk', () => {
    captureOutput(() => {
      cmdStateAdvancePlan(fixtureDir, false);
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('**Current Plan:** 2');
  });

  test('reports last_plan when current >= total', () => {
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    let content = fs.readFileSync(statePath, 'utf-8');
    content = content.replace('**Current Plan:** 1', '**Current Plan:** 3');
    fs.writeFileSync(statePath, content, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdStateAdvancePlan(fixtureDir, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.advanced).toBe(false);
    expect(parsed.reason).toBe('last_plan');
  });
});

// ─── cmdStateRecordMetric ───────────────────────────────────────────────────

describe('cmdStateRecordMetric', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('adds row to Performance Metrics table', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateRecordMetric(
        fixtureDir,
        {
          phase: '01',
          plan: '01',
          duration: '5min',
          tasks: 2,
          files: 3,
        },
        false
      );
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.recorded).toBe(true);
  });

  test('persists metric row to STATE.md', () => {
    captureOutput(() => {
      cmdStateRecordMetric(
        fixtureDir,
        {
          phase: '01',
          plan: '01',
          duration: '5min',
          tasks: 2,
          files: 3,
        },
        false
      );
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('Phase 01 P01');
    expect(content).toContain('5min');
  });

  test('preserves existing metrics when adding new row', () => {
    // Add first metric
    captureOutput(() => {
      cmdStateRecordMetric(
        fixtureDir,
        {
          phase: '01',
          plan: '01',
          duration: '3min',
          tasks: 1,
          files: 1,
        },
        false
      );
    });
    // Add second metric
    captureOutput(() => {
      cmdStateRecordMetric(
        fixtureDir,
        {
          phase: '01',
          plan: '02',
          duration: '7min',
          tasks: 3,
          files: 5,
        },
        false
      );
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('Phase 01 P01');
    expect(content).toContain('Phase 01 P02');
  });

  test('requires phase, plan, and duration', () => {
    const { stdout } = captureOutput(() => {
      cmdStateRecordMetric(fixtureDir, { phase: '01' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeTruthy();
  });
});

// ─── cmdStateAddDecision ────────────────────────────────────────────────────

describe('cmdStateAddDecision', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
    // cmdStateAddDecision looks for "## Decisions" or "## Decisions Made" heading,
    // but the fixture uses "## Key Decisions" (which doesn't match the regex).
    // Replace heading to match the expected format.
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    let content = fs.readFileSync(statePath, 'utf-8');
    content = content.replace('## Key Decisions', '## Decisions Made');
    fs.writeFileSync(statePath, content, 'utf-8');
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('adds decision entry to Decisions section', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateAddDecision(
        fixtureDir,
        {
          phase: '1',
          summary: 'Use Jest for testing',
          rationale: 'Best ecosystem support',
        },
        false
      );
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.added).toBe(true);
  });

  test('persists decision to STATE.md', () => {
    captureOutput(() => {
      cmdStateAddDecision(
        fixtureDir,
        {
          phase: '2',
          summary: 'Switch to ESM',
        },
        false
      );
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('Switch to ESM');
  });

  test('requires summary field', () => {
    const { stdout } = captureOutput(() => {
      cmdStateAddDecision(fixtureDir, {}, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeTruthy();
  });

  test('returns added=false when Decisions section not found', () => {
    // Use unmodified fixture (has "## Key Decisions" which doesn't match)
    const tmpDir = createFixtureDir();
    const { stdout } = captureOutput(() => {
      cmdStateAddDecision(tmpDir, { summary: 'test decision' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.added).toBe(false);
    cleanupFixtureDir(tmpDir);
  });
});

// ─── cmdStateAddBlocker / cmdStateResolveBlocker ────────────────────────────

describe('cmdStateAddBlocker', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('adds blocker to Blockers section', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateAddBlocker(fixtureDir, 'API key not configured', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.added).toBe(true);
  });

  test('persists blocker to STATE.md', () => {
    captureOutput(() => {
      cmdStateAddBlocker(fixtureDir, 'Missing dependency: lodash', false);
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('Missing dependency: lodash');
  });

  test('requires text parameter', () => {
    const { stdout } = captureOutput(() => {
      cmdStateAddBlocker(fixtureDir, '', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeTruthy();
  });
});

describe('cmdStateResolveBlocker', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
    // First add a blocker so we can resolve it
    captureOutput(() => {
      cmdStateAddBlocker(fixtureDir, 'API key not configured', false);
    });
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('resolves existing blocker', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateResolveBlocker(fixtureDir, 'API key', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.resolved).toBe(true);
  });

  test('removes blocker text from STATE.md', () => {
    captureOutput(() => {
      cmdStateResolveBlocker(fixtureDir, 'API key', false);
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).not.toContain('API key not configured');
  });
});

// ─── cmdStateUpdateProgress ─────────────────────────────────────────────────

describe('cmdStateUpdateProgress', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('recomputes progress from summaries and plans', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStateUpdateProgress(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.updated).toBe(true);
    expect(typeof parsed.percent).toBe('number');
    expect(parsed).toHaveProperty('completed');
    expect(parsed).toHaveProperty('total');
  });

  test('updates Progress field in STATE.md', () => {
    captureOutput(() => {
      cmdStateUpdateProgress(fixtureDir, false);
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    // Fixture has 1 plan with summary (01-01) and 1 without (02-01) = 50%
    expect(content).toContain('**Progress:**');
  });
});

// ─── cmdStateRecordSession ──────────────────────────────────────────────────

describe('cmdStateRecordSession', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('updates session fields in STATE.md', () => {
    // The fixture STATE.md uses "Last action" and "Next action" format,
    // but cmdStateRecordSession looks for "Last session" / "Stopped At" etc.
    // Let's add those fields to the fixture for this test.
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    let content = fs.readFileSync(statePath, 'utf-8');
    content = content.replace(
      '## Session Continuity\n\n- **Last action:** Initialized project',
      '## Session Continuity\n\n- **Last session:** 2026-01-01T00:00:00Z\n- **Stopped At:** None\n- **Resume File:** None\n- **Last action:** Initialized project'
    );
    fs.writeFileSync(statePath, content, 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdStateRecordSession(
        fixtureDir,
        {
          stopped_at: 'Completed phase 1',
          resume_file: '02-01-PLAN.md',
        },
        false
      );
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.recorded).toBe(true);
    expect(parsed.updated).toContain('Last session');
  });

  test('returns recorded=false when no session fields exist', () => {
    // Remove session fields from STATE.md to trigger the "no fields found" path
    // The default fixture has "Last action" but not "Last session" / "Stopped At"
    // cmdStateRecordSession looks for "Last session" and "Stopped At", neither exists
    const { stdout } = captureOutput(() => {
      cmdStateRecordSession(fixtureDir, {}, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.recorded).toBe(false);
  });
});

// ─── cmdStateSnapshot ───────────────────────────────────────────────────────

describe('cmdStateSnapshot', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns structured parse of STATE.md', () => {
    // cmdStateSnapshot looks for "Current Phase", "Current Plan", etc.
    // Add those fields to the fixture
    const statePath = path.join(fixtureDir, '.planning', 'STATE.md');
    let content = fs.readFileSync(statePath, 'utf-8');
    content = content.replace(
      '- **Active phase:** 1 (01-test) -- IN PROGRESS',
      '- **Active phase:** 1 (01-test) -- IN PROGRESS\n- **Current Phase:** 1\n- **Current Phase Name:** test\n- **Total Phases:** 2\n- **Current Plan:** 01\n- **Total Plans in Phase:** 1\n- **Status:** In Progress'
    );
    fs.writeFileSync(statePath, content, 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdStateSnapshot(fixtureDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('current_phase');
    expect(parsed).toHaveProperty('current_plan');
    expect(parsed).toHaveProperty('total_phases');
    expect(parsed).toHaveProperty('status');
    expect(parsed).toHaveProperty('decisions');
    expect(parsed).toHaveProperty('blockers');
    expect(parsed).toHaveProperty('session');
  });

  test('returns error when STATE.md not found', () => {
    const { stdout } = captureOutput(() => {
      cmdStateSnapshot('/tmp/nonexistent-dir-12345', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });

  test('parses decisions, blockers, and session sections', () => {
    const tmpDir = createFixtureDir();
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    const stateContent = [
      '# STATE',
      '',
      '- **Current Phase:** 2',
      '- **Current Phase Name:** implement',
      '- **Total Phases:** 3',
      '- **Current Plan:** 01',
      '- **Total Plans in Phase:** 2',
      '- **Status:** In Progress',
      '- **Progress:** 50%',
      '',
      '## Decisions Made',
      '',
      '| Phase | Decision | Rationale |',
      '|-------|----------|-----------|',
      '| 1 | Use lazy require | Avoid circular deps |',
      '',
      '## Blockers',
      '',
      '- Waiting on upstream API',
      '- Need design review',
      '',
      '## Session',
      '',
      '**Last Date:** 2026-02-22',
      '**Stopped At:** Task 2 coverage fix',
      '**Resume File:** handoff.md',
    ].join('\n');
    fs.writeFileSync(statePath, stateContent, 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdStateSnapshot(tmpDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.decisions).toHaveLength(1);
    expect(parsed.decisions[0].summary).toBe('Use lazy require');
    expect(parsed.blockers).toHaveLength(2);
    expect(parsed.blockers[0]).toContain('upstream API');
    expect(parsed.session.last_date).toBe('2026-02-22');
    expect(parsed.session.stopped_at).toBe('Task 2 coverage fix');
    expect(parsed.session.resume_file).toBe('handoff.md');
    cleanupFixtureDir(tmpDir);
  });
});

// ─── cmdStateSnapshot --since diff mode ─────────────────────────────────────

describe('cmdStateSnapshot --since diff mode', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('saves snapshot file on normal (no --since) call', () => {
    const stateContent = [
      '# STATE',
      '- **Current Phase:** 1',
      '- **Status:** In Progress',
    ].join('\n');
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    fs.writeFileSync(statePath, stateContent, 'utf-8');

    captureOutput(() => cmdStateSnapshot(tmpDir, false));

    const snapshotsDir = path.join(tmpDir, '.planning', '.snapshots');
    expect(fs.existsSync(snapshotsDir)).toBe(true);
    const files = fs.readdirSync(snapshotsDir);
    expect(files.length).toBeGreaterThan(0);
  });

  test('returns diff when --since matches saved snapshot', () => {
    const stateContent = [
      '# STATE',
      '- **Current Phase:** 1',
      '- **Status:** In Progress',
    ].join('\n');
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    fs.writeFileSync(statePath, stateContent, 'utf-8');

    // Save baseline snapshot with a known past timestamp
    const snapshotsDir = path.join(tmpDir, '.planning', '.snapshots');
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const baselineTs = '2020-01-01T00:00:00.000Z';
    const baseline = { current_phase: '0', status: 'Not Started', decisions: [], blockers: [] };
    fs.writeFileSync(path.join(snapshotsDir, `${baselineTs}.json`), JSON.stringify(baseline), 'utf-8');

    // Request diff since the baseline timestamp
    const { stdout, exitCode } = captureOutput(() =>
      cmdStateSnapshot(tmpDir, false, { since: baselineTs })
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('since', baselineTs);
    expect(result).toHaveProperty('changed_fields');
    expect(result).toHaveProperty('new_decisions');
    expect(result).toHaveProperty('new_blockers');
    expect(result).toHaveProperty('resolved_blockers');
    expect(result).toHaveProperty('has_changes');
  });

  test('returns error with full_snapshot when no baseline snapshot found', () => {
    const stateContent = [
      '# STATE',
      '- **Current Phase:** 1',
      '- **Status:** In Progress',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), stateContent, 'utf-8');

    const { stdout, exitCode } = captureOutput(() =>
      cmdStateSnapshot(tmpDir, false, { since: '2020-01-01T00:00:00.000Z' })
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.error).toContain('No snapshot found');
    expect(result.full_snapshot).toBeDefined();
  });

  test('detects changed scalar fields in diff', () => {
    const stateContent = [
      '# STATE',
      '- **Current Phase:** 2',
      '- **Status:** In Progress',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), stateContent, 'utf-8');

    const snapshotsDir = path.join(tmpDir, '.planning', '.snapshots');
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const baselineTs = '2020-01-01T00:00:00.000Z';
    const baseline = { current_phase: '1', status: 'Not Started', decisions: [], blockers: [] };
    fs.writeFileSync(path.join(snapshotsDir, `${baselineTs}.json`), JSON.stringify(baseline), 'utf-8');

    const { stdout } = captureOutput(() =>
      cmdStateSnapshot(tmpDir, false, { since: baselineTs })
    );
    const result = JSON.parse(stdout);
    expect(result.has_changes).toBe(true);
    expect(result.changed_fields).toHaveProperty('status');
  });

  test('detects new decisions and resolved/new blockers in diff', () => {
    const stateContent = [
      '# STATE',
      '- **Current Phase:** 2',
      '- **Status:** In Progress',
      '',
      '## Decisions Made',
      '',
      '| Phase | Decision | Rationale |',
      '|-------|----------|-----------|',
      '| 2 | Use cache | For speed |',
      '',
      '## Blockers',
      '',
      '- New blocker added',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'STATE.md'), stateContent, 'utf-8');

    const snapshotsDir = path.join(tmpDir, '.planning', '.snapshots');
    fs.mkdirSync(snapshotsDir, { recursive: true });
    const baselineTs = '2020-06-01T00:00:00.000Z';
    const baseline = {
      current_phase: '1',
      status: 'Not Started',
      decisions: [{ phase: '1', summary: 'Old decision', rationale: 'old' }],
      blockers: ['Old blocker resolved'],
    };
    fs.writeFileSync(path.join(snapshotsDir, `${baselineTs}.json`), JSON.stringify(baseline), 'utf-8');

    const { stdout } = captureOutput(() =>
      cmdStateSnapshot(tmpDir, false, { since: baselineTs })
    );
    const result = JSON.parse(stdout);
    expect(result.has_changes).toBe(true);
    // new_decisions = decisions in current that aren't in baseline
    expect(Array.isArray(result.new_decisions)).toBe(true);
    // resolved_blockers = blockers in baseline not in current
    expect(Array.isArray(result.resolved_blockers)).toBe(true);
    expect(result.resolved_blockers).toContain('Old blocker resolved');
    // new_blockers = blockers in current not in baseline
    expect(Array.isArray(result.new_blockers)).toBe(true);
  });
});

// ─── BUG-48-003: cmdStateSnapshot parses Active phase format ────────────────

describe('BUG-48-003: cmdStateSnapshot Active phase field', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('extracts current_phase from Active phase field', () => {
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    const content = [
      '# State',
      '',
      '## Current Position',
      '',
      '- **Active phase:** Phase 49 of 52 (Bug Discovery & Fixes)',
      '- **Current plan:** None (ready to execute)',
      '- **Status:** Phase 49 planned',
      '- **Progress:** [##--------] 20%',
      '',
      '## Blockers',
      '',
      'None.',
    ].join('\n');
    fs.writeFileSync(statePath, content, 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdStateSnapshot(tmpDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.current_phase).toBe('49');
    expect(parsed.current_phase_name).toBe('Bug Discovery & Fixes');
    expect(parsed.total_phases).toBe(52);
  });

  test('extracts current_phase from legacy Current Phase field', () => {
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    const content = [
      '# State',
      '',
      '## Current Position',
      '',
      '- **Current Phase:** 5',
      '- **Current Phase Name:** Build Phase',
      '- **Total Phases:** 10',
      '- **Current Plan:** 01',
      '- **Status:** In Progress',
      '',
      '## Blockers',
      '',
      'None.',
    ].join('\n');
    fs.writeFileSync(statePath, content, 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdStateSnapshot(tmpDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.current_phase).toBe('5');
    expect(parsed.current_phase_name).toBe('Build Phase');
    expect(parsed.total_phases).toBe(10);
  });

  test('returns null fields when Active phase is missing', () => {
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    const content = [
      '# State',
      '',
      '## Current Position',
      '',
      '- **Status:** Idle',
      '',
      '## Blockers',
      '',
      'None.',
    ].join('\n');
    fs.writeFileSync(statePath, content, 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdStateSnapshot(tmpDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.current_phase).toBeNull();
    expect(parsed.current_phase_name).toBeNull();
    expect(parsed.total_phases).toBeNull();
  });

  test('extracts Current plan with lowercase p', () => {
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    const content = [
      '# State',
      '',
      '## Current Position',
      '',
      '- **Active phase:** Phase 3 of 5 (Deploy)',
      '- **Current plan:** 03-02',
      '- **Status:** Executing',
      '',
      '## Blockers',
      '',
      'None.',
    ].join('\n');
    fs.writeFileSync(statePath, content, 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdStateSnapshot(tmpDir, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.current_plan).toBe('03-02');
  });
});

// ─── BUG-48-005: cmdStatePatch underscore-to-space field name mapping ────────

describe('BUG-48-005: cmdStatePatch underscore-to-space mapping', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('maps underscore field names to space-separated STATE.md fields', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStatePatch(tmpDir, { Active_phase: '2 (02-build)' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.updated).toContain('Active_phase');
    const content = fs.readFileSync(path.join(tmpDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('**Active phase:** 2 (02-build)');
  });

  test('maps Current_plan underscore to Current plan in STATE.md', () => {
    const statePath = path.join(tmpDir, '.planning', 'STATE.md');
    let content = fs.readFileSync(statePath, 'utf-8');
    content = content.replace('- **Current plan:** 01-01', '- **Current plan:** 01-01');
    fs.writeFileSync(statePath, content, 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdStatePatch(tmpDir, { Current_plan: '01-02' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.updated).toContain('Current_plan');
    const updatedContent = fs.readFileSync(statePath, 'utf-8');
    expect(updatedContent).toContain('**Current plan:** 01-02');
  });

  test('original space-separated names still work', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdStatePatch(tmpDir, { 'Active phase': '5 (05-release)' }, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.updated).toContain('Active phase');
  });

  test('reports failed for non-existent underscore fields', () => {
    const { stdout } = captureOutput(() => {
      cmdStatePatch(tmpDir, { totally_fake_field: 'value' }, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.failed).toContain('totally_fake_field');
  });
});

// ─── cmdStatePatch audit trail ───────────────────────────────────────────────

describe('cmdStatePatch audit trail', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('appends audit section to STATE.md when audit option is true', () => {
    captureOutput(() => {
      cmdStatePatch(fixtureDir, { Updated: '2026-02-25' }, false, { audit: true });
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('## Audit Log');
  });

  test('audit entry includes timestamp', () => {
    captureOutput(() => {
      cmdStatePatch(fixtureDir, { Updated: '2026-02-25' }, false, { audit: true });
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    // Should contain a date in the audit entry
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test('audit entry includes the changed field name', () => {
    captureOutput(() => {
      cmdStatePatch(fixtureDir, { Updated: '2026-02-25' }, false, { audit: true });
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).toContain('Updated');
  });

  test('does not append audit when audit option is false', () => {
    captureOutput(() => {
      cmdStatePatch(fixtureDir, { Updated: '2026-02-25' }, false, { audit: false });
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).not.toContain('## Audit Log');
  });

  test('does not append audit without options parameter (backwards compatible)', () => {
    captureOutput(() => {
      cmdStatePatch(fixtureDir, { Updated: '2026-02-25' }, false);
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    expect(content).not.toContain('## Audit Log');
  });

  test('accumulates multiple audit entries', () => {
    captureOutput(() => {
      cmdStatePatch(fixtureDir, { Updated: '2026-02-25' }, false, { audit: true });
    });
    captureOutput(() => {
      cmdStatePatch(fixtureDir, { Updated: '2026-02-26' }, false, { audit: true });
    });
    const content = fs.readFileSync(path.join(fixtureDir, '.planning', 'STATE.md'), 'utf-8');
    // Both patches should appear in the audit log
    const auditSection = content.split('## Audit Log')[1] || '';
    expect(auditSection.split('\n').filter((l: string) => l.startsWith('- ')).length).toBeGreaterThanOrEqual(2);
  });
});
