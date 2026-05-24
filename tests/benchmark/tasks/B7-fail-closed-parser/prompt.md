# Task B7: fail-closed multi-candidate parser

## Bucket

Bug-fix — medium.

## Symptom

`parseCandidates(text, expectedN)` returns whatever marker-fenced
`<<<PLAN-i>>>` blocks it finds, with no validation. A malformed planner
response (too few/many blocks, duplicate index, missing index) silently
produces the wrong set of PLAN files instead of being rejected.

## Expected fix

Make it fail CLOSED. Return a discriminated result
(`{ ok: true; blocks } | { ok: false; reason }`) that is `ok` only when:
- exactly `expectedN` blocks are present,
- indices are unique, and
- indices cover `1..expectedN` with no gaps.
Reject `expectedN < 1`. Sort returned blocks by index.

## Files

- `parse.ts` — `parseCandidates`

## Reference

Ported from GRD v0.4 Phase 2 (multi-candidate generation, commit aaad4ca).
