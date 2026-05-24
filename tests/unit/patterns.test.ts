/**
 * Unit tests for lib/commands/patterns.ts (v0.4 Phase 5).
 *
 * Covers:
 *   - isConfirmed verdict parsing
 *   - binomTwoSidedP exact two-sided binomial p-value
 *   - benjaminiHochberg FDR adjustment (order-preserving, monotone)
 *   - computeTokenStats statistical floor (n>=10, effect_size>=0.20,
 *     raw p<0.05, BH-FDR q<0.10)
 *   - synthetic-null corpus: uniform-random verdicts → <=1 false positive
 *     across 10 runs (the phase reflection's falsifiable claim)
 *   - scanReflections over VERIFICATION.md + sibling PLAN.md vocab
 *   - cmdPatterns: dry-run default, --apply requires --yes, writes to
 *     GENOME-SUGGESTIONS.md, GENOME.md byte-identical
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const os = require('os') as typeof import('os');
const { captureOutput, captureError } = require('../helpers/setup') as {
  captureOutput: (fn: () => void) => { stdout: string; exitCode: number };
  captureError: (fn: () => void) => { stderr: string; exitCode: number };
};

const {
  isConfirmed,
  scanReflections,
  binomTwoSidedP,
  benjaminiHochberg,
  computeTokenStats,
  cmdPatterns,
}: {
  isConfirmed: (verdict: string) => boolean;
  scanReflections: (cwd: string) => Array<{
    source: string;
    verdict: string;
    confirmed: boolean;
    vocabulary: Set<string>;
  }>;
  binomTwoSidedP: (k: number, n: number, p0: number) => number;
  benjaminiHochberg: (pvalues: number[]) => number[];
  computeTokenStats: (
    reflections: Array<{ confirmed: boolean; vocabulary: Set<string> }>,
    opts: { minOccurrences: number; effectSize: number; fdrQ: number }
  ) => {
    baseline: number;
    stats: Array<{ token: string; n: number; significant: boolean; effect_size: number }>;
  };
  cmdPatterns: (
    cwd: string,
    opts: {
      minOccurrences?: number;
      effectSize?: number;
      fdrQ?: number;
      apply?: boolean;
      yes?: boolean;
    },
    raw: boolean
  ) => void;
} = require('../../lib/commands/patterns');

// ─── isConfirmed ────────────────────────────────────────────────────────────

describe('isConfirmed', () => {
  test('affirmative verdicts → true', () => {
    for (const v of ['confirmed', 'CONFIRMED', 'validated', 'pass', 'passed', 'holds']) {
      expect(isConfirmed(v)).toBe(true);
    }
  });

  test('negative / non-affirmative verdicts → false', () => {
    for (const v of ['falsified', 'refuted', 'not confirmed', 'unconfirmed', 'partial', 'failed']) {
      expect(isConfirmed(v)).toBe(false);
    }
  });
});

// ─── binomTwoSidedP ────────────────────────────────────────────────────────

describe('binomTwoSidedP', () => {
  test('observed == expected → p near 1', () => {
    expect(binomTwoSidedP(5, 10, 0.5)).toBeGreaterThan(0.9);
  });

  test('extreme deviation → small p', () => {
    // 19/20 confirmed vs baseline 0.5 is highly unlikely.
    expect(binomTwoSidedP(19, 20, 0.5)).toBeLessThan(0.001);
  });

  test('degenerate baseline (0 or 1) → p = 1', () => {
    expect(binomTwoSidedP(3, 10, 0)).toBe(1);
    expect(binomTwoSidedP(3, 10, 1)).toBe(1);
  });

  test('n=0 → p = 1', () => {
    expect(binomTwoSidedP(0, 0, 0.5)).toBe(1);
  });

  test('p-value is in [0, 1]', () => {
    for (let k = 0; k <= 15; k++) {
      const p = binomTwoSidedP(k, 15, 0.4);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

// ─── benjaminiHochberg ─────────────────────────────────────────────────────

describe('benjaminiHochberg', () => {
  test('empty input → empty output', () => {
    expect(benjaminiHochberg([])).toEqual([]);
  });

  test('preserves input order', () => {
    const q = benjaminiHochberg([0.04, 0.01, 0.03]);
    expect(q.length).toBe(3);
    // q for the smallest raw p (0.01 at index 1) should be the smallest.
    expect(q[1]).toBeLessThanOrEqual(q[0]);
    expect(q[1]).toBeLessThanOrEqual(q[2]);
  });

  test('q-values are >= raw p and clamped to <= 1', () => {
    const ps = [0.001, 0.5, 0.9, 0.02];
    const q = benjaminiHochberg(ps);
    for (let i = 0; i < ps.length; i++) {
      expect(q[i]).toBeGreaterThanOrEqual(ps[i] - 1e-9);
      expect(q[i]).toBeLessThanOrEqual(1);
    }
  });

  test('single p-value → q equals p (m/rank = 1)', () => {
    expect(benjaminiHochberg([0.03])[0]).toBeCloseTo(0.03, 9);
  });
});

// ─── computeTokenStats statistical floor ───────────────────────────────────

function reflectionsWithToken(opts: {
  token: string;
  withTokenConfirmed: number;
  withTokenTotal: number;
  withoutConfirmed: number;
  withoutTotal: number;
}): Array<{ confirmed: boolean; vocabulary: Set<string> }> {
  const out: Array<{ confirmed: boolean; vocabulary: Set<string> }> = [];
  // Each "without" reflection gets a unique filler token so it never crosses
  // the min-occurrences floor and pollutes the test token's stats.
  for (let i = 0; i < opts.withTokenTotal; i++) {
    out.push({
      confirmed: i < opts.withTokenConfirmed,
      vocabulary: new Set([opts.token, 'sharedfiller']),
    });
  }
  for (let i = 0; i < opts.withoutTotal; i++) {
    out.push({
      confirmed: i < opts.withoutConfirmed,
      vocabulary: new Set([`unique${i}`, 'sharedfiller']),
    });
  }
  return out;
}

describe('computeTokenStats — statistical floor', () => {
  test('n=9 token is never significant (below occurrence floor)', () => {
    const refs = reflectionsWithToken({
      token: 'refactor',
      withTokenConfirmed: 9,
      withTokenTotal: 9, // only 9 occurrences
      withoutConfirmed: 5,
      withoutTotal: 30,
    });
    const { stats } = computeTokenStats(refs, { minOccurrences: 10, effectSize: 0.2, fdrQ: 0.1 });
    const refactor = stats.find((s) => s.token === 'refactor');
    expect(refactor).toBeUndefined(); // not even tested
  });

  test('n=10 with strong skew AND effect size AND FDR → significant', () => {
    // Token: 10/10 confirmed. Baseline pulled low by many unconfirmed others.
    const refs = reflectionsWithToken({
      token: 'refactor',
      withTokenConfirmed: 10,
      withTokenTotal: 10,
      withoutConfirmed: 4,
      withoutTotal: 40,
    });
    const { stats, baseline } = computeTokenStats(refs, {
      minOccurrences: 10,
      effectSize: 0.2,
      fdrQ: 0.1,
    });
    const refactor = stats.find((s) => s.token === 'refactor')!;
    expect(refactor).toBeDefined();
    expect(refactor.effect_size).toBeGreaterThanOrEqual(0.2);
    expect(refactor.significant).toBe(true);
    // baseline = (10+4)/50 = 0.28; token rate 1.0 → effect 0.72.
    expect(baseline).toBeCloseTo(14 / 50, 5);
  });

  test('n=10 but effect size below 0.20 → not significant', () => {
    // Token rate ~ baseline → tiny effect size.
    const refs = reflectionsWithToken({
      token: 'refactor',
      withTokenConfirmed: 6,
      withTokenTotal: 10, // rate 0.6
      withoutConfirmed: 24,
      withoutTotal: 40, // rate 0.6 → baseline ~0.6, effect ~0
    });
    const { stats } = computeTokenStats(refs, { minOccurrences: 10, effectSize: 0.2, fdrQ: 0.1 });
    const refactor = stats.find((s) => s.token === 'refactor')!;
    expect(refactor.effect_size).toBeLessThan(0.2);
    expect(refactor.significant).toBe(false);
  });

  test('empty corpus → baseline 0, no stats', () => {
    const { baseline, stats } = computeTokenStats([], {
      minOccurrences: 10,
      effectSize: 0.2,
      fdrQ: 0.1,
    });
    expect(baseline).toBe(0);
    expect(stats).toEqual([]);
  });
});

// ─── synthetic-null corpus (the phase's falsifiable claim) ──────────────────

describe('computeTokenStats — synthetic null corpus', () => {
  test('uniform-random verdicts yield <=1 false positive across 10 runs', () => {
    // Deterministic LCG so the test is reproducible.
    let seed = 1234567;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let totalFalsePositives = 0;
    const VOCAB = Array.from({ length: 20 }, (_, i) => `tok${i}`);
    for (let run = 0; run < 10; run++) {
      const refs: Array<{ confirmed: boolean; vocabulary: Set<string> }> = [];
      for (let i = 0; i < 100; i++) {
        // Each reflection gets a random subset of the shared vocab + random verdict.
        const vocab = new Set<string>();
        for (const t of VOCAB) if (rand() < 0.5) vocab.add(t);
        refs.push({ confirmed: rand() < 0.5, vocabulary: vocab });
      }
      const { stats } = computeTokenStats(refs, {
        minOccurrences: 10,
        effectSize: 0.2,
        fdrQ: 0.1,
      });
      totalFalsePositives += stats.filter((s) => s.significant).length;
    }
    // Under a true null, BH-FDR at q<0.10 should keep spurious hits very low.
    expect(totalFalsePositives).toBeLessThanOrEqual(1);
  });
});

// ─── scanReflections ───────────────────────────────────────────────────────

function makeVerificationFixture(): { cwd: string; phaseDir: string } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-patterns-'));
  const phaseDir = path.join(cwd, '.planning', 'milestones', 'v0.4', 'phases', '01-test');
  fs.mkdirSync(phaseDir, { recursive: true });
  return { cwd, phaseDir };
}

function writeVerification(phaseDir: string, verdict: string): void {
  fs.writeFileSync(
    path.join(phaseDir, 'VERIFICATION.md'),
    `# Verification\n\n<reflection>\n\`\`\`yaml\nhypothesis: "x"\nactual_outcome: "y"\nverdict: ${verdict}\n\`\`\`\n</reflection>\n`
  );
}

describe('scanReflections', () => {
  test('parses verdict + sibling PLAN.md vocabulary', () => {
    const { cwd, phaseDir } = makeVerificationFixture();
    try {
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN.md'),
        '---\nphase: "1"\n---\n# Plan\n\nrefactor the parser tokenizer module'
      );
      writeVerification(phaseDir, 'confirmed');
      const refs = scanReflections(cwd);
      expect(refs.length).toBe(1);
      expect(refs[0].confirmed).toBe(true);
      expect(refs[0].vocabulary.has('refactor')).toBe(true);
      expect(refs[0].vocabulary.has('parser')).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('falsified verdict → confirmed false', () => {
    const { cwd, phaseDir } = makeVerificationFixture();
    try {
      fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '---\nphase: "1"\n---\n# Plan\n\nbody');
      writeVerification(phaseDir, 'falsified');
      const refs = scanReflections(cwd);
      expect(refs.length).toBe(1);
      expect(refs[0].confirmed).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('empty .planning → no reflections', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-patterns-empty-'));
    fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    try {
      expect(scanReflections(cwd)).toEqual([]);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('falls back to PLAN-N.md vocabulary when no resolved PLAN.md', () => {
    const { cwd, phaseDir } = makeVerificationFixture();
    try {
      // No PLAN.md — only an unresolved candidate PLAN-1.md.
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN-1.md'),
        '---\nphase: "1"\n---\n# Plan\n\nclustering vocabulary primitive'
      );
      writeVerification(phaseDir, 'confirmed');
      const refs = scanReflections(cwd);
      expect(refs.length).toBe(1);
      expect(refs[0].vocabulary.has('clustering')).toBe(true);
      expect(refs[0].vocabulary.has('vocabulary')).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('prefixed VERIFICATION.md (NN-VERIFICATION.md) is scanned', () => {
    const { cwd, phaseDir } = makeVerificationFixture();
    try {
      fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '---\nphase: "1"\n---\n# Plan\n\nbody');
      fs.writeFileSync(
        path.join(phaseDir, '01-VERIFICATION.md'),
        '# V\n\n<reflection>\n```yaml\nverdict: confirmed\n```\n</reflection>\n'
      );
      const refs = scanReflections(cwd);
      expect(refs.length).toBe(1);
      expect(refs[0].confirmed).toBe(true);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

// ─── cmdPatterns CLI ────────────────────────────────────────────────────────

describe('cmdPatterns — CLI', () => {
  test('dry-run on empty tree exits 0 with empty suggestions', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-patterns-cli-'));
    fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    try {
      const { stdout, exitCode } = captureOutput(() => cmdPatterns(cwd, {}, false));
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.suggestions).toEqual([]);
      expect(result.applied).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('--apply without --yes refuses (exit 1)', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-patterns-noyes-'));
    fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
    try {
      const { stderr, exitCode } = captureError(() => cmdPatterns(cwd, { apply: true }, false));
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/--apply requires --yes/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('--apply --yes writes GENOME-SUGGESTIONS.md; GENOME.md byte-identical', () => {
    // Build a corpus with one clearly-significant token.
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-patterns-apply-'));
    try {
      // 20 phases: 12 contain "refactor" (all confirmed), 8 others (all
      // falsified) — baseline 0.6, token rate 1.0, n=12, effect 0.4,
      // two-sided binomial p ≈ 0.0025, passes FDR.
      for (let i = 1; i <= 20; i++) {
        const phaseDir = path.join(
          cwd,
          '.planning',
          'milestones',
          'v0.4',
          'phases',
          `${String(i).padStart(2, '0')}-p`
        );
        fs.mkdirSync(phaseDir, { recursive: true });
        const hasRefactor = i <= 12;
        fs.writeFileSync(
          path.join(phaseDir, 'PLAN.md'),
          `---\nphase: "${i}"\n---\n# Plan\n\n${hasRefactor ? 'refactor parser tokenizer' : 'frontend rendering canvas'} distinctword${i}`
        );
        writeVerification(phaseDir, hasRefactor ? 'confirmed' : 'falsified');
      }
      // Pre-existing GENOME.md must NOT be touched.
      const genomePath = path.join(cwd, '.planning', 'GENOME.md');
      fs.writeFileSync(genomePath, '# GENOME\n\nprescriptive heuristics only\n');
      const before = fs.readFileSync(genomePath, 'utf-8');

      const { stdout, exitCode } = captureOutput(() =>
        cmdPatterns(cwd, { apply: true, yes: true }, false)
      );
      expect(exitCode).toBe(0);
      const result = JSON.parse(stdout);
      expect(result.applied).toBe(true);
      expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
      expect(result.suggestions.some((s: { token: string }) => s.token === 'refactor')).toBe(true);

      // Suggestions written to the SEPARATE file.
      const suggPath = path.join(cwd, '.planning', 'GENOME-SUGGESTIONS.md');
      expect(fs.existsSync(suggPath)).toBe(true);
      expect(fs.readFileSync(suggPath, 'utf-8')).toMatch(/refactor/);
      // GENOME.md untouched.
      expect(fs.readFileSync(genomePath, 'utf-8')).toBe(before);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
