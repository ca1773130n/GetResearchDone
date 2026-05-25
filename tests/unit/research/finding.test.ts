'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildFinding, writeFinding, findingPath } = require('../../../lib/research/finding');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-finding-')); }
const thread = { id: 't', question: 'Does X help?', status: 'supported', iteration: 2 };
const hyps = [
  { id: 'h1', statement: 'X helps a bit', status: 'refuted', verdict: 'refuted' },
  { id: 'h2', statement: 'X helps when tuned', status: 'supported', verdict: 'supported' },
];
const takeaways = [{ iteration: 2, kind: 'success_pattern', content: 'tune X', confidence: 0.8 }];

describe('finding', () => {
  it('buildFinding includes question, verdict, hypotheses and takeaways', () => {
    const md = buildFinding(thread, hyps, takeaways, { metrics: { accuracy: 0.9 } });
    expect(md).toContain('Does X help?');
    expect(md).toContain('supported');
    expect(md).toContain('h2');
    expect(md).toContain('tune X');
    expect(md).toContain('accuracy');
  });
  it('writeFinding writes FINDING.md', () => {
    const cwd = tmp();
    fs.mkdirSync(path.join(cwd, '.planning/research/threads', 't'), { recursive: true });
    writeFinding(cwd, 't', '# finding');
    expect(fs.readFileSync(findingPath(cwd, 't'), 'utf8')).toBe('# finding');
  });
});
