---
phase: 35-migration-script-and-archive-simplification
plan: 01
subsystem: infra
tags: [migration, milestone-scoping, tdd, filesystem]

# Dependency graph
requires:
  - "lib/paths.js -- currentMilestone() for milestone detection"
provides:
  - "lib/commands.js -- cmdMigrateDirs function for old-to-new directory migration"
  - "tests/unit/commands.test.js -- 10 TDD tests covering REQ-61, REQ-62, REQ-63"
affects: [35-02-archive-simplification, 36-integration-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Content-based migration: copies individual entries then removes source, leaving empty old dirs for backward compat"
    - "Merge-safe migration: skips entries that already exist at target to prevent data loss"
    - "Milestone-routed migration: quick/ always routes to anonymous, everything else to currentMilestone()"

key-files:
  created: []
  modified:
    - lib/commands.js
    - tests/unit/commands.test.js

key-decisions:
  - "cmdMigrateDirs uses currentMilestone() from paths.js for target milestone detection"
  - "Old directories left empty after migration (not deleted) for backward compat during transition"
  - "Merge strategy: skip entries that already exist at destination rather than overwrite"
  - "quick/ always routes to milestones/anonymous/quick/ regardless of active milestone"

patterns-established:
  - "Migration function pattern: detect milestone, build migration map, move with merge, report results"
  - "Idempotency via empty-directory detection: if all old dirs are empty/missing, already_migrated=true"

# Metrics
duration: 3min
completed: 2026-02-20
---

# Phase 35 Plan 01: Migration Script Implementation Summary

**cmdMigrateDirs function migrating 5 old-style .planning/ subdirectories to milestone-scoped hierarchy with merge-safe idempotent behavior, verified by 10 TDD tests**

## Performance

- **Duration:** 3 min
- **Tasks completed:** 2/2
- **Tests added:** 10 (195 total in commands.test.js)

## Task Summary

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Write failing tests for cmdMigrateDirs | bf517ee | 10 TDD tests covering migration, idempotency, milestone detection, merging |
| 2 | Implement cmdMigrateDirs and make tests pass | 9264842 | cmdMigrateDirs function in lib/commands.js, all 10 tests green |

## Implementation Details

### cmdMigrateDirs(cwd, raw)

Migrates 5 old-style `.planning/` subdirectories to the milestone-scoped hierarchy:

| Source | Target | Routing |
|--------|--------|---------|
| `.planning/phases/` | `.planning/milestones/{milestone}/phases/` | currentMilestone() |
| `.planning/research/` | `.planning/milestones/{milestone}/research/` | currentMilestone() |
| `.planning/codebase/` | `.planning/milestones/{milestone}/codebase/` | currentMilestone() |
| `.planning/todos/` | `.planning/milestones/{milestone}/todos/` | currentMilestone() |
| `.planning/quick/` | `.planning/milestones/anonymous/quick/` | Always anonymous |

**Key behaviors:**
- Uses `currentMilestone(cwd)` from `lib/paths.js` for target detection (REQ-63)
- Copies entries recursively then removes source entries (not source directories)
- Merges into existing target directories without overwriting (prevents data loss)
- Idempotent: second run detects empty old dirs and returns `already_migrated: true` (REQ-62)
- Creates milestone directory structure if it does not yet exist

**Output JSON:**
```json
{
  "milestone": "v1.0",
  "moved_directories": [{ "from": "phases", "to": "milestones/v1.0/phases", "entries_moved": 2 }],
  "skipped": ["codebase"],
  "already_migrated": false,
  "errors": []
}
```

## Verification Results

| Level | Check | Status |
|-------|-------|--------|
| 1 (Sanity) | cmdMigrateDirs exported from lib/commands.js | PASS |
| 2 (Proxy) | All 10 TDD tests pass (migration, idempotency, milestone detection, merging) | PASS |
| 3 (Deferred) | Full CLI integration test with grd-tools invocation | Phase 36 |

## Requirements Satisfied

| REQ | Description | Evidence |
|-----|-------------|----------|
| REQ-61 | Migrate command moves old-style dirs to milestone hierarchy | Tests 1-5, 8 |
| REQ-62 | Migration is idempotent (second run is no-op) | Test 6 |
| REQ-63 | Uses currentMilestone() for target detection | Tests 1-5, 8 |

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

- [x] `lib/commands.js` exists and exports cmdMigrateDirs
- [x] `tests/unit/commands.test.js` contains 10 cmdMigrateDirs tests
- [x] Commit bf517ee exists (test RED)
- [x] Commit 9264842 exists (implementation GREEN)
- [x] All 195 tests pass (no regressions)
