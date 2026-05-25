'use strict';
const { buildHypothesizePrompt, buildExperimentPrompt, buildLearnPrompt } =
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
