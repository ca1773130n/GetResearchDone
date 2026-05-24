# Task B5: effort-knob invalid-value fallback

## Bucket

Bug-fix — easy.

## Symptom

`resolveEffortKnob` reads `config.effort` and indexes `EFFORT_PROFILES`
with it. `loadConfig` warns about an invalid `effort` value but PRESERVES
it (does not coerce). So `effort: "turbo"` reaches this function and
`EFFORT_PROFILES["turbo"]` is `undefined` → `Cannot read properties of
undefined (reading 'candidates_per_plan_phase')`.

## Expected fix

Guard: if `config.effort` is not a known key of `EFFORT_PROFILES`, fall
back to `'balanced'`. Use `Object.prototype.hasOwnProperty.call` (not a
truthy check) so the fallback is membership-based.

## Files

- `effort.ts` — `resolveEffortKnob`

## Reference

Ported from the GRD v0.4 Phase 3 codex code review (P2, commit 79887eb).
