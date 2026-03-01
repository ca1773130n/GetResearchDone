/**
 * GRD Markdown Splitting -- Split large markdown files at heading boundaries
 *
 * Provides token estimation, boundary detection, splitting, index file
 * detection, reassembly, and transparent read-through for split files.
 * Core logic for REQ-60 (auto-split) and REQ-61 (index format).
 */

'use strict';

const path = require('path');
const { safeReadFile } = require('./utils');

// ─── Domain Types ─────────────────────────────────────────────────────────────

/**
 * Options for splitMarkdown function.
 */
interface SplitMarkdownOptions {
  threshold?: number;
  basename?: string;
}

/**
 * A single partial file produced by splitting.
 */
interface SplitPartial {
  filename: string;
  content: string;
}

/**
 * Result when splitting was performed.
 */
interface SplitPerformedResult {
  split_performed: true;
  index_content: string;
  parts: SplitPartial[];
}

/**
 * Result when splitting was skipped (already split or below threshold).
 */
interface SplitSkippedResult {
  split_performed: false;
  reason: 'already_split' | 'below_threshold';
}

/**
 * Union type for all possible splitMarkdown return values.
 */
type SplitResult = SplitPerformedResult | SplitSkippedResult;

// ─── Constants ──────────────────────────────────────────────────────────────

/** Magic comment identifying a GRD index (split) file */
const INDEX_MARKER: string = '<!-- GRD-INDEX -->';

/** Token count above which splitting is triggered */
const DEFAULT_TOKEN_THRESHOLD: number = 25000;

/** Heuristic: ~4 characters per token (GPT tokenizer average) */
const CHARS_PER_TOKEN: number = 4;

// ─── Token Estimation ───────────────────────────────────────────────────────

/**
 * Estimate token count for a string using character-based heuristic.
 * @param content - Text content to estimate tokens for
 * @returns Estimated token count
 */
function estimateTokens(content: string): number {
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

// ─── Index File Detection ───────────────────────────────────────────────────

/**
 * Returns true if the content contains the GRD index marker.
 * @param content - Content to check for index marker
 * @returns Whether the content is a GRD index file
 */
function isIndexFile(content: unknown): boolean {
  return typeof content === 'string' && content.includes(INDEX_MARKER);
}

// ─── Boundary Detection ────────────────────────────────────────────────────

/**
 * Find heading-level line offsets where content should be split.
 * Scans for h1/h2 headings; falls back to blank-line boundaries.
 * @param content - Markdown content to find split boundaries in
 * @param targetPartCount - Desired number of parts
 * @returns Array of character offsets where splits should occur
 */
function findSplitBoundaries(content: string, targetPartCount: number): number[] {
  if (targetPartCount <= 1) return [];

  // Collect h1/h2 heading positions (character offsets of line starts)
  const headingPattern = /^#{1,2}\s/gm;
  const headingOffsets: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(content)) !== null) {
    // Only use headings that aren't at position 0 (can't split before the start)
    if (match.index > 0) {
      headingOffsets.push(match.index);
    }
  }

  const candidateOffsets = headingOffsets;

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
  const boundaries: number[] = [];
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
 * Pure function -- computes the split but does NOT write files.
 * @param content - Markdown content to split
 * @param options - Split options (threshold, basename)
 * @returns Split result with index content and parts, or skip reason
 */
function splitMarkdown(content: string, options: SplitMarkdownOptions = {}): SplitResult {
  const threshold = options.threshold || DEFAULT_TOKEN_THRESHOLD;
  const basename = options.basename || 'DOC';

  // Guard 1: idempotency -- already-split files pass through
  if (isIndexFile(content)) {
    return { split_performed: false, reason: 'already_split' };
  }

  // Guard 2: below threshold -- no splitting needed
  if (estimateTokens(content) <= threshold) {
    return { split_performed: false, reason: 'below_threshold' };
  }

  // Compute target part count with 80% headroom
  const targetPartCount = Math.ceil(estimateTokens(content) / (threshold * 0.8));

  // Find split boundaries
  const boundaries = findSplitBoundaries(content, targetPartCount);

  // Slice content at boundaries
  const parts: string[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    parts.push(content.slice(start, boundary));
    start = boundary;
  }
  parts.push(content.slice(start)); // remaining content

  // Build result with filenames
  const numberedParts: SplitPartial[] = parts.map((partContent: string, i: number) => ({
    filename: `${basename}-part${i + 1}.md`,
    content: partContent,
  }));

  // Generate index content
  const partLinks = numberedParts
    .map((p: SplitPartial) => `- [${p.filename}](./${p.filename})`)
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
 * @param indexPath - Absolute path to the index file
 * @returns Concatenated content from all partials, or null if not an index file
 */
function reassembleFromIndex(indexPath: string): string | null {
  const content = safeReadFile(indexPath) as string | null;
  if (content === null || !isIndexFile(content)) {
    return null;
  }

  // Parse partial links: match [name](./name) patterns
  const linkPattern = /\[([^\]]+)\]\(\.\/([^)]+)\)/g;
  const partials: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(content)) !== null) {
    partials.push(match[2]); // the relative filename
  }

  const dir = path.dirname(indexPath) as string;
  const parts: string[] = [];
  for (const partial of partials) {
    const partialPath = path.join(dir, partial) as string;
    const partialContent = safeReadFile(partialPath) as string | null;
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
 * @param filePath - Absolute path to a markdown file
 * @returns File content (reassembled if index), or null if file not found
 */
function readMarkdownWithPartials(filePath: string): string | null {
  const content = safeReadFile(filePath) as string | null;
  if (content === null) return null;
  if (isIndexFile(content)) {
    try {
      return reassembleFromIndex(filePath);
    } catch (err) {
      process.stderr.write(`[markdown-split] ${(err as Error).message}\n`);
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
