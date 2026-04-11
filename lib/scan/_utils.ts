"use strict";

/**
 * GRD Scan/Utils -- Shared internal helpers for the prompt injection scanners.
 *
 * These helpers are used by both scanProse (injection.ts) and scanBase64
 * (base64.ts). The underscore-prefix filename signals "internal to the scan
 * module, not a public API" per GRD convention.
 */

const fs = require("fs") as typeof import("fs");

/**
 * Read a file as UTF-8, returning null on I/O error. Writes a warning to
 * stderr describing the failure.
 */
export function _readUtf8OrNull(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    process.stderr.write(
      `warning: cannot read ${file}: ${(e as Error).message}\n`,
    );
    return null;
  }
}

/**
 * Truncate a string to at most `max` characters, appending "..." if trimmed.
 * Used to cap the `match` field on ScanHit for display output.
 */
export function _truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "...";
}

module.exports = { _readUtf8OrNull, _truncate };
