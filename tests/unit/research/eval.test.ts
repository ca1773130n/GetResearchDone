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
