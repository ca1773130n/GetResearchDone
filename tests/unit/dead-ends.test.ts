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
  parseReflectionSection,
  cmdDeadEndAdd,
  cmdDeadEndPromoteFromPhase,
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

  test('date field round-trips; entries without one stay date-less', () => {
    const dated = {
      approach: 'Dated approach',
      slug: 'dated-approach',
      tried_in_phases: ['01'],
      verdict: 'falsified',
      evidence: [],
      status: 'active' as const,
      date: '2026-07-01',
    };
    const legacy = {
      approach: 'Legacy approach',
      slug: 'legacy-approach',
      tried_in_phases: ['01'],
      verdict: 'falsified',
      evidence: [],
      status: 'active' as const,
    };
    const serialized = serializeDeadEndsFile([dated, legacy]);
    expect(serialized).toContain('date: 2026-07-01');
    const reparsed = parseDeadEndsFile(serialized);
    expect(reparsed[0]).toEqual(dated);
    expect(reparsed[1]).toEqual(legacy);
    expect(reparsed[1].date).toBeUndefined();
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
    // New entries are stamped with an ISO recorded-at date (today, UTC)
    expect(body).toMatch(/^date: \d{4}-\d{2}-\d{2}$/m);
    expect(parseDeadEndsFile(body)[0].date).toBe(new Date().toISOString().slice(0, 10));
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

  test('update preserves first-recorded date; legacy entries stay date-less', () => {
    const seeded = [
      '# Dead Ends Registry',
      '',
      '## dated-approach',
      '',
      '```yaml',
      'approach: "Dated approach"',
      'slug: dated-approach',
      'date: 2020-01-01',
      'tried_in_phases: ["01"]',
      'verdict: falsified',
      'evidence: []',
      'status: active',
      '```',
      '',
      '## legacy-approach',
      '',
      '```yaml',
      'approach: "Legacy approach"',
      'slug: legacy-approach',
      'tried_in_phases: ["01"]',
      'verdict: falsified',
      'evidence: []',
      'status: active',
      '```',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), seeded, 'utf-8');

    captureOutput(() => cmdDeadEndAdd(tmpDir, { approach: 'Dated approach', phase: '05' }, false));
    captureOutput(() => cmdDeadEndAdd(tmpDir, { approach: 'Legacy approach', phase: '05' }, false));

    const body = fs.readFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), 'utf-8');
    const entries = parseDeadEndsFile(body);
    expect(entries[0].date).toBe('2020-01-01'); // not re-stamped on update
    expect(entries[1].date).toBeUndefined(); // pre-date entries not backfilled
    expect((body.match(/^date: /gm) || []).length).toBe(1);
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

  // ─── Codex rescue r2 P2 regressions ─────────────────────────────────────
  // Embedded double-quotes in evidence/notes/approach must round-trip
  // without corrupting the YAML.

  test('round-trips evidence containing embedded double-quotes', () => {
    captureOutput(() =>
      cmdDeadEndAdd(
        tmpDir,
        {
          approach: 'Approach with "quotes"',
          phase: '02',
          evidence: ['test says "failed"', 'log: error "X"'],
          notes: 'A "tricky" case',
        },
        false
      )
    );

    const body = fs.readFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), 'utf-8');
    // Writer must escape inner quotes
    expect(body).toContain('\\"quotes\\"');
    expect(body).toContain('\\"failed\\"');
    expect(body).toContain('\\"tricky\\"');
    // Must NOT have unescaped consecutive quotes like ""quotes""
    expect(body).not.toMatch(/"[^\\]?""/);

    // Parser round-trip restores the originals
    const reparsed = parseDeadEndsFile(body);
    expect(reparsed).toHaveLength(1);
    const e = reparsed[0];
    expect(e.approach).toBe('Approach with "quotes"');
    expect(e.evidence).toEqual(['test says "failed"', 'log: error "X"']);
    expect(e.notes).toBe('A "tricky" case');
  });

  test('round-trips backslashes (escape character) in evidence', () => {
    captureOutput(() =>
      cmdDeadEndAdd(
        tmpDir,
        {
          approach: 'Backslash test',
          phase: '01',
          evidence: ['path\\with\\backslash'],
        },
        false
      )
    );
    const body = fs.readFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), 'utf-8');
    const reparsed = parseDeadEndsFile(body);
    expect(reparsed[0].evidence).toEqual(['path\\with\\backslash']);
  });

  test('inline array with embedded comma-in-quotes does not over-split', () => {
    // Synthesise a file by hand so we can guarantee the input shape.
    const body = [
      '# Dead Ends Registry',
      '',
      '## comma-test',
      '',
      '```yaml',
      'approach: "X"',
      'slug: comma-test',
      'tried_in_phases: ["phase, with, commas", "02"]',
      'verdict: falsified',
      'evidence: []',
      'status: active',
      '```',
      '',
    ].join('\n');
    const entries = parseDeadEndsFile(body);
    expect(entries[0].tried_in_phases).toEqual(['phase, with, commas', '02']);
  });

  test('creates .planning/ when it does not yet exist', () => {
    fs.rmSync(path.join(tmpDir, '.planning'), { recursive: true });

    captureOutput(() =>
      cmdDeadEndAdd(tmpDir, { approach: 'Some approach', phase: '01' }, false)
    );

    expect(fs.existsSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'))).toBe(true);
  });
});

// ─── parseReflectionSection ────────────────────────────────────────────────

describe('parseReflectionSection', () => {
  test('parses a well-formed Reflection table', () => {
    const body = [
      '# Verification Report',
      '',
      '## Reflection',
      '',
      '| Field | Value |',
      '|-------|-------|',
      '| hypothesis | Adding RoPE will lift accuracy 3-5% |',
      '| predicted_outcome | Test-set accuracy > 85% |',
      '| actual_outcome | Accuracy 38%, no convergence |',
      '| verdict | falsified |',
      '| evidence | tests/encoder.test.ts:142; EVAL.md:38% accuracy |',
      '',
      '---',
    ].join('\n');
    const r = parseReflectionSection(body);
    expect(r).not.toBeNull();
    expect(r.hypothesis).toBe('Adding RoPE will lift accuracy 3-5%');
    expect(r.predicted_outcome).toBe('Test-set accuracy > 85%');
    expect(r.actual_outcome).toBe('Accuracy 38%, no convergence');
    expect(r.verdict).toBe('falsified');
    expect(r.evidence).toEqual([
      'tests/encoder.test.ts:142',
      'EVAL.md:38% accuracy',
    ]);
  });

  test('returns null when section absent', () => {
    expect(parseReflectionSection('# V\n\n## Other\n\nbody')).toBeNull();
  });

  test('returns null when hypothesis or verdict missing', () => {
    const body = [
      '## Reflection',
      '',
      '| Field | Value |',
      '|-------|-------|',
      '| predicted_outcome | Something |',
      '',
    ].join('\n');
    expect(parseReflectionSection(body)).toBeNull();
  });

  test('stops at next H2 heading', () => {
    const body = [
      '## Reflection',
      '',
      '| Field | Value |',
      '|-------|-------|',
      '| hypothesis | H |',
      '| verdict | confirmed |',
      '',
      '## Next Section',
      '',
      '| hypothesis | LEAKED |',
    ].join('\n');
    const r = parseReflectionSection(body);
    expect(r.hypothesis).toBe('H');
    expect(r.hypothesis).not.toBe('LEAKED');
  });
});

// ─── cmdDeadEndPromoteFromPhase ────────────────────────────────────────────

describe('cmdDeadEndPromoteFromPhase', () => {
  let tmpDir: string;

  beforeEach(() => {
    // Reuse the integration fixture: tests/fixtures/planning has phases
    // 01-test and 02-build with PLAN.md+SUMMARY.md (no VERIFICATION.md yet).
    const { createFixtureDir } = require('../helpers/fixtures');
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    const { cleanupFixtureDir } = require('../helpers/fixtures');
    cleanupFixtureDir(tmpDir);
  });

  /** W1: the write path is gated; unset the key and promotion previews instead. */
  function enableAutoPromote(): void {
    const cfg = path.join(tmpDir, '.planning', 'config.json');
    const existing = fs.existsSync(cfg) ? JSON.parse(fs.readFileSync(cfg, 'utf-8')) : {};
    existing.research_gates = { ...(existing.research_gates || {}), auto_promote_falsified: true };
    fs.writeFileSync(cfg, JSON.stringify(existing, null, 2), 'utf-8');
  }

  function writeReflection(phaseDirName: string, verdict: string, hypothesis = 'Sample hypothesis'): void {
    const phaseDir = path.join(
      tmpDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      phaseDirName
    );
    const ver = [
      '# Verification',
      '',
      '## Reflection',
      '',
      '| Field | Value |',
      '|-------|-------|',
      `| hypothesis | ${hypothesis} |`,
      '| predicted_outcome | Predicted |',
      '| actual_outcome | Did not converge |',
      `| verdict | ${verdict} |`,
      '| evidence | tests/foo.test.ts:42; logs:bar |',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(phaseDir, '01-VERIFICATION.md'), ver, 'utf-8');
  }

  test('promotes a falsified phase into DEAD-ENDS.md', () => {
    enableAutoPromote();
    writeReflection('01-test', 'falsified', 'RoPE on CPU is fast enough');

    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.action).toBe('created');
    expect(result.slug).toBe('rope-on-cpu-is-fast-enough');
    expect(result.phase).toMatch(/01/);

    const body = fs.readFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), 'utf-8');
    expect(body).toContain('## rope-on-cpu-is-fast-enough');
    expect(body).toContain('verdict: falsified');
    // Evidence from the Reflection table is split on `;` and propagated
    expect(body).toContain('"tests/foo.test.ts:42"');
    expect(body).toContain('"logs:bar"');
  });

  test('skips when verdict is confirmed', () => {
    writeReflection('01-test', 'confirmed');
    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/confirmed/);
    // No DEAD-ENDS.md should be created when nothing to register
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'))).toBe(false);
  });

  test('skips when verdict is unknown', () => {
    writeReflection('01-test', 'unknown');
    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/unknown/);
  });

  test('skips when verdict is partial (this PR only auto-promotes falsified)', () => {
    writeReflection('01-test', 'partial');
    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/partial/);
  });

  test('skips when no VERIFICATION.md exists for the phase', () => {
    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/VERIFICATION\.md/);
  });

  test('skips when phase is not found', () => {
    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '99', false));
    const result = JSON.parse(stdout);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/Phase not found/);
  });

  test('is idempotent: re-running on same falsified phase updates without duplicating', () => {
    enableAutoPromote();
    writeReflection('01-test', 'falsified', 'Approach Z');

    captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const filePath = path.join(tmpDir, '.planning', 'DEAD-ENDS.md');
    const afterFirst = fs.readFileSync(filePath, 'utf-8');

    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.action).toBe('updated');
    expect(result.total_entries).toBe(1);
    // Idempotent means byte-identical, not merely "no duplicate row". Both call sites
    // (execute-phase and verify-phase) promote the same VERIFICATION.md, so a re-run
    // that flipped status active -> reopened would corrupt the entry on every phase.
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(afterFirst);
  });

  test('a mistyped gate value is a config_error, not a silent false (W1)', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'config.json'),
      JSON.stringify({ research_gates: { auto_promote_falsified: 'true' } }),
      'utf-8'
    );
    writeReflection('01-test', 'falsified', 'Approach M');

    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.dry_run).toBe(true);
    expect(result.config_error).toMatch(/not a boolean/);
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'))).toBe(false);
  });

  test('addDeadEnd keeps its public same-phase reopen contract (W1)', () => {
    const { addDeadEnd } = require('../../lib/dead-ends');
    addDeadEnd(tmpDir, { approach: 'Approach N', phase: '03', evidence: ['a.ts:1'] });
    addDeadEnd(tmpDir, { approach: 'Approach N', phase: '03', evidence: ['b.ts:2'] });

    // Manual re-add signals a re-encounter; only promote-from-phase opts out.
    const body = fs.readFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), 'utf-8');
    expect(body).toContain('status: reopened');
    expect(body).toContain('tried_in_phases: ["03"]');
  });

  test('a genuinely later phase still flips status to reopened (W1)', () => {
    enableAutoPromote();
    writeReflection('01-test', 'falsified', 'Approach Z');
    captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));

    const { addDeadEnd } = require('../../lib/dead-ends');
    addDeadEnd(tmpDir, { approach: 'Approach Z', phase: '07', evidence: ['later.ts:3'] });

    const body = fs.readFileSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'), 'utf-8');
    expect(body).toContain('status: reopened');
    expect(body).toContain('"01"');
    expect(body).toContain('"07"');
  });

  test('dry-runs by default: previews the entry and writes nothing (W1)', () => {
    writeReflection('01-test', 'falsified', 'Approach Q');

    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.skipped).toBe(false);
    expect(result.dry_run).toBe(true);
    expect(result.action).toBe('created');
    expect(result.slug).toBe('approach-q');
    expect(result.preview).toContain('## approach-q');
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'))).toBe(false);
  });

  test('dry-run leaves an existing DEAD-ENDS.md byte-identical (W1)', () => {
    enableAutoPromote();
    writeReflection('01-test', 'falsified', 'Approach R');
    captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const filePath = path.join(tmpDir, '.planning', 'DEAD-ENDS.md');
    const before = fs.readFileSync(filePath, 'utf-8');

    // Flip the gate back off, then re-run against a NEW falsified hypothesis.
    fs.writeFileSync(path.join(tmpDir, '.planning', 'config.json'), '{}', 'utf-8');
    writeReflection('01-test', 'falsified', 'Approach S');
    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));

    expect(JSON.parse(stdout).dry_run).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(before);
  });

  test('confirmed verdict writes nothing and states why, gate on or off (W1)', () => {
    enableAutoPromote();
    writeReflection('01-test', 'confirmed', 'Approach T');

    const { stdout } = captureOutput(() => cmdDeadEndPromoteFromPhase(tmpDir, '1', false));
    const result = JSON.parse(stdout);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/only falsified is auto-promoted/);
    expect(fs.existsSync(path.join(tmpDir, '.planning', 'DEAD-ENDS.md'))).toBe(false);
  });

  test('promoteFalsifiedFromPhase never exits the process (W1)', () => {
    const { promoteFalsifiedFromPhase } = require('../../lib/dead-ends');
    // A missing phase is the path that used to route through output()/error().
    const r = promoteFalsifiedFromPhase(tmpDir, '999');
    expect(r.skipped).toBe(true);
    expect(r.reason).toMatch(/Phase not found/);
  });
});

describe('addDeadEnd (programmatic core)', () => {
  const { addDeadEnd, parseDeadEndsFile } = require('../../lib/dead-ends');
  function tmpA() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-de-')); fs.mkdirSync(path.join(d, '.planning'), { recursive: true }); return d; }

  it('creates a new entry and returns action:created', () => {
    const cwd = tmpA();
    const res = addDeadEnd(cwd, { approach: 'Use Elo tournament for plan selection', phase: 'research:t1#iter0', verdict: 'falsified', evidence: ['predicted: better selector'] });
    expect(res.action).toBe('created');
    expect(res.slug).toBeTruthy();
    const entries = parseDeadEndsFile(fs.readFileSync(path.join(cwd, '.planning/DEAD-ENDS.md'), 'utf8'));
    expect(entries.length).toBe(1);
    expect(entries[0].approach).toBe('Use Elo tournament for plan selection');
    expect(entries[0].tried_in_phases).toContain('research:t1#iter0');
  });

  it('merges a same-approach re-add (action:updated, no duplicate slug)', () => {
    const cwd = tmpA();
    addDeadEnd(cwd, { approach: 'Use Elo tournament for plan selection', phase: 'research:t1#iter0' });
    const res = addDeadEnd(cwd, { approach: 'Use Elo tournament for plan selection', phase: 'research:t2#iter1', evidence: ['more'] });
    expect(res.action).toBe('updated');
    const content = fs.readFileSync(path.join(cwd, '.planning/DEAD-ENDS.md'), 'utf8');
    const slugCount = (content.match(/^## /gm) || []).length;
    expect(slugCount).toBe(1);
    const entries = parseDeadEndsFile(content);
    expect(entries[0].tried_in_phases).toEqual(expect.arrayContaining(['research:t1#iter0', 'research:t2#iter1']));
  });

  it('throws (does not exit) on a blank approach', () => {
    expect(() => addDeadEnd(tmpA(), { approach: '', phase: 'p' })).toThrow();
  });
});
