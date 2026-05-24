# Task F2: guard PLAN.md overwrite behind --force

## Bucket

Feature (safety guard) — easy.

## Symptom

`promote` writes the winning candidate to `PLAN.md` unconditionally.
If a resolved `PLAN.md` already exists (human-edited, or from a prior
selection), it is silently clobbered.

## Expected fix

If `PLAN.md` already exists and `opts.force` is not set, throw (refuse
to overwrite) with a message instructing the user to pass `--force`.
With `force`, overwrite as before.

## Files

- `promote.ts` — `promote`

## Reference

Ported from GRD v0.4 Phase 3 codex code review (P2, commit 79887eb).
