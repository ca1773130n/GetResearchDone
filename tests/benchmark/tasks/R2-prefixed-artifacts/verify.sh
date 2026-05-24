#!/bin/sh
set -e

TARGET="lib/commands/example.ts"

if [ ! -f "$TARGET" ]; then
  echo "verify: FAIL — $TARGET not found"
  exit 1
fi

grep -qE "f === 'PLAN\\.md'" "$TARGET" || {
  echo "verify: FAIL — bare PLAN.md match missing"
  exit 1
}

grep -qE "PLAN\\\\\\.md\\\$/" "$TARGET" || grep -q "PLAN.md\$/" "$TARGET" || {
  echo "verify: FAIL — prefixed *-PLAN.md match missing"
  exit 1
}

echo "verify: PASS"
