"use strict";

/**
 * GRD Scan/Injection -- Prose-level prompt injection scanner.
 *
 * Applies the INJECTION_PATTERNS to markdown content after stripping fenced
 * code blocks and inline backtick spans. Integrates with the ignorefile
 * system to suppress known false positives.
 */

import type { IgnoreEntry } from "./ignorefile";
import type { InjectionPattern } from "./patterns";
import type { ScanHit } from "./types";

const { INJECTION_PATTERNS } = require("./patterns") as {
  INJECTION_PATTERNS: ReadonlyArray<InjectionPattern>;
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
const { _readUtf8OrNull, _truncate } = require("./_utils") as {
  _readUtf8OrNull: (file: string) => string | null;
  _truncate: (s: string, max: number) => string;
};

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

module.exports = { scanProse };
