# Falsified approaches — do not re-propose

Project-scoped registry of approaches that have been tried, validated
as failing, and recorded here so the planner cannot re-propose them.
Each entry was promoted from a falsified `<reflection>` block in a
phase's VERIFICATION.md or from an adversarial review finding.

Schema documented in [`agents/grd-planner.md`](../agents/grd-planner.md)
`<dead-ends>` block.

## elo-rated-plan-tournament

```yaml
slug: elo-rated-plan-tournament
hypothesis: "Adopting DeepMind Co-Scientist's Elo-rated tournament mechanism over candidate PLAN.md files would improve plan selection quality (analogous to the GPQA-diamond correlation Co-Scientist published)."
predicted_outcome: "Elo-rated multi-round LLM debates over plan candidates produce a better selector than the existing deterministic _scorePlan."
actual_outcome: "Reviewed by codex (task b2lc9ahqn, 2026-05-24) and rejected with 3 P1 findings. Elo is a proxy used by Co-Scientist because their domain (biomedicine) has expensive ground truth. GRD's domain (agentic coding) has cheap absolute ground truth (jest/tsc/lint via spawnSync). An LLM-judged Elo proxy is strictly worse than direct measurement here. Adopting it would also be a regression against the existing deterministic _scorePlan in lib/plan-tournament.ts (completeness + goal alignment + hypothesis presence + conciseness, all auditable)."
why_failed: "Wrong domain prerequisite. The §1 thesis of docs/ouroboros-loop.md is 'no LLM-judged scoring on the core path'; an Elo plan-selector contradicts that thesis directly."
evidence:
  - codex_review: "task b2lc9ahqn — 3 P1 + 2 P2 findings"
  - paper: "docs/ouroboros-loop.md §8.3 (where LLM-judged ranking does/doesn't belong)"
  - existing_alternative: "lib/plan-tournament.ts:_scorePlan"
dead_end_added_via: manual
date: 2026-05-24
```

## meta-review-agent-with-write-access

```yaml
slug: meta-review-agent-with-write-access
hypothesis: "An LLM 'meta-reviewer' agent that periodically reads VERIFICATION.md reflections and auto-appends prescriptive heuristics to GENOME.md (modelled on Co-Scientist's Meta-review role) would compound learnings across iterations."
predicted_outcome: "Heuristics extracted by the meta-reviewer would measurably reduce repeat failures in subsequent phases."
actual_outcome: "Same anti-pattern as Elo: another LLM round-trip writing to project memory. Codex r-b2lc9ahqn flagged it P1: 'a high-leverage write path to project memory driven by another LLM summary.' Defensible fraction (deterministic statistical pattern extraction over verdict tokens) survives as v0.4 item 5; auto-writing meta-reviewer does not."
why_failed: "Same sausage-factory problem the paper's §1 thesis rules out for the core path. Writing prescriptive rules to GENOME based on LLM summary creates a feedback loop where errors in the summary become enshrined heuristics."
evidence:
  - codex_review: "task b2lc9ahqn — P1 finding #3"
  - paper: "docs/ouroboros-loop.md §8.2 excluded list"
  - surviving_fraction: "docs/ROADMAP-V0.4.md item 5 (deterministic pattern extractor, suggest-don't-write)"
dead_end_added_via: manual
date: 2026-05-24
```

## llm-prose-as-tool-output

```yaml
slug: llm-prose-as-tool-output
hypothesis: "Sending shell commands like 'npm test', 'tsc', 'eslint' to claude -p and regex-parsing the LLM's response describing what those commands might output is a workable substitute for running them."
predicted_outcome: "Refinement loop metrics (coverage, type errors, lint count) would track real project state."
actual_outcome: "Shipped in v0.3.26 refinement loop; codex r43 P1 #1 caught it within 24h. Loop silently produced 0% coverage / 0 errors / 0 lint regardless of actual project state."
why_failed: "LLM-described output is not tool output. The substitution looks plausible at the API boundary but the data is fictional. v0.3.27 fixed this by routing through real spawnSync of npx jest / tsc / eslint."
evidence:
  - codex_review: "task biff8i32r (r43) — P1 finding #1"
  - fix_commit: "7e48fe9 in v0.3.27"
  - module: "lib/autopilot-pipeline.ts:_measureMetrics"
dead_end_added_via: manual
date: 2026-05-24
```
