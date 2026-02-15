/**
 * Unit tests for lib/frontmatter.js
 *
 * Tests YAML frontmatter extraction, reconstruction, splicing, validation,
 * and the command-level functions.
 */

const path = require('path');
const { captureOutput, captureError } = require('../helpers/setup');
const { createFixtureDir, cleanupFixtureDir } = require('../helpers/fixtures');

const {
  extractFrontmatter,
  reconstructFrontmatter,
  spliceFrontmatter,
  parseMustHavesBlock,
  cmdFrontmatterGet,
  cmdFrontmatterValidate,
  FRONTMATTER_SCHEMAS,
} = require('../../lib/frontmatter');

// ─── extractFrontmatter ─────────────────────────────────────────────────────

describe('extractFrontmatter', () => {
  test('extracts simple key-value pairs', () => {
    const content = '---\nphase: 01-test\nplan: 01\ntype: execute\n---\n\nBody text';
    const fm = extractFrontmatter(content);
    expect(fm.phase).toBe('01-test');
    expect(fm.plan).toBe('01');
    expect(fm.type).toBe('execute');
  });

  test('returns empty object for content without frontmatter', () => {
    const content = 'No frontmatter here\nJust plain text';
    const fm = extractFrontmatter(content);
    expect(Object.keys(fm).length).toBe(0);
  });

  test('handles inline arrays: key: [a, b, c]', () => {
    const content = '---\ntags: [foo, bar, baz]\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.tags).toEqual(['foo', 'bar', 'baz']);
  });

  test('handles block arrays with - items', () => {
    const content = '---\nfiles_modified:\n  - src/a.js\n  - src/b.js\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.files_modified).toEqual(['src/a.js', 'src/b.js']);
  });

  test('handles nested objects', () => {
    const content = '---\ntech-stack:\n  added: [node]\n  patterns: [cli]\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm['tech-stack']).toBeDefined();
    expect(fm['tech-stack'].added).toEqual(['node']);
    expect(fm['tech-stack'].patterns).toEqual(['cli']);
  });

  test('handles empty inline array: key: []', () => {
    const content = '---\ndepends_on: []\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.depends_on).toEqual([]);
  });

  test('strips quotes from values', () => {
    const content = '---\nname: "quoted value"\n---\n';
    const fm = extractFrontmatter(content);
    expect(fm.name).toBe('quoted value');
  });
});

// ─── reconstructFrontmatter ─────────────────────────────────────────────────

describe('reconstructFrontmatter', () => {
  test('converts simple object to YAML lines', () => {
    const result = reconstructFrontmatter({ phase: '01-test', plan: '01' });
    expect(result).toContain('phase: 01-test');
    expect(result).toContain('plan: 01');
  });

  test('handles arrays inline when short', () => {
    const result = reconstructFrontmatter({ tags: ['foo', 'bar'] });
    expect(result).toContain('tags: [foo, bar]');
  });

  test('handles empty arrays', () => {
    const result = reconstructFrontmatter({ depends_on: [] });
    expect(result).toContain('depends_on: []');
  });

  test('handles nested objects', () => {
    const result = reconstructFrontmatter({ 'tech-stack': { added: ['node'] } });
    expect(result).toContain('tech-stack:');
    expect(result).toContain('  added: [node]');
  });

  test('skips null/undefined values', () => {
    const result = reconstructFrontmatter({ a: 'keep', b: null, c: undefined });
    expect(result).toContain('a: keep');
    expect(result).not.toContain('b:');
    expect(result).not.toContain('c:');
  });

  test('quotes values containing colons', () => {
    const result = reconstructFrontmatter({ desc: 'key: value' });
    expect(result).toContain('"key: value"');
  });
});

// ─── spliceFrontmatter ─────────────────────────────────────────────────────

describe('spliceFrontmatter', () => {
  test('replaces existing frontmatter', () => {
    const content = '---\nphase: 01\n---\n\nBody here';
    const result = spliceFrontmatter(content, { phase: '02', plan: '01' });
    expect(result).toContain('---\nphase: 02');
    expect(result).toContain('plan: 01');
    expect(result).toContain('Body here');
  });

  test('adds frontmatter to content without it', () => {
    const content = 'Just body text';
    const result = spliceFrontmatter(content, { phase: '01' });
    expect(result).toMatch(/^---\nphase: 01\n---/);
    expect(result).toContain('Just body text');
  });

  test('preserves body after splice', () => {
    const content = '---\nold: value\n---\n\n# Heading\n\nParagraph';
    const result = spliceFrontmatter(content, { new_field: 'value' });
    expect(result).toContain('# Heading');
    expect(result).toContain('Paragraph');
  });
});

// ─── parseMustHavesBlock ────────────────────────────────────────────────────

describe('parseMustHavesBlock', () => {
  const planContent = `---
phase: 01-test
plan: 01

must_haves:
    truths:
      - "Project structure created"
      - "Tests pass"
    artifacts:
      - path: "src/index.js"
        provides: "Entry point"
    key_links: []
---

Body`;

  test('parses truths array', () => {
    const truths = parseMustHavesBlock(planContent, 'truths');
    expect(truths.length).toBeGreaterThanOrEqual(2);
    expect(truths).toContain('Project structure created');
    expect(truths).toContain('Tests pass');
  });

  test('parses artifacts with nested key-value pairs', () => {
    const artifacts = parseMustHavesBlock(planContent, 'artifacts');
    expect(artifacts.length).toBeGreaterThanOrEqual(1);
    const first = artifacts[0];
    expect(first).toHaveProperty('path', 'src/index.js');
    expect(first).toHaveProperty('provides', 'Entry point');
  });

  test('returns empty array for content without frontmatter', () => {
    const result = parseMustHavesBlock('No frontmatter', 'truths');
    expect(result).toEqual([]);
  });

  test('returns empty array for missing block', () => {
    const result = parseMustHavesBlock('---\nphase: 01\n---\n', 'truths');
    expect(result).toEqual([]);
  });
});

// ─── cmdFrontmatterGet ──────────────────────────────────────────────────────

describe('cmdFrontmatterGet', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('returns all frontmatter fields', () => {
    const planPath = path.join('.planning', 'phases', '01-test', '01-01-PLAN.md');
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterGet(fixtureDir, planPath, null, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.phase).toBe('01-test');
    expect(parsed.plan).toBe('01');
  });

  test('returns single field with --field', () => {
    const planPath = path.join('.planning', 'phases', '01-test', '01-01-PLAN.md');
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterGet(fixtureDir, planPath, 'phase', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.phase).toBe('01-test');
  });

  test('returns error for non-existent file', () => {
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterGet(fixtureDir, 'nonexistent.md', null, false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.error).toBe('File not found');
  });
});

// ─── cmdFrontmatterValidate ─────────────────────────────────────────────────

describe('cmdFrontmatterValidate', () => {
  let fixtureDir;

  beforeAll(() => {
    fixtureDir = createFixtureDir();
  });

  afterAll(() => {
    cleanupFixtureDir(fixtureDir);
  });

  test('valid plan returns valid: true', () => {
    const planPath = path.join('.planning', 'phases', '01-test', '01-01-PLAN.md');
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterValidate(fixtureDir, planPath, 'plan', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(true);
    expect(parsed.missing).toEqual([]);
  });

  test('valid summary returns valid: true', () => {
    const summaryPath = path.join('.planning', 'phases', '01-test', '01-01-SUMMARY.md');
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterValidate(fixtureDir, summaryPath, 'summary', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(true);
  });

  test('file with missing fields returns valid: false with missing list', () => {
    // ROADMAP.md has no frontmatter, so it will be missing everything
    const { stdout, exitCode } = captureOutput(() => {
      cmdFrontmatterValidate(fixtureDir, '.planning/ROADMAP.md', 'plan', false);
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(false);
    expect(parsed.missing.length).toBeGreaterThan(0);
  });
});

// ─── FRONTMATTER_SCHEMAS ───────────────────────────────────────────────────

describe('FRONTMATTER_SCHEMAS', () => {
  test('plan schema has required fields', () => {
    const planSchema = FRONTMATTER_SCHEMAS.plan;
    expect(planSchema.required).toContain('phase');
    expect(planSchema.required).toContain('plan');
    expect(planSchema.required).toContain('type');
    expect(planSchema.required).toContain('wave');
    expect(planSchema.required).toContain('depends_on');
    expect(planSchema.required).toContain('files_modified');
    expect(planSchema.required).toContain('autonomous');
    expect(planSchema.required).toContain('must_haves');
  });

  test('summary schema has required fields', () => {
    const summarySchema = FRONTMATTER_SCHEMAS.summary;
    expect(summarySchema.required).toContain('phase');
    expect(summarySchema.required).toContain('plan');
    expect(summarySchema.required).toContain('subsystem');
    expect(summarySchema.required).toContain('tags');
    expect(summarySchema.required).toContain('duration');
    expect(summarySchema.required).toContain('completed');
  });

  test('verification schema has required fields', () => {
    const verifySchema = FRONTMATTER_SCHEMAS.verification;
    expect(verifySchema.required).toContain('phase');
    expect(verifySchema.required).toContain('verified');
    expect(verifySchema.required).toContain('status');
    expect(verifySchema.required).toContain('score');
  });
});
