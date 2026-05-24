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
  - lib/commands/select-candidate.ts
  - tests/unit/plan-tournament.test.ts
  - tests/unit/select-candidate.test.ts
must_haves:
  artifacts:
    - lib/plan-tournament.ts
  key_links:
    - "clusterByJaccard(vocabularies, threshold) + extractPlanVocabulary in lib/plan-tournament.ts (single-link agglomerative, Jaccard SIMILARITY)"
    - "selectCandidate pipeline order: hard-fail (scoring -Infinity) → cluster survivors → per-cluster highest-_scorePlan representative → winner across representatives"
    - "PLAN-SELECTION.json records hard_failed[], per-candidate cluster {cluster_id, is_representative, merged_into}, clusters_formed, proximity_threshold"
    - "PROXIMITY_THRESHOLD = 0.85 hardcoded const (no config knob); tests parametrize via clusterByJaccard threshold arg"
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
Implement `clusterByJaccard(vocabularies: Set<string>[],
threshold: number = PROXIMITY_THRESHOLD): number[][]` in
`lib/plan-tournament.ts`. Returns clusters as arrays of original
indices (the caller — selectCandidate — picks each cluster's
representative, keeping clustering a pure math primitive).

Algorithm: single-link agglomerative clustering (union-find). Two
candidates merge when **Jaccard similarity ≥ threshold** (higher
similarity → more likely to merge: at threshold 0.50 even loosely
related plans collapse; at threshold 0.95 even paraphrases stay
separate; default 0.85 merges near-clones only). Single-link means
transitively connected candidates land in one cluster (A~B, B~C ⇒
{A,B,C}). selectCandidate then sets each cluster's representative =
**highest deterministic total_score within the cluster** (codex
review P1 #4: NOT "most files_modified", which can let a
richer-but-DEAD-ENDS-violating member silently eliminate innocent
siblings — and the violator is hard-failed BEFORE clustering, so it
is never a clustermate at all).
</task>

<task name="vocabulary-extraction">
`extractPlanVocabulary(content, fm)` in `lib/plan-tournament.ts`
reuses the existing `_tokens` tokenizer + stopword list (the same
primitive lib/drift.ts uses for ontology distance) over
`files_modified + reflection.hypothesis + plan body`. Token sets
exclude common words like "the", "and", and very short tokens
(<3 chars).
</task>

<task name="selector-integration-correct-ordering">
**Codex review P1 #4: ordering matters.** selectCandidate pipeline:

1. Score every candidate (Phase 3). DEAD-ENDS violators already
   carry total_score = -Infinity — that IS the hard-fail filter.
2. survivors = candidates with finite total_score. Only survivors
   are clustered, so a violator can never be a clustermate.
3. `clusterByJaccard(survivorVocabularies)` groups survivors.
4. Within each cluster: representative = highest total_score
   (cost tiebreaker: fewer estimated_tokens). Already deterministic;
   no LLM.
5. winner = highest-scoring representative across clusters; promote
   to PLAN.md (refusing to clobber an existing one without --force).

PLAN-SELECTION.json records `hard_failed[]` (relPaths), each
survivor's `cluster {cluster_id, is_representative, merged_into}`,
`clusters_formed`, and `proximity_threshold`.
</task>

<task name="threshold-hardcoded-for-v0.4">
**Codex r8 P1:** v0.4 deliberately ships ZERO new user-facing
config knobs besides `effort` (`candidates_per_plan_phase`). The
Jaccard threshold is hardcoded to 0.85 as a `const` in
`lib/plan-tournament.ts`. Tests parametrize the threshold via
direct function argument (not config). Promotion to a config knob
is deferred to v0.5 after benchmark data justifies the value —
see DEFER-v0.4-4-threshold-tuning in the reflection.
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
- Representative = **highest `_scorePlan` within the cluster**
  (after the hard-fail filter, per codex r1 P1 #4). Earlier drafts
  guessed "most files_modified"; that's dead — a richer-but-
  DEAD-ENDS-violating member would silently dominate innocent
  siblings (the violator is now hard-failed BEFORE clustering).
- Estimated cost: ~0.5 day. ~150 lines incl. tests.
