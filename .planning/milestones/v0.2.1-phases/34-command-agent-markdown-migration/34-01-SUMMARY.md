---
phase: 34-command-agent-markdown-migration
plan: 01
subsystem: commands
tags: [migration, paths, init-context, markdown, commands]
dependency-graph:
  requires: [phase-33]
  provides: [command-path-migration]
  affects: [commands/survey.md, commands/deep-dive.md, commands/compare-methods.md, commands/feasibility.md, commands/new-project.md, commands/product-plan.md, commands/eval-plan.md, commands/eval-report.md, commands/iterate.md, commands/plan-phase.md, commands/research-phase.md]
tech-stack:
  added: []
  patterns: [init-derived-paths, PATHS-blocks-in-spawn-prompts]
key-files:
  created: []
  modified:
    - commands/survey.md
    - commands/deep-dive.md
    - commands/compare-methods.md
    - commands/feasibility.md
    - commands/new-project.md
    - commands/product-plan.md
    - commands/eval-plan.md
    - commands/eval-report.md
    - commands/iterate.md
    - commands/plan-phase.md
    - commands/research-phase.md
decisions:
  - "Used init survey for compare-methods since compare-methods is not a standalone init subcommand"
  - "Used init plan-phase for research-phase since it provides phases_dir, phase_dir, and research_dir"
  - "All commands that spawn agents include PATHS blocks in spawn prompts for milestone-scoped path resolution"
metrics:
  duration: 10min
  completed: 2026-02-20
---

# Phase 34 Plan 01: Command Markdown Path Migration Summary

Migrated 11 research-focused command markdown files from hardcoded `.planning/research/`, `.planning/phases/`, and `.planning/codebase/` paths to init-context-derived variables (`${research_dir}`, `${phases_dir}`, `${phase_dir}`, `${codebase_dir}`), enabling milestone-scoped directory resolution across all research and phase planning workflows.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate research-focused commands (survey, deep-dive, compare-methods, feasibility, new-project, product-plan) | 86d42d4 | 6 command files |
| 2 | Migrate remaining research/phase commands (eval-plan, eval-report, iterate, plan-phase, research-phase) | 3245dfa | 5 command files |

## Changes Made

### Task 1: Research-Focused Commands

**survey.md** (11 occurrences replaced):
- Changed init from inline to INIT variable assignment with JSON parsing for `research_dir`
- Replaced all `mkdir -p .planning/research/`, `git add .planning/research/`, write paths, context descriptions, and output section references
- Added PATHS block to grd-surveyor spawn prompt

**deep-dive.md** (13 occurrences replaced):
- Added `grd-tools.js init deep-dive` call (previously missing)
- Replaced all deep-dive file paths, mkdir, git add, write targets, and output section
- Added PATHS block to grd-deep-diver spawn prompt

**compare-methods.md** (9 occurrences replaced):
- Added `grd-tools.js init survey "compare-methods"` call (compare-methods is not a standalone init subcommand)
- Replaced LANDSCAPE.md path, deep-dives scan, comparison file write path, git add, and output section

**feasibility.md** (8 occurrences replaced):
- Added `grd-tools.js init feasibility` call (previously missing)
- Replaced deep-dive load path, feasibility report write path, git add commands, and output section
- Added PATHS block (research_dir, codebase_dir) to grd-feasibility-analyst spawn prompt

**new-project.md** (27 occurrences replaced):
- Extended existing init parsing to include `research_dir`, `phases_dir`, `codebase_dir`
- Replaced ARCHITECTURE.md brownfield path, research mkdir, all 4 research file creation paths (LANDSCAPE.md, PAPERS.md, BENCHMARKS.md, KNOWHOW.md), commit --files paths
- Updated all 5 research agent spawn prompts (4 researchers + 1 synthesizer) with PATHS blocks and `${research_dir}/` write targets
- Updated research complete banner, roadmapper reference, output table, and output file list

**product-plan.md** (8 occurrences replaced):
- Added `grd-tools.js init product-plan` call (previously missing)
- Replaced research landscape loading paths, phases mkdir, git add, and output section
- Added PATHS block (research_dir, codebase_dir, phases_dir) to grd-product-owner spawn prompt

### Task 2: Remaining Research/Phase Commands

**eval-plan.md** (10 occurrences replaced):
- Added `grd-tools.js init eval-plan` call
- Replaced phase directory references, ls validation, EVAL.md write path, git add, and output section
- Added PATHS block to grd-eval-planner spawn prompt

**eval-report.md** (8 occurrences replaced):
- Added `grd-tools.js init eval-report` call (previously missing)
- Replaced phase resolution path, EVAL.md load and populate paths, git add, and output section
- Added PATHS block to grd-eval-reporter spawn prompt

**iterate.md** (8 occurrences replaced):
- Added `grd-tools.js init iterate` call (previously missing)
- Replaced phase resolution path, EVAL.md and PLAN.md git add paths, and output section

**plan-phase.md** (8 occurrences replaced):
- Extended existing init parsing to include `research_dir`, `phases_dir`, `codebase_dir`
- Replaced research landscape cat commands, deep-dives ls, phase mkdir, and offer_next display paths
- Added PATHS blocks to all 3 agent spawn prompts (researcher, planner, eval planner)

**research-phase.md** (3 occurrences replaced):
- Added `grd-tools.js init plan-phase` call (previously missing)
- Replaced ls, cat, and write-to paths
- Added PATHS block to grd-phase-researcher spawn prompt

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| Zero hardcoded `.planning/research/` in operational paths | PASS (0 occurrences across 11 files) |
| Zero hardcoded `.planning/phases/` in operational paths | PASS (0 occurrences across 11 files) |
| Zero hardcoded `.planning/codebase/` in operational paths | PASS (0 occurrences across 11 files) |
| Init calls added to 7 previously missing commands | PASS (deep-dive, compare-methods, feasibility, eval-report, iterate, product-plan, research-phase) |
| Valid YAML frontmatter in all 11 files | PASS (all start with `---` and have closing delimiter) |
| PATHS blocks in all agent-spawning commands | PASS (9 commands with 16 total PATHS blocks) |

## Self-Check: PASSED
