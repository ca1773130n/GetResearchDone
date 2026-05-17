/**
 * Unit tests for lib/plan-tournament.ts — Tier-3 #9 of the Ouroboros
 * integration. Scores candidate PLAN.md files on four axes and picks
 * the highest-scoring winner.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');

const {
  scorePlanCandidate,
  runTournament,
  cmdPlanTournament,
  DEFAULT_WEIGHTS,
} = require('../../lib/plan-tournament');

// ─── Fixture helpers ───────────────────────────────────────────────────────

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tournament-'));
  fs.mkdirSync(path.join(dir, '.planning'), { recursive: true });
  return dir;
}

function writeRoadmap(projectDir: string, body: string): void {
  fs.writeFileSync(path.join(projectDir, '.planning', 'ROADMAP.md'), body, 'utf-8');
}

function writeCandidate(projectDir: string, name: string, frontmatter: string, body = ''): string {
  const p = path.join(projectDir, name);
  fs.writeFileSync(p, `---\n${frontmatter}\n---\n\n${body}\n`, 'utf-8');
  return p;
}

const FULL_FRONTMATTER = [
  'phase: 01',
  'plan: 01',
  'type: execute',
  'wave: 1',
  'depends_on: []',
  'files_modified: []',
  'autonomous: true',
  'must_haves:',
  '    truths:',
  '      - "Stuff works"',
  'hypothesis: "Adding X will lift accuracy by 3-5%"',
  'predicted_outcome: "Test accuracy > 85%"',
].join('\n');

const FULL_GOAL_ROADMAP = [
  '# Roadmap',
  '',
  '### Phase 1: Accuracy lift — add X',
  '- **Scope:**',
  '  - Implement X across the encoder',
  '  - Bring accuracy from 82% to >85%',
  '',
].join('\n');

// ─── Per-axis: scorePlanCandidate ──────────────────────────────────────────

describe('scorePlanCandidate', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
    writeRoadmap(projectDir, FULL_GOAL_ROADMAP);
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('full plan scores high across all axes', () => {
    const p = writeCandidate(projectDir, 'a.md', FULL_FRONTMATTER, '# Plan\n\nShort body.');
    const r = scorePlanCandidate(p, projectDir, '01');
    expect(r.breakdown.completeness).toBe(1);
    expect(r.breakdown.hypothesis_quality).toBe(1);
    expect(r.breakdown.conciseness).toBe(1); // tiny plan
    expect(r.breakdown.goal_alignment).toBeGreaterThan(0); // hypothesis mentions accuracy/X
    expect(r.score).toBeGreaterThan(0.5);
  });

  test('missing frontmatter fields drag completeness below 1', () => {
    const fm = ['phase: 01', 'plan: 01', 'type: execute'].join('\n');
    const p = writeCandidate(projectDir, 'b.md', fm);
    const r = scorePlanCandidate(p, projectDir, '01');
    expect(r.breakdown.completeness).toBeLessThan(1);
    expect(r.breakdown.completeness).toBeCloseTo(3 / 8, 5);
  });

  test('missing hypothesis/predicted_outcome scalars set hypothesis_quality to 0', () => {
    const fm = FULL_FRONTMATTER.replace(/hypothesis:[^\n]*\n/, '').replace(
      /predicted_outcome:[^\n]*\n/,
      ''
    );
    const p = writeCandidate(projectDir, 'c.md', fm);
    const r = scorePlanCandidate(p, projectDir, '01');
    expect(r.breakdown.hypothesis_quality).toBe(0);
  });

  test('empty hypothesis/predicted_outcome strings still fail the quality gate', () => {
    const fm = FULL_FRONTMATTER.replace(
      'hypothesis: "Adding X will lift accuracy by 3-5%"',
      'hypothesis: ""'
    ).replace('predicted_outcome: "Test accuracy > 85%"', 'predicted_outcome: ""');
    const p = writeCandidate(projectDir, 'd.md', fm);
    const r = scorePlanCandidate(p, projectDir, '01');
    expect(r.breakdown.hypothesis_quality).toBe(0);
  });

  test('verbose body drops conciseness below 1', () => {
    // ~2500 tokens > target of 2000
    const body = '# Plan\n\n' + 'lorem ipsum dolor sit amet '.repeat(500);
    const p = writeCandidate(projectDir, 'e.md', FULL_FRONTMATTER, body);
    const r = scorePlanCandidate(p, projectDir, '01');
    expect(r.breakdown.conciseness).toBeLessThan(1);
    expect(r.breakdown.conciseness).toBeGreaterThan(0);
  });

  test('extremely verbose body drives conciseness toward 0', () => {
    const body = '# Plan\n\n' + 'lorem ipsum dolor sit amet '.repeat(5000);
    const p = writeCandidate(projectDir, 'f.md', FULL_FRONTMATTER, body);
    const r = scorePlanCandidate(p, projectDir, '01');
    expect(r.breakdown.conciseness).toBe(0);
  });

  test('goal_alignment is 0 when hypothesis is unrelated to ROADMAP goal', () => {
    const fm = FULL_FRONTMATTER.replace(
      'hypothesis: "Adding X will lift accuracy by 3-5%"',
      'hypothesis: "Completely orthogonal frontend refactor"'
    ).replace(
      'predicted_outcome: "Test accuracy > 85%"',
      'predicted_outcome: "Renders faster"'
    );
    const p = writeCandidate(projectDir, 'g.md', fm);
    const r = scorePlanCandidate(p, projectDir, '01');
    // Some overlap is possible from incidental words; assert it is at
    // least lower than the well-aligned case.
    const aligned = scorePlanCandidate(
      writeCandidate(projectDir, 'h.md', FULL_FRONTMATTER),
      projectDir,
      '01'
    );
    expect(r.breakdown.goal_alignment).toBeLessThan(aligned.breakdown.goal_alignment);
  });

  test('missing file surfaces an error and zero score', () => {
    const r = scorePlanCandidate(path.join(projectDir, 'does-not-exist.md'), projectDir, '01');
    expect(r.error).toMatch(/File not found/);
    expect(r.score).toBe(0);
  });
});

// ─── runTournament ────────────────────────────────────────────────────────

describe('runTournament', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
    writeRoadmap(projectDir, FULL_GOAL_ROADMAP);
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('picks highest-scoring candidate', () => {
    const full = writeCandidate(projectDir, 'full.md', FULL_FRONTMATTER, '# Plan\n');
    const partial = writeCandidate(projectDir, 'partial.md', 'phase: 01\nplan: 01\n');
    const r = runTournament([partial, full], projectDir, '01');
    expect(r.winner).not.toBeNull();
    expect(r.winner!.path).toBe(full);
    expect(r.ranked[0].path).toBe(full);
    expect(r.ranked[1].path).toBe(partial);
    expect(r.ranked[0].score).toBeGreaterThan(r.ranked[1].score);
  });

  test('ties are broken deterministically by input order (stable sort)', () => {
    // Two identical candidates → equal score → first one wins.
    const a = writeCandidate(projectDir, 'aaa.md', FULL_FRONTMATTER);
    const b = writeCandidate(projectDir, 'bbb.md', FULL_FRONTMATTER);
    const result1 = runTournament([a, b], projectDir, '01');
    const result2 = runTournament([b, a], projectDir, '01');
    expect(result1.winner!.path).toBe(a);
    expect(result2.winner!.path).toBe(b);
  });

  test('all candidates failing produces null winner', () => {
    const r = runTournament(
      [path.join(projectDir, 'missing-1.md'), path.join(projectDir, 'missing-2.md')],
      projectDir,
      '01'
    );
    expect(r.winner).toBeNull();
    expect(r.ranked).toHaveLength(2);
    expect(r.ranked.every((c: { score: number }) => c.score === 0)).toBe(true);
  });

  test('empty candidate list produces null winner and empty ranked array', () => {
    const r = runTournament([], projectDir, '01');
    expect(r.winner).toBeNull();
    expect(r.ranked).toEqual([]);
  });

  test('scores against tournament phase, not candidate phase (codex r1 P2 on PR #41)', () => {
    // Pre-fix: scorer read fm['phase'] and looked up that section in the
    // ROADMAP. A stale candidate could score against its own goal block
    // and win the tournament for a different phase.
    writeRoadmap(
      projectDir,
      [
        '# Roadmap',
        '',
        '### Phase 5: Target — alpha beta gamma delta',
        '- **Scope:**',
        '  - alpha beta gamma',
        '',
        '### Phase 1: Stale — completely different topic',
        '- **Scope:**',
        '  - frontend rendering pipeline',
        '',
      ].join('\n')
    );
    // Candidate declares phase 1 but tournament is for phase 5.
    // Its hypothesis aligns with phase 1's stale goal. Scored against
    // phase 5 (where the tournament is), goal_alignment must NOT use
    // phase 1's block.
    const staleFm = FULL_FRONTMATTER.replace('phase: 01', 'phase: 01').replace(
      'hypothesis: "Adding X will lift accuracy by 3-5%"',
      'hypothesis: "Rewrite frontend rendering pipeline"'
    );
    const stale = writeCandidate(projectDir, 'stale.md', staleFm);

    // Phase-5 aligned candidate: hypothesis matches phase 5 goal.
    const alignedFm = FULL_FRONTMATTER.replace('phase: 01', 'phase: 05').replace(
      'hypothesis: "Adding X will lift accuracy by 3-5%"',
      'hypothesis: "alpha beta gamma delta"'
    );
    const aligned = writeCandidate(projectDir, 'aligned.md', alignedFm);

    const r = runTournament([stale, aligned], projectDir, '05');
    // Aligned should win because the tournament phase is 5 and its
    // hypothesis matches phase-5 goal tokens. Pre-fix, stale would beat
    // it by scoring against phase 1 (its own claimed phase).
    expect(r.winner!.path).toBe(aligned);
    // The stale candidate must carry phase_mismatch
    const staleResult = r.ranked.find((c: { path: string }) => c.path === stale);
    expect(staleResult.phase_mismatch).toMatch(/phase "1".*tournament.*"5"/);
  });

  test('matches padded decimal phase headings in ROADMAP (codex r3 P2 on PR #41)', () => {
    // Pre-fix: `--phase 06.1` stripped to `6.1` but the regex required
    // `Phase 6.1:` literal, so `Phase 06.1:` in ROADMAP never matched
    // and goal_alignment was always 0 for `gd phase insert`-generated
    // decimal phases.
    writeRoadmap(
      projectDir,
      [
        '# Roadmap',
        '',
        '### Phase 06.1: Inserted phase — alpha beta gamma',
        '- **Scope:**',
        '  - alpha beta gamma',
        '',
      ].join('\n')
    );
    const fm = FULL_FRONTMATTER.replace('phase: 01', 'phase: 06.1').replace(
      'hypothesis: "Adding X will lift accuracy by 3-5%"',
      'hypothesis: "alpha beta gamma"'
    );
    const p = writeCandidate(projectDir, 'padded-decimal.md', fm);
    const r = scorePlanCandidate(p, projectDir, '06.1');
    expect(r.breakdown.goal_alignment).toBeGreaterThan(0);
  });

  test('normalises zero-padded phase IDs to avoid spurious phase_mismatch (codex r2 P3 on PR #41)', () => {
    // Candidate declares `phase: 01`; caller passes `--phase 1`. Same
    // phase. Pre-fix: phase_mismatch fired with "candidate declares
    // phase 01 but tournament is for phase 1".
    const p = writeCandidate(projectDir, 'padded.md', FULL_FRONTMATTER);
    const r = scorePlanCandidate(p, projectDir, '1');
    expect(r.phase_mismatch).toBeUndefined();
  });

  test('reads split-format ROADMAP.md via safeReadMarkdown (codex r1 P2 on PR #41)', () => {
    // Pre-fix: safeReadFile saw only the GRD-INDEX stub, _extractRoadmapGoal
    // never found the phase body, and every candidate got goal_alignment: 0.
    // Use markdown-split's index + partial format.
    const planning = path.join(projectDir, '.planning');
    // markdown-split.ts uses sibling partial files referenced as [name](./name)
    fs.writeFileSync(
      path.join(planning, 'ROADMAP.part1.md'),
      [
        '# Roadmap',
        '',
        '### Phase 1: Accuracy lift — add X',
        '- **Scope:**',
        '  - Implement X across the encoder',
        '  - Bring accuracy from 82% to >85%',
        '',
      ].join('\n'),
      'utf-8'
    );
    fs.writeFileSync(
      path.join(planning, 'ROADMAP.md'),
      ['<!-- GRD-INDEX -->', '', '- [part1](./ROADMAP.part1.md)', ''].join('\n'),
      'utf-8'
    );
    const p = writeCandidate(projectDir, 'split.md', FULL_FRONTMATTER, '# Plan');
    const r = scorePlanCandidate(p, projectDir, '01');
    // goal_alignment should be > 0 because the partial was reassembled.
    expect(r.breakdown.goal_alignment).toBeGreaterThan(0);
  });

  test('custom weights propagate through the result', () => {
    const a = writeCandidate(projectDir, 'a.md', FULL_FRONTMATTER);
    const weights = {
      completeness: 1.0,
      goal_alignment: 0,
      hypothesis_quality: 0,
      conciseness: 0,
    };
    const r = runTournament([a], projectDir, '01', weights);
    expect(r.weights).toEqual(weights);
    // Score should equal completeness alone with these weights.
    expect(r.winner!.score).toBeCloseTo(r.winner!.breakdown.completeness, 5);
  });
});

// ─── cmdPlanTournament (CLI) ───────────────────────────────────────────────

describe('cmdPlanTournament', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
    writeRoadmap(projectDir, FULL_GOAL_ROADMAP);
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('errors when --phase is missing', () => {
    const a = writeCandidate(projectDir, 'a.md', FULL_FRONTMATTER);
    const { stderr, exitCode } = captureError(() =>
      cmdPlanTournament(projectDir, { phase: '', candidates: [a] }, false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--phase required');
  });

  test('errors when --candidates is missing', () => {
    const { stderr, exitCode } = captureError(() =>
      cmdPlanTournament(projectDir, { phase: '01', candidates: [] }, false)
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--candidates required');
  });

  test('emits ranked JSON result with winner', () => {
    const full = writeCandidate(projectDir, 'full.md', FULL_FRONTMATTER, '# Plan');
    const partial = writeCandidate(projectDir, 'partial.md', 'phase: 01\nplan: 01\n');
    const { stdout, exitCode } = captureOutput(() =>
      cmdPlanTournament(projectDir, { phase: '01', candidates: [partial, full] }, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.winner.path).toBe(full);
    expect(result.ranked).toHaveLength(2);
    expect(result.weights).toEqual(DEFAULT_WEIGHTS);
  });

  test('resolves candidate paths relative to cwd', () => {
    writeCandidate(projectDir, 'relative.md', FULL_FRONTMATTER);
    const { stdout } = captureOutput(() =>
      cmdPlanTournament(projectDir, { phase: '01', candidates: ['relative.md'] }, false)
    );
    const result = JSON.parse(stdout);
    expect(result.winner.path).toBe(path.join(projectDir, 'relative.md'));
  });
});
