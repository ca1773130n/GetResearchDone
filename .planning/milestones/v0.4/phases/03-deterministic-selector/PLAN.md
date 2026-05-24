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
    - "_scorePlan extended with must_haves coverage + DEAD-ENDS hard-fail (slug+forbidden_terms) + verification-commands axis + cost tiebreaker"
    - "autopilot auto-selects highest-scoring candidate when multiple PLAN-N.md exist"
    - "DEAD-ENDS violation = hard-fail the candidate (-Infinity score) ONLY via slug citation or curated forbidden_terms (Jaccard is advisory only)"
    - "verification-commands axis runs ONLY commands explicitly listed in PLAN.md frontmatter verification_commands field"
---

# Phase 3 — Deterministic candidate selector

## Goal

Extend `lib/plan-tournament.ts:_scorePlan` (the existing
deterministic scorer) with four real-cost / real-signal axes,
then auto-feeds the highest-scoring candidate to `gd execute-phase`
via golden-file-tested selection logic. No LLM judge anywhere on
the selection path.

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
Read `.planning/DEAD-ENDS.md`. For each candidate, check two
*hard signals* (codex review P1 #1 + DEAD-ENDS slug
`fuzzy-jaccard-as-deadends-hard-fail`):

1. **Explicit slug citation** — does the candidate mention any
   DEAD-ENDS slug literally (e.g. `elo-rated-plan-tournament`)
   in tasks / files_modified / reflection.hypothesis? If yes,
   that's a confession → hard-fail (-Infinity).
2. **Curated forbidden-mechanism vocabulary** — each DEAD-ENDS
   entry carries a `forbidden_terms: [str]` field (NEW SCHEMA
   ADDITION — see task `extend-dead-ends-schema`). Exact
   case-insensitive match of any term in the candidate's tasks /
   hypothesis triggers hard-fail.

The Jaccard score against each DEAD-ENDS hypothesis IS still
computed, but only logged to `PLAN-SELECTION.json` as an
*advisory warning* ("candidate X shares 0.65 vocabulary with
DEAD-ENDS entry Y — review"). No hard action on the fuzzy
signal. Hard actions need hard signals.
</task>

<task name="extend-dead-ends-schema">
Add a `forbidden_terms: [str]` field to the DEAD-ENDS YAML schema
in `agents/grd-planner.md` and `lib/dead-ends.ts`. Backfill the
existing 6 entries with curated term lists. Round-trip the new
field through read + write paths. This is a small, contained
schema extension.
</task>

<task name="verification-commands-axis">
**Renamed from `dry-run-verifier-axis` per codex review P1 #2.**
Running `npx jest` against the *current* repo before applying a
candidate plan mostly measures ambient repo health, not the
candidate's specific quality. The original framing was misleading.

v0.4 ships this axis only when the candidate PLAN.md frontmatter
includes an explicit `verification_commands: [...]` field. Each
command is a safe deterministic check (e.g. `npx tsc --noEmit
src/new-module.ts` if the candidate proposes a new module). The
selector runs those commands and uses their pass-rate as a score
component in [0, 10].

Applying the *whole* candidate in an isolated worktree to run
the full verifier is out of scope for v0.4 — that's the v0.5
benchmark validation gate. The axis defaults to score 0 when
`verification_commands` is absent; other axes carry the decision.
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
- Unit: must_haves coverage scores (full / partial / none)
- Unit: DEAD-ENDS hard-fail via explicit slug citation triggers
- Unit: DEAD-ENDS hard-fail via forbidden_terms exact match triggers
- Unit: Jaccard fuzzy match does NOT trigger hard-fail; advisory
  warning is logged to PLAN-SELECTION.json instead
- Unit: verification-commands axis runs each command in
  `verification_commands` frontmatter; pass-rate becomes the score.
  Plans with no `verification_commands` get axis score 0
- Unit: cost tiebreaker only fires on score parity
- Integration test: 3-candidate fixture with one DEAD-ENDS violation
  → that one is filtered (slug match) → highest-scoring survivor
  selected → PLAN-SELECTION.json logs all 3 scores + hard-fail
  reason + Jaccard advisory warnings if any
</task>
</tasks>

## Verification (proxy)

```yaml
sanity:
  - "_scorePlan returns higher value for a plan whose files_modified covers all must_haves"
  - "_scorePlan returns -Infinity for a plan citing a DEAD-ENDS slug literally"
  - "_scorePlan returns -Infinity for a plan whose tasks contain a curated forbidden_term"
  - "_scorePlan does NOT return -Infinity on Jaccard match alone (logs advisory warning instead)"
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

(Codex review P2 #6: rewrite reflection to be falsifiable in-phase.)

```yaml
hypothesis: "Extending _scorePlan with the four axes (must_haves coverage + DEAD-ENDS hard-fail via slug+forbidden_terms + verification_commands axis + cost tiebreaker) produces an auditable selector whose decisions can be reconstructed from PLAN-SELECTION.json without any LLM call."
predicted_outcome: "On the unit test fixtures: (a) PLAN-SELECTION.json contains all 4 axis scores per candidate, (b) any DEAD-ENDS hard-fail records the matching slug or forbidden_term verbatim, (c) the winning candidate's selection can be replayed by a human reader using only the JSON, with no further information needed."
deferred_validations:
  - id: DEFER-v0.4-3-real-bench
    claim: "The selector beats v0.3.x single-plan baseline on internal-bench pass rate by ≥10pp without regressing tokens-to-pass by more than 2×."
    validates_at: v0.5 benchmark gate (≥16 tasks populated)
    measure: "per-task verify.sh exit code; tokens-to-pass from gd estimate-phase actuals"
```

## Notes

- The DEAD-ENDS Jaccard threshold (0.6) is a guess. Phase 5's
  pattern extractor will eventually tune it from real data; v0.4
  ships the guess.
- The selector deliberately doesn't try to be clever about *why*
  a plan scores high — it just measures and picks. Diagnostics
  live in PLAN-SELECTION.json for human or codex review.
- Estimated cost: ~1 day. ~400 lines incl. tests + audit trail.
