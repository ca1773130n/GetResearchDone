#!/bin/sh
# R1 verifier: segment-aware path-traversal check + basename extension check.

set -e

TARGET="lib/invariants.ts"

if [ ! -f "$TARGET" ]; then
  echo "verify: FAIL — $TARGET not found"
  exit 1
fi

grep -q "split('/').includes('..')" "$TARGET" || {
  echo "verify: FAIL — segment-based traversal check missing in $TARGET"
  exit 1
}

grep -q "split('/').pop()" "$TARGET" || {
  echo "verify: FAIL — basename extraction missing in $TARGET"
  exit 1
}

if grep -qE "filePath\.includes\('\.\.'\)" "$TARGET"; then
  echo "verify: FAIL — old substring traversal check still present"
  exit 1
fi

echo "verify: PASS"
