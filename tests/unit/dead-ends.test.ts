/**
 * Unit tests for lib/dead-ends.ts — the DEAD-ENDS.md write path.
 *
 * Tier-2 #6 (write half). The read path is locked in by
 * tests/unit/context.test.ts and tests/integration/reflection-loop.test.ts.
 * Tests here cover parser round-trip, dedup, status flip, and the
 * cmdDeadEndAdd entry point.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');

const {
  parseDeadEndsFile,
  serializeDeadEndsFile,
  cmdDeadEndAdd,
} = require('../../lib/dead-ends');

// ─── parse + serialize round-trip ──────────────────────────────────────────

describe('parseDeadEndsFile', () => {
  test('parses a single canonical entry', () => {
    const body = [
      '# Dead Ends Registry',
      '',
      '## rope-on-cpu',
      '',
      '```yaml',
      'approach: "Rotary positional embeddings for the CPU encoder"',
      'slug: rope-on-cpu',
      'tried_in_phases: ["02-build"]',
      'verdict: falsified',
      'evidence:',
      '  - "tests/unit/encoder.test.ts:142"',
      '  - "EVAL.md phase 02 — 38% accuracy"',
      'status: active',
      'notes: "Hardware bug"',
      '```',
      '',
    ].join('\n');

    const entries = parseDeadEndsFile(body);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.slug).toBe('rope-on-cpu');
    expect(e.approach).toBe('Rotary positional embeddings for the CPU encoder');
    expect(e.tried_in_phases).toEqual(['02-build']);
    expect(e.evidence).toEqual([
      'tests/unit/encoder.test.ts:142',
      'EVAL.md phase 02 — 38% accuracy',
    ]);
    expect(e.status).toBe('active');
    expect(e.notes).toBe('Hardware bug');
  });

  test('parses multiple entries separated by H2 boundaries', () => {
    const body = [
      '# Dead Ends Registry',
      '',
      '## entry-a',
      '',
      '```yaml',
      'approach: "A"',
      'slug: entry-a',
      'tried_in_phases: ["01"]',
      'verdict: falsified',
      'evidence: []',
      'status: active',
      '```',
      '',
      '## entry-b',
      '',
      '```yaml',
      'approach: "B"',
      'slug: entry-b',
      'tried_in_phases: ["02"]',
      'verdict: falsified',
      'evidence: []',
      'status: reopened',
      '```',
      '',
    ].join('\n');

    const entries = parseDeadEndsFile(body);
    expect(entries).toHaveLength(2);
    expect(entries[0].slug).toBe('entry-a');
    expect(entries[1].slug).toBe('entry-b');
    expect(entries[1].status).toBe('reopened');
  });

  test('returns empty array for content with no fenced blocks', () => {
    expect(parseDeadEndsFile('# Dead Ends Registry\n\nNothing here.')).toEqual([]);
    expect(parseDeadEndsFile('')).toEqual([]);
  });

  test('inline empty arrays parse to empty arrays, not undefined', () => {
    const body = [
      '## empty-arrays',
      '',
      '```yaml',
      'approach: "X"',
      'slug: empty-arrays',
      'tried_in_phases: []',
      'verdict: falsified',
      'evidence: []',
      'status: active',
      '```',
      '',
    ].join('\n');
    const entries = parseDeadEndsFile(body);
    expect(entries[0].tried_in_phases).toEqual([]);
    expect(entries[0].evidence).toEqual([]);
  });
});

describe('serializeDeadEndsFile round-trip', () => {
  test('parse → serialize → parse yields the same entries', () => {
    const original = [
      {
        approach: 'Rotary embeddings',
        slug: 'rotary-embeddings',
        tried_in_phases: ['02-build', '07-retry'],
        verdict: 'falsified',
        evidence: ['file.ts:1', 'eval.md:42'],
        status: 'active' as const,
        notes: 'Try later',
      },
    ];
    const serialized = serializeDeadEndsFile(original);
    const reparsed = parseDeadEndsFile(serialized);
    expect(reparsed).toHaveLength(1);
    expect(reparsed[0]).toEqual(original[0]);
  });

  test('empty list serializes to just the header', () => {
    const serialized = serializeDeadEndsFile([]);
    expect(serialized).toMatch(/# Dead Ends Registry/);
    expect(parseDeadEndsFile(serialized)).toEqual([]);
  });
});

// ─── cmdDeadEndAdd ─────────────────────────────────────────────────────────

describe('cmdDeadEndAdd', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-dead-ends-'));
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('creates DEAD-ENDS.md when file is absent', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdDeadEndAdd(
        tmpDir,
        {
          approach: 'Rotary embeddings on CPU',
          phase: '02-build',
          evidence: ['tests/unit/encoder.test.ts:142'],
        },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.action).toBe('created');
    expect(result.slug).toBe('rotary-embeddings-on-cpu');
    expect(result.total_entries).toBe(1);

    const body = fs.readFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), 'utf-8');
    expect(body).toContain('## rotary-embeddings-on-cpu');
    expect(body).toContain('approach: "Rotary embeddings on CPU"');
    expect(body).toContain('tried_in_phases: ["02-build"]');
    expect(body).toContain('status: active');
  });

  test('updates existing entry with same slug (append phase, flip status)', () => {
    // First call: create
    captureOutput(() =>
      cmdDeadEndAdd(
        tmpDir,
        { approach: 'Approach X', phase: '02', evidence: ['ev1'] },
        false
      )
    );
    // Second call: same approach, different phase + evidence
    const { stdout } = captureOutput(() =>
      cmdDeadEndAdd(
        tmpDir,
        { approach: 'Approach X', phase: '05', evidence: ['ev2'] },
        false
      )
    );
    const result = JSON.parse(stdout);
    expect(result.action).toBe('updated');
    expect(result.total_entries).toBe(1);

    const body = fs.readFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), 'utf-8');
    expect(body).toContain('tried_in_phases: ["02", "05"]');
    expect(body).toMatch(/evidence:\n\s+- "ev1"\n\s+- "ev2"/);
    // Status must flip active → reopened
    expect(body).toContain('status: reopened');
    expect(body).not.toContain('status: active');
  });

  test('duplicate phase/evidence on update are not added twice', () => {
    captureOutput(() =>
      cmdDeadEndAdd(
        tmpDir,
        { approach: 'Approach Y', phase: '02', evidence: ['ev1', 'ev2'] },
        false
      )
    );
    captureOutput(() =>
      cmdDeadEndAdd(
        tmpDir,
        { approach: 'Approach Y', phase: '02', evidence: ['ev1'] },
        false
      )
    );

    const body = fs.readFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), 'utf-8');
    // Phase must appear once, not twice
    const phaseMatches = body.match(/"02"/g) || [];
    expect(phaseMatches.length).toBe(1);
    // Evidence ev1 must appear once
    const evMatches = body.match(/- "ev1"/g) || [];
    expect(evMatches.length).toBe(1);
  });

  test('different slugs append new entries', () => {
    captureOutput(() =>
      cmdDeadEndAdd(tmpDir, { approach: 'Alpha approach', phase: '01' }, false)
    );
    const { stdout } = captureOutput(() =>
      cmdDeadEndAdd(tmpDir, { approach: 'Beta approach', phase: '02' }, false)
    );
    const result = JSON.parse(stdout);
    expect(result.action).toBe('created');
    expect(result.total_entries).toBe(2);
    expect(result.slug).toBe('beta-approach');

    const body = fs.readFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), 'utf-8');
    expect(body).toContain('## alpha-approach');
    expect(body).toContain('## beta-approach');
  });

  test('errors when --approach is missing', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdDeadEndAdd(tmpDir, { approach: '', phase: '02' }, false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--approach required');
  });

  test('errors when --phase is missing', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdDeadEndAdd(tmpDir, { approach: 'Some approach', phase: '' }, false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--phase required');
  });

  test('creates .planning/ when it does not yet exist', () => {
    fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true });

    captureOutput(() =>
      cmdDeadEndAdd(tmpDir, { approach: 'Some approach', phase: '01' }, false)
    );

    expect(fs.existsSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'))).toBe(true);
  });
});
