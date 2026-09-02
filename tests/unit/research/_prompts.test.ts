'use strict';
const { buildHypothesizePrompt, buildClarifyPrompt } = require('../../../lib/research/_prompts');

describe('buildHypothesizePrompt grounding pack', () => {
  const thread = { id: 't', question: 'Does X help?' };
  it('injects the pack when provided', () => {
    const p = buildHypothesizePrompt(thread, [], null, [], '## Retrieved grounding (hybrid) for "Does X help?"\n\n- **Xnode**: y');
    expect(p).toContain('## Retrieved grounding');
    expect(p).toContain('- **Xnode**');
  });
  it('is unchanged when no pack is given', () => {
    expect(buildHypothesizePrompt(thread, [], null, [])).not.toContain('Retrieved grounding');
  });
});

describe('buildHypothesizePrompt pivot directive', () => {
  const thread = { id: 't', question: 'Does X help?' };
  it('injects the PLATEAU pivot directive when pivot=true', () => {
    const p = buildHypothesizePrompt(thread, [], null, [], '', true);
    expect(p).toMatch(/PLATEAU/);
    expect(p).toMatch(/pivot/i);
  });
  it('omits it when pivot is falsey', () => {
    expect(buildHypothesizePrompt(thread, [], null, [], '')).not.toMatch(/PLATEAU/);
  });
});

describe('buildClarifyPrompt structural terminator (W5)', () => {
  const thread = { id: 't', question: 'Does caching help?' };
  const p = buildClarifyPrompt(thread);

  it('names all three elements of the falsifiable metric target', () => {
    expect(p).toMatch(/METRIC/);
    expect(p).toMatch(/COMPARATOR from the enum: >=, <=, >, <, ==/);
    expect(p).toMatch(/TARGET THRESHOLD/);
  });

  it('states the empty-frontier condition structurally, not as an expectation', () => {
    expect(p).toContain('empty when, and only when');
    expect(p).not.toMatch(/expected, common case/);
  });

  it('steers by the positive: no prohibition against inventing ambiguity', () => {
    expect(p).not.toMatch(/Do NOT invent ambiguity/);
  });

  it('routes facts to lookup and only decisions to the human', () => {
    expect(p).toMatch(/Look it up, do not ask it/);
    expect(p).toMatch(/DECISION/);
  });

  it('keeps the 4-dimension cap and the __CLARIFY__ sentinel', () => {
    expect(p).toContain('at most 4 dimensions');
    expect(p).toContain('__CLARIFY__');
    expect(p).toContain(thread.question);
  });
});
