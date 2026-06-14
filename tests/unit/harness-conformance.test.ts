'use strict';
/**
 * Runs the conformance python unit suite (tests/python/test_harness_conformance.py)
 * inside npm test. Skips (does not fail) when python3 or autoresearch_core is
 * unavailable — mirrors harness-upstream.test.ts.
 */
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..', '..');

function pythonReady(): boolean {
  try {
    execFileSync('python3', ['-c', 'import autoresearch_core'], {
      encoding: 'utf-8', timeout: 15000, env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

const ready = pythonReady();
(ready ? describe : describe.skip)('harness conformance python suite', () => {
  test('python unittest passes', () => {
    const out = execFileSync(
      'python3', [path.join(REPO, 'tests', 'python', 'test_harness_conformance.py')],
      { encoding: 'utf-8', timeout: 120000, env: process.env }
    );
    expect(out).toBeDefined();
  });
});

if (!ready) {
  test('conformance python suite skipped (python3/autoresearch_core unavailable)', () => {
    expect(true).toBe(true);
  });
}
