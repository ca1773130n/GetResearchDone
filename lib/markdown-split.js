/**
 * GRD Markdown Splitting — Split large markdown files at heading boundaries
 *
 * Provides token estimation, boundary detection, splitting, index file
 * detection, reassembly, and transparent read-through for split files.
 * Core logic for REQ-60 (auto-split) and REQ-61 (index format).
 */

'use strict';

const path = require('path');
const { safeReadFile } = require('./utils');

// ─── Constants ──────────────────────────────────────────────────────────────

/** Magic comment identifying a GRD index (split) file */
const INDEX_MARKER = '<!-- GRD-INDEX -->';

/** Token count above which splitting is triggered */
const DEFAULT_TOKEN_THRESHOLD = 25000;

/** Heuristic: ~4 characters per token (GPT tokenizer average) */
const CHARS_PER_TOKEN = 4;

// ─── Token Estimation ───────────────────────────────────────────────────────

/**
 * Estimate token count for a string using character-based heuristic.
 * @param {string} content
 * @returns {number}
 */
function estimateTokens(content) {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

// ─── Index File Detection ───────────────────────────────────────────────────

/**
 * Returns true if the content contains the GRD index marker.
 * @param {*} content
 * @returns {boolean}
 */
function isIndexFile(content) {
  return typeof content === 'string' && content.includes(INDEX_MARKER);
}

// ─── Boundary Detection ────────────────────────────────────────────────────

/**
 * Find heading-level line offsets where content should be split.
 * Scans for h1/h2 headings; falls back to blank-line boundaries.
 * @param {string} content
 * @param {number} targetPartCount
 * @returns {number[]} Array of character offsets where splits should occur
 */
function findSplitBoundaries(content, targetPartCount) {
  if (targetPartCount <= 1) return [];

  // Collect h1/h2 heading positions (character offsets of line starts)
  const headingPattern = /^#{1,2}\s/gm;
  const headingOffsets = [];
  let match;
  while ((match = headingPattern.exec(content)) !== null) {
    // Only use headings that aren't at position 0 (can't split before the start)
    if (match.index > 0) {
      headingOffsets.push(match.index);
    }
  }

  let candidateOffsets = headingOffsets;

  // Fall back to blank-line boundaries if no headings found
  if (candidateOffsets.length === 0) {
    const blankLinePattern = /\n\n/g;
    while ((match = blankLinePattern.exec(content)) !== null) {
      const offset = match.index + 2; // position after the blank line
      if (offset < content.length) {
        candidateOffsets.push(offset);
      }
    }
  }

  if (candidateOffsets.length === 0) return [];

  // Greedily select boundaries that distribute content evenly
  const targetSize = content.length / targetPartCount;
  const boundaries = [];
  let nextTarget = targetSize;

  for (const offset of candidateOffsets) {
    if (boundaries.length >= targetPartCount - 1) break;
    if (offset >= nextTarget) {
      boundaries.push(offset);
      nextTarget = targetSize * (boundaries.length + 1);
    }
  }

  return boundaries;
}

// ─── Core Splitting ─────────────────────────────────────────────────────────

/**
 * Split markdown content into numbered partials at heading boundaries.
 * Pure function — computes the split but does NOT write files.
 * @param {string} content
 * @param {object} [options]
 * @param {number} [options.threshold] - Token threshold (default: DEFAULT_TOKEN_THRESHOLD)
 * @param {string} [options.basename] - Base name for partial files (default: 'DOC')
 * @returns {object}
 */
function splitMarkdown(content, options = {}) {
  const threshold = options.threshold || DEFAULT_TOKEN_THRESHOLD;
  const basename = options.basename || 'DOC';

  // Guard 1: idempotency — already-split files pass through
  if (isIndexFile(content)) {
    return { split_performed: false, reason: 'already_split' };
  }

  // Guard 2: below threshold — no splitting needed
  if (estimateTokens(content) <= threshold) {
    return { split_performed: false, reason: 'below_threshold' };
  }

  // Compute target part count with 80% headroom
  const targetPartCount = Math.ceil(estimateTokens(content) / (threshold * 0.8));

  // Find split boundaries
  const boundaries = findSplitBoundaries(content, targetPartCount);

  // Slice content at boundaries
  const parts = [];
  let start = 0;
  for (const boundary of boundaries) {
    parts.push(content.slice(start, boundary));
    start = boundary;
  }
  parts.push(content.slice(start)); // remaining content

  // Build result with filenames
  const numberedParts = parts.map((partContent, i) => ({
    filename: `${basename}-part${i + 1}.md`,
    content: partContent,
  }));

  // Generate index content
  const partLinks = numberedParts
    .map((p) => `- [${p.filename}](./${p.filename})`)
    .join('\n');

  const indexContent =
    `${INDEX_MARKER}\n` +
    `# ${basename} (Split Index)\n\n` +
    `This file has been automatically split into partials by GRD.\n\n` +
    `## Partials\n\n` +
    partLinks +
    '\n';

  return {
    split_performed: true,
    index_content: indexContent,
    parts: numberedParts,
  };
}

// ─── Reassembly ─────────────────────────────────────────────────────────────

/**
 * Read an index file and all its partials from disk, return concatenated content.
 * @param {string} indexPath - Absolute path to the index file
 * @returns {string|null}
 */
function reassembleFromIndex(indexPath) {
  const content = safeReadFile(indexPath);
  if (content === null || !isIndexFile(content)) {
    return null;
  }

  // Parse partial links: match [name](./name) patterns
  const linkPattern = /\[([^\]]+)\]\(\.\/([^)]+)\)/g;
  const partials = [];
  let match;
  while ((match = linkPattern.exec(content)) !== null) {
    partials.push(match[2]); // the relative filename
  }

  const dir = path.dirname(indexPath);
  const parts = [];
  for (const partial of partials) {
    const partialPath = path.join(dir, partial);
    const partialContent = safeReadFile(partialPath);
    if (partialContent === null) {
      throw new Error(`Missing partial file: ${partial}`);
    }
    parts.push(partialContent);
  }

  return parts.join('');
}

// ─── Transparent Reader ─────────────────────────────────────────────────────

/**
 * Transparent reader: if the file is a GRD index, reassemble; otherwise return as-is.
 * @param {string} filePath - Absolute path to a markdown file
 * @returns {string|null}
 */
function readMarkdownWithPartials(filePath) {
  const content = safeReadFile(filePath);
  if (content === null) return null;
  if (isIndexFile(content)) {
    try {
      return reassembleFromIndex(filePath);
    } catch (err) {
      process.stderr.write(`[markdown-split] ${err.message}\n`);
      return null;
    }
  }
  return content;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  INDEX_MARKER,
  DEFAULT_TOKEN_THRESHOLD,
  estimateTokens,
  findSplitBoundaries,
  splitMarkdown,
  isIndexFile,
  reassembleFromIndex,
  readMarkdownWithPartials,
};
