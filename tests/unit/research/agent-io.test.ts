'use strict';
const { extractTaggedJson, parseHypothesisOutput, parsePlanOutput, parseTakeawayOutput } =
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
