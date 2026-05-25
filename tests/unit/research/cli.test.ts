'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureOutput, captureError } = require('../../helpers/setup');
const { cmdResearchStatus } = require('../../../lib/research/cli');
const { createThread } = require('../../../lib/research/thread');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-rcli-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('research cli', () => {
  it('status lists threads as json', () => {
    const cwd = tmp();
    createThread(cwd, 'Question one', {});
    const res = captureOutput(() => cmdResearchStatus(cwd, undefined, false));
    const parsed = JSON.parse(res.stdout);
    expect(parsed.threads.length).toBe(1);
    expect(parsed.threads[0].question).toBe('Question one');
  });

  it('status for a missing thread errors', () => {
    const cwd = tmp();
    const res = captureError(() => cmdResearchStatus(cwd, 'nope', false));
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('nope');
  });
});
