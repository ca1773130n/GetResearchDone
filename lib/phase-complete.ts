'use strict';

/**
 * GRD Phase/Complete -- Core phase-completion logic.
 *
 * Extracted from lib/phase.ts as part of Spec 3 of the
 * gsd-2-selective-adoption milestone. This module owns the "finalize a
 * phase" side-effects: preflight gate check, ROADMAP.md checkbox +
 * progress-table rewrite, STATE.md field rewrite, quality analysis,
 * cleanup plan generation, and next-phase discovery.
 *
 * Two exports:
 *   - _phaseCompleteCore: the existing core, used by cmdPhaseComplete
 *     and cmdPhaseBatchComplete in lib/phase.ts.
 *   - completePhaseAfterPostPipeline: new autopilot-safe wrapper that
 *     catches all errors and returns null on failure instead of
 *     throwing. Used by lib/autopilot.ts after the post-pipeline step.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  PhaseInfo,
  PreflightResult,
  QualityAnalysisResult,
  CleanupPlanResult,
  PhaseCompleteOptions,
  PhaseCompleteResult,
  GrdConfig,
  GateViolation,
} from './types';
import type { Scheduler } from './scheduler';

const { runPreflightGates } = require('./gates') as {
  runPreflightGates: (cwd: string, command: string, opts?: { phase?: string }) => PreflightResult;
};

const { findPhaseInternal } = require('./utils') as {
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
};

const { phasesDir: getPhasesDirPath } = require('./paths') as {
  phasesDir: (cwd: string) => string;
};

const {
  readRoadmapFile,
  writeRoadmapFile,
  readStateFile,
  writeStateFile,
  clearRoadmapCache,
  clearStateCache,
} = require('./phase-io') as {
  readRoadmapFile: (p: string) => string;
  writeRoadmapFile: (p: string, content: string) => void;
  readStateFile: (p: string) => string;
  writeStateFile: (p: string, content: string) => void;
  clearRoadmapCache: (filePath?: string) => void;
  clearStateCache: (filePath?: string) => void;
};

const { runQualityAnalysis, generateCleanupPlan } = require('./cleanup') as {
  runQualityAnalysis: (cwd: string, phaseNum: string) => QualityAnalysisResult;
  generateCleanupPlan: (
    cwd: string,
    phaseNum: string,
    report: QualityAnalysisResult
  ) => CleanupPlanResult;
};

const { loadConfig } = require('./utils') as {
  loadConfig: (cwd: string) => GrdConfig;
};

const { attemptLlmFallbackCompletion } = require('./phase-complete-llm') as {
  attemptLlmFallbackCompletion: (
    cwd: string,
    phaseNum: string,
    scheduler: Scheduler | null,
    failure: Error | { gate_errors?: GateViolation[] }
  ) => Promise<PhaseCompleteResult | null>;
};

/**
 * Resolves the phase succession context: plan counts, next phase, and last-phase
 * flag. Shared by _phaseCompleteCore and the LLM fallback's _buildSyntheticResult
 * so both produce consistent result fields.
 *
 * @param cwd - Project working directory
 * @param phaseNum - Phase number being completed
 */
export function _resolvePhaseSuccession(
  cwd: string,
  phaseNum: string
): {
  phaseName: string;
  plansExecuted: string;
  nextPhaseNum: string | null;
  nextPhaseName: string | null;
  isLastPhase: boolean;
} {
  const phaseInfo = findPhaseInternal(cwd, phaseNum);
  const phaseName = phaseInfo?.phase_name ?? '(unknown)';
  const planCount = phaseInfo?.plans?.length ?? 0;
  const summaryCount = phaseInfo?.summaries?.length ?? 0;
  const plansExecuted = `${summaryCount}/${planCount}`;

  const basePhasesDir = getPhasesDirPath(cwd);
  let nextPhaseNum: string | null = null;
  let nextPhaseName: string | null = null;
  let isLastPhase = true;
  try {
    const entries = fs.readdirSync(basePhasesDir, { withFileTypes: true }) as import('fs').Dirent[];
    const dirs = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name)
      .sort();
    const currentFloat = parseFloat(phaseNum);
    for (const dir of dirs) {
      const m = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      if (m && parseFloat(m[1]) > currentFloat) {
        nextPhaseNum = m[1];
        nextPhaseName = m[2] || null;
        isLastPhase = false;
        break;
      }
    }
  } catch {
    // phases dir missing — leave isLastPhase = true
  }
  return { phaseName, plansExecuted, nextPhaseNum, nextPhaseName, isLastPhase };
}

/**
 * Core logic for phase completion -- shared by cmdPhaseComplete and
 * cmdPhaseBatchComplete. Moved from lib/phase.ts in Spec 3 without
 * behavior changes.
 *
 * @param cwd - Project working directory
 * @param phaseNum - Phase number to mark complete
 * @param options - Completion options (dryRun, force, skip_cleanup)
 */
export function _phaseCompleteCore(
  cwd: string,
  phaseNum: string,
  options?: PhaseCompleteOptions
): PhaseCompleteResult {
  const dryRun: boolean = (options && options.dryRun) || false;

  // Dry-run: return preview without modifying anything
  if (dryRun) {
    const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
    return {
      dry_run: true,
      would_complete_phase: phaseNum,
      phase_found: !!phaseInfo,
    };
  }

  // Spec 3B cleanup: invalidate caches in case a prior LLM fallback
  // in the same process wrote these files directly.
  clearRoadmapCache(path.join(cwd, '.planning', 'ROADMAP.md'));
  clearStateCache(path.join(cwd, '.planning', 'STATE.md'));

  // Pre-flight gate checks
  const gates: PreflightResult = runPreflightGates(cwd, 'phase-complete', {
    phase: phaseNum,
  });
  if (!gates.passed) {
    return {
      gate_failed: true,
      gate_errors: gates.errors,
      gate_warnings: gates.warnings,
    };
  }

  const roadmapPath: string = path.join(cwd, '.planning', 'ROADMAP.md');
  const statePath: string = path.join(cwd, '.planning', 'STATE.md');
  const today: string = new Date().toISOString().split('T')[0];

  // Verify phase info
  const phaseInfo: PhaseInfo | null = findPhaseInternal(cwd, phaseNum);
  if (!phaseInfo) {
    throw new Error(`Phase ${phaseNum} not found`);
  }

  const planCount: number = phaseInfo.plans.length;
  const summaryCount: number = phaseInfo.summaries.length;

  // Update ROADMAP.md: mark phase complete
  if (fs.existsSync(roadmapPath)) {
    let roadmapContent: string = readRoadmapFile(roadmapPath);

    // Checkbox: - [ ] Phase N: -> - [x] Phase N: (...completed DATE)
    const checkboxPattern: RegExp = new RegExp(
      `(-\\s*\\[)[ ](\\]\\s*.*Phase\\s+${phaseNum.replace(/\./g, '\\.')}[:\\s][^\\n]*)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(checkboxPattern, `$1x$2 (completed ${today})`);

    // Progress table: update the Status column. Header-aware — roadmap
    // tables vary in layout (e.g. | Phase | Name | Requirements | Depends
    // on | Verification | Status |), so locate the "Status" column from
    // the table header and rewrite only that cell. If no Status header is
    // found, leave the table untouched (checkbox + phase-section updates
    // above still record completion).
    const phaseEscaped: string = phaseNum.replace(/\./g, '\\.');
    const tableLines: string[] = roadmapContent.split('\n');
    const phaseRowRe: RegExp = new RegExp(`^\\|\\s*${phaseEscaped}\\.?\\s`, 'i');
    for (let i = 0; i < tableLines.length; i++) {
      if (!phaseRowRe.test(tableLines[i])) continue;
      // Walk up through table rows to the header line (the line above the
      // |---|---| separator).
      let headerIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (!tableLines[j].trim().startsWith('|')) break;
        if (/^\|[\s:|-]*-{3,}/.test(tableLines[j]) && tableLines[j - 1]?.trim().startsWith('|')) {
          headerIdx = j - 1;
          break;
        }
      }
      if (headerIdx === -1) break;
      const headers: string[] = tableLines[headerIdx]
        .split('|')
        .map((h) => h.trim().toLowerCase());
      const statusCol: number = headers.findIndex((h) => h === 'status');
      if (statusCol === -1) break;
      const cells: string[] = tableLines[i].split('|');
      if (cells.length > statusCol) {
        cells[statusCol] = ` Complete (${today}) `;
        tableLines[i] = cells.join('|');
        roadmapContent = tableLines.join('\n');
      }
      break;
    }

    // Update plan count in phase section
    const planCountPattern: RegExp = new RegExp(
      `(#{2,}\\s*Phase\\s+${phaseEscaped}[\\s\\S]*?\\*\\*Plans:\\*\\*\\s*)[^\\n]+`,
      'i'
    );
    roadmapContent = roadmapContent.replace(
      planCountPattern,
      `$1${summaryCount}/${planCount} plans complete`
    );

    writeRoadmapFile(roadmapPath, roadmapContent);
  }

  // Find next phase using shared helper
  const { nextPhaseNum, nextPhaseName, isLastPhase } = _resolvePhaseSuccession(cwd, phaseNum);

  // Update STATE.md
  if (fs.existsSync(statePath)) {
    let stateContent: string = readStateFile(statePath);

    // Update Current Phase
    stateContent = stateContent.replace(
      /(\*\*Current Phase:\*\*\s*).*/,
      `$1${nextPhaseNum || phaseNum}`
    );

    // Update Current Phase Name
    if (nextPhaseName) {
      stateContent = stateContent.replace(
        /(\*\*Current Phase Name:\*\*\s*).*/,
        `$1${nextPhaseName.replace(/-/g, ' ')}`
      );
    }

    // Update Status
    stateContent = stateContent.replace(
      /(\*\*Status:\*\*\s*).*/,
      `$1${isLastPhase ? 'Milestone complete' : 'Ready to plan'}`
    );

    // Update Current Plan
    stateContent = stateContent.replace(/(\*\*Current Plan:\*\*\s*).*/, `$1Not started`);

    // Update Last Activity
    stateContent = stateContent.replace(/(\*\*Last Activity:\*\*\s*).*/, `$1${today}`);

    // Update Last Activity Description
    stateContent = stateContent.replace(
      /(\*\*Last Activity Description:\*\*\s*).*/,
      `$1Phase ${phaseNum} complete${nextPhaseNum ? `, transitioned to Phase ${nextPhaseNum}` : ''}`
    );

    writeStateFile(statePath, stateContent);
  }

  // Run quality analysis if enabled
  let qualityReport: QualityAnalysisResult | null = null;
  try {
    const qaResult: QualityAnalysisResult = runQualityAnalysis(cwd, phaseNum);
    if (!qaResult.skipped) {
      qualityReport = qaResult;
    }
  } catch {
    // Quality analysis is non-blocking; swallow errors
  }

  // Generate cleanup plan if quality issues exceed threshold
  let cleanupPlanResult: CleanupPlanResult | null = null;
  if (qualityReport && !qualityReport.skipped) {
    try {
      cleanupPlanResult = generateCleanupPlan(cwd, phaseNum, qualityReport);
    } catch {
      // Cleanup plan generation is non-blocking
    }
  }

  return {
    completed_phase: phaseNum,
    phase_name: phaseInfo.phase_name,
    plans_executed: `${summaryCount}/${planCount}`,
    next_phase: nextPhaseNum,
    next_phase_name: nextPhaseName,
    is_last_phase: isLastPhase,
    date: today,
    roadmap_updated: fs.existsSync(roadmapPath),
    state_updated: fs.existsSync(statePath),
    ...(qualityReport ? { quality_report: qualityReport } : {}),
    ...(cleanupPlanResult ? { cleanup_plan_generated: cleanupPlanResult } : {}),
  };
}

/**
 * Autopilot-safe wrapper around _phaseCompleteCore. Runs the existing
 * phase-complete gates and core logic, catches any error, logs it to
 * stderr, and returns null on failure instead of throwing.
 *
 * Autopilot calls this after a successful post-pipeline step; a
 * completion failure is logged as a status marker but does not crash
 * the autopilot run.
 *
 * When the mechanical path fails and config.phase_complete_llm_fallback
 * is true, delegates to attemptLlmFallbackCompletion (Spec 3B).
 *
 * @param cwd - project root
 * @param phaseNum - phase number string (e.g., '03' or '3')
 * @param scheduler - optional scheduler for LLM fallback (Spec 3B)
 * @returns PhaseCompleteResult on success, null on any failure
 */
export async function completePhaseAfterPostPipeline(
  cwd: string,
  phaseNum: string,
  scheduler?: Scheduler | null
): Promise<PhaseCompleteResult | null> {
  let mechanicalFailure: Error | { gate_errors?: GateViolation[] } | undefined;

  try {
    const result = _phaseCompleteCore(cwd, phaseNum);
    if (result.gate_failed) {
      mechanicalFailure = { gate_errors: result.gate_errors };
      const msgs = (result.gate_errors || []).map((g: { message: string }) => g.message).join('; ');
      process.stderr.write(
        `[autopilot] phase-finalize: gates failed for phase ${phaseNum}: ${msgs}\n`
      );
    } else if (result.dry_run) {
      return null;
    } else {
      return result;
    }
  } catch (e) {
    mechanicalFailure = e as Error;
    process.stderr.write(
      `[autopilot] phase-finalize: error completing phase ${phaseNum}: ${(e as Error).message}\n`
    );
  }

  // Mechanical failed — try LLM fallback if opted in
  if (!mechanicalFailure) return null;

  let fallbackEnabled = false;
  try {
    const config = loadConfig(cwd);
    fallbackEnabled = config.phase_complete_llm_fallback === true;
  } catch {
    // loadConfig failure — proceed without fallback
  }

  if (fallbackEnabled && scheduler) {
    return await attemptLlmFallbackCompletion(cwd, phaseNum, scheduler, mechanicalFailure);
  }

  return null;
}

module.exports = {
  _phaseCompleteCore,
  _resolvePhaseSuccession,
  completePhaseAfterPostPipeline,
};
