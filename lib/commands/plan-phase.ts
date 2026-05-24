'use strict';

/**
 * GRD Commands/PlanPhase — multi-candidate plan scaffolding (v0.4 Phase 2).
 *
 * Parses a planner subprocess's marker-fenced output and writes N
 * PLAN-i.md files to the phase directory atomically. Fail-closed by
 * default: if the planner returned a count other than N, NO files are
 * written. Pass --allow-partial-candidates to write what was found and
 * warn loudly.
 *
 * Marker format the planner is told to emit (in commands/plan-phase.md
 * <multi_candidate> block):
 *
 *   <<<PLAN-1>>>
 *   ... full plan content (YAML frontmatter + body) ...
 *   <<</PLAN-1>>>
 *   <<<PLAN-2>>>
 *   ...
 *   <<</PLAN-2>>>
 *
 * When N === 1, this command is a no-op for the planner prompt
 * (commands/plan-phase.md suppresses the <multi_candidate> block) and
 * the planner writes a bare PLAN.md via its Write tool, as in v0.3.x.
 *
 * Public surface:
 *   - parsePlanCandidates(text, expectedN) — pure parser
 *   - writePlanCandidates(phaseDir, blocks) — atomic batched writer
 *   - cmdPlanPhase(cwd, phaseNum, opts, raw) — CLI entry
 *
 * Exit codes:
 *   0 — success (N files written)
 *   1 — validation failure (count mismatch, marker parse error)
 *   2 — invocation error (phase not found, input unreadable)
 */

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const {
  findPhaseDir,
  getMilestoneInfo,
  loadConfig,
  resolveEffortKnob,
  output,
  error,
}: {
  findPhaseDir: (phasesDir: string, phaseArg: string) => string | null;
  getMilestoneInfo: (cwd: string) => { version: string };
  loadConfig: (cwd: string) => import('../types').GrdConfig;
  resolveEffortKnob: (
    config: import('../types').GrdConfig,
    knob: import('../types').EffortKnobName
  ) => number;
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');

const {
  atomicWriteFileSync,
}: {
  atomicWriteFileSync: (filePath: string, data: string) => void;
} = require('../autopilot-waves');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlanCandidateBlock {
  index: number;
  content: string;
}

export type ParseResult =
  | { ok: true; blocks: PlanCandidateBlock[] }
  | { ok: false; reason: string; foundIndices: number[] };

export interface WriteResult {
  written: string[];
}

export interface PlanPhaseOptions {
  candidates: number;
  inputFile?: string;
  allowPartial?: boolean;
}

// ─── Marker parsing ────────────────────────────────────────────────────────

const OPEN_RE = /^<<<PLAN-(\d+)>>>\s*$/;
const CLOSE_RE = /^<<<\/PLAN-(\d+)>>>\s*$/;

/**
 * Parse marker-fenced PLAN blocks from planner output.
 *
 * Returns ok: true with sorted unique blocks when the count of valid
 * <<<PLAN-i>>>...<<</PLAN-i>>> pairs equals expectedN AND the indices
 * cover 1..expectedN exactly. Anything else returns ok: false with a
 * reason and the list of indices that were found (for diagnostics).
 *
 * Rejects: duplicate indices, mismatched open/close pairs, nested
 * blocks, blocks with index 0 or > expectedN.
 */
export function parsePlanCandidates(text: string, expectedN: number): ParseResult {
  if (expectedN < 1) {
    return { ok: false, reason: 'expectedN must be >= 1', foundIndices: [] };
  }

  const lines: string[] = text.split('\n');
  const blocks: PlanCandidateBlock[] = [];
  let currentIndex: number | null = null;
  let currentBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line: string = lines[i];
    const openMatch = line.match(OPEN_RE);
    const closeMatch = line.match(CLOSE_RE);

    if (openMatch) {
      if (currentIndex !== null) {
        return {
          ok: false,
          reason: `nested <<<PLAN-${openMatch[1]}>>> opened while <<<PLAN-${currentIndex}>>> still open (line ${i + 1})`,
          foundIndices: blocks.map((b) => b.index),
        };
      }
      currentIndex = parseInt(openMatch[1], 10);
      currentBuffer = [];
    } else if (closeMatch) {
      const closeIndex: number = parseInt(closeMatch[1], 10);
      if (currentIndex === null) {
        return {
          ok: false,
          reason: `unexpected <<</PLAN-${closeIndex}>>> with no matching open (line ${i + 1})`,
          foundIndices: blocks.map((b) => b.index),
        };
      }
      if (closeIndex !== currentIndex) {
        return {
          ok: false,
          reason: `mismatched <<</PLAN-${closeIndex}>>> for open <<<PLAN-${currentIndex}>>> (line ${i + 1})`,
          foundIndices: blocks.map((b) => b.index),
        };
      }
      blocks.push({ index: currentIndex, content: currentBuffer.join('\n') });
      currentIndex = null;
      currentBuffer = [];
    } else if (currentIndex !== null) {
      currentBuffer.push(line);
    }
  }

  if (currentIndex !== null) {
    return {
      ok: false,
      reason: `<<<PLAN-${currentIndex}>>> never closed`,
      foundIndices: blocks.map((b) => b.index),
    };
  }

  const indices: number[] = blocks.map((b) => b.index);

  if (blocks.length !== expectedN) {
    return {
      ok: false,
      reason: `expected ${expectedN} PLAN block(s), found ${blocks.length}`,
      foundIndices: indices,
    };
  }

  const seen: Set<number> = new Set();
  for (const idx of indices) {
    if (seen.has(idx)) {
      return { ok: false, reason: `duplicate PLAN-${idx} block`, foundIndices: indices };
    }
    seen.add(idx);
  }

  for (let i = 1; i <= expectedN; i++) {
    if (!seen.has(i)) {
      return {
        ok: false,
        reason: `missing PLAN-${i} block (expected 1..${expectedN})`,
        foundIndices: indices,
      };
    }
  }

  blocks.sort((a, b) => a.index - b.index);
  return { ok: true, blocks };
}

// ─── File writing ──────────────────────────────────────────────────────────

/**
 * Write each block to `<phaseDir>/PLAN-<i>.md` atomically. Writes are
 * batched: every file's content is materialized to disk via
 * atomicWriteFileSync. Callers are expected to have already validated
 * that the phase directory exists.
 */
export function writePlanCandidates(
  phaseDir: string,
  blocks: PlanCandidateBlock[]
): WriteResult {
  if (!fs.existsSync(phaseDir)) {
    throw new Error(`phase directory not found: ${phaseDir}`);
  }
  const written: string[] = [];
  for (const block of blocks) {
    const filename: string = `PLAN-${block.index}.md`;
    const filePath: string = path.join(phaseDir, filename);
    atomicWriteFileSync(filePath, block.content);
    written.push(filePath);
  }
  return { written };
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

interface CmdResult {
  phase: string;
  phaseDir: string;
  candidates: number;
  blocksFound: number;
  written: string[];
  ok: boolean;
  reason?: string;
}

/**
 * `gd plan-phase <N> --candidates K [--input FILE] [--allow-partial-candidates]`
 *
 * Reads planner output text from --input (or stdin if no --input given),
 * parses K marker-fenced PLAN blocks, and writes them as PLAN-1.md ...
 * PLAN-K.md in the phase directory. Fail-closed on count mismatch
 * unless --allow-partial-candidates is set.
 *
 * Default candidate count resolves from
 * `resolveEffortKnob(config, 'candidates_per_plan_phase')` per
 * v0.4 Phase 1.
 */
export function cmdPlanPhase(
  cwd: string,
  phaseNum: string,
  opts: PlanPhaseOptions,
  raw: boolean
): void {
  const milestone = getMilestoneInfo(cwd);
  const phasesDir: string = path.join(
    cwd,
    '.planning',
    'milestones',
    milestone.version,
    'phases'
  );
  const phaseDirName: string | null = findPhaseDir(phasesDir, phaseNum);
  if (!phaseDirName) {
    error(`phase ${phaseNum} not found under ${phasesDir}`);
  }
  const phaseDir: string = path.join(phasesDir, phaseDirName as string);

  // Resolve N: explicit --candidates wins; else fall back to effort knob.
  let expectedN: number = opts.candidates;
  if (!Number.isInteger(expectedN) || expectedN < 1) {
    const cfg = loadConfig(cwd);
    expectedN = resolveEffortKnob(cfg, 'candidates_per_plan_phase');
  }
  if (expectedN > 9) {
    error(`--candidates ${expectedN} exceeds the v0.4 sanity bound of 9`);
  }

  // Read planner output: --input file path, or stdin if absent.
  const plannerText: string = readPlannerInput(opts.inputFile);

  const parsed: ParseResult = parsePlanCandidates(plannerText, expectedN);

  if (!parsed.ok && !opts.allowPartial) {
    const result: CmdResult = {
      phase: phaseNum,
      phaseDir,
      candidates: expectedN,
      blocksFound: parsed.foundIndices.length,
      written: [],
      ok: false,
      reason: parsed.reason,
    };
    // Fail-closed: emit JSON / raw on stdout so the caller can see the
    // structured failure, then exit with code 1.
    if (raw) {
      process.stdout.write(`plan-candidates failed: ${parsed.reason}\n`);
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
    process.exit(1);
  }

  // --allow-partial-candidates: extract whatever valid blocks we can.
  let blocks: PlanCandidateBlock[];
  if (parsed.ok) {
    blocks = parsed.blocks;
  } else {
    // Re-parse with relaxed validation: any well-formed block counts.
    blocks = extractPartialBlocks(plannerText);
    process.stderr.write(
      `Warning: --allow-partial-candidates active. Planner returned ${blocks.length} valid block(s) instead of ${expectedN}. Writing what was found.\n`
    );
  }

  const writeRes: WriteResult = writePlanCandidates(phaseDir, blocks);

  const result: CmdResult = {
    phase: phaseNum,
    phaseDir,
    candidates: expectedN,
    blocksFound: blocks.length,
    written: writeRes.written,
    ok: true,
  };
  output(result, raw, writeRes.written.join('\n'));
}

/**
 * Read planner output text from an explicit file or stdin. error() is
 * `never` so callers can treat the return as definitely-string.
 */
function readPlannerInput(inputFile: string | undefined): string {
  if (inputFile) {
    try {
      return fs.readFileSync(inputFile, 'utf-8');
    } catch (e) {
      error(`failed to read --input ${inputFile}: ${(e as Error).message}`);
      throw new Error('unreachable', { cause: e });
    }
  }
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (e) {
    error(`failed to read planner output from stdin: ${(e as Error).message}`);
    throw new Error('unreachable', { cause: e });
  }
}

/**
 * Extract every well-formed <<<PLAN-i>>>...<<</PLAN-i>>> block without
 * enforcing count/index coverage. Used only on the
 * --allow-partial-candidates path.
 */
function extractPartialBlocks(text: string): PlanCandidateBlock[] {
  const lines: string[] = text.split('\n');
  const blocks: PlanCandidateBlock[] = [];
  let currentIndex: number | null = null;
  let buffer: string[] = [];

  for (const line of lines) {
    const openMatch = line.match(OPEN_RE);
    const closeMatch = line.match(CLOSE_RE);
    if (openMatch) {
      currentIndex = parseInt(openMatch[1], 10);
      buffer = [];
    } else if (closeMatch) {
      if (currentIndex !== null && parseInt(closeMatch[1], 10) === currentIndex) {
        blocks.push({ index: currentIndex, content: buffer.join('\n') });
      }
      currentIndex = null;
      buffer = [];
    } else if (currentIndex !== null) {
      buffer.push(line);
    }
  }
  return blocks;
}

module.exports = {
  parsePlanCandidates,
  writePlanCandidates,
  cmdPlanPhase,
};
