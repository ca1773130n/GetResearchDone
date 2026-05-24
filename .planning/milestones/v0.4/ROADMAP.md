# v0.4 — Validation-first deterministic candidate selection

> **Format note (codex review P2 #8):** This ROADMAP.md is
> intentionally prose-only. The PLAN.md files under
> `phases/<N>-<slug>/` are the machine-checkable schema source of
> truth. `gd-tools verify-summary` and `gd-tools verify mechanical`
> run per-phase against PLAN.md, not against this ROADMAP.

**Milestone goal:** Replace single-plan dispatch with multi-candidate
generation + deterministic selection, gated on the cheap verifier
(`verify.sh`-style outcomes from real `npx jest / tsc / eslint` runs).
Zero LLM-judged scoring on the execution path. Five phases, all opt-in
via new `effort` config axis; the v0.4.0 release ships items 1-4
together; item 5 ships as v0.4.1.

**Why now:** the autoresearch reality-check (2026-05-24) showed every
peer agent has a published metric backing their identity. GRD's
Singularity 92.2% is a context number; the *quality* claim needs a
benchmark. Multi-candidate + deterministic selector is the minimum
substrate that produces a measurable improvement we can report.

**DEAD-ENDS respected** (planner must not re-propose): six entries in
[`.planning/DEAD-ENDS.md`](../../DEAD-ENDS.md). Three from prior
cycles: `elo-rated-plan-tournament`,
`meta-review-agent-with-write-access`, `llm-prose-as-tool-output`.
Three new entries from codex review of the v0.4 design itself
(task `bkknb6i9g`): `fuzzy-jaccard-as-deadends-hard-fail`,
`dedup-before-hardfail-ordering`, `auto-suggestions-in-genome-file`.

**GENOME heuristic applied:** "No LLM-judged scoring on the core
execution path." Every phase below follows it.

**Cost note (codex review P2 #9):** Per-phase nominal estimates
total ~3.5 days. Adjusted for typical codex-rescue overhead
(50-100% of nominal based on rounds 1-47 history), realistic ship
is **5-7 days** for v0.4.0 (items 1-4) plus another **1-2 days**
for v0.4.1 (item 5). Each PLAN.md publishes both numbers.

## Phases

- [ ] **Phase 1: `effort` config axis** — orthogonal to model_profile
  / token_profile. Values `thrifty | balanced | deep` scale candidate
  count, refinement iterations, and benchmark runs. Unblocks 2-4.
  Verification: proxy (config round-trip + per-knob unit tests).
- [ ] **Phase 2: multi-candidate plan generation** — `gd plan-phase
  --candidates N` emits `PLAN-1.md ... PLAN-N.md` in a single planner
  dispatch. Verification: proxy (integration test on a small fixture
  generates 3 distinct PLAN files).
- [ ] **Phase 3: deterministic candidate selector** — extend
  `lib/plan-tournament.ts:_scorePlan` with must_haves coverage +
  DEAD-ENDS violations + dry-run verifier + cost tiebreaker. Selected
  plan auto-feeds `gd execute-phase`. Verification: proxy (golden-
  file tests against benchmark task fixtures).
- [ ] **Phase 4: proximity dedup** — cluster candidates by vocabulary
  Jaccard before scoring; one representative per cluster moves
  forward. Verification: proxy (unit test: 3 near-identical plans
  collapse to 1).
- [ ] **Phase 5: deterministic pattern extractor** — `gd patterns
  --dry-run` scans VERIFICATION.md reflections, suggests
  statistically significant heuristics for GENOME.md. Dry-run first;
  `--apply` requires explicit flag. Verification: proxy + sanity
  (regex extraction unit tests + suggested heuristics manually
  reviewed on real reflection history).

## Validation gate for v0.5

Promote multi-candidate to default only if it wins on benchmark
pass rate AND doesn't regress tokens-to-pass by more than 2× on
≥16 internal-bench tasks.

## What v0.4 deliberately excludes

- Elo-rated plan tournaments (DEAD-ENDS: `elo-rated-plan-tournament`)
- Meta-review agent with write access (DEAD-ENDS:
  `meta-review-agent-with-write-access`)
- LLM-judged plan ranking by default (may ship as opt-in
  `--llm-rank` flag in v0.5 for design-doc-style tasks only)

## Reference

- [`docs/ouroboros-loop.md`](../../../docs/ouroboros-loop.md) §8.2
- [`docs/ROADMAP-V0.4.md`](../../../docs/ROADMAP-V0.4.md)
- Codex adversarial review task `b2lc9ahqn` (2026-05-24)
