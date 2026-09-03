'use strict';
const { buildHypothesizePrompt, buildHypothesesPrompt, buildClarifyPrompt } = require('../../../lib/research/_prompts');

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

describe('W2 refutation requirement in both hypothesis prompts', () => {
  const thread = { id: 't', question: 'Does X help?' };
  const single = buildHypothesizePrompt(thread, [], null, [], 'PACK');
  const multi = buildHypothesesPrompt(thread, [], null, [], 'PACK', false, 3);

  it.each([['single', single], ['multi', multi]])('%s: states the admission test, not advice', (_label, p) => {
    expect(p).toContain('FALSIFIABILITY IS AN ADMISSION TEST');
    expect(p).toContain('refutationCondition');
    expect(p).toMatch(/DROPPED by the parser/);
  });

  it.each([['single', single], ['multi', multi]])('%s: carries BOTH branches of the template', (_label, p) => {
    expect(p).toContain('will make the effect disappear');
    expect(p).toContain('will make it worse');
    expect(p).toContain('A condition that points only one way is half the template');
  });

  it.each([['single', single], ['multi', multi]])('%s: emitted JSON schema names the field', (_label, p) => {
    expect(p).toContain('"refutationCondition": "..."');
  });

  it('single-block schema keeps its three original fields alongside the new one', () => {
    expect(single).toContain('{"statement": "...", "rationale": "...", "predictedOutcome": "...", "refutationCondition": "..."}');
  });

  it('multi-candidate schema keeps the candidates array shape', () => {
    expect(multi).toContain('{"candidates":[{"statement": "...", "rationale": "...", "predictedOutcome": "...", "refutationCondition": "..."}]}');
  });

  it('promises NO similarity threshold and NO judge — the test is presence only', () => {
    for (const p of [single, multi]) {
      expect(p).not.toMatch(/jaccard|similarity|overlap|too similar/i);
      expect(p).not.toMatch(/judge|score the refutation/i);
    }
  });
});

describe('E3 fold-in: honesty when the retriever returned nothing', () => {
  const thread = { id: 't', question: 'Does X help?' };

  it.each([
    ['single', (pack: string) => buildHypothesizePrompt(thread, [], null, [], pack)],
    ['multi', (pack: string) => buildHypothesesPrompt(thread, [], null, [], pack, false, 3)],
  ])('%s: an empty pack tells the agent to say so instead of inventing related work', (_label, build) => {
    const p = build('');
    expect(p).toContain('the hybrid retriever returned NOTHING');
    expect(p).toContain('Do NOT invent related work');
  });

  it.each([
    ['single', (pack: string) => buildHypothesizePrompt(thread, [], null, [], pack)],
    ['multi', (pack: string) => buildHypothesesPrompt(thread, [], null, [], pack, false, 3)],
  ])('%s: a non-empty pack suppresses the notice', (_label, build) => {
    const p = build('## Retrieved grounding (hybrid)\n\n- **Xnode**: y');
    expect(p).not.toContain('returned NOTHING');
    expect(p).toContain('- **Xnode**');
  });

  it('names both causes of an empty pack — a failed retrieval reads identically to zero nodes', () => {
    // orchestrator.ts collapses `retrieve() threw` and `retrieve() returned []` into the same
    // empty string, so the prompt must not assert a node count it cannot know.
    const p = buildHypothesizePrompt(thread, [], null, [], '');
    expect(p).toContain('zero matching');
    expect(p).toContain('a retrieval that failed');
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

  it('carries a looked-up fact through a dimension rather than dropping it', () => {
    // __CLARIFY__ has no field for a resolved fact, so the only path from a lookup into
    // refinedQuestion is a dimension whose recommended option holds the value.
    expect(p).toMatch(/Drop a dimension ONLY when the question already names that element/);
    expect(p).toMatch(/single recommended option/);
    expect(p).toMatch(/Dropping it silently leaves the question incomplete/);
  });

  it('keeps the 4-dimension cap and the __CLARIFY__ sentinel', () => {
    expect(p).toContain('at most 4 dimensions');
    expect(p).toContain('__CLARIFY__');
    expect(p).toContain(thread.question);
  });
});
