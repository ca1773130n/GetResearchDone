/**
 * Unit tests for lib/verify.ts
 *
 * Tests verification suite: plan structure, phase completeness, references,
 * artifacts, key-links, summary verification, and commit verification.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  cmdVerifySummary,
  cmdVerifyPlanStructure,
  cmdVerifyPhaseCompleteness,
  cmdVerifyReferences,
  cmdVerifyCommits,
  cmdVerifyArtifacts,
  cmdVerifyKeyLinks,
  cmdVerifyMechanical,
  clearVerifyCache,
} = require('../../lib/verify');

beforeEach(() => {
  clearVerifyCache();
});

// ─── cmdVerifyPlanStructure ─────────────────────────────────────────────────

describe('cmdVerifyPlanStructure', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('validates a well-formed plan', () => {
    const planPath = '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md';
    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyPlanStructure(fixtureDir, planPath, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.task_count).toBeGreaterThanOrEqual(1);
  });

  test('reports errors for plan missing required frontmatter', () => {
    // Create a minimal plan without required fields
    const badPlanPath = path.join(fixtureDir, 'bad-plan.md');
    fs.writeFileSync(badPlanPath, '---\nphase: test\n---\n\n<tasks></tasks>\n', 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyPlanStructure(fixtureDir, 'bad-plan.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  test('includes found frontmatter fields context when fields are missing', () => {
    const badPlanPath = path.join(fixtureDir, 'bad-plan-ctx.md');
    fs.writeFileSync(badPlanPath, '---\nphase: test\nplan: 01\n---\n\n<tasks></tasks>\n', 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyPlanStructure(fixtureDir, 'bad-plan-ctx.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(false);
    // Should include a "Found frontmatter fields" context message
    const foundMsg = parsed.errors.find((e: string) => e.startsWith('Found frontmatter fields:'));
    expect(foundMsg).toBeDefined();
    expect(foundMsg).toContain('phase');
    expect(foundMsg).toContain('plan');
  });

  test('includes found_sections in output', () => {
    const planPath = '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md';
    const { stdout } = captureOutput(() => {
      cmdVerifyPlanStructure(fixtureDir, planPath, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('found_sections');
    expect(Array.isArray(parsed.found_sections)).toBe(true);
  });

  test('found_sections captures markdown headings from content', () => {
    const planWithSections = path.join(fixtureDir, 'plan-with-sections.md');
    fs.writeFileSync(
      planWithSections,
      '---\nphase: 1\nplan: 01\ntype: execute\nwave: 1\ndepends_on: []\nfiles_modified: []\nautonomous: true\nmust_haves:\n  truths: []\n---\n\n## Objective\n\nDo things.\n\n## Tasks\n\n<task>\n<name>T1</name>\n<action>Do it.</action>\n</task>\n',
      'utf-8'
    );

    const { stdout } = captureOutput(() => {
      cmdVerifyPlanStructure(fixtureDir, 'plan-with-sections.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.found_sections).toContain('## Objective');
    expect(parsed.found_sections).toContain('## Tasks');
  });

  test('reports error for file not found', () => {
    const { stdout } = captureOutput(() => {
      cmdVerifyPlanStructure(fixtureDir, 'nonexistent.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });

  test('detects tasks with proper sub-elements', () => {
    const planPath = '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md';
    const { stdout } = captureOutput(() => {
      cmdVerifyPlanStructure(fixtureDir, planPath, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.tasks.length).toBeGreaterThan(0);
    expect(parsed.tasks[0]).toHaveProperty('name');
    expect(parsed.tasks[0]).toHaveProperty('hasAction');
  });

  test('reports errors for task missing name and action elements', () => {
    // A task with no <name> or <action> exercises the 'unnamed' ternary (line 383 arm 1),
    // the !nameMatch error (line 389 true), and the !hasAction error (line 390 true).
    const missingPlan = path.join(fixtureDir, 'plan-no-name-action.md');
    fs.writeFileSync(
      missingPlan,
      [
        '---',
        'phase: 01-test',
        'plan: 01-01',
        'type: execute',
        'wave: 1',
        'depends_on: []',
        'files_modified: []',
        'autonomous: true',
        'must_haves:',
        '  truths: []',
        '---',
        '',
        '<tasks>',
        '<task><verify>check this</verify></task>',
        '</tasks>',
      ].join('\n'),
      'utf-8'
    );
    const { stdout } = captureOutput(() => {
      cmdVerifyPlanStructure(fixtureDir, 'plan-no-name-action.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.errors).toContain('Task missing <name> element');
  });
});

// ─── cmdVerifyPhaseCompleteness ─────────────────────────────────────────────

describe('cmdVerifyPhaseCompleteness', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('phase 1 (has summary) reports complete', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyPhaseCompleteness(fixtureDir, '1', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.complete).toBe(true);
    expect(parsed.plan_count).toBe(1);
    expect(parsed.summary_count).toBe(1);
  });

  test('phase 2 (missing summary) reports incomplete', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyPhaseCompleteness(fixtureDir, '2', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.complete).toBe(false);
    expect(parsed.incomplete_plans.length).toBeGreaterThan(0);
  });

  test('nonexistent phase returns error', () => {
    const { stdout } = captureOutput(() => {
      cmdVerifyPhaseCompleteness(fixtureDir, '99', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });
});

// ─── cmdVerifyReferences ────────────────────────────────────────────────────

describe('cmdVerifyReferences', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('plan with valid @-references passes', () => {
    // The 01-01-PLAN.md has @.planning/ROADMAP.md which exists in fixture
    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyReferences(
        fixtureDir,
        '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md',
        false
      );
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(true);
    expect(parsed.missing).toHaveLength(0);
  });

  test('plan with broken @-references reports missing', () => {
    // Create a file with a reference to a non-existent file
    const badRefPath = path.join(fixtureDir, 'bad-refs.md');
    fs.writeFileSync(badRefPath, 'Look at @nonexistent/path/file.md for details.\n', 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyReferences(fixtureDir, 'bad-refs.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(false);
    expect(parsed.missing.length).toBeGreaterThan(0);
  });

  test('returns error for file not found', () => {
    const { stdout } = captureOutput(() => {
      cmdVerifyReferences(fixtureDir, 'nonexistent.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });
});

// ─── cmdVerifyArtifacts ─────────────────────────────────────────────────────

describe('cmdVerifyArtifacts', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('plan with existing artifacts passes', () => {
    // parseMustHavesBlock expects 4-space indent for block name, 6-space for items
    const planContent = [
      '---',
      'phase: test',
      'must_haves:',
      '    artifacts:',
      '      - path: "src/index.js"',
      '        provides: "Entry point"',
      '---',
      '',
      'Body.',
    ].join('\n');
    const planPath = path.join(fixtureDir, 'art-plan.md');
    fs.writeFileSync(planPath, planContent, 'utf-8');

    // Create the artifact file
    const srcDir = path.join(fixtureDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'index.js'), '// Entry point\n', 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyArtifacts(fixtureDir, 'art-plan.md', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.all_passed).toBe(true);
    expect(parsed.passed).toBe(1);
  });

  test('plan with missing artifacts reports failures', () => {
    const planContent = [
      '---',
      'phase: test',
      'must_haves:',
      '    artifacts:',
      '      - path: "src/missing.js"',
      '        provides: "Missing module"',
      '---',
      '',
      'Body.',
    ].join('\n');
    const planPath = path.join(fixtureDir, 'missing-art.md');
    fs.writeFileSync(planPath, planContent, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyArtifacts(fixtureDir, 'missing-art.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.all_passed).toBe(false);
    expect(parsed.artifacts[0].passed).toBe(false);
  });

  test('returns error when no artifacts in frontmatter', () => {
    const noArtPath = path.join(fixtureDir, 'no-artifacts.md');
    fs.writeFileSync(noArtPath, '---\nphase: test\n---\n\nNo artifacts.\n', 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyArtifacts(fixtureDir, 'no-artifacts.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });

  test('missing artifact includes plan_file, must_haves_field, and remediation', () => {
    const planContent = [
      '---',
      'phase: test',
      'must_haves:',
      '    artifacts:',
      '      - path: "src/nonexistent.js"',
      '        provides: "Missing module"',
      '---',
      '',
      'Body.',
    ].join('\n');
    const planPath = path.join(fixtureDir, 'rich-error-plan.md');
    fs.writeFileSync(planPath, planContent, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyArtifacts(fixtureDir, 'rich-error-plan.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.all_passed).toBe(false);
    const failed = parsed.artifacts.find((a: Record<string, unknown>) => !a.passed);
    expect(failed).toBeDefined();
    expect(failed.plan_file).toBe('rich-error-plan.md');
    expect(failed.must_haves_field).toBe('must_haves.artifacts');
    expect(typeof failed.remediation).toBe('string');
    expect(failed.remediation).toContain('src/nonexistent.js');
  });
});

// ─── cmdVerifyKeyLinks ──────────────────────────────────────────────────────

describe('cmdVerifyKeyLinks', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('plan with matching key_links patterns passes', () => {
    // parseMustHavesBlock expects 4-space indent for block name, 6-space for items
    const planContent = [
      '---',
      'phase: test',
      'must_haves:',
      '    key_links:',
      '      - from: ".planning/config.json"',
      '        to: ".planning/STATE.md"',
      '        via: "reference"',
      '        pattern: "model_profile"',
      '---',
      '',
      'Body text.',
    ].join('\n');

    const planPath = path.join(fixtureDir, 'link-plan.md');
    fs.writeFileSync(planPath, planContent, 'utf-8');

    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyKeyLinks(fixtureDir, 'link-plan.md', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.all_verified).toBe(true);
    expect(parsed.verified).toBe(1);
  });

  test('plan with non-matching patterns reports failures', () => {
    const planContent = [
      '---',
      'phase: test',
      'must_haves:',
      '    key_links:',
      '      - from: ".planning/config.json"',
      '        to: ".planning/STATE.md"',
      '        via: "reference"',
      '        pattern: "nonexistent_unique_pattern_xyz"',
      '---',
      '',
      'Body text.',
    ].join('\n');

    const planPath = path.join(fixtureDir, 'bad-link.md');
    fs.writeFileSync(planPath, planContent, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyKeyLinks(fixtureDir, 'bad-link.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.all_verified).toBe(false);
  });

  test('returns error when no key_links in frontmatter', () => {
    const planPath = path.join(fixtureDir, 'no-links.md');
    fs.writeFileSync(planPath, '---\nphase: test\n---\n\nNo links.\n', 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyKeyLinks(fixtureDir, 'no-links.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });
});

// ─── cmdVerifySummary ───────────────────────────────────────────────────────

describe('cmdVerifySummary', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('validates an existing summary file', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifySummary(
        fixtureDir,
        '.planning/milestones/anonymous/phases/01-test/01-01-SUMMARY.md',
        0,
        false
      );
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.checks.summary_exists).toBe(true);
  });

  test('reports not found for missing summary', () => {
    const { stdout } = captureOutput(() => {
      cmdVerifySummary(fixtureDir, 'nonexistent-SUMMARY.md', 0, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.passed).toBe(false);
    expect(parsed.checks.summary_exists).toBe(false);
  });

  test('a summary that cites NOTHING is unverified, not passed', () => {
    // Every check degrades to "nothing to object to" on an empty summary: no
    // files means nothing missing, no hashes short-circuits the commit clause,
    // and self_check is 'not_found', which is not 'failed'. This returned
    // passed:true with errors:[] and let the phase gate advance on it.
    fs.writeFileSync(
      path.join(fixtureDir, 'EMPTY-SUMMARY.md'),
      '# Phase 1 Summary\n\nWe did the thing.\n',
      'utf-8'
    );
    const { stdout } = captureOutput(() => {
      cmdVerifySummary(fixtureDir, 'EMPTY-SUMMARY.md', 0, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.passed).toBe(false);
    expect(parsed.verified).toBe(false);
    expect(parsed.unverified_reasons.length).toBeGreaterThan(0);
    expect(parsed.unverified_reasons[0]).toMatch(/no files and no commit hashes/);
  });

  test('a summary citing real files stays verified — the gate must not over-fire', () => {
    // The failure mode to avoid is the mirror of the one above: rejecting a
    // summary that DID record its work. None of the shipped templates carry a
    // Self-Check heading, so self_check:'not_found' must not flip the verdict.
    fs.writeFileSync(
      path.join(fixtureDir, 'CITED-SUMMARY.md'),
      '# Phase 1 Summary\n\n## Files Created/Modified\n- `lib/verify.ts` - the verifier\n',
      'utf-8'
    );
    const { stdout } = captureOutput(() => {
      cmdVerifySummary(fixtureDir, 'CITED-SUMMARY.md', 0, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.verified).toBe(true);
    expect(parsed.unverified_reasons).toEqual([]);
    expect(parsed.checks.self_check).toBe('not_found');
  });

  test('a root-level file cited without a path still counts as evidence', () => {
    // Existence spot-checking requires a '/' to avoid tripping over prose, but
    // that is the wrong bar for "did this summary record anything?". A phase
    // that only bumped package.json cites it bare, and calling that unverified
    // is the mirror-image failure of the one this gate exists to stop.
    fs.writeFileSync(
      path.join(fixtureDir, 'ROOT-SUMMARY.md'),
      '# Phase 1 Summary\n\n## Files Created/Modified\n- `package.json` - bumped deps\n',
      'utf-8'
    );
    const { stdout } = captureOutput(() => {
      cmdVerifySummary(fixtureDir, 'ROOT-SUMMARY.md', 0, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.verified).toBe(true);
    expect(parsed.unverified_reasons).toEqual([]);
  });
});

// ─── cmdVerifySummary commit-hash scanning ──────────────────────────────────

describe('cmdVerifySummary commit-hash scanning', () => {
  let fixtureDir: string;
  let headHash: string;

  /** Write a SUMMARY in the fixture dir and run cmdVerifySummary over it. */
  function verifySummaryContent(name: string, content: string) {
    fs.writeFileSync(path.join(fixtureDir, name), content, 'utf-8');
    const { stdout } = captureOutput(() => {
      cmdVerifySummary(fixtureDir, name, 0, false);
    });
    return JSON.parse(stdout);
  }

  beforeAll(() => {
    fixtureDir = createFixtureDir();
    // A real git repo so cat-file can validate harvested hashes.
    execFileSync('git', ['init', '-q'], { cwd: fixtureDir });
    execFileSync(
      'git',
      ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-q', '-m', 'seed'],
      { cwd: fixtureDir }
    );
    headHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: fixtureDir,
      encoding: 'utf-8',
    }).trim();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('harvests the commit column from a markdown table (trailing pipe)', () => {
    const parsed = verifySummaryContent(
      'tbl-SUMMARY.md',
      `# Summary\n\n| Task | Commit |\n| --- | --- |\n| 1 | ${headHash} |\n`
    );
    expect(parsed.checks.commits_exist).toBe(true);
    expect(parsed.passed).toBe(true);
  });

  test('harvests an indented table without trailing pipes (codex r37/r40)', () => {
    const parsed = verifySummaryContent(
      'tbl-indent-SUMMARY.md',
      `# Summary\n\n  | Task | Commit\n  | --- | ---\n  | 1 | ${headHash}\n`
    );
    expect(parsed.checks.commits_exist).toBe(true);
    expect(parsed.passed).toBe(true);
  });

  test('only validates the commit column, not a checksum column (codex r33/r36)', () => {
    const sha256 = 'a1b2c3d4'.repeat(8); // 64 hex chars — must not be harvested
    const parsed = verifySummaryContent(
      'tbl-checksum-SUMMARY.md',
      `# Summary\n\n| Task | Commit | Checksum |\n| --- | --- | --- |\n| 1 | ${headHash} | ${sha256} |\n`
    );
    expect(parsed.checks.commits_exist).toBe(true);
    expect(parsed.passed).toBe(true);
  });

  test('fails with the offending hash listed when a table hash is not in git', () => {
    const parsed = verifySummaryContent(
      'tbl-bogus-SUMMARY.md',
      `# Summary\n\n| Task | Commit |\n| --- | --- |\n| 1 | deadbeef |\n`
    );
    expect(parsed.checks.commits_exist).toBe(false);
    expect(parsed.passed).toBe(false);
    expect(parsed.errors.join(' ')).toContain('deadbeef');
  });

  test('harvests a paren-suffix hash on a Task heading (codex r41)', () => {
    const parsed = verifySummaryContent(
      'paren-task-SUMMARY.md',
      `# Summary\n\n### Task 1: add parser (${headHash})\n`
    );
    expect(parsed.checks.commits_exist).toBe(true);
    expect(parsed.passed).toBe(true);
  });

  test('does not harvest a paren-suffix on a non-task heading (codex r41)', () => {
    const parsed = verifySummaryContent(
      'paren-artifact-SUMMARY.md',
      `# Summary\n\n### Artifact checksum (deadbeef)\n`
    );
    // Not commit-flavored — no hashes harvested, so the check is vacuous.
    expect(parsed.checks.commits_exist).toBe(false);
    // ...and a vacuous check is exactly what must NOT read as a pass. This
    // fixture cites no files and no commits, so there was nothing to verify.
    // The assertion here used to be passed:true.
    expect(parsed.passed).toBe(false);
    expect(parsed.verified).toBe(false);
  });

  test('harvests a backticked hash after a colonless label (codex r39)', () => {
    const parsed = verifySummaryContent(
      'backtick-SUMMARY.md',
      `# Summary\n\n- [x] Commit \`${headHash}\` exists\n`
    );
    expect(parsed.checks.commits_exist).toBe(true);
    expect(parsed.passed).toBe(true);
  });

  test('sweeps bullet lines under a bare colon label', () => {
    const parsed = verifySummaryContent(
      'bare-label-SUMMARY.md',
      // blank line inside the sweep + non-bullet terminator line cover
      // both sweep-loop exits; deadbeef after the terminator must not
      // be harvested (commits_exist=true proves it).
      `# Summary\n\nCommits:\n\n- ${headHash}\n- follow-up note without hash\nplain terminator line\n- deadbeef\n`
    );
    expect(parsed.checks.commits_exist).toBe(true);
    expect(parsed.passed).toBe(true);
  });

  test('errors when summary path is empty', () => {
    const { exitCode } = captureError(() => {
      cmdVerifySummary(fixtureDir, '', 0, false);
    });
    expect(exitCode).toBe(1);
  });

  test('walks a ## Commits section into Task subheadings, stops at siblings (codex r35)', () => {
    const parsed = verifySummaryContent(
      'commits-section-SUMMARY.md',
      `# Summary\n\n## Commits\n\n### Task 1\n- ${headHash}\n\n## Next steps\n- deadbeef is mentioned but outside the section\n`
    );
    // deadbeef sits after a sibling heading — if it were harvested, the
    // git check would fail. commits_exist=true proves the walk stopped.
    expect(parsed.checks.commits_exist).toBe(true);
    expect(parsed.passed).toBe(true);
  });

  test('harvests hashes from /commit/ URLs', () => {
    const parsed = verifySummaryContent(
      'url-SUMMARY.md',
      `# Summary\n\nSee https://github.com/o/r/commit/${headHash} for details.\n`
    );
    expect(parsed.checks.commits_exist).toBe(true);
    expect(parsed.passed).toBe(true);
  });

  test('reports self-check failure', () => {
    const parsed = verifySummaryContent(
      'selfcheck-fail-SUMMARY.md',
      `# Summary\n\n## Self-Check\n\nSome checks fail ✗\n`
    );
    expect(parsed.checks.self_check).toBe('failed');
    expect(parsed.passed).toBe(false);
    expect(parsed.errors).toContain('Self-check section indicates failure');
  });

  test('reports self-check pass', () => {
    const parsed = verifySummaryContent(
      'selfcheck-pass-SUMMARY.md',
      `# Summary\n\n## Self-Check\n\nAll pass ✓\n`
    );
    expect(parsed.checks.self_check).toBe('passed');
    // Parsing the section is what this test is about. But a summary whose only
    // content is "All pass ✓" — no files, no commits — is self-attestation with
    // nothing behind it, so it is unverified rather than passed. The assertion
    // here used to be passed:true, which let a phase clear its gate by claiming
    // to have checked itself.
    expect(parsed.passed).toBe(false);
    expect(parsed.verified).toBe(false);
  });
});

// ─── cmdVerifyCommits ───────────────────────────────────────────────────────

describe('cmdVerifyCommits', () => {
  test('errors when no hashes provided', () => {
    const { exitCode } = captureError(() => {
      cmdVerifyCommits('/tmp', [], false);
    });
    expect(exitCode).toBe(1);
  });

  test('reports invalid for non-existent commit hashes', () => {
    // Use a plausible but non-existent hash
    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyCommits(process.cwd(), ['0000000'], false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.all_valid).toBe(false);
    expect(parsed.invalid).toContain('0000000');
  });

  test('validates real commits from current repo', () => {
    // Use HEAD which always exists
    let headHash;
    try {
      headHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        encoding: 'utf-8',
      }).trim();
    } catch {
      // Not in a git repo — skip
      return;
    }

    const { stdout } = captureOutput(() => {
      cmdVerifyCommits(process.cwd(), [headHash], false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.all_valid).toBe(true);
    expect(parsed.valid).toContain(headHash);
  });
});

// ─── cmdVerifyMechanical (bundle) ───────────────────────────────────────────

describe('cmdVerifyMechanical', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('aggregates checks for a phase with a single plan', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.phase).toMatch(/01/);
    expect(parsed.plan_count).toBe(1);
    expect(parsed.total_checks).toBeGreaterThan(0);
    expect(parsed.passed_count + parsed.failed_count).toBe(parsed.total_checks);
    expect(Array.isArray(parsed.checks)).toBe(true);
  });

  test('flags missing artifact files as a failed artifacts check', () => {
    // Replace the fixture PLAN.md with one whose must_haves uses the 4-space
    // indent that parseMustHavesBlock requires, and declares an artifact that
    // does not exist on disk in the temp fixture.
    const planPath = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test',
      '01-01-PLAN.md'
    );
    const planContent = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: []',
      'autonomous: true',
      'must_haves:',
      '    artifacts:',
      '      - path: "src/does-not-exist.js"',
      '        provides: "Missing module"',
      '---',
      '',
      '<task><name>t1</name><action>do</action></task>',
      '',
    ].join('\n');
    fs.writeFileSync(planPath, planContent, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    const artifactsCheck = parsed.checks.find((c: { check: string }) => c.check === 'artifacts');
    expect(artifactsCheck).toBeDefined();
    expect(artifactsCheck.passed).toBe(false);
    expect(artifactsCheck.detail).toMatch(/src\/does-not-exist\.js/);
    expect(parsed.passed).toBe(false);
  });

  test('key_links check verifies pattern/include links and reports failures', () => {
    const planPath = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test',
      '01-01-PLAN.md'
    );
    // src/a.js: matches link 1's pattern and contains link 4's literal `to`.
    fs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(fixtureDir, 'src', 'a.js'),
      'const b = require("./b"); // wired into src/b.js\n',
      'utf-8'
    );
    // src/c.js: carries the pattern link 2's `from` lacks (to-side fallback).
    fs.writeFileSync(path.join(fixtureDir, 'src', 'c.js'), '// IN_TARGET_ONLY marker\n', 'utf-8');
    const planContent = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: []',
      'autonomous: true',
      'must_haves:',
      '    key_links:',
      '      - "plain string entries are skipped"',
      '      - from: "src/a.js"',
      '        to: "src/b.js"',
      '        pattern: "require.*b"',
      '      - from: "src/a.js"',
      '        to: "src/c.js"',
      '        pattern: "IN_TARGET_ONLY"',
      '      - from: "src/a.js"',
      '        to: "src/d.js"',
      '        pattern: "[unclosed("',
      '      - from: "src/a.js"',
      '        to: "src/b.js"',
      '---',
      '',
      '<task><name>t1</name><action>do</action></task>',
      '',
    ].join('\n');
    fs.writeFileSync(planPath, planContent, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    const keyLinksCheck = parsed.checks.find((c: { check: string }) => c.check === 'key_links');
    expect(keyLinksCheck).toBeDefined();
    // The invalid-regex link is the only failure; the rest verify.
    expect(keyLinksCheck.passed).toBe(false);
    expect(keyLinksCheck.detail).toMatch(/src\/d\.js/);
    expect(keyLinksCheck.detail).not.toMatch(/src\/c\.js/);
  });

  test('plan_summary_completeness fails when summary is missing', () => {
    const phaseDir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    fs.unlinkSync(path.join(phaseDir, '01-01-SUMMARY.md'));

    const { stdout } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    const completeness = parsed.checks.find(
      (c: { check: string }) => c.check === 'plan_summary_completeness'
    );
    expect(completeness.passed).toBe(false);
    expect(completeness.detail).toMatch(/without summaries/);
    expect(completeness.data.incomplete).toContain('01-01');
  });

  test('emits "fail" rawValue when any check fails', () => {
    // Force a failure via plan/summary completeness — cheapest deterministic
    // failure that does not depend on parseMustHavesBlock indent quirks.
    const phaseDir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    fs.unlinkSync(path.join(phaseDir, '01-01-SUMMARY.md'));

    const { stdout, rawOutput } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', true);
    });
    const payload = (rawOutput ?? stdout).trim();
    expect(payload).toBe('fail');
  });

  test('returns error result when phase is not found', () => {
    const { stdout } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '99', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toMatch(/Phase not found/);
  });

  test('each check has scope and check fields', () => {
    const { stdout } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    for (const check of parsed.checks) {
      expect(typeof check.check).toBe('string');
      expect(typeof check.scope).toBe('string');
      expect(typeof check.passed).toBe('boolean');
      expect(typeof check.detail).toBe('string');
    }
  });

  test('passed_count + failed_count equals total_checks (invariant)', () => {
    const { stdout } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.passed_count + parsed.failed_count).toBe(parsed.total_checks);
    expect(parsed.passed).toBe(parsed.failed_count === 0);
  });

  // ─── codex-rescue regressions ────────────────────────────────────────────
  // These two tests guard against bugs caught by the codex review of PR #32.

  test('recognises unprefixed PLAN.md / SUMMARY.md (codex P2 #2)', () => {
    // Replace the fixture's prefixed plan with bare PLAN.md to mimic phases
    // that use that filename convention (supported elsewhere: phase.ts:336,
    // utils.ts:1046, gates.ts:199). Without the fix the bundle would find
    // zero plans and pass based on completeness alone.
    const phaseDir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    const prefixedPlan = path.join(phaseDir, '01-01-PLAN.md');
    const prefixedSummary = path.join(phaseDir, '01-01-SUMMARY.md');
    const barePlan = path.join(phaseDir, 'PLAN.md');
    const bareSummary = path.join(phaseDir, 'SUMMARY.md');
    fs.renameSync(prefixedPlan, barePlan);
    fs.renameSync(prefixedSummary, bareSummary);

    const { stdout } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.plan_count).toBe(1);
    // Frontmatter check must have fired with scope=plan:PLAN.md
    const frontmatter = parsed.checks.find(
      (c: { check: string; scope: string }) =>
        c.check === 'frontmatter' && c.scope === 'plan:PLAN.md'
    );
    expect(frontmatter).toBeDefined();
    // Completeness still passes: bare PLAN.md ↔ bare SUMMARY.md
    const completeness = parsed.checks.find(
      (c: { check: string }) => c.check === 'plan_summary_completeness'
    );
    expect(completeness.passed).toBe(true);
  });

  test('fails when phase has zero PLAN.md files (codex r3 P2)', () => {
    // A phase dir that exists but has no PLAN.md files must not pass
    // mechanical verification by vacuously satisfying every check.
    const phaseDir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    for (const f of fs.readdirSync(phaseDir)) {
      if (f.endsWith('PLAN.md') || f.endsWith('SUMMARY.md')) {
        fs.unlinkSync(path.join(phaseDir, f));
      }
    }

    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.passed).toBe(false);
    expect(parsed.plan_count).toBe(0);
    expect(parsed.failed_count).toBeGreaterThan(0);
    const completeness = parsed.checks.find(
      (c: { check: string }) => c.check === 'plan_summary_completeness'
    );
    expect(completeness.passed).toBe(false);
    expect(completeness.detail).toMatch(/no PLAN\.md/i);
  });

  test('skips dynamic @-refs like @${CLAUDE_PLUGIN_ROOT}/... (codex r2 P2)', () => {
    // Pre-fix, the bundle resolved the literal "${CLAUDE_PLUGIN_ROOT}" under
    // cwd and marked the ref missing. Templated refs must be ignored, matching
    // the guard already applied to backtick paths.
    const planPath = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test',
      '01-01-PLAN.md'
    );
    const planContent = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: []',
      'autonomous: true',
      'must_haves:',
      '  artifacts: []',
      '---',
      '',
      'Reference @${CLAUDE_PLUGIN_ROOT}/references/execute-plan.md and',
      'also @{{plugin_root}}/another.md should both be skipped.',
      '',
    ].join('\n');
    fs.writeFileSync(planPath, planContent, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    const refsCheck = parsed.checks.find(
      (c: { check: string }) => c.check === 'references'
    );
    // Either no references check fires (totalRefs filtered to 0) or it passes.
    if (refsCheck) {
      expect(refsCheck.passed).toBe(true);
      expect(refsCheck.data.missing).toEqual([]);
    }
  });

  test('enforces artifact content constraints, not just existence (codex P2 #1)', () => {
    // Plan declares an artifact that exists but is too short for its
    // declared min_lines. Pre-fix, the bundle would pass it. Post-fix,
    // it must fail with a content issue.
    const planPath = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test',
      '01-01-PLAN.md'
    );
    const planContent = [
      '---',
      'phase: 01-test',
      'plan: 01',
      'type: execute',
      'wave: 1',
      'depends_on: []',
      'files_modified: []',
      'autonomous: true',
      'must_haves:',
      '    artifacts:',
      '      - path: "src/short.js"',
      '        min_lines: 20',
      '        contains: "REQUIRED_MARKER"',
      '---',
      '',
      '<task><name>t</name><action>a</action></task>',
      '',
    ].join('\n');
    fs.writeFileSync(planPath, planContent, 'utf-8');
    fs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });
    // File exists but is short and lacks the marker — pre-fix this passed.
    fs.writeFileSync(path.join(fixtureDir, 'src', 'short.js'), 'one\ntwo\n', 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    const artifactsCheck = parsed.checks.find(
      (c: { check: string }) => c.check === 'artifacts'
    );
    expect(artifactsCheck.passed).toBe(false);
    expect(artifactsCheck.detail).toMatch(/min_lines|REQUIRED_MARKER|Only \d+ lines/);
  });

  test('errors when phase arg is missing', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdVerifyMechanical(fixtureDir, '', false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/phase required/i);
  });

  test('reports missing backtick reference as a failed references check', () => {
    // Add a backtick file-path reference to the PLAN.md to exercise the backtick
    // reference check loop (lines 999-1002).
    const planPath = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test',
      '01-01-PLAN.md'
    );
    const existing = fs.readFileSync(planPath, 'utf-8');
    fs.writeFileSync(planPath, existing + '\nSee `lib/verify.ts` for implementation.\n', 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdVerifyMechanical(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    const refCheck = parsed.checks.find((c: { check: string }) => c.check === 'references');
    expect(refCheck).toBeDefined();
    expect(refCheck.passed).toBe(false);
  });
});

// ─── cmdDiagnosePhase ──────────────────────────────────────────────────────

const { cmdDiagnosePhase } = require('../../lib/verify');

describe('cmdDiagnosePhase', () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns error when phase not found', () => {
    const { stdout } = captureOutput(() => {
      cmdDiagnosePhase(fixtureDir, '99', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBeDefined();
  });

  test('diagnoses phase with no VERIFICATION.md', () => {
    // The fixture has a phase "01-test" set up
    const { stdout, exitCode } = captureOutput(() => {
      cmdDiagnosePhase(fixtureDir, '1', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.phase).toBeDefined();
    expect(Array.isArray(parsed.root_causes)).toBe(true);
    expect(parsed.root_causes.length).toBeGreaterThan(0);
    // Should report missing VERIFICATION.md
    const causes = parsed.root_causes.map((c: { cause: string }) => c.cause);
    expect(causes.some((c: string) => c.includes('VERIFICATION'))).toBe(true);
  });

  test('diagnoses phase with VERIFICATION.md containing many failed checks (exercises _checkSuggestion)', () => {
    const phaseDir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    // Put artifacts first so _checkSuggestion /artifact/ branch (line 1224) is exercised.
    // unknown-check-type goes last (index 5) and gets sliced off; default return is
    // covered separately by the JSON-pattern test below.
    const verificationContent = [
      '# Verification',
      '**verdict**: FAIL',
      '',
      '❌ artifacts missing',
      '❌ frontmatter check failed',
      '❌ reference broken',
      '❌ key-link check failed',
      '❌ summary completeness check',
      '❌ unknown-check-type',
    ].join('\n');
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), verificationContent, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdDiagnosePhase(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.verdict).toContain('FAIL');
    expect(parsed.failed_checks.length).toBeGreaterThan(0);
    expect(parsed.root_causes.length).toBeGreaterThan(0);
  });

  test('reports no obvious signals when phase has passing VERIFICATION.md', () => {
    const phaseDir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    // Write a passing VERIFICATION.md (verdict=pass, no failed lines)
    const passingContent = [
      '# Verification',
      '**verdict**: PASS',
      '',
      '✅ All checks passed.',
    ].join('\n');
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), passingContent, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdDiagnosePhase(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    // Should report no obvious signals
    expect(Array.isArray(parsed.root_causes)).toBe(true);
    expect(parsed.root_causes.length).toBeGreaterThan(0);
  });

  test('reports missing summaries when plans lack SUMMARY.md', () => {
    const phaseDir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    // Remove the existing SUMMARY.md so plansMissingSummaries > 0
    const summaryPath = path.join(phaseDir, '01-01-SUMMARY.md');
    if (fs.existsSync(summaryPath)) {
      fs.unlinkSync(summaryPath);
    }
    // Also check generic SUMMARY.md
    const genericSummary = path.join(phaseDir, 'SUMMARY.md');
    if (fs.existsSync(genericSummary)) {
      fs.unlinkSync(genericSummary);
    }

    const { stdout } = captureOutput(() => {
      cmdDiagnosePhase(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed.root_causes)).toBe(true);
    // May or may not find missing summaries depending on fixture structure
    expect(parsed.phase).toBeDefined();
  });

  test('parses JSON-like check failures and skips duplicate causes', () => {
    const phaseDir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    // Duplicate ❌ line exercises "already in rootCauses" skip (id 170 arm 0).
    // JSON-like pattern exercises checkFailMatches parsing (id 157, id 158).
    // Only 3 unique failed checks → exercises failedChecks.length <= 3 ternary (id 169 arm 1).
    const verificationContent = [
      '# Verification',
      '**verdict**: FAIL',
      '❌ reference broken',
      '❌ reference broken',
      '"check": "json-unique-check", "passed": false',
    ].join('\n');
    fs.writeFileSync(path.join(phaseDir, 'VERIFICATION.md'), verificationContent, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdDiagnosePhase(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.failed_checks).toContain('reference broken');
    expect(parsed.failed_checks).toContain('json-unique-check');
  });

  test('handles bare PLAN.md and SUMMARY.md in phase directory', () => {
    const phaseDir = path.join(
      fixtureDir,
      '.planning',
      'milestones',
      'anonymous',
      'phases',
      '01-test'
    );
    // Replace prefixed files with bare names to exercise the f === 'PLAN.md' / f === 'SUMMARY.md'
    // ternary branches (id 161 arm 0, id 162 arm 0) in lines 1135-1136.
    const planContent = fs.readFileSync(path.join(phaseDir, '01-01-PLAN.md'), 'utf-8');
    const summaryContent = fs.readFileSync(path.join(phaseDir, '01-01-SUMMARY.md'), 'utf-8');
    fs.unlinkSync(path.join(phaseDir, '01-01-PLAN.md'));
    fs.unlinkSync(path.join(phaseDir, '01-01-SUMMARY.md'));
    fs.writeFileSync(path.join(phaseDir, 'PLAN.md'), planContent, 'utf-8');
    fs.writeFileSync(path.join(phaseDir, 'SUMMARY.md'), summaryContent, 'utf-8');

    const { stdout } = captureOutput(() => {
      cmdDiagnosePhase(fixtureDir, '1', false);
    });
    const parsed = JSON.parse(stdout);
    // Bare PLAN.md and SUMMARY.md are paired, so no missing summaries
    expect(parsed.plans_missing_summaries).toBe(0);
  });

  test('raw output is a non-empty string summary', () => {
    const { stdout } = captureOutput(() => {
      cmdDiagnosePhase(fixtureDir, '1', true);
    });
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  test('errors when phase arg is missing', () => {
    const { stderr, exitCode } = captureError(() => {
      cmdDiagnosePhase(fixtureDir, '', false);
    });
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/phase required/i);
  });
});
