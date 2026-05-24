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
= the cluster member with the most files_modified (richest plan).
</task>

<task name="vocabulary-extraction">
Reuse the stopword list + tokenizer from `lib/drift.ts` (already
used for ontology distance). Token sets exclude common words like
"the", "and", and very short tokens (<3 chars).
</task>

<task name="selector-integration">
In `lib/autopilot.ts`'s plan-selection step, call
`clusterCandidates` before `_scorePlan`. Score only cluster
representatives. PLAN-SELECTION.json records which candidates
were collapsed into which clusters (audit trail).
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

```yaml
hypothesis: "Jaccard threshold 0.85 over the vocabulary of files_modified + tasks + hypothesis correctly identifies near-duplicate plans without collapsing meaningfully different ones."
predicted_outcome: "Unit tests at thresholds 0.50 / 0.85 / 0.95 produce the expected merge / correct / no-merge outcomes. Real-world threshold tuning happens in v0.5 once we have benchmark-task multi-candidate data."
```

## Notes

- This phase has the lowest codex-rescue exposure on v0.4. Math
  primitive, well-tested existing infrastructure.
- The "richest = representative" heuristic is a guess; could be
  refined later (e.g. "highest-scoring = representative" after
  scoring once per cluster). v0.4 ships the guess.
- Estimated cost: ~0.5 day. ~150 lines incl. tests.
