#!/bin/sh
set -e
T="classify.ts"
[ -f "$T" ] || { echo "verify: FAIL — $T missing"; exit 1; }
grep -qE "SETTINGS_TOOL_SUBS = new Set\(\[[^]]*'effort'" "$T" || { echo "verify: FAIL — 'effort' not in SETTINGS_TOOL_SUBS"; exit 1; }
echo "verify: PASS"
