/**
 * Targeted coverage gap tests
 *
 * Additional tests to push lib/ coverage above 80%. Focuses on:
 * - context.js --include flag branches
 * - frontmatter.js reconstructFrontmatter deep nesting
 * - verify.js cmdVerifyArtifacts and cmdVerifyKeyLinks detailed paths
 * - scaffold.js cmdTemplateFill verification template
 * - commands.js commit edge cases
 */

const fs = require('fs');
const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

// ─── Context include flag coverage ─────────────────────────────────────────

const {
  cmdInitExecutePhase,
  cmdInitPlanPhase,
  cmdInitResume,
  cmdInitProgress,
  cmdInitResearchWorkflow,
} = require('../../lib/context');

describe('context --include flag branches', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('execute-phase with --include config', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(['config']), false)
    );
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('config_content');
    expect(result.config_content).toContain('model_profile');
  });

  test('execute-phase with --include roadmap', () => {
    const { stdout } = captureOutput(() =>
      cmdInitExecutePhase(tmpDir, '1', new Set(['roadmap']), false)
    );
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('roadmap_content');
    expect(result.roadmap_content).toContain('Roadmap');
  });

  test('plan-phase with --include state', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['state']), false)
    );
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('state_content');
    expect(result.state_content).toContain('State');
  });

  test('plan-phase with --include roadmap', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['roadmap']), false)
    );
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('roadmap_content');
    expect(result.roadmap_content).toContain('Roadmap');
  });

  test('plan-phase with --include requirements (file present in fixture)', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['requirements']), false)
    );
    const result = JSON.parse(stdout);
    // REQUIREMENTS.md exists in fixture (created for requirement command tests)
    expect(result.requirements_content).toContain('Requirements');
  });

  test('plan-phase with --include context (no context file)', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['context']), false)
    );
    const result = JSON.parse(stdout);
    // No CONTEXT.md exists in fixture phase directory
    expect(result.context_content).toBeUndefined();
  });

  test('plan-phase with --include research (no research file)', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['research']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.research_content).toBeUndefined();
  });

  test('plan-phase with --include verification (no verification file)', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['verification']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.verification_content).toBeUndefined();
  });

  test('plan-phase with --include uat (no UAT file)', () => {
    const { stdout } = captureOutput(() => cmdInitPlanPhase(tmpDir, '1', new Set(['uat']), false));
    const result = JSON.parse(stdout);
    expect(result.uat_content).toBeUndefined();
  });

  test('init progress with --include state', () => {
    const { stdout } = captureOutput(() => cmdInitProgress(tmpDir, new Set(['state']), false));
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('state_content');
  });

  test('init research workflow returns valid context', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', 'test topic', new Set(), false)
    );
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('workflow');
    expect(result.workflow).toBe('survey');
  });

  test('init research workflow with --include state', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'deep-dive', 'paper', new Set(['state']), false)
    );
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('state_content');
  });
});

// ─── Frontmatter reconstructFrontmatter deep nesting ────────────────────────

const {
  reconstructFrontmatter,
  extractFrontmatter,
  parseMustHavesBlock,
} = require('../../lib/frontmatter');

describe('reconstructFrontmatter deep nesting', () => {
  test('handles nested object with array containing colon strings', () => {
    const fm = {
      phase: '01-test',
      must_haves: {
        truths: ['First truth: something', 'Second truth'],
        artifacts: [{ path: 'src/index.js', provides: 'Entry point' }],
      },
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('phase: 01-test');
    expect(result).toContain('must_haves:');
    expect(result).toContain('truths:');
  });

  test('handles deeply nested object with sub-arrays', () => {
    const fm = {
      config: {
        nested: {
          items: ['a', 'b', 'c'],
          empty_list: [],
          single: 'value',
        },
      },
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('config:');
    expect(result).toContain('nested:');
    expect(result).toContain('items:');
    expect(result).toContain('- a');
    expect(result).toContain('empty_list: []');
  });

  test('handles top-level string with colon', () => {
    const fm = {
      description: 'Part 1: The Beginning',
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('"Part 1: The Beginning"');
  });

  test('handles top-level string starting with bracket', () => {
    const fm = {
      value: '[array-like]',
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('"[array-like]"');
  });

  test('handles empty array at top level', () => {
    const fm = {
      tags: [],
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('tags: []');
  });

  test('handles inline array with few short items', () => {
    const fm = {
      tags: ['a', 'b'],
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('tags: [a, b]');
  });

  test('handles long array items that need expansion', () => {
    const fm = {
      items: [
        'a very long item that exceeds limits',
        'another very long item',
        'and a third one',
        'and a fourth',
      ],
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('items:');
    expect(result).toContain('  - a very long item');
  });

  test('handles nested sub-value with colon', () => {
    const fm = {
      outer: {
        key: 'value: with colon',
      },
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('"value: with colon"');
  });

  test('handles nested sub-array inline', () => {
    const fm = {
      outer: {
        items: ['x', 'y'],
      },
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('items: [x, y]');
  });

  test('handles nested sub-array expanded with colon items', () => {
    const fm = {
      outer: {
        truths: ['Truth 1: desc', 'Truth 2: desc', 'Truth 3: desc', 'Truth 4: desc'],
      },
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('truths:');
    expect(result).toContain('"Truth 1: desc"');
  });

  test('skips null and undefined values', () => {
    const fm = {
      present: 'yes',
      absent: null,
      missing: undefined,
    };
    const result = reconstructFrontmatter(fm);
    expect(result).toContain('present: yes');
    expect(result).not.toContain('absent');
    expect(result).not.toContain('missing');
  });
});

// ─── parseMustHavesBlock coverage ──────────────────────────────────────────

describe('parseMustHavesBlock edge cases', () => {
  test('returns empty array when no must_haves block exists', () => {
    const content = '---\nphase: test\n---\nNo frontmatter block';
    const result = parseMustHavesBlock(content, 'artifacts');
    expect(result).toEqual([]);
  });

  test('handles must_haves with nested key-value items', () => {
    const content = [
      '---',
      'must_haves:',
      '    artifacts:',
      '      - path: "src/index.js"',
      '        provides: "Entry point"',
      '        min_lines: 10',
      '---',
    ].join('\n');
    const result = parseMustHavesBlock(content, 'artifacts');
    expect(result.length).toBe(1);
    expect(result[0].path).toBe('src/index.js');
    expect(result[0].provides).toBe('Entry point');
  });
});

// ─── Verify cmdVerifyArtifacts paths ───────────────────────────────────────

const { cmdVerifyArtifacts, cmdVerifyKeyLinks } = require('../../lib/verify');

describe('cmdVerifyArtifacts detailed paths', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('verifies artifacts with contains check (pattern found)', () => {
    // Create a plan with artifacts that reference existing files
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    // Create the target file
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), '// entry point\nmodule.exports = {};');

    // Write plan with proper must_haves indentation
    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts:',
        '      - path: "src/index.js"',
        '        provides: "Entry point"',
        '        contains: "module.exports"',
        '    key_links: []',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout, exitCode } = captureOutput(() =>
      cmdVerifyArtifacts(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('artifacts');
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.artifacts[0].passed).toBe(true);
  });

  test('verifies artifacts with contains check (pattern missing)', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), '// entry point only');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts:',
        '      - path: "src/index.js"',
        '        provides: "Entry point"',
        '        contains: "NONEXISTENT_PATTERN"',
        '    key_links: []',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyArtifacts(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.artifacts[0].passed).toBe(false);
    expect(result.artifacts[0].issues).toContain('Missing pattern: NONEXISTENT_PATTERN');
  });

  test('verifies artifacts when file does not exist', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts:',
        '      - path: "nonexistent/file.js"',
        '        provides: "Missing"',
        '    key_links: []',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyArtifacts(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.artifacts[0].exists).toBe(false);
    expect(result.artifacts[0].issues).toContain('File not found');
  });
});

describe('cmdVerifyKeyLinks detailed paths', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('verifies key links with pattern found in source', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), 'const utils = require("./utils");\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'utils.js'), 'module.exports = {};');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts: []',
        '    key_links:',
        '      - from: "src/index.js"',
        '        to: "src/utils.js"',
        '        via: "require"',
        '        pattern: "require.*utils"',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyKeyLinks(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.links.length).toBeGreaterThan(0);
    expect(result.links[0].verified).toBe(true);
    expect(result.links[0].detail).toContain('Pattern found');
  });

  test('verifies key links when source file missing', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts: []',
        '    key_links:',
        '      - from: "nonexistent/source.js"',
        '        to: "nonexistent/target.js"',
        '        via: "import"',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyKeyLinks(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.links[0].verified).toBe(false);
    expect(result.links[0].detail).toContain('Source file not found');
  });

  test('verifies key links without pattern (reference check)', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), 'import from "src/utils.js"');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts: []',
        '    key_links:',
        '      - from: "src/index.js"',
        '        to: "src/utils.js"',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyKeyLinks(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.links[0].verified).toBe(true);
    expect(result.links[0].detail).toContain('Target referenced in source');
  });
});

// ─── Scaffold template fill verification ────────────────────────────────────

const { cmdTemplateFill } = require('../../lib/scaffold');

describe('cmdTemplateFill verification template', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('creates verification template', () => {
    const { stdout, exitCode } = captureOutput(() =>
      cmdTemplateFill(
        tmpDir,
        'verification',
        { phase: '1', plan: null, name: null, type: 'verify', wave: '1', fields: {} },
        false
      )
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('created');
    expect(result.path).toContain('VERIFICATION');
  });
});

// ─── Commands edge cases ────────────────────────────────────────────────────

const {
  cmdCommit,
  cmdHistoryDigest,
  cmdSummaryExtract,
  cmdProgressRender,
} = require('../../lib/commands');

describe('cmdCommit edge cases', () => {
  test('errors when no message provided', () => {
    const { stderr, exitCode } = captureError(() => cmdCommit('/tmp', null, [], false, false));
    expect(exitCode).toBe(1);
    expect(stderr).toContain('commit message required');
  });
});

// ─── Frontmatter set/merge coverage ─────────────────────────────────────────

const {
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
} = require('../../lib/frontmatter');

describe('cmdFrontmatterSet', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('sets a string field on a frontmatter file', () => {
    const planPath = '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md';
    const { stdout, exitCode } = captureOutput(() =>
      cmdFrontmatterSet(tmpDir, planPath, 'wave', '2', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.updated).toBe(true);
    expect(result.field).toBe('wave');
  });

  test('sets a JSON value field', () => {
    const planPath = '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md';
    const { stdout } = captureOutput(() =>
      cmdFrontmatterSet(tmpDir, planPath, 'tags', '["a","b"]', false)
    );
    const result = JSON.parse(stdout);
    expect(result.updated).toBe(true);
    expect(result.value).toEqual(['a', 'b']);
  });

  test('errors when file not found', () => {
    const { stdout } = captureOutput(() =>
      cmdFrontmatterSet(tmpDir, 'nonexistent.md', 'field', 'value', false)
    );
    const result = JSON.parse(stdout);
    expect(result.error).toBe('File not found');
  });

  test('errors when required args missing', () => {
    const { exitCode } = captureError(() =>
      cmdFrontmatterSet(tmpDir, null, null, undefined, false)
    );
    expect(exitCode).toBe(1);
  });
});

describe('cmdFrontmatterMerge', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('merges JSON data into frontmatter', () => {
    const planPath = '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md';
    const data = JSON.stringify({ wave: 3, autonomous: false });
    const { stdout, exitCode } = captureOutput(() =>
      cmdFrontmatterMerge(tmpDir, planPath, data, false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.merged).toBe(true);
    expect(result.fields).toContain('wave');
    expect(result.fields).toContain('autonomous');
  });

  test('errors when file not found', () => {
    const { stdout } = captureOutput(() =>
      cmdFrontmatterMerge(tmpDir, 'nonexistent.md', '{"a":1}', false)
    );
    const result = JSON.parse(stdout);
    expect(result.error).toBe('File not found');
  });

  test('errors when data is invalid JSON', () => {
    const planPath = '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md';
    const { exitCode } = captureError(() =>
      cmdFrontmatterMerge(tmpDir, planPath, '{invalid json', false)
    );
    expect(exitCode).toBe(1);
  });

  test('errors when required args missing', () => {
    const { exitCode } = captureError(() => cmdFrontmatterMerge(tmpDir, null, null, false));
    expect(exitCode).toBe(1);
  });
});

describe('cmdFrontmatterValidate', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('validates a plan frontmatter', () => {
    const planPath = '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md';
    const { stdout, exitCode } = captureOutput(() =>
      cmdFrontmatterValidate(tmpDir, planPath, 'plan', false)
    );
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('present');
  });

  test('validates a summary frontmatter', () => {
    const summaryPath = '.planning/milestones/anonymous/phases/01-test/01-01-SUMMARY.md';
    const { stdout } = captureOutput(() =>
      cmdFrontmatterValidate(tmpDir, summaryPath, 'summary', false)
    );
    const result = JSON.parse(stdout);
    expect(result).toHaveProperty('valid');
  });
});

// ─── Verify references backtick path coverage ────────────────────────────────

const { cmdVerifyReferences } = require('../../lib/verify');

describe('cmdVerifyReferences backtick paths', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('finds backtick file references that exist', () => {
    // Create a file with backtick references to existing files
    const testFile = path.join(tmpDir, 'test-refs.md');
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), '// entry\n');
    fs.writeFileSync(testFile, 'Check `src/index.js` for details\n');

    const { stdout } = captureOutput(() => cmdVerifyReferences(tmpDir, testFile, false));
    const result = JSON.parse(stdout);
    expect(result.valid).toBe(true);
    expect(result.found).toBeGreaterThanOrEqual(1);
  });

  test('finds backtick file references that are missing', () => {
    const testFile = path.join(tmpDir, 'test-refs.md');
    fs.writeFileSync(testFile, 'Check `lib/nonexistent/deep.js` for details\n');

    const { stdout } = captureOutput(() => cmdVerifyReferences(tmpDir, testFile, false));
    const result = JSON.parse(stdout);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('lib/nonexistent/deep.js');
  });

  test('skips http URLs and template references in backticks', () => {
    const testFile = path.join(tmpDir, 'test-refs.md');
    fs.writeFileSync(
      testFile,
      'See `https://example.com/path/file.js` and `${var}/path/file.js` and `{{template}}/path/file.js`\n'
    );

    const { stdout } = captureOutput(() => cmdVerifyReferences(tmpDir, testFile, false));
    const result = JSON.parse(stdout);
    // All three should be skipped
    expect(result.total).toBe(0);
  });
});

// ─── Verify key links additional paths ──────────────────────────────────────

describe('cmdVerifyKeyLinks additional paths', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('pattern found in target (not source)', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), '// no match here');
    fs.writeFileSync(path.join(tmpDir, 'src', 'utils.js'), 'module.exports = { helper: true };');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts: []',
        '    key_links:',
        '      - from: "src/index.js"',
        '        to: "src/utils.js"',
        '        via: "require"',
        '        pattern: "module\\.exports"',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyKeyLinks(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.links[0].verified).toBe(true);
    expect(result.links[0].detail).toContain('Pattern found in target');
  });

  test('pattern not found in source or target', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), '// nothing');
    fs.writeFileSync(path.join(tmpDir, 'src', 'utils.js'), '// also nothing');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts: []',
        '    key_links:',
        '      - from: "src/index.js"',
        '        to: "src/utils.js"',
        '        pattern: "NONEXISTENT_PATTERN_XYZ"',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyKeyLinks(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.links[0].verified).toBe(false);
    expect(result.links[0].detail).toContain('not found in source or target');
  });

  test('invalid regex pattern', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), '// content');
    fs.writeFileSync(path.join(tmpDir, 'src', 'utils.js'), '// content');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts: []',
        '    key_links:',
        '      - from: "src/index.js"',
        '        to: "src/utils.js"',
        '        pattern: "[invalid("',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyKeyLinks(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.links[0].verified).toBe(false);
    expect(result.links[0].detail).toContain('Invalid regex');
  });

  test('target not referenced in source (no pattern)', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), '// no reference to target at all');
    fs.writeFileSync(path.join(tmpDir, 'src', 'utils.js'), '// target file');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts: []',
        '    key_links:',
        '      - from: "src/index.js"',
        '        to: "src/utils.js"',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyKeyLinks(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.links[0].verified).toBe(false);
    expect(result.links[0].detail).toContain('Target not referenced');
  });
});

// ─── Verify artifacts min_lines and exports ──────────────────────────────────

describe('cmdVerifyArtifacts min_lines and exports', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('fails when min_lines check fails', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), '// short\n');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts:',
        '      - path: "src/index.js"',
        '        provides: "Entry point"',
        '        min_lines: 100',
        '    key_links: []',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyArtifacts(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.artifacts[0].passed).toBe(false);
    expect(result.artifacts[0].issues[0]).toContain('lines');
  });

  test('fails when exports pattern missing', () => {
    const planDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    const planPath = path.join(planDir, '01-01-PLAN.md');
    const content = fs.readFileSync(planPath, 'utf-8');

    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.js'), '// no exports here\nconst x = 1;\n');

    const newContent = content.replace(
      /must_haves:[\s\S]*?---/,
      [
        'must_haves:',
        '    truths:',
        '      - "Project structure created"',
        '    artifacts:',
        '      - path: "src/index.js"',
        '        provides: "Entry point"',
        '        exports: "cmdFoo"',
        '    key_links: []',
        '---',
      ].join('\n')
    );
    fs.writeFileSync(planPath, newContent);

    const { stdout } = captureOutput(() =>
      cmdVerifyArtifacts(tmpDir, '.planning/milestones/anonymous/phases/01-test/01-01-PLAN.md', false)
    );
    const result = JSON.parse(stdout);
    expect(result.artifacts[0].passed).toBe(false);
    expect(result.artifacts[0].issues[0]).toContain('Missing export');
  });
});

// ─── Context include branches where files exist ──────────────────────────────

describe('context include branches with existing files', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
    // Create CONTEXT.md, RESEARCH.md, VERIFICATION.md, UAT.md in phase dir
    const phaseDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'phases', '01-test');
    fs.writeFileSync(path.join(phaseDir, '01-CONTEXT.md'), '# Context\nDecisions here\n');
    fs.writeFileSync(path.join(phaseDir, '01-RESEARCH.md'), '# Research\nFindings here\n');
    fs.writeFileSync(path.join(phaseDir, '01-VERIFICATION.md'), '# Verification\nResults here\n');
    fs.writeFileSync(path.join(phaseDir, '01-UAT.md'), '# UAT\nTest results\n');
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('plan-phase --include context reads existing CONTEXT.md', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['context']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.context_content).toContain('Decisions here');
  });

  test('plan-phase --include research reads existing RESEARCH.md', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['research']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.research_content).toContain('Findings here');
  });

  test('plan-phase --include verification reads existing VERIFICATION.md', () => {
    const { stdout } = captureOutput(() =>
      cmdInitPlanPhase(tmpDir, '1', new Set(['verification']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.verification_content).toContain('Results here');
  });

  test('plan-phase --include uat reads existing UAT.md', () => {
    const { stdout } = captureOutput(() => cmdInitPlanPhase(tmpDir, '1', new Set(['uat']), false));
    const result = JSON.parse(stdout);
    expect(result.uat_content).toContain('Test results');
  });
});

// ─── Research workflow include branches ──────────────────────────────────────

describe('research workflow include branches with files', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
    const researchDir = path.join(tmpDir, '.planning', 'milestones', 'anonymous', 'research');
    fs.mkdirSync(researchDir, { recursive: true });
    fs.mkdirSync(path.join(researchDir, 'deep-dives'), { recursive: true });
    fs.writeFileSync(path.join(researchDir, 'LANDSCAPE.md'), '# Landscape\nMethods here\n');
    fs.writeFileSync(path.join(researchDir, 'PAPERS.md'), '# Papers\nPaper index\n');
    fs.writeFileSync(path.join(researchDir, 'deep-dives', 'test-paper.md'), '# Test Paper\n');
    fs.writeFileSync(
      path.join(tmpDir, '.planning', 'KNOWHOW.md'),
      '# Knowhow\nProduction knowledge\n'
    );
    fs.writeFileSync(path.join(tmpDir, '.planning', 'BASELINE.md'), '# Baseline\nMetrics\n');
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\nGoals\n');
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('deep-dive workflow lists deep-dives', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'deep-dive', 'test', new Set(['landscape']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.deep_dives).toContain('test-paper.md');
    expect(result.landscape_content).toContain('Methods here');
  });

  test('research workflow with --include papers', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', 'topic', new Set(['papers']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.papers_content).toContain('Paper index');
  });

  test('research workflow with --include knowhow', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', 'topic', new Set(['knowhow']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.knowhow_content).toContain('Production knowledge');
  });

  test('research workflow with --include baseline', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'feasibility', 'approach', new Set(['baseline']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.baseline_content).toContain('Metrics');
  });

  test('research workflow with --include roadmap', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', 'topic', new Set(['roadmap']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.roadmap_content).toContain('Roadmap');
  });

  test('research workflow with --include config', () => {
    const { stdout } = captureOutput(() =>
      cmdInitResearchWorkflow(tmpDir, 'survey', 'topic', new Set(['config']), false)
    );
    const result = JSON.parse(stdout);
    expect(result.config_content).toContain('model_profile');
  });
});

// ─── Init progress include branches (roadmap, project, config) ──────────────

describe('init progress additional include branches', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createFixtureDir();
    fs.writeFileSync(path.join(tmpDir, '.planning', 'PROJECT.md'), '# Project\nVision\n');
  });

  afterEach(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('progress with --include roadmap', () => {
    const { stdout } = captureOutput(() => cmdInitProgress(tmpDir, new Set(['roadmap']), false));
    const result = JSON.parse(stdout);
    expect(result.roadmap_content).toContain('Roadmap');
  });

  test('progress with --include project', () => {
    const { stdout } = captureOutput(() => cmdInitProgress(tmpDir, new Set(['project']), false));
    const result = JSON.parse(stdout);
    expect(result.project_content).toContain('Vision');
  });

  test('progress with --include config', () => {
    const { stdout } = captureOutput(() => cmdInitProgress(tmpDir, new Set(['config']), false));
    const result = JSON.parse(stdout);
    expect(result.config_content).toContain('model_profile');
  });
});

describe('cmdProgressRender modes', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(tmpDir);
  });

  test('table mode returns raw text', () => {
    const { stdout, exitCode } = captureOutput(() => cmdProgressRender(tmpDir, 'table', true));
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Phase');
  });

  test('bar mode returns raw text', () => {
    const { stdout, exitCode } = captureOutput(() => cmdProgressRender(tmpDir, 'bar', true));
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });
});
