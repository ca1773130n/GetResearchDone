# v0.4 roadmap — validation-first deterministic candidate selection

**Status:** rewritten 2026-05-24 after adversarial codex review of the
prior Elo-based plan. See [`docs/ouroboros-loop.md`](./ouroboros-loop.md)
§8.2 for the canonical version of this scope.

## Premise

The Ouroboros paper's §1 thesis is that **ground truth in agentic
coding is cheap and absolute** (jest / tsc / lint). So the core loop
must avoid LLM-judged proxies.

The earlier draft of this roadmap (now deleted) proposed an
LLM-judged Elo tournament as the plan selector. That contradicted
the paper's thesis and would have been a regression against the
existing deterministic scorer in `lib/plan-tournament.ts`.

This rewrite restores consistency: every v0.4 item is a
deterministic computation over on-disk artifacts. No LLM judge
sits on the execution path.

## The five shipping items

### Item 1 — Multi-candidate plan generation

`gd plan-phase --candidates N` produces N alternative PLAN.md files
in a single planner dispatch. Today the planner produces one plan;
with N candidates we get a comparison set without paying for N
separate dispatches.

- Cost: ~0.5 day. Extend the existing `cmdPlanPhase` to support
  `--candidates`; emit `PLAN-1.md`, `PLAN-2.md`, ... `PLAN-N.md`.
- Codex-rescue exposure: low. Same call surface, larger output.

### Item 2 — Deterministic candidate selector

Extend `lib/plan-tournament.ts`'s existing `_scorePlan` (which
already weights completeness, goal alignment, hypothesis presence,
conciseness) with four real-cost / real-signal axes:

- `must_haves` coverage from REQUIREMENTS.md (regex match for each
  required artifact / link)
- DEAD-ENDS violations — if the plan re-proposes an approach in
  `.planning/DEAD-ENDS.md`, hard fail the candidate
- dry-run verifier outcome — when the plan has executable steps,
  attempt dry-run; pass-rate is a score component
- token / wall-clock cost — pure tiebreaker

The selected plan is the `_scorePlan` winner. No LLM judge.

- Cost: ~1 day. Lives entirely in `lib/plan-tournament.ts`.
- Codex-rescue exposure: medium. Score-weight tuning + DEAD-ENDS
  match logic are typical edge-case sources.

### Item 3 — Proximity dedup before scoring

Cluster the N candidates by vocabulary Jaccard using the existing
ontology infrastructure in `lib/drift.ts`. Within a cluster, keep
one representative.

This is **not** tournament machinery. It's deduplication so we
don't execute three near-identical plans.

- Cost: ~0.5 day. Pure helper using existing infra.
- Codex-rescue exposure: low. Math primitive.

### Item 4 — `effort` config axis

New `.planning/config.json` key, orthogonal to `model_profile` and
`token_profile`. Values: `thrifty | balanced | deep`. Effects:

| Knob | thrifty | balanced | deep |
|---|---|---|---|
| candidates per plan-phase | 1 | 3 | 7 |
| refinement_loop max iterations | 1 | 3 | 7 |
| benchmark runs per phase | 0 | 1 | 3 |

Notably absent: LLM debate rounds. There are no LLM debate rounds
in v0.4.

- Cost: ~0.5 day. Config schema + caller wiring.
- Codex-rescue exposure: low. Pure config plumbing.

### Item 5 — Deterministic pattern extractor

Scan recent VERIFICATION.md `<reflection>` blocks. Count verdict
outcomes per plan vocabulary token. *Suggest* (not auto-write)
statistically significant patterns for GENOME.md heuristics:

```
$ gd patterns --dry-run
Suggested heuristics (verdict-stats over 47 reflections):
  - "refactor" tasks have 78% confirmed (vs 35% baseline)
  - "feature-add" tasks have 33% confirmed (vs 35% baseline)
  - Plans omitting <reflection> block have 0% confirmed
Run with --apply to append to GENOME.md
```

Pure regex + stats. No LLM round-trip on the write path.

- Cost: ~1 day. New `lib/commands/patterns.ts`.
- Codex-rescue exposure: medium. Verdict-extraction edge cases
  (split-format reflections, missing fields, etc.).

## Explicitly excluded from v0.4

- **Elo-rated tournaments.** Wrong domain prerequisite. Documented
  at length in `docs/ouroboros-loop.md` §8.3.
- **Meta-review agent.** Another LLM round-trip writing to project
  memory. Item 5 above covers the defensible fraction (deterministic
  stats, suggest-don't-write).
- **`gd plan-tournament --llm-rank`.** May land in v0.5 *gated on an
  explicit flag*, limited to design-doc-style tasks where no cheap
  verifier exists. Not v0.4.

## Validation methodology (gate for v0.5)

Before promoting any v0.4 item from opt-in to default:

1. Populate ≥16 of the 30 internal-bench tasks (we have 8).
2. Run each task in two modes:
   - **baseline** — current `gd plan-phase` (single plan)
   - **multi-candidate** — `gd plan-phase --candidates 5` +
     deterministic selector + proximity dedup
3. Report per-task pass rate, per-bucket average, and tokens-to-pass.
4. Promote multi-candidate to default only if it wins on
   pass rate AND doesn't regress tokens-to-pass by more than 2×.

No correlation experiments. The benchmark is binary: did the
selected plan pass `verify.sh`? Yes / no.

## Ship order

1. **Item 4 (effort axis)** — smallest, unblocks 1+2+3.
2. **Item 1 (multi-candidate)** — required input for 2+3.
3. **Item 2 (deterministic selector)** — core change.
4. **Item 3 (proximity dedup)** — optimization on 2.
5. **Item 5 (pattern extractor)** — independent; can ship any time.

Items 1+2+3+4 ship as **v0.4.0**. Item 5 ships as **v0.4.1**. v0.5
is the empirical validation against the bench plus, conditionally,
the `--llm-rank` mode for design-doc tasks.

## What this DOES NOT include

- Command surface trim (`docs/DEPRECATIONS.md` — separate work)
- Cross-project GENOME (still future work)
- Replacing codex-rescue (still future work; item 5 is a step)

## Reference

- `docs/ouroboros-loop.md` §8.2/§8.3 — canonical scope
- Codex adversarial review 2026-05-24 (task `b2lc9ahqn`) — found 3
  P1 + 2 P2 in the prior Elo-based draft; this rewrite addresses all
- Gottweis et al. (2025), arXiv:2502.18864 — Co-Scientist; we
  borrow the *generate-multiple-candidates* idea but use cheap
  verifier truth instead of their LLM-judged Elo proxy
