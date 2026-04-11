'use strict';

/**
 * GRD Scan/StripMarkdown -- Remove fenced code blocks and inline backtick
 * spans from markdown while preserving line numbers.
 *
 * Matches gsd-2 v2.67 scripts/docs-prompt-injection-scan.sh strip_code_blocks
 * behavior byte-for-byte, including the bug-compatible single-backtick-only
 * inline stripping.
 */

const FENCE_RE = /^\s*```/;
const INLINE_BACKTICK_RE = /`[^`]+`/g;

/**
 * Strip fenced code blocks and inline backtick spans from markdown content.
 * Lines inside fenced blocks become empty lines (preserving line numbers for
 * error reporting). Inline backtick spans are replaced with empty string.
 */
export function stripCodeBlocks(raw: string): string {
  const lines = raw.split('\n');
  const out: string[] = [];
  let inCode = false;
  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      inCode = !inCode;
      out.push('');
      continue;
    }
    if (inCode) {
      out.push('');
      continue;
    }
    out.push(line.replace(INLINE_BACKTICK_RE, ''));
  }
  return out.join('\n');
}

module.exports = { stripCodeBlocks };
