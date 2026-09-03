'use strict';
const { compare, evaluateVerdict, decideBranch, shouldTerminate, detectPlateau } =
  require('../../../lib/research/verdict');

const plan = (over = {}) => ({
  procedure: 'p', metricKey: 'accuracy', comparator: '>=', target: 0.8,
  predictedOutcome: 'x', scriptPath: 'run.sh', language: 'shell', ...over,
});
const result = (over = {}) => ({
  metrics: { accuracy: 0.9 }, exitCode: 0, runner: 'subprocess',
  durationMs: 10, stdoutExcerpt: '', failureClass: 'none', ...over,
});

describe('verdict', () => {
  it('compare covers all operators and the default', () => {
    expect(compare(2, '>=', 2)).toBe(true);
    expect(compare(1, '>=', 2)).toBe(false);
    expect(compare(1, '<=', 2)).toBe(true);
    expect(compare(3, '<=', 2)).toBe(false);
    expect(compare(3, '>', 2)).toBe(true);
    expect(compare(2, '>', 2)).toBe(false);
    expect(compare(1, '<', 2)).toBe(true);
    expect(compare(2, '<', 2)).toBe(false);
    expect(compare(2, '==', 2)).toBe(true);
    expect(compare(2, '==', 3)).toBe(false);
    expect(compare(1, 'unknown' as any, 2)).toBe(false);
  });
  it('supported when metric meets target', () => {
    expect(evaluateVerdict(plan(), result()).verdict).toBe('supported');
  });
  it('refuted when metric misses target', () => {
    expect(evaluateVerdict(plan(), result({ metrics: { accuracy: 0.5 } })).verdict).toBe('refuted');
  });
  it('inconclusive when run failed', () => {
    const o = evaluateVerdict(plan(), result({ exitCode: 1, failureClass: 'H3' }));
    expect(o.verdict).toBe('inconclusive');
    expect(o.detail).toContain('H3');
  });
  it('inconclusive when metric missing', () => {
    expect(evaluateVerdict(plan(), result({ metrics: {} })).verdict).toBe('inconclusive');
  });
  it('decideBranch maps supported→finalize else revise', () => {
    expect(decideBranch('supported')).toBe('finalize');
    expect(decideBranch('refuted')).toBe('revise');
    expect(decideBranch('inconclusive')).toBe('revise');
  });
  it('shouldTerminate on supported and on max iterations', () => {
    const t = { iteration: 1, maxIterations: 5 } as any;
    expect(shouldTerminate(t, 'supported')).toEqual({ done: true, status: 'supported' });
    expect(shouldTerminate({ iteration: 5, maxIterations: 5 } as any, 'refuted'))
      .toEqual({ done: true, status: 'exhausted' });
    expect(shouldTerminate(t, 'refuted')).toEqual({ done: false, status: 'active' });
  });
  it('detectPlateau true for window of non-supported verdicts', () => {
    expect(detectPlateau(['refuted', 'inconclusive', 'refuted'], 3)).toBe(true);
    expect(detectPlateau(['refuted', 'supported', 'refuted'], 3)).toBe(false);
    expect(detectPlateau(['refuted'], 3)).toBe(false);
  });
});

describe('W3: cause discriminates a broken run from an unmeasurable design', () => {
  const { evaluateVerdict, detectDesignPlateau } = require('../../../lib/research/verdict');
  const plan = { procedure: 'p', metricKey: 'acc', comparator: '>=' as const, target: 0.9, language: 'shell' as const, scriptPath: '/x' };

  it('tags a nonzero exit as run_failed', () => {
    const o = evaluateVerdict(plan, { exitCode: 1, metrics: {}, failureClass: 'H3' });
    expect(o.cause).toBe('run_failed');
  });

  it('tags a missing committed metric as metric_absent', () => {
    const o = evaluateVerdict(plan, { exitCode: 0, metrics: { other: 1 }, failureClass: 'none' });
    expect(o.cause).toBe('metric_absent');
  });

  it('leaves the verdict string byte-identical for both causes', () => {
    // The vendored autoresearch-core parity vectors assert only `.verdict`; a new
    // Verdict value would break kernel parity, so `cause` is an additive sibling.
    expect(evaluateVerdict(plan, { exitCode: 1, metrics: {}, failureClass: 'H3' }).verdict).toBe('inconclusive');
    expect(evaluateVerdict(plan, { exitCode: 0, metrics: { other: 1 }, failureClass: 'none' }).verdict).toBe('inconclusive');
  });

  it('sets no cause on a decided verdict', () => {
    expect(evaluateVerdict(plan, { exitCode: 0, metrics: { acc: 0.95 }, failureClass: 'none' }).cause).toBeUndefined();
    expect(evaluateVerdict(plan, { exitCode: 0, metrics: { acc: 0.1 }, failureClass: 'none' }).cause).toBeUndefined();
  });

  it('detectDesignPlateau fires only on an unbroken metric_absent run', () => {
    expect(detectDesignPlateau(['metric_absent', 'metric_absent', 'metric_absent'], 3)).toBe(true);
    expect(detectDesignPlateau(['metric_absent', 'run_failed', 'metric_absent'], 3)).toBe(false);
    expect(detectDesignPlateau(['metric_absent', 'metric_absent'], 3)).toBe(false);
    expect(detectDesignPlateau([undefined, 'metric_absent', 'metric_absent'], 3)).toBe(false);
  });

  it('is distinct from the ordinary plateau, which a refuted streak also triggers', () => {
    const { detectPlateau } = require('../../../lib/research/verdict');
    expect(detectPlateau(['refuted', 'refuted', 'refuted'], 3)).toBe(true);
    // Same streak, different diagnosis: no design fault here.
    expect(detectDesignPlateau([undefined, undefined, undefined], 3)).toBe(false);
  });
});
