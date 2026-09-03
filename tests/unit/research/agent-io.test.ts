'use strict';
const { extractTaggedJson, parseHypothesisOutput, describeHypothesisRejection, parseHypothesesOutput, parsePlanOutput, parseTakeawayOutput, parseClarifyOutput } =
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
    const out = '__HYPOTHESIS__ {"statement":"S","rationale":"call fn() { return {a:1}; }","predictedOutcome":"P","refutationCondition":"RC"}';
    expect(parseHypothesisOutput(out)).toEqual({
      statement: 'S', rationale: 'call fn() { return {a:1}; }', predictedOutcome: 'P',
      refutationCondition: 'RC', refutationOverlap: 0,
    });
  });
  it('parseHypothesisOutput requires statement', () => {
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"statement":"S","rationale":"R","predictedOutcome":"P","refutationCondition":"RC"}'))
      .toEqual({ statement: 'S', rationale: 'R', predictedOutcome: 'P', refutationCondition: 'RC', refutationOverlap: 0 });
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"rationale":"R","refutationCondition":"RC"}')).toBeNull();
  });
  it('parseHypothesisOutput defaults optional fields', () => {
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"statement":"S","refutationCondition":"RC"}'))
      .toEqual({ statement: 'S', rationale: '', predictedOutcome: '', refutationCondition: 'RC', refutationOverlap: 0 });
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

describe('parseHypothesesOutput (Phase 104)', () => {
  // Every well-formed candidate carries a refutationCondition — that is the W2 admission test.
  // The synthetic non-compliers live in the 'W2 refutation admission test' suite below.
  const mk = (statement: string, rationale?: string, predictedOutcome?: string) => {
    const parts = [`"statement":${JSON.stringify(statement)}`];
    if (rationale !== undefined) parts.push(`"rationale":${JSON.stringify(rationale)}`);
    if (predictedOutcome !== undefined) parts.push(`"predictedOutcome":${JSON.stringify(predictedOutcome)}`);
    parts.push(`"refutationCondition":"if ${statement} holds, removing it restores the baseline / doubling it degrades further"`);
    return `{${parts.join(',')}}`;
  };

  it('parses a well-formed 3-candidate block in rank order (n=3)', () => {
    const out = '__HYPOTHESES__ {"candidates":['
      + mk('S1', 'R1', 'P1') + ',' + mk('S2', 'R2', 'P2') + ',' + mk('S3', 'R3', 'P3')
      + ']}';
    const r = parseHypothesesOutput(out, 3);
    expect(r.candidates.length).toBe(3);
    expect(r.candidates.map((c: any) => c.statement)).toEqual(['S1', 'S2', 'S3']);
    expect(r.candidates[0]).toMatchObject({ statement: 'S1', rationale: 'R1', predictedOutcome: 'P1' });
    expect(r.candidates[0].refutationCondition).toContain('restores the baseline');
  });

  it('caps 4 candidates to n=3, preserving emit order', () => {
    const out = '__HYPOTHESES__ {"candidates":['
      + mk('S1') + ',' + mk('S2') + ',' + mk('S3') + ',' + mk('S4') + ']}';
    const r = parseHypothesesOutput(out, 3);
    expect(r.candidates.map((c: any) => c.statement)).toEqual(['S1', 'S2', 'S3']);
  });

  it('drops a candidate missing statement, keeps siblings', () => {
    const out = '__HYPOTHESES__ {"candidates":['
      + mk('S1', 'R1') + ',{"rationale":"orphan"},' + mk('S3', 'R3') + ']}';
    const r = parseHypothesesOutput(out, 5);
    expect(r.candidates.map((c: any) => c.statement)).toEqual(['S1', 'S3']);
  });

  it('defaults missing rationale/predictedOutcome to empty string (not dropped)', () => {
    const out = '__HYPOTHESES__ {"candidates":[' + mk('S1') + ']}';
    const r = parseHypothesesOutput(out, 5);
    expect(r.candidates[0]).toMatchObject({ statement: 'S1', rationale: '', predictedOutcome: '' });
  });

  it('returns { candidates: [] } on missing block / absent / non-array / invalid JSON', () => {
    const empty = { candidates: [], droppedForRefutation: 0 };
    expect(parseHypothesesOutput('just prose, no tag')).toEqual(empty);
    expect(parseHypothesesOutput('__HYPOTHESES__ {not json')).toEqual(empty);
    expect(parseHypothesesOutput('__HYPOTHESES__ {"nope":1}')).toEqual(empty);
    expect(parseHypothesesOutput('__HYPOTHESES__ {"candidates":"notarray"}')).toEqual(empty);
    expect(parseHypothesesOutput('__HYPOTHESES__ {"candidates":[]}')).toEqual(empty);
  });

  it('parses despite extra prose after the block (brace-balanced extractor stops at close)', () => {
    const out = '__HYPOTHESES__ {"candidates":[' + mk('S1', 'R1', 'P1') + ']} trailing chatter here';
    const r = parseHypothesesOutput(out, 5);
    expect(r.candidates.length).toBe(1);
    expect(r.candidates[0].statement).toBe('S1');
  });

  it('defaults cap to 5 when n omitted', () => {
    const cands = Array.from({ length: 8 }, (_, i) => mk(`S${i}`)).join(',');
    const r = parseHypothesesOutput(`__HYPOTHESES__ {"candidates":[${cands}]}`);
    expect(r.candidates.length).toBe(5);
  });

  it('PIN: parseHypothesisOutput single-block shape — statement + refutationCondition both required', () => {
    // Was 'PIN: parseHypothesisOutput single-block unchanged' before W2. The block deliberately
    // changed: the returned object gained two fields and the admission test gained one rule.
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"statement":"S","rationale":"R","predictedOutcome":"P","refutationCondition":"RC"}'))
      .toEqual({ statement: 'S', rationale: 'R', predictedOutcome: 'P', refutationCondition: 'RC', refutationOverlap: 0 });
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"rationale":"R","refutationCondition":"RC"}')).toBeNull();
    expect(parseHypothesisOutput('no block here')).toBeNull();
  });
});

describe('W2 refutation admission test', () => {
  const RC = 'if caching is the cause, disabling the cache restores p99 / halving the TTL makes it worse';

  it('drops a single-block hypothesis that omits refutationCondition (parse miss -> retry)', () => {
    // The synthetic non-complier: statement present, field absent. Null is what spawnAndParse
    // reads as a parse miss, so the omission is retried inside the EXISTING budget.
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"statement":"S","rationale":"R","predictedOutcome":"P"}'))
      .toBeNull();
  });

  it('drops a single-block hypothesis whose refutationCondition is empty or whitespace', () => {
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"statement":"S","refutationCondition":""}')).toBeNull();
    expect(parseHypothesisOutput('__HYPOTHESIS__ {"statement":"S","refutationCondition":"   \\n\\t "}')).toBeNull();
  });

  it('drops the non-complying candidate and keeps its complying siblings', () => {
    const out = '__HYPOTHESES__ {"candidates":['
      + `{"statement":"S1","refutationCondition":${JSON.stringify(RC)}},`
      + '{"statement":"S2","rationale":"no refutation condition here"},'
      + `{"statement":"S3","refutationCondition":${JSON.stringify(RC)}}`
      + ']}';
    const r = parseHypothesesOutput(out, 5);
    expect(r.candidates.map((c: any) => c.statement)).toEqual(['S1', 'S3']);
  });

  it('a block where EVERY candidate omits the field degrades to { candidates: [] }', () => {
    // Same shape the orchestrator already treats as a parse miss for a missing block, so the
    // multi-candidate branch falls through to the single-block path — no new wedge.
    const out = '__HYPOTHESES__ {"candidates":['
      + '{"statement":"S1","rationale":"R"},{"statement":"S2","predictedOutcome":"P"}]}';
    // The drop is COUNTED, not merely absorbed: it is the only signal the orchestrator has that
    // the operator's selection gate was short-circuited by the admission test.
    expect(parseHypothesesOutput(out, 5)).toEqual({ candidates: [], droppedForRefutation: 2 });
  });

  it('a dropped candidate does not consume the cap', () => {
    const good = (s: string) => `{"statement":"${s}","refutationCondition":${JSON.stringify(RC)}}`;
    const out = '__HYPOTHESES__ {"candidates":['
      + '{"statement":"bad1"},' + good('S1') + ',{"statement":"bad2"},' + good('S2') + ',' + good('S3')
      + ']}';
    expect(parseHypothesesOutput(out, 3).candidates.map((c: any) => c.statement))
      .toEqual(['S1', 'S2', 'S3']);
  });

  it('trims the condition and reports overlap in [0,1] on both parsers', () => {
    const single = parseHypothesisOutput(`__HYPOTHESIS__ {"statement":"caching lowers p99 latency","refutationCondition":"  ${RC}  "}`);
    expect(single.refutationCondition).toBe(RC);
    expect(single.refutationOverlap).toBeGreaterThan(0);
    expect(single.refutationOverlap).toBeLessThanOrEqual(1);
    const multi = parseHypothesesOutput(
      `__HYPOTHESES__ {"candidates":[{"statement":"caching lowers p99 latency","refutationCondition":${JSON.stringify(RC)}}]}`, 5,
    );
    expect(multi.candidates[0].refutationOverlap).toBeCloseTo(single.refutationOverlap, 10);
  });

  it('overlap GATES NOTHING: a near-restatement is admitted, not rejected', () => {
    // The mandated both-branches template reuses the statement's tokens by construction, so a
    // high overlap must never be a rejection reason. This is the anti-Jaccard-gate pin.
    const stmt = 'batch size 512 causes the OOM crash';
    const out = `__HYPOTHESIS__ {"statement":"${stmt}","refutationCondition":"if batch size 512 causes the OOM crash then batch size 256 removes the OOM crash / batch size 1024 worsens the OOM crash"}`;
    const r = parseHypothesisOutput(out);
    expect(r).not.toBeNull();
    expect(r.refutationOverlap).toBeGreaterThan(0.5);
    expect(r.statement).toBe(stmt);
  });

  it('overlap is 0 when neither side yields content tokens (no crash on symbols/short words)', () => {
    const r = parseHypothesisOutput('__HYPOTHESIS__ {"statement":"S1","refutationCondition":"?!"}');
    expect(r.refutationOverlap).toBe(0);
  });

  it('PIN: sourceNodeIds is optional and NEVER a parse miss', () => {
    // Grounding retrieval degrades silently upstream, so requiring provenance would reject
    // candidates on exactly the path where provenance is unavailable. Absent: fine.
    expect(parseHypothesisOutput(`__HYPOTHESIS__ {"statement":"S","refutationCondition":${JSON.stringify(RC)}}`))
      .not.toBeNull();
    expect(parseHypothesesOutput(
      `__HYPOTHESES__ {"candidates":[{"statement":"S","refutationCondition":${JSON.stringify(RC)}}]}`, 5,
    ).candidates.length).toBe(1);
    // Present: carried by the emitting agent, ignored by the parser, still not a miss.
    expect(parseHypothesisOutput(
      `__HYPOTHESIS__ {"statement":"S","refutationCondition":${JSON.stringify(RC)},"sourceNodeIds":["n1","n2"]}`,
    )).not.toBeNull();
    expect(parseHypothesesOutput(
      `__HYPOTHESES__ {"candidates":[{"statement":"S","refutationCondition":${JSON.stringify(RC)},"sourceNodeIds":[]}]}`, 5,
    ).candidates.length).toBe(1);
  });

  it('a NON-STRING statement is rejected, and does NOT throw out of the parser', () => {
    // Regression: String(o.statement) fed an array/object straight into .toLowerCase() inside
    // the overlap helper. The TypeError escaped spawnAndParse — whose parse call sits outside
    // its try — so the retry budget was bypassed (1 spawn, not 3) and the whole run died with
    // an uncaught stack trace instead of a clean errExit.
    for (const bad of ['["x"]', '{"a":1}', '5', 'true', 'null']) {
      const out = `__HYPOTHESIS__ {"statement":${bad},"refutationCondition":${JSON.stringify(RC)}}`;
      expect(() => parseHypothesisOutput(out)).not.toThrow();
      expect(parseHypothesisOutput(out)).toBeNull();
    }
    expect(() => parseHypothesesOutput(
      `__HYPOTHESES__ {"candidates":[{"statement":["x"],"refutationCondition":${JSON.stringify(RC)}}]}`, 5,
    )).not.toThrow();
  });

  it('a NON-STRING refutationCondition is rejected, never String()-coerced into audit text', () => {
    // Junk STRINGS ('.', 'n/a') passing is by design — the test is structural. Silent type
    // coercion is not: an object became the literal '[object Object]', ["z"] became 'z', true
    // became 'true', each then written into the record W2 exists to make trustworthy.
    for (const bad of ['{"a":1}', '["z"]', 'true', '5', 'null']) {
      expect(parseHypothesisOutput(`__HYPOTHESIS__ {"statement":"S","refutationCondition":${bad}}`)).toBeNull();
      expect(parseHypothesesOutput(
        `__HYPOTHESES__ {"candidates":[{"statement":"S","refutationCondition":${bad}}]}`, 5,
      ).candidates).toEqual([]);
    }
  });

  it('counts the dropped candidates so the caller can report the short-circuited selection', () => {
    const good = (n: string) => `{"statement":"${n}","refutationCondition":${JSON.stringify(RC)}}`;
    const r = parseHypothesesOutput(
      `__HYPOTHESES__ {"candidates":[{"statement":"C1"},${good('C2')},{"statement":"C3"}]}`, 5,
    );
    expect(r.candidates.map((c: any) => c.statement)).toEqual(['C2']);
    expect(r.droppedForRefutation).toBe(2);
    // A statement-less entry is malformed, not a refutation drop — it must not inflate the count.
    expect(parseHypothesesOutput(`__HYPOTHESES__ {"candidates":[{"rationale":"r"},${good('C1')}]}`, 5)
      .droppedForRefutation).toBe(0);
  });
});

describe('describeHypothesisRejection', () => {
  const RC = 'if the cache is the cause, clearing it restores p99 / warming it worsens p99';

  it('names the missing refutationCondition on a block that is otherwise well-formed', () => {
    // This is the highest-frequency W2 rejection and the one the old blanket message got wrong:
    // it claimed the block was missing while printing that very block as its excerpt.
    const why = describeHypothesisRejection(
      '__HYPOTHESIS__ {"statement":"batching lowers p99","rationale":"r","predictedOutcome":"p"}');
    expect(why).toContain('refutationCondition');
    expect(why).not.toContain('no __HYPOTHESIS__ block');
  });

  it('distinguishes no-block, no-statement and would-parse', () => {
    expect(describeHypothesisRejection('just prose')).toContain('no __HYPOTHESIS__ block');
    expect(describeHypothesisRejection('__HYPOTHESIS__ {not json')).toContain('no __HYPOTHESIS__ block');
    expect(describeHypothesisRejection(`__HYPOTHESIS__ {"rationale":"r","refutationCondition":${JSON.stringify(RC)}}`))
      .toContain('`statement`');
    expect(describeHypothesisRejection('__HYPOTHESIS__ {"statement":"   ","refutationCondition":"x"}'))
      .toContain('`statement`');
    // Null means "this would have parsed" — keeps the describer honest against the real rules.
    expect(describeHypothesisRejection(
      `__HYPOTHESIS__ {"statement":"S","refutationCondition":${JSON.stringify(RC)}}`)).toBeNull();
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

describe('W8: baseline survives the plan whitelist', () => {
  const { parsePlanOutput } = require('../../../lib/research/agent-io');
  const base = '"procedure":"p","metricKey":"acc","comparator":">=","target":0.8,"language":"shell","scriptPath":"/x/run.sh"';

  it('carries a declared numeric baseline through', () => {
    // parsePlanOutput's return literal is a whitelist. A field omitted there is dropped
    // silently, and tsc cannot see it because the orchestrator casts `as ExperimentPlan`
    // and `baseline?` is optional. W8 shipped inert exactly this way before this test.
    const p = parsePlanOutput(`__PLAN__ {${base},"baseline":0.72}`);
    expect(p.baseline).toBe(0.72);
  });

  it('omits the key entirely when no baseline is declared', () => {
    // Not `baseline: undefined` — the key must be absent so plan.json is byte-identical
    // to one written before W8. "Unset means the current path exactly" rests on this.
    const p = parsePlanOutput(`__PLAN__ {${base}}`);
    expect(Object.prototype.hasOwnProperty.call(p, 'baseline')).toBe(false);
    expect(JSON.parse(JSON.stringify(p))).not.toHaveProperty('baseline');
  });

  it('drops a non-numeric or non-finite baseline rather than coercing it', () => {
    // String() coercion is how "[object Object]" reached an audit trail in W2.
    for (const bad of ['"0.7"', '"high"', 'null', 'true', '{"a":1}', '1e999']) {
      const p = parsePlanOutput(`__PLAN__ {${base},"baseline":${bad}}`);
      expect(Object.prototype.hasOwnProperty.call(p, 'baseline')).toBe(false);
    }
  });

  it('accepts a negative and a zero baseline, which are legitimate', () => {
    expect(parsePlanOutput(`__PLAN__ {${base},"baseline":0}`).baseline).toBe(0);
    expect(parsePlanOutput(`__PLAN__ {${base},"baseline":-1.5}`).baseline).toBe(-1.5);
  });
});
