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
} from './types';

const { runPreflightGates } = require('./gates') as {
  runPreflightGates: (cwd: string, command: string, opts?: { phase?: string }) => PreflightResult;
};

const { findPhaseInternal } = require('./utils') as {
  findPhaseInternal: (cwd: string, phase: string) => PhaseInfo | null;
};

const { phasesDir: getPhasesDirPath } = require('./paths') as {
  phasesDir: (cwd: string) => string;
};

// Module-level write-through caches for ROADMAP.md and STATE.md reads.
// Inlined here to avoid a circular dependency with lib/phase.ts.
const _roadmapFileCache = new Map<string, string>();
function readRoadmapFile(roadmapPath: string): string {
  if (!_roadmapFileCache.has(roadmapPath)) {
    _roadmapFileCache.set(roadmapPath, fs.readFileSync(roadmapPath, 'utf-8') as string);
  }
  return _roadmapFileCache.get(roadmapPath) as string;
}
function writeRoadmapFile(roadmapPath: string, content: string): void {
  fs.writeFileSync(roadmapPath, content, 'utf-8');
  _roadmapFileCache.set(roadmapPath, content);
}

const _stateFileCache = new Map<string, string>();
function readStateFile(statePath: string): string {
  if (!_stateFileCache.has(statePath)) {
    _stateFileCache.set(statePath, fs.readFileSync(statePath, 'utf-8') as string);
  }
  return _stateFileCache.get(statePath) as string;
}
function writeStateFile(statePath: string, content: string): void {
  fs.writeFileSync(statePath, content, 'utf-8');
  _stateFileCache.set(statePath, content);
}

const { runQualityAnalysis, generateCleanupPlan } = require('./cleanup') as {
  runQualityAnalysis: (cwd: string, phaseNum: string) => QualityAnalysisResult;
  generateCleanupPlan: (
    cwd: string,
    phaseNum: string,
    report: QualityAnalysisResult
  ) => CleanupPlanResult;
};

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
  const phasesDir: string = getPhasesDirPath(cwd);
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
      `(-\\s*\\[)[ ](\\]\\s*.*Phase\\s+${phaseNum.replace('.', '\\.')}[:\\s][^\\n]*)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(checkboxPattern, `$1x$2 (completed ${today})`);

    // Progress table: update Status to Complete, add date
    const phaseEscaped: string = phaseNum.replace('.', '\\.');
    const tablePattern: RegExp = new RegExp(
      `(\\|\\s*${phaseEscaped}\\.?\\s[^|]*\\|[^|]*\\|)\\s*[^|]*(\\|)\\s*[^|]*(\\|)`,
      'i'
    );
    roadmapContent = roadmapContent.replace(tablePattern, `$1 Complete    $2 ${today} $3`);

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

  // Find next phase
  let nextPhaseNum: string | null = null;
  let nextPhaseName: string | null = null;
  let isLastPhase = true;

  try {
    const entries: import('fs').Dirent[] = fs.readdirSync(phasesDir, {
      withFileTypes: true,
    });
    const dirs: string[] = entries
      .filter((e: import('fs').Dirent) => e.isDirectory())
      .map((e: import('fs').Dirent) => e.name)
      .sort();
    const currentFloat: number = parseFloat(phaseNum);

    // Find the next phase directory after current
    for (const dir of dirs) {
      const dm: RegExpMatchArray | null = dir.match(/^(\d+(?:\.\d+)?)-?(.*)/);
      if (dm) {
        const dirFloat: number = parseFloat(dm[1]);
        if (dirFloat > currentFloat) {
          nextPhaseNum = dm[1];
          nextPhaseName = dm[2] || null;
          isLastPhase = false;
          break;
        }
      }
    }
  } catch {
    // Phases directory may not exist; isLastPhase stays true
  }

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
 * @param cwd - project root
 * @param phaseNum - phase number string (e.g., '03' or '3')
 * @returns PhaseCompleteResult on success, null on any failure
 */
export function completePhaseAfterPostPipeline(
  cwd: string,
  phaseNum: string
): PhaseCompleteResult | null {
  try {
    const result = _phaseCompleteCore(cwd, phaseNum);
    if (result.gate_failed) {
      const msgs = (result.gate_errors || []).map((g: { message: string }) => g.message).join('; ');
      process.stderr.write(
        `[autopilot] phase-finalize: gates failed for phase ${phaseNum}: ${msgs}\n`
      );
      return null;
    }
    if (result.dry_run) {
      // Defensive: dry-run should never be set when options is undefined.
      return null;
    }
    return result;
  } catch (e) {
    process.stderr.write(
      `[autopilot] phase-finalize: error completing phase ${phaseNum}: ${(e as Error).message}\n`
    );
    return null;
  }
}

module.exports = {
  _phaseCompleteCore,
  completePhaseAfterPostPipeline,
};
