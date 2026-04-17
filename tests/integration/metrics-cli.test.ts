'use strict';

describe('gd metrics CLI', () => {
  it('outputs empty counters on a fresh run', () => {
    // Just smoke-test that the CLI does not crash; the in-memory
    // counters are empty unless we have invoked something that sets them.
    const { spawnSync } = require('child_process');
    const path = require('path');
    // Resolve to repo root regardless of which worktree the test runs from.
    // __dirname is .../tests/integration → ../.. is the repo root.
    const repoRoot = path.resolve(__dirname, '..', '..');
    const result = spawnSync(
      'node',
      ['bin/gd.js', 'metrics', '--json'],
      {
        encoding: 'utf-8',
        cwd: repoRoot,
      }
    );
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed).toBe('object');
  });
});
