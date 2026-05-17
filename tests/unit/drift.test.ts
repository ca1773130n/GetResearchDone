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
  isOntologyConverged,
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

// ─── Codex rescue r2 P2 regressions ───────────────────────────────────────

describe('codex r2 P2: real-world SUMMARY frontmatter shapes', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('ontology drift recognises tech_stack (underscore) with block list', () => {
    // Real-world shape from .planning/milestones/v0.3.12/.../75-01-SUMMARY.md
    for (let i = 1; i <= 3; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: [
          `phase: ${num}`,
          'tech_stack:',
          '  added: []',
          '  patterns: [hook-handler-pattern, descriptor-based-dispatch]',
        ].join('\n'),
        summaryBody: '## Accomplishments\n- baseline\n',
      });
    }
    for (let i = 4; i <= 6; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: [
          `phase: ${num}`,
          'tech_stack:',
          '  added: []',
          '  patterns: [completely-different-pattern, another-new]',
        ].join('\n'),
        summaryBody: '## Accomplishments\n- recent\n',
      });
    }
    const r = computeOntologyDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    // Pre-fix, the underscore form was missed entirely → both vocab sets
    // were empty → sufficient_data: false. Post-fix the parser sees the
    // patterns and reports real drift.
    expect(r.score).toBeGreaterThan(0.5);
  });
});

describe('codex r2 P2: multi-plan phases aggregate all summaries', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('goal drift uses accomplishments from every SUMMARY.md in the phase', () => {
    writeRoadmap(
      projectDir,
      '### Phase 1: Auth — JWT login flow\n- **Scope:**\n  - JWT token generation\n  - login endpoint\n'
    );
    const phaseDir = path.join(
      projectDir,
      '.planning',
      'milestones',
      'm1',
      'phases',
      '01-phase'
    );
    fs.mkdirSync(phaseDir, { recursive: true });
    // Plan 01: unrelated work (high drift if isolated)
    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      '---\nphase: 01\n---\n\n## Accomplishments\n- Refactored unrelated module\n',
      'utf-8'
    );
    // Plan 02: actually does the JWT work (low drift)
    fs.writeFileSync(
      path.join(phaseDir, '01-02-SUMMARY.md'),
      '---\nphase: 01\n---\n\n## Accomplishments\n- Implemented JWT token generation and login endpoint\n',
      'utf-8'
    );

    const r = computeGoalDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    // With aggregation, the JWT accomplishments from plan 02 should pull
    // the distance down. Pre-fix, .find() might pick plan 01 (unrelated)
    // and report inflated drift.
    expect(r.score).toBeLessThan(0.8);
  });

  test('ontology drift unions vocab across every SUMMARY.md in the phase', () => {
    const phaseDir = path.join(
      projectDir,
      '.planning',
      'milestones',
      'm1',
      'phases',
      '01-phase'
    );
    fs.mkdirSync(phaseDir, { recursive: true });
    // Two plans contributing different vocab — both must be collected
    fs.writeFileSync(
      path.join(phaseDir, '01-01-SUMMARY.md'),
      '---\nphase: 01\ntech-stack:\n  added: [node]\n  patterns: [pattern-a]\n---\n\n## Accomplishments\n- A\n',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(phaseDir, '01-02-SUMMARY.md'),
      '---\nphase: 01\ntech-stack:\n  added: [typescript]\n  patterns: [pattern-b]\n---\n\n## Accomplishments\n- B\n',
      'utf-8'
    );
    // Recent phase 02 with same vocab union — drift should be 0
    writePhase(projectDir, {
      num: '02',
      summaryFrontmatter: [
        'phase: 02',
        'tech-stack:',
        '  added: [node, typescript]',
        '  patterns: [pattern-a, pattern-b]',
      ].join('\n'),
      summaryBody: '## Accomplishments\n- C\n',
    });

    const r = computeOntologyDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    expect(r.score).toBe(0); // baseline union (node, typescript, pattern-a, pattern-b) == recent set
  });
});

// ─── Codex rescue r3 P2 regressions ───────────────────────────────────────

describe('codex r3 P2: ROADMAP heading levels', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('goal drift extracts a phase block under #### Phase (4 hashes)', () => {
    // The real .planning/ROADMAP.md uses milestone-nested 4-hash phase
    // headings. Pre-fix the regex matched only `### Phase`, so goalText
    // was null and goal drift reported insufficient_data.
    writeRoadmap(
      projectDir,
      [
        '# Roadmap',
        '',
        '## M1 v0.3',
        '',
        '### v0.3 milestone',
        '',
        '#### Phase 1: Test heading at H4',
        '- **Scope:**',
        '  - Implement signal handling',
        '  - Add graceful shutdown',
        '',
      ].join('\n')
    );
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01',
      summaryBody: '## Accomplishments\n- Implemented signal handling and graceful shutdown\n',
    });

    const r = computeGoalDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    // Pre-fix the heading was missed and score returned 0 with
    // sufficient_data:false. Now the block parses; assert a meaningful
    // (non-zero, not maxed) distance with high overlap.
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(0.8);
  });

  test('goal drift extracts a phase block under ## Phase (2 hashes, flat layout)', () => {
    writeRoadmap(
      projectDir,
      [
        '# Roadmap',
        '',
        '## Phase 1: Flat layout test',
        '- **Scope:**',
        '  - Foo bar baz',
        '',
      ].join('\n')
    );
    writePhase(projectDir, {
      num: '01',
      summaryFrontmatter: 'phase: 01',
      summaryBody: '## Accomplishments\n- Foo bar baz delivered\n',
    });
    const r = computeGoalDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    expect(r.score).toBeLessThan(0.8);
  });
});

describe('codex r3 P2: top-level patterns-established vocab', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('ontology drift picks up patterns-established at the top level', () => {
    // Real GRD summaries use top-level `patterns-established:` as a block
    // list — not nested under tech_stack. Pre-fix this source was ignored
    // entirely, dropping the drift signal.
    for (let i = 1; i <= 3; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: [
          `phase: ${num}`,
          'patterns-established:',
          '  - "Atomic task commits"',
          '  - "Version sync across files"',
        ].join('\n'),
        summaryBody: '## Accomplishments\n- baseline\n',
      });
    }
    for (let i = 4; i <= 6; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: [
          `phase: ${num}`,
          'patterns-established:',
          '  - "ML training loop"',
          '  - "Distributed eval"',
        ].join('\n'),
        summaryBody: '## Accomplishments\n- recent\n',
      });
    }
    const r = computeOntologyDrift(projectDir);
    expect(r.sufficient_data).toBe(true);
    expect(r.score).toBeGreaterThan(0.5); // disjoint patterns → high drift
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

// ─── isOntologyConverged (Tier-3 #10 + codex r1 P2 on PR #40) ─────────────

describe('isOntologyConverged', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  function writeMatchingPhases(count: number): void {
    for (let i = 1; i <= count; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: [
          `phase: ${num}`,
          'tech-stack:',
          '  added: [node, typescript]',
          '  patterns: [cli-pattern]',
        ].join('\n'),
        summaryBody: '## Accomplishments\n- Done\n',
      });
    }
  }

  test('refuses to declare convergence with < 2*recentK phases (codex r1 P2: overlap guard)', () => {
    // 3 phases with default recentK=3 → 2*3=6 required, fail gracefully.
    writeMatchingPhases(3);
    const r = isOntologyConverged(projectDir);
    expect(r.converged).toBe(false);
    expect(r.reason).toMatch(/non-overlapping|completed phases/);
  });

  test('declares convergence with >= 2*recentK matching phases', () => {
    writeMatchingPhases(6);
    const r = isOntologyConverged(projectDir);
    expect(r.converged).toBe(true);
    expect(r.similarity).toBeGreaterThanOrEqual(0.95);
    expect(r.threshold).toBe(0.95);
  });

  test('refuses to declare convergence when similarity below threshold', () => {
    // 6 phases but baseline and recent have disjoint vocab → similarity 0.
    for (let i = 1; i <= 3; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: `phase: ${num}\ntech-stack:\n  added: [node]\n  patterns: [old-pattern]\n`,
        summaryBody: '## Accomplishments\n- baseline\n',
      });
    }
    for (let i = 4; i <= 6; i++) {
      const num = String(i).padStart(2, '0');
      writePhase(projectDir, {
        num,
        summaryFrontmatter: `phase: ${num}\ntech-stack:\n  added: [python]\n  patterns: [new-pattern]\n`,
        summaryBody: '## Accomplishments\n- recent\n',
      });
    }
    const r = isOntologyConverged(projectDir);
    expect(r.converged).toBe(false);
    expect(r.reason).toMatch(/similarity .* < /);
  });

  test('threshold parameter overrides default', () => {
    writeMatchingPhases(6);
    const r = isOntologyConverged(projectDir, 0.5);
    expect(r.converged).toBe(true);
    expect(r.threshold).toBe(0.5);
  });
});

// ─── config.drift wiring (codex r1 P2 on PR #38) ──────────────────────────
// loadConfig() previously dropped unknown top-level keys, so a `drift`
// block in .planning/config.json never reached computeDriftScore. This
// test guards both halves: (1) the key is recognised (no warning), and
// (2) the parsed value is preserved on GrdConfig and passed to drift.

describe('config.drift end-to-end wiring', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = makeProject();
  });
  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  test('drift block in .planning/config.json reaches loadConfig output', () => {
    const { loadConfig } = require('../../lib/utils');
    const cfgPath = path.join(projectDir, '.planning', 'config.json');
    const driftBlock = {
      weights: { goal: 0.6, constraint: 0.2, ontology: 0.2 },
      threshold: 0.4,
    };
    fs.writeFileSync(cfgPath, JSON.stringify({ drift: driftBlock }, null, 2), 'utf-8');

    // Should not emit "Unrecognized config key" warning.
    let stderrCapture = '';
    const origWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      stderrCapture += String(chunk);
      return true;
    }) as typeof process.stderr.write;
    let config;
    try {
      config = loadConfig(projectDir);
    } finally {
      process.stderr.write = origWrite;
    }
    expect(stderrCapture).not.toMatch(/Unrecognized config key "drift"/);
    expect(config.drift).toEqual(driftBlock);
  });
});
