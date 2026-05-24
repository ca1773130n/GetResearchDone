#!/bin/sh
set -e
T="select.ts"
[ -f "$T" ] || { echo "verify: FAIL — $T missing"; exit 1; }
grep -q "const survivors" "$T" || { echo "verify: FAIL — survivor filter missing"; exit 1; }
# The survivor filter must appear BEFORE the cluster() call (line order).
sv=$(grep -n "const survivors" "$T" | head -1 | cut -d: -f1)
cl=$(grep -n "cluster(" "$T" | head -1 | cut -d: -f1)
[ "$sv" -lt "$cl" ] || { echo "verify: FAIL — hard-fail filter not before clustering"; exit 1; }
echo "verify: PASS"
