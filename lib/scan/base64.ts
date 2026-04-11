"use strict";

/**
 * GRD Scan/Base64 -- Detect prompt injection patterns hidden inside
 * base64-encoded blobs.
 *
 * Extracts contiguous base64-alphabet runs of >=40 chars from each file,
 * attempts UTF-8 decoding, and applies the same INJECTION_PATTERNS to the
 * decoded text. Matches gsd-2 v2.67 scripts/base64-scan.sh threshold.
 */

import type { IgnoreEntry } from "./ignorefile";
import type { InjectionPattern } from "./patterns";
import type { ScanHit } from "./types";

const { INJECTION_PATTERNS } = require("./patterns") as {
  INJECTION_PATTERNS: ReadonlyArray<InjectionPattern>;
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

const BASE64_RUN_RE = /[A-Za-z0-9+/=]{40,}/g;
const MIN_BASE64_LEN = 40;

export interface ScanBase64Opts {
  ignoreEntries: IgnoreEntry[];
}

export function scanBase64(files: string[], opts: ScanBase64Opts): ScanHit[] {
  const hits: ScanHit[] = [];
  for (const file of files) {
    const raw = _readUtf8OrNull(file);
    if (raw === null) continue;
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const candidates = line.match(BASE64_RUN_RE);
      if (!candidates) continue;
      for (const candidate of candidates) {
        if (candidate.length < MIN_BASE64_LEN) continue;
        const decoded = _tryDecodeUtf8(candidate);
        if (decoded === null) continue;
        for (const pattern of INJECTION_PATTERNS) {
          const m = decoded.match(pattern.regex);
          if (m) {
            const match = _truncate(m[0], 80);
            hits.push({
              file,
              line: i + 1,
              pattern: pattern.id,
              label: pattern.label,
              category: pattern.category,
              match,
              ignored: isIgnored(file, decoded, opts.ignoreEntries),
              source: "base64",
            });
          }
        }
      }
    }
  }
  return hits;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _tryDecodeUtf8(candidate: string): string | null {
  try {
    const buf = Buffer.from(candidate, "base64");
    const normalized = candidate.replace(/=+$/, "");
    const reencoded = buf.toString("base64").replace(/=+$/, "");
    if (reencoded !== normalized) return null;
    const decoded = buf.toString("utf8");
    if (decoded.includes("\uFFFD")) return null;
    return decoded;
  } catch {
    return null;
  }
}

module.exports = { scanBase64 };
