# Task R5: hard-fail before clustering

## Bucket

Refactor (ordering bug) — medium.

## Symptom

`select` clusters ALL candidates, picks each cluster's
highest-scoring representative, THEN filters out DEAD-ENDS hard-fails.
A richer near-duplicate that trips a DEAD-ENDS rule can become its
cluster's representative and eliminate clean, non-violating siblings
that would otherwise have been scored.

## Expected fix

Reorder the pipeline: filter hard-fails FIRST, cluster only the
survivors, then pick representatives among survivors. A violator must
never be a clustermate.

## Files

- `select.ts` — `select`

## Reference

Ported from GRD v0.4 Phase 4 codex design review (P1 #4) and the
DEAD-ENDS slug `dedup-before-hardfail-ordering` (commit ba9e9cf).
