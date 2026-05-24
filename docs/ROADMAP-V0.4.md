# v0.4 roadmap — Co-Scientist-inspired closed-loop additions

**Status:** spec drafted 2026-05-24 after reviewing Google DeepMind
Co-Scientist (Gottweis et al., arXiv:2502.18864) and the broader
multi-agent-research landscape. Operationalizes
[`docs/ouroboros-loop.md` §8.2](./ouroboros-loop.md#82-co-scientist-inspired-additions-scoped-for-v04x).

## Why now

Co-Scientist demonstrated that **Elo-rated tournaments between
hypotheses correlate with downstream accuracy** (GPQA-diamond). It
also showed that a **meta-review agent** that summarizes patterns
across iterations measurably improves later iterations.

GRD has the primitives (`gd plan-tournament`, GENOME, reflections)
but each runs in isolation. v0.4 wires them into a single
generate–debate–evolve cycle.

## The four shipping items

### Item A — Elo-rated plan tournament

**Goal.** Replace one-shot `gd plan-tournament score` with iterative
head-to-head debates that accumulate Elo per candidate plan.

**Scope.**

- New file `.planning/phases/<N>/PLAN-ELO.json` — persistent Elo
  state per phase. Schema:
  ```json
  {
    "candidates": [
      { "id": "PLAN-A.md", "elo": 1234, "rounds": 7 }
    ],
    "rounds": [
      { "a": "PLAN-A.md", "b": "PLAN-B.md", "winner": "a", "ts": "..." }
    ]
  }
  ```
- New CLI:
  - `gd plan-tournament debate <A> <B>` — runs the critic-agent
    judging which of A/B better satisfies the phase goal; updates
    Elo via `K=32` formula
  - `gd plan-tournament leaderboard [--phase N]` — print current
    ranking
  - `gd plan-tournament round [--phase N]` — auto-select a pair
    (top-of-leaderboard vs. lowest-active) and debate
- Wire into autopilot: when ≥2 PLAN.md files exist for a phase,
  run K rounds (configurable, default 3) before `execute-phase`
  picks the Elo-leader.

**Out of scope.** Cross-phase Elo (each phase is independent).

**Estimate.** ~1 day. Implementation lives in
`lib/plan-tournament.ts` (extend existing module).

**Codex-rescue exposure.** Medium — Elo math + persistence layer +
new CLI verbs; ~3-5 P2 findings expected on first review.

### Item B — Meta-review agent

**Goal.** Periodically extract *prescriptive* heuristics from recent
VERIFICATION.md reflections, append to GENOME.md as a distinct
section ("Patterns learned from reflections") separate from existing
descriptive snapshots.

**Scope.**

- New agent `agents/grd-meta-reviewer.md` — reads N recent
  `<reflection>` blocks (defaults: N=10, partial/falsified only)
  plus current GENOME.md heuristics, emits a list of new heuristics
  that don't already exist. Must cite the reflection slugs that
  produced each heuristic.
- New CLI `gd meta-review [--n 10] [--dry-run]` — invoke the
  meta-reviewer; on non-dry-run, append output to GENOME.md under a
  new `## Patterns learned from reflections` section (auto-deduped
  against existing entries).
- Wire into evolve loop: after every K cycles
  (`evolve.meta_review_every_n_cycles`, default 3) auto-invoke
  meta-reviewer if `evolve.auto_meta_review === true`.

**Out of scope.** Cross-project meta-review (deferred to §8.1
"cross-project GENOME").

**Estimate.** ~1 day. Implementation: new
`lib/commands/meta-review.ts` + the agent markdown.

**Codex-rescue exposure.** High — agent-output parsing, dedup, GENOME
write path; ~5-8 P2 findings expected.

### Item C — Proximity clustering for plan candidates

**Goal.** Avoid wasted tournament rounds on near-duplicate plans by
clustering candidates first; only cluster winners enter the global
tournament.

**Scope.**

- New helper `lib/plan-tournament.ts:clusterCandidates(candidates,
  threshold)` — uses existing vocabulary-Jaccard from
  `lib/drift.ts`. Threshold default 0.85.
- Tournament harness changes:
  1. Cluster candidates
  2. Within each cluster of size ≥2, run K rounds; promote winner
  3. Cluster winners enter global tournament
- New CLI flag `gd plan-tournament debate --no-cluster` to bypass.

**Out of scope.** Re-clustering after each round (one-shot clustering
at start is sufficient).

**Estimate.** ~0.5 day. Leverages existing drift infra.

**Codex-rescue exposure.** Low — math primitive, well-tested infra.

### Item D — `effort` orthogonal axis

**Goal.** Add a project-scoped `effort` configuration
(`thrifty | balanced | deep`) that scales test-time compute across
the closed loop in proportion.

**Scope.**

- New `.planning/config.json` key: `effort`. Default `balanced`.
- Concrete effects per setting:

  | Effect | thrifty | balanced | deep |
  |---|---|---|---|
  | `plan-tournament rounds per phase` | 0 (skip) | 3 | 9 |
  | `refinement_loop max iterations` | 1 | 3 | 7 |
  | `critique-agent maxTurns` | 10 | 20 | 40 |
  | `meta-review every N cycles` | 6 | 3 | 1 |
- `effort` is *orthogonal* to `model_profile` and `token_profile`
  — they answer "what model?" and "when to downgrade?"; `effort`
  answers "how many compute cycles?".
- New CLI `gd settings effort <thrifty|balanced|deep>` (one of the
  two settings keys still accepted by `gd settings` per
  DEPRECATIONS.md plan).

**Out of scope.** Per-phase effort override (could be a follow-up).

**Estimate.** ~0.5 day. Mostly config-loading + caller wiring.

**Codex-rescue exposure.** Low — wiring + config schema only.

## The honest §6 follow-up

Co-Scientist showed Elo-vs-accuracy correlation in their domain.
We do not yet know if the same correlation holds for *coding*. The
right validation:

1. Populate ≥16 of the 30 internal-bench tasks (we have 8).
2. Run each task in both modes:
   - **naive** — plan-once with current `gd plan-phase`
   - **tournament** — Elo-rated plan-tournament with 3 rounds, then
     `execute-phase` the leader
3. Report:
   - Per-task pass rate (naive vs tournament)
   - Elo vs `verify.sh` pass rate correlation coefficient
4. Update `docs/ouroboros-loop.md` §6 with the empirical claim.

If correlation is strong → ship tournament-by-default in v0.5. If
weak → keep tournament as opt-in and document the failure honestly.

## Ordering

Recommended ship order:

1. **D — effort axis** (smallest blast radius; needed by A/B/C)
2. **A — Elo plan-tournament** (the most-cited Co-Scientist mechanism)
3. **C — proximity clustering** (cheap optimization of A)
4. **B — meta-review** (highest leverage; depends on enough
   reflection history to be useful)

A + D could ship as `v0.4.0`. B + C as `v0.4.1`. The honest §6
empirical study lands in `v0.5` once ≥16 tasks are populated.

## What this does NOT include

- The DEPRECATIONS.md command trim plan (separate work; the
  deprecation warnings shipped in v0.3.28 already).
- Cross-project GENOME (still future work).
- Replacing codex-rescue with an in-loop reviewer (still future
  work; meta-review is a partial step in that direction).

## Reference

- Gottweis et al. (2025). *Towards an AI co-scientist.*
  arXiv:2502.18864.
- [`docs/ouroboros-loop.md`](./ouroboros-loop.md) §8.2 for the
  conceptual mapping.
