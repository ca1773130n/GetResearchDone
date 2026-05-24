#!/bin/sh
set -e

TARGET="lib/scheduler.ts"

if [ ! -f "$TARGET" ]; then
  echo "verify: FAIL — $TARGET not found"
  exit 1
fi

# Reject the falsy-coalesce bug.
if grep -qE "opts\\.timeout \\|\\| DEFAULT_TIMEOUT_MS" "$TARGET"; then
  echo "verify: FAIL — falsy-coalesce treats 0 as missing"
  exit 1
fi

# Require explicit 0-handling branch.
grep -qE "opts\\.timeout === 0" "$TARGET" || {
  echo "verify: FAIL — must explicitly handle opts.timeout === 0"
  exit 1
}

# Require an early-return / null-skip for the no-timer case.
grep -qE "(=== null|return null)" "$TARGET" || {
  echo "verify: FAIL — must skip setTimeout when no timer is requested"
  exit 1
}

echo "verify: PASS"
