'use strict';
const { buildHypothesizePrompt } = require('../../../lib/research/_prompts');

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
