'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { formatTakeaway, parseTakeaways, appendTakeaway, readTakeaways } =
  require('../../../lib/research/takeaways');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'grd-tk-')); }
const T = (over = {}) => ({
  kind: 'failure_root_cause', content: 'C', confidence: 0.7,
  evidence: 'E', failureClass: 'H3', iteration: 1, ...over,
});

describe('takeaways', () => {
  it('format then parse round-trips', () => {
    expect(parseTakeaways(formatTakeaway(T()))[0]).toEqual(T());
  });
  it('append + read accumulates', () => {
    const cwd = tmp();
    const id = 't1';
    fs.mkdirSync(path.join(cwd, '.planning/research/threads', id), { recursive: true });
    appendTakeaway(cwd, id, T({ iteration: 1 }));
    appendTakeaway(cwd, id, T({ iteration: 2, kind: 'success_pattern', failureClass: 'none' }));
    const all = readTakeaways(cwd, id);
    expect(all.length).toBe(2);
    expect(all[1].kind).toBe('success_pattern');
  });
});
