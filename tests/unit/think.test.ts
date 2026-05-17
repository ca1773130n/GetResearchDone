/**
 * Unit tests for lib/think.ts — Tier-3 #11 of the Ouroboros integration.
 *
 * Pure data-aggregation; no LLM, no daemon. The two proposal caveats —
 * "background behavior surprises CLI" and "conflicts with project-state
 * boundaries" — are addressed by:
 *
 *   1. One-shot command (no daemon)
 *   2. Output writes only to .planning/thoughts/{timestamp}-thinking.md
 *
 * These tests pin both contracts.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');

const { runThink, cmdThink } = require('../../lib/think');

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-think-'));
  fs.mkdirSync(path.join(dir, '.planning', 'milestones', 'm1', 'phases'), {
    recursive: true,
  });
  return dir;
}

function writePhase(
  projectDir: string,
  num: string,
  opts: { accomplishments?: string; verdict?: string; hypothesis?: string }
): void {
  const dir = path.join(
    projectDir,
    '.planning',
    'milestones',
    'm1',
    'phases',
    `${num}-phase`
  );
  fs.mkdirSync(dir, { recursive: true });
  const summary = [
    '---',
    `phase: ${num}`,
    'tech-stack:',
    '  added: [node]',
    '---',
    '',
    '# Summary',
    '',
    '## Accomplishments',
    `- ${opts.accomplishments ?? 'did things'}`,
  ].join('\n');
  fs.writeFileSync(path.join(dir, `${num}-01-SUMMARY.md`), summary, 'utf-8');
  if (opts.verdict) {
    const ver = [
      '# Verification',
      '',
      '## Reflection',
      '',
      '| Field | Value |',
      '|-------|-------|',
      `| hypothesis | ${opts.hypothesis ?? 'sample hypothesis'} |`,
      '| predicted_outcome | predicted |',
      '| actual_outcome | actual |',
      `| verdict | ${opts.verdict} |`,
      '| evidence | foo.ts:1 |',
    ].join('\n');
    fs.writeFileSync(path.join(dir, `${num}-01-VERIFICATION.md`), ver, 'utf-8');
  }
}

// ─── runThink ─────────────────────────────────────────────────────────────

describe('runThink', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('writes a timestamped briefing to .planning/thoughts/', () => {
    const r = runThink(projectDir);
    expect(r.output_path).toMatch(/.planning\/thoughts\/.*-thinking\.md$/);
    expect(fs.existsSync(r.output_path)).toBe(true);
    const body = fs.readFileSync(r.output_path, 'utf-8');
    expect(body).toContain('# Thinking briefing');
    expect(body).toContain('## Snapshot');
    expect(body).toContain('## Verdict mix');
    expect(body).toContain('## Dead-ends in the registry');
    expect(body).toContain('## Open questions');
    expect(body).toContain('## Product-idea ↔ dead-end collisions');
  });

  test('counts verdicts from recent reflections', () => {
    writePhase(projectDir, '01', { verdict: 'confirmed' });
    writePhase(projectDir, '02', { verdict: 'falsified' });
    writePhase(projectDir, '03', { verdict: 'partial' });
    writePhase(projectDir, '04', { verdict: 'unknown' });
    writePhase(projectDir, '05', { verdict: 'confirmed' });

    const r = runThink(projectDir);
    expect(r.verdict_counts.confirmed).toBe(2);
    expect(r.verdict_counts.partial).toBe(1);
    expect(r.verdict_counts.falsified).toBe(1);
    expect(r.verdict_counts.unknown).toBe(1);
  });

  test('lists open questions for partial and unknown verdicts', () => {
    writePhase(projectDir, '01', {
      verdict: 'partial',
      hypothesis: 'X works but only on CPU',
    });
    writePhase(projectDir, '02', { verdict: 'confirmed' });
    writePhase(projectDir, '03', {
      verdict: 'unknown',
      hypothesis: 'Y might converge',
    });

    const r = runThink(projectDir);
    expect(r.open_questions).toHaveLength(2);
    expect(r.open_questions[0]).toMatch(/X works but only on CPU/);
    expect(r.open_questions[1]).toMatch(/Y might converge/);
  });

  test('lists dead-end slugs from DEAD-ENDS.md', () => {
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'DEAD-ENDS.md'),
      [
        '# Dead Ends',
        '',
        '## rope-on-cpu',
        '',
        '```yaml',
        'approach: "RoPE on CPU"',
        'slug: rope-on-cpu',
        '```',
        '',
        '## attention-headcount-bump',
        '',
        '```yaml',
        'approach: "More heads"',
        'slug: attention-headcount-bump',
        '```',
        '',
      ].join('\n'),
      'utf-8'
    );
    const r = runThink(projectDir);
    expect(r.recent_dead_ends).toContain('rope-on-cpu');
    expect(r.recent_dead_ends).toContain('attention-headcount-bump');
  });

  test('flags product-idea ↔ dead-end collisions', () => {
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'DEAD-ENDS.md'),
      [
        '## rope-cpu-encoder',
        '',
        '```yaml',
        'approach: "RoPE on CPU encoder"',
        'slug: rope-cpu-encoder',
        '```',
        '',
      ].join('\n'),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'PRODUCT-IDEAS.md'),
      [
        '# Product ideas',
        '',
        '## Adopt RoPE in the CPU encoder for faster startup',
        '## Move billing to monthly cycle',
        '',
      ].join('\n'),
      'utf-8'
    );
    const r = runThink(projectDir);
    expect(r.product_idea_collisions).toHaveLength(1);
    expect(r.product_idea_collisions[0].idea).toMatch(/RoPE/);
    expect(r.product_idea_collisions[0].dead_end_slug).toBe('rope-cpu-encoder');
  });

  test('snapshot includes drift weighted + exceeded flag', () => {
    const r = runThink(projectDir);
    expect(typeof r.snapshot.drift_weighted).toBe('number');
    expect(typeof r.snapshot.drift_exceeded).toBe('boolean');
  });

  test('counts active blockers from STATE.md', () => {
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'STATE.md'),
      [
        '# State',
        '',
        '## Blockers',
        '',
        '- Waiting on review from X',
        '- Y returned a 500',
        '- None.',
        '',
      ].join('\n'),
      'utf-8'
    );
    const r = runThink(projectDir);
    expect(r.snapshot.blocker_count).toBe(2); // "None." entry excluded
  });

  test('respects --limit (only recent N phases counted in verdict mix)', () => {
    // 6 phases, all falsified. limit=3 should yield falsified=3 (not 6).
    for (let i = 1; i <= 6; i++) {
      writePhase(projectDir, String(i).padStart(2, '0'), { verdict: 'falsified' });
    }
    const r = runThink(projectDir, { limit: 3 });
    expect(r.verdict_counts.falsified).toBe(3);
  });

  // ─── Proposal-caveat regression tests ──────────────────────────────────

  test('writes ONLY to .planning/thoughts/ — no other .planning file mutated', () => {
    // Seed some existing .planning files; snapshot mtimes; run think;
    // confirm only our quarantined file changed.
    fs.writeFileSync(path.join(projectDir, '.planning', 'STATE.md'), '# State\n', 'utf-8');
    fs.writeFileSync(
      path.join(projectDir, '.planning', 'ROADMAP.md'),
      '# Roadmap\n',
      'utf-8'
    );
    const stateBefore = fs.statSync(path.join(projectDir, '.planning', 'STATE.md')).mtimeMs;
    const roadmapBefore = fs.statSync(path.join(projectDir, '.planning', 'ROADMAP.md')).mtimeMs;

    runThink(projectDir);

    const stateAfter = fs.statSync(path.join(projectDir, '.planning', 'STATE.md')).mtimeMs;
    const roadmapAfter = fs.statSync(path.join(projectDir, '.planning', 'ROADMAP.md')).mtimeMs;
    expect(stateAfter).toBe(stateBefore);
    expect(roadmapAfter).toBe(roadmapBefore);
  });

  test('is deterministic (no LLM, no network) — same fixture → same content modulo timestamp', () => {
    writePhase(projectDir, '01', { verdict: 'confirmed' });
    const a = runThink(projectDir);
    const aBody = fs.readFileSync(a.output_path, 'utf-8');
    // Wait nothing — instant — then re-run
    const b = runThink(projectDir);
    const bBody = fs.readFileSync(b.output_path, 'utf-8');
    // Strip the _Generated_ line and compare the rest.
    const strip = (s: string): string => s.replace(/_Generated_:[^\n]*/, '');
    expect(strip(aBody)).toBe(strip(bBody));
  });
});

// ─── cmdThink CLI ────────────────────────────────────────────────────────

describe('cmdThink', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('emits JSON result with output_path', () => {
    const { stdout, exitCode } = captureOutput(() => cmdThink(projectDir, {}, false));
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.output_path).toMatch(/-thinking\.md$/);
    expect(result).toHaveProperty('snapshot');
    expect(result).toHaveProperty('verdict_counts');
  });

  test('errors on invalid --limit (zero or negative)', () => {
    const a = captureError(() => cmdThink(projectDir, { limit: 0 }, false));
    expect(a.exitCode).toBe(1);
    expect(a.stderr).toMatch(/positive integer/);
    const b = captureError(() => cmdThink(projectDir, { limit: -3 }, false));
    expect(b.exitCode).toBe(1);
  });
});
