---
phase: 93-compositional-citation-recovery
plan: 01
subsystem: citations
tags: [citation-graph, types, data-model, REQ-182, REQ-183]
dependency_graph:
  requires: []
  provides: [CitationGraph, CitationNode, CitationEdge, MissingComponent, BorrowedComponent, ApiConfig, buildCitationGraph, parseMissingComponents, parseBorrowedComponents]
  affects: [lib/citations.ts, lib/types.ts]
tech_stack:
  added: [lib/citations.ts]
  patterns: [CommonJS-typed-require, safeReadFile-pattern, regex-multi-format-parser]
key_files:
  created: [lib/citations.ts]
  modified: [lib/types.ts]
decisions:
  - "CitationEdge uses from_slug/to_slug/type ('missing'|'borrowed')/component_name — aligns with plan must_haves.truths"
  - "CitationNode includes missing_components[] and borrowed_components[] arrays on each node"
  - "CitationNode.priority includes 'low' tier in addition to 'critical' and 'normal'"
  - "buildCitationGraph uses safeReadFile from utils.ts for robust file reading"
  - "Per-paper JSON written to {papersDir}/../citations/{slug}.json; non-fatal if write fails"
  - "parseMissingComponents supports three formats: table, structured-list (bold-key), inline-list"
metrics:
  duration: "15 minutes"
  completed: "2026-03-25"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 93 Plan 01: Citation Graph Type Definitions and buildCitationGraph Summary

Six typed interfaces and a three-function citation parsing module that reads PAPERS.md files, builds a directed dependency graph from `missing_components` and `borrowed_components` sections, and persists per-paper JSON to a `citations/` directory.

## Objective

Create `lib/citations.ts` with citation graph data structures and `buildCitationGraph()` function that parses PAPERS.md files and constructs a dependency graph. Satisfy REQ-182 (Deep-Diver Structured Output — data model) and REQ-183 (Citation Graph Storage — graph construction).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add citation graph type definitions to lib/types.ts | d363279 | lib/types.ts |
| 2 | Create lib/citations.ts with buildCitationGraph function | 502d12c | lib/citations.ts |

## What Was Built

### lib/types.ts — Six new interfaces

- **MissingComponent** — `name`, `source_paper`, `description`, `code_available`
- **BorrowedComponent** — `name`, `source_paper`, `description`
- **CitationNode** — `slug`, `title`, `resolved`, `priority` (`'critical'|'normal'|'low'`), `technique_summary`, `missing_components[]`, `borrowed_components[]`
- **CitationEdge** — `from_slug`, `to_slug`, `type` (`'missing'|'borrowed'`), `component_name`
- **CitationGraph** — `nodes[]`, `edges[]`, `built_at` (ISO timestamp)
- **ApiConfig** — `arxiv_enabled`, `semantic_scholar_enabled`, `timeout_ms`, `fetchFn`

### lib/citations.ts — Three exported functions

**parseMissingComponents(content: string): MissingComponent[]**
- Supports three PAPERS.md formats: markdown table, structured bold-key list, inline list with parenthetical source/code
- Extracts the `## Missing Components` section via regex, falls through formats in order

**parseBorrowedComponents(content: string): BorrowedComponent[]**
- Mirrors parseMissingComponents without the `code_available` field
- Same three-format support

**buildCitationGraph(papersDir: string): CitationGraph**
- Reads all `.md` files in `papersDir` via `safeReadFile`
- Builds `CitationNode` for each source paper with full component arrays
- Builds `CitationNode` for each dependency paper (referenced via `source_paper`)
- Priority escalation: `code_available=false` on `MissingComponent` sets dep node `priority='critical'`
- Emits `CitationEdge` with `type: 'missing'` or `'borrowed'` and `component_name`
- Writes `{papersDir}/../citations/{slug}.json` for each node (non-fatal if write fails)
- Returns `CitationGraph` with `built_at` ISO timestamp

## Verification

```
npm run build:check  → PASS (tsc --noEmit, zero errors)
npm run lint         → PASS (eslint bin/ lib/, zero warnings)
node exports check   → buildCitationGraph,parseBorrowedComponents,parseMissingComponents
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated schema to match plan must_haves.truths exactly**
- **Found during:** Task 1 review
- **Issue:** Existing `CitationEdge` used `from`/`to`/`relation` fields; plan specifies `from_slug`/`to_slug`/`type`; existing `CitationNode` lacked `missing_components[]` and `borrowed_components[]` arrays and `'low'` priority tier
- **Fix:** Rewrote citation types section of `lib/types.ts` and updated `lib/citations.ts` to use the plan-specified schema
- **Files modified:** `lib/types.ts`, `lib/citations.ts`
- **Commits:** d363279, 502d12c

## Self-Check

- [x] `lib/types.ts` — updated with 6 citation interfaces
- [x] `lib/citations.ts` — 290+ lines, exports 3 functions
- [x] `npm run build:check` — PASS
- [x] `npm run lint` — PASS
- [x] Module exports: `buildCitationGraph,parseBorrowedComponents,parseMissingComponents`

## Self-Check: PASSED
