/**
 * Unit tests for lib/commands/select-candidate.ts (v0.4 Phase 3).
 *
 * Covers the four extended axes + the pipeline orchestrator:
 *   - parseDeadEnds: slug + hypothesis + forbidden_terms extraction
 *   - checkDeadEnds: slug-citation hard-fail, forbidden_term hard-fail,
 *     Jaccard-only does NOT hard-fail (advisory only)
 *   - scoreMustHavesCoverage: full / partial / none
 *   - scoreVerificationCommands: pass-rate, absent field = 0, blocklist
 *   - estimateTokens: tiebreaker monotonicity
 *   - selectCandidate: end-to-end promotion + PLAN-SELECTION.json,
 *     DEAD-ENDS violator filtered, cost tiebreaker on parity
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
const os = require('os') as typeof import('os');
const { captureError } = require('../helpers/setup') as {
  captureError: (fn: () => void) => { stderr: string; exitCode: number };
};

const {
  parseDeadEnds,
  checkDeadEnds,
  scoreMustHavesCoverage,
  scoreVerificationCommands,
  estimateTokens,
  selectCandidate,
}: {
  parseDeadEnds: (content: string) => Array<{
    slug: string;
    hypothesis: string;
    forbidden_terms: string[];
  }>;
  checkDeadEnds: (
    text: string,
    deadEnds: Array<{ slug: string; hypothesis: string; forbidden_terms: string[] }>
  ) => {
    hardFail: { kind: string; dead_end_slug: string; matched: string } | null;
    advisory: Array<{ dead_end_slug: string; jaccard: number }>;
  };
  scoreMustHavesCoverage: (
    text: string,
    fm: Record<string, unknown>,
    requirementsText: string | null
  ) => number;
  scoreVerificationCommands: (
    fm: Record<string, unknown>,
    cwd: string,
    enabled: boolean
  ) => number;
  estimateTokens: (text: string) => number;
  selectCandidate: (
    cwd: string,
    phaseNum: string,
    opts?: {
      dryRun?: boolean;
      milestone?: string;
      force?: boolean;
      runVerificationCommands?: boolean;
    }
  ) => {
    winner: { relPath: string; total_score: number } | null;
    candidates: Array<{ relPath: string; total_score: number; hard_fail: unknown }>;
    promoted_to: string | null;
  };
} = require('../../lib/commands/select-candidate');

// ─── Fixtures ──────────────────────────────────────────────────────────────

const DEAD_ENDS_FIXTURE = `# Falsified approaches

## elo-rated-plan-tournament

\`\`\`yaml
slug: elo-rated-plan-tournament
hypothesis: "Adopting an Elo-rated tournament over candidate plans would improve selection quality."
forbidden_terms:
  - "elo tournament"
  - "elo-rated"
dead_end_added_via: manual
\`\`\`

## meta-review-agent-with-write-access

\`\`\`yaml
slug: meta-review-agent-with-write-access
hypothesis: "An LLM meta-reviewer agent writing prescriptive heuristics to GENOME compounds learning."
forbidden_terms:
  - "meta-reviewer agent"
  - "auto-write to genome"
dead_end_added_via: manual
\`\`\`
`;

function makePlan(opts: {
  filesModified?: string[];
  body?: string;
  verificationCommands?: string[];
  hypothesis?: string;
}): string {
  const fm: string[] = ['---', 'phase: "1"', 'plan: "01-01"', 'type: feature', 'wave: 1'];
  fm.push('depends_on: []');
  if (opts.filesModified) {
    fm.push('files_modified:');
    for (const f of opts.filesModified) fm.push(`  - ${f}`);
  } else {
    fm.push('files_modified: []');
  }
  fm.push('autonomous: true');
  fm.push('must_haves:');
  fm.push('  artifacts: []');
  fm.push(`hypothesis: "${opts.hypothesis ?? 'test hypothesis'}"`);
  fm.push('predicted_outcome: "test outcome"');
  if (opts.verificationCommands) {
    fm.push('verification_commands:');
    for (const c of opts.verificationCommands) fm.push(`  - "${c}"`);
  }
  fm.push('---');
  fm.push('');
  fm.push(opts.body ?? '# Plan\n\nbody');
  return fm.join('\n');
}

function makePhaseFixture(): { cwd: string; phaseDir: string } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-select-'));
  fs.mkdirSync(path.join(cwd, '.planning'), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, '.planning', 'STATE.md'),
    '---\ncurrent_milestone: v0.4\n---\n# State\n'
  );
  fs.writeFileSync(
    path.join(cwd, '.planning', 'ROADMAP.md'),
    '# Roadmap\n\n- v0.4 Test Milestone (in progress)\n\n## Phase 1: Test\n'
  );
  fs.writeFileSync(path.join(cwd, '.planning', 'DEAD-ENDS.md'), DEAD_ENDS_FIXTURE);
  const phaseDir = path.join(cwd, '.planning', 'milestones', 'v0.4', 'phases', '01-test');
  fs.mkdirSync(phaseDir, { recursive: true });
  return { cwd, phaseDir };
}

// ─── parseDeadEnds ─────────────────────────────────────────────────────────

describe('parseDeadEnds', () => {
  test('extracts slug, hypothesis, forbidden_terms for each entry', () => {
    const entries = parseDeadEnds(DEAD_ENDS_FIXTURE);
    expect(entries.length).toBe(2);
    expect(entries[0].slug).toBe('elo-rated-plan-tournament');
    expect(entries[0].forbidden_terms).toEqual(['elo tournament', 'elo-rated']);
    expect(entries[1].slug).toBe('meta-review-agent-with-write-access');
    expect(entries[1].hypothesis).toMatch(/meta-reviewer/);
  });

  test('returns empty array on content with no entries', () => {
    expect(parseDeadEnds('# Empty\n\nNo entries here.')).toEqual([]);
  });
});

// ─── checkDeadEnds ─────────────────────────────────────────────────────────

describe('checkDeadEnds', () => {
  const deadEnds = parseDeadEnds(DEAD_ENDS_FIXTURE);

  test('slug citation triggers hard-fail', () => {
    const res = checkDeadEnds('we will use the elo-rated-plan-tournament approach', deadEnds);
    expect(res.hardFail).not.toBeNull();
    expect(res.hardFail!.kind).toBe('slug_citation');
    expect(res.hardFail!.dead_end_slug).toBe('elo-rated-plan-tournament');
  });

  test('forbidden_term exact match (case-insensitive) triggers hard-fail', () => {
    const res = checkDeadEnds('Our plan adds an ELO Tournament over candidates', deadEnds);
    expect(res.hardFail).not.toBeNull();
    expect(res.hardFail!.kind).toBe('forbidden_term');
    expect(res.hardFail!.matched).toBe('elo tournament');
  });

  test('Jaccard vocabulary overlap alone does NOT hard-fail (advisory only)', () => {
    // Heavy vocabulary overlap with the elo hypothesis but no slug/forbidden term.
    const text =
      'Adopting a rated ranking over candidate plans would improve selection quality measurably.';
    const res = checkDeadEnds(text, deadEnds);
    expect(res.hardFail).toBeNull();
    // Advisory may or may not fire depending on threshold; assert it never
    // escalates to a hard-fail regardless.
  });

  test('clean candidate: no hard-fail, no advisory', () => {
    const res = checkDeadEnds('A straightforward refactor of the parser module.', deadEnds);
    expect(res.hardFail).toBeNull();
    expect(res.advisory.length).toBe(0);
  });

  test('slug citation is case-insensitive (codex P2)', () => {
    const res = checkDeadEnds('We adopt Elo-Rated-Plan-Tournament here', deadEnds);
    expect(res.hardFail).not.toBeNull();
    expect(res.hardFail!.kind).toBe('slug_citation');
  });

  test('slug as a fragment of a larger token does NOT false-positive (word boundary)', () => {
    // Use the meta-review slug, whose forbidden_terms ("meta-reviewer agent",
    // "auto-write to genome") are NOT substrings of the slug — so embedding
    // the slug inside a longer token must not trip slug OR forbidden_term.
    const res = checkDeadEnds('xmeta-review-agent-with-write-accessx is unrelated', deadEnds);
    expect(res.hardFail).toBeNull();
  });

  test('slug bounded by punctuation still confesses', () => {
    const res = checkDeadEnds('see (elo-rated-plan-tournament).', deadEnds);
    expect(res.hardFail).not.toBeNull();
    expect(res.hardFail!.kind).toBe('slug_citation');
  });
});

// ─── scoreMustHavesCoverage ────────────────────────────────────────────────

describe('scoreMustHavesCoverage', () => {
  const reqs = `# Requirements

\`\`\`yaml
must_haves:
  artifacts:
    - lib/foo.ts
    - lib/bar.ts
\`\`\`
`;

  test('full coverage: +1 per artifact', () => {
    const score = scoreMustHavesCoverage(
      'mentions lib/foo.ts and lib/bar.ts',
      { files_modified: ['lib/foo.ts', 'lib/bar.ts'] },
      reqs
    );
    expect(score).toBe(2);
  });

  test('partial coverage: +1 found, -10 missing', () => {
    const score = scoreMustHavesCoverage(
      'mentions lib/foo.ts only',
      { files_modified: ['lib/foo.ts'] },
      reqs
    );
    expect(score).toBe(1 - 10);
  });

  test('no requirements text → score 0', () => {
    expect(scoreMustHavesCoverage('anything', {}, null)).toBe(0);
  });

  test('requirements with no artifacts list → score 0', () => {
    expect(scoreMustHavesCoverage('anything', {}, '# Requirements\n\nNo must_haves.')).toBe(0);
  });
});

// ─── scoreVerificationCommands ─────────────────────────────────────────────

describe('scoreVerificationCommands', () => {
  test('disabled (enabled=false) → score 0, runs nothing', () => {
    expect(scoreVerificationCommands({ verification_commands: ['node -e ""'] }, process.cwd(), false)).toBe(0);
  });

  test('no verification_commands field → score 0 even when enabled', () => {
    expect(scoreVerificationCommands({}, process.cwd(), true)).toBe(0);
  });

  test('allowlisted commands that pass → score 10', () => {
    const score = scoreVerificationCommands(
      { verification_commands: ['node -e ""', 'node -e ""'] },
      process.cwd(),
      true
    );
    expect(score).toBe(10);
  });

  test('half pass → score 5 (node exit 0 vs node exit 1)', () => {
    const score = scoreVerificationCommands(
      { verification_commands: ['node -e ""', 'node -e process.exit(1)'] },
      process.cwd(),
      true
    );
    expect(score).toBe(5);
  });

  test('non-allowlisted binary counts as failure (true is not allowlisted)', () => {
    const score = scoreVerificationCommands(
      { verification_commands: ['true', 'node -e ""'] },
      process.cwd(),
      true
    );
    expect(score).toBe(5); // `true` not allowlisted (fail), node passes → 1/2
  });

  test('absolute-path binary is rejected (allowlist bypass blocked)', () => {
    const score = scoreVerificationCommands(
      { verification_commands: ['/bin/echo hi', 'node -e ""'] },
      process.cwd(),
      true
    );
    expect(score).toBe(5); // /bin/echo rejected (path separator), node passes
  });

  test('relative-path binary is rejected', () => {
    const score = scoreVerificationCommands(
      { verification_commands: ['./rm -rf x'] },
      process.cwd(),
      true
    );
    expect(score).toBe(0); // ./rm rejected → 0/1
  });
});

// ─── estimateTokens ────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  test('monotonic in word count', () => {
    expect(estimateTokens('a b c')).toBeLessThan(estimateTokens('a b c d e f'));
  });

  test('empty text → 0', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

// ─── selectCandidate (pipeline) ────────────────────────────────────────────

describe('selectCandidate — pipeline', () => {
  test('promotes highest scorer to PLAN.md + writes PLAN-SELECTION.json', () => {
    const { cwd, phaseDir } = makePhaseFixture();
    try {
      // Candidate 1: complete frontmatter. Candidate 2: missing hypothesis (lower).
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN-1.md'),
        makePlan({ filesModified: ['lib/a.ts'], hypothesis: 'strong testable claim' })
      );
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN-2.md'),
        '---\nphase: "1"\n---\n# Sparse plan\n'
      );
      const result = selectCandidate(cwd, '1');
      expect(result.winner).not.toBeNull();
      expect(result.winner!.relPath).toMatch(/PLAN-1\.md$/);
      expect(fs.existsSync(path.join(phaseDir, 'PLAN.md'))).toBe(true);
      const audit = JSON.parse(
        fs.readFileSync(path.join(phaseDir, 'PLAN-SELECTION.json'), 'utf-8')
      );
      expect(audit.candidates.length).toBe(2);
      expect(audit.winner).toMatch(/PLAN-1\.md$/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('DEAD-ENDS violator is filtered; clean candidate wins', () => {
    const { cwd, phaseDir } = makePhaseFixture();
    try {
      // Candidate 1 cites a DEAD-ENDS slug → hard-fail.
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN-1.md'),
        makePlan({
          filesModified: ['lib/a.ts'],
          body: '# Plan\n\nUse the elo-rated-plan-tournament mechanism for ranking.',
        })
      );
      // Candidate 2 is clean.
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN-2.md'),
        makePlan({ filesModified: ['lib/b.ts'], hypothesis: 'clean deterministic approach' })
      );
      const result = selectCandidate(cwd, '1');
      expect(result.winner).not.toBeNull();
      expect(result.winner!.relPath).toMatch(/PLAN-2\.md$/);
      const c1 = result.candidates.find((c) => c.relPath.endsWith('PLAN-1.md'))!;
      expect(c1.total_score).toBe(-Infinity);
      expect(c1.hard_fail).not.toBeNull();
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('all candidates hard-failed → no winner, no PLAN.md', () => {
    const { cwd, phaseDir } = makePhaseFixture();
    try {
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN-1.md'),
        makePlan({ body: 'Use elo-rated-plan-tournament' })
      );
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN-2.md'),
        makePlan({ body: 'Add a meta-reviewer agent that writes to GENOME' })
      );
      const result = selectCandidate(cwd, '1');
      expect(result.winner).toBeNull();
      expect(result.promoted_to).toBeNull();
      expect(fs.existsSync(path.join(phaseDir, 'PLAN.md'))).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('dry-run does not write PLAN.md or PLAN-SELECTION.json', () => {
    const { cwd, phaseDir } = makePhaseFixture();
    try {
      fs.writeFileSync(path.join(phaseDir, 'PLAN-1.md'), makePlan({ filesModified: ['lib/a.ts'] }));
      fs.writeFileSync(path.join(phaseDir, 'PLAN-2.md'), makePlan({ filesModified: ['lib/b.ts'] }));
      const result = selectCandidate(cwd, '1', { dryRun: true });
      expect(result.winner).not.toBeNull();
      expect(result.promoted_to).toBeNull();
      expect(fs.existsSync(path.join(phaseDir, 'PLAN.md'))).toBe(false);
      expect(fs.existsSync(path.join(phaseDir, 'PLAN-SELECTION.json'))).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('refuses to overwrite an existing PLAN.md without --force (codex P2)', () => {
    const { cwd, phaseDir } = makePhaseFixture();
    try {
      fs.writeFileSync(path.join(phaseDir, 'PLAN-1.md'), makePlan({ filesModified: ['lib/a.ts'] }));
      fs.writeFileSync(path.join(phaseDir, 'PLAN-2.md'), makePlan({ filesModified: ['lib/b.ts'] }));
      fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# pre-existing resolved plan\n');
      const { stderr, exitCode } = captureError(() => selectCandidate(cwd, '1'));
      expect(exitCode).toBe(1);
      expect(stderr).toMatch(/already exists.*Refusing to overwrite/);
      // PLAN.md must be untouched.
      expect(fs.readFileSync(path.join(phaseDir, 'PLAN.md'), 'utf-8')).toBe(
        '# pre-existing resolved plan\n'
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('--force overwrites an existing PLAN.md', () => {
    const { cwd, phaseDir } = makePhaseFixture();
    try {
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN-1.md'),
        makePlan({ filesModified: ['lib/a.ts'], hypothesis: 'forced winner' })
      );
      fs.writeFileSync(path.join(phaseDir, 'PLAN-2.md'), makePlan({ filesModified: ['lib/b.ts'] }));
      fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), '# stale\n');
      const result = selectCandidate(cwd, '1', { force: true });
      expect(result.winner).not.toBeNull();
      expect(fs.readFileSync(path.join(phaseDir, 'PLAN.md'), 'utf-8')).not.toBe('# stale\n');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('verification_commands axis stays off by default during selection', () => {
    const { cwd, phaseDir } = makePhaseFixture();
    try {
      // A candidate with verification_commands that would fail if run; since
      // the axis is off by default, the score must not reflect any run.
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN-1.md'),
        makePlan({
          filesModified: ['lib/a.ts'],
          verificationCommands: ['node -e process.exit(1)'],
          hypothesis: 'has verification commands',
        })
      );
      fs.writeFileSync(path.join(phaseDir, 'PLAN-2.md'), makePlan({ filesModified: ['lib/b.ts'] }));
      const result = selectCandidate(cwd, '1');
      const c1 = result.candidates.find((c) => c.relPath.endsWith('PLAN-1.md'))!;
      // Axis off → verification_commands score 0, no execution.
      expect((c1 as unknown as { extended: { verification_commands: number } }).extended.verification_commands).toBe(0);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  test('cost tiebreaker: shorter plan wins on score parity', () => {
    const { cwd, phaseDir } = makePhaseFixture();
    try {
      // Two identical-scoring plans; #2 has more padding → more tokens.
      const base = makePlan({ filesModified: ['lib/a.ts'], hypothesis: 'same claim' });
      fs.writeFileSync(path.join(phaseDir, 'PLAN-1.md'), base);
      fs.writeFileSync(
        path.join(phaseDir, 'PLAN-2.md'),
        base + '\n\n' + 'padding word '.repeat(500)
      );
      const result = selectCandidate(cwd, '1');
      // Equal base/must_haves/verification → tiebreaker picks fewer tokens (PLAN-1).
      expect(result.winner!.relPath).toMatch(/PLAN-1\.md$/);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
