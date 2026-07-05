'use strict';
/**
 * Cross-language conformance (TS side).
 *
 * lib/research must produce the outcomes in tests/conformance/kernel-contract.json — the
 * SAME fixtures the Python kernel suite (tests/python/test_kernel_contract.py) asserts. If
 * the TS loop drifts from the contract (or from the kernel), a case here fails. Pins
 * verdict + gates parity. See docs/kernel-contract.md.
 */
import type { Comparator, ExperimentPlan, ExperimentResult, MeasureOutcome } from '../../../lib/research/types';

const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');

const { compare, evaluateVerdict } = require('../../../lib/research/verdict') as {
  compare: (value: number, comparator: Comparator, target: number) => boolean;
  evaluateVerdict: (plan: ExperimentPlan, result: ExperimentResult) => MeasureOutcome;
};
const { resolveGates, checkGate } = require('../../../lib/research/gates') as {
  resolveGates: (config: unknown, noGates: boolean) => { execute: boolean; kg_write: boolean };
  checkGate: (
    thread: { gates: Record<'execute' | 'kg_write', boolean> },
    gate: 'execute' | 'kg_write',
    approved: boolean,
  ) => { proceed: boolean };
};

interface CompareCase { value: number; comparator: string; target: number; expect: boolean }
interface VerdictCase {
  name: string; exitCode: number; failureClass: string; metricKey: string;
  metrics: Record<string, number>; comparator: string; target: number; expect: string;
}
interface GatesCase { name: string; config: unknown; noGates: boolean; expect: { execute: boolean; kg_write: boolean } }
interface CheckCase { name: string; gate: 'execute' | 'kg_write'; gateEnabled: boolean; approved: boolean; expectProceed: boolean }

const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'conformance', 'kernel-contract.json'), 'utf-8'),
) as { compare: CompareCase[]; evaluateVerdict: VerdictCase[]; resolveGates: GatesCase[]; checkGate: CheckCase[] };

function makePlan(c: VerdictCase): ExperimentPlan {
  return {
    procedure: '', metricKey: c.metricKey, comparator: c.comparator as Comparator,
    target: c.target, predictedOutcome: '', scriptPath: '', language: 'shell',
  };
}
function makeResult(c: VerdictCase): ExperimentResult {
  return {
    metrics: c.metrics, exitCode: c.exitCode, runner: 'subprocess', durationMs: 0,
    stdoutExcerpt: '', failureClass: c.failureClass as ExperimentResult['failureClass'],
  };
}

describe('kernel contract conformance (TS ⇄ autoresearch-core parity)', () => {
  test('compare', () => {
    for (const c of FIXTURES.compare) {
      expect(compare(c.value, c.comparator as Comparator, c.target)).toBe(c.expect);
    }
  });

  test('evaluateVerdict outcome', () => {
    for (const c of FIXTURES.evaluateVerdict) {
      expect(evaluateVerdict(makePlan(c), makeResult(c)).verdict).toBe(c.expect);
    }
  });

  test('resolveGates', () => {
    for (const c of FIXTURES.resolveGates) {
      const g = resolveGates(c.config, c.noGates);
      expect({ execute: g.execute, kg_write: g.kg_write }).toEqual(c.expect);
    }
  });

  test('checkGate proceed decision', () => {
    for (const c of FIXTURES.checkGate) {
      const thread = { gates: { execute: true, kg_write: true } };
      thread.gates[c.gate] = c.gateEnabled;
      expect(checkGate(thread, c.gate, c.approved).proceed).toBe(c.expectProceed);
    }
  });
});
