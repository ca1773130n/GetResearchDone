---
phase: 11-hierarchical-roadmap-schema-commands
plan: 02
subsystem: long-term-roadmap-cli
tags: [cli, commands, parse, validate, display, mode, generate]
dependency-graph:
  requires: [lib/long-term-roadmap.js, lib/utils.js]
  provides: [cmdLongTermRoadmap in lib/commands.js, long-term-roadmap CLI route in bin/grd-tools.js]
  affects: [bin/grd-tools.js, lib/commands.js, tests/unit/commands.test.js]
tech-stack:
  added: []
  patterns: [multi-subcommand CLI dispatch, flag parsing in args array, round-trip verification]
key-files:
  created: []
  modified:
    - lib/commands.js
    - bin/grd-tools.js
    - tests/unit/commands.test.js
decisions:
  - "Implemented local flag() helper in commands.js for --flag parsing in generate subcommand args"
  - "Raw mode for parse outputs milestone count summary; display outputs formatted text directly"
metrics:
  duration: 4min
  completed: 2026-02-16
---

# Phase 11 Plan 02: Long-Term Roadmap CLI Commands Summary

`cmdLongTermRoadmap` with 5 subcommands (parse, validate, display, mode, generate) wired into bin/grd-tools.js, exposing the long-term-roadmap module via CLI for orchestrator agents.

## What Was Done

### Task 1: Implement cmdLongTermRoadmap and wire CLI route
**Commit:** `1aea0e3`

Added `cmdLongTermRoadmap(cwd, subcommand, args, raw)` to `lib/commands.js` with 5 subcommands:

1. **parse** -- Reads LONG-TERM-ROADMAP.md (default or custom path), parses via `parseLongTermRoadmap()`, outputs structured JSON with `now`, `next`, `later`, `frontmatter` fields. Raw mode: milestone count summary.
2. **validate** -- Parses then validates via `validateLongTermRoadmap()`, outputs `{ valid, errors, warnings }`. Raw mode: 'valid' or 'invalid: {errors}'.
3. **display** -- Parses then formats via `formatLongTermRoadmap()`, outputs `{ formatted, milestone_count, mode }`. Raw mode: formatted text with `[Now]`/`[Next]`/`[Later]` tier labels.
4. **mode** -- Calls `getPlanningMode(cwd)`, checks filesystem for file existence, outputs `{ mode, long_term_roadmap_exists }`. Raw mode: mode string.
5. **generate** -- Parses `--project`, `--horizon`, `--milestones` flags, calls `generateLongTermRoadmap()`, outputs `{ content, path }`. Raw mode: generated markdown.

Wired `long-term-roadmap` route in `bin/grd-tools.js` switch statement with subcommand dispatch. Updated usage string.

### Task 2: Add comprehensive tests for long-term-roadmap CLI commands
**Commit:** `02d74f1`

Added 22 test cases in `tests/unit/commands.test.js` under `describe('cmdLongTermRoadmap')`:

1. **parse** (4 tests) -- Correct structure parsing, missing file error, custom path, raw mode summary
2. **validate** (3 tests) -- Valid returns true, invalid returns errors, raw mode string output
3. **display** (3 tests) -- Formatted with tier labels, missing file error, raw mode text
4. **mode** (4 tests) -- Hierarchical when file exists, progressive when absent, frontmatter override, raw mode
5. **generate** (4 tests) -- Valid generation, round-trip through parse+validate, missing milestones error, raw mode markdown
6. **edge cases** (4 tests) -- Unknown subcommand error, validate with missing file, relative path resolution, invalid JSON error

## Verification Results

- **Level 1 (Sanity):** CLI command exists and responds to all 5 subcommands without crashes
- **Level 2 (Proxy):** `node bin/grd-tools.js long-term-roadmap mode` returns valid JSON with mode field; all 744 tests pass (722 baseline + 22 new) with zero regressions; round-trip test (generate -> parse -> validate) passes
- **Level 3 (Deferred):** End-to-end `/grd:long-term-roadmap` wizard flow (create -> display -> refine) in real project (Phase 15)

## Deviations from Plan

None -- plan executed exactly as written.

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| cmdLongTermRoadmap (commands.test.js) | 22 | All PASS |
| Full suite | 744 | All PASS (0 regressions) |

## Self-Check: PASSED

All artifacts verified:
- `lib/commands.js` -- FOUND, contains `cmdLongTermRoadmap`
- `bin/grd-tools.js` -- FOUND, contains `long-term-roadmap` route
- `tests/unit/commands.test.js` -- FOUND, contains `cmdLongTermRoadmap` tests
- Commit `1aea0e3` (implementation) -- FOUND
- Commit `02d74f1` (tests) -- FOUND
