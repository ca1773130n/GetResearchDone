---
phase: 95-agentic-knowledge-enhancement
plan: 01
subsystem: knowledge
tags: [knowledge-miner, knowhow, types, lib]

requires: []
provides:
  - KnowhowEntry interface in lib/types.ts (six fields)
  - lib/knowledge.ts module with four core functions
  - agents/grd-knowledge-miner.md agent definition
affects: [95-02, 95-03, lib/knowledge.ts, agents/grd-knowledge-miner.md]

tech-stack:
  added: []
  patterns:
    - "CommonJS module pattern: 'use strict', typed fs/path requires, module.exports"
    - "Markdown split on level-3 headings for lossless parse-format roundtrip"
    - "Map-based deduplication by primary key before write-back"

key-files:
  created:
    - lib/knowledge.ts
    - agents/grd-knowledge-miner.md
  modified:
    - lib/types.ts

key-decisions:
  - "formatKnowhowEntry uses dash-list with bold-key format to match existing KNOWHOW.md conventions and enable regex parsing"
  - "appendKnowhowEntries deduplicates by phase_number (keep higher) rather than created_at for stability"
  - "selectTopEntries applies module hint boost within same-phase bucket, not as a full secondary key"
  - "agent effort set to low / maxTurns 15 — mining is analysis, not implementation"

patterns-established:
  - "KnowhowEntry parse-format roundtrip: split on '### ', regex-extract '- **field:** value' lines"
  - "KNOWHOW-ENTRY / END-KNOWHOW-ENTRY delimiters for agent output parsing in plan 95-03"

duration: 2min
completed: 2026-03-24
---

# Phase 95 Plan 01: Knowledge Types, Module, and Miner Agent Summary

**KnowhowEntry data model, lib/knowledge.ts CRUD module, and grd-knowledge-miner agent definition enabling structured phase knowledge extraction for REQ-190/191.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-24T17:47:11Z
- **Completed:** 2026-03-24T17:49:30Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- Added `KnowhowEntry` interface to `lib/types.ts` with all six required fields (pattern_name, source, applicability, code_snippet, phase_number, created_at)
- Created `lib/knowledge.ts` with four exported functions: `parseKnowhowEntries`, `formatKnowhowEntry`, `appendKnowhowEntries`, `selectTopEntries` — build and lint pass, runtime exports verified
- Created `agents/grd-knowledge-miner.md` with `<mining_heuristics>`, `<output_format>` (KNOWHOW-ENTRY blocks), `<inputs>`, and `<constraints>` sections

## Task Commits

1. **Task 1: Add KnowhowEntry interface to lib/types.ts** - `8f3ef7a` (feat)
2. **Task 2: Create lib/knowledge.ts with four core functions** - `de29818` (feat)
3. **Task 3: Create agents/grd-knowledge-miner.md agent definition** - `01219a8` (feat)

## Files Created/Modified

- `lib/types.ts` - Added `KnowhowEntry` interface in new Knowledge Types section
- `lib/knowledge.ts` - New 205-line module with formatKnowhowEntry, parseKnowhowEntries, appendKnowhowEntries, selectTopEntries
- `agents/grd-knowledge-miner.md` - New post-phase mining agent with structured output format

## Decisions Made

- `formatKnowhowEntry` uses `- **field:** value` format matching the project's existing markdown conventions; the `parseKnowhowEntries` regex `- \*\*(\w+):\*\* (.*)` enables lossless roundtrip.
- `appendKnowhowEntries` deduplication keeps the entry with the higher `phase_number` (not `created_at`) so that entries from later phases always win over earlier ones.
- `selectTopEntries` module hint boost is applied within same-phase buckets only — entries from a more recent phase always outrank entries from an older phase, regardless of module relevance.
- Agent frontmatter: `effort: low`, `maxTurns: 15` — mining is analytical work, not implementation, so a low-effort agent with a tight turn budget is appropriate.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The `node -e` invocation in the verification step requires `node -r tsx/cjs` (not bare `node`) because the project uses `.ts` files that need `tsx` at runtime — this is consistent with how all other lib/ modules are loaded.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 95-02 (agent injection into grd-planner and grd-phase-researcher) and plan 95-03 (pipeline integration into execute-phase hook) can proceed. Both depend on:
- `KnowhowEntry` interface from `lib/types.ts` — available
- `lib/knowledge.ts` module exports — available
- `agents/grd-knowledge-miner.md` — available

---
*Phase: 95-agentic-knowledge-enhancement*
*Completed: 2026-03-24*

## Self-Check: PASSED

All files, commits, and exports verified.
