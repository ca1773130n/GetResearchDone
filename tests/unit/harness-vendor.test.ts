'use strict';
/**
 * Runs the vendored-fallback python suite (tests/python/test_harness_vendor.py)
 * inside `npm test`, so the zero-install guarantee is exercised by the normal gate.
 *
 * Unlike harness-conformance.test.ts, readiness only needs `python3 >= 3.11` — NOT
 * an installed `autoresearch_core`. That is the whole point: the vendored
 * bin/vendor/autoresearch_core kernel provides the module with no pip install, and
 * this suite guards exactly that fallback. Skips (does not fail) without python3.
 */
const path = require('path');
const { execFileSync } = require('child_process') as typeof import('child_process');

const REPO = path.join(__dirname, '..', '..');

function python3Ready(): boolean {
  try {
    execFileSync('python3', ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'], {
      encoding: 'utf-8', timeout: 15000, env: process.env,
    });
    return true;
  } catch {
    return false;
  }
}

const ready = python3Ready();
(ready ? describe : describe.skip)('harness vendored-fallback python suite', () => {
  test('python unittest passes (uses the vendored kernel — no pip install)', () => {
    const out = execFileSync(
      'python3', [path.join(REPO, 'tests', 'python', 'test_harness_vendor.py')],
      { encoding: 'utf-8', timeout: 120000, env: process.env },
    );
    expect(out).toBeDefined();
  });
});

if (!ready) {
  test('vendored-fallback python suite skipped (python3 >=3.11 unavailable)', () => {
    expect(true).toBe(true);
  });
}
