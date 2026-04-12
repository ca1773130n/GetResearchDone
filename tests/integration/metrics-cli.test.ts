'use strict';

describe('gd metrics CLI', () => {
  it('outputs empty counters on a fresh run', () => {
    // Just smoke-test that the CLI does not crash; the in-memory
    // counters are empty unless we have invoked something that sets them.
    const { spawnSync } = require('child_process');
    const result = spawnSync(
      'node',
      ['bin/gd.js', 'metrics', '--json'],
      {
        encoding: 'utf-8',
        cwd: '/Users/neo/Developer/Projects/GetResearchDone/.worktrees/gsd2-followups',
      }
    );
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed).toBe('object');
  });
});
