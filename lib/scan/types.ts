"use strict";

/**
 * GRD Scan/Types -- Shared output types for the prompt injection scanners.
 *
 * ScanHit is the common output shape produced by both scanProse (prose-level
 * scan in injection.ts) and scanBase64 (decoded-base64 scan in base64.ts),
 * and consumed by the orchestrator in lib/commands/scan.ts and the CLI
 * dispatch layer in lib/cli/tools.ts.
 *
 * Keeping ScanHit here (rather than in a specific scanner module) avoids
 * sibling-import awkwardness where base64.ts would have to reach into
 * injection.ts just to get its own output type.
 */

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

// Types are compile-time only — no module.exports needed. Consumers use
// `import type { ScanHit } from './types'` which ts-jest erases at runtime.
