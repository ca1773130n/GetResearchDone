#!/bin/sh
set -e

TARGET="lib/commands/example.ts"

if [ ! -f "$TARGET" ]; then
  echo "verify: FAIL — $TARGET not found"
  exit 1
fi

grep -q "findPhaseInternal" "$TARGET" || {
  echo "verify: FAIL — must use findPhaseInternal"
  exit 1
}

grep -q "phaseInfo.directory" "$TARGET" || {
  echo "verify: FAIL — must read .directory field (not .dir)"
  exit 1
}

if grep -qE "path\.join\(.*phasesBase.*phaseArg" "$TARGET"; then
  echo "verify: FAIL — direct path.join(phasesBase, phaseArg) still present"
  exit 1
fi

echo "verify: PASS"
