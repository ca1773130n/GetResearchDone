#!/bin/sh
set -e
T="effort.ts"
[ -f "$T" ] || { echo "verify: FAIL — $T missing"; exit 1; }
grep -q "hasOwnProperty.call(EFFORT_PROFILES" "$T" || { echo "verify: FAIL — membership guard missing"; exit 1; }
echo "verify: PASS"
