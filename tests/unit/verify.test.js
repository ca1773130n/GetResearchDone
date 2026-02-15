/**
 * Unit tests for lib/verify.js
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
} = require('../../lib/verify');

// ─── cmdVerifyPlanStructure ─────────────────────────────────────────────────

describe('cmdVerifyPlanStructure', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('validates a well-formed plan', () => {
    const planPath = '.planning/phases/01-test/01-01-PLAN.md';
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

  test('reports error for file not found', () => {
    const { stdout } = captureOutput(() => {
      cmdVerifyPlanStructure(fixtureDir, 'nonexistent.md', false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty('error');
  });

  test('detects tasks with proper sub-elements', () => {
    const planPath = '.planning/phases/01-test/01-01-PLAN.md';
    const { stdout } = captureOutput(() => {
      cmdVerifyPlanStructure(fixtureDir, planPath, false);
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.tasks.length).toBeGreaterThan(0);
    expect(parsed.tasks[0]).toHaveProperty('name');
    expect(parsed.tasks[0]).toHaveProperty('hasAction');
  });
});

// ─── cmdVerifyPhaseCompleteness ─────────────────────────────────────────────

describe('cmdVerifyPhaseCompleteness', () => {
  let fixtureDir;

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
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('plan with valid @-references passes', () => {
    // The 01-01-PLAN.md has @.planning/ROADMAP.md which exists in fixture
    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifyReferences(fixtureDir, '.planning/phases/01-test/01-01-PLAN.md', false);
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
  let fixtureDir;

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
});

// ─── cmdVerifyKeyLinks ──────────────────────────────────────────────────────

describe('cmdVerifyKeyLinks', () => {
  let fixtureDir;

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
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('validates an existing summary file', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdVerifySummary(fixtureDir, '.planning/phases/01-test/01-01-SUMMARY.md', 0, false);
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
