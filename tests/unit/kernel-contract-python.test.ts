'use strict';
/**
 * Runs the Python side of the kernel-contract conformance suite
 * (tests/python/test_kernel_contract.py) inside `npm test`, so the autoresearch-core ⇄
 * lib/research parity is enforced in BOTH languages by the normal gate. The TS side lives
 * in tests/unit/research/kernel-contract.test.ts. See docs/kernel-contract.md.
 *
 * Readiness needs only python3 >= 3.11 (the vendored kernel provides autoresearch_core, no
 * pip install). Locally (no CI) a missing python3 skips with a LOUD warning. In CI
 * (`CI=true`, or `KERNEL_CONTRACT_REQUIRE_PYTHON=1`) a missing python3 FAILS — a green CI
 * run must never hide an unrun Python side of the contract.
 */
const path = require('path') as typeof import('path');
const { execFileSync } = require('child_process') as typeof import('child_process');

const REPO = path.join(__dirname, '..', '..');
const PY_TEST = path.join(REPO, 'tests', 'python', 'test_kernel_contract.py');

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
const pythonRequired = process.env.CI === 'true' || process.env.KERNEL_CONTRACT_REQUIRE_PYTHON === '1';

if (ready) {
  describe('kernel contract conformance (Python ⇄ autoresearch-core parity)', () => {
    test('python kernel matches the shared fixtures', () => {
      const out = execFileSync('python3', [PY_TEST], { encoding: 'utf-8', timeout: 120000, env: process.env });
      expect(out).toBeDefined();
    });
  });
} else if (pythonRequired) {
  // CI must exercise both languages — a skip here would let a green run hide unrun Python.
  test('python side of the kernel contract MUST run (python3>=3.11 missing in CI)', () => {
    throw new Error(
      'python3>=3.11 not found but required (CI / KERNEL_CONTRACT_REQUIRE_PYTHON): the Python ' +
      'side of the kernel-contract parity was NOT exercised. Install python3>=3.11.',
    );
  });
} else {
  // eslint-disable-next-line no-console
  console.warn(
    '\n⚠️  kernel-contract: python3>=3.11 not found — the PYTHON side of the parity contract ' +
    'was NOT run (only TS enforced). Set CI=true / KERNEL_CONTRACT_REQUIRE_PYTHON=1 to require it.\n',
  );
  test('kernel contract python suite skipped (python3>=3.11 unavailable, not required locally)', () => {
    expect(true).toBe(true);
  });
}
