'use strict';
import type { ExperimentPlan, ExperimentResult } from '../../../lib/research/types';
import type { Runner } from '../../../lib/research/runner';

const { runBenchCalibration, CALIBRATION_TASK } =
  require('../../../lib/research/bench-calibration') as {
    runBenchCalibration: (opts: { runner: Runner; threadDir?: string }) => {
      passed: boolean; metric: number | null; target: number; verdict: string;
    };
    CALIBRATION_TASK: ExperimentPlan;
  };

// Fake runner: ignores the script, returns a canned ExperimentResult so the
// calibration smoke test stays offline and deterministic.
function fakeRunner(result: Partial<ExperimentResult>): Runner {
  return {
    run(_plan: ExperimentPlan, _threadDir: string): ExperimentResult {
      return {
        metrics: {},
        exitCode: 0,
        runner: 'subprocess',
        durationMs: 1,
        stdoutExcerpt: '',
        failureClass: 'none',
        ...result,
      };
    },
  };
}

describe('bench-calibration', () => {
  it('exposes one hardcoded task with a deterministic metric spec', () => {
    expect(CALIBRATION_TASK.metricKey).toBeTruthy();
    expect(['>=', '<=', '>', '<', '==']).toContain(CALIBRATION_TASK.comparator);
    expect(typeof CALIBRATION_TASK.target).toBe('number');
  });

  it('passes when the injected runner returns a metric that clears the target', () => {
    const runner = fakeRunner({
      metrics: { [CALIBRATION_TASK.metricKey]: CALIBRATION_TASK.target + 0.1 },
      stdoutExcerpt: `__RESULT__ {"${CALIBRATION_TASK.metricKey}": ${CALIBRATION_TASK.target + 0.1}}`,
    });
    const out = runBenchCalibration({ runner, threadDir: '/nonexistent' });
    expect(out.passed).toBe(true);
    expect(out.verdict).toBe('supported');
    expect(out.metric).toBe(CALIBRATION_TASK.target + 0.1);
    expect(out.target).toBe(CALIBRATION_TASK.target);
  });

  it('fails when the injected runner returns a metric below the target', () => {
    const runner = fakeRunner({
      metrics: { [CALIBRATION_TASK.metricKey]: CALIBRATION_TASK.target - 0.5 },
    });
    const out = runBenchCalibration({ runner });
    expect(out.passed).toBe(false);
    expect(out.verdict).toBe('refuted');
    expect(out.metric).toBe(CALIBRATION_TASK.target - 0.5);
  });

  it('fails (inconclusive, null metric) when the runner errors out', () => {
    const runner = fakeRunner({ exitCode: 1, failureClass: 'H4', metrics: {} });
    const out = runBenchCalibration({ runner });
    expect(out.passed).toBe(false);
    expect(out.verdict).toBe('inconclusive');
    expect(out.metric).toBeNull();
  });
});
