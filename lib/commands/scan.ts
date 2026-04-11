"use strict";

/**
 * GRD Commands/Scan -- Orchestrator for the prompt injection scanner.
 *
 * Composes lib/scan/injection and lib/scan/base64, loads the ignorefile,
 * and produces a structured ScanReport. Does not touch process.exit or
 * output formatting — the CLI dispatch layer handles that.
 */

import type { ScanHit } from "../scan/types";
import type { IgnoreEntry } from "../scan/ignorefile";

const { scanProse } = require("../scan/injection") as {
  scanProse: (
    files: string[],
    opts: { ignoreEntries: IgnoreEntry[] },
  ) => ScanHit[];
};
const { scanBase64 } = require("../scan/base64") as {
  scanBase64: (
    files: string[],
    opts: { ignoreEntries: IgnoreEntry[] },
  ) => ScanHit[];
};
const { loadIgnoreFile } = require("../scan/ignorefile") as {
  loadIgnoreFile: (filePath: string) => IgnoreEntry[];
};

export type ScanMode = "staged" | "diff" | "file" | "all";

export interface ScanReport {
  version: 1;
  mode: ScanMode;
  scanned: number;
  hits: ScanHit[];
  exitCode: 0 | 1;
}

export interface RunScanOpts {
  mode: ScanMode;
  files: string[];
  ignoreFilePath: string | null;
  injectionOnly: boolean;
  base64Only: boolean;
}

export function runScan(opts: RunScanOpts): ScanReport {
  const { mode, files, ignoreFilePath, injectionOnly, base64Only } = opts;
  const ignoreEntries = ignoreFilePath ? loadIgnoreFile(ignoreFilePath) : [];

  const hits: ScanHit[] = [];
  if (!base64Only) {
    hits.push(...scanProse(files, { ignoreEntries }));
  }
  if (!injectionOnly) {
    hits.push(...scanBase64(files, { ignoreEntries }));
  }

  const unignoredCount = hits.filter((h) => !h.ignored).length;
  const exitCode: 0 | 1 = unignoredCount > 0 ? 1 : 0;

  return {
    version: 1,
    mode,
    scanned: files.length,
    hits,
    exitCode,
  };
}

module.exports = { runScan };
