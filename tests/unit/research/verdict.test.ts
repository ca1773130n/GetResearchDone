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
