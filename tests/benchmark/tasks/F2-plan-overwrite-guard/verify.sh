#!/bin/sh
set -e
T="promote.ts"
[ -f "$T" ] || { echo "verify: FAIL — $T missing"; exit 1; }
grep -q "existsSync(planPath) && !opts.force" "$T" || { echo "verify: FAIL — overwrite guard missing"; exit 1; }
echo "verify: PASS"
