'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const promote = require('../../../lib/research/promote');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-promote-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}
const tk = (over = {}) => ({
  kind: 'success_pattern', content: 'Batching cuts latency 3x', confidence: 0.8,
  evidence: 'iter 2 metric', failureClass: 'none', iteration: 2, ...over,
});

describe('shouldPersistKnowledge', () => {
  it('defaults true with no config', () => {
    expect(promote.shouldPersistKnowledge(tmp())).toBe(true);
  });
  it('is false only when explicitly disabled', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, '.planning/config.json'), JSON.stringify({ research_persist_knowledge: false }));
    expect(promote.shouldPersistKnowledge(d)).toBe(false);
    const e = tmp();
    fs.writeFileSync(path.join(e, '.planning/config.json'), JSON.stringify({ research_persist_knowledge: true }));
    expect(promote.shouldPersistKnowledge(e)).toBe(true);
  });
});

describe('takeawayToKnowhow', () => {
  it('maps fields with provenance and research sentinel', () => {
    const k = promote.takeawayToKnowhow(tk(), 't1', '2026-06-01T00:00:00.000Z');
    expect(k.pattern_name).toBe('Batching cuts latency 3x');
    expect(k.source).toBe('research:t1#iter2');
    expect(k.applicability).toContain('success_pattern');
    expect(k.code_snippet).toBe('');
    expect(k.phase_number).toBe(0);
    expect(k.created_at).toBe('2026-06-01T00:00:00.000Z');
  });
  it('collapses whitespace and caps pattern_name at 200 chars', () => {
    const k = promote.takeawayToKnowhow(tk({ content: 'a\n  b   c' + ' x'.repeat(200) }), 't1', 'iso');
    expect(k.pattern_name.length).toBeLessThanOrEqual(200);
    expect(k.pattern_name).not.toMatch(/\s\s|\n/);
  });
});

describe('selectKnowhowTakeaways', () => {
  it('keeps positive kinds >= 0.5, drops failures and low-confidence fallback', () => {
    const out = promote.selectKnowhowTakeaways([
      tk({ kind: 'success_pattern', confidence: 0.8 }),
      tk({ kind: 'constraint', confidence: 0.5 }),
      tk({ kind: 'failure_root_cause', confidence: 0.9 }),
      tk({ kind: 'domain_fact', confidence: 0.4 }),
    ]);
    expect(out.map((t: { kind: string }) => t.kind)).toEqual(['success_pattern', 'constraint']);
  });
});
