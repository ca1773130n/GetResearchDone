'use strict';
/**
 * Runs the Python side of the kernel-contract conformance suite
 * (tests/python/test_kernel_contract.py) inside `npm test`, so the autoresearch-core ⇄
 * lib/research parity is enforced in BOTH languages by the normal gate. The TS side lives
 * in tests/unit/research/kernel-contract.test.ts. See docs/kernel-contract.md.
 *
 * Readiness needs only python3 >= 3.11 (the vendored kernel provides autoresearch_core, no
 * pip install). Skips (does not fail) without python3.
 */
const path = require('path') as typeof import('path');
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
(ready ? describe : describe.skip)('kernel contract conformance (Python ⇄ autoresearch-core parity)', () => {
  test('python kernel matches the shared fixtures', () => {
    const out = execFileSync(
      'python3', [path.join(REPO, 'tests', 'python', 'test_kernel_contract.py')],
      { encoding: 'utf-8', timeout: 120000, env: process.env },
    );
    expect(out).toBeDefined();
  });
});

if (!ready) {
  test('kernel contract python suite skipped (python3 >=3.11 unavailable)', () => {
    expect(true).toBe(true);
  });
}
