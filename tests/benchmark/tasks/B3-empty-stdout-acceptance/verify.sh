#!/bin/sh
set -e

TARGET="tests/integration/example.test.ts"

if [ ! -f "$TARGET" ]; then
  echo "verify: FAIL — $TARGET not found"
  exit 1
fi

# Reject strict exitCode === 0 assertion.
if grep -qE "expect\\(exitCode\\)\\.toBe\\(0\\)" "$TARGET"; then
  echo "verify: FAIL — must accept exitCode 0 or 1, not strict 0"
  exit 1
fi

# Require [0, 1] tolerance.
grep -qE "\\[0, ?1\\]" "$TARGET" || {
  echo "verify: FAIL — must use toContain([0, 1]) for exit-code tolerance"
  exit 1
}

# Require empty-stdout guard.
grep -qE "stdout\\.trim\\(\\)\\.length" "$TARGET" || {
  echo "verify: FAIL — must guard JSON.parse on stdout non-empty"
  exit 1
}

echo "verify: PASS"
