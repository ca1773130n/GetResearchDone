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
plan candidates) — not LLM judging.

This phase is foundational for phases 2-4. Specifically:

- **Phase 2** reads `effort` to decide N for `--candidates N`
  (1 / 3 / 7) via `resolveEffortKnob(config, 'candidates_per_plan_phase')`.
- **Phase 3** does NOT use `effort` — the deterministic selector
  scores whatever candidates Phase 2 produced. No refinement loop
  in v0.4 scope.
- **Phase 4** uses `effort` only indirectly (it operates on whatever
  N phase 2 produced).
- **Phase 5** is independent of `effort` — its statistical floor
  (n >= 10, effect_size >= 0.20, BH-FDR q < 0.10) is fixed,
  not effort-scaled. (Phase 5's CLI flags can override the floor
  but `effort` does not.)

**Single-knob scope:** v0.4 ships exactly one effort-scaled knob
(`candidates_per_plan_phase`). The `resolveEffortKnob` helper and
`EFFORT_PROFILES` table are designed to extend to more knobs in
v0.5+ (e.g. autopilot refinement iterations, benchmark replications),
but adding more knobs without a consumer is dead weight — codex r6
explicitly flagged this.

Note: phase 3 does NOT have a "dry-run-verifier" concept in the
v2 design. The renamed `verification-commands` axis runs only the
explicit commands declared in a candidate's frontmatter — no
effort-dependent gating.

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
single v0.4 knob:

| Knob | thrifty | balanced | deep |
|---|---|---|---|
| `candidates_per_plan_phase` | 1 | 3 | 7 |

The table is structured (object keyed by knob name) so v0.5+ can
add knobs without changing the `resolveEffortKnob` signature.
Codex r6 caught the earlier draft listing 3 knobs that had no
consumers — v0.4 ships only what's wired.
</task>

<task name="add-resolveeffort-helper">
Export `resolveEffortKnob(config, knob)` that returns the integer
value for the given knob under the current `effort` setting.
v0.4 has exactly one caller — Phase 2 uses it for
`candidates_per_plan_phase`. Phase 3 (deterministic selector) and
Phase 4 (proximity dedup) do not consume effort knobs. Phase 5's
statistical floor (n>=10, effect_size>=0.20, BH-FDR q<0.10) is
fixed and does NOT use this helper. The helper exists to make
adding v0.5+ knobs trivial (one row in EFFORT_PROFILES + one
call site).
</task>

<task name="cli-gd-settings-effort">
Add `gd settings effort <thrifty|balanced|deep>` as a third
tool-mode settings key, alongside the existing `token_profile`
and `phase_complete_llm_fallback`. Persists to
`.planning/config.json`.
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
hypothesis: "A single orthogonal `effort` config axis (initially scaling only `candidates_per_plan_phase` in v0.4, designed to extend cleanly in v0.5+) is sufficient to surface a generate-then-select knob to users without polluting model_profile or token_profile semantics. Phase 3, Phase 4, and Phase 5 deliberately do NOT consume effort in v0.4."
predicted_outcome: "After this phase, `gd settings effort deep` produces a config that `resolveEffortKnob(config, 'candidates_per_plan_phase')` returns 7 from (3 for balanced, 1 for thrifty). Round-trip tests pass. No callers in lib/ read `effort` yet (that's phase 2)."
deferred_validations: []
```

## Notes

- This phase is *pure config plumbing*. Lowest codex-rescue
  exposure on the v0.4 roadmap.
- Do NOT couple `effort` to `model_profile`. They're orthogonal:
  `model_profile=quality, effort=thrifty` is a valid combination
  (use best models but do less work).
- Estimated cost: ~0.5 day. ~150 lines incl. tests.
