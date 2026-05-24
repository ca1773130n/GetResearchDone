# Task R2: handle both bare and prefixed plan filenames

## Bucket

Refactor — medium.

## Symptom

A helper module (`lib/commands/example.ts`) scans a phase directory
for plan files. Phase directories in this project use two naming
conventions interchangeably:

- `PLAN.md` — single-plan phase (older convention)
- `<N>-<M>-PLAN.md` — prefixed plan file (e.g. `01-02-PLAN.md`),
  the canonical multi-plan convention

The current scanner only matches the prefixed form (regex
`/-PLAN\.md$/`). Phases with a bare `PLAN.md` silently produce zero
plans and the downstream code reports "no plans" even for valid
phases.

## Expected fix

Generalize `_collectPlans` to match both forms:

- `PLAN.md` exact match
- `*-PLAN.md` suffix match (the current behavior)

Apply the same generalization to any sibling scanners in the file
(e.g. `_collectSummaries` if present).

## Files

- `lib/commands/example.ts` — `_collectPlans` function

## Test plan

A phase directory containing just `PLAN.md` should return that file.
A phase directory containing `01-01-PLAN.md` + `01-02-PLAN.md` should
return both. A phase directory containing both forms should return
all three.

## Reference

This pattern was found and fixed at ~6 separate callsites during
codex r2–r9. Every new evolve-generated command had to be patched
the same way.
