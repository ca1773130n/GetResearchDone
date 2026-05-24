# Task B8: preserve input order in Benjamini-Hochberg FDR

## Bucket

Bug-fix (statistics) — medium.

## Symptom

`benjaminiHochberg(pvalues)` sorts the p-values, computes the step-up
q-values, and returns them in SORTED order. The caller zips the result
back to its tokens by index — so every token gets the wrong q-value
(the q for whatever p happened to land at that sorted position).

## Expected fix

Track each p-value's original index through the sort and write the
adjusted q-value back to that original index, so the returned array is
in input order. Preserve the step-up monotonicity (q_i = min over
rank ≥ i of p·m/rank) and the [0,1] clamp.

## Files

- `fdr.ts` — `benjaminiHochberg`

## Reference

Ported from GRD v0.4 Phase 5 (deterministic pattern extractor, commit 49863ec).
