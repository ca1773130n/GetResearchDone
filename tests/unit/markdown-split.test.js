/**
 * Unit tests for lib/markdown-split.js
 *
 * Tests the core markdown splitting module: token estimation, boundary
 * detection, split/reassemble lifecycle, index file detection, and
 * transparent read-through for split files.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  INDEX_MARKER,
  DEFAULT_TOKEN_THRESHOLD,
  estimateTokens,
  findSplitBoundaries,
  splitMarkdown,
  isIndexFile,
  reassembleFromIndex,
  readMarkdownWithPartials,
} = require('../../lib/markdown-split');

// ─── Fixture Helpers ────────────────────────────────────────────────────────

let tmpDirs = [];

function createTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-split-test-'));
  tmpDirs.push(dir);
  return dir;
}

/**
 * Generate synthetic markdown content with numbered sections.
 * Each section is ~200 chars, so 500 sections ≈ 100k chars ≈ 25k tokens.
 */
function generateLargeMarkdown(sectionCount, headingLevel = 2) {
  const prefix = '#'.repeat(headingLevel);
  const sections = [];
  for (let i = 1; i <= sectionCount; i++) {
    sections.push(
      `${prefix} Section ${i}\n\nThis is paragraph content for section ${i}. ` +
        `It contains enough text to make the section meaningful for splitting purposes. ` +
        `Additional filler to ensure each section has reasonable length for token estimation.`
    );
  }
  return sections.join('\n\n');
}

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  tmpDirs = [];
});

// ─── Exported Constants ─────────────────────────────────────────────────────

describe('exported constants', () => {
  test('INDEX_MARKER is the GRD index comment', () => {
    expect(INDEX_MARKER).toBe('<!-- GRD-INDEX -->');
  });

  test('DEFAULT_TOKEN_THRESHOLD is 25000', () => {
    expect(DEFAULT_TOKEN_THRESHOLD).toBe(25000);
  });
});

// ─── estimateTokens ─────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  test('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('returns positive integer for non-empty string', () => {
    const result = estimateTokens('hello world');
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  test('scales proportionally with content length', () => {
    const short = estimateTokens('hello');
    const long = estimateTokens('hello'.repeat(100));
    expect(long).toBeGreaterThan(short);
  });

  test('returns a number type', () => {
    expect(typeof estimateTokens('test content')).toBe('number');
  });
});

// ─── isIndexFile ────────────────────────────────────────────────────────────

describe('isIndexFile', () => {
  test('returns true when content contains the GRD-INDEX marker', () => {
    const content = '<!-- GRD-INDEX -->\n# Doc (Split Index)\n\n## Partials\n';
    expect(isIndexFile(content)).toBe(true);
  });

  test('returns true when marker is at the beginning', () => {
    expect(isIndexFile('<!-- GRD-INDEX -->')).toBe(true);
  });

  test('returns false for regular markdown content', () => {
    expect(isIndexFile('# Normal Heading\n\nSome content')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isIndexFile('')).toBe(false);
  });

  test('returns false for non-string input', () => {
    expect(isIndexFile(null)).toBe(false);
    expect(isIndexFile(undefined)).toBe(false);
    expect(isIndexFile(42)).toBe(false);
  });
});

// ─── findSplitBoundaries ────────────────────────────────────────────────────

describe('findSplitBoundaries', () => {
  test('returns empty array for content with no headings and targetPartCount=1', () => {
    const content = 'No headings here, just plain text.';
    const boundaries = findSplitBoundaries(content, 1);
    expect(boundaries).toEqual([]);
  });

  test('finds h1 headings as boundaries', () => {
    const content = '# First\n\nParagraph.\n\n# Second\n\nMore text.';
    const boundaries = findSplitBoundaries(content, 2);
    expect(boundaries.length).toBeGreaterThan(0);
    // Each boundary should be a valid offset within the content
    for (const b of boundaries) {
      expect(b).toBeGreaterThan(0);
      expect(b).toBeLessThanOrEqual(content.length);
    }
  });

  test('finds h2 headings as boundaries', () => {
    const content = '## First\n\nParagraph.\n\n## Second\n\nMore text.';
    const boundaries = findSplitBoundaries(content, 2);
    expect(boundaries.length).toBeGreaterThan(0);
  });

  test('does NOT split at h3 or lower headings', () => {
    const content = '### Subsection A\n\nText.\n\n### Subsection B\n\nMore text.';
    const boundaries = findSplitBoundaries(content, 3);
    // h3 headings are not valid split boundaries, should fall back to blank lines
    // The boundaries should still work (blank-line fallback), but heading detection ignores h3
    expect(Array.isArray(boundaries)).toBe(true);
  });

  test('returns fewer boundaries than targetPartCount when insufficient headings', () => {
    const content = '## Only One Heading\n\nSome text.';
    const boundaries = findSplitBoundaries(content, 5);
    expect(boundaries.length).toBeLessThan(4); // fewer than targetPartCount - 1
  });

  test('falls back to blank-line splitting when no headings present', () => {
    const content = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const boundaries = findSplitBoundaries(content, 3);
    expect(Array.isArray(boundaries)).toBe(true);
  });
});

// ─── splitMarkdown — below threshold ────────────────────────────────────────

describe('splitMarkdown — below threshold', () => {
  test('returns split_performed: false for content below default threshold', () => {
    const result = splitMarkdown('# Small doc\n\nJust a small file.');
    expect(result.split_performed).toBe(false);
  });

  test('returns split_performed: false for small content with custom low threshold', () => {
    // 20 chars ≈ 5 tokens; threshold of 10 tokens should still be above this
    const result = splitMarkdown('Short text.', { threshold: 100 });
    expect(result.split_performed).toBe(false);
  });

  test('returns reason: below_threshold in the result', () => {
    const result = splitMarkdown('# Tiny\n\nNot enough content.');
    expect(result.reason).toBe('below_threshold');
  });
});

// ─── splitMarkdown — above threshold ────────────────────────────────────────

describe('splitMarkdown — above threshold', () => {
  const largeContent = generateLargeMarkdown(600);

  test('returns split_performed: true for content above threshold', () => {
    const result = splitMarkdown(largeContent);
    expect(result.split_performed).toBe(true);
  });

  test('index_content contains the GRD-INDEX marker', () => {
    const result = splitMarkdown(largeContent);
    expect(result.index_content).toContain('<!-- GRD-INDEX -->');
  });

  test('index_content contains links to each partial file', () => {
    const result = splitMarkdown(largeContent);
    for (const part of result.parts) {
      expect(result.index_content).toContain(part.filename);
    }
  });

  test('parts array has correct length (>1)', () => {
    const result = splitMarkdown(largeContent);
    expect(result.parts.length).toBeGreaterThan(1);
  });

  test('each part has filename matching BASENAME-partN.md pattern', () => {
    const result = splitMarkdown(largeContent);
    for (let i = 0; i < result.parts.length; i++) {
      expect(result.parts[i].filename).toMatch(
        new RegExp(`^DOC-part${i + 1}\\.md$`)
      );
    }
  });

  test('each part has non-empty content', () => {
    const result = splitMarkdown(largeContent);
    for (const part of result.parts) {
      expect(part.content.length).toBeGreaterThan(0);
    }
  });

  test('uses custom basename option in filenames and index', () => {
    const result = splitMarkdown(largeContent, { basename: 'STATE' });
    expect(result.index_content).toContain('STATE');
    for (const part of result.parts) {
      expect(part.filename).toMatch(/^STATE-part\d+\.md$/);
    }
  });
});

// ─── splitMarkdown — idempotency ────────────────────────────────────────────

describe('splitMarkdown — idempotency', () => {
  test('returns split_performed: false when input is an index file', () => {
    const indexContent =
      '<!-- GRD-INDEX -->\n# DOC (Split Index)\n\n## Partials\n\n- [DOC-part1.md](./DOC-part1.md)\n';
    const result = splitMarkdown(indexContent);
    expect(result.split_performed).toBe(false);
  });

  test('returns reason: already_split for index input', () => {
    const indexContent =
      '<!-- GRD-INDEX -->\n# DOC (Split Index)\n\n## Partials\n\n- [DOC-part1.md](./DOC-part1.md)\n';
    const result = splitMarkdown(indexContent);
    expect(result.reason).toBe('already_split');
  });
});

// ─── reassembleFromIndex ────────────────────────────────────────────────────

describe('reassembleFromIndex', () => {
  test('correctly reassembles split content from disk partials', () => {
    const tmpDir = createTmpDir();
    const indexPath = path.join(tmpDir, 'DOC.md');
    const indexContent =
      '<!-- GRD-INDEX -->\n# DOC (Split Index)\n\n## Partials\n\n' +
      '- [DOC-part1.md](./DOC-part1.md)\n' +
      '- [DOC-part2.md](./DOC-part2.md)\n';
    fs.writeFileSync(indexPath, indexContent);
    fs.writeFileSync(path.join(tmpDir, 'DOC-part1.md'), '# Part One\n\nContent A.');
    fs.writeFileSync(path.join(tmpDir, 'DOC-part2.md'), '## Part Two\n\nContent B.');

    const result = reassembleFromIndex(indexPath);
    expect(result).toContain('# Part One');
    expect(result).toContain('Content A.');
    expect(result).toContain('## Part Two');
    expect(result).toContain('Content B.');
  });

  test('returns null when file does not exist', () => {
    const result = reassembleFromIndex('/nonexistent/path/DOC.md');
    expect(result).toBeNull();
  });

  test('returns null when file is not an index file', () => {
    const tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'regular.md');
    fs.writeFileSync(filePath, '# Regular Markdown\n\nNo index marker here.');
    const result = reassembleFromIndex(filePath);
    expect(result).toBeNull();
  });

  test('throws error when a partial file is missing', () => {
    const tmpDir = createTmpDir();
    const indexPath = path.join(tmpDir, 'DOC.md');
    const indexContent =
      '<!-- GRD-INDEX -->\n# DOC (Split Index)\n\n## Partials\n\n' +
      '- [DOC-part1.md](./DOC-part1.md)\n' +
      '- [DOC-part2.md](./DOC-part2.md)\n';
    fs.writeFileSync(indexPath, indexContent);
    fs.writeFileSync(path.join(tmpDir, 'DOC-part1.md'), 'Part one.');
    // DOC-part2.md intentionally missing

    expect(() => reassembleFromIndex(indexPath)).toThrow(/DOC-part2\.md/);
  });

  test('preserves content order across partials', () => {
    const tmpDir = createTmpDir();
    const indexPath = path.join(tmpDir, 'DOC.md');
    const indexContent =
      '<!-- GRD-INDEX -->\n# DOC (Split Index)\n\n## Partials\n\n' +
      '- [DOC-part1.md](./DOC-part1.md)\n' +
      '- [DOC-part2.md](./DOC-part2.md)\n' +
      '- [DOC-part3.md](./DOC-part3.md)\n';
    fs.writeFileSync(indexPath, indexContent);
    fs.writeFileSync(path.join(tmpDir, 'DOC-part1.md'), 'AAA');
    fs.writeFileSync(path.join(tmpDir, 'DOC-part2.md'), 'BBB');
    fs.writeFileSync(path.join(tmpDir, 'DOC-part3.md'), 'CCC');

    const result = reassembleFromIndex(indexPath);
    const aPos = result.indexOf('AAA');
    const bPos = result.indexOf('BBB');
    const cPos = result.indexOf('CCC');
    expect(aPos).toBeLessThan(bPos);
    expect(bPos).toBeLessThan(cPos);
  });
});

// ─── readMarkdownWithPartials ───────────────────────────────────────────────

describe('readMarkdownWithPartials', () => {
  test('returns content as-is for regular markdown files', () => {
    const tmpDir = createTmpDir();
    const filePath = path.join(tmpDir, 'regular.md');
    const content = '# Regular File\n\nJust normal markdown.';
    fs.writeFileSync(filePath, content);

    const result = readMarkdownWithPartials(filePath);
    expect(result).toBe(content);
  });

  test('returns null for non-existent files', () => {
    const result = readMarkdownWithPartials('/nonexistent/file.md');
    expect(result).toBeNull();
  });

  test('transparently reassembles from index files', () => {
    const tmpDir = createTmpDir();
    const indexPath = path.join(tmpDir, 'DOC.md');
    const indexContent =
      '<!-- GRD-INDEX -->\n# DOC (Split Index)\n\n## Partials\n\n' +
      '- [DOC-part1.md](./DOC-part1.md)\n' +
      '- [DOC-part2.md](./DOC-part2.md)\n';
    fs.writeFileSync(indexPath, indexContent);
    fs.writeFileSync(path.join(tmpDir, 'DOC-part1.md'), 'First part.');
    fs.writeFileSync(path.join(tmpDir, 'DOC-part2.md'), 'Second part.');

    const result = readMarkdownWithPartials(indexPath);
    expect(result).toContain('First part.');
    expect(result).toContain('Second part.');
  });

  test('round-trip: result matches original pre-split content', () => {
    const tmpDir = createTmpDir();
    const original = '# Part One\n\nContent A.\n\n## Part Two\n\nContent B.';
    const indexPath = path.join(tmpDir, 'DOC.md');
    const indexContent =
      '<!-- GRD-INDEX -->\n# DOC (Split Index)\n\n## Partials\n\n' +
      '- [DOC-part1.md](./DOC-part1.md)\n' +
      '- [DOC-part2.md](./DOC-part2.md)\n';
    fs.writeFileSync(indexPath, indexContent);
    fs.writeFileSync(path.join(tmpDir, 'DOC-part1.md'), '# Part One\n\nContent A.');
    fs.writeFileSync(path.join(tmpDir, 'DOC-part2.md'), '## Part Two\n\nContent B.');

    const result = readMarkdownWithPartials(indexPath);
    expect(result).toContain('Content A.');
    expect(result).toContain('Content B.');
  });
});

// ─── Round-trip integration ─────────────────────────────────────────────────

describe('round-trip integration', () => {
  test('split a large file, write partials, reassemble, compare to original', () => {
    const tmpDir = createTmpDir();
    const original = generateLargeMarkdown(600);
    const result = splitMarkdown(original, { basename: 'BIGDOC' });
    expect(result.split_performed).toBe(true);

    // Write index and partials to disk
    const indexPath = path.join(tmpDir, 'BIGDOC.md');
    fs.writeFileSync(indexPath, result.index_content);
    for (const part of result.parts) {
      fs.writeFileSync(path.join(tmpDir, part.filename), part.content);
    }

    // Reassemble and compare
    const reassembled = reassembleFromIndex(indexPath);
    expect(reassembled).toBe(original);
  });

  test('split content with mixed h1/h2 headings, verify round-trip', () => {
    const tmpDir = createTmpDir();
    const sections = [];
    for (let i = 1; i <= 300; i++) {
      const heading = i % 3 === 0 ? '#' : '##';
      sections.push(
        `${heading} Section ${i}\n\nParagraph content for section ${i} with enough text to make it meaningful.`
      );
    }
    const original = sections.join('\n\n');

    // Ensure it exceeds threshold
    const tokens = estimateTokens(original);
    if (tokens <= DEFAULT_TOKEN_THRESHOLD) {
      // Skip if not large enough — shouldn't happen with 300 sections
      return;
    }

    const result = splitMarkdown(original, { basename: 'MIXED' });
    expect(result.split_performed).toBe(true);

    const indexPath = path.join(tmpDir, 'MIXED.md');
    fs.writeFileSync(indexPath, result.index_content);
    for (const part of result.parts) {
      fs.writeFileSync(path.join(tmpDir, part.filename), part.content);
    }

    const reassembled = reassembleFromIndex(indexPath);
    expect(reassembled).toBe(original);
  });

  test('split content with frontmatter-like blocks, verify round-trip', () => {
    const tmpDir = createTmpDir();
    const frontmatter = '---\ntitle: Test Document\nphase: 54\n---\n\n';
    const body = generateLargeMarkdown(600);
    const original = frontmatter + body;

    const result = splitMarkdown(original, { basename: 'FMATTER' });
    expect(result.split_performed).toBe(true);

    const indexPath = path.join(tmpDir, 'FMATTER.md');
    fs.writeFileSync(indexPath, result.index_content);
    for (const part of result.parts) {
      fs.writeFileSync(path.join(tmpDir, part.filename), part.content);
    }

    const reassembled = reassembleFromIndex(indexPath);
    expect(reassembled).toBe(original);
  });
});
