'use strict';

/**
 * GRD Scan/Ignorefile -- Parser for .prompt-injection-scanignore files.
 *
 * Format compatible with gsd-2 v2.67:
 *   - '#' prefixed lines are comments
 *   - blank lines are ignored
 *   - 'filepath:regex' is a file-scoped entry (exact filepath match)
 *   - bare 'regex' is a global entry
 *
 * Heuristic for splitting a line: find the first ':'. If the left side looks
 * like a file path (contains '/' or '.' and does not start with a regex
 * metacharacter), treat as file-scoped; otherwise treat as global.
 */

const fs = require('fs') as typeof import('fs');

export type IgnoreEntry =
  | { type: 'file'; filePath: string; pattern: RegExp }
  | { type: 'global'; pattern: RegExp };

export function parseIgnoreFile(raw: string): IgnoreEntry[] {
  const entries: IgnoreEntry[] = [];
  const lines = raw.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const left = line.slice(0, colonIdx);
      const right = line.slice(colonIdx + 1);
      if (_looksLikeFilePath(left)) {
        const pat = _compileOrWarn(right, rawLine);
        if (pat) entries.push({ type: 'file', filePath: left, pattern: pat });
        continue;
      }
    }

    const pat = _compileOrWarn(line, rawLine);
    if (pat) entries.push({ type: 'global', pattern: pat });
  }
  return entries;
}

export function loadIgnoreFile(filePath: string): IgnoreEntry[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseIgnoreFile(raw);
}

export function isIgnored(
  file: string,
  matchText: string,
  entries: IgnoreEntry[]
): boolean {
  for (const e of entries) {
    if (e.type === 'file') {
      const fileMatches = e.filePath === file || file.endsWith('/' + e.filePath);
      if (fileMatches && e.pattern.test(matchText)) return true;
    } else {
      if (e.pattern.test(matchText)) return true;
    }
  }
  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _looksLikeFilePath(s: string): boolean {
  if (s.length === 0) return false;
  const first = s[0];
  if (first === '(' || first === '[' || first === '^' || first === '\\') return false;
  return s.includes('/') || s.includes('.');
}

function _compileOrWarn(pattern: string, sourceLine: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch (e) {
    process.stderr.write(
      `warning: invalid regex in ignorefile: ${sourceLine} (${(e as Error).message})\n`
    );
    return null;
  }
}

module.exports = { parseIgnoreFile, loadIgnoreFile, isIgnored };
