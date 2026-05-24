#!/bin/sh
set -e
T="fdr.ts"
[ -f "$T" ] || { echo "verify: FAIL — $T missing"; exit 1; }
grep -q "map((p, i) =>" "$T" || { echo "verify: FAIL — index tracking missing"; exit 1; }
grep -q "q\[i\] =" "$T" || { echo "verify: FAIL — write-back to original index missing"; exit 1; }
echo "verify: PASS"
