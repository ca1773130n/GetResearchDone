---
phase: 11-hierarchical-roadmap-schema-commands
plan: 01
subsystem: long-term-roadmap
tags: [parsing, validation, generation, mode-detection, now-next-later]
dependency-graph:
  requires: [lib/frontmatter.js, lib/utils.js]
  provides: [lib/long-term-roadmap.js]
  affects: [.planning/LONG-TERM-ROADMAP.md]
tech-stack:
  added: [Now-Next-Later framework]
  patterns: [section-based markdown parsing, tier-based validation, round-trip generation]
key-files:
  created:
    - lib/long-term-roadmap.js
    - tests/unit/long-term-roadmap.test.js
  modified: []
decisions:
  - "Used extractFrontmatter from lib/frontmatter.js for YAML parsing (consistency with existing codebase)"
  - "Later milestones: success_criteria is optional (warning, not error) per research recommendation"
  - "getPlanningMode reads frontmatter for explicit override, allowing users to opt-out of hierarchical mode"
metrics:
  duration: 4min
  completed: 2026-02-16
---

# Phase 11 Plan 01: Long-Term Roadmap Schema & Parsing Summary

LONG-TERM-ROADMAP.md parsing module with Now/Next/Later tier extraction, schema validation, round-trip generation, display formatting, and filesystem-based planning mode detection.

## What Was Done

### Task 1: RED -- Failing tests for long-term-roadmap module
**Commit:** `65d7fcf`

Wrote 32 test cases across 5 describe blocks in `tests/unit/long-term-roadmap.test.js`:

1. **parseLongTermRoadmap** (8 tests) -- Frontmatter extraction, Now/Next/Later milestone parsing, empty sections, non-roadmap content, minimal roadmap, refinement history table
2. **validateLongTermRoadmap** (7 tests) -- Valid passes, missing Now fails, missing goal fails (Now and Next), Later missing success_criteria warns, milestone count soft limit, missing project fails
3. **getPlanningMode** (4 tests) -- Hierarchical when file exists, progressive when absent, progressive when .planning/ missing, respects frontmatter override
4. **generateLongTermRoadmap** (8 tests) -- YAML frontmatter, Now/Next/Later sections, refinement history, round-trip, default horizon, single milestone
5. **formatLongTermRoadmap** (5 tests) -- Tier indicators, version/name/status, dependency info, project name, empty tiers

All tests failed as expected (module did not exist).

### Task 2: GREEN -- Implement lib/long-term-roadmap.js
**Commit:** `b71be89`

Implemented 5 exported functions in 705 lines:

- **parseLongTermRoadmap(content)** -- Section-based markdown parser using regex to isolate tier headings, then extract bold fields, bullet lists, numbered lists, and paragraphs within each milestone subsection
- **validateLongTermRoadmap(parsed)** -- Schema validation with errors (required fields) and warnings (optional fields, soft limits)
- **getPlanningMode(cwd)** -- Filesystem check for `.planning/LONG-TERM-ROADMAP.md` with frontmatter override support
- **generateLongTermRoadmap(milestones, projectName, planningHorizon)** -- Produces complete LONG-TERM-ROADMAP.md with YAML frontmatter, tiered sections, dependency graph, and refinement history
- **formatLongTermRoadmap(parsed)** -- Human-readable display with `[Now]`/`[Next]`/`[Later]` tier labels and dependency summary

Internal helpers: `extractSection`, `extractBoldField`, `extractBulletList`, `extractNumberedList`, `extractParagraph`, `extractVersion`, `parseNowMilestone`, `parseTierMilestones`, `parseRefinementHistory`.

## Verification Results

- **Level 1 (Sanity):** Module exports all 5 expected functions, tests compile and run, no crashes
- **Level 2 (Proxy):** All 32 tests pass; round-trip test confirms generate-then-parse integrity; full suite passes with 722 total tests and zero regressions
- **Level 3 (Deferred):** DEFER-11-01 -- Long-term roadmap round-trip integrity in real project workflows (validates at Phase 15)

## Deviations from Plan

None -- plan executed exactly as written.

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| long-term-roadmap.test.js | 32 | All PASS |
| Full suite | 722 | All PASS (0 regressions) |

## Self-Check: PASSED

All artifacts verified:
- `lib/long-term-roadmap.js` -- FOUND (705 lines)
- `tests/unit/long-term-roadmap.test.js` -- FOUND (676 lines)
- Commit `65d7fcf` (RED tests) -- FOUND
- Commit `b71be89` (GREEN implementation) -- FOUND
