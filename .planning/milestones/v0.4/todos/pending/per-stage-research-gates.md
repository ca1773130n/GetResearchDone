# Optional per-stage research gates (hypothesis_review)

**Captured:** 2026-07-09
**Priority:** P2
**Source:** Competitive landscape 2026-07 (P8) — `.planning/research/competitive-landscape-2026-07.md`

## Problem

Agent Laboratory (arXiv 2501.04227) reports empirically that human feedback at EACH
pipeline stage (co-pilot mode) significantly improves research output quality. GRD has
`plan_clarification` (planning-time) and two research gates (`execute`, `kg_write`) —
but no way to review/steer the hypothesis or experiment design mid-loop.

## Solution

Add an optional `research_gates.hypothesis_review` (default OFF, unlike execute/
kg_write — keep autonomous flows friction-free). When on, the loop pauses after
HYPOTHESIZE/DESIGN and surfaces the hypothesis + experiment plan for approve/revise
via the same checkpoint mechanism as the existing gates (AskUserQuestion in
interactive mode; auto-skip under autonomous_mode/autopilot, same as
plan_clarification). Reuses `lib/research/gates.ts` wholesale.

## Files

- `lib/research/gates.ts`, `lib/research/orchestrator.ts`
- `tests/unit/research/gates.test.ts`
