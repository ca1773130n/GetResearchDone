---
phase: 103-seed-interview-decide-branch
plan: 01
subsystem: research-skill
tags: [skill, socratic-interview, human-in-the-loop, REQ-202]
requires: []
provides:
  - "commands/research.md: Interactive SEED interview (pre-loop clarification) section"
affects:
  - "gd research \"<question>\" fresh-thread invocation flow (skill layer only)"
tech-stack:
  added: []
  patterns:
    - "Thin skill-layer socratic pre-loop (ask -> refine -> invoke), no state machine"
    - "AskUserQuestion one-multiple-choice-question-at-a-time, context first"
key-files:
  created: []
  modified:
    - "commands/research.md"
decisions:
  - "SEED interview is skill-layer-only markdown; NO CLI flag, NO orchestrator/TS change (REQ-202 skill half)"
  - "Original question preserved verbatim by echoing (Original -> Refined), not by a new CLI arg — adding a flag was out of scope"
  - "Interview positioned before the gd research invocation and cross-referenced (not merged) with the in-loop Interactive steering checkpoint protocol"
metrics:
  tasks: 2
  files: 1
  duration: ~10m
  completed: 2026-07-19
---

# Phase 103 Plan 01: SEED Interview (Skill Layer) Summary

Thin Superpowers-brainstorm-style socratic pre-loop interview added to `commands/research.md`
so the research skill can refine a vague question into one carrying a falsifiable metric
target BEFORE invoking `gd research` — one multiple-choice question at a time, context first,
stopping the moment a numeric metric + comparator + target threshold exists. Markdown-only;
no CLI flag and no orchestrator logic (that is the sibling Plan 103-02).

## What Was Built

- **Task 1 (086cba4):** New `## Interactive SEED interview (pre-loop clarification)` section
  inserted after the deep-research branch and before the `gd research` invocation. Specifies:
  fresh-thread-only trigger with the full skip matrix (resume/status/deep-research/`--no-gates`
  /autopilot/non-interactive), context-first ambiguity restatement, ONE AskUserQuestion
  multiple-choice question per call, the hard falsifiable-metric-target stop condition,
  once-per-thread scoping, and the refined-question handoff echoing the original verbatim.
- **Task 2 (7c07756):** Cross-linked the section into `## Subcommands` (annotated
  `gd research "<question>"` as SEED-interview-preceded for fresh threads) and `## Flags`
  (noted `--no-gates` suppresses the interview; clarified it is a skill step distinct from the
  in-loop Interactive steering checkpoint). No duplication of the answers-file/resume protocol.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

Level 1 (Sanity) passed:
- `grep -nE "SEED interview|question at a time|falsifiable|metric target"` matches the section,
  the one-question-at-a-time rule, and the falsifiable-target stop condition.
- `grep -nE "Subcommands|## Flags|SEED"` confirms the cross-references.
- `git diff --name-only` for staged commits touched ONLY `commands/research.md` (the parallel
  Plan 103-02 TS files `lib/research/agent-io.ts` + test were left unstaged, per coordination).

## Coordination Notes

Parallel Plan 103-02 shares the working directory and owns the TS files (orchestrator/agent-io/
_prompts + tests). Those appeared in the working tree as modified but were never staged by this
plan; each of this plan's two commits staged `commands/research.md` individually.

## Self-Check: PASSED

- FOUND: commands/research.md Interactive SEED interview section
- FOUND: commit 086cba4 (Task 1)
- FOUND: commit 7c07756 (Task 2)
