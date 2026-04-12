'use strict';

/**
 * GRD Phase/Complete/LLM -- Opt-in LLM fallback for mechanical phase
 * completion failures.
 *
 * When _phaseCompleteCore throws or returns gate_failed, and the user
 * has opted in via config.phase_complete_llm_fallback = true, this
 * module asks Claude (via the scheduler) to perform the phase finalize
 * by editing ROADMAP.md and STATE.md directly.
 *
 * Verification is shallow: after the subprocess exits, we re-read
 * ROADMAP.md and check for `- [x] Phase N`. If ticked, the fallback
 * is considered successful. Otherwise returns null.
 */

import * as fs from 'fs';
import * as path from 'path';
import { setTimeout as sleep } from 'timers/promises';
import type { GateViolation, PhaseCompleteResult } from './types';
import type { Scheduler } from './scheduler';

const { incrementCounter } = require('./metrics') as {
  incrementCounter: (name: string, delta?: number) => void;
};

const FALLBACK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes max
const PROMPT_MAX_CONTEXT_BYTES = 100_000; // 100KB ceiling

function _readFileTruncated(filePath: string, maxBytes: number): string | null {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length > maxBytes) {
      return (
        buf.subarray(0, maxBytes).toString('utf-8') +
        `\n\n[... truncated, original ${buf.length} bytes]\n`
      );
    }
    return buf.toString('utf-8');
  } catch {
    return null;
  }
}

function _listPhaseDirContents(phaseDir: string): string[] {
  try {
    return fs.readdirSync(phaseDir).sort();
  } catch {
    return [];
  }
}

function _describeFailure(failure: Error | { gate_errors?: GateViolation[] }): string {
  if (failure instanceof Error) return `Exception: ${failure.message}`;
  if ('gate_errors' in failure && failure.gate_errors) {
    return `Gate failures: ${failure.gate_errors.map((g) => g.message).join('; ')}`;
  }
  return 'Unknown mechanical failure';
}

function _buildPrompt(
  phaseNum: string,
  roadmapContent: string | null,
  stateContent: string | null,
  phaseDirFiles: string[],
  failureDescription: string
): string {
  return [
    `You are finalizing GRD Phase ${phaseNum} after the mechanical regex-based`,
    `completion failed. Your job is to update .planning/ROADMAP.md and`,
    `.planning/STATE.md directly using your file-editing tools.`,
    '',
    `Failure reason: ${failureDescription}`,
    '',
    `Phase directory contents:`,
    phaseDirFiles.length > 0
      ? phaseDirFiles.map((f) => `  - ${f}`).join('\n')
      : '  (empty or missing)',
    '',
    `## Current .planning/ROADMAP.md`,
    '',
    '```markdown',
    roadmapContent || '[MISSING]',
    '```',
    '',
    `## Current .planning/STATE.md`,
    '',
    '```markdown',
    stateContent || '[MISSING]',
    '```',
    '',
    `## Your task`,
    '',
    `1. Update ROADMAP.md so that the Phase ${phaseNum} entry is marked as`,
    `   completed. The exact format varies by project, but the canonical`,
    `   pattern is to change \`- [ ] Phase ${phaseNum}: ...\` into`,
    `   \`- [x] Phase ${phaseNum}: ... (completed ${new Date().toISOString().split('T')[0]})\`.`,
    `   If the roadmap has a progress table or status column, update that`,
    `   row to indicate Complete with today's date.`,
    '',
    `2. Update STATE.md so that Current Phase advances past ${phaseNum}`,
    `   if there is a next phase, or to "Milestone complete" if ${phaseNum}`,
    `   was the last phase. Update Last Activity to today's date and`,
    `   Last Activity Description to reflect the completion.`,
    '',
    `3. Do NOT modify any other files.`,
    '',
    `4. Do NOT run any subcommands beyond file editing (no git, no npm,`,
    `   no grd commands). Just edit the two files.`,
    '',
    `Start now. Use your file-editing tools.`,
  ].join('\n');
}

function _verifyRoadmapTicked(cwd: string, phaseNum: string): boolean {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  try {
    const content = fs.readFileSync(roadmapPath, 'utf-8');
    const pattern = new RegExp(
      `-\\s*\\[x\\]\\s*Phase\\s+${phaseNum.replace('.', '\\.')}[\\s:]`,
      'i'
    );
    return pattern.test(content);
  } catch {
    return false;
  }
}

function _verifyStateAdvanced(cwd: string, phaseNum: string): boolean {
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  let content: string;
  try {
    content = fs.readFileSync(statePath, 'utf-8');
  } catch {
    // Missing STATE.md is a verification failure — the LLM fallback
    // should NEVER delete it. If it did, downstream state-dependent
    // commands will break.
    return false;
  }

  // Find the Current Phase line
  const match = content.match(/\*\*Current Phase:\*\*\s*([^\n]*)/);
  if (!match) return true; // no Current Phase field — skip check

  const currentPhase = match[1].trim().toLowerCase();

  // Acceptable post-completion values:
  //   - A different phase number (not phaseNum)
  //   - Contains "complete" (e.g., "Milestone complete")
  if (currentPhase.includes('complete')) return true;

  // Normalize: check if currentPhase starts with or equals phaseNum
  // (handles "3", "03", "3:", "Phase 3", etc.)
  const phasePattern = new RegExp(`^(phase\\s+)?0*${phaseNum.replace('.', '\\.')}(\\b|:|$)`, 'i');
  return !phasePattern.test(currentPhase);
}

function _verifyProgressTableRow(cwd: string, phaseNum: string): boolean {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  let content: string;
  try {
    content = fs.readFileSync(roadmapPath, 'utf-8');
  } catch {
    return true; // missing — can't verify, assume ok
  }

  // Find a progress table row like `| 3 | ... | In Progress | ... |`.
  // If no table is detected for this phase, skip the check (return true).
  // If found, verify the Status column shows "Complete".
  const rowPattern = new RegExp(
    `\\|\\s*0*${phaseNum.replace('.', '\\.')}\\s*\\|([^|]*\\|){1,4}\\s*Complete\\s*\\|`,
    'i'
  );
  const rowPatternIncomplete = new RegExp(
    `\\|\\s*0*${phaseNum.replace('.', '\\.')}\\s*\\|[^\\n]*`,
    'i'
  );

  const incompleteMatch = content.match(rowPatternIncomplete);
  if (!incompleteMatch) return true; // no row for this phase, skip

  // We have a row — does it say Complete?
  return rowPattern.test(content);
}

export function _verifyFallbackOutput(
  cwd: string,
  phaseNum: string
): {
  ok: boolean;
  checks: { name: string; passed: boolean }[];
} {
  const roadmapTicked = _verifyRoadmapTicked(cwd, phaseNum);
  const stateAdvanced = _verifyStateAdvanced(cwd, phaseNum);
  const progressRow = _verifyProgressTableRow(cwd, phaseNum);

  const checks = [
    { name: 'roadmap-ticked', passed: roadmapTicked },
    { name: 'state-advanced', passed: stateAdvanced },
    { name: 'progress-row', passed: progressRow },
  ];

  // Require roadmap-ticked AND state-advanced. progress-row is advisory
  // (returns true for skipped). So `passed: true` for the advisory check
  // doesn't distinguish between "passed" and "skipped", but that's OK —
  // we're using it as a heuristic, not a hard gate.
  const ok = roadmapTicked && stateAdvanced;
  return { ok, checks };
}

function _buildSyntheticResult(cwd: string, phaseNum: string): PhaseCompleteResult {
  const today = new Date().toISOString().split('T')[0];
  const { _resolvePhaseSuccession } = require('./phase-complete') as {
    _resolvePhaseSuccession: (
      cwd: string,
      phaseNum: string
    ) => {
      phaseName: string;
      plansExecuted: string;
      nextPhaseNum: string | null;
      nextPhaseName: string | null;
      isLastPhase: boolean;
    };
  };
  const succession = _resolvePhaseSuccession(cwd, phaseNum);
  return {
    completed_phase: phaseNum,
    phase_name: succession.phaseName,
    plans_executed: succession.plansExecuted,
    next_phase: succession.nextPhaseNum,
    next_phase_name: succession.nextPhaseName,
    is_last_phase: succession.isLastPhase,
    date: today,
    roadmap_updated: true,
    state_updated: true,
    llm_fallback: true,
  } as PhaseCompleteResult;
}

/**
 * Single attempt at LLM fallback phase completion. Builds the prompt,
 * spawns the subprocess, and verifies the roadmap checkbox.
 *
 * @param cwd - project working directory
 * @param phaseNum - phase number string (e.g., '3')
 * @param scheduler - scheduler instance to use for spawning
 * @param failure - the original mechanical failure description
 * @param attemptIndex - zero-based attempt index (used for log prefix)
 * @returns synthetic PhaseCompleteResult on success, null on any failure
 */
async function _attemptOnce(
  cwd: string,
  phaseNum: string,
  scheduler: Scheduler,
  failure: Error | { gate_errors?: GateViolation[] },
  attemptIndex: number
): Promise<PhaseCompleteResult | null> {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  const statePath = path.join(cwd, '.planning', 'STATE.md');
  const roadmap = _readFileTruncated(roadmapPath, PROMPT_MAX_CONTEXT_BYTES);
  const state = _readFileTruncated(statePath, PROMPT_MAX_CONTEXT_BYTES);

  let phaseDirFiles: string[] = [];
  try {
    const { phasesDir } = require('./paths') as {
      phasesDir: (cwd: string) => string;
    };
    const basePhasesDir = phasesDir(cwd);
    const entries = fs.readdirSync(basePhasesDir);
    const match = entries.find((e) => e.startsWith(`${phaseNum}-`));
    if (match) {
      phaseDirFiles = _listPhaseDirContents(path.join(basePhasesDir, match));
    }
  } catch {
    // ignore
  }

  const failureDescription = _describeFailure(failure);
  const prompt = _buildPrompt(phaseNum, roadmap, state, phaseDirFiles, failureDescription);
  const logPrefix =
    attemptIndex > 0
      ? `[phase-complete-llm] (attempt ${attemptIndex + 1}) `
      : `[phase-complete-llm] `;

  process.stderr.write(
    `${logPrefix}attempting LLM fallback for phase ${phaseNum} ` +
      `(reason: ${failureDescription.slice(0, 200)})\n`
  );

  try {
    const result = await scheduler.spawn(prompt, {
      cwd,
      timeout: FALLBACK_TIMEOUT_MS,
      captureOutput: false,
    });
    if (result.exitCode !== 0) {
      process.stderr.write(`${logPrefix}fallback subprocess exited with code ${result.exitCode}\n`);
      return null;
    }
  } catch (e) {
    process.stderr.write(`${logPrefix}fallback subprocess threw: ${(e as Error).message}\n`);
    return null;
  }

  // Invalidate cached reads so verification sees fresh post-LLM content
  const { clearRoadmapCache, clearStateCache } = require('./phase-io') as {
    clearRoadmapCache: (filePath?: string) => void;
    clearStateCache: (filePath?: string) => void;
  };
  clearRoadmapCache(path.join(cwd, '.planning', 'ROADMAP.md'));
  clearStateCache(path.join(cwd, '.planning', 'STATE.md'));

  const verification = _verifyFallbackOutput(cwd, phaseNum);
  if (!verification.ok) {
    const failed = verification.checks
      .filter((c) => !c.passed)
      .map((c) => c.name)
      .join(', ');
    process.stderr.write(`${logPrefix}verification failed — checks: ${failed}\n`);
    return null;
  }

  process.stderr.write(`${logPrefix}fallback succeeded for phase ${phaseNum}\n`);
  incrementCounter('phase_complete_llm_fallback.successes_total');
  return _buildSyntheticResult(cwd, phaseNum);
}

/**
 * Attempts to recover from a mechanical phase-completion failure by
 * asking Claude to perform the ROADMAP.md and STATE.md edits directly.
 * Returns a synthetic PhaseCompleteResult on success, null on any
 * failure or when the scheduler is null.
 *
 * Retries up to `phase_complete_llm_fallback_retries` times (default 0)
 * with exponential backoff: 2^attempt seconds between retries (2s, 4s, …).
 */
export async function attemptLlmFallbackCompletion(
  cwd: string,
  phaseNum: string,
  scheduler: Scheduler | null,
  failure: Error | { gate_errors?: GateViolation[] }
): Promise<PhaseCompleteResult | null> {
  if (!scheduler) return null;

  incrementCounter('phase_complete_llm_fallback.attempts_total');

  // Read retry count from config
  let maxRetries = 0;
  try {
    const { loadConfig } = require('./utils') as {
      loadConfig: (cwd: string) => { phase_complete_llm_fallback_retries?: number };
    };
    const config = loadConfig(cwd);
    maxRetries = Math.max(0, config.phase_complete_llm_fallback_retries ?? 0);
  } catch {
    // Use default of 0
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await _attemptOnce(cwd, phaseNum, scheduler, failure, attempt);
    if (result !== null) return result;
    if (attempt < maxRetries) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      process.stderr.write(
        `[phase-complete-llm] retrying after ${backoffMs / 1000}s (attempt ${attempt + 2}/${maxRetries + 1})\n`
      );
      await sleep(backoffMs);
    }
  }
  return null;
}

module.exports = {
  attemptLlmFallbackCompletion,
  _verifyFallbackOutput,
};
