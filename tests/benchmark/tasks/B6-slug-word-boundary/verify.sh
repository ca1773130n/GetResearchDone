#!/bin/sh
set -e
T="deadends.ts"
[ -f "$T" ] || { echo "verify: FAIL — $T missing"; exit 1; }
grep -q "toLowerCase()" "$T" || { echo "verify: FAIL — case-insensitive match missing"; exit 1; }
grep -q "isSlugChar" "$T" || { echo "verify: FAIL — word-boundary check missing"; exit 1; }
if grep -qE "return text\.includes\(slug\)" "$T"; then echo "verify: FAIL — old substring match still present"; exit 1; fi
echo "verify: PASS"
