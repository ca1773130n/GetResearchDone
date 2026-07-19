'use strict';
const { buildHypothesizePrompt, buildHypothesesPrompt, buildExperimentPrompt, buildLearnPrompt } =
  require('../../../lib/research/_prompts');

const thread = { id: 't', question: 'Does X help?' };

describe('prompts', () => {
  it('hypothesize prompt asks to read KG and emit __HYPOTHESIS__ contract', () => {
    const p = buildHypothesizePrompt(thread, [], null);
    expect(p).toContain('Does X help?');
    expect(p).toContain('search_nodes');
    expect(p).toContain('__HYPOTHESIS__');
  });
  it('hypothesize prompt includes prior verdict on re-loop', () => {
    const prior = [{ id: 'h1', statement: 'old', verdict: 'refuted' }];
    expect(buildHypothesizePrompt(thread, prior, 'refuted')).toContain('refuted');
  });
  it('hypothesize prompt includes prior takeaway content', () => {
    const tks = [{ iteration: 1, kind: 'failure_root_cause', content: 'cache invalidation race', failureClass: 'H3' }];
    const p = buildHypothesizePrompt(thread, [{ id: 'h1', statement: 'old', verdict: 'refuted' }], 'refuted', tks);
    expect(p).toContain('cache invalidation race');
  });
  it('hypotheses prompt emits __HYPOTHESES__ contract requesting N ranked candidates', () => {
    const p = buildHypothesesPrompt(thread, [], null, [], '', false, 4);
    expect(p).toContain('Does X help?');
    expect(p).toContain('search_nodes');
    expect(p).toContain('__HYPOTHESES__');
    expect(p).toContain('"candidates"');
    expect(p).toContain('"statement"');
    expect(p).toContain('"rationale"');
    expect(p).toContain('"predictedOutcome"');
    expect(p).toContain('4'); // mentions the requested candidate count
  });
  it('hypotheses prompt embeds the grounding pack when provided', () => {
    const p = buildHypothesesPrompt(thread, [], null, [], 'PACKED_GROUNDING_XYZ', false, 3);
    expect(p).toContain('PACKED_GROUNDING_XYZ');
  });
  it('PIN: buildHypothesizePrompt is unchanged — single __HYPOTHESIS__ contract, no __HYPOTHESES__', () => {
    const p = buildHypothesizePrompt(thread, [], null);
    expect(p).toContain('__HYPOTHESIS__');
    expect(p).not.toContain('__HYPOTHESES__');
    expect(p).toContain('Generate ONE ranked, testable hypothesis');
  });
  it('experiment prompt embeds hypothesis, iter dir and __PLAN__ contract', () => {
    const p = buildExperimentPrompt(thread, { id: 'h1', statement: 'S' }, 'experiments/1');
    expect(p).toContain('S');
    expect(p).toContain('experiments/1');
    expect(p).toContain('__PLAN__');
    expect(p).toContain('__RESULT__');
  });
  it('learn prompt embeds verdict and __TAKEAWAY__ contract', () => {
    const p = buildLearnPrompt(thread, { id: 'h1', statement: 'S' },
      { metrics: { accuracy: 0.5 }, failureClass: 'none' }, 'refuted');
    expect(p).toContain('refuted');
    expect(p).toContain('__TAKEAWAY__');
  });
});
