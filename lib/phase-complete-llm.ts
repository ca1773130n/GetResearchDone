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
import type { GateViolation, PhaseCompleteResult } from './types';
import type { Scheduler } from './scheduler';

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

function _verifyRoadmapTick(cwd: string, phaseNum: string): boolean {
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

function _buildSyntheticResult(phaseNum: string): PhaseCompleteResult {
  const today = new Date().toISOString().split('T')[0];
  return {
    completed_phase: phaseNum,
    phase_name: `(LLM-finalized)`,
    plans_executed: 'N/A',
    next_phase: null,
    next_phase_name: null,
    is_last_phase: false,
    date: today,
    roadmap_updated: true,
    state_updated: true,
    llm_fallback: true,
  } as PhaseCompleteResult;
}

/**
 * Attempts to recover from a mechanical phase-completion failure by
 * asking Claude to perform the ROADMAP.md and STATE.md edits directly.
 * Returns a synthetic PhaseCompleteResult on success, null on any
 * failure or when the scheduler is null.
 */
export async function attemptLlmFallbackCompletion(
  cwd: string,
  phaseNum: string,
  scheduler: Scheduler | null,
  failure: Error | { gate_errors?: GateViolation[] }
): Promise<PhaseCompleteResult | null> {
  if (!scheduler) return null;

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

  process.stderr.write(
    `[phase-complete-llm] attempting LLM fallback for phase ${phaseNum} ` +
      `(reason: ${failureDescription.slice(0, 200)})\n`
  );

  try {
    const result = await scheduler.spawn(prompt, {
      cwd,
      timeout: FALLBACK_TIMEOUT_MS,
      captureOutput: false,
    });
    if (result.exitCode !== 0) {
      process.stderr.write(
        `[phase-complete-llm] fallback subprocess exited with code ${result.exitCode}\n`
      );
      return null;
    }
  } catch (e) {
    process.stderr.write(
      `[phase-complete-llm] fallback subprocess threw: ${(e as Error).message}\n`
    );
    return null;
  }

  if (!_verifyRoadmapTick(cwd, phaseNum)) {
    process.stderr.write(
      `[phase-complete-llm] verification failed — ROADMAP.md checkbox not ticked\n`
    );
    return null;
  }

  process.stderr.write(`[phase-complete-llm] fallback succeeded for phase ${phaseNum}\n`);
  return _buildSyntheticResult(phaseNum);
}

module.exports = {
  attemptLlmFallbackCompletion,
};
