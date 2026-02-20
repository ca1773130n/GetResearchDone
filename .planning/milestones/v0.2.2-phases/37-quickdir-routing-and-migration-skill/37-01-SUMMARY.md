---
phase: 37-quickdir-routing-and-migration-skill
plan: 01
subsystem: paths, commands, skills
tags: [bugfix, quickDir, migration, paths.js, commands.js, REQ-70, REQ-71, REQ-72]

requires: []
provides:
  - quickDir() accepts optional milestone parameter (REQ-70)
  - cmdMigrateDirs routes quick/ to current milestone (REQ-71)
  - /grd:migrate skill and grd-migrator agent for user-facing migration (REQ-72)
  - All 1,634 tests passing with zero regressions
affects: []

tech-stack:
  added: []
  patterns:
    - "quickDir signature now matches phasesDir/researchDir/todosDir/codebaseDir"

key-files:
  created:
    - commands/migrate.md
    - agents/grd-migrator.md
  modified:
    - lib/paths.js
    - lib/commands.js
    - tests/unit/paths.test.js
    - tests/unit/commands.test.js

key-decisions:
  - "quickDir() now takes optional milestone param, defaulting to currentMilestone(cwd) — consistent with all other dir functions"
  - "cmdMigrateDirs quick/ target changed from hardcoded 'anonymous' to milestone variable"
  - "/grd:migrate skill classifies items as trivial (CLI) vs complex (agent) for proper handling"
  - "grd-migrator agent handles flat milestone files, legacy phase dirs, orphan docs"

metrics:
  duration: 8min
  completed: 2026-02-20
---

# Phase 37 Plan 01: Fix quickDir Routing + Migration Skill Summary

Fixed three bugs from v0.2.1: quickDir() now uses currentMilestone(cwd) instead of hardcoded 'anonymous', cmdMigrateDirs routes quick/ to the current milestone, and created /grd:migrate skill with grd-migrator agent for complex migration scenarios.

## Changes

### Bug 1: quickDir() routing (lib/paths.js)
- Added optional `milestone` parameter matching the pattern of `phasesDir`, `researchDir`, `todosDir`, `codebaseDir`
- When milestone is omitted/null, calls `currentMilestone(cwd)` instead of hardcoding `'anonymous'`
- Updated JSDoc to document new parameter
- Updated 4 tests in paths.test.js covering: fallback, milestone-on-disk, explicit param, anonymous fallback

### Bug 2: cmdMigrateDirs quick routing (lib/commands.js)
- Changed `{ name: 'quick', target: 'anonymous' }` to `{ name: 'quick', target: milestone }`
- Updated test to assert quick/ goes to `milestones/v1.0/quick/` (not anonymous)

### Bug 3: /grd:migrate skill + grd-migrator agent
- Created `commands/migrate.md` — scans for trivial vs complex migration items, runs CLI for trivial, spawns agent for complex
- Created `agents/grd-migrator.md` — handles flat milestone files, legacy phase dirs, orphan docs with user confirmation

## Verification

- 1,634 tests pass (32 suites, zero failures)
- ESLint clean
- 74 golden tests pass with 0 diffs
- Coverage thresholds maintained (paths.js at 97.95% statements)

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
