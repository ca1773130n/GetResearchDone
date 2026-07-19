'use strict';
const { extractTaggedJson, parseHypothesisOutput, parsePlanOutput, parseTakeawayOutput, parseClarifyOutput } =
  require('../../../lib/research/agent-io');

describe('agent-io', () => {
  it('extractTaggedJson reads a tagged json block', () => {
    const out = 'chatter\n__HYPOTHESIS__\n{"statement":"S"}\nmore';
    expect(extractTaggedJson(out, 'HYPOTHESIS')).toEqual({ statement: 'S' });
  });
  it('extractTaggedJson returns null when absent/invalid', () => {
    expect(extractTaggedJson('nothing', 'HYPOTHESIS')).toBeNull();
    expect(extractTaggedJson('__X__\n{bad', 'X')).toBeNull();
  });
  it('extractTaggedJson returns null when tag present but no brace', () => {
    expect(extractTaggedJson('__X__ no json here', 'X')).toBeNull();
  });
  it('extractTaggedJson handles braces inside string values', () => {
    const out = '__HYPOTHESIS__ {"statement":"use a { dict } and a closing }{ here","rationale":"r","predictedOutcome":"p"}';
    expect(extractTaggedJson(out, 'HYPOTHESIS')).toEqual({
      statement: 'use a { dict } and a closing }{ here', rationale: 'r', predictedOutcome: 'p',
    });
  });
  it('extractTaggedJson handles escaped quotes around braces', () => {
    const out = '__PLAN__ {"procedure":"echo \\"{x}\\" done","metricKey":"acc","scriptPath":"run.sh"}';
    const o = extractTaggedJson(out, 'PLAN');
    expect(o.procedure).toBe('echo "{x}" done');
    expect(o.metricKey).toBe('acc');
  });
  it('extractTaggedJson returns null on unterminated string', () => {
    expect(extractTaggedJson('__X__ {"a":"no end', 'X')).toBeNull();
  });
  it('parseHypothesisOutput parses a rationale containing code braces', () => {
    const out = '__HYPOTHESIS__ {"statement":"S","rationale":"call fn() { return {a:1}; }","predictedOutcome":"P"}';
    expect(parseHypothesisOutput(out)).toEqual({
      statement: 'S', rationale: 'call fn() { return {a:1}; }', predictedOutcome: 'P',
    });
  });
  it('parseHypothesisOutput requires statement', () => {
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"statement":"S","rationale":"R","predictedOutcome":"P"}'))
      .toEqual({ statement: 'S', rationale: 'R', predictedOutcome: 'P' });
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"rationale":"R"}')).toBeNull();
  });
  it('parseHypothesisOutput defaults optional fields', () => {
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"statement":"S"}'))
      .toEqual({ statement: 'S', rationale: '', predictedOutcome: '' });
  });
  it('parsePlanOutput requires metricKey + scriptPath', () => {
    const ok = '__PLAN__ {"procedure":"p","metricKey":"acc","comparator":">=","target":0.8,"language":"shell","scriptPath":"run.sh"}';
    expect(parsePlanOutput(ok).metricKey).toBe('acc');
    expect(parsePlanOutput('__PLAN__ {"procedure":"p"}')).toBeNull();
  });
  it('parsePlanOutput defaults comparator/target/language', () => {
    const p = parsePlanOutput('__PLAN__ {"metricKey":"acc","scriptPath":"run.sh"}');
    expect(p.comparator).toBe('>=');
    expect(p.target).toBe(0);
    expect(p.language).toBe('shell');
  });
  it('parseTakeawayOutput requires content', () => {
    const ok = '__TAKEAWAY__ {"kind":"constraint","content":"C","confidence":0.5,"evidence":"E","failureClass":"none"}';
    expect(parseTakeawayOutput(ok).content).toBe('C');
    expect(parseTakeawayOutput('__TAKEAWAY__ {"kind":"constraint"}')).toBeNull();
  });
  it('parseTakeawayOutput defaults kind/confidence/failureClass', () => {
    const t = parseTakeawayOutput('__TAKEAWAY__ {"content":"C"}');
    expect(t.kind).toBe('domain_fact');
    expect(t.confidence).toBe(0.5);
    expect(t.failureClass).toBe('none');
  });
});

describe('parseClarifyOutput (Phase 103 SEED)', () => {
  it('parses a valid block with 2 dimensions and their options', () => {
    const out = '__CLARIFY__ {"dimensions":['
      + '{"ask":"What is measured?","options":[{"label":"accuracy","description":"top-1","recommended":true},{"label":"f1","description":"macro"}],"freeform":false},'
      + '{"ask":"What baseline?","options":[{"label":"random","recommended":true},{"label":"prior SOTA"}]}'
      + ']}';
    const r = parseClarifyOutput(out);
    expect(r.dimensions.length).toBe(2);
    expect(r.dimensions[0].ask).toBe('What is measured?');
    expect(r.dimensions[0].options.length).toBe(2);
    expect(r.dimensions[0].options[0].recommended).toBe(true);
    expect(r.dimensions[0].freeform).toBe(false);
  });

  it('empty dimensions array => { dimensions: [] } (well-formed unambiguous question)', () => {
    expect(parseClarifyOutput('__CLARIFY__ {"dimensions":[]}')).toEqual({ dimensions: [] });
  });

  it('no __CLARIFY__ tag or malformed JSON => { dimensions: [] } (never surfaces junk)', () => {
    expect(parseClarifyOutput('just some prose, no tag')).toEqual({ dimensions: [] });
    expect(parseClarifyOutput('__CLARIFY__ {not json')).toEqual({ dimensions: [] });
    expect(parseClarifyOutput('__CLARIFY__ {"dimensions":"notarray"}')).toEqual({ dimensions: [] });
  });

  it('a dimension missing recommended => first option auto-marked recommended', () => {
    const out = '__CLARIFY__ {"dimensions":[{"ask":"Which?","options":[{"label":"A"},{"label":"B"}]}]}';
    const r = parseClarifyOutput(out);
    expect(r.dimensions[0].options[0].recommended).toBe(true);
    expect(r.dimensions[0].options.filter((o: any) => o.recommended === true).length).toBe(1);
  });

  it('more than 4 dimensions => capped to 4', () => {
    const dims = Array.from({ length: 7 }, (_, i) =>
      `{"ask":"q${i}","options":[{"label":"o${i}","recommended":true}]}`).join(',');
    const r = parseClarifyOutput(`__CLARIFY__ {"dimensions":[${dims}]}`);
    expect(r.dimensions.length).toBe(4);
  });

  it('drops dimensions with no options (invalid for a checkpoint question)', () => {
    const out = '__CLARIFY__ {"dimensions":[{"ask":"has none","options":[]},{"ask":"ok","options":[{"label":"A"}]}]}';
    const r = parseClarifyOutput(out);
    expect(r.dimensions.length).toBe(1);
    expect(r.dimensions[0].ask).toBe('ok');
    expect(r.dimensions[0].options[0].recommended).toBe(true);
  });
});
