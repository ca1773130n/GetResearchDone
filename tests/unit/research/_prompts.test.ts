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
