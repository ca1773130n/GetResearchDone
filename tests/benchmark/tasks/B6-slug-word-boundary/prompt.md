# Task B6: case-insensitive, word-boundary slug citation check

## Bucket

Bug-fix — medium.

## Symptom

`slugCited(text, slug)` uses `text.includes(slug)`. Two defects:
1. Case-sensitive — `Elo-Rated-Plan-Tournament` evades a lowercase slug.
2. Substring — a slug appearing as a fragment of a larger token
   false-positives (`xelo-rated-plan-tournamentx`).

## Expected fix

Match case-insensitively, and only when the slug is bounded by
non-slug characters (slug chars are `[a-z0-9-]`) on both sides — i.e.
a word-boundary match on the slug alphabet. String edges count as
boundaries.

## Files

- `deadends.ts` — `slugCited`

## Reference

Ported from the GRD v0.4 Phase 3 codex code review (P2, commit 79887eb).
