"use strict";

/**
 * GRD Scan/Injection -- Prose-level prompt injection scanner.
 *
 * Applies the INJECTION_PATTERNS to markdown content after stripping fenced
 * code blocks and inline backtick spans. Integrates with the ignorefile
 * system to suppress known false positives.
 */

const fs = require("fs") as typeof import("fs");

import type { IgnoreEntry } from "./ignorefile";

const { INJECTION_PATTERNS } = require("./patterns") as {
  INJECTION_PATTERNS: ReadonlyArray<{
    id: string;
    label: string;
    category: string;
    regex: RegExp;
  }>;
};
const { stripCodeBlocks } = require("./strip-markdown") as {
  stripCodeBlocks: (raw: string) => string;
};
const { isIgnored } = require("./ignorefile") as {
  isIgnored: (
    file: string,
    matchText: string,
    entries: IgnoreEntry[],
  ) => boolean;
};

export interface ScanHit {
  file: string;
  line: number;
  pattern: string;
  label: string;
  category: string;
  match: string;
  ignored: boolean;
  source: "prose" | "base64";
}

export interface ScanProseOpts {
  ignoreEntries: IgnoreEntry[];
}

export function scanProse(files: string[], opts: ScanProseOpts): ScanHit[] {
  const hits: ScanHit[] = [];
  for (const file of files) {
    const raw = _readUtf8OrNull(file);
    if (raw === null) continue;
    const stripped = stripCodeBlocks(raw);
    const lines = stripped.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of INJECTION_PATTERNS) {
        const m = line.match(pattern.regex);
        if (m) {
          const match = _truncate(m[0], 80);
          hits.push({
            file,
            line: i + 1,
            pattern: pattern.id,
            label: pattern.label,
            category: pattern.category,
            match,
            ignored: isIgnored(file, line, opts.ignoreEntries),
            source: "prose",
          });
        }
      }
    }
  }
  return hits;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _readUtf8OrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    process.stderr.write(
      `warning: cannot read ${file}: ${(e as Error).message}\n`,
    );
    return null;
  }
}

function _truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

module.exports = { scanProse };
