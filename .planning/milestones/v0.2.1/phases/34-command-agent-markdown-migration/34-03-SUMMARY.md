---
phase: 34-command-agent-markdown-migration
plan: 03
subsystem: agents
tags: [migration, markdown, context-injection, path-variables]
dependency_graph:
  requires: []
  provides: [context-injected-agent-paths]
  affects: [all-agent-spawning-commands]
tech_stack:
  patterns: [context-injected-variables, orchestrator-provided-paths]
key_files:
  modified:
    - agents/grd-planner.md
    - agents/grd-feasibility-analyst.md
    - agents/grd-research-synthesizer.md
    - agents/grd-project-researcher.md
    - agents/grd-surveyor.md
    - agents/grd-phase-researcher.md
    - agents/grd-deep-diver.md
    - agents/grd-product-owner.md
    - agents/grd-eval-planner.md
    - agents/grd-eval-reporter.md
    - agents/grd-verifier.md
    - agents/grd-executor.md
    - agents/grd-codebase-mapper.md
    - agents/grd-code-reviewer.md
    - agents/grd-baseline-assessor.md
    - agents/grd-integration-checker.md
decisions:
  - Used ${research_dir}, ${phases_dir}, ${phase_dir}, ${codebase_dir} variable names consistent with orchestrator PATHS blocks from plan 34-02
  - Preserved .planning/ top-level file references (STATE.md, BASELINE.md, PRODUCT-QUALITY.md, PROJECT.md) since those are not subdirectory paths targeted by this migration
metrics:
  duration: ~15min
  completed: 2026-02-20
---

# Phase 34 Plan 03: Migrate Agent Markdown Files to Context-Injected Paths Summary

All 16 agent markdown files migrated from hardcoded `.planning/research/`, `.planning/phases/`, and `.planning/codebase/` paths to context-injected variables (`${research_dir}`, `${phases_dir}`, `${phase_dir}`, `${codebase_dir}`), achieving zero remaining hardcoded subdirectory paths across the entire agents/ directory.

## What Was Done

### Task 1: Migrate 8 High-Occurrence Agent Files (568fb2b)

Migrated the 8 agent files with the highest density of hardcoded paths:

| Agent File | Edits | Variables Used |
|-----------|-------|---------------|
| grd-planner.md | ~15 | ${research_dir}, ${phases_dir}, ${codebase_dir}, ${phase_dir} |
| grd-feasibility-analyst.md | ~13 | ${research_dir}, ${codebase_dir} |
| grd-research-synthesizer.md | ~8 | ${research_dir} |
| grd-project-researcher.md | ~7 | ${research_dir} |
| grd-surveyor.md | ~10 | ${research_dir} |
| grd-phase-researcher.md | ~7 | ${research_dir}, ${phase_dir} |
| grd-deep-diver.md | ~10 | ${research_dir} |
| grd-product-owner.md | ~8 | ${research_dir}, ${codebase_dir}, ${phases_dir} |

### Task 2: Migrate 8 Remaining Agent Files (b3b9e85)

Migrated the remaining 8 agent files with lower occurrence counts:

| Agent File | Edits | Variables Used |
|-----------|-------|---------------|
| grd-eval-planner.md | 4 | ${phases_dir}, ${research_dir}, ${phase_dir} |
| grd-eval-reporter.md | 5 | ${phases_dir}, ${research_dir}, ${phase_dir} |
| grd-verifier.md | 4 | ${research_dir}, ${phase_dir} |
| grd-executor.md | 4 | ${phases_dir}, ${phase_dir} |
| grd-codebase-mapper.md | 5 | ${codebase_dir} |
| grd-code-reviewer.md | 3 | ${research_dir} |
| grd-baseline-assessor.md | 3 | ${research_dir}, ${codebase_dir} |
| grd-integration-checker.md | 1 | ${phases_dir} |

## Verification

### Overall Verification (Sanity - Level 1)

```
grep -rn '.planning/(research|phases|codebase)/' agents/*.md
Result: ZERO matches - ALL CLEAN
```

- All 16 agent files have zero hardcoded `.planning/research/` paths
- All 16 agent files have zero hardcoded `.planning/phases/` paths
- All 16 agent files have zero hardcoded `.planning/codebase/` paths
- All 16 agent files have valid, parseable YAML frontmatter

### Path Variable Mapping

| Hardcoded Path | Replacement Variable | Context |
|---------------|---------------------|---------|
| `.planning/research/` | `${research_dir}/` | Research files (LANDSCAPE.md, PAPERS.md, BENCHMARKS.md, KNOWHOW.md, deep-dives/) |
| `.planning/phases/` | `${phases_dir}/` | Phase directory listing and glob patterns |
| `.planning/phases/XX-name/` | `${phase_dir}/` | Current phase directory for writes/reads |
| `.planning/codebase/` | `${codebase_dir}/` | Codebase analysis documents (STACK.md, ARCHITECTURE.md, etc.) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missed hardcoded path in grd-product-owner.md**
- **Found during:** Task 1 verification
- **Issue:** `grep -r "deferred" .planning/phases/*/` was not caught in the initial edit pass
- **Fix:** Changed to `grep -r "deferred" ${phases_dir}/*/`
- **Files modified:** agents/grd-product-owner.md
- **Commit:** Included in 568fb2b

**2. [Rule 2 - Missing] Additional verifier/eval-reporter path references**
- **Found during:** Task 2 execution
- **Issue:** `.planning/phases/{phase_dir}/` template path in grd-verifier.md output section and `.planning/research/BENCHMARKS.md` in grd-eval-reporter.md structured returns were not explicitly listed in the plan
- **Fix:** Migrated all matching occurrences including documentation/template paths
- **Commit:** Included in b3b9e85

## Decisions Made

1. **Variable naming convention**: Used `${research_dir}`, `${phases_dir}`, `${phase_dir}`, `${codebase_dir}` consistently matching the PATHS blocks defined in plan 34-02 orchestrator commands
2. **Scope boundary**: Preserved `.planning/` top-level file references (STATE.md, BASELINE.md, PRODUCT-QUALITY.md, PROJECT.md, config.json) since those are accessed via well-known fixed paths, not context-injected subdirectory variables

## Self-Check: PASSED

- FOUND: All 16 agent files exist and are modified
- FOUND: Commit 568fb2b (Task 1)
- FOUND: Commit b3b9e85 (Task 2)
- VERIFIED: Zero hardcoded subdirectory paths across all agents/*.md
- VERIFIED: All frontmatter valid and parseable
