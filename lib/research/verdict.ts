'use strict';
import type {
  ExperimentPlan, ExperimentResult, MeasureOutcome, ResearchThread,
  ThreadStatus, Verdict, Comparator,
} from './types';

function compare(value: number, comparator: Comparator, target: number): boolean {
  switch (comparator) {
    case '>=': return value >= target;
    case '<=': return value <= target;
    case '>': return value > target;
    case '<': return value < target;
    case '==': return value === target;
    default: return false;
  }
}

function evaluateVerdict(plan: ExperimentPlan, result: ExperimentResult): MeasureOutcome {
  if (result.exitCode !== 0) {
    return { verdict: 'inconclusive', detail: `experiment run failed (${result.failureClass})` };
  }
  if (!(plan.metricKey in result.metrics)) {
    return { verdict: 'inconclusive', detail: `metric "${plan.metricKey}" not reported` };
  }
  const value = result.metrics[plan.metricKey];
  const pass = compare(value, plan.comparator, plan.target);
  return {
    verdict: pass ? 'supported' : 'refuted',
    detail: `${plan.metricKey}=${value} ${plan.comparator} ${plan.target} → ${pass ? 'pass' : 'fail'}`,
  };
}

function decideBranch(verdict: Verdict): 'finalize' | 'revise' {
  return verdict === 'supported' ? 'finalize' : 'revise';
}

function shouldTerminate(
  thread: ResearchThread, lastVerdict: Verdict,
): { done: boolean; status: ThreadStatus } {
  if (lastVerdict === 'supported') return { done: true, status: 'supported' };
  if (thread.iteration >= thread.maxIterations) return { done: true, status: 'exhausted' };
  return { done: false, status: 'active' };
}

function detectPlateau(verdicts: Verdict[], window = 3): boolean {
  if (verdicts.length < window) return false;
  return verdicts.slice(-window).every((v) => v !== 'supported');
}

module.exports = { compare, evaluateVerdict, decideBranch, shouldTerminate, detectPlateau };
