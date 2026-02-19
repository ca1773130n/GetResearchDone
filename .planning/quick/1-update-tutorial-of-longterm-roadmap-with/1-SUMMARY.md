---
phase: quick-1
title: Update LT roadmap tutorial with iterative refinement guide
status: completed
duration: 5min
---

# Quick Task 1: Summary

## What Changed

Replaced the brief "Breakdown Refinement Workflow" section in `docs/long-term-roadmap-tutorial.md` (previously ~50 lines) with a comprehensive "Iterative Refinement: From LT Milestones to Shipped Code" section (~325 lines).

## New Content

1. **Refinement Loop diagram** — ASCII flowchart showing the cycle: Research → Refine → Decompose → Execute → Evaluate → loop or complete
2. **Full 9-step walkthrough** — Concrete scenario refining "LT-3: Multi-Modal Support" from a vague goal through two normal milestones (v0.3.0, v0.3.1) to completion, with exact slash commands at each step
3. **When to split an LT milestone** — Signs and how-to with commands
4. **When to add unplanned normal milestones** — Driven by eval results
5. **Summary table** — Quick-reference mapping of steps to slash commands

## Files Modified

| File | Change |
|------|--------|
| `docs/long-term-roadmap-tutorial.md` | Replaced lines 223-272 with expanded refinement guide |

## Verification

- All referenced slash commands are real GRD commands (survey, deep-dive, long-term-roadmap refine/update/link, new-milestone, discuss-phase, plan-phase, execute-phase, verify-phase, audit-milestone, complete-milestone, eval-report)
- Markdown formatting is clean with consistent heading levels
- Tutorial flows logically from CRUD basics (Steps 1-8) through the iterative refinement walkthrough
