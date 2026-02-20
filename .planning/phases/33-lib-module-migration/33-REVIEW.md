---
phase: 33-lib-module-migration
wave: all
plans_reviewed: [33-01, 33-02, 33-03, 33-04, 33-05]
timestamp: 2026-02-20T06:00:00Z
blockers: 0
warnings: 2
info: 5
verdict: warnings_only
---

# Code Review: Phase 33 (All Plans)

## Verdict: WARNINGS ONLY

Phase 33 is a comprehensive, well-executed mechanical migration. All 10 lib/ modules and bin/postinstall.js have been migrated from hardcoded `.planning/` path constructions to centralized `lib/paths.js` calls. All 1,615 tests pass, lint is clean, and zero hardcoded paths remain outside `lib/paths.js`. Two minor warnings are noted below, neither of which blocks progression.

## Stage 1: Spec Compliance

### Plan Alignment

All 5 plans were executed with corresponding commits. Cross-referencing:

| Plan | Tasks | Commits | Status |
|------|-------|---------|--------|
| 33-01 | 2 | cd5cbc9 (fallback), ee40b2a (migration) | Complete |
| 33-02 | 2 | 35a2671 (migration), verification-only | Complete |
| 33-03 | 2 | 2395800 (commands.js), 4f0c704 (scaffold.js) | Complete |
| 33-04 | 2 | 72f3e35 (context.js), e1e9b95 (cleanup/roadmap/tracker) | Complete |
| 33-05 | 2 | deed78f (postinstall), verification-only | Complete |

Every plan task has a corresponding commit or is documented as verification-only (no code changes needed). The merge commit 98c7f1c correctly brought Phase 32's `lib/paths.js` into the Phase 33 branch before execution began. This deviation was documented in 33-01-SUMMARY.md.

**33-01-PLAN.md minor inaccuracy:** The plan references `cmdRecordMetric at line ~334` in `lib/state.js`, but the actual function is `cmdStateUpdateProgress` at line 325. The migration was applied to the correct function. The SUMMARY correctly names `cmdStateUpdateProgress`.

**33-02-SUMMARY.md count discrepancy:** The plan says "11 hardcoded paths" but the summary says "12 hardcoded path constructions" were replaced. Review of the actual commit shows this is correct -- the plan underestimated by one occurrence (the `phasesArchiveDir` construction in `cmdMilestoneComplete` was listed as a note but not counted in the plan's title).

No issues found.

### Research Methodology

N/A -- no research references in plans. This is an infrastructure refactoring phase.

### Known Pitfalls

N/A -- `.planning/research/PITFALLS.md` covers multi AI-backend support pitfalls, which are unrelated to Phase 33's path migration work. No KNOWHOW.md exists.

### Eval Coverage

The 33-EVAL.md is thorough with 8 sanity checks (S1-S8), 4 proxy metrics (P1-P4), and 3 deferred validations (D1-D3). Verification of eval executability:

- **S1-S6:** All commands can be run against the current implementation. Verified: S1 (grep for hardcoded paths) returns zero results; S3 (all 10 modules import paths.js) confirmed; S6 (lint) passes.
- **S7:** Circular dependency check confirmed -- `lib/paths.js` has zero local `require` calls.
- **S8:** JSON `directory` fields all use `path.relative(cwd, ...)`, producing relative paths.
- **P1:** Full test suite passes (1,615 tests, 0 failures).
- **P2-P4:** Per-module unit tests pass; integration tests pass; REQ-56 fields present in all 14 `cmdInit*` functions.
- **D1-D3:** Properly deferred to Phases 35-36. These cannot be validated now because the physical directory migration has not occurred.

No issues found.

## Stage 2: Code Quality

### Architecture

The migration follows a consistent, clean pattern across all 10 modules:

1. **Import pattern:** `const { phasesDir: getPhasesDirPath } = require('./paths');` with renamed imports to avoid local variable collisions.
2. **Replacement pattern:** `const phasesDir = getPhasesDirPath(cwd);` replacing `const phasesDir = path.join(cwd, '.planning', 'phases');`.
3. **Output pattern:** `directory: path.relative(cwd, resolvedPath)` replacing hardcoded template literals.

This pattern is applied uniformly. No architectural inconsistencies detected.

The `lib/paths.js` module correctly depends only on Node built-ins (`fs`, `path`) with zero local `require` calls, preventing circular dependency chains. The `milestoneExistsOnDisk` helper is a clean abstraction for the fallback logic.

Consistent with existing patterns.

### Reproducibility

N/A -- no experimental code. This is a deterministic code migration.

### Documentation

The `lib/paths.js` module header comment clearly explains the backward-compatible fallback strategy and its purpose during the transition period. Each function has JSDoc with `@param` and `@returns` annotations. The fallback behavior is well-documented in comments.

The commit messages follow the conventional commit format (`feat(33-XX):`) and are descriptive.

Adequate.

### Deviation Documentation

| Plan | Deviations in SUMMARY | Verified |
|------|----------------------|----------|
| 33-01 | Phase 32 branch merge (98c7f1c) | Yes -- merge commit exists in git log |
| 33-02 | None claimed | Confirmed -- no unexpected files modified |
| 33-03 | None claimed | Confirmed -- no unexpected files modified |
| 33-04 | None claimed | Confirmed -- no unexpected files modified |
| 33-05 | postinstall.test.js updated (Rule 3 auto-fix) | Yes -- test EXPECTED_DIRS updated in deed78f |

All files modified match SUMMARY key-files declarations. The 33-05-SUMMARY.md correctly documents `tests/unit/postinstall.test.js` as an additional modified file not in the original plan.

SUMMARY.md matches git history.

## Findings Summary

| # | Severity | Stage | Area | Description |
|---|----------|-------|------|-------------|
| 1 | WARNING | 2 | Architecture | `postinstall.js` creates new hierarchy but `paths.js` backward-compat fallback means the `anonymous` milestone directory must exist for new-style paths to activate -- existing projects upgrading from older GRD versions will not have `.planning/milestones/anonymous/` on disk, so the fallback will keep returning old-style paths indefinitely unless a migration command is run |
| 2 | WARNING | 1 | Plan Alignment | Plan 33-01 references `cmdRecordMetric at line ~334` in `lib/state.js` but the actual function is `cmdStateUpdateProgress` at line 325; the migration was applied correctly but the plan text is inaccurate |
| 3 | INFO | 1 | Plan Alignment | Plan 33-02 says "11 hardcoded paths" but summary reports 12 replacements -- the actual count is 12 (plan underestimated by one) |
| 4 | INFO | 2 | Architecture | The `milestoneExistsOnDisk` helper wraps `fs.existsSync` in a try/catch -- the try/catch is redundant since `fs.existsSync` already catches internally and returns false on error, but it is harmless |
| 5 | INFO | 2 | Architecture | `context.js` still uses `pathExistsInternal` for root-level `.planning/` files (STATE.md, ROADMAP.md, config.json, etc.) which is correct -- these are not milestone-scoped and do not need paths.js delegation |
| 6 | INFO | 1 | Eval Coverage | EVAL.md P4 (REQ-56) samples only 3 of 14 `cmdInit*` functions -- review confirms all 14 actually have the 5 required fields, so the sampling limitation noted in the eval is acknowledged but not a real gap |
| 7 | INFO | 2 | Documentation | Good practice: every `cmdInit*` function's REQ-56 block is clearly labeled with `// Milestone-scoped paths (REQ-56)` comments, making future auditing easy |

## Recommendations

**WARNING #1 (Upgrade path for existing projects):**
Existing GRD projects upgrading from older versions will not have the `.planning/milestones/anonymous/` directory on disk. The `postinstall.js` idempotency check (`if (fs.existsSync(PLANNING_DIR))`) causes it to exit silently for existing projects without creating the new hierarchy. This means the backward-compat fallback in `paths.js` will keep returning old-style paths for these projects.

*Recommendation:* Phase 35 (physical directory migration) should address this by providing a migration command that creates the milestone directory structure for existing projects. Verify that Phase 35's plan includes handling the `postinstall.js` idempotency edge case for existing installations. Alternatively, consider modifying `postinstall.js` to create the milestone subdirectories even when `.planning/` already exists (additive, not destructive).

**WARNING #2 (Plan text accuracy):**
The function name mismatch in 33-01-PLAN.md (`cmdRecordMetric` vs `cmdStateUpdateProgress`) is a documentation-only issue. The migration was applied correctly to the right function. No action required unless plan accuracy is enforced for audit trail purposes.
