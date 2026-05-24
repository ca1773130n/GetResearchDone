'use strict';

/**
 * Unit tests for lib/commands/plan-lint.ts — milestone PLAN.md drift
 * linter.
 *
 * Coverage:
 *  - Synthetic fixtures for each of the 4 drift categories.
 *  - Current v0.4 specs (post-r9 review) are treated as a "known-clean"
 *    baseline: the linter is allowed up to a small number of documented
 *    false positives, but must not regress unexpectedly.
 *  - CLI cmdPlanLint exit codes (0 clean / 1 issues / error on missing arg).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');

const {
  cmdPlanLint,
  runPlanLint,
  resolveMilestoneDir,
  discoverPhases,
  extractPhaseRanges,
  extractExclusionAssertions,
  extractDeclaredKnobs,
  extractTaskBlocks,
  extractRoadmapPhaseBullet,
  extractTechnicalTerms,
  extractConfigKeys,
  lintStaleText,
  lintOverPromise,
  lintSummaryDetail,
  lintScopeCreep,
} = require('../../lib/commands/plan-lint');

// ─── Fixture helpers ────────────────────────────────────────────────────────

interface SyntheticMilestone {
  cwd: string;
  cleanup(): void;
}

function makeMilestone(
  name: string,
  roadmap: string,
  phaseFiles: { slug: string; plan: string }[]
): SyntheticMilestone {
  const cwd: string = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-lint-'));
  const root: string = path.join(cwd, '.planning', 'milestones', name);
  fs.mkdirSync(path.join(root, 'phases'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ROADMAP.md'), roadmap);
  for (const pf of phaseFiles) {
    const dir: string = path.join(root, 'phases', pf.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'PLAN.md'), pf.plan);
  }
  return {
    cwd,
    cleanup: () => {
      try {
        fs.rmSync(cwd, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

// ─── extractPhaseRanges ─────────────────────────────────────────────────────

describe('extractPhaseRanges', () => {
  test('captures "phases 2-4" form', () => {
    const ranges = extractPhaseRanges('This phase is foundational for phases 2-4.');
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(2);
    expect(ranges[0].end).toBe(4);
  });

  test('captures multiple ranges', () => {
    const text = 'See phases 1-3.\nAlso phases 2 to 5.';
    const ranges = extractPhaseRanges(text);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].start).toBe(1);
    expect(ranges[0].end).toBe(3);
    expect(ranges[1].start).toBe(2);
    expect(ranges[1].end).toBe(5);
  });

  test('ignores "phase 4" (no range)', () => {
    const ranges = extractPhaseRanges('Phase 4 uses effort indirectly.');
    expect(ranges).toHaveLength(0);
  });
});

// ─── extractExclusionAssertions ─────────────────────────────────────────────

describe('extractExclusionAssertions', () => {
  test('captures "Phase 5 is independent"', () => {
    const out = extractExclusionAssertions('- **Phase 5** is independent of effort');
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].phase).toBe(5);
  });

  test('captures multi-phase list "Phase 3, Phase 4, and Phase 5 deliberately do NOT consume effort"', () => {
    const out = extractExclusionAssertions(
      'Phase 3, Phase 4, and Phase 5 deliberately do NOT consume effort in v0.4.'
    );
    const phases = out.map((e: { phase: number }) => e.phase).sort();
    expect(phases).toEqual(expect.arrayContaining([3, 4, 5]));
  });

  test('captures "Phase 3 does NOT use"', () => {
    const out = extractExclusionAssertions('Phase 3 does NOT use effort');
    expect(out.some((e: { phase: number }) => e.phase === 3)).toBe(true);
  });
});

// ─── Category 1: stale-text ─────────────────────────────────────────────────

describe('lintStaleText', () => {
  test('flags fixture where "phases 2-5" contradicts "Phase 5 is independent"', () => {
    const phase = {
      phase: '1',
      slug: '01-foo',
      planPath: '/tmp/PLAN.md',
      relPath: 'phases/01-foo/PLAN.md',
      content:
        '# Phase 1\n\nThis phase is foundational for phases 2-5.\n\n' +
        '- Phase 5 is independent of effort.\n',
    };
    const issues = lintStaleText(phase);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].category).toBe('stale_text');
    expect(issues[0].message).toMatch(/Phase 5/);
  });

  test('flags incompatible "phases 2-4" + "phases 2-5" in same file', () => {
    const phase = {
      phase: '1',
      slug: '01-foo',
      planPath: '/tmp/PLAN.md',
      relPath: 'phases/01-foo/PLAN.md',
      content: '# Phase 1\n\nUnblocks phases 2-4.\nAlso wires phases 2-5.\n',
    };
    const issues = lintStaleText(phase);
    expect(issues.some((i: { message: string }) => /Incompatible/.test(i.message))).toBe(true);
  });

  test('clean fixture produces no issues', () => {
    const phase = {
      phase: '1',
      slug: '01-foo',
      planPath: '/tmp/PLAN.md',
      relPath: 'phases/01-foo/PLAN.md',
      content: '# Phase 1\n\nUnblocks phases 2-4 cleanly.\n',
    };
    expect(lintStaleText(phase)).toEqual([]);
  });

  test('returns [] when content is null', () => {
    const phase = {
      phase: '1',
      slug: '01-foo',
      planPath: '/tmp/PLAN.md',
      relPath: 'phases/01-foo/PLAN.md',
      content: null,
    };
    expect(lintStaleText(phase)).toEqual([]);
  });
});

// ─── extractDeclaredKnobs / extractTaskBlocks ───────────────────────────────

describe('extractDeclaredKnobs', () => {
  test('parses knob table row names with backticks', () => {
    const md = [
      '| Knob | thrifty | balanced | deep |',
      '|---|---|---|---|',
      '| `candidates_per_plan_phase` | 1 | 3 | 7 |',
      '| `refinement_iters` | 1 | 2 | 5 |',
      '',
    ].join('\n');
    const knobs = extractDeclaredKnobs(md);
    expect(knobs.map((k: { name: string }) => k.name)).toEqual([
      'candidates_per_plan_phase',
      'refinement_iters',
    ]);
  });

  test('ignores tables whose header is not "Knob" or "Field"', () => {
    const md = [
      '| Phase | Status |',
      '|---|---|',
      '| 1 | done |',
      '',
    ].join('\n');
    expect(extractDeclaredKnobs(md)).toEqual([]);
  });
});

describe('extractTaskBlocks', () => {
  test('extracts inner content of <task> blocks', () => {
    const md =
      '<task name="a">do alpha</task>\nnot in task\n<task name="b">do `beta`</task>';
    const text = extractTaskBlocks(md);
    expect(text).toContain('do alpha');
    expect(text).toContain('do `beta`');
    expect(text).not.toContain('not in task');
  });
});

// ─── Category 2: over-promise ───────────────────────────────────────────────

describe('lintOverPromise', () => {
  test('flags declared knob with no consumer literal anywhere', () => {
    const phases = [
      {
        phase: '1',
        slug: '01-foo',
        planPath: '/tmp/01/PLAN.md',
        relPath: 'phases/01-foo/PLAN.md',
        content: [
          '| Knob | thrifty | balanced | deep |',
          '|---|---|---|---|',
          '| `candidates_per_plan_phase` | 1 | 3 | 7 |',
          '| `unused_knob_z` | 1 | 1 | 1 |',
          '',
          '<task name="t">use `candidates_per_plan_phase` here</task>',
        ].join('\n'),
      },
    ];
    const issues = lintOverPromise(phases);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('over_promise');
    expect(issues[0].message).toMatch(/unused_knob_z/);
  });

  test('no issues when every knob has a consumer in any phase task', () => {
    const phases = [
      {
        phase: '1',
        slug: '01-foo',
        planPath: '/tmp/01/PLAN.md',
        relPath: 'phases/01-foo/PLAN.md',
        content: [
          '| Knob | thrifty | balanced | deep |',
          '|---|---|---|---|',
          '| `candidates_per_plan_phase` | 1 | 3 | 7 |',
          '',
          '<task name="t">declared in phase 1</task>',
        ].join('\n'),
      },
      {
        phase: '2',
        slug: '02-bar',
        planPath: '/tmp/02/PLAN.md',
        relPath: 'phases/02-bar/PLAN.md',
        content:
          '<task name="t2">consumer: `candidates_per_plan_phase` lives here</task>',
      },
    ];
    expect(lintOverPromise(phases)).toEqual([]);
  });
});

// ─── extractRoadmapPhaseBullet / extractTechnicalTerms ──────────────────────

describe('extractRoadmapPhaseBullet', () => {
  test('finds checkbox bullet for phase 2', () => {
    const roadmap = [
      '## Phases',
      '',
      '- [ ] **Phase 1: foo** — does foo',
      '  with continuation',
      '- [ ] **Phase 2: bar** — does bar',
      '  with `baz_qux` mentioned',
      '- [ ] **Phase 3: qux** — does qux',
    ].join('\n');
    const bullet = extractRoadmapPhaseBullet(roadmap, '2');
    expect(bullet).not.toBeNull();
    expect(bullet.text).toContain('does bar');
    expect(bullet.text).toContain('baz_qux');
    expect(bullet.text).not.toContain('does qux');
  });

  test('returns null for missing phase', () => {
    expect(extractRoadmapPhaseBullet('no bullets here', '1')).toBeNull();
  });
});

describe('extractTechnicalTerms', () => {
  test('captures backticked identifiers and snake_case bare words', () => {
    const terms = extractTechnicalTerms(
      'Use `resolveEffortKnob` to compute candidates_per_plan_phase.'
    );
    expect(terms.has('resolveEffortKnob')).toBe(true);
    expect(terms.has('candidates_per_plan_phase')).toBe(true);
  });

  test('ignores plain English words', () => {
    const terms = extractTechnicalTerms('This is a normal sentence.');
    expect(terms.size).toBe(0);
  });
});

// ─── Category 3: summary-vs-detail ──────────────────────────────────────────

describe('lintSummaryDetail', () => {
  test('flags ROADMAP-only technical term missing from PLAN.md', () => {
    const roadmap = [
      '## Phases',
      '',
      '- [ ] **Phase 1: foo** — scales `candidates_per_plan_phase` and `refinement_iters`',
    ].join('\n');
    const phases = [
      {
        phase: '1',
        slug: '01-foo',
        planPath: '/tmp/01/PLAN.md',
        relPath: 'phases/01-foo/PLAN.md',
        content:
          '# Phase 1\n\nThis phase only mentions candidates_per_plan_phase, not the other one.\n',
      },
    ];
    const issues = lintSummaryDetail(roadmap, phases);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('summary_detail');
    expect(issues[0].message).toMatch(/refinement_iters/);
  });

  test('clean when all ROADMAP terms appear in PLAN.md', () => {
    const roadmap =
      '## Phases\n\n- [ ] **Phase 1: foo** — uses `magic_knob`\n';
    const phases = [
      {
        phase: '1',
        slug: '01-foo',
        planPath: '/tmp/01/PLAN.md',
        relPath: 'phases/01-foo/PLAN.md',
        content: 'PLAN mentions `magic_knob` explicitly.',
      },
    ];
    expect(lintSummaryDetail(roadmap, phases)).toEqual([]);
  });
});

// ─── extractConfigKeys / Category 4 ─────────────────────────────────────────

describe('extractConfigKeys', () => {
  test('extracts dotted config keys', () => {
    const keys = extractConfigKeys('Use config.foo.bar and config.baz here.');
    expect(keys.has('foo.bar')).toBe(true);
    expect(keys.has('baz')).toBe(true);
  });

  test('returns empty set on no-match input', () => {
    expect(extractConfigKeys('').size).toBe(0);
    expect(extractConfigKeys('nothing here').size).toBe(0);
  });
});

describe('lintScopeCreep', () => {
  test('flags PLAN.md config key not in ROADMAP scope', () => {
    const roadmap = '## Scope\n\nUses `config.effort` only.\n';
    const phases = [
      {
        phase: '1',
        slug: '01-foo',
        planPath: '/tmp/01/PLAN.md',
        relPath: 'phases/01-foo/PLAN.md',
        content:
          '# Phase 1\n\n<task>extend config.surprise_key.threshold here</task>',
      },
    ];
    const allowlist: ReadonlySet<string> = new Set(['effort']);
    const issues = lintScopeCreep(roadmap, phases, allowlist);
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].category).toBe('scope_creep');
    expect(issues[0].message).toMatch(/surprise_key/);
  });

  test('allowlist suppresses universal infra keys', () => {
    const roadmap = '## Scope\n\nUses effort.';
    const phases = [
      {
        phase: '1',
        slug: '01-foo',
        planPath: '/tmp/01/PLAN.md',
        relPath: 'phases/01-foo/PLAN.md',
        content: '<task>config.scheduler.idle_timeout_seconds bumped</task>',
      },
    ];
    const allowlist: ReadonlySet<string> = new Set(['scheduler']);
    expect(lintScopeCreep(roadmap, phases, allowlist)).toEqual([]);
  });

  test('roadmap-mentioned keys are not flagged', () => {
    const roadmap = 'Refers to config.tracker.kind\n';
    const phases = [
      {
        phase: '1',
        slug: '01-foo',
        planPath: '/tmp/01/PLAN.md',
        relPath: 'phases/01-foo/PLAN.md',
        content: '<task>set config.tracker.kind = github</task>',
      },
    ];
    expect(lintScopeCreep(roadmap, phases, new Set<string>())).toEqual([]);
  });
});

// ─── End-to-end: runPlanLint on synthetic fixtures ──────────────────────────

describe('runPlanLint end-to-end', () => {
  test('clean milestone returns 0 issues', () => {
    const m = makeMilestone(
      'v9.9-clean',
      [
        '# Milestone v9.9',
        '',
        '## Phases',
        '',
        '- [ ] **Phase 1: foo** — does `magic_knob` stuff',
      ].join('\n'),
      [
        {
          slug: '01-foo',
          plan: [
            '# Phase 1',
            '',
            '<task name="t">use `magic_knob` literal</task>',
            '',
            '| Knob | thrifty | balanced | deep |',
            '|---|---|---|---|',
            '| `magic_knob` | 1 | 3 | 7 |',
            '',
          ].join('\n'),
        },
      ]
    );
    try {
      const report = runPlanLint(m.cwd, 'v9.9-clean');
      expect(report.milestone).toBe('v9.9-clean');
      expect(report.files_scanned).toBe(2); // 1 PLAN + 1 ROADMAP
      expect(report.issues).toEqual([]);
    } finally {
      m.cleanup();
    }
  });

  test('dirty milestone surfaces multiple categories', () => {
    const m = makeMilestone(
      'v9.9-dirty',
      [
        '# Milestone v9.9 dirty',
        '',
        '## Phases',
        '',
        '- [ ] **Phase 1: foo** — scales `declared_knob` and `roadmap_only_term`',
      ].join('\n'),
      [
        {
          slug: '01-foo',
          plan: [
            '# Phase 1',
            '',
            'This phase is foundational for phases 2-5.',
            '',
            'Phase 5 is independent of effort.',
            '',
            '| Knob | thrifty | balanced | deep |',
            '|---|---|---|---|',
            '| `declared_knob` | 1 | 1 | 1 |',
            '| `orphan_knob` | 1 | 1 | 1 |',
            '',
            '<task name="t">use `declared_knob` and config.bogus.option_x</task>',
          ].join('\n'),
        },
      ]
    );
    try {
      const report = runPlanLint(m.cwd, 'v9.9-dirty');
      const cats = new Set(report.issues.map((i: { category: string }) => i.category));
      expect(cats.has('stale_text')).toBe(true);
      expect(cats.has('over_promise')).toBe(true);
      expect(cats.has('summary_detail')).toBe(true);
      expect(cats.has('scope_creep')).toBe(true);
    } finally {
      m.cleanup();
    }
  });

  test('throws clear error when milestone dir missing', () => {
    const tmp: string = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-lint-miss-'));
    try {
      expect(() => runPlanLint(tmp, 'v0.4')).toThrow(/Milestone not found/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─── Helper exports cover ───────────────────────────────────────────────────

describe('resolveMilestoneDir / discoverPhases', () => {
  test('resolveMilestoneDir returns null when missing', () => {
    const tmp: string = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-lint-res-'));
    try {
      expect(resolveMilestoneDir(tmp, 'nope')).toBeNull();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('discoverPhases ignores non-numeric directory names', () => {
    const tmp: string = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-lint-disc-'));
    const phasesDir: string = path.join(tmp, 'phases');
    fs.mkdirSync(path.join(phasesDir, 'not-a-phase'), { recursive: true });
    fs.mkdirSync(path.join(phasesDir, '01-real'), { recursive: true });
    fs.writeFileSync(path.join(phasesDir, '01-real', 'PLAN.md'), '# Phase 1\n');
    try {
      const phases = discoverPhases(tmp);
      expect(phases).toHaveLength(1);
      expect(phases[0].phase).toBe('1');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('discoverPhases returns [] when phases dir missing', () => {
    const tmp: string = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-lint-emp-'));
    try {
      expect(discoverPhases(tmp)).toEqual([]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─── cmdPlanLint (CLI entry) ────────────────────────────────────────────────

describe('cmdPlanLint', () => {
  test('exits 0 with summary on clean milestone (raw)', () => {
    const m = makeMilestone(
      'v9.9-cli-clean',
      '# Clean\n\n## Phases\n\n- [ ] **Phase 1: foo** — bar\n',
      [
        {
          slug: '01-foo',
          plan: '# Phase 1\n\n<task>nothing fancy</task>',
        },
      ]
    );
    try {
      const result = captureOutput(() => cmdPlanLint(m.cwd, 'v9.9-cli-clean', true));
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/clean/);
    } finally {
      m.cleanup();
    }
  });

  test('exits 1 when issues present', () => {
    const m = makeMilestone(
      'v9.9-cli-dirty',
      '# Dirty\n\n## Phases\n\n- [ ] **Phase 1: foo** — `roadmap_only_term`\n',
      [
        {
          slug: '01-foo',
          plan: '# Phase 1\n\n<task>nothing fancy</task>',
        },
      ]
    );
    try {
      const result = captureOutput(() => cmdPlanLint(m.cwd, 'v9.9-cli-dirty', false));
      expect(result.exitCode).toBe(1);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.issues.length).toBeGreaterThan(0);
    } finally {
      m.cleanup();
    }
  });

  test('errors when milestone arg missing', () => {
    const tmp: string = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-lint-cli-'));
    try {
      const result = captureError(() => cmdPlanLint(tmp, '', false));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/milestone name required/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('errors when milestone dir missing', () => {
    const tmp: string = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-lint-cli2-'));
    try {
      const result = captureError(() => cmdPlanLint(tmp, 'does-not-exist', false));
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toMatch(/Milestone not found/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─── Baseline: current v0.4 specs ───────────────────────────────────────────

describe('runPlanLint on current v0.4 specs (post-r9 baseline)', () => {
  // Walk upward from this test file to the repo root (where .planning lives).
  // jest runs from the repo root so process.cwd() is usually correct, but
  // resolving relatively keeps the test portable to subagent-spawned workers.
  const repoRoot: string = path.resolve(__dirname, '..', '..');
  const v04Dir: string = path.join(repoRoot, '.planning', 'milestones', 'v0.4');
  const v04Exists: boolean =
    fs.existsSync(v04Dir) && fs.statSync(v04Dir).isDirectory();

  (v04Exists ? test : test.skip)('runs without throwing and returns a structured report', () => {
    const report = runPlanLint(repoRoot, 'v0.4');
    expect(report.milestone).toBe('v0.4');
    expect(report.files_scanned).toBeGreaterThan(0);
    expect(Array.isArray(report.issues)).toBe(true);
    for (const issue of report.issues) {
      expect(typeof issue.category).toBe('string');
      expect(typeof issue.file).toBe('string');
      expect(typeof issue.message).toBe('string');
    }
  });

  // Document any known false positives as a soft ceiling. v0.4 currently has
  // 5 phases + ROADMAP; tolerating up to 15 issues keeps us honest without
  // requiring the spec text to be re-written every time a heuristic improves.
  (v04Exists ? test : test.skip)(
    'false positive count stays under 15 on post-r9 specs',
    () => {
      const report = runPlanLint(repoRoot, 'v0.4');
      // Documented soft ceiling; if you legitimately reduce noise, lower this
      // number. If you ever push it higher, add a comment explaining why.
      expect(report.issues.length).toBeLessThan(15);
    }
  );
});
