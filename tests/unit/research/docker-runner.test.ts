'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { captureError } = require('../../helpers/setup');
const { loadConfig } = require('../../../lib/utils');

function tmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'grd-docker-'));
  fs.mkdirSync(path.join(d, '.planning'), { recursive: true });
  return d;
}

describe('sandbox config keys are recognized', () => {
  it('loadConfig does not warn for research_sandbox* keys', () => {
    const cwd = tmp();
    fs.writeFileSync(path.join(cwd, '.planning/config.json'), JSON.stringify({
      research_sandbox: 'docker',
      research_sandbox_image: 'python:3.12-slim',
      research_sandbox_memory: '512m',
      research_sandbox_cpus: '1',
      research_sandbox_network: 'none',
    }));
    const res = captureError(() => loadConfig(cwd));
    expect(res.stderr).not.toMatch(/Unrecognized config key "research_sandbox/);
  });
});
