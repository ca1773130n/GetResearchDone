---
phase: 35-migration-script-and-archive-simplification
verified: 2026-02-20T09:30:00Z
status: gaps_found
score:
  level_1: 5/6 sanity checks passed (S6 format:check fails)
  level_2: 5/5 proxy metrics met
  level_3: 2 items deferred (tracked below)
re_verification: false
gaps:
  - truth: "npm run format:check passes with zero violations"
    status: failed
    verification_level: 1
    reason: "Prettier finds line-length violations in 3 files introduced by Phase 35 code. lib/commands.js has a multi-line path.join() that Prettier collapses to 1 line. lib/phase.js has a multi-line .filter() that Prettier collapses. tests/unit/commands.test.js has multiple multi-line fs.writeFileSync() calls Prettier collapses."
    quantitative:
      metric: "format:check exit code"
      expected: "0"
      actual: "1 (3 files with violations)"
    artifacts:
      - path: "lib/commands.js"
        issue: "path.join() on lines 2716-2721 is split across 6 lines; Prettier collapses to 1 line"
      - path: "lib/phase.js"
        issue: ".filter() on lines 810-812 is split across 3 lines; Prettier collapses to 1 line"
      - path: "tests/unit/commands.test.js"
        issue: "Multiple fs.writeFileSync() calls split across 5 lines; Prettier collapses each to 1 line"
    missing:
      - "Run `npm run format` in the worktree to auto-fix all three files, then re-run format:check to confirm exit 0"
deferred_validations:
  - description: "Real-world migration on a live project with old-style .planning/ layout"
    metric: "zero files lost; all paths.js functions resolve correctly; second run returns already_migrated: true"
    target: "Zero data loss, zero path resolution failures"
    depends_on: "Phase 36 test infrastructure; a real or realistic pre-migration project fixture"
    tracked_in: "STATE.md (DEFER-35-01)"
  - description: "End-to-end milestone completion flow with new-style layout — full Phase 36 integration sweep"
    metric: "archived.json correct fields; no redundant {version}-phases/ directory; milestone phase dir intact"
    target: "archived.json matches specification; no redundant copy"
    depends_on: "Phase 36 integration test or E2E workflow test"
    tracked_in: "STATE.md (DEFER-35-02)"
human_verification: []
---

# Phase 35: Migration Script and Archive Simplification — Verification Report

**Phase Goal:** Migration script (`cmdMigrateDirs`), archive simplification (`cmdMilestoneComplete` skip-copy + `archived.json` marker), CLI wiring. Requirements: REQ-59, REQ-60, REQ-61, REQ-62, REQ-63.
**Verified:** 2026-02-20T09:30:00Z
**Status:** gaps_found (1 gap — format:check fails; all functional goals achieved)
**Re-verification:** No — initial verification

## Verification Summary by Tier

### Level 1: Sanity Checks

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| S1 | `cmdMigrateDirs` exported from `lib/commands.js` | PASS | `typeof cmdMigrateDirs` → `"function"` |
| S2 | `migrate-dirs` appears in CLI help text | PASS | `node bin/grd-tools.js 2>&1 \| grep -o 'migrate-dirs'` → `"migrate-dirs"` |
| S3 | `migrate-dirs` produces valid JSON without crashing | PASS | Output: `{"milestone":"v0.2.1","moved_directories":[...],"skipped":[],"already_migrated":false,"errors":[]}` (exit 0) |
| S4 | `archived.json` written after `cmdMilestoneComplete` | PASS | File exists at `.planning/milestones/v1.0/archived.json`; contains `version`, `archived_date`, `phases`, `plans`, `tasks`, `accomplishments` |
| S5 | `npm run lint` passes with zero errors | PASS | ESLint exit 0, no error output |
| S6 | `npm run format:check` passes | FAIL | Exit code 1; 3 files with Prettier violations: `lib/commands.js`, `lib/phase.js`, `tests/unit/commands.test.js` |

**Level 1 Score:** 5/6 passed

### Level 2: Proxy Metrics

| # | Metric | Baseline | Target | Achieved | Status |
|---|--------|----------|--------|----------|--------|
| P1 | cmdMigrateDirs TDD suite (10 cases) | 0 tests | 10/10 pass | 10/10 pass | PASS |
| P2 | cmdMilestoneComplete TDD (3 new + existing) | 9 tests | 12/12 pass, 0 regressions | 12/12 pass | PASS |
| P3 | Full test suite regression count | 1,615 tests | 0 regressions | 1,631 pass, 0 regressions | PASS |
| P4 | `commands.js` line coverage | 89.14% | >= 80% | 90.9% | PASS |
| P4 | `phase.js` line coverage | 83.04% | >= 80% | 83.43% | PASS |
| P5 | `migrate-dirs` integration test | N/A | 3/3 pass | 3/3 pass | PASS |

**Level 2 Score:** 5/5 metrics met

### Level 3: Deferred Validations

| # | Validation | Metric | Target | Depends On | Status |
|---|-----------|--------|--------|------------|--------|
| D1 | Real-world migration on live project (DEFER-35-01) | Zero data loss; paths.js resolves correctly | All files migrated safely | Phase 36 test infrastructure | DEFERRED |
| D2 | End-to-end milestone completion flow (DEFER-35-02) | archived.json correct; no redundant copy | Full Phase 36 integration | Phase 36 E2E workflow test | DEFERRED |

**Level 3:** 2 items tracked for integration phase (Phase 36)

## Goal Achievement

### Observable Truths

#### Plan 35-01: cmdMigrateDirs

| # | Truth | Verification Level | Status | Evidence |
|---|-------|--------------------|--------|----------|
| 1 | cmdMigrateDirs moves phases/, research/, codebase/, todos/ to milestones/{milestone}/ using currentMilestone() (REQ-61, REQ-63) | Level 2 | PASS | 5 TDD tests confirm correct routing; integration test confirms end-to-end |
| 2 | quick/ always migrates to milestones/anonymous/quick/ regardless of milestone (REQ-61) | Level 2 | PASS | Test 5 in cmdMigrateDirs suite: `moves quick/ to milestones/anonymous/quick/ regardless of milestone` |
| 3 | Running cmdMigrateDirs twice produces no changes; already_migrated=true (REQ-62) | Level 2 | PASS | Test 6: `is idempotent — second run produces no changes`; integration test confirms `already_migrated: true` |
| 4 | cmdMigrateDirs detects and skips directories that do not exist at old location | Level 2 | PASS | Test 7: `skips directories that do not exist at old location` |
| 5 | cmdMigrateDirs creates milestone directory structure if it does not yet exist | Level 2 | PASS | Test 9: `creates milestone directory structure if needed` |
| 6 | After migration, paths.js functions resolve to new milestone directory locations | Level 1 | PASS | currentMilestone() imported from paths.js (line 47 commands.js); worktree migrate-dirs ran successfully and created .planning/milestones/v0.2.1/ |

#### Plan 35-02: cmdMilestoneComplete Simplification

| # | Truth | Verification Level | Status | Evidence |
|---|-------|--------------------|--------|----------|
| 1 | cmdMilestoneComplete skips redundant phase copy when phases already under milestones/{version}/phases/ (REQ-59) | Level 2 | PASS | New test: `skips phase archive copy when phases are already under milestones/{version}/phases/`; `phasesAlreadyInPlace=true` → skip block at line 835 |
| 2 | Backward compat: old-style layout still uses copy+delete archive | Level 2 | PASS | Existing test at ~line 382 of phase.test.js continues to pass (12/12 total) |
| 3 | archived.json marker written at .planning/milestones/{version}/archived.json on completion (REQ-60) | Level 1+2 | PASS | S4 sanity check confirmed file exists; Test: `writes archived.json marker in milestone directory on completion` passes |
| 4 | Marker distinguishes completed milestones from active ones | Level 2 | PASS | Test: `archived.json marker is readable and contains expected fields`; confirmed fields: version, archived_date, phases, plans |

#### Plan 35-03: CLI Wiring

| # | Truth | Verification Level | Status | Evidence |
|---|-------|--------------------|--------|----------|
| 1 | `node bin/grd-tools.js migrate-dirs` executes cmdMigrateDirs and produces JSON output | Level 1+2 | PASS | S3 confirmed; integration test `migrate-dirs command produces valid JSON with moved directories` passes |
| 2 | `node bin/grd-tools.js migrate-dirs --raw` produces compact JSON output | Level 2 | PASS | Integration test `migrate-dirs --raw produces valid JSON` passes; raw mode outputs `JSON.stringify(result)` (compact, not formatted) |
| 3 | migrate-dirs listed in CLI usage/help text | Level 1 | PASS | S2 confirmed; usage string on line 127 of grd-tools.js includes `migrate-dirs` |
| 4 | npm test passes with zero regressions after all Phase 35 changes | Level 2 | PASS | 1,631 tests pass (16 new tests added: 10 cmdMigrateDirs + 3 cmdMilestoneComplete + 3 integration); 0 failures |

### Required Artifacts

| Artifact | Expected | Exists | Sanity | Wired |
|----------|----------|--------|--------|-------|
| `lib/commands.js` | `cmdMigrateDirs` function | Yes (line 2674) | PASS — runs without error, outputs JSON | PASS — exported at line 2810 |
| `tests/unit/commands.test.js` | TDD tests for cmdMigrateDirs | Yes (10 tests, lines ~3048-3220) | PASS — all 10 pass | PASS — test file imports cmdMigrateDirs |
| `lib/phase.js` | Simplified cmdMilestoneComplete with archive marker | Yes (phasesAlreadyInPlace at line 783; archivedJson at line 884) | PASS — runs without error; marker written | PASS — existing exports unchanged |
| `tests/unit/phase.test.js` | New tests for archive simplification | Yes (3 new tests at lines 407-461) | PASS — all 3 pass | PASS — tests call cmdMilestoneComplete |
| `bin/grd-tools.js` | CLI routing for `migrate-dirs` command | Yes (case at line 454; import at line 108) | PASS — command runs to completion | PASS — cmdMigrateDirs imported and dispatched |
| `tests/integration/cli.test.js` | Integration test for migrate-dirs CLI invocation | Yes (3 tests at lines 1297-1372) | PASS — all 3 pass | PASS — spawns real grd-tools.js subprocess |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `lib/commands.js` | `lib/paths.js` | `require('./paths')` | WIRED | `currentMilestone` at line 47; `phasesDir: getPhasesDirPath` at 48; `todosDir` at 49; `milestonesDir` at 50 |
| `bin/grd-tools.js` | `lib/commands.js` | `require('../lib/commands')` | WIRED | `cmdMigrateDirs` at line 108 of grd-tools.js destructure |
| `lib/phase.js` | `milestones/{version}/phases` | inline `fs.existsSync` check | WIRED | `path.join(cwd, '.planning', 'milestones', version, 'phases')` at line 782; pattern `fs.existsSync.*milestones` confirmed |

## Implementation Verification

### cmdMigrateDirs Implementation Details

- **Milestone routing:** Uses `currentMilestone(cwd)` from `lib/paths.js` for all directories except `quick/` (REQ-63)
- **Anonymous routing:** `quick/` hardcoded to target `'anonymous'` in migration map (line 2685)
- **Merge strategy:** Skips destination entries that already exist (`fs.existsSync(destPath)` check at line 2734) — no overwriting
- **Idempotency:** `alreadyMigrated = movedDirectories.length === 0` (line 2768) — second run finds empty/missing source dirs, skips all, reports `already_migrated: true`
- **Source cleanup:** Removes individual entries (`fs.rmSync(srcPath)`) but leaves empty old directories (backward compat)
- **Error handling:** Per-entry error capture into `errors[]` array; non-blocking

### cmdMilestoneComplete Archive Changes

- **Conditional skip:** `phasesAlreadyInPlace` at line 783 checked via `fs.existsSync(milestonePhaseDir) && readdirSync(...).some(e => e.isDirectory())`
- **Stats source switching:** `statsSourceDir = phasesAlreadyInPlace ? milestonePhaseDir : phasesDir` (line 791) — stats gathered from correct location
- **archived.json marker:** Written at `path.join(cwd, '.planning', 'milestones', version, 'archived.json')` (lines 881-894); contains: `version`, `name`, `archived_date`, `phases`, `plans`, `tasks`, `accomplishments`
- **Result extended:** `phases_already_in_place: phasesAlreadyInPlace` added to output (line 930); `archived.marker: true` (line 937)

### archived.json Marker Field Verification

Actual file content from `cmdMilestoneComplete(tmpDir, 'v1.0', {}, false)` with new-style layout:
```json
{
  "version": "v1.0",
  "name": "v1.0",
  "archived_date": "2026-02-20",
  "phases": 1,
  "plans": 1,
  "tasks": 0,
  "accomplishments": []
}
```
All required fields present: `version`, `name`, `archived_date`, `phases`, `plans`, `tasks`, `accomplishments`.

## Requirements Coverage

| Requirement | Description | Evidence | Status |
|-------------|-------------|----------|--------|
| REQ-59 | cmdMilestoneComplete skips copy when phases in milestone dir | `phasesAlreadyInPlace` check + 1 TDD test | PASS |
| REQ-60 | archived.json marker written on completion | marker at `.planning/milestones/{version}/archived.json` + 2 TDD tests | PASS |
| REQ-61 | `grd-tools migrate-dirs` command moves 5 directories | CLI case + cmdMigrateDirs + 5 TDD tests + 3 integration tests | PASS |
| REQ-62 | Migration is idempotent | `already_migrated` logic + TDD test 6 + integration test | PASS |
| REQ-63 | Migration uses currentMilestone() from STATE.md | import from paths.js + TDD tests 1-5 + test 8 (anonymous fallback) | PASS |

## Anti-Patterns Found

None. No TODO/FIXME/HACK/PLACEHOLDER comments found in modified files. No empty return values or stub implementations. No hardcoded magic numbers. Implementation is complete and functional.

## Format Check Failure (S6)

**Severity:** Non-blocking for functionality, but fails the `format:check` gate specified in Plan 35-03 success criteria.

The three violations are purely cosmetic line-length reformatting:

| File | Lines | Prettier Issue |
|------|-------|----------------|
| `lib/commands.js` | 2716-2721 | Multi-line `path.join()` should be single line (80 chars fits) |
| `lib/phase.js` | 810-812 | Multi-line `.filter()` should be single line (80 chars fits) |
| `tests/unit/commands.test.js` | Multiple | Multi-line `fs.writeFileSync()` calls should each be single line |

**Fix:** `npm run format` in worktree auto-fixes all three files. The SUMMARY (35-03) acknowledged these as "pre-existing format issues in 3 other files from Plans 01/02" but this is not accurate — the pre-Phase-35 `lib/commands.js` at `bcf07a5` passed `format:check`. The violations were introduced by Phase 35 code additions.

**Impact:** CI would fail `format:check`. Functional tests (all 1,631) pass. Lint passes.

## Human Verification Required

None — all aspects verifiable programmatically.

## Gaps Summary

**1 gap** preventing a clean `passed` status:

**format:check fails** (Level 1, S6): Three files introduced by Phase 35 have Prettier line-length violations. This is purely cosmetic and does not affect functionality. Fix requires running `npm run format` and committing the formatted output. All 1,631 tests pass, lint is clean, and every functional requirement (REQ-59 through REQ-63) is verified at Level 2.

**2 items deferred** to Phase 36 (D1, D2) — as designed in EVAL.md. Both are structural limitations of Phase 35 scope (no live project fixture, no full milestone lifecycle fixture).

---

_Verified: 2026-02-20T09:30:00Z_
_Verifier: Claude (grd-verifier)_
_Verification levels applied: Level 1 (sanity), Level 2 (proxy), Level 3 (deferred — 2 items tracked for Phase 36)_
