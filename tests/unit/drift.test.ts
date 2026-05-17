/**
 * Unit tests for lib/drift.ts — Tier-2 #7 of the Ouroboros integration.
 *
 * Goal / constraint / ontology drift each have a concrete file-based
 * data source. These tests construct phase fixtures with controlled
 * SUMMARY.md / VERIFICATION.md / ROADMAP.md content and verify each
 * component produces the expected drift score.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  computeGoalDrift,
  computeConstraintDrift,
  computeOntologyDrift,
  computeDriftScore,
  DEFAULT_WEIGHTS,
} = require('../../lib/drift');

// ─── Fixture helpers ───────────────────────────────────────────────────────

function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-drift-'));
  fs.mkdirSync(path.join(dir, '.planning', 'milestones', 'm1', 'phases'), {
    recursive: true,
  });
  return dir;
}

interface PhaseFixture {
  num: string; // e.g. '01', '02'
  summaryFrontmatter: string;
  summaryBody: string;
  verificationBody?: string;
}

function writePhase(projectDir: string, p: PhaseFixture): string {
  const phaseDir = path.join(
    projectDir,
    '.planning',
    'milestones',
    'm1',
    'phases',
    `${p.num}-phase`
  );
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(phaseDir, `${p.num}-01-SUMMARY.md`),
    `---\n${p.summaryFrontmatter}\n---\n\n${p.summaryBody}\n`,
    'utf-8'
  );
  if (p.verificationBody !== undefined) {
    fs.writeFileSync(
      path.join(phaseDir, `${p.num}-01-VERIFICATION.md`),
      p.verificationBody,
      'utf-8'
    );
  }
  return phaseDir;
}

function writeRoadmap(projectDir: string, body: string): void {
  fs.writeFileSync(path.join(projectDir, '.planning', 'ROADMAP.md'), body, 'utf-8');
}

// ─── Goal drift ────────────────────────────────────────────────────────────

describe('computeGoalDrift', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('low drift when SUMMARY accomplishments echo ROADMAP scope', () => {
    writeRoadmap(
      projectDir,
      [
        '# Roadmap',
        '',
        '## M1 v1.0: Foundation',
        '',
        '### Phase 1: Authentication — JWT login flow',
        '- **Scope:**',
        '  - Implement JWT token generation',
        '  - Login endpoint with refresh',
        '',
      ].join('\n')
    );
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01\nplan: 01',
      summaryBody: [
        '# Summary',
        '',
        '## Accomplishments',
        '- Implemented JWT token generation',
        '- Added login endpoint with refresh support',
        '',
      ].join('\n'),
    });

    const r = computeGoalDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    expect(r.score).toBeLessThan(0.6); // high overlap → low drift
  });

  test('high drift when accomplishments are unrelated to scope', () => {
    writeRoadmap(
      projectDir,
      [
        '# Roadmap',
        '',
        '### Phase 1: Database — Postgres schema migration',
        '- **Scope:**',
        '  - Migrate users table to v2',
        '  - Add foreign key constraints',
        '',
      ].join('\n')
    );
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01\nplan: 01',
      summaryBody: [
        '# Summary',
        '',
        '## Accomplishments',
        '- Rewrote frontend rendering pipeline',
        '- Switched icon library to lucide',
        '',
      ].join('\n'),
    });

    const r = computeGoalDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    expect(r.score).toBeGreaterThan(0.7); // little overlap → high drift
  });

  test('insufficient_data when ROADMAP.md missing', () => {
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01',
      summaryBody: '## Accomplishments\n- Did things\n',
    });
    const r = computeGoalDrift(projectDir);
    expect(r.sufficient_data).toBe(false);
    expect(r.reason).toMatch(/ROADMAP/);
  });

  test('insufficient_data when no phase has both ROADMAP block and SUMMARY accomplishments', () => {
    writeRoadmap(projectDir, '# Roadmap\n\n(no phase blocks)\n');
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01',
      summaryBody: '# Summary\n(no Accomplishments section)\n',
    });
    const r = computeGoalDrift(projectDir);
    expect(r.sufficient_data).toBe(false);
  });
});

// ─── Constraint drift ──────────────────────────────────────────────────────

describe('computeConstraintDrift', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('score 0 when no banned phrasings present', () => {
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01',
      summaryBody: '## Accomplishments\n- Implemented X cleanly\n',
      verificationBody: '# Verification\n\n## Reflection\n\n| verdict | confirmed |\n',
    });
    const r = computeConstraintDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    expect(r.score).toBe(0);
  });

  test('non-zero score when banned phrasings appear in VERIFICATION', () => {
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01',
      summaryBody: '## Accomplishments\n- Done\n',
      verificationBody: [
        '# Verification',
        '',
        '## Notes',
        'It looks good and should work fine. I verified this manually.',
        '',
      ].join('\n'),
    });
    const r = computeConstraintDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(1);
    expect((r.detail as { violations: number }).violations).toBeGreaterThanOrEqual(3);
  });

  test('score clamped at 1.0 when violations are very dense', () => {
    const bigViolation = Array.from({ length: 50 })
      .map(() => 'looks good seems fine should work appears to work I verified this')
      .join(' ');
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01',
      summaryBody: '## Accomplishments\n- Done\n',
      verificationBody: bigViolation,
    });
    const r = computeConstraintDrift(projectDir);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  test('insufficient_data when no completed phases', () => {
    const r = computeConstraintDrift(projectDir);
    expect(r.sufficient_data).toBe(false);
  });
});

// ─── Ontology drift ────────────────────────────────────────────────────────

describe('computeOntologyDrift', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('low drift when recent vocab overlaps baseline vocab heavily', () => {
    // Five phases, all using the same tech-stack + patterns
    for (let i = 1; i <= 5; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: [
          `phase: ${num}`,
          'tech-stack:',
          '  added: [node, typescript]',
          'patterns-established:',
          '  - "CLI pattern"',
          '  - "Subcommand routing"',
        ].join('\n'),
        summaryBody: '## Accomplishments\n- Built things\n',
      });
    }
    const r = computeOntologyDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    expect(r.score).toBe(0); // identical baseline and recent
  });

  test('high drift when recent vocab is disjoint from baseline', () => {
    for (let i = 1; i <= 3; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: [
          `phase: ${num}`,
          'tech-stack:',
          '  added: [node, typescript, jest]',
        ].join('\n'),
        summaryBody: '## Accomplishments\n- baseline work\n',
      });
    }
    for (let i = 4; i <= 6; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: [
          `phase: ${num}`,
          'tech-stack:',
          '  added: [python, pytorch, cuda]',
        ].join('\n'),
        summaryBody: '## Accomplishments\n- ml work\n',
      });
    }
    const r = computeOntologyDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    expect(r.score).toBeGreaterThan(0.8);
  });

  test('insufficient_data when fewer than 2 completed phases', () => {
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01\ntech-stack:\n  added: [node]\n',
      summaryBody: '## Accomplishments\n- Done\n',
    });
    const r = computeOntologyDrift(projectDir);
    expect(r.sufficient_data).toBe(false);
  });

  test('insufficient_data when phases have no extractable vocab', () => {
    for (let i = 1; i <= 3; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: `phase: ${num}`,
        summaryBody: '## Accomplishments\n- Done\n',
      });
    }
    const r = computeOntologyDrift(projectDir);
    expect(r.sufficient_data).toBe(false);
    expect(r.reason).toMatch(/vocab/);
  });
});

// ─── Aggregator ────────────────────────────────────────────────────────────

describe('computeDriftScore aggregator', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('weighted score uses the documented 0.5 / 0.3 / 0.2 split', () => {
    expect(DEFAULT_WEIGHTS).toEqual({ goal: 0.5, constraint: 0.3, ontology: 0.2 });
  });

  test('insufficient_data components contribute 0 to the weighted score', () => {
    // Empty project — all three components return insufficient_data
    const r = computeDriftScore(projectDir);
    expect(r.goal.sufficient_data).toBe(false);
    expect(r.constraint.sufficient_data).toBe(false);
    expect(r.ontology.sufficient_data).toBe(false);
    expect(r.weighted).toBe(0);
    expect(r.exceeded).toBe(false);
  });

  test('exceeded fires when weighted > threshold', () => {
    // Force goal drift high; let the others stay at 0
    writeRoadmap(
      projectDir,
      '### Phase 1: Foo — bar\n- **Scope:**\n  - one\n  - two\n'
    );
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01',
      summaryBody: '## Accomplishments\n- completely unrelated lorem ipsum dolor sit amet\n',
    });

    const r = computeDriftScore(projectDir, DEFAULT_WEIGHTS, 0.1);
    expect(r.exceeded).toBe(r.weighted > 0.1);
  });

  test('custom weights are applied', () => {
    const customWeights = { goal: 1.0, constraint: 0, ontology: 0 };
    const r = computeDriftScore(projectDir, customWeights);
    expect(r.weights).toEqual(customWeights);
  });
});
