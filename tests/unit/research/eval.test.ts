'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ev = require('../../../lib/research/eval');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-eval-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('readEvalReportConfig', () => {
  it('defaults false with no config', () => {
    expect(ev.readEvalReportConfig(tmp())).toBe(false);
  });
  it('true only on explicit true', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, '.planning/config.json'), JSON.stringify({ research_eval_report: true }));
    expect(ev.readEvalReportConfig(d)).toBe(true);
  });
  it('false on malformed config (no throw)', () => {
    const d = tmp();
    fs.writeFileSync(path.join(d, '.planning/config.json'), '{not json');
    expect(ev.readEvalReportConfig(d)).toBe(false);
  });
});

describe('parseEvalReport', () => {
  it('extracts markdown strictly between both markers', () => {
    const out = 'noise\n__EVAL__\n## Results\nok\n__END_EVAL__\ntrailing log';
    expect(ev.parseEvalReport(out)).toBe('## Results\nok');
  });
  it('returns null when the closing marker is missing', () => {
    expect(ev.parseEvalReport('__EVAL__\n## Results\nok')).toBeNull();
  });
  it('returns null when there is no block', () => {
    expect(ev.parseEvalReport('just logs')).toBeNull();
  });
});

describe('readPriorMetrics', () => {
  function thread() {
    const d = tmp();
    const id = 't1';
    const mk = (iter: number, metrics: object) => {
      const dir = path.join(d, '.planning/research/threads', id, 'experiments', String(iter));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ metrics }));
    };
    return { d, id, mk };
  }
  it('reads the previous iteration metrics', () => {
    const t = thread(); t.mk(0, { accuracy: 0.5 });
    expect(ev.readPriorMetrics(t.d, t.id, 1)).toEqual({ iteration: 0, metrics: { accuracy: 0.5 } });
  });
  it('returns null at iteration 0 or when the prior file is missing/malformed', () => {
    const t = thread();
    expect(ev.readPriorMetrics(t.d, t.id, 0)).toBeNull();
    expect(ev.readPriorMetrics(t.d, t.id, 1)).toBeNull();
  });
});

describe('buildEvalPrompt', () => {
  const plan = { procedure: 'p', metricKey: 'accuracy', comparator: '>=', target: 0.8, predictedOutcome: 'po', scriptPath: 'experiments/1/run.sh', language: 'shell' };
  const result = { metrics: { accuracy: 0.6, latency_ms: 12 }, exitCode: 0, runner: 'subprocess', durationMs: 5, stdoutExcerpt: 'x', failureClass: 'none' };
  const outcome = { verdict: 'refuted', detail: 'accuracy=0.6 >= 0.8 → fail' };
  const thread = { id: 't1', iteration: 1, question: 'Does X help?' };
  it('includes the metric, verdict, all metrics, the contract, and the no-rerun rule', () => {
    const p = ev.buildEvalPrompt(thread, plan, result, outcome, { iteration: 0, metrics: { accuracy: 0.5 } });
    expect(p).toContain('accuracy');
    expect(p).toContain('0.8');
    expect(p).toContain('refuted');
    expect(p).toContain('latency_ms');
    expect(p).toMatch(/already.*run|do not.*re-?run|already ran/i);
    expect(p).toContain('__EVAL__');
    expect(p).toContain('__END_EVAL__');
    expect(p).toMatch(/authoritative/i);
  });
  it('notes when there is no prior comparable metric', () => {
    const p = ev.buildEvalPrompt(thread, plan, result, outcome, null);
    expect(p).toMatch(/no prior/i);
  });
});
