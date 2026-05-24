---
phase_number: "3"
phase_slug: deterministic-selector
plan_number: "03-01"
wave: 3
depends_on: ["2"]
autonomous: true
verification_level: proxy
files_modified:
  - lib/plan-tournament.ts
  - lib/autopilot.ts
  - tests/unit/plan-tournament.test.ts
must_haves:
  artifacts:
    - lib/plan-tournament.ts
    - tests/unit/plan-tournament.test.ts
  key_links:
    - "_scorePlan extended with must_haves coverage + DEAD-ENDS check + dry-run-verifier + cost tiebreaker"
    - "autopilot auto-selects highest-scoring candidate when multiple PLAN-N.md exist"
    - "DEAD-ENDS violation = hard-fail the candidate (-Infinity score)"
---

# Phase 3 — Deterministic candidate selector

## Goal

Extend the existing deterministic scorer `_scorePlan` in
`lib/plan-tournament.ts` with four real-cost / real-signal axes,
then auto-select the highest-scoring candidate for
`gd execute-phase` consumption. No LLM judge anywhere on the
selection path.

## Context

This is the **center of gravity** of the v0.4 work. GENOME
heuristic *"No LLM-judged scoring on the core execution path"*
is the constraint this phase implements concretely. DEAD-ENDS
`elo-rated-plan-tournament` rules out the alternative; this is
what we ship instead.

The existing `_scorePlan` (committed in v0.3.x) already weights
completeness + goal alignment + hypothesis presence + conciseness.
This phase adds four axes that consume real on-disk signals.

## Tasks

<tasks>
<task name="must-haves-coverage-axis">
Read REQUIREMENTS.md for the phase. For each `must_haves.artifacts`
entry, check whether the candidate PLAN.md's `files_modified` or
task list mentions it. Each missing required artifact = -10 score
penalty. Each found artifact = +1.
</task>

<task name="dead-ends-violation-check">
Read `.planning/DEAD-ENDS.md`. Tokenize each candidate's tasks +
reflection.hypothesis. For each DEAD-ENDS entry, run a fuzzy
match (Jaccard ≥ 0.6) between the entry's hypothesis and the
candidate's hypothesis. Any match = candidate score set to
`-Infinity` (hard fail). Log which DEAD-ENDS slug triggered.

This is the *teeth* of the DEAD-ENDS registry. Without this
check, the registry is purely informational.
</task>

<task name="dry-run-verifier-axis">
When the candidate's tasks include shell-executable steps
(e.g., a `<task name="add-test">` with a clear command), attempt
a dry-run via the same `_measureMetrics` infrastructure from
`lib/autopilot-pipeline.ts`. Pass-rate of the dry-run becomes a
score component in [0, 10].

For non-executable plans (design-doc tasks, etc.) this axis
contributes 0; the other axes carry the decision.
</task>

<task name="cost-tiebreaker">
Use the existing `gd estimate-phase`-style token estimate as a
pure tiebreaker. Identical scores → pick the lower-cost plan.
</task>

<task name="autopilot-integration">
In `lib/autopilot.ts:runAutopilot`, after `cmdPlanPhase` completes,
detect the presence of multiple `PLAN-N.md` files. If found:
1. Score each via `_scorePlan`
2. Filter out `-Infinity` (DEAD-ENDS violations)
3. Select the highest-scoring survivor
4. Rename it to canonical `PLAN.md` (preserving an audit trail at
   `PLAN-SELECTION.json`)
5. Continue with `cmdExecutePhase`
</task>

<task name="audit-trail">
Write `PLAN-SELECTION.json` with the per-candidate scores, the
selected slug, and the DEAD-ENDS violations (if any). This is the
record codex (or human reviewers) check when asking "why did
autopilot pick this plan?".
</task>

<task name="tests">
- Unit test: must_haves coverage scores
- Unit test: DEAD-ENDS hard-fail triggers
- Unit test: dry-run-verifier axis on a plan with one executable task
- Unit test: cost tiebreaker only fires on score parity
- Integration test: 3-candidate fixture with one DEAD-ENDS violation
  → that one is filtered out → highest-scoring survivor is selected
  → PLAN-SELECTION.json correctly logs all 3 scores
</task>
</tasks>

## Verification (proxy)

```yaml
sanity:
  - "_scorePlan returns higher value for a plan whose files_modified covers all must_haves"
  - "_scorePlan returns -Infinity for a plan whose hypothesis matches a DEAD-ENDS entry"
  - "autopilot picks the highest-score survivor"
proxy:
  - "integration test: 3-candidate phase with stubbed planner runs end-to-end; correct candidate selected and renamed; PLAN-SELECTION.json shape valid"
  - "DEAD-ENDS violation correctly hard-fails: candidate excluded from selection regardless of other scores"
deferred:
  - id: DEFER-v0.4-3-1
    description: "Cross-task generalization — does the selector pick the right plan on multiple bench fixtures?"
    validates_at: v0.5 benchmark run
```

## <reflection>

```yaml
hypothesis: "Extending the existing deterministic _scorePlan with must_haves coverage + DEAD-ENDS hard-fail + dry-run-verifier + cost tiebreaker produces a selector that beats the v0.3.x single-plan baseline on benchmark pass rate without regressing tokens-to-pass by more than 2×."
predicted_outcome: "Unit tests pass mechanically. The pass-rate-vs-baseline claim is deferred to the v0.5 benchmark gate (≥16 tasks populated)."
```

## Notes

- The DEAD-ENDS Jaccard threshold (0.6) is a guess. Phase 5's
  pattern extractor will eventually tune it from real data; v0.4
  ships the guess.
- The selector deliberately doesn't try to be clever about *why*
  a plan scores high — it just measures and picks. Diagnostics
  live in PLAN-SELECTION.json for human or codex review.
- Estimated cost: ~1 day. ~400 lines incl. tests + audit trail.
