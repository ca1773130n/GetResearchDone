---
phase: 38-core-git-workflow-revision
wave: 1
plans_reviewed: [38-01]
timestamp: 2026-02-21T12:00:00Z
blockers: 0
warnings: 1
info: 3
verdict: warnings_only
---

# Code Review: Phase 38 Wave 1

## Verdict: WARNINGS ONLY

Plan 38-01 is fully implemented with all 3 tasks completed, 1,650 tests passing, and zero lint errors. One warning for files modified beyond the plan's declared scope (properly documented as deviations).

## Stage 1: Spec Compliance

### Plan Alignment

All 3 plan tasks have corresponding commits:

| Task | Commit | Status |
|------|--------|--------|
| Task 1: Config schema consolidation and project-local worktree_dir | `8b301ff` | Complete |
| Task 2: Project-local worktree paths and .gitignore injection | `6109d89` | Complete |
| Task 3: Milestone branch helpers and strategy-aware PR targeting | `9dc875f` | Complete |

**must_haves.truths verification:**

1. "loadConfig returns git-related fields from both top-level legacy keys AND nested git.* section" -- VERIFIED. `lib/utils.js` line 136-142 implements `get()` with nested section fallback. Test at `tests/unit/utils.test.js` line 375-398 and 400-413 confirm both nested reading and top-level precedence.

2. "loadConfig returns a new worktree_dir field (default .worktrees/)" -- VERIFIED. Default at line 111, returned at line 169-170. Test at line 415-418 confirms default.

3. "worktreePath() returns project-local .worktrees/{milestone}-{phase}" -- VERIFIED. `lib/worktree.js` line 34-38 uses `path.resolve(cwd, worktreeDir, ...)`. Test at `tests/unit/worktree.test.js` line 164-176 confirms path structure.

4. "getGrdWorktrees() finds worktrees in project-local .worktrees/ directory" -- VERIFIED. `lib/worktree.js` line 118-138 filters by `wtDir = path.resolve(cwd, config.worktree_dir)`.

5. "ensureGitignoreEntry(cwd, entry) helper adds .worktrees/ to .gitignore" -- VERIFIED. `lib/worktree.js` line 147-167. Tests at lines 628-669 cover creation, append, idempotency, and trailing slash normalization.

6. "createMilestoneBranch(cwd, milestone, slug) creates milestone branch from base_branch" -- VERIFIED. `lib/worktree.js` line 502-537. Tests at lines 965-1017 cover create, error on wrong branch, idempotency, and custom template.

7. "worktreeBranch and cmdWorktreePushAndPR resolve PR target based on branching_strategy" -- VERIFIED. `resolveTargetBranch` at line 551-563. `cmdWorktreePushAndPR` at line 431-433 uses `resolveTargetBranch`. Test at line 924-961 confirms milestone strategy targets milestone branch.

8. "All existing tests pass with zero regressions" -- VERIFIED. Full suite: 1,650 passed, 0 failed. Lint: 0 errors.

**must_haves.artifacts verification:**

| Artifact | Path | Contains | Status |
|----------|------|----------|--------|
| loadConfig with git.* | `lib/utils.js` | `worktree_dir` | VERIFIED (line 111, 169-170) |
| Worktree helpers | `lib/worktree.js` | All 8 planned exports | VERIFIED (line 567-581) |
| Config migrated | `.planning/config.json` | `"git":` nested section | VERIFIED (line 5) |
| utils tests | `tests/unit/utils.test.js` | 3 new git.* tests | VERIFIED (lines 375-418) |
| worktree tests | `tests/unit/worktree.test.js` | 14 new tests (46 total, baseline 32) | VERIFIED |

**must_haves.key_links verification:**

| From | To | Via | Status |
|------|-----|-----|--------|
| `lib/worktree.js` | `lib/utils.js` | `loadConfig` | VERIFIED (line 19-22 imports) |
| `lib/worktree.js` | `.gitignore` | `ensureGitignoreEntry` | VERIFIED (line 230) |

No issues found.

### Research Methodology

N/A -- no research references in plans. This is a pure infrastructure refactoring phase.

### Known Pitfalls

N/A -- no KNOWHOW.md or LANDSCAPE.md exists for this milestone.

### Eval Coverage

The 38-EVAL.md defines 9 sanity checks (S1-S9). For wave 1 (Plan 01), the relevant checks are:

- **S1 (full suite zero regressions):** Coverable -- 1,650 tests pass.
- **S2 (utils.test.js new tests):** Coverable -- 90 tests (baseline 87, +3).
- **S3 (worktree.test.js path + helpers):** Coverable -- 46 tests (baseline 32, +14).
- **S6 (lint zero errors):** Coverable -- lint passes clean.
- **S7 (config.json migrated):** Coverable -- nested git section present, no top-level git keys.
- **S9 (integration suite passes):** Coverable -- integration tests updated and passing.

Checks S4, S5, S8 are Plan 02 scope (wave 2) and not applicable to this review.

No issues found.

## Stage 2: Code Quality

### Architecture

The implementation is consistent with the existing codebase patterns:

- **CommonJS modules** with `'use strict'` not required (the project does not use `'use strict'` in lib/ files -- consistent).
- **Imports** follow the established pattern: destructure from `require('./utils')`.
- **Error handling** in new helpers (`createMilestoneBranch`, `resolveTargetBranch`) returns result objects instead of calling `process.exit`, following the plan's explicit design decision for testability. This is a good pattern that should be adopted more broadly.
- **Config reading** uses the existing `get()` helper with nested section fallback, consistent with how `code_review`, `workflow`, and `execution` sections are already read.
- **No duplicate utilities** introduced. `ensureGitignoreEntry` is genuinely new functionality.

No issues found.

### Reproducibility

N/A -- no experimental code. This is deterministic infrastructure.

### Documentation

- `lib/worktree.js` module-level JSDoc updated to reflect project-local worktree paths (line 1-8).
- All new functions have JSDoc with `@param` and `@returns`.
- No paper references needed (infrastructure code).

No issues found.

### Deviation Documentation

The PLAN declared 5 files in `files_modified`. The actual diff shows 9 files. The 4 additional files are:

| File | Documented in SUMMARY? | Reason |
|------|----------------------|--------|
| `lib/context.js` | Yes (Deviation #1) | Still used `os.tmpdir()` for worktree_path |
| `lib/parallel.js` | Yes (Deviation #2) | Unused `fs`/`os` imports from old approach |
| `tests/unit/context.test.js` | Yes (Deviation #1) | Updated path assertions |
| `tests/integration/worktree-parallel-e2e.test.js` | Yes (Deviation #3) | Updated config format and path assertions |

All deviations are properly documented in SUMMARY.md with Rule 3 classification (blocking issues preventing test suite from passing), the specific issue description, fix applied, and verification status. The commit `9dc875f` bundles these cascading fixes with Task 3, which is reasonable since they were discovered during the Task 3 full test suite run.

The SUMMARY.md key-files section accurately lists all 9 modified files.

No BLOCKER issues. The plan's `files_modified` underestimated scope, but all changes were necessary cascading fixes and are properly documented.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 2 | Deviation Documentation | Plan `files_modified` declared 5 files but 9 were actually modified; all 4 additional files are documented as deviations in SUMMARY.md but the plan scope underestimated cascading impact |
| 2 | INFO | 1 | Plan Alignment | Task 3 commit `9dc875f` bundles 3 auto-fixed deviations alongside the planned task work; this is acceptable but individual deviation commits would improve git bisect granularity |
| 3 | INFO | 2 | Architecture | New `createMilestoneBranch`/`resolveTargetBranch` pattern of returning result objects instead of calling `process.exit` is a positive architectural improvement worth adopting in future helpers |
| 4 | INFO | 2 | Architecture | `lib/context.js` `cmdInitExecutePhase` now emits `worktree_path` and `worktree_branch` fields using project-local paths but does not yet emit `worktree_dir` or `target_branch` as separate fields; this may be needed by Plan 02 (wave 2) |

## Recommendations

**WARNING #1:** For future plans, include a broader `files_modified` list or add a note like "and transitively affected files" when making cross-cutting changes. The worktree path change was inherently cross-cutting -- `context.js`, `parallel.js`, and their tests were predictable cascading impact. This is not blocking because all deviations were properly documented and all tests pass.
