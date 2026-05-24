---
phase_number: "1"
phase_slug: effort-axis
plan_number: "01-01"
wave: 1
depends_on: []
autonomous: true
verification_level: proxy
files_modified:
  - lib/types.ts
  - lib/utils.ts
  - .planning/config.json
  - tests/unit/utils.test.ts
must_haves:
  artifacts:
    - lib/types.ts
    - tests/unit/utils.test.ts
  key_links:
    - "config.effort field documented in lib/types.ts:GrdConfig"
    - "EFFORT_PROFILES table in lib/utils.ts"
    - "round-trip test passes for thrifty/balanced/deep values"
---

# Phase 1 — `effort` config axis

## Goal

Add a project-scoped `effort` configuration key, orthogonal to the
existing `model_profile` and `token_profile` axes. Values:
`thrifty | balanced | deep`. The key gates *real-cost knobs* (how
many candidates / iterations / benchmark runs to do); it does NOT
gate any LLM debate rounds, because there are no LLM debate rounds
in v0.4 ([DEAD-ENDS: `elo-rated-plan-tournament`](../../../../DEAD-ENDS.md)).

## Context

GENOME heuristic *"No LLM-judged scoring on the core execution
path"* applies: effort scales deterministic compute (number of
plan candidates, refinement-loop iteration cap, benchmark runs)
not LLM judging.

This phase is foundational for phases 2-4. Phase 2 reads `effort`
to decide N for `--candidates N`; phase 3 reads `effort` to decide
whether dry-run-verifier counts (skipped when `thrifty`); phase 5
reads `effort` for "min reflections to consider before suggesting
a heuristic".

## Tasks

<tasks>
<task name="add-effort-to-grdconfig-type">
Extend `GrdConfig` in `lib/types.ts` with an optional `effort?:
'thrifty' | 'balanced' | 'deep'` field. Document each value's
intent in a JSDoc above the field.
</task>

<task name="add-effort-loadconfig-passthrough">
In `lib/utils.ts:loadConfig`, pass `parsed.effort` through to the
returned config object, defaulting to `'balanced'`. Add `'effort'`
to `KNOWN_CONFIG_KEYS` so it doesn't warn.
</task>

<task name="add-effort-profiles-table">
Define an `EFFORT_PROFILES` table in `lib/utils.ts` with the
per-knob values per setting:

| Knob | thrifty | balanced | deep |
|---|---|---|---|
| `candidates_per_plan_phase` | 1 | 3 | 7 |
| `refinement_max_iterations` | 1 | 3 | 7 |
| `benchmark_runs_per_phase` | 0 | 1 | 3 |
</task>

<task name="add-resolveeffort-helper">
Export `resolveEffortKnob(config, knob)` that returns the integer
value for the given knob under the current `effort` setting.
Callers in phases 2-5 use this instead of reading raw config.
</task>

<task name="cli-gd-settings-effort">
Add `gd settings effort <thrifty|balanced|deep>` as one of the
two tool-mode settings keys (alongside `token_profile` and
`phase_complete_llm_fallback`). Persists to `.planning/config.json`.
</task>

<task name="tests-roundtrip-and-knobs">
- `tests/unit/utils.test.ts`: round-trip test (loadConfig honors
  `effort` field; defaults to `balanced` when absent; emits
  unknown-key warning for invalid values).
- Per-knob test for `resolveEffortKnob` covering all 3 settings.
- CLI test for `gd settings effort thrifty` updates the config.
</task>
</tasks>

## Verification (proxy)

```yaml
sanity:
  - "loadConfig({effort: 'deep'}).effort === 'deep'"
  - "loadConfig({}).effort === 'balanced'"
  - "loadConfig({effort: 'bogus'}) emits warning + falls back to 'balanced'"
proxy:
  - "resolveEffortKnob(config, 'candidates_per_plan_phase') returns 1/3/7 for thrifty/balanced/deep"
  - "gd settings effort thrifty exits 0; .planning/config.json updated; re-load round-trips"
deferred: []
```

## <reflection>

(Codex r2 review noted phase 1 lacked the `deferred_validations`
schema block other phases carry. Adding for consistency — the
schema is the source of truth per the ROADMAP prose-only
declaration.)

```yaml
hypothesis: "A single orthogonal `effort` config axis is sufficient to scale real-cost knobs across phases 2-5 without polluting model_profile or token_profile semantics."
predicted_outcome: "After this phase, `gd settings effort deep` produces a config that resolveEffortKnob returns 7/7/3 from. Round-trip tests pass. No callers in lib/ read `effort` yet (that's phases 2-5)."
deferred_validations: []
```

## Notes

- This phase is *pure config plumbing*. Lowest codex-rescue
  exposure on the v0.4 roadmap.
- Do NOT couple `effort` to `model_profile`. They're orthogonal:
  `model_profile=quality, effort=thrifty` is a valid combination
  (use best models but do less work).
- Estimated cost: ~0.5 day. ~150 lines incl. tests.
