# Population-based frontier search over research states (GEAR-style)

**Captured:** 2026-07-09
**Priority:** P1
**Source:** Competitive landscape 2026-07 (P6) — `.planning/research/competitive-landscape-2026-07.md`

## Problem

GRD's research loop is single-incumbent: one hypothesis line advances, and a plateau
(`research_plateau_window`) triggers a re-survey. GEAR (arXiv 2605.13874, UofT/Vector +
Samsung) shows population-based frontier search (mutation + crossover over a bounded
elite set of research states) escapes the premature convergence of greedy
keep-or-discard loops — all three GEAR variants beat the AutoResearch baseline under
identical compute (unverified numbers: baseline plateaus 0.98232; GEAR-Evolve 0.97658,
crossing the baseline plateau at experiment 40 vs 72/84 for weaker variants).

## Solution

Extend the DECIDE stage: instead of keep-or-discard, maintain a bounded elite set
(size = `research_max_candidates`, already exists) of thread states ranked by the
deterministic verdict distance-to-target; on plateau, mutate/crossover from elites
before falling back to re-survey. `gd research portfolio` already runs bounded-
concurrency multi-thread ranking — reuse it as the population substrate. Keep the
selector deterministic (v0.4 GENOME heuristic: zero LLM-judged scoring on execution
path). GEAR-Evolve's controller-self-mutation variant maps to a future life-harness
round target, not the research loop.

## Files

- `lib/research/orchestrator.ts` (DECIDE stage), `lib/research/portfolio.ts`
- `tests/unit/research/`
