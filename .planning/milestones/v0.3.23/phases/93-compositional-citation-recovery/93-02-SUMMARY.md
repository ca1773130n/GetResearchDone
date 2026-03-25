---
phase: 93-compositional-citation-recovery
plan: 02
subsystem: research
tags: [citations, deep-diver, phase-researcher, agent-prompts, citation-recovery]

# Dependency graph
requires:
  - phase: 93-01
    provides: lib/citations.ts with parseMissingComponents, parseBorrowedComponents, buildCitationGraph, findUnresolved
provides:
  - grd-deep-diver agent emits structured Missing Components and Borrowed Components tables in deep-dive output
  - grd-phase-researcher agent runs citation recovery pass (Step 8) with buildCitationGraph and findUnresolved
  - Configurable citation_gate blocks planning when critical unresolved dependencies remain
affects: [grd-planner, grd-phase-researcher, grd-deep-diver, 94-graph-of-thought-synthesis]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Citation recovery pass: run buildCitationGraph + findUnresolved after research protocol, before planning"
    - "Citation gate pattern: configurable block on critical unresolved dependencies"
    - "Structured component tables: Missing (name, source_paper, description, code_available) and Borrowed (name, source_paper, description)"

key-files:
  created: []
  modified:
    - agents/grd-deep-diver.md
    - agents/grd-phase-researcher.md

key-decisions:
  - "deep-diver emits Missing Components and Borrowed Components tables in PAPERS.md output"
  - "phase-researcher runs citation recovery pass (buildCitationGraph + findUnresolved) after research protocol"
  - "citation_gate is configurable (default: disabled) — warns on critical unresolved dependencies, blocks if enabled"

patterns-established:
  - "Citation recovery: grd-tools.js buildCitationGraph + findUnresolved invoked from agent step"
  - "Component classification: Missing = needs separate impl/download; Borrowed = included with attribution"

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 93 Plan 02: Structured Component Output and Citation Recovery Pass Summary

**Updated grd-deep-diver to emit structured Missing/Borrowed Components tables and grd-phase-researcher to run a citation-recovery pass that builds the citation graph, fetches unresolved paper dependencies via arXiv/Semantic Scholar APIs, and gates planning on critical unresolved citations.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-25T02:19:23Z
- **Completed:** 2026-03-25T02:24:00Z
- **Tasks:** 2 / 2
- **Files modified:** 2

## Accomplishments

- Added `identify_component_dependencies` step to grd-deep-diver execution flow with structured Missing Components (name, source_paper, description, code_available) and Borrowed Components (name, source_paper, description) classification
- Added `## Missing Components` and `## Borrowed Components` sections to the deep-dive output format template with table structure matching `parseMissingComponents`/`parseBorrowedComponents` input format
- Added Step 8 (Citation Recovery Pass) to grd-phase-researcher execution flow: builds citation graph via `grd-tools.js buildCitationGraph`, finds unresolved nodes via `findUnresolved`, fetches missing papers via arXiv and Semantic Scholar APIs, updates citation graph, and applies configurable `citation_gate` check
- Added `## Citation Recovery` section to RESEARCH.md output template with gate status tracking
- Updated success criteria in both agents to include component and citation recovery checklist items

## Task Commits

Each task was committed atomically (as part of the prior phase 93 branch execution and merged via feat(93)):

1. **Task 1: Add structured component output to grd-deep-diver agent** - `7d6c82c` (feat(93): merge citation recovery code)
2. **Task 2: Add citation-recovery pass to grd-phase-researcher agent** - `7d6c82c` (feat(93): merge citation recovery code)

**Plan metadata:** See final docs commit below.

## Files Created/Modified

- `agents/grd-deep-diver.md` - Added `identify_component_dependencies` execution step, `## Missing Components` and `## Borrowed Components` output sections, updated success criteria
- `agents/grd-phase-researcher.md` - Added Step 8 Citation Recovery Pass, `## Citation Recovery` RESEARCH.md section, updated success criteria and structured return

## Decisions Made

- `citation_gate` is disabled by default — warns on critical unresolved dependencies but does not block; can be enabled in `.planning/config.json`
- deep-diver step placed after `score_recommendation` to allow verdict-first presentation; components tables follow verdict in output
- phase-researcher runs citation recovery after RESEARCH.md is written (Step 8) so that research content drives which papers need resolution

## Deviations from Plan

None - plan executed exactly as written (content pre-existed in the codebase from prior branch execution that was merged into main).

## Issues Encountered

None — both agent files already contained the required content from the prior worktree execution merged via `feat(93): merge citation recovery code from phase 93 branch (plans 01-02)` (commit `7d6c82c`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 93 plan 03 (if exists) or phase 94 Graph-of-Thought Synthesis can proceed
- `lib/citations.ts` provides `buildCitationGraph`, `findUnresolved`, `parseMissingComponents`, `parseBorrowedComponents`
- Agent prompts instruct agents to use these functions via `grd-tools.js` CLI interface
- Citation gate infrastructure is in place; enablement is a config change

---
*Phase: 93-compositional-citation-recovery*
*Completed: 2026-03-25*
