#!/bin/sh
set -e

TARGET="lib/commands/import-knowhow.ts"

if [ ! -f "$TARGET" ]; then
  echo "verify: FAIL — $TARGET not found"
  exit 1
fi

# mkdirSync must be guarded by !dryRun
grep -qE "if \\(!dryRun\\) fs\\.mkdirSync" "$TARGET" || {
  echo "verify: FAIL — mkdirSync must be guarded by !dryRun"
  exit 1
}

# Conflict block must skip on dryRun
grep -qE "destExists && !force && !dryRun" "$TARGET" || {
  echo "verify: FAIL — destExists conflict block must skip when dryRun"
  exit 1
}

# Dry-run should preview overwrite case
grep -q "would overwrite" "$TARGET" || {
  echo "verify: FAIL — dry-run should produce a 'would overwrite' preview"
  exit 1
}

echo "verify: PASS"
