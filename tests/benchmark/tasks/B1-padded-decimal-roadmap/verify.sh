#!/bin/sh
set -e

TARGET="lib/example.ts"

if [ ! -f "$TARGET" ]; then
  echo "verify: FAIL — $TARGET not found"
  exit 1
fi

grep -q "0\\*" "$TARGET" || {
  echo "verify: FAIL — must use 0* padding-tolerant component matcher"
  exit 1
}

grep -qE "split\\('\\.'\\)" "$TARGET" || {
  echo "verify: FAIL — must split phase id by '.' for per-component regex"
  exit 1
}

echo "verify: PASS"
