'use strict';
// Executable parity vectors shared with autoresearch-core (the Python kernel).
// Canonical copy: autoresearch-core parity/vectors.json.
// Vendored copy:  tests/fixtures/autoresearch-parity-vectors.json (this repo).
// The two must stay byte-identical; behavior changes in verdict.ts/gates.ts/runner.ts
// must update both copies deliberately in the same change.
const vectors = require('../../fixtures/autoresearch-parity-vectors.json');
const { compare, evaluateVerdict, decideBranch, shouldTerminate, detectPlateau } =
  require('../../../lib/research/verdict');
const { resolveGates, checkGate } = require('../../../lib/research/gates');
const { parseMetricsLine, classifyRunFailure } = require('../../../lib/research/runner');

interface VerdictCase {
  name: string; metric_key: string; comparator: string; target: number;
  metrics: Record<string, number>; exit_code: number; failure_class: string;
  expect_verdict: string;
}

describe('autoresearch-core parity vectors', () => {
  describe('compare', () => {
    vectors.compare.forEach((c: Record<string, unknown>, i: number) => {
      it(`#${i} ${c.value} ${c.comparator} ${c.target} -> ${c.expect}`, () => {
        expect(compare(c.value, c.comparator, c.target)).toBe(c.expect);
      });
    });
  });

  describe('evaluateVerdict', () => {
    vectors.evaluate_verdict.forEach((c: VerdictCase, i: number) => {
      it(`#${i} ${c.name}`, () => {
        const plan = { metricKey: c.metric_key, comparator: c.comparator, target: c.target };
        const result = { metrics: c.metrics, exitCode: c.exit_code, failureClass: c.failure_class };
        expect(evaluateVerdict(plan, result).verdict).toBe(c.expect_verdict);
      });
    });
  });

  describe('parseMetricsLine', () => {
    vectors.parse_metrics_line.forEach((c: Record<string, unknown>, i: number) => {
      it(`#${i} ${c.name}`, () => {
        expect(parseMetricsLine(c.stdout)).toEqual(c.expect);
      });
    });
  });

  describe('classifyRunFailure', () => {
    vectors.classify_run_failure.forEach((c: Record<string, unknown>, i: number) => {
      it(`#${i} ${JSON.stringify(c.stderr).slice(0, 40)} timedOut=${c.timed_out} -> ${c.expect}`, () => {
        expect(classifyRunFailure(c.stderr, c.timed_out)).toBe(c.expect);
      });
    });
  });

  describe('resolveGates', () => {
    vectors.resolve_gates.forEach((c: Record<string, unknown>, i: number) => {
      it(`#${i} ${JSON.stringify(c.config)} noGates=${c.no_gates}`, () => {
        expect(resolveGates(c.config, c.no_gates)).toEqual(c.expect);
      });
    });
  });

  describe('checkGate', () => {
    vectors.check_gate.forEach((c: Record<string, unknown>, i: number) => {
      it(`#${i} gate=${c.gate} approved=${c.approved} -> proceed=${c.expect_proceed}`, () => {
        const thread = { gates: c.gates, status: 'active' };
        const out = checkGate(thread, c.gate, c.approved);
        expect(out.proceed).toBe(c.expect_proceed);
        expect(out.thread.pendingGate ?? null).toBe(c.expect_pending_gate);
      });
    });
  });

  describe('decideBranch', () => {
    vectors.decide_branch.forEach((c: Record<string, unknown>, i: number) => {
      it(`#${i} ${c.verdict} -> ${c.expect}`, () => {
        expect(decideBranch(c.verdict)).toBe(c.expect);
      });
    });
  });

  describe('shouldTerminate', () => {
    vectors.should_terminate.forEach((c: Record<string, unknown>, i: number) => {
      it(`#${i} iter=${c.iteration}/${c.max_iterations} ${c.last_verdict}`, () => {
        const thread = { iteration: c.iteration, maxIterations: c.max_iterations };
        const out = shouldTerminate(thread, c.last_verdict);
        expect(out.done).toBe(c.expect_done);
        expect(out.status).toBe(c.expect_status);
      });
    });
  });

  describe('detectPlateau', () => {
    vectors.detect_plateau.forEach((c: Record<string, unknown>, i: number) => {
      it(`#${i} ${JSON.stringify(c.verdicts)} window=${c.window} -> ${c.expect}`, () => {
        expect(detectPlateau(c.verdicts, c.window)).toBe(c.expect);
      });
    });
  });
});
