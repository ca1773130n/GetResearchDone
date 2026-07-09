'use strict';
const path = require('path');
const fs = require('fs');
const {
  cmdHarnessConversion,
  _computeConversion,
  _classifyPath,
  _parseEvidenceLessons,
  _parseDeadEnds,
  _median,
} = require('../../../lib/commands/harness-conversion');
const { captureOutput } = require('../../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../../helpers/fixtures');

interface ExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Write one synthetic round record (RECORD.json + optional evidence.md / patch.json). */
function writeRound(
  dir: string,
  id: string,
  record: Record<string, unknown>,
  opts: { evidence?: string; patch?: Record<string, unknown> } = {}
): void {
  const d = path.join(dir, '.planning', 'harness', 'rounds', id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'RECORD.json'), JSON.stringify({ round_id: id, ...record }, null, 2));
  if (opts.evidence !== undefined) fs.writeFileSync(path.join(d, 'evidence.md'), opts.evidence);
  if (opts.patch !== undefined) {
    fs.writeFileSync(path.join(d, 'patch.json'), JSON.stringify(opts.patch, null, 2));
  }
}

const A = 'SessionTakeaway:session-aaa:1111';
const B = 'SessionTakeaway:session-bbb:2222';
const C = 'SessionTakeaway:session-ccc:3333';
const E = 'SessionTakeaway:session-eee:5555';

/** Populate the full synthetic timeline used by the scenario tests. */
function buildScenario(fixtureDir: string): void {
  writeRound(fixtureDir, '20260601-000000',
    { status: 'evaluated', created_at: '2026-06-01T00:00:00Z' },
    { evidence: `# Session evidence\n\n- **takeaway** (${A}): set thresholds via complexity\n- **insight** (${B}): record parity risks\n` });
  writeRound(fixtureDir, '20260602-000000',
    { status: 'skipped', created_at: '2026-06-02T00:00:00Z' });
  writeRound(fixtureDir, '20260603-000000',
    { status: 'applied', applied_sha: 'abc123', created_at: '2026-06-03T00:00:00Z' },
    {
      evidence: `# Session evidence\n\n- **takeaway** (${A}): set thresholds via complexity\n- **decision** (${C}): prefer argv spawning\n`,
      patch: {
        round_id: '20260603-000000',
        summary: 'threshold discipline for hypothesizer',
        confidence: 0.7,
        entries: [
          { path: 'agents/grd-x.md', kind: 'markdown', op: 'modify', content: '---\ndescription: x\n---\n',
            rationale: 'avoids the bad-idea dead end recurring', evidence_refs: [A] },
          { path: '.planning/GENOME.md', kind: 'markdown', op: 'modify', content: '# g',
            rationale: 'record it', evidence_refs: [B] },
        ],
      },
    });
  writeRound(fixtureDir, '20260604-000000',
    { status: 'applied', applied_sha: 'def456', created_at: '2026-06-04T00:00:00Z' },
    {
      patch: {
        round_id: '20260604-000000',
        summary: 'code tweak',
        confidence: 0.8,
        entries: [
          { path: 'lib/foo.ts', kind: 'code', op: 'modify', content: 'x',
            rationale: 'fix', evidence_refs: [E] },
        ],
      },
    });
  writeRound(fixtureDir, '20260605-000000',
    { status: 'evaluated', created_at: '2026-06-05T00:00:00Z' },
    {
      patch: {
        round_id: '20260605-000000',
        summary: 'pending review',
        confidence: 0.5,
        entries: [
          { path: 'lib/bar.ts', kind: 'code', op: 'modify', content: 'y',
            rationale: 'proposed only', evidence_refs: [C] },
        ],
      },
    });
  fs.mkdirSync(path.join(fixtureDir, '.planning'), { recursive: true });
  fs.writeFileSync(path.join(fixtureDir, '.planning', 'DEAD-ENDS.md'),
    '# Falsified approaches\n\n## bad-idea\n\n```yaml\nslug: bad-idea\nhypothesis: "nope"\ndate: 2026-05-24\n```\n\n## never-cited\n\n```yaml\nslug: never-cited\ndate: 2026-05-20\n```\n');
}

const gitOk = (calls?: string[][]) => (args: string[], _cwd: string): ExecResult => {
  if (calls) calls.push(args);
  return { status: 0, stdout: '', stderr: '' };
};

describe('harness conversion command', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  describe('_classifyPath', () => {
    test('classifies harness policy, memory, and code paths', () => {
      expect(_classifyPath('.planning/config.json')).toBe('config');
      expect(_classifyPath('./.planning/config.json')).toBe('config');
      expect(_classifyPath('.planning/GENOME.md')).toBe('memory');
      expect(_classifyPath('.planning/DEAD-ENDS.md')).toBe('memory');
      expect(_classifyPath('commands/plan-phase.md')).toBe('prompt');
      expect(_classifyPath('agents/grd-planner.md')).toBe('prompt');
      expect(_classifyPath('skills/foo/SKILL.md')).toBe('prompt');
      expect(_classifyPath('hooks/pre.sh')).toBe('prompt');
      expect(_classifyPath('lib/scheduler.ts')).toBe('scheduler');
      expect(_classifyPath('lib/scheduler-wait.ts')).toBe('scheduler');
      expect(_classifyPath('lib/utils.ts')).toBe('code');
      expect(_classifyPath('bin/gd.ts')).toBe('code');
    });
  });

  describe('_parseEvidenceLessons', () => {
    test('parses kind/source/content lines and ignores prose', () => {
      const md = '# Session evidence\n\n- **takeaway** (Src:1): learned a thing\n- **insight** (Src:2): another\nnot a lesson line\n- malformed **x**\n';
      const lessons = _parseEvidenceLessons(md);
      expect(lessons).toEqual([
        { kind: 'takeaway', source: 'Src:1', content: 'learned a thing' },
        { kind: 'insight', source: 'Src:2', content: 'another' },
      ]);
    });
  });

  describe('_parseDeadEnds', () => {
    test('parses slug and date from yaml blocks only', () => {
      const md = '# reg\n\n```yaml\nslug: one\ndate: 2026-01-02\n```\n\n```json\n{"slug": "not-yaml"}\n```\n\n```yaml\nslug: "two"\n```\n';
      expect(_parseDeadEnds(md)).toEqual([
        { slug: 'one', date: '2026-01-02' },
        { slug: 'two', date: '' },
      ]);
    });
  });

  describe('_median', () => {
    test('handles empty, odd, and even inputs', () => {
      expect(_median([])).toBeNull();
      expect(_median([3])).toBe(3);
      expect(_median([5, 1, 3])).toBe(3);
      expect(_median([0, 1])).toBe(0.5);
    });
  });

  test('degrades gracefully with 0 rounds recorded', () => {
    const report = _computeConversion(fixtureDir, { execGit: gitOk() });
    expect(report.rounds_total).toBe(0);
    expect(report.lessons_total).toBe(0);
    expect(report.conversion_rate).toBeNull();
    expect(report.median_latency_rounds).toBeNull();
    expect(report.events).toEqual([]);
    expect(report.dead_ends).toEqual({ total: 0, converted: 0, events: [] });

    const { stdout, exitCode } = captureOutput(() => {
      cmdHarnessConversion(fixtureDir, true, { execGit: gitOk() });
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('0 rounds recorded');
  });

  test('computes conversion events, rates, and latencies from synthetic rounds', () => {
    buildScenario(fixtureDir);
    const gitCalls: string[][] = [];
    const report = _computeConversion(fixtureDir, { execGit: gitOk(gitCalls) });

    expect(report.rounds_total).toBe(5);
    expect(report.rounds_live).toBe(4);
    expect(report.rounds_applied).toBe(2);

    // lessons: A, B, C from evidence.md + E surfaced via an applied patch ref
    expect(report.lessons_total).toBe(4);
    expect(report.lessons_converted).toBe(2);
    expect(report.conversion_rate).toBe(0.5);
    expect(report.median_latency_rounds).toBe(0.5); // latencies [1, 0]

    const eventA = report.events.find((e: { lesson: string }) => e.lesson === A);
    expect(eventA).toMatchObject({
      kind: 'takeaway',
      recorded_round: '20260601-000000',
      converted_round: '20260603-000000',
      latency_rounds: 1, // skipped round in between does not inflate latency
      latency_days: 2,
      paths: ['agents/grd-x.md'],
      harness_policy: true,
      policy_classes: ['prompt'],
      recurring: true, // seen in two rounds' evidence
      in_head: true,
    });

    const eventE = report.events.find((e: { lesson: string }) => e.lesson === E);
    expect(eventE).toMatchObject({
      kind: 'unknown',
      recorded_round: '20260604-000000',
      converted_round: '20260604-000000',
      latency_rounds: 0,
      harness_policy: false,
      policy_classes: [],
      recurring: false,
    });

    expect(report.harness_policy).toEqual({ count: 1, recurring_count: 1 });

    // git verification ran once per applied round, argv-style
    expect(gitCalls).toEqual([
      ['merge-base', '--is-ancestor', 'abc123', 'HEAD'],
      ['merge-base', '--is-ancestor', 'def456', 'HEAD'],
    ]);
  });

  test('memory-only patches record but do not convert; unapplied references are flagged', () => {
    buildScenario(fixtureDir);
    const report = _computeConversion(fixtureDir, { execGit: gitOk() });

    const unconverted = report.top_unconverted.map((u: { lesson: string }) => u.lesson);
    expect(unconverted).toEqual([B, C]); // same seen_count → ordered by first-seen round

    const lessonB = report.top_unconverted[0];
    expect(lessonB).toMatchObject({
      kind: 'insight',
      seen_count: 1,
      first_seen_round: '20260601-000000',
      patch_referenced: true, // applied patch touched only .planning/GENOME.md for B
    });
    const lessonC = report.top_unconverted[1];
    expect(lessonC).toMatchObject({
      kind: 'decision',
      first_seen_round: '20260603-000000',
      patch_referenced: true, // referenced only by the evaluated (never-applied) round
    });
  });

  test('dead-end slugs cited by applied patches convert with day latency', () => {
    buildScenario(fixtureDir);
    const report = _computeConversion(fixtureDir, { execGit: gitOk() });

    expect(report.dead_ends.total).toBe(2);
    expect(report.dead_ends.converted).toBe(1);
    expect(report.dead_ends.events).toEqual([
      { slug: 'bad-idea', converted_round: '20260603-000000', latency_days: 10, in_head: true },
    ]);
  });

  test('flags applied rounds whose sha is not in HEAD and tolerates git failure', () => {
    buildScenario(fixtureDir);
    const notInHead = (_args: string[], _cwd: string): ExecResult =>
      ({ status: 1, stdout: '', stderr: '' });
    let report = _computeConversion(fixtureDir, { execGit: notInHead });
    expect(report.events.every((e: { in_head: boolean | null }) => e.in_head === false)).toBe(true);

    const gitBroken = (_args: string[], _cwd: string): ExecResult => {
      throw new Error('no git');
    };
    report = _computeConversion(fixtureDir, { execGit: gitBroken });
    expect(report.events.every((e: { in_head: boolean | null }) => e.in_head === null)).toBe(true);
    expect(report.lessons_converted).toBe(2); // verification failure never blocks the audit
  });

  test('ignores round dirs with unreadable RECORD.json', () => {
    buildScenario(fixtureDir);
    const d = path.join(fixtureDir, '.planning', 'harness', 'rounds', '20260606-000000');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'RECORD.json'), '{not json');
    const report = _computeConversion(fixtureDir, { execGit: gitOk() });
    expect(report.rounds_total).toBe(5);
  });

  test('cmdHarnessConversion emits JSON by default and human text with --raw', () => {
    buildScenario(fixtureDir);

    const json = captureOutput(() => {
      cmdHarnessConversion(fixtureDir, false, { execGit: gitOk() });
    });
    expect(json.exitCode).toBe(0);
    const parsed = JSON.parse(json.stdout);
    expect(parsed.rounds_total).toBe(5);
    expect(parsed.conversion_rate).toBe(0.5);
    expect(parsed.events).toHaveLength(2);

    const raw = captureOutput(() => {
      cmdHarnessConversion(fixtureDir, true, { execGit: gitOk() });
    });
    expect(raw.stdout).toContain('5 round(s), 4 live, 2 applied');
    expect(raw.stdout).toContain('4 seen · 2 converted (50.0%)');
    expect(raw.stdout).toContain('median latency 0.5 round(s)');
    expect(raw.stdout).toContain('harness-policy conversions: 1 (1 recurring)');
    expect(raw.stdout).toContain('dead-ends: 2 recorded · 1 converted');
    expect(raw.stdout).toContain('converted:');
    expect(raw.stdout).toContain('top unconverted lessons:');
    expect(raw.stdout).toContain('[patch-referenced]');
    expect(raw.stdout).toContain('bad-idea → 20260603-000000 after 10d');
  });

  test('raw output marks conversions whose commit is not in HEAD', () => {
    buildScenario(fixtureDir);
    const notInHead = (_args: string[], _cwd: string): ExecResult =>
      ({ status: 1, stdout: '', stderr: '' });
    const { stdout } = captureOutput(() => {
      cmdHarnessConversion(fixtureDir, true, { execGit: notInHead });
    });
    expect(stdout).toContain('NOT-IN-HEAD');
  });
});
