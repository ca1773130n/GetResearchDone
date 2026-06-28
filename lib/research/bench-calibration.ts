'use strict';
import type { ExperimentPlan, ExperimentResult, MeasureOutcome, Verdict } from './types';
import type { Runner } from './runner';

const { evaluateVerdict } = require('./verdict') as {
  evaluateVerdict: (plan: ExperimentPlan, result: ExperimentResult) => MeasureOutcome;
};

export interface BenchCalibrationResult {
  passed: boolean;
  metric: number | null;
  target: number;
  verdict: Verdict;
}

// One trivial RE-bench/MLE-bench-lite-style task: emit a fixed `accuracy`
// metric and check it clears a known target. The injected runner is what makes
// this offline; a real createSubprocessRunner would execute `scriptPath`.
// ponytail: single hardcoded task; expand the task set only if calibration becomes load-bearing.
const CALIBRATION_TASK: ExperimentPlan = {
  procedure: 'smoke calibration: emit accuracy and check it clears the target',
  metricKey: 'accuracy',
  comparator: '>=',
  target: 0.8,
  predictedOutcome: 'accuracy >= 0.8',
  scriptPath: 'calibration.sh',
  language: 'shell',
};

// Run the hardcoded calibration task through an injected runner and score it
// with the existing deterministic verdict logic. Smoke calibration only.
function runBenchCalibration(opts: { runner: Runner; threadDir?: string }): BenchCalibrationResult {
  const { runner, threadDir = '.' } = opts;
  const result = runner.run(CALIBRATION_TASK, threadDir);
  const outcome = evaluateVerdict(CALIBRATION_TASK, result);
  const metric = CALIBRATION_TASK.metricKey in result.metrics
    ? result.metrics[CALIBRATION_TASK.metricKey]
    : null;
  return {
    passed: outcome.verdict === 'supported',
    metric,
    target: CALIBRATION_TASK.target,
    verdict: outcome.verdict,
  };
}

module.exports = { runBenchCalibration, CALIBRATION_TASK };
