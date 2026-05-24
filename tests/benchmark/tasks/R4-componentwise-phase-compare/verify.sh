#!/bin/sh
set -e

TARGET="lib/example.ts"

if [ ! -f "$TARGET" ]; then
  echo "verify: FAIL — $TARGET not found"
  exit 1
fi

# Reject parseFloat-based compare (the bug).
if grep -q "parseFloat" "$TARGET"; then
  echo "verify: FAIL — parseFloat-based compare still present (01.10 === 01.1)"
  exit 1
fi

# Require component-wise split.
grep -qE "split\\('\\.'\\)" "$TARGET" || {
  echo "verify: FAIL — must split phase id by '.'"
  exit 1
}

# Require parseInt (component is an integer, not a float).
grep -q "parseInt" "$TARGET" || {
  echo "verify: FAIL — must parse components as integers"
  exit 1
}

echo "verify: PASS"
