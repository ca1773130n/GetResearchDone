# Task R1: segment-aware `..` traversal check

## Bucket

Refactor — easy.

## Symptom

`lib/invariants.ts` exposes `validateSemantic(plan)` which scans
`plan.files_modified` for path-traversal patterns. The current check
uses a substring match (`filePath.includes('..')`) and a similar
substring extension check (`!filePath.includes('.')`).

These produce **false positives**:

- `file..backup.ts` is a legitimate filename with two adjacent dots,
  but `includes('..')` flags it as path traversal.
- `config.d/Makefile` is a legitimate path: `config.d` is a directory,
  `Makefile` is intentionally extensionless. The substring check says
  "this path has an extension" (because of `.d`) and skips the
  warning the user actually wants.

## Expected fix

- Replace `filePath.includes('..')` with a segment-based check:
  `filePath.split('/').includes('..')`. This only matches `..` when
  it appears as a path *component*, not when it's embedded in a
  filename.
- Replace `!filePath.includes('.')` with a basename-based check:
  split the path on `/`, take the last segment, and apply the
  no-extension warning to that.

## Files

- `lib/invariants.ts` — `validateSemantic` function

## Test plan

- Existing `tests/unit/invariants.test.ts` should still pass.
- The newly accepted shapes (`file..backup.ts`, `config.d/Makefile`)
  should produce the *correct* verdict (no false-positive traversal
  error; correct extensionless warning).

## Reference

Ported from PR #25 (`grd/v0.3.22/92-92` → `main`). Original fix
commit: `f841d85`.
