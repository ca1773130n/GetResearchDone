'use strict';

/**
 * GRD Wireup -- Auto-fix capability with confidence gating and re-run verification
 *
 * Provides infrastructure to automatically fix high-confidence missing connections
 * detected by the wireup detection engine. Low and medium confidence issues are
 * routed to a manual review list rather than risking incorrect automated changes.
 *
 * Fix application is delegated to the wireup orchestrator (which spawns a sonnet-tier
 * subagent). autoFixIssue() returns the fix prompt and metadata; it does NOT spawn
 * subprocesses directly.
 *
 * Model ceiling: SONNET_MODEL imported from ./state — never opus-class.
 *
 * @dependencies ./types, ./state
 */

import type { MissingConnection, FixAttempt, AutoFixResult } from './types';

const {
  SONNET_MODEL,
  readWireupState,
  writeWireupState,
}: {
  SONNET_MODEL: string;
  readWireupState: (cwd: string) => import('./types').WireupState | null;
  writeWireupState: (cwd: string, state: import('./types').WireupState) => void;
} = require('./state');

// ─── Model Alias ─────────────────────────────────────────────────────────────

/**
 * Model used for all wireup auto-fix subagent spawns.
 * Aliased from SONNET_MODEL — do not redeclare.
 */
const WIREUP_FIX_MODEL: string = SONNET_MODEL;

// ─── Confidence Classification ────────────────────────────────────────────────

/**
 * Classify the fix confidence for a given MissingConnection.
 *
 * High confidence (safe to auto-fix):
 *   missing-import, missing-export — single-line addition to a known file
 *   missing-route — route registration is a mechanical single-line change
 *
 * Medium confidence (may require understanding of app structure):
 *   unconnected-handler, missing-middleware
 *
 * Low confidence (may require external config or user input):
 *   broken-nav-link, missing-env-var
 *
 * The returned value reflects the confidence of the *fix* action, not the
 * detection confidence stored on the issue itself.
 */
function classifyFixConfidence(issue: MissingConnection): 'high' | 'medium' | 'low' {
  switch (issue.issue_type) {
    case 'missing-import':
    case 'missing-export':
    case 'missing-route':
      return 'high';
    case 'unconnected-handler':
    case 'missing-middleware':
      return 'medium';
    case 'broken-nav-link':
    case 'missing-env-var':
      return 'low';
    default: {
      // Exhaustiveness guard — TypeScript will catch unhandled cases at compile time
      const _exhaustive: never = issue.issue_type;
      void _exhaustive;
      return 'low';
    }
  }
}

// ─── Fix Prompt Builder ───────────────────────────────────────────────────────

/**
 * Build a structured prompt for a sonnet-tier agent to apply the minimal fix
 * for a given MissingConnection.
 *
 * The prompt instructs the agent to:
 *   1. Read the source and target files
 *   2. Apply the minimal fix (add import, register route, add export)
 *   3. Commit with message: wireup: fix <description>
 */
function buildAutoFixPrompt(issue: MissingConnection): string {
  return [
    `You are applying a minimal code fix to resolve a missing connection.`,
    ``,
    `Issue type: ${issue.issue_type}`,
    `Source file: ${issue.source_file}`,
    `Target file: ${issue.target_file}`,
    ``,
    `Suggested fix:`,
    issue.suggested_fix,
    ``,
    `Instructions:`,
    `1. Read both the source file and the target file.`,
    `2. Apply the minimal fix described above. Do not refactor any existing code.`,
    `   Add only what is needed to resolve the missing connection.`,
    `3. Commit your change with the message: wireup: fix ${issue.issue_type} in ${issue.target_file}`,
    ``,
    `Do not make any changes beyond what is described in the suggested fix.`,
  ].join('\n');
}

// ─── Auto-Fix Attempt ─────────────────────────────────────────────────────────

/**
 * Attempt to auto-fix a single MissingConnection.
 *
 * Confidence gate: if issue.confidence !== 'high', returns immediately with
 * fix_status 'skipped' — reRunFn is never called.
 *
 * For high-confidence issues:
 *   - Returns the fix prompt and metadata for the orchestrator to act on.
 *   - The orchestrator spawns a sonnet-tier subagent using the prompt, then calls
 *     reRunFn() to verify the fix.
 *   - fix_status is 'verified' if reRunFn returns true, 'failed' otherwise.
 *
 * @param _cwd    Working directory (reserved for future state integration)
 * @param issue   The missing connection to fix
 * @param reRunFn Callback that re-runs the failed scenario; returns true if it now passes
 */
async function autoFixIssue(
  _cwd: string,
  issue: MissingConnection,
  reRunFn: () => Promise<boolean>
): Promise<FixAttempt> {
  // Confidence gate — only high-confidence issues are auto-fixed
  if (issue.confidence !== 'high') {
    return {
      issue,
      fix_status: 'skipped',
    };
  }

  const fixDescription = `${issue.issue_type} in ${issue.target_file}`;

  try {
    // Build fix prompt for orchestrator to pass to the sonnet-tier subagent
    const fixPrompt = buildAutoFixPrompt(issue);

    const rerunPassed = await reRunFn();

    return {
      issue,
      fix_status: rerunPassed ? 'verified' : 'failed',
      fix_description: fixDescription,
      rerun_passed: rerunPassed,
      fix_prompt: fixPrompt,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      issue,
      fix_status: 'failed',
      fix_description: fixDescription,
      rerun_passed: false,
      error: errorMessage,
    };
  }
}

// ─── Partition by Confidence ──────────────────────────────────────────────────

/**
 * Split a list of issues into two groups:
 *   - High-confidence issues (candidates for auto-fix)
 *   - Medium and low confidence issues (manual review required)
 *
 * Returns an AutoFixResult with fixes_applied initially empty (populated by the
 * orchestrator after running autoFixIssue on each high-confidence issue) and
 * requires_manual_review pre-populated with non-high-confidence issues.
 */
function partitionByConfidence(issues: MissingConnection[]): AutoFixResult & { high_confidence: MissingConnection[] } {
  const requiresManualReview: MissingConnection[] = [];
  const highConfidenceIssues: MissingConnection[] = [];

  for (const issue of issues) {
    if (issue.confidence === 'high') {
      highConfidenceIssues.push(issue);
    } else {
      requiresManualReview.push(issue);
    }
  }

  return {
    fixes_applied: [],
    requires_manual_review: requiresManualReview,
    high_confidence: highConfidenceIssues,
    model_used: WIREUP_FIX_MODEL,
  };
}

// ─── Fix Outcome Persistence ──────────────────────────────────────────────────

/**
 * Persist a fix attempt outcome to wireup state.
 *
 * Reads WIREUP-STATE.json, appends to fixes_applied counter,
 * then writes the updated state back to disk.
 *
 * No-op if the state file does not exist (graceful degradation).
 *
 * @param cwd        Working directory containing .planning/WIREUP-STATE.json
 * @param _scenarioId Scenario ID associated with the fix (for future indexing)
 * @param fixAttempt  The FixAttempt to record
 */
function updateFixOutcome(
  cwd: string,
  _scenarioId: string,
  fixAttempt: FixAttempt
): void {
  const state = readWireupState(cwd);
  if (state === null) return;

  // Only increment fixes_applied for successful (verified) fixes
  const delta = fixAttempt.fix_status === 'verified' ? 1 : 0;

  const updatedState = {
    ...state,
    fixes_applied: state.fixes_applied + delta,
    timestamp: new Date().toISOString(),
  };

  writeWireupState(cwd, updatedState);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  WIREUP_FIX_MODEL,
  classifyFixConfidence,
  buildAutoFixPrompt,
  autoFixIssue,
  partitionByConfidence,
  updateFixOutcome,
};
