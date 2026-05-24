# Task R4: component-wise phase id comparison

## Bucket

Refactor — easy.

## Symptom

`lib/example.ts` exposes `comparePhaseIds(a, b)` returning -1/0/1.
The current implementation does `parseFloat(a) - parseFloat(b)`.
This works for `"1" vs "2"` but is wrong for dot-decimal phase ids:

- `comparePhaseIds("01.10", "01.9")` returns 0 (because
  `parseFloat("01.10") === parseFloat("01.1") === 1.1`)

Real phase ordering treats each dot-separated component as an integer,
so `01.10` is *after* `01.9`.

## Expected fix

Compare component-wise. Split each id by `.`, parse each component as
an integer, compare component-by-component. Return the sign of the
first differing component.

## Files

- `lib/example.ts` — `comparePhaseIds` function

## Reference

Codex r1; the same root cause showed up in `lib/drift.ts`,
`lib/plan-tournament.ts`, and `lib/think.ts`.
