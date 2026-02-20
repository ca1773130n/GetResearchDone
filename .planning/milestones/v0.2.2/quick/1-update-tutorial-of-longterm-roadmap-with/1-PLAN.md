---
phase: quick-1
title: Update LT roadmap tutorial with iterative refinement guide
verification_level: 1
estimated_effort: small
---

# Quick Task 1: Update LT Roadmap Tutorial

## Goal

Replace the brief "Breakdown Refinement Workflow" section in `docs/long-term-roadmap-tutorial.md` with a comprehensive, step-by-step guide showing how to iteratively refine LT milestones into normal milestones using GRD slash commands.

## Tasks

### Task 1: Rewrite the refinement workflow section

**File:** `docs/long-term-roadmap-tutorial.md`

Replace the existing "Breakdown Refinement Workflow" section (lines 223-272) with a detailed walkthrough covering:

1. **The iterative refinement loop** — Conceptual diagram showing the cycle: rough LT goal → research → refine goal → break into normal milestones → execute → evaluate → refine next LT milestone
2. **Step-by-step walkthrough** — A concrete scenario walking through refining an LT milestone from vague to concrete, using every relevant slash command in order:
   - Start with a vague LT milestone
   - Run `/grd:survey` to learn the landscape
   - Use `/grd:long-term-roadmap refine` to discuss
   - Use `/grd:long-term-roadmap update` to sharpen the goal
   - Use `/grd:new-milestone` to create the first normal milestone
   - Use `/grd:long-term-roadmap link` to connect them
   - Execute phases within the normal milestone
   - Use `/grd:complete-milestone` when done
   - Evaluate whether the LT goal is met or needs another normal milestone
   - Repeat or mark the LT milestone completed
3. **When to split an LT milestone** — Guidance on recognizing when one LT milestone should become two
4. **When to add unplanned milestones** — How eval results drive new normal milestones

### Verification

- Tutorial reads coherently end-to-end
- All referenced slash commands are real GRD commands
- No broken markdown formatting
