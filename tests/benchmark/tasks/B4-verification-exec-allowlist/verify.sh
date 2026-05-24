#!/bin/sh
set -e
T="runner.ts"
[ -f "$T" ] || { echo "verify: FAIL — $T missing"; exit 1; }
grep -q "ALLOWLIST" "$T" || { echo "verify: FAIL — allowlist missing"; exit 1; }
grep -q "includes('/')" "$T" || { echo "verify: FAIL — path-separator rejection missing"; exit 1; }
grep -q "SIGKILL" "$T" || { echo "verify: FAIL — SIGKILL timeout missing"; exit 1; }
if grep -q "const BLOCKED" "$T"; then echo "verify: FAIL — old blocklist still present"; exit 1; fi
echo "verify: PASS"
