# TaskMark Tutorial — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Goal:** Create a self-contained example project that onboards new users to GRD's multi-agent R&D workflow and self-evolution capabilities.

## Overview

TaskMark is a deliberately imperfect Node.js CLI tool (a markdown task manager) bundled in `examples/taskmark/`. New users who have Claude Code installed but haven't used GRD walk through a tutorial that demonstrates:

1. How GRD's multi-agent system discovers and fixes real code issues
2. The full R&D lifecycle: init, baseline, plan, execute, eval, evolve
3. The self-evolution loop that continuously improves a codebase

## Target Audience

New users with Claude Code installed but no GRD experience. Assumes Node.js 18+ and basic CLI familiarity.

## The Example CLI: `taskmark`

A ~85-line Node.js CLI that manages tasks in markdown files.

### Commands

| Command | Description |
|---------|-------------|
| `taskmark add "text"` | Add a task to tasks.md |
| `taskmark list` | Print all tasks with status |
| `taskmark done <id>` | Mark a task as complete |
| `taskmark search "query"` | Find matching tasks |

### Intentional Gaps (for GRD to discover)

| # | Issue | Category |
|---|-------|----------|
| 1 | No input validation — `add` with no arg adds "undefined" | Bug |
| 2 | No file error handling — missing tasks.md crashes | Bug |
| 3 | No bounds check on `done` — invalid ID crashes | Bug |
| 4 | `parseInt()` with no NaN check | Bug |
| 5 | Case-sensitive search only | UX |
| 6 | Hardcoded file path (tasks.md in cwd) | Design |
| 7 | No `--help` or `--version` flags | UX |
| 8 | No tests | Quality |
| 9 | Monolithic single file — no separation of concerns | Architecture |
| 10 | No JSDoc on any function | Documentation |
| 11 | No date tracking on tasks | Feature gap |
| 12 | No priority system | Feature gap |
| 13 | console.log only — no structured output | Design |
| 14 | Missing package.json bin/scripts/license fields | Config |
| 15 | No CI configuration | DevOps |

## Tutorial Structure: Two Tracks

### Quick Path (~5 minutes)

For users who want to see GRD work immediately.

1. Install GRD plugin
2. Explore taskmark (run it, trigger a bug)
3. `/grd:init` — initialize project scaffold (30 seconds)
4. `/grd:quick "add input validation and error handling"` — watch multi-agent plan+execute
5. `/grd:evolve` — watch self-improvement discover remaining issues
6. Review what changed

### Deep Path (~30 minutes)

For users who want to understand the full GRD workflow.

1. Install GRD plugin
2. Explore taskmark thoroughly (read code, trigger multiple bugs)
3. `/grd:init` — define project, see .planning/ scaffold
4. `/grd:assess-baseline` — measure current quality → BASELINE.md
5. `/grd:product-plan` — create roadmap from baseline findings
6. `/grd:plan-phase 1` — break phase into executable plans
7. `/grd:execute-phase 1` — multi-agent execution with atomic commits
8. `/grd:verify-phase 1` — confirm phase goals were achieved
9. `/grd:progress` — dashboard view of project state
10. `/grd:evolve` — self-improvement loop for continuous discovery

## File Structure

```
examples/taskmark/
├── README.md          # Tutorial (both tracks)
├── CLAUDE.md          # Intentionally sparse project rules
├── package.json       # Minimal, missing fields
├── bin/
│   └── taskmark.js    # Monolithic CLI (all logic here)
└── tasks.md           # Sample tasks data
```

## Design Decisions

1. **Single file, not TypeScript** — Keeps the example accessible to anyone. GRD can discover and propose the refactoring.
2. **Real bugs, not fake ones** — Every gap is something a real junior developer might ship. GRD's discoveries feel genuine.
3. **No .planning/ included** — Users create it via `/grd:init`. This teaches the workflow from scratch.
4. **Sparse CLAUDE.md** — Just enough for GRD to read, not enough to be useful. GRD discover can improve it.
5. **Two tracks, same codebase** — Quick path and deep path use identical starting state. No branching setup.

## Success Criteria

- A new user can complete the Quick Path in under 5 minutes
- A new user can complete the Deep Path in under 30 minutes
- GRD discovers at least 8 of the 15 intentional gaps during evolve
- The tutorial requires zero code editing from the user — GRD does all the work
- Each step has a "what you should see" checkpoint so users know they're on track
