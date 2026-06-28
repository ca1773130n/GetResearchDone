'use strict';

// Cheap, deterministic STRUCTURAL completeness score over already-recorded
// experiment artifacts. Advisory only — computed at FINALIZE and reported beside
// the verdict; it MUST NEVER gate or change the deterministic verdict.
//
// ponytail: no RNG/execution-seed check — GRD records no seed (the gap report
// flags this), so a "seed_recorded" field would always be false and is omitted.

export interface ReconstructabilityInput {
  /** Recorded experiment script body (e.g. run.sh / run.py contents). */
  script?: string | null;
  /** Verdict metric spec (from the recorded ExperimentPlan). */
  metricKey?: string | null;
  comparator?: string | null;
  target?: number | null;
  /** Recognized experiment language (from the recorded ExperimentPlan). */
  language?: string | null;
  /** Runner metadata (from the recorded ExperimentResult). */
  runner?: string | null;
}

export interface ReconstructabilityResult {
  score: number;
  checks: Record<string, boolean>;
}

const COMPARATORS = new Set(['>=', '<=', '>', '<', '==']);
const LANGUAGES = new Set(['shell', 'python']);
const RUNNERS = new Set(['subprocess', 'docker']);

function scoreReconstructability(input: ReconstructabilityInput): ReconstructabilityResult {
  const scriptPresent =
    typeof input.script === 'string' && input.script.trim().length > 0;
  const metricSpecValid =
    typeof input.metricKey === 'string' && input.metricKey.trim().length > 0
    && typeof input.comparator === 'string' && COMPARATORS.has(input.comparator)
    && typeof input.target === 'number' && Number.isFinite(input.target);
  const languageRecognized =
    typeof input.language === 'string' && LANGUAGES.has(input.language);
  const runnerMetadata =
    typeof input.runner === 'string' && RUNNERS.has(input.runner);

  const checks: Record<string, boolean> = {
    script_present: scriptPresent,
    metric_spec_valid: metricSpecValid,
    language_recognized: languageRecognized,
    runner_metadata: runnerMetadata,
  };
  const keys = Object.keys(checks);
  const passed = keys.filter((k) => checks[k]).length;
  return { score: passed / keys.length, checks };
}

module.exports = { scoreReconstructability };
