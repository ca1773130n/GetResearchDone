---
phase_number: "4"
phase_slug: proximity-dedup
plan_number: "04-01"
wave: 4
depends_on: ["3"]
autonomous: true
verification_level: proxy
files_modified:
  - lib/plan-tournament.ts
  - tests/unit/plan-tournament.test.ts
must_haves:
  artifacts:
    - lib/plan-tournament.ts
  key_links:
    - "clusterCandidates(plans, threshold) implemented"
    - "selector calls clusterCandidates before _scorePlan"
    - "PLAN-SELECTION.json records cluster representatives"
---

# Phase 4 — Proximity dedup before scoring

## Goal

Before phase 3's selector scores N candidates, cluster them by
vocabulary Jaccard. Within a cluster, keep one representative.
Eliminates wasted execution on near-identical plans.

## Context

This is *not* tournament machinery. It's a pure dedup step. GENOME
heuristic respected: clustering math is deterministic (Jaccard on
token sets — same primitive used in `lib/drift.ts` ontology
component).

## Tasks

<tasks>
<task name="cluster-helper">
Implement `clusterCandidates(plans: ParsedPlan[], threshold:
number = 0.85): Cluster[]` in `lib/plan-tournament.ts`. Each
Cluster contains a representative + the rest of its members.

Algorithm: single-link agglomerative clustering. For each plan,
extract a vocabulary token set from
`files_modified + tasks + reflection.hypothesis`. Two plans go in
the same cluster if Jaccard distance ≥ threshold. Representative
= **highest deterministic _scorePlan within the cluster**
(codex review P1 #4: NOT "most files_modified", which can let a
richer-but-DEAD-ENDS-violating member silently eliminate
innocent siblings).
</task>

<task name="vocabulary-extraction">
Reuse the stopword list + tokenizer from `lib/drift.ts` (already
used for ontology distance). Token sets exclude common words like
"the", "and", and very short tokens (<3 chars).
</task>

<task name="selector-integration-correct-ordering">
**Codex review P1 #4: ordering matters.** Selector pipeline:

1. `applyDeadEndsHardFail(candidates)` — filter out -Infinity
   candidates (slug citation or forbidden_terms match from
   phase 3)
2. `clusterCandidates(survivors)` — group remaining candidates
   by Jaccard ≥ threshold
3. Within each cluster: pick representative = highest
   `_scorePlan` (already deterministic; no LLM)
4. Run `_scorePlan` again on cluster representatives only
   (now picking between clusters)
5. Pick highest scorer overall; rename to PLAN.md

PLAN-SELECTION.json records which candidates were hard-failed
(with reason: slug or term), which were collapsed into which
clusters, and the per-cluster representative's selection score.
</task>

<task name="threshold-config">
Make the threshold configurable via
`config.planTournament?.proximityThreshold` (default 0.85).
Document in `lib/types.ts`. Add to KNOWN_CONFIG_KEYS.
</task>

<task name="tests">
- Unit: 3 near-identical plans (identical files_modified, hypotheses
  paraphrased) → 1 cluster
- Unit: 3 meaningfully different plans → 3 clusters
- Unit: threshold tuning: at threshold 0.95 even paraphrases stay
  separate; at threshold 0.50 even loosely related plans collapse
- Integration: 3-candidate fixture where 2 are paraphrases → only 2
  scored; PLAN-SELECTION.json shows the merge
</task>
</tasks>

## Verification (proxy)

```yaml
sanity:
  - "clusterCandidates(plans=[A]) returns single cluster"
  - "clusterCandidates(plans=[A,A]) returns one cluster of 2"
proxy:
  - "Jaccard threshold scan: 0.5 → over-merge, 0.85 → correct merges, 0.95 → no merges"
  - "selector receives only representatives; PLAN-SELECTION.json records merged_into for collapsed candidates"
deferred: []
```

## <reflection>

(Codex review P2 #6: in-phase falsifiable + tracked deferred.)

```yaml
hypothesis: "Hard-fail-before-cluster + score-based representative selection prevents any non-violating candidate from being silently eliminated by a clustermate's DEAD-ENDS violation."
predicted_outcome: "Unit test fixture: 3 candidates where #1 violates DEAD-ENDS and #2/#3 are near-duplicates of #1. Pipeline produces: #1 filtered (hard-fail logged in JSON), #2 and #3 cluster together with #2 OR #3 as representative based on their own _scorePlan. #1's violation does not affect #2/#3."
deferred_validations:
  - id: DEFER-v0.4-4-threshold-tuning
    claim: "Jaccard threshold 0.85 is appropriate on real-world planner output (not over-merge, not under-merge)."
    validates_at: v0.5 benchmark data collection
    measure: "manual eyeball check of 20 representative cluster decisions on the benchmark task corpus"
```

## Notes

- This phase has the lowest codex-rescue exposure on v0.4. Math
  primitive, well-tested existing infrastructure.
- The "richest = representative" heuristic is a guess; could be
  refined later (e.g. "highest-scoring = representative" after
  scoring once per cluster). v0.4 ships the guess.
- Estimated cost: ~0.5 day. ~150 lines incl. tests.
