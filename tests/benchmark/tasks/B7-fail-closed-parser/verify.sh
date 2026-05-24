#!/bin/sh
set -e
T="parse.ts"
[ -f "$T" ] || { echo "verify: FAIL — $T missing"; exit 1; }
grep -q "ok: false" "$T" || { echo "verify: FAIL — discriminated fail result missing"; exit 1; }
grep -q "found \${blocks.length}" "$T" || { echo "verify: FAIL — count validation missing"; exit 1; }
grep -q "missing PLAN-" "$T" || { echo "verify: FAIL — index-coverage check missing"; exit 1; }
echo "verify: PASS"
