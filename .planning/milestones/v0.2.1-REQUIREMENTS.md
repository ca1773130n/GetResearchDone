# Requirements Archive: v0.2.1 Hierarchical Planning Directory

**Archived:** 2026-02-20
**Status:** SHIPPED

For current requirements, see `.planning/REQUIREMENTS.md`.

---

# Requirements: v0.2.1 — Hierarchical Planning Directory

## Goal

Enforce strict, milestone-scoped directory hierarchy for all `.planning/` artifacts. Eliminate scattered top-level directories. Zero regressions.

## Target Structure

```
.planning/
├── PROJECT.md, STATE.md, ROADMAP.md, MILESTONES.md  (project-level, unchanged)
├── REQUIREMENTS.md, BASELINE.md, PRODUCT-QUALITY.md  (project-level, unchanged)
├── LONG-TERM-ROADMAP.md, config.json                 (project-level, unchanged)
├── milestones/
│   ├── {milestone}/                                   ← e.g., v0.2.1
│   │   ├── phases/
│   │   │   └── {NN}-{name}/
│   │   │       ├── {NN}-{MM}-PLAN.md
│   │   │       ├── {NN}-{MM}-SUMMARY.md
│   │   │       ├── {NN}-RESEARCH.md
│   │   │       ├── {NN}-CONTEXT.md
│   │   │       ├── {NN}-EVAL.md
│   │   │       └── {NN}-VERIFICATION.md
│   │   ├── research/                                  ← milestone-scoped research
│   │   │   ├── LANDSCAPE.md
│   │   │   ├── PAPERS.md
│   │   │   ├── deep-dives/
│   │   │   └── ...
│   │   ├── codebase/                                  ← milestone-scoped codebase analysis
│   │   └── todos/                                     ← milestone-scoped todos
│   │       ├── pending/
│   │       └── completed/
│   └── anonymous/                                     ← operations without a milestone
│       ├── quick/
│       │   └── {N}-{slug}/
│       │       └── {N}-SUMMARY.md
│       ├── research/                                  ← project-level research
│       └── todos/
│           ├── pending/
│           └── completed/
```

## Requirements

### Path Resolution Module (lib/paths.js)

| ID | Requirement | Priority | Category |
|----|-------------|----------|----------|
| REQ-46 | Create `lib/paths.js` module with centralized path resolution for all `.planning/` subdirectories | P0 | Architecture |
| REQ-47 | `paths.js` must accept `cwd` and `milestone` parameters, defaulting milestone to current active milestone from STATE.md or "anonymous" | P0 | Architecture |
| REQ-48 | `paths.js` must export functions: `phasesDir(cwd, milestone)`, `phaseDir(cwd, milestone, phaseDirName)`, `researchDir(cwd, milestone)`, `codebaseDir(cwd, milestone)`, `todosDir(cwd, milestone)`, `quickDir(cwd)`, `milestonesDir(cwd)` | P0 | Architecture |
| REQ-49 | `paths.js` must provide `currentMilestone(cwd)` that reads STATE.md to determine the active milestone name or returns "anonymous" | P0 | Architecture |
| REQ-50 | `paths.js` must provide backward-compatible `archivedPhasesDir(cwd, version)` for reading archived milestone data (currently `.planning/milestones/{version}-phases/`) | P1 | Compatibility |

### lib/ Module Migration

| ID | Requirement | Priority | Category |
|----|-------------|----------|----------|
| REQ-51 | Replace all hardcoded `.planning/phases/` path constructions in lib/phase.js with `paths.js` calls | P0 | Migration |
| REQ-52 | Replace all hardcoded `.planning/phases/` path constructions in lib/commands.js with `paths.js` calls | P0 | Migration |
| REQ-53 | Replace all hardcoded `.planning/` subdirectory paths in lib/context.js with `paths.js` calls (phases, quick, research, codebase, todos) | P0 | Migration |
| REQ-54 | Replace all hardcoded paths in lib/utils.js (`findPhaseInternal`), lib/scaffold.js, lib/cleanup.js, lib/gates.js, lib/roadmap.js, lib/state.js, lib/tracker.js, lib/verify.js with `paths.js` calls | P0 | Migration |
| REQ-55 | Update bin/postinstall.js `DIRECTORIES` array to use new hierarchy | P0 | Migration |
| REQ-56 | All init functions in lib/context.js must output milestone-scoped paths in their JSON (e.g., `phases_dir`, `research_dir`, `codebase_dir`, `quick_dir`, `todos_dir`) | P0 | Migration |

### Command & Agent Markdown Migration

| ID | Requirement | Priority | Category |
|----|-------------|----------|----------|
| REQ-57 | Update all 20+ command markdown files to reference milestone-scoped paths (consume paths from init context rather than hardcoded strings) | P0 | Migration |
| REQ-58 | Update all 14+ agent markdown files to reference milestone-scoped paths | P0 | Migration |

### Milestone Archive Simplification

| ID | Requirement | Priority | Category |
|----|-------------|----------|----------|
| REQ-59 | Simplify `cmdMilestoneComplete` archive logic — since phases are already under `.planning/milestones/{version}/phases/`, milestone completion no longer needs to copy/move phase directories | P1 | Simplification |
| REQ-60 | On milestone completion, mark the milestone directory as archived (e.g., rename to `{version}-archived/` or add a metadata marker) so active vs completed milestones are distinguishable | P1 | Simplification |

### Migration Script & Backward Compatibility

| ID | Requirement | Priority | Category |
|----|-------------|----------|----------|
| REQ-61 | Provide a `grd-tools migrate-dirs` command that moves existing `.planning/phases/`, `.planning/quick/`, `.planning/research/`, `.planning/codebase/`, `.planning/todos/` to the new hierarchy | P0 | Migration |
| REQ-62 | Migration must be idempotent — running twice produces same result | P1 | Migration |
| REQ-63 | Migration must detect and use the current milestone from STATE.md for placing active phases | P0 | Migration |

### Test Updates

| ID | Requirement | Priority | Category |
|----|-------------|----------|----------|
| REQ-64 | Update all unit tests that construct `.planning/phases/` paths to use new hierarchy | P0 | Testing |
| REQ-65 | Update all integration/golden tests to use new hierarchy | P0 | Testing |
| REQ-66 | All 1,577 existing tests must pass after migration (zero regressions) | P0 | Testing |
| REQ-67 | Add tests for `lib/paths.js` with >90% coverage | P0 | Testing |

### Documentation

| ID | Requirement | Priority | Category |
|----|-------------|----------|----------|
| REQ-68 | Update CLAUDE.md "Planning Directory" section with new hierarchy | P1 | Documentation |
| REQ-69 | Update any docs/ files that reference old directory structure | P1 | Documentation |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| REQ-46 | Phase 32 | Pending |
| REQ-47 | Phase 32 | Pending |
| REQ-48 | Phase 32 | Pending |
| REQ-49 | Phase 32 | Pending |
| REQ-50 | Phase 32 | Pending |
| REQ-51 | Phase 33 | Pending |
| REQ-52 | Phase 33 | Pending |
| REQ-53 | Phase 33 | Pending |
| REQ-54 | Phase 33 | Pending |
| REQ-55 | Phase 33 | Pending |
| REQ-56 | Phase 33 | Pending |
| REQ-57 | Phase 34 | Pending |
| REQ-58 | Phase 34 | Pending |
| REQ-59 | Phase 35 | Pending |
| REQ-60 | Phase 35 | Pending |
| REQ-61 | Phase 35 | Pending |
| REQ-62 | Phase 35 | Pending |
| REQ-63 | Phase 35 | Pending |
| REQ-64 | Phase 36 | Pending |
| REQ-65 | Phase 36 | Pending |
| REQ-66 | Phase 36 | Pending |
| REQ-67 | Phase 32 | Pending |
| REQ-68 | Phase 36 | Pending |
| REQ-69 | Phase 36 | Pending |
