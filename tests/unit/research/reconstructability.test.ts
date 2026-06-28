'use strict';

import type { ReconstructabilityInput } from '../../../lib/research/reconstructability';

const { scoreReconstructability } = require('../../../lib/research/reconstructability') as {
  scoreReconstructability: (input: ReconstructabilityInput) => {
    score: number;
    checks: Record<string, boolean>;
  };
};

const FULL: ReconstructabilityInput = {
  script: 'echo "__RESULT__ {\\"accuracy\\": 0.9}"',
  metricKey: 'accuracy',
  comparator: '>=',
  target: 0.8,
  language: 'shell',
  runner: 'subprocess',
};

describe('scoreReconstructability', () => {
  it('returns score 1.0 with every check true for full artifacts', () => {
    const r = scoreReconstructability(FULL);
    expect(r.score).toBe(1);
    expect(r.checks).toEqual({
      script_present: true,
      metric_spec_valid: true,
      language_recognized: true,
      runner_metadata: true,
    });
  });

  it('lowers the score and flags script_present when the script is missing', () => {
    const r = scoreReconstructability({ ...FULL, script: null });
    expect(r.checks.script_present).toBe(false);
    expect(r.score).toBe(0.75);
    // other checks remain satisfied
    expect(r.checks.metric_spec_valid).toBe(true);
  });

  it('flags script_present for an empty or whitespace-only script', () => {
    expect(scoreReconstructability({ ...FULL, script: '' }).checks.script_present).toBe(false);
    expect(scoreReconstructability({ ...FULL, script: '   \n\t' }).checks.script_present).toBe(false);
    expect(scoreReconstructability({ ...FULL, script: undefined }).checks.script_present).toBe(false);
  });

  it('flags metric_spec_valid when the metric key is missing', () => {
    expect(scoreReconstructability({ ...FULL, metricKey: '' }).checks.metric_spec_valid).toBe(false);
    expect(scoreReconstructability({ ...FULL, metricKey: null }).checks.metric_spec_valid).toBe(false);
  });

  it('flags metric_spec_valid when the comparator is unrecognized', () => {
    expect(scoreReconstructability({ ...FULL, comparator: '~=' }).checks.metric_spec_valid).toBe(false);
    expect(scoreReconstructability({ ...FULL, comparator: null }).checks.metric_spec_valid).toBe(false);
  });

  it('flags metric_spec_valid when the target is not a finite number', () => {
    expect(scoreReconstructability({ ...FULL, target: null }).checks.metric_spec_valid).toBe(false);
    expect(scoreReconstructability({ ...FULL, target: NaN }).checks.metric_spec_valid).toBe(false);
    // a numeric zero target is valid
    expect(scoreReconstructability({ ...FULL, target: 0 }).checks.metric_spec_valid).toBe(true);
  });

  it('flags language_recognized for an unknown language', () => {
    expect(scoreReconstructability({ ...FULL, language: 'ruby' }).checks.language_recognized).toBe(false);
    expect(scoreReconstructability({ ...FULL, language: null }).checks.language_recognized).toBe(false);
    expect(scoreReconstructability({ ...FULL, language: 'python' }).checks.language_recognized).toBe(true);
  });

  it('flags runner_metadata when the runner is absent or unknown', () => {
    expect(scoreReconstructability({ ...FULL, runner: null }).checks.runner_metadata).toBe(false);
    expect(scoreReconstructability({ ...FULL, runner: 'lambda' }).checks.runner_metadata).toBe(false);
    expect(scoreReconstructability({ ...FULL, runner: 'docker' }).checks.runner_metadata).toBe(true);
  });

  it('is deterministic and never throws on an empty input', () => {
    const a = scoreReconstructability({});
    const b = scoreReconstructability({});
    expect(a).toEqual(b);
    expect(a.score).toBe(0);
    expect(Object.values(a.checks).every((v) => v === false)).toBe(true);
  });
});
