---
phase: 38-core-git-workflow-revision
plan: 01
subsystem: infra
tags: [git, worktree, config, branching, gitignore]

# Dependency graph
requires: []
provides:
  - "loadConfig with nested git.* section support and worktree_dir default"
  - "Project-local worktree paths under .worktrees/{milestone}-{phase}"
  - "ensureGitignoreEntry helper for .gitignore auto-injection"
  - "createMilestoneBranch with HEAD verification"
  - "resolveTargetBranch for strategy-aware PR targeting"
  - "Migrated .planning/config.json to nested git section"
affects: [38-02, phase-39, execute-phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nested config section with top-level precedence fallback"
    - "Project-local worktree directory instead of tmpdir"
    - "Strategy-aware PR target resolution (phase vs milestone vs none)"

key-files:
  created: []
  modified:
    - lib/utils.js
    - lib/worktree.js
    - lib/context.js
    - lib/parallel.js
    - .planning/config.json
    - tests/unit/utils.test.js
    - tests/unit/worktree.test.js
    - tests/unit/context.test.js
    - tests/integration/worktree-parallel-e2e.test.js

key-decisions:
  - "Project-local .worktrees/ directory replaces tmpdir-based worktree locations"
  - "Nested git config section with backward-compatible top-level key precedence"
  - "createMilestoneBranch and resolveTargetBranch return result objects (no process.exit), making them testable"

patterns-established:
  - "Config migration pattern: nested section with top-level fallback via get() helper"
  - "Git helper functions return result objects instead of calling output()/error() for testability"

# Metrics
duration: 25min
completed: 2026-02-20
---

# Phase 38 Plan 01: Config Schema & Worktree Path Migration Summary

**Consolidated git config into nested section, migrated worktrees from tmpdir to project-local `.worktrees/`, added .gitignore injection, and implemented milestone branch helpers with strategy-aware PR targeting across 9 files with zero test regressions.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-02-20T16:10:00Z
- **Completed:** 2026-02-20T16:39:29Z
- **Tasks:** 3/3 completed
- **Files modified:** 9

## Accomplishments

- Migrated `.planning/config.json` from flat git keys to nested `git` section with full backward compatibility (top-level keys take precedence)
- Replaced tmpdir-based worktree paths (`/tmp/grd-worktree-*`) with project-local `.worktrees/{milestone}-{phase}` across the entire codebase (lib, context, parallel, tests)
- Added `.gitignore` auto-injection (`ensureGitignoreEntry`) to prevent committing worktree directories
- Implemented `createMilestoneBranch()` with HEAD verification (must be on base_branch) and idempotent creation
- Implemented `resolveTargetBranch()` for strategy-aware PR targeting: milestone strategy targets milestone branch, phase/none strategy targets base_branch
- Updated `cmdWorktreePushAndPR` to use strategy-aware target resolution instead of hardcoded `config.base_branch`
- All 1,650 tests pass with zero regressions; added 16+ new tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Config schema consolidation and project-local worktree_dir** - `8b301ff` (feat)
2. **Task 2: Project-local worktree paths and .gitignore injection** - `6109d89` (feat)
3. **Task 3: Milestone branch helpers and strategy-aware PR targeting** - `9dc875f` (feat)

## Files Created/Modified

- `lib/utils.js` - Added `worktree_dir` default and nested git section reading in loadConfig
- `lib/worktree.js` - Removed tmpdir helpers; rewrote worktreePath/parseWorktreeName/getGrdWorktrees for project-local paths; added ensureGitignoreEntry, createMilestoneBranch, resolveTargetBranch; updated cmdWorktreeCreate/Remove/PushAndPR
- `lib/context.js` - Updated worktree_path computation from tmpdir to project-local .worktrees/
- `lib/parallel.js` - Updated worktree_path computation from tmpdir to project-local .worktrees/
- `.planning/config.json` - Migrated from top-level git keys to nested `git` section
- `tests/unit/utils.test.js` - Added 3 tests: nested git section, top-level precedence, worktree_dir default
- `tests/unit/worktree.test.js` - Major rewrite for project-local paths; added tests for .gitignore injection, createMilestoneBranch, resolveTargetBranch, milestone strategy PR targeting (46 total tests)
- `tests/unit/context.test.js` - Updated worktree_path assertion from tmpdir to project-local pattern
- `tests/integration/worktree-parallel-e2e.test.js` - Updated config format, cleanup, and path assertions for project-local worktrees

## Decisions Made

1. **Project-local `.worktrees/` replaces tmpdir:** Worktrees now live inside the project directory under `.worktrees/`, making them discoverable and consistent across OS environments. The `.gitignore` auto-injection prevents accidental commits.
2. **Nested git config with backward compatibility:** The `git` section in `config.json` groups all git-related settings. Top-level keys take precedence for backward compatibility during migration.
3. **Result objects for branch helpers:** `createMilestoneBranch` and `resolveTargetBranch` return result objects instead of calling `output()`/`error()` (which invoke `process.exit`), making them directly testable without `captureOutput` wrappers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated lib/context.js worktree_path to project-local**
- **Found during:** Task 3 (full test suite run)
- **Issue:** `lib/context.js` still computed `worktree_path` using `os.tmpdir()` and `grd-worktree-` prefix, causing 1 test failure in `tests/unit/context.test.js`
- **Fix:** Changed to `path.resolve(cwd, config.worktree_dir || '.worktrees/', ...)`, removed unused `os` import
- **Files modified:** `lib/context.js`, `tests/unit/context.test.js`
- **Verification:** All context tests pass
- **Committed in:** `9dc875f` (part of Task 3 commit)

**2. [Rule 3 - Blocking] Updated lib/parallel.js worktree_path to project-local**
- **Found during:** Task 3 (full test suite run)
- **Issue:** `lib/parallel.js` used `path.resolve(cwd, config.worktree_dir || '.worktrees/', ...)` was already correct but had unused `fs` and `os` imports from the old tmpdir approach, causing lint failures
- **Fix:** Removed unused `fs` and `os` imports
- **Files modified:** `lib/parallel.js`
- **Verification:** Lint passes clean
- **Committed in:** `9dc875f` (part of Task 3 commit)

**3. [Rule 3 - Blocking] Updated integration tests for project-local worktrees**
- **Found during:** Task 3 (full test suite run)
- **Issue:** `tests/integration/worktree-parallel-e2e.test.js` used old config format (top-level git keys) and old path assertions (tmpdir-based), causing 4 test failures
- **Fix:** Updated config to nested git section, updated cleanup to scan `.worktrees/` inside repo, updated path assertions, added realpath resolution for macOS symlinks
- **Files modified:** `tests/integration/worktree-parallel-e2e.test.js`
- **Verification:** All 5 integration E2E tests pass
- **Committed in:** `9dc875f` (part of Task 3 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking issues preventing test suite from passing)
**Impact on plan:** Minimal -- these were expected cascading changes from the core worktree path migration. The plan listed `lib/worktree.js` and `tests/unit/worktree.test.js` as target files, but the path change naturally propagated to `lib/context.js`, `lib/parallel.js`, and integration tests.

## Issues Encountered

- **Pre-commit hook failure:** The worktree did not have `node_modules` installed, causing `eslint` to fail during the pre-commit hook. Fixed by running `npm install` in the worktree before the first commit.
- **macOS symlink resolution:** On macOS, `/var/folders/` is a symlink to `/private/var/folders/`. Test path comparisons required `fs.realpathSync()` to normalize paths correctly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02 (context output updates) can now consume the new config shapes and worktree paths:
- `loadConfig()` provides `worktree_dir`, all git fields from nested section
- `worktreePath()` uses project-local `.worktrees/`
- `resolveTargetBranch()` available for strategy-aware targeting
- `createMilestoneBranch()` available for milestone workflow
- All exports are stable and tested

## Self-Check: PASSED

All 9 modified/created files verified present on disk. All 3 task commits (8b301ff, 6109d89, 9dc875f) verified in git log. All 1,650 tests passing. Lint clean.

---
*Phase: 38-core-git-workflow-revision*
*Completed: 2026-02-20*
